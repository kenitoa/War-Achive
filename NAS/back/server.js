const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const COOKIE_NAME = "wa_session";
const SESSION_DAYS = Math.max(1, Number(process.env.AUTH_SESSION_DAYS || 7));
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;
const PASSWORD_ITERATIONS = Math.max(100000, Number(process.env.AUTH_PASSWORD_ITERATIONS || 120000));
const AUTH_COOKIE_SECURE = String(process.env.AUTH_COOKIE_SECURE || "false").toLowerCase() === "true";
const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || "change-this-war-archive-secret";
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || "admin";
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admi";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://knowtowars.netlify.app";

function resolveDataDir() {
  const candidates = [
    process.env.DATA_DIR,
    path.resolve(__dirname, "data"),
    path.resolve(__dirname, "..", "data"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(process.env.DATA_DIR || path.resolve(__dirname, "..", "data"));
}

const DATA_DIR = resolveDataDir();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

let authPool;
let authStoreReady = false;
let authStorePromise;
let authStoreLastError = null;

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || "war_archive",
    user: process.env.MYSQL_USER || "war_archive",
    password: process.env.MYSQL_PASSWORD || "war_archive_password",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    namedPlaceholders: true,
    timezone: "Z",
  };
}

function getAuthPool() {
  if (!authPool) {
    authPool = mysql.createPool(mysqlConfig());
  }
  return authPool;
}

async function ensureAuthStore() {
  if (authStoreReady) return getAuthPool();
  if (authStorePromise) return authStorePromise;

  authStorePromise = (async () => {
    const pool = getAuthPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(80) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        password_hash VARCHAR(160) NOT NULL,
        password_salt VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY users_email_unique (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensureUserRoleColumn(pool);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token_hash CHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP NULL DEFAULT NULL,
        expires_at TIMESTAMP NOT NULL,
        PRIMARY KEY (token_hash),
        KEY user_sessions_user_id_idx (user_id),
        KEY user_sessions_expires_at_idx (expires_at),
        CONSTRAINT user_sessions_user_id_fk
          FOREIGN KEY (user_id) REFERENCES users (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await seedDefaultAdmin(pool);
    await pool.query("DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP()");
    authStoreReady = true;
    authStoreLastError = null;
    return pool;
  })();

  try {
    return await authStorePromise;
  } catch (error) {
    authStorePromise = null;
    authStoreReady = false;
    authStoreLastError = publicError(error);
    throw error;
  }
}

function publicError(error) {
  if (!error) return null;
  return {
    code: error.code || "ERROR",
    errno: error.errno,
    sqlState: error.sqlState,
    message: error.message || String(error),
  };
}

async function checkAuthStore() {
  const config = mysqlConfig();
  try {
    const pool = await ensureAuthStore();
    await pool.query("SELECT 1");
    return {
      ok: true,
      ready: authStoreReady,
      mysql: {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
      },
    };
  } catch (error) {
    return {
      ok: false,
      ready: authStoreReady,
      mysql: {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
      },
      error: publicError(error),
    };
  }
}

async function ensureUserRoleColumn(pool) {
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'role'
      LIMIT 1`,
  );
  if (!columns.length) {
    await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user' AFTER name");
  }
}

async function seedDefaultAdmin(pool) {
  const email = String(DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const name = String(DEFAULT_ADMIN_NAME).trim() || "admin";
  const password = String(DEFAULT_ADMIN_PASSWORD);
  if (!email || !password) return;

  const { hash, salt } = hashPassword(password);
  await pool.execute(
    `INSERT INTO users (email, name, role, password_hash, password_salt)
     VALUES (?, ?, 'admin', ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       role = 'admin',
       password_hash = VALUES(password_hash),
       password_salt = VALUES(password_salt)`,
    [email, name, hash, salt],
  );
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function cookieHeader(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (AUTH_COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}

function clearCookieHeader(name) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (AUTH_COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}

function hashToken(token) {
  return crypto.createHmac("sha256", AUTH_COOKIE_SECRET).update(token).digest("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, "sha512").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, "sha512");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    role: row.role || "user",
    createdAt: row.created_at,
  };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function validateEmail(email) {
  return typeof email === "string" && email.length >= 3 && email.length <= 255 && !/\s/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 4 && password.length <= 128;
}

async function findSessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const pool = await ensureAuthStore();
  const tokenHash = hashToken(token);
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.name, u.role, u.created_at
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [tokenHash],
  );
  if (!rows.length) return null;
  await pool.execute("UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?", [tokenHash]);
  return sanitizeUser(rows[0]);
}

async function createSession(res, userId) {
  const pool = await ensureAuthStore();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.execute(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [tokenHash, userId, expiresAt],
  );
  res.setHeader("Set-Cookie", cookieHeader(COOKIE_NAME, token, SESSION_MAX_AGE_SECONDS));
}

async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) {
    const pool = await ensureAuthStore();
    await pool.execute("DELETE FROM user_sessions WHERE token_hash = ?", [hashToken(token)]);
  }
  res.setHeader("Set-Cookie", clearCookieHeader(COOKIE_NAME));
}

async function handleAuthApi(req, res, url) {
  try {
    if (url.pathname === "/api/auth/health") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const auth = await checkAuthStore();
      return sendJson(res, auth.ok ? 200 : 503, { ok: auth.ok, auth });
    }

    if (url.pathname === "/api/auth/me") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const user = await findSessionUser(req);
      if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });
      return sendJson(res, 200, { ok: true, user });
    }

    if (url.pathname === "/api/auth/register") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = body.password;

      if (!validateEmail(email)) {
        return sendJson(res, 400, { ok: false, error: "이메일 또는 로그인 ID를 3~255자로 입력해 주세요." });
      }
      if (!name || name.length > 80) {
        return sendJson(res, 400, { ok: false, error: "이름은 1~80자로 입력해 주세요." });
      }
      if (!validatePassword(password)) {
        return sendJson(res, 400, { ok: false, error: "비밀번호는 4~128자로 입력해 주세요." });
      }

      const pool = await ensureAuthStore();
      const { hash, salt } = hashPassword(password);
      try {
        const [result] = await pool.execute(
          "INSERT INTO users (email, name, role, password_hash, password_salt) VALUES (?, ?, 'user', ?, ?)",
          [email, name, hash, salt],
        );
        await createSession(res, result.insertId);
        return sendJson(res, 201, { ok: true, user: { id: Number(result.insertId), email, name, role: "user" } });
      } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
          return sendJson(res, 409, { ok: false, error: "이미 가입된 이메일입니다." });
        }
        throw error;
      }
    }

    if (url.pathname === "/api/auth/login") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = body.password;

      if (!validateEmail(email) || typeof password !== "string") {
        return sendJson(res, 400, { ok: false, error: "이메일 또는 로그인 ID와 비밀번호를 확인해 주세요." });
      }

      const pool = await ensureAuthStore();
      const [rows] = await pool.execute(
        "SELECT id, email, name, role, password_hash, password_salt, created_at FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
        return sendJson(res, 401, { ok: false, error: "이메일 또는 비밀번호가 맞지 않습니다." });
      }

      await createSession(res, user.id);
      return sendJson(res, 200, { ok: true, user: sanitizeUser(user) });
    }

    if (url.pathname === "/api/auth/logout") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      await destroySession(req, res);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { ok: false, error: "API not found" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500 ? "Authentication service error" : error.message;
    console.error("[auth]", error);
    return sendJson(res, statusCode, { ok: false, error: message });
  }
}

function sendFile(req, res, filePath) {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=300",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: "Failed to read file" });
      } else {
        res.destroy();
      }
    });
  });
}

function resolveDataPath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPathname.replace(/^\/data\/?/, "");
  if (!relativePath) return null;

  const filePath = path.resolve(DATA_DIR, relativePath);

  if (!filePath.startsWith(DATA_DIR + path.sep) && filePath !== DATA_DIR) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "war-archive-backend",
      authStoreReady,
      authStoreLastError,
      frontendOrigin: FRONTEND_ORIGIN,
      dataDir: DATA_DIR,
    });
    return;
  }

  if (url.pathname === "/") {
    sendJson(res, 200, {
      ok: true,
      service: "war-archive-backend",
      frontendOrigin: FRONTEND_ORIGIN,
      routes: ["/health", "/api/auth/*", "/data/*"],
    });
    return;
  }

  if (url.pathname.startsWith("/api/auth/")) {
    handleAuthApi(req, res, url);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendMethodNotAllowed(res);
    return;
  }

  if (!url.pathname.startsWith("/data/")) {
    sendJson(res, 404, { ok: false, error: "Backend route not found. Use Netlify for frontend pages." });
    return;
  }

  const filePath = resolveDataPath(req.url || "/");
  if (!filePath) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }
  sendFile(req, res, filePath);
});

ensureAuthStore().catch((error) => {
  console.warn("[auth] MySQL is not ready yet. Auth API will retry on demand.", error.message);
});

server.listen(PORT, HOST, () => {
  console.log(`War Archive backend listening on http://${HOST}:${PORT}`);
  console.log(`Serving data from ${DATA_DIR}`);
  console.log(`Frontend origin is ${FRONTEND_ORIGIN}`);
});
