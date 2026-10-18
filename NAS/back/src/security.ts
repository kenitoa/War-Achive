import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';

export type AdminRole = 'admin' | 'editor' | 'reviewer' | 'publisher';
export interface AdminIdentity { id: string; role: AdminRole }
export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export function equalSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export function csrfToken(session: string, secret: string): string { return createHmac('sha256', secret).update(`csrf:${session}`).digest('hex'); }
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { out[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* Malformed cookies are treated as absent. */ }
  }
  return out;
}
export function totp(secret: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of secret.toUpperCase()) bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((v) => parseInt(v, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = (hash.at(-1) ?? 0) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  return /^\d{6}$/.test(code) && [-1, 0, 1].some((step) => equalSecret(totp(secret, now + step * 30000), code));
}

export class AdminSessions {
  private sessions = new Map<string, { identity: AdminIdentity; expiresAt: number }>();
  constructor(private readonly config: Config) {}
  login(token: string, otp?: string): { session: string; identity: AdminIdentity } | undefined {
    if (this.config.ADMIN_TOTP_SECRET && !verifyTotp(this.config.ADMIN_TOTP_SECRET, otp ?? '')) return undefined;
    const candidates: [AdminRole, string | undefined][] = [['admin', this.config.WAR_ARCHIVE_ADMIN_TOKEN], ['editor', this.config.ADMIN_EDITOR_TOKEN], ['reviewer', this.config.ADMIN_REVIEWER_TOKEN], ['publisher', this.config.ADMIN_PUBLISHER_TOKEN]];
    const match = candidates.find(([, expected]) => expected && equalSecret(expected, token));
    if (!match) return undefined;
    const identity = { id: match[0], role: match[0] };
    const session = randomBytes(32).toString('base64url');
    for (const [key, value] of this.sessions) if (value.expiresAt <= Date.now()) this.sessions.delete(key);
    if (this.sessions.size >= 1024) return undefined;
    this.sessions.set(digest(session), { identity, expiresAt: Date.now() + 8 * 3600000 });
    return { session, identity };
  }
  get(session: string | undefined): AdminIdentity | undefined {
    if (!session) return undefined;
    const found = this.sessions.get(digest(session));
    if (!found || found.expiresAt <= Date.now()) { this.sessions.delete(digest(session)); return undefined; }
    return found.identity;
  }
  revoke(session: string): void { this.sessions.delete(digest(session)); }
}

export class RateLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  take(key: string, maximum: number, windowMs = 60000): boolean {
    const now = Date.now();
    if (this.entries.size > 10000) for (const [k, entry] of this.entries) if (entry.until <= now) this.entries.delete(k);
    const entry = this.entries.get(key);
    if (!entry || entry.until <= now) {
      if (this.entries.size >= 10000) return false;
      this.entries.set(key, { count: 1, until: now + windowMs }); return true;
    }
    entry.count += 1; return entry.count <= maximum;
  }
}
