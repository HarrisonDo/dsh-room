/**
 * dsh-room · 宿主半侧（DSH 宿主进程内的 Cordis 插件）。
 *
 *   · /plugins/dsh-room/web/*  —— 把 web/ 挂成静态路由（贴图、真模型 whale-rig.js、iframe/桌面壳都用它）。
 *     dsh-client-modules 占着 /plugins 前缀，webServer 最长前缀优先，所以这里更长的前缀不冲突。
 *   · /plugins/dsh-room/api/store —— 场景存盘：一个 JSON 键值表，落在 $DSH_HOME/storages/dsh-room/store.json，
 *     多个浏览器/桌面端共享同一间房。GET 取全部；PUT {key, value}（value 为 null 即删除）。
 *   · /api/dsh-room.<endpoint>（ctx.connection.fetch：挂在 DSH 自己的 /api 下，同一套浏览器鉴权与 Host/Origin 校验，
 *     桌面版经 dsh-app 协议转发同样带凭据）：status 工作状态 + 领命令 · chat 和角色聊天（调模型）· tools 开关 Agent 工具。
 *     会花钱、能驱动房间的接口只走这里；webServer 的路由本身不带鉴权，所以上面两条只做本机来源校验、不放敏感能力。
 */
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';
import { WorkStatus } from './work-status.js';
import { createChat } from './chat.js';
import { RoomLink, roomTools } from './agent-tools.js';

export const name = 'dsh-room';
export const inject = ['webServer'];

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const STATIC = '/plugins/dsh-room/web';
const API = '/plugins/dsh-room/api/store';
const INFO = '/plugins/dsh-room/api/info';
const API_PREFIX = '/api/dsh-room.';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const MAX_BODY = 8 * 1024 * 1024;

function dataFile(file) {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh');
  return path.join(home, 'storages', 'dsh-room', file);
}
const storeFile = () => dataFile('store.json');

async function readStore() {
  try { return JSON.parse(await readFile(storeFile(), 'utf8')) || {}; } catch (e) { return {}; }
}

/* 写入串行化 + 先写临时文件再改名，避免并发 PUT 互相覆盖或写坏文件 */
let chain = Promise.resolve();
function updateStore(fn) {
  chain = chain.then(async () => {
    const data = await readStore();
    fn(data);
    const file = storeFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(data));
    await rename(file + '.tmp', file);
  });
  return chain;
}

/** 防 DNS 重绑定和跨站：Host 必须是本机，带 Origin 时必须同源（webServer 不做来源校验，见 dsh-host-webserver 文档） */
export function isLocalRequest(req) {
  const h = req.headers || {};
  let host;
  try { host = new URL('http://' + (h.host || '')).hostname; } catch (e) { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return false;
  if (h['sec-fetch-site'] === 'cross-site') return false;
  if (!h.origin || h.origin === 'null') return !h.origin;
  try { return new URL(h.origin).host === h.host; } catch (e) { return false; }
}

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
  const rel = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname.slice(STATIC.length)) || '/index.html';
  const file = path.resolve(WEB_ROOT, '.' + (rel === '/' ? '/index.html' : rel));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return send(res, 403, '');
  try {
    if (!(await stat(file)).isFile()) return send(res, 404, '');
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  } catch (e) {
    send(res, 404, '');
  }
}

async function serveStore(req, res) {
  if (!isLocalRequest(req)) return send(res, 403, '{"ok":false}');
  if (req.method === 'GET') return send(res, 200, JSON.stringify(await readStore()));
  if (req.method !== 'PUT') return send(res, 405, '');
  let size = 0;
  const parts = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return send(res, 413, '{"ok":false}');
    parts.push(c);
  }
  let msg;
  try { msg = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { return send(res, 400, '{"ok":false}'); }
  if (!msg || typeof msg.key !== 'string' || !msg.key.startsWith('dsh-room.')) return send(res, 400, '{"ok":false}');
  await updateStore((d) => { if (msg.value == null) delete d[msg.key]; else d[msg.key] = msg.value; });
  send(res, 200, '{"ok":true}');
}

async function readHostPrefs() {
  try { return JSON.parse(await readFile(dataFile('host.json'), 'utf8')) || {}; } catch (e) { return {}; }
}
async function writeHostPrefs(prefs) {
  const file = dataFile('host.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + '.tmp', JSON.stringify(prefs));
  await rename(file + '.tmp', file);
}

/** Agent 工具的开关：打开时把三个工具注册进 ctx.tools，关掉即注销；tools 服务就绪后才接得上（attach） */
function createToolSwitch(link) {
  let scope = null, dispose = null;
  const set = (on) => {
    if (on && !dispose && scope) {
      const offs = roomTools(link).map((t) => scope.tools.register(t));
      dispose = () => offs.forEach((off) => { if (typeof off === 'function') off(); });
    } else if (!on && dispose) { dispose(); dispose = null; }
    return !!dispose;
  };
  return {
    set, attach(s) { scope = s; }, detach() { scope = null; dispose = null; },
    get enabled() { return !!dispose; }, get available() { return !!scope; },
  };
}

export function apply(ctx) {
  const work = new WorkStatus();
  const link = new RoomLink();
  const chat = createChat(ctx);
  const toolSwitch = createToolSwitch(link);

  // 工作状态：只看事件类型和 todo 文案；插件 ctx 不带 scope，能收到所有会话的事件
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      const id = session && ((session.header && session.header.id) || session.id);
      if (id) work.observe(String(id), event);
    }), 'dsh-room: session watch');
  }

  const endpoints = {
    status: async (payload) => {
      const commands = link.poll(payload && payload.room);
      return Object.assign(work.snapshot(), { chat: chat.status(), tools: { enabled: toolSwitch.enabled, available: toolSwitch.available }, commands });
    },
    chat: (payload, signal) => chat.say(payload, signal),
    tools: async (payload) => {
      const enabled = toolSwitch.set(!!(payload && payload.enabled));
      await writeHostPrefs(Object.assign(await readHostPrefs(), { tools: enabled }));
      return { enabled };
    },
  };
  if (typeof ctx.inject === 'function') {
    // 精确路由挂在 DSH 的 /api 下：鉴权由 connection 做完才轮到这里；注销跟着本插件的 effect 走
    ctx.inject(['connection'], (scope) => {
      for (const [ep, run] of Object.entries(endpoints)) {
        scope.effect(() => scope.connection.fetch.register({
          path: API_PREFIX + ep, methods: ['POST'], requestBody: 'buffered',
          async fetch(request) {
            let payload = null;
            try { payload = await request.json(); } catch (e) { return Response.json({ ok: false, error: 'body is not JSON' }, { status: 400 }); }
            return Response.json(await run(payload, request.signal), { headers: { 'cache-control': 'no-store' } });
          },
        }), 'dsh-room: ' + ep);
      }
    });
    ctx.inject(['tools'], (scope) => {
      toolSwitch.attach(scope);
      scope.effect(() => () => toolSwitch.detach(), 'dsh-room: agent tools');
      readHostPrefs().then((p) => { if (p.tools) toolSwitch.set(true); });
    });
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: STATIC, handler: serveStatic }), 'dsh-room: static');
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API, handler: serveStore }), 'dsh-room: store');
  // dsh-app:// 页面不能直接作为浏览器预览地址；只返回当前宿主的本机静态页面，不含凭据。
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: INFO, handler(req, res) {
    if (req.method !== 'GET') return send(res, 405, '');
    if (!isLocalRequest(req)) return send(res, 403, '');
    const port = req.socket && req.socket.localPort;
    const scheme = req.socket && req.socket.encrypted ? 'https' : 'http';
    send(res, 200, JSON.stringify({ name, webUrl: port ? `${scheme}://127.0.0.1:${port}${STATIC}/` : null }));
  } }), 'dsh-room: preview info');
}
