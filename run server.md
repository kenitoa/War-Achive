# War Archive 로컬 실행 가이드

## Docker 없이 로컬에서 실행하기

### 1. 백엔드 서버 실행
```bash
cd back
set JWT_SECRET=test-secret
set JWT_REFRESH_SECRET=test-refresh-secret
set PORT=3000
node server.js
```

PowerShell의 경우:
```powershell
cd back
$env:JWT_SECRET='test-secret'
$env:JWT_REFRESH_SECRET='test-refresh-secret'
$env:PORT='3000'
node server.js
```

> 실행 후 `Server running on port 3000` 메시지가 나오면 성공

### 2. 프론트엔드 프록시 서버 실행 (새 터미널에서)
```powershell
node front/dev-server.js
```

> 실행 후 `Dev server: http://localhost:8080` 메시지가 나오면 성공

### 3. 브라우저에서 접속
- 메인 페이지: http://localhost:8080
- 로그인/회원가입: http://localhost:8080/pages/login.html

## 주의사항

- **Go Live (Live Server)로는 동작하지 않음** — `/api/` 요청을 백엔드로 프록시하는 기능이 없기 때문
- 반드시 **터미널 2개** 필요 (백엔드 1개 + 프론트 프록시 1개)
- 터미널을 닫으면 서버도 종료됨, 열어둔 상태로 유지할 것

## Docker로 실행하기 (Synology NAS 등)
```bash
docker compose up -d --build
```

## 진단 스크립트
```bash
node test-backend.js
```
Docker 없이 백엔드 API(회원가입, 로그인)가 정상 동작하는지 확인하는 스크립트.
