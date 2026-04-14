const lockfile = require('proper-lockfile');

/**
 * 파일에 대한 잠금(lock)을 획득
 * JSON 동시 쓰기 방지용
 */
exports.acquireLock = async (filePath) => {
  try {
    await lockfile.lock(filePath, { retries: { retries: 5, minTimeout: 100 } });
  } catch (err) {
    const error = new Error('Failed to acquire file lock');
    error.status = 503;
    throw error;
  }
};

/**
 * 파일 잠금 해제
 */
exports.releaseLock = async (filePath) => {
  try {
    await lockfile.unlock(filePath);
  } catch {
    // 이미 해제된 경우 무시
  }
};
