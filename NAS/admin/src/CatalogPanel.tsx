import { useState } from 'react';
import type { FormEvent } from 'react';
import { WarSchema, EntitySchema, CollectionSchema, ClaimSchema } from './generated-contract';
import { api, label, object, safeUrl } from './api';
import { Check, Empty, Panel } from './components';

type Action = (operation: () => Promise<unknown>, success: string) => Promise<void>;
const titles: Record<string, string> = { war: '전쟁', entity: '사건·인물·조직·장소·장비', collection: '주제별 모음', claim: '주장과 상충하는 수치' };
const split = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

function CatalogForm({ kind, existing, action, busy }: { kind: string; existing?: Record<string, unknown>; action: Action; busy: boolean }) {
  const [id, setId] = useState(label(existing?.id, ''));
  const [name, setName] = useState(label(existing?.name ?? existing?.title ?? existing?.statement, ''));
  const [summary, setSummary] = useState(label(existing?.summary, ''));
  const [sourceUrl, setSourceUrl] = useState(label(existing?.sourceUrl ?? object(existing?.source).url, ''));
  const [sourceLabel, setSourceLabel] = useState(label(object(existing?.source).label, ''));
  const [sourcePage, setSourcePage] = useState(label(object(existing?.source).page, ''));
  const [period, setPeriod] = useState(label(existing?.period ?? object(existing?.scope).period, ''));
  const [aliases, setAliases] = useState(Array.isArray(existing?.aliases) ? existing.aliases.join(', ') : '');
  const [regions, setRegions] = useState(Array.isArray(existing?.regions) ? existing.regions.join(', ') : label(object(existing?.scope).region, ''));
  const [relationIds, setRelationIds] = useState(Array.isArray(existing?.warIds ?? existing?.recordIds) ? (Array.isArray(existing?.warIds) ? existing.warIds : Array.isArray(existing?.recordIds) ? existing.recordIds : []).join(', ') : '');
  const [topics, setTopics] = useState(Array.isArray(existing?.topics) ? existing.topics.join(', ') : '');
  const [entityType, setEntityType] = useState(label(existing?.type, 'event'));
  const [subjectId, setSubjectId] = useState(label(existing?.subjectId, ''));
  const [population, setPopulation] = useState(label(object(existing?.scope).population, ''));
  const [value, setValue] = useState(label(existing?.value, ''));
  const [unit, setUnit] = useState(label(existing?.unit, ''));
  const [claimStatus, setClaimStatus] = useState(label(existing?.status, 'reported'));
  const [isPublic, setIsPublic] = useState(existing?.public === true);
  const [locationEnabled, setLocationEnabled] = useState(Boolean(existing?.location));
  const [locationName, setLocationName] = useState(label(object(existing?.location).name, ''));
  const [lat, setLat] = useState(label(object(existing?.location).lat, ''));
  const [lon, setLon] = useState(label(object(existing?.location).lon, ''));
  const [precision, setPrecision] = useState(label(object(existing?.location).precision, 'approximate'));
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || !name.trim()) { setError('ID는 영문·숫자와 _ . : - 만 사용하고 제목을 입력해 주세요.'); return; }
    let body: unknown;
    if (kind === 'claim') {
      if (!subjectId.trim() || !sourceLabel.trim() || !safeUrl(sourceUrl)) { setError('주장의 대상 ID, 출처 이름과 http/https 근거 주소를 입력해 주세요.'); return; }
      const parsed = ClaimSchema.safeParse({ id, subjectId: subjectId.trim(), statement: name.trim(), source: { label: sourceLabel.trim(), url: sourceUrl, ...(sourcePage.trim() ? { page: sourcePage.trim() } : {}) }, scope: { ...(population.trim() ? { population: population.trim() } : {}), ...(period.trim() ? { period: period.trim() } : {}), ...(regions.trim() ? { region: regions.trim() } : {}) }, ...(value.trim() ? { value: value.trim() } : {}), ...(unit.trim() ? { unit: unit.trim() } : {}), status: claimStatus, public: isPublic });
      if (!parsed.success) { setError('주장과 출처·집계 범위의 입력 형식을 확인해 주세요.'); return; }
      body = parsed.data;
    } else {
      const input = kind === 'war' ? { id, name: name.trim(), aliases: split(aliases), period, summary, sourceUrl, regions: split(regions) } : kind === 'collection' ? { id, title: name.trim(), summary, recordIds: split(relationIds), topics: split(topics) } : { id, name: name.trim(), type: entityType, summary, warIds: split(relationIds), ...(sourceUrl ? { sourceUrl } : {}), ...(locationEnabled ? { location: { name: locationName, lat: Number(lat), lon: Number(lon), precision } } : {}) };
      const schema = kind === 'war' ? WarSchema : kind === 'collection' ? CollectionSchema : EntitySchema;
      const parsed = schema.safeParse(input);
      if (!parsed.success) { setError('필수 항목과 출처 주소, 위치 좌표의 범위를 확인해 주세요.'); return; }
      body = parsed.data;
    }
    await action(() => api.request(`/catalog/${kind}`, { method: 'POST', body }), '사전 기록을 저장했습니다. 공개 대상의 변경은 다음 발행에 반영됩니다.');
  };
  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    <label>영구 ID<input required value={id} disabled={Boolean(existing)} maxLength={150} pattern="[a-zA-Z0-9_.:\-]+" onChange={(event) => setId(event.target.value)} placeholder="예: korean-war" /></label>
    <label>{kind === 'claim' ? '주장의 내용' : '이름·제목'}<input required value={name} maxLength={kind === 'claim' ? 10000 : 1000} onChange={(event) => setName(event.target.value)} /></label>
    {kind === 'entity' && <label>대상 종류<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="event">사건</option><option value="person">인물</option><option value="organization">조직·부대</option><option value="place">장소</option><option value="equipment">장비</option></select></label>}
    {kind !== 'claim' && <label>설명<textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>}
    {kind !== 'collection' && <label>근거 출처 URL<input type="url" required={kind === 'war' || kind === 'claim'} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>}
    {kind === 'war' && <><label>다른 명칭<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="쉼표로 구분" /></label><label>전쟁 기간<input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="원문과 불확실성을 보존한 기간 표시" /></label><label>지역<input value={regions} onChange={(event) => setRegions(event.target.value)} placeholder="쉼표로 구분" /></label></>}
    {kind === 'entity' && <><label>연결할 전쟁 ID<input value={relationIds} onChange={(event) => setRelationIds(event.target.value)} placeholder="쉼표로 구분" /></label><Check checked={locationEnabled} onChange={setLocationEnabled}>지도 위치를 기록합니다.</Check>{locationEnabled && <><label>장소명<input required value={locationName} onChange={(event) => setLocationName(event.target.value)} /></label><div className="field-grid"><label>위도<input type="number" required step="any" min={-90} max={90} value={lat} onChange={(event) => setLat(event.target.value)} /></label><label>경도<input type="number" required step="any" min={-180} max={180} value={lon} onChange={(event) => setLon(event.target.value)} /></label></div><label>위치 정확도<select value={precision} onChange={(event) => setPrecision(event.target.value)}><option value="exact">확인된 지점</option><option value="approximate">추정 지점</option><option value="region">지역 범위</option></select></label><p className="subtle">좌표는 근거 자료로 확인하세요. 행정·법적 경계를 보증하는 정보로 표시하지 않습니다.</p></>}</>}
    {kind === 'collection' && <><label>포함할 자료 ID<input value={relationIds} onChange={(event) => setRelationIds(event.target.value)} placeholder="쉼표로 구분" /></label><label>주제<input value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="쉼표로 구분" /></label></>}
    {kind === 'claim' && <><label>주장의 대상 ID<input required value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="전쟁·사건·자료 등의 ID" /></label><label>근거 출처 이름<input required value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} /></label><label>근거 페이지<input value={sourcePage} onChange={(event) => setSourcePage(event.target.value)} /></label><div className="field-grid"><label>제시한 값<input value={value} onChange={(event) => setValue(event.target.value)} placeholder="예: 약 1만~2만" /></label><label>단위<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label></div><label>집계 대상<input value={population} onChange={(event) => setPopulation(event.target.value)} /></label><label>집계 기간<input value={period} onChange={(event) => setPeriod(event.target.value)} /></label><label>집계 지역<input value={regions} onChange={(event) => setRegions(event.target.value)} /></label><label>주장 검토 상태<select value={claimStatus} onChange={(event) => setClaimStatus(event.target.value)}><option value="reported">출처에서 주장</option><option value="supported">근거로 지지됨</option><option value="disputed">상충·논쟁 있음</option></select></label><Check checked={isPublic} onChange={setIsPublic}>주장과 근거·집계 범위를 함께 공개합니다.</Check><p className="subtle">서로 다른 범위의 수치를 임의로 합산하거나 평균하지 않습니다.</p></>}
    {error && <p className="inline-warning" role="alert">{error}</p>}
    <button type="submit" className="button" disabled={busy}>{existing ? '변경 내용 저장' : '사전 기록 등록'}</button>
  </form>;
}

export default function CatalogPanel({ entries, kind, setKind, action, busy }: { entries: unknown[]; kind: string; setKind: (value: string) => void; action: Action; busy: boolean }) {
  const [selected, setSelected] = useState('');
  const existing = entries.map(object).find((entry) => entry.id === selected);
  return <div className="split"><Panel title="전쟁·관계 사전" eyebrow="CONNECTED CATALOG" actions={<select aria-label="사전 종류" value={kind} onChange={(event) => { setSelected(''); setKind(event.target.value); }}><option value="war">전쟁</option><option value="entity">사건·인물·조직·장소·장비</option><option value="collection">주제별 모음</option><option value="claim">주장·수치</option></select>}><p className="panel-description">자료와 설명을 연결하는 독립 기록입니다. 같은 ID를 편집하면 연결을 유지한 채 내용을 갱신합니다.</p>{entries.length ? <div className="record-list">{entries.map((raw) => { const entry = object(raw); return <button key={label(entry.id)} type="button" className={`record-list-item ${entry.id === selected ? 'selected' : ''}`} onClick={() => setSelected(label(entry.id))}><strong>{label(entry.name ?? entry.title ?? entry.statement)}</strong><small>{label(entry.id)}</small></button>; })}</div> : <Empty title={`등록된 ${titles[kind] ?? '사전'} 기록이 없습니다`}>실제 자료의 출처를 바탕으로 첫 기록을 작성하세요.</Empty>}</Panel><Panel title={existing ? '사전 기록 편집' : `${titles[kind] ?? '사전'} 등록`} eyebrow="CATALOG EDITOR" actions={existing && <button className="text-button" onClick={() => setSelected('')}>신규 등록으로</button>}><CatalogForm key={`${kind}-${selected}`} kind={kind} existing={existing} action={action} busy={busy} /></Panel></div>;
}
