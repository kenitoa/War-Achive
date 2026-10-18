import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PublicArchive } from '../src/domain/contracts.js';
import { publishSnapshotToGit, publishSnapshotWithDeployKey, validGitTarget } from '../src/infrastructure/publisher-git.js';
import { loadConfig } from '../src/config.js';

const execute = promisify(execFile);
let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); root = undefined; });
const snapshot: PublicArchive = { schemaVersion: 1, releaseId: 'rel-local-ssh-proof', generatedAt: '2026-10-18T00:00:00.000Z', records: [], wars: [], entities: [], collections: [] };
const testConfig = { NODE_ENV: 'test', WAR_ARCHIVE_ADMIN_TOKEN: 'publisher-test-admin-token-32-characters' };
async function git(args: string[], cwd: string): Promise<string> { return (await execute('git', ['-c', 'user.name=Fixture Editor', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim(); }
async function fixture(): Promise<{ remote: string; work: string }> {
  root = await mkdtemp(join(tmpdir(), 'archive-git-fixture-'));
  const remote = join(root, 'remote.git'), work = join(root, 'editor');
  await git(['init', '--bare', '--initial-branch=main', remote], root);
  await git(['clone', remote, work], root);
  await mkdir(join(work, 'Vercel', 'content'), { recursive: true });
  await writeFile(join(work, 'Vercel', 'content', 'archive.json'), JSON.stringify({ ...snapshot, releaseId: 'rel-before' }));
  await writeFile(join(work, 'editor-owned.txt'), 'preserve this editor file\n');
  await git(['add', '.'], work); await git(['commit', '-m', 'initial fixture'], work); await git(['push', 'origin', 'main'], work);
  return { remote, work };
}

describe('scoped Git publication transaction', () => {
  it('changes only the snapshot, reads remote content back and retries without another commit', async () => {
    const { remote, work } = await fixture();
    const first = await publishSnapshotToGit(snapshot, { repositoryUrl: remote, ref: 'main', contentPath: 'Vercel/content/archive.json' });
    expect(first.uploaded).toBe(true);
    expect(await git(['show', `${first.commit}:editor-owned.txt`], remote)).toBe('preserve this editor file');
    expect(await git(['diff-tree', '--no-commit-id', '--name-only', '-r', first.commit], remote)).toBe('Vercel/content/archive.json');
    const second = await publishSnapshotToGit(snapshot, { repositoryUrl: remote, ref: 'main', contentPath: 'Vercel/content/archive.json' });
    expect(second.commit).toBe(first.commit);
    await git(['pull', '--ff-only'], work);
    expect(JSON.parse(await readFile(join(work, 'Vercel', 'content', 'archive.json'), 'utf8'))).toEqual(snapshot);
  }, 30_000);

  it('rejects a concurrent branch update and preserves it when the job retries', async () => {
    const { remote, work } = await fixture();
    const before = await git(['rev-parse', 'HEAD'], work);
    await writeFile(join(work, 'editor-owned.txt'), 'concurrent editor content\n');
    await git(['add', 'editor-owned.txt'], work); await git(['commit', '-m', 'concurrent editor'], work);
    const concurrent = await git(['rev-parse', 'HEAD'], work);
    await git(['push', 'origin', 'HEAD:refs/heads/editor'], work);
    const hook = join(remote, 'hooks', 'pre-receive');
    await writeFile(hook, `#!/bin/sh\nunset GIT_QUARANTINE_PATH\ngit update-ref refs/heads/main ${concurrent} ${before}\n`, { mode: 0o700 });
    await expect(publishSnapshotToGit(snapshot, { repositoryUrl: remote, ref: 'main', contentPath: 'Vercel/content/archive.json' })).rejects.toMatchObject({ code: 'GITHUB_GIT_FAILED' });
    expect(await git(['rev-parse', 'refs/heads/main'], remote)).toBe(concurrent);
    await unlink(hook);
    const result = await publishSnapshotToGit(snapshot, { repositoryUrl: remote, ref: 'main', contentPath: 'Vercel/content/archive.json' });
    expect(await git(['show', `${result.commit}:editor-owned.txt`], remote)).toBe('concurrent editor content');
    expect(await git(['rev-parse', `${result.commit}^`], remote)).toBe(concurrent);
  }, 30_000);

  it('rejects unsafe ref/path and SSH files before any network operation', async () => {
    for (const ref of ['-main', '../main', 'main.lock', 'main..old', 'main//sub', 'main/.secret']) expect(validGitTarget('kenitoa/War-Achive', ref, 'Vercel/content/archive.json')).toBe(false);
    for (const path of ['../.env', '/.env', '.git/config', 'Vercel/../NAS/.env', 'Vercel/.env', '-archive.json']) expect(validGitTarget('kenitoa/War-Achive', 'main', path)).toBe(false);
    expect(validGitTarget('kenitoa/War-Achive', 'main', 'Vercel/content/archive.json')).toBe(true);
    await expect(publishSnapshotWithDeployKey(snapshot, { repository: 'kenitoa/War-Achive', ref: 'main', contentPath: 'Vercel/content/archive.json', sshKeyPath: 'relative.key', sshKnownHostsPath: 'relative.hosts' })).rejects.toMatchObject({ code: 'GITHUB_SSH_CONFIG_INVALID' });
    const config = loadConfig({ ...testConfig, REMOTE_PUBLISH_ENABLED: 'true', GITHUB_FRONT_REPOSITORY: 'kenitoa/War-Achive', GITHUB_FRONT_TOKEN: '', GITHUB_FRONT_SSH_KEY_PATH: '/run/secrets/github_deploy_key', GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH: '/run/secrets/github_known_hosts' });
    expect(config.github?.token).toBeUndefined();
    expect(config.github?.sshKeyPath).toBe('/run/secrets/github_deploy_key');
    expect(() => loadConfig({ ...testConfig, GITHUB_FRONT_SSH_KEY_PATH: '/run/secrets/key', GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH: '' })).toThrow('Configure both');
  });
});
