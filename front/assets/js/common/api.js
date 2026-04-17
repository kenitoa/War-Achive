// ── War Archive - API Client ──
// backend API와 통신하는 공통 모듈

const API = (() => {
  // ※ 배포 시 실제 NAS 주소로 변경하세요
  // WebStation(front)과 Docker(backend)가 다른 포트이므로 절대 URL 필요
  // 예: Tailscale 사용 시 'https://your-nas.ts.net:8080/api'
  //     로컬 테스트 시 'http://192.168.x.x:8080/api'
  const BASE_URL = 'https://war-archive.tail498403.ts.net:8080/api';

  // ── 토큰 관리 ──
  function getToken() {
    return localStorage.getItem('warArchiveToken');
  }

  function setToken(token) {
    localStorage.setItem('warArchiveToken', token);
  }

  function removeToken() {
    localStorage.removeItem('warArchiveToken');
  }

  function getSessionToken() {
    return localStorage.getItem('warArchiveSessionToken');
  }

  function setSessionToken(token) {
    localStorage.setItem('warArchiveSessionToken', token);
  }

  function removeSessionToken() {
    localStorage.removeItem('warArchiveSessionToken');
  }

  // ── 현재 사용자 캐시 ──
  function setCurrentUser(user) {
    sessionStorage.setItem('warArchiveCurrentUser', JSON.stringify(user));
  }

  function getCurrentUser() {
    const data = sessionStorage.getItem('warArchiveCurrentUser');
    return data ? JSON.parse(data) : null;
  }

  function removeCurrentUser() {
    sessionStorage.removeItem('warArchiveCurrentUser');
  }

  // ── HTTP 요청 헬퍼 ──
  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const opts = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(BASE_URL + path, opts);
    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || '요청에 실패했습니다.');
      err.status = res.status;
      throw err;
    }

    return data;
  }

  // ── 인증 API ──
  async function login(email, password) {
    const data = await request('POST', '/auth/login', { email, password });
    setToken(data.token);
    setSessionToken(data.sessionToken);
    setCurrentUser(data.user);
    return data.user;
  }

  async function register(username, email, password) {
    return request('POST', '/auth/register', { username, email, password });
  }

  async function logout() {
    const sessionToken = getSessionToken();
    try {
      await request('POST', '/auth/logout', { sessionToken });
    } catch (e) {
      // 로그아웃 실패해도 로컬 정리
    }
    removeToken();
    removeSessionToken();
    removeCurrentUser();
  }

  async function getMe() {
    return request('GET', '/auth/me');
  }

  // ── 사용자 API ──
  async function getProfile() {
    return request('GET', '/users/profile');
  }

  async function updateProfile(profileData) {
    return request('PUT', '/users/profile', profileData);
  }

  // ── 로그인 상태 확인 ──
  function isLoggedIn() {
    return !!getToken();
  }

  return {
    login,
    register,
    logout,
    getMe,
    getProfile,
    updateProfile,
    isLoggedIn,
    getCurrentUser,
    setCurrentUser,
    removeCurrentUser,
    getToken
  };
})();
