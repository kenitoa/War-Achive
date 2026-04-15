# War Archive - API 명세

## 기본 정보

- **Base URL**: `http://<NAS-IP>:8080/api`
- **인증**: Bearer Token (JWT)
- **Content-Type**: `application/json`

---

## 인증 API

### POST /api/auth/register

회원가입

**Request Body:**
```json
{
  "username": "string (2~50자)",
  "email": "string (유효한 이메일)",
  "password": "string (8자 이상)"
}
```

**Response (201):**
```json
{
  "message": "회원가입이 완료되었습니다.",
  "userId": 2
}
```

**에러:**
- `400` - 유효성 검증 실패
- `409` - 이미 등록된 이메일

---

### POST /api/auth/login

로그인 (Rate Limit: 15분당 10회)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "sessionToken": "abc123...",
  "user": {
    "userId": 1,
    "username": "kiseno",
    "email": "kiseno@gmail.com",
    "role": "admin"
  }
}
```

**에러:**
- `401` - 이메일/비밀번호 불일치
- `429` - 브루트포스 차단

---

### POST /api/auth/logout

로그아웃 (인증 필요)

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "sessionToken": "abc123..."
}
```

**Response (200):**
```json
{
  "message": "로그아웃되었습니다."
}
```

---

### GET /api/auth/me

현재 사용자 정보 (인증 필요)

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user": {
    "userId": 1,
    "email": "kiseno@gmail.com",
    "role": "admin"
  }
}
```

---

## 사용자 API

### GET /api/users/profile

내 프로필 조회 (인증 필요)

**Response (200):**
```json
{
  "user_id": 1,
  "username": "kiseno",
  "email": "kiseno@gmail.com",
  "role": "admin",
  "profile": {
    "display_name": "kiseno",
    "bio": "War Archive 프로젝트 관리자",
    "avatar_url": null,
    "favorite_era": null
  }
}
```

---

### PUT /api/users/profile

프로필 수정 (인증 필요)

**Request Body:**
```json
{
  "displayName": "새 표시 이름",
  "bio": "소개 텍스트",
  "avatarUrl": "https://...",
  "favoriteEra": "제2차 세계대전"
}
```

---

## 데이터 API

### GET /api/data/:category

카테고리별 비공개 데이터 조회 (인증 필요)

### GET /api/data/:category/:id

개별 항목 조회 (인증 필요)

### POST /api/data/:category

새 항목 생성 (editor/admin 전용)

**Request Body:**
```json
{
  "id": "item-id",
  "title": "제목",
  "content": "내용..."
}
```

---

## 헬스체크

### GET /health

```json
{
  "status": "ok",
  "timestamp": "2026-04-15T00:00:00.000Z"
}
```

---

## 에러 응답 형식

```json
{
  "error": "에러 메시지"
}
```

| 코드 | 의미 |
|------|------|
| 400 | 잘못된 요청 |
| 401 | 인증 필요/실패 |
| 403 | 권한 부족 |
| 404 | 리소스 없음 |
| 409 | 충돌 (중복) |
| 429 | 요청 한도 초과 |
| 500 | 서버 내부 오류 |
