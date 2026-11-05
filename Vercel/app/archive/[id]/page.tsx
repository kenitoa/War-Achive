import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { Claims, ExternalLink, RecordGrid, SectionTitle } from '@/components/common';
import { RecordAttribution, RecordMedia, RecordTools } from '@/components/record-tools';
import { dateLabels, displayDate, entityLabels, formatDuration, kindLabels } from '@/lib/labels';
import { recordDateLabel, recordDisplayTitle, recordLanguageLabel } from '@/lib/record-presentation';
import { citationFragment, routeId } from '@/lib/security';

export function generateStaticParams() { return publicParams(archive().records); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = archive().records.find(item => item.id === id);
  return { title: record ? recordDisplayTitle(record.title) : '자료를 찾을 수 없습니다' };
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = archive();
  const record = data.records.find(item => item.id === id);
  if (!record) notFound();
  const wars = data.wars.filter(war => record.warIds.includes(war.id));
  const entities = data.entities.filter(entity => record.entityIds.includes(entity.id));
  const related = data.records.filter(item => item.id !== id && (item.warIds.some(war => record.warIds.includes(war)) || item.topics.some(topic => record.topics.includes(topic)))).slice(0, 3);
  const paragraphs = record.summary.split(/\n\s*\n/).filter(paragraph => paragraph.trim());
  return <div className="document-page">
    <nav className="breadcrumbs" aria-label="현재 위치"><Link href="/archive/">자료실</Link><span>/</span><Link href={`/archive/?type=${record.kind}`}>{kindLabels[record.kind]}</Link></nav>
    <article className="record-document">
      <header className="document-heading">
        <p className="document-category">{kindLabels[record.kind]} 자료</p>
        <h1>{recordDisplayTitle(record.title)}</h1>
        <div className="document-byline"><span>{recordDateLabel(record)}</span><span>{recordLanguageLabel(record.language)}</span><span>공개 판 {record.revision}</span></div>
        {record.sensitivity === 'warning' && <p className="document-warning">열람 주의 · 전쟁 피해나 강한 이미지가 포함될 수 있어요.</p>}
      </header>
      <RecordTools record={record} />
      <nav className="document-contents" aria-label="자료 문서 목차"><a href="#description">자료 설명</a><a href="#original">원자료</a><a href="#bibliography">서지정보</a><a href="#references">출처·인용</a></nav>
      <section className="document-section" id="description">
        <h2>자료 설명</h2>
        <p className="document-editor-note">{record.review.content === 'source-description' ? '원 소장처에서 제공한 설명입니다.' : record.review.content === 'machine-draft' ? '자동 생성 초안으로, 내용 검수가 완료되지 않았습니다.' : '편집 검토를 거친 설명입니다.'}</p>
        <div className="document-prose">{paragraphs.map((paragraph, index) => <p className="preserve-lines" key={index}>{paragraph}</p>)}</div>
      </section>
      <section className="document-section document-original" id="original"><h2>원자료</h2><RecordMedia key={record.id} record={record} /><RecordAttribution record={record} /><p className="document-source-link"><ExternalLink href={record.source.url}>소장처에서 자료 확인</ExternalLink>{record.media.originalUrl && <ExternalLink href={record.media.originalUrl}>{record.rights.downloadAllowed ? '원자료 파일 열기' : '원문 연결'}</ExternalLink>}</p></section>
      {record.transcript && <section className="document-section" id="transcript"><h2>원문 판독</h2><p className="document-editor-note">인용 전 원자료와 대조해 주세요. 판독문에 오자가 있을 수 있어요.</p><div className="document-prose preserve-lines">{record.transcript}</div></section>}
      {record.translation && <section className="document-section" id="translation"><h2>번역문</h2><p className="document-editor-note">{record.review.translation === 'reviewed' ? '번역 검수 완료' : record.review.translation === 'machine' ? '자동 번역 · 검수 전' : '번역 검수 상태 미등록'}</p><div className="document-prose preserve-lines">{record.translation}</div></section>}
      <Claims data={data} subjectId={id} />
      <section className="document-section document-bibliography" id="bibliography" aria-label="자료 메타데이터"><h2>서지정보</h2><dl className="document-metadata">
        <div><dt>소장처·출처</dt><dd><ExternalLink href={record.source.url}>{record.source.name}</ExternalLink></dd></div>
        <div><dt>생산·대상 시기</dt><dd>{recordDateLabel(record)}{record.dates.precision !== 'unknown' && <small>{dateLabels[record.dates.precision]}</small>}</dd></div>
        <div><dt>자료 유형·언어</dt><dd>{kindLabels[record.kind]} · {recordLanguageLabel(record.language)}</dd></div>
        {record.media.pages && <div><dt>분량</dt><dd>{record.media.pages}쪽</dd></div>}
        {record.media.durationSeconds !== undefined && <div><dt>재생 시간</dt><dd>{formatDuration(record.media.durationSeconds)}</dd></div>}
        {record.location && <div><dt>관련 위치</dt><dd>{record.location.name}<small>{record.location.precision === 'exact' ? '좌표 확인' : record.location.precision === 'region' ? '지역 범위' : '추정 위치'} · {record.location.lat}, {record.location.lon}</small><Link href={`/explore/?record=${routeId(record.id)}`}>지도에서 보기 ↗</Link></dd></div>}
        <div><dt>출처 확인</dt><dd>{record.review.provenance === 'checked' ? '소장처·출처 확인' : '추가 확인 필요'}<small>역사적 진위 전체를 보증하는 표시는 아니에요.</small></dd></div>
        <div><dt>이용 조건</dt><dd><ExternalLink href={record.rights.url}>{record.rights.label}</ExternalLink><small>다운로드: {record.rights.downloadAllowed ? '허용' : '별도 확인 필요'} · 재사용: {record.rights.reuseAllowed ? '허용 범위 확인 후 이용' : '별도 확인 필요'}</small></dd></div>
        <div><dt>출처 확인일</dt><dd>{displayDate(record.source.accessedAt)}</dd></div>
      </dl>
      <details className="document-details"><summary>원문 제목·식별자 확인</summary><dl className="document-metadata"><div><dt>등록된 원래 제목</dt><dd className="catalog-original-title">{record.title}</dd></div>{record.originalTitle && record.originalTitle !== record.title && <div><dt>별도 원문 제목</dt><dd>{record.originalTitle}</dd></div>}<div><dt>소장처 식별번호</dt><dd>{record.source.identifier}</dd></div><div><dt>아카이브 식별자</dt><dd>{record.id}</dd></div><div><dt>원래 시기 표기</dt><dd>{record.dates.display}<small>{dateLabels[record.dates.precision]} · 원 소장처의 표기를 보존한 값이에요.</small></dd></div></dl></details>
      </section>
      <section className="document-section" id="references"><h2>출처와 인용</h2><ol className="reference-list">{record.citations.map((citation, index) => <li id={`reference-${index + 1}`} key={`${citation.url}-${index}`}><ExternalLink href={citationFragment(citation.url, citation.page, citation.timecode)}>{citation.label}</ExternalLink>{citation.page && <span> · {citation.page}쪽</span>}{citation.timecode && <span> · {citation.timecode}</span>}<Link className="fragment-link" href={`#reference-${index + 1}`} aria-label={`${index + 1}번째 인용 구간 링크`}>#</Link></li>)}</ol>{!record.citations.length && <p className="document-editor-note">별도 인용 구간이 등록되어 있지 않아요. 원 소장처 기록을 확인해 주세요.</p>}<p className="document-editor-note">자료에 담긴 주장과 역사적 사실 확인은 구분해 읽어주세요. 쪽수·시간 링크의 이동 지원은 소장처 뷰어에 따라 달라요.</p></section>
      <section className="document-section document-context"><h2>연결된 맥락</h2><div className="document-context-links">{wars.map(war => <Link key={war.id} href={`/wars/${routeId(war.id)}/`}>{war.name} ↗</Link>)}{entities.map(entity => <Link key={entity.id} href={`/entities/${routeId(entity.id)}/`}>{entityLabels[entity.type]} · {entity.name} ↗</Link>)}</div>{record.topics.length > 0 && <details className="document-details"><summary>원 소장처 분류 {record.topics.length}개 보기</summary><ul className="document-topics">{record.topics.map(topic => <li key={topic}><Link href={`/archive/?q=${encodeURIComponent(topic)}`}>{topic}</Link></li>)}</ul></details>}</section>
      <details className="document-details" id="history"><summary>기록 변경 이력</summary>{record.changes?.length ? <ul className="change-list">{record.changes.map((change, index) => <li key={index}><time dateTime={change.at}>{displayDate(change.at)}</time><span>{change.summary}</span></li>)}</ul> : <p>현재 공개 판 {record.revision} · 마지막 갱신 {displayDate(record.updatedAt)}</p>}<Link className="text-link" href={`/corrections/?record=${routeId(record.id)}`}>오류·누락 제안 ↗</Link></details>
    </article>
    {related.length > 0 && <section className="section document-related"><SectionTitle title="함께 읽을 자료" /><RecordGrid records={related} /></section>}
  </div>;
}
