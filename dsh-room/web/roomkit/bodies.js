/**
 * RoomKit · 角色身体。引擎只认这几个方法：
 *   metrics {h, rx, ry}（身高、命中椭圆半径，世界像素）· update(dt) · draw(ctx, t)（原点在脚底）
 *   bounce(k) · talk() · pointer(wx, wy) · dispose()
 *
 * GirlBody：程序化 Q 版鲸鱼娘（默认，零素材）；WhaleBody：圆滚滚小鲸鱼（look.kind='whale'）；
 * RigBody：真模型（Live2D 式分件动画）。真模型是可选件：页面加载了 vendor/whale-rig.js（全局 RoomKitRig，AGPL-3.0）
 * 才有；每只占一个 WebGL 上下文，名额有限，用完了后来的角色就用 GirlBody，加载失败也退回 GirlBody。
 */
import { paintGirl, GIRL_H } from './paint-girl.js';
import { paintWhale } from './paint-whale.js';
import { TokenBody } from './token-body.js';
import { hexToRgb } from './util.js';

export class GirlBody {
  constructor(agent) { this.a = agent; }
  get metrics() { const s = this.a.look.size || 1; return { h: GIRL_H * s, rx: 30 * s, ry: 54 * s }; }
  update() {}
  draw(g, t) { paintGirl(g, this.a, t); }
  bounce() {}
  talk() {}
  pointer() {}
  dispose() {}
}

export class WhaleBody extends GirlBody {
  get metrics() { const s = this.a.look.size || 1.4; return { h: 62 * s, rx: 30 * s, ry: 30 * s }; }
  draw(g, t) { paintWhale(g, this.a, t); }
}

/* ───────── 真模型 ───────── */

const SVGNS = 'http://www.w3.org/2000/svg';
const STAGE = 1000, X0 = 500, FLOOR = 900;
const S0 = 0.45;           // kit 的物理参数按这个比例调的（跳跃高度、走路步频）
const SCALE = 0.42;        // 模型单位 → 世界像素：256 单位身高 ≈ 107 像素
const EXPR = { happy: 'happy', surprised: 'surprised', love: 'love', sad: 'sad', sleep: 'sleepy', shy: 'shy', determined: 'determined', angry: 'angry', wink: 'wink', think: 'thinking', worried: 'worried', excited: 'excited', smug: 'smug', confused: 'confused' };
const SITS = new Set(['sit', 'work', 'read', 'eat']);

/** 代表色相对原版蓝色的色相差：只偏头发、尾巴、鳍、蝴蝶结、眼睛，皮肤和围裙不动 */
function hueOf(hex) {
  const [r, g, b] = hexToRgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const BASE_HUE = hueOf('#5b8def');
const RECOLOR = /(?:^|\/)(hair_|bangs|sidelocks|ahoge|fin_|tail|bow|waist_bow|eye[LR]_iris|eye[LR]_hl)/;

export class RigPool {
  constructor(app) {
    this.app = app;
    this.lib = (typeof window !== 'undefined' && window.RoomKitRig) || null;
    this.max = app.opts.rigMax != null ? app.opts.rigMax : 6;
    this.used = new Set();
    this.images = new Map();
    this.schemes = new Map();
    this.host = null;
  }
  get available() { return Boolean(this.lib || this.app.opts.rigLooks?.length) && this.used.size < this.max && !this.broken; }

  loadRuntime() {
    if (this.lib) return Promise.resolve(this.lib);
    this.runtime ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/whale-showcase-rig.js';
      script.onload = () => {
        if (window.RoomKitRig) resolve(this.lib = window.RoomKitRig);
        else reject(new Error('分件模型未加载'));
      };
      script.onerror = () => reject(new Error('分件模型未加载'));
      document.head.appendChild(script);
    }).catch(error => {
      this.runtime = null;
      throw error;
    });
    return this.runtime;
  }

  loadScheme(scheme) {
    if (!scheme || !this.app.opts.rigLooks?.includes(scheme)) return null;
    if (!this.schemes.has(scheme)) {
      this.schemes.set(scheme, fetch(`/assets/whale-scheme-${scheme}.json`).then(response => {
        if (!response.ok) throw new Error('分件配色未加载');
        return response.json();
      }).catch(error => {
        this.schemes.delete(scheme);
        throw error;
      }));
    }
    return this.schemes.get(scheme);
  }

  ensureHost() {
    if (this.host) return this.host;
    const h = document.createElement('div');
    h.className = 'rk-rigs';
    h.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    this.app.root.appendChild(h);
    this.host = h;
    return h;
  }

  loadImage(url) {
    let p = this.images.get(url);
    if (!p) {
      p = new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
      this.images.set(url, p);
    }
    return p;
  }

  /** 给一只角色建 figure：hue 非 0 时，头发/衣服这些部件的贴图先偏色（结果缓存，几只同色只算一次） */
  async figure(look) {
    const [lib, textures] = await Promise.all([this.loadRuntime(), this.loadScheme(look.rigScheme)]);
    const hue = Math.round(look.body ? hueOf(look.body) - BASE_HUE : 0);
    const shift = ((hue % 360) + 360) % 360;
    const assetOf = (p) => textures?.[p] || (lib.asset ? lib.asset(String(p)) : p);
    const load = async (url) => {
      const key = String(url);
      const im = await this.loadImage(key);
      const name = lib.nameOf ? lib.nameOf(key) : key;
      if (!shift || !RECOLOR.test(name) || !('filter' in CanvasRenderingContext2D.prototype)) return im;
      const ck = shift + '|' + key;
      let c = this.images.get(ck);
      if (!c) {
        c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d');
        g.filter = `hue-rotate(${shift}deg)`;
        g.drawImage(im, 0, 0);
        this.images.set(ck, c);
      }
      return c;
    };
    return lib.createWhaleFigure(lib.base || new URL('./', location.href), { model: lib.model, scheme: look.rigScheme, asset: assetOf, loadImage: load, kit: { createRig: lib.createRig } });
  }
}

export class RigBody {
  constructor(agent, app) {
    this.a = agent;
    this.app = app;
    this.pool = app.rig;
    this.fallback = new GirlBody(agent);
    this.ctl = null;
    this.canvas = null;
    this.res = 0;
    this._pose = null;
    this._right = null;
    this._expr = null;
    this._acc = 0;
    this._talkAt = 0;
    this._dead = false;
    this.pool.used.add(this);
    this.pool.figure(agent.look).then((fig) => this._init(fig)).catch((e) => this._fail(e));
  }

  get metrics() {
    const s = (this.a.look.size || 1);
    return { h: 104 * s, rx: 34 * s, ry: 54 * s };
  }
  get ready() { return !!(this.ctl && this.canvas); }

  _fail(e) {
    console.warn('[roomkit] 真模型不可用，改用 Q 版角色:', e && e.message);
    if (!this.app.opts.rigLooks) this.pool.broken = true;
    this.pool.used.delete(this);
    this.ctl = null;
  }

  _init(figure) {
    if (this._dead) { figure.dispose && figure.dispose(); return; }
    this.figure = figure;
    const host = this.pool.ensureHost();
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${STAGE} ${STAGE}`);
    svg.setAttribute('width', STAGE); svg.setAttribute('height', STAGE);
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
    svg.innerHTML = '<ellipse rx="0" ry="0"></ellipse><g></g><g></g>';
    host.appendChild(svg);
    this.svg = svg;
    const [shadowEl, petG, fxG] = svg.children;
    this.petG = petG;
    this.view = figure.model.view;
    const lib = this.pool.lib;
    this.ctl = lib.createPet({ petG, shadowEl, fxG }, {
      figure,
      sfx: { play: () => {} },
      ground: 'free', roam: 'off', startX: X0, startY: FLOOR,
      bounds: () => ({ W: STAGE, H: STAGE, floorY: FLOOR, S: S0 }),
    });
    this.ctl.pet.fy = FLOOR;
    this.ctl.setRoam('off');
    this.update(1 / 60, true);
  }

  /** 按相机缩放调模型分辨率：放大看也清楚，缩小时不白费 GPU */
  _fitRes() {
    const z = this.app.renderer.cam.z, want = (SCALE * (this.a.look.size || 1) * z) / S0;
    if (this.res && Math.abs(want - this.res) / this.res < 0.1) return;
    this.res = want;
    this.svg.setAttribute('width', STAGE * want);
    this.svg.setAttribute('height', STAGE * want);
  }

  /** 引擎的姿态 → kit 的动作（kit 的动作会自己结束的，比如 look/dance/wave，到点再发一次） */
  _applyPose(pose) {
    const c = this.ctl, p = c.pet;
    if (pose === 'walk' || pose === 'run') {
      const tx = this.a.right ? STAGE - 100 : 100;
      if (p.mode !== pose) c.walkTo(tx, pose === 'run', 0, FLOOR);
      p.target = tx; p.targetY = FLOOR;
      this._pose = pose;
      return;
    }
    const changed = pose !== this._pose;
    const idle = p.mode === 'idle';
    let ok = true;
    if (SITS.has(pose)) { if (changed || p.mode !== 'sit') ok = c.act('sit'); }
    else if (pose === 'sleep') { if (changed || p.mode !== 'sleep') ok = c.act('sleep'); }
    else if (pose === 'look') { if (changed || idle) ok = c.act('look'); }
    else if (pose === 'dance') { if (changed || idle) ok = c.act('dance'); }
    else if (pose === 'jump') { if (changed || idle) ok = c.act('hop'); }
    else if (pose === 'wave') { if (changed || !p.pulse) ok = c.act('wave'); }
    else if (pose === 'sad') { if (changed) { if (p.mode !== 'idle') c.act('stand'); c.setExpr('sad', 3.5); } }
    else if (changed || (p.mode === 'walk' || p.mode === 'run')) ok = c.act('stand');
    if (ok) this._pose = pose;
  }

  update(dt, force) {
    if (!this.ctl) return;
    const a = this.a, c = this.ctl, p = c.pet;
    // 其他角色降到 30fps：真模型每帧要做网格变形 + 上传脸部贴图，省下来的给主角
    this._acc += dt;
    const step = this.app.focusAgent && this.app.focusAgent() === a ? 0 : 1 / 30;
    if (!force && this._acc < step) return;
    const d = Math.min(0.05, this._acc);
    this._acc = 0;
    this._fitRes();
    this._applyPose(a.pose);
    const walking = a.pose === 'walk' || a.pose === 'run';
    if (this._right !== a.right && !walking) { p.facing = a.right ? 1 : -1; }
    this._right = a.right;
    if (a.expr !== this._expr) {
      this._expr = a.expr;
      const m = a.expr && EXPR[a.expr];
      if (m) c.setExpr(m, Math.max(0.6, a._exprUntil - a.t));
    }
    if (a.speech && a.t < a.speech.until - 0.3 && a.t >= this._talkAt) { c.talk(); this._talkAt = a.t + 0.09 + Math.random() * 0.1; }
    try {
      c.step(d);
      if (walking) { p.x = X0; p.prevA = X0; p.gy = FLOOR; p.fy = FLOOR; }   // 走路只要腿和头发的动画，位置由引擎管
      c.render();
    } catch (e) { this._fail(e); return; }
    if (!this.canvas) this.canvas = this.petG.querySelector('canvas');
  }

  draw(g, t) {
    if (!this.ready || !this.ctl.pet.xf) { this.fallback.draw(g, t); return; }
    const x = this.ctl.pet.xf, k = SCALE * (this.a.look.size || 1) / S0, v = this.view;
    g.save();
    g.translate((x.AX - X0) * k, (x.AY - FLOOR) * k);
    g.rotate((x.rot * Math.PI) / 180);
    g.scale(x.kx * k, x.ky * k);
    g.translate(-x.ax, -x.ay);
    g.drawImage(this.canvas, v[0], v[1], v[2] - v[0], v[3] - v[1]);
    g.restore();
  }

  bounce(k) { if (this.ctl) this.ctl.pet.sqv -= 2.2 * k; }
  talk() { if (this.ctl) this.ctl.talk(); }

  /** 鼠标的世界坐标 → kit 舞台坐标：她会看着鼠标，鼠标来回摸还会害羞 */
  pointer(wx, wy, ax, ay) {
    if (!this.ctl) return;
    const k = SCALE * (this.a.look.size || 1) / S0;
    this.ctl.pointerMove({ x: X0 + (wx - ax) / k, y: FLOOR + (wy - ay) / k });
  }
  pointerLeave() { if (this.ctl) this.ctl.pointerLeave(); }

  dispose() {
    this._dead = true;
    this.pool.used.delete(this);
    if (this.figure && this.figure.dispose) this.figure.dispose();
    if (this.svg) this.svg.remove();
    this.ctl = null;
    this.canvas = null;
  }
}

/** 给角色选身体：看 look.kind，真模型有名额就用真模型 */
export function bodyFor(agent, app) {
  const kind = agent.data.kind || 'girl';
  if ((app.opts?.neutral && !app.opts?.rigLooks) || kind === 'token') return new TokenBody(agent);
  if (kind === 'whale') return new WhaleBody(agent);
  const rig = app.opts?.site ? agent.look.rig === true : agent.look.rig !== false;
  if (kind === 'girl' && rig && app.rig?.available) return new RigBody(agent, app);
  if (kind !== 'girl' && app.opts?.site) return new TokenBody(agent);
  return new GirlBody(agent);
}
