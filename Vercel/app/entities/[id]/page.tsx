import Link from '@/components/static-link';
import { notFound } from 'next/navigation';
import { archive, publicParams } from '@/lib/archive';
import { ExternalLink, RecordGrid, SectionTitle } from '@/components/common';
import { dictionaryEntries } from '@/lib/dictionary';
import { entityLabels } from '@/lib/labels';
import { routeId } from '@/lib/security';

export function generateStaticParams() { return publicParams(dictionaryEntries(archive())); }
export const dynamicParams = false;
export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = archive();
  const entry = dictionaryEntries(data).find(item => item.id === id);
  if (!entry) notFound();
  const note = entry.note;
  const records = data.records.filter(record => entry.directRecordIds.includes(record.id));
  return <div className="document-page dictionary-document"><nav className="breadcrumbs" aria-label="현재 위치"><Link href="/entities/">기록 사전</Link><span>/</span><span>{entityLabels[entry.type]}</span></nav><article className="record-document"><header className="document-heading"><p className="document-category">{entityLabels[entry.type]} · {note ? '근거 문헌 연결' : '근거 미등록'}</p><h1>{entry.name}</h1>{entry.aliases.length > 0 && <p className="dictionary-aliases">다른 이름: {entry.aliases.join(' · ')}</p>}</header>{note ? <><dl className="dictionary-review"><div><dt>자료 대조일</dt><dd>{[...new Set(note.sources.map(source => source.checkedOn))].join(' · ')}</dd></div><div><dt>근거 범위</dt><dd>{note.facts.length}개 내용 · {note.sources.length}개 문헌</dd></div><div><dt>전문가 검토</dt><dd>미실시</dd></div></dl><nav className="document-contents" aria-label="사전 항목 목차"><a href="#facts">확인 내용</a><a href="#scope">확인 범위</a><a href="#evidence">근거 문헌</a><a href="#linked-records">직접 연결 자료</a></nav><section className="document-section" id="facts"><h2>근거별 확인 내용</h2><ol className="dictionary-facts">{note.facts.map((fact, index) => <li key={fact.label}><h3><span>{String(index + 1).padStart(2, '0')}</span>{fact.label}</h3><p>{fact.text}</p><ul>{fact.citations.map(citation => <li key={`${citation.sourceId}:${citation.locator}`}><a href={`#source-${citation.sourceId}`}>{note.sources.find(source => source.id === citation.sourceId)?.publisher} · {citation.locator} ↓</a></li>)}</ul></li>)}</ol></section><section className="document-section" id="scope"><h2>확인 범위와 남은 한계</h2><p className="document-prose">{note.scope}</p></section><section className="document-section" id="evidence"><h2>근거 문헌</h2><ol className="dictionary-sources">{note.sources.map(source => <li key={source.id} id={`source-${source.id}`}><span>{source.kind} · {source.publisher}</span><h3><ExternalLink href={source.url}>{source.title}</ExternalLink></h3><p>본문 확인일 {source.checkedOn}</p></li>)}</ol></section></> : <section className="document-section"><h2>내용별 근거 문헌이 아직 없습니다</h2><p className="document-prose">공개본에서 가져온 연결 항목입니다. 기관 자료와 내용별 대조가 등록되기 전까지 사전의 확인 내용으로 표시하지 않습니다.</p></section>}
      <section className="document-section" id="linked-records"><h2>직접 연결된 원자료 <span className="result-total">{records.length}건</span></h2>{records.length ? <RecordGrid records={records} /> : <p className="document-editor-note">현재 공개본에 이 항목과 직접 연결된 원자료가 없습니다. 위의 근거 문헌은 외부 기관 자료이며 아카이브 수록 자료 건수에 포함하지 않습니다.</p>}{entry.warIds.length > 0 && <div className="dictionary-context"><p>전쟁별 일반 자료 탐색</p>{data.wars.filter(war => entry.warIds.includes(war.id)).map(war => <Link key={war.id} className="text-link" href={`/archive/?war=${routeId(war.id)}`}>{war.name} 자료실 ↗</Link>)}<small>같은 전쟁에 속한다는 이유만으로 이 항목의 직접 증거가 되지는 않습니다.</small></div>}</section>
      {entry.imported && <details className="document-details dictionary-imported"><summary>가져온 원래 설명·좌표 확인</summary><p>{entry.imported.summary}</p>{entry.imported.sourceUrl && <p><ExternalLink href={entry.imported.sourceUrl}>기존 가져오기 출처</ExternalLink></p>}{entry.imported.location && <p>{entry.imported.location.name}: {entry.imported.location.lat}, {entry.imported.location.lon}<br />위 좌표는 가져온 장소 메타데이터이며 전투 위치·피해 범위·사진 촬영지를 검증한 값이 아닙니다.</p>}</details>}
      <p className="dictionary-correction"><Link href={`/corrections/?entity=${routeId(id)}`}>이 항목의 근거·내용 정정 요청 ↗</Link></p>
    </article><section className="section"><SectionTitle title="기록 사전" href="/entities/" linkText="모든 항목 보기" /></section></div>;
}
