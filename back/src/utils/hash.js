const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

/**
 * bcrypt 해시 생성
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * bcrypt 해시 비교
 */
async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * SHA-256 해시 (레거시 호환)
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * SHA-256 → bcrypt 마이그레이션 판별
 * bcrypt 해시는 $2b$ 또는 $2a$ 로 시작
 */
function isBcryptHash(hash) {
  return /^\$2[aby]\$/.test(hash);
}

module.exports = { hashPassword, comparePassword, sha256, isBcryptHash };
