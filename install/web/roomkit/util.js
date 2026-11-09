/**
 * RoomKit · 工具：数学、颜色、随机、事件。全部纯函数，可单测。
 */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 帧率无关的指数趋近系数：x += (target - x) * ease(rate, dt) */
export const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smooth = (t) => t * t * (3 - 2 * t);
/** 等一会儿（毫秒）：转场、过门这类 UI 节奏用 */
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
/** 短 id：前缀 + 时间 + 计数，同一毫秒内也不撞 */
export function uid(prefix = 'o') {
  seq = (seq + 1) % 1296;
  return prefix + Date.now().toString(36).slice(-5) + seq.toString(36).padStart(2, '0');
}

/** 整数坐标哈希 → [0,1)：地板纹理按格子取稳定的随机数（重画不闪） */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ───────── 颜色 ───────── */

export function hexToRgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** k > 0 向白提亮，k < 0 向黑压暗（-1..1） */
export function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  if (k >= 0) return rgbToHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
  return rgbToHex(r * (1 + k), g * (1 + k), b * (1 + k));
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ───────── 事件 ───────── */

export class Emitter {
  constructor() { this._m = new Map(); }
  on(ev, fn) {
    if (!this._m.has(ev)) this._m.set(ev, new Set());
    this._m.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) { const s = this._m.get(ev); if (s) s.delete(fn); }
  emit(ev, payload) {
    const run = (set) => set && [...set].forEach((fn) => {
      try { fn(payload, ev); } catch (e) { console.error('[roomkit] 事件处理出错:', ev, e); }
    });
    run(this._m.get(ev));
    run(this._m.get('*'));        // 通配：转发给 postMessage / DSH 等外部载体
  }
}

export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/** 点在多边形内（射线法）；pts = [[x,y],...] */
export function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
