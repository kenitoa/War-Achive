import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PublicRecordSchema } from './generated-contract';
import type { PublicRecord } from './generated-contract';
import { api, label, object, safeUrl, time } from './api';
import { Check, Empty, ErrorNotice, Panel, Status } from './components';
import RecordAssets from './RecordAssets';
import SourceCandidate from './SourceCandidate';
import RecordVersions from './RecordVersions';

type Action = (operation: () => Promise<unknown>, success: string) => Promise<void>;

function RecordEditor({ raw, busy, action, role }: { raw: unknown; busy: boolean; action: Action; role: string }) {
  const row = object(raw);
  const result = PublicRecordSchema.safeParse(row.public);
  if (!result.success) return <ErrorNotice error="자료 응답의 구조를 확인할 수 없습니다. API와 관리자 화면의 버전을 확인해 주세요." />;
  return <ValidatedRecordEditor row={row} record={result.data} busy={busy} action={action} role={role} />;
}

function ValidatedRecordEditor({ row, record, busy, action, role }: { row: Record<string, unknown>; record: PublicRecord; busy: boolean; action: Action; role: string }) {
  const [title, setTitle] = useState(record.title);
  const [originalTitle, setOriginalTitle] = useState(record.originalTitle ?? '');
  const [language, setLanguage] = useState(record.language);
  const [summary, setSummary] = useState(record.summary);
  const [transcript, setTranscript] = useState(record.transcript ?? '');
  const [translation, setTranslation] = useState(record.translation ?? '');
  const [rightsLabel, setRightsLabel] = useState(record.rights.label);
  const [rightsUrl, setRightsUrl] = useState(record.rights.url ?? '');
  const [dateDisplay, setDateDisplay] = useState(record.dates.display);
  const [dateStart, setDateStart] = useState(record.dates.start ?? '');
  const [dateEnd, setDateEnd] = useState(record.dates.end ?? '');
  const [datePrecision, setDatePrecision] = useState(record.dates.precision);
  const [warIds, setWarIds] = useState(record.warIds.join(', '));
  const [entityIds, setEntityIds] = useState(record.entityIds.join(', '));
  const [topics, setTopics] = useState(record.topics.join(', '));
  const [citations, setCitations] = useState(record.citations);
  const [downloadAllowed, setDownloadAllowed] = useState(record.rights.downloadAllowed);
  const [reuseAllowed, setReuseAllowed] = useState(record.rights.reuseAllowed);
  const [provenance, setProvenance] = useState(record.review.provenance === 'checked');
  const [content, setContent] = useState(record.review.content === 'reviewed');
  const [translationReviewed, setTranslationReviewed] = useState(record.review.translation === 'reviewed');
  const [sensitive, setSensitive] = useState(record.sensitivity === 'warning');
  const [note, setNote] = useState('');
  const [withdrawal, setWithdrawal] = useState(false);
  const [error, setError] = useState('');
  const [sourceOverride, setSourceOverride] = useState<PublicRecord['source'] | null>(null);
  const [candidateApplied, setCandidateApplied] = useState(false);
  const id = label(row.id, record.id);
  const processing = object(row.processing);
  const processingLabel = (value: unknown): string => value === 'complete' ? '처리 완료' : value === 'unavailable' ? '처리 연결 미설정 · 수동 입력 가능' : '요청되지 않음';
  const split = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const updated = PublicRecordSchema.safeParse({ ...record, source: sourceOverride ?? record.source, title: title.trim(), originalTitle: originalTitle.trim() || undefined, language: language.trim(), summary: summary.trim(), transcript, translation, dates: { display: dateDisplay.trim(), ...(dateStart.trim() ? { start: dateStart.trim() } : {}), ...(dateEnd.trim() ? { end: dateEnd.trim() } : {}), precision: datePrecision }, warIds: split(warIds), entityIds: split(entityIds), topics: split(topics), citations, sensitivity: sensitive ? 'warning' : 'none', rights: { label: rightsLabel.trim(), ...(rightsUrl ? { url: rightsUrl } : {}), downloadAllowed, reuseAllowed }, review: { provenance: provenance ? 'checked' : 'unverified', content: content ? 'reviewed' : record.review.content === 'reviewed' ? 'source-description' : record.review.content, translation: translationReviewed ? 'reviewed' : translation ? 'machine' : 'none' } });
    if (!title.trim() || !rightsLabel.trim() || !updated.success) { setError('제목·권리 설명과 날짜·링크 형식을 확인해 주세요.'); return; }
    await action(() => api.request(`/records/${encodeURIComponent(id)}`, { method: 'PATCH', body: { public: updated.data, expectedRevision: record.revision } }), '자료를 수정했습니다. 변경된 공개본은 다음 발행에서 반영됩니다.');
  };
  const review = async (decision: 'approve' | 'reject') => {
    if (note.trim().length < 3) { setError('검토 또는 철회 사유를 세 글자 이상 입력해 주세요.'); return; }
    setError('');
    await action(() => api.request(`/records/${encodeURIComponent(id)}/review`, { method: 'POST', body: { decision, note: note.trim(), expectedRevision: record.revision } }), decision === 'approve' ? '검토를 승인했습니다. 공개 반영은 발행 상태에서 확인하세요.' : '자료 검토를 반려했습니다.');
  };

  const sourceUrl = safeUrl((sourceOverride ?? record.source).url);
  const thumbnail = safeUrl(record.media.thumbnailUrl);
  const candidate = PublicRecordSchema.safeParse(row.sourceCandidate);
  const applyCandidate = (value: PublicRecord) => {
    setTitle(value.title); setOriginalTitle(value.originalTitle ?? ''); setSummary(value.summary); setDateDisplay(value.dates.display); setDateStart(value.dates.start ?? ''); setDateEnd(value.dates.end ?? ''); setDatePrecision(value.dates.precision); setSourceOverride(value.source); setProvenance(false); setContent(false); setCandidateApplied(true);
  };
  return <>
    <div className="record-heading"><div className="tags"><Status value={row.status} /><span className="subtle">{record.kind}</span><span className="subtle">개정 {record.revision}</span></div><h3>{record.title}</h3><p>{record.source.name} · {record.source.identifier}</p></div>
    {thumbnail && !sensitive && <img className="record-preview" src={thumbnail} alt="자료 미리보기" referrerPolicy="no-referrer" />}
    {sensitive && <p className="inline-warning">민감 자료로 분류되어 미리보기를 가렸습니다. 원 소장처에서 내용을 확인할 수 있습니다.</p>}
    <div className="provenance-box"><span className="eyebrow">PROVENANCE</span><p>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">원 소장처에서 자료 확인 ↗</a> : '원문 링크 확인 필요'}</p><small>출처 확인일 {time(record.source.accessedAt)} · 원본 해시 {label(row.rawHash).slice(0, 16)}…</small></div>
    <dl className="health-list processing-status"><div><dt>OCR·판독 작업</dt><dd>{processingLabel(processing.ocr)}</dd></div><div><dt>번역 작업</dt><dd>{processingLabel(processing.translation)}</dd></div></dl>
    {row.sourceAvailability === 'unavailable' && <p className="record-source-warning">최근 재확인에서 원 소장처 자료를 확인하지 못했습니다. 보존 기록과 출처 상태를 검토하세요.</p>}
    {candidate.success && <SourceCandidate current={record} candidate={candidate.data} applied={candidateApplied} onApply={() => applyCandidate(candidate.data)} onRestore={() => { applyCandidate(record); setSourceOverride(null); setProvenance(record.review.provenance === 'checked'); setContent(record.review.content === 'reviewed'); setCandidateApplied(false); }} />}
    <form onSubmit={(event) => void save(event)} className="form-stack">
      <label>제목<input value={title} required maxLength={1000} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>원래 제목<input value={originalTitle} maxLength={1000} onChange={(event) => setOriginalTitle(event.target.value)} /></label>
      <label>언어<input value={language} maxLength={100} onChange={(event) => setLanguage(event.target.value)} placeholder="예: ko, en, ja, und" /></label>
      <label>설명<textarea value={summary} rows={5} onChange={(event) => setSummary(event.target.value)} /></label>
      <div className="field-grid"><label>날짜 표시<input value={dateDisplay} onChange={(event) => setDateDisplay(event.target.value)} /></label><label>날짜 정확도<select value={datePrecision} onChange={(event) => { const result = PublicRecordSchema.shape.dates.shape.precision.safeParse(event.target.value); if (result.success) setDatePrecision(result.data); }}><option value="exact">정확한 날짜</option><option value="year">연도</option><option value="range">기간</option><option value="circa">추정</option><option value="unknown">미상</option></select></label></div>
      <div className="field-grid"><label>정규화 시작일<input value={dateStart} onChange={(event) => setDateStart(event.target.value)} placeholder="확인한 날짜·연도, 미상은 비움" /></label><label>정규화 종료일<input value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} placeholder="기간 자료의 확인한 종료일" /></label></div>
      <p className="subtle">원래 날짜 표현과 추정 여부를 보존하세요. 미상인 날짜를 임의의 정확한 날짜로 채우지 않습니다.</p>
      <label>전쟁 ID<input value={warIds} onChange={(event) => setWarIds(event.target.value)} placeholder="쉼표로 구분" /></label>
      <label>사건·인물·조직·장소·장비 ID<input value={entityIds} onChange={(event) => setEntityIds(event.target.value)} placeholder="쉼표로 구분" /></label>
      <label>주제<input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="쉼표로 구분" /></label>
      <label>이용 조건 설명<textarea required rows={2} value={rightsLabel} onChange={(event) => setRightsLabel(event.target.value)} /></label>
      <label>이용 조건 근거 링크<input type="url" value={rightsUrl} onChange={(event) => setRightsUrl(event.target.value)} /></label>
      <Check checked={downloadAllowed} onChange={setDownloadAllowed}>다운로드 가능 범위를 확인했습니다.</Check>
      <Check checked={reuseAllowed} onChange={setReuseAllowed}>재사용 가능 범위를 확인했습니다.</Check>
      <Check checked={sensitive} onChange={setSensitive}>민감한 이미지·내용의 사전 안내가 필요합니다.</Check>
      <details className="editor-details"><summary>판독·번역 편집</summary><label>판독문<textarea rows={7} value={transcript} onChange={(event) => setTranscript(event.target.value)} /></label><label>번역문<textarea rows={7} value={translation} onChange={(event) => setTranslation(event.target.value)} /></label><p className="subtle">판독·번역을 수정해도 원본 자료는 변경되지 않습니다.</p></details>
      <details className="editor-details"><summary>근거·인용 편집 ({citations.length}개)</summary>{citations.map((citation, index) => <fieldset className="citation-editor" key={index}><legend>근거 {index + 1}</legend><label>출처 이름<input required value={citation.label} onChange={(event) => setCitations((items) => items.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></label><label>출처 URL<input required type="url" value={citation.url} onChange={(event) => setCitations((items) => items.map((item, position) => position === index ? { ...item, url: event.target.value } : item))} /></label><div className="field-grid"><label>페이지<input value={citation.page ?? ''} onChange={(event) => setCitations((items) => items.map((item, position) => position === index ? { ...item, page: event.target.value } : item))} /></label><label>영상·음성 구간<input value={citation.timecode ?? ''} onChange={(event) => setCitations((items) => items.map((item, position) => position === index ? { ...item, timecode: event.target.value } : item))} placeholder="예: 00:10:30" /></label></div><button type="button" className="text-button danger-text" onClick={() => setCitations((items) => items.filter((_, position) => position !== index))}>근거 제거</button></fieldset>)}<button type="button" className="text-button" onClick={() => setCitations((items) => [...items, { label: '', url: '' }])}>+ 근거 추가</button></details>
      <div className="form-divider"><h3>검수 상태</h3></div>
      <Check checked={provenance} onChange={setProvenance}>자료의 출처와 식별 정보를 확인했습니다.</Check>
      <Check checked={content} onChange={setContent}>자료 설명과 판독 내용을 검수했습니다.</Check>
      <Check checked={translationReviewed} onChange={setTranslationReviewed}>번역을 검수했습니다.</Check>
      <button type="submit" className="button button-secondary" disabled={busy}>수정 내용 저장</button>
    </form>
    <RecordAssets id={id} busy={busy} action={action} role={role} />
    <RecordVersions id={id} />
    <div className="citation-list"><h3>근거와 인용</h3>{record.citations.length ? record.citations.map((citation, index) => <p key={`${citation.url}-${index}`}><a href={safeUrl(citation.url)} target="_blank" rel="noopener noreferrer">{citation.label} ↗</a>{citation.page && <small> · {citation.page}쪽</small>}{citation.timecode && <small> · {citation.timecode}</small>}</p>) : <p className="subtle">등록된 인용 정보가 없습니다.</p>}</div>
    <div className="review-actions"><h3>검토 결정</h3><p className="subtle">변경한 내용은 먼저 저장하세요. 승인한 개정과 실제 발행한 개정은 발행 이력으로 확인합니다.</p><label>검토·철회 사유<textarea value={note} rows={3} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="확인한 근거 또는 조치 이유를 기록하세요." /></label>
      {error && <p className="inline-warning" role="alert">{error}</p>}
      <div className="row-actions"><button className="button" type="button" disabled={busy || row.status === 'withdrawn'} onClick={() => void review('approve')}>공개 승인</button><button className="button button-secondary" type="button" disabled={busy || row.status === 'withdrawn'} onClick={() => void review('reject')}>반려</button>{row.status !== 'withdrawn' && <button className="text-button danger-text" type="button" onClick={() => setWithdrawal(!withdrawal)}>공개 철회…</button>}</div>
      {withdrawal && <div className="withdrawal-confirm"><strong>“{record.title}” 공개를 철회합니다.</strong><p>사이트·검색·공개 미디어 반영 상태를 발행 이력에서 확인해야 합니다. 보존 원본은 유지합니다.</p><button type="button" className="button button-danger" disabled={busy || note.trim().length < 3} onClick={() => void action(() => api.request(`/records/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: { reason: note.trim(), expectedRevision: record.revision } }), '철회 요청을 반영했습니다. 공개 사이트의 철회 반영 상태를 확인하세요.')}>사유를 기록하고 철회</button><button type="button" className="text-button" onClick={() => setWithdrawal(false)}>취소</button></div>}
    </div>
  </>;
}

export default function RecordsPanel({ records, status, setStatus, busy, action, refreshKey, selected, setSelected, role }: { selected: string; setSelected: (value: string) => void; records: unknown[]; status: string; setStatus: (value: string) => void; busy: boolean; action: Action; refreshKey: number; role: string }) {
  const [detail, setDetail] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    setLoading(true); setError('');
    void api.request(`/records/${encodeURIComponent(selected)}`).then((result) => { if (current) setDetail(result); }).catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : '자료를 가져오지 못했습니다.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected, refreshKey]);

  return <div className="split split-records"><Panel title="자료 검토" eyebrow="REVIEW DESK" actions={<select aria-label="자료 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="review">검토 대기</option><option value="draft">초안</option><option value="published">공개 자료</option><option value="withdrawn">철회 자료</option><option value="">전체</option></select>}>
    {!records.length ? <Empty title="이 상태의 자료가 없습니다">수집된 자료의 정제가 끝나면 이곳에서 출처와 공개 조건을 검토할 수 있습니다.</Empty> : <div className="record-list">{records.map((raw) => { const row = object(raw), pub = object(row.public), id = label(row.id, ''); return <button key={id} className={`record-list-item ${selected === id ? 'selected' : ''}`} onClick={() => setSelected(id)} type="button"><div className="tags"><Status value={row.status} /><span className="subtle">{label(pub.kind)}</span></div><strong>{label(pub.title, '제목 확인 필요')}</strong><span>{label(object(pub.source).name)}</span><small>수정 {time(row.updatedAt)}</small></button>; })}</div>}
  </Panel><Panel title="자료 상세·검수" eyebrow="RECORD DETAILS">
    {!selected ? <Empty title="검토할 자료를 선택하세요">원 소장처·이용 조건·판독 결과를 함께 확인할 수 있습니다.</Empty> : loading ? <p className="loading" role="status">자료를 불러오는 중…</p> : error ? <ErrorNotice error={error} /> : <RecordEditor key={`${selected}-${refreshKey}`} raw={detail} busy={busy} action={action} role={role} />}
  </Panel></div>;
}
