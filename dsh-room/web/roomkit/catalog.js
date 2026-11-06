/**
 * RoomKit · 家具库（FurnitureDef 注册表）。
 *
 * 家具定义是纯数据（可 JSON 化、可导出分享）。字段见 docs/03 §3.3，要点：
 *   mount: 'floor'（占格）| 'flat'（地毯，永远最底层）| 'wall'（墙面物件）
 *   size: [w, h] 占格（rot=0）；height 像素；blocks 是否挡路
 *   art:  { kind:'sprite', src, fit, dx, dy } 贴图（镜像得第二朝向）
 *       | { kind:'proc', parts:[...] }        程序化（四朝向、可换色，palette 键引用颜色）
 *       | { kind:'wall', draw:'window'|'door'|'frame'|'clock'|'shelf' } 墙面物件
 *   slots: 交互位 { id, pose, at:[lx,ly], face:[dx,dy], z, dur:[a,b], need:{energy,fun,social}, layer }
 *   act:  点击动作 'toggle:on' | 'use:<slotId>' | 'info' | 'play:<id>' | 'weather' | 'shake'
 *   light: { at:[lx,ly], z, radius, color, when:'on' }
 */

const SLOT_DEFAULTS = { pose: 'stand', face: [0, 1], z: 0, dur: [6, 14], need: {}, layer: 'front' };

export function normalizeDef(raw) {
  const d = Object.assign({}, raw);
  if (!d.id) throw new Error('[roomkit] 家具定义缺少 id');
  d.name = d.name || d.id;
  d.sub = d.sub || '';
  d.mount = d.mount || 'floor';
  d.size = (d.size || [1, 1]).slice(0, 2);
  d.tags = d.tags || [];
  d.states = Object.assign({}, d.states || {});
  d.palette = Object.assign({}, d.palette || {});
  d.art = d.art || { kind: 'proc', parts: [] };
  if (d.mount === 'flat') {
    d.blocks = false;
    d.height = d.height || 2;
    d.cat = d.cat || 'rug';
  } else if (d.mount === 'wall') {
    d.blocks = false;
    d.wsize = (d.wsize || [1, 100]).slice(0, 2);      // [沿墙宽度（格）, 高度（像素）]
    d.wz = d.wz != null ? d.wz : 60;                   // 默认离地高度
    d.cat = d.cat || 'wall';
  } else {
    d.blocks = d.blocks !== false;
    d.height = d.height || 60;
    d.cat = d.cat || 'misc';
  }
  d.rotMode = d.mount === 'wall' ? 'none' : d.art.kind === 'sprite' ? 'mirror' : 'rot4';
  d.rots = d.rotMode === 'none' ? 1 : d.rotMode === 'mirror' ? 2 : 4;
  d.slots = (d.slots || []).map((s, i) => Object.assign({ id: 'slot' + i }, SLOT_DEFAULTS,
    { at: [d.size[0] / 2, d.size[1] / 2] }, s));
  return d;
}

export class Catalog {
  constructor() { this.defs = new Map(); this.order = []; }

  add(raw) {
    const d = normalizeDef(raw);
    if (!this.defs.has(d.id)) this.order.push(d.id);
    this.defs.set(d.id, d);
    return d;
  }
  addAll(list) { (list || []).forEach((d) => this.add(d)); return this; }
  remove(id) {
    if (!this.defs.delete(id)) return false;
    this.order = this.order.filter((x) => x !== id);
    return true;
  }
  get(id) { return this.defs.get(id) || null; }
  has(id) { return this.defs.has(id); }

  list(filter) {
    const all = this.order.map((id) => this.defs.get(id));
    return filter ? all.filter(filter) : all;
  }

  /** 家具库面板的分类（按首次出现顺序） */
  categories() {
    const seen = [];
    this.list().forEach((d) => { if (!d.hidden && seen.indexOf(d.cat) < 0) seen.push(d.cat); });
    return seen;
  }

  toJSON() { return this.list().map((d) => { const o = Object.assign({}, d); delete o.rotMode; delete o.rots; return o; }); }
}

/** 解析调色：实例自定义色 → 定义调色板 → 字面色 */
export function paletteOf(def, obj) {
  const p = Object.assign({}, def.palette, (obj && obj.colors) || {});
  return (key) => {
    if (!key) return '#cccccc';
    if (key[0] === '#') return key;
    return p[key] || '#cccccc';
  };
}

export const CATEGORY_NAMES = {
  bedroom: '卧室', living: '客厅', study: '书房', kitchen: '厨房', deco: '装饰',
  light: '灯具', rug: '地毯', wall: '墙面', plant: '绿植', misc: '其它', fun: '娱乐', outdoor: '户外',
};
