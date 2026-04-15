const authService = require('../services/authService');
const { isValidEmail, isValidPassword, isValidUsername } = require('../utils/validator');

const authController = {
  /**
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      const { username, email, password } = req.body;

      if (!isValidUsername(username)) {
        return res.status(400).json({ error: '사용자 이름은 2~50자여야 합니다.' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: '유효한 이메일 주소를 입력해주세요.' });
      }
      if (!isValidPassword(password)) {
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
      }

      const userId = await authService.register({ username, email, password });
      res.status(201).json({ message: '회원가입이 완료되었습니다.', userId });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      const result = await authService.login({ email, password, ipAddress, userAgent });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req, res, next) {
    try {
      const sessionToken = req.body.sessionToken;
      await authService.logout(sessionToken);
      res.json({ message: '로그아웃되었습니다.' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/me
   */
  async me(req, res, next) {
    try {
      res.json({ user: req.user });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = authController;
