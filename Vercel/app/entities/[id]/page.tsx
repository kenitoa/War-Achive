import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { Claims, ExternalLink, RecordGrid, SectionTitle } from '@/components/common';
import { entityLabels } from '@/lib/labels';
import { routeId } from '@/lib/security';
export function generateStaticParams() { return publicParams(archive().entities); }
export const dynamicParams = false;
export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = archive(); const entity = data.entities.find(item => item.id === id); if (!entity) notFound(); return <><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/archive/">자료실</Link><span>/</span><span>{entityLabels[entity.type]}</span></nav><header className="detail-heading"><p className="eyebrow">CONNECTED RECORD / {entityLabels[entity.type]}</p><h1>{entity.name}</h1><p className="intro">{entity.summary}</p>{entity.sourceUrl && <p className="source-line">설명 출처: <ExternalLink href={entity.sourceUrl}>원문 확인</ExternalLink></p>}{entity.location && <p>{entity.location.name} · 위치 {entity.location.precision === 'exact' ? '확인' : '추정·범위'} ({entity.location.lat}, {entity.location.lon})</p>}<div className="tag-row">{data.wars.filter(war => entity.warIds.includes(war.id)).map(war => <Link className="tag" key={war.id} href={`/wars/${routeId(war.id)}/`}>{war.name} ↗</Link>)}</div></header><Claims data={data} subjectId={id} /><section className="section"><SectionTitle title="연결된 자료" /><RecordGrid records={data.records.filter(record => record.entityIds.includes(id))} /></section></>; }
