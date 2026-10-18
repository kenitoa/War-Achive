import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { api, ApiError, list } from './api';
import { ErrorNotice } from './components';
import SourcePanel from './SourcePanel';
import RecordsPanel from './RecordsPanel';
import CatalogPanel from './CatalogPanel';
import MembersPanel from './MembersPanel';
import { AuditPanel, JobsPanel, Overview, PublicationsPanel, RequestsPanel, SettingsPanel } from './OperationsPanels';

const SessionSchema = z.object({ csrfToken: z.string().min(1), authenticated: z.boolean().optional(), role: z.string().optional() });
const navigation = [
  { id: 'overview', number: '01', name: '운영 현황', subtitle: 'OVERVIEW', description: '수집부터 발행까지, 기록이 이어지는 흐름을 확인합니다.' },
  { id: 'sources', number: '02', name: '수집 출처', subtitle: 'SOURCE REGISTRY', description: '새로운 기록을 발견하는 출처와 공개 정책을 관리합니다.' },
  { id: 'records', number: '03', name: '자료 검토', subtitle: 'REVIEW DESK', description: '자료의 출처와 맥락을 확인하고 공개할 기록을 준비합니다.' },
  { id: 'catalog', number: '04', name: '전쟁·관계 사전', subtitle: 'CONNECTED CATALOG', description: '전쟁·사람·장소·주장과 자료의 연결을 기록합니다.' },
  { id: 'jobs', number: '05', name: '작업 이력', subtitle: 'JOB QUEUE', description: '자동 수집·정제·발행 작업의 진행과 재시도를 관리합니다.' },
  { id: 'publications', number: '06', name: '공개 발행', subtitle: 'PUBLICATIONS', description: '승인된 기록을 공개본으로 만들고 발행 상태를 확인합니다.' },
  { id: 'requests', number: '07', name: '정정·제안', subtitle: 'REQUESTS', description: '자료에 대한 정정과 제안을 검토하고 처리 근거를 남깁니다.' },
  { id: 'audit', number: '08', name: '감사 기록', subtitle: 'AUDIT LOG', description: '중요한 운영 결정과 자료 변경의 이력을 확인합니다.' },
  { id: 'settings', number: '09', name: '환경·백업', subtitle: 'PRESERVATION', description: '연결 설정과 자료 보존·복구 준비 상태를 확인합니다.' },
  { id: 'members', number: '10', name: '계정 복구', subtitle: 'MEMBERS', description: '계정의 서재 이용과 운영자 발급 복구 절차를 관리합니다.' },
];

function Login({ onLogin, initialError }: { onLogin: (role: string) => void; initialError: string }) {
  const [token, setToken] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setPending(true);
    try {
      const result = SessionSchema.parse(await api.request('/session', { method: 'POST', body: { token, ...(otp.trim() ? { otp: otp.trim() } : {}) } }));
      api.setCsrfToken(result.csrfToken); onLogin(result.role ?? '');
    } catch (failure) { setError(failure instanceof z.ZodError ? '인증 응답을 확인할 수 없습니다. API 버전을 확인해 주세요.' : failure instanceof Error ? failure.message : '인증하지 못했습니다.'); }
    finally { setToken(''); setOtp(''); setPending(false); }
  };
  return <main className="login-page">
    <div className="login-intro">
      <div className="brand-mark" aria-hidden="true">W<span>A</span></div>
      <span className="eyebrow">WAR ARCHIVE / RECORDS OFFICE</span>
      <h1>기록은 계속됩니다.</h1>
      <p>흩어진 전쟁의 자료를 수집하고,<br />출처를 확인하고, 다음 열람자에게 연결합니다.</p>
      <div className="login-principles"><span>01 지속적인 수집</span><span>02 정제와 자료 제작</span><span>03 검증된 기록의 발행</span></div>
      <small>전쟁 아카이브 · NAS 운영 관리실</small>
    </div>
    <div className="login-form-wrap"><form onSubmit={(event) => void submit(event)} className="login-form">
      <span className="eyebrow">AUTHORIZED ACCESS</span><h2>기록 관리실 로그인</h2><p>NAS에 설정된 관리자 토큰으로 접속하세요.</p>
      <label>관리자 토큰<input type="password" autoComplete="off" required value={token} onChange={(event) => setToken(event.target.value)} placeholder="관리자 토큰 입력" maxLength={512} /></label>
      <label>일회용 인증번호 <span className="optional">MFA 설정 시</span><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, ''))} placeholder="6자리 인증번호" /></label>
      {error && <ErrorNotice error={error} />}
      <button className="button" type="submit" disabled={pending}>{pending ? '확인 중…' : '관리실 들어가기 →'}</button>
      <small>토큰은 입력 즉시 세션 인증에 사용하며 브라우저 저장소에 보관하지 않습니다. 인증 세션은 HttpOnly 쿠키로 관리합니다.</small>
    </form></div>
  </main>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState('');
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState('');
  const [page, setPage] = useState(1);
  const [catalogKind, setCatalogKind] = useState('war');
  const [recordStatus, setRecordStatus] = useState('review');
  const [lastRefreshed, setLastRefreshed] = useState('');
  const section = navigation.find((item) => item.id === tab) ?? navigation[0];

  useEffect(() => {
    let current = true;
    void api.request('/session').then((raw) => {
      const session = SessionSchema.safeParse(raw);
      if (current && session.success && session.data.authenticated !== false) { api.setCsrfToken(session.data.csrfToken); setRole(session.data.role ?? ''); setAuthenticated(true); }
    }).catch((failure: unknown) => { if (current && !(failure instanceof ApiError && failure.status === 401)) setError(failure instanceof Error ? failure.message : '세션을 확인하지 못했습니다.'); }).finally(() => { if (current) setBooting(false); });
    return () => { current = false; };
  }, []);

  const expireSession = useCallback((failure: unknown): string => {
    if (failure instanceof ApiError && (failure.status === 401 || failure.code === 'CSRF_INVALID')) { api.setCsrfToken(''); setAuthenticated(false); }
    return failure instanceof Error ? failure.message : '작업을 처리하지 못했습니다.';
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let current = true;
    const query = `?page=${page}&pageSize=100`;
    const endpoint = tab === 'records' ? `/records${query}${recordStatus ? `&status=${encodeURIComponent(recordStatus)}` : ''}` : tab === 'catalog' ? `/catalog/${catalogKind}` : `/${tab}${['overview', 'settings', 'members'].includes(tab) ? '' : query}`;
    setLoading(true); setError(''); setData(null);
    void api.request(endpoint).then((result) => {
      if (current) { setData(result); setLastRefreshed(new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date())); }
    }).catch((failure: unknown) => { if (current) setError(expireSession(failure)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [authenticated, tab, recordStatus, refreshKey, expireSession, page, catalogKind]);

  const action = async (operation: () => Promise<unknown>, success: string): Promise<void> => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(success); setRefreshKey((value) => value + 1); }
    catch (failure) { setError(expireSession(failure)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!authenticated || busy || loading || !['overview', 'jobs'].includes(tab)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((value) => value + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [authenticated, busy, loading, tab]);

  const navigate = (value: string) => { setPage(1); setTab(value); setNotice(''); setError(''); };
  const logout = async () => {
    setBusy(true); setError('');
    try { await api.request('/session', { method: 'DELETE' }); api.setCsrfToken(''); setAuthenticated(false); setData(null); }
    catch (failure) { setError(expireSession(failure)); }
    finally { setBusy(false); }
  };

  if (booting) return <main className="boot-screen"><div className="brand-mark" aria-hidden="true">W<span>A</span></div><p role="status">기록 관리실을 준비하고 있습니다…</p></main>;
  if (!authenticated) return <Login initialError={error} onLogin={(value) => { setRole(value); setError(''); setAuthenticated(true); setRefreshKey((value) => value + 1); }} />;

  return <div className="app-shell"><a className="skip-link" href="#main-content">본문으로 이동</a><aside className="sidebar"><a className="brand" href="/admin/" aria-label="전쟁 아카이브 관리실 홈"><span className="brand-mark" aria-hidden="true">W<span>A</span></span><span>전쟁 아카이브<small>기록 관리실</small></span></a><div className="sidebar-divider" /><span className="nav-label">WORKSPACE</span><nav aria-label="관리 메뉴">{navigation.map((item) => <button type="button" key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><span className="nav-number" aria-hidden="true">{item.number}</span>{item.name}{tab === item.id && <span className="nav-active-dot" aria-hidden="true" />}</button>)}</nav><div className="sidebar-footer"><span className="system-status"><span className="dot dot-on" />관리자 세션 연결</span><small>NAS 기록 보존 · 자동화 운영</small><button className="logout-button" type="button" disabled={busy} onClick={() => void logout()}>로그아웃 ↗</button></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">WAR ARCHIVE <span>/</span> <strong>NAS</strong></div><span className="private-label"><span aria-hidden="true">◈</span> 비공개 관리 환경</span></header><main id="main-content" className="main-content"><div className="page-heading"><div><span className="eyebrow">{section.subtitle}</span><h1>{section.name}</h1><p>{section.description}</p></div><div className="refresh-control"><small>{lastRefreshed ? `${lastRefreshed} 확인 · KST` : '상태 확인 중'}</small><button className="button button-secondary button-small" type="button" disabled={loading || busy} onClick={() => setRefreshKey((value) => value + 1)}><span aria-hidden="true">↻</span> 새로고침</button></div></div>
      {error && <ErrorNotice error={error} />}{notice && <div className="notice notice-success" role="status">{notice}</div>}
      <div aria-busy={loading || busy}>{loading ? <div className="loading-panel" role="status"><span className="spinner" aria-hidden="true" /><p>운영 기록을 불러오고 있습니다.</p></div> : error && data === null ? <div className="retry-card"><p>연결을 확인한 뒤 다시 불러올 수 있습니다.</p><button className="button button-secondary" onClick={() => setRefreshKey((value) => value + 1)}>다시 불러오기</button></div> : <>
        {tab === 'overview' && <Overview raw={data} onNavigate={navigate} />}
        {tab === 'sources' && <SourcePanel sources={list(data)} busy={busy} action={action} />}
        {tab === 'records' && <RecordsPanel records={list(data)} role={role} status={recordStatus} setStatus={(value) => { setPage(1); setRecordStatus(value); }} selected={selectedRecord} setSelected={setSelectedRecord} busy={busy} action={action} refreshKey={refreshKey} />}
        {tab === 'catalog' && <CatalogPanel entries={list(data)} kind={catalogKind} setKind={setCatalogKind} action={action} busy={busy} />}
        {tab === 'members' && <MembersPanel members={list(data)} />}
        {tab === 'jobs' && <JobsPanel jobs={list(data)} busy={busy} action={action} />}
        {tab === 'publications' && <PublicationsPanel publications={list(data)} busy={busy} action={action} />}
        {tab === 'audit' && <AuditPanel entries={list(data)} />}
        {tab === 'requests' && <RequestsPanel requests={list(data)} busy={busy} action={action} />}
        {tab === 'settings' && <SettingsPanel raw={data} busy={busy} action={action} />}
      </>}</div>
      {!loading && !['overview', 'settings', 'catalog', 'members'].includes(tab) && <div className="pagination"><span>{page}페이지 · 한 번에 최대 100건</span><div className="row-actions"><button className="button button-secondary button-small" type="button" disabled={page === 1 || busy} onClick={() => setPage((value) => value - 1)}>이전</button><button className="button button-secondary button-small" type="button" disabled={list(data).length < 100 || busy} onClick={() => setPage((value) => value + 1)}>다음</button></div></div>}
      <footer className="workspace-footer"><span>자료의 출처를 보존하고, 기록의 다음을 연결합니다.</span><span>WAR ARCHIVE · RECORDS OFFICE</span></footer>
    </main></div></div>;
}
