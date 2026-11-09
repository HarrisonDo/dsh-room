/**
 * RoomKit · 渲染器：画布、相机、统一深度排序、光照、命中测试。
 *
 * 每帧：墙 → 墙面物件 → 地板 → 窗光 → 地毯 → 接触阴影 → 家具+角色（拓扑排序）→ 光照 → 编辑层 → 头顶表情
 * 光照：夜色/色罩画进一张 lightmap，灯光在里面"挖洞"，再以 source-atop 叠回场景（只染有内容的像素，
 *       所以开放场景/透明背景也不会被染出一块方形）。
 */
import { clamp, ease, rgba, shade, inPoly, mix, hash2 } from './util.js';
import { depthSort } from './depth.js';
import { paintFloor, paintWalls, paintWallItem, wallItemFrame, wallItemQuad, paintWindowLight } from './paint-room.js';
import { paintObject, hitObject, objectRect } from './paint-furniture.js';
import { paintEmote } from './paint-emote.js';
import { paletteOf } from './catalog.js';

/* ───────── 贴图缓存（含透明度遮罩，用于像素级命中） ─────────
 * base：素材根地址（DSH 里静态资源不在页面同目录时传入）；加载失败的贴图家具会退回它的程序化备选零件。 */
export class Sprites {
  constructor(base) {
    this.map = new Map(); this.onload = null; this.base = base || null;
    // new URL(src, base) 要求 base 是绝对地址，而 DSH 传的是 /plugins/... 这样的路径
    if (base) { try { this.base = new URL(base, location.href).href; } catch (e) { /* 保持原样 */ } }
  }
  get(src) {
    let e = this.map.get(src);
    if (e) return e;
    e = { img: new Image(), ready: false, failed: false, mask: null };
    e.img.decoding = 'async';
    e.img.onload = () => { e.ready = true; e.mask = buildMask(e.img); if (this.onload) this.onload(src); };
    e.img.onerror = () => { e.failed = true; console.warn('[roomkit] 贴图加载失败，改用程序化备选:', src); };
    let url = src;
    if (this.base && !/^(?:[a-z]+:|\/)/i.test(src)) { try { url = new URL(src, this.base).href; } catch (err) { /* 保持原样 */ } }
    e.img.src = url;
    this.map.set(src, e);
    return e;
  }
  url(src) {
    if (!this.base || /^(?:[a-z]+:|\/)/i.test(src)) return src;
    try { return new URL(src, this.base).href; } catch (e) { return src; }
  }
}
function buildMask(img) {
  try {
    const w = Math.min(256, img.width), h = Math.max(1, Math.round((img.height * w) / img.width));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return { w, h, a, k: w / img.width };
  } catch (e) {
    return null;       // file:// 下画布被视为跨源污染：退回包围盒命中
  }
}

const AGENT_R = 0.18;

export class Renderer {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.iso = app.iso;
    this.sprites = new Sprites(app.opts.assetBase);
    this.cam = { x: 0, y: 0, z: 1 };
    this.camT = { x: 0, y: 0, z: 1 };
    this.fitZ = 1; this.fitC = { x: 0, y: 0 };
    this.vw = 1; this.vh = 1; this.dpr = 1;
    this.hover = null;
    this.selected = null;
    this.lm = document.createElement('canvas');
    this.ents = { flats: [], sorted: [], walls: [] };
    this.overlay = null;
    this.showNames = false;
    this.hidden = new Set();        // 布置模式拖动中的物件：原位不画，只画幽灵
    this.wobble = new Map();        // 物件 id → 开始摇晃的时间（点击反馈）
    this._bgAt = -1;
  }

  /* ───────── 尺寸与相机 ───────── */

  resize() {
    const host = this.canvas.parentElement;
    const r = host.getBoundingClientRect();
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.lm.width = this.canvas.width; this.lm.height = this.canvas.height;
    const wasFit = !this._fitted || Math.abs(this.camT.z - this.fitZ) < 1e-3;
    this.computeFit();
    if (wasFit) { this.fit(true); this._fitted = true; }
  }

  roomBounds() {
    const r = this.app.world.room, iso = this.iso;
    const H = r.walls.left || r.walls.right ? r.walls.height : 120;
    return { l: -r.h * iso.hw - 16, r: r.w * iso.hw + 16, t: -H - 18, b: (r.w + r.h) * iso.hh + (r.slab || 0) + 14 };
  }
  computeFit() {
    const b = this.roomBounds(), pad = this.app.opts.ui === 'compact' ? 6 : 28;
    // insetT/insetB：顶栏与底部 Dock 占掉的高度，房间居中在剩下的区域里
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
    this.camT = { x: wx, y: wy + (this.vh * 0.12) / z, z };
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
    this.camT.x -= dx / this.camT.z; this.camT.y -= dy / this.camT.z;
    this.clampCam();
    this.cam.x = this.camT.x; this.cam.y = this.camT.y;
  }
  clampCam() {
    const b = this.roomBounds();
    this.camT.x = clamp(this.camT.x, b.l, b.r);
    this.camT.y = clamp(this.camT.y, b.t, b.b);
  }
  screenToWorld(sx, sy, cam = this.cam) { return { x: cam.x + (sx - this.vw / 2) / cam.z, y: cam.y + (sy - this.vh / 2) / cam.z }; }
  worldToScreen(wx, wy, cam = this.cam) { return { x: (wx - cam.x) * cam.z + this.vw / 2, y: (wy - cam.y) * cam.z + this.vh / 2 }; }
  tileToScreen(x, y, z = 0) { const p = this.iso.toWorld(x, y, z); return this.worldToScreen(p.x, p.y); }

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
    if (t - this._bgAt > 2) { this._bgAt = t; this._paintBackground(env); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._worldTransform(ctx);

    paintWalls(ctx, world, iso, env, t);
    this._drawWallItems(ctx, env, t);
    paintFloor(ctx, world, iso, { grid: app.mode === 'edit' });
    paintWindowLight(ctx, world, iso, env);

    const { flats, solids } = this._buildEntities();
    for (const e of flats) this._drawEntity(ctx, e, env, t);
    this._drawShadows(ctx, solids);
    const sorted = depthSort(solids);
    for (const e of sorted) this._drawEntity(ctx, e, env, t);
    this.ents.flats = flats; this.ents.sorted = sorted;
    if (world.room.outdoor) this._drawWeather(ctx, env, t);

    this._drawLighting(env, t);

    this._worldTransform(ctx);
    if (this.overlay) this.overlay(ctx, t);
    this._drawAgentHud(ctx, t);
  }

  _paintBackground(env) {
    const host = this.app.root;
    if (!host || this.app.opts.transparent) return;
    const top = mix(env.sky[0], '#ffffff', env.night ? 0.06 : 0.55), bottom = mix(env.sky[1], '#ffffff', env.night ? 0.02 : 0.45);
    host.style.setProperty('--rk-bg-a', top);
    host.style.setProperty('--rk-bg-b', bottom);
    host.classList.toggle('rk-night', !!env.night);
  }

  _buildEntities() {
    const world = this.app.world, iso = this.iso, flats = [], solids = [];
    for (const o of world.objects) {
      if (o.wall || this.hidden.has(o.id)) continue;
      const def = world.def(o);
      if (!def) continue;
      const fp = world.footprint(o, def);
      const rc = objectRect(iso, def, fp, this.sprites);
      const e = { kind: 'obj', id: o.id, o, def, fp, x0: fp.x0, x1: fp.x1, y0: fp.y0, y1: fp.y1, z0: 0, z1: def.mount === 'flat' ? 1 : def.height, l: rc.l, r: rc.r, t: rc.t, b: rc.b };
      (def.mount === 'flat' ? flats : solids).push(e);
    }
    for (const a of this.app.agents.values()) {
      const m = a.body.metrics, p = iso.toWorld(a.x, a.y, a.z);
      const e = {
        kind: 'agent', id: 'agent:' + a.id, a, m,
        x0: a.x - AGENT_R, x1: a.x + AGENT_R, y0: a.y - AGENT_R, y1: a.y + AGENT_R, z0: a.z, z1: a.z + m.h * 0.6,
        l: p.x - m.rx - 14, r: p.x + m.rx + 14, t: p.y - m.h - 12, b: p.y + 8,
      };
      if (a.attach) { if (a.attach.slot.layer === 'back') e.before = a.attach.obj.id; else e.after = a.attach.obj.id; }
      solids.push(e);
    }
    flats.sort((p, q) => p.x0 + p.y0 - (q.x0 + q.y0));
    return { flats, solids };
  }

  _isLit(id) { return (this.hover && this.hover.id === id) || (this.selected && this.selected.id === id); }

  _drawEntity(ctx, e, env, t) {
    const iso = this.iso;
    const w0 = this.wobble.get(e.id);
    const wob = w0 != null && t - w0 < 0.7 ? Math.sin((t - w0) * 34) * 0.035 * (1 - (t - w0) / 0.7) : 0;
    if (w0 != null && !wob) this.wobble.delete(e.id);
    const draw = (g) => {
      if (wob) { const px = (e.l + e.r) / 2, py = e.b; g.save(); g.translate(px, py); g.rotate(wob); g.translate(-px, -py); }
      if (e.kind === 'obj') paintObject(g, iso, e.def, e.o, e.fp, env, t, this.sprites);
      else {
        const p = iso.toWorld(e.a.x, e.a.y, e.a.z);
        g.save(); g.translate(p.x, p.y); e.a.body.draw(g, t); g.restore();
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
    if (!(w > 0 && h > 0) || w > 4096 || h > 4096) { draw(ctx); return; }
    const oc = this._gc || (this._gc = document.createElement('canvas'));
    if (oc.width < w || oc.height < h) { oc.width = Math.max(oc.width, w); oc.height = Math.max(oc.height, h); }
    const g = oc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(z, 0, 0, z, pad - e.l * z, pad - e.t * z);
    draw(g);
    ctx.save();
    ctx.shadowColor = strong ? 'rgba(120,190,255,.95)' : 'rgba(255,246,214,.95)';
    ctx.shadowBlur = (strong ? 14 : 11) * this.dpr;
    if ('filter' in ctx) ctx.filter = 'brightness(1.07)';
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
      const quad = wallItemQuad(fr);
      const xs = quad.map((q) => q[0]), ys = quad.map((q) => q[1]);
      const e = { kind: 'wall', id: o.id, o, def, fr, quad, l: Math.min(...xs) - 16, r: Math.max(...xs) + 16, t: Math.min(...ys) - 16, b: Math.max(...ys) + 16 };
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
      if (e.kind === 'obj') {
        if (e.def.noShadow) continue;
        const c = iso.toWorld((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2);
        const span = (e.fp.w + e.fp.h) / 2;
        ctx.fillStyle = 'rgba(60,40,30,.10)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, span * iso.hw * 0.82, span * iso.hh * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        const a = e.a, r = e.m.rx, c = iso.toWorld(a.x, a.y, 0);
        const k = clamp(1 - a.z / 120, 0.5, 1);
        if (this.selected && this.selected.id === e.id) {
          ctx.strokeStyle = 'rgba(110,180,255,.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.95, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (a.attach && a.attach.slot.pose === 'sleep') continue;
        ctx.fillStyle = `rgba(30,32,60,${0.2 * k})`;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.72 * k, r * 0.28 * k, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /** 户外场景（room.outdoor）的雨雪：画在世界坐标里，跟着相机走，也会被夜色染暗 */
  _drawWeather(ctx, env, t) {
    const w = env.weather;
    if (w !== 'rain' && w !== 'snow') return;
    const b = this.roomBounds(), W = b.r - b.l, H = b.b - b.t;
    const wrap = (v, n) => ((v % n) + n) % n;
    ctx.save();
    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(205,220,245,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 160; i++) {
        const v = 480 + hash2(i, 2) * 160, x = b.l + wrap(hash2(i, 1) * W - t * v * 0.25, W), y = b.t + wrap(hash2(i, 3) * H + t * v, H);
        ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 15);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      for (let i = 0; i < 110; i++) {
        const k = hash2(i, 2), x = b.l + wrap(hash2(i, 1) * W + Math.sin(t * 0.7 + i) * 14, W), y = b.t + wrap(hash2(i, 3) * H + t * (22 + k * 22), H);
        ctx.beginPath(); ctx.arc(x, y, 1.3 + k * 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawLighting(env, t) {
    const dark = env.dark, tintK = env.tintK;
    if (dark < 0.01 && tintK < 0.01) return;
    const lm = this.lm, g = lm.getContext('2d'), W = lm.width, H = lm.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    if (tintK > 0.01) { g.fillStyle = rgba(env.tint, tintK * 0.55); g.fillRect(0, 0, W, H); }
    if (dark > 0.01) { g.fillStyle = rgba('#0b1433', dark); g.fillRect(0, 0, W, H); }
    const lights = this.app.world.lights();
    const z = this.cam.z * this.dpr, iso = this.iso;
    g.globalCompositeOperation = 'destination-out';
    for (const L of lights) {
      const f = this.worldToScreen(iso.toWorld(L.x, L.y, 0).x, iso.toWorld(L.x, L.y, 0).y);
      const h = this.worldToScreen(iso.toWorld(L.x, L.y, L.z).x, iso.toWorld(L.x, L.y, L.z).y);
      const R = L.radius * iso.hw * z;
      const flick = 1 + Math.sin(t * 7 + L.x * 3) * 0.015;
      for (const [p, r, a] of [[f, R * flick, 0.95 * L.power], [h, R * 0.55, 0.85 * L.power]]) {
        const gr = g.createRadialGradient(p.x * this.dpr, p.y * this.dpr, 0, p.x * this.dpr, p.y * this.dpr, r);
        gr.addColorStop(0, `rgba(0,0,0,${Math.min(1, a)})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(p.x * this.dpr - r, p.y * this.dpr - r, r * 2, r * 2);
      }
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(lm, 0, 0);
    // 暖光：灯罩处一团加色辉光
    if (dark > 0.08 && lights.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        const h = this.worldToScreen(iso.toWorld(L.x, L.y, L.z).x, iso.toWorld(L.x, L.y, L.z).y);
        const r = L.radius * iso.hw * z * 0.6;
        const gr = ctx.createRadialGradient(h.x * this.dpr, h.y * this.dpr, 0, h.x * this.dpr, h.y * this.dpr, r);
        gr.addColorStop(0, rgba(L.color, 0.32 * dark * L.power)); gr.addColorStop(1, rgba(L.color, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(h.x * this.dpr - r, h.y * this.dpr - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  _drawAgentHud(ctx, t) {
    const iso = this.iso;
    // 剧情标记：有剧情等着被点开的家具/角色头顶冒"！"（半秒刷新一次）
    if (!this._mkAt || t - this._mkAt > 0.5) { this._mkAt = t; this._mk = this.app.stories ? this.app.stories.markers() : []; }
    for (const m of this._mk || []) {
      let p = null;
      let top = 50;
      if (m.id.indexOf('agent:') === 0) {
        const a = this.app.agents.get(m.id.slice(6));
        if (a) { const q = iso.toWorld(a.x, a.y, a.z); p = { x: q.x, y: q.y }; top = this._top(a) + 14; }
      } else {
        const e = this.ents.sorted.find((x) => x.id === m.id) || this.ents.flats.find((x) => x.id === m.id) || this.ents.walls.find((x) => x.id === m.id);
        if (e) p = { x: (e.l + e.r) / 2, y: e.t + 72 };
      }
      if (!p) continue;
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(t * 3.2) * 3);
      paintEmote(ctx, '!', t, 1, top);
      ctx.restore();
    }
    for (const a of this.app.agents.values()) {
      const p = iso.toWorld(a.x, a.y, a.z), top = this._top(a);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (a.emo) paintEmote(ctx, a.emo.kind, t, a.t - a.emo.t0, top);
      else if (a.pose === 'sleep') paintEmote(ctx, 'zzz', t, 1, top);
      if (this.showNames || (this.selected && this.selected.id === 'agent:' + a.id)) {
        ctx.font = '600 11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        const w = ctx.measureText(a.name).width + 12;
        ctx.fillStyle = 'rgba(16,22,40,.62)';
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2, 8, w, 16, 8); else ctx.rect(-w / 2, 8, w, 16); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(a.name, 0, 20);
      }
      ctx.restore();
    }
  }

  /** 角色头顶离脚底多高（坐下/躺下会矮一截） */
  _top(a) {
    const h = a.body.metrics.h;
    return a.pose === 'sleep' ? h * 0.55 : ['sit', 'work', 'read', 'eat'].includes(a.pose) ? h * 0.9 : h;
  }

  /* ───────── 命中 ───────── */

  pick(sx, sy, opts = {}) {
    const w = this.screenToWorld(sx, sy), iso = this.iso, world = this.app.world;
    const sorted = this.ents.sorted;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const e = sorted[i];
      if (w.x < e.l || w.x > e.r || w.y < e.t || w.y > e.b) continue;
      if (e.kind === 'agent') {
        if (opts.noAgents) continue;
        const a = e.a, p = iso.toWorld(a.x, a.y, a.z), top = this._top(a);
        if (((w.x - p.x) / e.m.rx) ** 2 + ((w.y - (p.y - top / 2)) / (top / 2 + 4)) ** 2 <= 1) return { kind: 'agent', agent: a, id: e.id };
      } else if (hitObject(iso, e.def, e.o, e.fp, w.x, w.y, this.sprites)) {
        return { kind: 'obj', obj: e.o, def: e.def, id: e.id };
      }
    }
    for (const e of this.ents.walls) if (inPoly(w.x, w.y, e.quad)) return { kind: 'obj', obj: e.o, def: e.def, id: e.id, wall: true };
    const flats = this.ents.flats;
    for (let i = flats.length - 1; i >= 0; i--) {
      const e = flats[i];
      if (hitObject(iso, e.def, e.o, e.fp, w.x, w.y, this.sprites)) return { kind: 'obj', obj: e.o, def: e.def, id: e.id };
    }
    const tile = iso.toTile(w.x, w.y);
    if (world.isFloor(Math.floor(tile.x), Math.floor(tile.y))) return { kind: 'floor', x: tile.x, y: tile.y };
    const wf = this.wallAt(sx, sy);
    if (wf) return Object.assign({ kind: 'wallface' }, wf);
    return null;
  }

  /** 屏幕点落在哪面墙上：{ side, u（沿墙格）, z（离地像素）} */
  wallAt(sx, sy, loose) {
    const w = this.screenToWorld(sx, sy), iso = this.iso, world = this.app.world, r = world.room;
    const side = w.x >= 0 ? 'right' : 'left';
    if (!world.hasWall(side)) return null;
    const u = side === 'right' ? w.x / iso.hw : -w.x / iso.hw;
    const z = u * iso.hh - w.y;
    const len = world.wallLen(side);
    if (!loose && (u < 0 || u > len || z < 0 || z > r.walls.height)) return null;
    return { side, u: clamp(u, 0, len), z: clamp(z, 0, r.walls.height) };
  }

  /** 实体顶部中点的屏幕坐标（名牌、气泡锚点） */
  anchorOf(hit) {
    if (!hit) return null;
    if (hit.kind === 'agent') {
      const a = hit.agent;
      const p = this.iso.toWorld(a.x, a.y, a.z);
      return this.worldToScreen(p.x, p.y - this._top(a) - 6);
    }
    const all = this.ents.sorted.concat(this.ents.walls, this.ents.flats);
    const e = all.find((x) => x.id === hit.id);
    if (!e) return null;
    return this.worldToScreen((e.l + e.r) / 2, e.t + (e.kind === 'wall' ? 16 : 0));
  }
}
