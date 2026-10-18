import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../infrastructure/database.js';
import { ArchiveError } from '../domain/models.js';
import { digest, equalSecret } from '../security.js';

const passwordSchema = z.string().min(12).max(256);
export const RegistrationSchema = z.object({ email: z.email().max(254).transform((v) => v.trim().toLowerCase()), displayName: z.string().trim().min(1).max(80), password: passwordSchema }).strict();
export const MemberLoginSchema = z.object({ email: z.email().max(254).transform((v) => v.trim().toLowerCase()), password: z.string().max(256) }).strict();
export const ShelfWriteSchema = z.object({ expectedRevision: z.number().int().nonnegative(), document: z.json() }).strict().refine((v) => Buffer.byteLength(JSON.stringify(v.document)) <= 200000, '서재 데이터가 너무 큽니다.');
export const PasswordResetSchema = z.object({ token: z.string().min(32).max(200), password: passwordSchema }).strict();
type MemberRow = Record<string, unknown> & { id: string; email: string; display_name: string; password_hash: string };
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, result) => error ? reject(error) : resolve(result)));
async function hashPassword(password: string): Promise<string> { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`; }
async function verifyPassword(password: string, encoded: string): Promise<boolean> { const [algorithm, salt, expected] = encoded.split('$'); return algorithm === 'scrypt' && !!salt && !!expected && equalSecret((await derive(password, salt)).toString('hex'), expected); }
const publicMember = (row: MemberRow) => ({ id: row.id, email: row.email, displayName: row.display_name, emailVerified: false });

export class IdentityService {
  constructor(private readonly db: Database) {}
  async register(input: z.infer<typeof RegistrationSchema>) {
    const data = RegistrationSchema.parse(input);
    const encoded = await hashPassword(data.password);
    return this.db.transaction(async (tx) => {
      const result = await tx.query<MemberRow>('INSERT INTO members(id,email,display_name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING *', [randomUUID(), data.email, data.displayName, encoded]);
      const row = result.rows[0];
      if (!row) throw new ArchiveError('ACCOUNT_NOT_AVAILABLE', '이 정보로 계정을 만들 수 없습니다.', 409);
      await tx.query('INSERT INTO member_shelves(member_id) VALUES($1)', [row.id]);
      return publicMember(row);
    });
  }
  async login(input: z.infer<typeof MemberLoginSchema>) {
    const data = MemberLoginSchema.parse(input);
    const row = (await this.db.query<MemberRow>('SELECT * FROM members WHERE email=$1', [data.email])).rows[0];
    if (!row) { await derive(data.password, 'unavailable-account-padding'); throw new ArchiveError('INVALID_CREDENTIALS', '로그인 정보를 확인하세요.', 401); }
    if (!(await verifyPassword(data.password, row.password_hash))) throw new ArchiveError('INVALID_CREDENTIALS', '로그인 정보를 확인하세요.', 401);
    const session = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM member_sessions WHERE expires_at < now()');
    await this.db.query('INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,$3)', [digest(session), row.id, new Date(Date.now() + 7 * 86400000).toISOString()]);
    return { session, user: publicMember(row) };
  }
  async session(session: string | undefined) {
    if (!session) return undefined;
    const row = (await this.db.query<MemberRow>('SELECT m.* FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now()', [digest(session)])).rows[0];
    return row ? publicMember(row) : undefined;
  }
  async logout(session: string): Promise<void> { await this.db.query('DELETE FROM member_sessions WHERE token_hash=$1', [digest(session)]); }
  async getShelf(memberId: string) {
    const row = (await this.db.query('SELECT revision,document,updated_at FROM member_shelves WHERE member_id=$1', [memberId])).rows[0];
    if (!row) throw new ArchiveError('RESOURCE_NOT_FOUND', '서재를 찾을 수 없습니다.', 404);
    return { revision: Number(row.revision), document: row.document, updatedAt: new Date(String(row.updated_at)).toISOString() };
  }
  async saveShelf(memberId: string, input: z.infer<typeof ShelfWriteSchema>) {
    const data = ShelfWriteSchema.parse(input);
    const result = await this.db.query('UPDATE member_shelves SET revision=revision+1,document=$1::jsonb,updated_at=now() WHERE member_id=$2 AND revision=$3 RETURNING revision,document,updated_at', [JSON.stringify(data.document), memberId, data.expectedRevision]);
    const row = result.rows[0];
    if (!row) throw new ArchiveError('SHELF_CONFLICT', '다른 기기에서 서재가 변경되었습니다. 두 버전을 확인한 뒤 다시 저장하세요.', 409);
    return { revision: Number(row.revision), document: row.document, updatedAt: new Date(String(row.updated_at)).toISOString() };
  }
  async listMembers() { const result = await this.db.query<MemberRow>('SELECT id,email,display_name,created_at FROM members ORDER BY created_at DESC LIMIT 200'); return result.rows.map(publicMember); }
  async issueReset(memberId: string) {
    const token = randomBytes(32).toString('base64url');
    return this.db.transaction(async (tx) => {
      if (!(await tx.query('SELECT id FROM members WHERE id=$1', [memberId])).rows[0]) throw new ArchiveError('RESOURCE_NOT_FOUND', '계정을 찾을 수 없습니다.', 404);
      await tx.query('DELETE FROM member_reset_tokens WHERE member_id=$1', [memberId]);
      const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
      await tx.query('INSERT INTO member_reset_tokens(token_hash,member_id,expires_at) VALUES($1,$2,$3)', [digest(token), memberId, expiresAt]);
      return { token, expiresAt };
    });
  }
  async reset(input: z.infer<typeof PasswordResetSchema>): Promise<void> {
    const data = PasswordResetSchema.parse(input);
    const encoded = await hashPassword(data.password);
    await this.db.transaction(async (tx) => {
      const row = (await tx.query('SELECT member_id FROM member_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [digest(data.token)])).rows[0];
      if (!row) throw new ArchiveError('INVALID_RESET_TOKEN', '복구 정보가 올바르지 않거나 만료되었습니다.', 400);
      await tx.query('UPDATE members SET password_hash=$1,updated_at=now() WHERE id=$2', [encoded, row.member_id]);
      await tx.query('UPDATE member_reset_tokens SET used_at=now() WHERE token_hash=$1', [digest(data.token)]);
      await tx.query('DELETE FROM member_sessions WHERE member_id=$1', [row.member_id]);
    });
  }
  async deleteAccount(memberId: string): Promise<void> { await this.db.query('DELETE FROM members WHERE id=$1', [memberId]); }
  async requirePassword(memberId: string, password: string): Promise<void> {
    const row = (await this.db.query<MemberRow>('SELECT * FROM members WHERE id=$1', [memberId])).rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) throw new ArchiveError('INVALID_CREDENTIALS', '현재 비밀번호를 확인하세요.', 401);
  }
}
