// ── War Archive - API Helper ──
// API baseURL + 토큰 자동 첨부

const API = {
  baseURL: '/api',

  /**
   * 인증 토큰을 포함한 fetch wrapper
   */
  async request(endpoint, options = {}) {
    const url = this.baseURL + endpoint;
    const token = localStorage.getItem('accessToken');

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    // 401 응답 시 토큰 갱신 시도
    if (response.status === 401 && token) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = 'Bearer ' + localStorage.getItem('accessToken');
        return fetch(url, { ...options, headers });
      }
    }

    return response;
  },

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  /**
   * Refresh token으로 새 access token 발급
   */
  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const res = await fetch(this.baseURL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }
};
