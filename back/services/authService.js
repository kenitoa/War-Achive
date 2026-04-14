const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');
const { acquireLock, releaseLock } = require('../utils/fileLock');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;

const USERS_FILE = path.join(__dirname, '..', 'data', 'app', 'users.json');

// ── 유저 파일 읽기/쓰기 ──

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await acquireLock(USERS_FILE);
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } finally {
    await releaseLock(USERS_FILE);
  }
}

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

exports.register = async (username, password) => {
  const users = await readUsers();

  if (users.find(u => u.username === username)) {
    const err = new Error('이미 존재하는 사용자명입니다.');
    err.status = 409;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  users.push({
    username,
    hashedPassword,
    registeredAt: new Date().toISOString()
  });
  await writeUsers(users);

  const tokens = generateTokens(username);
  return { userId: username, ...tokens };
};

exports.login = async (username, password) => {
  const users = await readUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    const err = new Error('존재하지 않는 계정입니다.');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.hashedPassword);
  if (!valid) {
    const err = new Error('비밀번호가 올바르지 않습니다.');
    err.status = 401;
    throw err;
  }

  const tokens = generateTokens(username);
  return { userId: username, ...tokens };
};

exports.refresh = async (refreshToken) => {
  if (!refreshToken) {
    const err = new Error('Refresh token required');
    err.status = 400;
    throw err;
  }
  const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  const tokens = generateTokens(payload.userId);
  return tokens;
};

exports.verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

exports.deleteAccount = async (username) => {
  const users = await readUsers();
  const filtered = users.filter(u => u.username !== username);
  await writeUsers(filtered);
  return { deleted: true };
};
