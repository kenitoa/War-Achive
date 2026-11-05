import type { ArchiveRecord } from './models.js';
import { DocumentSchema, type EditorialDocument } from './editorial-contract.js';
export * from './editorial-contract.js';

export function analyseRecords(records:ArchiveRecord[], title?:string):EditorialDocument {
  const evidence=records.map(record=>({recordId:record.id,revision:record.public.revision,title:record.public.title,url:record.public.source.url,publisher:record.public.source.name,date:record.public.dates.display,rights:record.public.rights.label}));
  const warnings=records.flatMap(record=>[
    ...(record.public.dates.precision==='unknown'?[`${record.id}: 시기 미상`]:[]),
    ...(record.public.language==='und'?[`${record.id}: 언어 미상`]:[]),
    ...(record.public.review.content!=='reviewed'?[`${record.id}: 소장처 설명 또는 기계 초안, 역사적 사실 검수 필요`]:[]),
    ...(!record.public.rights.reuseAllowed?[`${record.id}: 원문·이미지 재사용 권한 별도 확인`]:[]),
  ]);
  return DocumentSchema.parse({title:title??`${(records[0]?.public.title ?? '기록').slice(0,220)} · 자료 노트`,summary:`${records.length}개 소장 자료의 시기·출처·주제를 대조하는 기록 노트`,blocks:evidence.map(item=>({heading:item.title.slice(0,200),text:`기록 시기: ${item.date}\n소장처: ${item.publisher}\n자료명: ${item.title}\n\n원자료의 작성 배경과 사건의 시기를 구분하고, 소장처의 설명을 대조해 읽습니다.`,evidenceIds:[item.recordId]})),evidence,analysis:{method:'catalogue-analysis-v1',recordCount:records.length,languages:[...new Set(records.map(r=>r.public.language))],topics:[...new Set(records.flatMap(r=>r.public.topics))].slice(0,40),warnings}});
}
export function validateEvidence(document:EditorialDocument):boolean {
  const ids=new Set(document.evidence.map(e=>e.recordId));
  return ids.size===document.evidence.length && document.blocks.every(block=>block.evidenceIds.every(id=>ids.has(id))) && document.evidence.every(item=>document.blocks.some(block=>block.evidenceIds.includes(item.recordId)));
}
export const escapeHtml=(value:string):string=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??char));
export function renderArticle(document:EditorialDocument):string {
  const e=escapeHtml;
  return `<article><header><p class="eyebrow">WAR ARCHIVE / JOURNAL</p><h1>${e(document.title)}</h1><p class="summary">${e(document.summary)}</p></header>${document.blocks.map(block=>`<section><h2>${e(block.heading)}</h2><p>${e(block.text).replace(/\n/g,'<br>')}</p><div class="citations">${block.evidenceIds.map(id=>`<a href="#source-${e(id)}">[${document.evidence.findIndex(item=>item.recordId===id)+1}]</a>`).join(' ')}</div></section>`).join('')}<section><h2>출처 · 자료 정보</h2><ol>${document.evidence.map(item=>`<li id="source-${e(item.recordId)}"><a href="${e(item.url)}" rel="noopener noreferrer">${e(item.title)}</a><p>${e(item.publisher)} · ${e(item.date)} · 개정 ${item.revision}<br>${e(item.rights)}</p></li>`).join('')}</ol></section></article>`;
}
