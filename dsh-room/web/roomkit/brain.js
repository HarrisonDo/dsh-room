/**
 * RoomKit · 自主行为（需求驱动的效用 AI）+ 社交 + 工作状态联动 + 小剧场导演。
 *
 * 每只角色一个 Brain，跑一个 async 循环：
 *   外部命令队列 > 被拉去聊天/演戏 > 工作状态（DSH 会话驱动）> 自主生活
 * 自主生活：精力/乐趣/社交随时间下降，家具交互位宣告能补什么，按
 *   Σ 需求紧迫度 × 收益 ÷ (1 + 距离·0.06) × 随机扰动 选下一件事；夜里偏好睡觉。
 */
import { clamp, rand, pick } from './util.js';
import { poseName } from './agents.js';

const urgency = (v) => Math.pow(1 - clamp(v == null ? 0.5 : v, 0, 1), 2) * 1.6 + 0.04;

export const PHRASES = {
  idle: ['今天也要加油鸭', '泡泡……', '有点想吃零食', '窗外好安静', '嘿嘿', '这个房间真舒服', '要不要去看看书'],
  night: ['好困……', '再玩五分钟', '月亮出来了'],
  poke: ['在呢~', '别戳啦', '嘿嘿', '干嘛呀', '今天也很开心'],
  greet: ['你来啦！', '欢迎~', '嗨嗨'],
  cheer: ['搞定啦！', '完成！✨', '耶，好了好了', '这一版顺利！'],
  oops: ['呜…出错了', '等等我看看', '哎呀，翻车了'],
  wait: ['在等你回复哦', '需要你确认一下~', '我在这儿等着'],
  chats: [
    ['你在忙什么呀', '在整理书架！', '要帮忙吗', '好呀好呀'],
    ['今天天气不错', '适合晒太阳', '我想去窗边'],
    ['你吃饭了吗', '吃了一大碗白饭', '哈哈哈'],
    ['新来的家具好看吗', '超喜欢那个沙发', '我也是！'],
    ['要一起看书吗', '好啊，你推荐一本', '《鲸鱼的一百种睡姿》'],
    ['嘘——', '怎么啦', '没事，就想叫叫你'],
  ],
};

export class Brain {
  constructor(agent, app) {
    this.a = agent;
    this.app = app;
    this.alive = true;
    this._run();
  }
  stop() { this.alive = false; this.a.cancel(); }
  get mode() { return this.a.data.brain || 'auto'; }

  async _run() {
    await this.a.sleep(rand(0.3, 1.5));
    while (this.alive) {
      const t0 = this.a.t;
      try { await this.tick(); } catch (e) { console.error('[roomkit] 角色行为出错:', this.a.id, e); }
      if (!this.alive) break;
      if (this.a.t - t0 < 0.05) await this.a.sleep(0.4);    // 防空转：本轮什么都没做成就歇一下
    }
  }

  async tick() {
    const a = this.a;
    if (a.queue.length) { await this.app.exec(a, a.queue.shift()); return; }
    if (a.engaged) { await a.sleep(0.5); return; }
    if (a.status && a.status.state) { await this.statusRoutine(); return; }
    if (this.mode === 'manual' || this.mode === 'external') { await this.idle(rand(3, 6)); return; }
    await this.perform(this.choose());
  }

  /* ───────── 自主：选下一件事 ───────── */

  choose() {
    const a = this.a, w = this.app.world, night = this.app.isNight();
    const card = this.app.characterOf(a);
    const likes = (card && card.likes) || {};
    const hour = this.app.hour();
    const prefer = ((card && card.schedule) || []).filter((s) => (s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)).map((s) => s.prefer);
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
        if (s.pose === 'sleep') gain *= night ? 3.2 : 0.3;
        if (prefer.indexOf(s.pose) >= 0) gain *= 2.5;                    // 作息：这个时段想干这件事
        gain *= likes[d.id] != null ? likes[d.id] : likes[d.cat] != null ? likes[d.cat] : 1;   // 喜好
        if (gain <= 0.01) continue;
        if (!w.slotUsable(o, s, this.app.nav)) continue;
        const sp = w.slotPose(o, s);
        if (!sp) continue;
        const dist = Math.hypot(sp.x - a.x, sp.y - a.y);
        opts.push({ kind: 'slot', o, s, score: (gain / (1 + dist * 0.06)) * rand(0.75, 1.25) });
      }
    }
    if (!night || Math.random() < 0.25) {
      for (const b of this.app.agents.values()) {
        if (b === a || !this.app.director.available(b)) continue;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        opts.push({ kind: 'chat', b, score: (urgency(a.needs.social) * 0.9 / (1 + dist * 0.05)) * rand(0.7, 1.3) });
      }
    }
    opts.push({ kind: 'wander', score: 0.16 * rand(0.5, 1.5) });
    opts.push({ kind: 'idle', score: 0.12 * rand(0.5, 1.5) });
    opts.sort((p, q) => q.score - p.score);
    return opts[0];
  }

  async perform(c) {
    const a = this.a;
    if (!c) return this.idle(2);
    if (c.kind === 'slot') {
      const night = this.app.isNight();
      let dur = rand(c.s.dur[0], c.s.dur[1]);
      if (c.s.pose === 'sleep' && night) dur *= 6;
      a.activity = c.s.label || poseName(c.s.pose);
      const ok = await a.useSlot(c.o, c.s, dur, {
        onStart: () => { if (c.s.say && Math.random() < 0.5) a.say(pick(c.s.say)); if (c.s.emote) a.emote(c.s.emote, 2.4); },
      });
      if (ok) for (const k in c.s.need) a.needs[k] = clamp((a.needs[k] || 0) + c.s.need[k], 0, 1);
      return ok;
    }
    if (c.kind === 'chat') return this.app.director.chat(a, c.b);
    if (c.kind === 'wander') return this.wander();
    return this.idle(rand(2, 5));
  }

  async wander() {
    const a = this.a, nav = this.app.nav, r = this.app.world.room;
    a.activity = '闲逛';
    for (let i = 0; i < 8; i++) {
      const x = clamp(a.x + rand(-4, 4), 0.3, r.w - 0.3), y = clamp(a.y + rand(-4, 4), 0.3, r.h - 0.3);
      if (!nav.freeAt(x, y)) continue;
      const ok = await a.walkTo(x, y);
      if (ok && Math.random() < 0.35) await a.pose_('look', rand(1.5, 3));
      return ok;
    }
    return this.idle(2);
  }

  async idle(s) {
    const a = this.a;
    a.activity = '发呆';
    const r = Math.random();
    if (r < 0.12) a.say(this.app.phrase(a, this.app.isNight() ? 'night' : 'idle'));
    else if (r < 0.22) a.emote(pick(['note', 'heart', 'idea']), 2);
    return a.pose_(Math.random() < 0.4 ? 'look' : 'stand', s);
  }

  /* ───────── 工作状态（DSH 会话事件驱动） ─────────
   * thinking/working/result → 去书桌；waiting → 书桌旁踱步张望；success → 蹦跶庆祝；error → 垂头冒汗
   */
  async statusRoutine() {
    const a = this.a, st = a.status.state, stamp = a.status.ts;
    const desk = this.app.findSlot((d, s) => s.pose === 'work', a);
    if (st === 'thinking' || st === 'working' || st === 'result') {
      a.activity = st === 'thinking' ? '思考中' : st === 'working' ? '干活中' : '整理结果';
      if (desk) {
        await a.useSlot(desk.o, desk.s, 3600, {
          onStart: () => { if (st === 'working' && a.status && a.status.task) a.say(a.status.task, 3500); },
        });
      } else {
        await a.pose_('work', 30);
      }
      return;
    }
    const consume = () => { if (a.status && a.status.ts === stamp) a.status = null; };
    if (st === 'waiting') {
      a.activity = '等你回复';
      a.say(this.app.phrase(a, 'wait'), 3000);
      a.emote('?', 3);
      const base = desk ? this.app.world.slotPose(desk.o, desk.s) : { x: a.x, y: a.y };
      for (let i = 0; i < 3 && a.status && a.status.state === 'waiting'; i++) {
        const p = this.app.nav.nearestFree(base.x + rand(-1.2, 1.2), base.y + rand(-1.2, 1.2), 3);
        if (p && !(await a.walkTo(p.x, p.y))) return;
        if (!(await a.pose_('look', rand(2, 3.5)))) return;
      }
      return;
    }
    if (st === 'success') {
      a.activity = '庆祝';
      a.emote('spark', 2.6); a.say(this.app.phrase(a, 'cheer'), 2600); a.setExpr('happy', 3); a.bounce(1.2);
      await a.pose_('jump', 2.4);
      consume();
      return;
    }
    if (st === 'error') {
      a.activity = '沮丧';
      a.emote('sweat', 3); a.say(this.app.phrase(a, 'oops'), 3000);
      await a.pose_('sad', 3.5);
      consume();
      return;
    }
    consume();
  }
}

/* ───────── 导演：聊天 + 小剧场 ───────── */

export class Director {
  constructor(app) { this.app = app; }

  available(b) {
    return !b.engaged && !b.attach && !(b.status && b.status.state) && !b.queue.length &&
      b.data.brain !== 'manual' && !(b.act && b.act.kind === 'use');
  }

  /** a 走到 b 身边，面对面聊几句 */
  async chat(a, b) {
    if (!this.available(b)) return false;
    a.engaged = b.id; b.engaged = a.id;
    b.cancel();
    try {
      const nav = this.app.nav;
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      const spot = nav.nearestFree(b.x + (dx / d) * 0.85, b.y + (dy / d) * 0.85, 2);
      a.activity = b.activity = '聊天';
      if (spot && !(await a.walkTo(spot.x, spot.y))) return false;
      a.face(b.x, b.y); b.face(a.x, a.y);
      const lines = pick(PHRASES.chats);
      for (let i = 0; i < lines.length; i++) {
        const sp = i % 2 ? b : a;
        sp.say(lines[i], 2300);
        sp.bounce(0.4);
        if (Math.random() < 0.35) sp.emote(pick(['heart', 'note', '!', 'spark']), 1.6);
        if (!(await a.wait(2.5))) return false;
      }
      a.needs.social = clamp(a.needs.social + 0.45, 0, 1);
      b.needs.social = clamp(b.needs.social + 0.45, 0, 1);
      a.needs.fun = clamp(a.needs.fun + 0.1, 0, 1);
      b.needs.fun = clamp(b.needs.fun + 0.1, 0, 1);
      return true;
    } finally {
      a.engaged = null; b.engaged = null;
    }
  }

  /**
   * 小剧场：play = { id, name, steps:[...] }；ctx = { target: 触发它的家具, who: 默认主角 }
   * step: { who, do:'goto'|'use'|'say'|'emote'|'expr'|'pose'|'face'|'wait'|'state'|'sfx'|'outfit', ... }，
   *       { par:[step...] } 并行。剧情（story.js）复用同一套步骤。
   */
  async run(play, ctx = {}) {
    const cast = new Set();
    this.app.bus.emit('play:start', { id: play.id, name: play.name });
    try {
      for (const s of play.steps || []) {
        const ok = await this.doStep(s, ctx, cast);
        if (ok === false && !s.optional) break;
      }
    } finally {
      this.release(cast);
      this.app.bus.emit('play:end', { id: play.id });
    }
  }

  release(cast) { cast.forEach((a) => { if (a.engaged === 'play') a.engaged = null; }); }

  /** who：'pet'/'$who'（主角）| 'any'（离目标最近的空闲角色）| 剧本里的角色名（ctx.roles）| 角色 id */
  resolveWho(who, ctx) {
    const app = this.app;
    if (ctx.roles && who && ctx.roles[who]) return ctx.roles[who];
    if (!who || who === 'pet' || who === '$who') return ctx.who || app.mainAgent();
    if (who === 'any') return app.nearestAgent(ctx.target) || app.mainAgent();
    return app.agents.get(who) || null;
  }
  resolveObj(ref, ctx) {
    const w = this.app.world;
    if (ref === '$target' || !ref) return ctx.target || null;
    return w.byId.get(ref) || w.objects.find((o) => o.def === ref) || null;
  }
  /** 目标点（格坐标）：角色 → 脚下；家具 → 占地中心；[x,y] → 原样 */
  resolvePoint(ref, ctx) {
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1] };
    const a = this.app.agents.get(ref) || (ctx.roles && ctx.roles[ref]);
    if (a) return { x: a.x, y: a.y };
    const o = this.resolveObj(ref, ctx);
    const f = o && this.app.world.footprint(o);
    if (f) return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 };
    return null;
  }

  async doStep(s, ctx, cast) {
    const app = this.app;
    if (s.par) { const r = await Promise.all(s.par.map((x) => this.doStep(x, ctx, cast))); return r.every((x) => x !== false); }
    if (s.do === 'wait') { await new Promise((r) => setTimeout(r, (s.s || 1) * 1000)); return true; }
    if (s.do === 'sfx') { app.sfx(s.name || 'pop'); return true; }
    if (s.do === 'state') {
      const o = this.resolveObj(s.obj, ctx);
      if (o) app.world.apply({ t: 'state', id: o.id, patch: s.patch || {} });
      return true;
    }
    if (s.do === 'env') { app.command(Object.assign({ op: 'env.set' }, s.period !== undefined ? { period: s.period } : {}, s.weather ? { weather: s.weather } : {})); return true; }
    const a = this.resolveWho(s.who, ctx);
    if (!a) return false;
    if (!cast.has(a)) { cast.add(a); a.cancel(); a.engaged = 'play'; }
    switch (s.do) {
      case 'say': a.say(s.text, s.ms); return true;
      case 'emote': a.emote(s.kind || 'heart', s.s || 2); return true;
      case 'expr': a.setExpr(s.expr || 'happy', s.s || 2); return true;
      case 'outfit': {
        // 换装：按顺序换帽饰（写回场景，可撤销、会保存）
        const hats = s.hats || ['', 'maid', 'bow', 'cap'];
        const cur = (a.data.look && a.data.look.hat) || '';
        const next = s.hat != null ? s.hat : hats[(hats.indexOf(cur) + 1) % hats.length];
        app.world.apply({ t: 'agent.set', id: a.id, patch: { look: Object.assign({}, a.data.look, { hat: next }) } });
        a.bounce(0.8);
        return true;
      }
      case 'pose': return a.pose_(s.pose || 'stand', s.s || 2);
      case 'face': {
        const p = this.resolvePoint(s.to, ctx);
        if (p) a.face(p.x, p.y);
        return true;
      }
      case 'goto': case 'use': {
        const o = s.obj ? this.resolveObj(s.obj, ctx) : null;
        if (o) {
          const d = app.world.def(o);
          const slot = d && (d.slots.find((x) => x.id === s.slot) || (s.do === 'use' ? d.slots[0] : null));
          if (slot) return a.useSlot(o, slot, s.do === 'use' ? (s.s || rand(slot.dur[0], slot.dur[1])) : 0.1);
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
}
