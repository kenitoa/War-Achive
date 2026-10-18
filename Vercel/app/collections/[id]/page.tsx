import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { PageHeading, RecordGrid } from '@/components/common';
export function generateStaticParams() { return publicParams(archive().collections); }
export const dynamicParams = false;
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = archive(); const collection = data.collections.find(item => item.id === id); if (!collection) notFound(); return <><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/collections/">주제별 모음</Link><span>/</span><span>{collection.title}</span></nav><PageHeading index="CURATED COLLECTION" title={collection.title} intro={collection.summary} /><div className="tag-row">{collection.topics.map(topic => <span className="tag" key={topic}>{topic}</span>)}</div><p className="notice">이 모음은 편집한 자료 탐색 경로입니다. 각 기록의 원 소장처·권리·검수 상태는 상세 페이지에서 확인하세요.</p><RecordGrid records={collection.recordIds.flatMap(recordId => { const record = data.records.find(item => item.id === recordId); return record ? [record] : []; })} /></>; }
