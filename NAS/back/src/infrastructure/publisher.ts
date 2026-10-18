import { ArchiveError } from '../domain/models.js';
import type { PublicArchive } from '../domain/contracts.js';
import { PublicArchiveSchema } from '../domain/contracts.js';
import { sha256 } from './files.js';
import { safeFetchJson } from './collector.js';
import { lookup } from 'node:dns/promises';
import { isPublicAddress } from './collector.js';
import { publishSnapshotWithDeployKey, validGitTarget } from './publisher-git.js';

export interface GitHubTarget { repository: string; token?: string; ref: string; contentPath: string; deploymentUrl?: string; sshKeyPath?: string; sshKnownHostsPath?: string }
export async function verifyDeployment(releaseId:string,url:string,fetcher:typeof fetch=fetch,expectedHash?:string):Promise<boolean>{
  const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||target.port)throw new ArchiveError('VERIFY_URL_INVALID','배포 확인 URL이 올바르지 않습니다.');
  const addresses=await lookup(target.hostname,{all:true});if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new ArchiveError('VERIFY_URL_INVALID','배포 확인 대상은 공개 네트워크여야 합니다.');
  const response=await fetcher(target,{redirect:'error',signal:AbortSignal.timeout(25_000),headers:{'Cache-Control':'no-cache'}});if(!response.ok||!response.body)return false;
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16_000_000){await reader.cancel();throw new ArchiveError('VERIFY_TOO_LARGE','배포 확인 응답이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  let live:unknown;try{live=JSON.parse(Buffer.concat(chunks).toString('utf8'))as unknown;}catch{return false;}
  if(!live||typeof live!=='object'||!('releaseId'in live)||live.releaseId!==releaseId)return false;
  if(!expectedHash)return false;
  if('sha256'in live&&typeof live.sha256==='string')return live.sha256===expectedHash;
  const archive=PublicArchiveSchema.safeParse(live);return archive.success&&sha256(JSON.stringify(archive.data))===expectedHash;
}
export async function uploadGitHub(snapshot: PublicArchive, config: GitHubTarget, fetcher: typeof fetch = fetch): Promise<{ uploaded: boolean; verified: boolean; commit?: string }> {
  if (config.sshKeyPath || config.sshKnownHostsPath) {
    if (!config.sshKeyPath || !config.sshKnownHostsPath) throw new ArchiveError('GITHUB_SSH_CONFIG_INVALID', 'Both SSH key and known-hosts paths are required.');
    const uploaded = await publishSnapshotWithDeployKey(snapshot, { repository: config.repository, ref: config.ref, contentPath: config.contentPath, sshKeyPath: config.sshKeyPath, sshKnownHostsPath: config.sshKnownHostsPath });
    return { ...uploaded, verified: config.deploymentUrl ? await verifyDeployment(snapshot.releaseId, config.deploymentUrl, fetcher, sha256(JSON.stringify(snapshot))) : false };
  }
  if (!config.token || !validGitTarget(config.repository, config.ref, config.contentPath)) throw new ArchiveError('INVALID_GITHUB_TARGET', 'GitHub repository, token, ref and path must be configured.');
  const path = config.contentPath.split('/').map(encodeURIComponent).join('/'); const url = `https://api.github.com/repos/${config.repository}/contents/${path}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'WarArchive/1.0' };
  const previous = await fetcher(`${url}?ref=${encodeURIComponent(config.ref)}`, { headers, redirect: 'error', signal: AbortSignal.timeout(25_000) });
  let previousSha: string | undefined;let identical=false;
  if (previous.ok) { const value: unknown = await previous.json(); if (value && typeof value === 'object' && 'sha' in value && typeof value.sha === 'string') previousSha = value.sha;if(value&&typeof value==='object'&&'content'in value&&typeof value.content==='string'){try{identical=JSON.stringify(JSON.parse(Buffer.from(value.content.replace(/\s/g,''),'base64').toString('utf8'))as unknown)===JSON.stringify(snapshot);}catch{identical=false;}} }
  else if (previous.status !== 404) throw new ArchiveError('GITHUB_READ_FAILED', `GitHub 조회 실패 (${previous.status})`, 502);
  const content = Buffer.from(JSON.stringify(snapshot, null, 2)).toString('base64');
  let commit: string | undefined;
  if(!identical){const response = await fetcher(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000), body: JSON.stringify({ message: `archive: publish ${snapshot.releaseId}`, content, branch: config.ref, ...(previousSha ? { sha: previousSha } : {}) }) });
    if (!response.ok) throw new ArchiveError('GITHUB_UPLOAD_FAILED', `GitHub 업로드 실패 (${response.status})`, 502);
    const confirmation: unknown = await response.json();
    if (confirmation && typeof confirmation === 'object' && 'commit' in confirmation && confirmation.commit && typeof confirmation.commit === 'object' && 'sha' in confirmation.commit && typeof confirmation.commit.sha === 'string') commit = confirmation.commit.sha;
  }
  const remote = await safeFetchJson(`${url}?ref=${encodeURIComponent(config.ref)}`, { fetcher, token: config.token });
  if (!remote || typeof remote !== 'object' || !('content' in remote) || typeof remote.content !== 'string') throw new ArchiveError('GITHUB_VERIFY_FAILED', '업로드한 공개본을 다시 읽을 수 없습니다.', 502);
  let decoded: unknown; try { decoded = JSON.parse(Buffer.from(remote.content.replace(/\s/g, ''), 'base64').toString('utf8')) as unknown; } catch { throw new ArchiveError('GITHUB_VERIFY_FAILED', '업로드한 공개본의 형식이 잘못되었습니다.', 502); }
  if (!decoded || typeof decoded !== 'object' || !('releaseId' in decoded) || decoded.releaseId !== snapshot.releaseId || JSON.stringify(decoded) !== JSON.stringify(snapshot)) throw new ArchiveError('GITHUB_VERIFY_FAILED', '업로드한 공개본이 일치하지 않습니다.', 502);
  if (!config.deploymentUrl) return { uploaded: true, verified: false, commit };
  return { uploaded: true, verified: await verifyDeployment(snapshot.releaseId,config.deploymentUrl,fetcher,sha256(JSON.stringify(snapshot))), commit };
}
