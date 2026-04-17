const mysql = require('mysql2/promise');
const config = require('./index');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  charset: 'utf8mb4',
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

pool.getConnection()
  .then(conn => {
    logger.info('MySQL 연결 성공');
    conn.release();
  })
  .catch(err => {
    logger.error('MySQL 연결 실패');
  });

module.exports = pool;
