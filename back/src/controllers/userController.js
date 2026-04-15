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
      const profile = await userService.updateProfile(req.user.userId, {
        displayName: sanitizeString(displayName, 100),
        bio: sanitizeString(bio, 2000),
        avatarUrl: sanitizeString(avatarUrl, 500),
        favoriteEra: sanitizeString(favoriteEra, 100)
      });
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = userController;
