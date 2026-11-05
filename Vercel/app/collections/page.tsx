import Link from '@/components/static-link';
import { archive } from '@/lib/archive';
import { SectionTitle, Arrow } from '@/components/common';
import { GuideCards, RoomOverview } from '@/components/reading-room';
import { readingGuides } from '@/lib/editorial';
import { routeId } from '@/lib/security';

export const metadata = { title: '주제별 모음' };
export default function CollectionsPage() {
  const data = archive();
  const sharedSummary = data.collections.length > 1 && data.collections.every(collection => collection.summary === data.collections[0].summary) ? data.collections[0].summary : undefined;
  return <div className="reading-room collections-page">
    <header className="page-heading"><p className="eyebrow">자료 분류 / 주제</p><h1>주제별 모음</h1></header>
    <RoomOverview items={[{ label: '주제별 모음', value: readingGuides.length, detail: '주제 해설·질문·자료 목록' }, { label: '공개 자료', value: data.records.length, detail: '주제 간 자료 중복 포함' }, { label: '분석 순서', value: '관찰 · 대조 · 기록', detail: '원문과 해석 구분' }]} />
    <nav className="room-tabs" aria-label="모음 바로가기"><a href="#themes">주제 분류</a><a href="#methods">자료 분석</a><a href="#published">발행된 모음</a></nav>
    <section id="themes" className="section"><SectionTitle eyebrow="주제별 열람" title="주제별 자료" /><GuideCards data={data} ids={readingGuides.filter(guide => guide.category !== '자료 읽기').map(guide => guide.id)} /></section>
    <section id="methods" className="section"><SectionTitle eyebrow="자료 활용" title="자료 분석" /><GuideCards data={data} ids={['reading-photographs', 'reading-documents']} /></section>
    <section className="section collection-policy"><SectionTitle title="분류 기준" /><dl className="collection-policy-list">
      <div><dt>콘텐츠 구분</dt><dd><ul><li><strong>해설·질문</strong><span>편집 콘텐츠</span></li><li><strong>자료명·설명·권리·검수 상태</strong><span>공개본 기준</span></li></ul></dd></div>
      <div><dt>분류 방식</dt><dd><ul><li><strong>제목·주제어</strong><span>주제별 연결 기준</span></li><li><strong>역사적 관련성</strong><span>개별 자료의 소장처 설명에서 확인</span></li></ul></dd></div>
      <div><dt>자료 수</dt><dd><ul><li><strong>중복 포함</strong><span>하나의 자료를 여러 모음에 연결</span></li><li><strong>건수 합계</strong><span>모음별 합계와 전체 자료 수가 다를 수 있음</span></li></ul></dd></div>
    </dl></section>
    <section id="published" className="section"><SectionTitle title="발행된 모음" />
      {sharedSummary && <div className="published-scope"><h3>공통 수록 범위</h3><p>{sharedSummary}</p></div>}
      <div className="published-collections">{data.collections.map(collection => <article key={collection.id}><div><h3><Link href={`/collections/${routeId(collection.id)}/`}>{collection.title} <Arrow /></Link></h3>{!sharedSummary && <p>{collection.summary}</p>}</div><span className="published-count">{collection.recordIds.length ? `자료 ${collection.recordIds.length}건` : '연결 자료 없음'}</span></article>)}</div>
      {!data.collections.length && <p className="notice">현재 공개본에 발행된 모음이 없어요.</p>}
    </section>
  </div>;
}
