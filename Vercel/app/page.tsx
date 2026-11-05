import Link from '@/components/static-link';
import { archive } from '@/lib/archive';
import { RecordGrid, Arrow } from '@/components/common';
import { displayDate } from '@/lib/labels';
import { routeId } from '@/lib/security';

export default function Home() {
  const data = archive();
  const newest = [...data.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const sources = new Set(data.records.map(record => record.source.name));
  return <>
    <section className="hero">
      <div className="hero-copy">
        <h1 className="sr-only">전쟁 아카이브</h1>
        <form className="hero-search" action="/archive/" role="search">
          <label htmlFor="home-search" className="search-label">자료 통합 검색</label>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input id="home-search" name="q" placeholder="전쟁, 인물, 기록을 검색하세요" />
          <button type="submit" aria-label="자료 검색">검색 <span aria-hidden="true">→</span></button>
        </form>
        <div className="search-suggestions"><span>바로 탐색</span>{data.wars.slice(0, 3).map(war => <Link key={war.id} href={`/wars/${routeId(war.id)}/`}>{war.name}</Link>)}<Link href="/archive/?type=photograph">사진 기록 ↗</Link></div>
      </div>
      <nav className="collection-index" aria-label="수록 전쟁 목록">
        <div className="index-label"><span>소장 분류</span><span aria-hidden="true">목록 / {String(data.wars.length).padStart(2, '0')}</span></div>
        {data.wars.map((war, index) => <Link key={war.id} href={`/wars/${routeId(war.id)}/`}><span className="index-number">{String(index + 1).padStart(2, '0')}</span><span className="index-name">{war.name}</span><span className="index-count">{data.records.filter(record => record.warIds.includes(war.id)).length.toLocaleString()}건</span><Arrow /></Link>)}
      </nav>
    </section>
    <section className="stats-strip" aria-label="공개 수록 현황"><div><strong>{data.records.length.toLocaleString()}</strong><span>공개 자료</span></div><div><strong>{data.wars.length.toLocaleString()}</strong><span>전쟁·분쟁</span></div><div><strong>{sources.size.toLocaleString()}</strong><span>수록 출처</span></div><Link href="/about/#coverage"><span className="status-dot" /><span>{data.releaseId === 'unpublished' ? '첫 공개본 준비 중' : `${displayDate(data.generatedAt)} 공개본`}<small>수집 범위와 한계 확인 ↗</small></span></Link></section>
    <section className="section"><div className="discovery-grid"><Link href="/wars/" className="discovery-card"><span className="discovery-number">01</span><span className="discovery-icon" aria-hidden="true">⊕</span><h3>전쟁으로 읽기</h3><p>배경과 사건, 사람과 자료를<br />하나의 흐름으로 살펴봐요.</p><span className="text-link">전쟁 탐색 <Arrow /></span></Link><Link href="/explore/" className="discovery-card"><span className="discovery-number">02</span><span className="discovery-icon" aria-hidden="true">⌖</span><h3>시간과 장소로 읽기</h3><p>언제, 어디에서 일어났을까요.<br />연표와 지도에서 기록을 연결해요.</p><span className="text-link">지도·연표 <Arrow /></span></Link><Link href="/collections/" className="discovery-card"><span className="discovery-number">03</span><span className="discovery-icon" aria-hidden="true">▥</span><h3>주제로 읽기</h3><p>하나의 질문에서 출발해<br />여러 기록을 함께 읽어요.</p><span className="text-link">주제별 모음 <Arrow /></span></Link></div></section>
    <section className="section"><div className="section-heading"><Link className="text-link" href="/archive/">자료실에서 더 보기 <Arrow /></Link></div><RecordGrid records={newest} /></section>
  </>;
}
