/**
 * dsh-room · 浏览器半侧（DSH Web 页面内）。由 scripts/build.mjs 打成 lib/client.js（IIFE，无顶层 import/export）。
 *
 * 做这些事（全部是可选能力：缺哪个服务就只降级那一块，绝不拖垮 DSH 页面）：
 *   1. 常驻小窗/胶囊、右侧栏、全屏、插件设置页均有入口；同一时刻只挂一个房间。
 *   2. 跟随工作状态：每秒经鉴权接口取宿主半侧聚合的状态（lib/work-status.js）；宿主那边没有时读 dsh-pet 的 petApi7340。
 *   3. 群体：「会话同伴」开关打开后，每个 DSH 会话在房间里有一只临时小鲸鱼（不进存档），跟着自己的会话状态走，点卡片可打开该会话。
 *   4. 聊天：外壳的 💬 经鉴权接口走当前对话的模型；Agent 工具（默认关）下发的命令随状态一起领回来执行。
 * 外壳（web/roomkit/shell.js）不认识 DSH：这里把上面这些能力包成 opts.ext 传进去。
 * 对外：ctx.provide('roomApi7341', { command, on, app })，同页其他插件可以直接驱动房间。
 */
import { mount, WHALE_LOOKS } from '../web/roomkit/index.js';
import '../web/packs/default/pack.js';
import './sprites.gen.js';

const PLUGIN_ID = 'dsh-room';
const TAB_ID = 'dsh-room-tab';
const TAB_KIND = 'dsh-room';
const TITLE = '大肥鱼的房间';
/* 宿主半侧（lib/index.js）把 web/ 挂在这里；贴图拿不到时家具自动退回程序化备选 */
const ASSET_BASE = '/plugins/dsh-room/web/';

const STORE_URL = '/plugins/dsh-room/api/store';
const RIG_URL = ASSET_BASE + 'vendor/whale-rig.js';
/* 宿主半侧挂在 DSH 自己 /api 下的鉴权接口；页面相对地址，桌面版 dsh-app 协议会带凭据转发 */
const API_BASE = 'api/dsh-room.';
const LEVELS = { thinking: 1, working: 1, result: 1, waiting: 1, success: 1, error: 1 };

let current = null;                       // 当前挂着的房间实例（标签页和挂件互斥，同一时刻只有一个）
const listeners = new Set();

/** 调宿主接口：非 2xx 抛错（401/403 = 这个页面没有 DSH 凭据，比如在独立浏览器里打开的 Web 预览） */
async function hostCall(endpoint, payload, signal) {
  const r = await fetch(API_BASE + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}), signal, cache: 'no-store' });
  if (r.status === 404) throw new Error('宿主没有这个接口（重启 DSH 后生效）');
  if (r.status === 401 || r.status === 403) throw new Error('这个页面没有 DSH 凭据');
  if (!r.ok) throw new Error('宿主出错 HTTP ' + r.status);
  return r.json();
}

/** 连接与工作状态：页面每秒来取一次，顺便把房间现状带给宿主（Agent 的 room_look 用）、领走待执行的命令 */
function createLink() {
  const rpc = hostCall;
  const link = { rpc, online: false, error: '', status: null, at: 0 };
  link.poll = async (app) => {
    try {
      const s = await rpc('status', { room: app.describe() }, AbortSignal.timeout(2500));
      link.online = true; link.error = ''; link.status = s; link.at = Date.now();
      return s;
    } catch (e) {
      link.online = false; link.error = (e && e.message) || '连不上宿主';
      return null;
    }
  };
  return link;
}

function followStatus(ctx, app, link) {
  let shown = null, lastPetTs = -1;
  const sessionAgent = (sid) => (sid && app.agents.has('session:' + sid) ? 'session:' + sid : null);
  const show = (state, task) => {
    const key = state ? state + '|' + (task || '') : null;
    if (key === shown) return;
    shown = key;
    app.setWorkStatus(state ? { state, task } : null);
  };
  const fromHost = (s) => {
    (s.commands || []).forEach((c) => {
      if (c.op === 'room.act') { const a = app.mainAgent(); if (a) app.applyActs(a, [c.act]); } else app.command(c);
    });
    const d = s.display || {};
    const mine = d.sessionId ? sessionAgent(d.sessionId) : null;
    show(mine || !LEVELS[d.state] ? null : d.state, d.task);
    for (const a of app.agents.values()) {
      if (a.id.indexOf('session:') !== 0) continue;
      const e = (s.sessions || {})[a.id.slice(8)];
      const key = e ? e.state + '|' + (e.task || '') : '';
      if (a._dshStatus === key) continue;
      a._dshStatus = key;
      app.command({ op: 'agent.status', id: a.id, status: e ? e.state : null, task: e ? e.task : null });
    }
  };
  const fromPet = () => {
    const api = ctx.get && ctx.get('petApi7340');
    const st = api && typeof api.getState === 'function' ? api.getState() : null;
    const ws = st && st.sections && st.sections.workStatus && st.sections.workStatus.data;
    if (!ws || ws.ts === lastPetTs) return;
    lastPetTs = ws.ts;
    show(ws.state, ws.task);
  };
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { const s = await link.poll(app); if (s) fromHost(s); else fromPet(); } finally { busy = false; }
  };
  const t = setInterval(tick, 1000);
  tick();
  return () => clearInterval(t);
}

/** 群体：DSH 会话 → 临时角色（最多 6 只，按会话列表顺序）；切换房间后重新放进来 */
function followSessions(ctx, app) {
  const seen = new Map();
  const tick = () => {
    if (!app.groupOn) {
      for (const id of seen.keys()) app.command({ op: 'agent.remove', id });
      seen.clear();
      return;
    }
    const store = ctx.get && ctx.get('sessions');
    const snap = store && store.list && typeof store.list.getSnapshot === 'function' ? store.list.getSnapshot() : null;
    const byId = (snap && snap.byId) || {};
    const ids = Object.keys(byId).slice(0, 6);
    const want = new Set(ids.map((sid) => 'session:' + sid));
    for (const id of [...seen.keys()]) if (!want.has(id)) { app.command({ op: 'agent.remove', id }); seen.delete(id); }
    ids.forEach((sid, i) => {
      const id = 'session:' + sid, row = byId[sid] || {};
      const name = (typeof row.title === 'string' && row.title.trim()) || '会话 ' + (i + 1);
      if (seen.get(id) === name && app.agents.has(id)) return;
      const look = Object.assign({}, WHALE_LOOKS[(i + 1) % WHALE_LOOKS.length], { size: 1.05 });
      app.command({ op: 'agent.upsert', agent: { id, name: name.slice(0, 12), brain: 'auto', ephemeral: true, session: sid, look } });
      seen.set(id, name);
    });
  };
  const t = setInterval(tick, 3000);
  const off = app.on('scene:open', tick);
  tick();
  return () => { clearInterval(t); off(); };
}

/** 外壳的扩展点：连接灯、连接页检查项、聊天、社区页开关 */
function makeExt(ctx, link, onFullscreen) {
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' 秒前' : Math.round(s / 60) + ' 分钟前'; };
  const pet = () => { const api = ctx.get && ctx.get('petApi7340'); return !!(api && typeof api.getState === 'function'); };
  const ext = {
    host: 'DSH ' + (location.protocol === 'dsh-app:' ? '桌面版' : '网页版'),
    connection() {
      const s = link.status;
      if (link.online) return { level: 'ok', label: 'DSH', detail: s && s.display && s.display.state ? '工作状态：' + s.display.state : '已连接，等待工作状态' };
      if (hostOk || pet()) return { level: 'partial', label: 'DSH', detail: pet() ? '工作状态来自 dsh-pet' : '只连上了存档，工作状态不可用（' + (link.error || '宿主未响应') + '）' };
      return { level: 'error', label: 'DSH', detail: link.error || '宿主未响应' };
    },
    diagnostics() {
      const s = link.status || {};
      return [
        { name: '宿主通道', ok: link.online, detail: link.online ? '已连接（DSH 鉴权接口）' : link.error || '连接中…' },
        { name: '存档同步', ok: hostOk ? true : null, detail: hostOk ? '已同步到 DSH 用户目录' : '只存在这个页面（宿主存档接口未响应）' },
        { name: '工作状态', ok: link.online ? true : pet() ? true : false, detail: link.online ? (s.lastEventAt ? '收到 ' + s.events + ' 条会话事件，最近 ' + ago(s.lastEventAt) : '已监听，还没有会话事件（发条消息试试）') : pet() ? '来自 dsh-pet' : '不可用' },
        { name: '聊天模型', ok: s.chat ? s.chat.available : null, detail: s.chat ? (s.chat.available ? s.chat.model : '当前对话还没有可用模型') : '未知' },
        { name: 'Agent 工具', ok: s.tools ? (s.tools.enabled ? true : null) : null, detail: s.tools ? (s.tools.enabled ? '已开启：room_look / room_say / room_do' : '未开启（在 👥 社区里打开）') : '未知' },
      ];
    },
    chatStatus() { const c = link.status && link.status.chat; return c && c.available ? '模型：' + c.model : '模型不可用时会用离线台词回你'; },
    async chat(req) {
      const r = await link.rpc('chat', req, AbortSignal.timeout(50000));
      return r && r.ok ? { text: r.text } : { error: (r && r.error) || '模型没有回话' };
    },
    social: [],
  };
  if (onFullscreen) ext.openFull = onFullscreen;
  return ext;
}

/** 真模型鲸鱼娘（AGPL 可选件）：从宿主静态路由加载；拿不到就用引擎内置的 Q 版 */
let rigReady = null;
function loadRig() {
  if (window.RoomKitRig) return Promise.resolve();
  if (!rigReady) {
    rigReady = new Promise((ok) => {
      const s = document.createElement('script');
      const timer = setTimeout(ok, 1800); // 可选模型不能让整个房间一直等网络
      s.src = RIG_URL;
      s.onload = () => { clearTimeout(timer); ok(); };
      s.onerror = () => { clearTimeout(timer); console.warn('[dsh-room] 真模型加载失败，改用内置角色'); ok(); };
      document.head.appendChild(s);
    });
  }
  return rigReady;
}

/* 存档同步：宿主那份是准的（多端共享）。挂载前拉下来写进 localStorage，之后每 2 秒把变动推回去 */
const lsKeys = () => {
  const out = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(PLUGIN_ID + '.') === 0) out[k] = localStorage.getItem(k); } } catch (e) { /* 忽略 */ }
  return out;
};
let hostOk = false;
let storeReady = null;
async function pullStore() {
  // 同一页面切换小窗/侧栏/全屏时，本地刚保存的版本优先，避免再次拉取覆盖未上传的改动。
  if (storeReady) return storeReady;
  storeReady = (async () => {
  try {
    const r = await fetch(STORE_URL, { cache: 'no-store', signal: AbortSignal.timeout(1800) });
    if (!r.ok) return;
    const data = await r.json();
    for (const k of Object.keys(data)) localStorage.setItem(k, data[k]);
    hostOk = true;
  } catch (e) { /* 没有宿主路由（旧版本/桌面 file://）：只用 localStorage */ }
  })();
  return storeReady;
}
function pushStore() {
  if (!hostOk) return () => {};
  const last = lsKeys();
  let queue = Promise.resolve();
  const sync = () => { queue = queue.then(async () => {
    const now = lsKeys();
    for (const k of new Set([...Object.keys(last), ...Object.keys(now)])) {
      if (now[k] === last[k]) continue;
      try {
        const response = await fetch(STORE_URL, { method: 'PUT', signal: AbortSignal.timeout(3000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k, value: now[k] == null ? null : now[k] }) });
        if (response.ok) { if (now[k] == null) delete last[k]; else last[k] = now[k]; }
      } catch (e) { /* 不更新已确认版本，下一次会重试 */ }
    }
  }); };
  const t = setInterval(sync, 2000);
  return () => { clearInterval(t); sync(); };
}

function mountRoom(ctx, el, opts) {
  const packs = (window.RoomKitPacks || []).map(pack => ({ ...pack,
    furniture: (pack.furniture || []).map(def => {
      const src = def.art && def.art.src;
      const embedded = src && src.startsWith('packs/default/sprites/') && window.RoomKitAssets[src.split('/').pop()];
      return embedded ? { ...def, art: { ...def.art, src: embedded } } : def;
    }),
  }));
  const link = createLink();
  const ext = makeExt(ctx, link, opts.onFullscreen);
  const app = mount(el, Object.assign({ storageKey: 'dsh-room', assetBase: ASSET_BASE, packs, ext }, opts));
  app.groupOn = false;
  try { app.groupOn = localStorage.getItem('dsh-room.group') === '1'; } catch (e) { /* 忽略 */ }
  // 社区页的开关：DSH 才有的能力，不放进通用引擎
  ext.social.push({
    id: 'sessions', label: '会话同伴', sub: '每个 DSH 会话在房间里有一只小鲸鱼，跟着自己的会话忙',
    on: () => app.groupOn,
    toggle() { app.groupOn = !app.groupOn; try { localStorage.setItem('dsh-room.group', app.groupOn ? '1' : '0'); } catch (e) { /* 忽略 */ } },
  }, {
    id: 'tools', label: '允许 Agent 操作房间', sub: '给每个对话增加 room_look / room_say / room_do 三个工具（会多占一点上下文）',
    on: () => !!(link.status && link.status.tools && link.status.tools.enabled),
    toggle() {
      const next = !(link.status && link.status.tools && link.status.tools.enabled);
      link.rpc('tools', { enabled: next }).then((r) => { if (link.status) link.status.tools = Object.assign({}, link.status.tools, { enabled: r.enabled }); app.shell.render(); }).catch((e) => app.hud.toast('没能切换：' + e.message));
    },
  });
  // 点会话同伴的卡片：多一个「打开这个会话」
  const offCard = app.on('agent:click', ({ id }) => {
    const a = app.agents.get(id), sid = a && a.data.session;
    if (!sid) return;
    const ws = ctx.get && ctx.get('uiWorkspace');
    if (ws && typeof ws.openSession === 'function') app.hud.addCardAction('打开这个会话', () => ws.openSession(sid));
  });
  const stops = [followStatus(ctx, app, link), followSessions(ctx, app), pushStore(), offCard];
  const off = app.on('*', (data, ev) => listeners.forEach((fn) => { try { fn(ev, data); } catch (e) { /* 忽略 */ } }));
  current = app;
  return () => {
    if (app.opts.autosave) app.storage.save(app.world.toJSON());
    stops.forEach((s) => s());
    off();
    if (current === app) current = null;
    app.destroy();
  };
}

function makeFactory() {
  return (require) => {
    const { useEffect, useRef, useState } = require('react');
    const { jsx: h } = require('react/jsx-runtime');
    function apply(ctx) {
      // 所有入口共享一个房间实例：切换到侧栏/全屏前保存并卸载旧视图。
      let placement = 'dock';
      let sidebarReady = false;
      const subscribers = new Set();
      const setPlacement = value => { placement = value; subscribers.forEach(fn => fn(value)); };
      ctx.effect(() => {
        const onKey = e => { if (e.altKey && e.shiftKey && e.code === 'KeyR') { e.preventDefault(); setPlacement(placement === 'dock' ? 'closed' : 'dock'); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, 'dsh-room: open shortcut');
      function usePlacement() {
        const [value, setValue] = useState(placement);
        useEffect(() => { subscribers.add(setValue); setValue(placement); return () => subscribers.delete(setValue); }, []);
        return value;
      }
      const buttonStyle = { border: '1px solid #9fb2d944', borderRadius: 10, background: '#eaf0ff', color: '#243047', cursor: 'pointer', padding: '7px 11px', font: '13px system-ui' };
      const action = (text, fn, key = text) => h('button', { type: 'button', style: buttonStyle, onClick: fn, children: text }, key);
      function RoomPanel() {
        const ref = useRef(null);
        const [error, setError] = useState('');
        useEffect(() => {
          let stop = null, dead = false;
          Promise.all([loadRig(), pullStore()]).then(() => {
            if (!dead) stop = mountRoom(ctx, ref.current, { onFullscreen: placement === 'full' ? undefined : () => setPlacement('full') });
          }).catch(e => { console.error('[dsh-room] 房间启动失败', e); if (!dead) setError(e.message || '启动失败'); });
          return () => { dead = true; if (stop) stop(); };
        }, []);
        return h('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden' }, children: [
          h('div', { ref, style: { position: 'absolute', inset: 0 } }, 'mount'),
          error ? h('div', { role: 'alert', style: { position: 'absolute', inset: 0, padding: 24, color: '#fff', background: '#192237' }, children: [
            h('p', { children: '房间暂时未能打开：' + error }, 'error'),
            action('重新打开', () => { setPlacement('closed'); setTimeout(() => setPlacement('dock'), 0); }),
          ] }, 'error') : null,
        ] });
      }
      function SidebarPanel() {
        const where = usePlacement();
        useEffect(() => { setPlacement('sidebar'); return () => { if (placement === 'sidebar') setPlacement('closed'); }; }, []);
        return where === 'sidebar' ? h(RoomPanel, {}) : h('div', { style: { padding: 20 }, children: action('🐋 打开大肥鱼的房间', () => setPlacement('sidebar')) });
      }
      function openSidebar() {
        const controller = ctx.get && ctx.get('sidebarRight');
        if (sidebarReady && controller && typeof controller.openTab === 'function') {
          setPlacement('sidebar');
          // 插件管理页没有右侧栏渲染位，先回到会话工作区，再打开房间标签。
          const layout = ctx.get('layout');
          if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null);
          controller.openTab(TAB_KIND);
        }
        else setPlacement('full');
      }
      function PreviewLink() {
        const [url, setUrl] = useState(/^https?:$/.test(location.protocol) ? new URL(ASSET_BASE, location.href).href : null);
        useEffect(() => {
          if (url) return;
          let dead = false;
          fetch('/plugins/dsh-room/api/info', { signal: AbortSignal.timeout(1800) }).then(r => r.ok ? r.json() : null).then(info => {
            if (!info || !info.webUrl || dead) return;
            const target = new URL(info.webUrl);
            if (['http:', 'https:'].includes(target.protocol) && target.hostname === '127.0.0.1') setUrl(target.href);
          }).catch(() => {});
          return () => { dead = true; };
        }, []);
        return url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', style: { ...buttonStyle, display: 'inline-block', textDecoration: 'none' }, children: '↗ Web 预览' })
          : h('span', { style: { fontSize: 12 }, children: 'Web 预览入口准备中；如未出现，请重启 DSH。' });
      }
      function EntryPage() {
        return h('section', { style: { padding: 20, lineHeight: 1.7 }, children: [
          h('h2', { children: '🐋 ' + TITLE }, 'title'),
          h('p', { children: '房间已启用。点角色打招呼、点家具互动；左上角换房间，底部菜单可以布置、看剧情、和她聊天。' }, 'help'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [
            action('打开房间小窗', () => setPlacement('dock')), action('在侧栏打开', openSidebar),
            action('全屏打开', () => setPlacement('full')), h(PreviewLink, {}, 'preview'),
          ] }, 'actions'),
          h('p', { children: '桌面独立窗口：双击项目中的「打开桌面房间.command」。Web 预览：双击「打开Web预览.command」。' }, 'desktop'),
        ] });
      }
      function Overlay() {
        const where = usePlacement();
        if (where === 'sidebar') return null;      // 房间已经在侧栏里了，右下角不再放胶囊挡着它
        if (where !== 'dock' && where !== 'full') return h('button', {
          type: 'button', 'aria-label': '打开大肥鱼的房间', title: '打开房间（Alt+Shift+R）', onClick: () => setPlacement('dock'), children: '🐋 大肥鱼的房间',
          style: { ...buttonStyle, position: 'fixed', right: 16, bottom: 16, zIndex: 70, boxShadow: '0 4px 20px #0003' },
        });
        const full = where === 'full';
        return h('section', {
          'aria-label': full ? '大肥鱼的房间全屏' : '大肥鱼的房间小窗',
          style: { position: 'fixed', right: full ? 12 : 16, bottom: full ? 12 : 16, left: full ? 12 : 'auto', top: full ? 12 : 'auto',
            width: full ? 'auto' : 'min(520px, calc(100vw - 24px))', height: full ? 'auto' : 'min(440px, calc(100vh - 24px))',
            zIndex: 70, borderRadius: 16, overflow: 'hidden', background: '#172038', boxShadow: '0 16px 55px #0006', display: 'flex', flexDirection: 'column' },
          children: [
            h('header', { style: { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 9px', color: '#e8eefb', background: '#202b43', font: '12px system-ui', flexShrink: 0 }, children: [
              h('strong', { style: { flex: 1 }, children: '🐋 ' + TITLE }, 'title'),
              action('侧栏', openSidebar), action(full ? '小窗' : '全屏', () => setPlacement(full ? 'dock' : 'full')),
              action('收起', () => setPlacement('closed')),
            ] }, 'header'),
            h('div', { style: { position: 'relative', flex: 1, minHeight: 0 }, children: h(RoomPanel, {}) }, full ? 'full-room' : 'dock-room'),
          ],
        });
      }
      ctx.provide('roomApi7341', {
        command: c => current ? current.command(c) : { ok: false, error: '请先打开房间' },
        on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        open: () => setPlacement('dock'),
        get app() { return current; },
      });
      ctx.inject(['sidebarRightTabs'], scope => {
        sidebarReady = true;
        scope.effect(() => scope.sidebarRightTabs.register({
          id: TAB_ID, kind: TAB_KIND, priority: 'extension', title: () => TITLE,
          guide: [{ id: TAB_KIND, order: 410, title: () => TITLE, description: () => '进入房间，布置小屋、切换场景、与角色互动' }],
        }), 'dsh-room: sidebar tab');
        scope.slots.inject('sidebar.right.pane.tab', function* () {
          yield scope.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, order: 100 }, () => h(SidebarPanel, {}));
        });
      });
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({ name: 'shell.overlay', id: PLUGIN_ID, order: 990 }, () => h(Overlay, {}));
      });
      ctx.slots.inject('settings.section', function* () {
        yield ctx.slots.register({ name: 'settings.section', id: 'dsh-room-settings', order: 35, label: () => TITLE }, () => h(EntryPage, {}));
      });
      ctx.slots.inject('settings.plugins.tab', function* () {
        yield ctx.slots.register({ name: 'settings.plugins.tab', id: 'dsh-room', order: 40, label: () => TITLE }, () => h(EntryPage, {}));
      });
      // 新版 DSH 的左侧「插件」是独立页面，使用 plugins.*，与旧版设置区分别兼容。
      ctx.slots.inject('plugins.tab', function* () {
        yield ctx.slots.register({ name: 'plugins.tab', id: PLUGIN_ID, order: 40, label: () => TITLE }, () => h(EntryPage, {}));
      });
      ctx.slots.inject('plugins.bundle.config', function* () {
        yield ctx.slots.register({ name: 'plugins.bundle.config', key: PLUGIN_ID }, () => h(EntryPage, {}));
      });
    }
    return { name: PLUGIN_ID, inject: ['slots'], apply };
  };
}

window.__ModuleLoader__.load({ id: PLUGIN_ID, factory: makeFactory() });
