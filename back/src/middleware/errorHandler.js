const logger = require('../utils/logger');

function errorHandler(err, _req, res, _next) {
  logger.error(err.stack || err.message);

  const status = err.statusCode || 500;
  const message = status === 500 ? '서버 내부 오류가 발생했습니다.' : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
