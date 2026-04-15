const db = require('../config/database');

const Profile = {
  async findByUserId(userId) {
    const [rows] = await db.query(
      'SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async upsert({ userId, displayName, bio, avatarUrl, favoriteEra }) {
    await db.query(
      `INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, favorite_era)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         bio = VALUES(bio),
         avatar_url = VALUES(avatar_url),
         favorite_era = VALUES(favorite_era)`,
      [userId, displayName, bio, avatarUrl, favoriteEra]
    );
  }
};

module.exports = Profile;
