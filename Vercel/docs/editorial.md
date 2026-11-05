# 편집 콘텐츠와 탐색 경로

## 콘텐츠 경계

`lib/editorial.ts`의 전쟁 해설 3개와 주제별 읽기 경로 9개는 발행된 원자료와 분리한 편집 콘텐츠다. `content/archive.json`과 `lib/generated-contract.ts`를 변경하지 않는다. 역사적 사건 연표는 원자료의 시기 연표와 별개로 표시한다. 사건이 존재한다는 사실은 해당 사건의 원자료가 수록되어 있다는 뜻이 아니다.

기존 `/collections/[id]/` 경로와 빈 모음은 그대로 유지한다. 새 읽기 경로는 별도 ID를 사용하며, 향후 발행 모음과 ID가 겹치면 발행 모음이 우선한다. 경로 충돌은 테스트에서 검출하므로 발행 전 확인한다.

## 선택 규칙

주제 모음은 공개 자료의 제목과 주제어에서 지정 키워드를 대소문자 구분 없이 찾는다. 사진·문서 읽기 모음은 발행 자료 유형을 그대로 따른다. 이 선택은 탐색 후보이며 역사적 관련성을 개별 검증한 분류가 아니다. 자료가 부족하다고 무관한 자료로 채우지 않는다. 한 자료가 여러 경로에 포함될 수 있다. 12건씩 표시하고 전쟁·유형·페이지는 URL에 유지한다.

전쟁 해설과 연표는 세 전쟁의 모든 전장·사건을 망라하지 않는다. 영국 박물관과 미국 기록관의 기관별 관점이 포함된다. 사망자 수치와 책임에 관한 종합 판단을 임의로 생성하지 않는다. 주제 해설의 관찰 질문은 편집 안내이며, 특정 자료에서 해당 사실이 검증됐다는 주장이 아니다.

## 근거 자료

2026-11-05 공개 페이지 본문 확인. 문장은 직접 인용하지 않고 새로 작성했으며 각 화면에 출처를 연결한다.

- National Army Museum, [First World War](https://www.nam.ac.uk/explore/first-world-war): 전장 범위·참호전·항공·해상·연도별 국면.
- National Army Museum, [Second World War](https://www.nam.ac.uk/explore/second-world-war): 아시아와 유럽의 확대·전환점·상륙·종결.
- National Army Museum, [Korean War](https://www.nam.ac.uk/explore/korean-war): 전면전·인천·중국군 개입·전선의 변화.
- 미국 국립기록관리청, [US Enters the Korean Conflict](https://www.archives.gov/education/lessons/korean-conflict): 발발·트루먼 성명·정전 관련 원자료 연결.
- 미국 국립기록관리청, [Document Analysis](https://www.archives.gov/education/lessons/worksheets): 자료 관찰·맥락·증거 대조의 읽기 안내.
- 미국 국립기록관리청, [Powers of Persuasion](https://www.archives.gov/exhibits/powers-of-persuasion): 포스터·생산·노동을 통한 전시 설득.
- 미국 홀로코스트 기념관, [World War II in Europe](https://encyclopedia.ushmm.org/content/en/article/world-war-ii-in-europe): 나치의 점령·조직적 박해와 학살·유럽 전쟁 종결.

## 검증·배포·복구

기존 린트·타입 검사·단위 테스트·빌드 외에 `node --env-file-if-exists=.env.local scripts/reading-room-smoke.mjs`를 실행한다. 기본 대상은 `npm.cmd run preview -- --port 3100`이다. 기존 브라우저 회귀 테스트도 함께 실행한다. 생성된 스크린샷과 결과는 Git 제외 `artifacts/`에 저장한다.

새 환경 변수·DB 마이그레이션·외부 런타임 호출은 없다. Vercel 정적 빌드를 다시 배포하면 새 9개 경로가 포함된다. 편집 파일·탐색 화면·추가 스타일을 함께 이전 버전으로 복구하면 롤백할 수 있다. 원 발행 데이터의 복구는 필요하지 않다.
# 원형 역사 연표

탐색의 전쟁별 주요 전환점은 전쟁 선택 카드에서 대화상자로 연다. 사건은 시간순으로 한 장씩 가로 이동하며 이전·다음, 좌우 방향키, Home·End, 터치 스와이프와 연도 선택을 지원한다. Escape로 닫으면 선택 카드로 초점이 돌아온다. 자동 재생은 없으며 동작 줄이기 설정을 따른다. 기존 해설 출처 및 연도별 자료 검색 URL과 원자료는 유지한다.

검증: `node scripts/hologram-smoke.mjs` (로컬 정적 미리보기 필요).

