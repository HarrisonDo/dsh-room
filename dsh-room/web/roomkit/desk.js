/**
 * RoomKit · 桌面模式（opts.desk）：透明背景，只剩房间和角色，给桌面壳（Electron 透明窗口）用。
 *
 * 与普通模式的差别：
 *   - 顶栏、Dock、抽屉、引导、剧情提示条都不显示；镜头始终框住整间房，不能平移缩放
 *   - 在房间上拖动 = 拖动窗口；滚轮 = 窗口放大缩小；右键 = 宿主的原生菜单
 *   - 点击穿透：鼠标在房间之外的透明处时，告诉宿主"这里不接点击"，点击落到下面的桌面上
 *
 * 宿主接口 app.ext.desk（都可以没有；浏览器里直接打开 ?desk=1 时只是没有拖窗口、穿透和原生菜单）：
 *   setSolid(bool)          鼠标下面有没有东西（false → 宿主让窗口忽略点击，但继续转发鼠标移动）
 *   drag('start'|'move'|'end')  拖窗口：宿主按系统光标位置移动窗口
 *   scale(factor)           放大/缩小窗口
 *   aspect(ratio)           这间房的高宽比，宿主据此调窗口高度（换房间时会再报一次）
 *   menu(spec) → Promise<string|null>  弹原生菜单，返回选中的动作；房间/时间/天气类动作由这里执行
 */
import { PERIODS, WEATHERS } from './env.js';
import { esc } from './ui.js';

export class Desk {
  constructor(app) {
    this.app = app;
    this.host = (app.ext && app.ext.desk) || null;
    this.solid = null;
    this.dragging = false;
    const root = app.root;
    root.classList.add('rk-desk');
    root.insertAdjacentHTML('beforeend', '<button class="rk-desk-btn" title="菜单（也可以在房间上点右键）">⋯</button>');
    this.btn = root.querySelector('.rk-desk-btn');
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.openMenu(e.clientX, e.clientY); });
    // 整个文档都听：鼠标在透明处时事件是宿主转发来的，落不到画布的监听上
    this._onMove = (e) => this._track(e.clientX, e.clientY);
    document.addEventListener('mousemove', this._onMove, true);
    document.addEventListener('mouseleave', () => { if (!this.dragging) this._setSolid(false); root.classList.remove('rk-desk-hover'); });
    app.on('scene:open', () => this.reportAspect());
    this.reportAspect();
  }

  /** 房间的高宽比（带一点给气泡留的余量） */
  reportAspect() {
    if (!this.host || !this.host.aspect) return;
    const b = this.app.renderer.roomBounds();
    this.host.aspect(Math.round(((b.b - b.t + 24) / (b.r - b.l)) * 1000) / 1000);
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
    // 小菜单钮：鼠标碰到房间才出现，离开后再留一会儿，好让鼠标挪过去点
    if (solid) {
      this.app.root.classList.add('rk-desk-hover');
      clearTimeout(this._hoverT);
      this._hoverT = setTimeout(() => this.app.root.classList.remove('rk-desk-hover'), 2500);
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
    if (this.host && this.host.drag) this.host.drag('start');
  }
  dragMove() { if (this.dragging && this.host && this.host.drag) this.host.drag('move'); }
  dragEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.host && this.host.drag) this.host.drag('end');
  }
  wheel(e) {
    if (!this.host || !this.host.scale) return;
    const now = performance.now();
    if (now - (this._wheelAt || 0) < 60) return;     // 触控板一次滑动会来几十个事件
    this._wheelAt = now;
    this.host.scale(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  }

  /* ───────── 菜单 ───────── */

  menuSpec() {
    const app = this.app, env = app.world.scene.env, cur = app.world.scene.id;
    return {
      rooms: app.home.ordered().map((r) => ({ id: r.id, label: r.floor + ' · ' + r.name, on: r.id === cur })),
      periods: [{ id: '', label: '跟随真实时间', on: !env.period }].concat(PERIODS.map((p) => ({ id: p.id, label: p.label, on: env.period === p.id }))),
      weathers: Object.keys(WEATHERS).map((k) => ({ id: k, label: WEATHERS[k].label, on: env.weather === k })),
    };
  }

  async openMenu(x, y) {
    const spec = this.menuSpec();
    if (this.host && this.host.menu) { this.run(await this.host.menu(spec)); return; }
    this._domMenu(spec, x, y);
  }

  /** 宿主菜单返回的动作：room:<id> / time:<id> / weather:<id> / full；其余是宿主自己的（大小、置顶、退出） */
  run(action) {
    if (!action) return;
    const app = this.app, i = action.indexOf(':'), kind = i < 0 ? action : action.slice(0, i), arg = i < 0 ? '' : action.slice(i + 1);
    if (kind === 'room') app.goRoom(arg);
    else if (kind === 'time') app.command({ op: 'env.set', period: arg || null });
    else if (kind === 'weather') app.command({ op: 'env.set', weather: arg });
    else if (kind === 'full' && app.ext.openFull) app.ext.openFull();
  }

  /** 没有宿主（浏览器里打开 ?desk=1）：页面里的简易菜单 */
  _domMenu(spec, x, y) {
    const root = this.app.root;
    let m = root.querySelector('.rk-desk-menu');
    if (!m) {
      m = document.createElement('div');
      m.className = 'rk-desk-menu';
      root.appendChild(m);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (b) this.run(b.getAttribute('data-a'));
        m.classList.remove('on');
      });
    }
    const item = (a, label, on) => `<button data-a="${esc(a)}" class="${on ? 'on' : ''}">${esc(label)}</button>`;
    m.innerHTML = spec.rooms.map((r) => item('room:' + r.id, r.label, r.on)).join('') + '<hr>' +
      spec.weathers.map((w) => item('weather:' + w.id, w.label, w.on)).join('') +
      (this.app.ext.openFull ? '<hr>' + item('full', '打开完整房间') : '');
    const r = root.getBoundingClientRect();
    m.style.left = Math.min(x - r.left, r.width - 150) + 'px';
    m.style.top = Math.min(y - r.top, r.height - 40) + 'px';
    m.classList.add('on');
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMove, true);
    clearTimeout(this._hoverT);
  }
}
