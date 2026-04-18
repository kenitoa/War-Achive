# War Archive - 배포 가이드

## 사전 요구 사항

- Synology NAS (DSM 7.x 이상)
- Docker & Docker Compose 설치
- WebStation 패키지 설치
- Node.js 20+ (빌드 시)

## 초기 배포

### 1. 프로젝트 업로드

NAS의 원하는 경로에 프로젝트를 업로드합니다.

```
예: /volume1/docker/War Archive/
```

### 2. 환경 변수 설정

```bash
cd /volume1/docker/War\ Archive/infra
cp .env .env.backup

# .env 파일 편집 - 반드시 변경해야 할 값들:
nano .env
```

**필수 변경 항목:**
```env
DB_ROOT_PASSWORD=<강력한_루트_비밀번호>
DB_PASSWORD=<강력한_DB_비밀번호>
JWT_SECRET=<64자_이상_랜덤_문자열>
CORS_ORIGIN=http://<NAS_IP>:<WebStation_포트>
```

JWT_SECRET 생성:
```bash
openssl rand -hex 32
```

### 3. Docker 서비스 시작

```bash
cd /volume1/docker/War\ Archive/infra
bash scripts/deploy.sh
```

### 4. 서비스 확인

```bash
# 컨테이너 상태 확인
docker compose ps

# 헬스체크
curl http://localhost:8080/health

# 로그 확인
docker compose logs -f backend
```

### 5. WebStation 설정

1. DSM > WebStation 열기
2. 웹 서비스 포털 > 생성
3. 서비스: 정적 웹사이트
4. 문서 루트: `front` 폴더 경로
5. 포트 지정 (예: 80 또는 원하는 포트)
6. 적용

### 6. 프론트엔드 API 연결 설정

프론트엔드 JavaScript에서 API 주소를 백엔드 주소로 설정:

```javascript
const API_BASE = 'http://<NAS_IP>:8080/api';
```

## 업데이트 배포

```bash
cd /volume1/docker/War\ Archive/infra

# 백업 먼저
bash scripts/backup.sh

# 재빌드 및 재시작
docker compose build --no-cache backend
docker compose up -d
```

## 트러블슈팅

### 컨테이너가 시작되지 않음

```bash
docker compose logs mysql      # DB 로그 확인
docker compose logs backend    # 백엔드 로그 확인
```

### DB 연결 실패

```bash
# MySQL 컨테이너 접속
docker exec -it wararchive-mysql mysql -u root -p

# 사용자/DB 확인
SHOW DATABASES;
SELECT user, host FROM mysql.user;
```

### CORS 에러

`.env` 파일의 `CORS_ORIGIN` 값이 WebStation URL과 정확히 일치하는지 확인:
```env
CORS_ORIGIN=http://192.168.1.100:80
```

### 포트 충돌

```bash
# 사용 중인 포트 확인
netstat -tlnp | grep -E '(3306|8080)'
```

`.env`에서 `NGINX_PORT`를 다른 값으로 변경:
```env
NGINX_PORT=8081
```

## 서비스 관리

```bash
cd /volume1/docker/War\ Archive/infra

# 시작
docker compose up -d

# 중지
docker compose down

# 재시작
docker compose restart

# 로그 실시간 확인
docker compose logs -f

# 특정 서비스만 재시작
docker compose restart backend
```
