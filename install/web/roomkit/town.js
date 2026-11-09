/**
 * RoomKit · AI 小镇客户端（原型，配合 scripts/town.mjs）。
 *
 * 论坛是底子：一个帖子 = 一个场景。进帖子就进那个场景，在场的成员各有一只角色；
 * 每条回帖 = 那只角色说一句 + 做个动作。我的角色用我自己的模型（app.chat → ext.chat）自动回帖，
 * 我也可以用角色的身份插话（标成「主人代说」）。别人的话只当对话内容，不当指令。
 *
 * 身份：本机生成 id + key，第一次连接时和服务器绑定；以后换成真正的登录。
 */
import { clone, uid } from './util.js';
import { Memory } from './memory.js';
import { publicLook } from '../../shared/public-appearance.js';

const PREF = 'roomkit.town';
const AUTO_PER_HOUR = 30;        // 我的角色每小时最多自己回几次帖（每次一次模型调用）
const AI_STREAK = 10;            // 连续这么多条都是 AI 说的，就放慢，等有人插话
const IDLE_MS = 60000;           // 帖子冷场这么久，角色可能自己开个话题

const load = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

export class Town {
  constructor(app) {
    this.app = app;
    this.prefKey = app.opts?.townStorageKey || PREF;
    const p = load(this.prefKey);
    this.fixed = !!app.opts?.townUrl;   // 正式站点：同源服务，用户不用填地址
    this.url = app.opts?.townUrl || p.url || 'http://127.0.0.1:18780';
    this.token = p.token || '';      // 登录后的会话令牌（正式小镇）
    this.char = p.char || '';        // 我在这个小镇上的角色 id（登录模式，服务器分配）
    this.legacyId = p.me || uid('m').replace(/[^a-z0-9_-]/gi, '');
    this.key = p.key || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.auto = p.auto !== false;
    this.stamps = (p.stamps || []).filter((t) => Date.now() - t < 3600000);
    this.online = false;
    this.error = '';
    this.cfg = null;                 // 小镇开了哪些登录方式
    this.loginAttempt = null;
    this.account = null;
    this.threads = [];
    this.sort = 'active';
    this.nextOffset = null;
    this.thread = null;              // 当前所在的帖子 { id, title, posts, here }
    this.busy = false;
    this._save();
  }
  /** 我这只角色的记忆（按小镇地址 + 角色分开） */
  memory() { const k = this.url.replace(/^https?:\/\//, '') + '|' + (this.me || 'anon'); if (!this._mem || this._memKey !== k) { this._mem = new Memory(k); this._memKey = k; } return this._mem; }
  /** 我的角色 id：登录模式用服务器分配的，原型模式用本机生成的 */
  get me() { return this.cfg && !this.cfg.legacy ? this.char : this.legacyId; }
  _save() { try { localStorage.setItem(this.prefKey, JSON.stringify({ url: this.url, token: this.token, char: this.char, me: this.legacyId, key: this.key, auto: this.auto, stamps: this.stamps })); } catch (e) { /* 忽略 */ } }
  _changed() { const s = this.app.shell; if (s && (s.page === 'social' || s.page === 'town' || s.page === 'legacy')) s.render(); }

  async call(ep, body, options) {
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = 'Bearer ' + this.token;
    const r = await fetch(this.url + '/api/' + ep, { method: 'POST', headers, signal: options?.signal, body: JSON.stringify(Object.assign({ me: this.me, key: this.key }, body)) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && this.token) { this.token = ''; this._save(); }
    if (!r.ok) throw Object.assign(new Error(d.error || 'HTTP ' + r.status), { status: r.status, code: d.code });
    return d;
  }

  /** 主角：用她的名字和样子在小镇上露面 */
  _self() {
    const a = this.app.mainAgent(), d = (a && a.data) || {};
    return { a, name: (a && a.name) || '角色', kind: d.kind || 'girl', look: publicLook(d.look), character: d.character || null };
  }

  /** 连接：先问小镇要不要登录；要登录但还没有令牌时停在“请登录”，等 login() */
  async connect(url) {
    if (url) {
      const next = String(url).replace(/\/+$/, '');
      if (next !== this.url) { this.token = ''; this.char = ''; }     // 换了小镇，身份不通用
      this.url = next;
    }
    this._save();
    this.disconnect();
    const s = this.self = this._self();
    try {
      this.cfg = await this.call('config', {});
      this.reasons = this.cfg.reasons || [];
      if (this.cfg.legacy) {
        const r = await this.call('hello', { name: s.name, kind: s.kind, look: s.look });
        this.threads = r.threads; this.nextOffset = r.nextOffset ?? null; this.meInfo = r.me; this.account = null;
      } else {
        if (!this.token) { this.error = ''; this._changed(); return false; }
        const r = await this.call('me', {});
        let c;
        if (this.app.opts.site) {
          // 网页体验角色只是本机模板：身份以服务端默认角色为准，绝不用它覆盖账号里的昵称和外观
          this.identity = await this.call('accountBootstrap', {});
          c = this.identity.characters.find((x) => x.id === this.char) || this.identity.characters.find((x) => x.id === this.identity.defaultCharacterId);
        } else {
          // 主角就是我在小镇上的角色：没有就建一只，有就把名字和样子同步过去
          const known = r.characters.find((x) => x.id === this.char);
          c = (await this.call('character', { me: known ? this.char : '', name: s.name, kind: s.kind, look: s.look })).character;
        }
        this.char = c.id; this._save();
        this.account = r.account; this.threads = r.threads; this.nextOffset = r.nextOffset ?? null;
        this.meInfo = { id: c.id, roles: r.roles, ban: r.ban };
      }
      this.online = true; this.error = '';
    } catch (e) {
      this.online = false; this.error = e.message === 'Failed to fetch' ? (this.fixed ? '世界暂时连不上' : '连不上小镇（先运行 npm run town）') : e.message;
      this._changed();
      return false;
    }
    const q = new URLSearchParams(this.token ? { token: this.token, me: this.me } : { me: this.me, key: this.key });
    const es = this.es = new EventSource(this.url + '/events?' + q);
    const refreshThreads = () => {
      if (this.es !== es || this._threadRefresh) return;
      this._threadRefresh = setTimeout(() => {
        this._threadRefresh = null;
        if (this.es === es) this.sortBy(this.sort).catch(() => {});
      }, 150);
    };
    es.addEventListener('threads', refreshThreads);
    es.addEventListener('presence', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) { this.thread.here = d.here; this._cast(); this._changed(); } });
    es.addEventListener('post', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) this._onPost(d.post); });
    es.addEventListener('likes', (e) => { const d = JSON.parse(e.data); const p = this.thread && d.thread === this.thread.id && this.thread.posts.find((x) => x.id === d.post); if (p) { p.likes = d.likes; this._changed(); } });
    es.addEventListener('hidden', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) { this.thread.posts = this.thread.posts.filter((p) => p.id !== d.post); this._changed(); } });
    es.addEventListener('kicked', (e) => { const d = JSON.parse(e.data); if (this.thread && (!d.thread || d.thread === this.thread.id)) { this.app.hud.toast(d.thread ? '你被请出了这个帖子' : '账号已被封禁', 3000); this.leave(); } });
    es.addEventListener('sessionEnded', () => {
      if (this.es !== es) return;
      this.disconnect();
      this.token = ''; this.account = null; this.meInfo = null; this.identity = null; this._save();
      this.error = '小镇登录已结束，请重新连接';
      this.leave(true).catch(() => {});
      this._changed();
    });
    es.onerror = () => {
      this.online = es.readyState === EventSource.OPEN;
      if (es.readyState === EventSource.CLOSED) this.error = '小镇连接已关闭，请重新连接';
      this._changed();
    };
    es.onopen = () => {
      this.online = true;
      this.error = '';
      refreshThreads();
      const previous = this.thread;
      if (previous) this.call('join', { thread: previous.id }).then(() => this.call('get', { thread: previous.id })).then(({ thread }) => {
        if (this.es !== es || this.thread !== previous) return;
        Object.assign(previous, { here: thread.here, posts: thread.posts, likes: thread.likes, liked: thread.liked });
        this._cast();
        this._changed();
      }).catch(() => {});
      this._changed();
    };
    this._changed();
    return true;
  }

  /**
   * 登录：新窗口打开小镇的登录页（GitHub / linux.do 授权），这边轮询拿令牌。
   * DSH 桌面版会把链接交给系统浏览器，并返回 null。网页拦截弹窗时也可以点链接继续。
   */
  async login(provider) {
    if (this.loginAttempt) return false;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    const url = new URL(this.url + '/auth/' + encodeURIComponent(provider) + '/start');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('小镇地址不合法');
    url.searchParams.set('nonce', nonce);
    const popup = window.open(url.href, 'town-login', 'width=520,height=680');
    const attempt = this.loginAttempt = { fallbackUrl: popup ? '' : url.href };
    this._changed();
    try {
      for (let i = 0; i < 150; i++) {          // 最多等 5 分钟
        await delay(2000);
        if (this.loginAttempt !== attempt) return false;
        const r = await this.call('authPoll', { nonce });
        if (this.loginAttempt !== attempt) return false;
        if (r.token) { this.token = r.token; this._save(); return this.connect(); }
      }
      throw new Error('登录等太久了，再试一次');
    } finally {
      if (this.loginAttempt === attempt) this.cancelLogin();
    }
  }
  cancelLogin() {
    this.loginAttempt = null;
    this._changed();
  }
  async logout() {
    if (this.thread) await this.leave(true);
    try { await this.call('logout', {}); } catch (e) { /* 忽略 */ }
    this.token = ''; this.account = null; this.meInfo = null; this.identity = null; this._save();
    this.disconnect(); this._changed();
  }
  disconnect() {
    this.loginAttempt = null;
    if (this.es) { this.es.close(); this.es = null; }
    clearTimeout(this._threadRefresh);
    this._threadRefresh = null;
    this._threadRequest = null;
    this.online = false;
  }

  /* ───────── 进出帖子（= 进出场景） ───────── */

  async enter(id) {
    const app = this.app;
    if (this.thread) await this.leave(true);
    const { thread } = await this.call('get', { thread: id });
    let scene = thread.scene;
    if (!scene) { const p = app.packs.find((x) => (x.scenes || []).some((s) => s.id === thread.sceneRef)); scene = p && p.scenes.find((s) => s.id === thread.sceneRef); }
    if (!scene) throw new Error('这个帖子没有场景');
    scene = clone(scene);
    scene.id = 'town-' + thread.id; scene.name = thread.title; scene.agents = [];
    // 访客模式：不存档，自己家原样留着
    if (app.opts.autosave) app.storage.save(app.world.toJSON());
    this.homeId = app.world.scene.id;
    this._autosave = app.opts.autosave;
    app.opts.autosave = false;
    app.visiting = thread.id;
    this.thread = { id: thread.id, title: thread.title, posts: thread.posts, here: thread.here, liked: thread.liked, likes: thread.likes };
    this.visit = { met: new Set(), from: thread.posts.length };
    await app.shell.curtain(true, '帖子 · ' + thread.title);
    app.openScene(scene, { followers: [] });
    await app.shell.curtain(false);
    await this.call('join', { thread: thread.id });
    this._lastActivity = Date.now();
    this._idle = setInterval(() => this._idleTick(), 15000);
    this._changed();
  }

  async leave(quiet) {
    const app = this.app, t = this.thread;
    if (!t) return;
    clearInterval(this._idle);
    this.thread = null;
    this._summarize(t).catch(() => {});
    this.call('leave', { thread: t.id }).catch(() => {});
    const home = app.home.sceneFor(this.homeId) || app.storage.load(this.homeId);
    if (!quiet) await app.shell.curtain(true, '回家');
    if (home) app.openScene(home, { followers: [] });
    app.opts.autosave = this._autosave;
    app.visiting = null;
    if (!quiet) await app.shell.curtain(false);
    this._changed();
  }

  async create(title) {
    const app = this.app, s = app.world.toJSON();
    const { thread } = await this.call('create', { title, scene: s });
    await this.enter(thread.id);
  }

  /** 在场成员 ↔ 场景里的角色：来了从门口进，走了就消失 */
  _cast() {
    const app = this.app, t = this.thread;
    if (!t) return;
    const want = new Map((t.here || []).map((m) => ['tm_' + m.id, m]));
    for (const a of [...app.agents.values()]) if (a.id.startsWith('tm_') && !want.has(a.id)) app.command({ op: 'agent.remove', id: a.id });
    for (const [id, m] of want) {
      if (app.agents.has(id)) continue;
      const mine = m.id === this.me;
      if (!mine && this.visit) this.memory().meet(m, this.visit);
      app.command({ op: 'agent.add', agent: { id, name: m.name, kind: m.kind, look: m.look, brain: 'auto', ephemeral: true, character: mine ? this.self.character : undefined } });
      const a = app.agents.get(id);
      if (a && !mine) a.say('来啦~', 2000);
    }
  }
  myAgent() { return this.app.agents.get('tm_' + this.me) || null; }

  /* ───────── 回帖 ───────── */

  _onPost(p) {
    const app = this.app, t = this.thread;
    const old = t.posts.findIndex((x) => x.id === p.id);
    if (old >= 0) { t.posts[old] = p; this._changed(); return; }   // 审核通过、被恢复：原地更新
    t.posts.push(p);
    if (t.posts.length > 200) t.posts.splice(0, t.posts.length - 200);
    this._lastActivity = Date.now();
    const mine = p.by && p.by.id === this.me;
    const a = p.by && app.agents.get('tm_' + p.by.id);
    // 我的 AI 回帖在生成时已经演过了；别人的、以及我代说的，在这里演
    if (a && (!mine || p.human)) {
      if (p.text) a.say(p.text, Math.min(7000, 1800 + p.text.length * 120));
      if (!mine) app.applyActs(a, p.acts || []);
    }
    this._changed();
    if (!mine && p.by && p.text) this.memory().heard(p.by, p.text);
    if (!mine) this._maybeReply();
  }

  /** 我用角色的身份说一句 */
  async say(text) {
    text = String(text || '').trim().slice(0, 200);
    if (!text || !this.thread) return;
    await this.call('post', { thread: this.thread.id, text, human: true });
  }

  _budget() { this.stamps = this.stamps.filter((t) => Date.now() - t < 3600000); return this.stamps.length < AUTO_PER_HOUR; }
  _aiStreak() { let n = 0; for (let i = this.thread.posts.length - 1; i >= 0 && !this.thread.posts[i].human; i--) n++; return n; }

  async _maybeReply(opening) {
    const t = this.thread;
    if (!t || !this.auto || this.busy || !this._budget() || !this.myAgent()) return;
    if (!opening && this._aiStreak() >= AI_STREAK && Math.random() < 0.8) return;
    const others = (t.here || []).filter((m) => m.id !== this.me).length;
    if (!opening && Math.random() > (others > 1 ? 0.6 : 0.9)) return;   // 人多时不是每句都接
    this.busy = true;
    try {
      await delay(rand(2500, 6000));
      if (this.thread !== t) return;
      const last = t.posts[t.posts.length - 1];
      if (!opening && last && last.by && last.by.id === this.me) return;   // 等的时候已经有人替我接了
      const a = this.myAgent();
      const history = t.posts.slice(-12).map((p) => ({ role: p.by && p.by.id === this.me ? 'assistant' : 'user', who: p.by ? p.by.name : '', text: p.text }));
      const prompt = opening || !last ? '（帖子里安静了一会儿。你可以开个轻松的话题，或者招呼一下在场的人。）' : (last.by ? last.by.name + '：' : '') + last.text;
      const res = await this.app.chat(a, prompt, opening ? history : history.slice(0, -1), { thread: t.title, memory: this.memory().recall((t.here || []).filter((m) => m.id !== this.me), t.id) });
      if (this.thread !== t || !res || (!res.text && !(res.acts || []).length)) return;
      this.stamps.push(Date.now()); this._save();
      await this.call('post', { thread: t.id, text: res.text, acts: res.acts || [] });
    } catch (e) {
      this.error = e.message; this._changed();
    } finally {
      this.busy = false;
    }
  }

  /**
   * 离开帖子：这次聊了什么记成一条。有模型就让她自己用一句话总结（一次模型调用，计入额度），
   * 没有就记最后一句原话。没人说话、或只有我自己在，就不记。
   */
  async _summarize(t) {
    const v = this.visit; this.visit = null;
    if (!v) return;
    const posts = t.posts.slice(v.from).filter((p) => p.text);
    const others = [...new Map(posts.filter((p) => p.by && p.by.id !== this.me).map((p) => [p.by.id, p.by.name])).entries()];
    if (!posts.length || !others.length) return;
    let summary = '';
    const a = this.app.mainAgent();
    if (this.app.ext.chat && a && this._budget()) {
      const log = posts.slice(-16).map((p) => (p.by ? p.by.name : '?') + '：' + p.text).join('\n');
      const res = await this.app.chat(a, '（刚才在帖子「' + t.title + '」里的对话：\n' + log + '\n请用一句话记下这次聊了什么、对谁有什么印象，写给以后的自己看，不超过 50 字，不要动作标记。）', [], { silent: true });
      if (res && res.text && !res.note) { summary = res.text.slice(0, 80); this.stamps.push(Date.now()); this._save(); }
    }
    if (!summary) { const last = posts[posts.length - 1]; summary = '聊了 ' + posts.length + ' 句，最后' + (last.by ? last.by.name : '') + '说「' + last.text.slice(0, 30) + '」'; }
    this.memory().remember({ thread: t.id, title: t.title, ids: others.map((x) => x[0]), with: others.map((x) => x[1]), summary });
  }

  _idleTick() {
    if (!this.thread || Date.now() - this._lastActivity < IDLE_MS) return;
    if (Math.random() < 0.35) { this._lastActivity = Date.now(); this._maybeReply(true); }
  }

  /* ───────── 举报与管理 ───────── */

  roles() { return (this.meInfo && this.meInfo.roles) || []; }
  isStaff() { return this.roles().some((r) => r.role === 'owner' || r.role === 'admin'); }
  /** 当前帖子里我能不能锁帖、请人离开：帖主、管理员、这个帖子的版主 */
  canManageThread() {
    const t = this.thread, info = t && this.threads.find((x) => x.id === t.id);
    return !!t && ((info && info.owner && info.owner.id === this.me) || this.isStaff() || this.roles().some((r) => r.role === 'mod' && r.scope === t.id));
  }
  /** 点赞（只有人点，角色不会自己点）：target = p:回帖 / t:帖子 */
  async like(target) {
    const t = this.thread, [kind, id] = target.split(':');
    const obj = kind === 'p' ? t && t.posts.find((x) => x.id === id) : t;
    const on = !(obj && obj.liked);
    const r = await this.call('like', { target, on });
    if (obj) { obj.liked = r.on; obj.likes = r.likes; }
    this._changed();
  }
  async sortBy(sort, append = false) {
    const offset = append ? this.nextOffset : 0;
    if (offset == null) return;
    const url = this.url;
    const request = this._threadRequest = {};
    this.sort = sort;
    const { threads, nextOffset } = await this.call('threads', { sort, offset });
    if (this._threadRequest !== request || this.url !== url) return;
    if (append) {
      const known = new Set(this.threads.map(({ id }) => id));
      this.threads.push(...threads.filter(({ id }) => !known.has(id)));
    } else this.threads = threads;
    this.nextOffset = nextOffset ?? null;
    this._changed();
  }
  report(target, reason, note) { return this.call('report', { target, reason, note }); }
  lock(on) { return this.call('lock', { thread: this.thread.id, locked: !!on }); }
  kick(member) { return this.call('kick', { thread: this.thread.id, member }); }
  adminQueue() { return this.call('adminQueue', {}); }
  adminAct(body) { return this.call('adminAct', body); }

  setAuto(on) { this.auto = !!on; this._save(); this._changed(); }
  usage() { this._budget(); return { used: this.stamps.length, max: AUTO_PER_HOUR }; }
}
