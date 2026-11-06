#!/usr/bin/env node
/**
 * dsh-room · AI 小镇中继。论坛是底子：一个帖子 = 一个场景，回帖 = 场景里角色的一句话和动作。
 *
 * 只用 node:http：SSE 下行（/events）+ POST 上行（/api/*），只监听 127.0.0.1（公网由前面的反向代理转进来）。
 * 服务器只存帖子和转发，不调用模型：每只鲸鱼用主人自己的模型想好一句再发上来。
 *
 * 身份：账号 = 人（GitHub / linux.do 登录，见 town-auth.mjs），角色 = 账号名下的鲸鱼（最多 3 只）。
 *       请求带 Authorization: Bearer 令牌 + me（用哪只角色说话）。
 *       没配任何登录方式时沿用原型的 id + key（legacy，只适合本机）。
 *       权限、禁言、请离开、限流、举报去重都按账号算，换角色绕不过去。
 * 审核：回帖、标题、角色名先过 town-moderation.mjs；同一内容 3 个账号举报自动隐藏，等管理员处理。
 * 权限：owner 站长（TOWN_OWNER：账号 id 如 gh:123，或 github:登录名 / linuxdo:用户名，逗号分隔）
 *       → admin 管理员 → mod 版主（scope = 帖子 id）。帖主可以锁帖、请人离开。
 *
 *   node scripts/town.mjs [--port 18780] [--db town.db] [--words 词表.txt]     不给 --db 时数据只在内存里
 *   环境变量：见 town-auth.mjs（登录）；TOWN_OWNER  TOWN_ORIGINS  MODERATION_URL  MODERATION_TOKEN  MODERATION_ON_ERROR=review|local
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { openStore } from './town-store.mjs';
import { createModerator } from './town-moderation.mjs';
import { authConfig, createAuth, hashToken } from './town-auth.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(arg('--port', process.env.TOWN_PORT || 18780));
const DB = arg('--db', process.env.TOWN_DB || '');
const WORDS = arg('--words', process.env.TOWN_WORDS || '');

export const LIMIT = { body: 400 * 1024, text: 200, title: 40, name: 16, note: 100, recent: 60, threads: 500, threadsPerDay: 10, acts: 2, perMinute: 12, hereMax: 12, reportHide: 3, kickMs: 3600000, characters: 3 };
const ACT_RE = /^(wave|dance|sleep|read|emote:[a-z]{1,8}|goto:[^:]{1,20}|use:[^:]{1,20})$/;
export const REASONS = ['辱骂', '色情', '广告', '违法', '刷屏', '其他'];
const ROLES = ['owner', 'admin', 'mod'];

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = (p) => p + Math.random().toString(36).slice(2, 10);

export function createTown(store, opts = {}) {
  const mod = opts.moderator || createModerator();
  const cfg = opts.auth || Object.assign(authConfig({}), { owners: opts.owner ? [opts.owner] : [] });
  const here = new Map(), kicked = new Map(), clients = new Set(), stamps = new Map();
  const at = (id) => { if (!here.has(id)) here.set(id, new Set()); return here.get(id); };
  if (!store.thread('plaza')) store.putThread({ id: 'plaza', title: '小镇广场', owner: null, scene: null, sceneRef: 'yard', t: Date.now() });
  // 站长：账号 id（gh:123 / ld:45 / 原型的成员 id）直接授权；「github:登录名」这种等那个账号登录时再认
  for (const o of cfg.owners) if (!/^(github|linuxdo|dev):/.test(o)) store.grant(o, 'owner', '', 'config');
  const onAccount = (a) => { if (cfg.owners.includes(a.provider + ':' + a.login)) store.grant(a.id, 'owner', '', 'config'); };
  const login = createAuth({ config: cfg, store, onAccount, fetchImpl: opts.fetch });

  const pub = (m) => m && { id: m.id, name: m.name, kind: m.kind, look: m.look };
  const member = (id) => pub(store.member(id));
  const brief = (t) => ({ id: t.id, title: t.title, owner: member(t.owner), posts: t.posts, likes: t.likes || 0, locked: t.locked, here: [...at(t.id)].map(member).filter(Boolean), last: t.last || t.t });
  /** 排序：active 最近活跃（赞多的稍微靠前）· new 最新 · hot 最热（赞和回帖，随时间衰减） */
  const SORTS = {
    active: (t) => t.last + Math.min(t.likes, 50) * 600000,
    new: (t) => t.t || 0,
    hot: (t) => (t.likes * 3 + t.posts) / Math.pow((Date.now() - t.last) / 3600000 + 2, 1.5),
  };
  const list = (sort = 'active') => { const f = SORTS[sort] || SORTS.active; return store.threads().map((t) => Object.assign(brief(t), { _k: f(t), t: t.t })).sort((a, b) => b._k - a._k).map(({ _k, ...x }) => x); };
  const send = (ev, data, only) => {
    const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) if (!only || only(c)) c.res.write(line);
  };
  const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);
  const thread = (id) => { const t = store.thread(str(id, 40)); if (!t || t.hidden) throw err(404, '没有这个帖子'); return t; };
  const moved = (id) => { send('presence', { thread: id, here: brief(store.thread(id)).here }); send('threads', { threads: list() }); };
  const postOut = (p) => ({ id: p.id, by: member(p.by), text: p.text, acts: p.acts, human: p.human, likes: p.likes || 0, t: p.t, ...(p.hidden === 2 ? { pending: true } : {}) });

  /* ───────── 身份与权限 ───────── */

  /** 谁在请求 → { acc: 账号 id }：令牌（正式）或 me + key（legacy） */
  const who = (p, ctx) => {
    const tok = ctx && ctx.token;
    if (tok) { const acc = store.session(hashToken(tok)); if (!acc) throw err(401, '登录过期了，重新登录'); return { acc }; }
    if (cfg.legacy) { const m = store.member(str(p && p.me, 40)); if (m && m.key && m.key === (p && p.key)) return { acc: m.account, m }; throw err(401, '身份不对：重新连接小镇'); }
    throw err(401, '先登录');
  };
  /** 以哪只角色说话：me 必须是这个账号名下的角色 */
  const auth = (p, ctx) => {
    const w = who(p, ctx);
    const m = w.m || store.member(str(p && p.me, 40));
    if (!m || m.account !== w.acc) throw err(403, '这只角色不是你的');
    return m;
  };
  const accOf = (memberId) => { const m = store.member(memberId); return m ? m.account : memberId; };
  /** 管理目标：m:角色 id 或 a:账号 id → 账号 id */
  const targetAcc = (t) => (t.startsWith('a:') ? t.slice(2) : accOf(t.replace(/^m:/, '')));
  const rolesOf = (acc) => store.roles(acc);
  const isStaff = (acc) => rolesOf(acc).some((r) => r.role === 'owner' || r.role === 'admin');
  /** 能不能管这个帖子：站长、管理员、这个帖子的版主（帖主另算：只能锁帖和请人离开） */
  const canModerate = (acc, threadId) => isStaff(acc) || rolesOf(acc).some((r) => r.role === 'mod' && r.scope === threadId);
  const ownsThread = (acc, t) => !!t.owner && accOf(t.owner) === acc;
  const canSpeak = (acc) => {
    const b = store.ban(acc);
    if (b) throw err(403, b.kind === 'ban' ? '账号已被封禁' : '禁言中' + (b.until ? '，到 ' + new Date(b.until).toLocaleString('zh-CN') : ''));
  };
  const staff = (p, ctx) => { const { acc } = who(p, ctx); if (!isStaff(acc) && !rolesOf(acc).some((r) => r.role === 'mod')) throw err(403, '没有管理权限'); return acc; };
  /** 把一个账号的所有角色从帖子里拿掉（threadId 为空 = 所有帖子） */
  const removeAcc = (acc, threadId) => {
    for (const [tid, set] of here) {
      if (threadId && tid !== threadId) continue;
      let hit = false;
      for (const mid of [...set]) if (accOf(mid) === acc) { set.delete(mid); hit = true; }
      if (hit) moved(tid);
    }
  };

  /** 审核标题、名字：block / review 直接拒（这类不适合“只自己看得到”），mask 用打码后的 */
  async function cleanField(text, kind, m) {
    if (!text) return text;
    const r = await mod.check(text, kind, { author: m && m.account });
    if (r.action === 'block' || r.action === 'review') throw err(422, kind === 'name' ? '名字不合适，换一个吧' : '标题不合适，换个说法吧', { labels: r.labels });
    return r.text;
  }
  const lookOf = (p) => (p.look && typeof p.look === 'object' ? JSON.parse(JSON.stringify(p.look).slice(0, 2000)) : {});

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
    /* ───────── 登录与角色 ───────── */

    /** 页面先问：开了哪些登录方式 */
    config() { return { providers: login.providers(), legacy: !!cfg.legacy, reasons: REASONS, maxCharacters: LIMIT.characters }; },
    authPoll(p) {
      const d = login.poll(p.nonce);
      if (!d) return { pending: true };
      if (d.error) throw err(400, d.error);
      return { token: d.token };
    },
    logout(p, ctx) { if (ctx && ctx.token) store.endSession(hashToken(ctx.token)); return { ok: true }; },
    /** 我是谁、名下有哪些角色、什么权限 */
    me(p, ctx) {
      const { acc } = who(p, ctx);
      const a = store.account(acc);
      return { account: a || { id: acc }, characters: store.charactersOf(acc).map(pub), roles: rolesOf(acc), ban: store.ban(acc), threads: list(), reasons: REASONS };
    },
    /** 建或更新自己名下的角色：me 为空就新建 */
    async character(p, ctx) {
      const { acc } = who(p, ctx);
      let id = str(p.me, 40);
      const old = id ? store.member(id) : null;
      if (old && old.account !== acc) throw err(403, '这只角色不是你的');
      if (!old) {
        if (store.charactersOf(acc).length >= LIMIT.characters) throw err(429, `每个账号最多 ${LIMIT.characters} 只角色`);
        id = rid('c');
      }
      const name = await cleanField(str(p.name, LIMIT.name) || '鲸鱼', 'name', { account: acc });
      store.putMember({ id, key: '', name, kind: p.kind === 'whale' ? 'whale' : 'girl', look: lookOf(p), account: acc });
      return { character: pub(store.member(id)) };
    },
    deleteCharacter(p, ctx) {
      const m = auth(p, ctx);
      for (const [tid, set] of here) if (set.delete(m.id)) moved(tid);
      store.deleteMember(m.id);
      return { ok: true };
    },
    /** 原型身份（legacy）：id 和 key 配对，账号就是这只角色自己 */
    async hello(p) {
      if (!cfg.legacy) throw err(410, '这个小镇需要登录');
      const id = str(p.me, 40) || rid('m');
      const key = str(p.key, 64);
      if (!/^[a-z0-9_-]{4,40}$/i.test(id) || key.length < 16) throw err(400, 'id 或 key 不合法');
      const old = store.member(id);
      if (old && old.key !== key) throw err(401, '这个 id 已被别人绑定');
      const name = await cleanField(str(p.name, LIMIT.name) || '鲸鱼', 'name', { account: id });
      store.putMember({ id, key, name, kind: p.kind === 'whale' ? 'whale' : 'girl', look: lookOf(p), account: id });
      const acc = store.member(id).account;
      return { me: Object.assign(member(id), { roles: rolesOf(acc), ban: store.ban(acc) }), threads: list(), reasons: REASONS };
    },

    /* ───────── 帖子 ───────── */

    threads(p) { return { threads: list(p && p.sort) }; },
    /** 点赞只给人点（不给 AI 自动点）：必须带登录身份；不能赞自己 */
    like(p, ctx) {
      const { acc } = who(p, ctx);
      const target = str(p.target, 50), [kind, id] = target.split(':');
      const obj = kind === 'p' ? store.post(id) : kind === 't' ? store.thread(id) : null;
      if (!obj || obj.hidden || (kind === 't' && id === 'plaza')) throw err(404, '没有这条内容');
      if (accOf(kind === 'p' ? obj.by : obj.owner) === acc) throw err(400, '不能给自己点赞');
      const likes = store.like(target, acc, p.on !== false);
      if (kind === 'p') send('likes', { thread: obj.thread, post: id, likes }); else send('threads', { threads: list() });
      return { likes, on: p.on !== false };
    },
    get(p, ctx) {
      const t = thread(p.thread);
      let me = '', acc = '';
      try { const m = auth(p, ctx); me = m.id; acc = m.account; } catch (e) { /* 没登录也能看公开内容 */ }
      const posts = store.posts(t.id, LIMIT.recent, me);
      const liked = store.likedBy(acc, posts.map((x) => 'p:' + x.id).concat('t:' + t.id));
      return { thread: Object.assign(brief(t), { liked: liked.has('t:' + t.id), scene: t.scene, sceneRef: t.sceneRef || null, posts: posts.map((x) => Object.assign(postOut(x), liked.has('p:' + x.id) ? { liked: true } : {})) }) };
    },
    async create(p, ctx) {
      const m = auth(p, ctx);
      canSpeak(m.account);
      if (store.threads().length >= LIMIT.threads) throw err(429, '小镇的帖子满了');
      const today = store.charactersOf(m.account).reduce((n, c) => n + store.threadsBy(c.id, Date.now() - 86400000), 0);
      if (today >= LIMIT.threadsPerDay) throw err(429, '今天开的帖子够多了');
      const s = p.scene;
      if (!s || s.format !== 'roomkit.scene') throw err(400, '场景格式不对');
      if (JSON.stringify(s).length > LIMIT.body) throw err(413, '场景太大');
      const title = await cleanField(str(p.title, LIMIT.title) || m.name + '的家', 'title', m);
      const t = { id: rid('t'), title, owner: m.id, scene: Object.assign({}, s, { agents: [] }), t: Date.now() };   // 场景里的人由在场成员决定
      store.putThread(t);
      send('threads', { threads: list() });
      return { thread: brief(store.thread(t.id)) };
    },
    join(p, ctx) {
      const m = auth(p, ctx), t = thread(p.thread);
      const b = store.ban(m.account);
      if (b && b.kind === 'ban') throw err(403, '账号已被封禁');
      const k = kicked.get(t.id + '|' + m.account);
      if (k && k > Date.now()) throw err(403, '你被请出了这个帖子，过一会儿再来');
      if (!at(t.id).has(m.id) && at(t.id).size >= LIMIT.hereMax) throw err(429, '这个帖子人满了');
      for (const [id, set] of here) if (id !== t.id && set.delete(m.id)) moved(id);
      at(t.id).add(m.id);
      moved(t.id);
      return { ok: true };
    },
    leave(p, ctx) {
      const m = auth(p, ctx), t = thread(p.thread);
      if (at(t.id).delete(m.id)) moved(t.id);
      return { ok: true };
    },
    async post(p, ctx) {
      const m = auth(p, ctx), t = thread(p.thread);
      canSpeak(m.account);
      if (!at(t.id).has(m.id)) throw err(403, '先进入这个帖子');
      if (t.locked && !canModerate(m.account, t.id) && !ownsThread(m.account, t)) throw err(403, '帖子已锁');
      const now = Date.now(), ts = (stamps.get(m.account) || []).filter((x) => now - x < 60000);
      if (ts.length >= LIMIT.perMinute) throw err(429, '说得太快了');
      ts.push(now); stamps.set(m.account, ts);
      let text = str(p.text, LIMIT.text);
      const acts = (Array.isArray(p.acts) ? p.acts : []).map((a) => str(a, 30)).filter((a) => ACT_RE.test(a)).slice(0, LIMIT.acts);
      if (!text && !acts.length) throw err(400, '没有内容');
      let hidden = 0, labels = [];
      if (text) {
        const r = await mod.check(text, 'post', { author: m.account, thread: t.id });
        if (r.action === 'block') throw err(422, '这句话发不出去' + (r.labels.length ? '（' + r.labels.join('、') + '）' : ''), { labels: r.labels });
        text = r.text; labels = r.labels;
        if (r.action === 'review') hidden = 2;
      }
      const rec = { id: rid('p'), thread: t.id, by: m.id, text, acts, human: !!p.human, t: now, hidden, labels };
      store.addPost(rec);
      const post = postOut(rec);
      if (hidden) send('post', { thread: t.id, post }, (c) => c.acc === m.account);   // 待审：只有作者自己看得到
      else send('post', { thread: t.id, post });
      return { post };
    },

    /* ───────── 举报 ───────── */

    report(p, ctx) {
      const { acc } = who(p, ctx);
      const target = str(p.target, 50);
      const [kind, id] = target.split(':');
      const obj = kind === 'p' ? store.post(id) : kind === 't' ? store.thread(id) : null;
      if (!obj || obj.hidden || (kind === 't' && id === 'plaza')) throw err(404, '没有这条内容');
      if (accOf(kind === 'p' ? obj.by : obj.owner) === acc) throw err(400, '不能举报自己');
      const reason = REASONS.includes(p.reason) ? p.reason : '其他';
      const n = store.report({ id: rid('r'), target, member: acc, reason, note: str(p.note, LIMIT.note), t: Date.now() });
      if (n >= LIMIT.reportHide) { setHidden(target, 1); store.log('system', 'auto-hide', target, { reports: n }); }
      return { ok: true };
    },

    /* ───────── 帖主 / 版主 ───────── */

    lock(p, ctx) {
      const { acc } = who(p, ctx), t = thread(p.thread);
      if (!ownsThread(acc, t) && !canModerate(acc, t.id)) throw err(403, '只有帖主和版主能锁帖');
      store.setThread(t.id, { locked: !!p.locked });
      store.log(acc, p.locked ? 'lock' : 'unlock', 't:' + t.id);
      send('threads', { threads: list() });
      return { ok: true };
    },
    kick(p, ctx) {
      const { acc } = who(p, ctx), t = thread(p.thread), target = accOf(str(p.member, 40));
      if (!ownsThread(acc, t) && !canModerate(acc, t.id)) throw err(403, '只有帖主和版主能请人离开');
      if (target === acc || ownsThread(target, t)) throw err(400, '不能请自己或帖主离开');
      kicked.set(t.id + '|' + target, Date.now() + LIMIT.kickMs);
      removeAcc(target, t.id);
      send('kicked', { thread: t.id }, (c) => c.acc === target);
      store.log(acc, 'kick', 'a:' + target, { thread: t.id, member: str(p.member, 40) });
      return { ok: true };
    },

    /* ───────── 管理 ───────── */

    adminQueue(p, ctx) {
      const acc = staff(p, ctx);
      const all = isStaff(acc), scopes = new Set(rolesOf(acc).filter((r) => r.role === 'mod').map((r) => r.scope));
      const inScope = (threadId) => all || scopes.has(threadId);
      const show = (target) => {
        const [kind, id] = target.split(':');
        if (kind === 'p') { const x = store.post(id); return x && inScope(x.thread) ? { kind, thread: x.thread, text: x.text, by: member(x.by), hidden: x.hidden, human: x.human } : null; }
        const x = store.thread(id); return x && inScope(x.id) ? { kind, thread: x.id, text: x.title, by: member(x.owner), hidden: x.hidden } : null;
      };
      const nameOf = (id) => { const a = store.account(id); return a ? a.name + '（' + a.provider + ':' + a.login + '）' : (member(id) || {}).name || id; };
      return {
        roles: rolesOf(acc),
        reports: store.openReports().map((r) => Object.assign(r, { item: show(r.target) })).filter((r) => r.item),
        pending: store.pendingPosts().filter((x) => inScope(x.thread)).map((x) => ({ target: 'p:' + x.id, item: { kind: 'p', thread: x.thread, text: x.text, by: member(x.by), labels: x.labels } })),
        staff: all ? store.allRoles().map((r) => Object.assign(r, { name: nameOf(r.member) })) : [],
        log: all ? store.logs(30) : [],
      };
    },
    /**
     * action: restore 恢复 · approve 待审通过 · hide 隐藏 · delete 删除 · dismiss 驳回举报（内容保留）
     *         mute 禁言（days）· ban 封号 · unban · grant / revoke 授权（role, scope）
     * 人的目标写 m:角色 id 或 a:账号 id，处理都落到账号上。
     */
    adminAct(p, ctx) {
      const acc = staff(p, ctx);
      const action = str(p.action, 20), target = str(p.target, 50);
      const threadOf = (t) => { const [k, id] = t.split(':'); return k === 'p' ? (store.post(id) || {}).thread : k === 't' ? id : null; };
      const need = (ok) => { if (!ok) throw err(403, '没有这项权限'); };
      switch (action) {
        case 'restore': case 'approve': need(canModerate(acc, threadOf(target))); setHidden(target, 0); store.closeReports(target, 'dismissed'); break;
        case 'hide': need(canModerate(acc, threadOf(target))); setHidden(target, 1); store.closeReports(target, 'upheld'); break;
        case 'delete': need(canModerate(acc, threadOf(target))); setHidden(target, 3); store.closeReports(target, 'upheld'); break;
        case 'dismiss': need(canModerate(acc, threadOf(target))); store.closeReports(target, 'dismissed'); break;
        case 'mute': case 'ban': {
          need(isStaff(acc));
          const whom = targetAcc(target);
          if (rolesOf(whom).some((r) => r.role === 'owner')) throw err(403, '不能处理站长');
          const days = Number(p.days) > 0 ? Math.min(3650, Number(p.days)) : 0;
          store.setBan(whom, action, days ? Date.now() + days * 86400000 : null, str(p.reason, LIMIT.note), acc);
          if (action === 'ban') { removeAcc(whom); store.endSessionsOf(whom); send('kicked', { thread: null }, (c) => c.acc === whom); }
          break;
        }
        case 'unban': need(isStaff(acc)); store.unban(targetAcc(target)); break;
        case 'grant': case 'revoke': {
          const role = str(p.role, 10), scope = role === 'mod' ? str(p.scope, 40) : '', whom = targetAcc(target);
          if (!ROLES.includes(role) || role === 'owner') throw err(400, '只能分配 admin 或 mod');
          if (role === 'mod' && !store.thread(scope)) throw err(400, '版主要指定一个帖子');
          // 站长分配管理员；站长和管理员分配版主
          need(role === 'admin' ? rolesOf(acc).some((r) => r.role === 'owner') : isStaff(acc));
          if (!store.account(whom) && !store.member(whom)) throw err(404, '没有这个成员');
          if (action === 'grant') store.grant(whom, role, scope, acc); else store.revoke(whom, role, scope);
          break;
        }
        default: throw err(400, '不认识的操作');
      }
      store.log(acc, action, target, { days: p.days, role: p.role, scope: p.scope, reason: str(p.reason, LIMIT.note) });
      return { ok: true };
    },
  };

  return {
    api, clients, send, store, login, config: cfg,
    leaveAll(id) { for (const [tid, set] of here) if (set.delete(id)) moved(tid); },
    /** SSE 连接的身份：没登录也能收公开事件；登录了才收自己的待审回帖、被请离等私信 */
    streamIdentity(q) {
      try { const m = auth({ me: q.get('me'), key: q.get('key') }, { token: q.get('token') }); return { me: m.id, acc: m.account }; } catch (e) { return { me: '', acc: '' }; }
    },
  };
}

/** 本机页面才允许跨源调用：预览服务、DSH、file://、桌面壳。公网部署时用 TOWN_ORIGINS 追加 */
const EXTRA_ORIGINS = String(process.env.TOWN_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const okOrigin = (o) => !o || o === 'null' || o === 'app://roomkit' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o) || o.startsWith('dsh-app://') || EXTRA_ORIGINS.includes(o);

const page = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'" });
  res.end(body);
};

export function serve(town, port = PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const base = 'http://' + (req.headers.host || '127.0.0.1:' + port);

    // 登录页是顶层导航（新窗口），不带 Origin
    const a = req.method === 'GET' && url.pathname.match(/^\/auth\/([a-z]+)\/(start|callback)$/);
    if (a) {
      try {
        if (a[2] === 'start') {
          const r = town.login.start(a[1], url.searchParams.get('nonce'), base);
          if (r.redirect) { res.writeHead(302, { location: r.redirect, 'cache-control': 'no-store' }); return res.end(); }
          return page(res, 200, r.html);
        }
        return page(res, 200, (await town.login.callback(a[1], url.searchParams, base)).html);
      } catch (e) { return page(res, e.code || 500, '<meta charset="utf-8"><p style="font:15px system-ui;padding:40px">' + String(e.message).replace(/</g, '&lt;') + '</p>'); }
    }

    const origin = req.headers.origin;
    if (!okOrigin(origin)) { res.writeHead(403); return res.end(); }
    const cors = { 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'content-type, authorization', vary: 'origin' };
    if (req.method === 'OPTIONS') { res.writeHead(204, Object.assign({ 'access-control-allow-methods': 'GET, POST' }, cors)); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }, cors));
      const c = Object.assign({ res }, town.streamIdentity(url.searchParams));
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
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    try { json(200, await town.api[m[1]](p || {}, { token: bearer ? bearer[1] : '' })); } catch (e) {
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
  const auth = authConfig();
  const town = createTown(store, { auth, moderator });
  const how = town.login.providers().map((x) => x.label).join('、') || (auth.legacy ? '未配置，用原型身份' : '无');
  serve(town).on('listening', () => console.log(`AI 小镇中继：http://127.0.0.1:${PORT}/（只监听本机，${DB ? '数据存到 ' + DB : '数据只在内存里'}；登录：${how}；本地词表：${moderator.size()} 个词；屏蔽词服务：${process.env.MODERATION_URL ? '已配置' : '未配置'}）`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.close(); process.exit(0); });
}
