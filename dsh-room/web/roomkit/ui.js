/**
 * RoomKit · 游玩层 UI：悬停名牌、对话气泡、浮字、角色卡片、信息抽屉、提示条（顶栏 / Dock / 侧抽屉在 shell.js）。
 * 全部是普通 DOM（文字清晰、可选中复制），位置每帧按相机换算。
 */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NEED_NAMES = { energy: '精力', fun: '乐趣', social: '社交' };

export class HUD {
  constructor(app) {
    this.app = app;
    const root = app.root;
    root.insertAdjacentHTML('beforeend', `
      <div class="rk-bubbles"></div>
      <div class="rk-tip"></div>
      <div class="rk-card"><button class="rk-x" data-a="close-card">×</button><div class="rk-card-body"></div></div>
      <div class="rk-drawer"><button class="rk-x" data-a="close-drawer">×</button><div class="rk-drawer-body"></div></div>
      <div class="rk-toast"></div>`);
    const $ = (s) => root.querySelector(s);
    this.el = {
      bubbles: $('.rk-bubbles'), tip: $('.rk-tip'), card: $('.rk-card'), cardBody: $('.rk-card-body'),
      drawer: $('.rk-drawer'), drawerBody: $('.rk-drawer-body'), toast: $('.rk-toast'),
    };
    this.bubbleEls = new Map();
    this.cardAgent = null;
    this._cardAt = 0;
    root.addEventListener('click', (e) => this._onClick(e));
  }

  _onClick(e) {
    const b = e.target.closest && e.target.closest('[data-a],[data-c],[data-x]');
    if (!b || !this.app.root.contains(b)) return;
    const app = this.app, a = b.getAttribute('data-a'), c = b.getAttribute('data-c');
    if (b.hasAttribute('data-x')) { const x = (this.cardExtra || [])[+b.getAttribute('data-x')]; if (x) x.fn(); return; }
    if (c && this.cardAgent) { app.agentAction(this.cardAgent, c); return; }
    if (a === 'close-card') this.closeCard();
    else if (a === 'close-drawer') this.closeDrawer();
    else if (a && a.indexOf('goto:') === 0) { this.closeDrawer(); app.inspect(a.slice(5)); }
  }

  /** 顶栏归外壳（shell.js）管；保留这个名字给老调用方 */
  syncBar() { if (this.app.shell) this.app.shell.sync(); }

  /* ───────── 每帧 ───────── */

  update() {
    const app = this.app, R = app.renderer;
    // 对话气泡
    const alive = new Set();
    for (const a of app.agents.values()) {
      if (!a.speech) continue;
      alive.add(a.id);
      let el = this.bubbleEls.get(a.id);
      if (!el) { el = document.createElement('div'); el.className = 'rk-bubble'; this.el.bubbles.appendChild(el); this.bubbleEls.set(a.id, el); }
      if (el._text !== a.speech.text) {
        el._text = a.speech.text;
        el.innerHTML = (app.agents.size > 1 ? '<b>' + esc(a.name) + '</b>' : '') + esc(a.speech.text);
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      }
      const p = R.anchorOf({ kind: 'agent', agent: a });
      // 气泡别出画面：按自身宽度把中心夹在视口里（窄的 DSH 侧栏里尤其明显）
      if (el._text !== el._measured) { el._measured = el._text; el._w = el.offsetWidth; }
      const half = (el._w || 0) / 2 + 4;
      el.style.left = (half * 2 < R.vw ? Math.min(Math.max(p.x, half), R.vw - half) : R.vw / 2) + 'px';
      el.style.top = Math.max(p.y - (a.emo ? 26 : 6), 30) + 'px';
    }
    for (const [id, el] of this.bubbleEls) if (!alive.has(id)) { el.remove(); this.bubbleEls.delete(id); }
    // 名牌跟着相机走
    if (this._tipHit) {
      const p = R.anchorOf(this._tipHit);
      if (p) { this.el.tip.style.left = p.x + 'px'; this.el.tip.style.top = p.y + 'px'; }
    }
    // 角色卡片半秒刷一次
    if (this.cardAgent && performance.now() - this._cardAt > 500) this._renderCard();
  }

  showTip(hit, text, sub) {
    this._tipHit = hit;
    this.el.tip.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    this.el.tip.classList.add('on');
  }
  hideTip() { this._tipHit = null; this.el.tip.classList.remove('on'); }

  float(sx, sy, text) {
    const f = document.createElement('div');
    f.className = 'rk-float';
    f.textContent = text;
    f.style.left = sx + 'px'; f.style.top = sy + 'px';
    this.app.root.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  toast(text, ms = 1800) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), ms);
  }

  /* ───────── 角色卡片 ───────── */

  openCard(agent) { this.cardAgent = agent; this.cardExtra = []; this.closeDrawer(); this._renderCard(); this.el.card.classList.add('on'); }
  /** 宿主往当前角色卡片上加一个按钮（比如 DSH 的「打开这个会话」） */
  addCardAction(label, fn) { this.cardExtra.push({ label, fn }); this._renderCard(); }
  closeCard() {
    this.cardAgent = null;
    this.el.card.classList.remove('on');
    if (this.app.renderer.selected && this.app.renderer.selected.kind === 'agent') this.app.renderer.selected = null;
  }
  _renderCard() {
    const a = this.cardAgent;
    if (!a || !this.app.agents.has(a.id)) { this.closeCard(); return; }
    this._cardAt = performance.now();
    const s = a.status && a.status.state ? ' · ' + ({ thinking: '思考', working: '工作', result: '整理', waiting: '等待', success: '完成', error: '出错' }[a.status.state] || a.status.state) : '';
    const needs = Object.keys(NEED_NAMES).map((k) =>
      `<div class="rk-need"><span>${NEED_NAMES[k]}</span><i><b style="width:${Math.round((a.needs[k] || 0) * 100)}%"></b></i></div>`).join('');
    const task = a.status && a.status.task ? `<div class="rk-kv"><span>任务</span><span>${esc(a.status.task)}</span></div>` : '';
    this.el.cardBody.innerHTML = `
      <h4>${esc(a.name)}</h4>
      <div class="rk-sub">正在：${esc(a.activity)}${esc(s)}</div>
      ${task}${needs}
      <div class="rk-row">
        <button class="rk-btn" data-c="wave">打招呼</button>
        <button class="rk-btn" data-c="dance">跳个舞</button>
        <button class="rk-btn" data-c="sleep">去睡觉</button>
        <button class="rk-btn" data-c="read">看本书</button>
        <button class="rk-btn on" data-c="chat">💬 聊聊</button>
        ${(this.cardExtra || []).map((x, i) => `<button class="rk-btn" data-x="${i}">${esc(x.label)}</button>`).join('')}
      </div>`;
  }

  /* ───────── 信息抽屉 ───────── */

  openDrawer(data) {
    this.closeCard();
    const lines = (data.lines || []).map((l) => Array.isArray(l)
      ? `<div class="rk-kv"><span>${esc(l[0])}</span><span>${esc(l[1])}</span></div>`
      : `<div class="rk-kv"><span>${esc(l)}</span></div>`).join('');
    const links = (data.links || []).map((l) => `<button class="rk-btn" data-a="goto:${esc(l.obj)}">${esc(l.label)} →</button>`).join('');
    this.el.drawerBody.innerHTML = `<h4>${esc(data.title)}</h4><div class="rk-sub">${esc(data.sub || '')}</div>${data.html || lines}${links ? '<div class="rk-row">' + links + '</div>' : ''}`;
    this.el.drawer.classList.add('on');
  }
  closeDrawer() { this.el.drawer.classList.remove('on'); }
}
