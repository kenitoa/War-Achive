const User = require('../models/User');
const Session = require('../models/Session');
const db = require('../config/database');
const { hashPassword, comparePassword, sha256, isBcryptHash } = require('../utils/hash');
const { generateToken } = require('../utils/token');
const logger = require('../utils/logger');

const authService = {
  /**
   * 회원가입
   */
  async register({ username, email, password }) {
    const existing = await User.findByEmail(email);
    if (existing) {
      const err = new Error('이미 등록된 이메일입니다.');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await hashPassword(password);
    const userId = await User.create({ username, email, passwordHash });
    logger.info(`새 사용자 등록: ${email}`);
    return userId;
  },

  /**
   * 로그인
   * SHA-256 레거시 해시 → bcrypt 자동 마이그레이션 포함
   */
  async login({ email, password, ipAddress, userAgent }) {
    const user = await User.findByEmail(email);

    // 로그인 시도 기록
    await this._recordAttempt(email, ipAddress, false);

    if (!user || !user.is_active) {
      const err = new Error('이메일 또는 비밀번호가 잘못되었습니다.');
      err.statusCode = 401;
      throw err;
    }

    // 브루트포스 체크
    await this._checkBruteForce(email, ipAddress);

    let passwordValid = false;

    if (isBcryptHash(user.password_hash)) {
      passwordValid = await comparePassword(password, user.password_hash);
    } else {
      // SHA-256 레거시 호환
      passwordValid = sha256(password) === user.password_hash;
      if (passwordValid) {
        // bcrypt로 자동 마이그레이션
        const newHash = await hashPassword(password);
        await User.updatePassword(user.user_id, newHash);
        logger.info(`비밀번호 해시 마이그레이션 완료: ${email}`);
      }
    }

    if (!passwordValid) {
      const err = new Error('이메일 또는 비밀번호가 잘못되었습니다.');
      err.statusCode = 401;
      throw err;
    }

    // 성공 기록
    await this._recordAttempt(email, ipAddress, true);

    // JWT 토큰 발급
    const token = generateToken({
      userId: user.user_id,
      email: user.email,
      role: user.role
    });

    // DB 세션 생성
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const sessionToken = await Session.create({
      userId: user.user_id,
      ipAddress,
      userAgent,
      expiresAt
    });

    logger.info(`로그인 성공: ${email}`);

    return {
      token,
      sessionToken,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };
  },

  /**
   * 로그아웃
   */
  async logout(sessionToken) {
    if (sessionToken) {
      await Session.invalidate(sessionToken);
    }
  },

  /**
   * 로그인 시도 기록
   */
  async _recordAttempt(email, ipAddress, success) {
    await db.query(
      'INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, ?)',
      [email, ipAddress, success ? 1 : 0]
    );
  },

  /**
   * 브루트포스 공격 확인 (15분 내 5회 실패)
   */
  async _checkBruteForce(email, ipAddress) {
    const [rows] = await db.query(
      `SELECT COUNT(*) as cnt FROM login_attempts
       WHERE (email = ? OR ip_address = ?)
         AND success = 0
         AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [email, ipAddress]
    );
    if (rows[0].cnt >= 5) {
      const err = new Error('너무 많은 로그인 시도입니다. 15분 후 다시 시도해주세요.');
      err.statusCode = 429;
      throw err;
    }
  }
};

module.exports = authService;
