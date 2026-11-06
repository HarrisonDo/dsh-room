/**
 * RoomKit · 应用外壳：顶栏（房间切换 / 房间条 / 时间天气 / 连接灯 / 更多）+ 底部 Dock + 侧抽屉
 * （剧情 / 聊天 / 地图 / 社区 / 连接 / 关于）+ 下拉菜单 + 换房间转场 + 门的信息卡。
 * 所有按钮最终都落到 app.command / app 的公开方法上——外壳只是一层皮，宿主（DSH）通过 app.ext 往里加能力：
 *   app.ext.chat(req)        → Promise<{ text, acts?, error? }>  和角色对话（没有就用离线台词）
 *   app.ext.chatStatus()     → '已接入 DSH 模型' 之类的一句话
 *   app.ext.diagnostics()    → [{ name, ok, detail }]            「连接」页的检查项
 *   app.ext.connection()     → { level:'ok'|'partial'|'error'|'local', label, detail }  连接灯
 *   app.ext.social           → [{ id, label, sub, on(), toggle() }]  「社区」页的开关
 *   app.ext.openFull()       → 在新窗口/全屏打开房间
 */
import { esc } from './ui.js';
import { PERIODS, WEATHERS } from './env.js';
import { clone, uid, delay } from './util.js';
import { isFollower } from './home.js';
import { VERSION } from './version.js';

const TIME_CYCLE = [null, 'dawn', 'noon', 'dusk', 'night'];
const WEATHER_CYCLE = ['clear', 'cloudy', 'rain', 'snow'];
const WEATHER_ICON = { clear: '☀', cloudy: '☁', rain: '🌧', snow: '❄' };
const PERIOD_ICON = { dawn: '🌅', noon: '🌞', dusk: '🌇', night: '🌙' };

const PAGES = [
  { id: 'play', icon: '🎮', label: '游玩' },
  { id: 'edit', icon: '🛠', label: '布置' },
  { id: 'story', icon: '📖', label: '剧情' },
  { id: 'chat', icon: '💬', label: '聊天' },
  { id: 'map', icon: '🗺', label: '地图' },
  { id: 'social', icon: '👥', label: '社区' },
];
const PAGE_TITLE = { story: '剧情', chat: '聊天', map: '家 · 地图', social: '社区', conn: '连接与状态', about: '关于' };
const STATUS_TEXT = { thinking: '思考中', working: '干活中', result: '整理结果', waiting: '等你回复', success: '完成啦', error: '出错了' };

/** 离线聊天：没有接模型时，按关键词选动作 + 角色卡台词回复 */
export const OFFLINE_RULES = [
  [/睡|困|休息|晚安/, 'sleep', ['好~ 那我去睡一会儿', '晚安，呼……']],
  [/书|读|看看书|学习/, 'read', ['那我去看会儿书', '最近在读一本好书哦']],
  [/跳舞|跳个舞|舞/, 'dance', ['看我的！', '♪ 啦啦啦~']],
  [/你好|嗨|hi|hello|在吗/i, 'wave', ['你好呀~', '在呢在呢！']],
  [/吃|饿|零食|冰箱/, 'use:fridge', ['冰箱里应该还有布丁！', '我去找点吃的~']],
  [/电视|看剧/, 'use:tv', ['一起看电视吧']],
];

/** 回复里的 [[动作]] 标记：剥出来交给 app.applyActs，正文里不显示 */
export function parseActs(text) {
  const acts = [];
  const clean = String(text || '').replace(/\[\[([^\]]{1,40})\]\]/g, (m, a) => { acts.push(a.trim()); return ''; }).replace(/[ \t]{2,}/g, ' ').trim();
  return { text: clean, acts };
}

export class Shell {
  constructor(app) {
    this.app = app;
    this.page = null;
    this.chatLog = [];
    this.menu = null;
    this._dismissed = new Set();
    const root = app.root;
    root.insertAdjacentHTML('beforeend', `
      <div class="rk-top">
        <button class="rk-btn rk-scene-btn" data-s="rooms" title="换房间（数字键 1–9）" aria-haspopup="menu"><span>🏠</span><b></b><i>▾</i></button>
        <nav class="rk-rooms" aria-label="家里的房间"></nav>
        <span class="rk-top-gap"></span>
        <button class="rk-btn icon" data-s="time" title="时间（点一下切换，循环回到跟随真实时间）"></button>
        <button class="rk-btn icon" data-s="weather" title="天气"></button>
        <button class="rk-btn icon rk-conn" data-s="conn" title="连接与状态"><i class="rk-dot"></i><span>本地</span></button>
        <button class="rk-btn icon" data-s="more" title="更多" aria-haspopup="menu">⋯</button>
      </div>
      <div class="rk-menu" role="menu"></div>
      <div class="rk-story-pill"></div>
      <div class="rk-coach"></div>
      <div class="rk-curtain" aria-hidden="true"><i></i><i></i><b></b></div>
      <div class="rk-flash" aria-live="polite"></div>
      <nav class="rk-dock">${PAGES.map((p) => `<button data-page="${p.id}" title="${p.label}"><span>${p.icon}</span><small>${p.label}</small></button>`).join('')}</nav>
      <aside class="rk-sheet"><header><b></b><button class="rk-x" data-s="close">×</button></header><div class="rk-sheet-body"></div></aside>`);
    const $ = (s) => root.querySelector(s);
    this.el = {
      top: $('.rk-top'), rooms: $('.rk-rooms'), menu: $('.rk-menu'), dock: $('.rk-dock'), sheet: $('.rk-sheet'), title: $('.rk-sheet header b'),
      body: $('.rk-sheet-body'), pill: $('.rk-story-pill'), coach: $('.rk-coach'), curtain: $('.rk-curtain'), flash: $('.rk-flash'),
    };
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('keydown', (e) => {
      if (e.target && e.target.matches && e.target.matches('.rk-chat-in') && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this._sendChat(); }
      if (e.target && e.target.matches && e.target.matches('[data-menu-in]') && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this._menuInput(e.target); }
      if (e.key === 'Escape' && this.menu) { e.stopPropagation(); this.closeMenu(); }
    }, true);
    app.on('scene:open', () => { this.sync(); if (this.page && this.page !== 'chat') this.render(); });
    this._diagAt = 0;
    this.sync();
  }

  /* ───────── 顶栏 / 房间条 / Dock 同步 ───────── */

  sync() {
    const app = this.app, env = app.world.scene.env, q = (s) => this.el.top.querySelector(s);
    const cur = app.world.scene, room = app.home && app.home.room(cur.id);
    q('.rk-scene-btn b').textContent = (room && room.name) || cur.name || '房间';
    const per = PERIODS.find((p) => p.id === env.period);
    const live = per || PERIODS.find((p) => p.id === (app.env && app.env.id)) || PERIODS[1];
    q('[data-s=time]').textContent = (PERIOD_ICON[live.id] || '🕒') + (app.compact ? '' : ' ' + (per ? per.label : '跟随时间'));
    q('[data-s=time]').classList.toggle('on', !!per);
    q('[data-s=weather]').textContent = (WEATHER_ICON[env.weather] || '☀') + (app.compact ? '' : ' ' + (WEATHERS[env.weather] || WEATHERS.clear).label);
    this._syncRooms();
    const page = app.mode === 'edit' ? 'edit' : this.page || 'play';
    this.el.dock.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-page') === page));
    this.syncConn();
  }

  /** 宽档顶栏中间的房间条：家里的房间按楼层排开 */
  _syncRooms() {
    const app = this.app, home = app.home;
    if (!home) return;
    const list = home.ordered(), cur = app.world.scene.id;
    const key = list.map((r) => r.id + r.name + r.floor).join('|') + '#' + cur;
    if (this._roomsKey === key) return;
    this._roomsKey = key;
    this.el.rooms.innerHTML = list.length > 1 ? list.map((r, i) => `<button data-room="${esc(r.id)}" class="${r.id === cur ? 'on' : ''}" title="${esc(r.floor + ' · ' + r.name)}（${i + 1}）"><small>${esc(r.floor)}</small>${esc(r.name)}</button>`).join('') : '';
  }

  /** 连接灯：绿 = 宿主在线且有工作状态来源；黄 = 宿主在线；灰 = 纯本地 */
  syncConn() {
    const app = this.app, btn = this.el.top.querySelector('.rk-conn');
    const c = (app.ext && app.ext.connection && app.ext.connection()) || { level: 'local', label: '本地' };
    btn.setAttribute('data-level', c.level);
    btn.querySelector('span').textContent = c.label;
    btn.title = '连接与状态：' + (c.detail || c.label);
  }

  /** 每帧：剧情提示条、引导气泡、连接页的局部刷新 */
  update() {
    const app = this.app, root = app.root;
    root.classList.toggle('rk-storying', !!app.stories.active);
    // 待演剧情：不自动推镜头，改成一条可点的提示
    if (this.pendingStory && (app.stories.active || !app.stories.ready(this.pendingStory))) this.pendingStory = null;
    const show = this.pendingStory && !app.stories.active && app.mode !== 'edit';
    if (show && this.el.pill._id !== this.pendingStory.id) {
      this.el.pill._id = this.pendingStory.id;
      this.el.pill.innerHTML = `<button class="rk-btn" data-s="story-go">❗ ${esc(this.pendingStory.name || '新剧情')} <b>▶ 开始</b></button><button class="rk-btn icon" data-s="story-later" title="稍后">×</button>`;
    }
    this.el.pill.classList.toggle('on', !!show);
    if (!show) this.el.pill._id = null;
    if (this.page === 'conn' && performance.now() - this._diagAt > 2000) this._renderConn();
    if ((this._syncT = (this._syncT || 0) + 1) % 60 === 0) this.syncConn();
  }

  /** 剧情（开场 / 到点）：默认只给提示条；用户在设置里选了"自动播放"才直接演 */
  offerStory(s) {
    if (this.app.storage.pref('autoStory')) { this.app.stories.run(s); return; }
    if (!this.pendingStory && !this._dismissed.has(s.id)) this.pendingStory = s;
  }

  /** 第一次打开：告诉用户能点哪里（只出现一次） */
  coach() {
    if (this.app.storage.pref('coached') || this.app.opts.coach === false) return;
    const el = this.el.coach;
    el.innerHTML = `<b>欢迎来到${esc(this.app.home ? this.app.home.name : this.app.world.scene.name || '房间')}！</b><br>点点<span>角色</span>和<span>家具</span>试试；点地面让她走过去，滚轮缩放、拖动平移。<br>左上角换房间（数字键 1–9），点<span>门</span>可以去隔壁。<br>底部菜单：🛠 布置 · 📖 剧情 · 💬 聊天 · 🗺 地图<button class="rk-btn" data-s="coach-ok">知道了</button>`;
    el.classList.add('on');
  }

  /* ───────── 换房间转场：两扇门合上 → 换场景 → 打开，再闪一下楼层名 ───────── */

  async curtain(close, label) {
    const el = this.el.curtain, quick = this.app.reduceMotion;
    if (close) {
      this.closeMenu();
      el.querySelector('b').textContent = label || '';
      el.classList.add('on');
      void el.offsetWidth;
      el.classList.add('shut');
      await delay(quick ? 0 : 340);
      return;
    }
    await delay(quick ? 0 : 120);
    el.classList.remove('shut');
    setTimeout(() => { if (!el.classList.contains('shut')) el.classList.remove('on'); }, quick ? 0 : 380);
    const r = this.app.home && this.app.home.room(this.app.world.scene.id);
    this.flash(r ? `<small>${esc(r.floor)}</small>${esc(r.name)}` : esc(this.app.world.scene.name || ''));
    this.app.sfx('chirp');
  }
  flash(html) {
    const f = this.el.flash;
    f.innerHTML = html;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => f.classList.remove('on'), 1500);
  }

  /* ───────── 下拉菜单（房间 / 更多 / 地图卡片） ───────── */

  openMenu(kind, anchor, arg) {
    if (this.menu && this.menu.kind === kind && this.menu.arg === arg) { this.closeMenu(); return; }
    const app = this.app, m = this.el.menu;
    let html = '';
    if (kind === 'rooms') html = this._roomsMenu();
    else if (kind === 'more') html = this._moreMenu();
    else if (kind === 'room') html = this._roomMenu(arg);
    m.innerHTML = html;
    m.classList.add('on');
    const r = anchor.getBoundingClientRect(), base = app.root.getBoundingClientRect();
    const w = m.offsetWidth, left = Math.max(6, Math.min(r.left - base.left, base.width - w - 6));
    m.style.left = left + 'px';
    m.style.top = Math.min(r.bottom - base.top + 6, Math.max(6, base.height - m.offsetHeight - 6)) + 'px';
    this.menu = { kind, arg };
    const inp = m.querySelector('[data-menu-in]');
    if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 30);
  }
  closeMenu() { if (!this.menu) return; this.menu = null; this.el.menu.classList.remove('on'); }

  _roomsMenu() {
    const app = this.app, home = app.home, cur = app.world.scene.id;
    const groups = home.byFloor().map((g) => `<div class="rk-menu-sep">${esc(g.floor)}</div>` + g.rooms.map((r) =>
      `<button data-room="${esc(r.id)}" class="${r.id === cur ? 'on' : ''}"><span>${r.id === cur ? '●' : ''}</span>${esc(r.name)}<small>${home.ordered().indexOf(r) + 1}</small></button>`).join('')).join('');
    const outside = home.has(cur) ? '' : `<div class="rk-menu-sep">当前</div><button data-menu="add-cur"><span>＋</span>把「${esc(app.world.scene.name || '这个场景')}」加入家</button>`;
    return `<div class="rk-menu-title">${esc(home.name)}</div>${outside}${groups}<hr><button data-menu="map"><span>🗺</span>地图与全部房间<small>M</small></button><button data-menu="new-room"><span>＋</span>新建房间…</button>`;
  }
  _moreMenu() {
    const app = this.app, check = (on) => `<em>${on ? '✓' : ''}</em>`;
    return `
      <button data-menu="names"><span>🏷</span>显示名字${check(app.renderer.showNames)}</button>
      <button data-menu="fit"><span>⤢</span>复位视角<small>F</small></button>
      <button data-menu="sound"><span>${app.soundOn ? '🔊' : '🔈'}</span>声音${check(app.soundOn)}</button>
      <button data-menu="follow"><span>🐋</span>角色跟着我换房间${check(app.home.follow)}</button>
      <button data-menu="auto-story"><span>📖</span>剧情自动开演${check(!!app.storage.pref('autoStory'))}</button>
      ${app.ext && app.ext.openFull ? '<button data-menu="full"><span>⛶</span>全屏打开</button>' : ''}
      <hr><button data-menu="about"><span>ⓘ</span>关于与许可</button>`;
  }
  _roomMenu(id) {
    const home = this.app.home, r = home.room(id);
    if (!r) return '';
    return `<div class="rk-menu-title">${esc(r.name)}</div>
      <div class="rk-menu-in"><input data-menu-in="rename" data-id="${esc(id)}" value="${esc(r.name)}" maxlength="24"><button data-menu="rename" data-id="${esc(id)}">改名</button></div>
      <div class="rk-menu-sep">换到楼层</div>
      <div class="rk-chips">${home.data.floors.map((f) => `<button data-menu="floor" data-id="${esc(id)}" data-floor="${esc(f)}" class="${f === r.floor ? 'on' : ''}">${esc(f)}</button>`).join('')}</div>
      <div class="rk-menu-in"><input data-menu-in="floor" data-id="${esc(id)}" placeholder="新楼层，如 3F / 地下室" maxlength="8"><button data-menu="new-floor" data-id="${esc(id)}">新建</button></div>
      <hr><button data-menu="remove-room" data-id="${esc(id)}"><span>✕</span>移出家（存档保留）</button>`;
  }

  _menuInput(inp) {
    const app = this.app, id = inp.getAttribute('data-id'), v = inp.value.trim();
    if (!v) return;
    if (inp.getAttribute('data-menu-in') === 'rename') { app.home.rename(id, v); if (id === app.world.scene.id) app.world.apply({ t: 'meta', patch: { name: v.slice(0, 24) } }); }
    else app.home.setFloor(id, v);
    this.closeMenu();
    this.sync();
    if (this.page === 'map') this.render();
  }

  _onMenu(t) {
    const app = this.app, a = t.getAttribute('data-menu'), id = t.getAttribute('data-id');
    switch (a) {
      case 'map': this.closeMenu(); this.open('map'); return;
      case 'new-room': this.closeMenu(); this.open('map'); setTimeout(() => { const s = this.el.body.querySelector('.rk-addroom'); if (s) s.scrollIntoView({ block: 'center' }); }, 30); return;
      case 'add-cur': app.home.add(app.world.scene, app.home.data.floors[app.home.data.floors.length - 1]); this.closeMenu(); this.sync(); app.hud.toast('已加入家'); return;
      case 'names': app.renderer.showNames = !app.renderer.showNames; break;
      case 'fit': app.renderer.fit(false); this.closeMenu(); return;
      case 'sound': app.setSound(!app.soundOn); break;
      case 'follow': app.home.follow = !app.home.follow; app.hud.toast(app.home.follow ? '角色会跟着你换房间' : '每个房间各住各的'); break;
      case 'auto-story': app.storage.pref('autoStory', !app.storage.pref('autoStory')); break;
      case 'full': this.closeMenu(); if (app.ext.openFull) app.ext.openFull(); return;
      case 'about': this.closeMenu(); this.open('about'); return;
      case 'rename': { const inp = this.el.menu.querySelector('[data-menu-in=rename]'); if (inp) this._menuInput(inp); return; }
      case 'new-floor': { const inp = this.el.menu.querySelector('[data-menu-in=floor]'); if (inp) this._menuInput(inp); return; }
      case 'floor': app.home.setFloor(id, t.getAttribute('data-floor')); this.closeMenu(); this.sync(); if (this.page === 'map') this.render(); return;
      case 'remove-room': {
        if (app.home.rooms().length <= 1) { app.hud.toast('家里至少要留一个房间'); return; }
        app.home.remove(id); this.closeMenu(); this.sync(); if (this.page === 'map') this.render(); app.hud.toast('已移出家，可在地图下方重新加入');
        return;
      }
    }
    // 开关类：原地刷新菜单
    if (this.menu) { const kind = this.menu.kind, anchor = this.el.top.querySelector('[data-s=' + kind + ']'); this.menu = null; if (anchor) this.openMenu(kind, anchor); }
  }

  /* ───────── 页面 ───────── */

  open(page) {
    const app = this.app;
    this.closeMenu();
    if (page === 'edit') { this.close(); app.setMode('edit'); return; }
    if (page === 'play') { this.close(); if (app.mode === 'edit') app.setMode('play'); return; }
    if (app.mode === 'edit') app.setMode('play');
    if (this.page === page) { this.close(); return; }
    this.page = page;
    app.hud.closeCard(); app.hud.closeDrawer();
    this.el.title.textContent = PAGE_TITLE[page] || page;
    this.el.sheet.className = 'rk-sheet on rk-sheet-' + page;
    this.render();
    this.sync();
    app.bus.emit('ui:page', { page });
  }
  close() {
    if (!this.page) return;
    this.page = null;
    this.el.sheet.classList.remove('on');
    this.sync();
  }
  render() {
    const p = this.page;
    if (p === 'story') this._renderStory();
    else if (p === 'map') this._renderMap();
    else if (p === 'chat') this._renderChat();
    else if (p === 'social') this._renderSocial();
    else if (p === 'conn') this._renderConn();
    else if (p === 'about') this._renderAbout();
  }

  _trigText(s, roomScene) {
    const t = s.trigger, app = this.app;
    if (t.on === 'start') return '进入房间时';
    if (t.on === 'click') {
      const objs = (roomScene && roomScene.objects) || app.world.objects;
      const o = t.obj ? objs.find((x) => x.id === t.obj) : null;
      const d = app.catalog.get(o ? o.def : t.def);
      return '点「' + ((d && d.name) || t.obj || t.def) + '」';
    }
    if (t.on === 'agent') return '点角色「' + ((app.agents.get(t.agent) || {}).name || t.agent) + '」';
    if (t.on === 'hour') return t.from + ':00–' + t.to + ':00 之间';
    return '手动';
  }

  /** 剧情页：这个房间的剧情（可播放）+ 家里其他房间的剧情（前往） */
  _renderStory() {
    const app = this.app, st = app.stories, cur = app.world.scene;
    const here = st.forScene(cur);
    const done = (s, sid) => st.getFlag('done:' + s.id, sid) || st.getFlag('seen:' + s.id, sid);
    const n = here.filter((s) => done(s)).length;
    const row = (s) => {
      const seen = done(s), ready = st.ready(s);
      return `<div class="rk-story ${seen ? 'seen' : ''}"><div><b>${seen ? '✓' : ready ? '❗' : '·'} ${esc(s.name || s.id)}</b><small>${esc(this._trigText(s))}${s.once ? ' · 一次' : s.daily ? ' · 每天' : ''}</small></div>
        <button class="rk-btn" data-story="${esc(s.id)}" ${ready || seen ? '' : 'title="条件还不满足，也可以直接看"'}>${seen ? '重看' : '播放'}</button></div>`;
    };
    const others = [];
    for (const r of app.home.ordered()) {
      if (r.id === cur.id) continue;
      const sc = app.home.sceneFor(r.id);
      const list = sc ? st.forScene(sc).filter((s) => s.trigger.scene) : [];
      if (list.length) others.push({ r, list, n: list.filter((s) => done(s, r.id)).length });
    }
    this.el.body.innerHTML = `
      <div class="rk-progress"><span>${esc(cur.name || '这个房间')}</span><b>${n} / ${here.length}</b><i><b style="width:${here.length ? Math.round((n / here.length) * 100) : 0}%"></b></i></div>
      ${here.length ? here.map(row).join('') : '<div class="rk-hint">这个房间还没有剧情。剧情可以写在场景 JSON 的 stories 里（见 docs/04）。</div>'}
      ${others.length ? '<div class="rk-field">家里其他房间</div>' + others.map((o) => `<div class="rk-story"><div><b>${esc(o.r.floor + ' · ' + o.r.name)}</b><small>${esc(o.list.map((s) => s.name).join('、'))} · ${o.n}/${o.list.length}</small></div><button class="rk-btn" data-room="${esc(o.r.id)}">前往</button></div>`).join('') : ''}
      <div class="rk-row"><button class="rk-btn" data-s="story-reset">重置本房间进度</button>
        <label class="rk-check"><input type="checkbox" data-s="auto-story" ${app.storage.pref('autoStory') ? 'checked' : ''}> 剧情自动开演</label></div>`;
  }

  /** 地图：家里的房间按楼层排开（缩略图按场景 JSON 现画）+ 添加房间 + 不在家里的场景 */
  _renderMap() {
    const app = this.app, home = app.home, cur = app.world.scene;
    const main = app.mainAgent();
    const scenes = new Map([[cur.id, app.world.toJSON()]]);
    // 别的房间存档里可能还留着跟随角色的旧记录（她其实跟着你）：地图上只在当前房间显示她们
    const view = (s) => (s.id === cur.id || !home.follow ? s : Object.assign({}, s, { agents: (s.agents || []).filter((a) => !isFollower(a)) }));
    const card = (s0, r) => {
      const s = view(s0), here = s.id === cur.id;
      const prog = app.stories.forScene(s);
      const seen = prog.filter((x) => app.stories.getFlag('done:' + x.id, s.id) || app.stories.getFlag('seen:' + x.id, s.id)).length;
      const who = here ? (main ? '你和' + main.name + '在这里' : '你在这里') : (s.agents || []).filter((a) => !a.ephemeral).map((a) => a.name).slice(0, 3).join('、') || '没有人';
      return `<div class="rk-mapcard ${here ? 'cur' : ''}" ${r ? `data-room="${esc(s.id)}"` : `data-map-open="${esc(s.id)}"`}>
        <canvas data-thumb-scene="${esc(s.id)}" width="160" height="96"></canvas>
        <b>${esc((r && r.name) || s.name || s.id)}</b><small>${esc(who)}${prog.length ? ' · 剧情 ' + seen + '/' + prog.length : ''}</small>
        ${r ? `<button class="rk-mapcard-more" data-room-menu="${esc(s.id)}" title="改名 / 换楼层 / 移出">⋯</button>` : `<button class="rk-mapcard-more" data-map-add="${esc(s.id)}" title="加入家">＋</button>`}</div>`;
    };
    const floors = home.byFloor().map((g) => {
      const cards = g.rooms.map((r) => { const s = r.id === cur.id ? scenes.get(cur.id) : home.sceneFor(r.id); if (!s) return ''; scenes.set(s.id, s); return card(s, r); }).join('');
      return `<div class="rk-floor"><div class="rk-floor-tag">${esc(g.floor)}</div><div class="rk-mapgrid">${cards}</div></div>`;
    }).join('');
    const outside = (app.storage.list ? app.storage.list() : []).filter((s) => !home.has(s.id));
    outside.forEach((s) => { const full = s.id === cur.id ? scenes.get(cur.id) : app.storage.load(s.id); if (full) scenes.set(s.id, full); });
    const tpls = [];
    app.packs.forEach((p) => (p.scenes || []).forEach((s) => tpls.push({ key: p.id + '|' + s.id, scene: s })));
    tpls.forEach((t) => scenes.set('tpl:' + t.key, t.scene));
    const floorSel = this._addFloor || home.data.floors[home.data.floors.length - 1] || '1F';
    this.el.body.innerHTML = `
      <div class="rk-maphead"><b>${esc(home.name)}</b><small>${home.rooms().length} 个房间 · 点卡片前往，数字键 1–9 快速切换</small></div>
      ${floors}
      <div class="rk-field rk-addroom">添加房间到 <span class="rk-chips rk-inline">${home.data.floors.map((f) => `<button data-add-floor="${esc(f)}" class="${f === floorSel ? 'on' : ''}">${esc(f)}</button>`).join('')}</span></div>
      <div class="rk-mapgrid">${tpls.map((t) => `<div class="rk-mapcard rk-mapnew-tpl" data-map-tpl="${esc(t.key)}"><canvas data-thumb-scene="${esc('tpl:' + t.key)}" width="160" height="96"></canvas><b>＋ ${esc(t.scene.name || t.scene.id)}</b><small>模板</small></div>`).join('')}
        <div class="rk-mapcard rk-mapnew" data-map-new="room"><span>＋</span><b>空房间</b></div>
        <div class="rk-mapcard rk-mapnew" data-map-new="open"><span>🌳</span><b>露天广场</b></div></div>
      ${outside.length ? `<div class="rk-field">不在家里的场景（${outside.length}）</div><div class="rk-mapgrid">${outside.map((s) => scenes.get(s.id) ? card(scenes.get(s.id), null) : '').join('')}</div>` : ''}
      <div class="rk-hint">点门可以去隔壁房间；门通往哪里在门的卡片里改。🛠 布置 → 场景 里可以导入导出、复制、删除场景。</div>`;
    this.el.body.querySelectorAll('[data-thumb-scene]').forEach((c) => { const s = scenes.get(c.getAttribute('data-thumb-scene')); drawSceneThumb(c, s && s.room ? view(s) : s); });
  }

  _renderChat() {
    const app = this.app, a = app.focusAgent();
    const status = (app.ext && app.ext.chatStatus && app.ext.chatStatus()) || (app.ext && app.ext.chat ? '接入 DSH 模型' : '离线台词模式（接入 DSH 后可用模型对话）');
    this.el.body.innerHTML = `
      <div class="rk-chat-who"><span>${a ? `和 <b>${esc(a.name)}</b> 聊天` : '房间里没有角色'}</span><small>${esc(status)}</small></div>
      <div class="rk-chat-log"></div>
      <div class="rk-chat-bar"><input class="rk-chat-in" type="text" maxlength="300" placeholder="${a ? '说点什么…（比如：去睡觉吧）' : ''}" ${a ? '' : 'disabled'}><button class="rk-btn on" data-s="chat-send">发送</button></div>`;
    this._renderChatLog();
    const inp = this.el.body.querySelector('.rk-chat-in');
    if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 30);
  }
  _renderChatLog() {
    const log = this.el.body.querySelector('.rk-chat-log');
    if (!log) return;
    log.innerHTML = this.chatLog.length ? this.chatLog.map((m) => `<div class="rk-msg ${m.role}${m.pending ? ' pending' : ''}"><span>${esc(m.text)}</span>${m.note ? `<small>${esc(m.note)}</small>` : ''}</div>`).join('') : '<div class="rk-hint">她会按自己的性格回答；说"去睡觉""看会儿书""去客厅看电视"之类的话，她会真的去做。</div>';
    log.scrollTop = log.scrollHeight;
  }
  async _sendChat() {
    const app = this.app, inp = this.el.body.querySelector('.rk-chat-in');
    const text = inp && inp.value.trim();
    const a = app.focusAgent();
    if (!text || !a || this._chatBusy) return;
    inp.value = '';
    this.chatLog.push({ role: 'user', text });
    const pend = { role: 'bot', text: a.name + ' 正在想…', pending: true };
    this.chatLog.push(pend);
    this._renderChatLog();
    this._chatBusy = true;
    let res;
    try { res = await app.chat(a, text, this.chatLog.filter((m) => !m.pending && m !== pend).slice(-13, -1)); } catch (e) { res = { text: '（' + (e.message || '没听清') + '）', acts: [] }; }
    this._chatBusy = false;
    pend.pending = false;
    pend.text = res.text || '……';
    if (res.note) pend.note = res.note;
    if (this.page === 'chat') this._renderChatLog();
    if (this.chatLog.length > 60) this.chatLog.splice(0, this.chatLog.length - 60);
  }

  _renderSocial() {
    const app = this.app, items = (app.ext && app.ext.social) || [];
    this.el.body.innerHTML = `
      ${items.length ? `<div class="rk-field">在 DSH 里</div>${items.map((it) => `<label class="rk-check rk-opt"><input type="checkbox" data-social="${esc(it.id)}" ${it.on() ? 'checked' : ''}><span><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></span></label>`).join('')}` : ''}
      <div class="rk-field">这个房间里的角色（${app.agents.size}）</div>
      ${[...app.agents.values()].map((a) => `<div class="rk-kv"><span>${esc(a.name)}</span><span>${esc(a.status ? STATUS_TEXT[a.status.state] || a.status.state : a.activity || '')}</span></div>`).join('')}
      <div class="rk-field">串门与社区</div>
      <div class="rk-soon">🐋 多只大肥鱼互相串门、聊天<br>🧩 网友分享的家具 / 房间 / 剧情广场<br><small>规划中（见 docs/05 第六节）：本机多窗口同步 → 本地中继串门 → 公网社区。</small></div>`;
  }

  _renderConn() {
    this._diagAt = performance.now();
    const app = this.app;
    const rows = [
      { name: '运行环境', ok: true, detail: (app.ext && app.ext.host) || (location.protocol === 'file:' ? '本地文件（双击打开）' : '网页 ' + location.host) },
      { name: '房间引擎', ok: true, detail: 'RoomKit ' + VERSION + ' · ' + app.agents.size + ' 个角色 · ' + app.world.objects.length + ' 件家具' },
    ].concat((app.ext && app.ext.diagnostics && app.ext.diagnostics()) || [{ name: 'DSH', ok: null, detail: '未接入（独立网页模式）' }]);
    const main = app.mainAgent();
    const st = main && main.status;
    const keep = this.el.body.querySelector('.rk-diag');
    const html = `
      <div class="rk-diag">${rows.map((r) => `<div class="rk-diag-row"><i class="rk-dot" data-ok="${r.ok === true ? 1 : r.ok === false ? 0 : ''}"></i><span>${esc(r.name)}</span><small>${esc(r.detail || '')}</small></div>`).join('')}</div>
      <div class="rk-field">主角当前状态</div>
      <div class="rk-kv"><span>${esc(main ? main.name : '—')}</span><span>${esc(st ? (STATUS_TEXT[st.state] || st.state) + (st.task ? ' · ' + st.task : '') : '空闲（自己过日子）')}</span></div>
      <div class="rk-field">自测：模拟一次工作状态</div>
      <div class="rk-chips">${Object.keys(STATUS_TEXT).map((k) => `<button data-sim="${k}">${STATUS_TEXT[k]}</button>`).join('')}<button data-sim="">回到空闲</button></div>
      <div class="rk-hint">在 DSH 里给 Agent 发一条消息，主角会依次「思考 → 干活 → 完成」；这里的按钮能在不跑任务的情况下检查联动是否正常。</div>`;
    if (keep && this._connHtml === html) return;
    this._connHtml = html;
    this.el.body.innerHTML = html;
  }

  _renderAbout() {
    this.el.body.innerHTML = `
      <div class="rk-kv"><span>引擎</span><span>RoomKit ${esc(VERSION)}（MIT）</span></div>
      <div class="rk-kv"><span>运行于</span><span>${esc((this.app.ext && this.app.ext.host) || '独立网页')}</span></div>
      <div class="rk-field">素材许可</div>
      <div class="rk-hint" style="margin-top:0">「大肥鱼」鲸鱼娘形象为社区二创，CC BY-NC-SA 4.0（非商用、署名、相同方式共享）。<br>
        真模型鲸鱼娘来自 Pal-AI-Lab/Coopanion，AGPL-3.0；只在页面加载了 vendor/whale-rig.js 时使用。<br>
        网友内容包的许可以包内 license 字段为准。</div>
      <div class="rk-field">快捷键</div>
      <div class="rk-hint" style="margin-top:0">B 布置 · F 复位视角 · M 地图 · C 聊天 · 1–9 换房间 · Esc 关闭<br>剧情中：空格 / 回车 下一句，数字键选选项</div>`;
  }

  /* ───────── 门：通往哪个房间 → 走过去 / 改目的地 ───────── */

  doorCard(o) {
    const app = this.app, def = app.world.def(o), home = app.home;
    const to = o.state && o.state.to, room = to && home.room(to);
    const rooms = home.ordered().filter((r) => r.id !== app.world.scene.id);
    const html = `<div class="rk-door">
      ${room ? `<div class="rk-kv"><span>通往</span><span>${esc(room.floor + ' · ' + room.name)}</span></div>
        <div class="rk-row"><button class="rk-btn on" data-door-go="${esc(o.id)}">${home.follow && app.mainAgent() ? '一起过去 →' : '过去 →'}</button><button class="rk-btn" data-door-toggle="${esc(o.id)}">${o.state && o.state.open ? '关门' : '开门'}</button></div>`
        : `<div class="rk-sub">${to ? '通往的房间已经不在家里了' : '这扇门还没通往别的房间'}</div><div class="rk-row"><button class="rk-btn" data-door-toggle="${esc(o.id)}">${o.state && o.state.open ? '关门' : '开门'}</button></div>`}
      ${rooms.length ? `<div class="rk-field">${room ? '改成通往' : '通往'}</div><div class="rk-chips">${rooms.map((r) => `<button data-door-link="${esc(o.id)}" data-room-id="${esc(r.id)}" class="${r.id === to ? 'on' : ''}">${esc(r.floor + ' ' + r.name)}</button>`).join('')}${to ? `<button data-door-link="${esc(o.id)}" data-room-id="">不通</button>` : ''}</div>` : '<div class="rk-hint">家里只有这一个房间——在 🗺 地图里添加房间后就能连起来。</div>'}
    </div>`;
    app.hud.openDrawer({ title: def ? def.name : '门', sub: def ? def.sub : '', html });
  }

  /* ───────── 点击 ───────── */

  _onClick(e) {
    const app = this.app;
    if (this.menu && !e.target.closest('.rk-menu') && !e.target.closest('[data-s=rooms],[data-s=more],[data-room-menu]')) this.closeMenu();
    const t = e.target.closest && e.target.closest('[data-s],[data-page],[data-story],[data-sim],[data-social],[data-room],[data-room-menu],[data-menu],[data-map-open],[data-map-add],[data-map-tpl],[data-map-new],[data-add-floor],[data-door-go],[data-door-link],[data-door-toggle]');
    if (!t || !app.root.contains(t)) return;
    if (t.hasAttribute('data-menu')) { this._onMenu(t); return; }
    if (t.hasAttribute('data-room-menu')) { e.stopPropagation(); this.openMenu('room', t, t.getAttribute('data-room-menu')); return; }
    if (t.hasAttribute('data-map-add')) { e.stopPropagation(); app.home.add(app.storage.load(t.getAttribute('data-map-add')), this._addFloor); this.sync(); this.render(); return; }
    if (t.hasAttribute('data-page')) { this.open(t.getAttribute('data-page')); return; }
    if (t.hasAttribute('data-room')) {
      const id = t.getAttribute('data-room');
      this.closeMenu();
      if (this.page === 'map' || this.page === 'story') this.close();
      if (id !== app.world.scene.id) app.goRoom(id);
      return;
    }
    if (t.hasAttribute('data-story')) {
      const s = app.stories.all().find((x) => x.id === t.getAttribute('data-story'));
      if (s && !app.stories.active) { this.close(); this.pendingStory = null; app.stories.run(s); }
      return;
    }
    if (t.hasAttribute('data-sim')) { const v = t.getAttribute('data-sim'); app.setWorkStatus(v ? { state: v, task: v === 'working' ? '模拟任务：整理房间' : null } : null); this._diagAt = 0; return; }
    if (t.hasAttribute('data-social')) { const it = ((app.ext && app.ext.social) || []).find((x) => x.id === t.getAttribute('data-social')); if (it) { it.toggle(); setTimeout(() => { if (this.page === 'social') this.render(); }, 50); } return; }
    if (t.hasAttribute('data-door-go')) { const o = app.world.byId.get(t.getAttribute('data-door-go')); if (o) app.walkThrough(o); return; }
    if (t.hasAttribute('data-door-toggle')) { const o = app.world.byId.get(t.getAttribute('data-door-toggle')); if (o) { app.world.apply({ t: 'state', id: o.id, patch: { open: !(o.state && o.state.open) } }); this.doorCard(o); } return; }
    if (t.hasAttribute('data-door-link')) {
      const o = app.world.byId.get(t.getAttribute('data-door-link')), rid = t.getAttribute('data-room-id');
      if (!o) return;
      app.world.apply({ t: 'state', id: o.id, patch: { to: rid || null } });
      if (rid) app.home.linkBack(rid, app.world.scene.id);
      this.doorCard(o);
      return;
    }
    if (t.hasAttribute('data-add-floor')) { this._addFloor = t.getAttribute('data-add-floor'); this.render(); return; }
    if (t.hasAttribute('data-map-open')) { this.close(); app.goRoom(t.getAttribute('data-map-open')); return; }
    if (t.hasAttribute('data-map-tpl')) {
      const [pid, sid] = t.getAttribute('data-map-tpl').split('|');
      const p = app.packs.find((x) => x.id === pid), tp = p && (p.scenes || []).find((s) => s.id === sid);
      if (tp) { const s = clone(tp); s.template = tp.id; s.id = uid('room'); this._newRoom(s); }
      return;
    }
    if (t.hasAttribute('data-map-new')) { this._newRoom(blankScene(t.getAttribute('data-map-new') === 'open')); return; }
    switch (t.getAttribute('data-s')) {
      case 'rooms': this.openMenu('rooms', t); return;
      case 'more': this.openMenu('more', t); return;
      case 'time': { const i = TIME_CYCLE.indexOf(app.world.scene.env.period); app.command({ op: 'env.set', period: TIME_CYCLE[(i + 1) % TIME_CYCLE.length] }); break; }
      case 'weather': { const i = WEATHER_CYCLE.indexOf(app.world.scene.env.weather); app.command({ op: 'env.set', weather: WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length] }); break; }
      case 'conn': this.open('conn'); break;
      case 'close': this.close(); break;
      case 'chat-send': this._sendChat(); break;
      case 'story-go': { const s = this.pendingStory; this.pendingStory = null; if (s) app.stories.run(s); break; }
      case 'story-later': if (this.pendingStory) this._dismissed.add(this.pendingStory.id); this.pendingStory = null; break;   // 这次打开不再提示；下次进房间再提醒
      case 'story-reset': app.stories.reset(); this.render(); app.hud.toast('剧情进度已重置'); break;
      case 'auto-story': app.storage.pref('autoStory', !!t.checked); break;
      case 'coach-ok': app.storage.pref('coached', true); this.el.coach.classList.remove('on'); break;
    }
    this.sync();
  }

  /** 新房间：门先连好（新房间的门通回来，当前房间空着的门通过去），存档、加进家（选中的楼层），再走过去 */
  _newRoom(s) {
    const app = this.app, from = app.world.scene.id;
    s.format = 'roomkit.scene';
    if (app.home.follow) s.agents = (s.agents || []).filter((a) => a.brain !== 'pet');   // 主角会跟着过去，模板里那份不要
    const portal = (o) => { const d = o.wall && app.catalog.get(o.def); return d && d.portal; };
    (s.objects || []).forEach((o) => { if (portal(o) && o.state && o.state.to) delete o.state.to; });   // 模板里的门指向模板自己的邻居，新房间里不算
    const door = (s.objects || []).find(portal);
    if (door && app.home.has(from)) door.state = Object.assign({}, door.state, { to: from });
    app.storage.save(s, { last: false });
    app.home.add(s, this._addFloor);
    if (door && app.home.has(from)) app.home.linkBack(from, s.id);
    this.close();
    app.goRoom(s.id).then(() => app.hud.toast('新房间：' + s.name + (door ? '，门已经和上一个房间连上了' : ''), 3200));
  }
}

export function blankScene(open) {
  return {
    format: 'roomkit.scene', v: 2, id: uid('room'), name: open ? '露天广场' : '新房间',
    room: open
      ? { w: 16, h: 12, mats: [{ kind: 'grass', color: '#9bd17a' }, { kind: 'stone', color: '#d9d2c3' }], walls: { left: false, right: false, height: 300 }, slab: 22 }
      : { w: 8, h: 6, walls: { left: true, right: true, height: 300 } },
    objects: open ? [] : [{ id: uid('o'), def: 'door', wall: 'right', at: 6.5, z: 0 }, { id: uid('o'), def: 'window', wall: 'left', at: 2.5, z: 100 }],
    agents: [],
  };
}

/** 场景缩略图：地面材质 + 两面墙 + 家具占地块 + 角色点，纯按 JSON 画，不依赖贴图 */
export function drawSceneThumb(c, s) {
  const ctx = c.getContext('2d');
  if (!ctx || !s || !s.room) return;
  const r = s.room, w = r.w || 8, h = r.h || 6, mats = r.mats || [{ color: '#e3a46a' }];
  const k = Math.min((c.width - 16) / (w + h), (c.height - 30) / ((w + h) / 2));
  const oy = 26, cx = c.width / 2 - ((w - h) * k) / 2;
  const Q = (x, y) => [cx + (x - y) * k, oy + (x + y) * k / 2];
  ctx.clearRect(0, 0, c.width, c.height);
  const walls = r.walls || {};
  const wall = (a, b, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 18); ctx.lineTo(a[0], a[1] - 18); ctx.fill(); };
  if (walls.left !== false) wall(Q(0, 0), Q(0, h), walls.color || '#f1e6d4');
  if (walls.right !== false) wall(Q(0, 0), Q(w, 0), shade(walls.color || '#f1e6d4'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = r.cells && r.cells[y] ? r.cells[y][x] : 'a';
    if (ch === '.') continue;
    const m = mats[Math.max(0, 'abcd'.indexOf(ch))] || mats[0];
    ctx.fillStyle = m.color || '#e3a46a';
    const [a, b, d, e] = [Q(x, y), Q(x + 1, y), Q(x + 1, y + 1), Q(x, y + 1)];
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,70,100,.45)';
  for (const o of s.objects || []) {
    if (o.wall || o.x == null) continue;
    const p = Q(o.x + 0.5, o.y + 0.5);
    ctx.fillRect(p[0] - k * 0.4, p[1] - k * 0.5, k * 0.8, k * 0.5);
  }
  for (const a of s.agents || []) {
    if (a.x == null) continue;
    const p = Q(a.x, a.y);
    ctx.fillStyle = (a.look && a.look.body) || '#5b8def';
    ctx.beginPath(); ctx.arc(p[0], p[1] - 4, Math.max(2.5, k * 0.28), 0, Math.PI * 2); ctx.fill();
  }
}
function shade(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0;
  const f = (v) => Math.round(v * 0.86);
  return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}
