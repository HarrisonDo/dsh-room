#!/usr/bin/env node
/**
 * dsh-room · AI 小镇中继。论坛是底子：一个帖子 = 一个场景，回帖 = 场景里角色的一句话和动作。
 *
 * 只用 node:http：SSE 下行（/events）+ POST 上行（/api/*），只监听 127.0.0.1（公网由前面的反向代理转进来）。
 * 服务器保存帖子和受邀场次，判定共同状态。角色在主人侧调用模型并提交意图。
 *
 * 身份：账号 = 人（GitHub / linux.do 登录，见 town-auth.mjs），角色 = 账号名下的鲸鱼（最多 3 只）。
 *       请求带 Authorization: Bearer 令牌 + me（用哪只角色说话）。
 *       没配任何登录方式时沿用原型的 id + key（legacy，只适合本机）。
 *       权限、禁言、请离开、限流、举报去重都按账号算，换角色绕不过去。
 * 审核：回帖、标题、角色名先过 town-moderation.mjs；同一内容 3 个账号举报自动隐藏，等管理员处理。
 * 权限：owner 站长（TOWN_OWNER：账号 id 如 gh:123，或 github:登录名 / linuxdo:用户名，逗号分隔）
 *       → admin 管理员 → mod 版主（scope = 帖子 id）。帖主可以锁帖、请人离开。
 *
 *   node scripts/town.mjs [--port 18780] [--db town.db] [--words 词表.txt] [--web site]     不给 --db 时数据只在内存里
 *   环境变量：见 town-auth.mjs（登录）；TOWN_OWNER  TOWN_ORIGINS  MODERATION_URL  MODERATION_TOKEN  MODERATION_ON_ERROR=review|local
 *   Web 入口：TOWN_WEB_ROOT（scripts/build-site.mjs 的产物目录，同源提供首页、邀请页和带摘要的静态资源）
 *             TOWN_PUBLIC_WORLDS（随站点发布的公共世界清单）  TOWN_NAME  TOWN_PUBLIC_ENTRY=0（暂停公共世界入场）
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openStore } from './town-store.mjs';
import { createModerator } from './town-moderation.mjs';
import { authConfig, createAuth, hashToken } from './town-auth.mjs';
import { WORLD_BYTES } from '../shared/world-format.js';
import { createWorldService } from './world-service.mjs';
import { createAccountService } from './account-service.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(arg('--port', process.env.TOWN_PORT || 18780));
const DB = arg('--db', process.env.TOWN_DB || '');
const WEB = arg('--web', process.env.TOWN_WEB_ROOT || '');
const WORDS = arg('--words', process.env.TOWN_WORDS || '');
// 默认只监听本机；容器里设 TOWN_HOST=0.0.0.0，由 compose 只把端口暴露给前面的 Caddy
const HOST = process.env.TOWN_HOST || '127.0.0.1';

export const LIMIT = { body: 400 * 1024, text: 200, title: 40, name: 16, note: 100, recent: 60, threads: 500, threadsPerDay: 10, acts: 2, perMinute: 12, hereMax: 12, reportHide: 3, kickMs: 3600000, characters: 3 };
const THREAD_PAGE = 200;
const WRITE_WINDOW = 60_000;
const ACCOUNT_WRITES = 60;
const PEER_WRITES = 240;
const PUBLIC_READS = 120;
export const SYSTEM_OWNER = 'system:roomkit';
const STREAM_LIMIT = { total: 96, peer: 64, account: 4, bytes: 64 * 1024 };
const THREAD_EVENTS = new Set(['presence', 'post', 'likes', 'hidden']);
const transportStats = () => ({ requests: 0, jsonResponses: 0, jsonErrors: 0, jsonBytes: 0, townStreamBytes: 0, townStreamDrops: 0, droppedConnections: 0 });
const ACT_RE = /^(wave|dance|sleep|read|emote:[a-z]{1,8}|goto:[^:]{1,20}|use:[^:]{1,20})$/;
export const REASONS = ['辱骂', '色情', '广告', '违法', '刷屏', '其他'];
const ROLES = ['owner', 'admin', 'mod'];

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rid = (p) => p + randomBytes(12).toString('hex');
const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function checkScene(scene) {
  const invalid = (field) => { throw err(400, `场景格式不对（${field}）`); };
  if (!isObject(scene) || scene.format !== 'roomkit.scene' || (scene.v != null && ![1, 2].includes(scene.v))) invalid('format/v');
  const { room, objects, agents, stories, env } = scene;
  if (!isObject(room) || ![room.w, room.h].every((n) => Number.isInteger(n) && n >= 1 && n <= 40)) invalid('room');
  if (room.cells != null && (!Array.isArray(room.cells) || room.cells.length > room.h || !room.cells.every((row) => typeof row === 'string' && row.length <= room.w && /^[a-z.]*$/.test(row)))) invalid('room.cells');
  if (room.mats != null && (!Array.isArray(room.mats) || room.mats.length > 26 || !room.mats.every(isObject))) invalid('room.mats');
  if (room.walls != null && !isObject(room.walls)) invalid('room.walls');
  if (env != null && !isObject(env)) invalid('env');
  if (agents != null && !Array.isArray(agents)) invalid('agents');
  if (stories != null && (!Array.isArray(stories) || stories.length > 20 || !stories.every(isObject))) invalid('stories');
  if (!Array.isArray(objects) || objects.length > 400) invalid('objects');
  const ids = new Set();
  for (const [index, object] of objects.entries()) {
    if (!isObject(object) || typeof object.id !== 'string' || !object.id || object.id.length > 80 || ids.has(object.id) || typeof object.def !== 'string' || !object.def || object.def.length > 100) invalid(`objects[${index}]`);
    const { x, y, wall, at, z } = object;
    const validFloor = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < room.w && y < room.h;
    const validWall = ['left', 'right'].includes(wall) && Number.isFinite(at) && (z == null || Number.isFinite(z));
    if (wall == null ? !validFloor : !validWall) invalid(`objects[${index}].position`);
    if (object.state != null && !isObject(object.state)) invalid(`objects[${index}].state`);
    ids.add(object.id);
  }
  if (Buffer.byteLength(JSON.stringify(scene), 'utf8') > LIMIT.body) throw err(413, '场景太大');
}

export function createTown(store, opts = {}) {
  const mod = opts.moderator || createModerator();
  const cfg = opts.auth || Object.assign(authConfig({}), { owners: opts.owner ? [opts.owner] : [] });
  const site = { name: str(opts.name, 40) || 'RoomKit', publicEntry: opts.publicEntry !== false };
  const streamLimit = { ...STREAM_LIMIT, ...opts.streamLimit };
  const transport = transportStats();
  const here = new Map(), kicked = new Map(), clients = new Set(), stamps = new Map();
  let sweepAt = 0;
  const at = (id) => { if (!here.has(id)) here.set(id, new Set()); return here.get(id); };
  if (!store.thread('plaza')) store.putThread({ id: 'plaza', title: '小镇广场', owner: null, scene: null, sceneRef: 'yard', t: Date.now() });
  // 站长：账号 id（gh:123 / ld:45 / 原型的成员 id）直接授权；「github:登录名」这种等那个账号登录时再认
  for (const o of cfg.owners) if (!/^(github|linuxdo|dev):/.test(o)) store.grant(o, 'owner', '', 'config');
  const onAccount = (a) => { if (cfg.owners.includes(a.provider + ':' + a.login)) store.grant(a.id, 'owner', '', 'config'); };
  const login = createAuth({ config: cfg, store, onAccount, fetchImpl: opts.fetch });

  const pub = (m) => m && { id: m.id, name: m.name, kind: m.kind, look: m.look };
  const member = (id) => pub(store.member(id));
  const presence = (id) => [...(here.get(id) || [])].map(member).filter(Boolean);
  const brief = (t) => ({ id: t.id, title: t.title, owner: member(t.owner), posts: t.posts, likes: t.likes || 0, locked: t.locked, here: presence(t.id), last: t.last || t.t });
  function threadPage({ limit = THREAD_PAGE, offset = 0, sort } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > THREAD_PAGE || !Number.isSafeInteger(offset) || offset < 0) throw err(400, '分页参数不合法');
    const rows = store.threads(typeof sort === 'string' ? sort : 'active', limit + 1, offset);
    return { threads: rows.slice(0, limit).map((t) => ({ ...brief(t), t: t.t })), nextOffset: rows.length > limit ? offset + limit : null };
  }

  function writeStream(client, line) {
    const { res } = client;
    if (!res.writable) return;
    const bytes = Buffer.byteLength(line);
    if (res.writableLength + bytes <= streamLimit.bytes) {
      transport.townStreamBytes += bytes;
      if (res.write(line)) return;
    }
    transport.townStreamDrops++;
    res.destroy();
  }

  function endIdentity(client) {
    const { res } = client;
    const line = 'event: sessionEnded\ndata: {}\n\n';
    if (!res.writable) return;
    const bytes = Buffer.byteLength(line);
    if (res.writableLength + bytes > streamLimit.bytes) {
      transport.townStreamDrops++;
      res.destroy();
    } else {
      transport.townStreamBytes += bytes;
      res.end(line);
    }
  }

  function streamActive(client) {
    return !client.acc || (store.member(client.me)?.account === client.acc && store.ban(client.acc)?.kind !== 'ban'
      && (!client.tokenHash || store.session(client.tokenHash) === client.acc));
  }

  const send = (ev, data, only) => {
    const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    const scoped = THREAD_EVENTS.has(ev);
    const occupants = scoped ? here.get(data.thread) : null;
    for (const client of clients) {
      if (scoped && !occupants?.has(client.me)) continue;
      if (only && !only(client)) continue;
      if (streamActive(client)) writeStream(client, line);
      else endIdentity(client);
    }
  };
  const threadsChanged = () => send('threads', {});
  const thread = (id) => { const t = store.thread(str(id, 40)); if (!t || t.hidden) throw err(404, '没有这个帖子'); return t; };
  const moved = (id) => {
    if (here.get(id)?.size === 0) here.delete(id);
    send('presence', { thread: id, here: presence(id) });
    threadsChanged();
  };
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
  const ownsThread = (acc, t) => !!t.owner && (t.ownerAccount || accOf(t.owner)) === acc;
  const canSpeak = (acc) => {
    const b = store.ban(acc);
    if (b) throw err(403, b.kind === 'ban' ? '账号已被封禁' : '禁言中' + (b.until ? '，到 ' + new Date(b.until).toLocaleString('zh-CN') : ''));
  };
  const staff = (p, ctx) => { const { acc } = who(p, ctx); if (!isStaff(acc) && !rolesOf(acc).some((r) => r.role === 'mod')) throw err(403, '没有管理权限'); return acc; };

  function limitWrite(accountId, ctx, posting = false) {
    const now = Date.now();
    if (now >= sweepAt) {
      sweepAt = now + WRITE_WINDOW;
      for (const [key, times] of stamps) if (times.at(-1) <= now - WRITE_WINDOW) stamps.delete(key);
      for (const [key, until] of kicked) if (until <= now) kicked.delete(key);
    }
    const limits = [[`account:${accountId}`, ACCOUNT_WRITES]];
    if (ctx?.peer) limits.push([`peer:${ctx.peer}`, PEER_WRITES]);
    if (posting) limits.push([`post:${accountId}`, LIMIT.perMinute]);
    const buckets = limits.map(([key, limit]) => {
      const times = (stamps.get(key) || []).filter((time) => time > now - WRITE_WINDOW);
      if (times.length >= limit) throw err(429, '操作太快了');
      return [key, times];
    });
    for (const [key, times] of buckets) stamps.set(key, [...times, now]);
  }

  /** 未登录也能读的公开接口：只按来源限频 */
  function limitPublic(ctx) {
    if (!ctx?.peer) return;
    const now = Date.now(), key = `public:${ctx.peer}`;
    const times = (stamps.get(key) || []).filter((time) => time > now - WRITE_WINDOW);
    if (times.length >= PUBLIC_READS) throw err(429, '操作太快了');
    stamps.set(key, [...times, now]);
  }
  const viewer = (ctx) => (ctx?.token && store.session(hashToken(ctx.token))) || null;
  const displayName = (id) => {
    if (id === SYSTEM_OWNER) return site.name;
    const a = typeof id === 'string' && !id.startsWith('public:') ? store.account(id) : null;
    return a ? a.name || a.login || '' : '';
  };

  function checkPost(p, ctx) {
    const m = auth(p, ctx), t = thread(p.thread);
    canSpeak(m.account);
    if (!at(t.id).has(m.id)) throw err(403, '先进入这个帖子');
    if (t.locked && !canModerate(m.account, t.id) && !ownsThread(m.account, t)) throw err(403, '帖子已锁');
    return { m, t };
  }
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
  const lookOf = (p) => {
    if (!isObject(p.look)) return {};
    if (Buffer.byteLength(JSON.stringify(p.look), 'utf8') > 2000) throw err(400, '外形资料太大');
    return p.look;
  };

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
      threadsChanged();
      return t;
    }
    throw err(400, '目标不对');
  }

  const api = {
    /* ───────── 登录与角色 ───────── */

    /** 页面先问：开了哪些登录方式 */
    config() {
      return { providers: login.providers(), legacy: !!cfg.legacy, reasons: REASONS, maxCharacters: LIMIT.characters,
        service: { name: site.name }, open: { registration: cfg.registration !== false, publicWorlds: site.publicEntry },
        features: { publicWorlds: true, invitePreview: true, accountBootstrap: true } };
    },
    authPoll(p) {
      const d = login.poll(p.nonce);
      if (!d) return { pending: true };
      if (d.error) throw err(400, d.error);
      return { token: d.token };
    },
    logout(p, ctx) {
      if (ctx?.token) {
        const tokenHash = hashToken(ctx.token);
        store.endSession(tokenHash);
        for (const client of clients) if (client.tokenHash === tokenHash) endIdentity(client);
        worlds.sessions.invalidate({ tokenHash });
      }
      return { ok: true };
    },
    /** 我是谁、名下有哪些角色、什么权限 */
    me(p, ctx) {
      const { acc } = who(p, ctx);
      const a = store.account(acc);
      return { account: a || { id: acc }, characters: store.charactersOf(acc).map(pub), roles: rolesOf(acc), ban: store.ban(acc), ...threadPage(), reasons: REASONS };
    },
    /** 建或更新自己名下的角色：me 为空就新建 */
    async character(p, ctx) {
      const { acc } = who(p, ctx);
      const requested = str(p.me, 40);
      const old = requested ? store.member(requested) : null;
      if (old && old.account !== acc) throw err(403, '这只角色不是你的');
      if (!old && store.characterCount(acc) >= LIMIT.characters) throw err(429, `每个账号最多 ${LIMIT.characters} 只角色`);
      const look = lookOf(p);
      limitWrite(acc, ctx);
      const name = await cleanField(str(p.name, LIMIT.name) || '鲸鱼', 'name', { account: acc });
      return store.transaction(() => {
        if (who(p, ctx).acc !== acc || store.ban(acc)?.kind === 'ban') throw err(403, '账号已失去权限');
        const current = requested ? store.member(requested) : null;
        if (current && current.account !== acc) throw err(403, '这只角色不是你的');
        if (old && !current) throw err(404, '角色已删除');
        if (!current && store.characterCount(acc) >= LIMIT.characters) throw err(429, `每个账号最多 ${LIMIT.characters} 只角色`);
        const id = current?.id || rid('c');
        store.putMember({ id, key: '', name, kind: p.kind === 'whale' ? 'whale' : 'girl', look, account: acc });
        return { character: pub(store.member(id)) };
      });
    },
    deleteCharacter(p, ctx) {
      const m = auth(p, ctx);
      limitWrite(m.account, ctx);
      for (const [tid, set] of here) if (set.delete(m.id)) moved(tid);
      store.deleteMember(m.id);
      for (const client of clients) if (client.me === m.id) endIdentity(client);
      worlds.sessions.invalidate({ characterId: m.id });
      return { ok: true };
    },
    /** 原型身份（legacy）：id 和 key 配对，账号就是这只角色自己 */
    async hello(p, ctx) {
      if (!cfg.legacy) throw err(410, '这个小镇需要登录');
      const id = str(p.me, 40) || rid('m');
      const key = str(p.key, 64);
      if (!/^[a-z0-9_-]{4,40}$/i.test(id) || key.length < 16) throw err(400, 'id 或 key 不合法');
      const old = store.member(id);
      if (old && old.key !== key) throw err(401, '这个 id 已被别人绑定');
      const look = lookOf(p);
      limitWrite(id, ctx);
      const name = await cleanField(str(p.name, LIMIT.name) || '鲸鱼', 'name', { account: id });
      store.transaction(() => {
        const current = store.member(id);
        if (current && current.key !== key) throw err(401, '这个 id 已被别人绑定');
        if (store.ban(id)?.kind === 'ban') throw err(403, '账号已被封禁');
        store.putMember({ id, key, name, kind: p.kind === 'whale' ? 'whale' : 'girl', look, account: id });
      });
      const acc = store.member(id).account;
      return { me: Object.assign(member(id), { roles: rolesOf(acc), ban: store.ban(acc) }), ...threadPage(), reasons: REASONS };
    },

    /* ───────── 帖子 ───────── */

    threads: threadPage,
    worldMetrics(p, ctx) {
      if (!isStaff(who(p, ctx).acc)) throw err(403, '只有站点管理者可查看运行指标');
      return { http: { ...transport }, townStreams: clients.size, worlds: worlds.sessions.metrics() };
    },
    /** 点赞只给人点（不给 AI 自动点）：必须带登录身份；不能赞自己 */
    like(p, ctx) {
      const { acc } = who(p, ctx);
      const target = str(p.target, 50), [kind, id] = target.split(':');
      const obj = kind === 'p' ? store.post(id) : kind === 't' ? store.thread(id) : null;
      if (!obj || obj.hidden || (kind === 't' && id === 'plaza')) throw err(404, '没有这条内容');
      if (kind === 'p' ? accOf(obj.by) === acc : ownsThread(acc, obj)) throw err(400, '不能给自己点赞');
      limitWrite(acc, ctx);
      const likes = store.like(target, acc, p.on !== false);
      if (kind === 'p') send('likes', { thread: obj.thread, post: id, likes }); else threadsChanged();
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
      checkScene(p.scene);
      limitWrite(m.account, ctx);
      const title = await cleanField(str(p.title, LIMIT.title) || m.name + '的家', 'title', m);
      const t = store.transaction(() => {
        const actor = auth(p, ctx);
        canSpeak(actor.account);
        if (store.threadCount() >= LIMIT.threads) throw err(429, '小镇的帖子满了');
        const now = Date.now();
        if (store.threadsBy(actor.account, now - 86400000) >= LIMIT.threadsPerDay) throw err(429, '今天开的帖子够多了');
        const record = { id: rid('t'), title, owner: actor.id, ownerAccount: actor.account, scene: { ...p.scene, agents: [] }, t: now };
        store.putThread(record);
        return record;
      });
      threadsChanged();
      return { thread: brief({ ...t, posts: 0, locked: false }) };
    },
    join(p, ctx) {
      const m = auth(p, ctx), t = thread(p.thread);
      const b = store.ban(m.account);
      if (b && b.kind === 'ban') throw err(403, '账号已被封禁');
      const k = kicked.get(t.id + '|' + m.account);
      if (k && k > Date.now()) throw err(403, '你被请出了这个帖子，过一会儿再来');
      const occupants = at(t.id);
      if (occupants.has(m.id)) return { ok: true };
      if (occupants.size >= LIMIT.hereMax) throw err(429, '这个帖子人满了');
      limitWrite(m.account, ctx);
      for (const [id, set] of here) if (id !== t.id && set.delete(m.id)) moved(id);
      occupants.add(m.id);
      moved(t.id);
      return { ok: true };
    },
    leave(p, ctx) {
      const m = auth(p, ctx), t = thread(p.thread);
      if (at(t.id).delete(m.id)) moved(t.id);
      return { ok: true };
    },
    async post(p, ctx) {
      const { m, t } = checkPost(p, ctx);
      limitWrite(m.account, ctx, true);
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
      const rec = { id: rid('p'), thread: t.id, by: m.id, text, acts, human: !!p.human, t: Date.now(), hidden, labels };
      store.addPost(rec, () => checkPost(p, ctx));
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
      limitWrite(acc, ctx);
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
      limitWrite(acc, ctx);
      store.setThread(t.id, { locked: !!p.locked });
      store.log(acc, p.locked ? 'lock' : 'unlock', 't:' + t.id);
      threadsChanged();
      return { ok: true };
    },
    kick(p, ctx) {
      const { acc } = who(p, ctx), t = thread(p.thread), target = accOf(str(p.member, 40));
      if (!ownsThread(acc, t) && !canModerate(acc, t.id)) throw err(403, '只有帖主和版主能请人离开');
      if (target === acc || ownsThread(target, t)) throw err(400, '不能请自己或帖主离开');
      limitWrite(acc, ctx);
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
        pending: [
          ...store.pendingPosts().filter((x) => inScope(x.thread)).map((x) => ({ target: 'p:' + x.id, item: { kind: 'p', thread: x.thread, text: x.text, by: member(x.by), labels: x.labels } })),
          ...(all ? worlds.sessions.speechQueue().map((x) => ({ target: 'w:' + x.id, item: { kind: 'w', thread: x.session_id, text: x.text, by: member(x.character_id), human: x.source === 'human' } })) : []),
        ],
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
      limitWrite(acc, ctx);
      const action = str(p.action, 20), target = str(p.target, 50);
      const threadOf = (t) => { const [k, id] = t.split(':'); return k === 'p' ? (store.post(id) || {}).thread : k === 't' ? id : null; };
      const need = (ok) => { if (!ok) throw err(403, '没有这项权限'); };
      switch (action) {
        case 'restore': case 'approve': case 'hide': case 'delete': {
          if (target.startsWith('w:')) {
            need(isStaff(acc) && ['approve', 'delete'].includes(action));
            worlds.sessions.resolveSpeech(target.slice(2), action === 'approve');
            break;
          }
          need(canModerate(acc, threadOf(target)));
          const hidden = action === 'hide' ? 1 : action === 'delete' ? 3 : 0;
          setHidden(target, hidden);
          store.closeReports(target, hidden ? 'upheld' : 'dismissed');
          break;
        }
        case 'dismiss': need(canModerate(acc, threadOf(target))); store.closeReports(target, 'dismissed'); break;
        case 'mute': case 'ban': {
          need(isStaff(acc));
          const whom = targetAcc(target);
          if (rolesOf(whom).some((r) => r.role === 'owner')) throw err(403, '不能处理站长');
          const days = Number(p.days) > 0 ? Math.min(3650, Number(p.days)) : 0;
          store.setBan(whom, action, days ? Date.now() + days * 86400000 : null, str(p.reason, LIMIT.note), acc);
          if (action === 'ban') {
            store.endSessionsOf(whom);
            for (const client of clients) if (client.acc === whom) endIdentity(client);
            worlds.sessions.invalidate({ accountId: whom });
            removeAcc(whom);
          }
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

  const worlds = createWorldService({
    store: store.world,
    account: (p, ctx) => {
      const { acc } = who(p, ctx);
      if (store.ban(acc)?.kind === 'ban') throw err(403, '账号已被封禁');
      return acc;
    },
    actor: auth, allowWrite: limitWrite, canSpeak, options: opts.worldLimits, isStaff,
    publicAccess: { open: () => site.publicEntry, limit: limitPublic, viewer, name: displayName },
    moderate: (text, author, threadId) => mod.check(text, 'post', { author, thread: threadId }),
    identityActive: ({ accountId, characterId, tokenHash }) => store.member(characterId)?.account === accountId
      && store.ban(accountId)?.kind !== 'ban' && (tokenHash ? store.session(tokenHash) === accountId : cfg.legacy),
  });
  Object.assign(api, worlds.api);
  // 账号身份与账户家：只认正式登录令牌，原型 me/key 身份不进入账户接口
  Object.assign(api, createAccountService({
    store: store.accountStore,
    authenticate: (ctx) => (ctx?.token ? who({}, ctx).acc : null),
    enableResources: false,
  }));
  return {
    api, worlds, transport, clients, send, store, login, config: cfg,
    leaveAll(id) { for (const [tid, set] of here) if (set.delete(id)) moved(tid); },
    streamIdentity(q, peer) {
      let identity = { me: '', acc: '' };
      if (q.has('token') || q.has('me') || q.has('key')) {
        const token = q.get('token');
        if (q.has('token') && !token) throw err(401, '登录过期了，重新登录');
        const m = auth({ me: q.get('me'), key: q.get('key') }, { token });
        if (store.ban(m.account)?.kind === 'ban') throw err(403, '账号已被封禁');
        identity = { me: m.id, acc: m.account, tokenHash: token ? hashToken(token) : '' };
      }
      const current = [...clients];
      if (current.length >= streamLimit.total || current.filter((c) => c.peer === peer).length >= streamLimit.peer
        || (identity.acc && current.filter((c) => c.acc === identity.acc).length >= streamLimit.account)) throw err(429, '小镇连接数已满');
      return { ...identity, peer };
    },
    pingStreams() {
      for (const client of clients) {
        if (streamActive(client)) writeStream(client, ': ping\n\n');
        else endIdentity(client);
      }
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

const errorStatus = (error) => Number.isInteger(error?.code) && error.code >= 400 && error.code < 500 ? error.code : 500;

/* ───────── Web 入口：受限静态目录，只认页面路由和 /assets ───────── */

const WEB_PAGES = /^\/(?:|invite|home|worlds(?:\/[A-Za-z0-9_-]{1,80})?)$/;
const WEB_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const WEB_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export async function webSite(dir) {
  if (!dir) return null;
  const root = await realpath(dir);
  if (!(await stat(path.join(root, 'index.html'))).isFile()) throw new Error('Web 目录缺少 index.html：' + dir);
  return { root };
}

async function sendWeb(req, res, site, pathname) {
  const page = WEB_PAGES.test(pathname) ? 'index.html' : pathname === '/guide' ? 'guide.html' : null;
  const asset = !page && pathname.startsWith('/assets/') && /^\/assets\/[A-Za-z0-9._-]{1,120}$/.test(pathname) ? pathname.slice(1) : null;
  const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  const notFound = () => {
    res.writeHead(404, { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': WEB_CSP });
    res.end(req.method === 'HEAD' ? undefined : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>没有这个页面</title><main style="font:16px system-ui;max-width:32rem;margin:18vh auto;padding:0 20px;color:#2c3550"><h1>没有这个页面</h1><p><a href="/">回到首页</a></p></main>');
  };
  if (!page && !asset) return notFound();
  try {
    const file = await realpath(path.join(site.root, page || asset));
    if (!file.startsWith(site.root + path.sep) || !(await stat(file)).isFile()) return notFound();
    const body = await readFile(file);
    const hashed = asset && /\.[0-9a-f]{10,}\.[a-z]+$/.test(asset);
    res.writeHead(200, { ...headers, 'content-type': WEB_TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(page ? { 'content-security-policy': WEB_CSP, 'x-frame-options': 'DENY' } : {}) });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { notFound(); }
}

export function serve(town, port = PORT, host = HOST, { web = null } = {}) {
  let stopped = false;
  const transport = town.transport || transportStats();
  async function handleRequest(req, res) {
    const canReply = () => res.writable && !req.socket.destroyed;
    const url = URL.parse(req.url, 'http://x');
    if (!url) { res.writeHead(400, { connection: 'close' }); return res.end(); }

    // 登录页是顶层导航（新窗口），不带 Origin
    const a = req.method === 'GET' && url.pathname.match(/^\/auth\/([a-z]+)\/(start|callback)$/);
    if (a) {
      const base = 'http://' + (req.headers.host || '127.0.0.1:' + port);
      try {
        if (a[2] === 'start') {
          const r = town.login.start(a[1], url.searchParams.get('nonce'), base);
          if (r.redirect) { res.writeHead(302, { location: r.redirect, 'cache-control': 'no-store' }); return res.end(); }
          return page(res, 200, r.html);
        }
        const { html } = await town.login.callback(a[1], url.searchParams, base);
        if (canReply()) page(res, 200, html);
      } catch (e) {
        if (!canReply()) return;
        if (res.headersSent) return res.destroy();
        const code = errorStatus(e);
        const message = code === 500 ? '服务器出错了' : e.message;
        page(res, code, '<meta charset="utf-8"><p style="font:15px system-ui;padding:40px">' + String(message).replace(/</g, '&lt;') + '</p>');
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    // 有 Web 目录时，除 API、登录、SSE 和健康检查外的 GET 都交给站点；页面路由回落到 index.html，API 的错误仍是 JSON
    if (web && ['GET', 'HEAD'].includes(req.method) && !/^\/(api|auth)\//.test(url.pathname) && !['/events', '/world-events'].includes(url.pathname)) {
      return sendWeb(req, res, web, url.pathname);
    }
    if (req.method === 'GET' && url.pathname === '/invite') {
      return page(res, 200, '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoomKit 世界邀请</title><main style="max-width:38rem;margin:48px auto;padding:0 18px;font:16px system-ui"><h1>RoomKit 世界邀请</h1><p>复制这条链接。在 RoomKit 的「社区 → AI 世界」连接对应小镇，选择本机角色，再将链接粘贴到邀请框。</p><p>独立预览和 DSH 房间均可加入。未连接模型时可以手动操作。</p></main>');
    }
    const origin = req.headers.origin;
    // 站点自己的页面是同源请求，不需要写进 TOWN_ORIGINS
    const sameSite = web && origin && URL.parse(origin)?.host === req.headers.host;
    if (!sameSite && !okOrigin(origin)) { res.writeHead(403); return res.end(); }
    const cors = { 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'content-type, authorization', vary: 'origin' };
    if (req.method === 'OPTIONS') { res.writeHead(204, Object.assign({ 'access-control-allow-methods': 'GET, POST' }, cors)); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/world-events' && town.worlds) {
      let ticket;
      try { ticket = town.worlds.sessions.consumeTicket(url.searchParams.get('ticket'), req.socket.remoteAddress); }
      catch (error) { res.writeHead(errorStatus(error), cors); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...cors });
      return town.worlds.sessions.connectStream(ticket, res);
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      let identity;
      try { identity = town.streamIdentity(url.searchParams, req.socket.remoteAddress); }
      catch (error) { res.writeHead(errorStatus(error), cors); return res.end(); }
      res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }, cors));
      const c = { res, ...identity };
      town.clients.add(c);
      res.once('close', () => {
        town.clients.delete(c);
        if (!stopped && c.me && ![...town.clients].some((x) => x.me === c.me)) town.leaveAll(c.me);   // 页面关了就算离开
      });
      res.write('retry: 3000\n\n');
      return;
    }
    const json = (code, data, headers) => {
      if (!canReply()) return;
      const body = JSON.stringify(data);
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...headers });
      res.end(body);
      transport.jsonResponses++;
      if (code >= 400) transport.jsonErrors++;
      transport.jsonBytes += body ? Buffer.byteLength(body) : 0;
    };
    const m = url.pathname.match(/^\/api\/([a-zA-Z]+)$/);
    if (req.method !== 'POST' || !m || !Object.hasOwn(town.api, m[1])) return json(404, { error: 'not found' });
    const bodyLimit = m[1] === 'worldPublish' ? WORLD_BYTES : LIMIT.body;
    const tooLarge = () => json(413, { error: '内容太大' }, { connection: 'close' });
    try {
      if (Number(req.headers['content-length']) > bodyLimit) return tooLarge();
      let size = 0;
      const parts = [];
      // 超限时先发 413，再关闭连接，退出迭代时不能先销毁 socket。
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > bodyLimit) return tooLarge();
        parts.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(parts, size).toString('utf8') || '{}'); }
      catch { return json(400, { error: 'body is not JSON' }); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'body must be a JSON object' });

      if (!canReply()) return;
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
      json(200, await town.api[m[1]](body, { token: bearer ? bearer[1] : '', peer: req.socket.remoteAddress }));
    } catch (e) {
      if (!canReply()) return;
      if (res.headersSent) return res.destroy();
      const code = errorStatus(e);
      if (code === 500) console.error('[town]', m[1], '请求处理失败');
      json(code, code === 500 ? { error: '服务器出错了' } : { error: e.message, labels: e.labels, code: e.reason });
    }
  }

  const server = http.createServer({
    maxHeaderSize: 16 * 1024,
    headersTimeout: 10_000,
    requestTimeout: 20_000,
    keepAliveTimeout: 5_000,
    connectionsCheckingInterval: 1_000,
  }, (req, res) => {
    transport.requests++;
    res.on('error', () => res.destroy());
    handleRequest(req, res).catch(() => res.destroy());
  });
  server.setTimeout(30_000);   // 空闲连接回收，长于 SSE 的 20 秒心跳
  server.maxConnections = 256;
  server.on('drop', () => { transport.droppedConnections++; });
  const ping = setInterval(() => town.pingStreams?.(), 20_000).unref();
  const maintenance = setInterval(() => {
    try { town.worlds?.sessions.tick(); }
    catch { console.error('[town] 世界场次维护失败'); }
  }, 5_000).unref();
  server.once('close', () => {
    stopped = true;
    town.worlds?.sessions.stop();
    clearInterval(ping);
    clearInterval(maintenance);
  });
  server.listen(port, host);
  return server;
}

/** 随站点发布的公共世界：[{ worldId, release, listing }]，归 SYSTEM_OWNER 所有；内容没变不发新版本 */
export async function seedPublicWorlds(town, file) {
  if (!file) return 0;
  const list = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error('公共世界清单需要是数组');
  for (const item of list) await town.worlds.seedPublicWorld({ worldId: item.worldId, owner: SYSTEM_OWNER, release: item.release, listing: item.listing || {} });
  return list.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const worldLimits = {};
  for (const [name, key] of [['TOWN_WORLD_ACTIVE_LIMIT', 'active'], ['TOWN_WORLD_STREAM_LIMIT', 'streams']]) {
    if (!process.env[name]) continue;
    const n = Number(process.env[name]);
    if (!Number.isSafeInteger(n) || n < 1 || n > 96) throw new Error(name + ' 需要是 1 到 96 的整数');
    worldLimits[key] = n;
  }
  const store = await openStore(DB || ':memory:');
  const moderator = createModerator({ url: process.env.MODERATION_URL, token: process.env.MODERATION_TOKEN, onError: process.env.MODERATION_ON_ERROR, wordsFile: WORDS });
  const auth = authConfig();
  const town = createTown(store, { auth, moderator, worldLimits, name: process.env.TOWN_NAME, publicEntry: process.env.TOWN_PUBLIC_ENTRY !== '0' });
  const web = await webSite(WEB);
  const seeded = await seedPublicWorlds(town, process.env.TOWN_PUBLIC_WORLDS);
  const how = town.login.providers().map((x) => x.label).join('、') || (auth.legacy ? '未配置，用原型身份' : '无');
  serve(town, PORT, HOST, { web }).on('listening', () => console.log(`AI 小镇中继：http://${HOST}:${PORT}/（${DB ? '数据存到 ' + DB : '数据只在内存里'}；登录：${how}；Web 入口：${web ? web.root : '未启用'}；公共世界：${seeded}；本地词表：${moderator.size()} 个词；屏蔽词服务：${process.env.MODERATION_URL ? '已配置' : '未配置'}）`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.close(); process.exit(0); });
}
