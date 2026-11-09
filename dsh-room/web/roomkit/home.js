/**
 * RoomKit · 家：几个房间（场景）组成一个家，按楼层排开；门可以通往家里的另一个房间。
 *
 *   home = { v:1, name, floors:['2F','1F'], rooms:[{ id, name, floor, tpl:'包id|场景id' }], follow:true, seen:['包id|场景id'] }
 *
 * 存在 storage.pref('home')；内容包可以带一个默认的家（pack.home），没有就把包里的场景模板都算进来。
 * 房间就是普通场景（id 相同）：存过的读存档，没存过的按模板现生成，首次进入才写存档。
 * 门：门的 state.to = 目标房间 id。follow：带 follow 的角色（主角默认带）跟着你换房间。
 * seen：内容包默认的家里出现过的房间模板。包更新后多出来的房间（比如后来加的厨房、小院）自动搬进已有的家，
 *       只搬一次——用户自己移出家的房间不会再回来。
 */
import { clone } from './util.js';

const MAX_ROOMS = 24;
const FLOOR_RE = /^.{1,8}$/;

/** 从内容包推一个默认的家：用包里声明的 home，没有就把场景模板按顺序放进 1F */
export function defaultHome(packs) {
  const p = packs.find((x) => x.home && Array.isArray(x.home.rooms)) || null;
  if (p) {
    const h = p.home;
    return normalizeHome({
      name: h.name || p.name, floors: h.floors,
      rooms: h.rooms.map((r) => Object.assign({}, r, { tpl: r.tpl && r.tpl.indexOf('|') < 0 ? p.id + '|' + r.tpl : r.tpl })),
    });
  }
  const rooms = [];
  packs.forEach((pk) => (pk.scenes || []).forEach((s) => rooms.push({ id: s.id, name: s.name, floor: '1F', tpl: pk.id + '|' + s.id })));
  return normalizeHome({ name: '我的家', floors: ['1F'], rooms });
}

export function normalizeHome(raw) {
  const h = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const rooms = [];
  for (const r of Array.isArray(h.rooms) ? h.rooms : []) {
    if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    rooms.push({
      id: r.id, name: String(r.name || r.id).slice(0, 24),
      floor: FLOOR_RE.test(r.floor || '') ? r.floor : '1F',
      tpl: typeof r.tpl === 'string' ? r.tpl : undefined,
    });
    if (rooms.length >= MAX_ROOMS) break;
  }
  const floors = (Array.isArray(h.floors) ? h.floors : []).filter((f) => typeof f === 'string' && FLOOR_RE.test(f));
  for (const r of rooms) if (floors.indexOf(r.floor) < 0) floors.push(r.floor);
  const out = { v: 1, name: String(h.name || '我的家').slice(0, 24), floors, rooms, follow: h.follow !== false };
  if (Array.isArray(h.seen)) out.seen = h.seen.filter((t) => typeof t === 'string').slice(0, 200);
  return out;
}

/** 跟着你换房间的角色：写了 follow 的，或者主角（brain:'pet'，没写 follow:false） */
export const isFollower = (a) => !!a && !a.ephemeral && (a.follow === true || (a.brain === 'pet' && a.follow !== false));

/** 门在地面上的落脚点：右墙的门在 y=0 一侧，左墙的门在 x=0 一侧，往屋里退半格 */
export function doorSpot(nav, o, room) {
  const p = o.wall === 'left' ? { x: 0.5, y: o.at } : { x: o.at, y: 0.5 };
  return nav.nearestFree(p.x, p.y, 4) || nav.nearestFree(room.w / 2, room.h / 2, 12);
}

export class Home {
  constructor(app) {
    this.app = app;
    const saved = app.storage.pref('home');
    const def = defaultHome(app.packs);
    this.data = saved ? normalizeHome(saved) : this._claim(def);
    if (!saved) { this.data.seen = def.rooms.map((r) => r.tpl).filter(Boolean); this.save(); }
    else this._adopt(def);
  }

  /**
   * 包里新加的房间搬进已有的家。没有 seen 的老存档：把家里现有房间的模板当作"见过"，其余的都算新房间。
   * 已有房间（存过档的）里补上模板中通往新房间的门——位置被别的墙饰占了就不补。
   */
  _adopt(def) {
    const d = this.data, before = JSON.stringify(d);
    const seen = Array.isArray(d.seen) ? d.seen : d.rooms.map((r) => r.tpl).filter(Boolean);
    const added = [];
    for (const r of def.rooms) {
      if (!r.tpl || seen.indexOf(r.tpl) >= 0) continue;
      seen.push(r.tpl);
      if (this.has(r.id) || d.rooms.length >= MAX_ROOMS) continue;
      d.rooms.push({ id: r.id, name: r.name, floor: r.floor, tpl: r.tpl });
      if (d.floors.indexOf(r.floor) < 0) d.floors.push(r.floor);
      added.push(r.id);
    }
    d.seen = seen;
    if (JSON.stringify(d) !== before) this.save();
    if (added.length) for (const r of d.rooms) if (added.indexOf(r.id) < 0) this._addDoors(r, added);
  }

  _addDoors(room, targets) {
    const scene = this.app.storage.load(room.id), t = this.template(room);
    if (!scene || scene.id !== room.id || !t || !Array.isArray(scene.objects)) return;
    const cat = this.app.catalog;
    const span = (o) => {
      const df = cat.get(o.def);
      if (!df || !o.wall) return null;
      const z = o.z != null ? o.z : df.wz || 0;
      return { wall: o.wall, a0: o.at - df.wsize[0] / 2, a1: o.at + df.wsize[0] / 2, z0: z, z1: z + df.wsize[1], portal: !!df.portal };
    };
    const hits = (p, q) => p.wall === q.wall && p.a0 < q.a1 && q.a0 < p.a1 && p.z0 < q.z1 && q.z0 < p.z1;
    let changed = false;
    for (const o of t.objects || []) {
      const to = o.state && o.state.to, sp = span(o);
      if (!sp || !sp.portal || targets.indexOf(to) < 0) continue;
      const W = scene.room || {}, len = sp.wall === 'left' ? W.h : W.w;
      if (!W.walls || !W.walls[sp.wall] || sp.a0 < 0 || !(sp.a1 <= len)) continue;
      if (scene.objects.some((x) => x.id === o.id || (x.state && x.state.to === to))) continue;
      if (scene.objects.some((x) => { const q = span(x); return q && hits(sp, q); })) continue;
      scene.objects.push(clone(o));
      changed = true;
    }
    if (changed) this.app.storage.save(scene, { last: false });
  }

  /** 老存档迁移：家里还没存档的房间，认领以前从同一个模板建过的场景（最近改过的那个） */
  _claim(home) {
    const list = this.app.storage.list ? this.app.storage.list() : [];
    const used = new Set(home.rooms.map((r) => r.id));
    for (const r of home.rooms) {
      if (list.some((s) => s.id === r.id)) continue;
      const tplId = r.tpl ? r.tpl.split('|')[1] : null;
      if (!tplId) continue;
      for (const s of list) {
        if (used.has(s.id)) continue;
        const full = this.app.storage.load(s.id);
        if (full && full.template === tplId) { used.add(s.id); r.id = s.id; r.name = full.name || r.name; break; }
      }
    }
    return home;
  }

  save() { this.app.storage.pref('home', this.data); }
  get follow() { return this.data.follow !== false; }
  set follow(v) { this.data.follow = !!v; this.save(); }
  get name() { return this.data.name; }

  rooms() { return this.data.rooms; }
  room(id) { return this.data.rooms.find((r) => r.id === id) || null; }
  has(id) { return !!this.room(id); }
  /** 楼层（显示顺序：上 → 下），每层带自己的房间 */
  byFloor() {
    return this.data.floors.map((f) => ({ floor: f, rooms: this.data.rooms.filter((r) => r.floor === f) })).filter((g) => g.rooms.length);
  }
  /** 平铺顺序（楼层从上到下）：数字键 1–9 按它切换 */
  ordered() { return this.byFloor().reduce((out, g) => out.concat(g.rooms), []); }

  template(room) {
    if (!room || !room.tpl) return null;
    const [pid, sid] = room.tpl.split('|');
    const p = this.app.packs.find((x) => x.id === pid);
    return (p && (p.scenes || []).find((s) => s.id === sid)) || null;
  }
  /**
   * 老存档补齐：存档里的角色没写 follow 时，照模板里同一个角色的写法补上（模板中跟随主角的设定是后来加的）。
   * 原地修改并返回 scene。
   */
  prepare(scene) {
    if (!scene || !Array.isArray(scene.agents)) return scene;
    const room = this.room(scene.id);
    const t = this.template(room) || this._templateById(scene.template || scene.id);
    if (!t) return scene;
    for (const a of scene.agents) {
      if (a.follow !== undefined) continue;
      const ta = (t.agents || []).find((x) => x.id === a.id);
      if (ta && ta.follow !== undefined) a.follow = ta.follow;
    }
    return scene;
  }
  _templateById(id) {
    for (const p of this.app.packs) { const t = (p.scenes || []).find((s) => s.id === id); if (t) return t; }
    return null;
  }

  /** 房间此刻的场景 JSON：存档优先，没存过就按模板现生成（不写存档） */
  sceneFor(id) {
    const saved = this.app.storage.load(id);
    if (saved && saved.id === id) return this.prepare(saved);
    const room = this.room(id), t = this.template(room);
    if (!t) return null;
    const s = clone(t);
    s.template = t.id;
    s.id = room.id;
    s.name = room.name || s.name;
    return s;
  }

  add(scene, floor) {
    if (!scene || !scene.id || this.has(scene.id) || this.data.rooms.length >= MAX_ROOMS) return false;
    const f = FLOOR_RE.test(floor || '') ? floor : this.data.floors[this.data.floors.length - 1] || '1F';
    if (this.data.floors.indexOf(f) < 0) this.data.floors.push(f);
    this.data.rooms.push({ id: scene.id, name: String(scene.name || '房间').slice(0, 24), floor: f });
    this.save();
    return true;
  }
  remove(id) {
    const n = this.data.rooms.length;
    this.data.rooms = this.data.rooms.filter((r) => r.id !== id);
    if (this.data.rooms.length !== n) this.save();
  }
  rename(id, name) { const r = this.room(id); if (r && name) { r.name = String(name).slice(0, 24); this.save(); } }
  setFloor(id, floor) {
    const r = this.room(id);
    if (!r || !FLOOR_RE.test(floor || '')) return;
    r.floor = floor;
    if (this.data.floors.indexOf(floor) < 0) this.data.floors.push(floor);
    this.save();
  }

  /** 给目标房间配一扇通回来的门：已有通往 fromId 的门就用它，否则占用第一扇还没连的门 */
  linkBack(targetId, fromId) {
    if (!targetId || !fromId || targetId === fromId) return;
    const cur = this.app.world.scene;
    const s = cur.id === targetId ? null : this.sceneFor(targetId);
    const objs = s ? s.objects || [] : cur.objects;
    const def = (o) => this.app.catalog.get(o.def);
    const doors = objs.filter((o) => o.wall && def(o) && def(o).portal);
    if (doors.some((o) => o.state && o.state.to === fromId)) return;
    const free = doors.find((o) => !(o.state && o.state.to));
    if (!free) return;
    if (!s) { this.app.world.apply({ t: 'state', id: free.id, patch: { to: fromId } }); return; }
    free.state = Object.assign({}, free.state, { to: fromId });
    this.app.storage.save(s);
  }
}
