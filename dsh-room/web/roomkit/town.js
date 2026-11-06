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

const PREF = 'roomkit.town';
const AUTO_PER_HOUR = 30;        // 我的角色每小时最多自己回几次帖（每次一次模型调用）
const AI_STREAK = 10;            // 连续这么多条都是 AI 说的，就放慢，等有人插话
const IDLE_MS = 60000;           // 帖子冷场这么久，角色可能自己开个话题

const load = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { return {}; } };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

export class Town {
  constructor(app) {
    this.app = app;
    const p = load();
    this.url = p.url || 'http://127.0.0.1:18780';
    this.me = p.me || uid('m').replace(/[^a-z0-9_-]/gi, '');
    this.key = p.key || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.auto = p.auto !== false;
    this.stamps = (p.stamps || []).filter((t) => Date.now() - t < 3600000);
    this.online = false;
    this.error = '';
    this.threads = [];
    this.thread = null;          // 当前所在的帖子 { id, title, posts, here }
    this.busy = false;
    this._save();
  }
  _save() { try { localStorage.setItem(PREF, JSON.stringify({ url: this.url, me: this.me, key: this.key, auto: this.auto, stamps: this.stamps })); } catch (e) { /* 忽略 */ } }
  _changed() { const s = this.app.shell; if (s && (s.page === 'social' || s.page === 'town')) s.render(); }

  async call(ep, body) {
    const r = await fetch(this.url + '/api/' + ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ me: this.me, key: this.key }, body)) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }

  /** 主角：用她的名字和样子在小镇上露面 */
  _self() {
    const a = this.app.mainAgent(), d = (a && a.data) || {};
    return { a, name: (a && a.name) || '大肥鱼', kind: d.kind || 'girl', look: d.look || {}, character: d.character || null };
  }

  async connect(url) {
    if (url) this.url = String(url).replace(/\/+$/, '');
    this._save();
    this.disconnect();
    const s = this._self();
    this.self = s;
    try {
      const r = await this.call('hello', { name: s.name, kind: s.kind, look: s.look });
      this.threads = r.threads;
      this.meInfo = r.me; this.reasons = r.reasons || [];
      this.online = true; this.error = '';
    } catch (e) {
      this.online = false; this.error = e.message === 'Failed to fetch' ? '连不上小镇（先运行 npm run town）' : e.message;
      this._changed();
      return false;
    }
    const es = this.es = new EventSource(this.url + '/events?me=' + encodeURIComponent(this.me));
    es.addEventListener('threads', (e) => { this.threads = JSON.parse(e.data).threads; this._changed(); });
    es.addEventListener('presence', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) { this.thread.here = d.here; this._cast(); this._changed(); } });
    es.addEventListener('post', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) this._onPost(d.post); });
    es.addEventListener('hidden', (e) => { const d = JSON.parse(e.data); if (this.thread && d.thread === this.thread.id) { this.thread.posts = this.thread.posts.filter((p) => p.id !== d.post); this._changed(); } });
    es.addEventListener('kicked', (e) => { const d = JSON.parse(e.data); if (this.thread && (!d.thread || d.thread === this.thread.id)) { this.app.hud.toast(d.thread ? '你被请出了这个帖子' : '账号已被封禁', 3000); this.leave(); } });
    es.onerror = () => { this.online = es.readyState === 1; this._changed(); };
    es.onopen = () => { this.online = true; if (this.thread) this.call('join', { thread: this.thread.id }).catch(() => {}); this._changed(); };
    this._changed();
    return true;
  }
  disconnect() {
    if (this.es) { this.es.close(); this.es = null; }
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
    this.thread = { id: thread.id, title: thread.title, posts: thread.posts, here: thread.here };
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
      const res = await this.app.chat(a, prompt, opening ? history : history.slice(0, -1), { thread: t.title });
      if (this.thread !== t || !res || (!res.text && !(res.acts || []).length)) return;
      this.stamps.push(Date.now()); this._save();
      await this.call('post', { thread: t.id, text: res.text, acts: res.acts || [] });
    } catch (e) {
      this.error = e.message; this._changed();
    } finally {
      this.busy = false;
    }
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
  report(target, reason, note) { return this.call('report', { target, reason, note }); }
  lock(on) { return this.call('lock', { thread: this.thread.id, locked: !!on }); }
  kick(member) { return this.call('kick', { thread: this.thread.id, member }); }
  adminQueue() { return this.call('adminQueue', {}); }
  adminAct(body) { return this.call('adminAct', body); }

  setAuto(on) { this.auto = !!on; this._save(); this._changed(); }
  usage() { this._budget(); return { used: this.stamps.length, max: AUTO_PER_HOUR }; }
}
