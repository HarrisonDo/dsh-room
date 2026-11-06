#!/usr/bin/env node
/**
 * dsh-room · AI 小镇中继。论坛是底子：一个帖子 = 一个场景，回帖 = 场景里角色的一句话和动作。
 *
 * 只用 node:http：SSE 下行（/events）+ POST 上行（/api/*），只监听 127.0.0.1（公网由前面的反向代理转进来）。
 * 服务器只存帖子和转发，不调用模型：每只鲸鱼用主人自己的模型想好一句再发上来。
 * 身份：第一次 hello 时 id 和 key 配对，之后都要带 key（T3 换成 GitHub / linux.do 登录）。
 *
 * 审核：回帖、标题、角色名先过 town-moderation.mjs；同一内容 3 人举报自动隐藏，等管理员处理。
 * 权限：owner 站长（环境变量 TOWN_OWNER 指定）→ admin 管理员 → mod 版主（scope = 帖子 id）。帖主可以锁帖、请人离开。
 *
 *   node scripts/town.mjs [--port 18780] [--db town.db] [--words 词表.txt]     不给 --db 时数据只在内存里
 *   环境变量：TOWN_OWNER  MODERATION_URL  MODERATION_TOKEN  MODERATION_ON_ERROR=review|local
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { openStore } from './town-store.mjs';
import { createModerator } from './town-moderation.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(arg('--port', process.env.TOWN_PORT || 18780));
const DB = arg('--db', process.env.TOWN_DB || '');
const WORDS = arg('--words', process.env.TOWN_WORDS || '');

export const LIMIT = { body: 400 * 1024, text: 200, title: 40, name: 16, note: 100, recent: 60, threads: 500, threadsPerDay: 10, acts: 2, perMinute: 12, hereMax: 12, reportHide: 3, kickMs: 3600000 };
const ACT_RE = /^(wave|dance|sleep|read|emote:[a-z]{1,8}|goto:[^:]{1,20}|use:[^:]{1,20})$/;
export const REASONS = ['辱骂', '色情', '广告', '违法', '刷屏', '其他'];
const ROLES = ['owner', 'admin', 'mod'];

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = (p) => p + Math.random().toString(36).slice(2, 10);

export function createTown(store, opts = {}) {
  const mod = opts.moderator || createModerator();
  const here = new Map(), kicked = new Map(), clients = new Set(), stamps = new Map();
  const at = (id) => { if (!here.has(id)) here.set(id, new Set()); return here.get(id); };
  if (!store.thread('plaza')) store.putThread({ id: 'plaza', title: '小镇广场', owner: null, scene: null, sceneRef: 'yard', t: Date.now() });
  if (opts.owner) store.grant(opts.owner, 'owner', '', 'config');

  const pub = (m) => m && { id: m.id, name: m.name, kind: m.kind, look: m.look };
  const member = (id) => pub(store.member(id));
  const brief = (t) => ({ id: t.id, title: t.title, owner: member(t.owner), posts: t.posts, likes: t.likes || 0, locked: t.locked, here: [...at(t.id)].map(member).filter(Boolean), last: t.last || t.t });
  const list = () => store.threads().map(brief).sort((a, b) => b.last - a.last);
  const send = (ev, data, only) => {
    const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) if (!only || only(c)) c.res.write(line);
  };
  const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);
  const thread = (id) => { const t = store.thread(str(id, 40)); if (!t || t.hidden) throw err(404, '没有这个帖子'); return t; };
  const moved = (id) => { send('presence', { thread: id, here: brief(store.thread(id)).here }); send('threads', { threads: list() }); };
  const postOut = (p) => ({ id: p.id, by: member(p.by), text: p.text, acts: p.acts, human: p.human, likes: p.likes || 0, t: p.t, ...(p.hidden === 2 ? { pending: true } : {}) });

  /* ───────── 身份与权限 ───────── */

  const auth = (p) => { const m = store.member(str(p && p.me, 40)); if (!m || m.key !== (p && p.key)) throw err(401, '身份不对：重新连接小镇'); return m; };
  const rolesOf = (id) => store.roles(id);
  const isStaff = (id) => rolesOf(id).some((r) => r.role === 'owner' || r.role === 'admin');
  /** 能不能管这个帖子：站长、管理员、这个帖子的版主（帖主另算：只能锁帖和请人离开） */
  const canModerate = (id, threadId) => isStaff(id) || rolesOf(id).some((r) => r.role === 'mod' && r.scope === threadId);
  const canSpeak = (m) => {
    const b = store.ban(m.id);
    if (b) throw err(403, b.kind === 'ban' ? '账号已被封禁' : '禁言中' + (b.until ? '，到 ' + new Date(b.until).toLocaleString('zh-CN') : ''));
  };
  const staff = (p) => { const m = auth(p); if (!isStaff(m.id) && !rolesOf(m.id).some((r) => r.role === 'mod')) throw err(403, '没有管理权限'); return m; };

  /** 审核标题、名字：block / review 直接拒（这类不适合“只自己看得到”），mask 用打码后的 */
  async function cleanField(text, kind, m) {
    if (!text) return text;
    const r = await mod.check(text, kind, { author: m && m.id });
    if (r.action === 'block' || r.action === 'review') throw err(422, kind === 'name' ? '名字不合适，换一个吧' : '标题不合适，换个说法吧', { labels: r.labels });
    return r.text;
  }

  /** 把一个目标（p:回帖 / t:帖子）设成隐藏或恢复，并通知在看的人 */
  function setHidden(target, hidden) {
    const [kind, id] = target.split(':');
    if (kind === 'p') {
      const p = store.post(id); if (!p) throw err(404, '没有这条回帖');
      store.setPostHidden(id, hidden);
      if (hidden) send('hidden', { thread: p.thread, post: id });
      else send('post', { thread: p.thread, post: postOut(store.post(id)) });
      return p;
    }
    if (kind === 't') {
      const t = store.thread(id); if (!t || id === 'plaza') throw err(404, '没有这个帖子');
      store.setThread(id, { hidden });
      if (hidden) { for (const mid of at(id)) send('kicked', { thread: id }, (c) => c.me === mid); here.delete(id); }
      send('threads', { threads: list() });
      return t;
    }
    throw err(400, '目标不对');
  }

  const api = {
    async hello(p) {
      const id = str(p.me, 40) || rid('m');
      const key = str(p.key, 64);
      if (!/^[a-z0-9_-]{4,40}$/i.test(id) || key.length < 16) throw err(400, 'id 或 key 不合法');
      const old = store.member(id);
      if (old && old.key !== key) throw err(401, '这个 id 已被别人绑定');
      const look = p.look && typeof p.look === 'object' ? JSON.parse(JSON.stringify(p.look).slice(0, 2000)) : {};
      const name = await cleanField(str(p.name, LIMIT.name) || '鲸鱼', 'name');
      const m = { id, key, name, kind: p.kind === 'whale' ? 'whale' : 'girl', look };
      store.putMember(m);
      return { me: Object.assign(pub(m), { roles: rolesOf(id), ban: store.ban(id) }), threads: list(), reasons: REASONS };
    },
    threads() { return { threads: list() }; },
    get(p) {
      const t = thread(p.thread);
      const viewer = store.member(str(p.me, 40));
      const me = viewer && viewer.key === p.key ? viewer.id : '';
      return { thread: Object.assign(brief(t), { scene: t.scene, sceneRef: t.sceneRef || null, posts: store.posts(t.id, LIMIT.recent, me).map(postOut) }) };
    },
    async create(p) {
      const m = auth(p);
      canSpeak(m);
      if (store.threads().length >= LIMIT.threads) throw err(429, '小镇的帖子满了');
      if (store.threadsBy(m.id, Date.now() - 86400000) >= LIMIT.threadsPerDay) throw err(429, '今天开的帖子够多了');
      const s = p.scene;
      if (!s || s.format !== 'roomkit.scene') throw err(400, '场景格式不对');
      if (JSON.stringify(s).length > LIMIT.body) throw err(413, '场景太大');
      const title = await cleanField(str(p.title, LIMIT.title) || m.name + '的家', 'title', m);
      const t = { id: rid('t'), title, owner: m.id, scene: Object.assign({}, s, { agents: [] }), t: Date.now() };   // 场景里的人由在场成员决定
      store.putThread(t);
      send('threads', { threads: list() });
      return { thread: brief(store.thread(t.id)) };
    },
    join(p) {
      const m = auth(p), t = thread(p.thread);
      const k = kicked.get(t.id + '|' + m.id);
      if (k && k > Date.now()) throw err(403, '你被请出了这个帖子，过一会儿再来');
      if (!at(t.id).has(m.id) && at(t.id).size >= LIMIT.hereMax) throw err(429, '这个帖子人满了');
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
    async post(p) {
      const m = auth(p), t = thread(p.thread);
      canSpeak(m);
      if (!at(t.id).has(m.id)) throw err(403, '先进入这个帖子');
      if (t.locked && !canModerate(m.id, t.id) && t.owner !== m.id) throw err(403, '帖子已锁');
      const now = Date.now(), ts = (stamps.get(m.id) || []).filter((x) => now - x < 60000);
      if (ts.length >= LIMIT.perMinute) throw err(429, '说得太快了');
      ts.push(now); stamps.set(m.id, ts);
      let text = str(p.text, LIMIT.text);
      const acts = (Array.isArray(p.acts) ? p.acts : []).map((a) => str(a, 30)).filter((a) => ACT_RE.test(a)).slice(0, LIMIT.acts);
      if (!text && !acts.length) throw err(400, '没有内容');
      let hidden = 0, labels = [];
      if (text) {
        const r = await mod.check(text, 'post', { author: m.id, thread: t.id });
        if (r.action === 'block') throw err(422, '这句话发不出去' + (r.labels.length ? '（' + r.labels.join('、') + '）' : ''), { labels: r.labels });
        text = r.text; labels = r.labels;
        if (r.action === 'review') hidden = 2;
      }
      const rec = { id: rid('p'), thread: t.id, by: m.id, text, acts, human: !!p.human, t: now, hidden, labels };
      store.addPost(rec);
      const post = postOut(rec);
      if (hidden) send('post', { thread: t.id, post }, (c) => c.me === m.id);   // 待审：只有作者自己看得到
      else send('post', { thread: t.id, post });
      return { post };
    },

    /* ───────── 举报 ───────── */

    report(p) {
      const m = auth(p);
      const target = str(p.target, 50);
      const [kind, id] = target.split(':');
      const obj = kind === 'p' ? store.post(id) : kind === 't' ? store.thread(id) : null;
      if (!obj || obj.hidden || (kind === 't' && id === 'plaza')) throw err(404, '没有这条内容');
      if ((kind === 'p' ? obj.by : obj.owner) === m.id) throw err(400, '不能举报自己');
      const reason = REASONS.includes(p.reason) ? p.reason : '其他';
      const n = store.report({ id: rid('r'), target, member: m.id, reason, note: str(p.note, LIMIT.note), t: Date.now() });
      if (n >= LIMIT.reportHide) { setHidden(target, 1); store.log('system', 'auto-hide', target, { reports: n }); }
      return { ok: true };
    },

    /* ───────── 帖主 / 版主 ───────── */

    lock(p) {
      const m = auth(p), t = thread(p.thread);
      if (t.owner !== m.id && !canModerate(m.id, t.id)) throw err(403, '只有帖主和版主能锁帖');
      store.setThread(t.id, { locked: !!p.locked });
      store.log(m.id, p.locked ? 'lock' : 'unlock', 't:' + t.id);
      send('threads', { threads: list() });
      return { ok: true };
    },
    kick(p) {
      const m = auth(p), t = thread(p.thread), who = str(p.member, 40);
      if (t.owner !== m.id && !canModerate(m.id, t.id)) throw err(403, '只有帖主和版主能请人离开');
      if (who === m.id || who === t.owner) throw err(400, '不能请自己或帖主离开');
      kicked.set(t.id + '|' + who, Date.now() + LIMIT.kickMs);
      if (at(t.id).delete(who)) moved(t.id);
      send('kicked', { thread: t.id }, (c) => c.me === who);
      store.log(m.id, 'kick', 'm:' + who, { thread: t.id });
      return { ok: true };
    },

    /* ───────── 管理 ───────── */

    adminQueue(p) {
      const m = staff(p);
      const all = isStaff(m.id), scopes = new Set(rolesOf(m.id).filter((r) => r.role === 'mod').map((r) => r.scope));
      const inScope = (threadId) => all || scopes.has(threadId);
      const show = (target) => {
        const [kind, id] = target.split(':');
        if (kind === 'p') { const x = store.post(id); return x && inScope(x.thread) ? { kind, thread: x.thread, text: x.text, by: member(x.by), hidden: x.hidden, human: x.human } : null; }
        const x = store.thread(id); return x && inScope(x.id) ? { kind, thread: x.id, text: x.title, by: member(x.owner), hidden: x.hidden } : null;
      };
      return {
        roles: rolesOf(m.id),
        reports: store.openReports().map((r) => Object.assign(r, { item: show(r.target) })).filter((r) => r.item),
        pending: store.pendingPosts().filter((x) => inScope(x.thread)).map((x) => ({ target: 'p:' + x.id, item: { kind: 'p', thread: x.thread, text: x.text, by: member(x.by), labels: x.labels } })),
        staff: all ? store.allRoles().map((r) => Object.assign(r, { name: (member(r.member) || {}).name || r.member })) : [],
        log: all ? store.logs(30) : [],
      };
    },
    /**
     * action: restore 恢复 · approve 待审通过 · hide 隐藏 · delete 删除 · dismiss 驳回举报（内容保留）
     *         mute 禁言（days）· ban 封号 · unban · grant / revoke 授权（role, scope）
     */
    adminAct(p) {
      const m = staff(p);
      const action = str(p.action, 20), target = str(p.target, 50);
      const threadOf = (t) => { const [k, id] = t.split(':'); return k === 'p' ? (store.post(id) || {}).thread : k === 't' ? id : null; };
      const need = (ok) => { if (!ok) throw err(403, '没有这项权限'); };
      switch (action) {
        case 'restore': case 'approve': need(canModerate(m.id, threadOf(target))); setHidden(target, 0); store.closeReports(target, 'dismissed'); break;
        case 'hide': need(canModerate(m.id, threadOf(target))); setHidden(target, 1); store.closeReports(target, 'upheld'); break;
        case 'delete': need(canModerate(m.id, threadOf(target))); setHidden(target, 3); store.closeReports(target, 'upheld'); break;
        case 'dismiss': need(canModerate(m.id, threadOf(target))); store.closeReports(target, 'dismissed'); break;
        case 'mute': case 'ban': {
          need(isStaff(m.id));
          const who = target.replace(/^m:/, '');
          if (rolesOf(who).some((r) => r.role === 'owner')) throw err(403, '不能处理站长');
          const days = Number(p.days) > 0 ? Math.min(3650, Number(p.days)) : 0;
          store.setBan(who, action, days ? Date.now() + days * 86400000 : null, str(p.reason, LIMIT.note), m.id);
          if (action === 'ban') { for (const [tid, set] of here) if (set.delete(who)) moved(tid); send('kicked', { thread: null }, (c) => c.me === who); }
          break;
        }
        case 'unban': need(isStaff(m.id)); store.unban(target.replace(/^m:/, '')); break;
        case 'grant': case 'revoke': {
          const role = str(p.role, 10), scope = role === 'mod' ? str(p.scope, 40) : '', who = target.replace(/^m:/, '');
          if (!ROLES.includes(role) || role === 'owner') throw err(400, '只能分配 admin 或 mod');
          if (role === 'mod' && !store.thread(scope)) throw err(400, '版主要指定一个帖子');
          // 站长分配管理员；站长和管理员分配版主
          need(role === 'admin' ? rolesOf(m.id).some((r) => r.role === 'owner') : isStaff(m.id));
          if (!store.member(who)) throw err(404, '没有这个成员');
          if (action === 'grant') store.grant(who, role, scope, m.id); else store.revoke(who, role, scope);
          break;
        }
        default: throw err(400, '不认识的操作');
      }
      store.log(m.id, action, target, { days: p.days, role: p.role, scope: p.scope, reason: str(p.reason, LIMIT.note) });
      return { ok: true };
    },
  };

  return {
    api, clients, send, store,
    leaveAll(id) { for (const [tid, set] of here) if (set.delete(id)) moved(tid); },
  };
}

/** 本机页面才允许跨源调用：预览服务、DSH、file://、桌面壳。公网部署时用 TOWN_ORIGINS 追加 */
const EXTRA_ORIGINS = String(process.env.TOWN_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const okOrigin = (o) => !o || o === 'null' || o === 'app://roomkit' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) || o.startsWith('dsh-app://') || EXTRA_ORIGINS.includes(o);

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
    const m = url.pathname.match(/^\/api\/([a-zA-Z]+)$/);
    if (req.method !== 'POST' || !m || !Object.hasOwn(town.api, m[1])) return json(404, { error: 'not found' });
    let size = 0; const parts = [];
    for await (const ch of req) { size += ch.length; if (size > LIMIT.body) return json(413, { error: '内容太大' }); parts.push(ch); }
    let p;
    try { p = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch (e) { return json(400, { error: 'body is not JSON' }); }
    try { json(200, await town.api[m[1]](p || {})); } catch (e) {
      if (!e.code) console.error('[town]', m[1], e);
      json(e.code || 500, { error: e.code ? e.message : '服务器出错了', labels: e.labels });
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = await openStore(DB || ':memory:');
  const moderator = createModerator({ url: process.env.MODERATION_URL, token: process.env.MODERATION_TOKEN, onError: process.env.MODERATION_ON_ERROR, wordsFile: WORDS });
  const town = createTown(store, { owner: process.env.TOWN_OWNER, moderator });
  serve(town).on('listening', () => console.log(`AI 小镇中继：http://127.0.0.1:${PORT}/（只监听本机，${DB ? '数据存到 ' + DB : '数据只在内存里'}；本地词表：${moderator.size()} 个词；屏蔽词服务：${process.env.MODERATION_URL ? '已配置' : '未配置'}）`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.close(); process.exit(0); });
}
