require('dotenv').config({ path: process.env.ENV_PATH || '/app/.env' });

// production 환경에서 JWT_SECRET 미설정 시 기동 차단
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'mysql',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'wararchive',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'war_archive',
    connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'https://localhost'
  },

  trustProxy: process.env.TRUST_PROXY || 1,

  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE, 10) || 5 * 1024 * 1024,
    dest: process.env.UPLOAD_DEST || '/app/data/uploads'
  },

  log: {
    dir: process.env.LOG_DIR || '/app/data/logs'
  }
};
