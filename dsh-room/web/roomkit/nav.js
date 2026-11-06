/**
 * RoomKit · 可走网格与寻路。
 * 地面格 − 阻挡家具占格 = 可走；A* 八向（禁止切角）+ 拉直路径（视线检测）。
 * 摆位变了 world.layoutVersion 递增，下次寻路时惰性重建。
 */
const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

export class Nav {
  constructor(world) { this.world = world; this.version = -1; this.ensure(); }

  ensure() {
    if (this.version === this.world.layoutVersion) return;
    const w = this.world, r = w.room;
    this.W = r.w; this.H = r.h;
    const g = (this.block = new Uint8Array(r.w * r.h));
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
  freeAt(px, py) { this.ensure(); return this.free(Math.floor(px), Math.floor(py)); }

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
          if (d < bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
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
      const x = a.x + (dx * i) / n, y = a.y + (dy * i) / n;
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
    const hfn = (i) => { const x = i % W, y = (i / W) | 0, dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y); return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); };
    gs[si] = 0;
    heap.push(si, hfn(si));
    let found = si === gi;
    while (heap.size && !found) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === gi) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.free(nx, ny)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;   // 禁止切角
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const ng = gs[cur] + cost;
        if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; heap.push(ni, ng + hfn(ni)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = gi; i !== -1; i = came[i]) { cells.push(i); if (i === si) break; }
    cells.reverse();
    const pts = cells.map((i) => ({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 }));
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
}

class MinHeap {
  constructor(cap) { this.idx = new Int32Array(cap * 4 + 8); this.pri = new Float32Array(cap * 4 + 8); this.size = 0; }
  push(i, p) {
    if (this.size >= this.idx.length) { this._grow(); }
    let n = this.size++;
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (this.pri[parent] <= p) break;
      this.idx[n] = this.idx[parent]; this.pri[n] = this.pri[parent]; n = parent;
    }
    this.idx[n] = i; this.pri[n] = p;
  }
  pop() {
    const top = this.idx[0];
    const li = this.idx[--this.size], lp = this.pri[this.size];
    let n = 0;
    for (;;) {
      let c = 2 * n + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.pri[c + 1] < this.pri[c]) c++;
      if (this.pri[c] >= lp) break;
      this.idx[n] = this.idx[c]; this.pri[n] = this.pri[c]; n = c;
    }
    this.idx[n] = li; this.pri[n] = lp;
    return top;
  }
  _grow() {
    const i2 = new Int32Array(this.idx.length * 2), p2 = new Float32Array(this.pri.length * 2);
    i2.set(this.idx); p2.set(this.pri); this.idx = i2; this.pri = p2;
  }
}
