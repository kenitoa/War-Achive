import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../out/', import.meta.url)));
const flagIndex = process.argv.indexOf('--port');
const port = Number(flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.PORT ?? '3000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('올바른 포트가 필요합니다.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer((request, response) => {
  let decoded;
  try { decoded = decodeURIComponent((request.url ?? '/').split('?')[0]); }
  catch { response.writeHead(400).end('Invalid URL'); return; }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(segment => segment === '..' || segment === '.')) { response.writeHead(400).end('Invalid path'); return; }
  let target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) { response.writeHead(400).end('Invalid path'); return; }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    const missing = path.join(root, '404.html');
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.existsSync(missing) ? fs.readFileSync(missing) : 'Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': decoded.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  if (request.method === 'HEAD') { response.end(); return; }
  fs.createReadStream(target).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`정적 공개본 미리보기 http://127.0.0.1:${port}`));
