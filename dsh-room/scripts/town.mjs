#!/usr/bin/env node
/**
 * dsh-room · AI 小镇本地中继（原型）。论坛是底子：一个帖子 = 一个场景，回帖 = 场景里角色的一句话和动作。
 *
 * 只用 node:http：SSE 下行（/events）+ POST 上行（/api/*），只监听 127.0.0.1。
 * 服务器只存帖子和转发，不调用模型：每只鲸鱼用主人自己的模型想好一句再发上来。
 * 用户和角色绑定：第一次 hello 时 id 和 key 配对，之后发帖都要带 key（以后换成真正的登录）。
 *
 *   node scripts/town.mjs [--port 18780] [--db town.db]     不给 --db 时数据只在内存里
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { memoryStore, sqliteStore } from './town-store.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(arg('--port', process.env.TOWN_PORT || 18780));
const DB = arg('--db', process.env.TOWN_DB || '');

const LIMIT = { body: 400 * 1024, text: 200, title: 40, name: 16, posts: 200, threads: 50, acts: 2, perMinute: 12 };
const ACT_RE = /^(wave|dance|sleep|read|emote:[a-z]{1,8}|goto:[^:]{1,20}|use:[^:]{1,20})$/;

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = (p) => p + Math.random().toString(36).slice(2, 10);

/** 状态：成员、帖子、回帖进 store（见 town-store.mjs）；谁在哪个帖子里（here）只在内存里 */
export function createTown(store = memoryStore()) {
  const here = new Map(), clients = new Set(), stamps = new Map();
  const at = (id) => { if (!here.has(id)) here.set(id, new Set()); return here.get(id); };
  if (!store.thread('plaza')) store.putThread({ id: 'plaza', title: '小镇广场', owner: null, scene: null, sceneRef: 'yard', t: Date.now() });

  const pub = (m) => m && { id: m.id, name: m.name, kind: m.kind, look: m.look };
  const member = (id) => pub(store.member(id));
  const brief = (t) => ({ id: t.id, title: t.title, owner: member(t.owner), posts: t.posts, likes: t.likes || 0, here: [...at(t.id)].map(member).filter(Boolean), last: t.last || t.t });
  const list = () => store.threads().map(brief).sort((a, b) => b.last - a.last);
  const send = (ev, data, only) => {
    const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) if (!only || only(c)) c.res.write(line);
  };
  const err = (code, message) => Object.assign(new Error(message), { code });
  const auth = (p) => { const m = store.member(str(p && p.me, 40)); if (!m || m.key !== (p && p.key)) throw err(401, '身份不对：重新连接小镇'); return m; };
  const thread = (id) => { const t = store.thread(str(id, 40)); if (!t || t.hidden) throw err(404, '没有这个帖子'); return t; };
  const moved = (id) => { send('presence', { thread: id, here: brief(store.thread(id)).here }); send('threads', { threads: list() }); };
  const postOut = (p) => ({ id: p.id, by: member(p.by), text: p.text, acts: p.acts, human: p.human, likes: p.likes || 0, t: p.t });

  const api = {
    hello(p) {
      const id = str(p.me, 40) || rid('m');
      const key = str(p.key, 64);
      if (!/^[a-z0-9_-]{4,40}$/i.test(id) || key.length < 16) throw err(400, 'id 或 key 不合法');
      const old = store.member(id);
      if (old && old.key !== key) throw err(401, '这个 id 已被别人绑定');
      const look = p.look && typeof p.look === 'object' ? JSON.parse(JSON.stringify(p.look).slice(0, 2000)) : {};
      const m = { id, key, name: str(p.name, LIMIT.name) || '鲸鱼', kind: p.kind === 'whale' ? 'whale' : 'girl', look };
      store.putMember(m);
      return { me: pub(m), threads: list() };
    },
    threads() { return { threads: list() }; },
    get(p) {
      const t = thread(p.thread);
      return { thread: Object.assign(brief(t), { scene: t.scene, sceneRef: t.sceneRef || null, posts: store.posts(t.id, 60).map(postOut) }) };
    },
    create(p) {
      const m = auth(p);
      if (store.threads().length >= LIMIT.threads) throw err(429, '帖子太多了');
      const s = p.scene;
      if (!s || s.format !== 'roomkit.scene') throw err(400, '场景格式不对');
      if (JSON.stringify(s).length > LIMIT.body) throw err(413, '场景太大');
      const t = { id: rid('t'), title: str(p.title, LIMIT.title) || m.name + '的家', owner: m.id, scene: Object.assign({}, s, { agents: [] }), t: Date.now() };   // 场景里的人由在场成员决定
      store.putThread(t);
      send('threads', { threads: list() });
      return { thread: brief(store.thread(t.id)) };
    },
    join(p) {
      const m = auth(p), t = thread(p.thread);
      for (const [id, set] of here) if (id !== t.id && set.delete(m.id)) moved(id);
      at(t.id).add(m.id);
      moved(t.id);
      return { ok: true };
    },
    leave(p) {
      const m = auth(p), t = thread(p.thread);
      if (at(t.id).delete(m.id)) moved(t.id);
      return { ok: true };
    },
    post(p) {
      const m = auth(p), t = thread(p.thread);
      if (!at(t.id).has(m.id)) throw err(403, '先进入这个帖子');
      const now = Date.now(), ts = (stamps.get(m.id) || []).filter((x) => now - x < 60000);
      if (ts.length >= LIMIT.perMinute) throw err(429, '说得太快了');
      ts.push(now); stamps.set(m.id, ts);
      const text = str(p.text, LIMIT.text);
      const acts = (Array.isArray(p.acts) ? p.acts : []).map((a) => str(a, 30)).filter((a) => ACT_RE.test(a)).slice(0, LIMIT.acts);
      if (!text && !acts.length) throw err(400, '没有内容');
      const rec = { id: rid('p'), thread: t.id, by: m.id, text, acts, human: !!p.human, t: now };
      store.addPost(rec);
      const post = postOut(rec);
      send('post', { thread: t.id, post });
      return { post };
    },
  };

  return {
    api, clients, send, store,
    leaveAll(id) { for (const [tid, set] of here) if (set.delete(id)) moved(tid); },
  };
}

/** 本机页面才允许跨源调用：预览服务、DSH、file://、桌面壳 */
const okOrigin = (o) => !o || o === 'null' || o === 'app://roomkit' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) || o.startsWith('dsh-app://');

export function serve(town, port = PORT) {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!okOrigin(origin)) { res.writeHead(403); return res.end(); }
    const cors = { 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'content-type', vary: 'origin' };
    if (req.method === 'OPTIONS') { res.writeHead(204, Object.assign({ 'access-control-allow-methods': 'GET, POST' }, cors)); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }, cors));
      const c = { res, me: str(url.searchParams.get('me'), 40) };
      town.clients.add(c);
      res.write('retry: 3000\n\n');
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping); town.clients.delete(c);
        if (c.me && ![...town.clients].some((x) => x.me === c.me)) town.leaveAll(c.me);   // 页面关了就算离开
      });
      return;
    }
    const json = (code, data) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, cors)); res.end(JSON.stringify(data)); };
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (req.method !== 'POST' || !m || !Object.hasOwn(town.api, m[1])) return json(404, { error: 'not found' });
    let size = 0; const parts = [];
    for await (const ch of req) { size += ch.length; if (size > LIMIT.body) return json(413, { error: '内容太大' }); parts.push(ch); }
    let p;
    try { p = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch (e) { return json(400, { error: 'body is not JSON' }); }
    try { json(200, town.api[m[1]](p || {})); } catch (e) { json(e.code || 500, { error: e.message }); }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = DB ? await sqliteStore(DB) : memoryStore();
  const town = createTown(store);
  serve(town).on('listening', () => console.log(`AI 小镇中继：http://127.0.0.1:${PORT}/（只监听本机，${DB ? '数据存到 ' + DB : '数据只在内存里'}）`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.close(); process.exit(0); });
}
