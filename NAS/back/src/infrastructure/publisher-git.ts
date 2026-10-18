import { execFile } from 'node:child_process';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ArchiveError } from '../domain/models.js';
import type { PublicArchive } from '../domain/contracts.js';

export interface GitSnapshotTarget { repositoryUrl: string; ref: string; contentPath: string; environment?: NodeJS.ProcessEnv }
export interface GitSnapshotResult { uploaded: boolean; commit: string }

/** Shared validation also applies to REST publication. No leading options or hidden paths. */
export function validGitTarget(repository: string, ref: string, contentPath: string): boolean {
  const segment = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
  const safeSegments = (value: string): boolean => value.split('/').every((part) => segment.test(part) && !part.includes('..') && !part.endsWith('.') && !part.endsWith('.lock'));
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(repository) && !repository.includes('..') && safeSegments(ref) && safeSegments(contentPath);
}

function git(args: string[], cwd: string, environment?: NodeJS.ProcessEnv): Promise<string> {
  const inheritedEnvironment = { ...process.env };
  for (const key of Object.keys(inheritedEnvironment)) if (key.startsWith('GIT_') || key === 'SSH_AUTH_SOCK') delete inheritedEnvironment[key];
  return new Promise((fulfil, reject) => {
    execFile('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', ...args], {
      cwd, env: { ...inheritedEnvironment, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', ...environment },
      timeout: 90_000, maxBuffer: 16_000_000, windowsHide: true,
    }, (error, stdout) => {
      // Git errors can include credentials or private transport diagnostics. Do not expose stderr.
      if (error) reject(new ArchiveError('GITHUB_GIT_FAILED', 'GitHub Git publication failed. The job can be retried safely.', 502));
      else fulfil(stdout.trim());
    });
  });
}

/** Remove only the fresh temporary checkout owned by this invocation; never follow symlinks. */
async function removeOwnedDirectory(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) await removeOwnedDirectory(path);
    else { if (process.platform === 'win32' && !entry.isSymbolicLink()) await chmod(path, 0o600); await unlink(path); }
  }
  await rmdir(root);
}

async function safeContentPath(checkout: string, contentPath: string): Promise<string> {
  const destination = resolve(checkout, contentPath);
  const offset = relative(checkout, destination);
  if (offset.startsWith('..') || isAbsolute(offset)) throw new ArchiveError('INVALID_GITHUB_TARGET', 'Invalid publication path.');
  let current = checkout;
  for (const part of contentPath.split('/')) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new ArchiveError('INVALID_GITHUB_TARGET', 'Publication paths cannot contain symbolic links.'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  await mkdir(dirname(destination), { recursive: true });
  return destination;
}

/** Transport-independent transaction. Production callers supply only the fixed GitHub SSH URL. */
export async function publishSnapshotToGit(snapshot: PublicArchive, target: GitSnapshotTarget): Promise<GitSnapshotResult> {
  if (!validGitTarget('owner/repository', target.ref, target.contentPath)) throw new ArchiveError('INVALID_GITHUB_TARGET', 'Invalid publication ref or path.');
  const scratch = await mkdtemp(join(tmpdir(), 'war-archive-publication-'));
  const checkout = join(scratch, 'checkout');
  try {
    await git(['clone', '--depth', '1', '--single-branch', '--branch', target.ref, '--no-tags', '--', target.repositoryUrl, checkout], scratch, target.environment);
    const destination = await safeContentPath(checkout, target.contentPath);
    const content = JSON.stringify(snapshot, null, 2);
    let identical = false;
    try { identical = JSON.stringify(JSON.parse(await readFile(destination, 'utf8')) as unknown) === JSON.stringify(snapshot); }
    catch (error) { if (!(error instanceof SyntaxError) && !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    if (!identical) {
      await writeFile(destination, content, { encoding: 'utf8', mode: 0o644 });
      await git(['add', '--', target.contentPath], checkout, target.environment);
      await git(['-c', 'user.name=War Archive Publisher', '-c', 'user.email=archive-publisher@users.noreply.github.com', '-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', `archive: publish ${snapshot.releaseId}`, '--', target.contentPath], checkout, target.environment);
      // No force flag: a simultaneous editor push rejects this transaction and is retried from a new clone.
      await git(['push', '--porcelain', 'origin', `HEAD:refs/heads/${target.ref}`], checkout, target.environment);
    }
    // Read the current remote branch again, including after an idempotent retry.
    await git(['fetch', '--depth', '1', '--no-tags', 'origin', `refs/heads/${target.ref}`], checkout, target.environment);
    const readback = await git(['show', `FETCH_HEAD:${target.contentPath}`], checkout, target.environment);
    let parsed: unknown;
    try { parsed = JSON.parse(readback) as unknown; } catch { throw new ArchiveError('GITHUB_VERIFY_FAILED', 'The published Git snapshot is invalid.', 502); }
    if (JSON.stringify(parsed) !== JSON.stringify(snapshot)) throw new ArchiveError('GITHUB_VERIFY_FAILED', 'The published Git snapshot does not match this release.', 502);
    const commit = await git(['rev-parse', 'FETCH_HEAD'], checkout, target.environment);
    if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new ArchiveError('GITHUB_VERIFY_FAILED', 'The published commit identifier is invalid.', 502);
    return { uploaded: true, commit };
  } finally { await removeOwnedDirectory(scratch); }
}

export async function publishSnapshotWithDeployKey(snapshot: PublicArchive, target: { repository: string; ref: string; contentPath: string; sshKeyPath: string; sshKnownHostsPath: string }): Promise<GitSnapshotResult> {
  if (!validGitTarget(target.repository, target.ref, target.contentPath)) throw new ArchiveError('INVALID_GITHUB_TARGET', 'Invalid GitHub publication target.');
  for (const [path, limit, privateFile] of [[target.sshKeyPath, 32_768, true], [target.sshKnownHostsPath, 524_288, false]] as const) {
    if (!isAbsolute(path)) throw new ArchiveError('GITHUB_SSH_CONFIG_INVALID', 'GitHub SSH paths must be absolute.');
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > limit || (privateFile && process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new ArchiveError('GITHUB_SSH_CONFIG_INVALID', 'GitHub SSH files must be regular, readable files with private key permissions 0600 or 0400.');
    await access(path, constants.R_OK);
  }
  const scratch = await mkdtemp(join(tmpdir(), 'war-archive-ssh-'));
  try {
    const wrapper = join(scratch, 'ssh-wrapper');
    // File paths remain quoted environment values. The generated program contains no secrets or caller text.
    await writeFile(wrapper, '#!/bin/sh\nexec ssh -F /dev/null -i "$WAR_ARCHIVE_SSH_KEY" -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$WAR_ARCHIVE_SSH_KNOWN_HOSTS" -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 "$@"\n', { mode: 0o700 });
    return await publishSnapshotToGit(snapshot, { repositoryUrl: `git@github.com:${target.repository}.git`, ref: target.ref, contentPath: target.contentPath, environment: { GIT_SSH: wrapper, GIT_SSH_VARIANT: 'ssh', WAR_ARCHIVE_SSH_KEY: target.sshKeyPath, WAR_ARCHIVE_SSH_KNOWN_HOSTS: target.sshKnownHostsPath } });
  } finally { await removeOwnedDirectory(scratch); }
}
