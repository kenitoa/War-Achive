import Link from './static-link';
import { Arrow, ExternalLink } from './common';
import { references, readingGuides, guideRecords, type Chapter, type WarDossier } from '@/lib/editorial';
import type { PublicArchive } from '@/lib/generated-contract';
import { routeId } from '@/lib/security';

export function ReferenceList({ ids }: { ids: string[] }) {
  return <aside className="editorial-sources"><h3>해설의 근거와 더 읽기</h3><p>아래 기관의 공개 해설을 참고한 편집 글이에요. 원자료의 설명·검수 상태와 구분해 읽어주세요.</p><ul>{references.filter(source => ids.includes(source.id)).map(source => <li key={source.id}><span>{source.publisher}</span><ExternalLink href={source.url}>{source.title}</ExternalLink></li>)}</ul></aside>;
}

export function Chapters({ chapters }: { chapters: Chapter[] }) {
  return <div className="chapter-grid">{chapters.map((chapter, index) => <article className="reading-chapter" key={chapter.title}><span className="chapter-number">{String(index + 1).padStart(2, '0')}</span><h3>{chapter.title}</h3><p>{chapter.body}</p></article>)}</div>;
}

export function ReadingQuestions({ questions }: { questions: string[] }) {
  return <aside className="reading-questions"><div><span className="eyebrow">열람 노트</span><h2>기록 옆에 남길 질문</h2><Link className="text-link" href="/shelf/">내 서재에서 메모하기 <Arrow /></Link></div><ol>{questions.map(question => <li key={question}>{question}</li>)}</ol></aside>;
}

export function DossierContent({ dossier }: { dossier: WarDossier }) {
  return <><section className="section" id="context"><div className="section-heading"><div><p className="eyebrow">맥락 읽기 · 편집 해설</p><h2>{dossier.subtitle}</h2></div></div><Chapters chapters={dossier.chapters} /></section><section className="section" id="chronology"><div className="section-heading"><div><p className="eyebrow">역사의 전환점</p><h2>흐름으로 읽는 연표</h2></div></div><p className="editorial-caption">기관 해설을 바탕으로 정리한 주요 국면이에요. 아래 시점에 해당하는 원자료가 모두 수록되어 있다는 의미는 아니에요.</p><ol className="context-timeline">{dossier.events.map(event => <li key={event.date}><time>{event.date}</time><div><h3>{event.title}</h3><p>{event.body}</p><ExternalLink href={references.find(source => source.id === event.sourceId)?.url}>근거 읽기</ExternalLink></div><Link className="period-link" href={`/explore/?war=${routeId(dossier.warId)}&from=${event.year}&to=${event.year}#record-explorer`}>{event.year}년 자료 탐색 <Arrow /></Link></li>)}</ol></section><ReadingQuestions questions={dossier.questions} /><ReferenceList ids={dossier.sourceIds} /></>;
}

export function GuideCards({ data, ids }: { data: PublicArchive; ids?: string[] }) {
  const guides = ids ? readingGuides.filter(guide => ids.includes(guide.id)) : readingGuides;
  return <div className="guide-grid">{guides.map((guide, index) => {
    const records = guideRecords(guide, data.records);
    const wars = new Set(records.flatMap(record => record.warIds));
    return <Link key={guide.id} href={`/collections/${routeId(guide.id)}/`} className="guide-card"><div className="guide-card-top"><span className="eyebrow">{guide.category}</span><span className="mono">{String(index + 1).padStart(2, '0')}</span></div><div className={`guide-art guide-art-${guide.id}`} aria-hidden="true"><i /><i /><span>{String(records.length).padStart(2, '0')}</span></div><h3>{guide.title}</h3><p>{guide.deck}</p><div className="guide-card-bottom"><span>{records.length}개 자료 · {wars.size}개 전쟁</span><span>열람하기 <Arrow /></span></div></Link>;
  })}</div>;
}

export function RoomOverview({ items }: { items: { label: string; value: string | number; detail: string }[] }) {
  return <div className="room-overview">{items.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.detail}</p></div>)}</div>;
}
