/**
 * RoomKit · 家具绘制：贴图家具（按占格自动缩放、镜像得第二朝向）与程序化家具（零件 → 3D 盒，四朝向、可换色）。
 *
 * 程序化零件（rot=0 的局部坐标：x/y/w/d/r 单位为格，z/h 单位为像素）：
 *   { t:'box',  x,y,z, w,d,h, c, faces?:{top,px,nx,py,ny}, glow?:'py', lit?:'on', o?:不透明度 }
 *   { t:'cyl',  x,y,z, r,h, c, open? }          圆柱（x,y 为圆心）
 *   { t:'cone', x,y,z, r0,r1,h, c, open?, lit? } 圆台（灯罩）
 *   { t:'ball', x,y,z, r, c, sq? }              球/团（叶丛、豆袋）
 *   { t:'rug',  x,y,w,d, c, b?, shape:'rect'|'round', pattern?:'stripes'|'rings' }
 *   { t:'fx',   x,y,z, w,d,h, fx:'fish' }        小动画（鱼缸里的鱼）
 *   when:'on' / '!on'：按家具状态显示零件
 * 光照约定：顶面最亮，+y 面（屏幕左下）原色，+x 面（屏幕右下）压暗——和原壳图同一个光向。
 */
import { shade, rgba, inPoly } from './util.js';
import { depthSort } from './depth.js';
import { paletteOf } from './catalog.js';

const SQ2 = Math.SQRT2;

export function testWhen(state, when) {
  if (!when) return true;
  if (when[0] === '!') return !(state && state[when.slice(1)]);
  return !!(state && state[when]);
}

const ballRx = (p, iso) => p.r * iso.hw * 1.25;
const ballRy = (p, iso) => ballRx(p, iso) * (p.sq || 0.9);

/** 零件的世界包围盒（格坐标为绝对值） */
function partBox(p, fp, obj, iso) {
  const o = fp.o;
  if (p.t === 'box' || p.t === 'rug' || p.t === 'fx') {
    const a = o.map(p.x, p.y), b = o.map(p.x + p.w, p.y + p.d);
    const z0 = p.z || 0;
    return {
      x0: obj.x + Math.min(a[0], b[0]), x1: obj.x + Math.max(a[0], b[0]),
      y0: obj.y + Math.min(a[1], b[1]), y1: obj.y + Math.max(a[1], b[1]),
      z0, z1: z0 + (p.t === 'rug' ? 1 : p.h || 1),
    };
  }
  const c = o.map(p.x, p.y), cx = obj.x + c[0], cy = obj.y + c[1];
  const r = p.t === 'cone' ? Math.max(p.r0, p.r1) : p.r;
  const z0 = p.z || 0, z1 = p.t === 'ball' ? z0 + ballRy(p, iso) * 2 : z0 + (p.h || 0);
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
  for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawBox(ctx, iso, it, p, pal, fp, lit) {
  const { x0, x1, y0, y1, z0, z1 } = it;
  const P = (x, y, z) => iso.toWorld(x, y, z);
  const base = pal(p.c);
  const face = (wf) => {
    const lf = fp.o.localFace(wf);
    if (lit && p.glow === lf) return { c: pal(p.glowC || 'glow'), glow: true };
    const k = p.faces && p.faces[lf];
    return { c: k ? pal(k) : base, glow: false };
  };
  const fy = face('py'), fx = face('px');
  const top = p.faces && p.faces.top ? pal(p.faces.top) : base;
  if (p.o != null) ctx.globalAlpha = p.o;
  poly(ctx, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], fy.c);
  poly(ctx, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], fx.glow ? fx.c : shade(fx.c, -0.13));
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(top, 0.07));
  if (z1 - z0 > 3 && p.o == null) {
    const a = P(x0, y1, z1), b = P(x1, y1, z1), c = P(x1, y0, z1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCyl(ctx, iso, it, p, pal, lit) {
  const base = lit && p.lit ? pal(p.glowC || 'glow') : pal(p.c);
  const a = p.r * iso.hw * SQ2, b = p.r * iso.hh * SQ2;
  const top = iso.toWorld(it.cx, it.cy, it.z1), bot = iso.toWorld(it.cx, it.cy, it.z0);
  if (it.z1 - it.z0 > 0.5) {
    const g = ctx.createLinearGradient(bot.x - a, 0, bot.x + a, 0);
    g.addColorStop(0, shade(base, 0.05)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, -0.2));
    ctx.beginPath();
    ctx.moveTo(top.x - a, top.y); ctx.lineTo(bot.x - a, bot.y);
    ctx.ellipse(bot.x, bot.y, a, b, 0, Math.PI, 0, true);
    ctx.lineTo(top.x + a, top.y); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(top.x, top.y, a, b, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.open ? shade(base, -0.3) : shade(base, 0.08); ctx.fill();
}

function drawCone(ctx, iso, it, p, pal, lit) {
  const base = lit && p.lit ? pal(p.glowC || 'glow') : pal(p.c);
  const k = iso.hw * SQ2, kh = iso.hh * SQ2;
  const a0 = p.r0 * k, b0 = p.r0 * kh, a1 = p.r1 * k, b1 = p.r1 * kh;
  const top = iso.toWorld(it.cx, it.cy, it.z1), bot = iso.toWorld(it.cx, it.cy, it.z0);
  const g = ctx.createLinearGradient(bot.x - a0, 0, bot.x + a0, 0);
  g.addColorStop(0, shade(base, 0.06)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, lit && p.lit ? -0.06 : -0.2));
  ctx.beginPath();
  ctx.moveTo(top.x - a1, top.y); ctx.lineTo(bot.x - a0, bot.y);
  ctx.ellipse(bot.x, bot.y, a0, b0, 0, Math.PI, 0, true);
  ctx.lineTo(top.x + a1, top.y); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.ellipse(top.x, top.y, a1, b1, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.open ? shade(base, lit && p.lit ? 0.25 : -0.28) : shade(base, 0.08); ctx.fill();
}

function drawBall(ctx, iso, it, p, pal) {
  const base = pal(p.c), rx = ballRx(p, iso), ry = ballRy(p, iso);
  const c = iso.toWorld(it.cx, it.cy, it.z0 + ry);
  const g = ctx.createRadialGradient(c.x - rx * 0.35, c.y - ry * 0.45, rx * 0.08, c.x, c.y, rx * 1.05);
  g.addColorStop(0, shade(base, 0.2)); g.addColorStop(0.62, base); g.addColorStop(1, shade(base, -0.16));
  ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
}

function rugRing(iso, p, fp, obj, inset, n = 36) {
  const pts = [];
  const push = (lx, ly) => { const m = fp.o.map(lx, ly); pts.push(iso.toWorld(obj.x + m[0], obj.y + m[1], 0.5)); };
  if (p.shape === 'round') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      push(p.x + p.w / 2 + (p.w / 2 - inset) * Math.cos(a), p.y + p.d / 2 + (p.d / 2 - inset) * Math.sin(a));
    }
  } else {
    push(p.x + inset, p.y + inset); push(p.x + p.w - inset, p.y + inset);
    push(p.x + p.w - inset, p.y + p.d - inset); push(p.x + inset, p.y + p.d - inset);
  }
  return pts;
}

function drawRug(ctx, iso, it, p, pal, fp, obj) {
  const base = pal(p.c), border = pal(p.b || p.c);
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,20,.12)'; ctx.shadowOffsetY = 2; ctx.shadowBlur = 3;
  poly(ctx, rugRing(iso, p, fp, obj, 0), shade(base, -0.06));
  ctx.restore();
  poly(ctx, rugRing(iso, p, fp, obj, 0.08), border);
  const inner = rugRing(iso, p, fp, obj, 0.17);
  poly(ctx, inner, base);
  if (p.pattern) {
    ctx.save();
    ctx.beginPath(); inner.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = rgba(border, 0.55); ctx.lineWidth = 3;
    if (p.pattern === 'stripes') {
      for (let k = 1; k < 6; k++) {
        const ly = p.y + (p.d * k) / 6, a = fp.o.map(p.x, ly), b = fp.o.map(p.x + p.w, ly);
        const A = iso.toWorld(obj.x + a[0], obj.y + a[1], 0.5), B = iso.toWorld(obj.x + b[0], obj.y + b[1], 0.5);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    } else if (p.pattern === 'rings') {
      for (const ins of [0.35, 0.6]) {
        const r = rugRing(iso, Object.assign({}, p, { shape: p.shape }), fp, obj, ins);
        ctx.beginPath(); r.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const FISH = ['#ff9f5a', '#ffd166', '#7fc8f8', '#f78fb3'];
function drawFx(ctx, iso, it, p, pal, fp, obj, t) {
  if (p.fx === 'fish') {
    for (let i = 0; i < 3; i++) {
      const ph = t * (0.45 + i * 0.12) + i * 2.1;
      const u = 0.5 + 0.38 * Math.sin(ph), v = 0.25 + 0.25 * i;
      const lx = p.x + p.w * u, ly = p.y + p.d * v, z = (p.z || 0) + p.h * (0.3 + 0.18 * i) + 3 * Math.sin(t * 2 + i);
      const m = fp.o.map(lx, ly), q = iso.toWorld(obj.x + m[0], obj.y + m[1], z);
      const dir = fp.o.dir(Math.cos(ph) >= 0 ? 1 : -1, 0), right = dir[0] - dir[1] > 0;
      ctx.save(); ctx.translate(q.x, q.y); if (!right) ctx.scale(-1, 1);
      ctx.fillStyle = FISH[i % FISH.length];
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-10, -3.5 + Math.sin(t * 9 + i)); ctx.lineTo(-10, 3.5 + Math.sin(t * 9 + i)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b2436'; ctx.beginPath(); ctx.arc(3, -1, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.35 + i * 0.27) % 1), m = fp.o.map(p.x + p.w * (0.2 + 0.15 * (i % 2)), p.y + p.d * 0.5);
      const q = iso.toWorld(obj.x + m[0], obj.y + m[1], (p.z || 0) + p.h * k);
      ctx.beginPath(); ctx.arc(q.x + Math.sin(t * 3 + i) * 2, q.y, 1.3 + (i % 2), 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function paintProc(ctx, iso, def, obj, fp, env, t) {
  const pal = paletteOf(def, obj);
  for (const it of partItems(def, obj, fp, iso)) {
    const p = it.part, lit = testWhen(obj.state, p.lit);
    switch (p.t) {
      case 'box': drawBox(ctx, iso, it, p, pal, fp, lit); break;
      case 'cyl': drawCyl(ctx, iso, it, p, pal, lit); break;
      case 'cone': drawCone(ctx, iso, it, p, pal, lit); break;
      case 'ball': drawBall(ctx, iso, it, p, pal); break;
      case 'rug': drawRug(ctx, iso, it, p, pal, fp, obj); break;
      case 'fx': drawFx(ctx, iso, it, p, pal, fp, obj, t); break;
    }
  }
}

/* ───────── 贴图家具 ─────────
 * 宽度：贴图宽 = 占格在屏幕上的宽度 × fit；底边对齐占格最前角（地毯：中心对齐）。
 * dx/dy：世界像素微调（镜像时 dx 一起翻）；sy：纵向压扁（俯视画法的地毯压成 2:1 等距）。
 */
export function spriteGeom(iso, def, fp, img) {
  const art = def.art, flat = def.mount === 'flat';
  const cx = (fp.x0 + fp.w / 2 - (fp.y0 + fp.h / 2)) * iso.hw;
  const by = flat ? (fp.x0 + fp.y0 + (fp.w + fp.h) / 2) * iso.hh : (fp.x1 + fp.y1) * iso.hh;
  const span = (fp.w + fp.h) * iso.hw;
  const s = ((art.fit || 1) * span) / img.width, sy = s * (art.sy || 1);
  const dw = img.width * s, dh = img.height * sy;
  return { cx, by, s, sy, dw, dh, ox: -dw / 2 + (art.dx || 0), oy: (flat ? -dh / 2 : -dh) + (art.dy || 0), mirror: !!fp.o.mirror };
}

export function paintSprite(ctx, iso, def, obj, fp, img) {
  const g = spriteGeom(iso, def, fp, img);
  ctx.save();
  ctx.translate(g.cx, g.by);
  if (g.mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, g.ox, g.oy, g.dw, g.dh);
  ctx.restore();
  return g;
}

/** 素材缺失时的兜底：一个带颜色的柔和立方块（不是终态，提示该接贴图了） */
export function paintPlaceholder(ctx, iso, def, obj, fp) {
  const pal = paletteOf(def, obj);
  const it = { x0: fp.x0 + 0.06, x1: fp.x1 - 0.06, y0: fp.y0 + 0.06, y1: fp.y1 - 0.06, z0: 0, z1: def.mount === 'flat' ? 2 : Math.min(def.height, 90) };
  drawBox(ctx, iso, it, { c: def.palette.main ? 'main' : '#d8cbb8' }, pal, fp, false);
}

export function paintObject(ctx, iso, def, obj, fp, env, t, sprites) {
  if (def.art.kind === 'sprite') {
    const e = sprites.get(def.art.src);
    if (e.ready) return paintSprite(ctx, iso, def, obj, fp, e.img);
    if (def.art.parts) return paintProc(ctx, iso, def, obj, fp, env, t);   // 贴图未就绪：有程序化备选就先画它
    if (e.failed) paintPlaceholder(ctx, iso, def, obj, fp);
    return null;
  }
  paintProc(ctx, iso, def, obj, fp, env, t);
  return null;
}

/* ───────── 命中测试（世界像素） ───────── */

export function hitObject(iso, def, obj, fp, wx, wy, sprites) {
  if (def.art.kind === 'sprite') {
    const e = sprites.get(def.art.src);
    if (e.ready) {
      const g = spriteGeom(iso, def, fp, e.img);
      let u = wx - g.cx; if (g.mirror) u = -u;
      const px = (u - g.ox) / g.s, py = (wy - g.by - g.oy) / g.sy;
      if (px < 0 || py < 0 || px >= e.img.width || py >= e.img.height) return false;
      if (e.mask) {
        const mx = Math.floor(px * e.mask.k), my = Math.floor(py * e.mask.k);
        return e.mask.a[my * e.mask.w + mx] > 40;
      }
    }
    // 无透明度数据（file:// 下画布被污染）：退回立体包围盒
    const z1 = def.mount === 'flat' ? 1 : def.height;
    return inPoly(wx, wy, iso.boxHull(fp.x0, fp.y0, fp.x1, fp.y1, 0, z1));
  }
  for (const it of partItems(def, obj, fp, iso)) {
    const p = it.part;
    if (p.t === 'rug') { if (inPoly(wx, wy, rugRing(iso, p, fp, obj, 0).map((q) => [q.x, q.y]))) return true; continue; }
    if (p.t === 'ball') {
      const rx = ballRx(p, iso), ry = ballRy(p, iso), c = iso.toWorld(it.cx, it.cy, it.z0 + ry);
      if (((wx - c.x) / rx) ** 2 + ((wy - c.y) / ry) ** 2 <= 1) return true;
      continue;
    }
    if (inPoly(wx, wy, iso.boxHull(it.x0, it.y0, it.x1, it.y1, it.z0, it.z1))) return true;
  }
  return false;
}

/** 屏幕外接矩形（世界像素），排序与视野裁剪用 */
export function objectRect(iso, def, fp, sprites) {
  if (def.art.kind === 'sprite') {
    const e = sprites.get(def.art.src);
    if (e.ready) {
      const g = spriteGeom(iso, def, fp, e.img);
      const l = g.mirror ? g.cx - (g.ox + g.dw) : g.cx + g.ox;
      return { l, r: l + g.dw, t: g.by + g.oy, b: g.by + g.oy + g.dh };
    }
  }
  return iso.boxRect(fp.x0, fp.y0, fp.x1, fp.y1, 0, def.mount === 'flat' ? 1 : def.height);
}

/** 家具库缩略图：程序化家具画到小画布上（贴图家具直接用 <img>） */
export function procThumb(def, iso, size = 84) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const ctx = c.getContext('2d');
  const obj = { x: 0, y: 0, rot: 0, state: Object.assign({}, def.states, def.thumbState || {}) };
  const fp = { x0: 0, y0: 0, x1: def.size[0], y1: def.size[1], w: def.size[0], h: def.size[1], o: { map: (x, y) => [x, y], dir: (a, b) => [a, b], localFace: (f) => f, mirror: false } };
  const r = iso.boxRect(0, 0, fp.w, fp.h, 0, def.mount === 'flat' ? 1 : def.height);
  const k = Math.min((size - 10) / (r.r - r.l), (size - 10) / (r.b - r.t));
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (size / 2 - ((r.l + r.r) / 2) * k) * dpr, (size / 2 - ((r.t + r.b) / 2) * k) * dpr);
  paintProc(ctx, iso, def, obj, fp, { night: false, sky: ['#9cc8f0', '#e6f3ff'], weather: 'clear' }, 0);
  return c;
}
