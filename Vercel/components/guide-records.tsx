'use client';
import Link from './static-link';
import { RecordGrid } from './common';
import { useStaticQuery } from './query-state';
import { kindLabels } from '@/lib/labels';
import type { PublicRecord, War } from '@/lib/generated-contract';

const pageSize = 12;
export function GuideRecords({ records, wars, path }: { records: PublicRecord[]; wars: War[]; path: string }) {
  const params = useStaticQuery();
  const war = wars.some(item => item.id === params.get('war')) ? params.get('war') ?? '' : '';
  const kinds = [...new Set(records.map(record => record.kind))];
  const kind = kinds.find(item => item === params.get('type')) ?? '';
  const filtered = records.filter(record => (!war || record.warIds.includes(war)) && (!kind || record.kind === kind));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(pages, requestedPage)) : 1;
  function pageLink(value: number): string {
    const next = new URLSearchParams();
    if (war) next.set('war', war);
    if (kind) next.set('type', kind);
    if (value > 1) next.set('page', String(value));
    return `${path}?${next}#guide-records`;
  }
  return <section className="section" id="guide-records"><div className="section-heading"><div><p className="eyebrow">연결된 원자료</p><h2>자료 열람 <span className="result-total">{filtered.length}건</span></h2></div><span className="fine-print">{page} / {pages}쪽</span></div><form key={`${war}:${kind}`} className="guide-filters" action={`${path}#guide-records`}><label className="field">전쟁·분쟁<select name="war" defaultValue={war}><option value="">모든 전쟁</option>{wars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field">자료 유형<select name="type" defaultValue={kind}><option value="">모든 유형</option>{kinds.map(item => <option key={item} value={item}>{kindLabels[item]}</option>)}</select></label><button className="button" type="submit">조건 적용</button><Link className="text-link" href={`${path}#guide-records`}>초기화</Link></form><RecordGrid records={filtered.slice((page - 1) * pageSize, page * pageSize)} />{pages > 1 && <nav className="pagination" aria-label="모음 자료 페이지">{page > 1 && <Link href={pageLink(page - 1)}>← 이전</Link>}<span>{page} / {pages}</span>{page < pages && <Link href={pageLink(page + 1)}>다음 →</Link>}</nav>}</section>;
}
