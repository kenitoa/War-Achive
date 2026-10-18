'use client';
import Link from '@/components/static-link';
import { useState } from 'react';
import { z } from 'zod';
import { ApiError, apiOrigin, apiRequest, RegistrationSchema, RemoteShelfSchema, SessionSchema, type Session } from '@/lib/api';
import { mergeShelves, ShelfSchema, type Shelf } from '@/lib/shelf';
import { saveShelf } from './shelf-store';

export function AccountPanel() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login'); const [session, setSession] = useState<Session>();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  if (!apiOrigin()) return <ConnectionNotice />;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setMessage('');
    try {
      if (mode === 'reset') {
        await apiRequest('/api/v1/account/reset', z.unknown(), { method: 'POST', body: { token: fields.get('token'), password: fields.get('password') } });
        setMessage('비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.'); setMode('login'); form.reset();
      } else if (mode === 'register') {
        await apiRequest('/api/v1/accounts', RegistrationSchema, { method: 'POST', body: { email: fields.get('email'), password: fields.get('password'), displayName: fields.get('displayName') } });
        setMode('login'); setMessage('계정을 만들었습니다. 이메일과 비밀번호로 로그인해 주세요.'); form.reset();
      } else {
        const next = await apiRequest('/api/v1/account/session', SessionSchema, { method: 'POST', body: { email: fields.get('email'), password: fields.get('password') } });
        setSession(next); setMessage('로그인했습니다.'); form.reset();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <div className="account-panel"><p className="notice">계정은 서재의 선택적 동기화에 사용합니다. 자료 검색과 열람에는 로그인이 필요하지 않습니다.</p>{session ? <section><h2>{session.user.displayName}님의 계정</h2><p>{session.user.email}</p><div className="button-row"><Link className="button" href="/shelf/">서재 동기화로 이동 ↗</Link><button className="button secondary" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await apiRequest('/api/v1/account/session', z.unknown(), { method: 'DELETE', csrfToken: session.csrfToken }); setSession(undefined); setMessage('로그아웃했습니다. 이 브라우저의 서재는 유지됩니다.'); } catch (error) { setMessage(error instanceof Error ? error.message : '로그아웃하지 못했습니다.'); } finally { setBusy(false); } }}>로그아웃</button></div><AccountDeletion session={session} onDeleted={() => { setSession(undefined); setMessage("계정과 서버 서재를 삭제했습니다. 브라우저 서재는 유지됩니다."); }} /></section> : <><div className="account-tabs" role="group" aria-label="계정 작업">{([['login', '로그인'], ['register', '회원가입'], ['reset', '비밀번호 재설정']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? 'active' : ''} onClick={() => { setMode(id); setMessage(''); }}>{label}</button>)}</div><form key={mode} className="account-form" onSubmit={event => { void submit(event); }}>{mode === 'reset' ? <><p>운영자가 본인 확인 후 발급한 일회성 재설정 토큰을 입력하세요. 연결되지 않은 이메일로 재설정 메일을 발송하지 않습니다.</p><label className="field">재설정 토큰<input name="token" required autoComplete="off" maxLength={500} /></label></> : <><label className="field">이메일<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>{mode === 'register' && <label className="field">표시 이름<input name="displayName" autoComplete="nickname" required minLength={2} maxLength={80} /></label>}</>}<label className="field">{mode === 'reset' ? '새 비밀번호' : '비밀번호'}<input type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} required /></label>{mode !== 'login' && <p className="fine-print">비밀번호는 12자 이상으로 설정하세요. 토큰과 비밀번호는 브라우저 서재에 저장하지 않습니다.</p>}<button type="submit" className="button" disabled={busy}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : mode === 'register' ? '계정 만들기' : '비밀번호 재설정'}</button></form><button className="text-link" type="button" disabled={busy} onClick={async () => { setBusy(true); try { setSession(await apiRequest('/api/v1/account/session', SessionSchema)); setMessage('현재 로그인한 계정을 확인했습니다.'); } catch (error) { setMessage(error instanceof Error ? error.message : '확인하지 못했습니다.'); } finally { setBusy(false); } }}>현재 로그인 상태 확인</button></>}<p className="status-message" role="status">{message}</p></div>;
}

export function ConnectionNotice() { return <div className="notice connection-notice"><h2>현재는 공개 열람과 브라우저 서재를 제공합니다</h2><p>이 배포에는 계정·접수 서버가 연결되어 있지 않습니다. 계정 없이 자료를 검색·열람하고, 내 서재를 파일로 내보내거나 가져올 수 있습니다.</p><Link href="/shelf/" className="text-link">내 서재 사용하기 ↗</Link></div>; }

function AccountDeletion({ session, onDeleted }: { session: Session; onDeleted: () => void }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  return <details className="account-deletion"><summary>계정과 서버 서재 삭제</summary><p>현재 계정과 서버에 저장한 서재를 삭제합니다. 이 브라우저의 서재는 유지되며 필요하면 먼저 내보내기로 백업하세요.</p><form onSubmit={async event => { event.preventDefault(); if (!window.confirm('현재 계정과 서버 서재를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return; const fields = new FormData(event.currentTarget); setBusy(true); try { await apiRequest('/api/v1/account', z.unknown(), { method: 'DELETE', csrfToken: session.csrfToken, body: { password: fields.get('password') } }); onDeleted(); } catch (error) { setMessage(error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.'); } finally { setBusy(false); } }}><label className="field">현재 비밀번호<input type="password" name="password" required maxLength={128} autoComplete="current-password" /></label><button className="button secondary" type="submit" disabled={busy}>{busy ? '처리 중…' : '현재 계정 삭제'}</button><p role="status" className="status-message">{message}</p></form></details>;
}

export function CloudShelf({ shelf, onMessage }: { shelf: { status: string; document: Shelf }; onMessage: (message: string) => void }) {
  const [session, setSession] = useState<Session>(); const [remote, setRemote] = useState<{ revision: number; document: Shelf | null }>(); const [busy, setBusy] = useState(false);
  if (!apiOrigin()) return null;
  async function load() {
    setBusy(true);
    try {
      const current = await apiRequest('/api/v1/account/session', SessionSchema); setSession(current);
      const stored = await apiRequest('/api/v1/account/shelf', RemoteShelfSchema);
      const document = stored.revision === 0 || stored.document === null || stored.document === undefined ? null : ShelfSchema.parse(stored.document);
      setRemote({ revision: stored.revision, document }); onMessage('서버 저장본을 확인했습니다. 아래에서 병합 또는 업로드를 직접 선택하세요.');
    } catch (error) { setRemote(undefined); onMessage(error instanceof Error ? error.message : '서버 서재를 확인하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!remote || !session || shelf.status !== 'ready') return;
    setBusy(true);
    try {
      const result = await apiRequest('/api/v1/account/shelf', RemoteShelfSchema, { method: 'PUT', csrfToken: session.csrfToken, body: { expectedRevision: remote.revision, document: shelf.document } });
      setRemote({ revision: result.revision, document: shelf.document }); onMessage('현재 브라우저 서재를 서버에 저장했습니다.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setRemote(undefined);
      onMessage(error instanceof Error ? error.message : '업로드하지 못했습니다.');
    } finally { setBusy(false); }
  }
  return <details className="cloud-shelf"><summary>계정 서재 동기화 · 명시적으로 병합하고 저장</summary><p>서버 저장본 확인 → 필요하면 브라우저 서재와 병합 → 결과 확인 후 업로드 순서로 진행하세요. 자동으로 덮어쓰지 않습니다.</p><div className="button-row"><Link className="text-link" href="/account/">로그인·계정 관리 ↗</Link><button className="button secondary" type="button" onClick={() => { void load(); }} disabled={busy}>서버 저장본 확인</button></div>{remote && <div><p>{session?.user.displayName} · 서버 판 {remote.revision} · 자료 {remote.document?.items.length ?? 0}건</p><div className="button-row"><button className="button secondary" type="button" disabled={busy || !remote.document || shelf.status !== 'ready'} onClick={() => { if (!remote.document) return; try { saveShelf(mergeShelves(shelf.document, remote.document)); onMessage('서버 저장본과 브라우저 서재를 병합했습니다. 결과를 확인한 후 업로드하세요.'); } catch (error) { onMessage(error instanceof Error ? error.message : '병합하지 못했습니다.'); } }}>서버 자료를 브라우저와 병합</button><button className="button" type="button" disabled={busy || shelf.status !== 'ready'} onClick={() => { if (window.confirm('현재 브라우저 서재로 서버 저장본을 갱신할까요? 서버에만 있는 메모는 먼저 병합해 주세요.')) void upload(); }}>{busy ? '처리 중…' : '현재 서재를 서버에 업로드'}</button></div></div>}</details>;
}
