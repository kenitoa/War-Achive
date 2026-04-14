/**
 * War Archive 로컬 개발 서버
 * front/ + back/data/ 서빙 + /api 프록시
 * 사용법: node dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BACKEND_PORT = 3000;
const FRONT_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..'); // War Achive 루트 (back/data 접근용)

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  const decoded = decodeURIComponent(req.url.split('?')[0]);

  // /api → 백엔드 프록시
  if (req.url.startsWith('/api/')) {
    const opts = {
      hostname: 'localhost',
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: 'localhost:' + BACKEND_PORT }
    };
    const proxy = http.request(opts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    req.pipe(proxy);
    proxy.on('error', () => {
      res.writeHead(502);
      res.end('Backend not running');
    });
    return;
  }

  // 파일 경로 결정
  let filePath;
  if (decoded === '/') {
    filePath = path.join(FRONT_DIR, 'index.html');
  } else if (decoded.startsWith('/back/')) {
    // back/data 등 접근 허용 (Go Live 호환)
    filePath = path.join(ROOT_DIR, decoded);
  } else if (decoded.startsWith('/data/')) {
    // /data/* → back/data/* (배포 환경 호환)
    filePath = path.join(ROOT_DIR, 'back', decoded);
  } else {
    filePath = path.join(FRONT_DIR, decoded);
  }

  // 경로 탈출 방지
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
  console.log(`  / -> index.html`);
  console.log(`  /back/data/* -> back/data/*`);
  console.log(`  /api/* -> localhost:${BACKEND_PORT}`);
});
