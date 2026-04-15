const db = require('../config/database');

const User = {
  async findByEmail(email) {
    const [rows] = await db.query(
      'SELECT * FROM user_logindata WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0] || null;
  },

  async findById(userId) {
    const [rows] = await db.query(
      'SELECT user_id, username, email, role, is_active, created_at FROM user_logindata WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async create({ username, email, passwordHash, role = 'user' }) {
    const [result] = await db.query(
      'INSERT INTO user_logindata (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );
    return result.insertId;
  },

  async updatePassword(userId, passwordHash) {
    await db.query(
      'UPDATE user_logindata SET password_hash = ? WHERE user_id = ?',
      [passwordHash, userId]
    );
  },

  async deactivate(userId) {
    await db.query(
      'UPDATE user_logindata SET is_active = 0 WHERE user_id = ?',
      [userId]
    );
  }
};

module.exports = User;
