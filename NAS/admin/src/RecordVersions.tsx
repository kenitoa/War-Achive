import { useState } from 'react';
import { api, label, list, object, safeUrl, time } from './api';
import { ErrorNotice, Status } from './components';

export default function RecordVersions({ id }: { id: string }) {
  const [versions, setVersions] = useState<unknown[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    if (pending) return;
    setPending(true); setError('');
    try { setVersions(list(await api.request(`/records/${encodeURIComponent(id)}/versions`))); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '이전 개정을 가져오지 못했습니다.'); }
    finally { setPending(false); }
  };
  return <details className="versions-section"><summary>저장된 개정 이력</summary><p className="subtle">이전 기록을 읽기 전용으로 확인합니다. 현재 공개본은 발행 이력의 자료 버전과 대조하세요.</p>{error && <ErrorNotice error={error} />}{versions === null ? <button className="button button-secondary button-small" type="button" onClick={() => void load()} disabled={pending}>{pending ? '불러오는 중…' : '이전 개정 불러오기'}</button> : !versions.length ? <p className="subtle">저장된 이전 개정이 없습니다.</p> : <div className="version-list">{versions.map((raw, index) => { const version = object(raw), pub = object(version.public), source = object(pub.source), dates = object(pub.dates); return <details className="version-item" key={label(pub.revision, String(index))}><summary>개정 {label(pub.revision)} · {time(version.updatedAt ?? pub.updatedAt)}</summary><Status value={version.status} /><h4>{label(pub.title)}</h4><p className="version-summary">{label(pub.summary)}</p><p className="subtle">날짜 {label(dates.display)} · {label(dates.precision)}</p>{safeUrl(source.url) && <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{label(source.name)} · 출처 ↗</a>}<details className="version-transcript"><summary>보존된 판독·번역</summary><label>이 개정의 판독문<textarea readOnly rows={5} value={label(pub.transcript, '')} /></label><label>이 개정의 번역문<textarea readOnly rows={5} value={label(pub.translation, '')} /></label></details></details>; })}</div>}</details>;
}
