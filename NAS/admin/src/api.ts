import { z } from 'zod';

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
  meta: z.unknown().optional(),
}).refine((value) => 'data' in value && 'error' in value);

const messages: Record<string, string> = {
  UNAUTHORIZED: '관리자 인증이 필요합니다. 다시 로그인해 주세요.',
  FORBIDDEN: '이 작업을 수행할 권한이 없습니다.',
  CSRF_INVALID: '세션 확인 정보가 만료되었습니다. 다시 로그인해 주세요.',
  VALIDATION_ERROR: '입력값을 확인해 주세요.',
  RESOURCE_NOT_FOUND: '요청한 기록을 찾을 수 없습니다.',
  RECORD_NOT_FOUND: '요청한 자료를 찾을 수 없습니다.',
  SOURCE_NOT_FOUND: '수집 출처를 찾을 수 없습니다.',
  RECORD_WITHDRAWN: '철회된 자료는 공개할 수 없습니다.',
  NOT_FOUND: '요청한 기록을 찾을 수 없습니다.',
  CONFLICT: '다른 작업에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
  REVISION_CONFLICT: '다른 작업에서 자료가 수정되었습니다. 새로고침 후 변경 내용을 다시 확인해 주세요.',
  RATE_LIMITED: '요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.',
  POLICY_REQUIRED: '출처의 공개 정책과 권리 검토가 필요합니다.',
  SOURCE_POLICY_REQUIRED: '수집 출처의 이용 조건을 먼저 검토하고 공개 정책을 승인해 주세요.',
  REMOTE_DISABLED: '외부 발행 연결이 설정되지 않았습니다. 운영 설정을 확인해 주세요.',
  INTEGRATION_NOT_CONFIGURED: '외부 발행 연결이 설정되지 않았습니다. 운영 설정을 확인해 주세요.',
};

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly requestId?: string) {
    const message = messages[code] ?? (status >= 500 ? '서버에서 작업을 처리하지 못했습니다. 운영 로그에서 확인해 주세요.' : '요청을 처리하지 못했습니다. 입력과 현재 상태를 확인해 주세요.');
    super(requestId ? `${message} 요청 ID: ${requestId}` : message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private csrfToken = '';

  setCsrfToken(token: string): void { this.csrfToken = token; }

  async request(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, {
        method, headers, credentials: 'same-origin', signal: AbortSignal.timeout(30_000),
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      throw new Error('서버에 연결할 수 없습니다. NAS와 네트워크 상태를 확인해 주세요.');
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error('서버 응답 형식을 확인할 수 없습니다. 운영 상태를 확인해 주세요.'); }
    const envelope = EnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new Error('서버 응답 형식이 올바르지 않습니다. 버전 호환성을 확인해 주세요.');
    if (!response.ok || envelope.data.error) {
      const requestId = object(envelope.data.meta).requestId;
      throw new ApiError(envelope.data.error?.code ?? `HTTP_${response.status}`, response.status, typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(requestId) ? requestId : undefined);
    }
    return envelope.data.data;
  }

  async downloadBackup(): Promise<void> {
    let response: Response;
    try { response = await fetch('/api/v1/backup/export', { credentials: 'same-origin', signal: AbortSignal.timeout(120_000) }); }
    catch { throw new Error('백업 파일을 가져오지 못했습니다. NAS 연결을 확인해 주세요.'); }
    if (!response.ok) throw new ApiError(`HTTP_${response.status}`, response.status);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `war-archive-metadata-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const api = new ApiClient();

export function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

export function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const data = object(value);
  return Array.isArray(data.items) ? data.items : [];
}

export function label(value: unknown, fallback = '—'): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

export function time(value: unknown): string {
  if (typeof value !== 'string' || !value) return '기록 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '날짜 확인 필요' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(date);
}

export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined; }
  catch { return undefined; }
}
