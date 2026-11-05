import type { PublicRecord } from './generated-contract';

export type Reference = { id: string; title: string; publisher: string; url: string };
export const references: Reference[] = [
  { id: 'ww1', title: 'First World War', publisher: 'National Army Museum', url: 'https://www.nam.ac.uk/explore/first-world-war' },
  { id: 'ww2', title: 'Second World War', publisher: 'National Army Museum', url: 'https://www.nam.ac.uk/explore/second-world-war' },
  { id: 'korea', title: 'Korean War', publisher: 'National Army Museum', url: 'https://www.nam.ac.uk/explore/korean-war' },
  { id: 'korea-docs', title: 'US Enters the Korean Conflict', publisher: '미국 국립기록관리청', url: 'https://www.archives.gov/education/lessons/korean-conflict' },
  { id: 'analysis', title: 'Document Analysis', publisher: '미국 국립기록관리청', url: 'https://www.archives.gov/education/lessons/worksheets' },
  { id: 'posters', title: 'Powers of Persuasion', publisher: '미국 국립기록관리청', url: 'https://www.archives.gov/exhibits/powers-of-persuasion' },
  { id: 'occupation', title: 'World War II in Europe', publisher: '미국 홀로코스트 기념관', url: 'https://encyclopedia.ushmm.org/content/en/article/world-war-ii-in-europe' },
];

export type Chapter = { title: string; body: string };
export type HistoricalEvent = { date: string; year: string; title: string; body: string; sourceId: string };
export type WarDossier = {
  warId: string; subtitle: string; introduction: string; chapters: Chapter[];
  events: HistoricalEvent[]; questions: string[]; guideIds: string[]; sourceIds: string[];
};

// Editorial context is deliberately separate from the NAS publication and its claims.
export const warDossiers: WarDossier[] = [
  {
    warId: 'world-war-i', subtitle: '전선과 후방을 함께 읽는 전쟁',
    introduction: '1914년부터 1918년까지 이어진 전쟁은 유럽의 참호뿐 아니라 중동·아프리카, 바다와 하늘로 펼쳐졌어요. 전투 기록 옆에 병원·훈련소·수송 기록을 놓으면 전쟁을 유지한 사회의 구조가 보이기 시작해요.',
    chapters: [
      { title: '여러 전장을 하나의 지도로', body: '서부전선의 참호는 중요한 출발점이지만 전쟁의 전부는 아니에요. 동유럽, 오스만 제국의 영토, 아프리카의 전투를 함께 살펴보면 제국과 식민지의 연결을 읽을 수 있어요. 한 지역의 사진을 세계 전체의 경험으로 확대하지 않는 것이 중요해요.' },
      { title: '소모전과 전쟁의 기반 시설', body: '서부전선의 교착은 병력과 물자를 지속적으로 투입하는 전쟁으로 이어졌어요. 공격의 결과만 살피기보다 보급·수송·의료가 전선을 어떻게 뒷받침했는지 질문해요. 현재 자료실의 병원·훈련소 기록은 이런 질문으로 읽기 좋은 출발점이에요.' },
      { title: '바다와 하늘에서 바뀐 시야', body: '항공기는 정찰과 포병 관측, 공중전 등 새로운 역할을 맡았어요. 해상 봉쇄와 함정·잠수함의 활동은 군인과 민간인의 생활 모두에 영향을 주었어요. 장비 사진을 읽을 때에는 성능뿐 아니라 촬영 목적과 운용 환경도 확인해요.' },
      { title: '종전 이후에도 남는 자료', body: '1918년의 전투 종결 이후에도 기억과 기념은 계속되었어요. 당시 촬영된 기록과 후대에 세워진 기념물은 서로 다른 시점을 말해요. 자료가 다루는 사건의 연도와 실제 제작·촬영 연도를 나누어 메모하면 혼동을 줄일 수 있어요.' },
    ],
    events: [
      { date: '1914', year: '1914', title: '전쟁의 확대', body: '유럽에서 시작된 전쟁이 여러 대륙의 전장과 해상으로 연결되었어요.', sourceId: 'ww1' },
      { date: '1915', year: '1915', title: '서부전선의 교착', body: '영국·프랑스군의 공세가 이어졌지만 참호전의 교착을 쉽게 해소하지 못했어요.', sourceId: 'ww1' },
      { date: '1916', year: '1916', title: '장기 소모전', body: '서부전선에서 장기간의 대규모 전투가 이어졌어요.', sourceId: 'ww1' },
      { date: '1917', year: '1917', title: '참전과 이탈', body: '미국이 참전했고, 러시아는 혁명 이후 전쟁에서 이탈하는 방향으로 움직였어요.', sourceId: 'ww1' },
      { date: '1918', year: '1918', title: '공세와 반격', body: '독일군의 봄 공세 이후 연합국의 반격이 이어지며 전쟁의 국면이 바뀌었어요.', sourceId: 'ww1' },
    ],
    questions: ['사진은 전선에서 찍혔나요, 후방에서 찍혔나요?', '제국의 군대라는 설명 안에 어떤 지역 출신 사람들이 포함되어 있나요?', '자료의 날짜는 사건·촬영·발행 중 무엇을 가리키나요?', '사진 밖에 있는 노동·돌봄·수송을 어떤 기록으로 보완할 수 있나요?'],
    guideIds: ['care-and-recovery', 'training-and-service', 'transport-and-supply'], sourceIds: ['ww1', 'analysis'],
  },
  {
    warId: 'world-war-ii', subtitle: '전장의 확장, 일상의 동원',
    introduction: '유럽과 아시아·태평양의 전투, 도시의 폭격, 생산과 선전은 서로 연결되어 있었어요. 이 열람 경로는 작전의 흐름과 함께 사람들이 일하고 이동하고 설득당했던 방식을 살펴봐요.',
    chapters: [
      { title: '유럽과 아시아를 함께 놓기', body: '유럽의 전쟁은 1939년 독일의 폴란드 침공 이후 확대되었어요. 아시아에서는 그보다 앞선 1937년 일본의 중국 침공을 함께 살펴봐야 해요. 같은 전쟁의 이름 아래에서도 지역마다 시작과 경험의 경계가 달라요.' },
      { title: '전쟁이 넓어진 1941년', body: '독일의 소련 침공과 일본의 진주만 공격은 전쟁의 범위를 크게 넓혔어요. 지도에서 전장만 확인하지 말고 대륙과 바다를 잇는 보급망에도 주목해요. 함정·항만·수송 사진은 그런 연결을 읽는 자료가 될 수 있어요.' },
      { title: '후방의 노동과 설득', body: '미국의 전시 포스터는 생산·절약·모집 같은 행동을 촉구했어요. 기록관의 선전 전시는 이미지가 시민을 설득하는 방식을 보여줘요. 포스터의 문구는 당시의 주장이므로, 그 내용을 곧바로 현실에 대한 중립적 설명으로 읽지 않아요.' },
      { title: '점령과 박해, 종전 이후의 기억', body: '나치 독일과 협력자들은 유대인을 조직적으로 박해하고 학살했어요. 전쟁의 흐름을 군사작전만으로 설명할 수 없는 이유예요. 점령과 강제이주의 경험은 피해자의 증언과 문서도 함께 살펴봐야 해요. 전투의 종결과 사람들의 귀환·상실·추모는 같은 일정으로 움직이지 않아요.' },
    ],
    events: [
      { date: '1937', year: '1937', title: '일본의 중국 침공', body: '아시아에서 전쟁이 확대되는 배경을 살펴보는 출발점이에요.', sourceId: 'ww2' },
      { date: '1939', year: '1939', title: '유럽에서 전쟁 확대', body: '폴란드 침공 뒤 영국과 프랑스가 독일에 선전포고했어요.', sourceId: 'ww2' },
      { date: '1941', year: '1941', title: '소련 침공과 진주만 공격', body: '동부전선과 태평양에서 전쟁의 범위가 넓어졌어요.', sourceId: 'ww2' },
      { date: '1942–1943', year: '1942', title: '여러 전장의 전환', body: '미드웨이, 북아프리카, 스탈린그라드 등에서 전세가 변화했어요.', sourceId: 'ww2' },
      { date: '1944.06.06', year: '1944', title: '노르망디 상륙', body: '연합군이 프랑스 북부에 상륙했어요.', sourceId: 'ww2' },
      { date: '1945년 5월', year: '1945', title: '독일의 항복', body: '독일군의 항복으로 유럽에서 전쟁이 종결되었어요.', sourceId: 'occupation' },
      { date: '1945.09.02', year: '1945', title: '일본 항복 문서 서명', body: '일본의 공식 항복 문서가 서명되었어요.', sourceId: 'ww2' },
    ],
    questions: ['전시 포스터는 누구에게 어떤 행동을 요구하나요?', '사진의 제목은 촬영자가 붙였나요, 소장처가 정리하며 붙였나요?', '생산·수송 기록에서 전선과 후방은 어떻게 연결되나요?', '추모 자료의 제작 연도는 전쟁 기간과 얼마나 떨어져 있나요?'],
    guideIds: ['persuasion-and-posters', 'industry-and-labour', 'civilian-lives'], sourceIds: ['ww2', 'posters', 'occupation', 'analysis'],
  },
  {
    warId: 'korean-war', subtitle: '이동하는 전선과 남겨진 삶',
    introduction: '1950년의 전면전에서 1953년의 정전까지, 전선의 변화는 도시와 항구, 사람들의 이동에 겹쳐졌어요. 전황의 흐름과 피란·군 복무·전후 기억을 나란히 읽는 경로예요.',
    chapters: [
      { title: '분단에서 전면전으로', body: '제2차 세계대전 이후 한반도는 분할 점령과 남북 정부 수립을 거쳤어요. 1950년 6월 25일 북한군의 남침으로 전면전이 시작되었고 유엔의 대응과 다국적 참전으로 이어졌어요. 공적 성명은 발표 주체와 목적을 함께 읽어야 해요.' },
      { title: '항구와 도시를 잇는 전선', body: '부산 방어선, 인천상륙작전과 북진은 1950년 전황의 주요 국면이에요. 도시 이름을 단순한 작전 지점으로만 읽지 않고 수송·보급·생활의 공간으로도 살펴봐요. 아카이브의 좌표는 개별 자료에 부여된 위치이며 전선 자체를 나타내지는 않아요.' },
      { title: '재개된 후퇴와 전선의 안정', body: '중국군의 개입 이후 유엔군은 후퇴했고 서울을 둘러싼 전투가 다시 이어졌어요. 1951년에는 전선이 점차 안정되는 국면으로 들어갔어요. 같은 장소의 기록도 시기가 다르면 통제 주체와 사람들의 상황이 달랐을 수 있어요.' },
      { title: '정전과 이후의 기록', body: '1953년 7월 27일 정전협정이 체결되었어요. 정전 문서, 군사 사진, 후대의 추모 기록은 서로 다른 종류의 증거예요. 현재 수록 자료에는 전쟁 이후의 기록도 있으므로 모든 사진을 1950~1953년의 장면으로 간주하지 않아요.' },
    ],
    events: [
      { date: '1950.06.25', year: '1950', title: '전면전 발발', body: '북한군이 38선을 넘어 남진하며 전면전이 시작되었어요.', sourceId: 'korea-docs' },
      { date: '1950.06.27', year: '1950', title: '트루먼의 한국 관련 성명', body: '미국의 군사적 대응을 알리는 성명이 발표되었어요. 원문은 기록관의 교육 자료에서 확인할 수 있어요.', sourceId: 'korea-docs' },
      { date: '1950.09.15', year: '1950', title: '인천상륙작전', body: '인천 상륙과 부산 방어선에서의 반격이 전황을 바꾸었어요.', sourceId: 'korea' },
      { date: '1950년 가을·겨울', year: '1950', title: '중국군 개입과 후퇴', body: '중국군의 개입으로 전황이 다시 바뀌고 유엔군의 후퇴가 이어졌어요.', sourceId: 'korea' },
      { date: '1951', year: '1951', title: '서울 재수복과 전선 안정', body: '유엔군이 서울을 다시 확보했고 전선은 점차 안정되는 국면에 들어갔어요.', sourceId: 'korea' },
      { date: '1953.07.27', year: '1953', title: '정전협정 체결', body: '정전협정과 서명 장면은 미국 국립기록관리청이 연결한 원자료에서 확인할 수 있어요.', sourceId: 'korea-docs' },
    ],
    questions: ['현재의 지명과 자료에 적힌 지명이 같은 장소를 뜻하나요?', '군사 사진에서 민간인의 경험은 얼마나 드러나나요?', '전시 촬영물과 전후 추모 사진을 구분할 수 있나요?', '공식 성명의 표현과 현장 기록은 어떤 차이를 보이나요?'],
    guideIds: ['civilian-lives', 'transport-and-supply', 'memory-and-remembrance'], sourceIds: ['korea', 'korea-docs', 'analysis'],
  },
];

export type ReadingGuide = {
  id: string; title: string; deck: string; category: string; keywords: string[]; kinds?: PublicRecord['kind'][];
  chapters: Chapter[]; questions: string[]; sourceIds: string[];
};

// Keywords select candidates from published metadata, not verified subject claims.
export const readingGuides: ReadingGuide[] = [
  { id: 'persuasion-and-posters', title: '선전·포스터', category: '시각 자료', deck: '전시 포스터 · 모집 광고 · 전쟁 채권', keywords: ['poster', 'propaganda', 'recruit', 'bonds'], sourceIds: ['posters', 'analysis'], chapters: [
    { title: '먼저, 요구하는 행동 찾기', body: '포스터를 보자마자 인상적인 그림부터 해석하기보다 동사와 명령문을 적어봐요. 모집·저축·생산·절약 중 무엇을 요구하는지, 누구를 청중으로 삼는지 구분해요. 같은 이미지도 게시 장소와 대상에 따라 다르게 작동할 수 있어요.' },
    { title: '화면 안의 역할과 화면 밖의 사람', body: '인물의 표정, 복장, 크기, 배경에 놓인 기계를 관찰해요. 어떤 역할을 이상적으로 보여주며 무엇을 생략하는지 질문해요. 미국 국립기록관리청의 포스터 전시는 전시 생산과 노동을 설득하는 이미지의 사례를 제공해요.' },
    { title: '주장과 현실을 분리하기', body: '포스터는 무엇을 하라고 설득했는지 보여주는 증거예요. 그 행동이 실제로 얼마나 이루어졌는지를 곧바로 증명하지는 않아요. 통계·행정 문서·개인 기록을 별도로 찾아야 하며, 현재 모음에 없는 자료를 있는 것처럼 채우지 않아요.' },
  ], questions: ['어떤 행동을 촉구하나요?', '발행 기관과 예상 독자는 누구인가요?', '편견이나 적대적 표현을 사실로 받아들이고 있지는 않나요?'] },
  { id: 'care-and-recovery', title: '의료·구호', category: '의료 자료', deck: '병원 · 간호 · 적십자 · 회복 시설', keywords: ['hospital', 'medical', 'nurs', 'red cross', 'convalescent'], sourceIds: ['analysis'], chapters: [
    { title: '시설과 사람을 함께 보기', body: '병상, 통로, 창문, 도서관과 휴식 공간처럼 사진 속 구체적인 요소부터 목록으로 적어요. 공간의 크기만으로 치료의 질을 단정하지 않아요. 촬영된 건물이 병원인지, 임시 병동인지, 회복 시설인지 원 소장처의 설명을 확인해요.' },
    { title: '돌보는 사람의 흔적', body: '자료 제목에 의사나 간호사의 이름이 없어도 복장·도구·배치를 관찰하며 역할에 관한 질문을 만들 수 있어요. 다만 보이는 복장만으로 직책·국적·소속을 확정하지 않아요. 확실한 정보와 추정을 나누어 메모해요.' },
    { title: '보이지 않는 회복의 시간', body: '정지된 한 장면에는 부상 전후의 삶과 퇴원 이후가 담기지 않을 수 있어요. 사진 한 장으로 전형적인 의료 경험을 대표하지 않도록 해요. 다른 시점의 병원 기록과 읽기 공간·휴식 장면을 비교하면 질문을 넓힐 수 있어요.' },
  ], questions: ['촬영된 공간의 용도는 무엇인가요?', '치료받는 사람과 돌보는 사람 중 누구의 설명이 남아 있나요?', '회복을 전투의 부수적 장면으로만 보고 있지는 않나요?'] },
  { id: 'transport-and-supply', title: '수송·보급', category: '군수 자료', deck: '철도 · 차량 · 함정 · 항만 · 보급품', keywords: ['transport', 'rail', 'train', 'truck', 'supply', 'ship', 'navy'], sourceIds: ['analysis'], chapters: [
    { title: '무엇을 어디로 옮기는가', body: '차량과 선박을 찾은 뒤 사람·식량·장비 중 무엇이 이동하는 장면인지 살펴봐요. 출발지와 도착지가 확인되지 않으면 물음표를 남겨요. 지도 좌표 하나로 전체 항로를 그리거나 이동 방향을 만들어내지 않아요.' },
    { title: '이동을 떠받치는 노동', body: '운전·적재·정비·통신 같은 활동은 사진의 주변부에 있을 수 있어요. 중심의 장비와 함께 작업하는 사람, 도구, 표지판도 관찰해요. 군사 목적의 장비 사진인지 시민을 설득하는 수송 포스터인지에 따라 읽는 방식이 달라요.' },
    { title: '길과 날짜를 함께 확인하기', body: '지명이 같아도 촬영 시기와 행정구역이 다를 수 있어요. 현재의 도로나 기념 도로가 전시의 이동 경로를 보여주는 자료는 아니에요. 원 제목과 생산 시기를 먼저 확인한 뒤 지도에서 연결해요.' },
  ], questions: ['이동의 주체와 대상은 무엇인가요?', '실제 경로와 촬영 장소를 혼동하지 않았나요?', '정비·적재·대기처럼 이동 사이의 노동은 어떻게 보이나요?'] },
  { id: 'memory-and-remembrance', title: '추모·기념', category: '전후 기록', deck: '기념물 · 묘지 · 참전용사 · 추모 행사', keywords: ['memorial', 'monument', 'cemetery', 'veteran', 'grave'], sourceIds: ['analysis'], chapters: [
    { title: '사건의 시간과 기념의 시간', body: '기념물이 가리키는 전쟁의 연도와 건립·촬영 연도는 달라요. 먼저 두 시간을 구분해 적어요. 후대에 촬영된 기념물은 전투 당시의 장면이 아니라 기억을 표현한 자료로 읽어요.' },
    { title: '이름과 문구의 배치', body: '누구의 이름이 적혔는지, 어떤 언어를 쓰는지, 군인과 민간인을 어떻게 호명하는지 관찰해요. 새겨진 내용과 편집자의 해석을 나누어요. 보이지 않는 면의 비문이나 현장 상황은 사진만으로 보충하지 않아요.' },
    { title: '장소가 만들어내는 의미', body: '공원·묘역·교차로처럼 기념물이 놓인 공간을 살펴봐요. 같은 전쟁을 가리켜도 지역마다 강조하는 기억은 다를 수 있어요. 비교할 때에는 건립 주체·날짜·행사 목적을 먼저 맞춰 읽어요.' },
  ], questions: ['이 자료는 전쟁 당시 기록인가요, 후대의 기념인가요?', '누가 기억의 주체로 등장하나요?', '건립 장소와 문구는 어떤 관계가 있나요?'] },
  { id: 'training-and-service', title: '훈련·군 복무', category: '군 생활', deck: '훈련소 · 군사교육 · 군복 · 인물 사진', keywords: ['training', 'camp', 'school', 'uniform'], sourceIds: ['analysis'], chapters: [
    { title: '촬영을 위해 정돈된 장면', body: '정렬한 사람들, 카메라를 보는 시선, 반복되는 자세를 살펴봐요. 단체 사진과 현장 기록은 서로 다른 촬영 목적을 가질 수 있어요. 질서 있는 한 장면을 군 복무 전체의 분위기로 일반화하지 않아요.' },
    { title: '복장과 소속의 단서', body: '계급장·표식·이름표가 읽히는지 확인해요. 군복이나 모자만 보고 신원을 결정하지 말고 소장처 설명을 대조해요. 유물을 촬영한 현대 사진과 사람이 착용한 당시 사진도 구분해요.' },
    { title: '교육과 생활의 경계', body: '학교나 캠프라는 단어가 전투 훈련만을 뜻하지는 않아요. 읽기·행사·휴식·기술 교육을 보여주는지 살펴봐요. 이 모음은 제목과 주제어로 연결한 후보이므로 자료의 실제 맥락은 상세 페이지에서 확인해요.' },
  ], questions: ['훈련 장면인가요, 기념 촬영인가요?', '소속을 뒷받침하는 명시적 정보가 있나요?', '군 복무 중 일상을 보여주는 요소는 무엇인가요?'] },
  { id: 'civilian-lives', title: '사람·생활', category: '생활 자료', deck: '여성 · 어린이 · 가족 · 피란 관련 기록', keywords: ['civilian', 'refugee', 'children', 'women', 'girl', 'family'], sourceIds: ['analysis'], chapters: [
    { title: '누가 무엇을 하고 있는가', body: '표정에 의미를 붙이기 전에 인원·행동·도구·장소처럼 관찰 가능한 사실을 적어요. 민간인인지 군인인지 설명이 불분명하면 판단을 보류해요. 이 모음에는 여성 군인의 기록도 함께 나타날 수 있어요.' },
    { title: '설명 속 주어를 살펴보기', body: '사진 속 사람의 이름이 기록되어 있는지, 집단으로만 호명되는지 확인해요. 자료 제목의 표현을 현재의 중립적인 사실처럼 반복하지 않아요. 사람이 직접 남긴 말과 촬영자·소장처가 붙인 설명은 구분해요.' },
    { title: '대표되지 않은 경험 남겨두기', body: '한 가족이나 한 집단의 장면은 다양한 경험 가운데 하나예요. 설명이 없는 마음·동기·이동 사유를 만들어내지 않아요. 기록이 보여주는 것과 질문으로 남는 것을 나누어 읽는 것이 이 경로의 목적이에요.' },
  ], questions: ['누가 이름으로, 누가 집단으로 기록되어 있나요?', '그 사람의 말인가요, 다른 사람이 붙인 설명인가요?', '사진이 보여주지 않는 사실을 추측으로 채우고 있지는 않나요?'] },
  { id: 'industry-and-labour', title: '생산·노동', category: '산업 자료', deck: '공장 · 생산 설비 · 노동자 · 장비 정비', keywords: ['factory', 'production', 'worker', 'equipment', 'arsenal'], sourceIds: ['analysis'], chapters: [
    { title: '완성품 너머의 공정', body: '사진 속 기계와 부품을 구분하고 어떤 작업 단계인지 질문해요. 완성된 장비의 모습만으로 생산량이나 작업 효율을 추정하지 않아요. 공장 기록과 장비 사용 안내는 생산의 서로 다른 단면을 보여줄 수 있어요.' },
    { title: '노동을 어떻게 보여주는가', body: '일하는 사람의 배치, 안전 장구, 지시 문구, 휴식 공간을 살펴봐요. 생산 독려 포스터라면 실제 현장 사진과 읽는 기준이 달라져요. 기록의 형태를 먼저 구분하고 작업 조건에 대한 단서를 찾아요.' },
    { title: '수리와 유지의 기록', body: '장비는 생산된 뒤에도 운용·정비·수리를 거쳐요. 보고서의 날짜와 대상 장비, 작성 목적을 확인해요. 수리 기록 한 건은 해당 장비의 상태를 보여줄 수 있지만 전체 전력의 상태를 대표하지는 않아요.' },
  ], questions: ['생산·운용·수리 중 어느 단계인가요?', '사진이나 문서가 노동을 어떤 방식으로 표현하나요?', '한 장비의 사례를 전체의 상태로 확대하지 않았나요?'] },
  { id: 'reading-photographs', title: '사진 분석', category: '자료 읽기', deck: '장면 관찰 · 촬영 시기 · 출처 대조', keywords: [], kinds: ['photograph'], sourceIds: ['analysis'], chapters: [
    { title: '설명을 잠시 덮고 관찰하기', body: '인물·물건·배경·문자처럼 실제로 보이는 요소를 먼저 적어요. 이어 제목과 설명을 읽으며 관찰과 일치하는지 확인해요. 온라인에서 사진 유형으로 등록된 자료에는 포스터·유물·문서의 촬영 이미지도 포함될 수 있어요.' },
    { title: '제목과 날짜를 대조하기', body: '파일명, 원 제목, 소장처 식별자를 각각 확인해요. 디지털 파일의 등록·수정 날짜가 촬영일과 같다는 보장은 없어요. 날짜 미상이나 추정 시기 표시를 그대로 남겨두는 편이 정확해요.' },
    { title: '같은 장면의 다른 증거 찾기', body: '가능하면 다른 시점의 사진이나 문서와 비교해요. 두 기록이 비슷하다는 이유만으로 같은 사건이라고 단정하지 않아요. 내 서재의 메모와 비교 기능으로 관찰·확인·추정을 나누어 기록할 수 있어요.' },
  ], questions: ['직접 관찰한 사실 세 가지는 무엇인가요?', '설명과 관찰 사이에 차이가 있나요?', '현재 표시된 날짜의 의미를 확인했나요?'] },
  { id: 'reading-documents', title: '문서 분석', category: '자료 읽기', deck: '작성 목적 · 발행 기관 · 인용·출처', keywords: [], kinds: ['document'], sourceIds: ['analysis'], chapters: [
    { title: '문서의 바깥부터 확인하기', body: '제목·작성자·발행 기관·날짜·소장 번호를 먼저 확인해요. 파일 이름이 보고서 제목 전체를 대신하지 않을 수 있어요. 원문 링크가 있다면 표지·목차·문서의 실제 범위를 대조해요.' },
    { title: '문서 안의 목소리 구분하기', body: '작성자의 관찰, 다른 사람의 발언, 집계 수치, 명령이나 권고를 구분해요. 보고서가 어떤 조직의 필요를 위해 작성되었는지 살펴봐요. 원문이 없거나 판독이 어려운 부분을 번역·요약으로 임의 보충하지 않아요.' },
    { title: '다시 찾을 수 있게 인용하기', body: '자료명과 소장처, 식별자, 확인한 쪽수를 함께 남겨요. 디지털 파일의 페이지 번호와 본문 인쇄 쪽수가 다를 수 있으므로 어느 쪽을 사용했는지 적어요. 다른 사람이 같은 근거를 확인할 수 있는 메모가 좋은 출발점이에요.' },
  ], questions: ['누구에게 전달하기 위해 만든 문서인가요?', '관찰·주장·명령을 구분할 수 있나요?', '인용한 대목을 다른 사람이 다시 찾을 수 있나요?'] },
];

export function dossierFor(warId: string): WarDossier | undefined {
  return warDossiers.find(dossier => dossier.warId === warId);
}

export function guideRecords(guide: ReadingGuide, records: PublicRecord[]): PublicRecord[] {
  return records.filter(record => {
    if (guide.kinds && !guide.kinds.includes(record.kind)) return false;
    if (!guide.keywords.length) return true;
    const text = [record.title, ...record.topics].join(' ').toLowerCase();
    return guide.keywords.some(keyword => text.includes(keyword.toLowerCase()));
  });
}

export function guideById(id: string): ReadingGuide | undefined {
  return readingGuides.find(guide => guide.id === id);
}
