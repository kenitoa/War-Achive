import Link from '@/components/static-link';
import { PreviewImage } from './preview-image';
import type { PublicArchive, PublicRecord } from '@/lib/generated-contract';
import { dateLabels, kindLabels } from '@/lib/labels';
import { citationFragment, externalUrl, routeId } from '@/lib/security';

export function Arrow({ diagonal = false }: { diagonal?: boolean }) { return <span aria-hidden="true">{diagonal ? '↗' : '↗'}</span>; }
export function ExternalLink({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) {
  const url = externalUrl(href);
  return url ? <a href={url} className={className} target="_blank" rel="noopener noreferrer">{children} <span className="sr-only">(새 창)</span><Arrow diagonal /></a> : <span>{children} · 연결 정보 없음</span>;
}
export function SectionTitle({ eyebrow, title, href, linkText = '전체 보기' }: { eyebrow?: string; title: string; href?: string; linkText?: string }) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{href && <Link className="text-link" href={href}>{linkText} <Arrow /></Link>}</div>;
}
export function PageHeading({ index, title, intro }: { index: string; title: string; intro: string }) {
  return <header className="page-heading"><p className="eyebrow">{index}</p><h1>{title}</h1><p className="intro">{intro}</p></header>;
}
export function EmptyState({ title = '아직 공개된 자료가 없습니다', description = '자료가 수집·검수되어 다음 공개본에 포함되면 여기에 표시됩니다.', action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌕</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function RecordCard({ record, number, excerpt }: { record: PublicRecord; number?: number; excerpt?: string }) {
  const thumbnail = record.sensitivity === 'none' && record.media.displayAllowed && record.media.attribution ? externalUrl(record.media.thumbnailUrl) : undefined;
  return <article className="record-card"><div className={`record-visual visual-${record.kind}`}>{thumbnail ? <PreviewImage key={thumbnail} src={thumbnail} /> : <span className="visual-glyph" aria-hidden="true">{record.kind === 'photograph' ? '▧' : record.kind === 'map' ? '⌖' : record.kind === 'audio' ? '≋' : record.kind === 'video' ? '▷' : '▤'}</span>}<span className="visual-caption">{kindLabels[record.kind]}</span><span className="visual-id">{String(number ?? record.revision).padStart(3, '0')}</span></div><div className="record-body"><div className="meta-line"><span>{record.dates.display}</span><span>{record.language.toUpperCase()}</span></div><h3><Link href={`/archive/${routeId(record.id)}/`}>{record.title}</Link></h3><p className="clamp-3">{excerpt ?? record.summary}</p><div className="record-source"><span>{record.source.name}</span><Arrow /></div><div className="tag-row"><span className="tag">{record.media.originalUrl ? '원문 연결' : '소장처 기록'}</span>{record.dates.precision !== 'exact' && <span className="tag">{dateLabels[record.dates.precision]}</span>}{record.sensitivity === 'warning' && <span className="tag warning">열람 주의</span>}</div>{thumbnail && record.media.attribution && <p className="card-attribution">{record.media.attribution.creator} · <ExternalLink href={record.media.attribution.licenseUrl}>{record.media.attribution.license}</ExternalLink></p>}</div></article>;
}
export function RecordGrid({ records }: { records: PublicRecord[] }) {
  return records.length ? <div className="record-grid">{records.map((record, index) => <RecordCard key={record.id} record={record} number={index + 1} />)}</div> : <EmptyState />;
}

export function Claims({ data, subjectId }: { data: PublicArchive; subjectId: string }) {
  const claims = data.claims?.filter(claim => claim.public && claim.subjectId === subjectId) ?? [];
  if (!claims.length) return null;
  return <section className="claims-section" id="claims"><p className="eyebrow">CLAIMS & EVIDENCE</p><h2>출처별 주장과 수치</h2><p className="fine-print">각 출처가 제시하는 내용입니다. 집계 대상·기간·지역이 다르면 직접 비교할 수 없으며 수치를 평균 내어 대표값으로 만들지 않습니다.</p><div className="claims-scroll"><table className="claims-table"><caption className="sr-only">출처별 주장, 집계 범위, 근거</caption><thead><tr><th scope="col">주장·값</th><th scope="col">적용 범위</th><th scope="col">근거 출처</th><th scope="col">검토 상태</th></tr></thead><tbody>{claims.map(claim => <tr key={claim.id}><td>{claim.statement}{claim.value && <small>{claim.value} {claim.unit}</small>}</td><td>{claim.scope.population && <small>대상: {claim.scope.population}</small>}{claim.scope.period && <small>기간: {claim.scope.period}</small>}{claim.scope.region && <small>지역: {claim.scope.region}</small>}{!claim.scope.population && !claim.scope.period && !claim.scope.region && '범위 미등록'}</td><td><ExternalLink href={citationFragment(claim.source.url, claim.source.page, claim.source.timecode)}>{claim.source.label}</ExternalLink>{claim.source.page && <small>{claim.source.page}쪽</small>}{claim.source.timecode && <small>{claim.source.timecode}</small>}</td><td>{claim.status === 'reported' ? '출처의 보고' : claim.status === 'supported' ? '근거 검토' : '상충·논쟁 있음'}</td></tr>)}</tbody></table></div></section>;
}
