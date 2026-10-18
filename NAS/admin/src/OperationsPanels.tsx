import { useState } from 'react';
import { api, label, list, object, time } from './api';
import { DateCell, Empty, Panel, RawTable, Status } from './components';

type Action = (operation: () => Promise<unknown>, success: string) => Promise<void>;

export function Overview({ raw, onNavigate }: { raw: unknown; onNavigate: (tab: string) => void }) {
  const overview = object(raw), counts = object(overview.counts), storage = object(overview.storage), recordCounts = object(overview.recordCounts), jobCounts = object(overview.jobCounts);
  const totals = [
    { title: '전체 자료', value: counts.records ?? overview.records, caption: '보존·검토·공개 자료', tab: 'records' },
    { title: '수집 출처', value: counts.sources ?? overview.sources, caption: '등록된 기관 연결', tab: 'sources' },
    { title: '검토 대기', value: counts.review ?? counts.pendingReview ?? recordCounts.review ?? 0, caption: '운영자의 판단이 필요한 자료', tab: 'records' },
    { title: '실패 작업', value: counts.failedJobs ?? counts.failed ?? jobCounts.failed ?? 0, caption: '원인 확인 후 재시도', tab: 'jobs' },
  ];
  return <><div className="metric-grid">{totals.map((metric) => <button type="button" className="metric" key={metric.title} onClick={() => onNavigate(metric.tab)}><span>{metric.title}</span><strong>{label(metric.value, '집계 대기')}</strong><small>{metric.caption}<span aria-hidden="true">↗</span></small></button>)}</div>
    <div className="workflow"><div><span className="workflow-number">01</span><h3>지속 수집</h3><p>출처별 신규·과거 기록 확인</p></div><span className="workflow-arrow" aria-hidden="true">→</span><div><span className="workflow-number">02</span><h3>정제·자료 제작</h3><p>분류·중복 확인·공개 검사</p></div><span className="workflow-arrow" aria-hidden="true">→</span><div><span className="workflow-number">03</span><h3>자동 발행</h3><p>승인된 공개본 전달·검증</p></div><span className="workflow-loop" aria-hidden="true">↻</span></div>
    <div className="split overview-split"><Panel title={Array.isArray(overview.jobs) ? '최근 작업' : '작업 상태 집계'} eyebrow="PIPELINE" actions={<button className="text-button" onClick={() => onNavigate('jobs')}>전체 작업 →</button>}>
      {Array.isArray(overview.jobs) ? <RawTable data={overview.jobs} columns={[{ key: 'kind', title: '작업', render: (row) => <Status value={row.kind} /> }, { key: 'state', title: '상태', render: (row) => <Status value={row.state} /> }, { key: 'updatedAt', title: '최근 처리', render: (row) => <DateCell value={row.updatedAt} /> }]} /> : <RawTable data={Object.entries(jobCounts).map(([state, count]) => ({ id: state, state, count }))} columns={[{ key: 'state', title: '작업 상태', render: (row) => <Status value={row.state} /> }, { key: 'count', title: '작업 수' }]} />}
    </Panel>
      <Panel title="운영 확인" eyebrow="OPERATIONS"><dl className="health-list"><div><dt>기준 시간대</dt><dd>대한민국 · Asia/Seoul</dd></div><div><dt>수집 출처</dt><dd>{typeof overview.sources === 'number' ? `${overview.sources}개 등록` : `${list(overview.sources).filter((entry) => object(entry).enabled === true).length}개 활성`}</dd></div><div><dt>마지막 수집 성공</dt><dd>{time(overview.lastCollectionAt)}</dd></div><div><dt>가장 오래 대기한 작업</dt><dd>{time(overview.oldestPendingAt)}</dd></div><div><dt>출처 오류</dt><dd>{label(overview.sourceErrors, '정보 없음')}</dd></div><div><dt>저장된 용량</dt><dd>{typeof storage.bytes === 'number' ? `${(storage.bytes / 1024 / 1024).toFixed(1)} MB` : '측정 정보 없음'}</dd></div><div><dt>최근 발행</dt><dd>{list(overview.publications).length ? time(object(list(overview.publications)[0]).createdAt) : object(overview.lastPublication).createdAt ? time(object(overview.lastPublication).createdAt) : '발행 기록 없음'}</dd></div></dl><p className="panel-footnote">자료가 없는 날에도 확인 작업은 기록됩니다. 로컬 공개본 생성과 외부 사이트 반영은 별도 상태입니다.</p></Panel></div>
  </>;
}

export function JobsPanel({ jobs, action, busy }: { jobs: unknown[]; action: Action; busy: boolean }) {
  const [filter, setFilter] = useState('');
  const filtered = filter ? jobs.filter((entry) => object(entry).state === filter) : jobs;
  return <Panel title="작업 대기열과 처리 이력" eyebrow="JOB QUEUE" actions={<select aria-label="작업 상태 필터" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">전체 상태</option><option value="queued">대기</option><option value="running">실행 중</option><option value="retry">재시도 대기</option><option value="failed">실패</option><option value="done">완료</option></select>}><p className="panel-description">진행 중인 작업은 이어받고, 반복 실패한 작업은 검토 후 다시 실행합니다.</p><RawTable data={filtered} columns={[
    { key: 'id', title: '작업 ID', render: (row) => <code className="id-text">{label(row.id)}</code> },
    { key: 'kind', title: '종류', render: (row) => <Status value={row.kind} /> },
    { key: 'state', title: '상태', render: (row) => <Status value={row.state} /> },
    { key: 'attempts', title: '실행 횟수', render: (row) => `${label(row.attempts)} / ${label(row.maxAttempts)}` },
    { key: 'runAt', title: '예약 시각', render: (row) => <DateCell value={row.runAt} /> },
    { key: 'lastError', title: '진단', render: (row) => row.lastError ? <span className="inline-warning">처리 오류 · 서버 로그 확인</span> : '—' },
    { key: 'actions', title: '작업', render: (row) => row.state === 'failed' || row.state === 'retry' ? <button className="button button-secondary button-small" disabled={busy} onClick={() => void action(() => api.request(`/jobs/${encodeURIComponent(label(row.id))}/retry`, { method: 'POST' }), '작업을 다시 대기열에 등록했습니다.')}>재시도</button> : <span className="subtle">자동 처리</span> },
  ]} /></Panel>;
}

export function PublicationsPanel({ publications, action, busy }: { publications: unknown[]; action: Action; busy: boolean }) {
  const [target, setTarget] = useState('local');
  return <Panel title="공개본과 발행 이력" eyebrow="PUBLICATIONS"><div className="publish-box"><div><h3>승인된 자료의 현재 버전 발행</h3><p>로컬은 공개본 파일을 만듭니다. GitHub 전달은 연동 설정과 외부 처리 상태를 확인해야 합니다.</p></div><div className="row-actions"><select aria-label="발행 대상" value={target} onChange={(event) => setTarget(event.target.value)}><option value="local">로컬 공개본 만들기</option><option value="github">GitHub로 공개본 전달</option></select><button className="button" disabled={busy} onClick={() => void action(() => api.request('/publications', { method: 'POST', body: { target } }), '발행 작업을 요청했습니다. 완료와 외부 반영은 이력에서 확인하세요.')}>발행 요청</button></div></div><RawTable data={publications} columns={[
    { key: 'id', title: '발행 ID', render: (row) => <code className="id-text">{label(row.id)}</code> },
    { key: 'target', title: '대상', render: (row) => <Status value={row.target} /> },
    { key: 'status', title: '상태', render: (row) => <><Status value={row.status} />{row.target === 'local' && <small className="block-note">외부 배포 미확인</small>}{row.target === 'github' && object(object(row.manifest).evidence).verified !== true && <small className="block-note">사이트 반영 미확인</small>}</> },
    { key: 'verification', title: '검증 근거', render: (row) => { const evidence = object(object(row.manifest).evidence); return <><span className="subtle">{evidence.localVerified === true ? '로컬 무결성 확인' : '로컬 검사 미확인'}</span>{row.target === 'github' && <small className="block-note">{evidence.verified === true ? '외부 발행 ID 확인' : evidence.uploaded === true ? '저장소 전달 · 외부 반영 대기' : '저장소 전달 미확인'}</small>}{typeof evidence.commit === 'string' && <code className="id-text">{evidence.commit.slice(0, 12)}</code>}</>; } },
    { key: 'recordCount', title: '자료 수' },
    { key: 'createdAt', title: '생성', render: (row) => <DateCell value={row.createdAt} /> },
    { key: 'publishedAt', title: '처리 완료', render: (row) => <DateCell value={row.publishedAt} /> },
    { key: 'lastError', title: '진단', render: (row) => row.lastError ? <span className="inline-warning">발행 오류 · 서버 로그 확인</span> : '—' },
  ]} /></Panel>;
}

export function AuditPanel({ entries }: { entries: unknown[] }) {
  return <Panel title="관리 작업 감사 기록" eyebrow="AUDIT LOG"><p className="panel-description">등록·정정·승인·철회·발행의 추적 이력입니다. 비밀값과 원문 개인정보는 이 화면에 표시하지 않습니다.</p><RawTable data={entries} columns={[
    { key: 'at', title: '시각', render: (row) => <DateCell value={row.at ?? row.createdAt ?? row.timestamp} /> },
    { key: 'operation', title: '작업', render: (row) => label(row.operation ?? row.action) },
    { key: 'actor', title: '실행 주체', render: (row) => label(row.actor ?? row.userId, '시스템') },
    { key: 'targetId', title: '대상', render: (row) => <code className="id-text">{label(row.targetId ?? row.entityId ?? row.resourceId)}</code> },
    { key: 'requestId', title: '추적 ID', render: (row) => <code className="id-text">{label(row.requestId)}</code> },
  ]} /></Panel>;
}

export function RequestsPanel({ requests, busy, action }: { requests: unknown[]; busy: boolean; action: Action }) {
  const [selected, setSelected] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('resolved');
  const row = requests.map(object).find((entry) => entry.id === selected);
  return <div className="split"><Panel title="정정·자료 제안 접수" eyebrow="REQUESTS"><RawTable data={requests} columns={[
    { key: 'status', title: '상태', render: (entry) => <Status value={entry.status} /> },
    { key: 'kind', title: '종류', render: (entry) => label(entry.kind ?? entry.type) },
    { key: 'createdAt', title: '접수', render: (entry) => <DateCell value={entry.createdAt} /> },
    { key: 'actions', title: '내용', render: (entry) => <button className="text-button" onClick={() => { setSelected(label(entry.id)); setResponse(label(entry.response ?? entry.resolution, '')); }}>검토 →</button> },
  ]} empty="접수된 요청이 없습니다" /></Panel><Panel title="요청 검토" eyebrow="REQUEST DETAILS">{!row ? <Empty title="검토할 요청을 선택하세요" /> : <div className="form-stack"><Status value={row.status} /><p className="request-content">{label(row.message ?? row.description ?? row.body ?? row.content)}</p><p className="subtle">대상 자료: {label(row.recordId)}</p><label>처리 결과<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="resolved">처리 완료</option><option value="rejected">반려</option><option value="reviewing">검토 대기</option></select></label><label>처리 기록<textarea required rows={5} value={response} maxLength={2000} onChange={(event) => setResponse(event.target.value)} /></label><button className="button" disabled={busy || !response.trim()} onClick={() => void action(() => api.request(`/requests/${encodeURIComponent(selected)}`, { method: 'PATCH', body: { status, response: response.trim() } }), '요청의 처리 기록을 저장했습니다.')}>처리 기록 저장</button><p className="subtle">이 작업은 내부 상태와 기록을 저장합니다. 제보자에게 메시지를 발송하지 않습니다.</p></div>}</Panel></div>;
}

export function SettingsPanel({ raw, busy, action }: { raw: unknown; busy: boolean; action: Action }) {
  const settings = object(raw);
  return <div className="split"><Panel title="실행 환경 상태" eyebrow="CONFIGURATION"><p className="panel-description">서버에서 제공한 설정 상태입니다. 실제 비밀값은 표시하거나 저장하지 않습니다.</p>{!Object.keys(settings).length ? <Empty title="설정 상태를 가져오지 못했습니다" /> : <dl className="health-list">{Object.entries(settings).filter(([key]) => !/token|password|secret|cookie|credential/i.test(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'boolean' ? <span className={`status ${value ? 'status-approved' : 'status-unreviewed'}`}>{value ? '설정됨' : '미설정'}</span> : typeof value === 'number' || typeof value === 'string' ? label(value) : <span className="subtle">{Array.isArray(value) ? `${value.length}개 항목` : '서버 설정에서 관리'}</span>}</dd></div>)}</dl>}</Panel><Panel title="보존과 복구" eyebrow="PRESERVATION"><div className="backup-card"><span aria-hidden="true">↧</span><h3>메타데이터 백업 내보내기</h3><p>현재 DB의 보존·운영 기록을 내려받습니다. 원본·파생 파일은 별도 백업 정책으로 보존해야 합니다.</p><button className="button button-secondary" disabled={busy} onClick={() => void action(() => api.downloadBackup(), '메타데이터 백업 다운로드를 시작했습니다.')}>백업 내려받기</button></div><p className="panel-footnote">백업 파일에는 비공개 운영 데이터가 포함될 수 있습니다. 접근이 제한된 위치에 보관하세요.</p></Panel></div>;
}
