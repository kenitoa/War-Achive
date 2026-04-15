const User = require('../models/User');
const Profile = require('../models/Profile');

const userService = {
  async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const err = new Error('사용자를 찾을 수 없습니다.');
      err.statusCode = 404;
      throw err;
    }
    const profile = await Profile.findByUserId(userId);
    return { ...user, profile: profile || null };
  },

  async updateProfile(userId, { displayName, bio, avatarUrl, favoriteEra }) {
    await Profile.upsert({ userId, displayName, bio, avatarUrl, favoriteEra });
    return Profile.findByUserId(userId);
  }
};

module.exports = userService;
