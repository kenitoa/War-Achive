import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { Claims, RecordGrid, SectionTitle, ExternalLink } from '@/components/common';
import { entityLabels } from '@/lib/labels';
import { routeId } from '@/lib/security';
export function generateStaticParams() { return publicParams(archive().wars); }
export const dynamicParams = false;
export default async function WarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const data = archive(); const war = data.wars.find(item => item.id === id); if (!war) notFound();
  const records = data.records.filter(record => record.warIds.includes(id)); const entities = data.entities.filter(entity => entity.warIds.includes(id));
  const events = entities.filter(entity => entity.type === 'event');
  return <><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/wars/">전쟁 탐색</Link><span>/</span><span>{war.name}</span></nav><header className="detail-heading"><p className="eyebrow">WAR & CONTEXT / {war.period}</p><h1>{war.name}</h1><div className="tag-row">{war.aliases.map(alias => <span key={alias} className="tag">{alias}</span>)}</div><p className="intro">{war.summary}</p><p className="source-line">개요 출처: <ExternalLink href={war.sourceUrl}>원문 확인</ExternalLink></p><div className="button-row"><Link className="button" href={`/archive/?war=${routeId(war.id)}`}>관련 자료 {records.length}건 ↗</Link><Link className="button secondary" href={`/explore/?war=${routeId(war.id)}`}>지도·연표로 보기</Link></div></header><div className="context-summary"><div><span>기간</span><strong>{war.period}</strong></div><div><span>관련 지역</span><strong>{war.regions.join(', ') || '추가 조사 중'}</strong></div><div><span>공개 자료</span><strong>{records.length}건</strong></div><div><span>연결된 대상</span><strong>{entities.length}건</strong></div></div><Claims data={data} subjectId={id} /><section className="section"><SectionTitle title="관련 사건·사람·장소" eyebrow="CONNECTIONS" />{entities.length ? <div className="entity-grid">{entities.map(entity => <Link className="entity-card" key={entity.id} href={`/entities/${routeId(entity.id)}/`}><span className="eyebrow">{entityLabels[entity.type]}</span><h3>{entity.name} ↗</h3><p>{entity.summary}</p></Link>)}</div> : <p className="notice">사건·인물·조직의 별도 기록은 아직 공개되지 않았습니다. 원자료에 명시된 정보를 우선 제공합니다.</p>}{events.length > 0 && <p className="fine-print">관련 사건은 확인된 기록 범위이며 전쟁 전체의 연표를 의미하지 않습니다.</p>}</section><section className="section"><SectionTitle title="관련 기록" eyebrow="SOURCE MATERIALS" href={`/archive/?war=${routeId(id)}`} /><RecordGrid records={records.slice(0, 6)} /></section><p className="notice">피해 규모와 원인·책임에 관한 종합 설명은 근거를 확인한 뒤 추가합니다. 수록 자료는 생산 주체와 작성 시점에 따른 관점을 가질 수 있습니다.</p></>;
}
