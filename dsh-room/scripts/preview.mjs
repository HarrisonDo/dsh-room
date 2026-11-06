#!/usr/bin/env node
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULT_PORT = 18766;
const WEB_ROOT = fileURLToPath(new URL('../web/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

export async function startPreview({ port = DEFAULT_PORT, root = WEB_ROOT } = {}) {
  const base = await realpath(root);
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return send(400, 'Bad URL'); }
    if (pathname === '/__roomkit_health') return send(200, JSON.stringify({ app: 'dsh-room', version: 1 }), 'application/json');
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(base, '.' + rel);
    if (!file.startsWith(base + path.sep)) return send(403, 'Forbidden');
    try {
      const resolved = await realpath(file);
      if (!resolved.startsWith(base + path.sep)) return send(403, 'Forbidden');
      if (!(await stat(resolved)).isFile()) return send(404, 'Not found');
      send(200, await readFile(resolved), MIME[path.extname(resolved)] || 'application/octet-stream');
    } catch { send(404, 'Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startPreview({ port: Number(process.env.ROOMKIT_PORT || DEFAULT_PORT) });
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`大肥鱼的房间：${url}\n仅本机可访问；按 Ctrl+C 停止。`);
    if (process.send) process.send({ url });
  } catch (error) { console.error(`预览启动失败：${error.message}`); process.exitCode = 1; }
}
