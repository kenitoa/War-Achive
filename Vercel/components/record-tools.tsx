'use client';
import Link from '@/components/static-link';
import Image from 'next/image';
import { useState } from 'react';
import type { PublicRecord } from '@/lib/generated-contract';
import { shelfCitation } from '@/lib/shelf';
import { externalUrl } from '@/lib/security';
import { saveShelf, useShelf } from './shelf-store';
import { ExternalLink } from './common';

export function RecordTools({ record }: { record: PublicRecord }) {
  const shelf = useShelf(); const [message, setMessage] = useState('');
  const saved = shelf.document.items.some(item => item.recordId === record.id);
  const citation = shelfCitation(record.title, record.source.name, record.source.identifier, record.source.url, record.source.accessedAt);
  function toggle() {
    try {
      const items = saved ? shelf.document.items.filter(item => item.recordId !== record.id) : [...shelf.document.items, { recordId: record.id, savedAt: new Date().toISOString(), note: '', collectionIds: [] }];
      saveShelf({ ...shelf.document, items }); setMessage(saved ? '서재에서 제거했습니다.' : '이 브라우저의 서재에 저장했습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
  }
  async function copyCitation() {
    try { await navigator.clipboard.writeText(citation); setMessage('출처 인용 정보를 복사했습니다.'); }
    catch { setMessage('자동 복사가 허용되지 않았습니다. 아래 인용문을 선택해서 복사해 주세요.'); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setMessage('현재 주소를 복사했습니다.'); }
    catch { setMessage('주소 표시줄의 링크를 복사해 주세요.'); }
  }
  return <div className="record-tools"><div className="button-row"><button className="button" type="button" onClick={toggle} disabled={shelf.status !== 'ready'} aria-pressed={saved}>{saved ? '✓ 서재에 저장됨' : '+ 내 서재에 저장'}</button><button className="button secondary" onClick={copyCitation} type="button">인용 복사</button><button className="button secondary" onClick={share} type="button">링크 복사</button><Link className="text-link" href={`/shelf/?compare=${encodeURIComponent(record.id)}`}>자료 비교 ↗</Link></div>{shelf.status === 'corrupt' && <p className="notice warning">이 브라우저의 서재가 손상되어 저장을 중지했습니다. <Link href="/shelf/">내 서재에서 복구</Link>할 수 있습니다.</p>}{shelf.status === 'unavailable' && <p className="notice">브라우저 저장소를 사용할 수 없습니다. 서재를 사용하려면 사이트의 저장 권한을 확인하세요.</p>}<p className="status-message" role="status">{message}</p><details className="citation-box"><summary>인용 정보 펼치기</summary><p>{citation}</p><p className="fine-print">자료의 작성자·작성일·청구기호와 구간 정보를 원 소장처에서 추가 확인해 주세요.</p></details></div>;
}

export function RecordMedia({ record }: { record: PublicRecord }) {
  const [revealed, setRevealed] = useState(record.sensitivity !== 'warning');
  const [mediaError, setMediaError] = useState(false);
  const allowedOriginal = record.rights.downloadAllowed || record.rights.reuseAllowed;
  const thumbnail = record.media.displayAllowed && record.media.attribution ? externalUrl(record.media.thumbnailUrl) : undefined;
  const url = allowedOriginal ? externalUrl(record.media.originalUrl) : undefined;
  const isVideo = record.media.mimeType?.startsWith('video/');
  const isAudio = record.media.mimeType?.startsWith('audio/');
  const isImage = record.media.mimeType?.startsWith('image/');
  const image = thumbnail ?? (isImage ? url : undefined);
  if (!revealed) return <div className="sensitivity-gate"><span aria-hidden="true">!</span><h2>열람에 주의가 필요한 자료입니다</h2><p>전쟁 피해나 강한 이미지가 포함될 수 있습니다. 자료의 설명과 출처를 먼저 확인할 수 있습니다.</p><button type="button" className="button secondary" onClick={() => setRevealed(true)}>자료 열람 영역 표시</button></div>;
  if (mediaError) return <div className="record-media media-unavailable"><div className="source-placeholder"><span className="document-outline" aria-hidden="true">▧</span><h2>외부 자료를 불러오지 못했습니다</h2><p>소장처의 요청 제한이나 연결 상태에 따라 열람이 지연될 수 있습니다.<br />자료의 출처와 이용 조건은 아래에 그대로 제공됩니다.</p><div className="button-row"><ExternalLink className="button secondary" href={record.source.url}>소장처에서 자료 확인</ExternalLink><button type="button" className="button secondary" onClick={() => setMediaError(false)}>다시 불러오기</button></div></div></div>;
  return <div className="record-media">{url && isVideo ? <video controls preload="metadata" poster={thumbnail} src={url} onError={() => setMediaError(true)} aria-label={record.title}><track kind="captions" />이 브라우저는 영상 재생을 지원하지 않습니다.</video> : url && isAudio ? <audio controls preload="metadata" src={url} onError={() => setMediaError(true)} aria-label={record.title}>이 브라우저는 음성 재생을 지원하지 않습니다.</audio> : image ? <div className="media-image"><Image src={image} alt={record.title} width={1200} height={900} style={{ width: "auto", height: "auto" }} loading="lazy" unoptimized referrerPolicy="no-referrer" onError={() => setMediaError(true)} /></div> : <div className="source-placeholder"><span className="document-outline" aria-hidden="true">▤</span><p className="eyebrow">SOURCE REFERENCE</p><h2>소장처에서 원자료를 확인하세요</h2><p>이 공개본은 자료의 서지정보와 출처를 제공합니다.<br />현재 아카이브에서 제공하는 열람용 파일은 없습니다.</p></div>}{record.sensitivity === 'warning' && <button type="button" className="button secondary small" onClick={() => setRevealed(false)}>열람 영역 다시 가리기</button>}</div>;
}

export function RecordAttribution({ record }: { record: PublicRecord }) {
  const attribution = record.media.attribution;
  if (!attribution) return null;
  return <div className="media-attribution"><p>제작자: {attribution.creator}</p>{attribution.credit && <p>제공·출처: {attribution.credit}</p>}<p>이용 조건: <ExternalLink href={attribution.licenseUrl}>{attribution.license}</ExternalLink></p><p>원본의 판독·번역과 별도로 열람용 크기 조정이 적용될 수 있습니다.</p></div>;
}
