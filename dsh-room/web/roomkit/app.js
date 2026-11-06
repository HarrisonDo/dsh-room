/**
 * RoomKit · 应用装配与对外命令接口。
 *
 *   const app = RoomKit.mount(el, { packs, scene, mode:'play'|'edit', ui:'auto'|'full'|'compact', storage, transparent, desk })
 *   app.command({ op:'agent.say', id, text })        // 页面内直接调
 *   window.postMessage({ roomkit: { op:... } })        // iframe / 同页其他脚本
 *   app.on('object:click', fn) / app.on('*', fn)       // 事件同样是 JSON，可原样转发给 DSH 宿主
 *   opts.ext = { chat, chatStatus, diagnostics, connection, social, openFull, host }   // 宿主往外壳里加的能力（见 shell.js）
 *   app.goRoom(id) / app.home                         // 家：几个房间按楼层排开，门通往隔壁（见 home.js）
 *   opts.desk：桌面模式，透明背景、只剩房间和角色，给桌面壳用（见 desk.js；宿主能力在 opts.ext.desk）
 * 三种载体（独立网页 / DSH 插件 / 桌面壳）共用这一套命令与事件。
 */
import { Iso } from './iso.js';
import { Catalog } from './catalog.js';
import { World } from './scene.js';
import { Nav } from './nav.js';
import { Agent, poseName } from './agents.js';
import { Brain, Director } from './brain.js';
import { envAt, nowHour, periodHour } from './env.js';
import { Renderer } from './renderer.js';
import { HUD } from './ui.js';
import { Shell, parseActs, OFFLINE_RULES } from './shell.js';
import { Home, doorSpot, isFollower } from './home.js';
import { Desk } from './desk.js';
import { Editor } from './editor.js';
import { Stories } from './story.js';
import { Dialog } from './dialog.js';
import { DEFAULT_CHARACTERS, normalizeCharacter } from './character.js';
import { PackStore, validatePack } from './packs.js';
import { PHRASES } from './brain.js';
import { RigPool } from './bodies.js';
import { injectCss } from './style.js';
import { Emitter, clamp, pick, rand, clone, uid, delay } from './util.js';
import { orient } from './iso.js';
import { VERSION } from './version.js';
import { Town } from './town.js';

export { VERSION };

/* ───────── 存储适配器（默认 localStorage；DSH 里可换成宿主接口） ───────── */
export function localStore(prefix = 'roomkit') {
  const ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const get = (k) => { try { return ls ? JSON.parse(ls.getItem(prefix + '.' + k) || 'null') : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (ls) ls.setItem(prefix + '.' + k, JSON.stringify(v)); } catch (e) { console.warn('[roomkit] 保存失败:', e); } };
  return {
    load(id) { const sid = id || get('last'); return sid ? get('scene.' + sid) : null; },
    /** opts.last === false：只写存档、不改"上次在哪个房间"（给别的房间写门、整理家时） */
    save(scene, opts) { scene.updated = Date.now(); set('scene.' + scene.id, scene); if (!opts || opts.last !== false) set('last', scene.id); },
    remove(id) { try { if (ls) ls.removeItem(prefix + '.scene.' + id); } catch (e) { /* 忽略 */ } },
    /** 存过的场景列表（id、名字、最后修改时间），新的在前 */
    list() {
      const out = [];
      if (!ls) return out;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k || k.indexOf(prefix + '.scene.') !== 0) continue;
        const s = get(k.slice(prefix.length + 1));
        if (s && s.format === 'roomkit.scene') out.push({ id: s.id, name: s.name, updated: s.updated || 0, w: s.room && s.room.w, h: s.room && s.room.h });
      }
      return out.sort((a, b) => b.updated - a.updated);
    },
    pref(k, v) { const p = get('prefs') || {}; if (v === undefined) return p[k]; p[k] = v; set('prefs', p); return v; },
  };
}

export function mount(el, opts) { return new App(el, opts || {}); }

class App {
  constructor(el, opts) {
    this.opts = Object.assign({ mode: 'play', ui: 'auto', autosave: true, transparent: false, bridge: 'same-origin' }, opts);
    if (this.opts.desk) Object.assign(this.opts, { transparent: true, ui: 'compact', mode: 'play', coach: false, maxFps: this.opts.maxFps || 30 });
    this.storage = this.opts.storage || localStore(this.opts.storageKey || 'roomkit');
    this.ext = this.opts.ext || {};
    this.version = VERSION;
    injectCss(el.ownerDocument || document);
    this.bus = new Emitter();
    this.iso = new Iso(64, 32);
    this.t = 0;
    this.mode = 'play';

    this.catalog = new Catalog();
    this.plays = new Map();
    this.content = [];
    this.packs = [];
    this.characters = new Map();
    DEFAULT_CHARACTERS.forEach((c) => this.addCharacter(c));
    this.stories = new Stories(this);
    (this.opts.packs || window.RoomKitPacks || []).forEach((p) => this.usePack(p));
    this.home = new Home(this);
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.root = document.createElement('div');
    this.root.className = 'rk-root' + (this.opts.transparent ? ' rk-transparent' : '');
    this.root.tabIndex = -1;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rk-canvas';
    this.root.appendChild(this.canvas);
    el.appendChild(this.root);

    const scene = this.home.prepare(this.opts.scene || (this.opts.autosave && this.storage.load(this.opts.sceneId)) || this.defaultScene());
    this.world = new World(this.catalog, scene);
    this.nav = new Nav(this.world);
    this.agents = new Map();
    this.brains = new Map();
    this.director = new Director(this);
    this.renderer = new Renderer(this, this.canvas);
    this.sprites = this.renderer.sprites;
    this.rig = new RigPool(this);
    this.env = envAt(this.hour(), this.world.scene.env.weather);
    this.hud = new HUD(this);
    this.dialog = new Dialog(this);
    this.editor = new Editor(this);
    this.soundOn = !!this.storage.pref('sound');
    this.shell = new Shell(this);
    this.town = new Town(this);
    this.desk = this.opts.desk ? new Desk(this) : null;

    this._syncAgents(true);
    this.world.on('change', (e) => this._onChange(e));
    this.world.on('load', () => {
      this._syncAgents(true);
      this.env = envAt(this.hour(), this.world.scene.env.weather);
      this.hud.syncBar();
      this.shell.pendingStory = null;
      if (this.opts.stories !== false) this.stories.checkStart();
    });

    this._bindInput();
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this.root);
    this._layout();
    this._bridge();
    if (this.opts.mode === 'edit') this.setMode('edit');
    else {
      if (this.opts.stories !== false) this.stories.checkStart();
      this.shell.coach();
    }
    this._loop();
    this.packStore = this.opts.packStore === false ? null : this.opts.packStore || new PackStore(this.opts.storageKey || 'roomkit');
    if (this.packStore) this.loadStoredPacks();
    this.bus.emit('ready', { version: VERSION, scene: this.world.scene.id });
  }

  /** 装过的社区包 / 自制家具包（IndexedDB）：启动后异步装回来，场景里引用它们的家具随即出现 */
  async loadStoredPacks() {
    const list = await this.packStore.list();
    for (const raw of list) {
      const v = raw.validated ? { ok: true, pack: raw } : validatePack(raw);
      if (v.ok) this.usePack(v.pack);
      else console.warn('[roomkit] 已装的内容包校验失败，跳过:', raw && raw.id, v.errors);
    }
    if (list.length) this.bus.emit('packs:loaded', { count: list.length });
  }

  /** 安装社区包（JSON 文本或对象）：校验 → 持久化 → 立即可用 */
  async installPack(input) {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    const v = validatePack(raw);
    if (!v.ok) return v;
    v.pack.validated = true;
    if (this.packStore) await this.packStore.put(v.pack);
    this.usePack(v.pack);
    this.bus.emit('pack:installed', { id: v.pack.id, name: v.pack.name });
    return v;
  }
  async uninstallPack(id) {
    if (this.packStore) await this.packStore.remove(id);
    const p = this.packs.find((x) => x.id === id);
    if (!p) return;
    (p.furniture || []).forEach((d) => this.catalog.remove(d.id));
    (p.characters || []).forEach((c) => this.characters.delete(c.id));
    this.stories.list = this.stories.list.filter((s) => s.source !== id);
    this.packs = this.packs.filter((x) => x.id !== id);
    this.world.version++;
    this.editor.refresh();
  }

  addCharacter(raw) {
    try { const c = raw.format === 'roomkit.character' && raw.phrases && raw.v ? raw : normalizeCharacter(raw); this.characters.set(c.id, c); return c; } catch (e) { console.warn('[roomkit] 角色卡无效:', e.message); return null; }
  }
  characterOf(a) { return (a && a.data && a.data.character && this.characters.get(a.data.character)) || null; }
  /** 角色这句话说什么：角色卡里有就用卡里的，没有用通用台词 */
  phrase(a, kind) {
    const c = this.characterOf(a);
    const list = (c && c.phrases && c.phrases[kind] && c.phrases[kind].length && c.phrases[kind]) || PHRASES[kind] || PHRASES.idle;
    return pick(list);
  }

  /* ───────── 内容包 ───────── */

  usePack(p) {
    if (!p) return;
    this.packs = this.packs.filter((x) => x.id !== p.id).concat([p]);
    this.catalog.addAll(p.furniture);
    (p.plays || []).forEach((pl) => this.plays.set(pl.id, pl));
    (p.stories || []).forEach((s) => this.stories.add(s, p.id));
    (p.characters || []).forEach((c) => this.addCharacter(c));
    if (p.content) this.content.push(p.content);
    if (this.world) { this.world.version++; if (this.editor) this.editor.refresh(); }
  }
  defaultScene() {
    const first = this.home && this.home.ordered()[0];
    const s = first && this.home.sceneFor(first.id);
    if (s) return s;
    const p = this.packs.find((x) => x.scenes && x.scenes.length);
    if (p) return Object.assign(clone(p.scenes[0]), { template: p.scenes[0].id });
    return { id: 'room', name: '房间', room: { w: 8, h: 6 }, objects: [], agents: [{ name: '大肥鱼', brain: 'pet', x: 4, y: 3 }] };
  }
  /** 场景是从哪个模板来的（恢复默认用） */
  templateOf(scene) {
    const key = scene.template || scene.id;
    for (const p of this.packs) { const t = (p.scenes || []).find((x) => x.id === key); if (t) return t; }
    return null;
  }

  on(ev, fn) { return this.bus.on(ev, fn); }

  /* ───────── 主循环 ───────── */

  _loop() {
    let last = performance.now();
    // maxFps：桌面模式默认 30 帧，透明窗口常驻桌面时省电
    const minGap = this.opts.maxFps ? 1000 / this.opts.maxFps - 2 : 0;
    const tick = (now) => {
      if (this._dead) return;
      if (minGap && now - last < minGap) { this._raf = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      this.t += dt;
      try {
        this.update(dt);
        this.renderer.frame(this.t, dt);
        this.hud.update();
        this.shell.update();
      } catch (e) { console.error('[roomkit] 帧出错:', e); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  update(dt) {
    this._envT = (this._envT || 0) - dt;
    if (this._envT <= 0) { this._envT = 1; this.env = envAt(this.hour(), this.world.scene.env.weather); }
    if (this.opts.stories !== false) this.stories.tick(dt);
    const night = this.env.night;
    for (const a of this.agents.values()) {
      const n = a.needs, using = a.attach;
      n.energy = clamp(n.energy - dt * (night ? 0.0028 : 0.0014) * (using && using.slot.pose === 'sleep' ? -6 : 1), 0, 1);
      n.fun = clamp(n.fun - dt * 0.0026, 0, 1);
      n.social = clamp(n.social - dt * 0.0022, 0, 1);
      a.update(dt);
    }
    // 互不重叠：两只都闲着时轻轻推开
    const list = [...this.agents.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.attach || b.attach) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0.34 || d < 1e-4) continue;
        const k = ((0.34 - d) / d) * 0.5 * Math.min(1, dt * 8);
        if (this.nav.freeAt(a.x - dx * k, a.y - dy * k)) { a.x -= dx * k; a.y -= dy * k; }
        if (this.nav.freeAt(b.x + dx * k, b.y + dy * k)) { b.x += dx * k; b.y += dy * k; }
      }
    }
  }

  /** 按容器宽度切档：< 640 紧凑（DSH 小窗 / 侧栏），≥ 820 再显示房间条；opts.ui 'compact' / 'full' 可以强制 */
  _layout() {
    const w = this.root.clientWidth || 0, ui = this.opts.ui;
    const compact = ui === 'compact' || (ui !== 'full' && w > 0 && w < 640);
    const wide = !compact && w >= 820;
    if (compact !== this.compact || wide !== this.wide) {
      this.compact = compact; this.wide = wide;
      this.root.classList.toggle('rk-compact', compact);
      this.root.classList.toggle('rk-wide', wide);
      this.renderer.insetT = this.desk ? 0 : compact ? 40 : 48;
      this.renderer.insetB = this.desk ? 0 : compact ? 54 : 64;
      this.renderer.insetR = this.mode === 'edit' && !compact ? 258 : 0;
      this.shell.sync();
    }
    this.renderer.resize();
  }

  hour() { const p = this.world.scene.env.period; return p ? periodHour(p) : nowHour(); }
  isNight() { return !!(this.env && this.env.night); }

  /* ───────── 角色同步 ───────── */

  _syncAgents(reset) {
    const recs = this.world.scene.agents;
    if (reset) {
      for (const b of this.brains.values()) b.stop();
      for (const a of this.agents.values()) a.dispose();
      this.brains.clear(); this.agents.clear();
    }
    const ids = new Set(recs.map((r) => r.id));
    for (const [id, ag] of this.agents) {
      if (ids.has(id)) continue;
      this.brains.get(id).stop();
      ag.dispose();
      this.brains.delete(id); this.agents.delete(id);
      this.world.releaseAll(id);
      if (this.hud.cardAgent && this.hud.cardAgent.id === id) this.hud.closeCard();
    }
    for (const r of recs) {
      if (this.agents.has(r.id)) { this.agents.get(r.id).setData(r); continue; }
      const a = new Agent(r, this);
      if (!this.nav.freeAt(a.x, a.y)) { const p = this.nav.nearestFree(a.x, a.y, 10); if (p) { a.x = p.x; a.y = p.y; } }
      this.agents.set(r.id, a);
      this.brains.set(r.id, new Brain(a, this));
    }
  }

  _onChange(e) {
    const t = e.op.t;
    if (t.indexOf('agent.') === 0 || t === 'batch') this._syncAgents(false);
    // 家具挪走/删掉：坐在上面的角色站起来；被新家具压住的角色挪到旁边
    for (const a of this.agents.values()) {
      if (a.attach && (!this.world.byId.has(a.attach.obj.id) || (e.op.id === a.attach.obj.id && t === 'set'))) a.cancel();
      if (!a.attach && !this.nav.freeAt(a.x, a.y)) {
        const p = this.nav.nearestFree(a.x, a.y, 6);
        if (p) { a.cancel(); a.x = p.x; a.y = p.y; }
      }
    }
    if (t === 'env') { this.env = envAt(this.hour(), this.world.scene.env.weather); this.hud.syncBar(); }
    this._autosave();
    this.bus.emit('scene:change', { op: e.op });
  }

  _autosave() {
    if (!this.opts.autosave) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.storage.save(this.world.toJSON()), 500);
  }

  /* ───────── 模式 ───────── */

  setMode(m) {
    if (m === this.mode) return;
    if (m === 'edit') this.stories.skip();
    this.mode = m;
    this.hud.closeCard(); this.hud.closeDrawer(); this.hud.hideTip();
    this.renderer.hover = null;
    if (m === 'edit') this.editor.enter(); else { this.editor.exit(); this.renderer.selected = null; }
    this.renderer.insetR = m === 'edit' && !this.compact ? 258 : 0;
    this.renderer.fit(false);
    if (m === 'edit') this.shell.close();
    this.shell.sync();
    this.bus.emit('mode', { mode: m });
  }

  /* ───────── 输入 ───────── */

  _bindInput() {
    const c = this.canvas, R = this.renderer, root = this.root;
    const pts = new Map();
    let down = null, pinch = null;
    const local = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有指针 */ }
      root.focus({ preventScroll: true });
      this._audioUnlock();
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: R.camT.z };
        down = null;
        return;
      }
      down = { x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false, button: e.button };
      if (this.desk) { if (e.button !== 0) down = null; return; }
      if (e.button === 2 || e.button === 1) { down.pan = true; return; }
      if (this.mode === 'edit') down.edit = this.editor.onDown(p.x, p.y);
    });
    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        R.zoomAt((pinch.z * d / pinch.d) / R.camT.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (down) {
        if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 4) { down.moved = true; if (this.desk) this.desk.dragStart(); }
        if (this.desk) { if (down.moved) this.desk.dragMove(); return; }
        if (this.mode === 'edit' && down.edit) this.editor.onMove(p.x, p.y, true);
        else if (down.moved) { R.panBy(p.x - down.lx, p.y - down.ly); root.classList.add('rk-panning'); }
        down.lx = p.x; down.ly = p.y;
        return;
      }
      if (this.mode === 'edit') this.editor.onMove(p.x, p.y, false);
      this._hover(p.x, p.y);
    });
    const end = (e) => {
      const p = local(e);
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; down = null; return; }
      if (!down) return;
      root.classList.remove('rk-panning');
      const d = down;
      down = null;
      if (this.desk) this.desk.dragEnd();
      if (this.mode === 'edit') { if (d.edit) this.editor.onUp(p.x, p.y); return; }
      if (!d.moved && d.button === 0 && e.type === 'pointerup') this._click(p.x, p.y);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      for (const a of this.agents.values()) if (a.body.pointerLeave) a.body.pointerLeave();
      if (!down) { R.hover = null; this.hud.hideTip(); root.classList.remove('rk-hand'); }
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.desk) { this.desk.wheel(e); return; }
      const p = local(e);
      R.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (this.desk) return;
      const p = local(e), hit = R.pick(p.x, p.y);
      if (!hit || hit.kind === 'floor' || hit.kind === 'wallface') R.fit(false);
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.desk) this.desk.openMenu(e.clientX, e.clientY); });
    root.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this.stories.active) return;          // 剧情进行中：按键交给对话框
      if (this.mode === 'edit' && this.editor.onKey(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.desk && /^[bBmMcC]$/.test(e.key)) return;     // 桌面模式没有布置、地图、聊天面板
      if (e.key === 'b' || e.key === 'B') this.setMode(this.mode === 'edit' ? 'play' : 'edit');
      else if (e.key === 'Escape') { this.hud.closeCard(); this.hud.closeDrawer(); this.shell.close(); R.selected = null; }
      else if (e.key === 'f' || e.key === 'F') R.fit(false);
      else if (this.mode === 'edit') return;
      else if (/^[1-9]$/.test(e.key)) { const r = this.home.ordered()[+e.key - 1]; if (r) this.goRoom(r.id); }
      else if (e.key === 'm' || e.key === 'M') this.shell.open('map');
      else if (e.key === 'c' || e.key === 'C') this.shell.open('chat');
    });
  }

  _hover(sx, sy) {
    const R = this.renderer;
    // 真模型角色会看着鼠标；在她身上来回摸会害羞
    const w = R.screenToWorld(sx, sy);
    for (const a of this.agents.values()) {
      if (!a.body.pointer) continue;
      const f = this.iso.toWorld(a.x, a.y, a.z);
      a.body.pointer(w.x, w.y, f.x, f.y);
    }
    if (this.mode === 'edit' && this.editor.tool) { if (R.hover) { R.hover = null; this.hud.hideTip(); } return; }
    const hit = R.pick(sx, sy);
    const id = hit && (hit.kind === 'obj' || hit.kind === 'agent') ? hit.id : null;
    if ((R.hover && R.hover.id) !== id) {
      R.hover = id ? { id } : null;
      if (hit && hit.kind === 'obj') this.hud.showTip(hit, hit.def.name, hit.def.sub);
      else if (hit && hit.kind === 'agent') this.hud.showTip(hit, hit.agent.name, hit.agent.activity);
      else this.hud.hideTip();
      if (id) this.sfx('tick');
    } else if (hit && hit.kind === 'agent') {
      this.hud.showTip(hit, hit.agent.name, hit.agent.activity);
    }
    this.root.classList.toggle('rk-hand', !!id);
  }

  _click(sx, sy) {
    const R = this.renderer;
    if (this.stories.active) { this.dialog.advance(); return; }   // 剧情中：点哪儿都是"下一句"
    const hit = R.pick(sx, sy);
    if (!hit) { this.hud.closeCard(); this.hud.closeDrawer(); R.selected = null; return; }
    if (hit.kind === 'agent') {
      const st = this.stories.forAgent(hit.agent);
      if (st) { this.stories.run(st, { who: hit.agent }); return; }
      R.selected = { id: hit.id, kind: 'agent' };
      this.hud.openCard(hit.agent);
      this.poke(hit.agent);
      this.bus.emit('agent:click', { id: hit.agent.id });
      return;
    }
    if (hit.kind === 'obj') { this.activate(hit.obj); return; }
    if (hit.kind === 'floor') {
      const a = this.focusAgent();
      if (a) { this.command({ op: 'agent.goto', id: a.id, x: hit.x, y: hit.y }); this._ripple(hit.x, hit.y); }
      this.hud.closeDrawer();
    }
  }

  _ripple(x, y) {
    const p = this.renderer.tileToScreen(x, y);
    this.hud.float(p.x, p.y + 8, '·');
  }

  poke(a) {
    a.bounce(1.1);
    a.setExpr(pick(['happy', 'surprised', 'love']), 1.6);
    if (!a.speech) a.say(this.phrase(a, 'poke'), 1800);
    this.sfx('pop');
  }

  /** 点家具：def.act = 'toggle:key' | 'use:slotId' | 'play:id' | 'weather' | 'shake' | 'info' */
  activate(o) {
    const def = this.world.def(o);
    if (!def) return;
    const st = this.stories.forObject(o);
    if (st && Math.random() < (st.trigger.chance != null ? st.trigger.chance : 1)) {
      this.renderer.wobble.set(o.id, this.t);
      this.stories.run(st, { target: o, who: this.focusAgent() });
      this.bus.emit('object:click', { id: o.id, def: def.id, story: st.id });
      return;
    }
    if (def.portal && o.wall) {
      this.renderer.wobble.set(o.id, this.t);
      this.sfx('click');
      this.shell.doorCard(o);
      this.bus.emit('object:click', { id: o.id, def: def.id, to: (o.state && o.state.to) || null });
      return;
    }
    const act = def.act || (def.slots.length ? 'use' : 'info');
    const [kind, arg] = act.split(':');
    const anchor = this.renderer.anchorOf({ id: o.id }) || { x: this.renderer.vw / 2, y: this.renderer.vh / 2 };
    this.renderer.wobble.set(o.id, this.t);
    this.sfx('click');
    switch (kind) {
      case 'toggle': {
        const k = arg || 'on', v = !(o.state && o.state[k]);
        this.world.apply({ t: 'state', id: o.id, patch: { [k]: v } });
        if (def.say) this.hud.float(anchor.x, anchor.y, v ? def.say[0] : def.say[1] || def.say[0]);
        break;
      }
      case 'use': {
        const a = this.focusAgent(), s = arg ? def.slots.find((x) => x.id === arg) : def.slots[0];
        if (a && s) { this.command({ op: 'agent.use', id: a.id, obj: o.id, slot: s.id }); this.hud.float(anchor.x, anchor.y, s.label || poseName(s.pose)); }
        else this.inspect(o.id);
        break;
      }
      case 'play': {
        const play = this.plays.get(arg);
        if (play) this.director.run(play, { target: o, who: this.focusAgent() });
        break;
      }
      case 'weather': {
        const cyc = ['clear', 'cloudy', 'rain', 'snow'], i = cyc.indexOf(this.world.scene.env.weather);
        this.command({ op: 'env.set', weather: cyc[(i + 1) % cyc.length] });
        this.hud.float(anchor.x, anchor.y, '天气变了');
        break;
      }
      case 'shake':
        this.hud.float(anchor.x, anchor.y, def.say ? pick(def.say) : '…');
        break;
      default:
        this.inspect(o.id);
    }
    this.bus.emit('object:click', { id: o.id, def: def.id });
  }

  inspect(id) {
    const o = this.world.byId.get(id) || this.world.objects.find((x) => x.def === id);
    if (!o) return;
    const def = this.world.def(o);
    let data = null;
    for (const p of this.content) { try { data = p(o, def, this); } catch (e) { console.warn('[roomkit] 内容源出错:', e); } if (data) break; }
    data = data || def.info || { title: def.name, sub: def.sub || '这里还空着' };
    this.hud.openDrawer(Object.assign({ title: def.name }, data));
  }

  /** 当前"焦点角色"：卡片里选中的那只，否则主角 */
  focusAgent() { return (this.hud.cardAgent && this.agents.get(this.hud.cardAgent.id)) || this.mainAgent(); }
  mainAgent() {
    for (const a of this.agents.values()) if (a.data.brain === 'pet') return a;
    return this.agents.values().next().value || null;
  }
  nearestAgent(o) {
    if (!o) return this.mainAgent();
    const f = this.world.footprint(o);
    let best = null, bd = Infinity;
    for (const a of this.agents.values()) {
      if (!this.director.available(a)) continue;
      const d = f ? Math.hypot(a.x - (f.x0 + f.x1) / 2, a.y - (f.y0 + f.y1) / 2) : 0;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** 找满足条件的交互位（空闲或已被 agent 占着），离 agent 最近的一个 */
  findSlot(pred, agent) {
    let best = null, bd = Infinity;
    for (const o of this.world.objects) {
      if (o.wall) continue;
      const d = this.world.def(o);
      if (!d) continue;
      for (const s of d.slots) {
        if (!pred(d, s, o)) continue;
        const occ = this.world.occupant(o, s);
        if (occ && (!agent || occ !== agent.id)) continue;
        if (!this.world.slotUsable(o, s, this.nav)) continue;
        const sp = this.world.slotPose(o, s);
        const dist = agent ? Math.hypot(sp.x - agent.x, sp.y - agent.y) : 0;
        if (dist < bd) { bd = dist; best = { o, s, d }; }
      }
    }
    return best;
  }

  /** 给家具找个空位（从 near 附近往外找） */
  findFreeSpot(defId, rot, nx, ny) {
    const def = this.catalog.get(defId), r = this.world.room;
    if (!def) return null;
    const or = orient(def.size, rot || 0, def.rotMode);
    const cx = nx != null ? nx : (r.w - or.w) / 2, cy = ny != null ? ny : (r.h - or.h) / 2;
    const cand = [];
    for (let y = 0; y <= r.h - or.h; y++) for (let x = 0; x <= r.w - or.w; x++) cand.push([x, y, Math.hypot(x - cx, y - cy)]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of cand) if ((x !== nx || y !== ny) && this.world.canPlace(defId, x, y, rot || 0, null).ok) return { x, y };
    return null;
  }

  /* ───────── 角色卡片上的动作 ───────── */

  agentAction(a, what) {
    const id = a.id;
    if (what === 'wave') { this.command({ op: 'agent.say', id, text: pick(['你好呀~', '嗨嗨！', '欢迎来玩']) }); this.command({ op: 'agent.pose', id, pose: 'wave', s: 2 }); }
    else if (what === 'dance') { this.command({ op: 'agent.emote', id, kind: 'note', s: 4 }); this.command({ op: 'agent.pose', id, pose: 'dance', s: 4.5 }); }
    else if (what === 'sleep') { const f = this.findSlot((d, s) => s.pose === 'sleep', a); if (f) this.command({ op: 'agent.use', id, obj: f.o.id, slot: f.s.id, s: 40 }); else this.hud.toast('房间里还没有床'); }
    else if (what === 'chat') { this.shell.open('chat'); }
    else if (what === 'read') { const f = this.findSlot((d, s) => s.pose === 'read', a); if (f) this.command({ op: 'agent.use', id, obj: f.o.id, slot: f.s.id, s: 20 }); else this.hud.toast('房间里还没有书架'); }
  }

  /** 排队命令的执行（在该角色的行为循环里跑） */
  async exec(a, c) {
    const w = this.world;
    switch (c.op) {
      case 'agent.goto': {
        a.activity = '走过去';
        if (c.obj) {
          const o = w.byId.get(c.obj);
          const f = o && w.footprint(o);
          const p = f && this.nav.nearestFree((f.x0 + f.x1) / 2, f.y1 + 0.5, 4);
          return p ? a.walkTo(p.x, p.y, { run: c.run }) : false;
        }
        return a.walkTo(+c.x, +c.y, { run: c.run });
      }
      case 'agent.use': {
        const o = w.byId.get(c.obj) || w.objects.find((x) => x.def === c.obj);
        const d = o && w.def(o);
        const s = d && (d.slots.find((x) => x.id === c.slot) || d.slots[0]);
        if (!s) return false;
        a.activity = s.label || poseName(s.pose);
        const ok = await a.useSlot(o, s, c.s || rand(s.dur[0], s.dur[1]));
        if (ok) for (const k in s.need) a.needs[k] = clamp((a.needs[k] || 0) + s.need[k], 0, 1);
        return ok;
      }
      case 'agent.pose':
        a.activity = poseName(c.pose);
        return a.pose_(c.pose || 'stand', c.s || 3);
      case 'play.run': {
        const play = c.play || this.plays.get(c.id);
        if (play) await this.director.run(play, { who: a, target: c.target ? w.byId.get(c.target) : null });
        return true;
      }
    }
    return false;
  }

  /* ───────── 对话（DS 交互） ───────── */

  /** 房间此刻的样子，给模型当上下文：时间天气、谁在做什么、有哪些家具 */
  describe() {
    const env = this.env || {}, sc = this.world.scene;
    const names = [...new Set(this.world.objects.map((o) => (this.world.def(o) || {}).name).filter(Boolean))];
    const room = this.home.room(sc.id);
    return {
      scene: (room && room.name) || sc.name || sc.id, floor: room ? room.floor : null, period: env.label || env.id, night: !!env.night, weather: (sc.env && sc.env.weather) || 'clear',
      agents: [...this.agents.values()].map((a) => ({ id: a.id, name: a.name, doing: a.activity || '', status: a.status ? a.status.state : null })),
      furniture: names.slice(0, 40),
      rooms: this.home.ordered().map((r) => r.floor + ' ' + r.name),
    };
  }

  /**
   * 和角色说一句话 → { text, acts, note? }。有宿主（ext.chat）走模型，宿主不可用或出错时退回离线台词并在 note 里说明。
   * 回复里的 [[动作]] 标记会被剥掉并执行：wave / dance / sleep / read / goto:家具 / use:家具 / room:房间 / emote:符号
   */
  async chat(agent, text, history, opts) {
    const a = agent || this.mainAgent();
    if (!a) return { text: '', acts: [] };
    let res = null, note = '';
    if (this.ext.chat) {
      const c = this.characterOf(a);
      try {
        const r = await this.ext.chat({ agent: { id: a.id, name: a.name }, character: c ? { id: c.id, name: c.name, persona: c.persona || '', scenario: c.scenario || '' } : null, text, history: (history || []).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.who && m.who !== a.name ? m.who + '：' + m.text : m.text })), group: !!(opts && opts.group), thread: (opts && opts.thread) || '', room: this.describe() });
        if (r && r.text) { res = parseActs(r.text); if (Array.isArray(r.acts)) res.acts = res.acts.concat(r.acts); }
        else note = (r && r.error) || '模型没有回话';
      } catch (e) { note = e.message || String(e); }
      if (note) note = '模型暂时用不了（' + note + '），先用离线台词回你';
    }
    if (!res) {
      const rule = OFFLINE_RULES.find((x) => x[0].test(text));
      res = rule ? { text: pick(rule[2]), acts: [rule[1]] } : { text: this.phrase(a, 'chat') || this.phrase(a, 'idle'), acts: [] };
      if (!rule && /客厅|卧室|厨房|房间|院子/.test(text)) { const r = this.home.rooms().find((x) => text.indexOf(x.name) >= 0); if (r) { res.acts = ['room:' + r.name]; res.text = '好，去' + r.name + '~'; } }
    }
    if (note) res.note = note;
    if (res.text) a.say(res.text, Math.min(7000, 1800 + res.text.length * 120));
    this.applyActs(a, res.acts || []);
    this.bus.emit('agent:chat', { id: a.id, user: text, reply: res.text, acts: res.acts || [] });
    return res;
  }

  applyActs(a, acts) {
    for (const raw of acts.slice(0, 3)) {
      const [kind, arg] = String(raw).split(':').map((x) => x && x.trim());
      if (['wave', 'dance', 'sleep', 'read'].includes(kind)) { this.agentAction(a, kind); continue; }
      if (kind === 'room' && arg) { if (a === this.mainAgent()) this.goRoomNamed(arg); continue; }
      if ((kind === 'goto' || kind === 'use') && arg) {
        const o = this.world.objects.find((x) => { const d = this.world.def(x); return !x.wall && d && (d.id === arg || d.name === arg || x.id === arg || (d.name && d.name.indexOf(arg) >= 0)); });
        if (!o) continue;
        const d = this.world.def(o);
        if (kind === 'use' && d.slots.length) this.command({ op: 'agent.use', id: a.id, obj: o.id });
        else this.command({ op: 'agent.goto', id: a.id, obj: o.id });
        continue;
      }
      if (kind === 'emote') this.command({ op: 'agent.emote', id: a.id, kind: arg || 'heart' });
    }
  }

  /* ───────── 对外命令 ───────── */

  command(c) {
    if (!c || !c.op) return { ok: false, error: 'missing op' };
    const w = this.world;
    const agentOf = () => (c.id ? this.agents.get(c.id) : this.mainAgent());
    const queue = () => { const a = agentOf(); if (!a) return { ok: false, error: 'no agent' }; a.queue.push(c); a.cancel(); return { ok: true }; };
    switch (c.op) {
      case 'agent.goto': case 'agent.use': case 'agent.pose': return queue();
      case 'agent.say': { const a = agentOf(); if (!a) return { ok: false }; a.say(c.text, c.ms); return { ok: true }; }
      case 'agent.emote': { const a = agentOf(); if (!a) return { ok: false }; a.emote(c.kind || 'heart', c.s || 2); return { ok: true }; }
      case 'agent.status': {
        const a = agentOf();
        if (!a) return { ok: false, error: 'no agent' };
        const state = c.status || c.state || null;
        const prev = a.status && a.status.state;
        a.status = state ? { state, task: c.task || null, ts: Date.now() } : null;
        if (prev !== state) a.cancel();
        else if (a.status && c.task && a.attach) a.say(c.task, 3200);
        this.bus.emit('agent:status', { id: a.id, status: state, task: c.task || null });
        return { ok: true };
      }
      case 'agent.add': case 'agent.upsert': {
        const rec = Object.assign({ id: uid('a'), kind: 'girl', brain: 'auto' }, c.agent || {});
        const ex = w.scene.agents.find((x) => x.id === rec.id);
        if (ex) { w.apply({ t: 'agent.set', id: ex.id, patch: c.agent }); return { ok: true, id: ex.id }; }
        if (rec.x == null) {
          const door = w.objects.find((o) => o.def === 'door' && o.wall);
          const p = door ? this.nav.nearestFree(door.wall === 'right' ? door.at : 0.5, door.wall === 'right' ? 0.5 : door.at, 4) : this.nav.nearestFree(w.room.w / 2, w.room.h / 2, 8);
          if (p) { rec.x = p.x; rec.y = p.y; }
        }
        w.apply({ t: 'agent.add', agent: rec });
        return { ok: true, id: rec.id };
      }
      case 'agent.remove': return { ok: !!w.apply({ t: 'agent.remove', id: c.id }) };
      case 'agent.list': return { ok: true, agents: [...this.agents.values()].map((a) => a.snapshot()) };
      case 'object.add': {
        const def = this.catalog.get(c.def);
        if (!def) return { ok: false, error: 'unknown def' };
        const obj = { id: c.objId || uid('o'), def: c.def, rot: c.rot || 0, state: Object.assign({}, def.states, c.state) };
        if (def.mount === 'wall') {
          obj.wall = c.wall || 'right'; obj.at = c.at != null ? c.at : w.wallLen(obj.wall) / 2; obj.z = c.z != null ? c.z : def.wz;
          const ok = w.canPlaceWall(c.def, obj.wall, obj.at, obj.z, null);
          if (!ok.ok) return { ok: false, error: ok.reason };
        } else {
          let x = c.x, y = c.y;
          if (x == null || y == null || !w.canPlace(c.def, x, y, obj.rot, null).ok) { const s = this.findFreeSpot(c.def, obj.rot, x, y); if (!s) return { ok: false, error: '没有空位' }; x = s.x; y = s.y; }
          obj.x = x; obj.y = y;
        }
        w.apply({ t: 'add', obj });
        return { ok: true, id: obj.id };
      }
      case 'object.remove': return { ok: !!w.apply({ t: 'remove', id: c.id }) };
      case 'object.set': return { ok: !!w.apply({ t: 'set', id: c.id, patch: c.patch || {} }) };
      case 'object.state': return { ok: !!w.apply({ t: 'state', id: c.id, patch: c.patch || {} }) };
      case 'object.list': return { ok: true, objects: w.objects.map((o) => ({ id: o.id, def: o.def, name: (w.def(o) || {}).name, x: o.x, y: o.y, wall: o.wall, state: o.state })) };
      case 'env.set': {
        const patch = {};
        if ('period' in c) patch.period = c.period || null;
        if ('weather' in c) patch.weather = c.weather || 'clear';
        w.apply({ t: 'env', patch });
        return { ok: true };
      }
      case 'scene.get': return { ok: true, scene: w.toJSON() };
      case 'scene.load': this.loadScene(c.scene); return { ok: true };
      case 'play.run': {
        const play = c.play || this.plays.get(c.id);
        if (!play) return { ok: false, error: 'unknown play' };
        this.director.run(play, { target: c.target ? w.byId.get(c.target) : null, who: c.who ? this.agents.get(c.who) : null });
        return { ok: true };
      }
      case 'mode': this.setMode(c.mode === 'edit' ? 'edit' : 'play'); return { ok: true };
      case 'camera.fit': this.renderer.fit(false); return { ok: true };
      case 'room.list': return { ok: true, current: w.scene.id, rooms: this.home.ordered().map((r) => ({ id: r.id, name: r.name, floor: r.floor })) };
      case 'room.go': { if (!this.home.has(c.id) && !this.storage.load(c.id)) return { ok: false, error: 'unknown room' }; this.goRoom(c.id); return { ok: true }; }
      case 'ui.open': this.shell.open(c.page); return { ok: true };
      case 'ui.close': this.shell.close(); return { ok: true };
      case 'agent.chat': { const a = agentOf(); if (!a) return { ok: false, error: 'no agent' }; this.chat(a, String(c.text || '')); return { ok: true }; }
      case 'room.describe': return { ok: true, room: this.describe() };
      case 'ui.toast': this.hud.toast(c.text || ''); return { ok: true };
      case 'story.list': return { ok: true, stories: this.stories.all().map((s) => ({ id: s.id, name: s.name, trigger: s.trigger, ready: this.stories.ready(s) })) };
      case 'story.run': {
        const s = c.story ? this.stories.add(c.story, 'command') : this.stories.all().find((x) => x.id === c.id);
        if (!s) return { ok: false, error: 'unknown story' };
        if (this.stories.active) return { ok: false, error: 'a story is running' };
        this.stories.run(s, { target: c.target ? w.byId.get(c.target) : null });
        return { ok: true };
      }
      case 'story.skip': this.stories.skip(); return { ok: true };
      case 'story.reset': this.stories.reset(); return { ok: true };
    }
    return { ok: false, error: 'unknown op: ' + c.op };
  }

  /** DSH 工作状态快照（dsh-pet 的 workStatus 同形）→ 主角 */
  setWorkStatus(s) {
    const a = this.mainAgent();
    if (!a) return;
    this.command({ op: 'agent.status', id: a.id, status: s && s.state, task: s && s.task });
  }

  /* ───────── 场景存取 ───────── */

  /**
   * 切换到另一个场景（先存好当前的；撤销历史清空——不同场景之间不互相撤销）。
   * 跟随的角色（主角等，见 _takeFollowers）一起过去：旧房间存档里去掉她们，新房间里同一角色的那份被替换，
   * 她们从通回旧房间的门进屋。opts.followers 可以显式指定（[] = 谁也不带）。
   */
  openScene(scene, opts = {}) {
    if (!scene) return;
    clearTimeout(this._saveT);
    const from = this.world.scene.id;
    const followers = opts.followers || (this.home.follow && scene.id !== from ? this._takeFollowers() : []);
    if (this.opts.autosave) {
      const cur = this.world.toJSON();
      if (followers.length) { const gone = new Set(followers.map((f) => f.rec.id)); cur.agents = cur.agents.filter((a) => !gone.has(a.id)); }
      this.storage.save(cur, { last: false });
    }
    this.stories.skip();
    this.hud.closeCard(); this.hud.closeDrawer(); this.hud.hideTip();
    const next = clone(scene);
    const entry = followers.length ? this._placeFollowers(next, followers, from) : null;
    this.world.load(next);
    this.editor.undo.length = 0;
    this.editor.redo.length = 0;
    this.renderer.fit(true);
    this.editor.select(null);
    this.editor.refresh();
    // 工作状态跟着人走：在新房间重新套用（书桌换了，她会去新房间的书桌）
    for (const f of followers) if (f.status && f.status.state) this.command({ op: 'agent.status', id: f.rec.id, status: f.status.state, task: f.status.task });
    // 马上存一次：跟随的角色已经从旧房间的存档里拿走了，新房间这边也要立刻落盘
    if (this.opts.autosave) this.storage.save(this.world.toJSON());
    if (entry) {   // 进门：门开一下再关上（不进存档）
      this.world.apply({ t: 'state', id: entry, patch: { open: true } }, { silent: true });
      setTimeout(() => { if (this.world.byId.has(entry)) this.world.apply({ t: 'state', id: entry, patch: { open: false } }, { silent: true }); }, 1400);
    }
    this.bus.emit('scene:open', { id: this.world.scene.id, name: this.world.scene.name, from });
  }

  /** 跟着你换房间的角色（见 home.js isFollower）；需求值、工作状态一起带走 */
  _takeFollowers() {
    const out = [];
    for (const a of this.agents.values()) {
      const d = a.data;
      if (!isFollower(d)) continue;
      const rec = clone(d);
      rec.needs = { energy: +a.needs.energy.toFixed(3), fun: +a.needs.fun.toFixed(3), social: +a.needs.social.toFixed(3) };
      out.push({ rec, status: a.status ? Object.assign({}, a.status) : null });
    }
    return out;
  }
  /** 把跟随的角色放进新房间：去掉同一角色的那份，站到通回来的门口（没有就第一扇门、再没有就房间中央）。返回进的那扇门 */
  _placeFollowers(next, followers, from) {
    const same = (a) => followers.some((f) => f.rec.id === a.id || (f.rec.character && a.character === f.rec.character));
    next.agents = (next.agents || []).filter((a) => !same(a));
    const doors = (next.objects || []).filter((o) => { const d = o.wall && this.catalog.get(o.def); return d && d.portal; });
    const door = (from && doors.find((o) => o.state && o.state.to === from)) || doors[0] || null;
    const r = next.room || {};
    const at = door ? (door.wall === 'left' ? { x: 0.6, y: door.at } : { x: door.at, y: 0.6 }) : { x: (r.w || 8) / 2, y: (r.h || 6) / 2 };
    followers.forEach((f, i) => next.agents.push(Object.assign(f.rec, { x: at.x + (door && door.wall === 'left' ? i * 0.5 : 0), y: at.y + (door && door.wall !== 'left' ? i * 0.5 : 0) })));
    return door && door.id ? door.id : null;
  }

  /** 去家里的另一个房间：转场 + 跟随的角色一起过去 */
  async goRoom(id) {
    if (!id || this._going || this.visiting || id === this.world.scene.id) return false;
    const scene = this.home.sceneFor(id) || this.storage.load(id);
    if (!scene || scene.id !== id) return false;
    this._going = true;
    try {
      const room = this.home.room(id);
      await this.shell.curtain(true, room ? room.floor + ' · ' + room.name : scene.name || '');
      this.openScene(scene);
      await this.shell.curtain(false);
    } finally {
      this._going = false;
    }
    return true;
  }

  /** 过门：主角先走到门口（最多等几秒），门开一下，再转场到门通往的房间 */
  async walkThrough(o) {
    const to = o && o.state && o.state.to;
    if (!to || this._going || !this.home.has(to)) return false;
    this.hud.closeDrawer();
    const a = this.home.follow ? this.mainAgent() : null;
    if (a) {
      const p = doorSpot(this.nav, o, this.world.room);
      a.queue.length = 0;
      a.engaged = 'door';
      a.activity = '出门';
      if (p) await Promise.race([a.walkTo(p.x, p.y, { run: true }), delay(4500)]);
    }
    if (this.world.byId.has(o.id)) this.world.apply({ t: 'state', id: o.id, patch: { open: true } }, { silent: true });
    this.sfx('click');
    await delay(260);
    if (this.world.byId.has(o.id)) this.world.apply({ t: 'state', id: o.id, patch: { open: false } }, { silent: true });
    const ok = await this.goRoom(to);
    if (!ok && a && this.agents.get(a.id) === a) a.engaged = null;
    return ok;
  }

  /** 去某个房间（名字或 id）：当前房间有门通过去就走门，没有就直接过去 */
  goRoomNamed(ref) {
    const r = this.home.rooms().find((x) => x.id === ref || x.name === ref) || this.home.rooms().find((x) => ref && (x.name.indexOf(ref) >= 0 || ref.indexOf(x.name) >= 0));
    if (!r || r.id === this.world.scene.id) return false;
    const door = this.world.objects.find((o) => o.wall && o.state && o.state.to === r.id);
    if (door) this.walkThrough(door); else this.goRoom(r.id);
    return true;
  }

  loadScene(scene, opts) {
    if (!scene) return;
    if (!(opts && opts.keepHistory)) this.editor.pushLoad(this.world.toJSON());
    this.world.load(scene);
    this.renderer.fit(true);
    this.editor.select(null);
    this.editor.refresh();
    this._autosave();
  }
  resetScene() {
    const cur = this.world.scene, t = this.templateOf(cur);
    const s = t ? clone(t) : this.defaultScene();
    s.id = cur.id; s.name = cur.name; if (t) s.template = t.id;
    this.loadScene(s);
    this.hud.toast('已恢复默认布置（可撤销）');
  }
  exportScene() {
    const data = JSON.stringify(this.world.toJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'room-' + (this.world.scene.name || 'scene') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.hud.toast('已导出布局 JSON');
  }
  importScene(text) {
    try {
      const s = typeof text === 'string' ? JSON.parse(text) : text;
      if (!s || s.format !== 'roomkit.scene') throw new Error('不是 RoomKit 场景文件');
      this.loadScene(s);
      this.hud.toast('已导入：' + (s.name || s.id));
    } catch (e) {
      this.hud.toast('导入失败：' + e.message, 3000);
    }
  }

  /* ───────── 声音（WebAudio 合成，默认关） ───────── */

  setSound(on) { this.soundOn = !!on; this.storage.pref('sound', this.soundOn); if (on) { this._audioUnlock(); this.sfx('pop'); } this.hud.syncBar(); }
  _audioUnlock() {
    if (!this.soundOn) return;
    try {
      if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ac.state === 'suspended') this._ac.resume();
    } catch (e) { /* 不支持就静音 */ }
  }
  sfx(name) {
    if (!this.soundOn || !this._ac) return;
    const T = {
      tick: [[1250, 0.025, 'sine', 0.012]], click: [[520, 0.06, 'triangle', 0.05]], pop: [[660, 0.05, 'sine', 0.06], [990, 0.07, 'sine', 0.045, 0.04]],
      place: [[330, 0.07, 'triangle', 0.06], [495, 0.1, 'triangle', 0.05, 0.06]], remove: [[440, 0.06, 'triangle', 0.05], [262, 0.1, 'triangle', 0.04, 0.05]],
      nope: [[180, 0.12, 'square', 0.025]], chirp: [[880, 0.05, 'sine', 0.05], [1320, 0.06, 'sine', 0.04, 0.05]],
    }[name] || [[600, 0.05, 'sine', 0.04]];
    const ac = this._ac, t0 = ac.currentTime;
    for (const [f, d, type, g, delay] of T) {
      const o = ac.createOscillator(), gn = ac.createGain(), t = t0 + (delay || 0);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g, t + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn); gn.connect(ac.destination);
      o.start(t); o.stop(t + d + 0.02);
    }
  }

  /* ───────── postMessage 桥（iframe / 桌面壳 / 同页其他脚本） ───────── */

  _bridge() {
    if (this.opts.bridge === false) return;
    const allow = (e) => this.opts.bridge === '*' || e.origin === location.origin || (e.origin === 'null' && location.protocol === 'file:');
    this._onMsg = (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || !d.roomkit || !allow(e)) return;
      const result = this.command(d.roomkit);
      if (d.reqId && e.source && e.source.postMessage) e.source.postMessage({ roomkitReply: d.reqId, result }, e.origin === 'null' ? '*' : e.origin);
    };
    window.addEventListener('message', this._onMsg);
    if (window.parent && window.parent !== window) {
      this.bus.on('*', (payload, ev) => {
        try { window.parent.postMessage({ roomkitEvent: ev, data: payload }, this.opts.bridge === '*' ? '*' : location.origin); } catch (err) { /* 跨源父页面 */ }
      });
    }
  }

  destroy() {
    this._dead = true;
    cancelAnimationFrame(this._raf);
    for (const b of this.brains.values()) b.stop();
    for (const a of this.agents.values()) a.dispose();
    this._ro.disconnect();
    if (this.desk) this.desk.dispose();
    if (this._onMsg) window.removeEventListener('message', this._onMsg);
    this.root.remove();
  }
}
