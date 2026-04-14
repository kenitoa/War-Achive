const authService = require('../services/authService');

exports.register = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.register(username, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { username } = req.body;
    await authService.deleteAccount(username);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
};
