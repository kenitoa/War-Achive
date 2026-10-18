import { useState } from 'react';
import type { FormEvent } from 'react';
import { SourceInputSchema } from './generated-models';
import { api, label, object, time } from './api';
import { Check, Empty, Panel, Status } from './components';

type Action = (operation: () => Promise<unknown>, success: string) => Promise<void>;

export default function SourcePanel({ sources, busy, action }: { sources: unknown[]; busy: boolean; action: Action }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<'loc' | 'commons'>('loc');
  const [query, setQuery] = useState('');
  const [warIds, setWarIds] = useState('');
  const [interval, setInterval] = useState('3600');
  const [enabled, setEnabled] = useState(true);
  const [approved, setApproved] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [rightsLabel, setRightsLabel] = useState('원 소장처의 자료별 이용 조건을 확인하세요.');
  const [rightsUrl, setRightsUrl] = useState('');
  const [formError, setFormError] = useState('');

  const reset = () => { setEditing(null); setName(''); setQuery(''); setWarIds(''); setInterval('3600'); setEnabled(true); setApproved(false); setAutoPublish(false); setRightsLabel('원 소장처의 자료별 이용 조건을 확인하세요.'); setRightsUrl(''); setFormError(''); };
  const edit = (raw: unknown) => {
    const row = object(raw), policy = object(row.policy);
    setEditing(label(row.id, '')); setName(label(row.name, '')); setProvider(row.provider === 'commons' ? 'commons' : 'loc'); setQuery(label(row.query, ''));
    setWarIds(Array.isArray(row.warIds) ? row.warIds.filter((entry): entry is string => typeof entry === 'string').join(', ') : '');
    setInterval(label(row.intervalSeconds, '3600')); setEnabled(row.enabled === true); setApproved(policy.status === 'approved'); setAutoPublish(policy.allowAutoPublish === true);
    setRightsLabel(label(policy.rightsLabel, '')); setRightsUrl(label(policy.rightsUrl, '')); setFormError('');
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    const parsed = SourceInputSchema.safeParse({ name: name.trim(), provider, query: query.trim(), warIds: warIds.split(',').map((id) => id.trim()).filter(Boolean), intervalSeconds: Number(interval), enabled, policy: { status: approved ? 'approved' : 'unreviewed', allowAutoPublish: approved && autoPublish, metadataOnly: true, rightsLabel: rightsLabel.trim(), ...(rightsUrl.trim() ? { rightsUrl: rightsUrl.trim() } : {}) } });
    if (!parsed.success) { setFormError('이름·검색어·권리 설명을 입력하고, 수집 간격을 60~2,592,000초로 설정해 주세요. 권리 링크는 http 또는 https 주소여야 합니다.'); return; }
    await action(() => api.request(editing ? `/sources/${encodeURIComponent(editing)}` : '/sources', { method: editing ? 'PATCH' : 'POST', body: parsed.data }), editing ? '출처 설정을 저장했습니다.' : '수집 출처를 등록했습니다.');
  };

  return <div className="split split-sources"><Panel title="수집 출처" eyebrow="SOURCE REGISTRY" actions={<span className="count">{sources.length}개</span>}>
    <p className="panel-description">기관별 수집 주기와 공개 정책을 관리합니다. 승인된 출처도 자료별 검사에서 제외될 수 있습니다.</p>
    {!sources.length ? <Empty title="등록된 출처가 없습니다">오른쪽에서 첫 출처를 등록하면 일정에 따라 수집을 시작합니다.</Empty> : <div className="source-list">{sources.map((raw) => {
      const source = object(raw), policy = object(source.policy), checkpoint = object(source.checkpoint);
      const id = label(source.id, '');
      return <article className={`source-card ${editing === id ? 'selected' : ''}`} key={id}>
        <div className="source-title"><span className="source-icon" aria-hidden="true">{source.provider === 'commons' ? 'W' : 'L'}</span><div><h3>{label(source.name)}</h3><p>{source.provider === 'commons' ? 'Wikimedia Commons' : 'Library of Congress'}</p></div><span className={`dot ${source.enabled === true ? 'dot-on' : ''}`} aria-label={source.enabled === true ? '수집 활성' : '수집 중지'} /></div>
        <p className="source-query">{label(source.query)}</p>
        <div className="tags"><Status value={policy.status} /><span className="subtle">{label(source.intervalSeconds)}초 간격</span><span className="subtle">메타데이터 수집</span></div>
        <dl className="compact-details"><div><dt>마지막 확인</dt><dd>{time(source.lastCheckedAt)}</dd></div><div><dt>마지막 성공</dt><dd>{time(source.lastSuccessAt)}</dd></div><div><dt>과거 자료</dt><dd>{checkpoint.backfillComplete === true ? '수집 완료' : `${label(checkpoint.backfillPage, '1')}페이지부터 계속`}</dd></div><div><dt>기존 자료 재확인</dt><dd>{time(checkpoint.lastRefreshAt)}</dd></div><div><dt>재확인 진행 위치</dt><dd>{label(checkpoint.refreshOffset, '0')}번째부터 계속</dd></div></dl>
        {Boolean(source.lastError) && <p className="inline-warning">최근 수집에서 오류가 발생했습니다. 작업 이력에서 상태를 확인하세요.</p>}
        <div className="row-actions"><button type="button" className="button button-small button-secondary" onClick={() => edit(raw)}>설정 편집</button><button type="button" className="button button-small" disabled={busy} onClick={() => void action(() => api.request(`/sources/${encodeURIComponent(id)}/collect`, { method: 'POST' }), '수집 요청을 접수했습니다. 작업 이력에서 진행을 확인하세요.')}>지금 수집</button></div>
      </article>;
    })}</div>}
  </Panel>
    <Panel title={editing ? '출처 설정 편집' : '새 출처 등록'} eyebrow={editing ? 'EDIT SOURCE' : 'ADD SOURCE'} actions={editing && <button type="button" className="text-button" onClick={reset}>신규 등록으로</button>}>
      <form onSubmit={(event) => void submit(event)} className="form-stack">
        <label>출처 이름<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="기관과 수집 범위를 알아보기 쉬운 이름" /></label>
        <label>수집 연결<select value={provider} onChange={(event) => setProvider(event.target.value === 'commons' ? 'commons' : 'loc')}><option value="loc">Library of Congress · 공개 API</option><option value="commons">Wikimedia Commons · 공개 API</option></select></label>
        <label>검색어<input required minLength={2} maxLength={500} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: Korean War" /></label>
        <label>연결할 전쟁 ID <span className="optional">선택</span><input value={warIds} onChange={(event) => setWarIds(event.target.value)} placeholder="쉼표로 구분 · korean-war" /></label>
        <label>수집 간격 · 초<input type="number" required min={60} max={2592000} value={interval} onChange={(event) => setInterval(event.target.value)} /></label>
        <Check checked={enabled} onChange={setEnabled}>자동 수집 활성화</Check>
        <div className="form-divider"><h3>출처 공개 정책</h3><p>기본 수집은 출처 링크와 메타데이터입니다. 원본 파일의 복제·재게시 권한은 별도로 검토해야 합니다.</p></div>
        <label>이용 조건 설명<textarea required maxLength={500} rows={3} value={rightsLabel} onChange={(event) => setRightsLabel(event.target.value)} /></label>
        <label>이용 조건 근거 링크 <span className="optional">선택</span><input type="url" value={rightsUrl} onChange={(event) => setRightsUrl(event.target.value)} placeholder="https://…" /></label>
        <Check checked={approved} onChange={(value) => { setApproved(value); if (!value) setAutoPublish(false); }}>이 출처의 메타데이터 공개 범위와 이용 조건을 검토했습니다.</Check>
        <Check checked={autoPublish} disabled={!approved} onChange={setAutoPublish}>개별 자료 검사를 통과하면 자동으로 공개합니다.</Check>
        {formError && <p className="inline-warning" role="alert">{formError}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? '저장 중…' : editing ? '출처 설정 저장' : '수집 출처 등록'}</button>
      </form>
    </Panel>
  </div>;
}
