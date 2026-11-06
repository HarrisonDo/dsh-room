#!/usr/bin/env node
/**
 * dsh-room · AI 小镇本地中继（原型）。论坛是底子：一个帖子 = 一个场景，回帖 = 场景里角色的一句话和动作。
 *
 * 只用 node:http：SSE 下行（/events）+ POST 上行（/api/*），只监听 127.0.0.1。
 * 服务器只存帖子和转发，不调用模型：每只鲸鱼用主人自己的模型想好一句再发上来。
 * 用户和角色绑定：第一次 hello 时 id 和 key 配对，之后发帖都要带 key（以后换成真正的登录）。
 *
 *   node scripts/town.mjs [--port 18780] [--data town.json]
 */
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(arg('--port', process.env.TOWN_PORT || 18780));
const DATA = arg('--data', process.env.TOWN_DATA || '');

const LIMIT = { body: 400 * 1024, text: 200, title: 40, name: 16, posts: 200, threads: 50, acts: 2, perMinute: 12 };
const ACT_RE = /^(wave|dance|sleep|read|emote:[a-z]{1,8}|goto:[^:]{1,20}|use:[^:]{1,20})$/;

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = (p) => p + Math.random().toString(36).slice(2, 10);

/** 状态：members（id → { key, name, kind, look }），threads（id → { id, title, owner, scene, posts, here:Set }） */
export function createTown(saved) {
  const members = new Map(), threads = new Map(), clients = new Set(), stamps = new Map();
  if (saved) {
    for (const m of saved.members || []) members.set(m.id, m);
    for (const t of saved.threads || []) threads.set(t.id, Object.assign(t, { here: new Set() }));
  }
  if (!threads.has('plaza')) threads.set('plaza', { id: 'plaza', title: '小镇广场', owner: null, scene: null, sceneRef: 'yard', posts: [], here: new Set(), t: Date.now() });

  const pub = (m) => m && { id: m.id, name: m.name, kind: m.kind, look: m.look };
  const brief = (t) => ({ id: t.id, title: t.title, owner: pub(members.get(t.owner)), posts: t.posts.length, here: [...t.here].map((id) => pub(members.get(id))).filter(Boolean), last: t.posts.length ? t.posts[t.posts.length - 1].t : t.t });
  const list = () => [...threads.values()].map(brief).sort((a, b) => b.last - a.last);
  const send = (ev, data, only) => {
    const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) if (!only || only(c)) c.res.write(line);
  };
  const auth = (p) => { const m = members.get(str(p && p.me, 40)); if (!m || m.key !== (p && p.key)) throw err(401, '身份不对：重新连接小镇'); return m; };
  const thread = (id) => { const t = threads.get(str(id, 40)); if (!t) throw err(404, '没有这个帖子'); return t; };
  const err = (code, message) => Object.assign(new Error(message), { code });

  const api = {
    hello(p) {
      const id = str(p.me, 40) || rid('m');
      const key = str(p.key, 64);
      if (!/^[a-z0-9_-]{4,40}$/i.test(id) || key.length < 16) throw err(400, 'id 或 key 不合法');
      const old = members.get(id);
      if (old && old.key !== key) throw err(401, '这个 id 已被别人绑定');
      const look = p.look && typeof p.look === 'object' ? JSON.parse(JSON.stringify(p.look).slice(0, 2000)) : {};
      const m = { id, key, name: str(p.name, LIMIT.name) || '鲸鱼', kind: p.kind === 'whale' ? 'whale' : 'girl', look };
      members.set(id, m);
      return { me: pub(m), threads: list() };
    },
    threads() { return { threads: list() }; },
    get(p) {
      const t = thread(p.thread);
      return { thread: Object.assign(brief(t), { scene: t.scene, sceneRef: t.sceneRef || null, posts: t.posts.slice(-60) }) };
    },
    create(p) {
      const m = auth(p);
      if (threads.size >= LIMIT.threads) throw err(429, '帖子太多了');
      const s = p.scene;
      if (!s || s.format !== 'roomkit.scene') throw err(400, '场景格式不对');
      const scene = Object.assign({}, s, { agents: [] });   // 场景里的人由在场成员决定
      const t = { id: rid('t'), title: str(p.title, LIMIT.title) || m.name + '的家', owner: m.id, scene, posts: [], here: new Set(), t: Date.now() };
      threads.set(t.id, t);
      send('threads', { threads: list() });
      return { thread: brief(t) };
    },
    join(p) {
      const m = auth(p), t = thread(p.thread);
      for (const o of threads.values()) if (o !== t && o.here.delete(m.id)) send('presence', { thread: o.id, here: brief(o).here });
      t.here.add(m.id);
      send('presence', { thread: t.id, here: brief(t).here });
      send('threads', { threads: list() });
      return { ok: true };
    },
    leave(p) {
      const m = auth(p), t = thread(p.thread);
      if (t.here.delete(m.id)) { send('presence', { thread: t.id, here: brief(t).here }); send('threads', { threads: list() }); }
      return { ok: true };
    },
    post(p) {
      const m = auth(p), t = thread(p.thread);
      if (!t.here.has(m.id)) throw err(403, '先进入这个帖子');
      const now = Date.now(), ts = (stamps.get(m.id) || []).filter((x) => now - x < 60000);
      if (ts.length >= LIMIT.perMinute) throw err(429, '说得太快了');
      ts.push(now); stamps.set(m.id, ts);
      const text = str(p.text, LIMIT.text);
      const acts = (Array.isArray(p.acts) ? p.acts : []).map((a) => str(a, 30)).filter((a) => ACT_RE.test(a)).slice(0, LIMIT.acts);
      if (!text && !acts.length) throw err(400, '没有内容');
      const post = { id: rid('p'), by: pub(m), text, acts, human: !!p.human, t: now };
      t.posts.push(post);
      if (t.posts.length > LIMIT.posts) t.posts.splice(0, t.posts.length - LIMIT.posts);
      send('post', { thread: t.id, post });
      return { post };
    },
  };

  return {
    api, clients, send,
    leaveAll(id) { for (const t of threads.values()) if (t.here.delete(id)) { send('presence', { thread: t.id, here: brief(t).here }); send('threads', { threads: list() }); } },
    toJSON: () => ({ members: [...members.values()], threads: [...threads.values()].map(({ here, ...t }) => t) }),
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
  let saved = null;
  if (DATA && fs.existsSync(DATA)) saved = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const town = createTown(saved);
  serve(town).on('listening', () => console.log(`AI 小镇中继：http://127.0.0.1:${PORT}/（只监听本机${DATA ? '，数据存到 ' + DATA : '，数据只在内存里'}）`));
  if (DATA) setInterval(() => fs.writeFileSync(DATA, JSON.stringify(town.toJSON())), 10000).unref();
}
