/**
 * RoomKit · 角色运行时。
 *
 * 角色在格坐标里连续移动；所有"动作"都是 Promise（walkTo / useSlot / pose / wait / stepTo），
 * 被新动作或外部命令打断时以 false 结束——自主行为、小剧场、外部指令都写成普通的 async 流程。
 */
import { clamp, ease, rand } from './util.js';
import { screenFacing } from './iso.js';
import { bodyFor } from './bodies.js';

const POSE_NAMES = {
  sleep: '睡觉', sit: '坐着', work: '干活', read: '看书', eat: '吃东西', dance: '跳舞',
  look: '张望', stand: '发呆', walk: '走路', jump: '蹦跶', sad: '难过', wave: '打招呼', cook: '做饭',
};
export const poseName = (p) => POSE_NAMES[p] || p;

export class Agent {
  constructor(data, app) {
    this.app = app;
    this.data = data;                     // 场景里的持久记录（world.scene.agents 的元素）
    this.id = data.id;
    this.x = +data.x || 1; this.y = +data.y || 1; this.z = 0;
    this.dir = [0, 1];
    this.right = true; this.front = true;
    this.pose = 'stand';
    this.t = 0;
    this.phase = 0;
    this.seed = Math.random() * 10;
    this.blink = 0; this._blinkAt = rand(1, 4); this._blinkT = 0;
    this.sq = 0; this._sqv = 0;
    this.act = null;
    this.queue = [];
    this.needs = Object.assign({ energy: rand(0.5, 0.9), fun: rand(0.35, 0.8), social: rand(0.35, 0.8) }, data.needs || {});
    this.status = null;                   // 外部工作状态 { state, task, ts }
    this.speech = null;                   // { text, until }
    this.emo = null;                      // { kind, until, t0 }
    this.attach = null;                   // 占用中的交互位 { obj, slot, sp }
    this.engaged = null;                  // 被别人拉去聊天 / 演小剧场时 = 对方 id
    this.activity = '发呆';
    this.expr = null; this._exprUntil = 0;
    this._timers = [];
    this.body = bodyFor(this, app);
  }

  /** 场景数据变了（改名、换装）：外观变了才换身体 */
  setData(r) {
    const before = JSON.stringify([this.data.kind, this.data.look]);
    this.data = r;
    if (before !== JSON.stringify([r.kind, r.look])) { this.body.dispose(); this.body = bodyFor(this, this.app); }
  }
  dispose() { this.cancel(); this.body.dispose(); }

  get name() { return this.data.name; }
  get look() { return this.data.look || {}; }

  /* ───────── 动作 ───────── */

  _start(kind, props) {
    this.cancel();
    return new Promise((resolve) => { this.act = Object.assign({ kind, resolve }, props); });
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

  wait(s) { return this._start('wait', { until: this.t + s }); }
  pose_(pose, s) { return this._start('pose', { pose, until: this.t + s }); }
  /** 下一帧（防止空转的 async 循环把页面卡死） */
  frame() { return this._start('wait', { until: this.t }); }
  /** 不占动作槽的等待：自己的行为循环用它"让出"，不会打断导演/外部指令正在让角色做的事 */
  sleep(s) { return new Promise((res) => this._timers.push({ until: this.t + s, res })); }

  walkTo(x, y, opts) {
    const nav = this.app.nav;
    const path = nav.path({ x: this.x, y: this.y }, { x, y });
    if (!path) return Promise.resolve(false);
    if (path.length < 2 && Math.hypot(x - this.x, y - this.y) < 0.05) return Promise.resolve(true);
    return this._start('walk', { path, i: 1, run: !!(opts && opts.run), ver: this.app.world.version, goal: { x, y } });
  }

  /** 直线挪一小步（进出交互位，忽略阻挡） */
  stepTo(x, y, s = 0.35) {
    if (Math.hypot(x - this.x, y - this.y) < 0.02) return Promise.resolve(true);
    return this._start('step', { from: { x: this.x, y: this.y }, to: { x, y }, t0: this.t, dur: s });
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
      if (!(await this.walkTo(appr.x, appr.y))) return false;
      if (!w.byId.has(obj.id)) return false;
      if (!(await this.stepTo(sp.x, sp.y))) return false;
      this.attach = { obj, slot, sp };
      this.dir = sp.face.slice();
      this.z = sp.z || 0;
      if (slot.sets) w.apply({ t: 'state', id: obj.id, patch: slot.sets }, { silent: true });
      if (opts.onStart) opts.onStart();
      const ok = await this._start('use', { pose: slot.pose, until: this.t + dur });
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
      for (const k in slot.sets) undo[k] = undefined;
      this.app.world.apply({ t: 'state', id: obj.id, patch: undo }, { silent: true });
    }
  }

  say(text, ms) {
    if (!text) { this.speech = null; return; }
    this.speech = { text: String(text), until: this.t + (ms || Math.min(6000, 1600 + String(text).length * 140)) / 1000 };
    this.body.talk();
    this.app.bus.emit('agent:say', { id: this.id, text: this.speech.text });
  }
  emote(kind, s = 2) { this.emo = { kind, until: this.t + s, t0: this.t }; }
  setExpr(expr, s = 2) { this.expr = expr; this._exprUntil = this.t + s; }
  bounce(k = 1) { this._sqv -= 3 * k; this.body.bounce(k); }

  /* ───────── 每帧 ───────── */

  update(dt) {
    this.t += dt;
    if (this._timers.length) {
      const due = this._timers.filter((x) => this.t >= x.until);
      if (due.length) { this._timers = this._timers.filter((x) => this.t < x.until); due.forEach((x) => x.res(true)); }
    }
    // 眨眼
    this._blinkAt -= dt;
    if (this._blinkAt <= 0) { this._blinkT = 0.16; this._blinkAt = rand(2.2, 5.5); }
    if (this._blinkT > 0) { this._blinkT -= dt; this.blink = Math.sin(Math.max(0, this._blinkT) / 0.16 * Math.PI); } else this.blink = 0;
    // Q 弹：弹簧回到 0
    this._sqv += (-this.sq * 260 - this._sqv * 12) * dt;
    this.sq = clamp(this.sq + this._sqv * dt, -0.25, 0.3);
    if (this.expr && this.t > this._exprUntil) this.expr = null;
    if (this.speech && this.t > this.speech.until) this.speech = null;
    if (this.emo && this.t > this.emo.until) this.emo = null;

    const a = this.act;
    let pose = this.attach ? this.attach.slot.pose : 'stand';
    if (a) {
      switch (a.kind) {
        case 'walk': pose = this._walk(a, dt); break;
        case 'step': {
          const k = clamp((this.t - a.t0) / a.dur, 0, 1);
          this.x = a.from.x + (a.to.x - a.from.x) * k;
          this.y = a.from.y + (a.to.y - a.from.y) * k;
          const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y, d = Math.hypot(dx, dy);
          if (d > 0.01) this.dir = [dx / d, dy / d];
          this.phase += dt * 9;
          pose = 'walk';
          if (k >= 1) this._done(true);
          break;
        }
        case 'use': pose = a.pose; if (this.t >= a.until) this._done(true); break;
        case 'pose': pose = a.pose; if (this.t >= a.until) this._done(true); break;
        case 'wait': if (this.t >= a.until) this._done(true); break;
      }
    }
    if (this.status && this.status.state === 'thinking' && this.attach && !this.emo) this.emote('think', 2.5);
    if (pose !== 'walk' && pose !== 'run') this.phase = 0;
    this.pose = pose;
    const f = screenFacing(this.dir[0], this.dir[1]);
    if (f.right !== null) this.right = f.right;
    this.front = f.front;
    this.body.update(dt);
  }

  _walk(a, dt) {
    const nav = this.app.nav, w = this.app.world;
    if (a.ver !== w.version) {                       // 场景变了（家具挪了）：重新规划
      const p = nav.path({ x: this.x, y: this.y }, a.goal);
      a.ver = w.version;
      if (!p) { this._done(false); return 'stand'; }
      a.path = p; a.i = 1;
    }
    let tgt = a.path[a.i];
    if (!tgt) { this._done(true); return 'stand'; }
    let dx = tgt.x - this.x, dy = tgt.y - this.y, d = Math.hypot(dx, dy);
    const speed = (a.run ? 3.1 : 1.55) * (this.data.speed || 1);
    let step = speed * dt;
    while (d <= step && tgt) {                        // 一帧可能越过多个路点
      this.x = tgt.x; this.y = tgt.y; step -= d;
      a.i++;
      tgt = a.path[a.i];
      if (!tgt) { this._done(true); return 'stand'; }
      dx = tgt.x - this.x; dy = tgt.y - this.y; d = Math.hypot(dx, dy);
    }
    if (d > 1e-6) {
      this.x += (dx / d) * step; this.y += (dy / d) * step;
      const k = ease(14, dt);
      this.dir = [this.dir[0] + (dx / d - this.dir[0]) * k, this.dir[1] + (dy / d - this.dir[1]) * k];
    }
    this.phase += dt * (a.run ? 15 : 9.5);
    return a.run ? 'run' : 'walk';
  }

  /** 面板用的快照 */
  snapshot() {
    return {
      id: this.id, name: this.name, activity: this.activity, pose: this.pose,
      needs: Object.assign({}, this.needs), status: this.status, x: this.x, y: this.y, brain: this.data.brain,
    };
  }
}
