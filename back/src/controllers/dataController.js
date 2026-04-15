const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PRIVATE_JSON_DIR = process.env.PRIVATE_JSON_DIR || '/app/data/private-json';

const dataController = {
  /**
   * GET /api/data/:category
   * private-json 디렉토리의 비공개 데이터 조회
   */
  async getCategory(req, res, next) {
    try {
      const category = req.params.category.replace(/[^a-zA-Z0-9_-]/g, '');
      const dirPath = path.join(PRIVATE_JSON_DIR, category);

      if (!fs.existsSync(dirPath)) {
        return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
      }

      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const content = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8'));
          return { filename: f, ...content };
        });

      res.json(files);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/data/:category/:id
   * 개별 항목 조회
   */
  async getItem(req, res, next) {
    try {
      const category = req.params.category.replace(/[^a-zA-Z0-9_-]/g, '');
      const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(PRIVATE_JSON_DIR, category, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
      }

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.json(content);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/data/:category
   * 새 데이터 항목 생성 (editor/admin 전용)
   */
  async createItem(req, res, next) {
    try {
      const category = req.params.category.replace(/[^a-zA-Z0-9_-]/g, '');
      const { id, ...data } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id 필드가 필요합니다.' });
      }

      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
      const dirPath = path.join(PRIVATE_JSON_DIR, category);
      const filePath = path.join(dirPath, `${safeId}.json`);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: '이미 존재하는 항목입니다.' });
      }

      fs.writeFileSync(filePath, JSON.stringify({ id: safeId, ...data }, null, 2), 'utf-8');
      logger.info(`데이터 생성: ${category}/${safeId}`);
      res.status(201).json({ message: '항목이 생성되었습니다.', id: safeId });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = dataController;
