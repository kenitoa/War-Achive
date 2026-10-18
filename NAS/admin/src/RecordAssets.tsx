import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, label, list, object, safeUrl, time } from './api';
import { Check, ErrorNotice, Status } from './components';

type Action = (operation: () => Promise<unknown>, success: string) => Promise<void>;
const acceptedTypes = ['text/plain', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'audio/wav', 'video/mp4'];

async function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('선택한 파일을 읽지 못했습니다. 파일 상태를 확인해 주세요.'));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== 'string' || !value.includes(',')) { reject(new Error('파일을 업로드 형식으로 변환하지 못했습니다.')); return; }
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

function AssetRights({ recordId, asset, busy, action }: { recordId: string; asset: Record<string, unknown>; busy: boolean; action: Action }) {
  const [statement, setStatement] = useState(label(asset.rightsAttestation, ''));
  const [allowed, setAllowed] = useState(asset.publishDerivatives === true);
  const [error, setError] = useState('');
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (statement.trim().length < 20) { setError('확인한 권리의 근거를 20자 이상 기록하세요.'); return; }
    setError('');
    await action(() => api.request(`/records/${encodeURIComponent(recordId)}/assets/${encodeURIComponent(label(asset.id))}/rights`, { method: 'PATCH', body: { rightsAttestation: statement.trim(), publishDerivatives: allowed } }), '파일의 공개 권리 설정을 저장했습니다. 공개본과 미디어 반영은 작업 이력에서 확인하세요.');
  };
  return <details className="asset-rights-edit"><summary>이 파일의 공개 권리 검토·변경</summary><form onSubmit={(event) => void save(event)}><label>검토한 권리 근거<textarea required minLength={20} maxLength={4000} rows={3} value={statement} onChange={(event) => setStatement(event.target.value)} disabled={busy} /></label><Check checked={allowed} onChange={setAllowed} disabled={busy}>이 파일에서 생성한 파생물의 공개를 허용합니다.</Check><p className="subtle">공개는 자료 검수·민감성 검사·공개 저장소 설정을 통과한 뒤 진행합니다. 허용을 취소한 경우 공개본과 미디어의 철회 반영을 확인하세요.</p>{error && <p className="inline-warning" role="alert">{error}</p>}<button className="button button-secondary button-small" type="submit" disabled={busy || statement.trim().length < 20}>권리 검토 저장</button></form></details>;
}

export default function RecordAssets({ id, busy, action, role }: { id: string; busy: boolean; action: Action; role: string }) {
  const [assets, setAssets] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rightsAttestation, setRightsAttestation] = useState('');
  const [publishDerivatives, setPublishDerivatives] = useState(false);
  const [objectStorage, setObjectStorage] = useState(false);
  const [reading, setReading] = useState(false);
  const canUpload = role === 'admin' || role === 'editor';
  const canReview = role === 'admin' || role === 'reviewer';
  const canPublishOnUpload = role === 'admin';
  useEffect(() => {
    let current = true;
    void Promise.allSettled([api.request(`/records/${encodeURIComponent(id)}/assets`), api.request('/settings')]).then(([files, settings]) => {
      if (!current) return;
      if (files.status === 'fulfilled') setAssets(list(files.value));
      else setError(files.reason instanceof Error ? files.reason.message : '보존 파일 목록을 가져오지 못했습니다.');
      if (settings.status === 'fulfilled') setObjectStorage(object(settings.value).objectStorageConfigured === true);
      setLoading(false);
    });
    return () => { current = false; };
  }, [id]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (!canUpload) { setError('원본 등록에는 편집자 권한이 필요합니다.'); return; }
    if (!file || !acceptedTypes.includes(file.type) || file.size === 0 || file.size > 16 * 1024 * 1024) { setError('허용한 형식의 0바이트 초과·16MiB 이하 파일을 선택하세요.'); return; }
    if (rightsAttestation.trim().length < 20) { setError('자료의 보존·처리 권한과 공개 범위를 20자 이상 구체적으로 기록해 주세요.'); return; }
    setReading(true);
    try {
      const data = await base64(file);
      await action(() => api.request(`/records/${encodeURIComponent(id)}/assets`, { method: 'POST', body: { data, mimeType: file.type, filename: file.name, rightsAttestation: rightsAttestation.trim(), publishDerivatives: canPublishOnUpload && objectStorage && publishDerivatives } }), '원본 보존 파일을 등록했습니다. 제작 작업과 검수 상태를 확인하세요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '파일을 준비하지 못했습니다.'); }
    finally { setReading(false); }
  };
  const pending = busy || reading;
  const products = new Map<string, Record<string, unknown>>();
  const steps = new Map<string, Record<string, unknown>>();
  for (const asset of assets) {
    const production = object(object(asset).production);
    for (const raw of list(production.files)) { const file = object(raw); products.set(label(file.sha256, label(file.kind)), file); }
    for (const raw of list(production.steps)) { const step = object(raw); steps.set(`${label(step.operation)}-${label(step.status)}`, step); }
  }
  return <details className="asset-section"><summary>원본 보존·열람 자료 제작 ({assets.length}개 파일)</summary><p className="subtle">선택한 파일의 원본은 NAS의 비공개 저장소에 보존합니다. 판독·미리보기 등 파생물의 생성 결과와 공개 상태는 별도로 확인합니다.</p>
    {!canUpload && <p className="subtle">현재 권한에서는 원본 등록·제작을 실행할 수 없습니다. 검수자는 기존 파일의 공개 권리를 별도로 검토할 수 있습니다.</p>}
    {canUpload && !canPublishOnUpload && <p className="subtle">편집자는 원본을 비공개로 등록합니다. 파생물 공개 권한은 검수자가 기존 파일의 권리 검토에서 별도로 승인합니다.</p>}
    {error && <ErrorNotice error={error} />}
    {loading ? <p className="subtle">보존 파일을 확인하고 있습니다…</p> : !assets.length ? <p className="subtle">등록된 보존 파일이 없습니다. 수집 출처 링크의 원문을 임의로 복제하지 않고, 권한을 확인한 파일을 등록하세요.</p> : <div className="asset-list">{assets.map((raw, index) => { const item = object(raw); return <article className="asset-item" key={label(item.id, String(index))}><strong>{label(item.filename ?? item.kind ?? item.role, '보존 파일')}</strong><span>{label(item.mimeType)} · {typeof item.sizeBytes === 'number' ? `${(item.sizeBytes / 1024).toFixed(1)} KiB` : typeof item.bytes === 'number' ? `${(item.bytes / 1024).toFixed(1)} KiB` : '용량 확인 중'}</span><small>등록 {time(item.createdAt)}</small><small>SHA-256 {label(item.sha256).slice(0, 24)}…</small><Status value={item.status} />{canReview && <AssetRights recordId={id} asset={item} busy={busy} action={action} />}{typeof item.rightsAttestation === 'string' && <details className="asset-rights"><summary>권리 근거 진술</summary><p>{item.rightsAttestation}</p></details>}<span className="status">비공개 원본 보존</span></article>; })}</div>}
    {products.size > 0 && <div className="production-results"><h4>실제 제작 결과</h4><div className="asset-list">{[...products].map(([hash, item]) => <article className="asset-item" key={hash}><strong>{label(item.kind)} · {label(item.mimeType)}</strong><small>SHA-256 {hash.slice(0, 24)}…</small>{safeUrl(item.url) ? <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">공개 파생물 확인 ↗</a> : <span className="subtle">NAS에 비공개 보존</span>}</article>)}</div>{[...steps].map(([key, step]) => <div className="production-step" key={key}><span>{label(step.operation)}</span><Status value={step.status} /></div>)}</div>}
    <form className="asset-upload" onSubmit={(event) => void upload(event)}><label>보존할 파일 · 최대 16MiB<input type="file" accept={acceptedTypes.join(',')} required disabled={pending || !canUpload} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} /></label><label>보존·처리·공개 권한의 근거<textarea required minLength={20} maxLength={4000} rows={3} disabled={!canUpload || pending} value={rightsAttestation} onChange={(event) => setRightsAttestation(event.target.value)} placeholder="권리자·허락 근거·허용된 처리와 공개 범위를 구체적으로 기록하세요." /></label><Check checked={publishDerivatives} onChange={setPublishDerivatives} disabled={!objectStorage || pending || !canPublishOnUpload}>생성한 파생물을 공개 미디어 저장소에 발행하도록 허용합니다.</Check>{!objectStorage && <p className="subtle">공개 미디어 저장소가 연결되지 않아 비공개로 처리합니다.</p>}<button className="button button-secondary" type="submit" disabled={pending || !canUpload || !file || rightsAttestation.trim().length < 20}>{reading ? '파일 준비 중…' : '선택한 파일 보존 등록'}</button></form>
    <div className="production-action"><div><strong>등록 파일로 열람 자료 제작</strong><p className="subtle">지원되는 형식의 판독·미리보기 제작 작업을 대기열에 등록합니다. 제작 결과는 검토 초안으로 확인합니다.</p></div><button className="button button-secondary button-small" type="button" disabled={pending || !canUpload || !assets.length} onClick={() => void action(() => api.request(`/records/${encodeURIComponent(id)}/produce`, { method: 'POST' }), '자료 제작 요청을 접수했습니다. 결과는 작업 이력과 자료 상세에서 확인하세요.')}>제작 작업 요청</button></div>
  </details>;
}
