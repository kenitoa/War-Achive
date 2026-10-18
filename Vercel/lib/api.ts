import { z } from 'zod';

export const SessionSchema = z.object({ user: z.object({ id: z.string(), email: z.email(), displayName: z.string() }), csrfToken: z.string() });
export type Session = z.infer<typeof SessionSchema>;
export const RemoteShelfSchema = z.object({ revision: z.number().int().nonnegative(), document: z.unknown(), updatedAt: z.string().nullable().optional() });

export function apiOrigin(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function apiRequest<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; csrfToken?: string } = {}): Promise<T> {
  const origin = apiOrigin();
  if (!origin) throw new ApiError(0, '현재 공개 사이트에는 계정·접수 서버가 연결되어 있지 않습니다.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${origin}${path}`, { method: options.method ?? 'GET', credentials: 'include', signal: controller.signal, headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}) }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
    if (!response.ok) {
      const message = response.status === 401 ? '로그인이 필요하거나 이메일·비밀번호가 일치하지 않습니다.' : response.status === 409 ? '서버 데이터가 변경되었습니다. 최신 저장본을 다시 확인한 뒤 병합하세요.' : response.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : response.status === 400 ? '입력 정보를 확인해 주세요. 재설정 토큰은 유효 기간과 사용 여부를 확인하세요.' : response.status === 403 ? '요청 권한 또는 세션을 확인할 수 없습니다. 다시 로그인해 주세요.' : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      throw new ApiError(response.status, message);
    }
    const envelope = z.object({ data: z.unknown(), error: z.unknown().nullable() }).parse(await response.json());
    return schema.parse(envelope.data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, '서버에 연결하거나 응답을 확인하지 못했습니다. 연결 상태와 서버 설정을 확인해 주세요.');
  } finally { clearTimeout(timer); }
}
