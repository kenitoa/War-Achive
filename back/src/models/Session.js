const db = require('../config/database');
const crypto = require('crypto');

const Session = {
  async create({ userId, ipAddress, userAgent, expiresAt }) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, sessionToken, ipAddress, userAgent, expiresAt]
    );
    return sessionToken;
  },

  async findByToken(token) {
    const [rows] = await db.query(
      `SELECT * FROM user_sessions
       WHERE session_token = ? AND is_valid = 1 AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    return rows[0] || null;
  },

  async invalidate(token) {
    await db.query(
      'UPDATE user_sessions SET is_valid = 0 WHERE session_token = ?',
      [token]
    );
  },

  async invalidateAllForUser(userId) {
    await db.query(
      'UPDATE user_sessions SET is_valid = 0 WHERE user_id = ?',
      [userId]
    );
  },

  async cleanExpired() {
    await db.query(
      'DELETE FROM user_sessions WHERE expires_at < NOW() OR is_valid = 0'
    );
  }
};

module.exports = Session;
