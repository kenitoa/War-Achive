const fs = require('fs/promises');
const path = require('path');
const { acquireLock, releaseLock } = require('../utils/fileLock');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * 카테고리 이름으로 data 하위 폴더 경로를 반환
 */
function resolveDataPath(category, id) {
  // category, id 에 경로 탈출 문자가 없는지 검증
  if (/[\/\\\.]{2,}/.test(category) || /[\/\\\.]{2,}/.test(id)) {
    const err = new Error('Invalid path parameter');
    err.status = 400;
    throw err;
  }
  return path.join(DATA_DIR, category, `${id}.json`);
}

exports.readJSON = async (category, id) => {
  const filePath = resolveDataPath(category, id);
  // 경로가 DATA_DIR 안에 있는지 확인 (path traversal 방지)
  if (!filePath.startsWith(DATA_DIR)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      const err = new Error('Data not found');
      err.status = 404;
      throw err;
    }
    throw e;
  }
};

exports.writeJSON = async (category, id, data) => {
  const filePath = resolveDataPath(category, id);
  if (!filePath.startsWith(DATA_DIR)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  await acquireLock(filePath);
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } finally {
    await releaseLock(filePath);
  }
};
