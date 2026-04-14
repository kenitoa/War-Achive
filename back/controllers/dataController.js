const fileService = require('../services/fileService');

exports.getData = async (req, res, next) => {
  try {
    const { category, id } = req.params;
    const data = await fileService.readJSON(category, id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
