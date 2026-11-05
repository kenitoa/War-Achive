import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { Claims, RecordGrid, SectionTitle, ExternalLink } from '@/components/common';
import { DossierContent, GuideCards } from '@/components/reading-room';
import { dossierFor } from '@/lib/editorial';
import { entityLabels, kindLabels } from '@/lib/labels';
import { routeId } from '@/lib/security';

export function generateStaticParams() { return publicParams(archive().wars); }
export const dynamicParams = false;
export default async function WarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = archive();
  const war = data.wars.find(item => item.id === id);
  if (!war) notFound();
  const dossier = dossierFor(id);
  const records = data.records.filter(record => record.warIds.includes(id));
  const entities = data.entities.filter(entity => entity.warIds.includes(id));
  const kinds = [...new Set(records.map(record => record.kind))];
  return <div className="reading-room"><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/wars/">전쟁 탐색</Link><span>/</span><span>{war.name}</span></nav><header className="detail-heading war-detail-heading"><p className="eyebrow">전쟁과 맥락 / {war.period}</p><h1>{war.name}</h1>{dossier && <p className="detail-subtitle">{dossier.subtitle}</p>}<div className="tag-row">{war.aliases.map(alias => <span key={alias} className="tag">{alias}</span>)}</div><p className="intro">{dossier?.introduction ?? war.summary}</p><div className="button-row"><Link className="button" href={`/archive/?war=${routeId(id)}`}>관련 자료 {records.length}건 ↗</Link><Link className="button secondary" href={`/explore/?war=${routeId(id)}`}>지도·연표로 보기</Link></div></header><div className="context-summary"><div><span>기간</span><strong>{war.period}</strong></div><div><span>관련 지역</span><strong>{war.regions.join(', ') || '추가 조사 중'}</strong></div><div><span>공개 자료</span><strong>{records.length}건</strong></div><div><span>연결된 대상</span><strong>{entities.length}건</strong></div></div><nav className="room-tabs" aria-label="전쟁 상세 목차">{dossier && <><a href="#context">맥락 읽기</a><a href="#chronology">주요 연표</a></>}<a href="#connections">연결된 대상</a><a href="#materials">원자료</a></nav>{dossier && <DossierContent dossier={dossier} />}<Claims data={data} subjectId={id} /><section className="section" id="connections"><SectionTitle title="관련 사건·사람·장소" eyebrow="연결된 대상" />{entities.length ? <div className="entity-grid">{entities.map(entity => <Link className="entity-card" key={entity.id} href={`/entities/${routeId(entity.id)}/`}><span className="eyebrow">{entityLabels[entity.type]}</span><h3>{entity.name} ↗</h3><p>{entity.summary}</p></Link>)}</div> : <p className="notice">현재 공개본에는 별도로 등록된 사건·인물·장소 항목이 없어요. 자료 상세에서 원 소장처가 제공한 정보를 확인할 수 있어요.</p>}</section><section className="section" id="materials"><SectionTitle title="원자료에서 확인하기" eyebrow="공개 기록" href={`/archive/?war=${routeId(id)}`} linkText={`전체 ${records.length}건`} /><div className="material-types">{kinds.map(kind => <Link key={kind} href={`/archive/?war=${routeId(id)}&type=${kind}`}><span>{kindLabels[kind]}</span><strong>{records.filter(record => record.kind === kind).length}</strong><span aria-hidden="true">↗</span></Link>)}</div><RecordGrid records={records.slice(0, 6)} /></section>{dossier && <section className="section"><SectionTitle title="주제로 이어 읽기" /><GuideCards data={data} ids={dossier.guideIds} /></section>}<details className="publication-note"><summary>공개본의 원래 개요와 출처</summary><p>{war.summary}</p><p><ExternalLink href={war.sourceUrl}>개요 출처 확인</ExternalLink></p></details></div>;
}
