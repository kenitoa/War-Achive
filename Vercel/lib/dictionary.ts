import { z } from 'zod';
import type { Entity, PublicArchive } from './generated-contract';

const allowedSourceHosts = new Set(['www.seoul.go.kr', 'www.busan.go.kr', 'theme.archives.go.kr', 'www.archives.gov']);
const sourceSchema = z.object({
  id: z.string().min(1), publisher: z.string().min(1), title: z.string().min(1),
  url: z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && allowedSourceHosts.has(url.hostname); }, '미등록 근거 기관 또는 안전하지 않은 URL'),
  kind: z.enum(['기관 역사 해설', '소장처 해제', '원문 전사']), checkedOn: z.iso.date(),
}).strict();
const factSchema = z.object({ label: z.string().min(1), text: z.string().min(1), citations: z.array(z.object({ sourceId: z.string().min(1), locator: z.string().min(1) }).strict()).min(1) }).strict();
export const DictionaryNoteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1), aliases: z.array(z.string()),
  type: z.enum(['person', 'organization', 'place', 'equipment', 'event']), warIds: z.array(z.string()),
  facts: z.array(factSchema).min(1), sources: z.array(sourceSchema).min(1), scope: z.string().min(1),
}).strict().superRefine((note, context) => {
  const ids = new Set(note.sources.map(source => source.id));
  if (ids.size !== note.sources.length) context.addIssue({ code: 'custom', message: '중복된 근거 식별자' });
  for (const fact of note.facts) for (const citation of fact.citations) if (!ids.has(citation.sourceId)) context.addIssue({ code: 'custom', message: '내용에 연결되지 않은 근거가 있습니다' });
  for (const source of note.sources) if (!note.facts.some(fact => fact.citations.some(citation => citation.sourceId === source.id))) context.addIssue({ code: 'custom', message: '사용되지 않은 출처' });
});
export type DictionaryNote = z.infer<typeof DictionaryNoteSchema>;
export type DictionarySource = DictionaryNote['sources'][number];

const sources = {
  seoul: { id: 'seoul-history', publisher: '서울특별시 · 서울역사편찬원', title: '서울의 역사', url: 'https://www.seoul.go.kr/seoul/history.do', kind: '기관 역사 해설', checkedOn: '2026-11-05' },
  frontline: { id: 'national-frontline', publisher: '국가기록원', title: '6·25전쟁의 진행 과정 · 전선의 변화', url: 'https://theme.archives.go.kr/next/625/process/frontline.do', kind: '기관 역사 해설', checkedOn: '2026-11-05' },
  busan: { id: 'busan-capital', publisher: '부산광역시 · 부산시보', title: '1천23일 간의 피란수도 부산, 그 중심지를 가다', url: 'https://www.busan.go.kr/news/totalnews01/view?dataNo=67582&gugun=Prev', kind: '기관 역사 해설', checkedOn: '2026-11-05' },
  incheon: { id: 'presidential-paa0000128', publisher: '국가기록원 · 대통령기록관', title: '국군 장병에게 · 관리번호 PAA0000128', url: 'https://theme.archives.go.kr/next/625/records/recordDetail.do?flag=1&page=2&searchKey=&searchTxt=&seq=963', kind: '소장처 해제', checkedOn: '2026-11-05' },
  armistice: { id: 'nara-armistice', publisher: '미국 국립기록관리청', title: 'Korean War Armistice Agreement, July 27, 1953 · RG 11, TIAS 2782', url: 'https://www.archives.gov/milestone-documents/armistice-agreement-restoration-south-korean-state', kind: '원문 전사', checkedOn: '2026-11-05' },
} as const;

export const dictionaryNotes: DictionaryNote[] = [
  {
    id: 'wikidata-q8684', name: '서울특별시', aliases: ['서울'], type: 'place', warIds: ['korean-war'], sources: [sources.seoul, sources.frontline],
    facts: [
      { label: '현재의 지위', text: '서울은 대한민국의 수도다.', citations: [{ sourceId: sources.seoul.id, locator: '서울의 역사 · 도입부' }] },
      { label: '한국전쟁의 맥락', text: '국가기록원은 북한군이 1950년 6월 28일 서울을 점령했다고 설명한다.', citations: [{ sourceId: sources.frontline.id, locator: '2. 북한군 남침기 · 서울 점령 설명' }] },
    ],
    scope: '현재 도시의 지위와 1950년의 한 사건만을 다룬다. 현재 행정구역을 당시 전투 범위로 간주하지 않으며, 도시 대표 좌표로 개별 사진의 촬영지를 확정하지 않는다.',
  },
  {
    id: 'wikidata-q16520', name: '부산광역시', aliases: ['부산', '피란수도 부산', '임시수도 부산'], type: 'place', warIds: ['korean-war'], sources: [sources.busan],
    facts: [
      { label: '한국전쟁의 맥락', text: '부산은 한국전쟁 중 대한민국 임시수도 역할을 했다. 부산시보는 서울 수복 기간을 제외한 1950~1953년의 임시수도 시기를 설명한다.', citations: [{ sourceId: sources.busan.id, locator: '1천23일 대한민국의 중심…임시중앙청&경무대' }] },
      { label: '당시 정부 시설', text: '당시 경남도청에는 임시중앙청이 마련되었고, 경남도지사 관사는 대통령의 거처로 사용되었다.', citations: [{ sourceId: sources.busan.id, locator: '임시중앙청과 경무대 설명' }] },
    ],
    scope: '임시수도로서의 역할과 시설 용도를 다룬다. 기관별 자료에서 세부 시작·환도 날짜가 달리 표기될 수 있어 하나의 연속 기간이나 총 일수를 독립적으로 확정하지 않는다.',
  },
  {
    id: 'incheon-landing-1950', name: '인천상륙작전', aliases: ['인천 상륙작전'], type: 'event', warIds: ['korean-war'], sources: [sources.frontline, sources.incheon],
    facts: [
      { label: '실행일', text: '국군과 유엔군은 1950년 9월 15일 인천상륙작전을 감행했다.', citations: [{ sourceId: sources.frontline.id, locator: '3. 유엔군 반격 및 북진기' }] },
      { label: '관련 대통령기록물', text: '대통령기록관 소장 「국군 장병에게」는 인천상륙작전 이후 국군 장병을 격려하는 담화문으로 소개되어 있다. 관리번호는 PAA0000128이다.', citations: [{ sourceId: sources.incheon.id, locator: '기록물명·관리번호 및 문서 내용' }] },
    ],
    scope: '작전 날짜와 관련 기록물의 서지정보를 확인한 범위다. 담화문에 담긴 평가를 중립적 사실로 옮기지 않으며, 이 항목만으로 작전 전 과정이나 민간인 피해 규모를 설명하지 않는다.',
  },
  {
    id: 'korean-armistice-1953', name: '한국 군사정전협정', aliases: ['정전협정', '한국전쟁 정전협정', '휴전협정'], type: 'event', warIds: ['korean-war'], sources: [sources.armistice],
    facts: [
      { label: '서명 시점', text: '정전협정은 1953년 7월 27일 판문점에서 서명되었다.', citations: [{ sourceId: sources.armistice.id, locator: '전사문 말미 · 서명 장소와 일시' }] },
      { label: '적대행위의 정지', text: '협정 제12항은 서명 12시간 뒤부터 모든 적대행위의 중지를 명령하도록 규정한다. 제63항은 나머지 조항의 효력 발생 시각을 1953년 7월 27일 22시로 정한다.', citations: [{ sourceId: sources.armistice.id, locator: 'Article II, paragraph 12 / Article V, paragraph 63' }] },
      { label: '문서의 성격', text: '협정 서문은 최종적인 평화적 해결이 이루어질 때까지의 군사적 정전을 목적으로 제시한다. 영구적인 평화조약과는 구분된다.', citations: [{ sourceId: sources.armistice.id, locator: 'Preamble / 기관 해설의 평화조약 구분' }] },
    ],
    scope: '소장 기관이 공개한 영어 전사문의 내용과 서지정보를 요약했다. 이후 위반 사례, 현재의 법적 쟁점 또는 모든 언어본의 문언 차이를 검토한 결과는 아니다.',
  },
  {
    id: 'korean-demilitarized-zone', name: '한반도 비무장지대', aliases: ['비무장지대', 'DMZ'], type: 'place', warIds: ['korean-war'], sources: [sources.armistice],
    facts: [
      { label: '설정 근거', text: '정전협정 제1항은 군사분계선에서 양측이 각각 2km씩 물러나 완충지대를 설정하도록 규정한다.', citations: [{ sourceId: sources.armistice.id, locator: 'Article I, paragraph 1' }] },
      { label: '군사분계선과의 차이', text: '협정은 군사분계선과 비무장지대의 북쪽·남쪽 경계를 구분한다. 분계선은 협정에 첨부된 지도에 표시하도록 규정되어 있다.', citations: [{ sourceId: sources.armistice.id, locator: 'Article I, paragraphs 2–4' }] },
    ],
    scope: '1953년 협정상 정의를 다룬다. 하나의 점으로 표시할 수 있는 장소가 아니며, 이 항목에 현재의 정확한 경계·출입 규칙·지리 데이터는 제공하지 않는다.',
  },
].map(note => DictionaryNoteSchema.parse(note));

export type DictionaryEntry = {
  id: string; name: string; type: Entity['type']; aliases: string[]; warIds: string[];
  note?: DictionaryNote; imported?: Entity; directRecordIds: string[];
};

export function dictionaryEntries(data: PublicArchive, notes: DictionaryNote[] = dictionaryNotes): DictionaryEntry[] {
  const wars = new Set(data.wars.map(war => war.id));
  const parsed = notes.map(note => DictionaryNoteSchema.parse(note)).filter(note => note.warIds.every(id => wars.has(id)));
  const ids = new Set(parsed.map(note => note.id));
  if (ids.size !== parsed.length) throw new Error('사전 항목 ID 중복');
  const allIds = [...ids, ...data.entities.filter(entity => !ids.has(entity.id)).map(entity => entity.id)];
  return allIds.map(id => {
    const note = parsed.find(item => item.id === id);
    const imported = data.entities.find(item => item.id === id);
    if (!note && !imported) throw new Error('사전 항목 없음');
    return { id, name: note?.name ?? imported!.name, type: note?.type ?? imported!.type, aliases: note?.aliases ?? [], warIds: note?.warIds ?? imported!.warIds, note, imported, directRecordIds: data.records.filter(record => record.entityIds.includes(id)).map(record => record.id) };
  });
}
