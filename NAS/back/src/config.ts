import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { validGitTarget } from './infrastructure/publisher-git.js';

export const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const nasRoot = resolve(backendRoot, '..');
const optionalText = z.string().trim().transform((v) => v || undefined).optional();
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  WAR_ARCHIVE_ADMIN_TOKEN: z.string().min(24).max(512),
  ADMIN_TOTP_SECRET: optionalText,
  ADMIN_EDITOR_TOKEN: optionalText, ADMIN_REVIEWER_TOKEN: optionalText, ADMIN_PUBLISHER_TOKEN: optionalText,
  DATABASE_URL: optionalText, DATA_DIR: optionalText, PGLITE_PATH: optionalText,
  EXPORT_DIR: optionalText, PUBLIC_SNAPSHOT_PATH: optionalText,
  ALLOWED_ORIGINS: z.string().default(''),
  COOKIE_SAME_SITE: z.enum(['lax', 'none']).default('lax'),
  PUBLIC_ACCOUNT_API_ENABLED: z.enum(['true', 'false']).default('false'),
  GITHUB_FRONT_REPOSITORY: optionalText, GITHUB_FRONT_TOKEN: optionalText,
  GITHUB_FRONT_SSH_KEY_PATH: optionalText, GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH: optionalText,
  GITHUB_FRONT_REF: z.string().default('main'), GITHUB_FRONT_CONTENT_PATH: z.string().default('Vercel/content/archive.json'),
  REMOTE_PUBLISH_ENABLED: z.enum(['true', 'false']).default('false'),
  PUBLIC_ARCHIVE_VERIFY_URL: optionalText,
  S3_ENDPOINT: optionalText, S3_REGION: optionalText, S3_BUCKET: optionalText,
  S3_ACCESS_KEY_ID: optionalText, S3_SECRET_ACCESS_KEY: optionalText, MEDIA_PUBLIC_BASE_URL: optionalText,
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  CDN_PURGE_URL: optionalText, CDN_PURGE_TOKEN: optionalText,
  COLLECTION_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000),
  PUBLICATION_INTERVAL_MS: z.coerce.number().int().min(1000).default(7200000),
  SCHEDULER_RETRY_MS: z.coerce.number().int().min(100).default(5000),
  COLLECTION_MAX_ITEMS_PER_SOURCE: z.coerce.number().int().min(1).max(200).default(20),
  AUTO_PUBLISH_ENABLED: z.enum(['true', 'false']).default('true'),
  LOCAL_WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
});

export function loadConfig(overrides?: Record<string, string | undefined>) {
  const envPath = resolve(nasRoot, '.env');
  const fileValues = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  const parsed = EnvSchema.safeParse({ ...fileValues, ...process.env, ...overrides });
  if (!parsed.success) throw new Error(`환경 설정을 확인하세요: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL) throw new Error('운영 환경에는 DATABASE_URL이 필요합니다.');
  for (const token of [env.ADMIN_EDITOR_TOKEN, env.ADMIN_REVIEWER_TOKEN, env.ADMIN_PUBLISHER_TOKEN]) {
    if (token && token.length < 24) throw new Error('역할별 관리자 토큰은 24자 이상이어야 합니다.');
  }
  if (env.ADMIN_TOTP_SECRET && !/^[A-Z2-7]{16,128}$/i.test(env.ADMIN_TOTP_SECRET)) throw new Error('ADMIN_TOTP_SECRET 형식을 확인하세요.');
  const origins = env.ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('ALLOWED_ORIGINS에는 정확한 HTTP(S) 출처만 허용됩니다.');
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('운영 공개 API 출처에는 HTTPS가 필요합니다.');
  }
  const dataDir = resolve(env.DATA_DIR ?? resolve(nasRoot, 'data'));
  const github = env.REMOTE_PUBLISH_ENABLED === 'true' ? {
    repository: env.GITHUB_FRONT_REPOSITORY ?? '', token: env.GITHUB_FRONT_TOKEN, ref: env.GITHUB_FRONT_REF, contentPath: env.GITHUB_FRONT_CONTENT_PATH, deploymentUrl: env.PUBLIC_ARCHIVE_VERIFY_URL,
    sshKeyPath: env.GITHUB_FRONT_SSH_KEY_PATH, sshKnownHostsPath: env.GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH,
  } : undefined;
  if (Boolean(env.GITHUB_FRONT_SSH_KEY_PATH) !== Boolean(env.GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH)) throw new Error('Configure both GITHUB_FRONT_SSH_KEY_PATH and GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH.');
  if (github && (!validGitTarget(github.repository, github.ref, github.contentPath) || (!github.token && !github.sshKeyPath))) throw new Error('원격 발행의 저장소·인증·브랜치·콘텐츠 경로 설정을 확인하세요.');
  const s3Keys = [env.S3_REGION, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY];
  if (s3Keys.some(Boolean) && !s3Keys.every(Boolean)) throw new Error('S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY를 모두 설정하세요.');
  for (const value of [env.S3_ENDPOINT, env.MEDIA_PUBLIC_BASE_URL, env.PUBLIC_ARCHIVE_VERIFY_URL]) if (value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('외부 미디어·배포 확인 주소는 인증정보 없는 HTTPS여야 합니다.');
  }
  const objectStorage = s3Keys.every(Boolean) ? { endpoint: env.S3_ENDPOINT, region: env.S3_REGION!, bucket: env.S3_BUCKET!, accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY!, publicBaseUrl: env.MEDIA_PUBLIC_BASE_URL, forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true' } : undefined;
  if (Boolean(env.CDN_PURGE_URL) !== Boolean(env.CDN_PURGE_TOKEN)) throw new Error('CDN_PURGE_URL과 CDN_PURGE_TOKEN을 함께 설정하세요.');
  if (env.CDN_PURGE_URL && !/^https:\/\/api\.cloudflare\.com\/client\/v4\/zones\/[a-f0-9]{32}\/purge_cache$/.test(env.CDN_PURGE_URL)) throw new Error('CDN_PURGE_URL은 지정한 Cloudflare 영역의 purge_cache HTTPS 주소여야 합니다.');
  const cdnPurge = env.CDN_PURGE_URL && env.CDN_PURGE_TOKEN ? { url: env.CDN_PURGE_URL, token: env.CDN_PURGE_TOKEN } : undefined;
  return {
    ...env, dataDir, pglitePath: resolve(env.PGLITE_PATH ?? resolve(dataDir, 'database')),
    exportDir: resolve(env.EXPORT_DIR ?? resolve(nasRoot, 'releases')),
    publicSnapshotPath: env.PUBLIC_SNAPSHOT_PATH ? resolve(env.PUBLIC_SNAPSHOT_PATH) : undefined,
    allowedOrigins: new Set([...origins, `http://127.0.0.1:${env.ADMIN_PORT}`, `http://localhost:${env.ADMIN_PORT}`]),
    cookieSecure: env.NODE_ENV === 'production' || env.COOKIE_SAME_SITE === 'none',
    publicAccountApiEnabled: env.PUBLIC_ACCOUNT_API_ENABLED === 'true', github, objectStorage, cdnPurge,
  };
}
export type Config = ReturnType<typeof loadConfig>;
