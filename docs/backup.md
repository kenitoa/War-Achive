# War Archive - 백업 가이드

## 백업 대상

| 대상 | 위치 | 백업 경로 | 주기 |
|------|------|-----------|------|
| MySQL DB | Docker 볼륨 | `backup/db/` | 매일 |
| 업로드 파일 | `data/uploads/` | `backup/uploads/` | 매일 |
| 설정 파일 | `infra/.env`, `docker-compose.yml` | `backup/settings/` | 변경 시 |

## 자동 백업 설정

### 백업 스크립트 실행

```bash
cd /path/to/War\ Archive/infra
bash scripts/backup.sh
```

### Cron 등록 (매일 새벽 3시)

```bash
crontab -e
# 추가할 내용:
0 3 * * * /path/to/War\ Archive/infra/scripts/backup.sh >> /var/log/wararchive-backup.log 2>&1
```

### Synology DSM 작업 스케줄러

1. DSM > 제어판 > 작업 스케줄러
2. 생성 > 예약된 작업 > 사용자 정의 스크립트
3. 일정: 매일 03:00
4. 실행 명령: `bash /volume1/docker/War\ Archive/infra/scripts/backup.sh`

## 수동 백업

### DB만 백업

```bash
docker exec wararchive-mysql mysqldump \
  -u wararchive -p war_archive > backup/db/manual_$(date +%Y%m%d).sql
```

### 전체 프로젝트 백업

```bash
tar -czf /volume1/backup/wararchive_full_$(date +%Y%m%d).tar.gz \
  --exclude='*/node_modules' \
  --exclude='*/mysql_data' \
  /path/to/War\ Archive/
```

## 복원

### DB 복원

```bash
docker exec -i wararchive-mysql mysql \
  -u wararchive -p war_archive < backup/db/war_archive_YYYYMMDD_HHMMSS.sql
```

### 업로드 파일 복원

```bash
tar -xzf backup/uploads/uploads_YYYYMMDD_HHMMSS.tar.gz -C data/
```

## 보관 정책

- DB 백업: **30일** 보관 후 자동 삭제
- 업로드 백업: **30일** 보관 후 자동 삭제
- 설정 백업: 수동 관리
