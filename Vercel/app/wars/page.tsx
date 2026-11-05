import Link from '@/components/static-link';
import { archive } from '@/lib/archive';
import { EmptyState, Arrow } from '@/components/common';
import { dossierFor, readingGuides } from '@/lib/editorial';
import { routeId } from '@/lib/security';

export const metadata = { title: '탐색' };
export default function WarsPage() {
  const data = archive();
  return <div className="reading-room war-finder">
    <header className="page-heading"><div><p className="eyebrow">WAR ARCHIVE / INDEX</p><h1>탐색</h1></div><p className="finder-total">전쟁·분쟁 <strong>{data.wars.length}</strong><span>공개 자료 <strong>{data.records.length}</strong></span></p></header>
    <section className="finder-wars" aria-label="전쟁별 탐색">{data.wars.map(war => {
      const dossier = dossierFor(war.id);
      const count = data.records.filter(record => record.warIds.includes(war.id)).length;
      return <article className={`finder-war finder-${war.id}`} key={war.id}>
        <div className="finder-war-heading"><p>{war.period}<span>{war.regions.join(' / ')}</span></p><h2><Link href={`/wars/${routeId(war.id)}/`}>{war.name}<Arrow /></Link></h2><Link className="finder-record-count" href={`/archive/?war=${routeId(war.id)}`}>자료 {count}건 →</Link></div>
        <div className="finder-events"><span className="finder-label">주요 전환점</span><ul>{dossier?.events.map(event => <li key={event.date}><Link href={`/wars/${routeId(war.id)}/#chronology`}><time>{event.date}</time><span>{event.title}</span></Link></li>)}</ul></div>
      </article>;
    })}</section>
    {!data.wars.length && <EmptyState title="전쟁별 기록을 준비하고 있어요" />}
    <nav className="finder-topics" aria-label="주제별 탐색"><h2>주제별 탐색</h2><div>{readingGuides.map(guide => <Link key={guide.id} href={`/collections/${routeId(guide.id)}/`}>{guide.title}<span aria-hidden="true">↗</span></Link>)}</div></nav>
    <div className="finder-utilities"><Link href="/archive/">전체 자료실 ↗</Link><Link href="/explore/">지도·연표 ↗</Link><Link href="/entities/">기록 사전 ↗</Link><Link href="/about/#coverage">수집 범위 ↗</Link></div>
  </div>;
}
