const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// ── 보안 헤더 (API 서버용 - CSP는 HTML 미서빙이므로 비활성화) ──
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ── CORS (WebStation 프론트엔드 허용) ──
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// ── 프록시 신뢰 (nginx 뒤에서 실행) ──
app.set('trust proxy', config.trustProxy);

// ── 요청 파싱 ──
app.use(express.json({ limit: '1mb' }));

// ── 알 수 없는 Content-Type 차단 ──
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'OPTIONS') {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json') && !ct.includes('multipart/form-data')) {
      return res.status(415).json({ error: '지원하지 않는 Content-Type입니다.' });
    }
  }
  next();
});

// ── 로깅 ──
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// ── 헬스체크 ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── API 라우트 ──
app.use('/api', routes);

// ── 에러 핸들링 ──
app.use(errorHandler);

// ── 404 핸들링 ──
app.use((_req, res) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
});

// ── 서버 시작 ──
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`War Archive API 서버 시작 - 포트 ${config.port}`);
});

// ── 종료 시그널 처리 ──
const shutdown = () => {
  logger.info('서버 종료 시작...');
  server.close(() => {
    logger.info('서버 종료 완료');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
