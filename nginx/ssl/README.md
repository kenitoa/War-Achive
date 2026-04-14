# SSL 인증서 디렉토리
이 디렉토리에 SSL 인증서 파일을 배치하세요.

## 필요한 파일
- `cert.pem` — SSL 인증서 (Let's Encrypt 또는 Synology DSM에서 발급)
- `key.pem` — 개인 키

## 주의사항
- 두 파일 모두 `.gitignore`에 등록되어 있으므로 Git에 커밋되지 않습니다.
- 절대로 개인 키(`key.pem`)를 공개 리포지토리에 업로드하지 마세요.
