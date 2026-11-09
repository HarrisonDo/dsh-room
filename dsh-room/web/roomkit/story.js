/**
 * RoomKit · 剧情（有剧情、有选择、多角色同台的场景交互）。
 *
 * story = {
 *   id, name, once?, daily?, marker?:false,
 *   trigger: { on:'start'|'click'|'agent'|'hour', obj?, def?, agent?, from?, to?, scene?, chance?, if? },
 *   roles: { 角色名: 'pet' | 'any' | 角色id },        // 剧本里用角色名，运行时绑定到真实角色
 *   start?: 'start',
 *   nodes: { 节点名: [ step... ] }
 * }
 * 剧情专用步骤：line（某人说）、narrate（旁白）、choice（选项分支）、goto、end、set/inc（剧情变量）、camera、cmd（剧终后排队的命令）
 * 其余步骤（goto/use/pose/emote/expr/face/state/env/outfit/par/wait/sfx）与小剧场共用 Director.doStep。
 * 条件 if：'flag:名' | '!flag:名' | 'night' | 'day' | 'hour:22-2' | { flag, eq|gte|lte } | [多个条件]
 * 进度（剧情变量、已看过的剧情）按场景存在 storage.pref('story.<sceneId>')，不污染场景 JSON。
 */
import { clone } from './util.js';

export function normalizeStory(raw, source) {
  const s = clone(raw) || {};
  if (!s.id || !s.nodes) throw new Error('[roomkit] 剧情缺少 id 或 nodes');
  s.name = s.name || s.id;
  s.trigger = s.trigger || { on: 'manual' };
  s.roles = s.roles || {};
  s.start = s.start || 'start';
  s.source = source || 'pack';
  return s;
}

export class Stories {
  constructor(app) {
    this.app = app;
    this.list = [];
    this.active = null;
    this._skip = false;
    this._hourAt = 0;
  }

  add(raw, source) {
    try {
      const s = normalizeStory(raw, source);
      this.list = this.list.filter((x) => x.id !== s.id).concat([s]);
      return s;
    } catch (e) { console.warn(e.message, raw && raw.id); return null; }
  }

  /** 当前场景可用的全部剧情：内容包里的 + 场景自带的 */
  all() {
    const own = (this.app.world.scene.stories || []).map((s) => { try { return normalizeStory(s, 'scene'); } catch (e) { return null; } }).filter(Boolean);
    const ids = new Set(own.map((s) => s.id));
    return own.concat(this.list.filter((s) => !ids.has(s.id)));
  }

  /** 某个房间（场景 JSON）里能演的剧情：剧情页、地图的进度都按它算——限定了别的房间、要点的家具或角色不在这屋的不算 */
  forScene(scene) {
    const own = (scene.stories || []).map((s) => { try { return normalizeStory(s, 'scene'); } catch (e) { return null; } }).filter(Boolean);
    const ids = new Set(own.map((s) => s.id));
    const objs = scene.objects || [], agents = scene.agents || [];
    const fits = (s) => {
      const t = s.trigger;
      if (t.scene && t.scene !== scene.id && t.scene !== scene.template) return false;
      if (t.on === 'click') return t.obj ? objs.some((o) => o.id === t.obj) : objs.some((o) => o.def === t.def);
      if (t.on === 'agent') return agents.some((a) => a.id === t.agent);
      return true;
    };
    return own.concat(this.list.filter((s) => !ids.has(s.id) && fits(s)));
  }

  /* ───────── 进度 ───────── */

  _key(sceneId) { return 'story.' + (sceneId || this.app.world.scene.id); }
  _state(sceneId) { return this.app.storage.pref(this._key(sceneId)) || {}; }
  /** sceneId 不传 = 当前房间（地图上看别的房间的进度时传它的 id） */
  getFlag(k, sceneId) { return this._state(sceneId)[k]; }
  setFlag(k, v) { const s = this._state(); if (v === undefined || v === null) delete s[k]; else s[k] = v; this.app.storage.pref(this._key(), s); }
  reset() { this.app.storage.pref(this._key(), {}); }

  test(cond) {
    if (cond == null || cond === '') return true;
    if (Array.isArray(cond)) return cond.every((c) => this.test(c));
    if (typeof cond === 'object') {
      const v = this.getFlag(cond.flag);
      if ('eq' in cond) return v === cond.eq;
      if ('gte' in cond) return (+v || 0) >= cond.gte;
      if ('lte' in cond) return (+v || 0) <= cond.lte;
      return !!v;
    }
    const c = String(cond).trim();
    if (c[0] === '!') return !this.test(c.slice(1));
    if (c.indexOf('flag:') === 0) return !!this.getFlag(c.slice(5));
    if (c === 'night') return this.app.isNight();
    if (c === 'day') return !this.app.isNight();
    if (c.indexOf('hour:') === 0) { const [a, b] = c.slice(5).split('-').map(Number); return inHours(this.app.hour(), a, b); }
    return !!this.getFlag(c);
  }

  /** 这条剧情现在能不能演：没演过（once/daily）、条件满足、角色都在场 */
  ready(s) {
    if (this.active) return false;
    const t = s.trigger;
    if (t.scene && t.scene !== this.app.world.scene.id && t.scene !== this.app.world.scene.template) return false;
    if (s.once && this.getFlag('done:' + s.id)) return false;
    if (s.daily && this.getFlag('day:' + s.id) === today()) return false;
    if (t.if && !this.test(t.if)) return false;
    for (const role in s.roles) if (!this.app.director.resolveWho(s.roles[role], {})) return false;
    return true;
  }

  forObject(o) {
    const def = this.app.world.def(o);
    return this.all().find((s) => s.trigger.on === 'click' && (s.trigger.obj === o.id || (def && s.trigger.def === def.id)) && this.ready(s)) || null;
  }
  forAgent(a) { return this.all().find((s) => s.trigger.on === 'agent' && s.trigger.agent === a.id && this.ready(s)) || null; }

  /** 头顶"！"标记：有剧情等着被点开的家具/角色 */
  markers() {
    if (this.active || this.app.mode === 'edit') return [];
    const out = [];
    for (const s of this.all()) {
      if (s.marker === false || !this.ready(s)) continue;
      if (s.trigger.on === 'click') {
        const o = s.trigger.obj ? this.app.world.byId.get(s.trigger.obj) : this.app.world.objects.find((x) => x.def === s.trigger.def);
        if (o) out.push({ id: o.id, story: s.id });
      } else if (s.trigger.on === 'agent' && this.app.agents.has(s.trigger.agent)) out.push({ id: 'agent:' + s.trigger.agent, story: s.id });
    }
    return out;
  }

  /** 场景开场 / 每隔一会儿检查时段剧情 */
  checkStart() {
    const s = this.all().find((x) => x.trigger.on === 'start' && this.ready(x));
    // 有外壳时不自动开演（会推镜头、挡住画面），改成一条可点的提示；外壳里可设为自动播放
    if (s) setTimeout(() => { if (!this.ready(s)) return; if (this.app.shell) this.app.shell.offerStory(s); else this.run(s); }, 1400);
  }
  tick(dt) {
    this._hourAt -= dt;
    if (this._hourAt > 0 || this.active || this.app.mode === 'edit') return;
    this._hourAt = 20;
    const h = this.app.hour();
    const s = this.all().find((x) => x.trigger.on === 'hour' && inHours(h, x.trigger.from, x.trigger.to) && this.ready(x));
    if (s) { if (this.app.shell) this.app.shell.offerStory(s); else this.run(s); }
  }

  skip() { if (this.active) { this._skip = true; this.app.dialog.cancel(); } }

  _text(t, ctx) {
    return String(t == null ? '' : t)
      .replace(/\{\{user\}\}/g, this.app.opts.userName || '你')
      .replace(/\{\{(\w+)\}\}/g, (m, k) => (ctx.roles[k] ? ctx.roles[k].name : m));
  }

  async run(story, ctx = {}) {
    if (this.app.worldSession?.id) return false;
    if (this.active) return false;
    const app = this.app, D = app.director, dlg = app.dialog;
    this.active = story;
    this._skip = false;
    this.setFlag('seen:' + story.id, true);           // 剧情页 / 地图的进度：看过就算（只演一次的另记 done）
    const cast = new Set(), roles = {};
    for (const role in story.roles) {
      const a = D.resolveWho(story.roles[role], ctx);
      if (!a) continue;
      roles[role] = a;
      // 演员一开场就"上台"：停下手里的事等着，不会演到一半跑去冰箱偷吃
      if (!cast.has(a)) { cast.add(a); a.cancel(); a.engaged = 'play'; }
    }
    const sctx = Object.assign({}, ctx, { roles });
    const later = [];
    app.hud.closeCard(); app.hud.closeDrawer(); app.hud.hideTip();
    app.bus.emit('story:start', { id: story.id, name: story.name });
    dlg.open(story.name);
    let node = story.start, hops = 0;
    try {
      outer: while (node && hops++ < 200 && !this._skip) {
        const steps = story.nodes[node];
        if (!steps) break;
        let next = null;
        for (const s of steps) {
          if (this._skip) break outer;
          if (s.if && !this.test(s.if)) continue;
          // goto 有两种：带 node 是跳剧情节点；带 obj/to/x 是角色走位（交给下面的 default → doStep）
          const op = s.do === 'goto' && !s.node ? 'walk' : s.do;
          switch (op) {
            case 'goto': next = s.node; break;
            case 'end': next = null; break;
            case 'set': this.setFlag(s.flag, s.value === undefined ? true : s.value); continue;
            case 'inc': this.setFlag(s.flag, (+this.getFlag(s.flag) || 0) + (s.by || 1)); continue;
            case 'cmd': later.push(this._roleCmd(s.cmd, roles)); continue;
            case 'camera': this._focus(s.focus, sctx, s.zoom); continue;
            case 'line': case 'narrate': {
              const a = s.do === 'line' ? D.resolveWho(s.who, sctx) : null;
              if (a) {
                if (!cast.has(a)) { cast.add(a); a.cancel(); a.engaged = 'play'; }
                if (s.expr) a.setExpr(s.expr, 3.5);
                if (s.emote) a.emote(s.emote, 2.6);
                if (s.pose) a.pose_(s.pose, s.s || 3);
                a.bounce(0.35);
                if (s.camera !== false) this._focus(a.id, sctx, s.zoom);
              }
              const r = await dlg.line(a ? a.name : s.name || '', this._text(s.text, sctx), a ? a.look.body : null);
              if (!r || r.skip) break outer;
              continue;
            }
            case 'choice': {
              const opts = (s.options || []).filter((o) => !o.if || this.test(o.if));
              if (!opts.length) continue;
              const r = await dlg.choose(this._text(s.text || '', sctx), opts.map((o) => this._text(o.label, sctx)));
              if (!r || r.skip) break outer;
              const o = opts[r.index];
              if (!o) continue;
              if (o.set) for (const k in o.set) this.setFlag(k, o.set[k]);
              if (o.goto) next = o.goto;
              app.bus.emit('story:choice', { id: story.id, node, label: o.label });
              break;
            }
            default: {
              dlg.idle();
              const ok = await D.doStep(s, sctx, cast);
              if (ok === false && s.required) break outer;
              continue;
            }
          }
          break;            // goto / end / choice 跳出当前节点
        }
        node = next;
      }
    } catch (e) {
      console.error('[roomkit] 剧情出错:', story.id, e);
    } finally {
      D.release(cast);
      dlg.close();
      app.renderer.fit(false);
      if (story.once) this.setFlag('done:' + story.id, true);
      if (story.daily) this.setFlag('day:' + story.id, today());
      this.active = null;
      app.bus.emit('story:end', { id: story.id, skipped: this._skip });
      later.forEach((c) => c && app.command(c));
    }
    return true;
  }

  _roleCmd(cmd, roles) {
    if (!cmd) return null;
    const c = Object.assign({}, cmd);
    if (typeof c.id === 'string' && c.id[0] === '$' && roles[c.id.slice(1)]) c.id = roles[c.id.slice(1)].id;
    return c;
  }

  _focus(ref, ctx, zoom) {
    const app = this.app, R = app.renderer;
    let p = null;
    const a = (ctx.roles && ctx.roles[ref]) || app.agents.get(ref);
    if (a) p = app.iso.toWorld(a.x, a.y, a.z + 34);
    else {
      const pt = app.director.resolvePoint(ref, ctx);
      if (pt) p = app.iso.toWorld(pt.x, pt.y, 40);
    }
    if (p) R.focusOn(p.x, p.y, zoom || 1.55);
  }
}

function inHours(h, from, to) {
  if (from == null || to == null) return true;
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
