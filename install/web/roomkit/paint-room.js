/**
 * RoomKit · 程序化房间：地台、地板材质、两面后墙（护墙板/踢脚线/墙帽）、墙面物件（窗/门/画/钟/搁板）。
 * 风格对齐原壳图：奶油墙、蓝灰护墙板、白色线脚、暖木地板，扁平插画、无描边。
 */
import { shade, hash2, mix, rgba, clamp } from './util.js';

const WALL_T = 0.14;          // 墙厚（格）

/* ───────── 地面 ───────── */

export function paintFloor(ctx, world, iso, opts = {}) {
  const r = world.room, slab = r.slab || 0;
  const P = (x, y, z = 0) => iso.toWorld(x, y, z);
  const poly = (pts, fill) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // 地台侧面（前两条边露出的厚度）
  if (slab > 0) {
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const m = world.cell(x, y);
        if (m < 0) continue;
        const c = r.mats[m].color;
        if (!world.isFloor(x + 1, y)) poly([P(x + 1, y), P(x + 1, y + 1), P(x + 1, y + 1, -slab), P(x + 1, y, -slab)], shade(c, -0.34));
        if (!world.isFloor(x, y + 1)) poly([P(x, y + 1), P(x + 1, y + 1), P(x + 1, y + 1, -slab), P(x, y + 1, -slab)], shade(c, -0.2));
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
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function seg(ctx, iso, x0, y0, x1, y1) {
  const a = iso.toWorld(x0, y0), b = iso.toWorld(x1, y1);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
}

function paintCell(ctx, iso, x, y, mat) {
  const c = mat.color || '#e3a46a';
  switch (mat.kind) {
    case 'wood': {
      // 木地板：每格 4 条板，板沿 x 方向，接缝错开（板长 1.6 格，跨格连续）
      const L = 1.6, strips = 4;
      for (let k = 0; k < strips; k++) {
        const s = y * strips + k, y0 = y + k / strips, y1 = y0 + 1 / strips;
        const off = hash2(s, 7) * L;
        // 按整数板号前进，避免接缝处的浮点舍入使 end === x0 而无限循环。
        const first = Math.floor((x - off) / L), last = Math.ceil((x + 1 - off) / L);
        for (let n = first; n < last; n++) {
          const x0 = Math.max(x, off + n * L);
          const end = Math.min(x + 1, off + (n + 1) * L);
          if (end - x0 < 1e-6) continue;
          const v = (hash2(s, n, 3) - 0.5) * 0.09;
          quad(ctx, iso, x0, y0, end, y1, shade(c, v));
          if (end < x + 1 - 1e-6) {
            ctx.beginPath(); seg(ctx, iso, end, y0, end, y1);
            ctx.strokeStyle = rgba(shade(c, -0.25), 0.55); ctx.lineWidth = 1; ctx.stroke();
          }
        }
        ctx.beginPath(); seg(ctx, iso, x, y1, x + 1, y1);
        ctx.strokeStyle = rgba(shade(c, -0.22), 0.5); ctx.lineWidth = 1; ctx.stroke();
      }
      break;
    }
    case 'tile': {
      const n = 2;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        quad(ctx, iso, x + i / n, y + j / n, x + (i + 1) / n, y + (j + 1) / n, (i + j + x + y) % 2 ? shade(c, -0.06) : c);
      }
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { seg(ctx, iso, x + i / n, y, x + i / n, y + 1); seg(ctx, iso, x, y + i / n, x + 1, y + i / n); }
      ctx.strokeStyle = rgba(shade(c, -0.25), 0.45); ctx.lineWidth = 1.2; ctx.stroke();
      break;
    }
    case 'carpet': {
      quad(ctx, iso, x, y, x + 1, y + 1, c);
      for (let i = 0; i < 7; i++) {
        const px = x + hash2(x, y, i) * 0.9 + 0.05, py = y + hash2(y, x, i + 9) * 0.9 + 0.05, p = iso.toWorld(px, py);
        ctx.fillStyle = rgba(shade(c, i % 2 ? 0.12 : -0.1), 0.6);
        ctx.fillRect(p.x - 1, p.y - 0.5, 2, 1);
      }
      break;
    }
    case 'grass': {
      quad(ctx, iso, x, y, x + 1, y + 1, shade(c, (hash2(x, y, 5) - 0.5) * 0.06));
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const p = iso.toWorld(x + hash2(x, y, i) * 0.9 + 0.05, y + hash2(y, x, i + 4) * 0.9 + 0.05);
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.5, p.y - 5); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 1.8, p.y - 4);
      }
      ctx.strokeStyle = rgba(shade(c, -0.22), 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      break;
    }
    case 'stone': {
      quad(ctx, iso, x, y, x + 1, y + 1, shade(c, (hash2(x, y, 2) - 0.5) * 0.1));
      ctx.beginPath(); seg(ctx, iso, x + 1, y, x + 1, y + 1); seg(ctx, iso, x, y + 1, x + 1, y + 1);
      ctx.strokeStyle = rgba(shade(c, -0.3), 0.5); ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    default:
      quad(ctx, iso, x, y, x + 1, y + 1, c);
  }
}

export function paintGrid(ctx, world, iso, color = 'rgba(255,255,255,.28)') {
  const r = world.room;
  ctx.beginPath();
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (!world.isFloor(x, y)) continue;
    seg(ctx, iso, x, y, x + 1, y); seg(ctx, iso, x, y, x, y + 1);
    if (!world.isFloor(x + 1, y)) seg(ctx, iso, x + 1, y, x + 1, y + 1);
    if (!world.isFloor(x, y + 1)) seg(ctx, iso, x, y + 1, x + 1, y + 1);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
}

/* ───────── 墙 ───────── */

/** 一面墙连续的地面段（镂空格处断开） */
function wallRuns(world, side) {
  const r = world.room, len = side === 'left' ? r.h : r.w, runs = [];
  let start = -1;
  for (let i = 0; i <= len; i++) {
    const ok = i < len && (side === 'left' ? world.isFloor(0, i) : world.isFloor(i, 0));
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) { runs.push([start, i]); start = -1; }
  }
  return runs;
}

/** 墙面上一点（沿墙 u 格、离地 z 像素）→ 世界像素 */
export function wallPoint(iso, side, u, z, out = 0) {
  return side === 'left' ? iso.toWorld(-out, u, z) : iso.toWorld(u, -out, z);
}

export function paintWalls(ctx, world, iso, env, t, opts = {}) {
  const r = world.room, W = r.walls;
  if (!W.left && !W.right) return;
  const H = W.height;
  const sides = [];
  if (W.left) sides.push('left');
  if (W.right) sides.push('right');
  for (const side of sides) {
    const face = side === 'left' ? W.color : shade(W.color, -0.05);
    for (const [u0, u1] of wallRuns(world, side)) {
      const fill = (z0, z1, color) => {
        const a = wallPoint(iso, side, u0, z0), b = wallPoint(iso, side, u1, z0), c = wallPoint(iso, side, u1, z1), d = wallPoint(iso, side, u0, z1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
      };
      fill(0, H, face);
      if (W.pattern === 'stripes' || W.pattern === 'dots' || W.pattern === 'bricks') paintWallPattern(ctx, iso, side, u0, u1, H, face, W.pattern);
      const wz = Math.round(H * 0.3);
      if (W.wainscot) {
        fill(0, wz, side === 'left' ? W.wainscot : shade(W.wainscot, -0.06));
        fill(wz - 2, wz + 5, side === 'left' ? W.trim : shade(W.trim, -0.06));
      }
      fill(0, 9, side === 'left' ? W.trim : shade(W.trim, -0.06));
      // 墙帽（墙顶的厚度面）
      const capC = shade(W.trim, -0.02);
      const a = wallPoint(iso, side, u0, H), b = wallPoint(iso, side, u1, H), c = wallPoint(iso, side, u1, H, WALL_T), d = wallPoint(iso, side, u0, H, WALL_T);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = capC; ctx.fill();
      // 墙的开口端（露出厚度的立面）
      const endU = u1, e0 = wallPoint(iso, side, endU, 0), e1 = wallPoint(iso, side, endU, 0, WALL_T), e2 = wallPoint(iso, side, endU, H, WALL_T), e3 = wallPoint(iso, side, endU, H);
      ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.lineTo(e3.x, e3.y); ctx.closePath();
      ctx.fillStyle = shade(W.color, -0.1); ctx.fill();
    }
  }
  // 墙角柱帽：两面墙都在时补上转角那一小块
  if (W.left && W.right && world.isFloor(0, 0)) {
    const p = (x, y) => iso.toWorld(x, y, H);
    const q = [p(0, 0), p(0, -WALL_T), p(-WALL_T, -WALL_T), p(-WALL_T, 0)];
    ctx.beginPath(); q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); ctx.closePath();
    ctx.fillStyle = shade(W.trim, -0.02); ctx.fill();
  }
  // 墙角阴影：两面墙交界处一道柔和的暗线，增加纵深
  if (W.left && W.right) {
    const a = iso.toWorld(0, 0, 0), b = iso.toWorld(0, 0, H);
    const g = ctx.createLinearGradient(a.x - 14, 0, a.x + 14, 0);
    g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(0.5, 'rgba(60,50,40,.10)'); g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x - 14, b.y, 28, a.y - b.y);
  }
}

function paintWallPattern(ctx, iso, side, u0, u1, H, base, pattern) {
  ctx.save();
  const a = wallPoint(iso, side, u0, 0), b = wallPoint(iso, side, u1, 0), c = wallPoint(iso, side, u1, H), d = wallPoint(iso, side, u0, H);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.clip();
  if (pattern === 'bricks') {
    // 外墙砖：每行 22 像素，奇偶行错半块；只画砖缝
    ctx.strokeStyle = rgba(shade(base, -0.16), 0.6); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let z = 0, row = 0; z < H; z += 22, row++) {
      if (z > 0) { const a0 = wallPoint(iso, side, u0, z), a1 = wallPoint(iso, side, u1, z); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); }
      const z1 = Math.min(z + 22, H);
      for (let u = u0 + (row % 2 ? 0.25 : 0.5); u < u1; u += 0.5) {
        const p = wallPoint(iso, side, u, z), q = wallPoint(iso, side, u, z1);
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
      }
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  const step = pattern === 'stripes' ? 0.25 : 0.2;
  for (let u = u0; u < u1; u += step) {
    if (pattern === 'stripes') {
      const p = wallPoint(iso, side, u + step / 2, 0), q = wallPoint(iso, side, u + step * 0.85, 0);
      ctx.fillStyle = rgba(shade(base, -0.06), 0.55);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineTo(q.x, q.y - H); ctx.lineTo(p.x, p.y - H); ctx.closePath(); ctx.fill();
    } else {
      for (let z = 20; z < H; z += 26) {
        const p = wallPoint(iso, side, u + ((z / 26) % 2 ? step / 2 : 0), z);
        ctx.fillStyle = rgba(shade(base, -0.12), 0.5);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

/* ───────── 墙面物件 ─────────
 * 局部坐标：原点 = 物件左上角，x 向右（局部单位 = 世界像素横向），y 向下（像素）。
 * 用剪切变换贴到墙面上：右墙 x 轴 (1, hh/hw)，左墙 x 轴 (1, −hh/hw)。
 */
export function wallItemFrame(iso, side, at, ww, z, wh) {
  const k = iso.hh / iso.hw;
  if (side === 'left') {
    const o = iso.toWorld(0, at + ww / 2, z + wh);
    return { a: 1, b: -k, c: 0, d: 1, e: o.x, f: o.y, w: ww * iso.hw, h: wh };
  }
  const o = iso.toWorld(at - ww / 2, 0, z + wh);
  return { a: 1, b: k, c: 0, d: 1, e: o.x, f: o.y, w: ww * iso.hw, h: wh };
}

/** 墙面物件四角（世界像素），命中测试用 */
export function wallItemQuad(fr) {
  const P = (x, y) => [fr.a * x + fr.c * y + fr.e, fr.b * x + fr.d * y + fr.f];
  return [P(0, 0), P(fr.w, 0), P(fr.w, fr.h), P(0, fr.h)];
}

export function paintWallItem(ctx, fr, def, obj, pal, env, t, side) {
  ctx.save();
  ctx.transform(fr.a, fr.b, fr.c, fr.d, fr.e, fr.f);
  const dim = side === 'right' ? -0.05 : 0;
  const draw = (def.art && def.art.draw) || 'frame';
  const fn = WALL_ART[draw] || WALL_ART.frame;
  fn(ctx, fr.w, fr.h, pal, env, t, obj, dim, def);
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const WALL_ART = {
  window(ctx, w, h, pal, env, t, obj, dim) {
    const frame = shade(pal('frame'), dim), b = 7;
    // 窗台投影 + 窗框
    ctx.fillStyle = 'rgba(40,40,60,.10)'; ctx.fillRect(4, h - 2, w - 2, 8);
    ctx.fillStyle = frame; rr(ctx, 0, 0, w, h, 3); ctx.fill();
    // 玻璃：天色 + 天气
    const gx = b, gy = b, gw = w - 2 * b, gh = h - 2 * b;
    ctx.save();
    rr(ctx, gx, gy, gw, gh, 2); ctx.clip();
    const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, env.sky[0]); g.addColorStop(1, env.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, gh);
    paintSkyDetails(ctx, gx, gy, gw, gh, env, t, obj);
    // 玻璃反光
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.15, gy + gh); ctx.lineTo(gx + gw * 0.42, gy); ctx.lineTo(gx + gw * 0.52, gy); ctx.lineTo(gx + gw * 0.25, gy + gh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.moveTo(gx + gw * 0.55, gy + gh); ctx.lineTo(gx + gw * 0.78, gy); ctx.lineTo(gx + gw * 0.82, gy); ctx.lineTo(gx + gw * 0.6, gy + gh); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 窗棂
    ctx.fillStyle = frame;
    ctx.fillRect(w / 2 - 3, 0, 6, h);
    if (h > 90) ctx.fillRect(0, h * 0.42, w, 5);
    // 窗台
    ctx.fillStyle = shade(frame, -0.04); ctx.fillRect(-5, h - 4, w + 10, 7);
    // 窗帘（可选）
    if (pal('curtain') !== '#cccccc' && obj.state.curtain !== false) {
      ctx.fillStyle = shade(pal('curtain'), dim);
      for (const sx of [-10, w - 8]) {
        ctx.beginPath(); ctx.moveTo(sx, -8); ctx.lineTo(sx + 18, -8);
        ctx.quadraticCurveTo(sx + 14, h * 0.5, sx + 20, h + 4); ctx.lineTo(sx - 2, h + 4); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = shade(pal('frame'), -0.15); ctx.fillRect(-14, -12, w + 28, 5);
    }
  },
  door(ctx, w, h, pal, env, t, obj, dim) {
    const frame = shade(pal('frame'), dim), wood = shade(pal('main'), dim), b = 8;
    ctx.fillStyle = frame; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = obj.state.open ? '#3a3f52' : wood;
    ctx.fillRect(b, b, w - 2 * b, h - b);
    if (!obj.state.open) {
      ctx.strokeStyle = shade(wood, -0.18); ctx.lineWidth = 2;
      ctx.strokeRect(b + 9, b + 10, w - 2 * b - 18, h * 0.36);
      ctx.strokeRect(b + 9, b + 22 + h * 0.36, w - 2 * b - 18, h * 0.38);
      ctx.fillStyle = '#c9b48a';
      ctx.beginPath(); ctx.arc(w - b - 10, h * 0.55, 3.6, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,230,180,.15)'; ctx.fillRect(b, b, (w - 2 * b) * 0.5, h - b);
    }
  },
  frame(ctx, w, h, pal, env, t, obj, dim) {
    ctx.fillStyle = 'rgba(40,30,30,.10)'; ctx.fillRect(3, 4, w, h);
    ctx.fillStyle = shade(pal('frame'), dim); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = shade('#f5efe3', dim); ctx.fillRect(5, 5, w - 10, h - 10);
    const x = 10, y = 10, iw = w - 20, ih = h - 20;
    const g = ctx.createLinearGradient(0, y, 0, y + ih);
    g.addColorStop(0, shade(pal('sky'), dim)); g.addColorStop(1, shade('#fbe3c6', dim));
    ctx.fillStyle = g; ctx.fillRect(x, y, iw, ih);
    ctx.fillStyle = shade(pal('sea'), dim); ctx.fillRect(x, y + ih * 0.62, iw, ih * 0.38);
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(x + iw * 0.75, y + ih * 0.32, ih * 0.11, 0, Math.PI * 2); ctx.fill();
    // 远处的小鲸鱼
    ctx.fillStyle = shade('#3d6fc4', dim);
    ctx.beginPath(); ctx.ellipse(x + iw * 0.36, y + ih * 0.66, iw * 0.13, ih * 0.07, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + iw * 0.22, y + ih * 0.66); ctx.lineTo(x + iw * 0.16, y + ih * 0.55); ctx.lineTo(x + iw * 0.26, y + ih * 0.6); ctx.closePath(); ctx.fill();
  },
  clock(ctx, w, h, pal, env, t, obj, dim) {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
    ctx.fillStyle = 'rgba(40,30,30,.10)'; ctx.beginPath(); ctx.arc(cx + 2, cy + 3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(pal('frame'), dim); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade('#fffaf0', dim); ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * (r - 7), cy - Math.cos(a) * (r - 7)); ctx.lineTo(cx + Math.sin(a) * (r - 9.5), cy - Math.cos(a) * (r - 9.5)); ctx.stroke();
    }
    const now = new Date(), hr = (now.getHours() % 12) + now.getMinutes() / 60, mn = now.getMinutes() + now.getSeconds() / 60;
    const hand = (a, len, wd, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke();
    };
    hand((hr / 12) * Math.PI * 2, r * 0.45, 2.6, '#3b3440');
    hand((mn / 60) * Math.PI * 2, r * 0.68, 1.8, '#3b3440');
    ctx.fillStyle = pal('accent'); ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
  },
  shelf(ctx, w, h, pal, env, t, obj, dim) {
    const wood = shade(pal('main'), dim);
    ctx.fillStyle = 'rgba(40,30,30,.10)'; ctx.fillRect(2, h - 4, w, 8);
    ctx.fillStyle = wood; ctx.fillRect(0, h - 8, w, 8);
    ctx.fillStyle = shade(wood, -0.15); ctx.fillRect(0, h - 2, w, 2);
    const books = ['#8fb6e8', '#f2c77b', '#e88f8f', '#9fd3b4', '#c7b2ee'];
    let x = 6;
    for (let i = 0; i < 5 && x < w * 0.62; i++) {
      const bw = 7 + (i % 3) * 2, bh = h - 14 - (i % 2) * 6;
      ctx.fillStyle = shade(books[i], dim); ctx.fillRect(x, h - 8 - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 1.5, h - 8 - bh + 4, bw - 3, 2);
      x += bw + 1;
    }
    // 小盆栽
    const px = w * 0.8;
    ctx.fillStyle = shade('#f1ece2', dim); ctx.fillRect(px - 7, h - 20, 14, 12);
    ctx.fillStyle = shade('#6fbf73', dim);
    ctx.beginPath(); ctx.ellipse(px, h - 24, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px - 6, h - 28, 5, 6, -0.5, 0, Math.PI * 2); ctx.fill();
  },
  /** 吊柜：两扇柜门 + 把手，柜底一道阴影 */
  cabinet(ctx, w, h, pal, env, t, obj, dim) {
    const main = shade(pal('main'), dim), door = shade(pal('accent'), dim);
    ctx.fillStyle = 'rgba(40,30,30,.12)'; ctx.fillRect(3, h - 2, w - 2, 9);
    ctx.fillStyle = main; rr(ctx, 0, 0, w, h, 3); ctx.fill();
    const n = Math.max(2, Math.round(w / 46)), gw = (w - 8) / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = door; rr(ctx, 4 + i * gw + 2, 5, gw - 4, h - 10, 2); ctx.fill();
      ctx.fillStyle = shade(main, -0.25);
      const kx = i % 2 ? 4 + i * gw + 7 : 4 + (i + 1) * gw - 9;
      ctx.fillRect(kx, h - 22, 3, 12);
    }
    ctx.fillStyle = shade(main, -0.12); ctx.fillRect(0, h - 3, w, 3);
  },
  /** 厨具挂架：一根横杆挂着锅铲、汤勺和小锅 */
  rack(ctx, w, h, pal, env, t, obj, dim) {
    const metal = shade(pal('main'), dim);
    ctx.fillStyle = metal; ctx.fillRect(0, 4, w, 4);
    ctx.fillStyle = shade(metal, -0.2); ctx.fillRect(-2, 2, 4, 8); ctx.fillRect(w - 2, 2, 4, 8);
    const tools = [['#e3a46a', 'spatula'], ['#b8c0cc', 'ladle'], ['#e8505b', 'pan'], ['#e3a46a', 'whisk']];
    const step = w / (tools.length + 1);
    tools.forEach(([c, k], i) => {
      const x = step * (i + 1), sw = Math.sin(t * 1.2 + i) * 0.03;
      ctx.save(); ctx.translate(x, 8); ctx.rotate(sw);
      ctx.fillStyle = shade(c, dim);
      ctx.fillRect(-1.2, 0, 2.4, h * 0.45);
      if (k === 'spatula') ctx.fillRect(-5, h * 0.45, 10, h * 0.28);
      else if (k === 'ladle') { ctx.beginPath(); ctx.ellipse(0, h * 0.55, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (k === 'pan') { ctx.beginPath(); ctx.ellipse(0, h * 0.62, 11, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.ellipse(-3, h * 0.58, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = shade(c, dim); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, h * 0.6, 4, 9, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    });
  },
  poster(ctx, w, h, pal, env, t, obj, dim) {
    ctx.fillStyle = 'rgba(40,30,30,.10)'; ctx.fillRect(3, 4, w, h);
    ctx.fillStyle = shade(pal('main'), dim); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = shade(pal('accent'), dim);
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, Math.min(w, h) * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(obj.state.text || 'DeepSeek', w / 2, h * 0.86);
  },
  /** 自制/社区墙饰：直接把图贴到墙面上（图片缓存在定义上，加载完下一帧就出现） */
  image(ctx, w, h, pal, env, t, obj, dim, def) {
    const src = def && def.art && def.art.src;
    if (!src) return;
    if (!def._img) { def._img = new Image(); def._img.src = src; }
    if (def._img.complete && def._img.naturalWidth) {
      ctx.fillStyle = 'rgba(40,30,30,.08)'; ctx.fillRect(3, 4, w, h);
      ctx.drawImage(def._img, 0, 0, w, h);
      if (dim) { ctx.fillStyle = `rgba(0,0,0,${-dim})`; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.strokeStyle = 'rgba(120,120,140,.5)'; ctx.setLineDash([4, 3]); ctx.strokeRect(0, 0, w, h); ctx.setLineDash([]);
    }
  },
};

/** 窗外：云、太阳/月亮、雨、雪（随时间流动） */
function paintSkyDetails(ctx, x, y, w, h, env, t, obj) {
  const seed = (obj.at || 0) * 13.7;
  if (env.night) {
    ctx.fillStyle = 'rgba(255,255,240,.9)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 37 + seed * 7) % w), y + ((i * 23 + seed) % (h * 0.6)), 1.5, 1.5);
    if (env.weather === 'clear') { ctx.fillStyle = '#fdf3c8'; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.26, 7, 0, Math.PI * 2); ctx.fill(); }
  } else if (env.weather === 'clear') {
    ctx.fillStyle = 'rgba(255,250,225,.75)'; ctx.beginPath(); ctx.arc(x + w * 0.74, y + h * 0.24, 9, 0, Math.PI * 2); ctx.fill();
  }
  // 云
  const cloudA = env.weather === 'clear' ? 0.55 : 0.8;
  ctx.fillStyle = env.night ? `rgba(160,170,200,${cloudA * 0.4})` : `rgba(255,255,255,${cloudA})`;
  for (let i = 0; i < (env.weather === 'clear' ? 2 : 4); i++) {
    const cx = x + ((t * 4 + i * 61 + seed * 10) % (w + 60)) - 30, cy = y + h * (0.18 + 0.16 * i);
    ctx.beginPath(); ctx.ellipse(cx, cy, 16, 6, 0, 0, Math.PI * 2); ctx.ellipse(cx + 10, cy - 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (env.weather === 'rain') {
    ctx.strokeStyle = 'rgba(225,235,250,.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const px = x + ((i * 17.3 + seed * 3) % w), py = y + ((t * 220 + i * 41) % (h + 20)) - 10;
      ctx.moveTo(px, py); ctx.lineTo(px - 2.5, py + 9);
    }
    ctx.stroke();
  } else if (env.weather === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 22; i++) {
      const px = x + ((i * 19.7 + Math.sin(t * 1.3 + i) * 6 + seed * 3) % w), py = y + ((t * 26 + i * 29) % (h + 10)) - 5;
      ctx.beginPath(); ctx.arc(px, py, 1.6 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** 白天窗光：从窗户斜斜铺到地板上的一块亮斑 */
export function paintWindowLight(ctx, world, iso, env) {
  if (env.sun <= 0.02) return;
  for (const o of world.objects) {
    if (!o.wall) continue;
    const def = world.def(o);
    if (!def || !def.art || def.art.draw !== 'window') continue;
    const ww = def.wsize[0] * 0.8, a0 = o.at - ww / 2, a1 = o.at + ww / 2, L = 2.6, s = 0.8;
    const pts = o.wall === 'right'
      ? [[a0, 0.05], [a1, 0.05], [a1 + s, L], [a0 + s, L]]
      : [[0.05, a0], [0.05, a1], [L, a1 + s], [L, a0 + s]];
    const P = pts.map(([x, y]) => iso.toWorld(clamp(x, 0, world.room.w), clamp(y, 0, world.room.h)));
    const c0 = iso.toWorld(...(o.wall === 'right' ? [o.at, 0] : [0, o.at])), c1 = iso.toWorld(...(o.wall === 'right' ? [o.at + s, L] : [L, o.at + s]));
    const g = ctx.createLinearGradient(c0.x, c0.y, c1.x, c1.y);
    g.addColorStop(0, `rgba(255,244,214,${0.42 * env.sun})`);
    g.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
}

export { mix };
