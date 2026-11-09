/**
 * RoomKit · 场景数据模型（World）。
 *
 * 场景是纯 JSON（format 'roomkit.scene' v1，见 docs/03 §3.2）；一切编辑都走 apply(op)，
 * 每个 op 返回它的逆 op —— 撤销/重做、自动保存、多端同步都建立在这一个入口上：
 *   { t:'add', obj } / { t:'remove', id } / { t:'set', id, patch } / { t:'state', id, patch }
 *   { t:'room', patch } / { t:'agent.add', agent } / { t:'agent.remove', id } / { t:'agent.set', id, patch }
 *   { t:'batch', ops:[...] }
 */
import { Emitter, clone, uid, clamp } from './util.js';
import { orient } from './iso.js';

export const ROOM_DEFAULTS = {
  w: 8, h: 6,
  cells: null,                                         // ['aaaa..', ...]：每格材质槽 a..z，'.' = 空
  mats: [{ kind: 'wood', color: '#e3a46a' }],
  walls: { left: true, right: true, height: 230, color: '#f6ead6', wainscot: '#8fb0c9', trim: '#ffffff', pattern: 'plain' },
  slab: 16,
};

export function normalizeObj(o) {
  const n = Object.assign({ rot: 0, state: {} }, clone(o));
  n.id = n.id || uid('o');
  if (n.wall) { n.at = +n.at || 0.5; n.z = n.z != null ? +n.z : null; delete n.x; delete n.y; }
  else { n.x = n.x | 0; n.y = n.y | 0; }
  return n;
}

export function normalizeAgent(a, room) {
  return Object.assign({
    id: uid('a'), name: '角色', kind: 'girl', brain: 'auto', look: {},
    x: room ? room.w / 2 : 2, y: room ? room.h / 2 : 2,
  }, clone(a));
}

export function normalizeScene(raw) {
  const src = raw || {};
  const s = clone(src);
  s.format = 'roomkit.scene';
  // v1（2026-11-04 那版）里角色只有 kind:'whale' 一种，指的就是旧版主角：升到 v2 时统一改成 'girl'，
  // 不然旧存档打开全是圆滚滚的小鲸鱼。v2 起 'whale' 才表示真的小鲸鱼宠物。
  if (!(src.v >= 2)) (s.agents || []).forEach((a) => { if (!a.kind || a.kind === 'whale') a.kind = 'girl'; });
  s.v = 2;
  s.id = s.id || uid('scene');
  s.name = s.name || '房间';
  const room = Object.assign(clone(ROOM_DEFAULTS), s.room || {});
  room.walls = Object.assign({}, ROOM_DEFAULTS.walls, (src.room && src.room.walls) || {});
  room.mats = room.mats && room.mats.length ? room.mats : clone(ROOM_DEFAULTS.mats);
  room.w = clamp(room.w | 0, 1, 40);
  room.h = clamp(room.h | 0, 1, 40);
  s.room = room;
  s.objects = (s.objects || []).map(normalizeObj);
  s.agents = (s.agents || []).map((a) => normalizeAgent(a, room));
  s.env = Object.assign({ period: null, weather: 'clear' }, s.env || {});
  return s;
}

/** 改房间尺寸时保留重叠区域的格子材质，新长出来的格子用材质 a */
export function resizeCells(room, w, h) {
  if (!room.cells) return null;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += (room.cells[y] && room.cells[y][x]) || 'a';
    rows.push(row);
  }
  return rows;
}

export class World extends Emitter {
  constructor(catalog, scene) {
    super();
    this.catalog = catalog;
    this.version = 0;
    this.layoutVersion = 0;              // 只有摆位/房间变了才加：寻路网格、静态画面层跟它走（开灯、换天气不重建）
    this.occ = new Map();                // 交互位占用：'objId:slotId' → agentId
    this.load(scene);
  }

  load(raw) {
    this.scene = normalizeScene(raw);
    this.byId = new Map(this.scene.objects.map((o) => [o.id, o]));
    this.occ.clear();
    this._decode();
    this.version++;
    this.layoutVersion++;
    this.emit('load', this.scene);
  }

  /** 存档用：临时角色（ephemeral，如 DSH 会话映射出来的同伴）不进存档 */
  toJSON() {
    const s = clone(this.scene);
    s.agents = s.agents.filter((a) => !a.ephemeral);
    return s;
  }

  get room() { return this.scene.room; }
  get objects() { return this.scene.objects; }

  _decode() {
    const r = this.room;
    this.grid = new Int8Array(r.w * r.h);
    if (!r.cells) return;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const ch = r.cells[y] && r.cells[y][x];
        this.grid[y * r.w + x] = !ch ? 0 : ch === '.' ? -1 : clamp(ch.charCodeAt(0) - 97, 0, r.mats.length - 1);
      }
    }
  }

  /** 格子材质槽；越界或镂空 = −1 */
  cell(x, y) {
    const r = this.room;
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
    return this.grid[y * r.w + x];
  }
  isFloor(x, y) { return this.cell(x, y) >= 0; }

  def(o) { return o ? this.catalog.get(o.def) : null; }

  footprint(o, def) {
    def = def || this.def(o);
    if (!def || def.mount === 'wall') return null;
    const or = orient(def.size, o.rot || 0, def.rotMode);
    return { x0: o.x, y0: o.y, x1: o.x + or.w, y1: o.y + or.h, w: or.w, h: or.h, o: or };
  }

  canPlace(defId, x, y, rot, ignoreId) {
    const def = this.catalog.get(defId);
    if (!def) return { ok: false, reason: '未知家具' };
    if (def.mount === 'wall') return { ok: false, reason: '墙面物件要挂在墙上' };
    const or = orient(def.size, rot || 0, def.rotMode);
    for (let yy = y; yy < y + or.h; yy++) {
      for (let xx = x; xx < x + or.w; xx++) if (!this.isFloor(xx, yy)) return { ok: false, reason: '超出地面' };
    }
    if (def.mount === 'flat') return { ok: true };
    for (const o of this.objects) {
      if (o.id === ignoreId || o.wall) continue;
      const d2 = this.def(o);
      if (!d2 || d2.mount !== 'floor') continue;
      const f = this.footprint(o, d2);
      if (x < f.x1 && x + or.w > f.x0 && y < f.y1 && y + or.h > f.y0) return { ok: false, reason: '和「' + d2.name + '」重叠', with: o.id };
    }
    return { ok: true };
  }

  hasWall(side) { return !!this.room.walls[side]; }
  /** 墙长（格）：左墙沿 y，右墙沿 x */
  wallLen(side) { return side === 'left' ? this.room.h : this.room.w; }

  canPlaceWall(defId, side, at, z, ignoreId) {
    const def = this.catalog.get(defId);
    if (!def || def.mount !== 'wall') return { ok: false, reason: '不是墙面物件' };
    if (!this.hasWall(side)) return { ok: false, reason: '这一侧没有墙' };
    const [ww, wh] = def.wsize;
    const a0 = at - ww / 2, a1 = at + ww / 2;
    if (a0 < -0.001 || a1 > this.wallLen(side) + 0.001) return { ok: false, reason: '超出墙面' };
    if (z < -0.5 || z + wh > this.room.walls.height + 0.5) return { ok: false, reason: '超出墙高' };
    for (const o of this.objects) {
      if (o.id === ignoreId || o.wall !== side) continue;
      const d2 = this.def(o);
      if (!d2) continue;
      const b0 = o.at - d2.wsize[0] / 2, b1 = o.at + d2.wsize[0] / 2;
      const z0 = this.wallZ(o, d2), z1 = z0 + d2.wsize[1];
      if (a0 < b1 - 0.01 && a1 > b0 + 0.01 && z < z1 && z + wh > z0) return { ok: false, reason: '和「' + d2.name + '」重叠', with: o.id };
    }
    return { ok: true };
  }
  wallZ(o, def) { def = def || this.def(o); return o.z != null ? o.z : def ? def.wz : 60; }

  /* ───────── 交互位 ───────── */

  /** 交互位的世界位置（格坐标）、朝向与靠近点 */
  slotPose(o, slot) {
    const def = this.def(o);
    const f = this.footprint(o, def);
    if (!f) return null;
    const [lx, ly] = f.o.map(slot.at[0], slot.at[1]);
    const [fx, fy] = f.o.dir(slot.face[0], slot.face[1]);
    let approach = null;
    if (slot.approach) { const [ax, ay] = f.o.map(slot.approach[0], slot.approach[1]); approach = { x: o.x + ax, y: o.y + ay }; }
    return { x: o.x + lx, y: o.y + ly, face: [fx, fy], z: slot.z || 0, approach, layer: slot.layer };
  }
  slotKey(o, slot) { return o.id + ':' + slot.id; }
  /** 交互位能不能用：在占格外的交互位（站在家具前面用的）本身得是空地 */
  slotUsable(o, slot, nav) {
    const sp = this.slotPose(o, slot), f = this.footprint(o);
    if (!sp || !f) return false;
    const inside = sp.x >= f.x0 && sp.x <= f.x1 && sp.y >= f.y0 && sp.y <= f.y1;
    return inside || nav.freeAt(sp.x, sp.y);
  }
  occupant(o, slot) { return this.occ.get(this.slotKey(o, slot)) || null; }
  reserve(o, slot, agentId) {
    const k = this.slotKey(o, slot), cur = this.occ.get(k);
    if (cur && cur !== agentId) return false;
    this.occ.set(k, agentId);
    return true;
  }
  release(o, slot, agentId) {
    const k = this.slotKey(o, slot);
    if (this.occ.get(k) === agentId) this.occ.delete(k);
  }
  releaseAll(agentId) { for (const [k, v] of this.occ) if (v === agentId) this.occ.delete(k); }

  /** 当前点亮的光源（格坐标 + 像素高度） */
  lights() {
    const out = [];
    for (const o of this.objects) {
      const def = this.def(o);
      if (!def || !def.light || o.wall) continue;
      const L = def.light;
      if (L.when && !(o.state && (L.when[0] === '!' ? !o.state[L.when.slice(1)] : o.state[L.when]))) continue;
      const f = this.footprint(o, def);
      const at = L.at || [def.size[0] / 2, def.size[1] / 2];
      const [lx, ly] = f.o.map(at[0], at[1]);
      out.push({ x: o.x + lx, y: o.y + ly, z: L.z || 60, radius: L.radius || 3, color: L.color || '#ffd59a', power: L.power || 1, id: o.id });
    }
    return out;
  }

  /* ───────── 编辑：唯一入口 ───────── */

  apply(op, opts) {
    if (this.allowApply && !this.allowApply()) return null;
    const silent = opts && opts.silent;
    let inv = null;
    const sc = this.scene;
    switch (op.t) {
      case 'add': {
        const o = normalizeObj(op.obj);
        if (this.byId.has(o.id)) o.id = uid('o');
        const i = op.index != null ? clamp(op.index, 0, sc.objects.length) : sc.objects.length;
        sc.objects.splice(i, 0, o);
        this.byId.set(o.id, o);
        inv = { t: 'remove', id: o.id };
        break;
      }
      case 'remove': {
        const i = sc.objects.findIndex((o) => o.id === op.id);
        if (i < 0) return null;
        const [o] = sc.objects.splice(i, 1);
        this.byId.delete(o.id);
        for (const [k] of this.occ) if (k.indexOf(o.id + ':') === 0) this.occ.delete(k);
        inv = { t: 'add', obj: clone(o), index: i };
        break;
      }
      case 'set':
      case 'state': {
        const o = this.byId.get(op.id);
        if (!o) return null;
        const target = op.t === 'state' ? (o.state = o.state || {}) : o;
        const old = {};
        for (const k in op.patch) old[k] = clone(target[k]);
        for (const k in op.patch) {
          if (op.patch[k] === undefined || (op.patch[k] === null && k !== 'z')) delete target[k];
          else target[k] = clone(op.patch[k]);
        }
        inv = { t: op.t, id: op.id, patch: old };
        break;
      }
      case 'room': {
        const r = this.room;
        const old = {};
        for (const k in op.patch) old[k] = clone(r[k]);
        Object.assign(r, clone(op.patch));
        if ('w' in op.patch || 'h' in op.patch || 'cells' in op.patch || 'mats' in op.patch) this._decode();
        inv = { t: 'room', patch: old };
        break;
      }
      case 'agent.add': {
        const a = normalizeAgent(op.agent, this.room);
        sc.agents.push(a);
        inv = { t: 'agent.remove', id: a.id };
        break;
      }
      case 'agent.remove': {
        const i = sc.agents.findIndex((a) => a.id === op.id);
        if (i < 0) return null;
        const [a] = sc.agents.splice(i, 1);
        this.releaseAll(a.id);
        inv = { t: 'agent.add', agent: clone(a) };
        break;
      }
      case 'agent.set': {
        const a = sc.agents.find((x) => x.id === op.id);
        if (!a) return null;
        const old = {};
        for (const k in op.patch) old[k] = clone(a[k]);
        for (const k in op.patch) { if (op.patch[k] === undefined) delete a[k]; else a[k] = clone(op.patch[k]); }
        inv = { t: 'agent.set', id: op.id, patch: old };
        break;
      }
      case 'env': {
        const old = {};
        for (const k in op.patch) old[k] = sc.env[k];
        Object.assign(sc.env, op.patch);
        inv = { t: 'env', patch: old };
        break;
      }
      case 'meta': {
        // 场景元信息：名字、简介、自带剧情（stories）等
        const old = {};
        for (const k of Object.keys(op.patch).filter((x) => ['name', 'description', 'stories', 'template', 'author'].indexOf(x) >= 0)) {
          old[k] = clone(sc[k]);
          if (op.patch[k] === undefined) delete sc[k]; else sc[k] = clone(op.patch[k]);
        }
        inv = { t: 'meta', patch: old };
        break;
      }
      case 'batch': {
        const invs = [];
        for (const sub of op.ops || []) { const i = this.apply(sub, { silent: true }); if (i) invs.push(i); }
        inv = { t: 'batch', ops: invs.reverse() };
        break;
      }
      default:
        console.warn('[roomkit] 未知编辑操作:', op.t);
        return null;
    }
    this.version++;
    if (op.t === 'add' || op.t === 'remove' || op.t === 'set' || op.t === 'room') this.layoutVersion++;
    if (!silent) this.emit('change', { op, inv });
    return inv;
  }
}
