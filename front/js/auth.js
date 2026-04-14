// ── War Archive - Auth Module ──
// 로그인/로그아웃 + 토큰 갱신 로직

const Auth = {
  /**
   * 로그인
   */
  async login(username, password) {
    const res = await API.post('/auth/login', { username, password });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || '로그인 실패');
    }

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('username', data.username || username);
    return data;
  },

  /**
   * 로그아웃
   */
  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');
    window.location.href = '/pages/login.html';
  },

  /**
   * 현재 로그인 여부
   */
  isLoggedIn() {
    return !!localStorage.getItem('accessToken');
  },

  /**
   * 현재 사용자명
   */
  getUsername() {
    return localStorage.getItem('username') || '';
  }
};
