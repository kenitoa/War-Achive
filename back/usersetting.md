# 전쟁 역사 아카이브 NAS·GitHub 사용자 설정 체크리스트

이 문서는 코드가 대신할 수 없어 사용자가 NAS와 GitHub에서 직접 해야 하는 작업을 정리합니다. 백엔드 도메인, DNS, 인증서와 공유기 포트 포워딩은 필요하지 않습니다. 토큰과 비밀번호의 실제 값은 이 파일이나 Git 저장소에 기록하지 마세요.

## 1. NAS에서 Docker 준비

- [ ] NAS에 Docker Engine 또는 제조사 Container Manager를 설치합니다.
- [ ] 터미널에서 `docker version`이 성공하는지 확인합니다.
- [ ] `docker compose version`이 성공하는지 확인합니다. Compose v2가 필요합니다.
- [ ] NAS에 `back` 폴더 전체를 업로드합니다. 예: `/volume1/docker/war-archive-back`
- [ ] 수집 데이터와 발행 상태를 지우는 `docker compose down -v`는 사용하지 않습니다.

이 PC에서는 Docker와 정상 WSL 실행 환경을 확인하지 못했기 때문에 위 항목은 NAS에서 직접 확인해야 합니다.

## 2. NAS 네트워크 확인

- [ ] NAS가 외부 HTTPS 사이트와 `api.github.com`에 접속할 수 있는지 확인합니다.
- [ ] Docker 컨테이너의 외부 인터넷 연결을 허용합니다.
- [ ] 공유기 포트 포워딩은 설정하지 않습니다.
- [ ] NAS 방화벽에서 TCP `9231`은 내부망에서만 접근하도록 허용합니다.

NAS는 자료를 내려받고 GitHub에 기록을 올리는 발신 연결과 내부망 관제 화면 `9231`만 사용합니다. 공유기 외부 포트 전달은 하지 않습니다.

## 3. front GitHub 저장소 준비

`front` 폴더가 GitHub 저장소의 루트가 되도록 업로드해야 합니다. `pages.yml`이 저장소에서 `.github/workflows/pages.yml` 경로에 보여야 합니다.

- [ ] GitHub 저장소의 기본 브랜치를 `main`으로 설정합니다.
- [ ] 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 지정합니다.
- [ ] **Settings → Secrets and variables → Actions → Variables**에 아래 값만 추가합니다.

| 변수 | 값 예시 |
| --- | --- |
| `SITE_URL` | `https://kenitoa.github.io/warsachive` |

사용자 사이트 저장소가 `username.github.io`라면 `SITE_URL`은 `https://username.github.io`입니다.

## 4. GitHub 발행 토큰 만들기

- [ ] GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens**에서 토큰을 만듭니다.
- [ ] Resource owner를 front 저장소 소유자로 선택합니다.
- [ ] Repository access는 front 저장소 하나만 선택합니다.
- [ ] Repository permissions에서 **Contents: Read and write**를 부여합니다.
- [ ] 만료일을 정하고 만료 전에 교체 알림을 등록합니다.
- [ ] 발급 직후 한 번만 표시되는 토큰을 암호 관리자에 저장합니다.
- [ ] 토큰을 Git, `usersetting.md`, 메신저, 화면 캡처에 남기지 않습니다.

이 토큰은 NAS가 `web/content/archive.json`을 읽고 새 기록 한 건을 누적 커밋할 때 사용합니다. 커밋의 push가 Pages 워크플로를 자동 실행합니다. 실제 토큰 호출은 이 PC에서 실행하지 않았으므로 NAS 설치 후 6번 절차로 확인해야 합니다.

## 5. NAS 설치 실행

NAS SSH 터미널에서 실행합니다.

```bash
cd /volume1/docker/war-archive-back
GITHUB_FRONT_TOKEN='발급한_토큰' sh nas-install.sh
```

설치 스크립트가 `.env`를 권한 제한 상태로 만들고 Compose 설정 검사, 이미지 빌드와 스케줄러 컨테이너 시작을 수행합니다.

설치 후 확인합니다.

```bash
docker compose ps
docker compose logs --tail=200 backend
```

## 6. GitHub Pages 자동 발행 확인

- [ ] GitHub 저장소의 **Actions** 탭에서 `Deploy front to GitHub Pages`를 수동 실행합니다.
- [ ] 빌드와 deploy 작업이 모두 성공하는지 확인합니다.
- [ ] GitHub Pages 주소를 열어 HTTPS로 표시되는지 확인합니다.
- [ ] front 저장소에 `web/content/archive.json`이 있는지 확인합니다.
- [ ] NAS 로그에서 publisher 오류가 없는지 확인합니다.
- [ ] 정보화 기록이 생긴 뒤 최대 40분 내 `archive: publish 기록ID` 커밋이 생기는지 확인합니다.
- [ ] 위 커밋의 push로 Pages Actions 실행이 추가되는지 확인합니다.
- [ ] 새 기록이 한 번에 한 건만 공개되는지 확인합니다.
- [ ] 이전 기록이 `archive.json`에 그대로 남아 누적되는지 확인합니다.

점검 명령:

```bash
docker compose logs -f --tail=200 backend
```

GitHub 호출이 `401`이면 토큰 값 또는 만료 여부, `403`이면 저장소 선택과 Contents 쓰기 권한, `404`이면 `GITHUB_FRONT_REPOSITORY`와 `web/content/archive.json` 경로, `409`이면 같은 파일의 동시 변경, `422`이면 `main` 브랜치와 파일 형식을 확인합니다.

## 7. 합법적 최대 수집을 위한 출처 등록 원칙

목표는 크롤링 속도를 무리하게 높이는 것이 아니라, 합법적으로 이용할 수 있고 신뢰 근거가 있는 출처를 최대한 많이 등록하는 것입니다. 최종적인 법적 판단은 서비스 운영 지역과 사용 방식에 따라 달라질 수 있으므로 애매한 대량 이용은 권리자 또는 법률 전문가에게 확인합니다.

### 우선 등록할 출처

- [ ] 법령, 판결, 정부·지자체가 작성한 공고와 공개 기록
- [ ] 공공누리 제1유형과 이용조건이 맞는 다른 공공누리 자료
- [ ] 한국저작권위원회 공유마당의 저작권 만료·기증 자료
- [ ] 국가기록원, 국사편찬위원회, 공공 박물관·도서관의 공개 사료
- [ ] 대학·학술기관의 오픈 액세스 자료와 공식 API
- [ ] 명시적인 CCL·오픈데이터 라이선스가 있는 자료

### 출처마다 직접 확인할 항목

- [ ] `robots.txt`에서 `WarArchiveBot` 또는 `*`에 대상 경로가 허용되는지 확인합니다.
- [ ] 이용약관에서 자동 수집, 대량 접근, 저장을 금지하지 않는지 확인합니다.
- [ ] 저작권 페이지에서 원문 저장·가공·공개 재게시 범위를 확인합니다.
- [ ] 라이선스 유형, 저작자, 출처표시 문구, 상업 이용 및 변경 허용 여부를 기록합니다.
- [ ] 공식 기관·1차 사료인지, 작성자와 발행일이 명확한지 확인합니다.
- [ ] 논쟁적 사건은 독립된 신뢰 출처 두 곳 이상으로 교차 검증합니다.
- [ ] 살아 있는 개인을 식별할 수 있는 정보, 연락처, 피해자 정보가 포함됐는지 확인합니다.
- [ ] 사이트가 제시한 API나 데이터 다운로드가 있으면 HTML 크롤링보다 우선합니다.
- [ ] 호출 간격은 사이트 명시값을 따르고, 명시값이 없으면 서버에 부담을 주지 않는 값부터 시작합니다.

`robots.txt` 허용은 접근 규칙이지 저작권 이용허락이 아닙니다. 반대로 robots 파일이 없더라도 이용약관·저작권·개인정보 검토는 생략하지 않습니다. 로그인, 유료벽, CAPTCHA, 접근 제한은 우회하지 않습니다.

### topics.json 등록 예시

```json
{
  "id": "official-source-1",
  "kind": "url",
  "url": "https://archive.example.org/history/document",
  "compliance": {
    "reviewedAt": "2026-07-12",
    "crawlAllowed": true,
    "termsUrl": "https://archive.example.org/terms",
    "copyrightUrl": "https://archive.example.org/copyright",
    "minIntervalMs": 3000,
    "notes": "공식 기관 1차 사료. 이용조건과 필요한 출처표시 문구 기록"
  }
}
```

등록 후 NAS 또는 개발 환경에서 실행합니다.

```bash
cd back
npm run build
npm run audit:sources
```

감사가 통과하지 않는 URL은 운영 수집에 넣지 않습니다. 허용 출처 수를 늘려 수집량을 확대하고, 한 사이트의 호출 빈도를 공격적으로 올리는 방식은 사용하지 않습니다.

## 8. 신뢰성 판정 기준

정보화 결과에는 가능한 한 원문 URL을 유지하고 다음 순서로 신뢰도를 판단합니다.

1. 동시대 1차 사료와 공식 기록
2. 공공 역사기관·박물관·도서관·대학의 검증 자료
3. 동료평가 논문과 전문 연구서
4. 출처가 명확하고 교차 검증된 보도·해설
5. 출처 불명 블로그·커뮤니티·생성형 AI 문장은 단독 근거로 사용하지 않음

서로 충돌하는 기록은 하나를 임의로 사실로 확정하지 않고 출처별 주장, 작성 시점, 이해관계와 불확실성을 함께 남깁니다.

## 9. 확인 기준 자료

- 저작권법 제7조 보호받지 못하는 저작물: https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0007&lsiSeq=270165&urlMode=lsScJoRltInfoR
- 한국저작권위원회 만료저작물 안내: https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200091
- 공공누리 이용조건 안내: https://www.kogl.or.kr/info/faqList.do?cPage=1&dataGroup=2&mstIdx=KOGL_005
- 개인정보 보호법 제2조: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030669293
- Robots Exclusion Protocol RFC 9309: https://www.rfc-editor.org/rfc/rfc9309.html
- GitHub Pages 사용자 지정 워크플로: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub 저장소 파일 생성·갱신 API: https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
- GitHub Fine-grained token 관리: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
