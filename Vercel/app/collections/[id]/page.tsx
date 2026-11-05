import { Suspense } from 'react';
import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive } from '@/lib/archive';
import { PageHeading, SectionTitle } from '@/components/common';
import { Chapters, GuideCards, ReadingQuestions, ReferenceList, RoomOverview } from '@/components/reading-room';
import { GuideRecords } from '@/components/guide-records';
import { readingGuides, guideById, guideRecords } from '@/lib/editorial';
import { routeId } from '@/lib/security';

export function generateStaticParams() {
  const ids = [...new Set([...archive().collections.map(collection => collection.id), ...readingGuides.map(guide => guide.id)])];
  return ids.map(id => ({ id }));
}
export const dynamicParams = false;
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = archive();
  const collection = data.collections.find(item => item.id === id);
  // Published collection routes always retain their original meaning.
  const guide = collection ? undefined : guideById(id);
  if (!collection && !guide) notFound();
  const records = collection ? collection.recordIds.flatMap(recordId => { const record = data.records.find(item => item.id === recordId); return record ? [record] : []; }) : guideRecords(guide!, data.records);
  const title = collection?.title ?? guide!.title;
  return <div className="reading-room"><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/collections/">주제별 모음</Link><span>/</span><span>{title}</span></nav><PageHeading index={guide ? `${guide.category} / 편집 읽기 경로` : '공개본 / 발행 모음'} title={title} intro={collection?.summary ?? guide!.deck} /><RoomOverview items={[{ label: '연결된 자료', value: records.length, detail: '현재 공개본을 기준으로 표시해요' }, { label: '연결된 전쟁', value: new Set(records.flatMap(record => record.warIds)).size, detail: '전쟁별 필터로 좁힐 수 있어요' }, { label: '구성', value: guide ? '해설 + 질문 + 자료' : '발행된 자료 목록', detail: guide ? '편집 안내는 원자료와 구분해요' : '원래의 연결 관계를 보존해요' }]} />{guide && <><nav className="room-tabs" aria-label="읽기 경로 목차"><a href="#reading">읽기 안내</a><a href="#guide-records">자료 열람</a><a href="#further-reading">이어서 읽기</a></nav><section id="reading" className="section"><SectionTitle eyebrow="편집자의 읽기 안내" title="세 가지 관찰의 실마리" /><Chapters chapters={guide.chapters} /></section><ReadingQuestions questions={guide.questions} /><ReferenceList ids={guide.sourceIds} /><p className="notice">연결 기준: {guide.keywords.length ? `제목·주제어에 ${guide.keywords.join(', ')} 중 하나가 포함된 자료` : '공개본의 자료 유형'}. 이 연결은 탐색 후보이며 내용의 역사적 관련성을 개별 검증했다는 뜻은 아니에요.</p></>}{collection && <div className="tag-row">{collection.topics.map(topic => <span className="tag" key={topic}>{topic}</span>)}</div>}{collection && !records.length && <p className="notice">이 발행 모음에는 아직 연결된 자료가 없어요. <Link href="/collections/">편집 읽기 경로</Link>나 <Link href="/archive/">전체 자료실</Link>에서 공개 기록을 살펴볼 수 있어요.</p>}<Suspense fallback={<p role="status">자료 목록을 준비하고 있어요…</p>}><GuideRecords records={records} wars={data.wars} path={`/collections/${routeId(id)}/`} /></Suspense><section className="section" id="further-reading"><SectionTitle title="이어서 읽기" /><GuideCards data={data} ids={readingGuides.filter(item => item.id !== id).slice(0, 3).map(item => item.id)} /></section></div>;
}
