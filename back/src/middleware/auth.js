const { verifyToken } = require('../utils/token');
const logger = require('../utils/logger');

/**
 * JWT 인증 미들웨어
 * Authorization: Bearer <token>
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('토큰 검증 실패:', err.message);
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

/**
 * 역할 기반 접근 제어
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
