const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// ── 보안 헤더 ──
app.use(helmet());

// ── CORS (WebStation 프론트엔드 허용) ──
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── 요청 파싱 ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── 로깅 ──
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// ── 헬스체크 ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API 라우트 ──
app.use('/api', routes);

// ── 에러 핸들링 ──
app.use(errorHandler);

// ── 서버 시작 ──
app.listen(config.port, '0.0.0.0', () => {
  logger.info(`War Archive API 서버 시작 - 포트 ${config.port}`);
});

module.exports = app;
