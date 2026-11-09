var RoomKit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // web/roomkit/index.js
  var index_exports = {};
  __export(index_exports, {
    Catalog: () => Catalog,
    DEFAULT_CHARACTERS: () => DEFAULT_CHARACTERS,
    Home: () => Home,
    Iso: () => Iso,
    Nav: () => Nav,
    OFFLINE_RULES: () => OFFLINE_RULES,
    PACK_LIMITS: () => LIMITS,
    PERIODS: () => PERIODS,
    PHRASES: () => PHRASES,
    PackStore: () => PackStore,
    ROOM_DEFAULTS: () => ROOM_DEFAULTS,
    VERSION: () => VERSION,
    WEATHERS: () => WEATHERS,
    WHALE_LOOKS: () => WHALE_LOOKS,
    World: () => World,
    defaultHome: () => defaultHome,
    envAt: () => envAt,
    exportPack: () => exportPack,
    localStore: () => localStore,
    mount: () => mount,
    normalizeCharacter: () => normalizeCharacter,
    normalizeDef: () => normalizeDef,
    normalizeHome: () => normalizeHome,
    normalizeScene: () => normalizeScene,
    normalizeStory: () => normalizeStory,
    orient: () => orient,
    paletteOf: () => paletteOf,
    parseActs: () => parseActs,
    readCharacterFile: () => readCharacterFile,
    validatePack: () => validatePack
  });

  // web/roomkit/iso.js
  var Iso = class {
    constructor(hw = 64, hh = 32) {
      this.hw = hw;
      this.hh = hh;
    }
    toWorld(x, y, z = 0) {
      return { x: (x - y) * this.hw, y: (x + y) * this.hh - z };
    }
    /** 世界像素 → 地面（z=0）格坐标 */
    toTile(wx, wy, z = 0) {
      const a = wx / this.hw, b = (wy + z) / this.hh;
      return { x: (a + b) / 2, y: (b - a) / 2 };
    }
    /** 立体盒的屏幕轮廓（六边形，世界像素）——命中测试与外发光都用它 */
    boxHull(x0, y0, x1, y1, z0, z1) {
      const P = (x, y, z) => {
        const p = this.toWorld(x, y, z);
        return [p.x, p.y];
      };
      return [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1)];
    }
    /** 立体盒的屏幕外接矩形 {l,t,r,b} */
    boxRect(x0, y0, x1, y1, z0, z1) {
      return {
        l: (x0 - y1) * this.hw,
        r: (x1 - y0) * this.hw,
        t: (x0 + y0) * this.hh - z1,
        b: (x1 + y1) * this.hh - z0
      };
    }
    /** 地面菱形（一格或一块占地），世界像素点列 */
    diamond(x0, y0, x1, y1, z = 0) {
      const P = (x, y) => {
        const p = this.toWorld(x, y, z);
        return [p.x, p.y];
      };
      return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
    }
  };
  var FACES = { px: [1, 0], nx: [-1, 0], py: [0, 1], ny: [0, -1] };
  function orient(size, rot, mode) {
    const w = size[0], h = size[1];
    let r = (rot % 4 + 4) % 4;
    let o;
    if (mode === "mirror") {
      o = r % 2 === 0 ? { w, h, map: (x, y) => [x, y], dir: (dx, dy) => [dx, dy], mirror: false } : { w: h, h: w, map: (x, y) => [y, x], dir: (dx, dy) => [dy, dx], mirror: true };
    } else if (r === 0) {
      o = { w, h, map: (x, y) => [x, y], dir: (dx, dy) => [dx, dy] };
    } else if (r === 1) {
      o = { w: h, h: w, map: (x, y) => [y, w - x], dir: (dx, dy) => [dy, -dx] };
    } else if (r === 2) {
      o = { w, h, map: (x, y) => [w - x, h - y], dir: (dx, dy) => [-dx, -dy] };
    } else {
      o = { w: h, h: w, map: (x, y) => [h - y, x], dir: (dx, dy) => [-dy, dx] };
    }
    o.rot = r;
    o.localFace = (worldFace) => {
      const t = FACES[worldFace];
      for (const k in FACES) {
        const d = o.dir(FACES[k][0], FACES[k][1]);
        if (d[0] === t[0] && d[1] === t[1]) return k;
      }
      return worldFace;
    };
    return o;
  }
  function screenFacing(dx, dy) {
    const sx = dx - dy, sy = dx + dy;
    return { right: sx > 1e-4 ? true : sx < -1e-4 ? false : null, front: sy >= -1e-4 };
  }

  // web/roomkit/catalog.js
  var SLOT_DEFAULTS = { pose: "stand", face: [0, 1], z: 0, dur: [6, 14], need: {}, layer: "front" };
  function normalizeDef(raw) {
    const d = Object.assign({}, raw);
    if (!d.id) throw new Error("[roomkit] 家具定义缺少 id");
    d.name = d.name || d.id;
    d.sub = d.sub || "";
    d.mount = d.mount || "floor";
    d.size = (d.size || [1, 1]).slice(0, 2);
    d.tags = d.tags || [];
    d.states = Object.assign({}, d.states || {});
    d.palette = Object.assign({}, d.palette || {});
    d.art = d.art || { kind: "proc", parts: [] };
    if (d.mount === "flat") {
      d.blocks = false;
      d.height = d.height || 2;
      d.cat = d.cat || "rug";
    } else if (d.mount === "wall") {
      d.blocks = false;
      d.wsize = (d.wsize || [1, 100]).slice(0, 2);
      d.wz = d.wz != null ? d.wz : 60;
      d.cat = d.cat || "wall";
    } else {
      d.blocks = d.blocks !== false;
      d.height = d.height || 60;
      d.cat = d.cat || "misc";
    }
    d.rotMode = d.mount === "wall" ? "none" : d.art.kind === "sprite" ? "mirror" : "rot4";
    d.rots = d.rotMode === "none" ? 1 : d.rotMode === "mirror" ? 2 : 4;
    d.slots = (d.slots || []).map((s, i) => Object.assign(
      { id: "slot" + i },
      SLOT_DEFAULTS,
      { at: [d.size[0] / 2, d.size[1] / 2] },
      s
    ));
    return d;
  }
  var Catalog = class {
    constructor() {
      this.defs = /* @__PURE__ */ new Map();
      this.order = [];
    }
    add(raw) {
      const d = normalizeDef(raw);
      if (!this.defs.has(d.id)) this.order.push(d.id);
      this.defs.set(d.id, d);
      return d;
    }
    addAll(list) {
      (list || []).forEach((d) => this.add(d));
      return this;
    }
    remove(id) {
      if (!this.defs.delete(id)) return false;
      this.order = this.order.filter((x) => x !== id);
      return true;
    }
    get(id) {
      return this.defs.get(id) || null;
    }
    has(id) {
      return this.defs.has(id);
    }
    list(filter) {
      const all = this.order.map((id) => this.defs.get(id));
      return filter ? all.filter(filter) : all;
    }
    /** 家具库面板的分类（按首次出现顺序） */
    categories() {
      const seen = [];
      this.list().forEach((d) => {
        if (!d.hidden && seen.indexOf(d.cat) < 0) seen.push(d.cat);
      });
      return seen;
    }
    toJSON() {
      return this.list().map((d) => {
        const o = Object.assign({}, d);
        delete o.rotMode;
        delete o.rots;
        return o;
      });
    }
  };
  function paletteOf(def, obj) {
    const p = Object.assign({}, def.palette, obj && obj.colors || {});
    return (key2) => {
      if (!key2) return "#cccccc";
      if (key2[0] === "#") return key2;
      return p[key2] || "#cccccc";
    };
  }
  var CATEGORY_NAMES = {
    bedroom: "卧室",
    living: "客厅",
    study: "书房",
    kitchen: "厨房",
    deco: "装饰",
    light: "灯具",
    rug: "地毯",
    wall: "墙面",
    plant: "绿植",
    misc: "其它",
    fun: "娱乐",
    outdoor: "户外"
  };

  // web/roomkit/util.js
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var lerp = (a, b, t) => a + (b - a) * t;
  var ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  var rand = (a, b) => a + Math.random() * (b - a);
  var pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  var smooth = (t) => t * t * (3 - 2 * t);
  var delay = (ms) => new Promise((r) => setTimeout(r, ms));
  var seq = 0;
  function uid(prefix = "o") {
    seq = (seq + 1) % 1296;
    return prefix + Date.now().toString(36).slice(-5) + seq.toString(36).padStart(2, "0");
  }
  function hash2(x, y, s = 0) {
    let h = x * 374761393 + y * 668265263 + s * 1442695041 | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hexToRgb(hex) {
    let h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }
  function shade(hex, k) {
    const [r, g, b] = hexToRgb(hex);
    if (k >= 0) return rgbToHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
    return rgbToHex(r * (1 + k), g * (1 + k), b * (1 + k));
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }
  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  var Emitter = class {
    constructor() {
      this._m = /* @__PURE__ */ new Map();
    }
    on(ev, fn) {
      if (!this._m.has(ev)) this._m.set(ev, /* @__PURE__ */ new Set());
      this._m.get(ev).add(fn);
      return () => this.off(ev, fn);
    }
    off(ev, fn) {
      const s = this._m.get(ev);
      if (s) s.delete(fn);
    }
    emit(ev, payload) {
      const run = (set) => set && [...set].forEach((fn) => {
        try {
          fn(payload, ev);
        } catch (e) {
          console.error("[roomkit] 事件处理出错:", ev, e);
        }
      });
      run(this._m.get(ev));
      run(this._m.get("*"));
    }
  };
  var clone = (o) => o == null ? o : JSON.parse(JSON.stringify(o));
  function inPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // web/roomkit/scene.js
  var ROOM_DEFAULTS = {
    w: 8,
    h: 6,
    cells: null,
    // ['aaaa..', ...]：每格材质槽 a..z，'.' = 空
    mats: [{ kind: "wood", color: "#e3a46a" }],
    walls: { left: true, right: true, height: 230, color: "#f6ead6", wainscot: "#8fb0c9", trim: "#ffffff", pattern: "plain" },
    slab: 16
  };
  function normalizeObj(o) {
    const n = Object.assign({ rot: 0, state: {} }, clone(o));
    n.id = n.id || uid("o");
    if (n.wall) {
      n.at = +n.at || 0.5;
      n.z = n.z != null ? +n.z : null;
      delete n.x;
      delete n.y;
    } else {
      n.x = n.x | 0;
      n.y = n.y | 0;
    }
    return n;
  }
  function normalizeAgent(a, room) {
    return Object.assign({
      id: uid("a"),
      name: "角色",
      kind: "girl",
      brain: "auto",
      look: {},
      x: room ? room.w / 2 : 2,
      y: room ? room.h / 2 : 2
    }, clone(a));
  }
  function normalizeScene(raw) {
    const src = raw || {};
    const s = clone(src);
    s.format = "roomkit.scene";
    if (!(src.v >= 2)) (s.agents || []).forEach((a) => {
      if (!a.kind || a.kind === "whale") a.kind = "girl";
    });
    s.v = 2;
    s.id = s.id || uid("scene");
    s.name = s.name || "房间";
    const room = Object.assign(clone(ROOM_DEFAULTS), s.room || {});
    room.walls = Object.assign({}, ROOM_DEFAULTS.walls, src.room && src.room.walls || {});
    room.mats = room.mats && room.mats.length ? room.mats : clone(ROOM_DEFAULTS.mats);
    room.w = clamp(room.w | 0, 1, 40);
    room.h = clamp(room.h | 0, 1, 40);
    s.room = room;
    s.objects = (s.objects || []).map(normalizeObj);
    s.agents = (s.agents || []).map((a) => normalizeAgent(a, room));
    s.env = Object.assign({ period: null, weather: "clear" }, s.env || {});
    return s;
  }
  function resizeCells(room, w, h) {
    if (!room.cells) return null;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = "";
      for (let x = 0; x < w; x++) row += room.cells[y] && room.cells[y][x] || "a";
      rows.push(row);
    }
    return rows;
  }
  var World = class extends Emitter {
    constructor(catalog, scene) {
      super();
      this.catalog = catalog;
      this.version = 0;
      this.layoutVersion = 0;
      this.occ = /* @__PURE__ */ new Map();
      this.load(scene);
    }
    load(raw) {
      this.scene = normalizeScene(raw);
      this.byId = new Map(this.scene.objects.map((o) => [o.id, o]));
      this.occ.clear();
      this._decode();
      this.version++;
      this.layoutVersion++;
      this.emit("load", this.scene);
    }
    /** 存档用：临时角色（ephemeral，如 DSH 会话映射出来的同伴）不进存档 */
    toJSON() {
      const s = clone(this.scene);
      s.agents = s.agents.filter((a) => !a.ephemeral);
      return s;
    }
    get room() {
      return this.scene.room;
    }
    get objects() {
      return this.scene.objects;
    }
    _decode() {
      const r = this.room;
      this.grid = new Int8Array(r.w * r.h);
      if (!r.cells) return;
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const ch = r.cells[y] && r.cells[y][x];
          this.grid[y * r.w + x] = !ch ? 0 : ch === "." ? -1 : clamp(ch.charCodeAt(0) - 97, 0, r.mats.length - 1);
        }
      }
    }
    /** 格子材质槽；越界或镂空 = −1 */
    cell(x, y) {
      const r = this.room;
      if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
      return this.grid[y * r.w + x];
    }
    isFloor(x, y) {
      return this.cell(x, y) >= 0;
    }
    def(o) {
      return o ? this.catalog.get(o.def) : null;
    }
    footprint(o, def) {
      def = def || this.def(o);
      if (!def || def.mount === "wall") return null;
      const or = orient(def.size, o.rot || 0, def.rotMode);
      return { x0: o.x, y0: o.y, x1: o.x + or.w, y1: o.y + or.h, w: or.w, h: or.h, o: or };
    }
    canPlace(defId, x, y, rot, ignoreId) {
      const def = this.catalog.get(defId);
      if (!def) return { ok: false, reason: "未知家具" };
      if (def.mount === "wall") return { ok: false, reason: "墙面物件要挂在墙上" };
      const or = orient(def.size, rot || 0, def.rotMode);
      for (let yy = y; yy < y + or.h; yy++) {
        for (let xx = x; xx < x + or.w; xx++) if (!this.isFloor(xx, yy)) return { ok: false, reason: "超出地面" };
      }
      if (def.mount === "flat") return { ok: true };
      for (const o of this.objects) {
        if (o.id === ignoreId || o.wall) continue;
        const d2 = this.def(o);
        if (!d2 || d2.mount !== "floor") continue;
        const f = this.footprint(o, d2);
        if (x < f.x1 && x + or.w > f.x0 && y < f.y1 && y + or.h > f.y0) return { ok: false, reason: "和「" + d2.name + "」重叠", with: o.id };
      }
      return { ok: true };
    }
    hasWall(side) {
      return !!this.room.walls[side];
    }
    /** 墙长（格）：左墙沿 y，右墙沿 x */
    wallLen(side) {
      return side === "left" ? this.room.h : this.room.w;
    }
    canPlaceWall(defId, side, at, z, ignoreId) {
      const def = this.catalog.get(defId);
      if (!def || def.mount !== "wall") return { ok: false, reason: "不是墙面物件" };
      if (!this.hasWall(side)) return { ok: false, reason: "这一侧没有墙" };
      const [ww, wh] = def.wsize;
      const a0 = at - ww / 2, a1 = at + ww / 2;
      if (a0 < -1e-3 || a1 > this.wallLen(side) + 1e-3) return { ok: false, reason: "超出墙面" };
      if (z < -0.5 || z + wh > this.room.walls.height + 0.5) return { ok: false, reason: "超出墙高" };
      for (const o of this.objects) {
        if (o.id === ignoreId || o.wall !== side) continue;
        const d2 = this.def(o);
        if (!d2) continue;
        const b0 = o.at - d2.wsize[0] / 2, b1 = o.at + d2.wsize[0] / 2;
        const z0 = this.wallZ(o, d2), z1 = z0 + d2.wsize[1];
        if (a0 < b1 - 0.01 && a1 > b0 + 0.01 && z < z1 && z + wh > z0) return { ok: false, reason: "和「" + d2.name + "」重叠", with: o.id };
      }
      return { ok: true };
    }
    wallZ(o, def) {
      def = def || this.def(o);
      return o.z != null ? o.z : def ? def.wz : 60;
    }
    /* ───────── 交互位 ───────── */
    /** 交互位的世界位置（格坐标）、朝向与靠近点 */
    slotPose(o, slot) {
      const def = this.def(o);
      const f = this.footprint(o, def);
      if (!f) return null;
      const [lx, ly] = f.o.map(slot.at[0], slot.at[1]);
      const [fx, fy] = f.o.dir(slot.face[0], slot.face[1]);
      let approach = null;
      if (slot.approach) {
        const [ax, ay] = f.o.map(slot.approach[0], slot.approach[1]);
        approach = { x: o.x + ax, y: o.y + ay };
      }
      return { x: o.x + lx, y: o.y + ly, face: [fx, fy], z: slot.z || 0, approach, layer: slot.layer };
    }
    slotKey(o, slot) {
      return o.id + ":" + slot.id;
    }
    /** 交互位能不能用：在占格外的交互位（站在家具前面用的）本身得是空地 */
    slotUsable(o, slot, nav) {
      const sp = this.slotPose(o, slot), f = this.footprint(o);
      if (!sp || !f) return false;
      const inside = sp.x >= f.x0 && sp.x <= f.x1 && sp.y >= f.y0 && sp.y <= f.y1;
      return inside || nav.freeAt(sp.x, sp.y);
    }
    occupant(o, slot) {
      return this.occ.get(this.slotKey(o, slot)) || null;
    }
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
    releaseAll(agentId) {
      for (const [k, v] of this.occ) if (v === agentId) this.occ.delete(k);
    }
    /** 当前点亮的光源（格坐标 + 像素高度） */
    lights() {
      const out = [];
      for (const o of this.objects) {
        const def = this.def(o);
        if (!def || !def.light || o.wall) continue;
        const L = def.light;
        if (L.when && !(o.state && (L.when[0] === "!" ? !o.state[L.when.slice(1)] : o.state[L.when]))) continue;
        const f = this.footprint(o, def);
        const at = L.at || [def.size[0] / 2, def.size[1] / 2];
        const [lx, ly] = f.o.map(at[0], at[1]);
        out.push({ x: o.x + lx, y: o.y + ly, z: L.z || 60, radius: L.radius || 3, color: L.color || "#ffd59a", power: L.power || 1, id: o.id });
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
        case "add": {
          const o = normalizeObj(op.obj);
          if (this.byId.has(o.id)) o.id = uid("o");
          const i = op.index != null ? clamp(op.index, 0, sc.objects.length) : sc.objects.length;
          sc.objects.splice(i, 0, o);
          this.byId.set(o.id, o);
          inv = { t: "remove", id: o.id };
          break;
        }
        case "remove": {
          const i = sc.objects.findIndex((o2) => o2.id === op.id);
          if (i < 0) return null;
          const [o] = sc.objects.splice(i, 1);
          this.byId.delete(o.id);
          for (const [k] of this.occ) if (k.indexOf(o.id + ":") === 0) this.occ.delete(k);
          inv = { t: "add", obj: clone(o), index: i };
          break;
        }
        case "set":
        case "state": {
          const o = this.byId.get(op.id);
          if (!o) return null;
          const target = op.t === "state" ? o.state = o.state || {} : o;
          const old = {};
          for (const k in op.patch) old[k] = clone(target[k]);
          for (const k in op.patch) {
            if (op.patch[k] === void 0 || op.patch[k] === null && k !== "z") delete target[k];
            else target[k] = clone(op.patch[k]);
          }
          inv = { t: op.t, id: op.id, patch: old };
          break;
        }
        case "room": {
          const r = this.room;
          const old = {};
          for (const k in op.patch) old[k] = clone(r[k]);
          Object.assign(r, clone(op.patch));
          if ("w" in op.patch || "h" in op.patch || "cells" in op.patch || "mats" in op.patch) this._decode();
          inv = { t: "room", patch: old };
          break;
        }
        case "agent.add": {
          const a = normalizeAgent(op.agent, this.room);
          sc.agents.push(a);
          inv = { t: "agent.remove", id: a.id };
          break;
        }
        case "agent.remove": {
          const i = sc.agents.findIndex((a2) => a2.id === op.id);
          if (i < 0) return null;
          const [a] = sc.agents.splice(i, 1);
          this.releaseAll(a.id);
          inv = { t: "agent.add", agent: clone(a) };
          break;
        }
        case "agent.set": {
          const a = sc.agents.find((x) => x.id === op.id);
          if (!a) return null;
          const old = {};
          for (const k in op.patch) old[k] = clone(a[k]);
          for (const k in op.patch) {
            if (op.patch[k] === void 0) delete a[k];
            else a[k] = clone(op.patch[k]);
          }
          inv = { t: "agent.set", id: op.id, patch: old };
          break;
        }
        case "env": {
          const old = {};
          for (const k in op.patch) old[k] = sc.env[k];
          Object.assign(sc.env, op.patch);
          inv = { t: "env", patch: old };
          break;
        }
        case "meta": {
          const old = {};
          for (const k of Object.keys(op.patch).filter((x) => ["name", "description", "stories", "template", "author"].indexOf(x) >= 0)) {
            old[k] = clone(sc[k]);
            if (op.patch[k] === void 0) delete sc[k];
            else sc[k] = clone(op.patch[k]);
          }
          inv = { t: "meta", patch: old };
          break;
        }
        case "batch": {
          const invs = [];
          for (const sub of op.ops || []) {
            const i = this.apply(sub, { silent: true });
            if (i) invs.push(i);
          }
          inv = { t: "batch", ops: invs.reverse() };
          break;
        }
        default:
          console.warn("[roomkit] 未知编辑操作:", op.t);
          return null;
      }
      this.version++;
      if (op.t === "add" || op.t === "remove" || op.t === "set" || op.t === "room") this.layoutVersion++;
      if (!silent) this.emit("change", { op, inv });
      return inv;
    }
  };

  // web/roomkit/nav.js
  var SQRT2 = Math.SQRT2;
  var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
  var Nav = class {
    constructor(world) {
      this.world = world;
      this.version = -1;
      this.ensure();
    }
    ensure() {
      if (this.version === this.world.layoutVersion) return;
      const w = this.world, r = w.room;
      this.W = r.w;
      this.H = r.h;
      const g = this.block = new Uint8Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (!w.isFloor(x, y)) g[y * r.w + x] = 1;
      for (const o of w.objects) {
        if (o.wall) continue;
        const d = w.def(o);
        if (!d || !d.blocks) continue;
        const f = w.footprint(o, d);
        for (let y = f.y0; y < f.y1; y++) for (let x = f.x0; x < f.x1; x++) if (x >= 0 && y >= 0 && x < r.w && y < r.h) g[y * r.w + x] = 1;
      }
      this.version = w.layoutVersion;
    }
    free(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return false;
      return !this.block[cy * this.W + cx];
    }
    freeAt(px, py) {
      this.ensure();
      return this.free(Math.floor(px), Math.floor(py));
    }
    /** 离 (px,py) 最近的可走格中心（按环扩散） */
    nearestFree(px, py, maxR = 8) {
      this.ensure();
      const cx = Math.floor(px), cy = Math.floor(py);
      let best = null, bestD = Infinity;
      for (let r = 0; r <= maxR; r++) {
        for (let y = cy - r; y <= cy + r; y++) {
          for (let x = cx - r; x <= cx + r; x++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !this.free(x, y)) continue;
            const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
            if (d < bestD) {
              bestD = d;
              best = { x: x + 0.5, y: y + 0.5 };
            }
          }
        }
        if (best) return best;
      }
      return null;
    }
    /** 两点间是否畅通（身体半径 r） */
    los(a, b, r = 0.2) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
      for (let i = 0; i <= n; i++) {
        const x = a.x + dx * i / n, y = a.y + dy * i / n;
        if (!this.freeAt(x - r, y - r) || !this.freeAt(x + r, y - r) || !this.freeAt(x - r, y + r) || !this.freeAt(x + r, y + r)) return false;
      }
      return true;
    }
    /** A*：返回路点 [{x,y}...]（含起点），找不到返回 null */
    path(from, to) {
      this.ensure();
      const W = this.W, H = this.H, N = W * H;
      let s = { x: Math.floor(from.x), y: Math.floor(from.y) };
      if (!this.free(s.x, s.y)) {
        const n = this.nearestFree(from.x, from.y);
        if (!n) return null;
        s = { x: Math.floor(n.x), y: Math.floor(n.y) };
      }
      let goal = { x: Math.floor(to.x), y: Math.floor(to.y) }, exact = true;
      if (!this.free(goal.x, goal.y)) {
        const n = this.nearestFree(to.x, to.y);
        if (!n) return null;
        goal = { x: Math.floor(n.x), y: Math.floor(n.y) };
        exact = false;
      }
      const si = s.y * W + s.x, gi = goal.y * W + goal.x;
      const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const heap = new MinHeap(N);
      const hfn = (i) => {
        const x = i % W, y = i / W | 0, dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
        return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
      };
      gs[si] = 0;
      heap.push(si, hfn(si));
      let found = si === gi;
      while (heap.size && !found) {
        const cur = heap.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === gi) {
          found = true;
          break;
        }
        const cx = cur % W, cy = cur / W | 0;
        for (const [dx, dy, cost] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.free(nx, ny)) continue;
          if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          const ng = gs[cur] + cost;
          if (ng < gs[ni]) {
            gs[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let i = gi; i !== -1; i = came[i]) {
        cells.push(i);
        if (i === si) break;
      }
      cells.reverse();
      const pts = cells.map((i) => ({ x: i % W + 0.5, y: (i / W | 0) + 0.5 }));
      pts[0] = { x: from.x, y: from.y };
      if (exact) {
        if (pts.length === 1) pts.push({ x: to.x, y: to.y });
        else pts[pts.length - 1] = { x: to.x, y: to.y };
      }
      return this.smooth(pts);
    }
    smooth(pts) {
      if (pts.length <= 2) return pts;
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !this.los(pts[i], pts[j])) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }
  };
  var MinHeap = class {
    constructor(cap) {
      this.idx = new Int32Array(cap * 4 + 8);
      this.pri = new Float32Array(cap * 4 + 8);
      this.size = 0;
    }
    push(i, p) {
      if (this.size >= this.idx.length) {
        this._grow();
      }
      let n = this.size++;
      while (n > 0) {
        const parent = n - 1 >> 1;
        if (this.pri[parent] <= p) break;
        this.idx[n] = this.idx[parent];
        this.pri[n] = this.pri[parent];
        n = parent;
      }
      this.idx[n] = i;
      this.pri[n] = p;
    }
    pop() {
      const top = this.idx[0];
      const li = this.idx[--this.size], lp = this.pri[this.size];
      let n = 0;
      for (; ; ) {
        let c = 2 * n + 1;
        if (c >= this.size) break;
        if (c + 1 < this.size && this.pri[c + 1] < this.pri[c]) c++;
        if (this.pri[c] >= lp) break;
        this.idx[n] = this.idx[c];
        this.pri[n] = this.pri[c];
        n = c;
      }
      this.idx[n] = li;
      this.pri[n] = lp;
      return top;
    }
    _grow() {
      const i2 = new Int32Array(this.idx.length * 2), p2 = new Float32Array(this.pri.length * 2);
      i2.set(this.idx);
      p2.set(this.pri);
      this.idx = i2;
      this.pri = p2;
    }
  };

  // web/roomkit/paint-girl.js
  var GIRL_H = 104;
  function palette(look2) {
    const body = look2.body || "#5b8def";
    return {
      hair: look2.hair || shade(body, -0.46),
      hair2: look2.hair2 || shade(body, -0.04),
      dress: look2.dress || mix(shade(body, -0.6), "#232a48", 0.55),
      dress2: look2.dress2 || mix(shade(body, -0.42), "#343d63", 0.5),
      tail: look2.tail || body,
      fin: look2.fin || shade(body, 0.28),
      eye: look2.eye || shade(body, -0.12),
      skin: look2.skin || "#ffeadf",
      accent: look2.accent || shade(body, 0.05)
    };
  }
  function limb(ctx, x, y, a, len, width, color, hand) {
    const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (hand) {
      ctx.fillStyle = hand;
      ctx.beginPath();
      ctx.arc(ex, ey, width * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    return [ex, ey];
  }
  function tail(ctx, c, wag, sit) {
    ctx.save();
    ctx.translate(-9, sit ? -9 : -21);
    ctx.rotate(wag);
    ctx.fillStyle = c.tail;
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.bezierCurveTo(-10, -7, -20, -3, -25, 8);
    ctx.lineTo(-20, 11);
    ctx.bezierCurveTo(-16, 5, -8, 6, 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-23, 9);
    ctx.quadraticCurveTo(-37, 7, -41, -3);
    ctx.quadraticCurveTo(-30, -3, -22, 5);
    ctx.quadraticCurveTo(-24, -7, -16, -13);
    ctx.quadraticCurveTo(-11, -2, -19, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.28);
    ctx.beginPath();
    ctx.moveTo(4, 3);
    ctx.bezierCurveTo(-8, 3, -16, 3, -21, 9);
    ctx.lineTo(-20, 11);
    ctx.bezierCurveTo(-16, 5, -8, 6, 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function backHair(ctx, c, sway, frontView) {
    const g = ctx.createLinearGradient(0, -98, 0, -20);
    g.addColorStop(0, c.hair);
    g.addColorStop(0.55, mix(c.hair, c.hair2, 0.35));
    g.addColorStop(1, c.hair2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-23, -80);
    ctx.bezierCurveTo(-34, -60, -31 + sway, -36, -25 + sway * 1.6, -19);
    ctx.quadraticCurveTo(-18 + sway, -24, -14 + sway * 0.8, -20);
    ctx.quadraticCurveTo(-7 + sway * 0.5, -30, -2, -40);
    if (frontView) ctx.lineTo(24, -44);
    else {
      ctx.quadraticCurveTo(8 + sway * 0.5, -26, 13 + sway * 0.8, -22);
      ctx.quadraticCurveTo(20 + sway, -28, 25 + sway * 1.2, -24);
    }
    ctx.bezierCurveTo(34, -52, 35, -68, 29, -82);
    ctx.bezierCurveTo(24, -104, -18, -104, -23, -80);
    ctx.closePath();
    ctx.fill();
  }
  function fin(ctx, x, y, s, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-8, 4, -17, -3, -19, -13);
    ctx.bezierCurveTo(-12, -13, -2, -9, 3, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.35);
    ctx.beginPath();
    ctx.moveTo(-2, 1);
    ctx.bezierCurveTo(-7, -1, -13, -6, -16, -11);
    ctx.bezierCurveTo(-10, -9, -4, -6, 1, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function eye(ctx, x, y, s, open, c, lookX) {
    if (open < 0.14) {
      ctx.strokeStyle = "#2b2440";
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 5.2 * s, y);
      ctx.quadraticCurveTo(x, y + 3 * s, x + 5.2 * s, y);
      ctx.stroke();
      return;
    }
    const rx = 5.6 * s, ry = 7.6 * s * open;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 0.6, ry + 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, shade(c.eye, -0.5));
    g.addColorStop(0.55, c.eye);
    g.addColorStop(1, shade(c.eye, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + lookX, y + 0.2, rx - 0.3, ry - 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c.eye, -0.72);
    ctx.beginPath();
    ctx.ellipse(x + lookX, y - 0.6 * open, rx * 0.46, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x + lookX - rx * 0.28, y - ry * 0.42, 1.9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + lookX + rx * 0.3, y + ry * 0.4, 1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2440";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 0.4, ry + 0.3, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
  function arcEye(ctx, x, y, s) {
    ctx.strokeStyle = "#2b2440";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y + 1.5);
    ctx.quadraticCurveTo(x, y - 5 * s, x + 5 * s, y + 1.5);
    ctx.stroke();
  }
  function heartEye(ctx, x, y, s) {
    ctx.fillStyle = "#ff5c8a";
    ctx.beginPath();
    ctx.moveTo(x, y + 5 * s);
    ctx.bezierCurveTo(x - 8 * s, y - 1 * s, x - 4 * s, y - 7 * s, x, y - 2.5 * s);
    ctx.bezierCurveTo(x + 4 * s, y - 7 * s, x + 8 * s, y - 1 * s, x, y + 5 * s);
    ctx.fill();
  }
  function face(ctx, a, c, t, expr, pose) {
    const blink = a.blink || 0, lx = pose === "read" ? 0.8 : pose === "look" ? Math.sin(t * 1.3) * 1.6 : a.gaze || 0;
    const ey = pose === "read" || pose === "work" ? -64 : -66;
    const nx = -3.5, fx = 15.5;
    if (expr === "sleep") {
      eye(ctx, nx, ey + 1, 1, 0, c, 0);
      eye(ctx, fx, ey, 0.86, 0, c, 0);
    } else if (expr === "happy") {
      arcEye(ctx, nx, ey, 1);
      arcEye(ctx, fx, ey - 0.5, 0.86);
    } else if (expr === "love") {
      heartEye(ctx, nx, ey, 1);
      heartEye(ctx, fx, ey - 0.5, 0.86);
    } else {
      const open = (expr === "surprised" ? 1.16 : expr === "sad" ? 0.78 : expr === "determined" ? 0.72 : pose === "read" ? 0.68 : 1) * (1 - blink);
      eye(ctx, nx, ey, 1, open, c, lx);
      eye(ctx, fx, ey - 0.6, 0.86, open, c, lx * 0.6);
    }
    ctx.strokeStyle = shade(c.hair, -0.1);
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    const browY = ey - (expr === "surprised" ? 12.5 : 10.5), tilt = expr === "sad" ? -2 : expr === "determined" ? 2.2 : 0;
    ctx.beginPath();
    ctx.moveTo(nx - 4, browY - tilt * 0.3);
    ctx.lineTo(nx + 3.5, browY + tilt * 0.7);
    ctx.moveTo(fx - 3, browY + tilt * 0.7);
    ctx.lineTo(fx + 3.5, browY - tilt * 0.3);
    ctx.stroke();
    ctx.fillStyle = rgba("#ff8fa8", expr === "love" || expr === "shy" ? 0.65 : 0.34);
    ctx.beginPath();
    ctx.ellipse(nx - 5, ey + 8.5, 4.6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(fx + 4.6, ey + 8, 3.4, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    const mx = 7, my = ey + 12.5;
    ctx.strokeStyle = "#7a3347";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    const talk = a.speech && t * 9 % 1 < 0.5 && a.t < a.speech.until - 0.3;
    if (pose === "eat") {
      const o = Math.abs(Math.sin(t * 7));
      ctx.fillStyle = "#8e3a4c";
      ctx.beginPath();
      ctx.ellipse(mx, my, 2.6, 0.8 + o * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expr === "surprised" || talk) {
      ctx.fillStyle = "#8e3a4c";
      ctx.beginPath();
      ctx.ellipse(mx, my, 2, talk ? 1.7 : 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expr === "sad") {
      ctx.beginPath();
      ctx.moveTo(mx - 3, my + 1.2);
      ctx.quadraticCurveTo(mx, my - 1.6, mx + 3, my + 1.2);
      ctx.stroke();
    } else if (expr === "sleep") {
      ctx.beginPath();
      ctx.moveTo(mx - 1.6, my);
      ctx.lineTo(mx + 1.6, my);
      ctx.stroke();
    } else if (expr === "happy" || expr === "love") {
      ctx.fillStyle = "#c9506a";
      ctx.beginPath();
      ctx.moveTo(mx - 3.4, my - 1);
      ctx.quadraticCurveTo(mx, my + 5, mx + 3.4, my - 1);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - 2.6, my - 0.4);
      ctx.quadraticCurveTo(mx, my + 2, mx + 2.6, my - 0.4);
      ctx.stroke();
    }
    if (expr === "sad") {
      ctx.fillStyle = "#8fd0ff";
      ctx.beginPath();
      ctx.ellipse(nx - 2, ey + 8 + t * 18 % 7, 1.3, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function bangs(ctx, c, sway) {
    const g = ctx.createLinearGradient(0, -96, 0, -60);
    g.addColorStop(0, c.hair);
    g.addColorStop(1, mix(c.hair, c.hair2, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-22, -68);
    ctx.bezierCurveTo(-27, -86, -14, -97, 4, -97);
    ctx.bezierCurveTo(22, -97, 32, -86, 28, -68);
    ctx.quadraticCurveTo(25 + sway * 0.3, -75, 22, -79);
    ctx.quadraticCurveTo(20 + sway * 0.3, -72, 15, -73);
    ctx.quadraticCurveTo(12, -78, 9, -81);
    ctx.quadraticCurveTo(7, -73, 2, -73);
    ctx.quadraticCurveTo(-1, -78, -4, -80);
    ctx.quadraticCurveTo(-6, -73, -11, -73);
    ctx.quadraticCurveTo(-14, -78, -16, -79);
    ctx.quadraticCurveTo(-20, -75, -22, -68);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-23, -74);
    ctx.bezierCurveTo(-27, -62, -24 + sway * 0.4, -52, -19 + sway * 0.6, -45);
    ctx.quadraticCurveTo(-16 + sway * 0.4, -56, -16, -72);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(29, -74);
    ctx.bezierCurveTo(31, -66, 30 + sway * 0.4, -58, 26 + sway * 0.5, -51);
    ctx.quadraticCurveTo(24, -60, 25, -72);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba("#ffffff", 0.26);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14, -84);
    ctx.quadraticCurveTo(4, -92, 21, -85);
    ctx.stroke();
  }
  function hat(ctx, look2, c, t) {
    const kind = look2.hat;
    if (kind === "maid") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for (let i = 0; i < 7; i++) ctx.arc(-15 + i * 6.2, -94 - Math.sin(i / 6 * Math.PI) * 4.2, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(c.dress, 0.05);
      ctx.beginPath();
      ctx.moveTo(-19, -89);
      ctx.quadraticCurveTo(4, -99, 26, -89);
      ctx.lineTo(26, -86.5);
      ctx.quadraticCurveTo(4, -96, -19, -86.5);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "bow") {
      ctx.fillStyle = look2.accent || c.accent;
      ctx.beginPath();
      ctx.ellipse(-16, -92, 7, 4.4, -0.5, 0, Math.PI * 2);
      ctx.ellipse(-4, -96, 7, 4.4, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(look2.accent || c.accent, -0.2);
      ctx.beginPath();
      ctx.arc(-10, -94, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "cap") {
      ctx.fillStyle = look2.accent || "#f2c14e";
      ctx.beginPath();
      ctx.ellipse(3, -91, 22, 11, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(14, -92.5, 19, 3.6);
      ctx.fillStyle = rgba("#ffffff", 0.3);
      ctx.beginPath();
      ctx.ellipse(-3, -96, 8, 3.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    const w = Math.sin(t * 2.1) * 1.6;
    ctx.beginPath();
    ctx.moveTo(5, -96);
    ctx.bezierCurveTo(4 + w, -106, 13 + w, -110, 15 + w, -103);
    ctx.stroke();
  }
  function paintGirl(ctx, a, t) {
    const look2 = a.look || {}, c = palette(look2);
    const size = (look2.size || 1) * (a.scale || 1);
    const pose = a.pose || "stand", front = a.front !== false, right = a.right !== false;
    const ph = a.phase || 0, seed = a.seed || 0;
    const sitting = pose === "sit" || pose === "work" || pose === "read" || pose === "eat" || pose === "sleep";
    const breathe = Math.sin(t * 2.4 + seed);
    let lift = 0, rot = 0, sx = 1, sy = 1 + breathe * 0.012, headTilt = Math.sin(t * 0.9 + seed) * 0.02;
    let armN = 0.1, armF = -0.1, legSwing = 0, legLift = 0;
    let wag = Math.sin(t * 2.3 + seed) * 0.1;
    let sway = Math.sin(t * 1.5 + seed) * 0.8;
    switch (pose) {
      case "walk":
      case "run": {
        const k = pose === "run" ? 1.5 : 1;
        lift = Math.abs(Math.sin(ph)) * 2.6 * k;
        rot = 0.05 * k;
        legSwing = 7.5 * k;
        legLift = 3.2 * k;
        armN = -Math.sin(ph) * 0.65 * k;
        armF = Math.sin(ph) * 0.65 * k;
        wag = Math.sin(ph) * 0.2;
        sway = -3 * k + Math.sin(ph) * 1.2;
        break;
      }
      case "sit":
        armN = 0.45;
        armF = 0.3;
        break;
      case "sleep":
        armN = 0.3;
        armF = 0.2;
        headTilt = 0.12;
        wag = Math.sin(t * 1.1) * 0.04;
        sy = 1 + Math.sin(t * 1.6) * 0.012;
        break;
      case "work":
        armN = 1.2 + Math.sin(t * 15) * 0.1;
        armF = 1.15 - Math.sin(t * 15) * 0.1;
        headTilt = 0.03;
        break;
      case "read":
        armN = 1.05;
        armF = 0.95;
        headTilt = 0.07;
        break;
      case "eat":
        armN = 1.5 + Math.abs(Math.sin(t * 3.5)) * 0.8;
        armF = 0.5;
        break;
      case "cook":
        armN = 1.25 + Math.sin(t * 6) * 0.3;
        armF = 1 + Math.cos(t * 6) * 0.12;
        headTilt = 0.08;
        sway = Math.sin(t * 3) * 1.2;
        break;
      case "dance":
        lift = Math.abs(Math.sin(t * 6)) * 4.5;
        rot = Math.sin(t * 6) * 0.13;
        armN = 2.4 + Math.sin(t * 12) * 0.5;
        armF = -2.4 + Math.sin(t * 12) * 0.5;
        wag = Math.sin(t * 12) * 0.28;
        legSwing = 3;
        sway = Math.sin(t * 6) * 3;
        break;
      case "jump": {
        const k = Math.abs(Math.sin(t * 5.5));
        lift = k * 15;
        sy = 1 + k * 0.05;
        sx = 1 - k * 0.03;
        armN = 2.2;
        armF = -2.2;
        sway = -k * 2;
        break;
      }
      case "sad":
        armN = 0.05;
        armF = -0.05;
        headTilt = 0.1;
        wag = Math.sin(t * 0.8) * 0.03;
        sy = 0.97;
        break;
      case "wave":
        armN = 2.7 + Math.sin(t * 11) * 0.34;
        armF = -0.1;
        headTilt = -0.04;
        break;
      default:
        break;
    }
    sy *= 1 - (a.sq || 0);
    sx *= 1 + (a.sq || 0) * 0.6;
    const expr = a.expr || (pose === "sleep" ? "sleep" : pose === "sad" ? "sad" : pose === "jump" || pose === "dance" ? "happy" : pose === "work" ? "determined" : null);
    ctx.save();
    ctx.scale(size, size);
    if (!right) ctx.scale(-1, 1);
    ctx.translate(0, -lift + (sitting ? 10 : 0));
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    const head = () => {
      ctx.save();
      ctx.translate(3, -46);
      ctx.rotate(headTilt);
      ctx.translate(-3, 46);
      if (front) {
        fin(ctx, 26, -76, 0.74, 2.45, c.fin);
        ctx.fillStyle = c.skin;
        ctx.beginPath();
        ctx.ellipse(4, -68, 24, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba("#d98f7c", 0.2);
        ctx.beginPath();
        ctx.ellipse(4, -48.5, 13, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        face(ctx, a, c, t, expr, pose);
        bangs(ctx, c, sway);
        fin(ctx, -21, -75, 1, 0.08, c.fin);
        hat(ctx, look2, c, t);
      } else {
        fin(ctx, 26, -76, 0.74, 2.45, c.fin);
        fin(ctx, -21, -75, 1, 0.08, c.fin);
        hat(ctx, look2, c, t);
      }
      ctx.restore();
    };
    if (front) {
      tail(ctx, c, wag, sitting);
      ctx.save();
      ctx.translate(3, -46);
      ctx.rotate(headTilt * 0.5);
      ctx.translate(-3, 46);
      backHair(ctx, c, sway, true);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(3, -46);
      ctx.rotate(headTilt * 0.5);
      ctx.translate(-3, 46);
      ctx.restore();
    }
    const armColorF = shade(c.skin, -0.06);
    ctx.fillStyle = c.dress;
    ctx.beginPath();
    ctx.arc(10, -44, 4.2, 0, Math.PI * 2);
    ctx.fill();
    limb(ctx, 10, -43, armF, 12.5, 3.8, armColorF, armColorF);
    const legs = (x, i) => {
      const p = ph + i * Math.PI;
      if (sitting) {
        const fx2 = x + 13, fy2 = -9;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, -11);
        ctx.lineTo(fx2, fy2);
        ctx.stroke();
        ctx.fillStyle = shade(c.dress, -0.15);
        ctx.beginPath();
        ctx.ellipse(fx2 + 2.4, fy2 - 0.4, 4.2, 3.1, -0.15, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const fx = x + Math.sin(p) * legSwing, fy = -2.6 - Math.max(0, Math.cos(p)) * legLift;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, -18);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = shade(c.dress, -0.15);
      ctx.beginPath();
      ctx.ellipse(fx + 1.4, fy + 0.3, 4.6, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    legs(5.5, 1);
    legs(-3.5, 0);
    const hemY = sitting ? -7 : -14, hemW = sitting ? 27 : 22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) ctx.arc(-hemW + i * hemW / 4, hemY + 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
    const sg = ctx.createLinearGradient(-22, 0, 22, 0);
    sg.addColorStop(0, c.dress2);
    sg.addColorStop(0.55, c.dress);
    sg.addColorStop(1, shade(c.dress, -0.18));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-10, -40);
    ctx.bezierCurveTo(-14, -30, -hemW + 1, -22, -hemW, hemY);
    ctx.quadraticCurveTo(0, hemY + 5, hemW, hemY);
    ctx.bezierCurveTo(hemW - 1, -22, 14, -30, 11, -40);
    ctx.closePath();
    ctx.fill();
    if (front) {
      ctx.fillStyle = "#fbfcff";
      ctx.beginPath();
      ctx.moveTo(-3, -41);
      ctx.lineTo(9.5, -41);
      ctx.quadraticCurveTo(16, -26, 15, hemY + 2);
      ctx.quadraticCurveTo(4, hemY + 7, -7, hemY + 2);
      ctx.quadraticCurveTo(-8, -28, -3, -41);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.ellipse(4.5, -25, 3.8, 2.5, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.8, -25);
      ctx.lineTo(-2.2, -27.4);
      ctx.lineTo(-2, -22.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = c.dress;
    ctx.beginPath();
    ctx.moveTo(-10, -50);
    ctx.quadraticCurveTo(1, -53, 12, -50);
    ctx.lineTo(11.4, -38);
    ctx.quadraticCurveTo(1, -35.6, -10.4, -38);
    ctx.closePath();
    ctx.fill();
    if (front) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-4, -51);
      ctx.lineTo(10, -51);
      ctx.lineTo(8.6, -39.5);
      ctx.lineTo(-2.4, -39.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.ellipse(0.6, -48.4, 3.3, 2, -0.4, 0, Math.PI * 2);
      ctx.ellipse(6.6, -48.6, 3.3, 2, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(c.accent, -0.25);
      ctx.beginPath();
      ctx.arc(3.6, -48.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!front) {
      backHair(ctx, c, sway, false);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-5, -38, 7, 4.2, 0.4, 0, Math.PI * 2);
      ctx.ellipse(8, -38, 7, 4.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      tail(ctx, c, wag, sitting);
    }
    if (front && pose === "read") {
      ctx.save();
      ctx.translate(16, -31);
      ctx.rotate(-0.1);
      ctx.fillStyle = look2.accent || "#f28f6b";
      ctx.fillRect(-9, -6.5, 18, 11);
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(-8, -7.5, 7.6, 10.5);
      ctx.fillRect(0.4, -7.5, 7.6, 10.5);
      ctx.strokeStyle = "rgba(90,90,110,.35)";
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-7, -5 + i * 2.6);
        ctx.lineTo(-1.6, -5 + i * 2.6);
        ctx.moveTo(1.6, -5 + i * 2.6);
        ctx.lineTo(7, -5 + i * 2.6);
        ctx.stroke();
      }
      ctx.restore();
    } else if (front && pose === "eat") {
      ctx.save();
      ctx.translate(16, -33);
      ctx.fillStyle = "#f4f1ea";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(0, -0.6, 7, 3, 0, Math.PI, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = c.dress2;
    ctx.beginPath();
    ctx.arc(-9.5, -44.5, 5, 0, Math.PI * 2);
    ctx.fill();
    limb(ctx, -9.5, -43, armN, 13.5, 4.2, c.skin, c.skin);
    head();
    ctx.restore();
  }

  // web/roomkit/token-body.js
  var SITTING = /* @__PURE__ */ new Set(["sit", "work", "read", "eat", "sleep"]);
  var TokenBody = class {
    constructor(agent) {
      this.a = agent;
    }
    update() {
    }
    bounce() {
    }
    talk() {
    }
    pointer() {
    }
    dispose() {
    }
    get metrics() {
      const s = this.a.look.size || 1;
      return { h: 56 * s, rx: 25 * s, ry: 30 * s };
    }
    draw(g, t = 0) {
      const a = this.a, look2 = a.look || {};
      const body = look2.body || "#438ca2";
      const pose = a.pose || "stand", seed = a.seed || 0, ph = a.phase || 0;
      const sitting = SITTING.has(pose);
      const breathe = Math.sin(t * 2.4 + seed);
      let lift = 0, rot = 0, sx = 1 + breathe * 0.012, sy = 1 - breathe * 0.012, step = 0, wave = 0;
      switch (pose) {
        case "walk":
        case "run": {
          const k = pose === "run" ? 1.4 : 1;
          lift = Math.abs(Math.sin(ph)) * 4 * k;
          step = Math.sin(ph) * 3.5 * k;
          rot = Math.sin(ph) * 0.06;
          sy *= 1 + Math.abs(Math.sin(ph)) * 0.05;
          sx *= 1 - Math.abs(Math.sin(ph)) * 0.03;
          break;
        }
        case "dance":
          lift = Math.abs(Math.sin(t * 6)) * 6;
          rot = Math.sin(t * 6) * 0.16;
          step = Math.sin(t * 12) * 2;
          break;
        case "jump": {
          const k = Math.abs(Math.sin(t * 5.5));
          lift = k * 16;
          sy *= 1 + k * 0.08;
          sx *= 1 - k * 0.05;
          break;
        }
        case "wave":
          wave = Math.sin(t * 11) * 0.5;
          break;
        case "sad":
          sy *= 0.94;
          sx *= 1.03;
          break;
        case "sleep":
          sy = 0.86 + Math.sin(t * 1.6) * 0.02;
          sx = 1.1;
          break;
        default:
          if (sitting) {
            sy *= 0.9;
            sx *= 1.06;
          }
      }
      sy *= 1 - (a.sq || 0);
      sx *= 1 + (a.sq || 0) * 0.6;
      const expr = a.expr || (pose === "sleep" ? "sleep" : pose === "sad" ? "sad" : pose === "dance" || pose === "jump" ? "happy" : null);
      g.save();
      g.scale(look2.size || 1, look2.size || 1);
      if (a.right === false) g.scale(-1, 1);
      if (!sitting) {
        g.fillStyle = shade(body, -0.32);
        g.beginPath();
        g.ellipse(-8 + step, -2, 6.5, 3.6, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(8 - step, -2, 6.5, 3.6, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.translate(0, -lift - (sitting ? 0 : 3));
      g.rotate(rot);
      g.scale(sx, sy);
      const grad = g.createLinearGradient(0, -52, 0, 0);
      grad.addColorStop(0, shade(body, 0.22));
      grad.addColorStop(1, shade(body, -0.12));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-24, -14);
      g.bezierCurveTo(-26, -40, -14, -52, 0, -52);
      g.bezierCurveTo(14, -52, 26, -40, 24, -14);
      g.bezierCurveTo(23, -2, 12, 0, 0, 0);
      g.bezierCurveTo(-12, 0, -23, -2, -24, -14);
      g.fill();
      g.strokeStyle = shade(body, -0.25);
      g.lineWidth = 2.4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(1, -51);
      g.quadraticCurveTo(3, -58, 8, -60);
      g.stroke();
      g.fillStyle = look2.accent || "#8fd28f";
      g.beginPath();
      g.ellipse(9, -60, 4.2, 2.4, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(body, -0.06);
      g.beginPath();
      g.ellipse(-22, -18, 4.5, 6, 0.4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(21, -20);
      g.rotate(-0.4 - (pose === "wave" ? 1.6 + wave : 0));
      g.beginPath();
      g.ellipse(0, 3, 4.5, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (a.front !== false) face2(g, a, expr, t);
      else {
        g.fillStyle = rgba("#ffffff", 0.18);
        g.beginPath();
        g.ellipse(-4, -40, 9, 6, -0.4, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  };
  function face2(g, a, expr, t) {
    const ink = "#2b2f3a", blink = a.blink || 0;
    g.fillStyle = rgba("#ffffff", 0.32);
    g.beginPath();
    g.ellipse(-9, -42, 7, 4.5, -0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgba("#ff8fa3", 0.45);
    g.beginPath();
    g.ellipse(-6, -21, 4.5, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(18, -21, 4.5, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 2;
    g.lineCap = "round";
    const eye2 = (x) => {
      if (expr === "sleep" || blink > 0.6) {
        g.beginPath();
        g.moveTo(x - 3, -28);
        g.quadraticCurveTo(x, -26, x + 3, -28);
        g.stroke();
        return;
      }
      if (expr === "happy" || expr === "love" || expr === "excited") {
        g.beginPath();
        g.moveTo(x - 3.2, -27);
        g.quadraticCurveTo(x, -32, x + 3.2, -27);
        g.stroke();
        return;
      }
      g.beginPath();
      g.ellipse(x, -29, 2.8, 3.8 * (1 - blink * 0.8), 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x + 0.9, -30.4, 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink;
    };
    eye2(1);
    eye2(13);
    g.beginPath();
    if (expr === "sad" || expr === "worried") g.arc(7, -19, 2.6, Math.PI * 1.15, Math.PI * 1.85);
    else if (expr === "sleep") {
      g.arc(7, -21, 1.4, 0, Math.PI * 2);
      g.stroke();
      return;
    } else g.arc(7, -23, 2.8, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }

  // demo-theme/whale-girl.js
  var look = { body: "#5b8def", belly: "#eef5ff", hat: "maid", rig: false };
  var DEFAULT_CHARACTERS = [];
  var DEFAULT_ROLE = { id: "role", name: "示例角色", kind: "girl", brain: "manual", look };
  var APPEARANCE_NOTICE = "「大肥鱼」鲸鱼娘原设为溟月（上善无形），DeepSeek 女仆二创为 ZipZipPipe，形象沿用 CC BY-NC-SA 4.0。<br>";
  var WHALE_LOOKS = [look, ...["#8976c4", "#bf745b", "#579977"].map((body) => ({ body, rig: false }))];
  var RigPool = class {
  };
  var GirlBody = class {
    constructor(agent) {
      this.agent = agent;
    }
    get metrics() {
      const size = this.agent.look.size || 1;
      return { h: GIRL_H * size, rx: 30 * size, ry: 54 * size };
    }
    draw(ctx, time) {
      paintGirl(ctx, this.agent, time);
    }
    update() {
    }
    bounce() {
    }
    talk() {
    }
    pointer() {
    }
    dispose() {
    }
  };
  var bodyFor = (agent) => agent.data.kind === "girl" ? new GirlBody(agent) : new TokenBody(agent);

  // web/roomkit/agents.js
  var POSE_NAMES = {
    sleep: "睡觉",
    sit: "坐着",
    work: "干活",
    read: "看书",
    eat: "吃东西",
    dance: "跳舞",
    look: "张望",
    stand: "发呆",
    walk: "走路",
    jump: "蹦跶",
    sad: "难过",
    wave: "打招呼",
    cook: "做饭"
  };
  var poseName = (p) => POSE_NAMES[p] || p;
  var Agent = class {
    constructor(data, app) {
      this.app = app;
      this.data = data;
      this.id = data.id;
      this.x = +data.x || 1;
      this.y = +data.y || 1;
      this.z = 0;
      this.dir = [0, 1];
      this.right = true;
      this.front = true;
      this.pose = "stand";
      this.t = 0;
      this.phase = 0;
      this.seed = Math.random() * 10;
      this.blink = 0;
      this._blinkAt = rand(1, 4);
      this._blinkT = 0;
      this.sq = 0;
      this._sqv = 0;
      this.act = null;
      this.queue = [];
      this.needs = Object.assign({ energy: rand(0.5, 0.9), fun: rand(0.35, 0.8), social: rand(0.35, 0.8) }, data.needs || {});
      this.status = null;
      this.speech = null;
      this.emo = null;
      this.attach = null;
      this.engaged = null;
      this.activity = "发呆";
      this.expr = null;
      this._exprUntil = 0;
      this._timers = [];
      this.body = bodyFor(this, app);
    }
    /** 场景数据变了（改名、换装）：外观变了才换身体 */
    setData(r) {
      const before = JSON.stringify([this.data.kind, this.data.look]);
      this.data = r;
      if (before !== JSON.stringify([r.kind, r.look])) {
        this.body.dispose();
        this.body = bodyFor(this, this.app);
      }
    }
    dispose() {
      this.cancel();
      this.body.dispose();
    }
    get name() {
      return this.data.name;
    }
    get look() {
      return this.data.look || {};
    }
    /* ───────── 动作 ───────── */
    _start(kind, props) {
      this.cancel();
      return new Promise((resolve) => {
        this.act = Object.assign({ kind, resolve }, props);
      });
    }
    /** 打断当前动作（它的 Promise 以 false 结束） */
    cancel() {
      const a = this.act;
      if (!a) return;
      this.act = null;
      a.resolve(false);
    }
    _done(ok) {
      const a = this.act;
      if (!a) return;
      this.act = null;
      a.resolve(ok !== false);
    }
    wait(s) {
      return this._start("wait", { until: this.t + s });
    }
    pose_(pose, s) {
      return this._start("pose", { pose, until: this.t + s });
    }
    /** 下一帧（防止空转的 async 循环把页面卡死） */
    frame() {
      return this._start("wait", { until: this.t });
    }
    /** 不占动作槽的等待：自己的行为循环用它"让出"，不会打断导演/外部指令正在让角色做的事 */
    sleep(s) {
      return new Promise((res) => this._timers.push({ until: this.t + s, res }));
    }
    walkTo(x, y, opts) {
      const nav = this.app.nav;
      const path = nav.path({ x: this.x, y: this.y }, { x, y });
      if (!path) return Promise.resolve(false);
      if (path.length < 2 && Math.hypot(x - this.x, y - this.y) < 0.05) return Promise.resolve(true);
      return this._start("walk", { path, i: 1, run: !!(opts && opts.run), ver: this.app.world.version, goal: { x, y } });
    }
    /** 直线挪一小步（进出交互位，忽略阻挡） */
    stepTo(x, y, s = 0.35) {
      if (Math.hypot(x - this.x, y - this.y) < 0.02) return Promise.resolve(true);
      return this._start("step", { from: { x: this.x, y: this.y }, to: { x, y }, t0: this.t, dur: s });
    }
    face(x, y) {
      const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (d > 0.01) this.dir = [dx / d, dy / d];
    }
    /** 走到家具的交互位并使用 dur 秒；成功用完返回 true */
    async useSlot(obj, slot, dur, opts = {}) {
      const w = this.app.world;
      if (!w.reserve(obj, slot, this.id)) return false;
      try {
        const sp = w.slotPose(obj, slot);
        if (!sp) return false;
        const appr = sp.approach || this.app.nav.nearestFree(sp.x + sp.face[0] * 0.7, sp.y + sp.face[1] * 0.7, 3) || sp;
        if (!await this.walkTo(appr.x, appr.y)) return false;
        if (!w.byId.has(obj.id)) return false;
        if (!await this.stepTo(sp.x, sp.y)) return false;
        this.attach = { obj, slot, sp };
        this.dir = sp.face.slice();
        this.z = sp.z || 0;
        if (slot.sets) w.apply({ t: "state", id: obj.id, patch: slot.sets }, { silent: true });
        if (opts.onStart) opts.onStart();
        const ok = await this._start("use", { pose: slot.pose, until: this.t + dur });
        this._leaveSlot(obj, slot);
        if (ok) await this.stepTo(appr.x, appr.y);
        return ok;
      } finally {
        w.release(obj, slot, this.id);
        if (this.attach && this.attach.obj === obj) this._leaveSlot(obj, slot);
      }
    }
    _leaveSlot(obj, slot) {
      if (!this.attach) return;
      this.attach = null;
      this.z = 0;
      if (slot.sets) {
        const undo = {};
        for (const k in slot.sets) undo[k] = void 0;
        this.app.world.apply({ t: "state", id: obj.id, patch: undo }, { silent: true });
      }
    }
    say(text2, ms) {
      if (!text2) {
        this.speech = null;
        return;
      }
      this.speech = { text: String(text2), until: this.t + (ms || Math.min(6e3, 1600 + String(text2).length * 140)) / 1e3 };
      this.body.talk();
      this.app.bus.emit("agent:say", { id: this.id, text: this.speech.text });
    }
    emote(kind, s = 2) {
      this.emo = { kind, until: this.t + s, t0: this.t };
    }
    setExpr(expr, s = 2) {
      this.expr = expr;
      this._exprUntil = this.t + s;
    }
    bounce(k = 1) {
      this._sqv -= 3 * k;
      this.body.bounce(k);
    }
    /* ───────── 每帧 ───────── */
    update(dt) {
      this.t += dt;
      if (this._timers.length) {
        const due = this._timers.filter((x) => this.t >= x.until);
        if (due.length) {
          this._timers = this._timers.filter((x) => this.t < x.until);
          due.forEach((x) => x.res(true));
        }
      }
      this._blinkAt -= dt;
      if (this._blinkAt <= 0) {
        this._blinkT = 0.16;
        this._blinkAt = rand(2.2, 5.5);
      }
      if (this._blinkT > 0) {
        this._blinkT -= dt;
        this.blink = Math.sin(Math.max(0, this._blinkT) / 0.16 * Math.PI);
      } else this.blink = 0;
      this._sqv += (-this.sq * 260 - this._sqv * 12) * dt;
      this.sq = clamp(this.sq + this._sqv * dt, -0.25, 0.3);
      if (this.expr && this.t > this._exprUntil) this.expr = null;
      if (this.speech && this.t > this.speech.until) this.speech = null;
      if (this.emo && this.t > this.emo.until) this.emo = null;
      const a = this.act;
      let pose = this.attach ? this.attach.slot.pose : "stand";
      if (a) {
        switch (a.kind) {
          case "walk":
            pose = this._walk(a, dt);
            break;
          case "step": {
            const k = clamp((this.t - a.t0) / a.dur, 0, 1);
            this.x = a.from.x + (a.to.x - a.from.x) * k;
            this.y = a.from.y + (a.to.y - a.from.y) * k;
            const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y, d = Math.hypot(dx, dy);
            if (d > 0.01) this.dir = [dx / d, dy / d];
            this.phase += dt * 9;
            pose = "walk";
            if (k >= 1) this._done(true);
            break;
          }
          case "use":
            pose = a.pose;
            if (this.t >= a.until) this._done(true);
            break;
          case "pose":
            pose = a.pose;
            if (this.t >= a.until) this._done(true);
            break;
          case "wait":
            if (this.t >= a.until) this._done(true);
            break;
        }
      }
      if (this.status && this.status.state === "thinking" && this.attach && !this.emo) this.emote("think", 2.5);
      if (pose !== "walk" && pose !== "run") this.phase = 0;
      this.pose = pose;
      const f = screenFacing(this.dir[0], this.dir[1]);
      if (f.right !== null) this.right = f.right;
      this.front = f.front;
      this.body.update(dt);
    }
    _walk(a, dt) {
      const nav = this.app.nav, w = this.app.world;
      if (a.ver !== w.version) {
        const p = nav.path({ x: this.x, y: this.y }, a.goal);
        a.ver = w.version;
        if (!p) {
          this._done(false);
          return "stand";
        }
        a.path = p;
        a.i = 1;
      }
      let tgt = a.path[a.i];
      if (!tgt) {
        this._done(true);
        return "stand";
      }
      let dx = tgt.x - this.x, dy = tgt.y - this.y, d = Math.hypot(dx, dy);
      const speed = (a.run ? 3.1 : 1.55) * (this.data.speed || 1);
      let step = speed * dt;
      while (d <= step && tgt) {
        this.x = tgt.x;
        this.y = tgt.y;
        step -= d;
        a.i++;
        tgt = a.path[a.i];
        if (!tgt) {
          this._done(true);
          return "stand";
        }
        dx = tgt.x - this.x;
        dy = tgt.y - this.y;
        d = Math.hypot(dx, dy);
      }
      if (d > 1e-6) {
        this.x += dx / d * step;
        this.y += dy / d * step;
        const k = ease(14, dt);
        this.dir = [this.dir[0] + (dx / d - this.dir[0]) * k, this.dir[1] + (dy / d - this.dir[1]) * k];
      }
      this.phase += dt * (a.run ? 15 : 9.5);
      return a.run ? "run" : "walk";
    }
    /** 面板用的快照 */
    snapshot() {
      return {
        id: this.id,
        name: this.name,
        activity: this.activity,
        pose: this.pose,
        needs: Object.assign({}, this.needs),
        status: this.status,
        x: this.x,
        y: this.y,
        brain: this.data.brain
      };
    }
  };

  // web/roomkit/brain.js
  var urgency = (v) => Math.pow(1 - clamp(v == null ? 0.5 : v, 0, 1), 2) * 1.6 + 0.04;
  var PHRASES = {
    idle: ["今天也要加油鸭", "泡泡……", "有点想吃零食", "窗外好安静", "嘿嘿", "这个房间真舒服", "要不要去看看书"],
    night: ["好困……", "再玩五分钟", "月亮出来了"],
    poke: ["在呢~", "别戳啦", "嘿嘿", "干嘛呀", "今天也很开心"],
    greet: ["你来啦！", "欢迎~", "嗨嗨"],
    cheer: ["搞定啦！", "完成！✨", "耶，好了好了", "这一版顺利！"],
    oops: ["呜…出错了", "等等我看看", "哎呀，翻车了"],
    wait: ["在等你回复哦", "需要你确认一下~", "我在这儿等着"],
    chats: [
      ["你在忙什么呀", "在整理书架！", "要帮忙吗", "好呀好呀"],
      ["今天天气不错", "适合晒太阳", "我想去窗边"],
      ["你吃饭了吗", "吃了一大碗白饭", "哈哈哈"],
      ["新来的家具好看吗", "超喜欢那个沙发", "我也是！"],
      ["要一起看书吗", "好啊，你推荐一本", "《鲸鱼的一百种睡姿》"],
      ["嘘——", "怎么啦", "没事，就想叫叫你"]
    ]
  };
  var Brain = class {
    constructor(agent, app) {
      this.a = agent;
      this.app = app;
      this.alive = true;
      this._run();
    }
    stop() {
      this.alive = false;
      this.a.cancel();
    }
    get mode() {
      return this.a.data.brain || "auto";
    }
    async _run() {
      await this.a.sleep(rand(0.3, 1.5));
      while (this.alive) {
        const t0 = this.a.t;
        try {
          await this.tick();
        } catch (e) {
          console.error("[roomkit] 角色行为出错:", this.a.id, e);
        }
        if (!this.alive) break;
        if (this.a.t - t0 < 0.05) await this.a.sleep(0.4);
      }
    }
    async tick() {
      const a = this.a;
      if (a.queue.length) {
        await this.app.exec(a, a.queue.shift());
        return;
      }
      if (a.engaged) {
        await a.sleep(0.5);
        return;
      }
      if (a.status && a.status.state) {
        await this.statusRoutine();
        return;
      }
      if (this.mode === "manual" || this.mode === "external") {
        await this.idle(rand(3, 6));
        return;
      }
      await this.perform(this.choose());
    }
    /* ───────── 自主：选下一件事 ───────── */
    choose() {
      const a = this.a, w = this.app.world, night = this.app.isNight();
      const card = this.app.characterOf(a);
      const likes = card && card.likes || {};
      const hour = this.app.hour();
      const prefer = (card && card.schedule || []).filter((s) => s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to).map((s) => s.prefer);
      const opts = [];
      for (const o of w.objects) {
        if (o.wall) continue;
        const d = w.def(o);
        if (!d || !d.slots.length) continue;
        for (const s of d.slots) {
          if (s.manual) continue;
          const occ = w.occupant(o, s);
          if (occ && occ !== a.id) continue;
          let gain = 0;
          for (const k in s.need) gain += s.need[k] * urgency(a.needs[k]);
          if (s.pose === "sleep") gain *= night ? 3.2 : 0.3;
          if (prefer.indexOf(s.pose) >= 0) gain *= 2.5;
          gain *= likes[d.id] != null ? likes[d.id] : likes[d.cat] != null ? likes[d.cat] : 1;
          if (gain <= 0.01) continue;
          if (!w.slotUsable(o, s, this.app.nav)) continue;
          const sp = w.slotPose(o, s);
          if (!sp) continue;
          const dist = Math.hypot(sp.x - a.x, sp.y - a.y);
          opts.push({ kind: "slot", o, s, score: gain / (1 + dist * 0.06) * rand(0.75, 1.25) });
        }
      }
      if (!night || Math.random() < 0.25) {
        for (const b of this.app.agents.values()) {
          if (b === a || !this.app.director.available(b)) continue;
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          opts.push({ kind: "chat", b, score: urgency(a.needs.social) * 0.9 / (1 + dist * 0.05) * rand(0.7, 1.3) });
        }
      }
      opts.push({ kind: "wander", score: 0.16 * rand(0.5, 1.5) });
      opts.push({ kind: "idle", score: 0.12 * rand(0.5, 1.5) });
      opts.sort((p, q) => q.score - p.score);
      return opts[0];
    }
    async perform(c) {
      const a = this.a;
      if (!c) return this.idle(2);
      if (c.kind === "slot") {
        const night = this.app.isNight();
        let dur = rand(c.s.dur[0], c.s.dur[1]);
        if (c.s.pose === "sleep" && night) dur *= 6;
        a.activity = c.s.label || poseName(c.s.pose);
        const ok = await a.useSlot(c.o, c.s, dur, {
          onStart: () => {
            if (c.s.say && Math.random() < 0.5) a.say(pick(c.s.say));
            if (c.s.emote) a.emote(c.s.emote, 2.4);
          }
        });
        if (ok) for (const k in c.s.need) a.needs[k] = clamp((a.needs[k] || 0) + c.s.need[k], 0, 1);
        return ok;
      }
      if (c.kind === "chat") return this.app.director.chat(a, c.b);
      if (c.kind === "wander") return this.wander();
      return this.idle(rand(2, 5));
    }
    async wander() {
      const a = this.a, nav = this.app.nav, r = this.app.world.room;
      a.activity = "闲逛";
      for (let i = 0; i < 8; i++) {
        const x = clamp(a.x + rand(-4, 4), 0.3, r.w - 0.3), y = clamp(a.y + rand(-4, 4), 0.3, r.h - 0.3);
        if (!nav.freeAt(x, y)) continue;
        const ok = await a.walkTo(x, y);
        if (ok && Math.random() < 0.35) await a.pose_("look", rand(1.5, 3));
        return ok;
      }
      return this.idle(2);
    }
    async idle(s) {
      const a = this.a;
      a.activity = "发呆";
      const r = Math.random();
      if (r < 0.12) a.say(this.app.phrase(a, this.app.isNight() ? "night" : "idle"));
      else if (r < 0.22) a.emote(pick(["note", "heart", "idea"]), 2);
      return a.pose_(Math.random() < 0.4 ? "look" : "stand", s);
    }
    /* ───────── 工作状态（DSH 会话事件驱动） ─────────
     * thinking/working/result → 去书桌；waiting → 书桌旁踱步张望；success → 蹦跶庆祝；error → 垂头冒汗
     */
    async statusRoutine() {
      const a = this.a, st = a.status.state, stamp = a.status.ts;
      const desk = this.app.findSlot((d, s) => s.pose === "work", a);
      if (st === "thinking" || st === "working" || st === "result") {
        a.activity = st === "thinking" ? "思考中" : st === "working" ? "干活中" : "整理结果";
        if (desk) {
          await a.useSlot(desk.o, desk.s, 3600, {
            onStart: () => {
              if (st === "working" && a.status && a.status.task) a.say(a.status.task, 3500);
            }
          });
        } else {
          await a.pose_("work", 30);
        }
        return;
      }
      const consume = () => {
        if (a.status && a.status.ts === stamp) a.status = null;
      };
      if (st === "waiting") {
        a.activity = "等你回复";
        a.say(this.app.phrase(a, "wait"), 3e3);
        a.emote("?", 3);
        const base = desk ? this.app.world.slotPose(desk.o, desk.s) : { x: a.x, y: a.y };
        for (let i = 0; i < 3 && a.status && a.status.state === "waiting"; i++) {
          const p = this.app.nav.nearestFree(base.x + rand(-1.2, 1.2), base.y + rand(-1.2, 1.2), 3);
          if (p && !await a.walkTo(p.x, p.y)) return;
          if (!await a.pose_("look", rand(2, 3.5))) return;
        }
        return;
      }
      if (st === "success") {
        a.activity = "庆祝";
        a.emote("spark", 2.6);
        a.say(this.app.phrase(a, "cheer"), 2600);
        a.setExpr("happy", 3);
        a.bounce(1.2);
        await a.pose_("jump", 2.4);
        consume();
        return;
      }
      if (st === "error") {
        a.activity = "沮丧";
        a.emote("sweat", 3);
        a.say(this.app.phrase(a, "oops"), 3e3);
        await a.pose_("sad", 3.5);
        consume();
        return;
      }
      consume();
    }
  };
  var Director = class {
    constructor(app) {
      this.app = app;
    }
    available(b) {
      return !b.engaged && !b.attach && !(b.status && b.status.state) && !b.queue.length && b.data.brain !== "manual" && !(b.act && b.act.kind === "use");
    }
    /** a 走到 b 身边，面对面聊几句 */
    async chat(a, b) {
      if (!this.available(b)) return false;
      a.engaged = b.id;
      b.engaged = a.id;
      b.cancel();
      try {
        const nav = this.app.nav;
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
        const spot = nav.nearestFree(b.x + dx / d * 0.85, b.y + dy / d * 0.85, 2);
        a.activity = b.activity = "聊天";
        if (spot && !await a.walkTo(spot.x, spot.y)) return false;
        a.face(b.x, b.y);
        b.face(a.x, a.y);
        const lines = pick(PHRASES.chats);
        for (let i = 0; i < lines.length; i++) {
          const sp = i % 2 ? b : a;
          sp.say(lines[i], 2300);
          sp.bounce(0.4);
          if (Math.random() < 0.35) sp.emote(pick(["heart", "note", "!", "spark"]), 1.6);
          if (!await a.wait(2.5)) return false;
        }
        a.needs.social = clamp(a.needs.social + 0.45, 0, 1);
        b.needs.social = clamp(b.needs.social + 0.45, 0, 1);
        a.needs.fun = clamp(a.needs.fun + 0.1, 0, 1);
        b.needs.fun = clamp(b.needs.fun + 0.1, 0, 1);
        return true;
      } finally {
        a.engaged = null;
        b.engaged = null;
      }
    }
    /**
     * 小剧场：play = { id, name, steps:[...] }；ctx = { target: 触发它的家具, who: 默认主角 }
     * step: { who, do:'goto'|'use'|'say'|'emote'|'expr'|'pose'|'face'|'wait'|'state'|'sfx'|'outfit', ... }，
     *       { par:[step...] } 并行。剧情（story.js）复用同一套步骤。
     */
    async run(play, ctx = {}) {
      var _a;
      if ((_a = this.app.worldSession) == null ? void 0 : _a.id) return false;
      const cast = /* @__PURE__ */ new Set();
      this.app.bus.emit("play:start", { id: play.id, name: play.name });
      try {
        for (const s of play.steps || []) {
          const ok = await this.doStep(s, ctx, cast);
          if (ok === false && !s.optional) break;
        }
      } finally {
        this.release(cast);
        this.app.bus.emit("play:end", { id: play.id });
      }
    }
    release(cast) {
      cast.forEach((a) => {
        if (a.engaged === "play") a.engaged = null;
      });
    }
    /** who：'pet'/'$who'（主角）| 'any'（离目标最近的空闲角色）| 剧本里的角色名（ctx.roles）| 角色 id */
    resolveWho(who, ctx) {
      const app = this.app;
      if (ctx.roles && who && ctx.roles[who]) return ctx.roles[who];
      if (!who || who === "pet" || who === "$who") return ctx.who || app.mainAgent();
      if (who === "any") return app.nearestAgent(ctx.target) || app.mainAgent();
      return app.agents.get(who) || null;
    }
    resolveObj(ref, ctx) {
      const w = this.app.world;
      if (ref === "$target" || !ref) return ctx.target || null;
      return w.byId.get(ref) || w.objects.find((o) => o.def === ref) || null;
    }
    /** 目标点（格坐标）：角色 → 脚下；家具 → 占地中心；[x,y] → 原样 */
    resolvePoint(ref, ctx) {
      if (Array.isArray(ref)) return { x: ref[0], y: ref[1] };
      const a = this.app.agents.get(ref) || ctx.roles && ctx.roles[ref];
      if (a) return { x: a.x, y: a.y };
      const o = this.resolveObj(ref, ctx);
      const f = o && this.app.world.footprint(o);
      if (f) return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 };
      return null;
    }
    async doStep(s, ctx, cast) {
      const app = this.app;
      if (s.par) {
        const r = await Promise.all(s.par.map((x) => this.doStep(x, ctx, cast)));
        return r.every((x) => x !== false);
      }
      if (s.do === "wait") {
        await new Promise((r) => setTimeout(r, (s.s || 1) * 1e3));
        return true;
      }
      if (s.do === "sfx") {
        app.sfx(s.name || "pop");
        return true;
      }
      if (s.do === "state") {
        const o = this.resolveObj(s.obj, ctx);
        if (o) app.world.apply({ t: "state", id: o.id, patch: s.patch || {} });
        return true;
      }
      if (s.do === "env") {
        app.command(Object.assign({ op: "env.set" }, s.period !== void 0 ? { period: s.period } : {}, s.weather ? { weather: s.weather } : {}));
        return true;
      }
      const a = this.resolveWho(s.who, ctx);
      if (!a) return false;
      if (!cast.has(a)) {
        cast.add(a);
        a.cancel();
        a.engaged = "play";
      }
      switch (s.do) {
        case "say":
          a.say(s.text, s.ms);
          return true;
        case "emote":
          a.emote(s.kind || "heart", s.s || 2);
          return true;
        case "expr":
          a.setExpr(s.expr || "happy", s.s || 2);
          return true;
        case "outfit": {
          const hats = s.hats || ["", "maid", "bow", "cap"];
          const cur = a.data.look && a.data.look.hat || "";
          const next = s.hat != null ? s.hat : hats[(hats.indexOf(cur) + 1) % hats.length];
          app.world.apply({ t: "agent.set", id: a.id, patch: { look: Object.assign({}, a.data.look, { hat: next }) } });
          a.bounce(0.8);
          return true;
        }
        case "pose":
          return a.pose_(s.pose || "stand", s.s || 2);
        case "face": {
          const p = this.resolvePoint(s.to, ctx);
          if (p) a.face(p.x, p.y);
          return true;
        }
        case "goto":
        case "use": {
          const o = s.obj ? this.resolveObj(s.obj, ctx) : null;
          if (o) {
            const d = app.world.def(o);
            const slot = d && (d.slots.find((x) => x.id === s.slot) || (s.do === "use" ? d.slots[0] : null));
            if (slot) return a.useSlot(o, slot, s.do === "use" ? s.s || rand(slot.dur[0], slot.dur[1]) : 0.1);
            const fp = app.world.footprint(o);
            const p = fp && app.nav.nearestFree((fp.x0 + fp.x1) / 2, fp.y1 + 0.5, 3);
            return p ? a.walkTo(p.x, p.y, { run: s.run }) : false;
          }
          if (s.to) {
            const p = this.resolvePoint(s.to, ctx);
            const q = p && app.nav.nearestFree(p.x + (s.dx || 0), p.y + (s.dy || 0.9), 3);
            return q ? a.walkTo(q.x, q.y, { run: s.run }) : false;
          }
          if (s.x != null) return a.walkTo(s.x, s.y, { run: s.run });
          return false;
        }
      }
      return true;
    }
  };

  // web/roomkit/env.js
  var PERIODS = [
    { id: "dawn", label: "清晨", hour: 6.5, sky: ["#9fb8e0", "#f6dcc2"], tint: "#d7def2", tintK: 0.18, dark: 0.1, sun: 0.35 },
    { id: "noon", label: "中午", hour: 12, sky: ["#78b8ee", "#dff1ff"], tint: "#ffffff", tintK: 0, dark: 0, sun: 0.3 },
    { id: "dusk", label: "傍晚", hour: 17.8, sky: ["#8c9fd6", "#ffc193"], tint: "#ffd2a8", tintK: 0.22, dark: 0.1, sun: 0.55 },
    { id: "night", label: "夜晚", hour: 22, sky: ["#101a36", "#2b3a68"], tint: "#46558c", tintK: 0.3, dark: 0.5, sun: 0 }
  ];
  var KEYS = [
    { h: 4.8, p: "night" },
    { h: 6.5, p: "dawn" },
    { h: 9, p: "noon" },
    { h: 15.5, p: "noon" },
    { h: 17.8, p: "dusk" },
    { h: 19.6, p: "night" }
  ];
  var WEATHERS = {
    clear: { label: "晴", dark: 0, sky: 0, tint: null },
    cloudy: { label: "阴", dark: 0.05, sky: 0.35, tint: "#c9ced8" },
    rain: { label: "雨", dark: 0.1, sky: 0.45, tint: "#b8c3d6" },
    snow: { label: "雪", dark: 0.04, sky: 0.3, tint: "#e3ecf7" }
  };
  var byId = (id) => PERIODS.find((p) => p.id === id) || PERIODS[1];
  function envAt(hour, weatherId) {
    const h = (hour % 24 + 24) % 24;
    let a = KEYS[KEYS.length - 1], b = KEYS[0], t = 0;
    for (let i = 0; i < KEYS.length; i++) {
      const p = KEYS[i], q = KEYS[(i + 1) % KEYS.length];
      const h0 = p.h, h1 = q.h > h0 ? q.h : q.h + 24;
      const hh = h < h0 ? h + 24 : h;
      if (hh >= h0 && hh < h1) {
        a = p;
        b = q;
        t = (hh - h0) / (h1 - h0);
        break;
      }
    }
    const A = byId(a.p), B = byId(b.p), k = smooth(clamp(t, 0, 1));
    const w = WEATHERS[weatherId] || WEATHERS.clear;
    const grey = "#9aa6b8";
    const base = k < 0.5 ? A : B;
    const env = {
      id: base.id,
      label: base.label,
      hour: h,
      sky: [mix(mix(A.sky[0], B.sky[0], k), grey, w.sky), mix(mix(A.sky[1], B.sky[1], k), grey, w.sky * 0.8)],
      tint: mix(A.tint, B.tint, k),
      tintK: lerp(A.tintK, B.tintK, k),
      dark: clamp(lerp(A.dark, B.dark, k) + w.dark, 0, 0.7),
      sun: lerp(A.sun, B.sun, k) * (weatherId === "clear" || !weatherId ? 1 : 0.25),
      weather: weatherId in WEATHERS ? weatherId : "clear"
    };
    env.night = lerp(A.dark, B.dark, k) > 0.3;
    if (w.tint) {
      env.tint = mix(env.tint, w.tint, 0.5);
      env.tintK = Math.max(env.tintK, 0.12);
    }
    return env;
  }
  function periodHour(id) {
    return byId(id).hour;
  }
  function nowHour() {
    const d = /* @__PURE__ */ new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  // web/roomkit/depth.js
  var EPS = 1e-4;
  var key = (it) => (it.x0 + it.x1 + it.y0 + it.y1) * 0.5 + (it.z0 + it.z1) * 5e-4 + (it.bias || 0);
  function cmp(a, b) {
    if (a.after && a.after === b.id) return 1;
    if (b.after && b.after === a.id) return -1;
    if (a.before && a.before === b.id) return -1;
    if (b.before && b.before === a.id) return 1;
    if (a.x1 <= b.x0 + EPS) return -1;
    if (b.x1 <= a.x0 + EPS) return 1;
    if (a.y1 <= b.y0 + EPS) return -1;
    if (b.y1 <= a.y0 + EPS) return 1;
    if (a.z1 <= b.z0 + EPS) return -1;
    if (b.z1 <= a.z0 + EPS) return 1;
    return key(a) < key(b) ? -1 : 1;
  }
  function depthSort(items) {
    const n = items.length;
    if (n < 2) return items.slice();
    const behind = new Array(n);
    for (let i = 0; i < n; i++) behind[i] = [];
    for (let i = 0; i < n; i++) {
      const a = items[i];
      for (let j = i + 1; j < n; j++) {
        const b = items[j];
        if (a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t) continue;
        if (cmp(a, b) < 0) behind[j].push(i);
        else behind[i].push(j);
      }
    }
    const order = items.map((_, i) => i).sort((i, j) => key(items[i]) - key(items[j]));
    const mark = new Uint8Array(n), out = [];
    const visit = (i) => {
      if (mark[i]) return;
      mark[i] = 1;
      for (const j of behind[i]) visit(j);
      out.push(items[i]);
    };
    for (const i of order) visit(i);
    return out;
  }

  // web/roomkit/paint-room.js
  var WALL_T = 0.14;
  function paintFloor(ctx, world, iso, opts = {}) {
    const r = world.room, slab = r.slab || 0;
    const P = (x, y, z = 0) => iso.toWorld(x, y, z);
    const poly2 = (pts, fill) => {
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    if (slab > 0) {
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const m = world.cell(x, y);
          if (m < 0) continue;
          const c = r.mats[m].color;
          if (!world.isFloor(x + 1, y)) poly2([P(x + 1, y), P(x + 1, y + 1), P(x + 1, y + 1, -slab), P(x + 1, y, -slab)], shade(c, -0.34));
          if (!world.isFloor(x, y + 1)) poly2([P(x, y + 1), P(x + 1, y + 1), P(x + 1, y + 1, -slab), P(x, y + 1, -slab)], shade(c, -0.2));
        }
      }
    }
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const m = world.cell(x, y);
        if (m < 0) continue;
        paintCell(ctx, iso, x, y, r.mats[m]);
      }
    }
    if (opts.grid) paintGrid(ctx, world, iso);
  }
  function quad(ctx, iso, x0, y0, x1, y1, fill) {
    const a = iso.toWorld(x0, y0), b = iso.toWorld(x1, y0), c = iso.toWorld(x1, y1), d = iso.toWorld(x0, y1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function seg(ctx, iso, x0, y0, x1, y1) {
    const a = iso.toWorld(x0, y0), b = iso.toWorld(x1, y1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  function paintCell(ctx, iso, x, y, mat) {
    const c = mat.color || "#e3a46a";
    switch (mat.kind) {
      case "wood": {
        const L = 1.6, strips = 4;
        for (let k = 0; k < strips; k++) {
          const s = y * strips + k, y0 = y + k / strips, y1 = y0 + 1 / strips;
          const off = hash2(s, 7) * L;
          const first = Math.floor((x - off) / L), last = Math.ceil((x + 1 - off) / L);
          for (let n = first; n < last; n++) {
            const x0 = Math.max(x, off + n * L);
            const end = Math.min(x + 1, off + (n + 1) * L);
            if (end - x0 < 1e-6) continue;
            const v = (hash2(s, n, 3) - 0.5) * 0.09;
            quad(ctx, iso, x0, y0, end, y1, shade(c, v));
            if (end < x + 1 - 1e-6) {
              ctx.beginPath();
              seg(ctx, iso, end, y0, end, y1);
              ctx.strokeStyle = rgba(shade(c, -0.25), 0.55);
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
          ctx.beginPath();
          seg(ctx, iso, x, y1, x + 1, y1);
          ctx.strokeStyle = rgba(shade(c, -0.22), 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        break;
      }
      case "tile": {
        const n = 2;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          quad(ctx, iso, x + i / n, y + j / n, x + (i + 1) / n, y + (j + 1) / n, (i + j + x + y) % 2 ? shade(c, -0.06) : c);
        }
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          seg(ctx, iso, x + i / n, y, x + i / n, y + 1);
          seg(ctx, iso, x, y + i / n, x + 1, y + i / n);
        }
        ctx.strokeStyle = rgba(shade(c, -0.25), 0.45);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
      case "carpet": {
        quad(ctx, iso, x, y, x + 1, y + 1, c);
        for (let i = 0; i < 7; i++) {
          const px = x + hash2(x, y, i) * 0.9 + 0.05, py = y + hash2(y, x, i + 9) * 0.9 + 0.05, p = iso.toWorld(px, py);
          ctx.fillStyle = rgba(shade(c, i % 2 ? 0.12 : -0.1), 0.6);
          ctx.fillRect(p.x - 1, p.y - 0.5, 2, 1);
        }
        break;
      }
      case "grass": {
        quad(ctx, iso, x, y, x + 1, y + 1, shade(c, (hash2(x, y, 5) - 0.5) * 0.06));
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const p = iso.toWorld(x + hash2(x, y, i) * 0.9 + 0.05, y + hash2(y, x, i + 4) * 0.9 + 0.05);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 1.5, p.y - 5);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 1.8, p.y - 4);
        }
        ctx.strokeStyle = rgba(shade(c, -0.22), 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
      case "stone": {
        quad(ctx, iso, x, y, x + 1, y + 1, shade(c, (hash2(x, y, 2) - 0.5) * 0.1));
        ctx.beginPath();
        seg(ctx, iso, x + 1, y, x + 1, y + 1);
        seg(ctx, iso, x, y + 1, x + 1, y + 1);
        ctx.strokeStyle = rgba(shade(c, -0.3), 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      default:
        quad(ctx, iso, x, y, x + 1, y + 1, c);
    }
  }
  function paintGrid(ctx, world, iso, color = "rgba(255,255,255,.28)") {
    const r = world.room;
    ctx.beginPath();
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!world.isFloor(x, y)) continue;
      seg(ctx, iso, x, y, x + 1, y);
      seg(ctx, iso, x, y, x, y + 1);
      if (!world.isFloor(x + 1, y)) seg(ctx, iso, x + 1, y, x + 1, y + 1);
      if (!world.isFloor(x, y + 1)) seg(ctx, iso, x, y + 1, x + 1, y + 1);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function wallRuns(world, side) {
    const r = world.room, len = side === "left" ? r.h : r.w, runs = [];
    let start = -1;
    for (let i = 0; i <= len; i++) {
      const ok = i < len && (side === "left" ? world.isFloor(0, i) : world.isFloor(i, 0));
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) {
        runs.push([start, i]);
        start = -1;
      }
    }
    return runs;
  }
  function wallPoint(iso, side, u, z, out = 0) {
    return side === "left" ? iso.toWorld(-out, u, z) : iso.toWorld(u, -out, z);
  }
  function paintWalls(ctx, world, iso, env, t, opts = {}) {
    const r = world.room, W = r.walls;
    if (!W.left && !W.right) return;
    const H = W.height;
    const sides = [];
    if (W.left) sides.push("left");
    if (W.right) sides.push("right");
    for (const side of sides) {
      const face3 = side === "left" ? W.color : shade(W.color, -0.05);
      for (const [u0, u1] of wallRuns(world, side)) {
        const fill = (z0, z1, color) => {
          const a2 = wallPoint(iso, side, u0, z0), b2 = wallPoint(iso, side, u1, z0), c2 = wallPoint(iso, side, u1, z1), d2 = wallPoint(iso, side, u0, z1);
          ctx.beginPath();
          ctx.moveTo(a2.x, a2.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.lineTo(d2.x, d2.y);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        };
        fill(0, H, face3);
        if (W.pattern === "stripes" || W.pattern === "dots" || W.pattern === "bricks") paintWallPattern(ctx, iso, side, u0, u1, H, face3, W.pattern);
        const wz = Math.round(H * 0.3);
        if (W.wainscot) {
          fill(0, wz, side === "left" ? W.wainscot : shade(W.wainscot, -0.06));
          fill(wz - 2, wz + 5, side === "left" ? W.trim : shade(W.trim, -0.06));
        }
        fill(0, 9, side === "left" ? W.trim : shade(W.trim, -0.06));
        const capC = shade(W.trim, -0.02);
        const a = wallPoint(iso, side, u0, H), b = wallPoint(iso, side, u1, H), c = wallPoint(iso, side, u1, H, WALL_T), d = wallPoint(iso, side, u0, H, WALL_T);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = capC;
        ctx.fill();
        const endU = u1, e0 = wallPoint(iso, side, endU, 0), e1 = wallPoint(iso, side, endU, 0, WALL_T), e2 = wallPoint(iso, side, endU, H, WALL_T), e3 = wallPoint(iso, side, endU, H);
        ctx.beginPath();
        ctx.moveTo(e0.x, e0.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.lineTo(e3.x, e3.y);
        ctx.closePath();
        ctx.fillStyle = shade(W.color, -0.1);
        ctx.fill();
      }
    }
    if (W.left && W.right && world.isFloor(0, 0)) {
      const p = (x, y) => iso.toWorld(x, y, H);
      const q = [p(0, 0), p(0, -WALL_T), p(-WALL_T, -WALL_T), p(-WALL_T, 0)];
      ctx.beginPath();
      q.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
      ctx.closePath();
      ctx.fillStyle = shade(W.trim, -0.02);
      ctx.fill();
    }
    if (W.left && W.right) {
      const a = iso.toWorld(0, 0, 0), b = iso.toWorld(0, 0, H);
      const g = ctx.createLinearGradient(a.x - 14, 0, a.x + 14, 0);
      g.addColorStop(0, "rgba(60,50,40,0)");
      g.addColorStop(0.5, "rgba(60,50,40,.10)");
      g.addColorStop(1, "rgba(60,50,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(a.x - 14, b.y, 28, a.y - b.y);
    }
  }
  function paintWallPattern(ctx, iso, side, u0, u1, H, base, pattern) {
    ctx.save();
    const a = wallPoint(iso, side, u0, 0), b = wallPoint(iso, side, u1, 0), c = wallPoint(iso, side, u1, H), d = wallPoint(iso, side, u0, H);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.clip();
    if (pattern === "bricks") {
      ctx.strokeStyle = rgba(shade(base, -0.16), 0.6);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let z = 0, row = 0; z < H; z += 22, row++) {
        if (z > 0) {
          const a0 = wallPoint(iso, side, u0, z), a1 = wallPoint(iso, side, u1, z);
          ctx.moveTo(a0.x, a0.y);
          ctx.lineTo(a1.x, a1.y);
        }
        const z1 = Math.min(z + 22, H);
        for (let u = u0 + (row % 2 ? 0.25 : 0.5); u < u1; u += 0.5) {
          const p = wallPoint(iso, side, u, z), q = wallPoint(iso, side, u, z1);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
        }
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    const step = pattern === "stripes" ? 0.25 : 0.2;
    for (let u = u0; u < u1; u += step) {
      if (pattern === "stripes") {
        const p = wallPoint(iso, side, u + step / 2, 0), q = wallPoint(iso, side, u + step * 0.85, 0);
        ctx.fillStyle = rgba(shade(base, -0.06), 0.55);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.lineTo(q.x, q.y - H);
        ctx.lineTo(p.x, p.y - H);
        ctx.closePath();
        ctx.fill();
      } else {
        for (let z = 20; z < H; z += 26) {
          const p = wallPoint(iso, side, u + (z / 26 % 2 ? step / 2 : 0), z);
          ctx.fillStyle = rgba(shade(base, -0.12), 0.5);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 2.2, 2.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  function wallItemFrame(iso, side, at, ww, z, wh) {
    const k = iso.hh / iso.hw;
    if (side === "left") {
      const o2 = iso.toWorld(0, at + ww / 2, z + wh);
      return { a: 1, b: -k, c: 0, d: 1, e: o2.x, f: o2.y, w: ww * iso.hw, h: wh };
    }
    const o = iso.toWorld(at - ww / 2, 0, z + wh);
    return { a: 1, b: k, c: 0, d: 1, e: o.x, f: o.y, w: ww * iso.hw, h: wh };
  }
  function wallItemQuad(fr) {
    const P = (x, y) => [fr.a * x + fr.c * y + fr.e, fr.b * x + fr.d * y + fr.f];
    return [P(0, 0), P(fr.w, 0), P(fr.w, fr.h), P(0, fr.h)];
  }
  function paintWallItem(ctx, fr, def, obj, pal, env, t, side) {
    ctx.save();
    ctx.transform(fr.a, fr.b, fr.c, fr.d, fr.e, fr.f);
    const dim = side === "right" ? -0.05 : 0;
    const draw = def.art && def.art.draw || "frame";
    const fn = WALL_ART[draw] || WALL_ART.frame;
    fn(ctx, fr.w, fr.h, pal, env, t, obj, dim, def);
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  var WALL_ART = {
    window(ctx, w, h, pal, env, t, obj, dim) {
      const frame = shade(pal("frame"), dim), b = 7;
      ctx.fillStyle = "rgba(40,40,60,.10)";
      ctx.fillRect(4, h - 2, w - 2, 8);
      ctx.fillStyle = frame;
      rr(ctx, 0, 0, w, h, 3);
      ctx.fill();
      const gx = b, gy = b, gw = w - 2 * b, gh = h - 2 * b;
      ctx.save();
      rr(ctx, gx, gy, gw, gh, 2);
      ctx.clip();
      const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, env.sky[0]);
      g.addColorStop(1, env.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(gx, gy, gw, gh);
      paintSkyDetails(ctx, gx, gy, gw, gh, env, t, obj);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath();
      ctx.moveTo(gx + gw * 0.15, gy + gh);
      ctx.lineTo(gx + gw * 0.42, gy);
      ctx.lineTo(gx + gw * 0.52, gy);
      ctx.lineTo(gx + gw * 0.25, gy + gh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.14)";
      ctx.beginPath();
      ctx.moveTo(gx + gw * 0.55, gy + gh);
      ctx.lineTo(gx + gw * 0.78, gy);
      ctx.lineTo(gx + gw * 0.82, gy);
      ctx.lineTo(gx + gw * 0.6, gy + gh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = frame;
      ctx.fillRect(w / 2 - 3, 0, 6, h);
      if (h > 90) ctx.fillRect(0, h * 0.42, w, 5);
      ctx.fillStyle = shade(frame, -0.04);
      ctx.fillRect(-5, h - 4, w + 10, 7);
      if (pal("curtain") !== "#cccccc" && obj.state.curtain !== false) {
        ctx.fillStyle = shade(pal("curtain"), dim);
        for (const sx of [-10, w - 8]) {
          ctx.beginPath();
          ctx.moveTo(sx, -8);
          ctx.lineTo(sx + 18, -8);
          ctx.quadraticCurveTo(sx + 14, h * 0.5, sx + 20, h + 4);
          ctx.lineTo(sx - 2, h + 4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = shade(pal("frame"), -0.15);
        ctx.fillRect(-14, -12, w + 28, 5);
      }
    },
    door(ctx, w, h, pal, env, t, obj, dim) {
      const frame = shade(pal("frame"), dim), wood = shade(pal("main"), dim), b = 8;
      ctx.fillStyle = frame;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = obj.state.open ? "#3a3f52" : wood;
      ctx.fillRect(b, b, w - 2 * b, h - b);
      if (!obj.state.open) {
        ctx.strokeStyle = shade(wood, -0.18);
        ctx.lineWidth = 2;
        ctx.strokeRect(b + 9, b + 10, w - 2 * b - 18, h * 0.36);
        ctx.strokeRect(b + 9, b + 22 + h * 0.36, w - 2 * b - 18, h * 0.38);
        ctx.fillStyle = "#c9b48a";
        ctx.beginPath();
        ctx.arc(w - b - 10, h * 0.55, 3.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(255,230,180,.15)";
        ctx.fillRect(b, b, (w - 2 * b) * 0.5, h - b);
      }
    },
    frame(ctx, w, h, pal, env, t, obj, dim) {
      ctx.fillStyle = "rgba(40,30,30,.10)";
      ctx.fillRect(3, 4, w, h);
      ctx.fillStyle = shade(pal("frame"), dim);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = shade("#f5efe3", dim);
      ctx.fillRect(5, 5, w - 10, h - 10);
      const x = 10, y = 10, iw = w - 20, ih = h - 20;
      const g = ctx.createLinearGradient(0, y, 0, y + ih);
      g.addColorStop(0, shade(pal("sky"), dim));
      g.addColorStop(1, shade("#fbe3c6", dim));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, iw, ih);
      ctx.fillStyle = shade(pal("sea"), dim);
      ctx.fillRect(x, y + ih * 0.62, iw, ih * 0.38);
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(x + iw * 0.75, y + ih * 0.32, ih * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade("#3d6fc4", dim);
      ctx.beginPath();
      ctx.ellipse(x + iw * 0.36, y + ih * 0.66, iw * 0.13, ih * 0.07, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + iw * 0.22, y + ih * 0.66);
      ctx.lineTo(x + iw * 0.16, y + ih * 0.55);
      ctx.lineTo(x + iw * 0.26, y + ih * 0.6);
      ctx.closePath();
      ctx.fill();
    },
    clock(ctx, w, h, pal, env, t, obj, dim) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
      ctx.fillStyle = "rgba(40,30,30,.10)";
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(pal("frame"), dim);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade("#fffaf0", dim);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a6a5a";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * (r - 7), cy - Math.cos(a) * (r - 7));
        ctx.lineTo(cx + Math.sin(a) * (r - 9.5), cy - Math.cos(a) * (r - 9.5));
        ctx.stroke();
      }
      const now = /* @__PURE__ */ new Date(), hr = now.getHours() % 12 + now.getMinutes() / 60, mn = now.getMinutes() + now.getSeconds() / 60;
      const hand = (a, len, wd, col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = wd;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
        ctx.stroke();
      };
      hand(hr / 12 * Math.PI * 2, r * 0.45, 2.6, "#3b3440");
      hand(mn / 60 * Math.PI * 2, r * 0.68, 1.8, "#3b3440");
      ctx.fillStyle = pal("accent");
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    },
    shelf(ctx, w, h, pal, env, t, obj, dim) {
      const wood = shade(pal("main"), dim);
      ctx.fillStyle = "rgba(40,30,30,.10)";
      ctx.fillRect(2, h - 4, w, 8);
      ctx.fillStyle = wood;
      ctx.fillRect(0, h - 8, w, 8);
      ctx.fillStyle = shade(wood, -0.15);
      ctx.fillRect(0, h - 2, w, 2);
      const books = ["#8fb6e8", "#f2c77b", "#e88f8f", "#9fd3b4", "#c7b2ee"];
      let x = 6;
      for (let i = 0; i < 5 && x < w * 0.62; i++) {
        const bw = 7 + i % 3 * 2, bh = h - 14 - i % 2 * 6;
        ctx.fillStyle = shade(books[i], dim);
        ctx.fillRect(x, h - 8 - bh, bw, bh);
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.fillRect(x + 1.5, h - 8 - bh + 4, bw - 3, 2);
        x += bw + 1;
      }
      const px = w * 0.8;
      ctx.fillStyle = shade("#f1ece2", dim);
      ctx.fillRect(px - 7, h - 20, 14, 12);
      ctx.fillStyle = shade("#6fbf73", dim);
      ctx.beginPath();
      ctx.ellipse(px, h - 24, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px - 6, h - 28, 5, 6, -0.5, 0, Math.PI * 2);
      ctx.fill();
    },
    /** 吊柜：两扇柜门 + 把手，柜底一道阴影 */
    cabinet(ctx, w, h, pal, env, t, obj, dim) {
      const main = shade(pal("main"), dim), door = shade(pal("accent"), dim);
      ctx.fillStyle = "rgba(40,30,30,.12)";
      ctx.fillRect(3, h - 2, w - 2, 9);
      ctx.fillStyle = main;
      rr(ctx, 0, 0, w, h, 3);
      ctx.fill();
      const n = Math.max(2, Math.round(w / 46)), gw = (w - 8) / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = door;
        rr(ctx, 4 + i * gw + 2, 5, gw - 4, h - 10, 2);
        ctx.fill();
        ctx.fillStyle = shade(main, -0.25);
        const kx = i % 2 ? 4 + i * gw + 7 : 4 + (i + 1) * gw - 9;
        ctx.fillRect(kx, h - 22, 3, 12);
      }
      ctx.fillStyle = shade(main, -0.12);
      ctx.fillRect(0, h - 3, w, 3);
    },
    /** 厨具挂架：一根横杆挂着锅铲、汤勺和小锅 */
    rack(ctx, w, h, pal, env, t, obj, dim) {
      const metal = shade(pal("main"), dim);
      ctx.fillStyle = metal;
      ctx.fillRect(0, 4, w, 4);
      ctx.fillStyle = shade(metal, -0.2);
      ctx.fillRect(-2, 2, 4, 8);
      ctx.fillRect(w - 2, 2, 4, 8);
      const tools = [["#e3a46a", "spatula"], ["#b8c0cc", "ladle"], ["#e8505b", "pan"], ["#e3a46a", "whisk"]];
      const step = w / (tools.length + 1);
      tools.forEach(([c, k], i) => {
        const x = step * (i + 1), sw = Math.sin(t * 1.2 + i) * 0.03;
        ctx.save();
        ctx.translate(x, 8);
        ctx.rotate(sw);
        ctx.fillStyle = shade(c, dim);
        ctx.fillRect(-1.2, 0, 2.4, h * 0.45);
        if (k === "spatula") ctx.fillRect(-5, h * 0.45, 10, h * 0.28);
        else if (k === "ladle") {
          ctx.beginPath();
          ctx.ellipse(0, h * 0.55, 6, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (k === "pan") {
          ctx.beginPath();
          ctx.ellipse(0, h * 0.62, 11, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.2)";
          ctx.beginPath();
          ctx.ellipse(-3, h * 0.58, 4, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = shade(c, dim);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, h * 0.6, 4, 9, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
    poster(ctx, w, h, pal, env, t, obj, dim) {
      ctx.fillStyle = "rgba(40,30,30,.10)";
      ctx.fillRect(3, 4, w, h);
      ctx.fillStyle = shade(pal("main"), dim);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = shade(pal("accent"), dim);
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, Math.min(w, h) * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(obj.state.text || "DeepSeek", w / 2, h * 0.86);
    },
    /** 自制/社区墙饰：直接把图贴到墙面上（图片缓存在定义上，加载完下一帧就出现） */
    image(ctx, w, h, pal, env, t, obj, dim, def) {
      const src = def && def.art && def.art.src;
      if (!src) return;
      if (!def._img) {
        def._img = new Image();
        def._img.src = src;
      }
      if (def._img.complete && def._img.naturalWidth) {
        ctx.fillStyle = "rgba(40,30,30,.08)";
        ctx.fillRect(3, 4, w, h);
        ctx.drawImage(def._img, 0, 0, w, h);
        if (dim) {
          ctx.fillStyle = `rgba(0,0,0,${-dim})`;
          ctx.fillRect(0, 0, w, h);
        }
      } else {
        ctx.strokeStyle = "rgba(120,120,140,.5)";
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(0, 0, w, h);
        ctx.setLineDash([]);
      }
    }
  };
  function paintSkyDetails(ctx, x, y, w, h, env, t, obj) {
    const seed = (obj.at || 0) * 13.7;
    if (env.night) {
      ctx.fillStyle = "rgba(255,255,240,.9)";
      for (let i = 0; i < 6; i++) ctx.fillRect(x + (i * 37 + seed * 7) % w, y + (i * 23 + seed) % (h * 0.6), 1.5, 1.5);
      if (env.weather === "clear") {
        ctx.fillStyle = "#fdf3c8";
        ctx.beginPath();
        ctx.arc(x + w * 0.72, y + h * 0.26, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (env.weather === "clear") {
      ctx.fillStyle = "rgba(255,250,225,.75)";
      ctx.beginPath();
      ctx.arc(x + w * 0.74, y + h * 0.24, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    const cloudA = env.weather === "clear" ? 0.55 : 0.8;
    ctx.fillStyle = env.night ? `rgba(160,170,200,${cloudA * 0.4})` : `rgba(255,255,255,${cloudA})`;
    for (let i = 0; i < (env.weather === "clear" ? 2 : 4); i++) {
      const cx = x + (t * 4 + i * 61 + seed * 10) % (w + 60) - 30, cy = y + h * (0.18 + 0.16 * i);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 16, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 10, cy - 3, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (env.weather === "rain") {
      ctx.strokeStyle = "rgba(225,235,250,.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const px = x + (i * 17.3 + seed * 3) % w, py = y + (t * 220 + i * 41) % (h + 20) - 10;
        ctx.moveTo(px, py);
        ctx.lineTo(px - 2.5, py + 9);
      }
      ctx.stroke();
    } else if (env.weather === "snow") {
      ctx.fillStyle = "rgba(255,255,255,.95)";
      for (let i = 0; i < 22; i++) {
        const px = x + (i * 19.7 + Math.sin(t * 1.3 + i) * 6 + seed * 3) % w, py = y + (t * 26 + i * 29) % (h + 10) - 5;
        ctx.beginPath();
        ctx.arc(px, py, 1.6 + i % 3 * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  function paintWindowLight(ctx, world, iso, env) {
    if (env.sun <= 0.02) return;
    for (const o of world.objects) {
      if (!o.wall) continue;
      const def = world.def(o);
      if (!def || !def.art || def.art.draw !== "window") continue;
      const ww = def.wsize[0] * 0.8, a0 = o.at - ww / 2, a1 = o.at + ww / 2, L = 2.6, s = 0.8;
      const pts = o.wall === "right" ? [[a0, 0.05], [a1, 0.05], [a1 + s, L], [a0 + s, L]] : [[0.05, a0], [0.05, a1], [L, a1 + s], [L, a0 + s]];
      const P = pts.map(([x, y]) => iso.toWorld(clamp(x, 0, world.room.w), clamp(y, 0, world.room.h)));
      const c0 = iso.toWorld(...o.wall === "right" ? [o.at, 0] : [0, o.at]), c1 = iso.toWorld(...o.wall === "right" ? [o.at + s, L] : [L, o.at + s]);
      const g = ctx.createLinearGradient(c0.x, c0.y, c1.x, c1.y);
      g.addColorStop(0, `rgba(255,244,214,${0.42 * env.sun})`);
      g.addColorStop(1, "rgba(255,244,214,0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();
      P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  // web/roomkit/paint-furniture.js
  var SQ2 = Math.SQRT2;
  function testWhen(state, when) {
    if (!when) return true;
    if (when[0] === "!") return !(state && state[when.slice(1)]);
    return !!(state && state[when]);
  }
  var ballRx = (p, iso) => p.r * iso.hw * 1.25;
  var ballRy = (p, iso) => ballRx(p, iso) * (p.sq || 0.9);
  function partBox(p, fp, obj, iso) {
    const o = fp.o;
    if (p.t === "box" || p.t === "rug" || p.t === "fx") {
      const a = o.map(p.x, p.y), b = o.map(p.x + p.w, p.y + p.d);
      const z02 = p.z || 0;
      return {
        x0: obj.x + Math.min(a[0], b[0]),
        x1: obj.x + Math.max(a[0], b[0]),
        y0: obj.y + Math.min(a[1], b[1]),
        y1: obj.y + Math.max(a[1], b[1]),
        z0: z02,
        z1: z02 + (p.t === "rug" ? 1 : p.h || 1)
      };
    }
    const c = o.map(p.x, p.y), cx = obj.x + c[0], cy = obj.y + c[1];
    const r = p.t === "cone" ? Math.max(p.r0, p.r1) : p.r;
    const z0 = p.z || 0, z1 = p.t === "ball" ? z0 + ballRy(p, iso) * 2 : z0 + (p.h || 0);
    return { x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r, z0, z1, cx, cy };
  }
  function partItems(def, obj, fp, iso) {
    const items = [];
    for (const p of def.art.parts || []) {
      if (!testWhen(obj.state, p.when)) continue;
      const b = partBox(p, fp, obj, iso);
      Object.assign(b, iso.boxRect(b.x0, b.y0, b.x1, b.y1, b.z0, b.z1));
      b.part = p;
      b.bias = p.bias || 0;
      items.push(b);
    }
    return depthSort(items);
  }
  function poly(ctx, pts, fill) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function drawBox(ctx, iso, it, p, pal, fp, lit) {
    const { x0, x1, y0, y1, z0, z1 } = it;
    const P = (x, y, z) => iso.toWorld(x, y, z);
    const base = pal(p.c);
    const face3 = (wf) => {
      const lf = fp.o.localFace(wf);
      if (lit && p.glow === lf) return { c: pal(p.glowC || "glow"), glow: true };
      const k = p.faces && p.faces[lf];
      return { c: k ? pal(k) : base, glow: false };
    };
    const fy = face3("py"), fx = face3("px");
    const top = p.faces && p.faces.top ? pal(p.faces.top) : base;
    if (p.o != null) ctx.globalAlpha = p.o;
    poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], fy.c);
    poly(ctx, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], fx.glow ? fx.c : shade(fx.c, -0.13));
    poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(top, 0.07));
    if (z1 - z0 > 3 && p.o == null) {
      const a = P(x0, y1, z1), b = P(x1, y1, z1), c = P(x1, y0, z1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawCyl(ctx, iso, it, p, pal, lit) {
    const base = lit && p.lit ? pal(p.glowC || "glow") : pal(p.c);
    const a = p.r * iso.hw * SQ2, b = p.r * iso.hh * SQ2;
    const top = iso.toWorld(it.cx, it.cy, it.z1), bot = iso.toWorld(it.cx, it.cy, it.z0);
    if (it.z1 - it.z0 > 0.5) {
      const g = ctx.createLinearGradient(bot.x - a, 0, bot.x + a, 0);
      g.addColorStop(0, shade(base, 0.05));
      g.addColorStop(0.55, base);
      g.addColorStop(1, shade(base, -0.2));
      ctx.beginPath();
      ctx.moveTo(top.x - a, top.y);
      ctx.lineTo(bot.x - a, bot.y);
      ctx.ellipse(bot.x, bot.y, a, b, 0, Math.PI, 0, true);
      ctx.lineTo(top.x + a, top.y);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, a, b, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.open ? shade(base, -0.3) : shade(base, 0.08);
    ctx.fill();
  }
  function drawCone(ctx, iso, it, p, pal, lit) {
    const base = lit && p.lit ? pal(p.glowC || "glow") : pal(p.c);
    const k = iso.hw * SQ2, kh = iso.hh * SQ2;
    const a0 = p.r0 * k, b0 = p.r0 * kh, a1 = p.r1 * k, b1 = p.r1 * kh;
    const top = iso.toWorld(it.cx, it.cy, it.z1), bot = iso.toWorld(it.cx, it.cy, it.z0);
    const g = ctx.createLinearGradient(bot.x - a0, 0, bot.x + a0, 0);
    g.addColorStop(0, shade(base, 0.06));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, lit && p.lit ? -0.06 : -0.2));
    ctx.beginPath();
    ctx.moveTo(top.x - a1, top.y);
    ctx.lineTo(bot.x - a0, bot.y);
    ctx.ellipse(bot.x, bot.y, a0, b0, 0, Math.PI, 0, true);
    ctx.lineTo(top.x + a1, top.y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, a1, b1, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.open ? shade(base, lit && p.lit ? 0.25 : -0.28) : shade(base, 0.08);
    ctx.fill();
  }
  function drawBall(ctx, iso, it, p, pal) {
    const base = pal(p.c), rx = ballRx(p, iso), ry = ballRy(p, iso);
    const c = iso.toWorld(it.cx, it.cy, it.z0 + ry);
    const g = ctx.createRadialGradient(c.x - rx * 0.35, c.y - ry * 0.45, rx * 0.08, c.x, c.y, rx * 1.05);
    g.addColorStop(0, shade(base, 0.2));
    g.addColorStop(0.62, base);
    g.addColorStop(1, shade(base, -0.16));
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  function rugRing(iso, p, fp, obj, inset, n = 36) {
    const pts = [];
    const push = (lx, ly) => {
      const m = fp.o.map(lx, ly);
      pts.push(iso.toWorld(obj.x + m[0], obj.y + m[1], 0.5));
    };
    if (p.shape === "round") {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        push(p.x + p.w / 2 + (p.w / 2 - inset) * Math.cos(a), p.y + p.d / 2 + (p.d / 2 - inset) * Math.sin(a));
      }
    } else {
      push(p.x + inset, p.y + inset);
      push(p.x + p.w - inset, p.y + inset);
      push(p.x + p.w - inset, p.y + p.d - inset);
      push(p.x + inset, p.y + p.d - inset);
    }
    return pts;
  }
  function drawRug(ctx, iso, it, p, pal, fp, obj) {
    const base = pal(p.c), border = pal(p.b || p.c);
    ctx.save();
    ctx.shadowColor = "rgba(40,30,20,.12)";
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 3;
    poly(ctx, rugRing(iso, p, fp, obj, 0), shade(base, -0.06));
    ctx.restore();
    poly(ctx, rugRing(iso, p, fp, obj, 0.08), border);
    const inner = rugRing(iso, p, fp, obj, 0.17);
    poly(ctx, inner, base);
    if (p.pattern) {
      ctx.save();
      ctx.beginPath();
      inner.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = rgba(border, 0.55);
      ctx.lineWidth = 3;
      if (p.pattern === "stripes") {
        for (let k = 1; k < 6; k++) {
          const ly = p.y + p.d * k / 6, a = fp.o.map(p.x, ly), b = fp.o.map(p.x + p.w, ly);
          const A = iso.toWorld(obj.x + a[0], obj.y + a[1], 0.5), B = iso.toWorld(obj.x + b[0], obj.y + b[1], 0.5);
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
        }
      } else if (p.pattern === "rings") {
        for (const ins of [0.35, 0.6]) {
          const r = rugRing(iso, Object.assign({}, p, { shape: p.shape }), fp, obj, ins);
          ctx.beginPath();
          r.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  var FISH = ["#ff9f5a", "#ffd166", "#7fc8f8", "#f78fb3"];
  function drawFx(ctx, iso, it, p, pal, fp, obj, t) {
    if (p.fx === "fish") {
      for (let i = 0; i < 3; i++) {
        const ph = t * (0.45 + i * 0.12) + i * 2.1;
        const u = 0.5 + 0.38 * Math.sin(ph), v = 0.25 + 0.25 * i;
        const lx = p.x + p.w * u, ly = p.y + p.d * v, z = (p.z || 0) + p.h * (0.3 + 0.18 * i) + 3 * Math.sin(t * 2 + i);
        const m = fp.o.map(lx, ly), q = iso.toWorld(obj.x + m[0], obj.y + m[1], z);
        const dir = fp.o.dir(Math.cos(ph) >= 0 ? 1 : -1, 0), right = dir[0] - dir[1] > 0;
        ctx.save();
        ctx.translate(q.x, q.y);
        if (!right) ctx.scale(-1, 1);
        ctx.fillStyle = FISH[i % FISH.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-10, -3.5 + Math.sin(t * 9 + i));
        ctx.lineTo(-10, 3.5 + Math.sin(t * 9 + i));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1b2436";
        ctx.beginPath();
        ctx.arc(3, -1, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,.7)";
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.35 + i * 0.27) % 1, m = fp.o.map(p.x + p.w * (0.2 + 0.15 * (i % 2)), p.y + p.d * 0.5);
        const q = iso.toWorld(obj.x + m[0], obj.y + m[1], (p.z || 0) + p.h * k);
        ctx.beginPath();
        ctx.arc(q.x + Math.sin(t * 3 + i) * 2, q.y, 1.3 + i % 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  function paintProc(ctx, iso, def, obj, fp, env, t) {
    const pal = paletteOf(def, obj);
    for (const it of partItems(def, obj, fp, iso)) {
      const p = it.part, lit = testWhen(obj.state, p.lit);
      switch (p.t) {
        case "box":
          drawBox(ctx, iso, it, p, pal, fp, lit);
          break;
        case "cyl":
          drawCyl(ctx, iso, it, p, pal, lit);
          break;
        case "cone":
          drawCone(ctx, iso, it, p, pal, lit);
          break;
        case "ball":
          drawBall(ctx, iso, it, p, pal);
          break;
        case "rug":
          drawRug(ctx, iso, it, p, pal, fp, obj);
          break;
        case "fx":
          drawFx(ctx, iso, it, p, pal, fp, obj, t);
          break;
      }
    }
  }
  function spriteGeom(iso, def, fp, img) {
    const art = def.art, flat = def.mount === "flat";
    const cx = (fp.x0 + fp.w / 2 - (fp.y0 + fp.h / 2)) * iso.hw;
    const by = flat ? (fp.x0 + fp.y0 + (fp.w + fp.h) / 2) * iso.hh : (fp.x1 + fp.y1) * iso.hh;
    const span = (fp.w + fp.h) * iso.hw;
    const s = (art.fit || 1) * span / img.width, sy = s * (art.sy || 1);
    const dw = img.width * s, dh = img.height * sy;
    return { cx, by, s, sy, dw, dh, ox: -dw / 2 + (art.dx || 0), oy: (flat ? -dh / 2 : -dh) + (art.dy || 0), mirror: !!fp.o.mirror };
  }
  function paintSprite(ctx, iso, def, obj, fp, img) {
    const g = spriteGeom(iso, def, fp, img);
    ctx.save();
    ctx.translate(g.cx, g.by);
    if (g.mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, g.ox, g.oy, g.dw, g.dh);
    ctx.restore();
    return g;
  }
  function paintPlaceholder(ctx, iso, def, obj, fp) {
    const pal = paletteOf(def, obj);
    const it = { x0: fp.x0 + 0.06, x1: fp.x1 - 0.06, y0: fp.y0 + 0.06, y1: fp.y1 - 0.06, z0: 0, z1: def.mount === "flat" ? 2 : Math.min(def.height, 90) };
    drawBox(ctx, iso, it, { c: def.palette.main ? "main" : "#d8cbb8" }, pal, fp, false);
  }
  function paintObject(ctx, iso, def, obj, fp, env, t, sprites) {
    if (def.art.kind === "sprite") {
      const e = sprites.get(def.art.src);
      if (e.ready) return paintSprite(ctx, iso, def, obj, fp, e.img);
      if (def.art.parts) return paintProc(ctx, iso, def, obj, fp, env, t);
      if (e.failed) paintPlaceholder(ctx, iso, def, obj, fp);
      return null;
    }
    paintProc(ctx, iso, def, obj, fp, env, t);
    return null;
  }
  function hitObject(iso, def, obj, fp, wx, wy, sprites) {
    if (def.art.kind === "sprite") {
      const e = sprites.get(def.art.src);
      if (e.ready) {
        const g = spriteGeom(iso, def, fp, e.img);
        let u = wx - g.cx;
        if (g.mirror) u = -u;
        const px = (u - g.ox) / g.s, py = (wy - g.by - g.oy) / g.sy;
        if (px < 0 || py < 0 || px >= e.img.width || py >= e.img.height) return false;
        if (e.mask) {
          const mx = Math.floor(px * e.mask.k), my = Math.floor(py * e.mask.k);
          return e.mask.a[my * e.mask.w + mx] > 40;
        }
      }
      const z1 = def.mount === "flat" ? 1 : def.height;
      return inPoly(wx, wy, iso.boxHull(fp.x0, fp.y0, fp.x1, fp.y1, 0, z1));
    }
    for (const it of partItems(def, obj, fp, iso)) {
      const p = it.part;
      if (p.t === "rug") {
        if (inPoly(wx, wy, rugRing(iso, p, fp, obj, 0).map((q) => [q.x, q.y]))) return true;
        continue;
      }
      if (p.t === "ball") {
        const rx = ballRx(p, iso), ry = ballRy(p, iso), c = iso.toWorld(it.cx, it.cy, it.z0 + ry);
        if (((wx - c.x) / rx) ** 2 + ((wy - c.y) / ry) ** 2 <= 1) return true;
        continue;
      }
      if (inPoly(wx, wy, iso.boxHull(it.x0, it.y0, it.x1, it.y1, it.z0, it.z1))) return true;
    }
    return false;
  }
  function objectRect(iso, def, fp, sprites) {
    if (def.art.kind === "sprite") {
      const e = sprites.get(def.art.src);
      if (e.ready) {
        const g = spriteGeom(iso, def, fp, e.img);
        const l = g.mirror ? g.cx - (g.ox + g.dw) : g.cx + g.ox;
        return { l, r: l + g.dw, t: g.by + g.oy, b: g.by + g.oy + g.dh };
      }
    }
    return iso.boxRect(fp.x0, fp.y0, fp.x1, fp.y1, 0, def.mount === "flat" ? 1 : def.height);
  }
  function procThumb(def, iso, size = 84) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas");
    c.width = c.height = size * dpr;
    const ctx = c.getContext("2d");
    const obj = { x: 0, y: 0, rot: 0, state: Object.assign({}, def.states, def.thumbState || {}) };
    const fp = { x0: 0, y0: 0, x1: def.size[0], y1: def.size[1], w: def.size[0], h: def.size[1], o: { map: (x, y) => [x, y], dir: (a, b) => [a, b], localFace: (f) => f, mirror: false } };
    const r = iso.boxRect(0, 0, fp.w, fp.h, 0, def.mount === "flat" ? 1 : def.height);
    const k = Math.min((size - 10) / (r.r - r.l), (size - 10) / (r.b - r.t));
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (size / 2 - (r.l + r.r) / 2 * k) * dpr, (size / 2 - (r.t + r.b) / 2 * k) * dpr);
    paintProc(ctx, iso, def, obj, fp, { night: false, sky: ["#9cc8f0", "#e6f3ff"], weather: "clear" }, 0);
    return c;
  }

  // web/roomkit/paint-emote.js
  function paintEmote(ctx, kind, t, k, top = 90) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 3);
    const y = -top - 16 - (1 - Math.min(1, k * 4)) * 6;
    if (kind === "zzz") {
      ctx.fillStyle = "#9fb4e8";
      ctx.font = "bold 13px sans-serif";
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.5 + i / 3) % 1;
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.fillText("z", 12 + p * 14 + i * 2, -top * 0.7 - p * 26);
      }
      ctx.restore();
      return;
    }
    if (kind === "sweat") {
      ctx.fillStyle = "#8fd0ff";
      const sy = -top * 0.82;
      ctx.beginPath();
      ctx.moveTo(28, sy - 7);
      ctx.quadraticCurveTo(33, sy + 1, 28, sy + 4);
      ctx.quadraticCurveTo(23, sy + 1, 28, sy - 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.translate(0, y);
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.shadowColor = "rgba(20,30,60,.18)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-13, -12, 26, 20, 10);
    else ctx.rect(-13, -12, 26, 20);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.moveTo(-3, 7);
    ctx.lineTo(0, 12);
    ctx.lineTo(3, 7);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    switch (kind) {
      case "heart":
        ctx.fillStyle = "#ff5c8a";
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-9, -1, -5, -9, 0, -4);
        ctx.bezierCurveTo(5, -9, 9, -1, 0, 5);
        ctx.fill();
        break;
      case "note":
        ctx.fillStyle = "#6b7fd7";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("♪", 0, -1);
        break;
      case "!":
        ctx.fillStyle = "#f08a24";
        ctx.font = "bold 15px sans-serif";
        ctx.fillText("!", 0, -1);
        break;
      case "?":
        ctx.fillStyle = "#6b7fd7";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("?", 0, -1);
        break;
      case "spark":
        ctx.fillStyle = "#f2c14e";
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + t * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 5, Math.sin(a) * 4 - 2, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, -2, 2.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "idea":
        ctx.fillStyle = "#f2c14e";
        ctx.beginPath();
        ctx.arc(0, -3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c9a24a";
        ctx.fillRect(-2.5, 2, 5, 3);
        break;
      case "anger":
        ctx.strokeStyle = "#e8505b";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-5, -7);
        ctx.lineTo(-1, -3);
        ctx.moveTo(5, -7);
        ctx.lineTo(1, -3);
        ctx.moveTo(-5, 3);
        ctx.lineTo(-1, -1);
        ctx.moveTo(5, 3);
        ctx.lineTo(1, -1);
        ctx.stroke();
        break;
      case "think":
      default: {
        ctx.fillStyle = "#6b7fd7";
        for (let i = 0; i < 3; i++) {
          const on = Math.floor(t * 3) % 3 >= i;
          ctx.globalAlpha = on ? 1 : 0.3;
          ctx.beginPath();
          ctx.arc(-6 + i * 6, -2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // web/roomkit/renderer.js
  var Sprites = class {
    constructor(base) {
      this.map = /* @__PURE__ */ new Map();
      this.onload = null;
      this.base = base || null;
      if (base) {
        try {
          this.base = new URL(base, location.href).href;
        } catch (e) {
        }
      }
    }
    get(src) {
      let e = this.map.get(src);
      if (e) return e;
      e = { img: new Image(), ready: false, failed: false, mask: null };
      e.img.decoding = "async";
      e.img.onload = () => {
        e.ready = true;
        e.mask = buildMask(e.img);
        if (this.onload) this.onload(src);
      };
      e.img.onerror = () => {
        e.failed = true;
        console.warn("[roomkit] 贴图加载失败，改用程序化备选:", src);
      };
      let url = src;
      if (this.base && !/^(?:[a-z]+:|\/)/i.test(src)) {
        try {
          url = new URL(src, this.base).href;
        } catch (err) {
        }
      }
      e.img.src = url;
      this.map.set(src, e);
      return e;
    }
    url(src) {
      if (!this.base || /^(?:[a-z]+:|\/)/i.test(src)) return src;
      try {
        return new URL(src, this.base).href;
      } catch (e) {
        return src;
      }
    }
  };
  function buildMask(img) {
    try {
      const w = Math.min(256, img.width), h = Math.max(1, Math.round(img.height * w / img.width));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      return { w, h, a, k: w / img.width };
    } catch (e) {
      return null;
    }
  }
  var AGENT_R = 0.18;
  var Renderer = class {
    constructor(app, canvas) {
      this.app = app;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.iso = app.iso;
      this.sprites = new Sprites(app.opts.assetBase);
      this.cam = { x: 0, y: 0, z: 1 };
      this.camT = { x: 0, y: 0, z: 1 };
      this.fitZ = 1;
      this.fitC = { x: 0, y: 0 };
      this.vw = 1;
      this.vh = 1;
      this.dpr = 1;
      this.hover = null;
      this.selected = null;
      this.lm = document.createElement("canvas");
      this.ents = { flats: [], sorted: [], walls: [] };
      this.overlay = null;
      this.showNames = false;
      this.hidden = /* @__PURE__ */ new Set();
      this.wobble = /* @__PURE__ */ new Map();
      this._bgAt = -1;
    }
    /* ───────── 尺寸与相机 ───────── */
    resize() {
      const host = this.canvas.parentElement;
      const r = host.getBoundingClientRect();
      this.vw = Math.max(1, r.width);
      this.vh = Math.max(1, r.height);
      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.vw * this.dpr);
      this.canvas.height = Math.round(this.vh * this.dpr);
      this.lm.width = this.canvas.width;
      this.lm.height = this.canvas.height;
      const wasFit = !this._fitted || Math.abs(this.camT.z - this.fitZ) < 1e-3;
      this.computeFit();
      if (wasFit) {
        this.fit(true);
        this._fitted = true;
      }
    }
    roomBounds() {
      const r = this.app.world.room, iso = this.iso;
      const H = r.walls.left || r.walls.right ? r.walls.height : 120;
      return { l: -r.h * iso.hw - 16, r: r.w * iso.hw + 16, t: -H - 18, b: (r.w + r.h) * iso.hh + (r.slab || 0) + 14 };
    }
    computeFit() {
      const b = this.roomBounds(), pad = this.app.opts.ui === "compact" ? 6 : 28;
      const vw = Math.max(80, this.vw - (this.insetR || 0));
      const it = this.insetT || 0, ib = this.insetB || 0, vh = Math.max(80, this.vh - it - ib);
      this.fitZ = Math.max(0.05, Math.min((vw - pad * 2) / (b.r - b.l), (vh - pad * 2) / (b.b - b.t)));
      this.fitC = { x: (b.l + b.r) / 2 + (this.insetR || 0) / 2 / this.fitZ, y: (b.t + b.b) / 2 + (ib - it) / 2 / this.fitZ };
    }
    fit(instant) {
      this.computeFit();
      this.camT = { x: this.fitC.x, y: this.fitC.y, z: this.fitZ };
      if (instant) this.cam = Object.assign({}, this.camT);
    }
    /** 剧情镜头：把世界点推到画面中上部（下方留给对话框），放大 zf 倍 */
    focusOn(wx, wy, zf = 1.5) {
      const z = clamp(this.fitZ * zf, this.fitZ * 0.7, this.fitZ * 4);
      this.camT = { x: wx, y: wy + this.vh * 0.12 / z, z };
      this.clampCam();
    }
    zoomAt(factor, sx, sy) {
      const w = this.screenToWorld(sx, sy, this.camT);
      const z = clamp(this.camT.z * factor, this.fitZ * 0.7, this.fitZ * 4);
      this.camT.z = z;
      this.camT.x = w.x - (sx - this.vw / 2) / z;
      this.camT.y = w.y - (sy - this.vh / 2) / z;
      this.clampCam();
    }
    panBy(dx, dy) {
      this.camT.x -= dx / this.camT.z;
      this.camT.y -= dy / this.camT.z;
      this.clampCam();
      this.cam.x = this.camT.x;
      this.cam.y = this.camT.y;
    }
    clampCam() {
      const b = this.roomBounds();
      this.camT.x = clamp(this.camT.x, b.l, b.r);
      this.camT.y = clamp(this.camT.y, b.t, b.b);
    }
    screenToWorld(sx, sy, cam = this.cam) {
      return { x: cam.x + (sx - this.vw / 2) / cam.z, y: cam.y + (sy - this.vh / 2) / cam.z };
    }
    worldToScreen(wx, wy, cam = this.cam) {
      return { x: (wx - cam.x) * cam.z + this.vw / 2, y: (wy - cam.y) * cam.z + this.vh / 2 };
    }
    tileToScreen(x, y, z = 0) {
      const p = this.iso.toWorld(x, y, z);
      return this.worldToScreen(p.x, p.y);
    }
    _worldTransform(ctx) {
      const s = this.cam.z * this.dpr;
      ctx.setTransform(s, 0, 0, s, (this.vw / 2 - this.cam.x * this.cam.z) * this.dpr, (this.vh / 2 - this.cam.y * this.cam.z) * this.dpr);
    }
    /* ───────── 每帧 ───────── */
    frame(t, dt) {
      const { ctx, iso } = this, app = this.app, world = app.world, env = app.env;
      const k = ease(11, dt);
      this.cam.x += (this.camT.x - this.cam.x) * k;
      this.cam.y += (this.camT.y - this.cam.y) * k;
      this.cam.z += (this.camT.z - this.cam.z) * k;
      if (t - this._bgAt > 2) {
        this._bgAt = t;
        this._paintBackground(env);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this._worldTransform(ctx);
      paintWalls(ctx, world, iso, env, t);
      this._drawWallItems(ctx, env, t);
      paintFloor(ctx, world, iso, { grid: app.mode === "edit" });
      paintWindowLight(ctx, world, iso, env);
      const { flats, solids } = this._buildEntities();
      for (const e of flats) this._drawEntity(ctx, e, env, t);
      this._drawShadows(ctx, solids);
      const sorted = depthSort(solids);
      for (const e of sorted) this._drawEntity(ctx, e, env, t);
      this.ents.flats = flats;
      this.ents.sorted = sorted;
      if (world.room.outdoor) this._drawWeather(ctx, env, t);
      this._drawLighting(env, t);
      this._worldTransform(ctx);
      if (this.overlay) this.overlay(ctx, t);
      this._drawAgentHud(ctx, t);
    }
    _paintBackground(env) {
      const host = this.app.root;
      if (!host || this.app.opts.transparent) return;
      const top = mix(env.sky[0], "#ffffff", env.night ? 0.06 : 0.55), bottom = mix(env.sky[1], "#ffffff", env.night ? 0.02 : 0.45);
      host.style.setProperty("--rk-bg-a", top);
      host.style.setProperty("--rk-bg-b", bottom);
      host.classList.toggle("rk-night", !!env.night);
    }
    _buildEntities() {
      const world = this.app.world, iso = this.iso, flats = [], solids = [];
      for (const o of world.objects) {
        if (o.wall || this.hidden.has(o.id)) continue;
        const def = world.def(o);
        if (!def) continue;
        const fp = world.footprint(o, def);
        const rc = objectRect(iso, def, fp, this.sprites);
        const e = { kind: "obj", id: o.id, o, def, fp, x0: fp.x0, x1: fp.x1, y0: fp.y0, y1: fp.y1, z0: 0, z1: def.mount === "flat" ? 1 : def.height, l: rc.l, r: rc.r, t: rc.t, b: rc.b };
        (def.mount === "flat" ? flats : solids).push(e);
      }
      for (const a of this.app.agents.values()) {
        const m = a.body.metrics, p = iso.toWorld(a.x, a.y, a.z);
        const e = {
          kind: "agent",
          id: "agent:" + a.id,
          a,
          m,
          x0: a.x - AGENT_R,
          x1: a.x + AGENT_R,
          y0: a.y - AGENT_R,
          y1: a.y + AGENT_R,
          z0: a.z,
          z1: a.z + m.h * 0.6,
          l: p.x - m.rx - 14,
          r: p.x + m.rx + 14,
          t: p.y - m.h - 12,
          b: p.y + 8
        };
        if (a.attach) {
          if (a.attach.slot.layer === "back") e.before = a.attach.obj.id;
          else e.after = a.attach.obj.id;
        }
        solids.push(e);
      }
      flats.sort((p, q) => p.x0 + p.y0 - (q.x0 + q.y0));
      return { flats, solids };
    }
    _isLit(id) {
      return this.hover && this.hover.id === id || this.selected && this.selected.id === id;
    }
    _drawEntity(ctx, e, env, t) {
      const iso = this.iso;
      const w0 = this.wobble.get(e.id);
      const wob = w0 != null && t - w0 < 0.7 ? Math.sin((t - w0) * 34) * 0.035 * (1 - (t - w0) / 0.7) : 0;
      if (w0 != null && !wob) this.wobble.delete(e.id);
      const draw = (g) => {
        if (wob) {
          const px = (e.l + e.r) / 2, py = e.b;
          g.save();
          g.translate(px, py);
          g.rotate(wob);
          g.translate(-px, -py);
        }
        if (e.kind === "obj") paintObject(g, iso, e.def, e.o, e.fp, env, t, this.sprites);
        else {
          const p = iso.toWorld(e.a.x, e.a.y, e.a.z);
          g.save();
          g.translate(p.x, p.y);
          e.a.body.draw(g, t);
          g.restore();
        }
        if (wob) g.restore();
      };
      if (this._isLit(e.id)) this._drawGlow(ctx, e, draw, this.selected && this.selected.id === e.id);
      else draw(ctx);
    }
    /** 悬停/选中：把实体画到离屏画布，再带外发光贴回（发光沿轮廓，而不是一个方框） */
    _drawGlow(ctx, e, draw, strong) {
      const z = this.cam.z * this.dpr, pad = 16;
      const w = Math.ceil((e.r - e.l) * z) + pad * 2, h = Math.ceil((e.b - e.t) * z) + pad * 2;
      if (!(w > 0 && h > 0) || w > 4096 || h > 4096) {
        draw(ctx);
        return;
      }
      const oc = this._gc || (this._gc = document.createElement("canvas"));
      if (oc.width < w || oc.height < h) {
        oc.width = Math.max(oc.width, w);
        oc.height = Math.max(oc.height, h);
      }
      const g = oc.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(z, 0, 0, z, pad - e.l * z, pad - e.t * z);
      draw(g);
      ctx.save();
      ctx.shadowColor = strong ? "rgba(120,190,255,.95)" : "rgba(255,246,214,.95)";
      ctx.shadowBlur = (strong ? 14 : 11) * this.dpr;
      if ("filter" in ctx) ctx.filter = "brightness(1.07)";
      ctx.drawImage(oc, 0, 0, w, h, e.l - pad / z, e.t - pad / z, w / z, h / z);
      ctx.restore();
    }
    _drawWallItems(ctx, env, t) {
      const world = this.app.world, iso = this.iso;
      const list = [];
      for (const o of world.objects) {
        if (!o.wall || this.hidden.has(o.id)) continue;
        const def = world.def(o);
        if (!def || !world.hasWall(o.wall)) continue;
        const fr = wallItemFrame(iso, o.wall, o.at, def.wsize[0], world.wallZ(o, def), def.wsize[1]);
        const quad2 = wallItemQuad(fr);
        const xs = quad2.map((q) => q[0]), ys = quad2.map((q) => q[1]);
        const e = { kind: "wall", id: o.id, o, def, fr, quad: quad2, l: Math.min(...xs) - 16, r: Math.max(...xs) + 16, t: Math.min(...ys) - 16, b: Math.max(...ys) + 16 };
        list.push(e);
        const pal = paletteOf(def, o);
        const draw = (g) => paintWallItem(g, fr, def, o, pal, env, t, o.wall);
        if (this._isLit(e.id)) this._drawGlow(ctx, e, draw, this.selected && this.selected.id === e.id);
        else draw(ctx);
      }
      this.ents.walls = list;
    }
    _drawShadows(ctx, solids) {
      const iso = this.iso;
      for (const e of solids) {
        if (e.kind === "obj") {
          if (e.def.noShadow) continue;
          const c = iso.toWorld((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2);
          const span = (e.fp.w + e.fp.h) / 2;
          ctx.fillStyle = "rgba(60,40,30,.10)";
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, span * iso.hw * 0.82, span * iso.hh * 0.82, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const a = e.a, r = e.m.rx, c = iso.toWorld(a.x, a.y, 0);
          const k = clamp(1 - a.z / 120, 0.5, 1);
          if (this.selected && this.selected.id === e.id) {
            ctx.strokeStyle = "rgba(110,180,255,.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (a.attach && a.attach.slot.pose === "sleep") continue;
          ctx.fillStyle = `rgba(30,32,60,${0.2 * k})`;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, r * 0.72 * k, r * 0.28 * k, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    /** 户外场景（room.outdoor）的雨雪：画在世界坐标里，跟着相机走，也会被夜色染暗 */
    _drawWeather(ctx, env, t) {
      const w = env.weather;
      if (w !== "rain" && w !== "snow") return;
      const b = this.roomBounds(), W = b.r - b.l, H = b.b - b.t;
      const wrap = (v, n) => (v % n + n) % n;
      ctx.save();
      if (w === "rain") {
        ctx.strokeStyle = "rgba(205,220,245,.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 160; i++) {
          const v = 480 + hash2(i, 2) * 160, x = b.l + wrap(hash2(i, 1) * W - t * v * 0.25, W), y = b.t + wrap(hash2(i, 3) * H + t * v, H);
          ctx.moveTo(x, y);
          ctx.lineTo(x - 4, y + 15);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,255,255,.88)";
        for (let i = 0; i < 110; i++) {
          const k = hash2(i, 2), x = b.l + wrap(hash2(i, 1) * W + Math.sin(t * 0.7 + i) * 14, W), y = b.t + wrap(hash2(i, 3) * H + t * (22 + k * 22), H);
          ctx.beginPath();
          ctx.arc(x, y, 1.3 + k * 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    _drawLighting(env, t) {
      const dark = env.dark, tintK = env.tintK;
      if (dark < 0.01 && tintK < 0.01) return;
      const lm = this.lm, g = lm.getContext("2d"), W = lm.width, H = lm.height;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, W, H);
      if (tintK > 0.01) {
        g.fillStyle = rgba(env.tint, tintK * 0.55);
        g.fillRect(0, 0, W, H);
      }
      if (dark > 0.01) {
        g.fillStyle = rgba("#0b1433", dark);
        g.fillRect(0, 0, W, H);
      }
      const lights = this.app.world.lights();
      const z = this.cam.z * this.dpr, iso = this.iso;
      g.globalCompositeOperation = "destination-out";
      for (const L of lights) {
        const f = this.worldToScreen(iso.toWorld(L.x, L.y, 0).x, iso.toWorld(L.x, L.y, 0).y);
        const h = this.worldToScreen(iso.toWorld(L.x, L.y, L.z).x, iso.toWorld(L.x, L.y, L.z).y);
        const R = L.radius * iso.hw * z;
        const flick = 1 + Math.sin(t * 7 + L.x * 3) * 0.015;
        for (const [p, r, a] of [[f, R * flick, 0.95 * L.power], [h, R * 0.55, 0.85 * L.power]]) {
          const gr = g.createRadialGradient(p.x * this.dpr, p.y * this.dpr, 0, p.x * this.dpr, p.y * this.dpr, r);
          gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, a)})`);
          gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.5})`);
          gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr;
          g.fillRect(p.x * this.dpr - r, p.y * this.dpr - r, r * 2, r * 2);
        }
      }
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.drawImage(lm, 0, 0);
      if (dark > 0.08 && lights.length) {
        ctx.globalCompositeOperation = "lighter";
        for (const L of lights) {
          const h = this.worldToScreen(iso.toWorld(L.x, L.y, L.z).x, iso.toWorld(L.x, L.y, L.z).y);
          const r = L.radius * iso.hw * z * 0.6;
          const gr = ctx.createRadialGradient(h.x * this.dpr, h.y * this.dpr, 0, h.x * this.dpr, h.y * this.dpr, r);
          gr.addColorStop(0, rgba(L.color, 0.32 * dark * L.power));
          gr.addColorStop(1, rgba(L.color, 0));
          ctx.fillStyle = gr;
          ctx.fillRect(h.x * this.dpr - r, h.y * this.dpr - r, r * 2, r * 2);
        }
      }
      ctx.restore();
    }
    _drawAgentHud(ctx, t) {
      const iso = this.iso;
      if (!this._mkAt || t - this._mkAt > 0.5) {
        this._mkAt = t;
        this._mk = this.app.stories ? this.app.stories.markers() : [];
      }
      for (const m of this._mk || []) {
        let p = null;
        let top = 50;
        if (m.id.indexOf("agent:") === 0) {
          const a = this.app.agents.get(m.id.slice(6));
          if (a) {
            const q = iso.toWorld(a.x, a.y, a.z);
            p = { x: q.x, y: q.y };
            top = this._top(a) + 14;
          }
        } else {
          const e = this.ents.sorted.find((x) => x.id === m.id) || this.ents.flats.find((x) => x.id === m.id) || this.ents.walls.find((x) => x.id === m.id);
          if (e) p = { x: (e.l + e.r) / 2, y: e.t + 72 };
        }
        if (!p) continue;
        ctx.save();
        ctx.translate(p.x, p.y + Math.sin(t * 3.2) * 3);
        paintEmote(ctx, "!", t, 1, top);
        ctx.restore();
      }
      for (const a of this.app.agents.values()) {
        const p = iso.toWorld(a.x, a.y, a.z), top = this._top(a);
        ctx.save();
        ctx.translate(p.x, p.y);
        if (a.emo) paintEmote(ctx, a.emo.kind, t, a.t - a.emo.t0, top);
        else if (a.pose === "sleep") paintEmote(ctx, "zzz", t, 1, top);
        if (this.showNames || this.selected && this.selected.id === "agent:" + a.id) {
          ctx.font = '600 11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.textAlign = "center";
          const w = ctx.measureText(a.name).width + 12;
          ctx.fillStyle = "rgba(16,22,40,.62)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(-w / 2, 8, w, 16, 8);
          else ctx.rect(-w / 2, 8, w, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(a.name, 0, 20);
        }
        ctx.restore();
      }
    }
    /** 角色头顶离脚底多高（坐下/躺下会矮一截） */
    _top(a) {
      const h = a.body.metrics.h;
      return a.pose === "sleep" ? h * 0.55 : ["sit", "work", "read", "eat"].includes(a.pose) ? h * 0.9 : h;
    }
    /* ───────── 命中 ───────── */
    pick(sx, sy, opts = {}) {
      const w = this.screenToWorld(sx, sy), iso = this.iso, world = this.app.world;
      const sorted = this.ents.sorted;
      for (let i = sorted.length - 1; i >= 0; i--) {
        const e = sorted[i];
        if (w.x < e.l || w.x > e.r || w.y < e.t || w.y > e.b) continue;
        if (e.kind === "agent") {
          if (opts.noAgents) continue;
          const a = e.a, p = iso.toWorld(a.x, a.y, a.z), top = this._top(a);
          if (((w.x - p.x) / e.m.rx) ** 2 + ((w.y - (p.y - top / 2)) / (top / 2 + 4)) ** 2 <= 1) return { kind: "agent", agent: a, id: e.id };
        } else if (hitObject(iso, e.def, e.o, e.fp, w.x, w.y, this.sprites)) {
          return { kind: "obj", obj: e.o, def: e.def, id: e.id };
        }
      }
      for (const e of this.ents.walls) if (inPoly(w.x, w.y, e.quad)) return { kind: "obj", obj: e.o, def: e.def, id: e.id, wall: true };
      const flats = this.ents.flats;
      for (let i = flats.length - 1; i >= 0; i--) {
        const e = flats[i];
        if (hitObject(iso, e.def, e.o, e.fp, w.x, w.y, this.sprites)) return { kind: "obj", obj: e.o, def: e.def, id: e.id };
      }
      const tile = iso.toTile(w.x, w.y);
      if (world.isFloor(Math.floor(tile.x), Math.floor(tile.y))) return { kind: "floor", x: tile.x, y: tile.y };
      const wf = this.wallAt(sx, sy);
      if (wf) return Object.assign({ kind: "wallface" }, wf);
      return null;
    }
    /** 屏幕点落在哪面墙上：{ side, u（沿墙格）, z（离地像素）} */
    wallAt(sx, sy, loose) {
      const w = this.screenToWorld(sx, sy), iso = this.iso, world = this.app.world, r = world.room;
      const side = w.x >= 0 ? "right" : "left";
      if (!world.hasWall(side)) return null;
      const u = side === "right" ? w.x / iso.hw : -w.x / iso.hw;
      const z = u * iso.hh - w.y;
      const len = world.wallLen(side);
      if (!loose && (u < 0 || u > len || z < 0 || z > r.walls.height)) return null;
      return { side, u: clamp(u, 0, len), z: clamp(z, 0, r.walls.height) };
    }
    /** 实体顶部中点的屏幕坐标（名牌、气泡锚点） */
    anchorOf(hit) {
      if (!hit) return null;
      if (hit.kind === "agent") {
        const a = hit.agent;
        const p = this.iso.toWorld(a.x, a.y, a.z);
        return this.worldToScreen(p.x, p.y - this._top(a) - 6);
      }
      const all = this.ents.sorted.concat(this.ents.walls, this.ents.flats);
      const e = all.find((x) => x.id === hit.id);
      if (!e) return null;
      return this.worldToScreen((e.l + e.r) / 2, e.t + (e.kind === "wall" ? 16 : 0));
    }
  };

  // web/roomkit/ui.js
  var esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var NEED_NAMES = { energy: "精力", fun: "乐趣", social: "社交" };
  var HUD = class {
    constructor(app) {
      this.app = app;
      const root = app.root;
      root.insertAdjacentHTML("beforeend", `
      <div class="rk-bubbles"></div>
      <div class="rk-tip"></div>
      <div class="rk-card"><button class="rk-x" data-a="close-card">×</button><div class="rk-card-body"></div></div>
      <div class="rk-drawer"><button class="rk-x" data-a="close-drawer" aria-label="关闭">×</button><div class="rk-drawer-body"></div></div>
      <div class="rk-toast"></div>`);
      const $ = (s) => root.querySelector(s);
      this.el = {
        bubbles: $(".rk-bubbles"),
        tip: $(".rk-tip"),
        card: $(".rk-card"),
        cardBody: $(".rk-card-body"),
        drawer: $(".rk-drawer"),
        drawerBody: $(".rk-drawer-body"),
        toast: $(".rk-toast")
      };
      this.bubbleEls = /* @__PURE__ */ new Map();
      this.cardAgent = null;
      this._cardAt = 0;
      root.addEventListener("click", (e) => this._onClick(e));
      root.addEventListener("pointerdown", (e) => {
        if (this.drawerAnchor && !this.el.drawer.contains(e.target)) this.closeDrawer();
      }, true);
    }
    _onClick(e) {
      const b = e.target.closest && e.target.closest("[data-a],[data-c],[data-x]");
      if (!b || !this.app.root.contains(b)) return;
      const app = this.app, a = b.getAttribute("data-a"), c = b.getAttribute("data-c");
      if (b.hasAttribute("data-x")) {
        const x = (this.cardExtra || [])[+b.getAttribute("data-x")];
        if (x) x.fn();
        return;
      }
      if (c && this.cardAgent) {
        app.agentAction(this.cardAgent, c);
        return;
      }
      if (a === "close-card") this.closeCard();
      else if (a === "close-drawer") this.closeDrawer();
      else if (a && a.indexOf("goto:") === 0) {
        this.closeDrawer();
        app.inspect(a.slice(5));
      }
    }
    /** 顶栏归外壳（shell.js）管；保留这个名字给老调用方 */
    syncBar() {
      if (this.app.shell) this.app.shell.sync();
    }
    /* ───────── 每帧 ───────── */
    update() {
      const app = this.app, R = app.renderer;
      const alive = /* @__PURE__ */ new Set();
      for (const a of app.agents.values()) {
        if (!a.speech) continue;
        alive.add(a.id);
        let el = this.bubbleEls.get(a.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "rk-bubble";
          this.el.bubbles.appendChild(el);
          this.bubbleEls.set(a.id, el);
        }
        if (el._text !== a.speech.text) {
          el._text = a.speech.text;
          el.innerHTML = (app.agents.size > 1 ? "<b>" + esc(a.name) + "</b>" : "") + esc(a.speech.text);
          el.style.animation = "none";
          void el.offsetWidth;
          el.style.animation = "";
        }
        const p = R.anchorOf({ kind: "agent", agent: a });
        if (el._text !== el._measured) {
          el._measured = el._text;
          el._w = el.offsetWidth;
        }
        const half = (el._w || 0) / 2 + 4;
        el.style.left = (half * 2 < R.vw ? Math.min(Math.max(p.x, half), R.vw - half) : R.vw / 2) + "px";
        el.style.top = Math.max(p.y - (a.emo ? 26 : 6), 30) + "px";
      }
      for (const [id, el] of this.bubbleEls) if (!alive.has(id)) {
        el.remove();
        this.bubbleEls.delete(id);
      }
      if (this._tipHit) {
        const p = R.anchorOf(this._tipHit);
        if (p) {
          this.el.tip.style.left = p.x + "px";
          this.el.tip.style.top = p.y + "px";
        }
      }
      if (this.cardAgent && performance.now() - this._cardAt > 500) this._renderCard();
      if (this.drawerAnchor) this._positionDrawer();
    }
    showTip(hit, text2, sub) {
      this._tipHit = hit;
      this.el.tip.innerHTML = esc(text2) + (sub ? "<small>" + esc(sub) + "</small>" : "");
      this.el.tip.classList.add("on");
    }
    hideTip() {
      this._tipHit = null;
      this.el.tip.classList.remove("on");
    }
    float(sx, sy, text2) {
      const f = document.createElement("div");
      f.className = "rk-float";
      f.textContent = text2;
      f.style.left = sx + "px";
      f.style.top = sy + "px";
      this.app.root.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    }
    toast(text2, ms = 1800) {
      const t = this.el.toast;
      t.textContent = text2;
      t.classList.add("on");
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove("on"), ms);
    }
    /* ───────── 角色卡片 ───────── */
    openCard(agent) {
      this.cardAgent = agent;
      this.cardExtra = [];
      this.closeDrawer();
      this._renderCard();
      this.el.card.classList.add("on");
    }
    /** 宿主往当前角色卡片上加一个按钮（比如 DSH 的「打开这个会话」） */
    addCardAction(label, fn) {
      this.cardExtra.push({ label, fn });
      this._renderCard();
    }
    closeCard() {
      this.cardAgent = null;
      this.el.card.classList.remove("on");
      if (this.app.renderer.selected && this.app.renderer.selected.kind === "agent") this.app.renderer.selected = null;
    }
    _renderCard() {
      const a = this.cardAgent;
      if (!a || !this.app.agents.has(a.id)) {
        this.closeCard();
        return;
      }
      this._cardAt = performance.now();
      const s = a.status && a.status.state ? " · " + ({ thinking: "思考", working: "工作", result: "整理", waiting: "等待", success: "完成", error: "出错" }[a.status.state] || a.status.state) : "";
      const needs = Object.keys(NEED_NAMES).map((k) => `<div class="rk-need"><span>${NEED_NAMES[k]}</span><i><b style="width:${Math.round((a.needs[k] || 0) * 100)}%"></b></i></div>`).join("");
      const task = a.status && a.status.task ? `<div class="rk-kv"><span>任务</span><span>${esc(a.status.task)}</span></div>` : "";
      this.el.cardBody.innerHTML = `
      <h4>${esc(a.name)}</h4>
      <div class="rk-sub">正在：${esc(a.activity)}${esc(s)}</div>
      ${task}${needs}
      <div class="rk-row">
        <button class="rk-btn" data-c="wave">打招呼</button>
        <button class="rk-btn" data-c="dance">跳个舞</button>
        <button class="rk-btn" data-c="sleep">去睡觉</button>
        <button class="rk-btn" data-c="read">看本书</button>
        <button class="rk-btn on" data-c="chat">💬 聊聊</button>
        ${(this.cardExtra || []).map((x, i) => `<button class="rk-btn" data-x="${i}">${esc(x.label)}</button>`).join("")}
      </div>`;
    }
    /* ───────── 信息抽屉 ───────── */
    openDrawer(data) {
      this.closeCard();
      this.drawerAnchor = data.anchor || null;
      this.el.drawer.classList.toggle("rk-object-menu", !!this.drawerAnchor);
      this.el.drawer.style.cssText = "";
      this.el.drawerBody.style.maxHeight = "";
      this.el.drawer.setAttribute("role", "dialog");
      this.el.drawer.setAttribute("aria-label", data.title);
      const lines = (data.lines || []).map((l) => Array.isArray(l) ? `<div class="rk-kv"><span>${esc(l[0])}</span><span>${esc(l[1])}</span></div>` : `<div class="rk-kv"><span>${esc(l)}</span></div>`).join("");
      const links = (data.links || []).map((l) => `<button class="rk-btn" data-a="goto:${esc(l.obj)}">${esc(l.label)} →</button>`).join("");
      this.el.drawerBody.innerHTML = `<h4>${esc(data.title)}</h4><div class="rk-sub">${esc(data.sub || "")}</div>${data.html || lines}${links ? '<div class="rk-row">' + links + "</div>" : ""}`;
      this.el.drawer.classList.add("on");
      if (this.drawerAnchor) {
        this._positionDrawer();
        this.el.drawer.tabIndex = -1;
        this.el.drawer.focus({ preventScroll: true });
      }
    }
    _positionDrawer() {
      const R = this.app.renderer, el = this.el.drawer, p = R.anchorOf(this.drawerAnchor);
      if (!p || !this.app.world.byId.has(this.drawerAnchor.id)) {
        this.closeDrawer();
        return;
      }
      const margin = 8, top = this.app.desk ? margin : 48, bottom = this.app.desk ? margin : 62;
      const maxHeight = Math.max(80, R.vh - top - bottom);
      el.style.maxHeight = maxHeight + "px";
      this.el.drawerBody.style.maxHeight = maxHeight - 22 + "px";
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.max(margin, Math.min(p.x - w / 2, R.vw - w - margin));
      const above = p.y - h - 12 >= top;
      const y = above ? p.y - h - 12 : p.y + 18;
      el.style.left = left + "px";
      el.style.top = Math.max(top, Math.min(y, R.vh - h - bottom)) + "px";
      el.style.setProperty("--rk-tail-x", Math.max(18, Math.min(w - 18, p.x - left)) + "px");
      el.classList.toggle("rk-menu-below", !above);
    }
    closeDrawer() {
      this.drawerAnchor = null;
      this.el.drawer.classList.remove("on");
    }
  };

  // web/roomkit/character.js
  var KINDS = ["greet", "idle", "night", "poke", "cheer", "oops", "wait", "chat"];
  var MAX_LINE = 60;
  function slug(s) {
    const base = String(s || "char").toLowerCase().replace(/[^a-z0-9一-龥_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    return base || "char";
  }
  function clean(s, name) {
    return String(s == null ? "" : s).replace(/\{\{char\}\}/gi, name || "我").replace(/\{\{user\}\}/gi, "你").replace(/<[^>]*>/g, "").replace(/\*[^*]{0,80}\*/g, "").replace(/\r/g, "").trim();
  }
  function short(s) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const m = t.match(/^(.{2,60}?[。！？!?~～…]+)/);
    const one = m ? m[1] : t;
    return one.length > MAX_LINE ? one.slice(0, MAX_LINE - 1) + "…" : one;
  }
  var uniq = (arr) => [...new Set(arr.filter(Boolean))];
  function normalizeCharacter(raw) {
    if (!raw || typeof raw !== "object") throw new Error("角色卡不是 JSON 对象");
    if (raw.format === "roomkit.character") return finish(clone(raw));
    if ((raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3") && raw.data) return fromTavern(raw.data);
    if (raw.name && (raw.first_mes != null || raw.description != null || raw.char_persona != null)) return fromTavern(raw);
    throw new Error("认不出的角色卡格式（支持 roomkit.character 与 SillyTavern/TavernAI 卡）");
  }
  function finish(c) {
    c.format = "roomkit.character";
    c.v = 1;
    c.name = String(c.name || "小鲸鱼").slice(0, 24);
    c.id = c.id ? String(c.id).slice(0, 48) : slug(c.name);
    c.kind = c.kind === "whale" ? "whale" : "girl";
    c.look = Object.assign({}, c.look || {});
    c.persona = String(c.persona || "").slice(0, 4e3);
    c.scenario = String(c.scenario || "").slice(0, 2e3);
    const ph = {};
    for (const k of KINDS) {
      const list = Array.isArray(c.phrases && c.phrases[k]) ? c.phrases[k] : [];
      ph[k] = uniq(list.map((x) => short(clean(x, c.name)))).slice(0, 24);
    }
    c.phrases = ph;
    c.likes = Object.assign({}, c.likes || {});
    for (const k in c.likes) {
      const v = +c.likes[k];
      if (!(v >= 0 && v <= 5)) delete c.likes[k];
      else c.likes[k] = v;
    }
    c.schedule = (Array.isArray(c.schedule) ? c.schedule : []).filter((s) => s && isFinite(s.from) && isFinite(s.to) && typeof s.prefer === "string").slice(0, 12);
    return c;
  }
  function fromTavern(d) {
    const name = clean(d.name || d.char_name || "角色", "").slice(0, 24) || "角色";
    const greet = [d.first_mes].concat(d.alternate_greetings || []).map((x) => short(clean(x, name)));
    const lines = clean(d.mes_example || d.example_dialogue || "", name).split(/\n+/);
    const said = [];
    for (const l of lines) {
      const m = l.match(new RegExp("^\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：]\\s*(.+)$"));
      if (m) said.push(short(m[1]));
    }
    return finish({
      name,
      id: slug(name),
      persona: [clean(d.description, name), clean(d.personality || d.char_persona, name)].filter(Boolean).join("\n"),
      scenario: clean(d.scenario || d.world_scenario, name),
      phrases: { greet, idle: said, poke: said.slice(0, 6) },
      source: "tavern",
      creator: String(d.creator || "").slice(0, 40),
      tags: Array.isArray(d.tags) ? d.tags.slice(0, 12).map(String) : []
    });
  }
  async function readCharacterFile(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const isPng = u8.length > 8 && u8[0] === 137 && u8[1] === 80 && u8[2] === 78 && u8[3] === 71;
    if (!isPng) return normalizeCharacter(JSON.parse(new TextDecoder().decode(u8)));
    const text2 = pngText(buf);
    const b64 = text2.ccv3 || text2.chara;
    if (!b64) throw new Error("这张 PNG 里没有角色卡数据");
    const bin = atob(b64.trim());
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const card = normalizeCharacter(JSON.parse(new TextDecoder().decode(bytes)));
    card.avatar = await pngThumb(file);
    return card;
  }
  function pngText(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
    let p = 8;
    while (p + 12 <= u8.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (type === "tEXt" && p + 8 + len <= u8.length) {
        const data = u8.subarray(p + 8, p + 8 + len);
        const z = data.indexOf(0);
        if (z > 0) {
          let key2 = "", val = "";
          for (let i = 0; i < z; i++) key2 += String.fromCharCode(data[i]);
          for (let i = z + 1; i < data.length; i++) val += String.fromCharCode(data[i]);
          out[key2] = val;
        }
      }
      if (type === "IEND") break;
      p += 12 + len;
    }
    return out;
  }
  function pngThumb(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = 96 / Math.max(img.width, img.height), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        res(null);
      };
      img.src = url;
    });
  }

  // web/roomkit/packs.js
  var LIMITS = { imageBytes: 25e5, totalBytes: 15e6, furniture: 300, parts: 200, scenes: 20, stories: 60, steps: 400, text: 400 };
  var ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
  var COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  var KEY_RE = /^[a-z][a-z0-9_]{0,23}$/i;
  var POSES = ["stand", "walk", "run", "sit", "sleep", "work", "read", "eat", "dance", "jump", "sad", "wave", "look", "cook"];
  var PART_T = ["box", "cyl", "cone", "ball", "rug", "fx"];
  var WALL_DRAW = ["window", "door", "frame", "clock", "shelf", "cabinet", "rack", "poster", "image"];
  var STEP_DO = ["line", "narrate", "choice", "goto", "end", "set", "inc", "camera", "cmd", "use", "pose", "emote", "expr", "face", "state", "env", "outfit", "wait", "sfx", "say"];
  var CMD_OPS = ["agent.say", "agent.use", "agent.goto", "agent.pose", "agent.emote", "env.set", "object.state"];
  var ACT_RE = /^(toggle:[a-z0-9_]{1,24}|use(:[a-z0-9_]{1,24})?|play:[a-z0-9_/-]{1,64}|weather|shake|info)$/i;
  var DATA_URL_RE = /^data:image\/(png|webp|jpeg|gif|avif);base64,[a-z0-9+/=]+$/i;
  var num = (v, a, b, d) => {
    const n = +v;
    return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d;
  };
  var str = (v, n) => String(v == null ? "" : v).slice(0, n || LIMITS.text);
  var colorOrKey = (v) => typeof v === "string" && (COLOR_RE.test(v) || KEY_RE.test(v)) ? v : null;
  function validatePack(raw) {
    const errors = [], warnings = [];
    const fail = (m) => {
      errors.push(m);
      return { ok: false, errors, warnings };
    };
    if (!raw || typeof raw !== "object") return fail("不是 JSON 对象");
    if (raw.format && raw.format !== "roomkit.pack") return fail("format 不是 roomkit.pack");
    if (!raw.format) warnings.push("缺少 format 字段，按 roomkit.pack 处理");
    if (!ID_RE.test(raw.id || "")) return fail("包 id 只能用字母数字、下划线、连字符（≤48）");
    const id = String(raw.id).toLowerCase();
    const pack = {
      format: "roomkit.pack",
      v: 1,
      id,
      community: true,
      name: str(raw.name || id, 40),
      author: str(raw.author, 40),
      version: str(raw.version || "1.0.0", 20),
      license: str(raw.license, 40),
      description: str(raw.description, 300),
      furniture: [],
      scenes: [],
      stories: [],
      plays: [],
      characters: []
    };
    const images = {};
    let total = 0;
    for (const [k, v] of Object.entries(raw.images || {})) {
      if (!KEY_RE.test(k.replace(/[-.]/g, "_"))) {
        warnings.push("图片名不合法，已跳过：" + k);
        continue;
      }
      if (typeof v !== "string" || !DATA_URL_RE.test(v)) {
        warnings.push("图片必须是内嵌 data URL（png/webp/jpeg），已跳过：" + k);
        continue;
      }
      const bytes = Math.round(v.length * 0.75);
      if (bytes > LIMITS.imageBytes) return fail(`图片 ${k} 太大（${(bytes / 1e6).toFixed(1)}MB > 2.5MB）`);
      total += bytes;
      images[k] = v;
    }
    if (total > LIMITS.totalBytes) return fail(`图片总量太大（${(total / 1e6).toFixed(1)}MB > 15MB）`);
    const localIds = new Set((raw.furniture || []).map((d) => d && d.id).filter(Boolean));
    const localPlays = new Set((raw.plays || []).map((p) => p && p.id).filter(Boolean));
    const localScenes = new Set((raw.scenes || []).map((s) => s && s.id).filter(Boolean));
    const ns = (x) => x && localIds.has(x) ? id + "/" + x : x;
    const nsPlay = (x) => x && localPlays.has(x) ? id + "/" + x : x;
    ns.scene = (x) => x && localScenes.has(x) ? id + "/" + x : x;
    for (const d of (raw.furniture || []).slice(0, LIMITS.furniture)) {
      try {
        pack.furniture.push(cleanDef(d, id, images, warnings, nsPlay));
      } catch (e) {
        warnings.push("家具 " + (d && d.id) + " 已跳过：" + e.message);
      }
    }
    for (const s of (raw.scenes || []).slice(0, LIMITS.scenes)) {
      if (!s || !s.room) {
        warnings.push("场景缺少 room，已跳过");
        continue;
      }
      const c = clone(s);
      c.id = id + "/" + str(c.id || "scene", 40);
      c.name = str(c.name || c.id, 40);
      c.objects = (c.objects || []).slice(0, 400).map((o) => Object.assign({}, o, { def: ns(o.def) }));
      c.stories = (c.stories || []).slice(0, 20).map((st) => cleanStory(st, id, ns, warnings)).filter(Boolean);
      c.agents = (c.agents || []).slice(0, 30).map((a) => ({ id: str(a.id, 48), name: str(a.name, 16), kind: a.kind === "whale" ? "whale" : "girl", brain: ["auto", "pet", "manual"].includes(a.brain) ? a.brain : "auto", x: num(a.x, 0, 40, 1), y: num(a.y, 0, 40, 1), look: cleanLook(a.look), character: a.character ? id + "/" + str(a.character, 40) : void 0 }));
      pack.scenes.push(c);
    }
    for (const st of (raw.stories || []).slice(0, LIMITS.stories)) {
      const c = cleanStory(st, id, ns, warnings);
      if (c) pack.stories.push(c);
    }
    for (const pl of (raw.plays || []).slice(0, LIMITS.stories)) {
      if (!pl || !pl.id || !Array.isArray(pl.steps)) continue;
      pack.plays.push({ id: id + "/" + str(pl.id, 40), name: str(pl.name, 40), steps: pl.steps.slice(0, LIMITS.steps).map((s) => cleanStep(s, ns)).filter(Boolean) });
    }
    for (const ch of (raw.characters || []).slice(0, 30)) {
      try {
        const c = normalizeCharacter(ch);
        c.id = id + "/" + c.id;
        c.look = cleanLook(c.look);
        if (ch.avatar && DATA_URL_RE.test(ch.avatar)) c.avatar = ch.avatar;
        pack.characters.push(c);
      } catch (e) {
        warnings.push("角色卡已跳过：" + e.message);
      }
    }
    if (!pack.furniture.length && !pack.scenes.length && !pack.stories.length && !pack.characters.length) return fail("包里没有可用内容");
    return { ok: true, pack, errors, warnings };
  }
  function cleanLook(l) {
    const o = {};
    if (!l || typeof l !== "object") return o;
    for (const k of ["body", "belly", "cheek", "accent"]) if (COLOR_RE.test(l[k] || "")) o[k] = l[k];
    if (["maid", "bow", "cap", ""].includes(l.hat)) o.hat = l.hat;
    if (l.size != null) o.size = num(l.size, 0.6, 2.2, 1.4);
    return o;
  }
  function cleanDef(d, packId, images, warnings, nsPlay) {
    if (!d || !ID_RE.test(d.id || "")) throw new Error("id 不合法");
    const mount2 = ["floor", "flat", "wall"].includes(d.mount) ? d.mount : "floor";
    const def = {
      id: packId + "/" + d.id,
      name: str(d.name || d.id, 24),
      sub: str(d.sub, 40),
      cat: KEY_RE.test(d.cat || "") ? d.cat : "misc",
      mount: mount2,
      tags: Array.isArray(d.tags) ? d.tags.slice(0, 8).map((t) => str(t, 16)) : [],
      pack: packId
    };
    if (mount2 === "wall") {
      def.wsize = [num(d.wsize && d.wsize[0], 0.3, 6, 1), num(d.wsize && d.wsize[1], 10, 400, 80)];
      def.wz = num(d.wz, 0, 400, 80);
    } else {
      def.size = [Math.round(num(d.size && d.size[0], 1, 8, 1)), Math.round(num(d.size && d.size[1], 1, 8, 1))];
      def.height = num(d.height, 1, 600, mount2 === "flat" ? 2 : 60);
      if (d.blocks === false) def.blocks = false;
    }
    def.palette = {};
    for (const [k, v] of Object.entries(d.palette || {})) if (KEY_RE.test(k) && COLOR_RE.test(v)) def.palette[k] = v;
    def.variants = (Array.isArray(d.variants) ? d.variants : []).slice(0, 8).map((vr) => {
      const o = {};
      for (const [k, v] of Object.entries(vr || {})) if (KEY_RE.test(k) && COLOR_RE.test(v)) o[k] = v;
      return o;
    });
    const art = d.art || {};
    if (art.kind === "sprite") {
      let src = typeof art.src === "string" ? art.src : "";
      if (src[0] === "@") src = images[src.slice(1)] || "";
      else if (!DATA_URL_RE.test(src)) src = "";
      const parts = cleanParts(art.parts);
      if (!src && !parts.length) throw new Error('贴图必须引用包内图片（"@名字"）');
      def.art = { kind: "sprite", src: src || "data:,", fit: num(art.fit, 0.1, 3, 1), dx: num(art.dx, -400, 400, 0), dy: num(art.dy, -400, 400, 0), sy: num(art.sy, 0.2, 2, 1) };
      if (parts.length) def.art.parts = parts;
    } else if (art.kind === "wall" || mount2 === "wall") {
      def.art = { kind: "wall", draw: WALL_DRAW.includes(art.draw) ? art.draw : "frame" };
      if (def.art.draw === "image") {
        let src = typeof art.src === "string" ? art.src : "";
        if (src[0] === "@") src = images[src.slice(1)] || "";
        else if (!DATA_URL_RE.test(src)) src = "";
        if (!src) throw new Error('图片墙饰必须引用包内图片（"@名字"）');
        def.art.src = src;
      }
    } else {
      def.art = { kind: "proc", parts: cleanParts(art.parts) };
    }
    def.slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 8).map((s, i) => ({
      id: KEY_RE.test(s.id || "") ? s.id : "slot" + i,
      pose: POSES.includes(s.pose) ? s.pose : "stand",
      at: [num(s.at && s.at[0], -2, 10, 0.5), num(s.at && s.at[1], -2, 10, 0.5)],
      face: [Math.sign(num(s.face && s.face[0], -1, 1, 0)), Math.sign(num(s.face && s.face[1], -1, 1, 1))],
      z: num(s.z, 0, 300, 0),
      dur: [num(s.dur && s.dur[0], 1, 600, 6), num(s.dur && s.dur[1], 1, 600, 14)],
      need: cleanNeed(s.need),
      layer: s.layer === "back" ? "back" : "front",
      label: str(s.label, 16),
      say: Array.isArray(s.say) ? s.say.slice(0, 6).map((x) => str(x, 40)) : void 0
    }));
    def.states = {};
    for (const [k, v] of Object.entries(d.states || {})) if (KEY_RE.test(k) && ["boolean", "number"].includes(typeof v)) def.states[k] = v;
    if (typeof d.act === "string" && ACT_RE.test(d.act)) {
      def.act = d.act.indexOf("play:") === 0 ? "play:" + nsPlay(d.act.slice(5)) : d.act;
    }
    if (Array.isArray(d.say)) def.say = d.say.slice(0, 6).map((x) => str(x, 40));
    if (mount2 === "wall" && d.portal === true) def.portal = true;
    if (d.light && typeof d.light === "object") {
      def.light = { at: [num(d.light.at && d.light.at[0], -2, 10, 0.5), num(d.light.at && d.light.at[1], -2, 10, 0.5)], z: num(d.light.z, 0, 400, 80), radius: num(d.light.radius, 0.3, 8, 2.5), color: COLOR_RE.test(d.light.color || "") ? d.light.color : "#ffd59a", power: num(d.light.power, 0.1, 1.5, 1) };
      if (typeof d.light.when === "string" && /^!?[a-z0-9_]{1,24}$/i.test(d.light.when)) def.light.when = d.light.when;
    }
    if (d.info && typeof d.info === "object") {
      def.info = { title: str(d.info.title, 40), sub: str(d.info.sub, 60), lines: (Array.isArray(d.info.lines) ? d.info.lines : []).slice(0, 12).map((l) => Array.isArray(l) ? [str(l[0], 24), str(l[1], 60)] : str(l, 80)) };
    }
    return def;
  }
  function cleanNeed(n) {
    const o = {};
    for (const k of ["energy", "fun", "social"]) if (n && n[k] != null) o[k] = num(n[k], -1, 1, 0);
    return o;
  }
  function cleanParts(parts) {
    if (!Array.isArray(parts)) return [];
    const out = [];
    for (const p of parts.slice(0, LIMITS.parts)) {
      if (!p || !PART_T.includes(p.t)) continue;
      const q = { t: p.t };
      for (const k of ["x", "y", "w", "d", "r", "r0", "r1"]) if (p[k] != null) q[k] = num(p[k], -2, 12, 0);
      for (const k of ["z", "h"]) if (p[k] != null) q[k] = num(p[k], 0, 600, 0);
      if (p.o != null) q.o = num(p.o, 0.05, 1, 1);
      if (p.sq != null) q.sq = num(p.sq, 0.2, 2, 0.9);
      if (p.bias != null) q.bias = num(p.bias, -0.1, 0.1, 0);
      for (const k of ["c", "b", "glowC"]) {
        const c = colorOrKey(p[k]);
        if (c) q[k] = c;
      }
      if (p.faces) {
        q.faces = {};
        for (const f of ["top", "px", "nx", "py", "ny"]) {
          const c = colorOrKey(p.faces[f]);
          if (c) q.faces[f] = c;
        }
      }
      if (["px", "nx", "py", "ny"].includes(p.glow)) q.glow = p.glow;
      for (const k of ["lit", "when"]) if (typeof p[k] === "string" && /^!?[a-z0-9_]{1,24}$/i.test(p[k])) q[k] = p[k];
      if (p.open) q.open = true;
      if (p.t === "rug") {
        q.shape = p.shape === "round" ? "round" : "rect";
        if (["stripes", "rings"].includes(p.pattern)) q.pattern = p.pattern;
      }
      if (p.t === "fx") q.fx = "fish";
      out.push(q);
    }
    return out;
  }
  function cleanStep(s, ns) {
    if (!s || typeof s !== "object") return null;
    if (Array.isArray(s.par)) return { par: s.par.slice(0, 12).map((x) => cleanStep(x, ns)).filter(Boolean) };
    if (!STEP_DO.includes(s.do)) return null;
    const o = { do: s.do };
    for (const k of ["who", "node", "flag", "slot", "pose", "kind", "expr", "emote", "name", "period", "weather", "hat", "focus"]) if (s[k] != null) o[k] = str(s[k], 48);
    for (const k of ["text", "if"]) if (s[k] != null) o[k] = typeof s[k] === "string" ? str(s[k]) : clone(s[k]);
    for (const k of ["s", "ms", "x", "y", "dx", "dy", "by", "zoom"]) if (s[k] != null) o[k] = num(s[k], -100, 1e5, 0);
    if (s.value != null && ["string", "number", "boolean"].includes(typeof s.value)) o.value = s.value;
    if (s.obj != null) o.obj = s.obj === "$target" ? "$target" : ns(str(s.obj, 64));
    if (s.to != null) o.to = Array.isArray(s.to) ? [num(s.to[0], 0, 40, 0), num(s.to[1], 0, 40, 0)] : ns(str(s.to, 64));
    if (s.patch && typeof s.patch === "object") {
      o.patch = {};
      for (const [k, v] of Object.entries(s.patch)) if (KEY_RE.test(k) && ["boolean", "number", "string"].includes(typeof v)) o.patch[k] = v;
    }
    if (s.do === "choice") o.options = (Array.isArray(s.options) ? s.options : []).slice(0, 6).map((x) => ({ label: str(x.label, 60), goto: x.goto ? str(x.goto, 48) : void 0, if: x.if, set: x.set && typeof x.set === "object" ? clone(x.set) : void 0 }));
    if (s.do === "cmd") {
      if (!s.cmd || !CMD_OPS.includes(s.cmd.op)) return null;
      o.cmd = clone(s.cmd);
      if (o.cmd.obj) o.cmd.obj = ns(o.cmd.obj);
    }
    if (s.camera === false) o.camera = false;
    if (s.run) o.run = true;
    if (s.required) o.required = true;
    return o;
  }
  function cleanStory(st, packId, ns, warnings) {
    if (!st || !ID_RE.test(st.id || "") || !st.nodes || typeof st.nodes !== "object") {
      warnings.push("剧情缺少 id/nodes，已跳过");
      return null;
    }
    const t = st.trigger || {};
    const out = {
      id: packId + "/" + st.id,
      name: str(st.name || st.id, 40),
      once: !!st.once,
      daily: !!st.daily,
      marker: st.marker !== false,
      trigger: { on: ["start", "click", "agent", "hour", "manual"].includes(t.on) ? t.on : "manual" },
      roles: {},
      start: str(st.start || "start", 48),
      nodes: {}
    };
    if (t.obj) out.trigger.obj = str(t.obj, 64);
    if (t.def) out.trigger.def = ns(str(t.def, 64));
    if (t.agent) out.trigger.agent = str(t.agent, 48);
    if (t.scene) out.trigger.scene = ns.scene ? ns.scene(str(t.scene, 64)) : str(t.scene, 64);
    if (t.from != null) out.trigger.from = num(t.from, 0, 24, 0);
    if (t.to != null) out.trigger.to = num(t.to, 0, 24, 24);
    if (t.chance != null) out.trigger.chance = num(t.chance, 0, 1, 1);
    if (t.if != null) out.trigger.if = t.if;
    for (const [k, v] of Object.entries(st.roles || {})) if (KEY_RE.test(k)) out.roles[k] = str(v, 48);
    let steps = 0;
    for (const [k, list] of Object.entries(st.nodes)) {
      if (!/^[a-z0-9_-]{1,48}$/i.test(k) || !Array.isArray(list)) continue;
      out.nodes[k] = list.slice(0, LIMITS.steps - steps).map((s) => cleanStep(s, ns)).filter(Boolean);
      steps += out.nodes[k].length;
    }
    return out;
  }
  var PackStore = class {
    constructor(name) {
      this.name = (name || "roomkit") + "-packs";
      this._p = null;
    }
    _db() {
      if (this._p) return this._p;
      this._p = new Promise((res, rej) => {
        if (!window.indexedDB) {
          rej(new Error("浏览器不支持 IndexedDB"));
          return;
        }
        const r = indexedDB.open(this.name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("packs", { keyPath: "id" });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this._p;
    }
    async _tx(mode, fn) {
      const db = await this._db();
      return new Promise((res, rej) => {
        const tx = db.transaction("packs", mode), st = tx.objectStore("packs"), q = fn(st);
        tx.oncomplete = () => res(q && q.result);
        tx.onerror = () => rej(tx.error);
      });
    }
    listStrict() {
      return this._tx("readonly", (st) => st.getAll()).then((r) => r || []);
    }
    list() {
      return this.listStrict().catch(() => []);
    }
    get(id) {
      return this._tx("readonly", (st) => st.get(id)).catch(() => null);
    }
    put(pack) {
      return this._tx("readwrite", (st) => st.put(pack));
    }
    remove(id) {
      return this._tx("readwrite", (st) => st.delete(id));
    }
  };
  function exportPack(pack) {
    const out = { format: "roomkit.pack", v: 1, id: pack.id, name: pack.name, author: pack.author || "", version: pack.version || "1.0.0", license: pack.license || "", description: pack.description || "", images: {}, furniture: [], scenes: clone(pack.scenes || []), stories: [], plays: [], characters: [] };
    const strip = (x) => typeof x === "string" && x.indexOf(pack.id + "/") === 0 ? x.slice(pack.id.length + 1) : x;
    let n = 0;
    for (const d of pack.furniture || []) {
      const c = clone(d);
      c.id = strip(c.id);
      delete c.pack;
      delete c.rotMode;
      delete c.rots;
      delete c._img;
      if (c.art && (c.art.kind === "sprite" || c.art.draw === "image") && /^data:/.test(c.art.src)) {
        const key2 = "img" + n++;
        out.images[key2] = c.art.src;
        c.art.src = "@" + key2;
      }
      if (c.act && c.act.indexOf("play:") === 0) c.act = "play:" + strip(c.act.slice(5));
      out.furniture.push(c);
    }
    for (const s of out.scenes) {
      s.id = strip(s.id);
      (s.objects || []).forEach((o) => {
        o.def = strip(o.def);
      });
      (s.stories || []).forEach((st) => stripStory(st, strip));
    }
    out.stories = (pack.stories || []).map((s) => stripStory(Object.assign(clone(s), { id: strip(s.id) }), strip));
    out.plays = (pack.plays || []).map((p) => {
      const c = Object.assign(clone(p), { id: strip(p.id) });
      (c.steps || []).forEach((st) => stripStep(st, strip));
      return c;
    });
    out.characters = (pack.characters || []).map((c) => Object.assign(clone(c), { id: strip(c.id) }));
    return out;
  }
  function stripStep(st, strip) {
    if (!st || typeof st !== "object") return;
    if (Array.isArray(st.par)) st.par.forEach((x) => stripStep(x, strip));
    if (typeof st.obj === "string") st.obj = strip(st.obj);
    if (typeof st.to === "string") st.to = strip(st.to);
    if (st.cmd && typeof st.cmd.obj === "string") st.cmd.obj = strip(st.cmd.obj);
  }
  function stripStory(s, strip) {
    if (s.trigger) {
      if (s.trigger.scene) s.trigger.scene = strip(s.trigger.scene);
      if (s.trigger.def) s.trigger.def = strip(s.trigger.def);
    }
    for (const k in s.nodes || {}) (s.nodes[k] || []).forEach((st) => stripStep(st, strip));
    return s;
  }

  // shared/activities.js
  function activityLayout(world, activity) {
    const nav = new Nav(world);
    const { w, h } = world.room;
    const spawn = nav.nearestFree(w / 2, h / 2, Math.max(w, h));
    if (!spawn) throw new Error("scene.room 没有可走的出生格");
    const targets = /* @__PURE__ */ new Map();
    if (!activity) return { nav, spawn, targets };
    for (const id of [...activity.beaconIds, activity.exitId]) {
      const object = world.byId.get(id);
      if (!object) throw new Error(`activity 引用了不存在的物件 ${id}`);
      const def = world.def(object);
      const slots = def.slots.map((slot) => {
        const pose = world.slotPose(object, slot);
        return pose && (pose.approach || { x: pose.x, y: pose.y });
      }).filter((point) => point && nav.freeAt(point.x, point.y) && nav.path(spawn, point));
      if (!slots.length) {
        const area = world.footprint(object, def);
        const near = area ? { x: (area.x0 + area.x1) / 2, y: area.y1 + 0.5 } : object.wall === "left" ? { x: 0.5, y: object.at } : { x: object.at, y: 0.5 };
        const point = nav.nearestFree(near.x, near.y, 1);
        if (point && nav.path(spawn, point)) slots.push(point);
      }
      if (!slots.length) throw new Error(`activity 物件 ${id} 的交互位不可达`);
      targets.set(id, slots);
    }
    return { nav, spawn, targets };
  }

  // shared/world-assets.gen.js
  var BUILTIN = { id: "default", furniture: [] };

  // shared/world-format.js
  var WORLD_BYTES = 4 * 1024 * 1024;
  var SESSION_PROTOCOL = "roomkit.session/1";
  var encoder = new TextEncoder();
  var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var pick2 = (source, keys) => Object.fromEntries(keys.filter((key2) => Object.hasOwn(source, key2)).map((key2) => [key2, source[key2]]));
  var text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
  var between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  function worldError(field, message, code = "invalid_action") {
    return Object.assign(new Error(`${field} ${message}`), { field, code });
  }
  function canonicalJSON(value) {
    if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
    if (isObject(value)) {
      const fields = Object.keys(value).sort().map((key2) => JSON.stringify(key2) + ":" + canonicalJSON(value[key2]));
      return "{" + fields.join(",") + "}";
    }
    return JSON.stringify(value);
  }
  async function digestJSON(value) {
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(canonicalJSON(value)));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function checkTree(value, field, depth = 0) {
    if (depth > 12) throw worldError(field, "嵌套过深");
    if (Array.isArray(value)) {
      if (value.length > 500) throw worldError(field, "项目过多");
      for (const child of value) checkTree(child, field, depth + 1);
    } else if (isObject(value)) {
      const keys = Object.keys(value);
      if (keys.length > 300) throw worldError(field, "字段过多");
      for (const key2 of keys) {
        if (["__proto__", "constructor", "prototype"].includes(key2) || key2.length > 80) throw worldError(field, "含不允许的字段名");
        checkTree(value[key2], field, depth + 1);
      }
    } else if (value !== null && (typeof value === "string" ? value.length > (value.startsWith("data:image/") ? WORLD_BYTES : 1e3) : typeof value !== "boolean" && !between(value, -1e8, 1e8))) {
      throw worldError(field, "含超出范围的值");
    }
  }
  function checkImage(value, field) {
    const match = typeof value === "string" && /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length * 0.75 > LIMITS.imageBytes) throw worldError(field, "需要小于 2.5 MB 的内嵌 PNG 或 WebP");
    let data;
    try {
      data = atob(match[2]);
    } catch {
      throw worldError(field, "图片编码无效");
    }
    const byte = (index) => data.charCodeAt(index);
    let w, h;
    if (match[1] === "png" && data.startsWith("PNG\r\n\n") && data.slice(12, 16) === "IHDR") {
      const u32 = (offset) => byte(offset) * 2 ** 24 + byte(offset + 1) * 2 ** 16 + byte(offset + 2) * 256 + byte(offset + 3);
      w = u32(16);
      h = u32(20);
    } else if (match[1] === "webp" && data.startsWith("RIFF") && data.slice(8, 12) === "WEBP") {
      const tag = data.slice(12, 16);
      if (tag === "VP8X" && !(byte(20) & 2)) {
        const u24 = (offset) => byte(offset) + byte(offset + 1) * 256 + byte(offset + 2) * 65536;
        w = u24(24) + 1;
        h = u24(27) + 1;
      } else if (tag === "VP8L" && byte(20) === 47 && data.length >= 25) {
        w = 1 + (byte(21) | (byte(22) & 63) << 8);
        h = 1 + (byte(22) >> 6 | byte(23) << 2 | (byte(24) & 15) << 10);
      } else if (tag === "VP8 " && data.slice(23, 26) === "*" && data.length >= 30) {
        w = (byte(26) | byte(27) << 8) & 16383;
        h = (byte(28) | byte(29) << 8) & 16383;
      }
    }
    if (!between(w, 1, 4096) || !between(h, 1, 4096) || w * h > 4194304) throw worldError(field, "图片格式或像素尺寸不合法");
  }
  var PACK_FIELDS = ["format", "v", "id", "name", "author", "version", "license", "description", "furniture", "images"];
  var DEF_FIELDS = ["id", "name", "sub", "cat", "mount", "tags", "size", "height", "blocks", "wsize", "wz", "palette", "variants", "art", "slots", "states", "act", "light", "info"];
  function cleanPack(raw, index) {
    const field = `packs[${index}]`;
    if (!isObject(raw) || raw.format !== "roomkit.pack" || raw.v !== 1 || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(raw.id || "") || raw.id === BUILTIN.id) throw worldError(field, "内容包版本或 id 不合法");
    if (![raw.name, raw.author, raw.license].every((value) => text(value, 40)) || !text(raw.version, 20)) throw worldError(field, "缺少名称、作者、版本或许可");
    if (!Array.isArray(raw.furniture) || !raw.furniture.length || raw.furniture.length > LIMITS.furniture) throw worldError(field, "家具数量不合法");
    const pack = pick2(raw, PACK_FIELDS);
    if (pack.images != null && !isObject(pack.images)) throw worldError(field, "图片清单不合法");
    for (const [key2, image] of Object.entries(pack.images || {})) checkImage(image, `${field}.images.${key2}`);
    const ids = /* @__PURE__ */ new Set();
    pack.furniture = pack.furniture.map((definition) => {
      if (!isObject(definition) || !text(definition.id, 48) || ids.has(definition.id)) throw worldError(field, "家具 id 不合法或重复");
      ids.add(definition.id);
      const def = pick2(definition, DEF_FIELDS);
      if (def.art != null) {
        if (!isObject(def.art)) throw worldError(field, "家具外观无效");
        def.art = pick2(def.art, ["kind", "src", "fit", "dx", "dy", "sy", "parts", "draw"]);
        if (def.art.src != null && def.art.src !== "data:,") {
          if (typeof def.art.src === "string" && def.art.src.startsWith("@")) {
            if (!Object.hasOwn(pack.images || {}, def.art.src.slice(1))) throw worldError(field, "图片引用缺失", "missing_asset");
          } else checkImage(def.art.src, `${field}.furniture.${def.id}.art.src`);
        }
      }
      if (typeof def.act === "string" && !/^(toggle:[a-z0-9_]+|use(:[a-z0-9_]+)?|info)$/.test(def.act)) delete def.act;
      return def;
    });
    checkTree(pack, field);
    let validated;
    try {
      validated = validatePack(pack);
    } catch {
      throw worldError(field, "内容包字段不合法");
    }
    if (!validated.ok || validated.warnings.length || validated.pack.furniture.length !== pack.furniture.length) throw worldError(field, [...validated.errors, ...validated.warnings].join("、") || "家具校验失败");
    return { pack, definitions: validated.pack.furniture };
  }
  function cleanScene(raw) {
    if (!isObject(raw) || raw.format !== "roomkit.scene" || ![1, 2].includes(raw.v)) throw worldError("scene.format/v", "场景版本不受支持", "unsupported_version");
    if (!text(raw.id, 80) || !text(raw.name, 80)) throw worldError("scene", "缺少 id 或名称");
    if (!isObject(raw.room)) throw worldError("scene.room", "需要房间对象");
    const room = pick2(raw.room, Object.keys(ROOM_DEFAULTS));
    if (![room.w, room.h].every((n) => Number.isInteger(n) && between(n, 1, 40))) throw worldError("scene.room", "尺寸必须在 1 到 40 格之间");
    if (room.cells != null && (!Array.isArray(room.cells) || room.cells.length > room.h || !room.cells.every((row) => typeof row === "string" && row.length <= room.w && /^[a-z.]*$/.test(row)))) throw worldError("scene.room.cells", "格子布局不合法");
    if (room.mats != null) {
      if (!Array.isArray(room.mats) || room.mats.length > 26 || !room.mats.every(isObject)) throw worldError("scene.room.mats", "材质清单不合法");
      room.mats = room.mats.map((material) => pick2(material, ["kind", "color"]));
    }
    if (room.walls != null) {
      if (!isObject(room.walls)) throw worldError("scene.room.walls", "墙面配置不合法");
      room.walls = pick2(room.walls, Object.keys(ROOM_DEFAULTS.walls));
      for (const side of ["left", "right"]) if (room.walls[side] != null && typeof room.walls[side] !== "boolean") throw worldError("scene.room.walls", "墙面开关不合法");
      if (room.walls.height != null && !between(room.walls.height, 0, 600)) throw worldError("scene.room.walls.height", "墙高超限");
    }
    if (room.slab != null && !between(room.slab, 0, 100)) throw worldError("scene.room.slab", "地板厚度超限");
    if (!Array.isArray(raw.objects) || raw.objects.length > 400) throw worldError("scene.objects", "物件数量不合法");
    const ids = /* @__PURE__ */ new Set();
    const objects = raw.objects.map((item, index) => {
      const field = `scene.objects[${index}]`;
      if (!isObject(item) || !text(item.id, 80) || !text(item.def, 100) || ids.has(item.id)) throw worldError(field, "实例或定义 id 不合法");
      ids.add(item.id);
      const object = pick2(item, ["id", "def", "x", "y", "wall", "at", "z", "rot", "state", "variant", "colors"]);
      const { x, y, wall, at, z, rot, state, colors } = object;
      if (wall == null) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || !between(x, 0, room.w - 1) || !between(y, 0, room.h - 1)) throw worldError(field, "地面坐标不合法");
      } else if (!["left", "right"].includes(wall) || !between(at, 0, wall === "left" ? room.h : room.w) || z != null && !between(z, 0, 600)) throw worldError(field, "墙面坐标不合法");
      if (rot != null && (!Number.isInteger(rot) || !between(rot, 0, 3))) throw worldError(field, "朝向不合法");
      if (state != null && !isObject(state)) throw worldError(field, "状态不合法");
      if (colors != null && !isObject(colors)) throw worldError(field, "调色不合法");
      if (state) {
        checkTree(state, field);
        object.state = Object.fromEntries(Object.entries(state).filter(([key2, value]) => key2 !== "to" && ["boolean", "number", "string"].includes(typeof value)));
      }
      return object;
    });
    const env = isObject(raw.env) ? pick2(raw.env, ["period", "weather"]) : {};
    checkTree({ room, objects, env }, "scene");
    return normalizeScene({ format: "roomkit.scene", v: raw.v, id: raw.id, name: raw.name, room, objects, agents: [], env });
  }
  function cleanActivity(raw) {
    if (raw == null) return null;
    if (!isObject(raw) || raw.kind !== "cooperative-beacons" || raw.v !== 1 || raw.minContributors !== 2 || !Array.isArray(raw.beaconIds) || raw.beaconIds.length !== 3 || ![...raw.beaconIds, raw.exitId].every((id) => text(id, 80)) || (/* @__PURE__ */ new Set([...raw.beaconIds, raw.exitId])).size !== 4) throw worldError("activity", "需要三个不同信标和一个出口");
    return pick2(raw, ["kind", "v", "beaconIds", "exitId", "minContributors"]);
  }
  function catalogFor(release, definitions, sprites) {
    const catalog = new Catalog();
    if (release.dependencies.some(({ source }) => source === "builtin")) {
      catalog.addAll(BUILTIN.furniture.map((def) => {
        var _a, _b;
        const file = (_b = (_a = def.art) == null ? void 0 : _a.src) == null ? void 0 : _b.split("/").pop();
        return file && (sprites == null ? void 0 : sprites[file]) ? { ...def, art: { ...def.art, src: sprites[file] } } : def;
      }));
    }
    catalog.addAll(definitions);
    return catalog;
  }
  function worldRuntime(release, sprites) {
    const definitions = release.packs.flatMap((pack) => validatePack(pack).pack.furniture);
    const catalog = catalogFor(release, definitions, sprites);
    const world = new World(catalog, release.scene);
    return { catalog, world, ...activityLayout(world, release.activity) };
  }
  async function buildWorldRelease({ worldId, revision, title, authorAccountId, scene, packs = [], activity = null }) {
    if (![worldId, title, authorAccountId].every((value) => text(value, 80)) || !Number.isSafeInteger(revision) || revision < 1) throw worldError("worldId/revision/title/authorAccountId", "发布信息不合法");
    const clean2 = cleanScene(scene);
    if (!Array.isArray(packs) || packs.length > 16) throw worldError("packs", "依赖数量超限");
    const embedded = packs.map(cleanPack);
    if (new Set(embedded.map(({ pack }) => pack.id)).size !== embedded.length) throw worldError("packs", "同名内容包冲突", "missing_asset");
    const used = new Set(clean2.objects.map((object) => object.def));
    const builtin = BUILTIN.furniture.some(({ id }) => used.has(id));
    const sources = new Set(builtin ? BUILTIN.furniture.map(({ id }) => id) : []);
    const dependencies = builtin ? [{ id: BUILTIN.id, version: BUILTIN.version, hash: BUILTIN.hash, source: "builtin" }] : [];
    const release = {
      format: "roomkit.world",
      v: 1,
      worldId,
      revision,
      title,
      authorAccountId,
      protocol: SESSION_PROTOCOL,
      scene: clean2,
      dependencies,
      packs: embedded.map(({ pack }) => pack),
      activity: cleanActivity(activity)
    };
    if (encoder.encode(JSON.stringify(release)).length + 74 > WORLD_BYTES) throw worldError("world", "发布包超过 4 MiB", "body_too_large");
    for (const { pack, definitions } of embedded) {
      for (const { id } of definitions) sources.add(id);
      dependencies.push({ id: pack.id, version: pack.version, hash: await digestJSON(pack), source: "embedded" });
    }
    if (encoder.encode(JSON.stringify(release)).length + 74 > WORLD_BYTES) throw worldError("world", "发布包超过 4 MiB", "body_too_large");
    for (const id of used) if (!sources.has(id)) throw worldError("scene.objects.def", `缺少家具 ${id}`, "missing_asset");
    const catalog = catalogFor(release, embedded.flatMap(({ definitions }) => definitions));
    const world = new World(catalog, clean2);
    for (const object of world.objects) {
      const def = world.def(object);
      if (def.mount === "wall" !== Boolean(object.wall)) throw worldError("scene.objects", `家具 ${object.id} 的摆放方式不符`);
      const area = world.footprint(object, def);
      if (area && (area.x1 > world.room.w || area.y1 > world.room.h)) throw worldError("scene.objects", `家具 ${object.id} 超出房间`);
    }
    try {
      activityLayout(world, release.activity);
    } catch (error) {
      throw worldError("activity", error.message);
    }
    return { ...release, hash: await digestJSON(release) };
  }
  async function verifyWorldRelease(raw) {
    if (!isObject(raw) || raw.format !== "roomkit.world" || raw.v !== 1 || raw.protocol !== SESSION_PROTOCOL) throw worldError("format/v/protocol", "世界版本不受支持", "unsupported_version");
    if (!Array.isArray(raw.dependencies) || raw.dependencies.length > 17) throw worldError("dependencies", "依赖清单不合法", "missing_asset");
    checkTree(raw.dependencies, "dependencies");
    const release = await buildWorldRelease(raw);
    if (canonicalJSON(raw.dependencies) !== canonicalJSON(release.dependencies)) throw worldError("dependencies", "素材版本或摘要不一致", "missing_asset");
    if (raw.hash !== release.hash) throw worldError("hash", "世界摘要不一致");
    return release;
  }
  function collectWorldPacks(scene, packs, metadata = {}) {
    const used = new Set(scene.objects.map(({ def }) => def));
    const byId2 = /* @__PURE__ */ new Map();
    for (const pack of packs) if (pack.id !== BUILTIN.id) {
      for (const furniture of pack.furniture || []) if (used.has(furniture.id)) {
        if (byId2.has(furniture.id)) throw worldError("packs", `同名家具冲突 ${furniture.id}`, "missing_asset");
        byId2.set(furniture.id, pack);
      }
    }
    return [...new Set(byId2.values())].map((pack) => exportPack({
      ...pack,
      furniture: pack.furniture.filter(({ id }) => used.has(id)),
      author: pack.author || metadata.author,
      license: pack.license || metadata.license,
      scenes: [],
      stories: [],
      plays: [],
      characters: []
    }));
  }

  // web/roomkit/workshop.js
  function download(filename, obj, compact = false) {
    const blob = new Blob([JSON.stringify(obj, null, compact ? 0 : 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[\\/:*?"<>|]+/g, "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3e3);
  }
  function pickFile(accept) {
    return new Promise((res) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept;
      inp.style.display = "none";
      inp.onchange = () => {
        res(inp.files && inp.files[0]);
        inp.remove();
      };
      document.body.appendChild(inp);
      inp.click();
    });
  }
  async function myPack(app) {
    let p = app.packs.find((x) => x.id === "my");
    if (!p && app.packStore) p = await app.packStore.get("my");
    if (!p) p = { format: "roomkit.pack", v: 1, id: "my", name: "我的家具包", author: "", validated: true, mine: true, furniture: [], characters: [], stories: [], scenes: [], plays: [] };
    return p;
  }
  async function saveMyPack(app, p) {
    if (app.packStore) await app.packStore.put(p);
    app.usePack(p);
  }
  function renderScenesPane(ed, el) {
    const app = ed.app, sc = app.world.scene;
    const saved = app.storage.list ? app.storage.list() : [];
    const tpls = [];
    app.packs.forEach((p) => (p.scenes || []).forEach((s) => tpls.push({ key: p.id + "|" + s.id, name: s.name || s.id, pack: p.name })));
    el.innerHTML = `
    <div class="rk-field">当前场景</div>
    <div class="rk-line"><input type="text" data-sc-in="name" value="${esc(sc.name)}" maxlength="24"></div>
    <div class="rk-chips" style="margin-top:6px">
      <button data-sc="new">＋ 空房间</button><button data-sc="open-air">＋ 露天广场</button><button data-sc="dup">复制当前</button><button data-sc="export">导出场景</button><button data-sc="import">导入场景</button>
    </div>
    <div class="rk-field">世界草稿</div>
    <div class="rk-chips"><button data-sc="world-save">保存世界草稿</button><button data-sc="world-export">导出世界包</button><button data-sc="world-open">预览最近草稿</button><button data-sc="world-import">预览世界包</button></div>
    <div class="rk-line"><input data-world-author placeholder="缺失素材作者时填写" maxlength="40"><input data-world-license placeholder="缺失素材许可时填写" maxlength="40"></div>
    <div class="rk-field">我的场景</div>
    ${saved.length ? saved.map((s) => `<div class="rk-scene ${s.id === sc.id ? "on" : ""}" data-sc-open="${esc(s.id)}"><span>${esc(s.name || s.id)}</span><small>${s.w || "?"}×${s.h || "?"}</small>${s.id === sc.id ? "" : `<button data-sc-del="${esc(s.id)}" title="删除">×</button>`}</div>`).join("") : '<div class="rk-hint">还没有存过的场景（改动会自动保存）</div>'}
    <div class="rk-field">从模板新建</div>
    <div class="rk-chips">${tpls.map((t) => `<button data-sc-tpl="${esc(t.key)}" title="${esc(t.pack)}">${esc(t.name)}</button>`).join("") || '<span class="rk-hint">没有模板</span>'}</div>
    <div class="rk-hint">露天广场没有墙、地面更大，适合把多个房间、街道拼成大场景；场景 JSON 里可以带自己的剧情（stories），导出后发给别人就是一个"可玩的场景"。</div>`;
  }
  async function onScenesClick(ed, e) {
    const app = ed.app;
    const b = e.target.closest("[data-sc],[data-sc-open],[data-sc-del],[data-sc-tpl]");
    if (!b) return false;
    if (b.hasAttribute("data-sc-del")) {
      e.stopPropagation();
      const id = b.getAttribute("data-sc-del");
      if (confirm("删除这个场景？（不能撤销）")) {
        app.storage.remove(id);
        ed.refresh();
      }
      return true;
    }
    if (b.hasAttribute("data-sc-open")) {
      const id = b.getAttribute("data-sc-open");
      if (id !== app.world.scene.id) app.goRoom(id);
      return true;
    }
    if (b.hasAttribute("data-sc-tpl")) {
      const [pid, sid] = b.getAttribute("data-sc-tpl").split("|");
      const p = app.packs.find((x) => x.id === pid), t = p && (p.scenes || []).find((s) => s.id === sid);
      if (t) {
        const s = clone(t);
        s.template = t.id;
        s.id = uid("scene");
        app.openScene(s);
        app.hud.toast("已从模板新建：" + s.name);
      }
      return true;
    }
    const a = b.getAttribute("data-sc");
    if (a == null ? void 0 : a.startsWith("world-")) {
      try {
        if (a === "world-open") await app.worldDrafts.preview(await app.worldDrafts.latest());
        else if (a === "world-import") {
          const file = await pickFile(".json,application/json");
          if (file) {
            if (file.size > WORLD_BYTES) throw new Error("世界包超过 4 MiB");
            await app.worldDrafts.preview(JSON.parse(await file.text()));
          }
        } else {
          const options = { author: elValue(b, "[data-world-author]"), license: elValue(b, "[data-world-license]") };
          if (a === "world-save") {
            await app.worldDrafts.save(options);
            app.hud.toast("世界草稿已保存");
          } else {
            const release = await app.worldDrafts.capture(options);
            download(release.title + ".world.json", release, true);
          }
        }
      } catch (error) {
        app.hud.toast(error.message, 3e3);
      }
      return true;
    }
    if (a === "new" || a === "open-air") {
      const open = a === "open-air";
      app.openScene({
        id: uid("scene"),
        name: open ? "露天广场" : "新房间",
        room: open ? { w: 16, h: 12, mats: [{ kind: "grass", color: "#9bd17a" }, { kind: "stone", color: "#d9d2c3" }], walls: { left: false, right: false, height: 300 }, slab: 22 } : { w: 8, h: 6, walls: { left: true, right: true, height: 300 } },
        objects: open ? [] : [{ def: "door", wall: "right", at: 6.5, z: 0 }, { def: "window", wall: "left", at: 2.5, z: 100 }],
        agents: [{ ...DEFAULT_ROLE, x: open ? 8 : 4, y: open ? 6 : 3 }]
      });
      return true;
    }
    if (a === "dup") {
      const s = app.world.toJSON();
      s.id = uid("scene");
      s.name = (s.name || "房间") + " 副本";
      app.openScene(s);
      app.hud.toast("已复制为：" + s.name);
      return true;
    }
    if (a === "export") {
      app.exportScene();
      return true;
    }
    if (a === "import") {
      ed.el.file.click();
      return true;
    }
    return true;
  }
  function elValue(button2, selector) {
    var _a;
    return ((_a = button2.parentElement.parentElement.querySelector(selector)) == null ? void 0 : _a.value.trim()) || "";
  }
  function onScenesChange(ed, e) {
    const t = e.target;
    if (t.getAttribute("data-sc-in") !== "name") return false;
    const name = t.value.trim().slice(0, 24);
    if (name && name !== ed.app.world.scene.name) ed.exec({ t: "meta", patch: { name } });
    return true;
  }
  function renderPacksPane(ed, el) {
    const app = ed.app;
    const count = (p) => [(p.furniture || []).length + " 件家具", (p.stories || []).length ? p.stories.length + " 段剧情" : "", (p.characters || []).length ? p.characters.length + " 张角色卡" : ""].filter(Boolean).join(" · ");
    const chars = [...app.characters.values()];
    el.innerHTML = `
    <div class="rk-chips">
      <button data-pk="workshop" class="on">＋ 自制家具</button><button data-pk="import">导入内容包</button><button data-pk="export-my">导出我的包</button>
    </div>
    <div class="rk-field">已安装的内容包</div>
    ${app.packs.map((p) => `<div class="rk-pack"><b>${esc(p.name || p.id)}</b><span>${esc((p.author ? p.author + " · " : "") + count(p))}</span>${p.community || p.mine ? `<button data-pk-del="${esc(p.id)}" title="卸载">卸载</button>` : "<small>内置</small>"}</div>`).join("")}
    <div class="rk-field">角色卡</div>
    <div class="rk-chips"><button data-pk="char">导入角色卡（PNG / JSON）</button></div>
    ${chars.map((c) => `<div class="rk-pack">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover">` : ""}<b>${esc(c.name)}</b><span>${esc((c.persona || "").slice(0, 26))}</span><button data-pk-spawn="${esc(c.id)}" title="请进房间">请进来</button></div>`).join("")}
    <div class="rk-hint">内容包就是一个 .json 文件：家具、场景、剧情、角色卡都能打包，图片内嵌其中（格式见 docs/04）。导入时会自动校验并加命名空间，别人的包也能放心装。角色卡兼容 SillyTavern / TavernAI 卡。</div>`;
  }
  async function onPacksClick(ed, e) {
    const app = ed.app;
    const b = e.target.closest("[data-pk],[data-pk-del],[data-pk-spawn]");
    if (!b) return false;
    if (b.hasAttribute("data-pk-del")) {
      const id = b.getAttribute("data-pk-del");
      if (confirm("卸载这个内容包？场景里用到它的家具会暂时消失（重新导入即可恢复）。")) {
        await app.uninstallPack(id);
        app.hud.toast("已卸载");
        ed.refresh();
      }
      return true;
    }
    if (b.hasAttribute("data-pk-spawn")) {
      const c = app.characters.get(b.getAttribute("data-pk-spawn"));
      if (c) spawnCharacter(ed, c);
      return true;
    }
    const a = b.getAttribute("data-pk");
    if (a === "workshop") openWorkshop(ed);
    else if (a === "import") {
      const f = await pickFile(".json,application/json");
      if (!f) return true;
      try {
        const v = await app.installPack(await f.text());
        if (!v.ok) {
          app.hud.toast("导入失败：" + v.errors.join("；"), 4e3);
          return true;
        }
        app.hud.toast(`已安装「${v.pack.name}」：${v.pack.furniture.length} 件家具` + (v.warnings.length ? `（${v.warnings.length} 条提醒，见控制台）` : ""), 3200);
        if (v.warnings.length) console.warn("[roomkit] 导入提醒:", v.warnings);
        ed.refresh();
      } catch (err) {
        app.hud.toast("导入失败：" + err.message, 4e3);
      }
    } else if (a === "export-my") {
      const p = await myPack(app);
      if (!(p.furniture || []).length && !(p.characters || []).length) {
        app.hud.toast("「我的家具包」还是空的：先自制几件家具吧");
        return true;
      }
      const name = prompt("给你的家具包起个名字", p.name || "我的家具包");
      if (name === null) return true;
      const author = prompt("作者署名（会写进包里）", p.author || "") || "";
      const out = exportPack(Object.assign({}, p, { name: name || p.name, author }));
      out.id = (prompt('包 id（字母数字，别人导入后家具 id 会是 "包id/家具id"）', p.exportId || "my-furniture") || "my-furniture").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "my-furniture";
      p.exportId = out.id;
      p.name = out.name;
      p.author = author;
      if (app.packStore) app.packStore.put(p);
      download(out.id + ".roomkit.json", out);
      app.hud.toast("已导出：" + out.id + ".roomkit.json");
    } else if (a === "char") {
      const f = await pickFile(".png,.json,application/json,image/png");
      if (!f) return true;
      try {
        const card = await readCharacterFile(f);
        card.id = "my/" + card.id;
        const p = await myPack(app);
        p.characters = (p.characters || []).filter((c) => c.id !== card.id).concat([card]);
        await saveMyPack(app, p);
        spawnCharacter(ed, card);
        ed.refresh();
      } catch (err) {
        app.hud.toast("角色卡读取失败：" + err.message, 4e3);
      }
    }
    return true;
  }
  function spawnCharacter(ed, card) {
    const app = ed.app, w = app.world;
    const spot = app.nav.nearestFree(w.room.w / 2, w.room.h / 2, 8) || { x: 1, y: 1 };
    const look2 = Object.assign({}, pick(WHALE_LOOKS), card.look || {});
    ed.exec({ t: "agent.add", agent: { id: uid("a"), name: card.name, kind: card.kind === "whale" ? "whale" : "girl", brain: "auto", character: card.id, x: spot.x, y: spot.y, look: look2 } });
    app.hud.toast(card.name + " 搬进来了！");
    app.sfx("place");
  }
  var SLOT_PRESETS = {
    "": null,
    sit: (w, h) => ({ id: "sit", pose: "sit", at: [w / 2, h / 2], z: 40, face: [0, 1], need: { energy: 0.15, fun: 0.1 }, dur: [6, 14], label: "坐一会儿" }),
    sleep: (w, h) => ({ id: "sleep", pose: "sleep", at: [w / 2, h / 2], z: 36, face: [1, 0], need: { energy: 0.8 }, dur: [25, 45], label: "睡觉" }),
    read: (w, h) => ({ id: "read", pose: "read", at: [w / 2, h + 0.45], face: [0, 1], need: { fun: 0.35 }, dur: [10, 20], label: "看书" }),
    work: (w, h) => ({ id: "work", pose: "work", at: [w / 2, h + 0.45], face: [0, -1], need: { fun: 0.1 }, dur: [12, 25], label: "干活" }),
    look: (w, h) => ({ id: "look", pose: "look", at: [w / 2, h + 0.5], face: [0, -1], need: { fun: 0.3 }, dur: [5, 9], label: "看看" }),
    eat: (w, h) => ({ id: "eat", pose: "eat", at: [w / 2, h + 0.45], face: [0, 1], need: { energy: 0.3, fun: 0.2 }, dur: [5, 9], label: "吃东西" }),
    dance: (w, h) => ({ id: "play", pose: "dance", at: [w / 2, h + 0.5], face: [0, -1], need: { fun: 0.5 }, dur: [6, 12], label: "玩一会儿" })
  };
  async function loadImageFile(file, max = 768) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error("图片打不开"));
        im.src = url;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      let x0 = 0, y0 = 0, x1 = img.width, y1 = img.height;
      try {
        const d = g.getImageData(0, 0, img.width, img.height).data;
        let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            if (d[(y * img.width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          x0 = minX;
          y0 = minY;
          x1 = maxX + 1;
          y1 = maxY + 1;
        }
      } catch (e) {
      }
      const w = x1 - x0, h = y1 - y0, k = Math.min(1, max / Math.max(w, h));
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * k));
      out.height = Math.max(1, Math.round(h * k));
      out.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, out.width, out.height);
      let src = out.toDataURL("image/webp", 0.9);
      if (src.indexOf("data:image/webp") !== 0) src = out.toDataURL("image/png");
      const im2 = new Image();
      await new Promise((res) => {
        im2.onload = res;
        im2.onerror = res;
        im2.src = src;
      });
      return { src, img: im2, iw: out.width, ih: out.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function buildDef(st) {
    const def = { id: st.id || "my/draft", name: st.name || "我的家具", sub: "自制", cat: st.cat || "misc", mount: st.mount, palette: {}, pack: "my" };
    if (st.mount === "wall") {
      def.wsize = [st.w, Math.max(10, Math.round(st.w * 64 * st.ih / st.iw * st.fit))];
      def.wz = 100;
      def.art = { kind: "wall", draw: "image", src: st.src };
    } else {
      def.size = [st.w, st.h];
      const sy = st.mount === "flat" ? st.sy : 1;
      def.art = { kind: "sprite", src: st.src, fit: st.fit, dx: st.dx, dy: st.dy, sy };
      const span = (st.w + st.h) * 64, dh = span * st.fit / st.iw * st.ih * sy;
      def.height = st.mount === "flat" ? 2 : Math.max(16, Math.round(dh - (st.w + st.h) * 16));
      const slot = SLOT_PRESETS[st.slot] && SLOT_PRESETS[st.slot](st.w, st.h);
      def.slots = slot ? [slot] : [];
      if (slot) def.act = "use:" + slot.id;
    }
    if (st.act === "toggle") {
      def.states = { on: false };
      def.light = { at: [st.w / 2, st.h / 2], z: Math.max(40, (def.height || 100) * 0.8), radius: 3, color: "#ffd59a", when: "on" };
      def.act = "toggle:on";
      def.say = ["开灯", "关灯"];
    } else if (st.act === "shake" && !def.act) {
      def.act = "shake";
      def.say = ["晃了晃"];
    } else if (!def.act) def.act = "info";
    return def;
  }
  function drawPreview(canvas, st) {
    const dpr = 2, W = 220, H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const iso = new Iso(64, 32);
    const def = normalizeDef(buildDef(st));
    const w = st.mount === "wall" ? 2 : st.w, h = st.mount === "wall" ? 1 : st.h;
    const G = Math.max(w, h) + 2;
    const b = { l: -(G - 0.5) * 64, r: (G + 0.5) * 64, t: -300, b: G * 2 * 32 + 10 };
    const k = Math.min((W - 10) / (b.r - b.l), (H - 10) / (b.b - b.t));
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (W / 2 - (b.l + b.r) / 2 * k) * dpr, (H / 2 - (b.t + b.b) / 2 * k) * dpr);
    for (let y = -1; y < G - 1; y++) for (let x = -1; x < G - 1; x++) {
      const pts = iso.diamond(x, y, x + 1, y + 1);
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = (x + y) % 2 ? "#e8d6bf" : "#ecdcc7";
      ctx.fill();
    }
    if (st.mount === "wall") {
      const H2 = 260, p0 = iso.toWorld(-1, -1, 0), p1 = iso.toWorld(G - 1, -1, 0);
      ctx.fillStyle = "#f6ead6";
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p1.x, p1.y - H2);
      ctx.lineTo(p0.x, p0.y - H2);
      ctx.closePath();
      ctx.fill();
    } else {
      const pts = iso.diamond(0, 0, w, h, 0.5);
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = "rgba(80,200,120,.25)";
      ctx.fill();
      ctx.strokeStyle = "rgba(60,170,100,.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const ident = { map: (x, y) => [x, y], dir: (a, c) => [a, c], localFace: (f) => f, mirror: false };
    const fp = { x0: 0, y0: 0, x1: w, y1: h, w, h, o: ident };
    const whale = { pose: "stand", look: { body: "#5b8def", belly: "#eef5ff" }, front: true, right: false, phase: 0, blink: 0, sq: 0, seed: 1 };
    const wp = iso.toWorld(w + 0.7, h * 0.5 + 0.3);
    const drawWhale = () => {
      ctx.save();
      ctx.translate(wp.x, wp.y);
      paintGirl(ctx, whale, 0);
      ctx.restore();
    };
    if (st.img && st.mount === "wall") {
      const fr = wallItemFrame(iso, "right", (G - 2) / 2, def.wsize[0], 100, def.wsize[1]);
      fr.e += 64;
      fr.f -= 32;
      paintWallItem(ctx, fr, def, { state: {}, at: 0 }, () => "#cccccc", { night: false, sky: ["#9cc8f0", "#e6f3ff"], weather: "clear" }, 0, "right");
      drawWhale();
    } else if (st.img) {
      paintSprite(ctx, iso, def, { x: 0, y: 0, rot: 0, state: {} }, fp, st.img);
      drawWhale();
    } else {
      drawWhale();
    }
  }
  function openWorkshop(ed) {
    const app = ed.app, root = app.root;
    let modal = root.querySelector(".rk-modal");
    if (!modal) {
      root.insertAdjacentHTML("beforeend", '<div class="rk-modal"></div>');
      modal = root.querySelector(".rk-modal");
    }
    const cats = Object.keys(CATEGORY_NAMES);
    const st = { name: "我的家具", cat: "deco", mount: "floor", w: 1, h: 1, fit: 1, dx: 0, dy: 0, sy: 0.6, slot: "", act: "info", src: null, img: null, iw: 1, ih: 1 };
    modal.innerHTML = `
    <div class="rk-modal-box">
      <h4>自制家具 <small style="color:var(--rk-sub);font-weight:400">上传一张透明背景的等距图（PNG/WebP），调到和旁边的小鲸鱼比例合适</small></h4>
      <div class="rk-ws">
        <canvas class="rk-ws-prev"></canvas>
        <div class="rk-ws-form">
          <label>图片 <input type="file" accept="image/png,image/webp,image/jpeg,image/gif" data-w="file"></label>
          <label>名字 <input type="text" data-w="name" value="${esc(st.name)}" maxlength="24"></label>
          <label>分类 <select data-w="cat">${cats.map((c) => `<option value="${c}" ${c === st.cat ? "selected" : ""}>${esc(CATEGORY_NAMES[c])}</option>`).join("")}</select></label>
          <label>摆法 <select data-w="mount"><option value="floor">落地家具</option><option value="flat">地毯（贴地）</option><option value="wall">挂在墙上</option></select></label>
          <label>占地 宽 <input type="number" min="1" max="6" step="1" data-w="w" value="1"> 深 <input type="number" min="1" max="6" step="1" data-w="h" value="1"></label>
          <label>大小 <input type="range" min="0.2" max="1.8" step="0.01" data-w="fit" value="1"></label>
          <label>左右 <input type="range" min="-120" max="120" step="1" data-w="dx" value="0"></label>
          <label>上下 <input type="range" min="-160" max="120" step="1" data-w="dy" value="0"></label>
          <label>压扁（地毯） <input type="range" min="0.3" max="1" step="0.01" data-w="sy" value="0.6"></label>
          <label>互动 <select data-w="slot"><option value="">无</option><option value="sit">坐</option><option value="sleep">睡</option><option value="read">看书</option><option value="work">干活</option><option value="look">观赏</option><option value="eat">吃东西</option><option value="dance">玩耍</option></select></label>
          <label>点击 <select data-w="act"><option value="info">显示名字</option><option value="shake">摇一摇</option><option value="toggle">开关灯（会发光）</option></select></label>
        </div>
      </div>
      <div class="rk-row">
        <button type="button" class="rk-btn on" data-w="save">保存并摆放</button>
        <button type="button" class="rk-btn" data-w="cancel">取消</button>
      </div>
    </div>`;
    modal.classList.add("on");
    const prev = modal.querySelector(".rk-ws-prev");
    const redraw = () => drawPreview(prev, st);
    redraw();
    const read = () => {
      modal.querySelectorAll("[data-w]").forEach((inp) => {
        const k = inp.getAttribute("data-w");
        if (!(k in st) || inp.type === "file" || inp.tagName === "BUTTON") return;
        st[k] = inp.type === "range" || inp.type === "number" ? +inp.value : inp.value;
      });
      st.w = clamp(Math.round(st.w) || 1, 1, 6);
      st.h = clamp(Math.round(st.h) || 1, 1, 6);
      redraw();
    };
    modal.oninput = (e) => {
      if (e.target.type !== "file") read();
    };
    modal.onchange = async (e) => {
      if (e.target.getAttribute("data-w") !== "file") {
        read();
        return;
      }
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const r = await loadImageFile(f);
        Object.assign(st, r);
        if (st.name === "我的家具") {
          st.name = f.name.replace(/\.[^.]+$/, "").slice(0, 24);
          modal.querySelector("[data-w=name]").value = st.name;
        }
        redraw();
      } catch (err) {
        app.hud.toast(err.message);
      }
    };
    modal.onclick = async (e) => {
      const b = e.target.closest("[data-w]");
      if (e.target === modal) {
        modal.classList.remove("on");
        return;
      }
      if (!b || b.tagName !== "BUTTON") return;
      const a = b.getAttribute("data-w");
      if (a === "cancel") {
        modal.classList.remove("on");
        return;
      }
      if (a === "save") {
        if (!st.src) {
          app.hud.toast("先选一张图片");
          return;
        }
        read();
        const def = buildDef(st);
        def.id = "my/" + uid("f");
        const p = await myPack(app);
        p.furniture = (p.furniture || []).concat([def]);
        try {
          await saveMyPack(app, p);
        } catch (err) {
          app.hud.toast("保存失败：" + err.message, 3500);
          return;
        }
        modal.classList.remove("on");
        ed.refresh();
        ed.switchTab(def.mount === "wall" ? "wall" : "furn");
        ed.startPlace(def.id);
        app.hud.toast("「" + def.name + "」已加入家具库：点地面摆上去吧");
      }
    };
  }

  // web/roomkit/experience.js
  var FORMAT = "roomkit.experiences";
  var MAX_BYTES = 1024 * 1024;
  var MAX_RECORDS = 100;
  var MAX_FACTS = 16;
  var bounded = (value, size) => typeof value === "string" && value.length > 0 && value.length <= size;
  var statuses = ["pending", "ready", "fallback"];
  var encoder2 = new TextEncoder();
  function serviceOrigin(url) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("世界服务地址不合法");
    return parsed.origin;
  }
  function experienceSummary(record) {
    if (record.reflection.text) return record.reflection.text;
    const company = record.participants.map(({ name }) => name).join("、");
    if (record.outcome === "completed") return `完成了「${record.title}」的合作活动。${company ? "参与角色有" + company + "。" : ""}`;
    const lit = record.facts.filter(({ type }) => type === "beacon.lit").length;
    return `到访「${record.title}」${company ? "，遇到" + company : ""}${lit ? "，见证点亮 " + lit + " 个信标" : ""}。`;
  }
  function parseRecord(raw, localCharacterId) {
    var _a, _b;
    if ((raw == null ? void 0 : raw.v) !== 1 || raw.localCharacterId !== localCharacterId || !bounded(raw.id, 160) || !bounded(raw.title, 80) || !["partial", "completed"].includes(raw.outcome) || !statuses.includes((_a = raw.reflection) == null ? void 0 : _a.status) || typeof ((_b = raw.reflection) == null ? void 0 : _b.text) !== "string" || raw.reflection.text.length > 160) throw new Error("经历字段或角色身份不匹配");
    const source = raw.source;
    if (!source || !bounded(source.serviceId, 300) || serviceOrigin(source.serviceId) !== source.serviceId || !bounded(source.worldId, 100) || !bounded(source.sessionId, 100) || !Number.isSafeInteger(source.revision) || source.revision < (source.kind === "legacy-town" ? 0 : 1)) throw new Error("经历来源不合法");
    if (!Array.isArray(raw.participants) || raw.participants.length > 12 || !raw.participants.every((p) => bounded(p == null ? void 0 : p.characterId, 80) && bounded(p.name, 40))) throw new Error("经历参与者不合法");
    if (!Array.isArray(raw.facts) || raw.facts.length > MAX_FACTS) throw new Error("经历事实超限");
    const facts = raw.facts.map((fact) => {
      var _a2;
      if (!Number.isSafeInteger(fact == null ? void 0 : fact.seq) || fact.seq < 1 || !["beacon.lit", "activity.completed"].includes(fact.type)) throw new Error("经历事件不合法");
      const field = fact.type === "beacon.lit" ? "beaconId" : "exitId";
      if (!bounded((_a2 = fact.payload) == null ? void 0 : _a2[field], 80)) throw new Error("经历物件不合法");
      return { seq: fact.seq, type: fact.type, payload: { [field]: fact.payload[field] } };
    });
    if (new Set(facts.map(({ seq: seq2 }) => seq2)).size !== facts.length) throw new Error("经历事件重复");
    if (raw.outcome === "completed" && (!Number.isSafeInteger(source.completionSeq) || !facts.some((fact) => fact.type === "activity.completed" && fact.seq === source.completionSeq))) throw new Error("缺少完成事实");
    if (!Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt) || raw.createdAt > raw.updatedAt) throw new Error("经历时间不合法");
    return {
      v: 1,
      id: raw.id,
      title: raw.title,
      localCharacterId,
      source: {
        serviceId: source.serviceId,
        worldId: source.worldId,
        revision: source.revision,
        sessionId: source.sessionId,
        ...raw.outcome === "completed" ? { completionSeq: source.completionSeq } : {},
        ...source.kind === "legacy-town" ? { kind: "legacy-town" } : {}
      },
      participants: raw.participants.map(({ characterId, name }) => ({ characterId, name })),
      facts,
      outcome: raw.outcome,
      reflection: { text: raw.reflection.text, status: raw.reflection.status },
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }
  var ExperienceStore = class {
    constructor(prefix = "roomkit", storage) {
      this.prefix = prefix + ".experience.";
      this.storage = storage;
    }
    get local() {
      const storage = this.storage || globalThis.localStorage;
      if (!storage) throw new Error("本机经历存储不可用");
      return storage;
    }
    key(localId, serviceId, id) {
      return this.prefix + [localId, serviceId, id].map(encodeURIComponent).join("|");
    }
    tombstone(key2) {
      return this.prefix + "deleted:" + key2.slice(this.prefix.length);
    }
    get(localId, serviceId, id) {
      const key2 = this.key(localId, serviceId, id);
      if (this.local.getItem(this.tombstone(key2))) return null;
      const data = this.local.getItem(key2);
      return data ? JSON.parse(data) : null;
    }
    put(record) {
      var _a, _b;
      const key2 = this.key(record.localCharacterId, record.source.serviceId, record.id);
      if (this.local.getItem(this.tombstone(key2))) return false;
      const value = JSON.stringify(record);
      if (encoder2.encode(value).length > 8192) throw new Error("单条经历超过存储上限");
      const storage = this.local;
      try {
        storage.setItem(key2, value);
      } catch {
        this.unsaved = record;
        throw new Error("本机空间不足，经历暂未保存。可导出或清理旧经历后重试");
      }
      if (((_a = this.unsaved) == null ? void 0 : _a.id) === record.id && ((_b = this.unsaved) == null ? void 0 : _b.localCharacterId) === record.localCharacterId) this.unsaved = null;
      const rows = this.rows();
      const expired = rows.slice(MAX_RECORDS);
      for (const old of expired) storage.removeItem(old.key);
      return !expired.some((old) => old.key === key2);
    }
    rows(localId) {
      const keyPrefix = localId ? this.prefix + encodeURIComponent(localId) + "|" : this.prefix;
      const rows = [];
      const storage = this.local;
      for (let i = 0; i < storage.length; i++) {
        const key2 = storage.key(i);
        if (!(key2 == null ? void 0 : key2.startsWith(keyPrefix)) || key2.startsWith(this.prefix + "deleted:") || storage.getItem(this.tombstone(key2))) continue;
        try {
          const row = JSON.parse(storage.getItem(key2));
          if ((row == null ? void 0 : row.v) === 1) rows.push({ key: key2, record: row });
        } catch {
        }
      }
      return rows.sort((a, b) => b.record.updatedAt - a.record.updatedAt);
    }
    list(localId) {
      return this.rows(localId).map(({ record }) => record);
    }
    recordVisit(visit, participants, event) {
      const prior = this.get(visit.localCharacterId, visit.source.serviceId, visit.id);
      const facts = (prior == null ? void 0 : prior.facts) || [];
      if (event && !facts.some(({ seq: seq2 }) => seq2 === event.seq)) {
        facts.push({ seq: event.seq, type: event.type, payload: { beaconId: event.payload.beaconId } });
      }
      const record = { ...visit, participants, facts: facts.slice(-MAX_FACTS), updatedAt: Date.now() };
      this.put(record);
      return record;
    }
    complete(visit, event) {
      const id = event.payload.completionId;
      const { localCharacterId, source } = visit;
      const existing = this.get(localCharacterId, source.serviceId, id);
      if (existing) return { record: existing, created: false };
      const partial = this.get(localCharacterId, source.serviceId, visit.id);
      const facts = ((partial == null ? void 0 : partial.facts) || []).filter(({ seq: seq2 }) => seq2 !== event.seq).slice(-(MAX_FACTS - 1));
      facts.push({ seq: event.seq, type: event.type, payload: { exitId: event.payload.exitId } });
      const record = {
        ...visit,
        id,
        outcome: "completed",
        source: { ...source, completionSeq: event.seq },
        participants: event.payload.participants,
        facts,
        reflection: { text: "", status: "pending" },
        updatedAt: Date.now()
      };
      if (!this.put(record)) return { record: null, created: false };
      if (partial) this.local.removeItem(this.key(localCharacterId, source.serviceId, visit.id));
      return { record, created: true };
    }
    setReflection(record, text2, status) {
      const current = this.get(record.localCharacterId, record.source.serviceId, record.id);
      if (!current || current.reflection.status === "ready") return current;
      const changed = { ...current, reflection: { text: text2, status }, updatedAt: Date.now() };
      return this.put(changed) ? changed : null;
    }
    async summarize(record, adapter, context) {
      const current = this.get(record.localCharacterId, record.source.serviceId, record.id);
      if (!current || current.reflection.status === "ready") return current;
      try {
        const text2 = await adapter.summarize({
          title: current.title,
          outcome: current.outcome,
          participants: current.participants,
          facts: current.facts
        }, context);
        return this.setReflection(current, text2, "ready");
      } catch (error) {
        this.setReflection(current, "", "fallback");
        throw error;
      }
    }
    remove(localId, serviceId, id) {
      const key2 = this.key(localId, serviceId, id);
      try {
        this.local.setItem(this.tombstone(key2), String(Date.now()));
      } catch {
        throw new Error("空间不足，无法保存删除记录");
      }
      this.local.removeItem(key2);
    }
    recall(localId, service, participants = []) {
      if (!localId || !service) return "";
      const serviceId = serviceOrigin(service);
      const ids = new Set(participants);
      return this.list(localId).filter(({ source, participants: participants2 }) => source.serviceId === serviceId && participants2.some(({ characterId }) => ids.has(characterId))).slice(0, 4).map(experienceSummary).join("\n").slice(0, 600);
    }
    export(localId) {
      var _a;
      const records = this.list(localId);
      if (((_a = this.unsaved) == null ? void 0 : _a.localCharacterId) === localId && !records.some(({ id }) => id === this.unsaved.id)) records.unshift(this.unsaved);
      return { format: FORMAT, v: 1, localCharacterId: localId, records: records.slice(0, MAX_RECORDS) };
    }
    import(raw, localId) {
      if ((raw == null ? void 0 : raw.format) !== FORMAT || raw.v !== 1 || raw.localCharacterId !== localId || !Array.isArray(raw.records) || raw.records.length > MAX_RECORDS || encoder2.encode(JSON.stringify(raw)).length > MAX_BYTES) throw new Error("经历文件格式、大小或角色身份不匹配");
      const records = raw.records.map((record) => parseRecord(record, localId));
      let count = 0;
      for (const record of records) {
        const existing = this.get(localId, record.source.serviceId, record.id);
        if ((!existing || existing.updatedAt < record.updatedAt) && this.put(record)) count++;
      }
      return count;
    }
    importLegacy(localId, service, events) {
      const serviceId = serviceOrigin(service);
      let count = 0;
      for (const event of Array.isArray(events) ? events.slice(-50) : []) {
        if (!bounded(event == null ? void 0 : event.thread, 70) || !Number.isSafeInteger(event.t) || !bounded(event.title, 80)) continue;
        const id = "legacy:" + event.t + ":" + event.thread;
        if (this.get(localId, serviceId, id)) continue;
        const participants = (Array.isArray(event.ids) ? event.ids : []).slice(0, 12).filter((value) => bounded(value, 80)).map((characterId, i) => {
          var _a;
          return { characterId, name: String(((_a = event.with) == null ? void 0 : _a[i]) || characterId).slice(0, 40) };
        });
        const record = {
          v: 1,
          id,
          localCharacterId: localId,
          title: event.title,
          source: { serviceId, worldId: event.thread, revision: 0, sessionId: event.thread, kind: "legacy-town" },
          participants,
          facts: [],
          outcome: "partial",
          reflection: { text: String(event.summary || "").slice(0, 160), status: "ready" },
          createdAt: event.t,
          updatedAt: event.t
        };
        if (this.put(record)) count++;
      }
      return count;
    }
  };

  // web/roomkit/world-panel.js
  var button = (action, label, extra = "") => `<button class="rk-btn" data-s="world-${action}" ${extra}>${label}</button>`;
  var selected = (value, key2) => value === key2 ? " selected" : "";
  var INPUTS = ["title", "author", "license", "activity", "beacon0", "beacon1", "beacon2", "exit", "role", "invite"];
  function readInvite(value) {
    const text2 = value.trim();
    if (/^[a-z0-9_-]{16,80}$/i.test(text2)) return { code: text2 };
    let url;
    try {
      url = new URL(text2);
    } catch {
      throw new Error("请输入有效的邀请链接或邀请码");
    }
    const code = url && new URLSearchParams(url.hash.slice(1)).get("roomkit-invite");
    if (!code || !/^[a-z0-9_-]{16,80}$/i.test(code)) throw new Error("请输入有效的邀请链接或邀请码");
    return { code, service: serviceOrigin(url.href) };
  }
  var WorldPanel = class {
    constructor(shell) {
      this.shell = shell;
      this.app = shell.app;
      this.open = false;
      this.form = {};
      this.worlds = [];
      if (typeof location !== "undefined") {
        const parts = new URLSearchParams(location.hash.slice(1));
        const code = parts.get("roomkit-invite");
        if (code && /^[a-z0-9_-]{16,80}$/i.test(code)) {
          this.form.invite = code;
          this.open = true;
          parts.delete("roomkit-invite");
          try {
            history.replaceState(history.state, "", location.pathname + location.search + (parts.size ? "#" + parts : ""));
          } catch {
          }
        }
      }
    }
    get session() {
      return this.app.worldSession;
    }
    get town() {
      return this.app.town;
    }
    get authorized() {
      return Boolean(this.town.online || this.town.token);
    }
    rememberForm() {
      for (const key2 of INPUTS) {
        const input = this.shell.el.body.querySelector('[data-world-field="' + key2 + '"]');
        if (input) this.form[key2] = input.type === "checkbox" ? input.checked : input.value;
      }
    }
    localRole() {
      return this.app.agents.get(this.form.role) || this.app.mainAgent();
    }
    experienceId() {
      var _a;
      return this.session.id ? this.session.localCharacterId : (_a = this.localRole()) == null ? void 0 : _a.data.localCharacterId;
    }
    renderExperiences() {
      const localId = this.experienceId();
      if (!localId) return "";
      let records;
      try {
        records = this.session.experiences.list(localId);
      } catch {
        return '<div class="rk-hint">本机经历存储不可用。</div>';
      }
      const actions = `<div class="rk-row">${button("experience-export", "导出")}${button("experience-import", "导入")}</div>`;
      const rows = records.map((record) => {
        const attributes = `data-id="${esc(record.id)}" data-service="${esc(record.source.serviceId)}"`;
        const origin = record.source.kind === "legacy-town" ? "旧小镇" : record.outcome === "completed" ? "已完成" : "到访";
        return `<div class="rk-kv"><span><b>${esc(record.title)}</b><small>${origin} · ${esc(experienceSummary(record))}</small></span><span>
        ${record.outcome === "completed" && record.reflection.status !== "ready" ? button("experience-retry", "补写感想", attributes) : ""}
        ${button("experience-delete", "删除", attributes)}</span></div>`;
      }).join("");
      return `<details class="rk-world-experiences"><summary>我的经历（${records.length}）</summary>${actions}${rows || '<div class="rk-hint">还没有保存的经历。</div>'}</details>`;
    }
    renderSession() {
      var _a, _b;
      const session = this.session;
      const { state } = session;
      const activity = session.release.activity;
      const model = session.agent.describeCapabilities();
      const owner = session.release.authorAccountId === (((_a = this.town.account) == null ? void 0 : _a.id) || this.town.me);
      const targets = activity ? [...activity.beaconIds, activity.exitId].map((id, index) => {
        var _a2, _b2;
        const done = state.activity.contributions.some(({ beaconId }) => beaconId === id) || ((_a2 = state.activity.completion) == null ? void 0 : _a2.exitId) === id;
        const exit = id === activity.exitId;
        const label = exit ? "出口" : "信标 " + (index + 1);
        const object = this.app.world.byId.get(id);
        const ready = !exit || state.activity.contributions.length === activity.beaconIds.length;
        return `<div class="rk-kv"><span>${label}<small>${esc(((_b2 = this.app.world.def(object)) == null ? void 0 : _b2.name) || "")}</small></span>
        ${button("use", done ? "已完成" : "前往并使用", `data-id="${esc(id)}" ${session.canAct && !done && ready ? "" : "disabled"}`)}</div>`;
      }).join("") : "";
      const invitation = ((_b = this.invitation) == null ? void 0 : _b.sessionId) === session.id ? this.invitation : null;
      const invite = invitation ? `<div class="rk-chat-bar"><input readonly aria-label="邀请链接" value="${esc(invitation.url)}">${button("invite-copy", "复制")}${button("invite-revoke", "撤销")}</div><div class="rk-hint">邀请码 ${esc(invitation.code)} · 一次有效</div>` : "";
      const recent = state.recent.slice(-6).map(({ seq: seq2, actorCharacterId, payload }) => {
        var _a2;
        const name = ((_a2 = state.participants.find(({ characterId }) => characterId === actorCharacterId)) == null ? void 0 : _a2.name) || "成员";
        const remove = session.connected && actorCharacterId === session.characterId ? button("say-remove", "撤回", `data-id="${seq2}"`) : "";
        return `<div class="rk-kv"><span>${esc(name)}<small>${payload.source === "ai" ? "AI" : "主人通道"}</small></span><span>${esc(payload.text)} ${remove}</span></div>`;
      }).join("");
      const control = session.connected && !session.canAct && state.status !== "ended" ? button("control", state.status === "paused" ? "恢复并控制角色" : "接管我的角色") : "";
      const status = !session.connected ? "正在同步场次" : state.status === "paused" ? "场次暂停" : session.canAct ? "正在控制自己的角色" : "只读观看";
      return `<section class="rk-world-panel"><div class="rk-field">${esc(session.release.title)}</div>
      <div class="rk-kv"><span>${status}</span>${button("leave", "回家")}</div>${control}
      ${owner ? `<div class="rk-row">${button("invite", "邀请朋友")}${button("end", "结束场次")}</div>${invite}` : ""}
      ${activity ? `<div class="rk-hint">${state.activity.completion ? "活动已完成。完成凭证保留 30 天，可在「我的经历」查看。" : `两个账号合作点亮三个信标，再打开出口。已点亮 ${state.activity.contributions.length} / 3。`}</div>` : ""}
      ${targets}
      <div class="rk-kv"><span>${model.available ? "已接模型 · " + esc(model.name) : "手动模式"}<small>本小时 ${model.used} / ${model.limit} 次</small></span>
        ${button("think", model.busy ? "正在思考" : "让 AI 行动一次", session.canAct && model.available && !model.busy ? "" : "disabled")}</div>
      <label class="rk-check"><input type="checkbox" data-s="world-auto" ${session.auto ? "checked" : ""} ${session.canAct && model.available ? "" : "disabled"}>允许 AI 自动行动</label>
      ${session.error || session.experienceError ? `<div class="rk-hint">${esc(session.error || session.experienceError)}</div>` : ""}
      ${session.speechReview ? `<div class="rk-hint">${esc(session.speechReview.message)}</div>` : ""}
      ${recent}
      <div class="rk-chat-bar"><input class="rk-world-say" maxlength="200" placeholder="以自己的角色发言">${button("say", "发送", session.canAct ? "" : "disabled")}</div>
      ${state.activity.completion ? button("claim", "补领完成经历") : ""}
      ${this.renderExperiences()}</section>`;
    }
    renderHome() {
      var _a;
      const app = this.app;
      if (!this.open) return `<div class="rk-kv"><span><b>AI 世界</b></span>${button("toggle", "建世界或加入邀请")}</div>`;
      const form = this.form;
      const roleId = form.role || ((_a = app.mainAgent()) == null ? void 0 : _a.id);
      const roles = [...app.agents.values()].filter(({ data }) => !data.ephemeral).map((role) => `<option value="${esc(role.id)}"${selected(roleId, role.id)}>${esc(role.name)}</option>`).join("");
      const fields = ["信标 1", "信标 2", "信标 3", "出口"];
      const selections = fields.map((label, index) => {
        const field = index < 3 ? "beacon" + index : "exit";
        const options = app.world.objects.map((object) => {
          var _a2;
          const place = object.wall ? "墙面" : `格 (${object.x + 1}, ${object.y + 1})`;
          return `<option value="${esc(object.id)}"${selected(form[field], object.id)}>${esc((((_a2 = app.world.def(object)) == null ? void 0 : _a2.name) || object.def) + " · " + place)}</option>`;
        }).join("");
        return `<label>${label}<select data-world-field="${field}"><option value="">选择场景物件</option>${options}</select></label>`;
      }).join("");
      const last = app.storage.pref("worldLastSession");
      const resume = (last == null ? void 0 : last.service) === this.town.url ? button("resume", "回到上次场次") : "";
      const items = (this.authorized && this.listIdentity === this.identity() ? this.worlds : []).map((world) => {
        const attr = `data-id="${esc(world.worldId)}"`;
        return `<div class="rk-kv"><span><b>${esc(world.title)}</b><small>${world.revision ? "第 " + world.revision + " 版" : "待发布"}</small></span><span>
        ${button("open", "开场", attr + (world.revision ? "" : " disabled"))}
        ${button("update", "发布新版", attr)}</span></div>`;
      }).join("");
      const signed = this.authorized ? "" : '<div class="rk-hint">发布或加入前，先在下方连接小镇并登录。草稿可以在本机保存。</div>';
      return `<section class="rk-world-panel"><div class="rk-kv"><span><b>AI 世界</b></span>${button("toggle", "收起")}</div>${signed}
      <label>本机角色<select data-world-field="role">${roles}</select></label>
      <div class="rk-chat-bar"><input data-world-field="invite" value="${esc(form.invite || "")}" placeholder="粘贴邀请链接或邀请码">${button("join", "加入", this.authorized ? "" : "disabled")}</div>
      ${this.authorized ? resume : ""}
      <div class="rk-field">把当前房间做成世界</div>
      <label>世界名称<input data-world-field="title" value="${esc(form.title || app.world.scene.name)}" maxlength="80"></label>
      <label class="rk-check"><input type="checkbox" data-world-field="activity" ${form.activity ? "checked" : ""}>添加合作信标活动</label>
      <div class="rk-world-targets">${selections}</div>
      <div class="rk-world-targets"><label>素材作者（缺失时填写）<input data-world-field="author" value="${esc(form.author || "")}" maxlength="40"></label><label>素材许可（缺失时填写）<input data-world-field="license" value="${esc(form.license || "")}" maxlength="40"></label></div>
      <div class="rk-row">${button("save", "保存世界草稿")}${button("import", "导入草稿")}${button("publish", "发布最近草稿", this.authorized ? "" : "disabled")}</div>
      ${this.draftTitle ? `<div class="rk-hint">最近草稿是「${esc(this.draftTitle)}」。</div>` : ""}
      <div class="rk-field">我的世界 ${button("list", "刷新", this.authorized ? "" : "disabled")}</div>${items || '<div class="rk-hint">发布后可在这里开场。</div>'}
      ${this.renderExperiences()}</section>`;
    }
    async list() {
      const identity = this.identity();
      const worlds = this.authorized ? (await this.town.call("worldList", {})).worlds : [];
      if (this.identity() === identity) {
        this.listIdentity = identity;
        this.worlds = worlds;
      }
    }
    identity() {
      var _a;
      return this.town.url + "|" + (((_a = this.town.account) == null ? void 0 : _a.id) || this.town.me);
    }
    async action(action, element) {
      var _a;
      this.rememberForm();
      const { app, session, town } = this;
      const id = element == null ? void 0 : element.dataset.id;
      switch (action) {
        case "toggle":
          this.open = !this.open;
          this.shell.render();
          if (this.open) {
            await this.list();
            this.draftTitle = (_a = await app.worldDrafts.latest().catch(() => null)) == null ? void 0 : _a.title;
          }
          break;
        case "list":
          await this.list();
          break;
        case "save": {
          const { title, author, license, activity, beacon0, beacon1, beacon2, exit } = this.form;
          const release = await app.worldDrafts.save({
            title,
            author,
            license,
            activity: activity ? { kind: "cooperative-beacons", v: 1, beaconIds: [beacon0, beacon1, beacon2], exitId: exit, minContributors: 2 } : null
          });
          this.draftTitle = release.title;
          app.hud.toast("世界草稿已保存");
          break;
        }
        case "import": {
          const file = await pickFile(".json,application/json");
          if (!file) return;
          if (file.size > WORLD_BYTES) throw new Error("世界包超过 4 MiB");
          this.draftTitle = (await app.worldDrafts.import(JSON.parse(await file.text()))).title;
          app.hud.toast("世界包已保存为本机草稿");
          break;
        }
        case "publish":
        case "update": {
          const release = await app.worldDrafts.latest();
          const current = action === "update" ? this.worlds.find((world) => world.worldId === id) : null;
          await town.call("worldPublish", { release, ...current ? { worldId: current.worldId, expectedRevision: current.revision } : {} });
          await this.list();
          app.hud.toast("世界已发布");
          break;
        }
        case "open": {
          const { sessionId } = await town.call("worldOpen", { worldId: id });
          await session.enter(sessionId, { localAgentId: this.form.role });
          break;
        }
        case "join": {
          const { code, service } = readInvite(this.form.invite || "");
          if (service && service !== serviceOrigin(town.url)) throw new Error("请先连接邀请链接中的小镇地址");
          const { sessionId } = await town.call("inviteRedeem", { code });
          this.form.invite = "";
          const invite = this.shell.el.body.querySelector('[data-world-field="invite"]');
          if (invite) invite.value = "";
          await session.enter(sessionId, { localAgentId: this.form.role });
          break;
        }
        case "resume": {
          const last = app.storage.pref("worldLastSession");
          if ((last == null ? void 0 : last.service) === town.url) await session.enter(last.sessionId, { localAgentId: last.localAgentId });
          break;
        }
        case "invite": {
          const invite = await session.call("inviteCreate", { sessionId: session.id });
          const url = new URL("/invite", town.url);
          url.hash = new URLSearchParams({ "roomkit-invite": invite.code }).toString();
          this.invitation = { ...invite, url: url.href, sessionId: session.id };
          break;
        }
        case "invite-copy":
          await navigator.clipboard.writeText(this.invitation.url);
          app.hud.toast("邀请链接已复制");
          break;
        case "invite-revoke":
          await session.call("inviteRevoke", { sessionId: session.id, inviteId: this.invitation.inviteId });
          this.invitation = null;
          break;
        case "end":
          await session.call("worldEnd", { sessionId: session.id });
          app.storage.pref("worldLastSession", null);
          await session.leave({ notify: false });
          break;
        case "preview-close":
          app.worldDrafts.view.close();
          break;
        case "leave":
          await session.leave();
          break;
        case "control":
          await session.takeControl();
          break;
        case "think":
          await session.think();
          break;
        case "auto":
          session.setAuto(!!element.checked);
          return;
        case "use":
          await session.useTarget(id);
          break;
        case "claim":
          if (!await session.claimCompletion()) app.hud.toast("本角色没有可补领的经历");
          break;
        case "say": {
          const input = this.shell.el.body.querySelector(".rk-world-say");
          const text2 = input == null ? void 0 : input.value.trim();
          if (text2) {
            input.value = "";
            session.run("say", { text: text2 });
          }
          return;
        }
        case "say-remove": {
          const { events } = await session.call("worldSayRemove", { sessionId: session.id, seq: Number(id) });
          session.accept(events);
          break;
        }
        case "experience-export": {
          const localId = this.experienceId();
          if (localId) download("roomkit-experiences.json", session.experiences.export(localId), true);
          return;
        }
        case "experience-import": {
          const file = await pickFile(".json,application/json");
          if (!file) return;
          if (file.size > 1024 * 1024) throw new Error("经历文件超过 1 MiB");
          const count = session.experiences.import(JSON.parse(await file.text()), this.experienceId());
          app.hud.toast(`已导入 ${count} 条经历`);
          break;
        }
        case "experience-delete":
          session.experiences.remove(this.experienceId(), element.dataset.service, id);
          break;
        case "experience-retry": {
          const record = session.experiences.get(this.experienceId(), element.dataset.service, id);
          if (!record) return;
          await session.agent.refresh();
          const role = this.localRole();
          const card = app.characterOf(role);
          const context = session.id ? session.privateContext() : { name: role == null ? void 0 : role.name, persona: card == null ? void 0 : card.persona, scenario: card == null ? void 0 : card.scenario };
          await session.experiences.summarize(record, session.agent, context);
          break;
        }
      }
      this.shell.render();
    }
  };

  // web/roomkit/world-hub.js
  var NEUTRAL_NAME = "角色";
  var INVITE_TEXT = {
    invalid: "这条邀请不存在，请向朋友要一条新的。",
    expired: "这条邀请已过期，请向朋友要一条新的。",
    revoked: "房主已撤销这条邀请。",
    used: "这条邀请已被别人使用，请向朋友要一条新的。",
    ended: "这一场已经结束了。",
    full: "这一场已满，稍后再试或请房主另开一场。",
    removed: "你已被房主移出这一场。"
  };
  var btn = (action, label, extra = "") => `<button class="rk-btn" data-s="hub-${action}" ${extra}>${label}</button>`;
  var primary = (action, label, extra = "") => `<button class="rk-btn on" data-s="hub-${action}" ${extra}>${label}</button>`;
  var WorldHub = class {
    constructor(shell) {
      this.shell = shell;
      this.app = shell.app;
      this.worlds = [];
      this.form = {};
      this.invite = null;
      this.error = "";
      this.loaded = false;
      this.targetKey = (this.app.opts.storageKey || "roomkit") + ".target";
    }
    get town() {
      return this.app.town;
    }
    get session() {
      return this.app.worldSession;
    }
    get signedIn() {
      var _a;
      return Boolean(((_a = this.town) == null ? void 0 : _a.token) && this.town.online && this.town.account);
    }
    get cfg() {
      var _a;
      return ((_a = this.town) == null ? void 0 : _a.cfg) || null;
    }
    get target() {
      try {
        return JSON.parse(sessionStorage.getItem(this.targetKey));
      } catch {
        return null;
      }
    }
    set target(value) {
      try {
        if (value) sessionStorage.setItem(this.targetKey, JSON.stringify(value));
        else sessionStorage.removeItem(this.targetKey);
      } catch {
      }
    }
    /** 顶栏右侧的状态：世界连接和账号，不代表模型或同步 */
    connection() {
      const town = this.town;
      if ((town == null ? void 0 : town.error) && !town.online) return { level: "error", label: "世界连不上", detail: town.error };
      if (this.signedIn) return { level: "ok", label: town.account.name || town.account.login || "已登录", detail: "已登录；房间仍保存在此浏览器" };
      return { level: "local", label: "游客", detail: "房间仅保存在此浏览器" };
    }
    async start() {
      const panel = this.shell.worldPanel;
      if (panel.form.invite) {
        this.invite = { code: panel.form.invite, preview: null };
        panel.form.invite = "";
        panel.open = false;
      }
      const focus = /^\/worlds(?:\/|$)/.test(location.pathname);
      await this.town.connect().catch(() => {
      });
      if (this.invite) await this.previewInvite();
      if (this.invite || focus) this.shell.open("social");
      await this.load();
      const target = this.target;
      if (target && this.signedIn) await this.guard(() => this.continueTarget(target));
      this.shell.syncConn();
    }
    async load() {
      try {
        const { worlds } = await this.town.call("publicWorldList", {});
        this.worlds = worlds;
        this.loaded = true;
        this.listError = "";
      } catch (error) {
        this.listError = error.message === "Failed to fetch" ? "世界暂时连不上" : error.message;
      }
      this.refresh();
    }
    async previewInvite() {
      try {
        this.invite.preview = await this.town.call("invitePreview", { code: this.invite.code });
      } catch (error) {
        this.invite.preview = null;
        this.error = error.message === "Failed to fetch" ? "世界暂时连不上，邀请还保留着。" : error.message;
      }
      this.refresh();
    }
    refresh() {
      if (this.shell.page === "social") this.shell.render();
    }
    async guard(fn) {
      this.error = "";
      try {
        await fn();
      } catch (error) {
        this.error = error.message === "Failed to fetch" ? "世界暂时连不上，请稍后重试。" : error.message;
        if (error.code === "room_full") await this.load();
        if (this.invite && !this.session.id) await this.previewInvite();
      }
      this.refresh();
    }
    /* ───────── 登录与继续 ───────── */
    /** 已登录返回 true；否则记下目标并开始登录。只有一种登录方式时直接打开，保持在点击手势内 */
    needLogin(target) {
      var _a;
      if (this.signedIn) return false;
      this.target = target;
      this.pendingLogin = true;
      const providers = ((_a = this.cfg) == null ? void 0 : _a.providers) || [];
      if (providers.length === 1) this.login(providers[0].id);
      else this.refresh();
      return true;
    }
    login(provider) {
      this.pendingLogin = false;
      const wanted = this.target;
      this.town.login(provider).then(async (ok) => {
        if (!ok) {
          if (this.target === wanted && !this.town.loginAttempt) this.target = null;
          this.refresh();
          return;
        }
        const target = this.target;
        if (target) await this.guard(() => this.continueTarget(target));
        else this.refresh();
        this.shell.syncConn();
      }).catch((error) => {
        this.error = error.message;
        this.refresh();
      });
      this.refresh();
    }
    /** 第一次登录：只确认公开昵称，其余都能以后再改 */
    askingName() {
      var _a;
      const town = this.town, me = (_a = town.identity) == null ? void 0 : _a.characters.find((c) => c.id === town.char);
      return me && me.name === NEUTRAL_NAME && !this.app.storage.pref("named:" + town.account.id);
    }
    async continueTarget(target) {
      if (this.askingName()) {
        this.confirming = target;
        this.refresh();
        return;
      }
      this.confirming = null;
      this.target = null;
      if (target.kind === "public") await this.enterPublic(target.worldId);
      else if (target.kind === "invite") await this.enterInvite(target.code);
    }
    async saveName(value) {
      const town = this.town, me = town.identity.characters.find((c) => c.id === town.char);
      const name = value.trim().slice(0, 16) || me.name;
      if (name !== me.name) {
        const { character } = await town.call("character", { me: me.id, name, kind: me.kind, look: me.look });
        Object.assign(me, character);
      }
      this.app.storage.pref("named:" + town.account.id, true);
      this.form.name = "";
    }
    async enterPublic(worldId) {
      if (this.needLogin({ kind: "public", worldId })) return;
      if (this.app.worldDrafts.view.home) this.app.worldDrafts.view.close();
      const { sessionId } = await this.town.call("publicWorldEnter", { worldId });
      await this.session.enter(sessionId, {});
    }
    async enterInvite(code) {
      if (this.needLogin({ kind: "invite", code })) return;
      const { sessionId } = await this.town.call("inviteRedeem", { code });
      await this.session.enter(sessionId, {});
      this.invite = null;
    }
    /** 进入场景后收起面板，让场景占满；顶部小条负责显示位置和回家 */
    entered() {
      this.shell.close();
      this.syncChip();
      if (!this.app.storage.pref("worldHinted")) {
        this.app.storage.pref("worldHinted", true);
        this.app.hud.toast("点地面走动，点物件互动，上方可以回家", 4200);
      }
    }
    /* ───────── 首次欢迎与场景内小条 ───────── */
    welcome() {
      if (this.app.storage.pref("welcomed") || this.shell.worldPanel.form.invite) return;
      const el = this.shell.el.coach;
      el.classList.add("rk-welcome");
      el.innerHTML = `<b>这间小屋可以直接逛</b>
      <p>点地面走动，点家具和角色互动。不用安装，也不用注册。</p>
      <div class="rk-row">${primary("welcome-stay", "先逛逛")}${btn("welcome-worlds", "去公共世界")}</div>
      <div class="rk-welcome-links"><a href="#" data-s="hub-welcome-edit">布置我的房间</a><a href="/guide" target="_blank" rel="noopener">创作指南</a><a href="/guide#install" target="_blank" rel="noopener">桌面版与 DSH</a></div>`;
      el.classList.add("on");
    }
    dismissWelcome() {
      this.app.storage.pref("welcomed", true);
      this.shell.el.coach.classList.remove("on");
    }
    syncChip() {
      var _a;
      const app = this.app, chip = this.shell.el.chip, session = this.session;
      const preview = (_a = app.worldDrafts) == null ? void 0 : _a.view.home;
      let key2 = "";
      if (session == null ? void 0 : session.id) key2 = "s|" + session.release.title + "|" + (session.connected ? session.state.status : "sync") + "|" + (session.canAct ? 1 : 0);
      else if (preview) key2 = "p|" + (app.world.scene.name || "");
      if (key2 === this._chipKey) return;
      this._chipKey = key2;
      if (!key2) {
        chip.classList.remove("on");
        return;
      }
      if (session == null ? void 0 : session.id) {
        const status = !session.connected ? "连接中" : session.state.status === "paused" ? "暂停中" : session.canAct ? "手动模式" : "只读观看";
        chip.innerHTML = `<b>${esc(session.release.title)}</b><small>${status}</small><button class="rk-btn" data-s="world-leave">回家</button>`;
      } else {
        chip.innerHTML = `<b>${esc(app.world.scene.name || "世界")}</b><small>本机预览</small>${this.previewing ? primary("preview-enter", "进入") : ""}<button class="rk-btn" data-s="world-preview-close">回家</button>`;
      }
      chip.classList.add("on");
    }
    /* ───────── 页面 ───────── */
    rememberForm(body) {
      for (const input of body.querySelectorAll("[data-hub-field]")) this.form[input.dataset.hubField] = input.value;
    }
    renderWho() {
      var _a;
      const town = this.town, app = this.app;
      const saved = app.storage.failed ? "这个浏览器无法保存，当前只是临时体验" : "房间仅保存在此浏览器";
      if (this.signedIn) {
        const me = (_a = town.identity) == null ? void 0 : _a.characters.find((c) => c.id === town.char);
        return `<div class="rk-hub-who"><span><b>${esc(town.account.name || town.account.login || "已登录")}</b><small>角色：${esc((me == null ? void 0 : me.name) || "")} · 手动模式 · ${saved}</small></span><a href="#" class="rk-link" data-s="town-logout">退出</a></div>`;
      }
      return `<div class="rk-hub-who"><span><b>游客</b><small>体验角色 · ${saved}</small></span></div>`;
    }
    renderLogin() {
      var _a;
      const town = this.town, providers = ((_a = this.cfg) == null ? void 0 : _a.providers) || [];
      if (town.loginAttempt) {
        const link = town.loginAttempt.fallbackUrl;
        return `<div class="rk-hub-card"><b>在新窗口完成登录</b><div class="rk-hint">完成后会自动回到这里继续。</div><div class="rk-row">${link ? `<a class="rk-btn on" href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开登录页</a>` : ""}<button class="rk-btn" data-s="town-login-cancel">取消</button></div></div>`;
      }
      if (!this.pendingLogin) return "";
      if (!providers.length) return '<div class="rk-hint">这个站点还没有开放登录，可以继续以游客身份体验。</div>';
      return `<div class="rk-hub-card"><b>登录后继续</b><div class="rk-row">${providers.map((p) => primary("login", "用 " + esc(p.label) + " 登录", `data-id="${esc(p.id)}"`)).join("")}${btn("login-cancel", "取消")}</div></div>`;
    }
    renderConfirm() {
      var _a, _b;
      if (!this.confirming || !this.signedIn) return "";
      const me = this.town.identity.characters.find((c) => c.id === this.town.char);
      return `<div class="rk-hub-card"><b>别人会怎么称呼你？</b><div class="rk-chat-bar"><input data-hub-field="name" maxlength="16" value="${esc((_b = (_a = this.form.name) != null ? _a : me == null ? void 0 : me.name) != null ? _b : "")}" aria-label="公开昵称">${primary("name-go", "进入")}</div><div class="rk-hint">只公开昵称，之后还能改。</div></div>`;
    }
    renderInvite() {
      if (!this.invite) return "";
      const preview = this.invite.preview;
      if (!preview) return `<div class="rk-hub-card"><b>收到一条邀请</b><div class="rk-hint">正在确认邀请…</div>${btn("invite-retry", "重试")}</div>`;
      const usable = preview.status === "ok" || preview.status === "mine";
      if (!usable) return `<div class="rk-hub-card"><b>这条邀请用不了</b><div class="rk-hint">${esc(INVITE_TEXT[preview.status] || "邀请不可用。")}</div>${btn("invite-dismiss", "返回世界")}</div>`;
      const { world } = preview;
      const until = preview.status === "ok" ? ` · 有效至 ${new Date(preview.expiresAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "";
      return `<div class="rk-hub-card"><b>${esc(world.title)}</b><small>${world.host ? "房主 " + esc(world.host) + " · " : ""}${world.online} / ${world.seats} 人在场${until}</small>
      <div class="rk-row">${primary("invite-enter", preview.status === "mine" ? "回到房间" : "进入房间")}${btn("invite-dismiss", "先不去")}</div></div>`;
    }
    renderWorlds() {
      var _a, _b;
      if (this.listError) return `<div class="rk-hint">${esc(this.listError)}，你的房间不受影响。</div>${btn("reload", "重试")}`;
      if (!this.loaded) return '<div class="rk-hint">正在读取公共世界…</div>';
      if (((_b = (_a = this.cfg) == null ? void 0 : _a.open) == null ? void 0 : _b.publicWorlds) === false) return '<div class="rk-hint">公共世界暂未开放，可以继续在自己的房间里体验。</div>';
      if (!this.worlds.length) return '<div class="rk-hint">现在还没有开放的公共世界。</div>';
      return this.worlds.map((world) => {
        const full = world.status !== "open";
        const state = world.status === "closed" ? "暂未开放" : full ? "这场已满" : world.online ? `${world.online} 人在线` : "开放中";
        return `<article class="rk-world-card"><canvas width="240" height="120" data-thumb="${esc(world.worldId)}" aria-hidden="true"></canvas>
        <div><b>${esc(world.title)}</b><small>${state}</small></div>
        ${world.summary ? `<p>${esc(world.summary)}</p>` : ""}
        <div class="rk-row">${primary("enter", "进入", `data-id="${esc(world.worldId)}" ${full ? "disabled" : ""}`)}${btn("preview", "先看看", `data-id="${esc(world.worldId)}"`)}</div></article>`;
      }).join("");
    }
    render() {
      var _a, _b, _c, _d, _e;
      const app = this.app, town = this.town, panel = this.shell.worldPanel;
      if ((_a = this.session) == null ? void 0 : _a.id) return panel.renderSession();
      if ((_b = app.worldDrafts) == null ? void 0 : _b.view.home) {
        return `<div class="rk-hub-card"><b>${esc(app.world.scene.name || "世界")}</b><div class="rk-hint">这是本机预览，别人看不到你，也不会加入真实场次。</div><div class="rk-row">${this.previewing ? primary("preview-enter", "进入") : ""}<button class="rk-btn" data-s="world-preview-close">回到自己的房间</button></div></div>`;
      }
      const closed = ((_d = (_c = this.cfg) == null ? void 0 : _c.open) == null ? void 0 : _d.registration) === false && !this.signedIn ? '<div class="rk-hint">暂未开放新账号注册，已有账号可以登录。</div>' : "";
      const offline = (town == null ? void 0 : town.error) && !town.online ? `<div class="rk-hint">${esc(town.error)}，你的房间和布置不受影响。</div>${btn("reconnect", "重试")}` : "";
      const signIn = !this.signedIn && !(town == null ? void 0 : town.loginAttempt) && !this.pendingLogin && (((_e = this.cfg) == null ? void 0 : _e.providers) || []).length ? `<div class="rk-row">${btn("sign-in", "登录")}</div>` : "";
      const last = app.storage.pref("worldLastSession");
      const resume = this.signedIn && (last == null ? void 0 : last.service) === town.url ? btn("resume", "回到上次场次") : "";
      return `${this.renderWho()}${signIn}${closed}${this.renderLogin()}${this.renderConfirm()}${this.renderInvite()}
      ${this.error ? `<div class="rk-hint rk-hub-error">${esc(this.error)}</div>` : ""}${offline}
      ${resume ? `<div class="rk-row">${resume}</div>` : ""}
      <div class="rk-field">公共世界</div>${this.renderWorlds()}
      <details class="rk-hub-more"><summary>有朋友的邀请？</summary><div class="rk-chat-bar"><input data-hub-field="code" value="${esc(this.form.code || "")}" placeholder="粘贴邀请链接或邀请码" aria-label="邀请链接或邀请码">${btn("invite-paste", "查看")}</div></details>
      ${panel.renderExperiences()}
      <div class="rk-hub-foot"><a href="#" class="rk-link" data-s="hub-legacy">旧社区与世界创作</a><a class="rk-link" href="/guide" target="_blank" rel="noopener">创作指南</a></div>`;
    }
    afterRender(body) {
      for (const canvas of body.querySelectorAll("canvas[data-thumb]")) {
        const world = this.worlds.find(({ worldId }) => worldId === canvas.dataset.thumb);
        if (world) drawSceneThumb(canvas, world.preview);
      }
    }
    async action(action, element) {
      var _a;
      const { shell, town, app } = this;
      this.rememberForm(shell.el.body);
      const id = element == null ? void 0 : element.dataset.id;
      switch (action) {
        case "welcome-stay":
          this.dismissWelcome();
          return;
        case "welcome-worlds":
          this.dismissWelcome();
          shell.open("social");
          return;
        case "welcome-edit":
          this.dismissWelcome();
          shell.open("edit");
          return;
        case "legacy":
          shell.open("legacy");
          return;
        case "reload":
          await this.load();
          return;
        case "reconnect":
          await town.connect();
          await this.load();
          return;
        case "sign-in":
          this.pendingLogin = true;
          if ((((_a = this.cfg) == null ? void 0 : _a.providers) || []).length === 1) this.login(this.cfg.providers[0].id);
          else this.refresh();
          return;
        case "login":
          this.login(id);
          return;
        case "login-cancel":
          this.pendingLogin = false;
          this.target = null;
          this.refresh();
          return;
        case "enter":
          await this.guard(() => this.enterPublic(id));
          return;
        case "preview":
          await this.guard(async () => {
            const { release } = await town.call("publicWorldGet", { worldId: id });
            this.previewing = id;
            await app.worldDrafts.preview(release);
          });
          return;
        case "preview-enter":
          await this.guard(() => this.enterPublic(this.previewing));
          return;
        case "name-go":
          await this.guard(async () => {
            await this.saveName(this.form.name || "");
            await this.continueTarget(this.confirming);
          });
          return;
        case "invite-enter":
          await this.guard(() => this.enterInvite(this.invite.code));
          return;
        case "invite-retry":
          await this.previewInvite();
          return;
        case "invite-dismiss":
          this.invite = null;
          this.target = null;
          this.refresh();
          return;
        case "invite-paste":
          await this.guard(async () => {
            const { code, service } = readInvite(this.form.code || "");
            if (service && service !== location.origin) throw new Error(`这条邀请来自另一个服务（${service}），请在对应的站点打开。`);
            this.form.code = "";
            this.invite = { code, preview: null };
            await this.previewInvite();
          });
          return;
        case "resume":
          await this.guard(async () => {
            const last = app.storage.pref("worldLastSession");
            await this.session.enter(last.sessionId, {});
          });
          return;
      }
    }
  };

  // web/roomkit/home.js
  var MAX_ROOMS = 24;
  var FLOOR_RE = /^.{1,8}$/;
  function defaultHome(packs) {
    const p = packs.find((x) => x.home && Array.isArray(x.home.rooms)) || null;
    if (p) {
      const h = p.home;
      return normalizeHome({
        name: h.name || p.name,
        floors: h.floors,
        rooms: h.rooms.map((r) => Object.assign({}, r, { tpl: r.tpl && r.tpl.indexOf("|") < 0 ? p.id + "|" + r.tpl : r.tpl }))
      });
    }
    const rooms = [];
    packs.forEach((pk) => (pk.scenes || []).forEach((s) => rooms.push({ id: s.id, name: s.name, floor: "1F", tpl: pk.id + "|" + s.id })));
    return normalizeHome({ name: "我的家", floors: ["1F"], rooms });
  }
  function normalizeHome(raw) {
    const h = raw && typeof raw === "object" ? raw : {};
    const seen = /* @__PURE__ */ new Set();
    const rooms = [];
    for (const r of Array.isArray(h.rooms) ? h.rooms : []) {
      if (!r || typeof r.id !== "string" || !r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      rooms.push({
        id: r.id,
        name: String(r.name || r.id).slice(0, 24),
        floor: FLOOR_RE.test(r.floor || "") ? r.floor : "1F",
        tpl: typeof r.tpl === "string" ? r.tpl : void 0
      });
      if (rooms.length >= MAX_ROOMS) break;
    }
    const floors = (Array.isArray(h.floors) ? h.floors : []).filter((f) => typeof f === "string" && FLOOR_RE.test(f));
    for (const r of rooms) if (floors.indexOf(r.floor) < 0) floors.push(r.floor);
    const out = { v: 1, name: String(h.name || "我的家").slice(0, 24), floors, rooms, follow: h.follow !== false };
    if (Array.isArray(h.seen)) out.seen = h.seen.filter((t) => typeof t === "string").slice(0, 200);
    return out;
  }
  var isFollower = (a) => !!a && !a.ephemeral && (a.follow === true || a.brain === "pet" && a.follow !== false);
  function doorSpot(nav, o, room) {
    const p = o.wall === "left" ? { x: 0.5, y: o.at } : { x: o.at, y: 0.5 };
    return nav.nearestFree(p.x, p.y, 4) || nav.nearestFree(room.w / 2, room.h / 2, 12);
  }
  var Home = class {
    constructor(app) {
      this.app = app;
      const saved = app.storage.pref("home");
      const def = defaultHome(app.packs);
      this.data = saved ? normalizeHome(saved) : this._claim(def);
      if (!saved) {
        this.data.seen = def.rooms.map((r) => r.tpl).filter(Boolean);
        this.save();
      } else this._adopt(def);
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
      if (added.length) {
        for (const r of d.rooms) if (added.indexOf(r.id) < 0) this._addDoors(r, added);
      }
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
        const W = scene.room || {}, len = sp.wall === "left" ? W.h : W.w;
        if (!W.walls || !W.walls[sp.wall] || sp.a0 < 0 || !(sp.a1 <= len)) continue;
        if (scene.objects.some((x) => x.id === o.id || x.state && x.state.to === to)) continue;
        if (scene.objects.some((x) => {
          const q = span(x);
          return q && hits(sp, q);
        })) continue;
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
        const tplId = r.tpl ? r.tpl.split("|")[1] : null;
        if (!tplId) continue;
        for (const s of list) {
          if (used.has(s.id)) continue;
          const full = this.app.storage.load(s.id);
          if (full && full.template === tplId) {
            used.add(s.id);
            r.id = s.id;
            r.name = full.name || r.name;
            break;
          }
        }
      }
      return home;
    }
    save() {
      this.app.storage.pref("home", this.data);
    }
    get follow() {
      return this.data.follow !== false;
    }
    set follow(v) {
      this.data.follow = !!v;
      this.save();
    }
    get name() {
      return this.data.name;
    }
    rooms() {
      return this.data.rooms;
    }
    room(id) {
      return this.data.rooms.find((r) => r.id === id) || null;
    }
    has(id) {
      return !!this.room(id);
    }
    /** 楼层（显示顺序：上 → 下），每层带自己的房间 */
    byFloor() {
      return this.data.floors.map((f) => ({ floor: f, rooms: this.data.rooms.filter((r) => r.floor === f) })).filter((g) => g.rooms.length);
    }
    /** 平铺顺序（楼层从上到下）：数字键 1–9 按它切换 */
    ordered() {
      return this.byFloor().reduce((out, g) => out.concat(g.rooms), []);
    }
    template(room) {
      if (!room || !room.tpl) return null;
      const [pid, sid] = room.tpl.split("|");
      const p = this.app.packs.find((x) => x.id === pid);
      return p && (p.scenes || []).find((s) => s.id === sid) || null;
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
        if (a.follow !== void 0) continue;
        const ta = (t.agents || []).find((x) => x.id === a.id);
        if (ta && ta.follow !== void 0) a.follow = ta.follow;
      }
      return scene;
    }
    _templateById(id) {
      for (const p of this.app.packs) {
        const t = (p.scenes || []).find((s) => s.id === id);
        if (t) return t;
      }
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
      const f = FLOOR_RE.test(floor || "") ? floor : this.data.floors[this.data.floors.length - 1] || "1F";
      if (this.data.floors.indexOf(f) < 0) this.data.floors.push(f);
      this.data.rooms.push({ id: scene.id, name: String(scene.name || "房间").slice(0, 24), floor: f });
      this.save();
      return true;
    }
    remove(id) {
      const n = this.data.rooms.length;
      this.data.rooms = this.data.rooms.filter((r) => r.id !== id);
      if (this.data.rooms.length !== n) this.save();
    }
    rename(id, name) {
      const r = this.room(id);
      if (r && name) {
        r.name = String(name).slice(0, 24);
        this.save();
      }
    }
    setFloor(id, floor) {
      const r = this.room(id);
      if (!r || !FLOOR_RE.test(floor || "")) return;
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
      if (!s) {
        this.app.world.apply({ t: "state", id: free.id, patch: { to: fromId } });
        return;
      }
      free.state = Object.assign({}, free.state, { to: fromId });
      this.app.storage.save(s);
    }
  };

  // web/roomkit/version.js
  var VERSION = "1.0.0-alpha.2";

  // web/roomkit/shell.js
  var TIME_CYCLE = [null, "dawn", "noon", "dusk", "night"];
  var WEATHER_CYCLE = ["clear", "cloudy", "rain", "snow"];
  var WEATHER_ICON = { clear: "☀", cloudy: "☁", rain: "🌧", snow: "❄" };
  var PERIOD_ICON = { dawn: "🌅", noon: "🌞", dusk: "🌇", night: "🌙" };
  var PAGES = [
    { id: "play", icon: "🎮", label: "游玩" },
    { id: "edit", icon: "🛠", label: "布置" },
    { id: "story", icon: "📖", label: "剧情" },
    { id: "chat", icon: "💬", label: "聊天" },
    { id: "map", icon: "🗺", label: "地图" },
    { id: "social", icon: "👥", label: "社区" }
  ];
  var SITE_PAGES = [
    { id: "play", icon: "🏠", label: "家" },
    { id: "edit", icon: "🛠", label: "布置" },
    { id: "social", icon: "🌐", label: "世界" },
    { id: "chat", icon: "💬", label: "聊天" }
  ];
  var PAGE_TITLE = { story: "剧情", chat: "聊天", map: "家 · 地图", social: "社区", town: "AI 小镇 · 帖子", "town-admin": "AI 小镇 · 管理", conn: "连接与状态", about: "关于" };
  var STATUS_TEXT = { thinking: "思考中", working: "干活中", result: "整理结果", waiting: "等你回复", success: "完成啦", error: "出错了" };
  var OFFLINE_RULES = [
    [/睡|困|休息|晚安/, "sleep", ["好~ 那我去睡一会儿", "晚安，呼……"]],
    [/书|读|看看书|学习/, "read", ["那我去看会儿书", "最近在读一本好书哦"]],
    [/跳舞|跳个舞|舞/, "dance", ["看我的！", "♪ 啦啦啦~"]],
    [/你好|嗨|hi|hello|在吗/i, "wave", ["你好呀~", "在呢在呢！"]],
    [/吃|饿|零食|冰箱/, "use:fridge", ["冰箱里应该还有布丁！", "我去找点吃的~"]],
    [/电视|看剧/, "use:tv", ["一起看电视吧"]]
  ];
  function parseActs(text2) {
    const acts = [];
    const clean2 = String(text2 || "").replace(/\[\[([^\]]{1,40})\]\]/g, (m, a) => {
      acts.push(a.trim());
      return "";
    }).replace(/[ \t]{2,}/g, " ").trim();
    return { text: clean2, acts };
  }
  var Shell = class {
    constructor(app) {
      this.app = app;
      this.page = null;
      this.chatLog = [];
      this.menu = null;
      this._dismissed = /* @__PURE__ */ new Set();
      const root = app.root;
      root.insertAdjacentHTML("beforeend", `
      <div class="rk-top">
        <button class="rk-btn rk-scene-btn" data-s="rooms" title="换房间（数字键 1–9）" aria-haspopup="menu"><span>🏠</span><b></b><i>▾</i></button>
        <nav class="rk-rooms" aria-label="家里的房间"></nav>
        <span class="rk-top-gap"></span>
        <button class="rk-btn icon" data-s="time" title="时间（点一下切换，循环回到跟随真实时间）"></button>
        <button class="rk-btn icon" data-s="weather" title="天气"></button>
        <button class="rk-btn icon rk-conn" data-s="conn" title="连接与状态"><i class="rk-dot"></i><span>本地</span></button>
        <button class="rk-btn icon" data-s="more" title="更多" aria-haspopup="menu">⋯</button>
      </div>
      <div class="rk-menu" role="menu"></div>
      <div class="rk-story-pill"></div>
      <div class="rk-coach"></div>
      <div class="rk-curtain" aria-hidden="true"><i></i><i></i><b></b></div>
      <div class="rk-flash" aria-live="polite"></div>
      <div class="rk-world-chip" aria-live="polite"></div>
      <nav class="rk-dock">${(app.opts.site ? SITE_PAGES : PAGES).map((p) => `<button data-page="${p.id}" title="${p.label}"><span>${p.icon}</span><small>${p.label}</small></button>`).join("")}</nav>
      <aside class="rk-sheet"><header><b></b><button class="rk-x" data-s="close">×</button></header><div class="rk-sheet-body"></div></aside>`);
      const $ = (s) => root.querySelector(s);
      this.el = {
        top: $(".rk-top"),
        rooms: $(".rk-rooms"),
        menu: $(".rk-menu"),
        dock: $(".rk-dock"),
        sheet: $(".rk-sheet"),
        title: $(".rk-sheet header b"),
        body: $(".rk-sheet-body"),
        pill: $(".rk-story-pill"),
        coach: $(".rk-coach"),
        curtain: $(".rk-curtain"),
        flash: $(".rk-flash"),
        chip: $(".rk-world-chip")
      };
      this.worldPanel = new WorldPanel(this);
      this.hub = app.opts.site ? new WorldHub(this) : null;
      if (app.opts.site) root.classList.add("rk-site");
      root.addEventListener("click", (e) => this._onClick(e));
      root.addEventListener("keydown", (e) => {
        var _a, _b;
        if (e.target && e.target.matches && e.target.matches(".rk-chat-in") && e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this._sendChat();
        }
        if (e.target && e.target.matches && e.target.matches(".rk-town-in") && e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this._townSay();
        }
        if (((_b = (_a = e.target) == null ? void 0 : _a.matches) == null ? void 0 : _b.call(_a, ".rk-world-say")) && e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this.worldPanel.action("say");
        }
        if (e.target && e.target.matches && e.target.matches("[data-menu-in]") && e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this._menuInput(e.target);
        }
        if (e.key === "Escape" && this.menu) {
          e.stopPropagation();
          this.closeMenu();
        }
      }, true);
      app.on("scene:open", () => {
        this.sync();
        if (this.page && this.page !== "chat") this.render();
      });
      this._diagAt = 0;
      this.sync();
    }
    /* ───────── 顶栏 / 房间条 / Dock 同步 ───────── */
    sync() {
      const app = this.app, env = app.world.scene.env, q = (s) => this.el.top.querySelector(s);
      const cur = app.world.scene, room = app.home && app.home.room(cur.id);
      q(".rk-scene-btn b").textContent = room && room.name || cur.name || "房间";
      const per = PERIODS.find((p) => p.id === env.period);
      const live = per || PERIODS.find((p) => p.id === (app.env && app.env.id)) || PERIODS[1];
      q("[data-s=time]").textContent = (PERIOD_ICON[live.id] || "🕒") + (app.compact ? "" : " " + (per ? per.label : "跟随时间"));
      q("[data-s=time]").classList.toggle("on", !!per);
      q("[data-s=weather]").textContent = (WEATHER_ICON[env.weather] || "☀") + (app.compact ? "" : " " + (WEATHERS[env.weather] || WEATHERS.clear).label);
      this._syncRooms();
      const page = app.mode === "edit" ? "edit" : this.page || "play";
      this.el.dock.querySelectorAll("[data-page]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-page") === page));
      this.syncConn();
    }
    /** 宽档顶栏中间的房间条：家里的房间按楼层排开 */
    _syncRooms() {
      const app = this.app, home = app.home;
      if (!home) return;
      const list = home.ordered(), cur = app.world.scene.id;
      const key2 = list.map((r) => r.id + r.name + r.floor).join("|") + "#" + cur;
      if (this._roomsKey === key2) return;
      this._roomsKey = key2;
      this.el.rooms.innerHTML = list.length > 1 ? list.map((r, i) => `<button data-room="${esc(r.id)}" class="${r.id === cur ? "on" : ""}" title="${esc(r.floor + " · " + r.name)}（${i + 1}）"><small>${esc(r.floor)}</small>${esc(r.name)}</button>`).join("") : "";
    }
    /** 连接灯：绿 = 宿主在线且有工作状态来源；黄 = 宿主在线；灰 = 纯本地 */
    syncConn() {
      const app = this.app, btn2 = this.el.top.querySelector(".rk-conn");
      const c = this.hub ? this.hub.connection() : app.ext && app.ext.connection && app.ext.connection() || { level: "local", label: "本地" };
      btn2.setAttribute("data-level", c.level);
      btn2.querySelector("span").textContent = c.label;
      btn2.title = "连接与状态：" + (c.detail || c.label);
    }
    /** 每帧：剧情提示条、引导气泡、连接页的局部刷新 */
    update() {
      var _a;
      const app = this.app, root = app.root;
      root.classList.toggle("rk-storying", !!app.stories.active);
      if (this.pendingStory && (app.stories.active || !app.stories.ready(this.pendingStory))) this.pendingStory = null;
      const show = this.pendingStory && !app.stories.active && app.mode !== "edit";
      if (show && this.el.pill._id !== this.pendingStory.id) {
        this.el.pill._id = this.pendingStory.id;
        this.el.pill.innerHTML = `<button class="rk-btn" data-s="story-go">❗ ${esc(this.pendingStory.name || "新剧情")} <b>▶ 开始</b></button><button class="rk-btn icon" data-s="story-later" title="稍后">×</button>`;
      }
      this.el.pill.classList.toggle("on", !!show);
      if (!show) this.el.pill._id = null;
      if (this.page === "conn" && performance.now() - this._diagAt > 2e3) this._renderConn();
      if ((this._syncT = (this._syncT || 0) + 1) % 60 === 0) this.syncConn();
      (_a = this.hub) == null ? void 0 : _a.syncChip();
    }
    /** 剧情（开场 / 到点）：默认只给提示条；用户在设置里选了"自动播放"才直接演 */
    offerStory(s) {
      if (this.app.storage.pref("autoStory")) {
        this.app.stories.run(s);
        return;
      }
      if (!this.pendingStory && !this._dismissed.has(s.id)) this.pendingStory = s;
    }
    /** 第一次打开：告诉用户能点哪里（只出现一次） */
    coach() {
      if (this.hub) {
        this.hub.welcome();
        return;
      }
      if (this.app.storage.pref("coached") || this.app.opts.coach === false) return;
      const el = this.el.coach;
      el.innerHTML = `<b>欢迎来到${esc(this.app.home ? this.app.home.name : this.app.world.scene.name || "房间")}！</b><br>点点<span>角色</span>和<span>家具</span>试试；点地面让她走过去，滚轮缩放、拖动平移。<br>左上角换房间（数字键 1–9），左键点<span>门</span>直接过去，右键打开门旁菜单。<br>底部菜单：🛠 布置 · 📖 剧情 · 💬 聊天 · 🗺 地图<button class="rk-btn" data-s="coach-ok">知道了</button>`;
      el.classList.add("on");
    }
    /* ───────── 换房间转场：两扇门合上 → 换场景 → 打开，再闪一下楼层名 ───────── */
    async curtain(close, label) {
      const el = this.el.curtain, quick = this.app.reduceMotion;
      if (close) {
        this.closeMenu();
        el.querySelector("b").textContent = label || "";
        el.classList.add("on");
        void el.offsetWidth;
        el.classList.add("shut");
        await delay(quick ? 0 : 340);
        return;
      }
      await delay(quick ? 0 : 120);
      el.classList.remove("shut");
      setTimeout(() => {
        if (!el.classList.contains("shut")) el.classList.remove("on");
      }, quick ? 0 : 380);
      const r = this.app.home && this.app.home.room(this.app.world.scene.id);
      this.flash(r ? `<small>${esc(r.floor)}</small>${esc(r.name)}` : esc(this.app.world.scene.name || ""));
      this.app.sfx("chirp");
    }
    flash(html) {
      const f = this.el.flash;
      f.innerHTML = html;
      f.classList.remove("on");
      void f.offsetWidth;
      f.classList.add("on");
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => f.classList.remove("on"), 1500);
    }
    /* ───────── 下拉菜单（房间 / 更多 / 地图卡片） ───────── */
    openMenu(kind, anchor, arg) {
      if (this.menu && this.menu.kind === kind && this.menu.arg === arg) {
        this.closeMenu();
        return;
      }
      const app = this.app, m = this.el.menu;
      let html = "";
      if (kind === "rooms") html = this._roomsMenu();
      else if (kind === "more") html = this._moreMenu();
      else if (kind === "room") html = this._roomMenu(arg);
      m.innerHTML = html;
      m.classList.add("on");
      const r = anchor.getBoundingClientRect(), base = app.root.getBoundingClientRect();
      const w = m.offsetWidth, left = Math.max(6, Math.min(r.left - base.left, base.width - w - 6));
      m.style.left = left + "px";
      m.style.top = Math.min(r.bottom - base.top + 6, Math.max(6, base.height - m.offsetHeight - 6)) + "px";
      this.menu = { kind, arg };
      const inp = m.querySelector("[data-menu-in]");
      if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 30);
    }
    closeMenu() {
      if (!this.menu) return;
      this.menu = null;
      this.el.menu.classList.remove("on");
    }
    _roomsMenu() {
      const app = this.app, home = app.home, cur = app.world.scene.id;
      const groups = home.byFloor().map((g) => `<div class="rk-menu-sep">${esc(g.floor)}</div>` + g.rooms.map((r) => `<button data-room="${esc(r.id)}" class="${r.id === cur ? "on" : ""}"><span>${r.id === cur ? "●" : ""}</span>${esc(r.name)}<small>${home.ordered().indexOf(r) + 1}</small></button>`).join("")).join("");
      const outside = home.has(cur) ? "" : `<div class="rk-menu-sep">当前</div><button data-menu="add-cur"><span>＋</span>把「${esc(app.world.scene.name || "这个场景")}」加入家</button>`;
      return `<div class="rk-menu-title">${esc(home.name)}</div>${outside}${groups}<hr><button data-menu="map"><span>🗺</span>地图与全部房间<small>M</small></button><button data-menu="new-room"><span>＋</span>新建房间…</button>`;
    }
    _moreMenu() {
      const app = this.app, check = (on) => `<em>${on ? "✓" : ""}</em>`;
      return `
      <button data-menu="names"><span>🏷</span>显示名字${check(app.renderer.showNames)}</button>
      <button data-menu="fit"><span>⤢</span>复位视角<small>F</small></button>
      ${this.hub ? '<button data-menu="story"><span>📖</span>剧情</button><button data-menu="map"><span>🗺</span>地图<small>M</small></button>' : ""}
      <button data-menu="sound"><span>${app.soundOn ? "🔊" : "🔈"}</span>声音${check(app.soundOn)}</button>
      <button data-menu="follow"><span>🐋</span>角色跟着我换房间${check(app.home.follow)}</button>
      <button data-menu="auto-story"><span>📖</span>剧情自动开演${check(!!app.storage.pref("autoStory"))}</button>
      ${app.ext && app.ext.openFull ? '<button data-menu="full"><span>⛶</span>全屏打开</button>' : ""}
      <hr><button data-menu="about"><span>ⓘ</span>关于与许可</button>`;
    }
    _roomMenu(id) {
      const home = this.app.home, r = home.room(id);
      if (!r) return "";
      return `<div class="rk-menu-title">${esc(r.name)}</div>
      <div class="rk-menu-in"><input data-menu-in="rename" data-id="${esc(id)}" value="${esc(r.name)}" maxlength="24"><button data-menu="rename" data-id="${esc(id)}">改名</button></div>
      <div class="rk-menu-sep">换到楼层</div>
      <div class="rk-chips">${home.data.floors.map((f) => `<button data-menu="floor" data-id="${esc(id)}" data-floor="${esc(f)}" class="${f === r.floor ? "on" : ""}">${esc(f)}</button>`).join("")}</div>
      <div class="rk-menu-in"><input data-menu-in="floor" data-id="${esc(id)}" placeholder="新楼层，如 3F / 地下室" maxlength="8"><button data-menu="new-floor" data-id="${esc(id)}">新建</button></div>
      <hr><button data-menu="remove-room" data-id="${esc(id)}"><span>✕</span>移出家（存档保留）</button>`;
    }
    _menuInput(inp) {
      const app = this.app, id = inp.getAttribute("data-id"), v = inp.value.trim();
      if (!v) return;
      if (inp.getAttribute("data-menu-in") === "rename") {
        app.home.rename(id, v);
        if (id === app.world.scene.id) app.world.apply({ t: "meta", patch: { name: v.slice(0, 24) } });
      } else app.home.setFloor(id, v);
      this.closeMenu();
      this.sync();
      if (this.page === "map") this.render();
    }
    _onMenu(t) {
      const app = this.app, a = t.getAttribute("data-menu"), id = t.getAttribute("data-id");
      switch (a) {
        case "map":
          this.closeMenu();
          this.open("map");
          return;
        case "story":
          this.closeMenu();
          this.open("story");
          return;
        case "new-room":
          this.closeMenu();
          this.open("map");
          setTimeout(() => {
            const s = this.el.body.querySelector(".rk-addroom");
            if (s) s.scrollIntoView({ block: "center" });
          }, 30);
          return;
        case "add-cur":
          app.home.add(app.world.scene, app.home.data.floors[app.home.data.floors.length - 1]);
          this.closeMenu();
          this.sync();
          app.hud.toast("已加入家");
          return;
        case "names":
          app.renderer.showNames = !app.renderer.showNames;
          break;
        case "fit":
          app.renderer.fit(false);
          this.closeMenu();
          return;
        case "sound":
          app.setSound(!app.soundOn);
          break;
        case "follow":
          app.home.follow = !app.home.follow;
          app.hud.toast(app.home.follow ? "角色会跟着你换房间" : "每个房间各住各的");
          break;
        case "auto-story":
          app.storage.pref("autoStory", !app.storage.pref("autoStory"));
          break;
        case "full":
          this.closeMenu();
          if (app.ext.openFull) app.ext.openFull();
          return;
        case "about":
          this.closeMenu();
          this.open("about");
          return;
        case "rename": {
          const inp = this.el.menu.querySelector("[data-menu-in=rename]");
          if (inp) this._menuInput(inp);
          return;
        }
        case "new-floor": {
          const inp = this.el.menu.querySelector("[data-menu-in=floor]");
          if (inp) this._menuInput(inp);
          return;
        }
        case "floor":
          app.home.setFloor(id, t.getAttribute("data-floor"));
          this.closeMenu();
          this.sync();
          if (this.page === "map") this.render();
          return;
        case "remove-room": {
          if (app.home.rooms().length <= 1) {
            app.hud.toast("家里至少要留一个房间");
            return;
          }
          app.home.remove(id);
          this.closeMenu();
          this.sync();
          if (this.page === "map") this.render();
          app.hud.toast("已移出家，可在地图下方重新加入");
          return;
        }
      }
      if (this.menu) {
        const kind = this.menu.kind, anchor = this.el.top.querySelector("[data-s=" + kind + "]");
        this.menu = null;
        if (anchor) this.openMenu(kind, anchor);
      }
    }
    /* ───────── 页面 ───────── */
    open(page) {
      const app = this.app;
      this.closeMenu();
      if (page === "edit") {
        this.close();
        app.setMode("edit");
        if (this.hub && !this._saveHinted) {
          this._saveHinted = true;
          app.hud.toast(app.storage.failed ? "这个浏览器无法保存，当前只是临时体验" : "布置会自动保存在这个浏览器", 3200);
        }
        return;
      }
      if (page === "play") {
        this.close();
        if (app.mode === "edit") app.setMode("play");
        return;
      }
      if (app.mode === "edit") app.setMode("play");
      if (this.page === page) {
        this.close();
        return;
      }
      this.page = page;
      app.hud.closeCard();
      app.hud.closeDrawer();
      this.el.title.textContent = (this.hub && page === "social" ? "世界" : page === "legacy" ? "旧社区与世界创作" : PAGE_TITLE[page]) || page;
      this.el.sheet.className = "rk-sheet on rk-sheet-" + page;
      this.render();
      this.sync();
      app.bus.emit("ui:page", { page });
    }
    close() {
      if (!this.page) return;
      this.page = null;
      this.el.sheet.classList.remove("on");
      this.sync();
    }
    render() {
      const p = this.page;
      if (p === "story") this._renderStory();
      else if (p === "map") this._renderMap();
      else if (p === "chat") this._renderChat();
      else if (p === "social") this.hub ? this._renderHub() : this._renderSocial();
      else if (p === "legacy") this._renderSocial();
      else if (p === "town") this._renderTown();
      else if (p === "town-admin") this._renderTownAdmin();
      else if (p === "conn") this._renderConn();
      else if (p === "about") this._renderAbout();
    }
    _trigText(s, roomScene) {
      const t = s.trigger, app = this.app;
      if (t.on === "start") return "进入房间时";
      if (t.on === "click") {
        const objs = roomScene && roomScene.objects || app.world.objects;
        const o = t.obj ? objs.find((x) => x.id === t.obj) : null;
        const d = app.catalog.get(o ? o.def : t.def);
        return "点「" + (d && d.name || t.obj || t.def) + "」";
      }
      if (t.on === "agent") return "点角色「" + ((app.agents.get(t.agent) || {}).name || t.agent) + "」";
      if (t.on === "hour") return t.from + ":00–" + t.to + ":00 之间";
      return "手动";
    }
    /** 剧情页：这个房间的剧情（可播放）+ 家里其他房间的剧情（前往） */
    _renderStory() {
      const app = this.app, st = app.stories, cur = app.world.scene;
      const here = st.forScene(cur);
      const done = (s, sid) => st.getFlag("done:" + s.id, sid) || st.getFlag("seen:" + s.id, sid);
      const n = here.filter((s) => done(s)).length;
      const row = (s) => {
        const seen = done(s), ready = st.ready(s);
        return `<div class="rk-story ${seen ? "seen" : ""}"><div><b>${seen ? "✓" : ready ? "❗" : "·"} ${esc(s.name || s.id)}</b><small>${esc(this._trigText(s))}${s.once ? " · 一次" : s.daily ? " · 每天" : ""}</small></div>
        <button class="rk-btn" data-story="${esc(s.id)}" ${ready || seen ? "" : 'title="条件还不满足，也可以直接看"'}>${seen ? "重看" : "播放"}</button></div>`;
      };
      const others = [];
      for (const r of app.home.ordered()) {
        if (r.id === cur.id) continue;
        const sc = app.home.sceneFor(r.id);
        const list = sc ? st.forScene(sc).filter((s) => s.trigger.scene) : [];
        if (list.length) others.push({ r, list, n: list.filter((s) => done(s, r.id)).length });
      }
      this.el.body.innerHTML = `
      <div class="rk-progress"><span>${esc(cur.name || "这个房间")}</span><b>${n} / ${here.length}</b><i><b style="width:${here.length ? Math.round(n / here.length * 100) : 0}%"></b></i></div>
      ${here.length ? here.map(row).join("") : '<div class="rk-hint">这个房间还没有剧情。剧情可以写在场景 JSON 的 stories 里（见 docs/04）。</div>'}
      ${others.length ? '<div class="rk-field">家里其他房间</div>' + others.map((o) => `<div class="rk-story"><div><b>${esc(o.r.floor + " · " + o.r.name)}</b><small>${esc(o.list.map((s) => s.name).join("、"))} · ${o.n}/${o.list.length}</small></div><button class="rk-btn" data-room="${esc(o.r.id)}">前往</button></div>`).join("") : ""}
      <div class="rk-row"><button class="rk-btn" data-s="story-reset">重置本房间进度</button>
        <label class="rk-check"><input type="checkbox" data-s="auto-story" ${app.storage.pref("autoStory") ? "checked" : ""}> 剧情自动开演</label></div>`;
    }
    /** 地图：家里的房间按楼层排开（缩略图按场景 JSON 现画）+ 添加房间 + 不在家里的场景 */
    _renderMap() {
      const app = this.app, home = app.home, cur = app.world.scene;
      const main = app.mainAgent();
      const scenes = /* @__PURE__ */ new Map([[cur.id, app.world.toJSON()]]);
      const view = (s) => s.id === cur.id || !home.follow ? s : Object.assign({}, s, { agents: (s.agents || []).filter((a) => !isFollower(a)) });
      const card = (s0, r) => {
        const s = view(s0), here = s.id === cur.id;
        const prog = app.stories.forScene(s);
        const seen = prog.filter((x) => app.stories.getFlag("done:" + x.id, s.id) || app.stories.getFlag("seen:" + x.id, s.id)).length;
        const who = here ? main ? "你和" + main.name + "在这里" : "你在这里" : (s.agents || []).filter((a) => !a.ephemeral).map((a) => a.name).slice(0, 3).join("、") || "没有人";
        return `<div class="rk-mapcard ${here ? "cur" : ""}" ${r ? `data-room="${esc(s.id)}"` : `data-map-open="${esc(s.id)}"`}>
        <canvas data-thumb-scene="${esc(s.id)}" width="160" height="96"></canvas>
        <b>${esc(r && r.name || s.name || s.id)}</b><small>${esc(who)}${prog.length ? " · 剧情 " + seen + "/" + prog.length : ""}</small>
        ${r ? `<button class="rk-mapcard-more" data-room-menu="${esc(s.id)}" title="改名 / 换楼层 / 移出">⋯</button>` : `<button class="rk-mapcard-more" data-map-add="${esc(s.id)}" title="加入家">＋</button>`}</div>`;
      };
      const floors = home.byFloor().map((g) => {
        const cards = g.rooms.map((r) => {
          const s = r.id === cur.id ? scenes.get(cur.id) : home.sceneFor(r.id);
          if (!s) return "";
          scenes.set(s.id, s);
          return card(s, r);
        }).join("");
        return `<div class="rk-floor"><div class="rk-floor-tag">${esc(g.floor)}</div><div class="rk-mapgrid">${cards}</div></div>`;
      }).join("");
      const outside = (app.storage.list ? app.storage.list() : []).filter((s) => !home.has(s.id));
      outside.forEach((s) => {
        const full = s.id === cur.id ? scenes.get(cur.id) : app.storage.load(s.id);
        if (full) scenes.set(s.id, full);
      });
      const tpls = [];
      app.packs.forEach((p) => (p.scenes || []).forEach((s) => tpls.push({ key: p.id + "|" + s.id, scene: s })));
      tpls.forEach((t) => scenes.set("tpl:" + t.key, t.scene));
      const floorSel = this._addFloor || home.data.floors[home.data.floors.length - 1] || "1F";
      this.el.body.innerHTML = `
      <div class="rk-maphead"><b>${esc(home.name)}</b><small>${home.rooms().length} 个房间 · 点卡片前往，数字键 1–9 快速切换</small></div>
      ${floors}
      <div class="rk-field rk-addroom">添加房间到 <span class="rk-chips rk-inline">${home.data.floors.map((f) => `<button data-add-floor="${esc(f)}" class="${f === floorSel ? "on" : ""}">${esc(f)}</button>`).join("")}</span></div>
      <div class="rk-mapgrid">${tpls.map((t) => `<div class="rk-mapcard rk-mapnew-tpl" data-map-tpl="${esc(t.key)}"><canvas data-thumb-scene="${esc("tpl:" + t.key)}" width="160" height="96"></canvas><b>＋ ${esc(t.scene.name || t.scene.id)}</b><small>模板</small></div>`).join("")}
        <div class="rk-mapcard rk-mapnew" data-map-new="room"><span>＋</span><b>空房间</b></div>
        <div class="rk-mapcard rk-mapnew" data-map-new="open"><span>🌳</span><b>露天广场</b></div></div>
      ${outside.length ? `<div class="rk-field">不在家里的场景（${outside.length}）</div><div class="rk-mapgrid">${outside.map((s) => scenes.get(s.id) ? card(scenes.get(s.id), null) : "").join("")}</div>` : ""}
      <div class="rk-hint">左键点门直接换房间；右键点门，在门旁菜单里改目的地或开关门。🛠 布置 → 场景 里可以导入导出、复制、删除场景。</div>`;
      this.el.body.querySelectorAll("[data-thumb-scene]").forEach((c) => {
        const s = scenes.get(c.getAttribute("data-thumb-scene"));
        drawSceneThumb(c, s && s.room ? view(s) : s);
      });
    }
    _renderChat() {
      const app = this.app, a = app.focusAgent(), group = this.chatGroup && app.agents.size > 1;
      const who = group ? `和 <b>全屋 ${app.agents.size} 位</b> 群聊` : a ? `和 <b>${esc(a.name)}</b> 聊天` : "房间里没有角色";
      const toggle = app.agents.size > 1 ? `<button class="rk-btn${group ? " on" : ""}" data-s="chat-group" title="一句话发给房间里所有角色，轮流回答">👥 群聊</button>` : "";
      const status = app.ext && app.ext.chatStatus && app.ext.chatStatus() || (app.ext && app.ext.chat ? "接入 DSH 模型" : "离线台词模式（接入 DSH 后可用模型对话）");
      this.el.body.innerHTML = `
      <div class="rk-chat-who"><span class="rk-chat-head"><span>${who}</span>${toggle}</span><small>${esc(status)}</small></div>
      <div class="rk-chat-log"></div>
      <div class="rk-chat-bar"><input class="rk-chat-in" type="text" maxlength="300" placeholder="${a ? "说点什么…（比如：去睡觉吧）" : ""}" ${a ? "" : "disabled"}><button class="rk-btn on" data-s="chat-send">发送</button></div>`;
      this._renderChatLog();
      const inp = this.el.body.querySelector(".rk-chat-in");
      if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 30);
    }
    _renderChatLog() {
      const log = this.el.body.querySelector(".rk-chat-log");
      if (!log) return;
      log.innerHTML = this.chatLog.length ? this.chatLog.map((m) => `<div class="rk-msg ${m.role}${m.pending ? " pending" : ""}"><span>${m.who && this.chatGroup ? `<b>${esc(m.who)}</b>：` : ""}${esc(m.text)}</span>${m.note ? `<small>${esc(m.note)}</small>` : ""}</div>`).join("") : '<div class="rk-hint">她会按自己的性格回答；说"去睡觉""看会儿书""去客厅看电视"之类的话，她会真的去做。</div>';
      log.scrollTop = log.scrollHeight;
    }
    async _sendChat() {
      const app = this.app, inp = this.el.body.querySelector(".rk-chat-in");
      const text2 = inp && inp.value.trim();
      const group = this.chatGroup && app.agents.size > 1;
      const list = group ? [...app.agents.values()].slice(0, 4) : [app.focusAgent()].filter(Boolean);
      if (!text2 || !list.length || this._chatBusy) return;
      inp.value = "";
      this.chatLog.push({ role: "user", text: text2 });
      this._renderChatLog();
      this._chatBusy = true;
      for (const a of list) {
        const pend = { role: "bot", who: a.name, text: a.name + " 正在想…", pending: true };
        this.chatLog.push(pend);
        if (this.page === "chat") this._renderChatLog();
        const history2 = this.chatLog.filter((m) => !m.pending && m.text).slice(-13, -1);
        let res;
        try {
          res = await app.chat(a, text2, history2, { group });
        } catch (e) {
          res = { text: "（" + (e.message || "没听清") + "）", acts: [] };
        }
        pend.pending = false;
        pend.text = res.text || "……";
        if (res.note) pend.note = res.note;
        if (this.page === "chat") this._renderChatLog();
      }
      this._chatBusy = false;
      if (this.chatLog.length > 60) this.chatLog.splice(0, this.chatLog.length - 60);
    }
    /** 社区页里的 AI 小镇：连接、帖子列表、开新帖 */
    _townSection() {
      var _a, _b;
      const town = this.app.town;
      if (!town) return "";
      if ((_a = this.app.worldSession) == null ? void 0 : _a.id) return this.worldPanel.renderSession();
      if ((_b = this.app.worldDrafts) == null ? void 0 : _b.view.home) return '<div class="rk-field">世界预览</div><button class="rk-btn" data-s="world-preview-close">回到自己的房间</button>';
      const worlds = this.worldPanel.renderHome();
      const head = '<div class="rk-field">AI 小镇（本机原型）</div><div class="rk-hint" style="margin-top:0">一个帖子就是一个场景。角色进帖子后会自己回帖、在场景里做出反应；你也可以用角色的身份说话。</div>';
      if (!town.online) {
        const needLogin = town.cfg && !town.cfg.legacy && !town.token;
        let login = "";
        if (needLogin) {
          login = '<div class="rk-field">登录小镇</div>';
          if (town.loginAttempt) {
            const link = town.loginAttempt.fallbackUrl;
            if (link) login += `<a class="rk-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">在浏览器打开授权</a> `;
            login += '<button class="rk-btn" data-s="town-login-cancel">取消登录</button><div class="rk-hint">在浏览器完成授权后回到房间。</div>';
          } else {
            login += town.cfg.providers.length ? town.cfg.providers.map((p) => `<button class="rk-btn on" data-town-login="${esc(p.id)}">用 ${esc(p.label)} 登录</button> `).join("") : '<div class="rk-hint">这个小镇还没开放登录。</div>';
            login += '<div class="rk-hint">登录后，你房间里的主角就是你在小镇上的角色。</div>';
          }
        }
        const address = town.fixed ? "" : `<div class="rk-chat-bar"><input class="rk-town-url" type="text" value="${esc(town.url)}"><button class="rk-btn${needLogin ? "" : " on"}" data-s="town-connect">连接</button></div>`;
        return worlds + head + `${address}${login}
        ${town.error ? `<div class="rk-hint">${esc(town.error)}</div>` : needLogin || town.fixed ? "" : '<div class="rk-hint">先在 dsh-room 目录运行 <code>npm run town</code>。</div>'}`;
      }
      const acct = town.account ? `<div class="rk-kv"><span>已登录：<b>${esc(town.account.name || town.account.login || town.account.id)}</b> <small>${esc(town.account.id)}</small></span><a href="#" class="rk-link" data-s="town-logout">退出</a></div>` : "";
      const SORT = { active: "活跃", new: "最新", hot: "最热" }, cur = town.sort || "active";
      const sorts = `<div class="rk-kv"><span>帖子</span><span>${Object.entries(SORT).map(([k, l]) => k === cur ? `<b>${l}</b>` : `<a href="#" class="rk-link" data-town-sort="${k}">${l}</a>`).join(" · ")}</span></div>`;
      const rows = sorts + town.threads.map((t) => `<div class="rk-kv rk-thread"><span><b>${esc(t.title)}</b><small>${t.here.length} 位在场 · ${t.posts} 条回帖${t.likes ? " · ♥ " + t.likes : ""}${t.here.length ? " · " + esc(t.here.map((m) => m.name).join("、")) : ""}</small></span><button class="rk-btn${town.thread && town.thread.id === t.id ? " on" : ""}" data-town-enter="${esc(t.id)}">${town.thread && town.thread.id === t.id ? "在这里" : "进入"}</button></div>`).join("");
      const admin = town.roles().length ? `<button class="rk-btn" data-s="town-admin" style="margin-top:6px">🛡 管理（${esc(town.roles().map((r) => ({ owner: "站长", admin: "管理员", mod: "版主" })[r.role]).join("、"))}）</button>` : "";
      const mem = town.memory(), ms = mem.stats(), open = this._memOpen, L = open ? mem.list() : null;
      const memory = `<div class="rk-field">🧠 ${esc((town.myAgent() || town.self || {}).name || "她")}的记忆 <small>（存在这台电脑上，不上传）</small></div>
      <div class="rk-kv"><span>认识 ${ms.people} 位 · 记了 ${ms.events} 件事</span><span><a href="#" class="rk-link" data-s="mem-toggle">${open ? "收起" : "查看"}</a> · <a href="#" class="rk-link" data-s="mem-export">导出</a> · <a href="#" class="rk-link" data-s="mem-import">导入</a> · <a href="#" class="rk-link" data-s="mem-clear">清空</a></span></div>
      ${open ? L.people.map((p) => `<div class="rk-kv"><span><b>${esc(p.name)}</b> <small>见过 ${p.met} 次${p.impression ? " · " + esc(p.impression) : ""}</small></span><a href="#" class="rk-link" data-mem-forget="${esc(p.id)}">忘掉</a></div>`).join("") + L.events.slice(0, 10).map((e) => `<div class="rk-hint" style="margin:2px 0">「${esc(e.title)}」${esc(e.summary)}</div>`).join("") : ""}`;
      const more = town.nextOffset == null ? "" : '<button class="rk-btn" data-s="town-more">加载更多帖子</button>';
      return worlds + head + acct + rows + more + admin + memory + `<div class="rk-chat-bar" style="margin-top:8px"><input class="rk-town-title" type="text" maxlength="40" placeholder="新帖标题（用当前房间当场景）"><button class="rk-btn" data-s="town-new">开帖</button></div>`;
    }
    /** 帖子页：回帖记录 = 场景里发生的对话；输入框以我的角色身份发言 */
    _renderTown() {
      const town = this.app.town, t = town && town.thread;
      if (!t) {
        this.el.body.innerHTML = '<div class="rk-hint">还没进入任何帖子。去「社区」里选一个。</div>';
        return;
      }
      const u = town.usage(), me = town.myAgent(), manage = town.canManageThread();
      const info = town.threads.find((x) => x.id === t.id), locked = !!(info && info.locked);
      const reporting = this._townReport;
      const keep = this.el.body.querySelector(".rk-town-in"), draft = keep ? keep.value : "", focused = keep && document.activeElement === keep;
      this.el.body.innerHTML = `
      <div class="rk-chat-who"><span class="rk-chat-head"><span><b>${esc(t.title)}</b>${locked ? " 🔒" : ""} ${info && info.owner && info.owner.id === town.me ? t.likes ? "<small>♥ " + t.likes + "</small>" : "" : `<a href="#" class="rk-link rk-like${t.liked ? " on" : ""}" data-town-like="t:${esc(t.id)}" title="给帖子点赞">${t.liked ? "♥" : "♡"}${t.likes ? " " + t.likes : ""}</a>`}</span><span>${manage ? `<button class="rk-btn" data-s="town-lock">${locked ? "解锁" : "锁帖"}</button>` : ""}<button class="rk-btn" data-s="town-leave">回家</button></span></span>
        <small>在场：${(t.here || []).map((m) => esc(m.name) + (manage && m.id !== town.me ? ` <a href="#" class="rk-link" data-town-kick="${esc(m.id)}">请离开</a>` : "")).join("、") || "只有你"}</small></div>
      <label class="rk-check"><input type="checkbox" data-s="town-auto" ${town.auto ? "checked" : ""}>让${esc(me ? me.name : "我的角色")}自己回帖（这小时 ${u.used}/${u.max} 次${town.busy ? " · 正在想…" : ""}）</label>
      <div class="rk-chat-log">${t.posts.length ? t.posts.map((p) => {
        const mine = p.by && p.by.id === town.me;
        const heart = p.pending ? "" : mine ? p.likes ? `<small class="rk-like">♥ ${p.likes}</small>` : "" : `<a href="#" class="rk-link rk-like${p.liked ? " on" : ""}" data-town-like="p:${esc(p.id)}" title="点赞">${p.liked ? "♥" : "♡"}${p.likes ? " " + p.likes : ""}</a>`;
        const flag = heart + (mine ? "" : `<a href="#" class="rk-link rk-flag" data-town-flag="${esc(p.id)}" title="举报">⚑</a>`);
        const pick3 = reporting === p.id ? `<small class="rk-report">举报理由：${town.reasons.map((r) => `<a href="#" class="rk-link" data-town-reason="${esc(r)}">${esc(r)}</a>`).join(" ")} <a href="#" class="rk-link" data-town-reason="">取消</a></small>` : "";
        return `<div class="rk-msg ${mine ? "user" : "bot"}${p.pending ? " pending" : ""}"><span><b>${esc(p.by ? p.by.name : "?")}</b>${p.human ? '<i class="rk-tag">主人代说</i>' : ""}${p.pending ? '<i class="rk-tag">审核中，只有你看得到</i>' : ""}：${esc(p.text)}${(p.acts || []).length ? " <small>[" + esc(p.acts.join(" ")) + "]</small>" : ""}</span>${flag}${pick3}</div>`;
      }).join("") : '<div class="rk-hint">还没人说话。等一会儿角色会自己开口，或者你先说一句。</div>'}</div>
      <div class="rk-chat-bar"><input class="rk-town-in" type="text" maxlength="200" placeholder="以${esc(me ? me.name : "我的角色")}的身份说…"><button class="rk-btn on" data-s="town-say">发送</button></div>
      ${town.error ? `<div class="rk-hint">${esc(town.error)}</div>` : ""}`;
      const log = this.el.body.querySelector(".rk-chat-log");
      log.scrollTop = log.scrollHeight;
      const inp = this.el.body.querySelector(".rk-town-in");
      inp.value = draft;
      if (focused) inp.focus({ preventScroll: true });
    }
    /** 管理页：举报队列、待审回帖；站长 / 管理员还能看权限名单、处理记录，授权和禁言 */
    async _renderTownAdmin() {
      const town = this.app.town, body = this.el.body;
      body.innerHTML = '<div class="rk-hint">加载中…</div>';
      let q;
      try {
        q = await town.adminQueue();
      } catch (e) {
        body.innerHTML = `<div class="rk-hint">${esc(e.message)}</div>`;
        return;
      }
      if (this.page !== "town-admin") return;
      const staff = town.isStaff();
      const item = (x, target, btns) => `<div class="rk-admin-item"><div><b>${esc(x.by ? x.by.name : "?")}</b> <small>${esc(x.by ? x.by.id : "")} · ${{ t: "帖子标题", w: "场次发言" }[x.kind] || "回帖"} · ${esc(x.thread)}${x.human ? " · 主人代说" : ""}</small></div><div>${esc(x.text)}</div>
      <div class="rk-admin-btns">${btns.map(([a, l]) => `<button class="rk-btn" data-town-act="${a}" data-target="${esc(target)}">${l}</button>`).join("")}${staff && x.by ? `<button class="rk-btn" data-town-act="mute" data-target="m:${esc(x.by.id)}" data-days="1">禁言 1 天</button><button class="rk-btn" data-town-act="mute" data-target="m:${esc(x.by.id)}" data-days="7">7 天</button><button class="rk-btn" data-town-act="ban" data-target="m:${esc(x.by.id)}">封号</button>` : ""}</div></div>`;
      const ROLE = { owner: "站长", admin: "管理员", mod: "版主" };
      body.innerHTML = `
      <div class="rk-chat-head"><span>我的身份：${esc(q.roles.map((r) => ROLE[r.role] + (r.scope ? "（" + r.scope + "）" : "")).join("、"))}</span><button class="rk-btn" data-s="town-admin">刷新</button></div>
      <div class="rk-field">举报（${q.reports.length}）</div>
      ${q.reports.map((r) => `<div class="rk-hint" style="margin:6px 0 0">${r.n} 人举报：${esc(r.reasons.join("、"))}${r.notes ? " · " + esc(r.notes) : ""}${r.item.hidden ? " · 已自动隐藏" : ""}</div>` + item(r.item, r.target, [["restore", "恢复并驳回"], ["dismiss", "驳回"], ["hide", "隐藏"], ["delete", "删除"]])).join("") || '<div class="rk-hint">没有待处理的举报</div>'}
      <div class="rk-field">待审核（${q.pending.length}）</div>
      ${q.pending.map((r) => item(r.item, r.target, [["approve", "通过"], ["delete", "删除"]])).join("") || '<div class="rk-hint">没有待审核的发言</div>'}
      ${staff ? `
      <div class="rk-field">权限</div>
      ${q.staff.map((r) => `<div class="rk-kv"><span>${esc(r.name)} <small>${esc(r.member)}</small></span><span>${ROLE[r.role]}${r.scope ? "：" + esc(r.scope) : ""} ${r.role !== "owner" ? `<a href="#" class="rk-link" data-town-act="revoke" data-target="m:${esc(r.member)}" data-role="${r.role}" data-scope="${esc(r.scope)}">撤销</a>` : ""}</span></div>`).join("")}
      <div class="rk-chat-bar"><input class="rk-admin-who" placeholder="成员 id"><select class="rk-admin-role"><option value="mod">版主</option><option value="admin">管理员</option></select><input class="rk-admin-scope" placeholder="帖子 id（版主）"><button class="rk-btn" data-s="town-grant">授权</button></div>
      <div class="rk-chat-bar"><button class="rk-btn" data-s="town-unban">解除禁言 / 封号</button></div>
      <div class="rk-field">处理记录</div>
      ${q.log.map((l) => `<div class="rk-kv"><span>${esc(l.actor)} · ${esc(l.action)} · ${esc(l.target)}</span><small>${new Date(l.t).toLocaleString("zh-CN")}</small></div>`).join("") || '<div class="rk-hint">还没有记录</div>'}` : ""}`;
    }
    async _townAdmin(body) {
      try {
        await this.app.town.adminAct(body);
        this.app.hud.toast("已处理");
      } catch (e) {
        this.app.hud.toast(e.message, 3e3);
      }
      if (this.page === "town-admin") this._renderTownAdmin();
    }
    async _townSay() {
      const inp = this.el.body.querySelector(".rk-town-in"), text2 = inp && inp.value.trim();
      if (!text2) return;
      inp.value = "";
      try {
        await this.app.town.say(text2);
      } catch (e) {
        this.app.hud.toast("没发出去：" + e.message);
      }
    }
    async _townDo(fn) {
      try {
        await fn();
      } catch (e) {
        this.app.hud.toast(e.message, 3e3);
      }
    }
    /** 网页版世界页：内容没变就不重建，保留输入焦点和滚动位置 */
    _renderHub() {
      const body = this.el.body;
      this.hub.rememberForm(body);
      const html = this.hub.render();
      if (this._hubHtml === html && body.dataset.hub === "1") return;
      this._hubHtml = html;
      body.dataset.hub = "1";
      body.innerHTML = html;
      this.hub.afterRender(body);
      if (this.hub.loaded === false && !this._hubLoading) {
        this._hubLoading = true;
        this.hub.load().finally(() => {
          this._hubLoading = false;
        });
      }
    }
    _renderSocial() {
      var _a;
      delete this.el.body.dataset.hub;
      const app = this.app, items = app.ext && app.ext.social || [];
      this.worldPanel.rememberForm();
      const previous = this.el.body.querySelector(".rk-world-say");
      const focused = previous && document.activeElement === previous;
      const experienceOpen = (_a = this.el.body.querySelector(".rk-world-experiences")) == null ? void 0 : _a.open;
      this.el.body.innerHTML = `
      ${items.length ? `<div class="rk-field">在 DSH 里</div>${items.map((it) => `<label class="rk-check rk-opt"><input type="checkbox" data-social="${esc(it.id)}" ${it.on() ? "checked" : ""}><span><b>${esc(it.label)}</b><small>${esc(it.sub || "")}</small></span></label>`).join("")}` : ""}
      <div class="rk-field">这个房间里的角色（${app.agents.size}）</div>
      ${[...app.agents.values()].map((a) => `<div class="rk-kv"><span>${esc(a.name)}</span><span>${esc(a.status ? STATUS_TEXT[a.status.state] || a.status.state : a.activity || "")}</span></div>`).join("")}
      ${this._townSection()}`;
      const input = this.el.body.querySelector(".rk-world-say");
      if (previous && input) {
        input.value = previous.value;
        if (focused) {
          input.focus();
          input.setSelectionRange(previous.selectionStart, previous.selectionEnd);
        }
      }
      if (experienceOpen) {
        const details = this.el.body.querySelector(".rk-world-experiences");
        if (details) details.open = true;
      }
    }
    _renderConn() {
      this._diagAt = performance.now();
      const app = this.app;
      const rows = [
        { name: "运行环境", ok: true, detail: app.ext && app.ext.host || (location.protocol === "file:" ? "本地文件（双击打开）" : "网页 " + location.host) },
        { name: "房间引擎", ok: true, detail: "RoomKit " + VERSION + " · " + app.agents.size + " 个角色 · " + app.world.objects.length + " 件家具" }
      ].concat(app.ext && app.ext.diagnostics && app.ext.diagnostics() || [{ name: "DSH", ok: null, detail: "未接入（独立网页模式）" }]);
      const main = app.mainAgent();
      const st = main && main.status;
      const keep = this.el.body.querySelector(".rk-diag");
      const html = `
      <div class="rk-diag">${rows.map((r) => `<div class="rk-diag-row"><i class="rk-dot" data-ok="${r.ok === true ? 1 : r.ok === false ? 0 : ""}"></i><span>${esc(r.name)}</span><small>${esc(r.detail || "")}</small></div>`).join("")}</div>
      <div class="rk-field">主角当前状态</div>
      <div class="rk-kv"><span>${esc(main ? main.name : "—")}</span><span>${esc(st ? (STATUS_TEXT[st.state] || st.state) + (st.task ? " · " + st.task : "") : "空闲（自己过日子）")}</span></div>
      <div class="rk-field">自测：模拟一次工作状态</div>
      <div class="rk-chips">${Object.keys(STATUS_TEXT).map((k) => `<button data-sim="${k}">${STATUS_TEXT[k]}</button>`).join("")}<button data-sim="">回到空闲</button></div>
      <div class="rk-hint">在 DSH 里给 Agent 发一条消息，主角会依次「思考 → 干活 → 完成」；这里的按钮能在不跑任务的情况下检查联动是否正常。</div>`;
      if (keep && this._connHtml === html) return;
      this._connHtml = html;
      this.el.body.innerHTML = html;
    }
    _renderAbout() {
      this.el.body.innerHTML = `
      <div class="rk-kv"><span>引擎</span><span>RoomKit ${esc(VERSION)}（AGPL-3.0）</span></div>
      <div class="rk-kv"><span>运行于</span><span>${esc(this.app.ext && this.app.ext.host || "独立网页")}</span></div>
      <div class="rk-field">许可证与署名</div>
      <div class="rk-hint" style="margin-top:0">${APPEARANCE_NOTICE}用户导入的内容包沿用各自的许可和署名。</div>
      <div class="rk-field">快捷键</div>
      <div class="rk-hint" style="margin-top:0">B 布置 · F 复位视角 · M 地图 · C 聊天 · 1–9 换房间 · Esc 关闭<br>剧情中：空格 / 回车 下一句，数字键选选项</div>`;
    }
    /* ───────── 门：通往哪个房间 → 走过去 / 改目的地 ───────── */
    doorCard(o) {
      const app = this.app, def = app.world.def(o), home = app.home;
      const to = o.state && o.state.to, room = to && home.room(to);
      const rooms = home.ordered().filter((r) => r.id !== app.world.scene.id);
      const html = `<div class="rk-door">
      ${room ? `<div class="rk-kv"><span>通往</span><span>${esc(room.floor + " · " + room.name)}</span></div>
        <div class="rk-row"><button class="rk-btn on" data-door-go="${esc(o.id)}">${home.follow && app.mainAgent() ? "一起过去 →" : "过去 →"}</button><button class="rk-btn" data-door-toggle="${esc(o.id)}">${o.state && o.state.open ? "关门" : "开门"}</button></div>` : `<div class="rk-sub">${to ? "通往的房间已经不在家里了" : "这扇门还没通往别的房间"}</div><div class="rk-row"><button class="rk-btn" data-door-toggle="${esc(o.id)}">${o.state && o.state.open ? "关门" : "开门"}</button></div>`}
      ${rooms.length ? `<div class="rk-field">${room ? "改成通往" : "通往"}</div><div class="rk-chips">${rooms.map((r) => `<button data-door-link="${esc(o.id)}" data-room-id="${esc(r.id)}" class="${r.id === to ? "on" : ""}">${esc(r.floor + " " + r.name)}</button>`).join("")}${to ? `<button data-door-link="${esc(o.id)}" data-room-id="">不通</button>` : ""}</div>` : '<div class="rk-hint">家里只有这一个房间——在 🗺 地图里添加房间后就能连起来。</div>'}
    </div>`;
      app.hud.openDrawer({ title: def ? def.name : "门", sub: "", html, anchor: { id: o.id } });
    }
    /* ───────── 点击 ───────── */
    _onClick(e) {
      const app = this.app;
      if (this.menu && !e.target.closest(".rk-menu") && !e.target.closest("[data-s=rooms],[data-s=more],[data-room-menu]")) this.closeMenu();
      const t = e.target.closest && e.target.closest("[data-s],[data-page],[data-story],[data-sim],[data-social],[data-town-enter],[data-town-login],[data-mem-forget],[data-town-like],[data-town-sort],[data-town-flag],[data-town-reason],[data-town-kick],[data-town-act],[data-room],[data-room-menu],[data-menu],[data-map-open],[data-map-add],[data-map-tpl],[data-map-new],[data-add-floor],[data-door-go],[data-door-link],[data-door-toggle]");
      if (!t || !app.root.contains(t)) return;
      if (t.hasAttribute("data-menu")) {
        this._onMenu(t);
        return;
      }
      if (t.hasAttribute("data-room-menu")) {
        e.stopPropagation();
        this.openMenu("room", t, t.getAttribute("data-room-menu"));
        return;
      }
      if (t.hasAttribute("data-map-add")) {
        e.stopPropagation();
        app.home.add(app.storage.load(t.getAttribute("data-map-add")), this._addFloor);
        this.sync();
        this.render();
        return;
      }
      if (t.hasAttribute("data-page")) {
        this.open(t.getAttribute("data-page"));
        return;
      }
      if (t.hasAttribute("data-room")) {
        const id = t.getAttribute("data-room");
        this.closeMenu();
        if (this.page === "map" || this.page === "story") this.close();
        if (id !== app.world.scene.id) app.goRoom(id);
        return;
      }
      if (t.hasAttribute("data-story")) {
        const s = app.stories.all().find((x) => x.id === t.getAttribute("data-story"));
        if (s && !app.stories.active) {
          this.close();
          this.pendingStory = null;
          app.stories.run(s);
        }
        return;
      }
      if (t.hasAttribute("data-town-flag")) {
        e.preventDefault();
        this._townReport = this._townReport === t.getAttribute("data-town-flag") ? null : t.getAttribute("data-town-flag");
        this.render();
        return;
      }
      if (t.hasAttribute("data-town-reason")) {
        e.preventDefault();
        const id = this._townReport, reason = t.getAttribute("data-town-reason");
        this._townReport = null;
        this.render();
        if (id && reason) app.town.report("p:" + id, reason).then(() => app.hud.toast("已举报，谢谢")).catch((x) => app.hud.toast(x.message, 3e3));
        return;
      }
      if (t.hasAttribute("data-town-kick")) {
        e.preventDefault();
        this._townDo(() => app.town.kick(t.getAttribute("data-town-kick")));
        return;
      }
      if (t.hasAttribute("data-town-act")) {
        e.preventDefault();
        this._townAdmin({ action: t.getAttribute("data-town-act"), target: t.getAttribute("data-target"), days: t.getAttribute("data-days") || void 0, role: t.getAttribute("data-role") || void 0, scope: t.getAttribute("data-scope") || void 0 });
        return;
      }
      if (t.hasAttribute("data-town-like")) {
        e.preventDefault();
        this._townDo(() => app.town.like(t.getAttribute("data-town-like")));
        return;
      }
      if (t.hasAttribute("data-town-sort")) {
        e.preventDefault();
        this._townDo(() => app.town.sortBy(t.getAttribute("data-town-sort")));
        return;
      }
      if (t.hasAttribute("data-mem-forget")) {
        e.preventDefault();
        app.town.memory().forget(t.getAttribute("data-mem-forget"));
        this.render();
        return;
      }
      if (t.hasAttribute("data-town-login")) {
        this._townDo(() => app.town.login(t.getAttribute("data-town-login")));
        return;
      }
      if (t.hasAttribute("data-town-enter")) {
        const id = t.getAttribute("data-town-enter");
        if (!(app.town.thread && app.town.thread.id === id)) this._townDo(async () => {
          await app.town.enter(id);
          this.open("town");
        });
        else this.open("town");
        return;
      }
      if (t.hasAttribute("data-sim")) {
        const v = t.getAttribute("data-sim");
        app.setWorkStatus(v ? { state: v, task: v === "working" ? "模拟任务：整理房间" : null } : null);
        this._diagAt = 0;
        return;
      }
      if (t.hasAttribute("data-social")) {
        const it = (app.ext && app.ext.social || []).find((x) => x.id === t.getAttribute("data-social"));
        if (it) {
          it.toggle();
          setTimeout(() => {
            if (this.page === "social") this.render();
          }, 50);
        }
        return;
      }
      if (t.hasAttribute("data-door-go")) {
        const o = app.world.byId.get(t.getAttribute("data-door-go"));
        if (o) app.activate(o);
        return;
      }
      if (t.hasAttribute("data-door-toggle")) {
        const o = app.world.byId.get(t.getAttribute("data-door-toggle"));
        if (o) {
          app.world.apply({ t: "state", id: o.id, patch: { open: !(o.state && o.state.open) } });
          this.doorCard(o);
        }
        return;
      }
      if (t.hasAttribute("data-door-link")) {
        const o = app.world.byId.get(t.getAttribute("data-door-link")), rid = t.getAttribute("data-room-id");
        if (!o) return;
        app.world.apply({ t: "state", id: o.id, patch: { to: rid || null } });
        if (rid) app.home.linkBack(rid, app.world.scene.id);
        this.doorCard(o);
        return;
      }
      if (t.hasAttribute("data-add-floor")) {
        this._addFloor = t.getAttribute("data-add-floor");
        this.render();
        return;
      }
      if (t.hasAttribute("data-map-open")) {
        this.close();
        app.goRoom(t.getAttribute("data-map-open"));
        return;
      }
      if (t.hasAttribute("data-map-tpl")) {
        const [pid, sid] = t.getAttribute("data-map-tpl").split("|");
        const p = app.packs.find((x) => x.id === pid), tp = p && (p.scenes || []).find((s) => s.id === sid);
        if (tp) {
          const s = clone(tp);
          s.template = tp.id;
          s.id = uid("room");
          this._newRoom(s);
        }
        return;
      }
      if (t.hasAttribute("data-map-new")) {
        this._newRoom(blankScene(t.getAttribute("data-map-new") === "open"));
        return;
      }
      const action = t.getAttribute("data-s");
      if (action == null ? void 0 : action.startsWith("world-")) {
        this._townDo(() => this.worldPanel.action(action.slice(6), t));
        return;
      }
      if (action == null ? void 0 : action.startsWith("hub-")) {
        e.preventDefault();
        this._townDo(() => this.hub.action(action.slice(4), t));
        return;
      }
      switch (action) {
        case "rooms":
          this.openMenu("rooms", t);
          return;
        case "more":
          this.openMenu("more", t);
          return;
        case "time": {
          const i = TIME_CYCLE.indexOf(app.world.scene.env.period);
          app.command({ op: "env.set", period: TIME_CYCLE[(i + 1) % TIME_CYCLE.length] });
          break;
        }
        case "weather": {
          const i = WEATHER_CYCLE.indexOf(app.world.scene.env.weather);
          app.command({ op: "env.set", weather: WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length] });
          break;
        }
        case "conn":
          this.open(this.hub ? "social" : "conn");
          break;
        case "close":
          this.close();
          break;
        case "chat-send":
          this._sendChat();
          break;
        case "town-connect": {
          const u = this.el.body.querySelector(".rk-town-url");
          this._townDo(() => app.town.connect(u && u.value.trim()));
          return;
        }
        case "town-login-cancel":
          app.town.cancelLogin();
          return;
        case "town-new": {
          const i = this.el.body.querySelector(".rk-town-title");
          this._townDo(async () => {
            await app.town.create(i && i.value.trim());
            this.open("town");
          });
          return;
        }
        case "town-leave":
          this._townDo(async () => {
            await app.town.leave();
            this.open("social");
          });
          return;
        case "town-say":
          this._townSay();
          return;
        case "mem-toggle":
          e.preventDefault();
          this._memOpen = !this._memOpen;
          this.render();
          return;
        case "mem-clear":
          e.preventDefault();
          if (confirm("清空她在小镇上的全部记忆？")) {
            app.town.memory().clear();
            this.render();
          }
          return;
        case "mem-export": {
          e.preventDefault();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([app.town.memory().export()], { type: "application/json" }));
          a.download = "memory.json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
          return;
        }
        case "mem-import": {
          e.preventDefault();
          const inp = document.createElement("input");
          inp.type = "file";
          inp.accept = ".json,application/json";
          inp.onchange = async () => {
            try {
              app.town.memory().import(await inp.files[0].text());
              app.hud.toast("记忆已导入");
              this.render();
            } catch (x) {
              app.hud.toast("导入失败：" + x.message, 3e3);
            }
          };
          inp.click();
          return;
        }
        case "town-logout":
          e.preventDefault();
          this._townDo(() => app.town.logout());
          return;
        case "town-admin":
          this.page === "town-admin" ? this._renderTownAdmin() : this.open("town-admin");
          return;
        case "town-more":
          this._townDo(() => app.town.sortBy(app.town.sort, true));
          return;
        case "town-lock": {
          const info = app.town.threads.find((x) => app.town.thread && x.id === app.town.thread.id);
          this._townDo(() => app.town.lock(!(info && info.locked)));
          return;
        }
        case "town-grant": {
          const v = (c) => (this.el.body.querySelector(c) || {}).value || "";
          this._townAdmin({ action: "grant", target: "m:" + v(".rk-admin-who").trim(), role: v(".rk-admin-role"), scope: v(".rk-admin-scope").trim() });
          return;
        }
        case "town-unban": {
          const v = (this.el.body.querySelector(".rk-admin-who") || {}).value || "";
          this._townAdmin({ action: "unban", target: "m:" + v.trim() });
          return;
        }
        case "town-auto":
          app.town.setAuto(!!t.checked);
          return;
        case "chat-group":
          this.chatGroup = !this.chatGroup;
          this._renderChat();
          break;
        case "story-go": {
          const s = this.pendingStory;
          this.pendingStory = null;
          if (s) app.stories.run(s);
          break;
        }
        case "story-later":
          if (this.pendingStory) this._dismissed.add(this.pendingStory.id);
          this.pendingStory = null;
          break;
        // 这次打开不再提示；下次进房间再提醒
        case "story-reset":
          app.stories.reset();
          this.render();
          app.hud.toast("剧情进度已重置");
          break;
        case "auto-story":
          app.storage.pref("autoStory", !!t.checked);
          break;
        case "coach-ok":
          app.storage.pref("coached", true);
          this.el.coach.classList.remove("on");
          break;
      }
      this.sync();
    }
    /** 新房间：门先连好（新房间的门通回来，当前房间空着的门通过去），存档、加进家（选中的楼层），再走过去 */
    _newRoom(s) {
      const app = this.app, from = app.world.scene.id;
      s.format = "roomkit.scene";
      if (app.home.follow) s.agents = (s.agents || []).filter((a) => a.brain !== "pet");
      const portal = (o) => {
        const d = o.wall && app.catalog.get(o.def);
        return d && d.portal;
      };
      (s.objects || []).forEach((o) => {
        if (portal(o) && o.state && o.state.to) delete o.state.to;
      });
      const door = (s.objects || []).find(portal);
      if (door && app.home.has(from)) door.state = Object.assign({}, door.state, { to: from });
      app.storage.save(s, { last: false });
      app.home.add(s, this._addFloor);
      if (door && app.home.has(from)) app.home.linkBack(from, s.id);
      this.close();
      app.goRoom(s.id).then(() => app.hud.toast("新房间：" + s.name + (door ? "，门已经和上一个房间连上了" : ""), 3200));
    }
  };
  function blankScene(open) {
    return {
      format: "roomkit.scene",
      v: 2,
      id: uid("room"),
      name: open ? "露天广场" : "新房间",
      room: open ? { w: 16, h: 12, mats: [{ kind: "grass", color: "#9bd17a" }, { kind: "stone", color: "#d9d2c3" }], walls: { left: false, right: false, height: 300 }, slab: 22 } : { w: 8, h: 6, walls: { left: true, right: true, height: 300 } },
      objects: open ? [] : [{ id: uid("o"), def: "door", wall: "right", at: 6.5, z: 0 }, { id: uid("o"), def: "window", wall: "left", at: 2.5, z: 100 }],
      agents: []
    };
  }
  function drawSceneThumb(c, s) {
    const ctx = c.getContext("2d");
    if (!ctx || !s || !s.room) return;
    const r = s.room, w = r.w || 8, h = r.h || 6, mats = r.mats || [{ color: "#e3a46a" }];
    const k = Math.min((c.width - 16) / (w + h), (c.height - 30) / ((w + h) / 2));
    const oy = 26, cx = c.width / 2 - (w - h) * k / 2;
    const Q = (x, y) => [cx + (x - y) * k, oy + (x + y) * k / 2];
    ctx.clearRect(0, 0, c.width, c.height);
    const walls = r.walls || {};
    const wall = (a, b, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b[0], b[1] - 18);
      ctx.lineTo(a[0], a[1] - 18);
      ctx.fill();
    };
    if (walls.left !== false) wall(Q(0, 0), Q(0, h), walls.color || "#f1e6d4");
    if (walls.right !== false) wall(Q(0, 0), Q(w, 0), shade2(walls.color || "#f1e6d4"));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = r.cells && r.cells[y] ? r.cells[y][x] : "a";
      if (ch === ".") continue;
      const m = mats[Math.max(0, "abcd".indexOf(ch))] || mats[0];
      ctx.fillStyle = m.color || "#e3a46a";
      const [a, b, d, e] = [Q(x, y), Q(x + 1, y), Q(x + 1, y + 1), Q(x, y + 1)];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(60,70,100,.45)";
    for (const o of s.objects || []) {
      if (o.wall || o.x == null) continue;
      const p = Q(o.x + 0.5, o.y + 0.5);
      ctx.fillRect(p[0] - k * 0.4, p[1] - k * 0.5, k * 0.8, k * 0.5);
    }
    for (const a of s.agents || []) {
      if (a.x == null) continue;
      const p = Q(a.x, a.y);
      ctx.fillStyle = a.look && a.look.body || "#5b8def";
      ctx.beginPath();
      ctx.arc(p[0], p[1] - 4, Math.max(2.5, k * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function shade2(hex) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16) || 0;
    const f = (v) => Math.round(v * 0.86);
    return "rgb(" + f(n >> 16 & 255) + "," + f(n >> 8 & 255) + "," + f(n & 255) + ")";
  }

  // web/roomkit/desk.js
  var Desk = class {
    constructor(app) {
      this.app = app;
      this.host = app.ext && app.ext.desk || null;
      this.solid = null;
      this.dragging = false;
      const root = app.root;
      root.classList.add("rk-desk");
      root.insertAdjacentHTML("beforeend", '<button class="rk-desk-btn" title="菜单（也可以在房间上点右键）">⋯</button>');
      this.btn = root.querySelector(".rk-desk-btn");
      this.btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMenu(e.clientX, e.clientY);
      });
      this._onMove = (e) => this._track(e.clientX, e.clientY);
      document.addEventListener("mousemove", this._onMove, true);
      document.addEventListener("mouseleave", () => {
        if (!this.dragging) this._setSolid(false);
        root.classList.remove("rk-desk-hover");
      });
      app.on("scene:open", () => this.reportAspect());
      this.reportAspect();
    }
    /** 房间的高宽比（带一点给气泡留的余量） */
    reportAspect() {
      if (!this.host || !this.host.aspect) return;
      const b = this.app.renderer.roomBounds();
      this.host.aspect(Math.round((b.b - b.t + 24) / (b.r - b.l) * 1e3) / 1e3);
    }
    /** 鼠标下有没有东西：DOM 浮层（卡片、对话框、按钮）或房间本身（地板、墙、家具、角色） */
    isSolidAt(x, y) {
      const app = this.app, el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (el !== app.canvas) return app.root.contains(el) && el !== app.root;
      const r = app.canvas.getBoundingClientRect();
      return !!app.renderer.pick(x - r.left, y - r.top);
    }
    _track(x, y) {
      if (this.dragging) return;
      const solid = this.isSolidAt(x, y);
      this._setSolid(solid);
      if (solid) {
        this.app.root.classList.add("rk-desk-hover");
        clearTimeout(this._hoverT);
        this._hoverT = setTimeout(() => this.app.root.classList.remove("rk-desk-hover"), 2500);
      }
    }
    _setSolid(v) {
      if (v === this.solid) return;
      this.solid = v;
      if (this.host && this.host.setSolid) this.host.setSolid(v);
    }
    /* ───────── 输入（app._bindInput 在桌面模式下转到这里） ───────── */
    dragStart() {
      if (this.dragging) return;
      this.dragging = true;
      this._setSolid(true);
      if (this.host && this.host.drag) this.host.drag("start");
    }
    dragMove() {
      if (this.dragging && this.host && this.host.drag) this.host.drag("move");
    }
    dragEnd() {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.host && this.host.drag) this.host.drag("end");
    }
    wheel(e) {
      if (!this.host || !this.host.scale) return;
      const now = performance.now();
      if (now - (this._wheelAt || 0) < 60) return;
      this._wheelAt = now;
      this.host.scale(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }
    /* ───────── 菜单 ───────── */
    menuSpec() {
      const app = this.app, env = app.world.scene.env, cur = app.world.scene.id;
      return {
        rooms: app.home.ordered().map((r) => ({ id: r.id, label: r.floor + " · " + r.name, on: r.id === cur })),
        periods: [{ id: "", label: "跟随真实时间", on: !env.period }].concat(PERIODS.map((p) => ({ id: p.id, label: p.label, on: env.period === p.id }))),
        weathers: Object.keys(WEATHERS).map((k) => ({ id: k, label: WEATHERS[k].label, on: env.weather === k }))
      };
    }
    async openMenu(x, y) {
      const spec = this.menuSpec();
      if (this.host && this.host.menu) {
        this.run(await this.host.menu(spec));
        return;
      }
      this._domMenu(spec, x, y);
    }
    /** 宿主菜单返回的动作：room:<id> / time:<id> / weather:<id> / full；其余是宿主自己的（大小、置顶、退出） */
    run(action) {
      if (!action) return;
      const app = this.app, i = action.indexOf(":"), kind = i < 0 ? action : action.slice(0, i), arg = i < 0 ? "" : action.slice(i + 1);
      if (kind === "room") app.goRoom(arg);
      else if (kind === "time") app.command({ op: "env.set", period: arg || null });
      else if (kind === "weather") app.command({ op: "env.set", weather: arg });
      else if (kind === "full" && app.ext.openFull) app.ext.openFull();
    }
    /** 没有宿主（浏览器里打开 ?desk=1）：页面里的简易菜单 */
    _domMenu(spec, x, y) {
      const root = this.app.root;
      let m = root.querySelector(".rk-desk-menu");
      if (!m) {
        m = document.createElement("div");
        m.className = "rk-desk-menu";
        root.appendChild(m);
        m.addEventListener("click", (e) => {
          const b = e.target.closest("[data-a]");
          if (b) this.run(b.getAttribute("data-a"));
          m.classList.remove("on");
        });
      }
      const item = (a, label, on) => `<button data-a="${esc(a)}" class="${on ? "on" : ""}">${esc(label)}</button>`;
      m.innerHTML = spec.rooms.map((r2) => item("room:" + r2.id, r2.label, r2.on)).join("") + "<hr>" + spec.weathers.map((w) => item("weather:" + w.id, w.label, w.on)).join("") + (this.app.ext.openFull ? "<hr>" + item("full", "打开完整房间") : "");
      const r = root.getBoundingClientRect();
      m.style.left = Math.min(x - r.left, r.width - 150) + "px";
      m.style.top = Math.min(y - r.top, r.height - 40) + "px";
      m.classList.add("on");
    }
    dispose() {
      document.removeEventListener("mousemove", this._onMove, true);
      clearTimeout(this._hoverT);
    }
  };

  // web/roomkit/editor.js
  var MAT_KINDS = [["wood", "木地板"], ["tile", "瓷砖"], ["carpet", "地毯"], ["stone", "石板"], ["grass", "草地"], ["plain", "纯色"]];
  var PATTERNS = [["plain", "纯色"], ["stripes", "竖条纹"], ["dots", "波点"], ["bricks", "砖墙"]];
  var AGENT_NAMES = ["小蓝", "泡泡", "团子", "小鲸", "阿肥", "米粒", "豆豆", "浪花"];
  var HATS = [["", "无"], ["maid", "女仆头饰"], ["bow", "蝴蝶结"], ["cap", "小帽子"]];
  var BRAINS = [["auto", "自主生活"], ["pet", "宠物（跟随工作状态）"], ["manual", "只听指令"]];
  var PRESETS = [
    { name: "奶油卧室", walls: { color: "#f6ead6", wainscot: "#8fb0c9", trim: "#ffffff", pattern: "plain" }, mat: { kind: "wood", color: "#e3a46a" } },
    { name: "薄荷客厅", walls: { color: "#e3f2ea", wainscot: "#7fb59a", trim: "#ffffff", pattern: "stripes" }, mat: { kind: "wood", color: "#d9a575" } },
    { name: "樱花小屋", walls: { color: "#fbe6ea", wainscot: "#e9a3b4", trim: "#fffaf6", pattern: "dots" }, mat: { kind: "carpet", color: "#f3d7c9" } },
    { name: "深海书房", walls: { color: "#d7e1f2", wainscot: "#4f6b9a", trim: "#f4f7ff", pattern: "plain" }, mat: { kind: "tile", color: "#c9d3e3" } },
    { name: "暖阳厨房", walls: { color: "#fbf1e1", wainscot: "#e9b48a", trim: "#ffffff", pattern: "dots" }, mat: { kind: "tile", color: "#f1e6d2" } },
    { name: "砖墙小院", walls: { color: "#e9c4a6", wainscot: "#b98a6a", trim: "#f6efe4", pattern: "bricks" }, mat: { kind: "grass", color: "#9bd17a" } }
  ];
  var Editor = class {
    constructor(app) {
      this.app = app;
      this.undo = [];
      this.redo = [];
      this.tool = null;
      this.ghost = null;
      this.drag = null;
      this.sel = null;
      this.cat = null;
      this.tab = "furn";
      this.brushMat = 0;
      this._built = false;
    }
    /* ───────── 进出 ───────── */
    enter() {
      if (!this._built) this._build();
      this.app.root.classList.add("rk-edit");
      this.app.renderer.overlay = (ctx, t) => this._overlay(ctx, t);
      this.refresh();
      this.app.hud.toast("布置模式：点家具库添加，拖动摆位，R 旋转，Del 删除");
    }
    exit() {
      this.cancelTool();
      this.select(null);
      this.app.root.classList.remove("rk-edit");
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
      if (!r) return this.app.hud.toast("没有可撤销的了");
      if (r.load) {
        this.redo.push({ load: this.app.world.toJSON() });
        this.app.loadScene(r.load, { keepHistory: true });
      } else {
        this.app.world.apply(r.inv);
        this.redo.push(r);
      }
      this.select(null);
      this.refresh();
    }
    doRedo() {
      const r = this.redo.pop();
      if (!r) return this.app.hud.toast("没有可重做的了");
      if (r.load) {
        this.undo.push({ load: this.app.world.toJSON() });
        this.app.loadScene(r.load, { keepHistory: true });
      } else {
        r.inv = this.app.world.apply(r.op);
        this.undo.push(r);
      }
      this.refresh();
    }
    pushLoad(prevScene) {
      this.undo.push({ load: prevScene });
      this.redo.length = 0;
    }
    /* ───────── 工具 ───────── */
    startPlace(defId) {
      const def = this.app.world.catalog.get(defId);
      if (!def) return;
      if (this.tool && this.tool.kind === "place" && this.tool.defId === defId) {
        this.cancelTool();
        return;
      }
      this.select(null);
      this.tool = { kind: "place", defId, rot: 0 };
      this.ghost = null;
      this._syncItems();
      this.app.hud.toast(def.mount === "wall" ? "移到墙上点击挂上 · Esc 结束" : "点击地面放下 · R 旋转 · Esc 结束");
    }
    startPaint(mat) {
      this.select(null);
      this.tool = { kind: "paint", mat };
      this._syncRoomPane();
      this.app.hud.toast(mat < 0 ? "在地面上拖动：挖空格子" : "在地面上拖动：刷地面材质");
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
        if (this.tool.kind === "paint") {
          this._paintAt(sx, sy, true);
          this._painting = true;
        }
        return true;
      }
      const hit = R.pick(sx, sy);
      if (hit && hit.kind === "obj") {
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
      if (hit && hit.kind === "agent") {
        this.select(null);
        this.drag = { agent: hit.agent, sx, sy, moved: false };
        return true;
      }
      this.select(null);
      return false;
    }
    onMove(sx, sy, down) {
      const app = this.app, R = app.renderer;
      if (this.tool && this.tool.kind === "place") {
        this._ghostAt(sx, sy);
        return;
      }
      if (this.tool && this.tool.kind === "paint") {
        this._hoverCell = this._cellAt(sx, sy);
        if (down && this._painting) this._paintAt(sx, sy);
        return;
      }
      const d = this.drag;
      if (!d || !down) return;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
      d.moved = true;
      if (d.agent) {
        const w = R.screenToWorld(sx, sy), t = app.iso.toTile(w.x, w.y);
        d.at = t;
        return;
      }
      R.hidden.add(d.id);
      const o = app.world.byId.get(d.id);
      if (!o) {
        this.drag = null;
        return;
      }
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
      if (this.tool && this.tool.kind === "place") {
        this._ghostAt(sx, sy);
        const g2 = this.ghost;
        if (g2 && g2.ok) {
          const obj = g2.wall ? { def: g2.defId, wall: g2.wall, at: g2.at, z: g2.z } : { def: g2.defId, x: g2.x, y: g2.y, rot: g2.rot };
          const def = app.world.catalog.get(g2.defId);
          obj.state = clone(def.states);
          this.exec({ t: "add", obj });
          app.sfx("place");
        } else if (g2) {
          app.hud.toast(g2.reason || "这里放不下");
          app.sfx("nope");
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
          if (p) {
            d.agent.cancel();
            d.agent.x = p.x;
            d.agent.y = p.y;
            this.exec({ t: "agent.set", id: d.agent.id, patch: { x: p.x, y: p.y } });
          }
        } else {
          app.hud.openCard(d.agent);
        }
        return;
      }
      const g = this.ghost;
      this.ghost = null;
      if (!d.moved || !g) {
        this._renderSelBar();
        return;
      }
      if (!g.ok) {
        app.hud.toast(g.reason || "这里放不下");
        app.sfx("nope");
        this._renderSelBar();
        return;
      }
      const patch = g.wall ? { wall: g.wall, at: g.at, z: g.z } : { x: g.x, y: g.y };
      this.exec({ t: "set", id: d.id, patch });
      app.sfx("place");
    }
    onKey(e) {
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      if (mod && (k === "z" || k === "Z")) {
        e.preventDefault();
        e.shiftKey ? this.doRedo() : this.doUndo();
        return true;
      }
      if (mod && (k === "y" || k === "Y")) {
        e.preventDefault();
        this.doRedo();
        return true;
      }
      if (mod && (k === "d" || k === "D")) {
        e.preventDefault();
        this.duplicate();
        return true;
      }
      if (k === "Escape") {
        if (this.tool) this.cancelTool();
        else this.select(null);
        return true;
      }
      if (k === "r" || k === "R") {
        this.rotate();
        return true;
      }
      if (k === "Delete" || k === "Backspace") {
        if (this.sel) {
          e.preventDefault();
          this.remove();
        }
        return true;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k] && this.sel) {
        e.preventDefault();
        this.nudge(arrows[k][0], arrows[k][1]);
        return true;
      }
      return false;
    }
    /* ───────── 选中物操作 ───────── */
    rotate() {
      const app = this.app;
      if (this.tool && this.tool.kind === "place") {
        const def2 = app.world.catalog.get(this.tool.defId);
        this.tool.rot = (this.tool.rot + 1) % def2.rots;
        if (this._lastPt) this._ghostAt(this._lastPt[0], this._lastPt[1]);
        return;
      }
      const o = app.world.byId.get(this.sel);
      if (!o || o.wall) return;
      const def = app.world.def(o);
      if (def.rots < 2) return;
      for (let i = 1; i < def.rots; i++) {
        const rot = (o.rot + i) % def.rots;
        if (app.world.canPlace(o.def, o.x, o.y, rot, o.id).ok) {
          this.exec({ t: "set", id: o.id, patch: { rot } });
          app.sfx("click");
          return;
        }
      }
      app.hud.toast("转不开：旁边太挤了");
    }
    duplicate() {
      const app = this.app, o = app.world.byId.get(this.sel);
      if (!o) return;
      const c = clone(o);
      c.id = uid("o");
      if (o.wall) {
        const def = app.world.def(o), len = app.world.wallLen(o.wall);
        for (const d of [1, -1, 2, -2, 3, -3]) {
          const at = o.at + d * def.wsize[0];
          if (at - def.wsize[0] / 2 >= 0 && at + def.wsize[0] / 2 <= len && app.world.canPlaceWall(o.def, o.wall, at, app.world.wallZ(o), null).ok) {
            c.at = at;
            this.exec({ t: "add", obj: c });
            this.select(c.id);
            return;
          }
        }
      } else {
        const spot = app.findFreeSpot(o.def, o.rot, o.x, o.y);
        if (spot) {
          c.x = spot.x;
          c.y = spot.y;
          this.exec({ t: "add", obj: c });
          this.select(c.id);
          return;
        }
      }
      app.hud.toast("没有空位复制了");
    }
    remove() {
      if (!this.sel) return;
      this.exec({ t: "remove", id: this.sel });
      this.select(null);
      this.app.sfx("remove");
    }
    nudge(dx, dy) {
      const app = this.app, o = app.world.byId.get(this.sel);
      if (!o) return;
      if (o.wall) {
        const def = app.world.def(o), at = o.at + (dx || dy) * 0.25;
        if (app.world.canPlaceWall(o.def, o.wall, at, app.world.wallZ(o), o.id).ok) this.exec({ t: "set", id: o.id, patch: { at } });
        return;
      }
      if (app.world.canPlace(o.def, o.x + dx, o.y + dy, o.rot, o.id).ok) this.exec({ t: "set", id: o.id, patch: { x: o.x + dx, y: o.y + dy } });
    }
    recolor() {
      const app = this.app, o = app.world.byId.get(this.sel);
      if (!o) return;
      const def = app.world.def(o);
      if (def.variants && def.variants.length) {
        const i = (o.variant == null ? 0 : o.variant + 1) % (def.variants.length + 1);
        this.exec({ t: "set", id: o.id, patch: { variant: i === def.variants.length ? void 0 : i, colors: i === def.variants.length ? void 0 : clone(def.variants[i]) } });
        return;
      }
      const inp = this.el.color;
      const before = clone(o.colors);
      inp.value = paletteOf(def, o)("main");
      inp.oninput = () => app.world.apply({ t: "set", id: o.id, patch: { colors: Object.assign({}, o.colors, { main: inp.value }) } }, { silent: true });
      inp.onchange = () => {
        if (this.exec({ t: "set", id: o.id, patch: { colors: Object.assign({}, o.colors, { main: inp.value }) } })) {
          this.undo[this.undo.length - 1].inv = { t: "set", id: o.id, patch: { colors: before } };
        }
      };
      inp.click();
    }
    toggleState() {
      const app = this.app, o = app.world.byId.get(this.sel);
      if (!o) return;
      const def = app.world.def(o), key2 = Object.keys(def.states).find((k) => typeof def.states[k] === "boolean");
      if (!key2) return app.hud.toast("它没有开关");
      app.world.apply({ t: "state", id: o.id, patch: { [key2]: !(o.state && o.state[key2]) } });
      app.sfx("click");
    }
    /* ───────── 幽灵与涂刷 ───────── */
    _ghostAt(sx, sy) {
      this._lastPt = [sx, sy];
      const app = this.app, R = app.renderer, def = app.world.catalog.get(this.tool.defId);
      if (!def) return;
      if (def.mount === "wall") {
        const wa = R.wallAt(sx, sy, true);
        if (!wa) {
          this.ghost = null;
          return;
        }
        const len = app.world.wallLen(wa.side);
        const at = clamp(Math.round(wa.u * 4) / 4, def.wsize[0] / 2, Math.max(def.wsize[0] / 2, len - def.wsize[0] / 2));
        const z = clamp(def.wz, 0, Math.max(0, app.world.room.walls.height - def.wsize[1]));
        const ok2 = app.world.canPlaceWall(def.id, wa.side, at, z, null);
        this.ghost = { defId: def.id, wall: wa.side, at, z, ok: ok2.ok, reason: ok2.reason };
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
      const rows = r.cells ? r.cells.slice() : Array.from({ length: r.h }, () => "a".repeat(r.w));
      const ch = mat < 0 ? "." : String.fromCharCode(97 + mat);
      if (rows[c.cy][c.cx] === ch) return;
      if (mat < 0) {
        const blocked = app.world.objects.some((o) => {
          if (o.wall) return false;
          const f = app.world.footprint(o);
          return f && c.cx >= f.x0 && c.cx < f.x1 && c.cy >= f.y0 && c.cy < f.y1;
        });
        if (blocked) {
          if (first) app.hud.toast("格子上有家具，先挪开");
          return;
        }
      }
      rows[c.cy] = rows[c.cy].slice(0, c.cx) + ch + rows[c.cy].slice(c.cx + 1);
      this.exec({ t: "room", patch: { cells: rows } });
    }
    /* ───────── 编辑层绘制（世界坐标） ───────── */
    _overlay(ctx, t) {
      const app = this.app, iso = app.iso, world = app.world;
      const diamond = (x0, y0, x1, y1, fill, stroke) => {
        const pts = iso.diamond(x0, y0, x1, y1, 1);
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.closePath();
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      };
      const so = this.sel && world.byId.get(this.sel);
      if (so && !so.wall && !(this.drag && this.drag.moved)) {
        const f = world.footprint(so);
        diamond(f.x0, f.y0, f.x1, f.y1, "rgba(90,160,255,.16)", "rgba(90,160,255,.9)");
        const def = world.def(so);
        for (const s of def.slots) {
          const sp = world.slotPose(so, s), p = iso.toWorld(sp.x, sp.y, 1);
          ctx.fillStyle = "rgba(255,255,255,.95)";
          ctx.strokeStyle = "rgba(77,124,243,.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          const q = iso.toWorld(sp.x + sp.face[0] * 0.35, sp.y + sp.face[1] * 0.35, 1);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
      const g = this.ghost;
      if (g) {
        const def = world.catalog.get(g.defId);
        const okFill = g.ok ? "rgba(80,200,120,.28)" : "rgba(240,80,80,.30)", okLine = g.ok ? "rgba(60,170,100,.95)" : "rgba(220,60,60,.95)";
        if (g.wall) {
          const fr = wallItemFrame(iso, g.wall, g.at, def.wsize[0], g.z, def.wsize[1]);
          ctx.save();
          ctx.globalAlpha = 0.75;
          paintWallItem(ctx, fr, def, g.obj || { state: def.states, at: g.at }, paletteOf(def, g.obj), app.env, t, g.wall);
          ctx.restore();
          const q = wallItemQuad(fr);
          ctx.beginPath();
          q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
          ctx.closePath();
          ctx.fillStyle = okFill;
          ctx.fill();
          ctx.strokeStyle = okLine;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const or = orient(def.size, g.rot, def.rotMode);
          diamond(g.x, g.y, g.x + or.w, g.y + or.h, okFill, okLine);
          const obj = Object.assign({}, g.obj || { state: def.states }, { x: g.x, y: g.y, rot: g.rot });
          const fp = { x0: g.x, y0: g.y, x1: g.x + or.w, y1: g.y + or.h, w: or.w, h: or.h, o: or };
          ctx.save();
          ctx.globalAlpha = g.ok ? 0.85 : 0.55;
          paintObject(ctx, iso, def, obj, fp, app.env, t, app.renderer.sprites);
          ctx.restore();
        }
      }
      if (this.tool && this.tool.kind === "paint" && this._hoverCell) {
        const c = this._hoverCell;
        diamond(c.cx, c.cy, c.cx + 1, c.cy + 1, this.tool.mat < 0 ? "rgba(240,80,80,.3)" : "rgba(80,200,120,.3)", "rgba(255,255,255,.9)");
      }
      if (this.drag && this.drag.agent && this.drag.at) {
        const p = iso.toWorld(this.drag.at.x, this.drag.at.y, 1);
        ctx.strokeStyle = "rgba(77,124,243,.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 22, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this._placeSelBar();
    }
    /* ───────── 面板 ───────── */
    _build() {
      this._built = true;
      const root = this.app.root;
      root.insertAdjacentHTML("beforeend", `
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
        panel: $(".rk-panel"),
        chips: $("[data-pane=furn] .rk-chips"),
        grid: $("[data-pane=furn] .rk-grid"),
        wallGrid: $("[data-pane=wall] .rk-grid"),
        room: $("[data-pane=room]"),
        agents: $("[data-pane=agents]"),
        scenes: $("[data-pane=scenes]"),
        packs: $("[data-pane=packs]"),
        ebar: $(".rk-ebar"),
        sel: $(".rk-sel"),
        color: $(".rk-color"),
        file: $(".rk-file")
      };
      this.el.panel.addEventListener("click", (e) => this._onPanelClick(e));
      this.el.panel.addEventListener("change", (e) => this._onPanelChange(e));
      this.el.panel.addEventListener("input", (e) => this._onPanelInput(e));
      this.el.ebar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-e]");
        if (!b) return;
        const a = b.getAttribute("data-e");
        if (a === "undo") this.doUndo();
        else if (a === "redo") this.doRedo();
        else if (a === "export") this.app.exportScene();
        else if (a === "import") this.el.file.click();
        else if (a === "reset") {
          if (confirm("恢复成默认房间？当前布置会被替换（可撤销）。")) this.app.resetScene();
        } else if (a === "done") this.app.setMode("play");
      });
      this.el.sel.addEventListener("click", (e) => {
        const b = e.target.closest("[data-s]");
        if (!b) return;
        const a = b.getAttribute("data-s");
        if (a === "rotate") this.rotate();
        else if (a === "dup") this.duplicate();
        else if (a === "color") this.recolor();
        else if (a === "state") this.toggleState();
        else if (a === "del") this.remove();
      });
      this.el.file.addEventListener("change", () => {
        const f = this.el.file.files && this.el.file.files[0];
        if (!f) return;
        f.text().then((txt) => this.app.importScene(txt)).finally(() => {
          this.el.file.value = "";
        });
      });
    }
    refresh() {
      if (!this._built) return;
      this._renderCatalog();
      this._renderRoomPane();
      this._renderAgents();
      if (this.tab === "scenes") renderScenesPane(this, this.el.scenes);
      if (this.tab === "packs") renderPacksPane(this, this.el.packs);
      this._renderSelBar();
    }
    switchTab(tab) {
      if (!this._built) return;
      this.tab = tab;
      this.el.panel.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tab") === tab));
      this.el.panel.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("on", p.getAttribute("data-pane") === tab));
      if (tab === "scenes") renderScenesPane(this, this.el.scenes);
      if (tab === "packs") renderPacksPane(this, this.el.packs);
    }
    _thumb(def) {
      if (def.art.kind === "sprite") {
        const e = this.app.renderer.sprites.get(def.art.src);
        if (!(e.failed && def.art.parts)) return `<img src="${esc(this.app.renderer.sprites.url(def.art.src))}" alt="" loading="lazy">`;
      }
      return '<canvas data-thumb="' + esc(def.id) + '"></canvas>';
    }
    _fillThumbs(container) {
      container.querySelectorAll("canvas[data-thumb]").forEach((c) => {
        const def = this.app.world.catalog.get(c.getAttribute("data-thumb"));
        if (!def) return;
        const src = def.mount === "wall" ? this._wallThumb(def) : procThumb(def, this.app.iso, 84);
        c.width = src.width;
        c.height = src.height;
        c.getContext("2d").drawImage(src, 0, 0);
      });
    }
    _wallThumb(def) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), size = 84;
      const c = document.createElement("canvas");
      c.width = c.height = size * dpr;
      const ctx = c.getContext("2d");
      const w = def.wsize[0] * this.app.iso.hw, h = def.wsize[1], k = Math.min((size - 12) / w, (size - 12) / h);
      ctx.setTransform(k * dpr, 0, 0, k * dpr, (size - w * k) / 2 * dpr, (size - h * k) / 2 * dpr);
      const fr = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, w, h };
      paintWallItem(ctx, fr, def, { state: def.states, at: 0 }, paletteOf(def, null), { night: false, sky: ["#9cc8f0", "#e6f3ff"], weather: "clear" }, 0, "left");
      return c;
    }
    _renderCatalog() {
      const cat = this.app.world.catalog;
      const floorDefs = cat.list((d) => d.mount !== "wall" && !d.hidden);
      const cats = [...new Set(floorDefs.map((d) => d.cat))];
      if (this.cat && cats.indexOf(this.cat) < 0) this.cat = null;
      const key2 = cats.join(",") + "|" + this.cat + "|" + floorDefs.length;
      if (this._catKey !== key2) {
        this._catKey = key2;
        this.el.chips.innerHTML = `<button data-cat="" class="${this.cat ? "" : "on"}">全部</button>` + cats.map((c) => `<button data-cat="${esc(c)}" class="${this.cat === c ? "on" : ""}">${esc(CATEGORY_NAMES[c] || c)}</button>`).join("");
        this.el.grid.innerHTML = floorDefs.filter((d) => !this.cat || d.cat === this.cat).map((d) => `<div class="rk-item" data-def="${esc(d.id)}" title="${esc(d.name + (d.sub ? " · " + d.sub : ""))}">${this._thumb(d)}<span>${esc(d.name)}</span></div>`).join("");
        this._fillThumbs(this.el.grid);
        const wallDefs = cat.list((d) => d.mount === "wall" && !d.hidden);
        this.el.wallGrid.innerHTML = wallDefs.map((d) => `<div class="rk-item" data-def="${esc(d.id)}" title="${esc(d.name)}"><canvas data-thumb="${esc(d.id)}"></canvas><span>${esc(d.name)}</span></div>`).join("");
        this._fillThumbs(this.el.wallGrid);
      }
      this._syncItems();
    }
    _syncItems() {
      if (!this._built) return;
      const id = this.tool && this.tool.kind === "place" ? this.tool.defId : null;
      this.el.panel.querySelectorAll(".rk-item").forEach((it) => it.classList.toggle("on", it.getAttribute("data-def") === id));
    }
    _renderRoomPane() {
      const r = this.app.world.room, W = r.walls;
      const mats = r.mats.map((m, i) => `<button data-mat="${i}" class="${i === this.brushMat ? "on" : ""}" style="border-left:12px solid ${esc(m.color)}">${esc((MAT_KINDS.find((k) => k[0] === m.kind) || ["", m.kind])[1])}</button>`).join("");
      const cur = r.mats[this.brushMat] || r.mats[0];
      const painting = this.tool && this.tool.kind === "paint";
      this.el.room.innerHTML = `
      <div class="rk-field">尺寸（格）</div>
      <div class="rk-line">宽 <span class="rk-step"><button data-r="w-">−</button><b>${r.w}</b><button data-r="w+">＋</button></span>
        深 <span class="rk-step"><button data-r="h-">−</button><b>${r.h}</b><button data-r="h+">＋</button></span></div>
      <div class="rk-field">风格预设</div>
      <div class="rk-chips">${PRESETS.map((p, i) => `<button data-preset="${i}">${esc(p.name)}</button>`).join("")}</div>
      <div class="rk-field">地面材质（a/b/c/d 四个槽，用刷子混铺）</div>
      <div class="rk-chips">${mats}${r.mats.length < 4 ? '<button data-r="mat+">＋</button>' : ""}</div>
      <div class="rk-line">
        <select data-in="matKind">${MAT_KINDS.map((k) => `<option value="${k[0]}" ${cur.kind === k[0] ? "selected" : ""}>${k[1]}</option>`).join("")}</select>
        <input type="color" data-in="matColor" value="${esc(cur.color)}">
      </div>
      <div class="rk-chips" style="margin-top:6px">
        <button data-r="fill">整屋铺满</button>
        <button data-r="brush" class="${painting && this.tool.mat >= 0 ? "on" : ""}">🖌 刷子</button>
        <button data-r="void" class="${painting && this.tool.mat < 0 ? "on" : ""}">✂ 挖空</button>
      </div>
      <div class="rk-field">墙</div>
      <div class="rk-chips">
        <button data-r="wl" class="${W.left ? "on" : ""}">左墙</button><button data-r="wr" class="${W.right ? "on" : ""}">右墙</button>
        <button data-r="wains" class="${W.wainscot ? "on" : ""}">护墙板</button>
        <button data-r="outdoor" class="${r.outdoor ? "on" : ""}" title="下雨下雪会落在场景里">户外</button>
      </div>
      <div class="rk-line">墙高 <input type="range" min="120" max="340" step="10" data-in="wallH" value="${W.height}"></div>
      <div class="rk-line">墙面 <input type="color" data-in="wallC" value="${esc(W.color)}"> 护墙板 <input type="color" data-in="wainC" value="${esc(W.wainscot || "#8fb0c9")}"> 线脚 <input type="color" data-in="trimC" value="${esc(W.trim)}"></div>
      <div class="rk-line" style="margin-top:6px">墙纸 <select data-in="pattern">${PATTERNS.map((p) => `<option value="${p[0]}" ${W.pattern === p[0] ? "selected" : ""}>${p[1]}</option>`).join("")}</select></div>
      <div class="rk-field">地台厚度</div>
      <div class="rk-line"><input type="range" min="0" max="40" step="2" data-in="slab" value="${r.slab || 0}"></div>`;
    }
    _syncRoomPane() {
      if (this._built) this._renderRoomPane();
    }
    _renderAgents() {
      const sc = this.app.world.scene;
      const chars = [...this.app.characters.values()];
      this.el.agents.innerHTML = sc.agents.map((a) => `
      <div class="rk-agent" data-agent="${esc(a.id)}">
        <i style="background:${esc(a.look && a.look.body || "#5b8def")}" data-ag="color" title="换颜色"></i>
        <input value="${esc(a.name)}" data-ag="name">
        <select data-ag="hat">${HATS.map((h) => `<option value="${h[0]}" ${(a.look && a.look.hat || "") === h[0] ? "selected" : ""}>${h[1]}</option>`).join("")}</select>
        <button data-ag="del" title="移除">×</button>
      </div>
      <div class="rk-line" style="margin:-2px 0 8px 22px">
        <select data-ag="brain" data-agent="${esc(a.id)}">${BRAINS.map((b) => `<option value="${b[0]}" ${a.brain === b[0] ? "selected" : ""}>${b[1]}</option>`).join("")}</select>
        <select data-ag="char" data-agent="${esc(a.id)}" title="角色卡：决定台词与喜好"><option value="">（无角色卡）</option>${chars.map((c) => `<option value="${esc(c.id)}" ${a.character === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      </div>`).join("") + `<button class="rk-btn" data-ag="add" style="width:100%">＋ 添加角色</button>
       <div class="rk-hint">「宠物」模式的角色会跟随 DSH 工作状态（思考/干活/等待/完成/出错）；「自主生活」会自己找家具、找同伴聊天。角色卡决定台词和喜好，可在「素材」页导入 SillyTavern 角色卡。拖动场景里的角色可以挪位置。</div>`;
    }
    _onPanelClick(e) {
      const app = this.app, world = app.world;
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        this.switchTab(tab.getAttribute("data-tab"));
        return;
      }
      if (this.tab === "scenes" && e.target.closest("[data-pane=scenes]")) {
        onScenesClick(this, e);
        return;
      }
      if (this.tab === "packs" && e.target.closest("[data-pane=packs]")) {
        onPacksClick(this, e);
        return;
      }
      const c = e.target.closest("[data-cat]");
      if (c) {
        this.cat = c.getAttribute("data-cat") || null;
        this._catKey = null;
        this._renderCatalog();
        return;
      }
      const it = e.target.closest(".rk-item");
      if (it) {
        this.startPlace(it.getAttribute("data-def"));
        return;
      }
      const pr = e.target.closest("[data-preset]");
      if (pr) {
        const p = PRESETS[+pr.getAttribute("data-preset")];
        const mats = world.room.mats.slice();
        mats[0] = Object.assign({}, p.mat);
        this.exec({ t: "room", patch: { walls: Object.assign({}, world.room.walls, p.walls), mats } });
        return;
      }
      const m = e.target.closest("[data-mat]");
      if (m) {
        this.brushMat = +m.getAttribute("data-mat");
        if (this.tool && this.tool.kind === "paint" && this.tool.mat >= 0) this.tool.mat = this.brushMat;
        this._renderRoomPane();
        return;
      }
      const rb = e.target.closest("[data-r]");
      if (rb) {
        this._roomAction(rb.getAttribute("data-r"));
        return;
      }
      const ag = e.target.closest("[data-ag]");
      if (ag && e.type === "click") {
        const kind = ag.getAttribute("data-ag");
        const row = ag.closest("[data-agent]"), id = row && row.getAttribute("data-agent");
        const a = id && world.scene.agents.find((x) => x.id === id);
        if (kind === "add") {
          const used = new Set(world.scene.agents.map((x) => x.name));
          const name = AGENT_NAMES.find((n) => !used.has(n)) || "小鲸鱼" + (world.scene.agents.length + 1);
          const spot = app.nav.nearestFree(world.room.w / 2, world.room.h / 2, 6) || { x: 1, y: 1 };
          const look2 = Object.assign({}, pick(WHALE_LOOKS), { hat: Math.random() < 0.3 ? pick(["bow", "cap"]) : "" });
          this.exec({ t: "agent.add", agent: { id: uid("a"), name, kind: "girl", brain: "auto", x: spot.x, y: spot.y, look: look2 } });
          app.sfx("place");
        } else if (kind === "del" && a) {
          this.exec({ t: "agent.remove", id: a.id });
        } else if (kind === "color" && a) {
          const i = WHALE_LOOKS.findIndex((l) => l.body === (a.look && a.look.body));
          const next = WHALE_LOOKS[(i + 1) % WHALE_LOOKS.length];
          this.exec({ t: "agent.set", id: a.id, patch: { look: Object.assign({}, a.look, next) } });
        }
      }
    }
    _onPanelChange(e) {
      const app = this.app, world = app.world, t = e.target;
      if (this.tab === "scenes" && onScenesChange(this, e)) return;
      const ag = t.getAttribute("data-ag");
      if (ag) {
        const id = t.getAttribute("data-agent") || t.closest("[data-agent]") && t.closest("[data-agent]").getAttribute("data-agent");
        const a = world.scene.agents.find((x) => x.id === id);
        if (!a) return;
        if (ag === "name") this.exec({ t: "agent.set", id, patch: { name: t.value.trim().slice(0, 16) || a.name } });
        else if (ag === "hat") this.exec({ t: "agent.set", id, patch: { look: Object.assign({}, a.look, { hat: t.value }) } });
        else if (ag === "brain") this.exec({ t: "agent.set", id, patch: { brain: t.value } });
        else if (ag === "char") this.exec({ t: "agent.set", id, patch: { character: t.value || void 0 } });
        return;
      }
      const k = t.getAttribute("data-in");
      if (!k) return;
      const r = world.room;
      const commit = (patch) => {
        const before = {};
        for (const key2 in patch) before[key2] = clone(this._liveBefore && key2 in this._liveBefore ? this._liveBefore[key2] : r[key2]);
        this._liveBefore = null;
        if (this.exec({ t: "room", patch })) this.undo[this.undo.length - 1].inv = { t: "room", patch: before };
      };
      const mats = r.mats.map((m) => Object.assign({}, m));
      switch (k) {
        case "matKind":
          mats[this.brushMat].kind = t.value;
          commit({ mats });
          break;
        case "matColor":
          mats[this.brushMat].color = t.value;
          commit({ mats });
          break;
        case "wallH":
        case "wallC":
        case "wainC":
        case "trimC":
        case "pattern":
          commit({ walls: this._wallsFrom(k, t.value) });
          break;
        case "slab":
          commit({ slab: +t.value });
          break;
      }
    }
    /** 拖滑块/取色时实时预览（不进撤销栈，change 时一次性记录） */
    _onPanelInput(e) {
      const t = e.target, k = t.getAttribute("data-in");
      if (!k || t.tagName === "SELECT") return;
      const world = this.app.world, r = world.room;
      if (!this._liveBefore) this._liveBefore = { walls: clone(r.walls), mats: clone(r.mats), slab: r.slab };
      if (k === "matColor") {
        const mats = r.mats.map((m) => Object.assign({}, m));
        mats[this.brushMat].color = t.value;
        world.apply({ t: "room", patch: { mats } }, { silent: true });
      } else if (k === "slab") world.apply({ t: "room", patch: { slab: +t.value } }, { silent: true });
      else if (k === "wallH" || k === "wallC" || k === "wainC" || k === "trimC") world.apply({ t: "room", patch: { walls: this._wallsFrom(k, t.value) } }, { silent: true });
    }
    _wallsFrom(k, v) {
      const W = Object.assign({}, this.app.world.room.walls);
      if (k === "wallH") W.height = +v;
      if (k === "wallC") W.color = v;
      if (k === "wainC") W.wainscot = v;
      if (k === "trimC") W.trim = v;
      if (k === "pattern") W.pattern = v;
      return W;
    }
    _roomAction(a) {
      const app = this.app, world = app.world, r = world.room;
      if (a === "w-" || a === "w+" || a === "h-" || a === "h+") {
        const w = clamp(r.w + (a === "w+" ? 1 : a === "w-" ? -1 : 0), 2, 20);
        const h = clamp(r.h + (a === "h+" ? 1 : a === "h-" ? -1 : 0), 2, 20);
        if (w === r.w && h === r.h) return;
        const ops = [];
        for (const o of world.objects) {
          if (o.wall) {
            const def = world.def(o), len = o.wall === "left" ? h : w;
            if (def && o.at + def.wsize[0] / 2 > len) ops.push({ t: "remove", id: o.id });
          } else {
            const f = world.footprint(o);
            if (f && (f.x1 > w || f.y1 > h)) ops.push({ t: "remove", id: o.id });
          }
        }
        if (ops.length && !confirm(`缩小后有 ${ops.length} 件家具放不下，会被移走（可撤销）。继续？`)) return;
        ops.push({ t: "room", patch: { w, h, cells: resizeCells(r, w, h) } });
        this.exec({ t: "batch", ops });
        for (const ag of app.agents.values()) {
          if (!app.nav.freeAt(ag.x, ag.y)) {
            const p = app.nav.nearestFree(ag.x, ag.y);
            if (p) {
              ag.cancel();
              ag.x = p.x;
              ag.y = p.y;
            }
          }
        }
        app.renderer.fit(false);
        return;
      }
      if (a === "mat+") {
        this.exec({ t: "room", patch: { mats: r.mats.concat([{ kind: "tile", color: "#e8e1d4" }]) } });
        this.brushMat = r.mats.length - 1;
        this._renderRoomPane();
        return;
      }
      if (a === "fill") {
        const ch = String.fromCharCode(97 + this.brushMat);
        const rows = Array.from({ length: r.h }, (_, y) => Array.from({ length: r.w }, (_2, x) => r.cells && r.cells[y] && r.cells[y][x] === "." ? "." : ch).join(""));
        this.exec({ t: "room", patch: { cells: this.brushMat === 0 && rows.every((row) => !row.includes(".")) ? null : rows } });
        return;
      }
      if (a === "brush") {
        if (this.tool && this.tool.kind === "paint" && this.tool.mat >= 0) this.cancelTool();
        else this.startPaint(this.brushMat);
        return;
      }
      if (a === "void") {
        if (this.tool && this.tool.kind === "paint" && this.tool.mat < 0) this.cancelTool();
        else this.startPaint(-1);
        return;
      }
      if (a === "wl" || a === "wr") {
        const W = Object.assign({}, r.walls);
        if (a === "wl") W.left = !W.left;
        else W.right = !W.right;
        const ops = world.objects.filter((o) => o.wall === (a === "wl" ? "left" : "right") && !W[o.wall]).map((o) => ({ t: "remove", id: o.id }));
        if (ops.length && !confirm(`这面墙上有 ${ops.length} 件墙饰，会一起移走（可撤销）。继续？`)) return;
        ops.push({ t: "room", patch: { walls: W } });
        this.exec({ t: "batch", ops });
        return;
      }
      if (a === "outdoor") this.exec({ t: "room", patch: { outdoor: !r.outdoor } });
      if (a === "wains") this.exec({ t: "room", patch: { walls: Object.assign({}, r.walls, { wainscot: r.walls.wainscot ? null : "#8fb0c9" }) } });
    }
    /* ───────── 选中物浮动条 ───────── */
    _renderSelBar() {
      if (!this._built) return;
      const o = this.sel && this.app.world.byId.get(this.sel);
      this.el.sel.classList.toggle("on", !!o);
      if (!o) return;
      const def = this.app.world.def(o);
      this.el.sel.querySelector("[data-s=rotate]").style.display = !o.wall && def.rots > 1 ? "" : "none";
      this.el.sel.querySelector("[data-s=state]").style.display = Object.values(def.states).some((v) => typeof v === "boolean") ? "" : "none";
      this._placeSelBar();
    }
    _placeSelBar() {
      if (!this._built || !this.sel || this.drag && this.drag.moved) {
        if (this._built && this.drag && this.drag.moved) this.el.sel.classList.remove("on");
        return;
      }
      const p = this.app.renderer.anchorOf({ id: this.sel });
      if (!p) return;
      this.el.sel.classList.add("on");
      this.el.sel.style.left = clamp(p.x, 90, this.app.renderer.vw - 90) + "px";
      this.el.sel.style.top = Math.max(44, p.y - 10) + "px";
    }
  };

  // web/roomkit/story.js
  function normalizeStory(raw, source) {
    const s = clone(raw) || {};
    if (!s.id || !s.nodes) throw new Error("[roomkit] 剧情缺少 id 或 nodes");
    s.name = s.name || s.id;
    s.trigger = s.trigger || { on: "manual" };
    s.roles = s.roles || {};
    s.start = s.start || "start";
    s.source = source || "pack";
    return s;
  }
  var Stories = class {
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
      } catch (e) {
        console.warn(e.message, raw && raw.id);
        return null;
      }
    }
    /** 当前场景可用的全部剧情：内容包里的 + 场景自带的 */
    all() {
      const own = (this.app.world.scene.stories || []).map((s) => {
        try {
          return normalizeStory(s, "scene");
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      const ids = new Set(own.map((s) => s.id));
      return own.concat(this.list.filter((s) => !ids.has(s.id)));
    }
    /** 某个房间（场景 JSON）里能演的剧情：剧情页、地图的进度都按它算——限定了别的房间、要点的家具或角色不在这屋的不算 */
    forScene(scene) {
      const own = (scene.stories || []).map((s) => {
        try {
          return normalizeStory(s, "scene");
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      const ids = new Set(own.map((s) => s.id));
      const objs = scene.objects || [], agents = scene.agents || [];
      const fits = (s) => {
        const t = s.trigger;
        if (t.scene && t.scene !== scene.id && t.scene !== scene.template) return false;
        if (t.on === "click") return t.obj ? objs.some((o) => o.id === t.obj) : objs.some((o) => o.def === t.def);
        if (t.on === "agent") return agents.some((a) => a.id === t.agent);
        return true;
      };
      return own.concat(this.list.filter((s) => !ids.has(s.id) && fits(s)));
    }
    /* ───────── 进度 ───────── */
    _key(sceneId) {
      return "story." + (sceneId || this.app.world.scene.id);
    }
    _state(sceneId) {
      return this.app.storage.pref(this._key(sceneId)) || {};
    }
    /** sceneId 不传 = 当前房间（地图上看别的房间的进度时传它的 id） */
    getFlag(k, sceneId) {
      return this._state(sceneId)[k];
    }
    setFlag(k, v) {
      const s = this._state();
      if (v === void 0 || v === null) delete s[k];
      else s[k] = v;
      this.app.storage.pref(this._key(), s);
    }
    reset() {
      this.app.storage.pref(this._key(), {});
    }
    test(cond) {
      if (cond == null || cond === "") return true;
      if (Array.isArray(cond)) return cond.every((c2) => this.test(c2));
      if (typeof cond === "object") {
        const v = this.getFlag(cond.flag);
        if ("eq" in cond) return v === cond.eq;
        if ("gte" in cond) return (+v || 0) >= cond.gte;
        if ("lte" in cond) return (+v || 0) <= cond.lte;
        return !!v;
      }
      const c = String(cond).trim();
      if (c[0] === "!") return !this.test(c.slice(1));
      if (c.indexOf("flag:") === 0) return !!this.getFlag(c.slice(5));
      if (c === "night") return this.app.isNight();
      if (c === "day") return !this.app.isNight();
      if (c.indexOf("hour:") === 0) {
        const [a, b] = c.slice(5).split("-").map(Number);
        return inHours(this.app.hour(), a, b);
      }
      return !!this.getFlag(c);
    }
    /** 这条剧情现在能不能演：没演过（once/daily）、条件满足、角色都在场 */
    ready(s) {
      if (this.active) return false;
      const t = s.trigger;
      if (t.scene && t.scene !== this.app.world.scene.id && t.scene !== this.app.world.scene.template) return false;
      if (s.once && this.getFlag("done:" + s.id)) return false;
      if (s.daily && this.getFlag("day:" + s.id) === today()) return false;
      if (t.if && !this.test(t.if)) return false;
      for (const role in s.roles) if (!this.app.director.resolveWho(s.roles[role], {})) return false;
      return true;
    }
    forObject(o) {
      const def = this.app.world.def(o);
      return this.all().find((s) => s.trigger.on === "click" && (s.trigger.obj === o.id || def && s.trigger.def === def.id) && this.ready(s)) || null;
    }
    forAgent(a) {
      return this.all().find((s) => s.trigger.on === "agent" && s.trigger.agent === a.id && this.ready(s)) || null;
    }
    /** 头顶"！"标记：有剧情等着被点开的家具/角色 */
    markers() {
      if (this.active || this.app.mode === "edit") return [];
      const out = [];
      for (const s of this.all()) {
        if (s.marker === false || !this.ready(s)) continue;
        if (s.trigger.on === "click") {
          const o = s.trigger.obj ? this.app.world.byId.get(s.trigger.obj) : this.app.world.objects.find((x) => x.def === s.trigger.def);
          if (o) out.push({ id: o.id, story: s.id });
        } else if (s.trigger.on === "agent" && this.app.agents.has(s.trigger.agent)) out.push({ id: "agent:" + s.trigger.agent, story: s.id });
      }
      return out;
    }
    /** 场景开场 / 每隔一会儿检查时段剧情 */
    checkStart() {
      const s = this.all().find((x) => x.trigger.on === "start" && this.ready(x));
      if (s) setTimeout(() => {
        if (!this.ready(s)) return;
        if (this.app.shell) this.app.shell.offerStory(s);
        else this.run(s);
      }, 1400);
    }
    tick(dt) {
      this._hourAt -= dt;
      if (this._hourAt > 0 || this.active || this.app.mode === "edit") return;
      this._hourAt = 20;
      const h = this.app.hour();
      const s = this.all().find((x) => x.trigger.on === "hour" && inHours(h, x.trigger.from, x.trigger.to) && this.ready(x));
      if (s) {
        if (this.app.shell) this.app.shell.offerStory(s);
        else this.run(s);
      }
    }
    skip() {
      if (this.active) {
        this._skip = true;
        this.app.dialog.cancel();
      }
    }
    _text(t, ctx) {
      return String(t == null ? "" : t).replace(/\{\{user\}\}/g, this.app.opts.userName || "你").replace(/\{\{(\w+)\}\}/g, (m, k) => ctx.roles[k] ? ctx.roles[k].name : m);
    }
    async run(story, ctx = {}) {
      var _a;
      if ((_a = this.app.worldSession) == null ? void 0 : _a.id) return false;
      if (this.active) return false;
      const app = this.app, D = app.director, dlg = app.dialog;
      this.active = story;
      this._skip = false;
      this.setFlag("seen:" + story.id, true);
      const cast = /* @__PURE__ */ new Set(), roles = {};
      for (const role in story.roles) {
        const a = D.resolveWho(story.roles[role], ctx);
        if (!a) continue;
        roles[role] = a;
        if (!cast.has(a)) {
          cast.add(a);
          a.cancel();
          a.engaged = "play";
        }
      }
      const sctx = Object.assign({}, ctx, { roles });
      const later = [];
      app.hud.closeCard();
      app.hud.closeDrawer();
      app.hud.hideTip();
      app.bus.emit("story:start", { id: story.id, name: story.name });
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
            const op = s.do === "goto" && !s.node ? "walk" : s.do;
            switch (op) {
              case "goto":
                next = s.node;
                break;
              case "end":
                next = null;
                break;
              case "set":
                this.setFlag(s.flag, s.value === void 0 ? true : s.value);
                continue;
              case "inc":
                this.setFlag(s.flag, (+this.getFlag(s.flag) || 0) + (s.by || 1));
                continue;
              case "cmd":
                later.push(this._roleCmd(s.cmd, roles));
                continue;
              case "camera":
                this._focus(s.focus, sctx, s.zoom);
                continue;
              case "line":
              case "narrate": {
                const a = s.do === "line" ? D.resolveWho(s.who, sctx) : null;
                if (a) {
                  if (!cast.has(a)) {
                    cast.add(a);
                    a.cancel();
                    a.engaged = "play";
                  }
                  if (s.expr) a.setExpr(s.expr, 3.5);
                  if (s.emote) a.emote(s.emote, 2.6);
                  if (s.pose) a.pose_(s.pose, s.s || 3);
                  a.bounce(0.35);
                  if (s.camera !== false) this._focus(a.id, sctx, s.zoom);
                }
                const r = await dlg.line(a ? a.name : s.name || "", this._text(s.text, sctx), a ? a.look.body : null);
                if (!r || r.skip) break outer;
                continue;
              }
              case "choice": {
                const opts = (s.options || []).filter((o2) => !o2.if || this.test(o2.if));
                if (!opts.length) continue;
                const r = await dlg.choose(this._text(s.text || "", sctx), opts.map((o2) => this._text(o2.label, sctx)));
                if (!r || r.skip) break outer;
                const o = opts[r.index];
                if (!o) continue;
                if (o.set) for (const k in o.set) this.setFlag(k, o.set[k]);
                if (o.goto) next = o.goto;
                app.bus.emit("story:choice", { id: story.id, node, label: o.label });
                break;
              }
              default: {
                dlg.idle();
                const ok = await D.doStep(s, sctx, cast);
                if (ok === false && s.required) break outer;
                continue;
              }
            }
            break;
          }
          node = next;
        }
      } catch (e) {
        console.error("[roomkit] 剧情出错:", story.id, e);
      } finally {
        D.release(cast);
        dlg.close();
        app.renderer.fit(false);
        if (story.once) this.setFlag("done:" + story.id, true);
        if (story.daily) this.setFlag("day:" + story.id, today());
        this.active = null;
        app.bus.emit("story:end", { id: story.id, skipped: this._skip });
        later.forEach((c) => c && app.command(c));
      }
      return true;
    }
    _roleCmd(cmd, roles) {
      if (!cmd) return null;
      const c = Object.assign({}, cmd);
      if (typeof c.id === "string" && c.id[0] === "$" && roles[c.id.slice(1)]) c.id = roles[c.id.slice(1)].id;
      return c;
    }
    _focus(ref, ctx, zoom) {
      const app = this.app, R = app.renderer;
      let p = null;
      const a = ctx.roles && ctx.roles[ref] || app.agents.get(ref);
      if (a) p = app.iso.toWorld(a.x, a.y, a.z + 34);
      else {
        const pt = app.director.resolvePoint(ref, ctx);
        if (pt) p = app.iso.toWorld(pt.x, pt.y, 40);
      }
      if (p) R.focusOn(p.x, p.y, zoom || 1.55);
    }
  };
  function inHours(h, from, to) {
    if (from == null || to == null) return true;
    return from <= to ? h >= from && h < to : h >= from || h < to;
  }
  function today() {
    const d = /* @__PURE__ */ new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  // web/roomkit/dialog.js
  var Dialog = class {
    constructor(app) {
      this.app = app;
      app.root.insertAdjacentHTML("beforeend", `
      <div class="rk-dialog" role="dialog" aria-live="polite">
        <div class="rk-dlg-head"><span class="rk-dlg-name"></span><span class="rk-dlg-title"></span>
          <button class="rk-dlg-skip" type="button" title="跳过剧情（Esc）">跳过 ⏭</button></div>
        <div class="rk-dlg-text"></div>
        <div class="rk-dlg-choices"></div>
        <div class="rk-dlg-next">▼</div>
      </div>`);
      const el = this.el = app.root.querySelector(".rk-dialog");
      this.nameEl = el.querySelector(".rk-dlg-name");
      this.titleEl = el.querySelector(".rk-dlg-title");
      this.textEl = el.querySelector(".rk-dlg-text");
      this.choicesEl = el.querySelector(".rk-dlg-choices");
      this._res = null;
      this._typing = null;
      el.addEventListener("click", (e) => {
        if (e.target.closest(".rk-dlg-skip")) {
          this.app.stories.skip();
          return;
        }
        const b = e.target.closest("[data-choice]");
        if (b) {
          this._finish({ index: +b.getAttribute("data-choice") });
          return;
        }
        if (this._mode === "line") this.advance();
      });
      app.root.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        if (e.key === "Escape") {
          e.stopPropagation();
          this.app.stories.skip();
          return;
        }
        if ((e.key === " " || e.key === "Enter") && this._mode === "line") {
          e.preventDefault();
          e.stopPropagation();
          this.advance();
          return;
        }
        if (this._mode === "choice" && /^[1-9]$/.test(e.key)) {
          const i = +e.key - 1;
          if (i < this._count) {
            e.stopPropagation();
            this._finish({ index: i });
          }
        }
      }, true);
    }
    isOpen() {
      return this.el.classList.contains("on");
    }
    open(title) {
      this.titleEl.textContent = title ? "· " + title : "";
      this.el.classList.add("on");
      this.idle();
    }
    close() {
      this.cancel();
      this.el.classList.remove("on", "busy");
    }
    /** 演员在走位、做动作时：收起文字，只留一条细边，表示剧情还在进行 */
    idle() {
      this.el.classList.add("busy");
      this._mode = null;
    }
    cancel() {
      this._stopTyping();
      if (this._res) this._finish({ skip: true });
    }
    line(name, text2, color) {
      this._stopTyping();
      this._mode = "line";
      this.el.classList.remove("busy");
      this.nameEl.textContent = name || "";
      this.nameEl.style.display = name ? "" : "none";
      this.nameEl.style.background = color || "";
      this.choicesEl.innerHTML = "";
      this.el.classList.remove("choosing");
      this._full = text2;
      this._shown = 0;
      this.textEl.textContent = "";
      this.el.classList.add("typing");
      const chars = Array.from(text2);
      this._typing = setInterval(() => {
        this._shown = Math.min(chars.length, this._shown + 2);
        this.textEl.textContent = chars.slice(0, this._shown).join("");
        if (this._shown >= chars.length) this._stopTyping();
      }, 40);
      this.app.sfx("tick");
      return new Promise((res) => {
        this._res = res;
      });
    }
    choose(text2, labels) {
      this._stopTyping();
      this._mode = "choice";
      this.el.classList.remove("busy", "typing");
      this.el.classList.add("choosing");
      if (text2) {
        this.nameEl.style.display = "none";
        this.textEl.textContent = text2;
      }
      this._count = labels.length;
      this.choicesEl.innerHTML = labels.map((l, i) => `<button type="button" class="rk-btn" data-choice="${i}"><b>${i + 1}</b> ${esc(l)}</button>`).join("");
      return new Promise((res) => {
        this._res = res;
      });
    }
    advance() {
      if (this._mode !== "line") return;
      if (this._typing) {
        this._stopTyping();
        this.textEl.textContent = this._full;
        return;
      }
      this._finish({ ok: true });
    }
    _stopTyping() {
      if (this._typing) {
        clearInterval(this._typing);
        this._typing = null;
      }
      this.el.classList.remove("typing");
    }
    _finish(v) {
      const r = this._res;
      this._res = null;
      if (v && !v.skip) this.app.sfx("click");
      if (r) r(v);
    }
  };

  // web/roomkit/style.js
  var CSS = `
.rk-root{position:relative;overflow:hidden;width:100%;height:100%;min-height:240px;user-select:none;-webkit-user-select:none;
  background:radial-gradient(120% 90% at 50% 18%,var(--rk-bg-a,#eef7fb),var(--rk-bg-b,#d6e9f2));
  font:13px/1.45 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#243047;
  --rk-panel:rgba(255,255,255,.9);--rk-line:rgba(40,60,100,.12);--rk-ink:#243047;--rk-sub:#6a7892;--rk-acc:#4d7cf3;
  transition:background 2s}
.rk-root.rk-night{color:#e8eefb;--rk-panel:rgba(18,26,46,.9);--rk-line:rgba(160,190,255,.16);--rk-ink:#e8eefb;--rk-sub:#9fb0d0}
.rk-root.rk-transparent{background:transparent}
.rk-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:default}
.rk-root.rk-hand .rk-canvas{cursor:pointer}
.rk-root.rk-panning .rk-canvas{cursor:grabbing}
.rk-root button{font:inherit;color:inherit}

.rk-tip{position:absolute;left:0;top:0;pointer-events:none;z-index:20;padding:3px 10px;border-radius:999px;white-space:nowrap;
  background:rgba(20,28,48,.78);color:#fff;font-size:12px;opacity:0;transform:translate(-50%,-120%);transition:opacity .15s}
.rk-tip.on{opacity:1}
.rk-tip small{opacity:.72;margin-left:6px}

.rk-bubbles{position:absolute;inset:0;pointer-events:none;z-index:18}
.rk-bubble{position:absolute;transform:translate(-50%,-100%);width:max-content;max-width:220px;padding:5px 11px;border-radius:13px;
  background:rgba(255,255,255,.96);color:#1f2a40;font-size:12.5px;line-height:1.4;box-shadow:0 4px 14px rgba(20,30,60,.16);
  white-space:pre-wrap;word-break:break-word;animation:rkPop .22s ease-out}
.rk-bubble:after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:rgba(255,255,255,.96);border-bottom:0}
.rk-bubble b{color:#4d7cf3;font-weight:600;margin-right:4px}
@keyframes rkPop{from{opacity:0;transform:translate(-50%,-80%) scale(.9)}to{opacity:1;transform:translate(-50%,-100%) scale(1)}}
.rk-float{position:absolute;transform:translate(-50%,-100%);pointer-events:none;z-index:19;padding:3px 10px;border-radius:999px;
  background:rgba(255,255,255,.94);color:#24304a;font-size:12px;white-space:nowrap;animation:rkFloat 1.5s ease-out forwards}
@keyframes rkFloat{0%{opacity:0;transform:translate(-50%,-70%)}15%{opacity:1}100%{opacity:0;transform:translate(-50%,-220%)}}

.rk-btn{border:1px solid var(--rk-line);background:var(--rk-panel);border-radius:999px;padding:5px 11px;cursor:pointer;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(20,30,60,.08);white-space:nowrap;font-size:12.5px}
.rk-btn:hover{border-color:rgba(77,124,243,.5)}
.rk-btn.on{background:var(--rk-acc);color:#fff;border-color:var(--rk-acc)}
.rk-btn.icon{padding:5px 9px}

/* ── 外壳：顶栏 / Dock / 侧抽屉（shell.js） ── */
.rk-top{position:absolute;left:8px;right:8px;top:8px;z-index:30;display:flex;gap:6px;align-items:center}
.rk-top-gap{flex:1}
.rk-scene-btn{display:inline-flex;align-items:center;gap:5px;max-width:46%;font-weight:600;flex:0 1 auto;min-width:0}
.rk-scene-btn b{overflow:hidden;text-overflow:ellipsis;font-weight:600}
.rk-scene-btn i{font-style:normal;opacity:.55;font-size:10px}
.rk-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#9aa6bb;flex:0 0 auto}
.rk-conn{display:inline-flex;align-items:center;gap:5px}
.rk-conn[data-level=ok] .rk-dot,.rk-dot[data-ok="1"]{background:#3cc27a;box-shadow:0 0 0 3px rgba(60,194,122,.18)}
.rk-conn[data-level=partial] .rk-dot{background:#f0b43c;box-shadow:0 0 0 3px rgba(240,180,60,.2)}
.rk-conn[data-level=error] .rk-dot,.rk-dot[data-ok="0"]{background:#e5534b;box-shadow:0 0 0 3px rgba(229,83,75,.18)}
.rk-compact .rk-top{left:6px;right:6px;top:6px;gap:4px}
.rk-compact .rk-top .rk-btn{padding:4px 8px}
.rk-compact .rk-conn span{display:none}
/* 房间条（宽档）：家里的房间按楼层排开，像参考站的楼层按钮 */
.rk-rooms{display:none;gap:2px;padding:3px;border-radius:999px;background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 2px 8px rgba(20,30,60,.08);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow:hidden;min-width:0}
.rk-wide .rk-rooms:not(:empty){display:flex}
.rk-rooms button{border:0;background:none;border-radius:999px;padding:3px 10px;cursor:pointer;font-size:12.5px;color:var(--rk-sub);white-space:nowrap}
.rk-rooms button small{font-size:10px;opacity:.7;margin-right:4px;letter-spacing:.04em}
.rk-rooms button:hover{color:var(--rk-ink);background:rgba(77,124,243,.1)}
.rk-rooms button.on{background:var(--rk-acc);color:#fff}
/* 下拉菜单 */
.rk-menu{position:absolute;z-index:62;display:none;min-width:208px;max-width:min(300px,calc(100% - 12px));max-height:calc(100% - 12px);overflow:auto;padding:6px;border-radius:14px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 14px 36px rgba(20,30,60,.24);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.rk-menu.on{display:block;animation:rkPop2 .14s ease-out}
.rk-menu > button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;border-radius:9px;padding:7px 9px;cursor:pointer;text-align:left;font-size:13px;color:var(--rk-ink)}
.rk-menu > button:hover{background:rgba(77,124,243,.12)}
.rk-menu > button.on{color:var(--rk-acc);font-weight:600}
.rk-menu > button span{width:18px;text-align:center;flex:0 0 auto}
.rk-menu > button small{margin-left:auto;color:var(--rk-sub);font-size:11px}
.rk-menu > button em{margin-left:auto;font-style:normal;color:var(--rk-acc);font-weight:700}
.rk-menu hr{border:0;border-top:1px solid var(--rk-line);margin:5px 4px}
.rk-menu-title{padding:5px 9px 3px;font-weight:600;font-size:12.5px}
.rk-menu-sep{padding:6px 9px 2px;color:var(--rk-sub);font-size:11px;letter-spacing:.06em}
.rk-menu .rk-chips{padding:2px 6px 4px;margin:0}
.rk-menu-in{display:flex;gap:4px;padding:3px 6px}
.rk-menu-in input{flex:1;min-width:0;padding:5px 8px;border-radius:8px;border:1px solid var(--rk-line);background:transparent;color:inherit;font:inherit;user-select:text;-webkit-user-select:text}
.rk-menu-in button{border:1px solid var(--rk-line);background:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:12px;white-space:nowrap}
/* 换房间转场：两扇门合上 / 打开 + 楼层闪字 */
.rk-curtain{position:absolute;inset:0;z-index:58;display:none;pointer-events:none;overflow:hidden}
.rk-curtain.on{display:block;pointer-events:auto}
.rk-curtain i{position:absolute;top:0;bottom:0;width:50.5%;background:linear-gradient(90deg,#1c2645,#26335a);transition:transform .32s cubic-bezier(.6,0,.3,1)}
.rk-curtain i:first-child{left:0;transform:translateX(-101%);box-shadow:inset -3px 0 0 rgba(255,255,255,.08)}
.rk-curtain i:nth-child(2){right:0;transform:translateX(101%);background:linear-gradient(270deg,#1c2645,#26335a)}
.rk-curtain.shut i{transform:none}
.rk-curtain b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font-size:18px;letter-spacing:.08em;opacity:0;transition:opacity .2s;white-space:nowrap}
.rk-curtain.shut b{opacity:.92;transition-delay:.18s}
.rk-flash{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);z-index:44;pointer-events:none;opacity:0;color:#fff;font-size:26px;font-weight:600;
  letter-spacing:.06em;text-shadow:0 2px 14px rgba(10,20,50,.55);white-space:nowrap}
.rk-flash small{display:block;text-align:center;font-size:12px;letter-spacing:.3em;opacity:.85;margin-bottom:2px}
.rk-flash.on{animation:rkFlash 1.5s ease-out forwards}
@keyframes rkFlash{0%{opacity:0;transform:translate(-50%,-30%)}15%{opacity:1;transform:translate(-50%,-50%)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
.rk-compact .rk-flash{font-size:20px}
.rk-edit .rk-top{right:276px}
.rk-compact.rk-edit .rk-top{right:6px}
.rk-dock{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:32;display:flex;gap:2px;padding:4px;border-radius:18px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 8px 24px rgba(20,30,60,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);max-width:calc(100% - 16px)}
.rk-dock button{display:flex;flex-direction:column;align-items:center;gap:0;min-width:52px;padding:5px 8px 4px;border:0;border-radius:14px;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-dock button span{font-size:17px;line-height:1.15}
.rk-dock button small{font-size:11px}
.rk-dock button:hover{background:rgba(77,124,243,.1);color:var(--rk-ink)}
.rk-dock button.on{background:var(--rk-acc);color:#fff}
.rk-compact .rk-dock{bottom:6px;left:6px;right:6px;transform:none;justify-content:space-around}
.rk-compact .rk-dock button{min-width:0;flex:1;padding:4px 2px 3px}
.rk-compact .rk-dock button span{font-size:15px}
.rk-compact .rk-dock button small{font-size:10px}
.rk-edit .rk-dock,.rk-storying .rk-dock,.rk-storying .rk-top,.rk-storying .rk-story-pill,.rk-storying .rk-menu{display:none}
.rk-sheet{position:absolute;right:8px;top:50px;bottom:72px;width:300px;z-index:41;display:none;flex-direction:column;border-radius:16px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 12px 34px rgba(20,30,60,.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow:hidden}
.rk-sheet.on{display:flex;animation:rkPop2 .18s ease-out}
.rk-sheet header{display:flex;align-items:center;padding:10px 14px 8px;border-bottom:1px solid var(--rk-line);position:relative}
.rk-sheet header b{font-size:14px}
.rk-sheet-body{flex:1;overflow:auto;padding:10px 12px 12px}
.rk-compact .rk-sheet{left:6px;right:6px;width:auto;top:auto;bottom:62px;height:min(62%,420px)}
.rk-story-pill{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:31;display:none;gap:4px}
.rk-story-pill.on{display:flex;animation:rkPopC .25s ease-out}
.rk-story-pill .rk-btn b{color:var(--rk-acc);margin-left:4px}
.rk-compact .rk-story-pill{bottom:62px}
.rk-coach{position:absolute;left:50%;top:56px;transform:translateX(-50%);z-index:42;display:none;width:min(360px,calc(100% - 24px));padding:12px 14px;border-radius:14px;
  background:rgba(36,60,120,.94);color:#fff;font-size:12.5px;line-height:1.7;box-shadow:0 12px 30px rgba(20,30,60,.3)}
.rk-coach.on{display:block;animation:rkPopC .3s ease-out}
.rk-coach span{background:rgba(255,255,255,.2);border-radius:6px;padding:0 5px;margin:0 2px}
.rk-coach .rk-btn{display:block;margin:8px 0 0 auto;color:#24304a;background:#fff;box-shadow:none}
.rk-progress{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-bottom:10px;font-size:12px;color:var(--rk-sub)}
.rk-progress b{color:var(--rk-ink)}
.rk-progress i{grid-column:1/3;height:6px;border-radius:9px;background:var(--rk-line);overflow:hidden;position:relative}
.rk-progress i b{position:absolute;left:0;top:0;bottom:0;background:var(--rk-acc);border-radius:9px}
.rk-story{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-story > div{flex:1;min-width:0;display:flex;flex-direction:column}
.rk-story small{color:var(--rk-sub);font-size:11.5px}
.rk-story.seen b{color:var(--rk-sub)}
.rk-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--rk-sub);cursor:pointer}
.rk-opt{display:flex;align-items:flex-start;padding:8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-opt span{display:flex;flex-direction:column}
.rk-opt b{color:var(--rk-ink);font-weight:600}
.rk-mapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.rk-maphead{display:flex;flex-direction:column;margin-bottom:4px}
.rk-maphead b{font-size:14px}
.rk-maphead small{color:var(--rk-sub);font-size:11.5px}
.rk-floor{position:relative;padding:8px 0 4px 34px;border-top:1px dashed var(--rk-line)}
.rk-floor:first-of-type{border-top:0}
.rk-floor .rk-mapgrid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
.rk-floor-tag{position:absolute;left:0;top:10px;width:28px;padding:3px 0;border-radius:8px;background:rgba(77,124,243,.14);color:var(--rk-acc);font-size:11px;font-weight:700;text-align:center}
.rk-mapcard{position:relative;display:flex;flex-direction:column;gap:1px;padding:6px;border-radius:12px;background:rgba(127,140,170,.09);cursor:pointer;border:1px solid transparent}
.rk-mapcard:hover{border-color:rgba(77,124,243,.5)}
.rk-mapcard.cur{border-color:var(--rk-acc);background:rgba(77,124,243,.1)}
.rk-mapcard-more{position:absolute;right:4px;top:4px;width:24px;height:22px;border-radius:7px;border:0;background:var(--rk-panel);color:var(--rk-sub);cursor:pointer;opacity:.75}
.rk-mapcard-more:hover{opacity:1;color:var(--rk-acc)}
.rk-chips.rk-inline{display:inline-flex;margin:0 0 0 4px;vertical-align:middle}
.rk-mapcard canvas{width:100%;height:auto;aspect-ratio:5/3}
.rk-mapcard b{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-mapcard small{color:var(--rk-sub);font-size:11px}
.rk-mapnew{align-items:center;justify-content:center;min-height:90px}
.rk-mapnew span{font-size:24px;color:var(--rk-sub)}
.rk-sheet-chat .rk-sheet-body{display:flex;flex-direction:column;padding-bottom:8px}
.rk-chat-who{font-size:12.5px;margin-bottom:6px;display:flex;flex-direction:column}
.rk-chat-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
.rk-chat-who small{color:var(--rk-sub);font-size:11px}
.rk-chat-log{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 0;min-height:80px}
.rk-msg{display:flex}
.rk-msg span{max-width:85%;padding:6px 10px;border-radius:12px;background:rgba(127,140,170,.14);white-space:pre-wrap;word-break:break-word;font-size:13px}
.rk-msg.user{justify-content:flex-end}
.rk-msg.user span{background:var(--rk-acc);color:#fff}
.rk-msg.pending span{opacity:.6;font-style:italic}
.rk-msg{flex-wrap:wrap}
.rk-msg small{flex-basis:100%;color:var(--rk-sub);font-size:11px;margin-top:2px}
.rk-msg.user small{text-align:right}
.rk-chat-bar{display:flex;gap:6px;margin-top:6px}
.rk-chat-in{flex:1;min-width:0;padding:7px 10px;border-radius:999px;border:1px solid var(--rk-line);background:transparent;color:inherit;font:inherit;user-select:text;-webkit-user-select:text}
.rk-diag-row{display:grid;grid-template-columns:12px 64px 1fr;align-items:center;gap:6px;padding:5px 0;border-bottom:1px dashed var(--rk-line);font-size:12.5px}
.rk-diag-row small{color:var(--rk-sub);font-size:11.5px;word-break:break-all}
.rk-thread{align-items:center}
.rk-thread span{display:flex;flex-direction:column}
.rk-thread small{color:var(--rk-sub);font-size:11px}
.rk-like{margin-left:4px;font-size:12px;align-self:center;color:var(--rk-sub)}
.rk-like.on{color:#e0567a}
.rk-flag{margin-left:4px;opacity:.45;font-size:12px;align-self:center}
.rk-flag:hover{opacity:1}
.rk-report{flex-basis:100%}
.rk-link{color:var(--rk-acc);cursor:pointer;text-decoration:none}
.rk-admin-item{padding:8px;margin:4px 0;border-radius:8px;background:rgba(127,140,170,.08);font-size:12.5px}
.rk-admin-item small{color:var(--rk-sub)}
.rk-admin-btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.rk-tag{font-style:normal;font-size:10px;margin-left:4px;padding:0 4px;border-radius:6px;background:rgba(127,140,170,.25)}
.rk-soon{padding:10px;border-radius:10px;background:rgba(127,140,170,.08);font-size:12.5px;line-height:1.8}
.rk-soon small{color:var(--rk-sub);line-height:1.5;display:block;margin-top:4px}

.rk-toast{position:absolute;left:50%;bottom:80px;transform:translateX(-50%);z-index:60;padding:6px 14px;border-radius:999px;
  background:rgba(20,28,48,.84);color:#fff;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s}
.rk-toast.on{opacity:1}
.rk-compact.rk-edit .rk-toast{bottom:auto;top:84px}

.rk-card,.rk-drawer{position:absolute;z-index:40;width:236px;padding:12px 14px;border-radius:14px;background:var(--rk-panel);
  border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:none}
.rk-card.on,.rk-drawer.on{display:block;animation:rkPop2 .18s ease-out}
@keyframes rkPop2{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes rkPopC{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.rk-card{right:10px;bottom:76px}
.rk-door .rk-row{margin-bottom:4px}
.rk-drawer{right:10px;top:52px}
.rk-compact .rk-card{bottom:62px}
.rk-compact .rk-drawer{left:6px;right:6px;width:auto;top:44px}
.rk-root .rk-drawer.rk-object-menu{right:auto;bottom:auto;box-sizing:border-box;width:248px;max-width:calc(100% - 16px);padding:10px 12px;overflow:visible}
.rk-object-menu .rk-drawer-body{max-height:inherit;overflow:auto;overscroll-behavior:contain}
.rk-object-menu:after{content:"";position:absolute;left:var(--rk-tail-x,50%);bottom:-7px;width:12px;height:12px;background:var(--rk-panel);border-right:1px solid var(--rk-line);border-bottom:1px solid var(--rk-line);transform:translateX(-50%) rotate(45deg)}
.rk-object-menu.rk-menu-below:after{bottom:auto;top:-7px;transform:translateX(-50%) rotate(225deg)}
.rk-object-menu h4{padding-right:20px}
.rk-object-menu .rk-sub:empty{display:none}
.rk-x{position:absolute;right:10px;top:8px;cursor:pointer;color:var(--rk-sub);font-size:15px;border:0;background:none}
.rk-card h4,.rk-drawer h4{margin:0 0 2px;font-size:14px}
.rk-sub{color:var(--rk-sub);font-size:12px;margin-bottom:8px}
.rk-need{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}
.rk-need span{width:30px;color:var(--rk-sub)}
.rk-need i{flex:1;height:6px;border-radius:9px;background:var(--rk-line);overflow:hidden;position:relative}
.rk-need i b{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:var(--rk-acc);transition:width .6s}
.rk-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.rk-row .rk-btn{padding:4px 9px;font-size:12px;box-shadow:none}
.rk-kv{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:2px 0}
.rk-kv span:first-child{color:var(--rk-sub)}
.rk-world-panel{padding:8px 0;margin:6px 0;border-block:1px solid var(--rk-line);overflow-wrap:anywhere}
.rk-world-panel small{display:block;color:var(--rk-sub);font-size:11px}
.rk-world-panel label:not(.rk-check){display:grid;gap:4px;min-width:0;font-size:12px;margin:5px 0}
.rk-world-panel input:not([type=checkbox]),.rk-world-panel select{box-sizing:border-box;max-width:100%;min-width:0;padding:6px 8px;border:1px solid var(--rk-line);border-radius:8px;background:transparent;color:inherit;font:inherit;user-select:text}
.rk-world-panel .rk-chat-bar input{flex:1}
.rk-world-targets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr));gap:0 6px}
.rk-world-experiences{margin-top:8px}

/* ── 布置模式 ── */
.rk-panel{position:absolute;right:10px;top:10px;bottom:10px;width:248px;z-index:35;display:none;flex-direction:column;
  border-radius:16px;background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.16);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);overflow:hidden}
.rk-edit .rk-panel{display:flex}
.rk-tabs{display:flex;border-bottom:1px solid var(--rk-line)}
.rk-tabs button{flex:1;border:0;background:none;padding:9px 0;cursor:pointer;color:var(--rk-sub);font-size:12.5px}
.rk-tabs button.on{color:var(--rk-acc);box-shadow:inset 0 -2px 0 var(--rk-acc)}
.rk-pane{flex:1;overflow:auto;padding:10px;display:none}
.rk-pane.on{display:block}
.rk-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.rk-chips button{border:1px solid var(--rk-line);background:none;border-radius:999px;padding:2px 9px;cursor:pointer;font-size:11.5px;color:var(--rk-sub)}
.rk-chips button.on{background:var(--rk-acc);border-color:var(--rk-acc);color:#fff}
.rk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:6px}
.rk-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px 5px;border-radius:10px;cursor:pointer;
  border:1px solid transparent;background:rgba(127,140,170,.08);font-size:11px;text-align:center}
.rk-item:hover{border-color:rgba(77,124,243,.45)}
.rk-item.on{border-color:var(--rk-acc);background:rgba(77,124,243,.12)}
.rk-item canvas,.rk-item img{width:56px;height:56px;object-fit:contain}
.rk-field{margin:10px 0 4px;color:var(--rk-sub);font-size:11.5px;letter-spacing:.03em}
.rk-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rk-line input[type=color]{width:30px;height:24px;border:1px solid var(--rk-line);border-radius:6px;padding:0;background:none;cursor:pointer}
.rk-line input[type=range]{flex:1}
.rk-line input[type=text],.rk-line select{flex:1;min-width:0;padding:4px 6px;border:1px solid var(--rk-line);border-radius:8px;background:transparent;color:inherit;font:inherit}
.rk-step{display:inline-flex;align-items:center;border:1px solid var(--rk-line);border-radius:999px;overflow:hidden}
.rk-step button{border:0;background:none;padding:2px 9px;cursor:pointer}
.rk-step b{min-width:22px;text-align:center;font-weight:600}
.rk-agent{display:flex;align-items:center;gap:8px;padding:6px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-agent i{width:14px;height:14px;border-radius:50%;flex:0 0 auto}
.rk-agent input{flex:1;min-width:0;border:0;background:none;color:inherit;font:inherit}
.rk-agent select{border:1px solid var(--rk-line);border-radius:6px;background:transparent;color:inherit;font-size:11.5px}
.rk-agent button{border:0;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-ebar{position:absolute;left:10px;bottom:10px;z-index:36;display:none;gap:6px;flex-wrap:wrap}
.rk-edit .rk-ebar{display:flex}
.rk-sel{position:absolute;z-index:37;display:none;gap:4px;transform:translate(-50%,-100%);padding:4px;border-radius:999px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 6px 18px rgba(20,30,60,.18)}
.rk-sel.on{display:flex}
.rk-sel button{border:0;background:none;cursor:pointer;padding:3px 8px;border-radius:999px;font-size:12px}
.rk-sel button:hover{background:rgba(77,124,243,.14)}
.rk-hint{color:var(--rk-sub);font-size:11.5px;margin-top:8px;line-height:1.5}
.rk-compact .rk-panel{left:6px;right:6px;top:auto;bottom:6px;width:auto;height:46%}
.rk-compact .rk-ebar{bottom:auto;top:46px;left:6px}
.rk-compact .rk-card{left:6px;right:6px;width:auto}

/* ── 剧情对话框（视觉小说式） ── */
.rk-dialog{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:min(640px,calc(100% - 24px));z-index:45;
  padding:12px 18px 16px;border-radius:16px;background:rgba(255,255,255,.95);color:#1f2a40;border:1px solid rgba(40,60,100,.12);
  box-shadow:0 14px 40px rgba(20,30,60,.22);display:none;font-size:15px;line-height:1.65;cursor:pointer;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.rk-dialog.on{display:block;animation:rkPop2 .2s ease-out}
.rk-dialog.busy{padding:7px 14px;opacity:.8}
.rk-dialog.busy .rk-dlg-text,.rk-dialog.busy .rk-dlg-next,.rk-dialog.busy .rk-dlg-choices,.rk-dialog.busy .rk-dlg-name{display:none}
.rk-dlg-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.rk-dlg-name{padding:1px 12px;border-radius:999px;background:#4d7cf3;color:#fff;font-size:12.5px;font-weight:600;text-shadow:0 1px 1px rgba(0,0,0,.15)}
.rk-dlg-title{color:#8592aa;font-size:12px;flex:1}
.rk-dlg-skip{border:0;background:none;color:#8592aa;cursor:pointer;font-size:12px;padding:2px 4px}
.rk-dlg-skip:hover{color:#4d7cf3}
.rk-dlg-text{min-height:3.1em;white-space:pre-wrap}
.rk-dlg-next{position:absolute;right:16px;bottom:8px;color:#4d7cf3;font-size:11px;animation:rkBlink 1s infinite}
.rk-dialog.typing .rk-dlg-next,.rk-dialog.choosing .rk-dlg-next{display:none}
@keyframes rkBlink{50%{opacity:.2}}
.rk-dlg-choices{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.rk-dlg-choices .rk-btn{text-align:left;border-radius:12px;padding:8px 12px;font-size:14px;box-shadow:none}
.rk-dlg-choices .rk-btn b{color:#4d7cf3;margin-right:6px}
.rk-night .rk-dialog{background:rgba(20,28,48,.94);color:#e8eefb;border-color:rgba(160,190,255,.16)}
.rk-compact .rk-dialog{font-size:13.5px;padding:9px 12px 12px;bottom:6px;width:calc(100% - 12px)}

/* ── 模态框（自制家具 / 导入） ── */
.rk-modal{position:absolute;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(10,16,30,.35)}
.rk-modal.on{display:flex}
.rk-modal-box{width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:14px 16px;border-radius:16px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 20px 50px rgba(0,0,0,.3);color:var(--rk-ink)}
.rk-modal-box h4{margin:0 0 8px;font-size:15px}
.rk-ws{display:flex;gap:12px;flex-wrap:wrap}
.rk-ws canvas{width:220px;height:200px;border-radius:12px;background:rgba(127,140,170,.12);flex:0 0 auto}
.rk-ws .rk-ws-form{flex:1;min-width:200px}
.rk-ws label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--rk-sub);margin:5px 0}
.rk-ws label input[type=range]{flex:1}
.rk-ws label input[type=text],.rk-ws label select,.rk-ws label input[type=number]{flex:1;min-width:0;padding:3px 6px;border:1px solid var(--rk-line);border-radius:8px;background:transparent;color:inherit;font:inherit}
.rk-pack{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px;font-size:12px}
.rk-pack b{font-size:12.5px}
.rk-pack span{flex:1;color:var(--rk-sub)}
.rk-pack button{border:0;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-scene{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px;font-size:12.5px;cursor:pointer}
.rk-scene.on{outline:2px solid var(--rk-acc)}
.rk-scene span{flex:1}
.rk-scene small{color:var(--rk-sub)}
.rk-scene button{border:0;background:none;cursor:pointer;color:var(--rk-sub);padding:2px 4px}

/* 桌面模式：只剩房间和角色（desk.js） */
.rk-desk{min-height:0}
.rk-world-chip{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:31;display:none;align-items:center;gap:8px;max-width:calc(100% - 24px);padding:4px 5px 4px 13px;border-radius:999px;background:var(--rk-panel);box-shadow:0 4px 16px rgba(36,48,74,.14);white-space:nowrap}
.rk-world-chip.on{display:flex}
.rk-world-chip b{font-size:13px;overflow:hidden;text-overflow:ellipsis}
.rk-world-chip small{font-size:11px;color:var(--rk-sub)}
.rk-compact .rk-world-chip{top:44px}
.rk-coach.rk-welcome{left:16px;top:auto;bottom:80px;transform:none;width:min(292px,calc(100% - 32px));padding:14px 16px;color:var(--rk-ink);background:var(--rk-panel);box-shadow:0 10px 32px rgba(36,48,74,.16)}
.rk-coach.rk-welcome b{font-size:15px}
.rk-coach.rk-welcome p{margin:4px 0 10px;font-size:13px;color:var(--rk-sub)}
.rk-coach.rk-welcome .rk-btn{display:inline-block;margin:0;box-shadow:none;color:var(--rk-ink);background:none}
.rk-coach.rk-welcome .rk-btn.on{color:#fff;background:var(--rk-acc)}
.rk-welcome-links{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:10px;font-size:12px}
.rk-welcome-links a{color:var(--rk-sub);text-decoration:none}
.rk-welcome-links a:hover{color:var(--rk-acc)}
.rk-compact .rk-coach.rk-welcome{left:8px;right:8px;width:auto;bottom:66px}
.rk-hub-who{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}
.rk-hub-who span{display:flex;flex-direction:column;min-width:0}
.rk-hub-who small,.rk-hub-card small{font-size:11.5px;color:var(--rk-sub)}
.rk-hub-card{display:flex;flex-direction:column;gap:6px;margin:8px 0;padding:10px 12px;border-radius:12px;background:rgba(77,124,243,.08)}
.rk-hub-card .rk-hint{margin:0}
.rk-hub-error{color:#c0492f}
.rk-world-card{margin:8px 0;padding:8px;border:1px solid var(--rk-line);border-radius:12px}
.rk-world-card canvas{display:block;width:100%;height:auto;border-radius:8px;background:#e7eff8}
.rk-world-card>div:first-of-type{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px}
.rk-world-card small{font-size:11.5px;color:var(--rk-sub);white-space:nowrap}
.rk-world-card p{margin:3px 0 7px;font-size:12.5px;line-height:1.5;color:var(--rk-sub)}
.rk-hub-more{margin-top:10px;font-size:13px}
.rk-hub-more summary{cursor:pointer;color:var(--rk-sub)}
.rk-hub-foot{display:flex;justify-content:space-between;gap:10px;margin-top:14px;font-size:12px}
.rk-desk .rk-top,.rk-desk .rk-dock,.rk-desk .rk-sheet,.rk-desk .rk-menu,.rk-desk .rk-coach,.rk-desk .rk-story-pill{display:none!important}
.rk-desk .rk-card,.rk-desk.rk-compact .rk-card{left:auto;right:6px;bottom:6px;width:min(236px,calc(100% - 12px));max-height:calc(100% - 12px);overflow:auto}
.rk-desk .rk-drawer{top:6px}
.rk-desk .rk-dialog{bottom:6px;width:calc(100% - 12px)}
.rk-desk .rk-canvas{cursor:grab}
.rk-desk.rk-hand .rk-canvas{cursor:pointer}
.rk-desk-btn{position:absolute;left:50%;top:4px;z-index:50;transform:translateX(-50%);width:28px;height:20px;padding:0;border-radius:999px;
  border:1px solid var(--rk-line);background:var(--rk-panel);color:var(--rk-ink);cursor:pointer;line-height:16px;opacity:0;transition:opacity .25s;
  box-shadow:0 3px 10px rgba(20,30,60,.18)}
.rk-desk.rk-desk-hover .rk-desk-btn,.rk-desk-btn:focus-visible{opacity:1}
.rk-desk-menu{position:absolute;z-index:60;display:none;flex-direction:column;min-width:140px;padding:4px;border-radius:12px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.22)}
.rk-desk-menu.on{display:flex}
.rk-desk-menu button{border:0;background:none;text-align:left;padding:5px 10px;border-radius:8px;cursor:pointer}
.rk-desk-menu button:hover{background:rgba(127,140,170,.14)}
.rk-desk-menu button.on{color:var(--rk-acc);font-weight:600}
.rk-desk-menu hr{border:0;border-top:1px solid var(--rk-line);margin:3px 6px}
`;
  var injected = false;
  function injectCss(doc = document) {
    if (injected && doc === document) return;
    const s = doc.createElement("style");
    s.setAttribute("data-roomkit", "");
    s.textContent = CSS;
    doc.head.appendChild(s);
    if (doc === document) injected = true;
  }

  // web/roomkit/memory.js
  var MAX_EVENTS = 50;
  var MAX_LINES = 3;
  var MAX_RECALL = 600;
  var Memory = class {
    constructor(key2) {
      this.key = "roomkit.memory." + key2;
      this.data = this._load();
    }
    _load() {
      try {
        const d = JSON.parse(localStorage.getItem(this.key));
        if (d && d.people && d.events) return d;
      } catch (e) {
      }
      return { people: {}, events: [] };
    }
    _save() {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.data));
      } catch (e) {
      }
    }
    /** 在帖子里碰到了谁（同一次进帖只算一次） */
    meet(m, visit) {
      const p = this.data.people[m.id] || (this.data.people[m.id] = { name: m.name, met: 0, last: 0, impression: "", lines: [] });
      p.name = m.name;
      if (!visit.met.has(m.id)) {
        visit.met.add(m.id);
        p.met++;
        p.prev = p.last;
      }
      p.last = Date.now();
      this._save();
    }
    /** 记下对方说的一句原话 */
    heard(m, text2) {
      const p = this.data.people[m.id];
      if (!p || !text2) return;
      p.lines.push(String(text2).slice(0, 60));
      if (p.lines.length > MAX_LINES) p.lines.splice(0, p.lines.length - MAX_LINES);
      this._save();
    }
    remember(ev) {
      this.data.events.push(Object.assign({ t: Date.now() }, ev));
      if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
      for (const id of ev.ids || []) if (this.data.people[id] && ev.summary) this.data.people[id].impression = ev.summary.slice(0, 60);
      this._save();
    }
    /** 给提示词用：在场的人我认不认识、上次聊了什么；这个帖子以前发生过什么 */
    recall(here, threadId) {
      const out = [];
      for (const m of here) {
        const p = this.data.people[m.id];
        if (!p || !p.met) continue;
        const days = Math.floor((Date.now() - (p.prev || p.last)) / 864e5);
        out.push(`${p.name}：见过 ${p.met} 次${p.met > 1 ? "，上次" + (days < 1 ? "是今天" : "约 " + days + " 天前") : ""}${p.impression ? "；印象：" + p.impression : ""}`);
      }
      const ids = new Set(here.map((m) => m.id));
      const evs = this.data.events.filter((e) => e.thread === threadId || (e.ids || []).some((id) => ids.has(id))).slice(-4);
      for (const e of evs) out.push(`在「${e.title}」${e.with.length ? "和" + e.with.join("、") : ""}：${e.summary}`);
      let s = out.join("\n");
      if (s.length > MAX_RECALL) s = s.slice(s.length - MAX_RECALL);
      return s;
    }
    stats() {
      return { people: Object.keys(this.data.people).length, events: this.data.events.length };
    }
    list() {
      return { people: Object.entries(this.data.people).map(([id, p]) => Object.assign({ id }, p)), events: this.data.events.slice().reverse() };
    }
    forget(id) {
      delete this.data.people[id];
      this._save();
    }
    clear() {
      this.data = { people: {}, events: [] };
      this._save();
    }
    export() {
      return JSON.stringify(this.data, null, 2);
    }
    import(text2) {
      const d = JSON.parse(text2);
      if (!d || typeof d.people !== "object" || !Array.isArray(d.events)) throw new Error("不是记忆文件");
      this.data = d;
      this._save();
    }
  };

  // shared/public-appearance.js
  var COLORS = ["accent", "belly", "body", "cheek", "dress", "dress2", "eye", "fin", "hair", "hair2", "skin", "tail"];
  function publicLook(input) {
    const look2 = {};
    for (const field of COLORS) {
      if (typeof (input == null ? void 0 : input[field]) === "string" && /^#[a-f0-9]{3,8}$/i.test(input[field])) look2[field] = input[field];
    }
    if (["maid", "bow", "cap", ""].includes(input == null ? void 0 : input.hat)) look2.hat = input.hat;
    if (Number.isFinite(input == null ? void 0 : input.size) && input.size >= 0.6 && input.size <= 2.2) look2.size = input.size;
    if ((input == null ? void 0 : input.rig) === false) look2.rig = false;
    return look2;
  }

  // web/roomkit/town.js
  var PREF = "roomkit.town";
  var AUTO_PER_HOUR = 30;
  var AI_STREAK = 10;
  var IDLE_MS = 6e4;
  var load = (key2) => {
    try {
      return JSON.parse(localStorage.getItem(key2)) || {};
    } catch (e) {
      return {};
    }
  };
  var delay2 = (ms) => new Promise((r) => setTimeout(r, ms));
  var rand2 = (a, b) => a + Math.random() * (b - a);
  var Town = class {
    constructor(app) {
      var _a, _b, _c;
      this.app = app;
      this.prefKey = ((_a = app.opts) == null ? void 0 : _a.townStorageKey) || PREF;
      const p = load(this.prefKey);
      this.fixed = !!((_b = app.opts) == null ? void 0 : _b.townUrl);
      this.url = ((_c = app.opts) == null ? void 0 : _c.townUrl) || p.url || "http://127.0.0.1:18780";
      this.token = p.token || "";
      this.char = p.char || "";
      this.legacyId = p.me || uid("m").replace(/[^a-z0-9_-]/gi, "");
      this.key = p.key || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      this.auto = p.auto !== false;
      this.stamps = (p.stamps || []).filter((t) => Date.now() - t < 36e5);
      this.online = false;
      this.error = "";
      this.cfg = null;
      this.loginAttempt = null;
      this.account = null;
      this.threads = [];
      this.sort = "active";
      this.nextOffset = null;
      this.thread = null;
      this.busy = false;
      this._save();
    }
    /** 我这只角色的记忆（按小镇地址 + 角色分开） */
    memory() {
      const k = this.url.replace(/^https?:\/\//, "") + "|" + (this.me || "anon");
      if (!this._mem || this._memKey !== k) {
        this._mem = new Memory(k);
        this._memKey = k;
      }
      return this._mem;
    }
    /** 我的角色 id：登录模式用服务器分配的，原型模式用本机生成的 */
    get me() {
      return this.cfg && !this.cfg.legacy ? this.char : this.legacyId;
    }
    _save() {
      try {
        localStorage.setItem(this.prefKey, JSON.stringify({ url: this.url, token: this.token, char: this.char, me: this.legacyId, key: this.key, auto: this.auto, stamps: this.stamps }));
      } catch (e) {
      }
    }
    _changed() {
      const s = this.app.shell;
      if (s && (s.page === "social" || s.page === "town" || s.page === "legacy")) s.render();
    }
    async call(ep, body, options) {
      const headers = { "content-type": "application/json" };
      if (this.token) headers.authorization = "Bearer " + this.token;
      const r = await fetch(this.url + "/api/" + ep, { method: "POST", headers, signal: options == null ? void 0 : options.signal, body: JSON.stringify(Object.assign({ me: this.me, key: this.key }, body)) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 && this.token) {
        this.token = "";
        this._save();
      }
      if (!r.ok) throw Object.assign(new Error(d.error || "HTTP " + r.status), { status: r.status, code: d.code });
      return d;
    }
    /** 主角：用她的名字和样子在小镇上露面 */
    _self() {
      const a = this.app.mainAgent(), d = a && a.data || {};
      return { a, name: a && a.name || "角色", kind: d.kind || "girl", look: publicLook(d.look), character: d.character || null };
    }
    /** 连接：先问小镇要不要登录；要登录但还没有令牌时停在“请登录”，等 login() */
    async connect(url) {
      var _a, _b;
      if (url) {
        const next = String(url).replace(/\/+$/, "");
        if (next !== this.url) {
          this.token = "";
          this.char = "";
        }
        this.url = next;
      }
      this._save();
      this.disconnect();
      const s = this.self = this._self();
      try {
        this.cfg = await this.call("config", {});
        this.reasons = this.cfg.reasons || [];
        if (this.cfg.legacy) {
          const r = await this.call("hello", { name: s.name, kind: s.kind, look: s.look });
          this.threads = r.threads;
          this.nextOffset = (_a = r.nextOffset) != null ? _a : null;
          this.meInfo = r.me;
          this.account = null;
        } else {
          if (!this.token) {
            this.error = "";
            this._changed();
            return false;
          }
          const r = await this.call("me", {});
          let c;
          if (this.app.opts.site) {
            this.identity = await this.call("accountBootstrap", {});
            c = this.identity.characters.find((x) => x.id === this.char) || this.identity.characters.find((x) => x.id === this.identity.defaultCharacterId);
          } else {
            const known = r.characters.find((x) => x.id === this.char);
            c = (await this.call("character", { me: known ? this.char : "", name: s.name, kind: s.kind, look: s.look })).character;
          }
          this.char = c.id;
          this._save();
          this.account = r.account;
          this.threads = r.threads;
          this.nextOffset = (_b = r.nextOffset) != null ? _b : null;
          this.meInfo = { id: c.id, roles: r.roles, ban: r.ban };
        }
        this.online = true;
        this.error = "";
      } catch (e) {
        this.online = false;
        this.error = e.message === "Failed to fetch" ? this.fixed ? "世界暂时连不上" : "连不上小镇（先运行 npm run town）" : e.message;
        this._changed();
        return false;
      }
      const q = new URLSearchParams(this.token ? { token: this.token, me: this.me } : { me: this.me, key: this.key });
      const es = this.es = new EventSource(this.url + "/events?" + q);
      const refreshThreads = () => {
        if (this.es !== es || this._threadRefresh) return;
        this._threadRefresh = setTimeout(() => {
          this._threadRefresh = null;
          if (this.es === es) this.sortBy(this.sort).catch(() => {
          });
        }, 150);
      };
      es.addEventListener("threads", refreshThreads);
      es.addEventListener("presence", (e) => {
        const d = JSON.parse(e.data);
        if (this.thread && d.thread === this.thread.id) {
          this.thread.here = d.here;
          this._cast();
          this._changed();
        }
      });
      es.addEventListener("post", (e) => {
        const d = JSON.parse(e.data);
        if (this.thread && d.thread === this.thread.id) this._onPost(d.post);
      });
      es.addEventListener("likes", (e) => {
        const d = JSON.parse(e.data);
        const p = this.thread && d.thread === this.thread.id && this.thread.posts.find((x) => x.id === d.post);
        if (p) {
          p.likes = d.likes;
          this._changed();
        }
      });
      es.addEventListener("hidden", (e) => {
        const d = JSON.parse(e.data);
        if (this.thread && d.thread === this.thread.id) {
          this.thread.posts = this.thread.posts.filter((p) => p.id !== d.post);
          this._changed();
        }
      });
      es.addEventListener("kicked", (e) => {
        const d = JSON.parse(e.data);
        if (this.thread && (!d.thread || d.thread === this.thread.id)) {
          this.app.hud.toast(d.thread ? "你被请出了这个帖子" : "账号已被封禁", 3e3);
          this.leave();
        }
      });
      es.addEventListener("sessionEnded", () => {
        if (this.es !== es) return;
        this.disconnect();
        this.token = "";
        this.account = null;
        this.meInfo = null;
        this.identity = null;
        this._save();
        this.error = "小镇登录已结束，请重新连接";
        this.leave(true).catch(() => {
        });
        this._changed();
      });
      es.onerror = () => {
        this.online = es.readyState === EventSource.OPEN;
        if (es.readyState === EventSource.CLOSED) this.error = "小镇连接已关闭，请重新连接";
        this._changed();
      };
      es.onopen = () => {
        this.online = true;
        this.error = "";
        refreshThreads();
        const previous = this.thread;
        if (previous) this.call("join", { thread: previous.id }).then(() => this.call("get", { thread: previous.id })).then(({ thread }) => {
          if (this.es !== es || this.thread !== previous) return;
          Object.assign(previous, { here: thread.here, posts: thread.posts, likes: thread.likes, liked: thread.liked });
          this._cast();
          this._changed();
        }).catch(() => {
        });
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
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
      const url = new URL(this.url + "/auth/" + encodeURIComponent(provider) + "/start");
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("小镇地址不合法");
      url.searchParams.set("nonce", nonce);
      const popup = window.open(url.href, "town-login", "width=520,height=680");
      const attempt = this.loginAttempt = { fallbackUrl: popup ? "" : url.href };
      this._changed();
      try {
        for (let i = 0; i < 150; i++) {
          await delay2(2e3);
          if (this.loginAttempt !== attempt) return false;
          const r = await this.call("authPoll", { nonce });
          if (this.loginAttempt !== attempt) return false;
          if (r.token) {
            this.token = r.token;
            this._save();
            return this.connect();
          }
        }
        throw new Error("登录等太久了，再试一次");
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
      try {
        await this.call("logout", {});
      } catch (e) {
      }
      this.token = "";
      this.account = null;
      this.meInfo = null;
      this.identity = null;
      this._save();
      this.disconnect();
      this._changed();
    }
    disconnect() {
      this.loginAttempt = null;
      if (this.es) {
        this.es.close();
        this.es = null;
      }
      clearTimeout(this._threadRefresh);
      this._threadRefresh = null;
      this._threadRequest = null;
      this.online = false;
    }
    /* ───────── 进出帖子（= 进出场景） ───────── */
    async enter(id) {
      const app = this.app;
      if (this.thread) await this.leave(true);
      const { thread } = await this.call("get", { thread: id });
      let scene = thread.scene;
      if (!scene) {
        const p = app.packs.find((x) => (x.scenes || []).some((s) => s.id === thread.sceneRef));
        scene = p && p.scenes.find((s) => s.id === thread.sceneRef);
      }
      if (!scene) throw new Error("这个帖子没有场景");
      scene = clone(scene);
      scene.id = "town-" + thread.id;
      scene.name = thread.title;
      scene.agents = [];
      if (app.opts.autosave) app.storage.save(app.world.toJSON());
      this.homeId = app.world.scene.id;
      this._autosave = app.opts.autosave;
      app.opts.autosave = false;
      app.visiting = thread.id;
      this.thread = { id: thread.id, title: thread.title, posts: thread.posts, here: thread.here, liked: thread.liked, likes: thread.likes };
      this.visit = { met: /* @__PURE__ */ new Set(), from: thread.posts.length };
      await app.shell.curtain(true, "帖子 · " + thread.title);
      app.openScene(scene, { followers: [] });
      await app.shell.curtain(false);
      await this.call("join", { thread: thread.id });
      this._lastActivity = Date.now();
      this._idle = setInterval(() => this._idleTick(), 15e3);
      this._changed();
    }
    async leave(quiet) {
      const app = this.app, t = this.thread;
      if (!t) return;
      clearInterval(this._idle);
      this.thread = null;
      this._summarize(t).catch(() => {
      });
      this.call("leave", { thread: t.id }).catch(() => {
      });
      const home = app.home.sceneFor(this.homeId) || app.storage.load(this.homeId);
      if (!quiet) await app.shell.curtain(true, "回家");
      if (home) app.openScene(home, { followers: [] });
      app.opts.autosave = this._autosave;
      app.visiting = null;
      if (!quiet) await app.shell.curtain(false);
      this._changed();
    }
    async create(title) {
      const app = this.app, s = app.world.toJSON();
      const { thread } = await this.call("create", { title, scene: s });
      await this.enter(thread.id);
    }
    /** 在场成员 ↔ 场景里的角色：来了从门口进，走了就消失 */
    _cast() {
      const app = this.app, t = this.thread;
      if (!t) return;
      const want = new Map((t.here || []).map((m) => ["tm_" + m.id, m]));
      for (const a of [...app.agents.values()]) if (a.id.startsWith("tm_") && !want.has(a.id)) app.command({ op: "agent.remove", id: a.id });
      for (const [id, m] of want) {
        if (app.agents.has(id)) continue;
        const mine = m.id === this.me;
        if (!mine && this.visit) this.memory().meet(m, this.visit);
        app.command({ op: "agent.add", agent: { id, name: m.name, kind: m.kind, look: m.look, brain: "auto", ephemeral: true, character: mine ? this.self.character : void 0 } });
        const a = app.agents.get(id);
        if (a && !mine) a.say("来啦~", 2e3);
      }
    }
    myAgent() {
      return this.app.agents.get("tm_" + this.me) || null;
    }
    /* ───────── 回帖 ───────── */
    _onPost(p) {
      const app = this.app, t = this.thread;
      const old = t.posts.findIndex((x) => x.id === p.id);
      if (old >= 0) {
        t.posts[old] = p;
        this._changed();
        return;
      }
      t.posts.push(p);
      if (t.posts.length > 200) t.posts.splice(0, t.posts.length - 200);
      this._lastActivity = Date.now();
      const mine = p.by && p.by.id === this.me;
      const a = p.by && app.agents.get("tm_" + p.by.id);
      if (a && (!mine || p.human)) {
        if (p.text) a.say(p.text, Math.min(7e3, 1800 + p.text.length * 120));
        if (!mine) app.applyActs(a, p.acts || []);
      }
      this._changed();
      if (!mine && p.by && p.text) this.memory().heard(p.by, p.text);
      if (!mine) this._maybeReply();
    }
    /** 我用角色的身份说一句 */
    async say(text2) {
      text2 = String(text2 || "").trim().slice(0, 200);
      if (!text2 || !this.thread) return;
      await this.call("post", { thread: this.thread.id, text: text2, human: true });
    }
    _budget() {
      this.stamps = this.stamps.filter((t) => Date.now() - t < 36e5);
      return this.stamps.length < AUTO_PER_HOUR;
    }
    _aiStreak() {
      let n = 0;
      for (let i = this.thread.posts.length - 1; i >= 0 && !this.thread.posts[i].human; i--) n++;
      return n;
    }
    async _maybeReply(opening) {
      const t = this.thread;
      if (!t || !this.auto || this.busy || !this._budget() || !this.myAgent()) return;
      if (!opening && this._aiStreak() >= AI_STREAK && Math.random() < 0.8) return;
      const others = (t.here || []).filter((m) => m.id !== this.me).length;
      if (!opening && Math.random() > (others > 1 ? 0.6 : 0.9)) return;
      this.busy = true;
      try {
        await delay2(rand2(2500, 6e3));
        if (this.thread !== t) return;
        const last = t.posts[t.posts.length - 1];
        if (!opening && last && last.by && last.by.id === this.me) return;
        const a = this.myAgent();
        const history2 = t.posts.slice(-12).map((p) => ({ role: p.by && p.by.id === this.me ? "assistant" : "user", who: p.by ? p.by.name : "", text: p.text }));
        const prompt2 = opening || !last ? "（帖子里安静了一会儿。你可以开个轻松的话题，或者招呼一下在场的人。）" : (last.by ? last.by.name + "：" : "") + last.text;
        const res = await this.app.chat(a, prompt2, opening ? history2 : history2.slice(0, -1), { thread: t.title, memory: this.memory().recall((t.here || []).filter((m) => m.id !== this.me), t.id) });
        if (this.thread !== t || !res || !res.text && !(res.acts || []).length) return;
        this.stamps.push(Date.now());
        this._save();
        await this.call("post", { thread: t.id, text: res.text, acts: res.acts || [] });
      } catch (e) {
        this.error = e.message;
        this._changed();
      } finally {
        this.busy = false;
      }
    }
    /**
     * 离开帖子：这次聊了什么记成一条。有模型就让她自己用一句话总结（一次模型调用，计入额度），
     * 没有就记最后一句原话。没人说话、或只有我自己在，就不记。
     */
    async _summarize(t) {
      const v = this.visit;
      this.visit = null;
      if (!v) return;
      const posts = t.posts.slice(v.from).filter((p) => p.text);
      const others = [...new Map(posts.filter((p) => p.by && p.by.id !== this.me).map((p) => [p.by.id, p.by.name])).entries()];
      if (!posts.length || !others.length) return;
      let summary = "";
      const a = this.app.mainAgent();
      if (this.app.ext.chat && a && this._budget()) {
        const log = posts.slice(-16).map((p) => (p.by ? p.by.name : "?") + "：" + p.text).join("\n");
        const res = await this.app.chat(a, "（刚才在帖子「" + t.title + "」里的对话：\n" + log + "\n请用一句话记下这次聊了什么、对谁有什么印象，写给以后的自己看，不超过 50 字，不要动作标记。）", [], { silent: true });
        if (res && res.text && !res.note) {
          summary = res.text.slice(0, 80);
          this.stamps.push(Date.now());
          this._save();
        }
      }
      if (!summary) {
        const last = posts[posts.length - 1];
        summary = "聊了 " + posts.length + " 句，最后" + (last.by ? last.by.name : "") + "说「" + last.text.slice(0, 30) + "」";
      }
      this.memory().remember({ thread: t.id, title: t.title, ids: others.map((x) => x[0]), with: others.map((x) => x[1]), summary });
    }
    _idleTick() {
      if (!this.thread || Date.now() - this._lastActivity < IDLE_MS) return;
      if (Math.random() < 0.35) {
        this._lastActivity = Date.now();
        this._maybeReply(true);
      }
    }
    /* ───────── 举报与管理 ───────── */
    roles() {
      return this.meInfo && this.meInfo.roles || [];
    }
    isStaff() {
      return this.roles().some((r) => r.role === "owner" || r.role === "admin");
    }
    /** 当前帖子里我能不能锁帖、请人离开：帖主、管理员、这个帖子的版主 */
    canManageThread() {
      const t = this.thread, info = t && this.threads.find((x) => x.id === t.id);
      return !!t && (info && info.owner && info.owner.id === this.me || this.isStaff() || this.roles().some((r) => r.role === "mod" && r.scope === t.id));
    }
    /** 点赞（只有人点，角色不会自己点）：target = p:回帖 / t:帖子 */
    async like(target) {
      const t = this.thread, [kind, id] = target.split(":");
      const obj = kind === "p" ? t && t.posts.find((x) => x.id === id) : t;
      const on = !(obj && obj.liked);
      const r = await this.call("like", { target, on });
      if (obj) {
        obj.liked = r.on;
        obj.likes = r.likes;
      }
      this._changed();
    }
    async sortBy(sort, append = false) {
      const offset = append ? this.nextOffset : 0;
      if (offset == null) return;
      const url = this.url;
      const request = this._threadRequest = {};
      this.sort = sort;
      const { threads, nextOffset } = await this.call("threads", { sort, offset });
      if (this._threadRequest !== request || this.url !== url) return;
      if (append) {
        const known = new Set(this.threads.map(({ id }) => id));
        this.threads.push(...threads.filter(({ id }) => !known.has(id)));
      } else this.threads = threads;
      this.nextOffset = nextOffset != null ? nextOffset : null;
      this._changed();
    }
    report(target, reason, note) {
      return this.call("report", { target, reason, note });
    }
    lock(on) {
      return this.call("lock", { thread: this.thread.id, locked: !!on });
    }
    kick(member) {
      return this.call("kick", { thread: this.thread.id, member });
    }
    adminQueue() {
      return this.call("adminQueue", {});
    }
    adminAct(body) {
      return this.call("adminAct", body);
    }
    setAuto(on) {
      this.auto = !!on;
      this._save();
      this._changed();
    }
    usage() {
      this._budget();
      return { used: this.stamps.length, max: AUTO_PER_HOUR };
    }
  };

  // web/roomkit/world-drafts.js
  var WorldView = class {
    constructor(app) {
      this.app = app;
      this.home = null;
    }
    open(release, catalog, label = "world-preview") {
      const app = this.app;
      if (this.home || app.visiting) throw new Error("请先回家再进入另一个世界");
      this.home = { scene: app.world.toJSON(), catalog: app.world.catalog, autosave: app.opts.autosave, stories: app.opts.stories, mode: app.mode };
      if (this.home.autosave) app.storage.save(this.home.scene);
      app.opts.autosave = false;
      app.opts.stories = false;
      app.visiting = label;
      app.world.catalog = catalog;
      try {
        app.setMode("play");
        app.openScene(release.scene, { followers: [] });
      } catch (error) {
        this.close();
        throw error;
      }
    }
    close() {
      const saved = this.home;
      if (!saved) return;
      this.home = null;
      const app = this.app;
      app.world.catalog = saved.catalog;
      app.visiting = null;
      try {
        app.openScene(saved.scene, { followers: [] });
        app.setMode(saved.mode);
      } finally {
        app.opts.autosave = saved.autosave;
        app.opts.stories = saved.stories;
      }
    }
  };
  var WorldDrafts = class {
    constructor(app) {
      this.app = app;
      this.store = app.opts.draftStore || new PackStore((app.opts.storageKey || "roomkit") + "-world-drafts");
      this.view = new WorldView(app);
    }
    async capture({ id, title, activity = null, author, license } = {}) {
      if (this.app.visiting) throw new Error("请先回到自己的房间");
      const scene = this.app.world.toJSON();
      const packs = collectWorldPacks(scene, this.app.packs, { author, license });
      return buildWorldRelease({
        worldId: id || globalThis.crypto.randomUUID(),
        title: title || scene.name,
        revision: 1,
        authorAccountId: "local",
        scene,
        packs,
        activity
      });
    }
    async save(options = {}) {
      const previous = (await this.store.list()).filter(({ release: release2 }) => {
        var _a;
        return ((_a = release2 == null ? void 0 : release2.scene) == null ? void 0 : _a.id) === this.app.world.scene.id;
      }).sort((a, b) => b.updated - a.updated)[0];
      const release = await this.capture({ id: previous == null ? void 0 : previous.id, ...options });
      await this.store.put({ id: release.worldId, updated: Date.now(), release });
      return release;
    }
    async import(input) {
      const valid = await verifyWorldRelease(input);
      const release = await buildWorldRelease({ ...valid, worldId: globalThis.crypto.randomUUID(), revision: 1, authorAccountId: "local" });
      await this.store.put({ id: release.worldId, updated: Date.now(), release });
      return release;
    }
    async latest() {
      const drafts = await this.store.list();
      const draft = drafts.sort((a, b) => b.updated - a.updated)[0];
      if (!draft) throw new Error("还没有保存过世界草稿");
      return draft.release;
    }
    async preview(input) {
      const release = await verifyWorldRelease(input);
      const { catalog } = worldRuntime(release, globalThis.RoomKitAssets);
      this.view.open(release, catalog);
      if (this.app.opts.site) this.app.shell.hub.entered();
      else if (this.app.shell.page === "social") this.app.shell.render();
      else this.app.shell.open("social");
      return release;
    }
  };

  // shared/session-core.js
  var EMOTES = /* @__PURE__ */ new Set(["wave", "dance", "jump", "look"]);
  var SESSION_TEXT = 200;
  function sessionError(code, message) {
    return Object.assign(new Error(message), { code });
  }
  function cleanAction(op, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw sessionError("invalid_action", "操作参数不合法");
    let clean2;
    switch (op) {
      case "move": {
        const { x, y } = args;
        if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v < 40)) throw sessionError("invalid_action", "移动坐标不合法");
        clean2 = { x, y };
        break;
      }
      case "interact":
        if (typeof args.objectId !== "string" || !args.objectId || args.objectId.length > 80) throw sessionError("invalid_action", "物件 id 不合法");
        clean2 = { objectId: args.objectId };
        break;
      case "say": {
        if (typeof args.text !== "string" || args.text.length > SESSION_TEXT) throw sessionError("invalid_action", "发言文字超限");
        const text2 = args.text.replace(/[\u0000-\u001f]/g, " ").trim();
        if (!text2) throw sessionError("invalid_action", "发言为空");
        clean2 = { text: text2 };
        break;
      }
      case "emote":
        if (!EMOTES.has(args.name)) throw sessionError("invalid_action", "表情动作不受支持");
        clean2 = { name: args.name };
        break;
      default:
        throw sessionError("invalid_action", "操作不受支持");
    }
    if (Object.keys(args).some((field) => !Object.hasOwn(clean2, field))) throw sessionError("invalid_action", "含未定义的操作参数");
    return clean2;
  }
  function applySessionEvent(state, event) {
    if (event.sessionId !== state.sessionId || event.epoch !== state.epoch || event.seq !== state.seq + 1) {
      throw sessionError("resync_required", "事件与本地场次状态不连续");
    }
    const next = { ...state, seq: event.seq };
    const { type, payload, actorCharacterId } = event;
    switch (type) {
      case "session.status":
        next.status = payload.status;
        if (next.status === "ended") next.participants = state.participants.map((participant) => ({ ...participant, online: false }));
        break;
      case "member.changed": {
        const index = state.participants.findIndex(({ characterId }) => characterId === actorCharacterId);
        next.participants = [...state.participants];
        if (index < 0) next.participants.push(payload.participant);
        else next.participants[index] = payload.participant;
        break;
      }
      case "member.removed":
        next.participants = state.participants.filter(({ characterId }) => characterId !== actorCharacterId);
        break;
      case "actor.moved":
        next.participants = state.participants.map((actor) => actor.characterId === actorCharacterId ? { ...actor, ...payload } : actor);
        break;
      case "beacon.lit":
        next.activity = { ...state.activity, contributions: [...state.activity.contributions, { beaconId: payload.beaconId, characterId: actorCharacterId }] };
        break;
      case "activity.completed":
        next.activity = { ...state.activity, completion: { ...payload, seq: event.seq } };
        break;
      case "actor.said":
        next.recent = [...state.recent.slice(-39), event];
        break;
      case "actor.said.removed":
        next.recent = state.recent.filter(({ seq: seq2 }) => seq2 !== payload.seq);
        break;
      case "actor.emoted":
        break;
      default:
        throw sessionError("resync_required", "收到不支持的事件");
    }
    return next;
  }

  // web/roomkit/agent-adapter.js
  var HOUR = 36e5;
  var BUDGET = 12;
  function intentFrom(text2) {
    let intent;
    try {
      intent = JSON.parse(text2.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
    } catch {
      throw new Error("模型未返回可识别的动作");
    }
    if ((intent == null ? void 0 : intent.op) === "none") return null;
    return { op: intent == null ? void 0 : intent.op, args: cleanAction(intent == null ? void 0 : intent.op, intent == null ? void 0 : intent.args) };
  }
  var AgentAdapter = class {
    constructor(transport, storage) {
      this.transport = transport;
      this.storage = storage;
      const stamps = storage == null ? void 0 : storage.pref("worldModelStamps");
      this.stamps = Array.isArray(stamps) ? stamps.filter(Number.isFinite).slice(-BUDGET) : [];
      this.backoffUntil = 0;
      this.failures = 0;
    }
    describeCapabilities() {
      var _a;
      const status = ((_a = this.transport) == null ? void 0 : _a.describeCapabilities()) || { available: false, name: "手动模式" };
      this.stamps = this.stamps.filter((stamp) => stamp > Date.now() - HOUR);
      return { ...status, used: this.stamps.length, limit: BUDGET, busy: Boolean(this.pending) };
    }
    async refresh() {
      var _a, _b;
      await ((_b = (_a = this.transport) == null ? void 0 : _a.refresh) == null ? void 0 : _b.call(_a));
      return this.describeCapabilities();
    }
    async generate(kind, data, context) {
      var _a;
      const status = this.describeCapabilities();
      if (!status.available) throw new Error("模型未连接，可手动操作");
      if (this.pending) throw new Error("模型正在处理上一条请求");
      if (status.used >= BUDGET) throw new Error("本小时模型额度已用完");
      if (this.backoffUntil > Date.now()) throw new Error("模型暂时不可用，稍后可重试");
      const pending = this.pending = new AbortController();
      const signal = AbortSignal.any([pending.signal, AbortSignal.timeout(45e3)]);
      this.stamps.push(Date.now());
      (_a = this.storage) == null ? void 0 : _a.pref("worldModelStamps", this.stamps);
      try {
        const text2 = await this.transport.generate({ kind, data, context }, signal);
        signal.throwIfAborted();
        if (typeof text2 !== "string" || !text2.trim()) throw new Error("模型没有返回正文");
        const result = kind === "decide" ? intentFrom(text2) : text2.trim().slice(0, 160);
        this.failures = 0;
        this.backoffUntil = 0;
        return result;
      } catch (error) {
        if (!pending.signal.aborted) {
          this.failures++;
          this.backoffUntil = Date.now() + Math.min(6e4, 2 ** this.failures * 1e3);
        }
        throw error;
      } finally {
        if (this.pending === pending) this.pending = null;
      }
    }
    decide(observation, context) {
      return this.generate("decide", observation, context);
    }
    summarize(facts, context) {
      return this.generate("summarize", facts, context);
    }
    cancel() {
      var _a;
      (_a = this.pending) == null ? void 0 : _a.abort();
    }
  };

  // web/roomkit/world-session.js
  var VIEW_COMMANDS = /* @__PURE__ */ new Set(["agent.list", "object.list", "scene.get", "camera.fit", "room.list", "room.describe", "ui.open", "ui.close", "ui.toast"]);
  var WorldSession = class {
    constructor(app) {
      this.app = app;
      this.state = null;
      this.connected = false;
      this.controlKey = null;
      this.flow = null;
      this.error = "";
      this.agent = new AgentAdapter(app.ext.worldAgent, app.storage);
      this.experiences = new ExperienceStore(app.opts.storageKey || "roomkit");
      this.auto = false;
    }
    get id() {
      var _a;
      return (_a = this.state) == null ? void 0 : _a.sessionId;
    }
    get canAct() {
      var _a;
      return this.connected && !!this.controlKey && ((_a = this.state) == null ? void 0 : _a.status) === "active" && this.state.participants.some(({ characterId, online }) => characterId === this.characterId && online);
    }
    call(method, body) {
      if (this.serviceUrl !== this.app.town.url) return Promise.reject(new Error("小镇地址已改变"));
      return this.app.town.call(method, body, { signal: AbortSignal.timeout(15e3) });
    }
    async chooseRole(localAgentId) {
      var _a, _b, _c;
      const local = localAgentId ? this.app.agents.get(localAgentId) : this.app.mainAgent();
      if (!local || local.data.ephemeral) throw new Error("请先选择一个本机角色");
      if (!local.data.localCharacterId) {
        local.data.localCharacterId = globalThis.crypto.randomUUID();
        this.app._autosave();
      }
      this.localRole = local.data;
      this.localCharacter = this.app.characterOf(local);
      this.localCharacterId = local.data.localCharacterId;
      const town = this.app.town;
      if ((_a = town.cfg) == null ? void 0 : _a.legacy) return town.me;
      if (this.app.opts.site) return town.char;
      const { account, characters } = await this.call("me", {});
      town.account = account;
      const saved = this.app.storage.pref("worldRoleLinks");
      const links = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
      const groupKey = new URL(this.serviceUrl).origin + "|" + account.id;
      const group = { ...links[groupKey] };
      const linked = group[this.localCharacterId];
      let id = (_b = characters.find((role) => role.id === linked)) == null ? void 0 : _b.id;
      if (!id && !Object.values(group).includes(town.char)) id = (_c = characters.find((role) => role.id === town.char)) == null ? void 0 : _c.id;
      const publicProfile = { name: local.name, kind: local.data.kind, look: publicLook(local.look) };
      const current = characters.find((role) => role.id === id);
      if (!current || current.name !== publicProfile.name || current.kind !== publicProfile.kind || JSON.stringify(current.look) !== JSON.stringify(publicProfile.look)) {
        id = (await this.call("character", { me: id || "", ...publicProfile })).character.id;
      }
      group[this.localCharacterId] = id;
      this.app.storage.pref("worldRoleLinks", { ...links, [groupKey]: group });
      return id;
    }
    async enter(sessionId, { localAgentId } = {}) {
      if (this.flow || this.app.visiting) throw new Error("请先回到自己的房间");
      const flow = this.flow = {};
      this.serviceUrl = this.app.town.url;
      let joined;
      try {
        const { release: raw } = await this.call("worldGet", { sessionId });
        const release = await verifyWorldRelease(raw);
        const runtime = worldRuntime(release, globalThis.RoomKitAssets);
        const { state } = await this.call("worldSnapshot", { sessionId });
        this.platformCharacterId = await this.chooseRole(localAgentId);
        if (state.status === "paused") await this.call("worldResume", { sessionId });
        if (this.flow !== flow) throw new Error("入场已取消");
        joined = await this.call("worldJoin", { sessionId, me: this.platformCharacterId });
        if (this.flow !== flow) throw new Error("入场已取消");
        this.release = release;
        this.runtime = runtime;
        this.characterId = joined.characterId;
        this.controlKey = joined.controlKey;
        this.controlGeneration = joined.controlGeneration;
        this.state = joined.state;
        this.experienceError = "";
        this.visit = {
          v: 1,
          id: globalThis.crypto.randomUUID(),
          title: release.title,
          localCharacterId: this.localCharacterId,
          source: { serviceId: serviceOrigin(this.serviceUrl), worldId: release.worldId, revision: release.revision, sessionId },
          participants: [],
          facts: [],
          outcome: "partial",
          reflection: { text: "", status: "fallback" },
          createdAt: Date.now()
        };
        try {
          const legacy = new Memory(this.serviceUrl.replace(/^https?:\/\//, "") + "|" + this.platformCharacterId);
          this.experiences.importLegacy(this.localCharacterId, this.serviceUrl, legacy.data.events);
        } catch (error) {
          this.experienceError = error.message;
        }
        this.applying = true;
        try {
          this.app.worldDrafts.view.open(release, runtime.catalog, "world-session");
        } finally {
          this.applying = false;
        }
        this.snapshot(joined.state);
        await this.connect(flow);
        this.agent.refresh().then(() => {
          if (this.flow === flow) this.changed();
        }).catch(() => {
        });
        this.app.storage.pref("worldLastSession", { sessionId, service: this.app.town.url, localAgentId: this.localRole.id });
        if (this.app.opts.site) this.app.shell.hub.entered();
        else if (this.app.shell.page === "social") this.app.shell.render();
        else this.app.shell.open("social");
        return this.state;
      } catch (error) {
        if (this.flow === flow) await this.leave();
        else if (joined == null ? void 0 : joined.controlKey) this.call("worldLeave", { sessionId, controlKey: joined.controlKey }).catch(() => {
        });
        throw error;
      }
    }
    async connect(flow) {
      const { sessionId, epoch, seq: seq2 } = this.state;
      const { ticket } = await this.call("worldStreamTicket", { sessionId, epoch, after: seq2 });
      if (this.flow !== flow) return;
      const source = this.source = new EventSource(this.app.town.url + "/world-events?" + new URLSearchParams({ ticket }));
      await new Promise((resolve, reject) => {
        let synced = false;
        const finish2 = (error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const lost = () => {
          if (this.source !== source) {
            finish2(new Error("订阅已关闭"));
            return;
          }
          source.close();
          this.source = null;
          this.connected = false;
          this.stopAI();
          if (!synced) finish2(new Error("连接场次失败"));
          else {
            this.error = "连接中断，正在尝试恢复";
            this.retry(flow);
            this.changed();
          }
        };
        const timer = setTimeout(lost, 7e3);
        this.endConnect = () => finish2(new Error("订阅已关闭"));
        source.onerror = lost;
        source.addEventListener("sync", (message) => {
          var _a;
          if (this.source !== source) return;
          try {
            const data = JSON.parse(message.data);
            if (data.state) this.snapshot(data.state);
            else this.accept(data.events);
            this.connected = true;
            this.error = "";
            synced = true;
            finish2();
            this.changed();
            if ((_a = this.state) == null ? void 0 : _a.activity.completion) this.claimCompletion().catch(() => {
            });
          } catch {
            lost();
          }
        });
        source.addEventListener("event", (message) => {
          if (this.source === source) this.accept([JSON.parse(message.data)]);
        });
        source.addEventListener("review", (message) => {
          if (this.source !== source) return;
          this.speechReview = JSON.parse(message.data);
          this.changed();
        });
        source.addEventListener("resync", () => this.sync().catch(() => lost()));
        source.addEventListener("control", (message) => {
          const { generation } = JSON.parse(message.data);
          if (this.source !== source || generation <= this.controlGeneration) return;
          this.controlGeneration = generation;
          this.controlKey = null;
          this.stopAI();
          this.error = "角色已由另一个窗口接管";
          this.changed();
        });
        source.addEventListener("accessLost", (message) => {
          if (this.source !== source) return;
          const { reason } = JSON.parse(message.data);
          this.leave({ notify: false }).catch(() => {
          });
          this.app.hud.toast(reason === "ended" ? "场次已结束" : "本场访问权限已结束", 3e3);
        });
      }).finally(() => {
        if (this.source === source) this.endConnect = null;
      });
    }
    retry(flow) {
      clearTimeout(this.reconnectTimer);
      if (this.flow !== flow) return;
      this.reconnectTimer = setTimeout(() => {
        if (this.flow !== flow) return;
        this.connect(flow).catch((error) => {
          if (error.status === 401 || error.status === 403 || error.status === 409) {
            this.leave({ notify: false }).catch(() => {
            });
            this.app.hud.toast(error.message, 3e3);
          } else this.retry(flow);
        });
      }, 1200);
    }
    async sync() {
      if (!this.state) return;
      if (this.syncing) return this.syncing;
      const flow = this.flow;
      const { sessionId, epoch, seq: seq2 } = this.state;
      const operation = this.call("worldReplay", { sessionId, epoch, after: seq2 }).then((data) => {
        if (this.flow !== flow) return;
        if (data.state) this.snapshot(data.state);
        else this.accept(data.events, false);
      });
      this.syncing = operation;
      try {
        await operation;
      } finally {
        if (this.syncing === operation) this.syncing = null;
        if (this.flow === flow && this.wantsSync) {
          this.wantsSync = false;
          this.sync().catch(() => {
          });
        }
      }
    }
    accept(events, sync = true) {
      for (const event of events || []) {
        if (!this.state || event.sessionId !== this.id || event.seq <= this.state.seq) continue;
        try {
          this.state = applySessionEvent(this.state, event);
        } catch {
          if (sync) {
            if (this.syncing) this.wantsSync = true;
            else this.sync().catch(() => {
            });
          }
          return;
        }
        this.visual(event);
        if (["member.changed", "beacon.lit", "activity.completed"].includes(event.type)) this.recordExperience(event);
        this.app.bus.emit("world:committed", event);
      }
      if (events == null ? void 0 : events.length) this.queueAI();
      this.changed();
    }
    snapshot(state) {
      if (!this.state || state.sessionId !== this.id || state.epoch < this.state.epoch || state.seq < this.state.seq) return;
      if (state.epoch !== this.state.epoch) this.stopAI();
      this.state = state;
      this.actors(true);
      this.paintActivity();
      this.recordExperience();
      if (state.status !== "active") this.stopAI();
      this.app.bus.emit("world:snapshot", state);
      this.changed();
      if (this.connected && state.activity.completion) this.claimCompletion().catch(() => {
      });
    }
    actors(reset) {
      var _a;
      const app = this.app;
      app.world.scene.agents = this.state.participants.filter(({ online }) => online).map((actor) => ({
        ...actor,
        id: actor.characterId,
        brain: "manual",
        ephemeral: true
      }));
      app._syncAgents(false);
      if (!reset) return;
      for (const { characterId, x, y } of this.state.participants) {
        const agent = app.agents.get(characterId);
        if (agent) {
          agent.cancel();
          agent.x = x;
          agent.y = y;
          if (((_a = agent.speech) == null ? void 0 : _a.seq) && !this.state.recent.some(({ seq: seq2 }) => seq2 === agent.speech.seq)) agent.say("");
        }
      }
    }
    paintActivity() {
      const activity = this.release.activity;
      if (!activity) return;
      const lit = new Set(this.state.activity.contributions.map(({ beaconId }) => beaconId));
      this.applying = true;
      try {
        for (const id of activity.beaconIds) this.app.world.apply({ t: "state", id, patch: { on: lit.has(id) } }, { silent: true });
        this.app.world.apply({ t: "state", id: activity.exitId, patch: { open: Boolean(this.state.activity.completion) } }, { silent: true });
      } finally {
        this.applying = false;
      }
    }
    visual(event) {
      var _a;
      const agent = this.app.agents.get(event.actorCharacterId);
      const { type, payload } = event;
      if (type === "member.changed" || type === "member.removed" || type === "session.status") this.actors(false);
      if (type === "session.status" && this.state.status !== "active") this.stopAI();
      if (type === "actor.moved" && agent) {
        Object.assign(agent.data, payload);
        if (this.app.reduceMotion) {
          agent.cancel();
          Object.assign(agent, payload);
        } else agent.walkTo(payload.x, payload.y);
      }
      if (type === "actor.said" && agent) {
        agent.say(payload.text, 4e3);
        agent.speech.seq = event.seq;
      }
      if (type === "actor.said.removed" && ((_a = agent == null ? void 0 : agent.speech) == null ? void 0 : _a.seq) === payload.seq) agent.say("");
      if (type === "actor.emoted" && agent) agent.bounce(payload.name === "jump" ? 1.8 : 0.8);
      if (type === "beacon.lit" || type === "activity.completed") this.paintActivity();
      if (type === "activity.completed") this.app.hud.toast("你们一起完成了活动！", 3e3);
    }
    async takeControl() {
      if (!this.id) return;
      const flow = this.flow;
      if (this.state.status === "paused") await this.call("worldResume", { sessionId: this.id });
      if (this.flow !== flow) return;
      const joined = await this.call("worldJoin", { sessionId: this.id, me: this.platformCharacterId, takeControl: true });
      if (this.flow !== flow) return;
      this.controlGeneration = joined.controlGeneration;
      this.controlKey = joined.controlKey;
      this.snapshot(joined.state);
    }
    async command(op, args, source = "human") {
      var _a;
      if (!this.canAct) throw new Error(this.connected ? "当前窗口没有控制权" : "正在恢复连接");
      const flow = this.flow;
      const input = {
        protocol: SESSION_PROTOCOL,
        sessionId: this.id,
        epoch: this.state.epoch,
        requestId: globalThis.crypto.randomUUID(),
        actorCharacterId: this.characterId,
        controlGeneration: this.controlGeneration,
        controlKey: this.controlKey,
        op,
        args
      };
      const result = await this.call(source === "ai" ? "worldAgentCommand" : "worldCommand", input);
      if (this.flow !== flow) return;
      if (result.status === "committed") {
        this.error = "";
        this.accept(result.events);
        return result;
      }
      if (result.status === "pending") {
        this.error = "";
        if (((_a = this.speechReview) == null ? void 0 : _a.requestId) !== result.requestId) this.speechReview = result;
        this.changed();
        return result;
      }
      if (result.code === "stale_epoch" || result.code === "resync_required") await this.sync();
      if (result.code === "control_lost") {
        this.controlKey = null;
        this.stopAI();
      }
      this.error = result.message;
      this.changed();
      throw Object.assign(new Error(result.message), { code: result.code });
    }
    run(op, args) {
      this.command(op, args).catch((error) => this.app.hud.toast(error.message, 2500));
    }
    async useTarget(objectId) {
      var _a, _b;
      const flow = this.flow;
      const actor = (_a = this.state) == null ? void 0 : _a.participants.find(({ characterId }) => characterId === this.characterId);
      const points = (_b = this.runtime) == null ? void 0 : _b.targets.get(objectId);
      if (!actor || !(points == null ? void 0 : points.length)) throw new Error("这个物件没有可用交互位");
      const distance = ({ x, y }) => Math.hypot(x - actor.x, y - actor.y);
      const point = points.reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest);
      if (distance(point) > 0.85) await this.command("move", point);
      if (this.flow !== flow) return;
      return this.command("interact", { objectId });
    }
    observation() {
      const state = this.state;
      const objects = [...this.runtime.targets].map(([id, points]) => {
        var _a, _b;
        const object = this.runtime.world.byId.get(id);
        const lit = state.activity.contributions.some(({ beaconId }) => beaconId === id);
        return {
          id,
          name: this.runtime.world.def(object).name,
          points,
          effect: id === ((_a = this.release.activity) == null ? void 0 : _a.exitId) ? "打开出口" : "点亮信标",
          done: lit || ((_b = state.activity.completion) == null ? void 0 : _b.exitId) === id
        };
      });
      return {
        title: this.release.title,
        actorCharacterId: this.characterId,
        allowed: ["move", "interact", "say", "emote"],
        participants: state.participants.filter(({ online }) => online).map(({ characterId, name, x, y }) => ({ characterId, name, x, y })),
        activity: this.release.activity ? { ...state.activity, goal: "两个不同账号点亮三个信标，然后打开出口" } : null,
        objects,
        recent: state.recent.slice(-6).map(({ actorCharacterId, payload }) => ({ actorCharacterId, text: payload.text })),
        lastResult: this.error
      };
    }
    privateContext() {
      var _a, _b, _c, _d;
      let memory = "";
      try {
        memory = this.experiences.recall(this.localCharacterId, this.serviceUrl, (_a = this.state) == null ? void 0 : _a.participants.map(({ characterId }) => characterId).filter((id) => id !== this.characterId));
      } catch (error) {
        this.experienceError = error.message;
      }
      return { name: (_b = this.localRole) == null ? void 0 : _b.name, persona: (_c = this.localCharacter) == null ? void 0 : _c.persona, scenario: (_d = this.localCharacter) == null ? void 0 : _d.scenario, memory };
    }
    recordExperience(event) {
      if (!this.visit || !this.state) return;
      try {
        if ((event == null ? void 0 : event.type) === "activity.completed") {
          if (!event.payload.participants.some(({ characterId }) => characterId === this.characterId)) return;
          const { record, created } = this.experiences.complete(this.visit, event);
          if (created && this.auto && this.agent.describeCapabilities().available) {
            this.experiences.summarize(record, this.agent, this.privateContext()).catch((error) => {
              if (error.name !== "AbortError") {
                this.experienceError = error.message;
                this.changed();
              }
            });
          } else if (created) this.experiences.setReflection(record, "", "fallback");
        } else if (this.controlKey && !this.state.activity.completion) {
          const participants = this.state.participants.filter(({ online }) => online).map(({ characterId, name }) => ({ characterId, name }));
          if (participants.some(({ characterId }) => characterId === this.characterId)) {
            this.experiences.recordVisit(this.visit, participants, (event == null ? void 0 : event.type) === "beacon.lit" ? event : null);
          }
        }
        this.experienceError = "";
      } catch (error) {
        this.experienceError = error.message;
        this.app.hud.toast(error.message, 3e3);
      }
    }
    async claimCompletion() {
      if (!this.id) return false;
      const flow = this.flow;
      const { completion } = await this.call("worldCompletion", { sessionId: this.id });
      if (completion && this.flow === flow) {
        this.recordExperience(completion.event);
        this.changed();
        return true;
      }
      return false;
    }
    async think() {
      if (!this.canAct) throw new Error("需要当前角色的控制权");
      const flow = this.flow, key2 = this.controlKey, epoch = this.state.epoch;
      const pending = this.agent.decide(this.observation(), this.privateContext());
      this.changed();
      try {
        const intent = await pending;
        if (!intent || !this.canAct || this.flow !== flow || this.controlKey !== key2 || this.state.epoch !== epoch) return;
        await this.command(intent.op, intent.args, "ai");
      } catch (error) {
        if (this.flow !== flow || !this.connected || this.controlKey !== key2 || error.name === "AbortError") return;
        this.error = error.message;
        if (this.auto && ["too_far", "invalid_action", "already_done"].includes(error.code)) {
          this.queueAI();
          return;
        }
        this.auto = false;
        throw error;
      } finally {
        this.changed();
      }
    }
    setAuto(on) {
      this.auto = Boolean(on) && this.canAct && this.agent.describeCapabilities().available;
      if (this.auto) this.queueAI();
      else this.stopAI();
      this.changed();
    }
    queueAI() {
      if (!this.auto || !this.canAct || this.aiTimer || this.agent.describeCapabilities().busy) return;
      this.aiTimer = setTimeout(() => {
        this.aiTimer = null;
        if (this.auto && this.canAct) this.think().catch(() => {
        });
      }, 4e3);
    }
    stopAI() {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
      this.auto = false;
      this.agent.cancel();
    }
    bridge(command) {
      if (VIEW_COMMANDS.has(command.op)) return null;
      if (command.id && command.id !== this.characterId) return { ok: false, error: "只能控制自己的角色" };
      if (command.op === "agent.goto" && Number.isFinite(command.x) && Number.isFinite(command.y)) this.run("move", { x: command.x, y: command.y });
      else if (command.op === "agent.use" && typeof command.obj === "string") this.run("interact", { objectId: command.obj });
      else if (command.op === "agent.say") this.run("say", { text: String(command.text || "") });
      else if (command.op === "agent.emote") this.run("emote", { name: command.kind || "wave" });
      else return { ok: false, error: "共享场次禁止此本地操作" };
      return { ok: true, pending: true };
    }
    changed() {
      var _a;
      if (((_a = this.app.shell) == null ? void 0 : _a.page) === "social") this.app.shell.render();
    }
    async leave({ notify = true, closing = false } = {}) {
      var _a, _b;
      const sessionId = this.id;
      const controlKey = this.controlKey;
      this.stopAI();
      this.flow = null;
      this.connected = false;
      clearTimeout(this.reconnectTimer);
      (_a = this.endConnect) == null ? void 0 : _a.call(this);
      this.endConnect = null;
      (_b = this.source) == null ? void 0 : _b.close();
      this.source = null;
      this.state = null;
      this.speechReview = null;
      this.visit = null;
      this.syncing = null;
      this.wantsSync = false;
      this.controlKey = null;
      if (sessionId && !closing) this.app.worldDrafts.view.close();
      if (sessionId) this.app.bus.emit("world:left", { sessionId });
      this.changed();
      if (notify && sessionId && controlKey) await this.call("worldLeave", { sessionId, controlKey }).catch(() => {
      });
    }
  };

  // web/roomkit/app.js
  function localStore(prefix = "roomkit", backing) {
    const ls = backing === void 0 ? (() => {
      try {
        return window.localStorage;
      } catch (e) {
        return null;
      }
    })() : backing;
    const get = (k) => {
      try {
        return ls ? JSON.parse(ls.getItem(prefix + "." + k) || "null") : null;
      } catch (e) {
        return null;
      }
    };
    let failed = !ls;
    const set = (k, v) => {
      try {
        if (ls) {
          ls.setItem(prefix + "." + k, JSON.stringify(v));
          failed = false;
        }
      } catch (e) {
        failed = true;
        console.warn("[roomkit] 保存失败:", e);
      }
    };
    return {
      /** 最近一次写入是否失败（或浏览器不提供存储）：界面据此说明只是临时体验 */
      get failed() {
        return failed;
      },
      load(id) {
        const sid = id || get("last");
        return sid ? get("scene." + sid) : null;
      },
      /** opts.last === false：只写存档、不改"上次在哪个房间"（给别的房间写门、整理家时） */
      save(scene, opts) {
        scene.updated = Date.now();
        set("scene." + scene.id, scene);
        if (!opts || opts.last !== false) set("last", scene.id);
      },
      remove(id) {
        try {
          if (ls) ls.removeItem(prefix + ".scene." + id);
        } catch (e) {
        }
      },
      /** 存过的场景列表（id、名字、最后修改时间），新的在前 */
      list() {
        const out = [];
        if (!ls) return out;
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (!k || k.indexOf(prefix + ".scene.") !== 0) continue;
          const s = get(k.slice(prefix.length + 1));
          if (s && s.format === "roomkit.scene") out.push({ id: s.id, name: s.name, updated: s.updated || 0, w: s.room && s.room.w, h: s.room && s.room.h });
        }
        return out.sort((a, b) => b.updated - a.updated);
      },
      pref(k, v) {
        const p = get("prefs") || {};
        if (v === void 0) return p[k];
        p[k] = v;
        set("prefs", p);
        return v;
      }
    };
  }
  function mount(el, opts) {
    return new App(el, opts || {});
  }
  var App = class {
    constructor(el, opts) {
      this.opts = Object.assign({ mode: "play", ui: "auto", autosave: true, transparent: false, bridge: "same-origin" }, opts);
      if (this.opts.desk) Object.assign(this.opts, { transparent: true, ui: "compact", mode: "play", coach: false, maxFps: this.opts.maxFps || 30 });
      this.storage = this.opts.storage || localStore(this.opts.storageKey || "roomkit");
      this.ext = this.opts.ext || {};
      this.version = VERSION;
      injectCss(el.ownerDocument || document);
      this.bus = new Emitter();
      this.chatAbort = new AbortController();
      this.iso = new Iso(64, 32);
      this.t = 0;
      this.mode = "play";
      this.catalog = new Catalog();
      this.plays = /* @__PURE__ */ new Map();
      this.content = [];
      this.packs = [];
      this.characters = /* @__PURE__ */ new Map();
      if (!this.opts.neutral) DEFAULT_CHARACTERS.forEach((c) => this.addCharacter(c));
      this.stories = new Stories(this);
      (this.opts.packs || window.RoomKitPacks || []).forEach((p) => this.usePack(p));
      if (this.opts.initialStoredPacks) this.restoreStoredPacks(this.opts.initialStoredPacks);
      this.home = new Home(this);
      this.reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.root = document.createElement("div");
      this.root.className = "rk-root" + (this.opts.transparent ? " rk-transparent" : "");
      this.root.tabIndex = -1;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "rk-canvas";
      this.root.appendChild(this.canvas);
      el.appendChild(this.root);
      const scene = this.home.prepare(this.opts.scene || this.opts.autosave && this.storage.load(this.opts.sceneId) || this.defaultScene());
      this.world = new World(this.catalog, scene);
      this.nav = new Nav(this.world);
      this.agents = /* @__PURE__ */ new Map();
      this.brains = /* @__PURE__ */ new Map();
      this.director = new Director(this);
      this.renderer = new Renderer(this, this.canvas);
      this.sprites = this.renderer.sprites;
      this.rig = new RigPool(this);
      this.env = envAt(this.hour(), this.world.scene.env.weather);
      this.hud = new HUD(this);
      this.dialog = new Dialog(this);
      this.editor = new Editor(this);
      this.soundOn = !!this.storage.pref("sound");
      this.shell = new Shell(this);
      this.town = new Town(this);
      this.worldDrafts = new WorldDrafts(this);
      this.worldSession = new WorldSession(this);
      this.world.allowApply = () => !this.homePaused && (!this.worldSession.id || this.worldSession.applying);
      this.desk = this.opts.desk ? new Desk(this) : null;
      this._syncAgents(true);
      this.world.on("change", (e) => this._onChange(e));
      this.world.on("load", () => {
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
      if (this.opts.mode === "edit") this.setMode("edit");
      else {
        if (this.opts.stories !== false) this.stories.checkStart();
        this.shell.coach();
      }
      this._loop();
      this.packStore = this.opts.packStore === false ? null : this.opts.packStore || new PackStore(this.opts.storageKey || "roomkit");
      this.packsReady = this.packStore && !this.opts.initialStoredPacks ? this.loadStoredPacks() : Promise.resolve();
      this.bus.emit("ready", { version: VERSION, scene: this.world.scene.id });
      if (this.opts.site) this.shell.hub.start();
    }
    /** 装过的社区包 / 自制家具包（IndexedDB）：启动后异步装回来，场景里引用它们的家具随即出现 */
    async loadStoredPacks() {
      const list = await this.packStore.list();
      if (this._dead) return;
      this.restoreStoredPacks(list);
      if (list.length) this.bus.emit("packs:loaded", { count: list.length });
    }
    restoreStoredPacks(list) {
      for (const raw of list) {
        const v = raw.validated ? { ok: true, pack: raw } : validatePack(raw);
        if (v.ok) this.usePack(v.pack);
        else console.warn("[roomkit] 已装的内容包校验失败，跳过:", raw && raw.id, v.errors);
      }
    }
    /** 安装社区包（JSON 文本或对象）：校验 → 持久化 → 立即可用 */
    async installPack(input) {
      const raw = typeof input === "string" ? JSON.parse(input) : input;
      const v = validatePack(raw);
      if (!v.ok) return v;
      v.pack.validated = true;
      if (this.packStore) await this.packStore.put(v.pack);
      this.usePack(v.pack);
      this.bus.emit("pack:installed", { id: v.pack.id, name: v.pack.name });
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
      try {
        const c = raw.format === "roomkit.character" && raw.phrases && raw.v ? raw : normalizeCharacter(raw);
        this.characters.set(c.id, c);
        return c;
      } catch (e) {
        console.warn("[roomkit] 角色卡无效:", e.message);
        return null;
      }
    }
    characterOf(a) {
      return a && a.data && a.data.character && this.characters.get(a.data.character) || null;
    }
    /** 角色这句话说什么：角色卡里有就用卡里的，没有用通用台词 */
    phrase(a, kind) {
      const c = this.characterOf(a);
      const list = c && c.phrases && c.phrases[kind] && c.phrases[kind].length && c.phrases[kind] || PHRASES[kind] || PHRASES.idle;
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
      if (this.world) {
        this.world.version++;
        if (this.editor) this.editor.refresh();
      }
    }
    defaultScene() {
      const first = this.home && this.home.ordered()[0];
      const s = first && this.home.sceneFor(first.id);
      if (s) return s;
      const p = this.packs.find((x) => x.scenes && x.scenes.length);
      if (p) return Object.assign(clone(p.scenes[0]), { template: p.scenes[0].id });
      return { id: "room", name: "房间", room: { w: 8, h: 6 }, objects: [], agents: [{ name: DEFAULT_ROLE.name, brain: DEFAULT_ROLE.brain, x: 4, y: 3 }] };
    }
    /** 场景是从哪个模板来的（恢复默认用） */
    templateOf(scene) {
      const key2 = scene.template || scene.id;
      for (const p of this.packs) {
        const t = (p.scenes || []).find((x) => x.id === key2);
        if (t) return t;
      }
      return null;
    }
    on(ev, fn) {
      return this.bus.on(ev, fn);
    }
    /* ───────── 主循环 ───────── */
    _loop() {
      let last = performance.now();
      const minGap = this.opts.maxFps ? 1e3 / this.opts.maxFps - 2 : 0;
      const tick = (now) => {
        if (this._dead) return;
        if (this.homePaused) {
          last = now;
          this._raf = requestAnimationFrame(tick);
          return;
        }
        if (minGap && now - last < minGap) {
          this._raf = requestAnimationFrame(tick);
          return;
        }
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1e3));
        last = now;
        this.t += dt;
        try {
          this.update(dt);
          this.renderer.frame(this.t, dt);
          this.hud.update();
          this.shell.update();
        } catch (e) {
          console.error("[roomkit] 帧出错:", e);
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    update(dt) {
      var _a;
      this._envT = (this._envT || 0) - dt;
      if (this._envT <= 0) {
        this._envT = 1;
        this.env = envAt(this.hour(), this.world.scene.env.weather);
      }
      if ((_a = this.worldSession) == null ? void 0 : _a.id) {
        for (const agent of this.agents.values()) agent.update(dt);
        return;
      }
      if (this.opts.stories !== false) this.stories.tick(dt);
      const night = this.env.night;
      for (const a of this.agents.values()) {
        const n = a.needs, using = a.attach;
        n.energy = clamp(n.energy - dt * (night ? 28e-4 : 14e-4) * (using && using.slot.pose === "sleep" ? -6 : 1), 0, 1);
        n.fun = clamp(n.fun - dt * 26e-4, 0, 1);
        n.social = clamp(n.social - dt * 22e-4, 0, 1);
        a.update(dt);
      }
      const list = [...this.agents.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.attach || b.attach) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d > 0.34 || d < 1e-4) continue;
          const k = (0.34 - d) / d * 0.5 * Math.min(1, dt * 8);
          if (this.nav.freeAt(a.x - dx * k, a.y - dy * k)) {
            a.x -= dx * k;
            a.y -= dy * k;
          }
          if (this.nav.freeAt(b.x + dx * k, b.y + dy * k)) {
            b.x += dx * k;
            b.y += dy * k;
          }
        }
      }
    }
    /** 按容器宽度切档：< 640 紧凑（DSH 小窗 / 侧栏），≥ 820 再显示房间条；opts.ui 'compact' / 'full' 可以强制 */
    _layout() {
      const w = this.root.clientWidth || 0, ui = this.opts.ui;
      const compact = ui === "compact" || ui !== "full" && w > 0 && w < 640;
      const wide = !compact && w >= 820;
      if (compact !== this.compact || wide !== this.wide) {
        this.compact = compact;
        this.wide = wide;
        this.root.classList.toggle("rk-compact", compact);
        this.root.classList.toggle("rk-wide", wide);
        this.renderer.insetT = this.desk ? 0 : compact ? 40 : 48;
        this.renderer.insetB = this.desk ? 0 : compact ? 54 : 64;
        this.renderer.insetR = this.mode === "edit" && !compact ? 258 : 0;
        this.shell.sync();
      }
      this.renderer.resize();
    }
    hour() {
      const p = this.world.scene.env.period;
      return p ? periodHour(p) : nowHour();
    }
    isNight() {
      return !!(this.env && this.env.night);
    }
    /* ───────── 角色同步 ───────── */
    _syncAgents(reset) {
      var _a, _b;
      const recs = this.world.scene.agents;
      if (reset) {
        for (const b of this.brains.values()) b.stop();
        for (const a of this.agents.values()) a.dispose();
        this.brains.clear();
        this.agents.clear();
      }
      const ids = new Set(recs.map((r) => r.id));
      for (const [id, ag] of this.agents) {
        if (ids.has(id)) continue;
        (_a = this.brains.get(id)) == null ? void 0 : _a.stop();
        ag.dispose();
        this.brains.delete(id);
        this.agents.delete(id);
        this.world.releaseAll(id);
        if (this.hud.cardAgent && this.hud.cardAgent.id === id) this.hud.closeCard();
      }
      for (const r of recs) {
        if (this.agents.has(r.id)) {
          this.agents.get(r.id).setData(r);
          continue;
        }
        const a = new Agent(r, this);
        if (!this.nav.freeAt(a.x, a.y)) {
          const p = this.nav.nearestFree(a.x, a.y, 10);
          if (p) {
            a.x = p.x;
            a.y = p.y;
          }
        }
        this.agents.set(r.id, a);
        if (!((_b = this.worldSession) == null ? void 0 : _b.id)) this.brains.set(r.id, new Brain(a, this));
      }
    }
    _onChange(e) {
      const t = e.op.t;
      if (t.indexOf("agent.") === 0 || t === "batch") this._syncAgents(false);
      for (const a of this.agents.values()) {
        if (a.attach && (!this.world.byId.has(a.attach.obj.id) || e.op.id === a.attach.obj.id && t === "set")) a.cancel();
        if (!a.attach && !this.nav.freeAt(a.x, a.y)) {
          const p = this.nav.nearestFree(a.x, a.y, 6);
          if (p) {
            a.cancel();
            a.x = p.x;
            a.y = p.y;
          }
        }
      }
      if (t === "env") {
        this.env = envAt(this.hour(), this.world.scene.env.weather);
        this.hud.syncBar();
      }
      this._autosave();
      this.bus.emit("scene:change", { op: e.op });
    }
    _autosave() {
      if (!this.opts.autosave) return;
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this.storage.save(this.world.toJSON()), 500);
    }
    checkpointHome() {
      clearTimeout(this._saveT);
      if (!this.visiting && this.opts.autosave) this.storage.save(this.world.toJSON());
    }
    pauseHome(paused) {
      this.homePaused = paused;
      this.root.inert = paused;
      if (paused) {
        this.chatAbort.abort();
        this.worldSession.stopAI();
        clearTimeout(this._saveT);
      } else this.chatAbort = new AbortController();
    }
    /* ───────── 模式 ───────── */
    setMode(m) {
      var _a;
      if (m === "edit" && ((_a = this.worldSession) == null ? void 0 : _a.id)) return;
      if (m === this.mode) return;
      if (m === "edit") this.stories.skip();
      this.mode = m;
      this.hud.closeCard();
      this.hud.closeDrawer();
      this.hud.hideTip();
      this.renderer.hover = null;
      if (m === "edit") this.editor.enter();
      else {
        this.editor.exit();
        this.renderer.selected = null;
      }
      this.renderer.insetR = m === "edit" && !this.compact ? 258 : 0;
      this.renderer.fit(false);
      if (m === "edit") this.shell.close();
      this.shell.sync();
      this.bus.emit("mode", { mode: m });
    }
    /* ───────── 输入 ───────── */
    _bindInput() {
      const c = this.canvas, R = this.renderer, root = this.root;
      const pts = /* @__PURE__ */ new Map();
      let down = null, pinch = null, contextDragged = false;
      const local = (e) => {
        const r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      c.addEventListener("pointerdown", (e) => {
        try {
          c.setPointerCapture(e.pointerId);
        } catch (err) {
        }
        root.focus({ preventScroll: true });
        this._audioUnlock();
        const p = local(e);
        if (e.button === 2) contextDragged = false;
        pts.set(e.pointerId, p);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: R.camT.z };
          down = null;
          return;
        }
        down = { x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false, button: e.button };
        if (this.desk) {
          if (e.button !== 0) down = null;
          return;
        }
        if (e.button === 2 || e.button === 1) {
          down.pan = true;
          return;
        }
        if (this.mode === "edit") down.edit = this.editor.onDown(p.x, p.y);
      });
      c.addEventListener("pointermove", (e) => {
        const p = local(e);
        if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
        if (pinch && pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          R.zoomAt(pinch.z * d / pinch.d / R.camT.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
          return;
        }
        if (down) {
          if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 4) {
            down.moved = true;
            if (down.button === 2) {
              contextDragged = true;
              this.hud.closeDrawer();
            }
            if (this.desk) this.desk.dragStart();
          }
          if (this.desk) {
            if (down.moved) this.desk.dragMove();
            return;
          }
          if (this.mode === "edit" && down.edit) this.editor.onMove(p.x, p.y, true);
          else if (down.moved) {
            R.panBy(p.x - down.lx, p.y - down.ly);
            root.classList.add("rk-panning");
          }
          down.lx = p.x;
          down.ly = p.y;
          return;
        }
        if (this.mode === "edit") this.editor.onMove(p.x, p.y, false);
        this._hover(p.x, p.y);
      });
      const end = (e) => {
        const p = local(e);
        pts.delete(e.pointerId);
        if (pinch) {
          if (pts.size < 2) pinch = null;
          down = null;
          return;
        }
        if (!down) return;
        root.classList.remove("rk-panning");
        const d = down;
        down = null;
        if (this.desk) this.desk.dragEnd();
        if (this.mode === "edit") {
          if (d.edit) this.editor.onUp(p.x, p.y);
          return;
        }
        if (!d.moved && d.button === 0 && e.type === "pointerup") this._click(p.x, p.y);
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("pointerleave", () => {
        for (const a of this.agents.values()) if (a.body.pointerLeave) a.body.pointerLeave();
        if (!down) {
          R.hover = null;
          this.hud.hideTip();
          root.classList.remove("rk-hand");
        }
      });
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (this.desk) {
          this.desk.wheel(e);
          return;
        }
        const p = local(e);
        R.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 15e-4)), p.x, p.y);
      }, { passive: false });
      c.addEventListener("dblclick", (e) => {
        if (this.desk) return;
        const p = local(e), hit = R.pick(p.x, p.y);
        if (!hit || hit.kind === "floor" || hit.kind === "wallface") R.fit(false);
      });
      c.addEventListener("contextmenu", (e) => {
        var _a;
        e.preventDefault();
        if (contextDragged || this.stories.active || this.mode === "edit" || ((_a = this.worldSession) == null ? void 0 : _a.id)) return;
        const p = local(e), hit = R.pick(p.x, p.y);
        if ((hit == null ? void 0 : hit.kind) === "obj" && hit.def.portal && hit.obj.wall) {
          this.hud.hideTip();
          this.shell.doorCard(hit.obj);
        } else if (this.desk) this.desk.openMenu(e.clientX, e.clientY);
      });
      root.addEventListener("keydown", (e) => {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (this.stories.active) return;
        if (this.mode === "edit" && this.editor.onKey(e)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (this.desk && /^[bBmMcC]$/.test(e.key)) return;
        if (e.key === "b" || e.key === "B") this.setMode(this.mode === "edit" ? "play" : "edit");
        else if (e.key === "Escape") {
          this.hud.closeCard();
          this.hud.closeDrawer();
          this.shell.close();
          R.selected = null;
        } else if (e.key === "f" || e.key === "F") R.fit(false);
        else if (this.mode === "edit") return;
        else if (/^[1-9]$/.test(e.key)) {
          const r = this.home.ordered()[+e.key - 1];
          if (r) this.goRoom(r.id);
        } else if (e.key === "m" || e.key === "M") this.shell.open("map");
        else if (e.key === "c" || e.key === "C") this.shell.open("chat");
      });
    }
    _hover(sx, sy) {
      var _a, _b;
      const R = this.renderer;
      const w = R.screenToWorld(sx, sy);
      for (const a of this.agents.values()) {
        if (!a.body.pointer) continue;
        const f = this.iso.toWorld(a.x, a.y, a.z);
        a.body.pointer(w.x, w.y, f.x, f.y);
      }
      if (this.mode === "edit" && this.editor.tool) {
        if (R.hover) {
          R.hover = null;
          this.hud.hideTip();
        }
        return;
      }
      const hit = R.pick(sx, sy);
      const id = hit && (hit.kind === "obj" || hit.kind === "agent") ? hit.id : null;
      if ((R.hover && R.hover.id) !== id) {
        R.hover = id ? { id } : null;
        if (hit && hit.kind === "obj") {
          const room = hit.def.portal && hit.obj.wall && this.home.room((_a = hit.obj.state) == null ? void 0 : _a.to);
          this.hud.showTip(hit, hit.def.name, hit.def.portal && hit.obj.wall && !((_b = this.worldSession) == null ? void 0 : _b.id) ? room ? "前往" + room.name + " · 右键设置" : "右键连接房间" : hit.def.sub);
        } else if (hit && hit.kind === "agent") this.hud.showTip(hit, hit.agent.name, hit.agent.activity);
        else this.hud.hideTip();
        if (id) this.sfx("tick");
      } else if (hit && hit.kind === "agent") {
        this.hud.showTip(hit, hit.agent.name, hit.agent.activity);
      }
      this.root.classList.toggle("rk-hand", !!id);
    }
    _click(sx, sy) {
      var _a;
      const R = this.renderer;
      if (this.stories.active) {
        this.dialog.advance();
        return;
      }
      const hit = R.pick(sx, sy);
      if ((_a = this.worldSession) == null ? void 0 : _a.id) {
        if ((hit == null ? void 0 : hit.kind) === "floor") this.worldSession.run("move", { x: hit.x, y: hit.y });
        if ((hit == null ? void 0 : hit.kind) === "obj") this.activate(hit.obj);
        return;
      }
      if (!hit) {
        this.hud.closeCard();
        this.hud.closeDrawer();
        R.selected = null;
        return;
      }
      if (hit.kind === "agent") {
        const st = this.stories.forAgent(hit.agent);
        if (st) {
          this.stories.run(st, { who: hit.agent });
          return;
        }
        R.selected = { id: hit.id, kind: "agent" };
        this.hud.openCard(hit.agent);
        this.poke(hit.agent);
        this.bus.emit("agent:click", { id: hit.agent.id });
        return;
      }
      if (hit.kind === "obj") {
        this.activate(hit.obj);
        return;
      }
      if (hit.kind === "floor") {
        const a = this.focusAgent();
        if (a) {
          this.command({ op: "agent.goto", id: a.id, x: hit.x, y: hit.y });
          this._ripple(hit.x, hit.y);
        }
        this.hud.closeDrawer();
      }
    }
    _ripple(x, y) {
      const p = this.renderer.tileToScreen(x, y);
      this.hud.float(p.x, p.y + 8, "·");
    }
    poke(a) {
      a.bounce(1.1);
      a.setExpr(pick(["happy", "surprised", "love"]), 1.6);
      if (!a.speech) a.say(this.phrase(a, "poke"), 1800);
      this.sfx("pop");
    }
    /** 点家具：def.act = 'toggle:key' | 'use:slotId' | 'play:id' | 'weather' | 'shake' | 'info' */
    activate(o) {
      var _a, _b;
      if ((_a = this.worldSession) == null ? void 0 : _a.id) {
        this.worldSession.run("interact", { objectId: o.id });
        return;
      }
      const def = this.world.def(o);
      if (!def) return;
      if (def.portal && o.wall) {
        this.hud.closeCard();
        this.hud.closeDrawer();
        this.hud.hideTip();
        this.sfx("click");
        const to = (_b = o.state) == null ? void 0 : _b.to;
        if (to && this.home.has(to)) this.goRoom(to);
        else {
          const anchor2 = this.renderer.anchorOf({ id: o.id });
          if (anchor2) this.hud.float(anchor2.x, anchor2.y, to ? "目的房间已移除 · 右键重新连接" : "还没有连接房间 · 右键设置");
        }
        this.bus.emit("object:click", { id: o.id, def: def.id, to: to || null });
        return;
      }
      const st = this.stories.forObject(o);
      if (st && Math.random() < (st.trigger.chance != null ? st.trigger.chance : 1)) {
        this.renderer.wobble.set(o.id, this.t);
        this.stories.run(st, { target: o, who: this.focusAgent() });
        this.bus.emit("object:click", { id: o.id, def: def.id, story: st.id });
        return;
      }
      const act = def.act || (def.slots.length ? "use" : "info");
      const [kind, arg] = act.split(":");
      const anchor = this.renderer.anchorOf({ id: o.id }) || { x: this.renderer.vw / 2, y: this.renderer.vh / 2 };
      this.renderer.wobble.set(o.id, this.t);
      this.sfx("click");
      switch (kind) {
        case "toggle": {
          const k = arg || "on", v = !(o.state && o.state[k]);
          this.world.apply({ t: "state", id: o.id, patch: { [k]: v } });
          if (def.say) this.hud.float(anchor.x, anchor.y, v ? def.say[0] : def.say[1] || def.say[0]);
          break;
        }
        case "use": {
          const a = this.focusAgent(), s = arg ? def.slots.find((x) => x.id === arg) : def.slots[0];
          if (a && s) {
            this.command({ op: "agent.use", id: a.id, obj: o.id, slot: s.id });
            this.hud.float(anchor.x, anchor.y, s.label || poseName(s.pose));
          } else this.inspect(o.id);
          break;
        }
        case "play": {
          const play = this.plays.get(arg);
          if (play) this.director.run(play, { target: o, who: this.focusAgent() });
          break;
        }
        case "weather": {
          const cyc = ["clear", "cloudy", "rain", "snow"], i = cyc.indexOf(this.world.scene.env.weather);
          this.command({ op: "env.set", weather: cyc[(i + 1) % cyc.length] });
          this.hud.float(anchor.x, anchor.y, "天气变了");
          break;
        }
        case "shake":
          this.hud.float(anchor.x, anchor.y, def.say ? pick(def.say) : "…");
          break;
        default:
          this.inspect(o.id);
      }
      this.bus.emit("object:click", { id: o.id, def: def.id });
    }
    inspect(id) {
      const o = this.world.byId.get(id) || this.world.objects.find((x) => x.def === id);
      if (!o) return;
      const def = this.world.def(o);
      let data = null;
      for (const p of this.content) {
        try {
          data = p(o, def, this);
        } catch (e) {
          console.warn("[roomkit] 内容源出错:", e);
        }
        if (data) break;
      }
      data = data || def.info || { title: def.name, sub: def.sub || "这里还空着" };
      this.hud.openDrawer(Object.assign({ title: def.name }, data));
    }
    /** 当前"焦点角色"：卡片里选中的那只，否则主角 */
    focusAgent() {
      return this.hud.cardAgent && this.agents.get(this.hud.cardAgent.id) || this.mainAgent();
    }
    mainAgent() {
      for (const a of this.agents.values()) if (a.data.brain === "pet") return a;
      return this.agents.values().next().value || null;
    }
    nearestAgent(o) {
      if (!o) return this.mainAgent();
      const f = this.world.footprint(o);
      let best = null, bd = Infinity;
      for (const a of this.agents.values()) {
        if (!this.director.available(a)) continue;
        const d = f ? Math.hypot(a.x - (f.x0 + f.x1) / 2, a.y - (f.y0 + f.y1) / 2) : 0;
        if (d < bd) {
          bd = d;
          best = a;
        }
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
          if (dist < bd) {
            bd = dist;
            best = { o, s, d };
          }
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
      if (what === "wave") {
        this.command({ op: "agent.say", id, text: pick(["你好呀~", "嗨嗨！", "欢迎来玩"]) });
        this.command({ op: "agent.pose", id, pose: "wave", s: 2 });
      } else if (what === "dance") {
        this.command({ op: "agent.emote", id, kind: "note", s: 4 });
        this.command({ op: "agent.pose", id, pose: "dance", s: 4.5 });
      } else if (what === "sleep") {
        const f = this.findSlot((d, s) => s.pose === "sleep", a);
        if (f) this.command({ op: "agent.use", id, obj: f.o.id, slot: f.s.id, s: 40 });
        else this.hud.toast("房间里还没有床");
      } else if (what === "chat") {
        this.shell.open("chat");
      } else if (what === "read") {
        const f = this.findSlot((d, s) => s.pose === "read", a);
        if (f) this.command({ op: "agent.use", id, obj: f.o.id, slot: f.s.id, s: 20 });
        else this.hud.toast("房间里还没有书架");
      }
    }
    /** 排队命令的执行（在该角色的行为循环里跑） */
    async exec(a, c) {
      const w = this.world;
      switch (c.op) {
        case "agent.goto": {
          a.activity = "走过去";
          if (c.obj) {
            const o = w.byId.get(c.obj);
            const f = o && w.footprint(o);
            const p = f && this.nav.nearestFree((f.x0 + f.x1) / 2, f.y1 + 0.5, 4);
            return p ? a.walkTo(p.x, p.y, { run: c.run }) : false;
          }
          return a.walkTo(+c.x, +c.y, { run: c.run });
        }
        case "agent.use": {
          const o = w.byId.get(c.obj) || w.objects.find((x) => x.def === c.obj);
          const d = o && w.def(o);
          const s = d && (d.slots.find((x) => x.id === c.slot) || d.slots[0]);
          if (!s) return false;
          a.activity = s.label || poseName(s.pose);
          const ok = await a.useSlot(o, s, c.s || rand(s.dur[0], s.dur[1]));
          if (ok) for (const k in s.need) a.needs[k] = clamp((a.needs[k] || 0) + s.need[k], 0, 1);
          return ok;
        }
        case "agent.pose":
          a.activity = poseName(c.pose);
          return a.pose_(c.pose || "stand", c.s || 3);
        case "play.run": {
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
        scene: room && room.name || sc.name || sc.id,
        floor: room ? room.floor : null,
        period: env.label || env.id,
        night: !!env.night,
        weather: sc.env && sc.env.weather || "clear",
        agents: [...this.agents.values()].map((a) => ({ id: a.id, name: a.name, doing: a.activity || "", status: a.status ? a.status.state : null })),
        furniture: names.slice(0, 40),
        rooms: this.home.ordered().map((r) => r.floor + " " + r.name)
      };
    }
    /**
     * 和角色说一句话 → { text, acts, note? }。有宿主（ext.chat）走模型，宿主不可用或出错时退回离线台词并在 note 里说明。
     * 回复里的 [[动作]] 标记会被剥掉并执行：wave / dance / sleep / read / goto:家具 / use:家具 / room:房间 / emote:符号
     */
    async chat(agent, text2, history2, opts) {
      var _a;
      const signal = this.chatAbort.signal;
      if (signal.aborted) return { text: "", acts: [], note: "房间正在切换窗口" };
      if ((_a = this.worldSession) == null ? void 0 : _a.id) return { text: "", acts: [], note: "请使用共享场次的发言入口" };
      const a = agent || this.mainAgent();
      if (!a) return { text: "", acts: [] };
      let res = null, note = "";
      if (this.ext.chat) {
        const c = this.characterOf(a);
        try {
          const r = await this.ext.chat({ agent: { id: a.id, name: a.name }, character: c ? { id: c.id, name: c.name, persona: c.persona || "", scenario: c.scenario || "" } : null, text: text2, history: (history2 || []).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.who && m.who !== a.name ? m.who + "：" + m.text : m.text })), group: !!(opts && opts.group), thread: opts && opts.thread || "", memory: opts && opts.memory || "", room: this.describe() }, signal);
          if (r && r.text) {
            res = parseActs(r.text);
            if (Array.isArray(r.acts)) res.acts = res.acts.concat(r.acts);
          } else note = r && r.error || "模型没有回话";
        } catch (e) {
          note = e.message || String(e);
        }
        if (note) note = "模型暂时用不了（" + note + "），先用离线台词回你";
      }
      if (signal.aborted) return { text: "", acts: [], note: "房间正在切换窗口" };
      if (!res && opts && opts.silent) return { text: "", acts: [], note: note || "没有模型" };
      if (!res) {
        const rule = OFFLINE_RULES.find((x) => x[0].test(text2));
        res = rule ? { text: pick(rule[2]), acts: [rule[1]] } : { text: this.phrase(a, "chat") || this.phrase(a, "idle"), acts: [] };
        if (!rule && /客厅|卧室|厨房|房间|院子/.test(text2)) {
          const r = this.home.rooms().find((x) => text2.indexOf(x.name) >= 0);
          if (r) {
            res.acts = ["room:" + r.name];
            res.text = "好，去" + r.name + "~";
          }
        }
      }
      if (note) res.note = note;
      if (opts && opts.silent) return res;
      if (res.text) a.say(res.text, Math.min(7e3, 1800 + res.text.length * 120));
      this.applyActs(a, res.acts || []);
      this.bus.emit("agent:chat", { id: a.id, user: text2, reply: res.text, acts: res.acts || [] });
      return res;
    }
    applyActs(a, acts) {
      var _a;
      if ((_a = this.worldSession) == null ? void 0 : _a.id) return;
      for (const raw of acts.slice(0, 3)) {
        const [kind, arg] = String(raw).split(":").map((x) => x && x.trim());
        if (["wave", "dance", "sleep", "read"].includes(kind)) {
          this.agentAction(a, kind);
          continue;
        }
        if (kind === "room" && arg) {
          if (a === this.mainAgent()) this.goRoomNamed(arg);
          continue;
        }
        if ((kind === "goto" || kind === "use") && arg) {
          const o = this.world.objects.find((x) => {
            const d2 = this.world.def(x);
            return !x.wall && d2 && (d2.id === arg || d2.name === arg || x.id === arg || d2.name && d2.name.indexOf(arg) >= 0);
          });
          if (!o) continue;
          const d = this.world.def(o);
          if (kind === "use" && d.slots.length) this.command({ op: "agent.use", id: a.id, obj: o.id });
          else this.command({ op: "agent.goto", id: a.id, obj: o.id });
          continue;
        }
        if (kind === "emote") this.command({ op: "agent.emote", id: a.id, kind: arg || "heart" });
      }
    }
    /* ───────── 对外命令 ───────── */
    command(c) {
      var _a;
      if (!c || !c.op) return { ok: false, error: "missing op" };
      if (this.homePaused) return { ok: false, error: "房间正在切换窗口" };
      if ((_a = this.worldSession) == null ? void 0 : _a.id) {
        const result = this.worldSession.bridge(c);
        if (result) return result;
      }
      const w = this.world;
      const agentOf = () => c.id ? this.agents.get(c.id) : this.mainAgent();
      const queue = () => {
        const a = agentOf();
        if (!a) return { ok: false, error: "no agent" };
        a.queue.push(c);
        a.cancel();
        return { ok: true };
      };
      switch (c.op) {
        case "agent.goto":
        case "agent.use":
        case "agent.pose":
          return queue();
        case "agent.say": {
          const a = agentOf();
          if (!a) return { ok: false };
          a.say(c.text, c.ms);
          return { ok: true };
        }
        case "agent.emote": {
          const a = agentOf();
          if (!a) return { ok: false };
          a.emote(c.kind || "heart", c.s || 2);
          return { ok: true };
        }
        case "agent.status": {
          const a = agentOf();
          if (!a) return { ok: false, error: "no agent" };
          const state = c.status || c.state || null;
          const prev = a.status && a.status.state;
          a.status = state ? { state, task: c.task || null, ts: Date.now() } : null;
          if (prev !== state) a.cancel();
          else if (a.status && c.task && a.attach) a.say(c.task, 3200);
          this.bus.emit("agent:status", { id: a.id, status: state, task: c.task || null });
          return { ok: true };
        }
        case "agent.add":
        case "agent.upsert": {
          const rec = Object.assign({ id: uid("a"), kind: "girl", brain: "auto" }, c.agent || {});
          const ex = w.scene.agents.find((x) => x.id === rec.id);
          if (ex) {
            w.apply({ t: "agent.set", id: ex.id, patch: c.agent });
            return { ok: true, id: ex.id };
          }
          if (rec.x == null) {
            const door = w.objects.find((o) => o.def === "door" && o.wall);
            const p = door ? this.nav.nearestFree(door.wall === "right" ? door.at : 0.5, door.wall === "right" ? 0.5 : door.at, 4) : this.nav.nearestFree(w.room.w / 2, w.room.h / 2, 8);
            if (p) {
              rec.x = p.x;
              rec.y = p.y;
            }
          }
          w.apply({ t: "agent.add", agent: rec });
          return { ok: true, id: rec.id };
        }
        case "agent.remove":
          return { ok: !!w.apply({ t: "agent.remove", id: c.id }) };
        case "agent.list":
          return { ok: true, agents: [...this.agents.values()].map((a) => a.snapshot()) };
        case "object.add": {
          const def = this.catalog.get(c.def);
          if (!def) return { ok: false, error: "unknown def" };
          const obj = { id: c.objId || uid("o"), def: c.def, rot: c.rot || 0, state: Object.assign({}, def.states, c.state) };
          if (def.mount === "wall") {
            obj.wall = c.wall || "right";
            obj.at = c.at != null ? c.at : w.wallLen(obj.wall) / 2;
            obj.z = c.z != null ? c.z : def.wz;
            const ok = w.canPlaceWall(c.def, obj.wall, obj.at, obj.z, null);
            if (!ok.ok) return { ok: false, error: ok.reason };
          } else {
            let x = c.x, y = c.y;
            if (x == null || y == null || !w.canPlace(c.def, x, y, obj.rot, null).ok) {
              const s = this.findFreeSpot(c.def, obj.rot, x, y);
              if (!s) return { ok: false, error: "没有空位" };
              x = s.x;
              y = s.y;
            }
            obj.x = x;
            obj.y = y;
          }
          w.apply({ t: "add", obj });
          return { ok: true, id: obj.id };
        }
        case "object.remove":
          return { ok: !!w.apply({ t: "remove", id: c.id }) };
        case "object.set":
          return { ok: !!w.apply({ t: "set", id: c.id, patch: c.patch || {} }) };
        case "object.state":
          return { ok: !!w.apply({ t: "state", id: c.id, patch: c.patch || {} }) };
        case "object.list":
          return { ok: true, objects: w.objects.map((o) => ({ id: o.id, def: o.def, name: (w.def(o) || {}).name, x: o.x, y: o.y, wall: o.wall, state: o.state })) };
        case "env.set": {
          const patch = {};
          if ("period" in c) patch.period = c.period || null;
          if ("weather" in c) patch.weather = c.weather || "clear";
          w.apply({ t: "env", patch });
          return { ok: true };
        }
        case "scene.get":
          return { ok: true, scene: w.toJSON() };
        case "scene.load":
          this.loadScene(c.scene);
          return { ok: true };
        case "play.run": {
          const play = c.play || this.plays.get(c.id);
          if (!play) return { ok: false, error: "unknown play" };
          this.director.run(play, { target: c.target ? w.byId.get(c.target) : null, who: c.who ? this.agents.get(c.who) : null });
          return { ok: true };
        }
        case "mode":
          this.setMode(c.mode === "edit" ? "edit" : "play");
          return { ok: true };
        case "camera.fit":
          this.renderer.fit(false);
          return { ok: true };
        case "room.list":
          return { ok: true, current: w.scene.id, rooms: this.home.ordered().map((r) => ({ id: r.id, name: r.name, floor: r.floor })) };
        case "room.go": {
          if (!this.home.has(c.id) && !this.storage.load(c.id)) return { ok: false, error: "unknown room" };
          this.goRoom(c.id);
          return { ok: true };
        }
        case "ui.open":
          this.shell.open(c.page);
          return { ok: true };
        case "ui.close":
          this.shell.close();
          return { ok: true };
        case "agent.chat": {
          const a = agentOf();
          if (!a) return { ok: false, error: "no agent" };
          this.chat(a, String(c.text || ""));
          return { ok: true };
        }
        case "room.describe":
          return { ok: true, room: this.describe() };
        case "ui.toast":
          this.hud.toast(c.text || "");
          return { ok: true };
        case "story.list":
          return { ok: true, stories: this.stories.all().map((s) => ({ id: s.id, name: s.name, trigger: s.trigger, ready: this.stories.ready(s) })) };
        case "story.run": {
          const s = c.story ? this.stories.add(c.story, "command") : this.stories.all().find((x) => x.id === c.id);
          if (!s) return { ok: false, error: "unknown story" };
          if (this.stories.active) return { ok: false, error: "a story is running" };
          this.stories.run(s, { target: c.target ? w.byId.get(c.target) : null });
          return { ok: true };
        }
        case "story.skip":
          this.stories.skip();
          return { ok: true };
        case "story.reset":
          this.stories.reset();
          return { ok: true };
      }
      return { ok: false, error: "unknown op: " + c.op };
    }
    /** DSH 工作状态快照（dsh-pet 的 workStatus 同形）→ 主角 */
    setWorkStatus(s) {
      const a = this.mainAgent();
      if (!a) return;
      this.command({ op: "agent.status", id: a.id, status: s && s.state, task: s && s.task });
    }
    /* ───────── 场景存取 ───────── */
    /**
     * 切换到另一个场景（先存好当前的；撤销历史清空——不同场景之间不互相撤销）。
     * 跟随的角色（主角等，见 _takeFollowers）一起过去：旧房间存档里去掉她们，新房间里同一角色的那份被替换，
     * 她们从通回旧房间的门进屋。opts.followers 可以显式指定（[] = 谁也不带）。
     */
    openScene(scene, opts = {}) {
      var _a;
      if (((_a = this.worldSession) == null ? void 0 : _a.id) && !this.worldSession.applying) return;
      if (!scene) return;
      clearTimeout(this._saveT);
      const from = this.world.scene.id;
      const followers = opts.followers || (this.home.follow && scene.id !== from ? this._takeFollowers() : []);
      if (this.opts.autosave) {
        const cur = this.world.toJSON();
        if (followers.length) {
          const gone = new Set(followers.map((f) => f.rec.id));
          cur.agents = cur.agents.filter((a) => !gone.has(a.id));
        }
        this.storage.save(cur, { last: false });
      }
      this.stories.skip();
      this.hud.closeCard();
      this.hud.closeDrawer();
      this.hud.hideTip();
      const next = clone(scene);
      const entry = followers.length ? this._placeFollowers(next, followers, from) : null;
      this.world.load(next);
      this.editor.undo.length = 0;
      this.editor.redo.length = 0;
      this.renderer.fit(true);
      this.editor.select(null);
      this.editor.refresh();
      for (const f of followers) if (f.status && f.status.state) this.command({ op: "agent.status", id: f.rec.id, status: f.status.state, task: f.status.task });
      if (this.opts.autosave) this.storage.save(this.world.toJSON());
      if (entry) {
        this.world.apply({ t: "state", id: entry, patch: { open: true } }, { silent: true });
        setTimeout(() => {
          if (this.world.byId.has(entry)) this.world.apply({ t: "state", id: entry, patch: { open: false } }, { silent: true });
        }, 1400);
      }
      this.bus.emit("scene:open", { id: this.world.scene.id, name: this.world.scene.name, from });
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
      const same = (a) => followers.some((f) => f.rec.id === a.id || f.rec.character && a.character === f.rec.character);
      next.agents = (next.agents || []).filter((a) => !same(a));
      const doors = (next.objects || []).filter((o) => {
        const d = o.wall && this.catalog.get(o.def);
        return d && d.portal;
      });
      const door = from && doors.find((o) => o.state && o.state.to === from) || doors[0] || null;
      const r = next.room || {};
      const at = door ? door.wall === "left" ? { x: 0.6, y: door.at } : { x: door.at, y: 0.6 } : { x: (r.w || 8) / 2, y: (r.h || 6) / 2 };
      followers.forEach((f, i) => next.agents.push(Object.assign(f.rec, { x: at.x + (door && door.wall === "left" ? i * 0.5 : 0), y: at.y + (door && door.wall !== "left" ? i * 0.5 : 0) })));
      return door && door.id ? door.id : null;
    }
    /** 去家里的另一个房间：转场 + 跟随的角色一起过去 */
    async goRoom(id) {
      if (!id || this.homePaused || this._going || this.visiting || id === this.world.scene.id) return false;
      const scene = this.home.sceneFor(id) || this.storage.load(id);
      if (!scene || scene.id !== id) return false;
      this._going = true;
      try {
        const room = this.home.room(id);
        await this.shell.curtain(true, room ? room.floor + " · " + room.name : scene.name || "");
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
        a.engaged = "door";
        a.activity = "出门";
        if (p) await Promise.race([a.walkTo(p.x, p.y, { run: true }), delay(4500)]);
      }
      if (this.world.byId.has(o.id)) this.world.apply({ t: "state", id: o.id, patch: { open: true } }, { silent: true });
      this.sfx("click");
      await delay(260);
      if (this.world.byId.has(o.id)) this.world.apply({ t: "state", id: o.id, patch: { open: false } }, { silent: true });
      const ok = await this.goRoom(to);
      if (!ok && a && this.agents.get(a.id) === a) a.engaged = null;
      return ok;
    }
    /** 去某个房间（名字或 id）：当前房间有门通过去就走门，没有就直接过去 */
    goRoomNamed(ref) {
      const r = this.home.rooms().find((x) => x.id === ref || x.name === ref) || this.home.rooms().find((x) => ref && (x.name.indexOf(ref) >= 0 || ref.indexOf(x.name) >= 0));
      if (!r || r.id === this.world.scene.id) return false;
      const door = this.world.objects.find((o) => o.wall && o.state && o.state.to === r.id);
      if (door) this.walkThrough(door);
      else this.goRoom(r.id);
      return true;
    }
    loadScene(scene, opts) {
      var _a;
      if ((_a = this.worldSession) == null ? void 0 : _a.id) return;
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
      s.id = cur.id;
      s.name = cur.name;
      if (t) s.template = t.id;
      this.loadScene(s);
      this.hud.toast("已恢复默认布置（可撤销）");
    }
    exportScene() {
      const data = JSON.stringify(this.world.toJSON(), null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "room-" + (this.world.scene.name || "scene") + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
      this.hud.toast("已导出布局 JSON");
    }
    importScene(text2) {
      try {
        const s = typeof text2 === "string" ? JSON.parse(text2) : text2;
        if (!s || s.format !== "roomkit.scene") throw new Error("不是 RoomKit 场景文件");
        this.loadScene(s);
        this.hud.toast("已导入：" + (s.name || s.id));
      } catch (e) {
        this.hud.toast("导入失败：" + e.message, 3e3);
      }
    }
    /* ───────── 声音（WebAudio 合成，默认关） ───────── */
    setSound(on) {
      this.soundOn = !!on;
      this.storage.pref("sound", this.soundOn);
      if (on) {
        this._audioUnlock();
        this.sfx("pop");
      }
      this.hud.syncBar();
    }
    _audioUnlock() {
      if (!this.soundOn) return;
      try {
        if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
        if (this._ac.state === "suspended") this._ac.resume();
      } catch (e) {
      }
    }
    sfx(name) {
      if (!this.soundOn || !this._ac) return;
      const T = {
        tick: [[1250, 0.025, "sine", 0.012]],
        click: [[520, 0.06, "triangle", 0.05]],
        pop: [[660, 0.05, "sine", 0.06], [990, 0.07, "sine", 0.045, 0.04]],
        place: [[330, 0.07, "triangle", 0.06], [495, 0.1, "triangle", 0.05, 0.06]],
        remove: [[440, 0.06, "triangle", 0.05], [262, 0.1, "triangle", 0.04, 0.05]],
        nope: [[180, 0.12, "square", 0.025]],
        chirp: [[880, 0.05, "sine", 0.05], [1320, 0.06, "sine", 0.04, 0.05]]
      }[name] || [[600, 0.05, "sine", 0.04]];
      const ac = this._ac, t0 = ac.currentTime;
      for (const [f, d, type, g, delay3] of T) {
        const o = ac.createOscillator(), gn = ac.createGain(), t = t0 + (delay3 || 0);
        o.type = type;
        o.frequency.value = f;
        gn.gain.setValueAtTime(1e-4, t);
        gn.gain.exponentialRampToValueAtTime(g, t + 0.01);
        gn.gain.exponentialRampToValueAtTime(1e-4, t + d);
        o.connect(gn);
        gn.connect(ac.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      }
    }
    /* ───────── postMessage 桥（iframe / 桌面壳 / 同页其他脚本） ───────── */
    _bridge() {
      if (this.opts.bridge === false) return;
      const allow = (e) => this.opts.bridge === "*" || e.origin === location.origin || e.origin === "null" && location.protocol === "file:";
      this._onMsg = (e) => {
        const d = e.data;
        if (!d || typeof d !== "object" || !d.roomkit || !allow(e)) return;
        const result = this.command(d.roomkit);
        if (d.reqId && e.source && e.source.postMessage) e.source.postMessage({ roomkitReply: d.reqId, result }, e.origin === "null" ? "*" : e.origin);
      };
      window.addEventListener("message", this._onMsg);
      if (window.parent && window.parent !== window) {
        this.bus.on("*", (payload, ev) => {
          try {
            window.parent.postMessage({ roomkitEvent: ev, data: payload }, this.opts.bridge === "*" ? "*" : location.origin);
          } catch (err) {
          }
        });
      }
    }
    destroy() {
      var _a, _b;
      this._dead = true;
      this.chatAbort.abort();
      clearTimeout(this._saveT);
      (_a = this.worldSession) == null ? void 0 : _a.leave({ closing: true }).catch(() => {
      });
      (_b = this.town) == null ? void 0 : _b.disconnect();
      cancelAnimationFrame(this._raf);
      for (const b of this.brains.values()) b.stop();
      for (const a of this.agents.values()) a.dispose();
      this._ro.disconnect();
      if (this.desk) this.desk.dispose();
      if (this._onMsg) window.removeEventListener("message", this._onMsg);
      this.root.remove();
    }
  };
  return __toCommonJS(index_exports);
})();
