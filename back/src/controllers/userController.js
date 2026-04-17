const userService = require('../services/userService');
const { sanitizeString } = require('../utils/validator');

const userController = {
  /**
   * GET /api/users/profile
   */
  async getProfile(req, res, next) {
    try {
      const data = await userService.getProfile(req.user.userId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/users/profile
   */
  async updateProfile(req, res, next) {
    try {
      const { displayName, bio, avatarUrl, favoriteEra } = req.body;

      // avatarUrl 기본 검증
      if (avatarUrl && typeof avatarUrl === 'string') {
        if (!/^https?:\/\//.test(avatarUrl)) {
          return res.status(400).json({ error: '유효한 URL을 입력해주세요.' });
        }
      }

      const profile = await userService.updateProfile(req.user.userId, {
        displayName: sanitizeString(displayName, 100),
        bio: sanitizeString(bio, 2000),
        avatarUrl: avatarUrl ? sanitizeString(avatarUrl, 500) : '',
        favoriteEra: sanitizeString(favoriteEra, 100)
      });
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = userController;
