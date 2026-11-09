/**
 * RoomKit · 布置模式（房间编辑器）。
 *
 * 家具库点选 → 跟手"幽灵"（绿=可放 / 红=冲突，附原因）→ 点击落位（连续摆放，Esc 结束）；
 * 点选家具 → 拖动 / R 旋转 / Ctrl+D 复制 / 🎨 换色 / Delete 删除；墙面物件沿墙拖，可跨墙角换墙；
 * 房间页：尺寸、地面材质（整屋铺 / 刷子 / 挖空）、墙（左右、高度、颜色、墙纸）、地台厚度；
 * 角色页：增删小鲸鱼、改名、换色、帽饰、行为模式。所有改动走 world.apply → 可撤销、自动保存。
 */
import { clamp, uid, clone, pick, rgba } from './util.js';
import { orient } from './iso.js';
import { paletteOf, CATEGORY_NAMES } from './catalog.js';
import { resizeCells } from './scene.js';
import { paintObject, procThumb } from './paint-furniture.js';
import { paintWallItem, wallItemFrame, wallItemQuad } from './paint-room.js';
import { WHALE_LOOKS } from './appearance.js';
import { esc } from './ui.js';
import { renderScenesPane, onScenesClick, onScenesChange, renderPacksPane, onPacksClick } from './workshop.js';

const MAT_KINDS = [['wood', '木地板'], ['tile', '瓷砖'], ['carpet', '地毯'], ['stone', '石板'], ['grass', '草地'], ['plain', '纯色']];
const PATTERNS = [['plain', '纯色'], ['stripes', '竖条纹'], ['dots', '波点'], ['bricks', '砖墙']];
const AGENT_NAMES = ['小蓝', '泡泡', '团子', '小鲸', '阿肥', '米粒', '豆豆', '浪花'];
const ROLE_LOOKS = [
  ['q', 'Q 版大肥鱼', 'girl', { body: '#5b8def', belly: '#eef5ff', hat: 'maid', rig: false }],
  ['whale', '小鲸鱼 · 球球', 'whale', { body: '#7ec8e3', belly: '#f2fbff', size: 1.1 }],
  ['legacy', '旧版走路鲸鱼', 'token', { body: '#7fb8d8', accent: '#8fd28f' }],
];
const RIG_COLORS = [
  ['blue', '原版蓝发', 'deepseek'], ['harness', '纯黑'], ['chatgpt', '银白'],
  ['claude', '赤陶'], ['gemini', '四色'], ['qwen', '紫'], ['kimi', '黑蓝'],
  ['minimax', '玫红橙'], ['rose', '红发'],
];

function roleLooks(app) {
  const enabled = app.opts.rigLooks || (app.rig?.lib && !app.opts.neutral ? ['blue', 'rose'] : null);
  if (!enabled?.length) return [];
  return [...ROLE_LOOKS, ...RIG_COLORS.filter(([id]) => enabled.includes(id)).map(([id, label, scheme = id]) => [
    id, '分件版 · ' + label, 'girl',
    { hat: 'maid', rig: true, ...(id === 'rose' ? { body: '#e5576a' } : { rigScheme: scheme }) },
  ])];
}
const HATS = [['', '无'], ['maid', '女仆头饰'], ['bow', '蝴蝶结'], ['cap', '小帽子']];
const BRAINS = [['auto', '自主生活'], ['pet', '宠物（跟随工作状态）'], ['manual', '只听指令']];
const PRESETS = [
  { name: '奶油卧室', walls: { color: '#f6ead6', wainscot: '#8fb0c9', trim: '#ffffff', pattern: 'plain' }, mat: { kind: 'wood', color: '#e3a46a' } },
  { name: '薄荷客厅', walls: { color: '#e3f2ea', wainscot: '#7fb59a', trim: '#ffffff', pattern: 'stripes' }, mat: { kind: 'wood', color: '#d9a575' } },
  { name: '樱花小屋', walls: { color: '#fbe6ea', wainscot: '#e9a3b4', trim: '#fffaf6', pattern: 'dots' }, mat: { kind: 'carpet', color: '#f3d7c9' } },
  { name: '深海书房', walls: { color: '#d7e1f2', wainscot: '#4f6b9a', trim: '#f4f7ff', pattern: 'plain' }, mat: { kind: 'tile', color: '#c9d3e3' } },
  { name: '暖阳厨房', walls: { color: '#fbf1e1', wainscot: '#e9b48a', trim: '#ffffff', pattern: 'dots' }, mat: { kind: 'tile', color: '#f1e6d2' } },
  { name: '砖墙小院', walls: { color: '#e9c4a6', wainscot: '#b98a6a', trim: '#f6efe4', pattern: 'bricks' }, mat: { kind: 'grass', color: '#9bd17a' } },
];

export class Editor {
  constructor(app) {
    this.app = app;
    this.undo = []; this.redo = [];
    this.tool = null;            // { kind:'place', defId, rot } | { kind:'paint', mat }
    this.ghost = null;
    this.drag = null;
    this.sel = null;             // 选中的家具 id
    this.cat = null;
    this.tab = 'furn';
    this.brushMat = 0;
    this._built = false;
  }

  /* ───────── 进出 ───────── */

  enter() {
    if (!this._built) this._build();
    this.app.root.classList.add('rk-edit');
    this.app.renderer.overlay = (ctx, t) => this._overlay(ctx, t);
    this.refresh();
    this.app.hud.toast('布置模式：点家具库添加，拖动摆位，R 旋转，Del 删除');
  }
  exit() {
    this.cancelTool();
    this.select(null);
    this.app.root.classList.remove('rk-edit');
    this.app.renderer.overlay = null;
    this.app.renderer.hidden.clear();
  }

  /* ───────── 编辑入口（可撤销） ───────── */

  exec(op) {
    const inv = this.app.world.apply(op);
    if (!inv) return null;
    this.undo.push({ op, inv });
    if (this.undo.length > 200) this.undo.shift();
    this.redo.length = 0;
    this.refresh();
    return inv;
  }
  doUndo() {
    const r = this.undo.pop();
    if (!r) return this.app.hud.toast('没有可撤销的了');
    if (r.load) { this.redo.push({ load: this.app.world.toJSON() }); this.app.loadScene(r.load, { keepHistory: true }); }
    else { this.app.world.apply(r.inv); this.redo.push(r); }
    this.select(null);
    this.refresh();
  }
  doRedo() {
    const r = this.redo.pop();
    if (!r) return this.app.hud.toast('没有可重做的了');
    if (r.load) { this.undo.push({ load: this.app.world.toJSON() }); this.app.loadScene(r.load, { keepHistory: true }); }
    else { r.inv = this.app.world.apply(r.op); this.undo.push(r); }
    this.refresh();
  }
  pushLoad(prevScene) { this.undo.push({ load: prevScene }); this.redo.length = 0; }

  /* ───────── 工具 ───────── */

  startPlace(defId) {
    const def = this.app.world.catalog.get(defId);
    if (!def) return;
    if (this.tool && this.tool.kind === 'place' && this.tool.defId === defId) { this.cancelTool(); return; }
    this.select(null);
    this.tool = { kind: 'place', defId, rot: 0 };
    this.ghost = null;
    this._syncItems();
    this.app.hud.toast(def.mount === 'wall' ? '移到墙上点击挂上 · Esc 结束' : '点击地面放下 · R 旋转 · Esc 结束');
  }
  startPaint(mat) {
    this.select(null);
    this.tool = { kind: 'paint', mat };
    this._syncRoomPane();
    this.app.hud.toast(mat < 0 ? '在地面上拖动：挖空格子' : '在地面上拖动：刷地面材质');
  }
  cancelTool() {
    this.tool = null;
    this.ghost = null;
    this._syncItems();
    this._syncRoomPane();
  }

  select(id) {
    this.sel = id;
    const R = this.app.renderer;
    R.selected = id ? { id } : null;
    this._renderSelBar();
  }

  /* ───────── 指针（由 app 的输入层转发） ───────── */

  onDown(sx, sy) {
    const app = this.app, R = app.renderer;
    if (this.tool) {
      if (this.tool.kind === 'paint') { this._paintAt(sx, sy, true); this._painting = true; }
      return true;
    }
    const hit = R.pick(sx, sy);
    if (hit && hit.kind === 'obj') {
      this.select(hit.id);
      const o = hit.obj, w = R.screenToWorld(sx, sy);
      if (o.wall) {
        const wa = R.wallAt(sx, sy, true);
        this.drag = { id: o.id, wall: true, sx, sy, moved: false, dz: wa ? wa.z - app.world.wallZ(o) : 0, du: wa ? wa.u - o.at : 0 };
      } else {
        const tile = app.iso.toTile(w.x, w.y);
        this.drag = { id: o.id, sx, sy, moved: false, ox: tile.x - o.x, oy: tile.y - o.y };
      }
      return true;
    }
    if (hit && hit.kind === 'agent') {
      this.select(null);
      this.drag = { agent: hit.agent, sx, sy, moved: false };
      return true;
    }
    this.select(null);
    return false;            // 空白处：交给相机平移
  }

  onMove(sx, sy, down) {
    const app = this.app, R = app.renderer;
    if (this.tool && this.tool.kind === 'place') { this._ghostAt(sx, sy); return; }
    if (this.tool && this.tool.kind === 'paint') { this._hoverCell = this._cellAt(sx, sy); if (down && this._painting) this._paintAt(sx, sy); return; }
    const d = this.drag;
    if (!d || !down) return;
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
    d.moved = true;
    if (d.agent) { const w = R.screenToWorld(sx, sy), t = app.iso.toTile(w.x, w.y); d.at = t; return; }
    R.hidden.add(d.id);
    const o = app.world.byId.get(d.id);
    if (!o) { this.drag = null; return; }
    if (d.wall) {
      const wa = R.wallAt(sx, sy, true);
      if (!wa) return;
      const def = app.world.def(o);
      const len = app.world.wallLen(wa.side);
      const at = clamp(Math.round((wa.u - (wa.side === o.wall ? d.du : 0)) * 4) / 4, def.wsize[0] / 2, len - def.wsize[0] / 2);
      const z = clamp(Math.round((wa.z - d.dz) / 5) * 5, 0, app.world.room.walls.height - def.wsize[1]);
      const ok = app.world.canPlaceWall(o.def, wa.side, at, z, o.id);
      this.ghost = { defId: o.def, wall: wa.side, at, z, ok: ok.ok, reason: ok.reason, obj: o };
    } else {
      const w = R.screenToWorld(sx, sy), t = app.iso.toTile(w.x, w.y);
      const x = Math.round(t.x - d.ox), y = Math.round(t.y - d.oy);
      const ok = app.world.canPlace(o.def, x, y, o.rot, o.id);
      this.ghost = { defId: o.def, x, y, rot: o.rot, ok: ok.ok, reason: ok.reason, obj: o };
    }
  }

  onUp(sx, sy) {
    const app = this.app, R = app.renderer;
    this._painting = false;
    if (this.tool && this.tool.kind === 'place') {
      this._ghostAt(sx, sy);
      const g = this.ghost;
      if (g && g.ok) {
        const obj = g.wall ? { def: g.defId, wall: g.wall, at: g.at, z: g.z } : { def: g.defId, x: g.x, y: g.y, rot: g.rot };
        const def = app.world.catalog.get(g.defId);
        obj.state = clone(def.states);
        this.exec({ t: 'add', obj });
        app.sfx('place');
      } else if (g) {
        app.hud.toast(g.reason || '这里放不下');
        app.sfx('nope');
      }
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    R.hidden.delete(d.id);
    if (d.agent) {
      if (d.moved && d.at) {
        const p = app.nav.nearestFree(d.at.x, d.at.y, 3);
        if (p) { d.agent.cancel(); d.agent.x = p.x; d.agent.y = p.y; this.exec({ t: 'agent.set', id: d.agent.id, patch: { x: p.x, y: p.y } }); }
      } else {
        app.hud.openCard(d.agent);
      }
      return;
    }
    const g = this.ghost;
    this.ghost = null;
    if (!d.moved || !g) { this._renderSelBar(); return; }
    if (!g.ok) { app.hud.toast(g.reason || '这里放不下'); app.sfx('nope'); this._renderSelBar(); return; }
    const patch = g.wall ? { wall: g.wall, at: g.at, z: g.z } : { x: g.x, y: g.y };
    this.exec({ t: 'set', id: d.id, patch });
    app.sfx('place');
  }

  onKey(e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return true; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); this.doRedo(); return true; }
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); this.duplicate(); return true; }
    if (k === 'Escape') { if (this.tool) this.cancelTool(); else this.select(null); return true; }
    if (k === 'r' || k === 'R') { this.rotate(); return true; }
    if (k === 'Delete' || k === 'Backspace') { if (this.sel) { e.preventDefault(); this.remove(); } return true; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k] && this.sel) { e.preventDefault(); this.nudge(arrows[k][0], arrows[k][1]); return true; }
    return false;
  }

  /* ───────── 选中物操作 ───────── */

  rotate() {
    const app = this.app;
    if (this.tool && this.tool.kind === 'place') {
      const def = app.world.catalog.get(this.tool.defId);
      this.tool.rot = (this.tool.rot + 1) % def.rots;
      if (this._lastPt) this._ghostAt(this._lastPt[0], this._lastPt[1]);
      return;
    }
    const o = app.world.byId.get(this.sel);
    if (!o || o.wall) return;
    const def = app.world.def(o);
    if (def.rots < 2) return;
    for (let i = 1; i < def.rots; i++) {
      const rot = (o.rot + i) % def.rots;
      if (app.world.canPlace(o.def, o.x, o.y, rot, o.id).ok) { this.exec({ t: 'set', id: o.id, patch: { rot } }); app.sfx('click'); return; }
    }
    app.hud.toast('转不开：旁边太挤了');
  }
  duplicate() {
    const app = this.app, o = app.world.byId.get(this.sel);
    if (!o) return;
    const c = clone(o);
    c.id = uid('o');
    if (o.wall) {
      const def = app.world.def(o), len = app.world.wallLen(o.wall);
      for (const d of [1, -1, 2, -2, 3, -3]) {
        const at = o.at + d * def.wsize[0];
        if (at - def.wsize[0] / 2 >= 0 && at + def.wsize[0] / 2 <= len && app.world.canPlaceWall(o.def, o.wall, at, app.world.wallZ(o), null).ok) {
          c.at = at; this.exec({ t: 'add', obj: c }); this.select(c.id); return;
        }
      }
    } else {
      const spot = app.findFreeSpot(o.def, o.rot, o.x, o.y);
      if (spot) { c.x = spot.x; c.y = spot.y; this.exec({ t: 'add', obj: c }); this.select(c.id); return; }
    }
    app.hud.toast('没有空位复制了');
  }
  remove() {
    if (!this.sel) return;
    this.exec({ t: 'remove', id: this.sel });
    this.select(null);
    this.app.sfx('remove');
  }
  nudge(dx, dy) {
    const app = this.app, o = app.world.byId.get(this.sel);
    if (!o) return;
    if (o.wall) {
      const def = app.world.def(o), at = o.at + (dx || dy) * 0.25;
      if (app.world.canPlaceWall(o.def, o.wall, at, app.world.wallZ(o), o.id).ok) this.exec({ t: 'set', id: o.id, patch: { at } });
      return;
    }
    if (app.world.canPlace(o.def, o.x + dx, o.y + dy, o.rot, o.id).ok) this.exec({ t: 'set', id: o.id, patch: { x: o.x + dx, y: o.y + dy } });
  }
  recolor() {
    const app = this.app, o = app.world.byId.get(this.sel);
    if (!o) return;
    const def = app.world.def(o);
    if (def.variants && def.variants.length) {
      const i = (o.variant == null ? 0 : o.variant + 1) % (def.variants.length + 1);
      this.exec({ t: 'set', id: o.id, patch: { variant: i === def.variants.length ? undefined : i, colors: i === def.variants.length ? undefined : clone(def.variants[i]) } });
      return;
    }
    const inp = this.el.color;
    const before = clone(o.colors);
    inp.value = paletteOf(def, o)('main');
    inp.oninput = () => app.world.apply({ t: 'set', id: o.id, patch: { colors: Object.assign({}, o.colors, { main: inp.value }) } }, { silent: true });
    inp.onchange = () => {
      if (this.exec({ t: 'set', id: o.id, patch: { colors: Object.assign({}, o.colors, { main: inp.value }) } })) {
        this.undo[this.undo.length - 1].inv = { t: 'set', id: o.id, patch: { colors: before } };
      }
    };
    inp.click();
  }
  toggleState() {
    const app = this.app, o = app.world.byId.get(this.sel);
    if (!o) return;
    const def = app.world.def(o), key = Object.keys(def.states).find((k) => typeof def.states[k] === 'boolean');
    if (!key) return app.hud.toast('它没有开关');
    app.world.apply({ t: 'state', id: o.id, patch: { [key]: !(o.state && o.state[key]) } });
    app.sfx('click');
  }

  /* ───────── 幽灵与涂刷 ───────── */

  _ghostAt(sx, sy) {
    this._lastPt = [sx, sy];
    const app = this.app, R = app.renderer, def = app.world.catalog.get(this.tool.defId);
    if (!def) return;
    if (def.mount === 'wall') {
      const wa = R.wallAt(sx, sy, true);
      if (!wa) { this.ghost = null; return; }
      const len = app.world.wallLen(wa.side);
      const at = clamp(Math.round(wa.u * 4) / 4, def.wsize[0] / 2, Math.max(def.wsize[0] / 2, len - def.wsize[0] / 2));
      const z = clamp(def.wz, 0, Math.max(0, app.world.room.walls.height - def.wsize[1]));
      const ok = app.world.canPlaceWall(def.id, wa.side, at, z, null);
      this.ghost = { defId: def.id, wall: wa.side, at, z, ok: ok.ok, reason: ok.reason };
      return;
    }
    const w = R.screenToWorld(sx, sy), t = app.iso.toTile(w.x, w.y);
    const or = orient(def.size, this.tool.rot, def.rotMode);
    const x = Math.round(t.x - or.w / 2), y = Math.round(t.y - or.h / 2);
    const ok = app.world.canPlace(def.id, x, y, this.tool.rot, null);
    this.ghost = { defId: def.id, x, y, rot: this.tool.rot, ok: ok.ok, reason: ok.reason };
  }

  _cellAt(sx, sy) {
    const app = this.app, w = app.renderer.screenToWorld(sx, sy), t = app.iso.toTile(w.x, w.y);
    const cx = Math.floor(t.x), cy = Math.floor(t.y), r = app.world.room;
    if (cx < 0 || cy < 0 || cx >= r.w || cy >= r.h) return null;
    return { cx, cy };
  }

  _paintAt(sx, sy, first) {
    const app = this.app, c = this._cellAt(sx, sy);
    if (!c) return;
    const r = app.world.room, mat = this.tool.mat;
    const rows = r.cells ? r.cells.slice() : Array.from({ length: r.h }, () => 'a'.repeat(r.w));
    const ch = mat < 0 ? '.' : String.fromCharCode(97 + mat);
    if (rows[c.cy][c.cx] === ch) return;
    if (mat < 0) {
      // 不让挖掉压着家具的格子
      const blocked = app.world.objects.some((o) => { if (o.wall) return false; const f = app.world.footprint(o); return f && c.cx >= f.x0 && c.cx < f.x1 && c.cy >= f.y0 && c.cy < f.y1; });
      if (blocked) { if (first) app.hud.toast('格子上有家具，先挪开'); return; }
    }
    rows[c.cy] = rows[c.cy].slice(0, c.cx) + ch + rows[c.cy].slice(c.cx + 1);
    this.exec({ t: 'room', patch: { cells: rows } });
  }

  /* ───────── 编辑层绘制（世界坐标） ───────── */

  _overlay(ctx, t) {
    const app = this.app, iso = app.iso, world = app.world;
    const diamond = (x0, y0, x1, y1, fill, stroke) => {
      const pts = iso.diamond(x0, y0, x1, y1, 1);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    // 选中：占地 + 交互位
    const so = this.sel && world.byId.get(this.sel);
    if (so && !so.wall && !(this.drag && this.drag.moved)) {
      const f = world.footprint(so);
      diamond(f.x0, f.y0, f.x1, f.y1, 'rgba(90,160,255,.16)', 'rgba(90,160,255,.9)');
      const def = world.def(so);
      for (const s of def.slots) {
        const sp = world.slotPose(so, s), p = iso.toWorld(sp.x, sp.y, 1);
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = 'rgba(77,124,243,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const q = iso.toWorld(sp.x + sp.face[0] * 0.35, sp.y + sp.face[1] * 0.35, 1);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    // 幽灵
    const g = this.ghost;
    if (g) {
      const def = world.catalog.get(g.defId);
      const okFill = g.ok ? 'rgba(80,200,120,.28)' : 'rgba(240,80,80,.30)', okLine = g.ok ? 'rgba(60,170,100,.95)' : 'rgba(220,60,60,.95)';
      if (g.wall) {
        const fr = wallItemFrame(iso, g.wall, g.at, def.wsize[0], g.z, def.wsize[1]);
        ctx.save(); ctx.globalAlpha = 0.75;
        paintWallItem(ctx, fr, def, g.obj || { state: def.states, at: g.at }, paletteOf(def, g.obj), app.env, t, g.wall);
        ctx.restore();
        const q = wallItemQuad(fr);
        ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.fillStyle = okFill; ctx.fill(); ctx.strokeStyle = okLine; ctx.lineWidth = 2; ctx.stroke();
      } else {
        const or = orient(def.size, g.rot, def.rotMode);
        diamond(g.x, g.y, g.x + or.w, g.y + or.h, okFill, okLine);
        const obj = Object.assign({}, g.obj || { state: def.states }, { x: g.x, y: g.y, rot: g.rot });
        const fp = { x0: g.x, y0: g.y, x1: g.x + or.w, y1: g.y + or.h, w: or.w, h: or.h, o: or };
        ctx.save(); ctx.globalAlpha = g.ok ? 0.85 : 0.55;
        paintObject(ctx, iso, def, obj, fp, app.env, t, app.renderer.sprites);
        ctx.restore();
      }
    }
    // 涂刷：悬停格
    if (this.tool && this.tool.kind === 'paint' && this._hoverCell) {
      const c = this._hoverCell;
      diamond(c.cx, c.cy, c.cx + 1, c.cy + 1, this.tool.mat < 0 ? 'rgba(240,80,80,.3)' : 'rgba(80,200,120,.3)', 'rgba(255,255,255,.9)');
    }
    // 拖角色
    if (this.drag && this.drag.agent && this.drag.at) {
      const p = iso.toWorld(this.drag.at.x, this.drag.at.y, 1);
      ctx.strokeStyle = 'rgba(77,124,243,.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 9, 0, 0, Math.PI * 2); ctx.stroke();
    }
    this._placeSelBar();
  }

  /* ───────── 面板 ───────── */

  _build() {
    this._built = true;
    const root = this.app.root;
    root.insertAdjacentHTML('beforeend', `
      <div class="rk-panel">
        <div class="rk-tabs">
          <button data-tab="furn" class="on">家具</button><button data-tab="wall">墙饰</button>
          <button data-tab="room">房间</button><button data-tab="agents">角色</button>
          <button data-tab="scenes">场景</button><button data-tab="packs">素材</button>
        </div>
        <div class="rk-pane on" data-pane="furn"><div class="rk-chips"></div><div class="rk-grid"></div>
          <div class="rk-hint">点一件 → 在地面点击放下（可连放）· R 旋转 · Esc 结束<br>点已摆的家具：拖动 / R / Ctrl+D 复制 / Del 删除 / 方向键微调</div></div>
        <div class="rk-pane" data-pane="wall"><div class="rk-grid"></div>
          <div class="rk-hint">挂在左墙或右墙上；拖动可沿墙移动、上下调高度，拖过墙角会换到另一面墙。</div></div>
        <div class="rk-pane" data-pane="room"></div>
        <div class="rk-pane" data-pane="agents"></div>
        <div class="rk-pane" data-pane="scenes"></div>
        <div class="rk-pane" data-pane="packs"></div>
      </div>
      <div class="rk-ebar">
        <button class="rk-btn" data-e="undo" title="撤销 Ctrl+Z">↶ 撤销</button>
        <button class="rk-btn" data-e="redo" title="重做 Ctrl+Shift+Z">↷ 重做</button>
        <button class="rk-btn" data-e="export">导出</button>
        <button class="rk-btn" data-e="import">导入</button>
        <button class="rk-btn" data-e="reset">恢复默认</button>
        <button class="rk-btn on" data-e="done">✓ 完成</button>
      </div>
      <div class="rk-sel">
        <button data-s="rotate" title="旋转 R">⟳ 旋转</button><button data-s="dup" title="复制 Ctrl+D">⧉</button>
        <button data-s="color" title="换色">🎨</button><button data-s="state" title="开关">💡</button>
        <button data-s="del" title="删除 Del">🗑</button>
      </div>
      <input type="color" class="rk-color" style="position:absolute;left:-9999px;width:1px;height:1px">
      <input type="file" class="rk-file" accept=".json,application/json" style="display:none">`);
    const $ = (s) => root.querySelector(s);
    this.el = {
      panel: $('.rk-panel'), chips: $('[data-pane=furn] .rk-chips'), grid: $('[data-pane=furn] .rk-grid'),
      wallGrid: $('[data-pane=wall] .rk-grid'), room: $('[data-pane=room]'), agents: $('[data-pane=agents]'),
      scenes: $('[data-pane=scenes]'), packs: $('[data-pane=packs]'),
      ebar: $('.rk-ebar'), sel: $('.rk-sel'), color: $('.rk-color'), file: $('.rk-file'),
    };
    this.el.panel.addEventListener('click', (e) => this._onPanelClick(e));
    this.el.panel.addEventListener('change', (e) => this._onPanelChange(e));
    this.el.panel.addEventListener('input', (e) => this._onPanelInput(e));
    this.el.ebar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-e]');
      if (!b) return;
      const a = b.getAttribute('data-e');
      if (a === 'undo') this.doUndo();
      else if (a === 'redo') this.doRedo();
      else if (a === 'export') this.app.exportScene();
      else if (a === 'import') this.el.file.click();
      else if (a === 'reset') { if (confirm('恢复成默认房间？当前布置会被替换（可撤销）。')) this.app.resetScene(); }
      else if (a === 'done') this.app.setMode('play');
    });
    this.el.sel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      const a = b.getAttribute('data-s');
      if (a === 'rotate') this.rotate();
      else if (a === 'dup') this.duplicate();
      else if (a === 'color') this.recolor();
      else if (a === 'state') this.toggleState();
      else if (a === 'del') this.remove();
    });
    this.el.file.addEventListener('change', () => {
      const f = this.el.file.files && this.el.file.files[0];
      if (!f) return;
      f.text().then((txt) => this.app.importScene(txt)).finally(() => { this.el.file.value = ''; });
    });
  }

  refresh() {
    if (!this._built) return;
    this._renderCatalog();
    this._renderRoomPane();
    this._renderAgents();
    if (this.tab === 'scenes') renderScenesPane(this, this.el.scenes);
    if (this.tab === 'packs') renderPacksPane(this, this.el.packs);
    this._renderSelBar();
  }

  switchTab(tab) {
    if (!this._built) return;
    this.tab = tab;
    this.el.panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === tab));
    this.el.panel.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('on', p.getAttribute('data-pane') === tab));
    if (tab === 'scenes') renderScenesPane(this, this.el.scenes);
    if (tab === 'packs') renderPacksPane(this, this.el.packs);
  }

  _thumb(def) {
    if (def.art.kind === 'sprite') {
      const e = this.app.renderer.sprites.get(def.art.src);
      if (!(e.failed && def.art.parts)) return `<img src="${esc(this.app.renderer.sprites.url(def.art.src))}" alt="" loading="lazy">`;
    }
    return '<canvas data-thumb="' + esc(def.id) + '"></canvas>';
  }
  _fillThumbs(container) {
    container.querySelectorAll('canvas[data-thumb]').forEach((c) => {
      const def = this.app.world.catalog.get(c.getAttribute('data-thumb'));
      if (!def) return;
      const src = def.mount === 'wall' ? this._wallThumb(def) : procThumb(def, this.app.iso, 84);
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
    });
  }
  _wallThumb(def) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = 84;
    const c = document.createElement('canvas');
    c.width = c.height = size * dpr;
    const ctx = c.getContext('2d');
    const w = def.wsize[0] * this.app.iso.hw, h = def.wsize[1], k = Math.min((size - 12) / w, (size - 12) / h);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, ((size - w * k) / 2) * dpr, ((size - h * k) / 2) * dpr);
    const fr = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, w, h };
    paintWallItem(ctx, fr, def, { state: def.states, at: 0 }, paletteOf(def, null), { night: false, sky: ['#9cc8f0', '#e6f3ff'], weather: 'clear' }, 0, 'left');
    return c;
  }

  _renderCatalog() {
    const cat = this.app.world.catalog;
    const floorDefs = cat.list((d) => d.mount !== 'wall' && !d.hidden);
    const cats = [...new Set(floorDefs.map((d) => d.cat))];
    if (this.cat && cats.indexOf(this.cat) < 0) this.cat = null;
    const key = cats.join(',') + '|' + this.cat + '|' + floorDefs.length;
    if (this._catKey !== key) {
      this._catKey = key;
      this.el.chips.innerHTML = `<button data-cat="" class="${this.cat ? '' : 'on'}">全部</button>` +
        cats.map((c) => `<button data-cat="${esc(c)}" class="${this.cat === c ? 'on' : ''}">${esc(CATEGORY_NAMES[c] || c)}</button>`).join('');
      this.el.grid.innerHTML = floorDefs.filter((d) => !this.cat || d.cat === this.cat).map((d) =>
        `<div class="rk-item" data-def="${esc(d.id)}" title="${esc(d.name + (d.sub ? ' · ' + d.sub : ''))}">${this._thumb(d)}<span>${esc(d.name)}</span></div>`).join('');
      this._fillThumbs(this.el.grid);
      const wallDefs = cat.list((d) => d.mount === 'wall' && !d.hidden);
      this.el.wallGrid.innerHTML = wallDefs.map((d) =>
        `<div class="rk-item" data-def="${esc(d.id)}" title="${esc(d.name)}"><canvas data-thumb="${esc(d.id)}"></canvas><span>${esc(d.name)}</span></div>`).join('');
      this._fillThumbs(this.el.wallGrid);
    }
    this._syncItems();
  }
  _syncItems() {
    if (!this._built) return;
    const id = this.tool && this.tool.kind === 'place' ? this.tool.defId : null;
    this.el.panel.querySelectorAll('.rk-item').forEach((it) => it.classList.toggle('on', it.getAttribute('data-def') === id));
  }

  _renderRoomPane() {
    const r = this.app.world.room, W = r.walls;
    const mats = r.mats.map((m, i) => `<button data-mat="${i}" class="${i === this.brushMat ? 'on' : ''}" style="border-left:12px solid ${esc(m.color)}">${esc((MAT_KINDS.find((k) => k[0] === m.kind) || ['', m.kind])[1])}</button>`).join('');
    const cur = r.mats[this.brushMat] || r.mats[0];
    const painting = this.tool && this.tool.kind === 'paint';
    this.el.room.innerHTML = `
      <div class="rk-field">尺寸（格）</div>
      <div class="rk-line">宽 <span class="rk-step"><button data-r="w-">−</button><b>${r.w}</b><button data-r="w+">＋</button></span>
        深 <span class="rk-step"><button data-r="h-">−</button><b>${r.h}</b><button data-r="h+">＋</button></span></div>
      <div class="rk-field">风格预设</div>
      <div class="rk-chips">${PRESETS.map((p, i) => `<button data-preset="${i}">${esc(p.name)}</button>`).join('')}</div>
      <div class="rk-field">地面材质（a/b/c/d 四个槽，用刷子混铺）</div>
      <div class="rk-chips">${mats}${r.mats.length < 4 ? '<button data-r="mat+">＋</button>' : ''}</div>
      <div class="rk-line">
        <select data-in="matKind">${MAT_KINDS.map((k) => `<option value="${k[0]}" ${cur.kind === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select>
        <input type="color" data-in="matColor" value="${esc(cur.color)}">
      </div>
      <div class="rk-chips" style="margin-top:6px">
        <button data-r="fill">整屋铺满</button>
        <button data-r="brush" class="${painting && this.tool.mat >= 0 ? 'on' : ''}">🖌 刷子</button>
        <button data-r="void" class="${painting && this.tool.mat < 0 ? 'on' : ''}">✂ 挖空</button>
      </div>
      <div class="rk-field">墙</div>
      <div class="rk-chips">
        <button data-r="wl" class="${W.left ? 'on' : ''}">左墙</button><button data-r="wr" class="${W.right ? 'on' : ''}">右墙</button>
        <button data-r="wains" class="${W.wainscot ? 'on' : ''}">护墙板</button>
        <button data-r="outdoor" class="${r.outdoor ? 'on' : ''}" title="下雨下雪会落在场景里">户外</button>
      </div>
      <div class="rk-line">墙高 <input type="range" min="120" max="340" step="10" data-in="wallH" value="${W.height}"></div>
      <div class="rk-line">墙面 <input type="color" data-in="wallC" value="${esc(W.color)}"> 护墙板 <input type="color" data-in="wainC" value="${esc(W.wainscot || '#8fb0c9')}"> 线脚 <input type="color" data-in="trimC" value="${esc(W.trim)}"></div>
      <div class="rk-line" style="margin-top:6px">墙纸 <select data-in="pattern">${PATTERNS.map((p) => `<option value="${p[0]}" ${W.pattern === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
      <div class="rk-field">地台厚度</div>
      <div class="rk-line"><input type="range" min="0" max="40" step="2" data-in="slab" value="${r.slab || 0}"></div>`;
  }
  _syncRoomPane() { if (this._built) this._renderRoomPane(); }

  _renderAgents() {
    const sc = this.app.world.scene;
    const chars = [...this.app.characters.values()];
    const appearances = roleLooks(this.app);
    this.el.agents.innerHTML = sc.agents.map((a) => `
      <div class="rk-agent" data-agent="${esc(a.id)}">
        <i style="background:${esc((a.look && a.look.body) || '#5b8def')}" data-ag="color" title="换颜色"></i>
        <input value="${esc(a.name)}" data-ag="name">
        <select data-ag="hat">${HATS.map((h) => `<option value="${h[0]}" ${((a.look && a.look.hat) || '') === h[0] ? 'selected' : ''}>${h[1]}</option>`).join('')}</select>
        <button data-ag="del" title="移除">×</button>
      </div>
      <div class="rk-line" style="margin:-2px 0 8px 22px">
        <select data-ag="brain" data-agent="${esc(a.id)}">${BRAINS.map((b) => `<option value="${b[0]}" ${a.brain === b[0] ? 'selected' : ''}>${b[1]}</option>`).join('')}</select>
        <select data-ag="char" data-agent="${esc(a.id)}" title="角色卡：决定台词与喜好"><option value="">（无角色卡）</option>${chars.map((c) => `<option value="${esc(c.id)}" ${a.character === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>`).join('') +
      `${appearances.length ? `<label class="rk-line">新角色外观
        <select data-new-role-look>${appearances.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>
      </label>` : ''}
       <button class="rk-btn" data-ag="add" style="width:100%">＋ 添加角色</button>
       <div class="rk-hint">「宠物」模式的角色会跟随 DSH 工作状态（思考/干活/等待/完成/出错）；「自主生活」会自己找家具、找同伴聊天。角色卡决定台词和喜好，可在「素材」页导入 SillyTavern 角色卡。拖动场景里的角色可以挪位置。</div>`;
  }

  _onPanelClick(e) {
    const app = this.app, world = app.world;
    const tab = e.target.closest('[data-tab]');
    if (tab) { this.switchTab(tab.getAttribute('data-tab')); return; }
    if (this.tab === 'scenes' && e.target.closest('[data-pane=scenes]')) { onScenesClick(this, e); return; }
    if (this.tab === 'packs' && e.target.closest('[data-pane=packs]')) { onPacksClick(this, e); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { this.cat = c.getAttribute('data-cat') || null; this._catKey = null; this._renderCatalog(); return; }
    const it = e.target.closest('.rk-item');
    if (it) { this.startPlace(it.getAttribute('data-def')); return; }
    const pr = e.target.closest('[data-preset]');
    if (pr) {
      const p = PRESETS[+pr.getAttribute('data-preset')];
      const mats = world.room.mats.slice();
      mats[0] = Object.assign({}, p.mat);
      this.exec({ t: 'room', patch: { walls: Object.assign({}, world.room.walls, p.walls), mats } });
      return;
    }
    const m = e.target.closest('[data-mat]');
    if (m) { this.brushMat = +m.getAttribute('data-mat'); if (this.tool && this.tool.kind === 'paint' && this.tool.mat >= 0) this.tool.mat = this.brushMat; this._renderRoomPane(); return; }
    const rb = e.target.closest('[data-r]');
    if (rb) { this._roomAction(rb.getAttribute('data-r')); return; }
    const ag = e.target.closest('[data-ag]');
    if (ag && e.type === 'click') {
      const kind = ag.getAttribute('data-ag');
      const row = ag.closest('[data-agent]'), id = row && row.getAttribute('data-agent');
      const a = id && world.scene.agents.find((x) => x.id === id);
      if (kind === 'add') {
        const used = new Set(world.scene.agents.map((x) => x.name));
        const name = AGENT_NAMES.find((n) => !used.has(n)) || '小鲸鱼' + (world.scene.agents.length + 1);
        const spot = app.nav.nearestFree(world.room.w / 2, world.room.h / 2, 6) || { x: 1, y: 1 };
        const choice = this.el.agents.querySelector('[data-new-role-look]')?.value;
        const preset = roleLooks(app).find(([id]) => id === choice);
        const look = preset?.[3] || { ...pick(WHALE_LOOKS), hat: Math.random() < 0.3 ? pick(['bow', 'cap']) : '' };
        this.exec({ t: 'agent.add', agent: { id: uid('a'), name, kind: preset?.[2] || 'girl', brain: 'auto', x: spot.x, y: spot.y, look } });
        app.sfx('place');
      } else if (kind === 'del' && a) {
        this.exec({ t: 'agent.remove', id: a.id });
      } else if (kind === 'color' && a) {
        const i = WHALE_LOOKS.findIndex((l) => l.body === (a.look && a.look.body));
        const next = WHALE_LOOKS[(i + 1) % WHALE_LOOKS.length];
        this.exec({ t: 'agent.set', id: a.id, patch: { look: Object.assign({}, a.look, next) } });
      }
    }
  }

  _onPanelChange(e) {
    const app = this.app, world = app.world, t = e.target;
    if (this.tab === 'scenes' && onScenesChange(this, e)) return;
    const ag = t.getAttribute('data-ag');
    if (ag) {
      const id = t.getAttribute('data-agent') || (t.closest('[data-agent]') && t.closest('[data-agent]').getAttribute('data-agent'));
      const a = world.scene.agents.find((x) => x.id === id);
      if (!a) return;
      if (ag === 'name') this.exec({ t: 'agent.set', id, patch: { name: t.value.trim().slice(0, 16) || a.name } });
      else if (ag === 'hat') this.exec({ t: 'agent.set', id, patch: { look: Object.assign({}, a.look, { hat: t.value }) } });
      else if (ag === 'brain') this.exec({ t: 'agent.set', id, patch: { brain: t.value } });
      else if (ag === 'char') this.exec({ t: 'agent.set', id, patch: { character: t.value || undefined } });
      return;
    }
    const k = t.getAttribute('data-in');
    if (!k) return;
    const r = world.room;
    const commit = (patch) => {
      const before = {};
      for (const key in patch) before[key] = clone(this._liveBefore && key in this._liveBefore ? this._liveBefore[key] : r[key]);
      this._liveBefore = null;
      if (this.exec({ t: 'room', patch })) this.undo[this.undo.length - 1].inv = { t: 'room', patch: before };
    };
    const mats = r.mats.map((m) => Object.assign({}, m));
    switch (k) {
      case 'matKind': mats[this.brushMat].kind = t.value; commit({ mats }); break;
      case 'matColor': mats[this.brushMat].color = t.value; commit({ mats }); break;
      case 'wallH': case 'wallC': case 'wainC': case 'trimC': case 'pattern': commit({ walls: this._wallsFrom(k, t.value) }); break;
      case 'slab': commit({ slab: +t.value }); break;
    }
  }
  /** 拖滑块/取色时实时预览（不进撤销栈，change 时一次性记录） */
  _onPanelInput(e) {
    const t = e.target, k = t.getAttribute('data-in');
    if (!k || t.tagName === 'SELECT') return;
    const world = this.app.world, r = world.room;
    if (!this._liveBefore) this._liveBefore = { walls: clone(r.walls), mats: clone(r.mats), slab: r.slab };
    if (k === 'matColor') { const mats = r.mats.map((m) => Object.assign({}, m)); mats[this.brushMat].color = t.value; world.apply({ t: 'room', patch: { mats } }, { silent: true }); }
    else if (k === 'slab') world.apply({ t: 'room', patch: { slab: +t.value } }, { silent: true });
    else if (k === 'wallH' || k === 'wallC' || k === 'wainC' || k === 'trimC') world.apply({ t: 'room', patch: { walls: this._wallsFrom(k, t.value) } }, { silent: true });
  }
  _wallsFrom(k, v) {
    const W = Object.assign({}, this.app.world.room.walls);
    if (k === 'wallH') W.height = +v;
    if (k === 'wallC') W.color = v;
    if (k === 'wainC') W.wainscot = v;
    if (k === 'trimC') W.trim = v;
    if (k === 'pattern') W.pattern = v;
    return W;
  }

  _roomAction(a) {
    const app = this.app, world = app.world, r = world.room;
    if (a === 'w-' || a === 'w+' || a === 'h-' || a === 'h+') {
      const w = clamp(r.w + (a === 'w+' ? 1 : a === 'w-' ? -1 : 0), 2, 20);
      const h = clamp(r.h + (a === 'h+' ? 1 : a === 'h-' ? -1 : 0), 2, 20);
      if (w === r.w && h === r.h) return;
      const ops = [];
      for (const o of world.objects) {
        if (o.wall) {
          const def = world.def(o), len = o.wall === 'left' ? h : w;
          if (def && o.at + def.wsize[0] / 2 > len) ops.push({ t: 'remove', id: o.id });
        } else {
          const f = world.footprint(o);
          if (f && (f.x1 > w || f.y1 > h)) ops.push({ t: 'remove', id: o.id });
        }
      }
      if (ops.length && !confirm(`缩小后有 ${ops.length} 件家具放不下，会被移走（可撤销）。继续？`)) return;
      ops.push({ t: 'room', patch: { w, h, cells: resizeCells(r, w, h) } });
      this.exec({ t: 'batch', ops });
      for (const ag of app.agents.values()) { if (!app.nav.freeAt(ag.x, ag.y)) { const p = app.nav.nearestFree(ag.x, ag.y); if (p) { ag.cancel(); ag.x = p.x; ag.y = p.y; } } }
      app.renderer.fit(false);
      return;
    }
    if (a === 'mat+') { this.exec({ t: 'room', patch: { mats: r.mats.concat([{ kind: 'tile', color: '#e8e1d4' }]) } }); this.brushMat = r.mats.length - 1; this._renderRoomPane(); return; }
    if (a === 'fill') {
      const ch = String.fromCharCode(97 + this.brushMat);
      const rows = Array.from({ length: r.h }, (_, y) => Array.from({ length: r.w }, (_, x) => (r.cells && r.cells[y] && r.cells[y][x] === '.' ? '.' : ch)).join(''));
      this.exec({ t: 'room', patch: { cells: this.brushMat === 0 && rows.every((row) => !row.includes('.')) ? null : rows } });
      return;
    }
    if (a === 'brush') { if (this.tool && this.tool.kind === 'paint' && this.tool.mat >= 0) this.cancelTool(); else this.startPaint(this.brushMat); return; }
    if (a === 'void') { if (this.tool && this.tool.kind === 'paint' && this.tool.mat < 0) this.cancelTool(); else this.startPaint(-1); return; }
    if (a === 'wl' || a === 'wr') {
      const W = Object.assign({}, r.walls);
      if (a === 'wl') W.left = !W.left; else W.right = !W.right;
      const ops = world.objects.filter((o) => o.wall === (a === 'wl' ? 'left' : 'right') && !W[o.wall]).map((o) => ({ t: 'remove', id: o.id }));
      if (ops.length && !confirm(`这面墙上有 ${ops.length} 件墙饰，会一起移走（可撤销）。继续？`)) return;
      ops.push({ t: 'room', patch: { walls: W } });
      this.exec({ t: 'batch', ops });
      return;
    }
    if (a === 'outdoor') this.exec({ t: 'room', patch: { outdoor: !r.outdoor } });
    if (a === 'wains') this.exec({ t: 'room', patch: { walls: Object.assign({}, r.walls, { wainscot: r.walls.wainscot ? null : '#8fb0c9' }) } });
  }

  /* ───────── 选中物浮动条 ───────── */

  _renderSelBar() {
    if (!this._built) return;
    const o = this.sel && this.app.world.byId.get(this.sel);
    this.el.sel.classList.toggle('on', !!o);
    if (!o) return;
    const def = this.app.world.def(o);
    this.el.sel.querySelector('[data-s=rotate]').style.display = !o.wall && def.rots > 1 ? '' : 'none';
    this.el.sel.querySelector('[data-s=state]').style.display = Object.values(def.states).some((v) => typeof v === 'boolean') ? '' : 'none';
    this._placeSelBar();
  }
  _placeSelBar() {
    if (!this._built || !this.sel || (this.drag && this.drag.moved)) { if (this._built && this.drag && this.drag.moved) this.el.sel.classList.remove('on'); return; }
    const p = this.app.renderer.anchorOf({ id: this.sel });
    if (!p) return;
    this.el.sel.classList.add('on');
    this.el.sel.style.left = clamp(p.x, 90, this.app.renderer.vw - 90) + 'px';
    this.el.sel.style.top = Math.max(44, p.y - 10) + 'px';
  }
}

export { rgba };
