'use client';
import { useState } from 'react';
import { useStaticQuery } from './query-state';
import { z } from 'zod';
import { apiOrigin, apiRequest } from '@/lib/api';
import { ConnectionNotice } from './account';

export function RequestForm({ type }: { type: 'correction' | 'contribution' }) {
  const params = useStaticQuery(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const configured = Boolean(apiOrigin());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setMessage('');
    const get = (key: string) => String(fields.get(key) ?? '').trim();
    try {
      await apiRequest('/api/v1/requests', z.unknown(), { method: 'POST', body: { type, message: get('message'), ...(get('recordId') ? { recordId: get('recordId') } : {}), ...(get('sourceUrl') ? { sourceUrl: get('sourceUrl') } : {}), ...(get('contact') ? { contact: get('contact') } : {}) } });
      setMessage('요청을 접수했습니다. 공개 반영은 출처·권리·내용 검토 후 결정됩니다.'); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : '요청을 접수하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <><div className="request-guidance"><h2>{type === 'correction' ? '근거와 함께 바로잡습니다' : '원자료의 맥락부터 함께 남깁니다'}</h2><p>{type === 'correction' ? '대상 자료, 수정할 부분, 제안 이유와 근거의 페이지·구간을 알려 주세요. 개인정보 공개 문제나 권리 관련 요청도 접수할 수 있습니다.' : '자료명, 생산자, 소장·입수 경로, 관련 전쟁·시기와 이용 허락 범위를 알려 주세요. 원본은 보관하고 공개 접근이 가능한 소장처 링크를 우선 제공해 주세요.'}</p><p>비밀번호·비밀키·주민등록번호와 같은 민감정보를 입력하지 마세요. 파일 첨부와 개인 보관 자료의 전달은 운영자의 검토 후 별도 절차로 진행합니다.</p></div>{!configured ? <><ConnectionNotice /><p className="notice">접수 연결 전에는 아래 내용을 정리해 보관해 주세요: 자료 주소·식별번호, 설명 또는 수정안, 근거 출처, 권리·민감정보 관련 사항. 현재 전송 가능한 접수 창구는 설정되지 않았습니다.</p></> : <form className="request-form" onSubmit={event => { void submit(event); }}><label className="field">{type === 'correction' ? '대상 자료 ID' : '관련 자료 ID (선택)'}<input name="recordId" defaultValue={params.get('record') ?? ''} maxLength={200} /></label><label className="field">근거·소장처 주소 (선택)<input type="url" name="sourceUrl" maxLength={2000} placeholder="https://" /></label><label className="field">{type === 'correction' ? '수정할 부분과 근거' : '자료 설명·입수 경로·이용 조건'}<textarea name="message" required minLength={20} maxLength={10000} rows={8} /></label><label className="field">회신용 이메일 (선택)<input type="email" name="contact" maxLength={254} autoComplete="email" /></label><label className="consent"><input type="checkbox" required />입력한 내용이 검토 목적으로 접수되는 것을 확인했습니다.</label><button type="submit" className="button" disabled={busy}>{busy ? '접수 중…' : '검토 요청 접수 ↗'}</button><p className="status-message" role="status">{message}</p></form>}</>;
}
