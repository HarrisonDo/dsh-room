/**
 * 大肥鱼的房间 · 桌面版（Electron 主进程）。
 *
 * 桌面窗口：透明、无边框、无阴影，加载 app://roomkit/index.html?desk=1（引擎的桌面模式，只剩房间和角色）。
 *   - 点击穿透：默认忽略鼠标、但继续把鼠标移动转发给页面；页面判断鼠标下有没有东西，再告诉这里接不接点击
 *   - 拖房间 = 拖窗口；滚轮 = 缩放窗口；右键 = 菜单（房间 / 时间 / 天气 / 大小 / 总在最前 / 完整房间 / 退出）
 *   - 位置、大小、置顶记在 userData/desk.json
 * 完整房间：普通带边框窗口，同一个 app:// 源，存档与桌面窗口共用；打开期间桌面窗口先关掉，避免两边互相覆盖存档。
 *
 * 页面文件直接从 ../dsh-room/web 读（自定义协议，不开任何网络端口）。ROOMKIT_WEB 可以指向别的构建目录。
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = realpathSync(path.resolve(process.env.ROOMKIT_WEB || path.join(HERE, '../dsh-room/web')));
const ORIGIN = 'app://roomkit';
const IS_MAC = process.platform === 'darwin';
const SIZES = [{ label: '小', w: 320 }, { label: '中', w: 460 }, { label: '大', w: 680 }];
const MIN_W = 220;
const WEB_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const managed = process.env.ROOMKIT_MANAGED === '1' && process.connected && typeof process.send === 'function';
if (managed) {
  app.setPath('userData', process.env.ROOMKIT_USER_DATA);
}
let windowAnnounced = false;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('大肥鱼的房间');
if (!app.requestSingleInstanceLock()) app.quit();

/* ───────── 偏好 ───────── */

const PREFS_FILE = () => path.join(app.getPath('userData'), 'desk.json');
let prefs = { width: 460, ratio: 0.8, top: true, allSpaces: false };
function loadPrefs() {
  try { prefs = Object.assign(prefs, JSON.parse(readFileSync(PREFS_FILE(), 'utf8'))); } catch { /* 第一次打开 */ }
}
let saveT = null;
function flushPrefs() {
  clearTimeout(saveT);
  if (saveT === null) return;
  saveT = null;
  try { writeFileSync(PREFS_FILE(), JSON.stringify(prefs, null, 2)); } catch (e) { console.warn('保存窗口位置失败', e); }
}
function savePrefs() {
  clearTimeout(saveT);
  saveT = setTimeout(flushPrefs, 400);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roomRatio = () => clamp(Number(prefs.ratio) || 0.8, 0.4, 1.6);
function fittedSize(width, area) {
  const ratio = roomRatio();
  const max = Math.max(1, Math.floor(Math.min(area.width * 0.9, area.height / ratio)));
  width = clamp(Math.round(width), Math.min(MIN_W, max), max);
  return { width, height: Math.round(width * ratio) };
}

function fitBounds(x, y, size, area) {
  return {
    x: clamp(Math.round(x), area.x, area.x + area.width - size.width),
    y: clamp(Math.round(y), area.y, area.y + area.height - size.height),
    ...size,
  };
}

/** 记住的位置还在某块屏幕上就用，否则放到主屏右下角 */
function initialBounds() {
  const width = Number.isFinite(prefs.width) && prefs.width > 0 ? prefs.width : 460;
  const saved = { x: prefs.x, y: prefs.y, width, height: Math.round(width * roomRatio()) };
  if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) {
    const area = screen.getDisplayMatching(saved).workArea;
    if (saved.x + saved.width > area.x + 40 && saved.x < area.x + area.width - 40
      && saved.y + saved.height > area.y + 40 && saved.y < area.y + area.height - 40) {
      return fitBounds(saved.x, saved.y, fittedSize(width, area), area);
    }
  }
  const a = screen.getPrimaryDisplay().workArea;
  const size = fittedSize(width, a);
  return fitBounds(a.x + a.width - size.width - 24, a.y + a.height - size.height - 24, size, a);
}

/* ───────── 页面文件（app://roomkit/…） ───────── */

function serveWeb() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    if (u.host !== 'roomkit') return new Response('Not found', { status: 404 });
    let rel;
    try { rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname); } catch { return new Response('Bad URL', { status: 400 }); }
    const file = path.resolve(WEB, '.' + rel);
    if (!file.startsWith(WEB + path.sep)) return new Response('Forbidden', { status: 403 });
    let real;
    try { real = realpathSync(file); } catch { return new Response('Not found', { status: 404 }); }
    if (!real.startsWith(WEB + path.sep)) return new Response('Forbidden', { status: 403 });
    if (managed) {
      try {
        return new Response(await readFile(real), { headers: {
          'content-type': WEB_TYPES[path.extname(real)] || 'application/octet-stream',
          'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'",
        } });
      } catch { return new Response('Not found', { status: 404 }); }
    }
    return net.fetch(pathToFileURL(real).toString());
  });
}

/** 两个窗口共用：只许待在 app://roomkit，外部 https 链接交给系统浏览器 */
function lockDown(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!managed && /^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (managed || !url.startsWith(ORIGIN + '/')) e.preventDefault(); });
}

/* ───────── 桌面窗口 ───────── */

let desk = null, full = null, dragFrom = null, quitting = false;
const windowPage = deskMode => ORIGIN + (managed ? '/managed.html' : '/index.html') + (deskMode ? '?desk=1' : '');
const secureWebPreferences = { contextIsolation: true, sandbox: true, nodeIntegration: false };
const desktopPreload = { preload: path.join(HERE, 'preload.cjs'), ...(managed ? { additionalArguments: ['--roomkit-managed'] } : {}) };

const parentCalls = new Map();
const windowTimers = new Map();
let requestId = 0, prepare = null, transition = null;
const HOME_BYTES = 64 * 1024 * 1024 + 65536;
const HOME_METHODS = new Set(['claim', 'save', 'model', 'chat', 'cancel-model', 'return', 'rotate']);

function quitNow() {
  quitting = true;
  app.quit();
}
function parentCall(method, payload) {
  if (!process.connected) return Promise.reject(new Error('DSH 已断开'));
  const id = ++requestId;
  const call = Promise.withResolvers();
  const timer = setTimeout(() => {
    parentCalls.delete(id);
    call.reject(new Error('等待 DSH 超时'));
  }, method === 'chat' ? 55000 : 14000);
  parentCalls.set(id, call);
  process.send({ type: 'roomkit.desktop.request', id, method, payload }, error => {
    if (error) call.reject(new Error('DSH 已断开'));
  });
  return call.promise.finally(() => { clearTimeout(timer); parentCalls.delete(id); });
}

function managedSender(event) {
  const window = full || desk;
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  const url = new URL(event.senderFrame.url);
  return url.protocol === 'app:' && url.host === 'roomkit' && url.pathname === '/managed.html';
}

function switchManaged(destination) {
  if (transition) return transition;
  const window = full || desk;
  if (!window || quitting) return Promise.reject(new Error('桌面房间暂不可用'));
  const ack = Promise.withResolvers();
  const id = ++requestId;
  const action = destination === 'return' ? 'return' : 'rotate';
  prepare = { id, ack, action };
  const timer = setTimeout(() => ack.reject(new Error('桌面房间未完成保存，请重试')), 47000);
  window.webContents.send('roomkit:home-prepare', id, action);
  transition = ack.promise.then(() => {
    if (destination === 'return') quitNow();
    else {
      window.destroy();
      if (destination === 'full') openFull();
      else createDesk();
    }
  }).finally(() => { clearTimeout(timer); prepare = null; transition = null; });
  return transition;
}

function managedAction(destination) {
  void switchManaged(destination).catch(error => {
    if (error.code === 'lost') quitNow();
    else if (!quitting) void dialog.showMessageBox({ message: '房间仍在桌面', detail: error.message, buttons: ['知道了'] });
  });
}

function watchManaged(win, returnTo) {
  if (!managed) return;
  const timer = setTimeout(quitNow, 15000);
  windowTimers.set(win, timer);
  win.once('closed', () => { clearTimeout(timer); windowTimers.delete(win); });
  win.on('close', event => {
    if (!quitting) { event.preventDefault(); managedAction(returnTo); }
  });
  win.webContents.on('render-process-gone', quitNow);
  win.webContents.on('did-fail-load', (_, __, ___, ____, mainFrame) => { if (mainFrame) quitNow(); });
}

if (managed) {
  process.on('message', message => {
    if (message?.type === 'roomkit.desktop.quit') { if (full || desk) managedAction('return'); else quitNow(); return; }
    if (message?.type !== 'roomkit.desktop.response') return;
    const call = parentCalls.get(message.id);
    if (message.ok) call?.resolve(message.result);
    else call?.reject(Object.assign(new Error(message.error || 'DSH 请求失败'), { code: message.code }));
  });
  process.on('disconnect', quitNow);
  ipcMain.handle('roomkit:home', async (event, method, payload) => {
    try {
      if (!managedSender(event) || !HOME_METHODS.has(method) || !payload
        || Buffer.byteLength(JSON.stringify(payload)) > HOME_BYTES) throw new Error('桌面请求不合法或存档过大');
      if ((method === 'return' || method === 'rotate') && prepare?.action !== method) throw new Error('桌面切换未开始');
      return { ok: true, data: await parentCall(method, payload) };
    } catch (error) { return { ok: false, error: error.message, code: error.code }; }
  });
  ipcMain.on('roomkit:home-ready', event => {
    if (!managedSender(event)) return;
    const window = full || desk;
    clearTimeout(windowTimers.get(window));
    windowTimers.delete(window);
    window.show();
    if (!windowAnnounced && process.connected) {
      windowAnnounced = true;
      process.send({ type: 'roomkit.desktop.ready', protocol: 2 }, () => {});
    }
  });
  ipcMain.on('roomkit:home-prepared', (event, id, result) => {
    if (!managedSender(event) || prepare?.id !== id) return;
    if (result?.ok) prepare.ack.resolve();
    else prepare.ack.reject(Object.assign(new Error(String(result?.error || '保存未完成').slice(0, 300)), { code: result?.code }));
  });
  ipcMain.handle('roomkit:home-return', async (event) => {
    if (!managedSender(event)) return { ok: false, error: '无权切换房间窗口' };
    try { await switchManaged('return'); return { ok: true }; }
    catch (error) {
      if (error.code === 'lost') quitNow();
      return { ok: false, error: error.message };
    }
  });
}

function createDesk() {
  desk = new BrowserWindow({
    ...initialBounds(),
    title: '大肥鱼的房间',
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: !!prefs.top, show: false,
    webPreferences: { ...secureWebPreferences, ...desktopPreload },
  });
  if (prefs.top) desk.setAlwaysOnTop(true, 'floating');
  if (IS_MAC && prefs.allSpaces) desk.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  desk.setIgnoreMouseEvents(true, { forward: true });
  lockDown(desk);
  watchManaged(desk, 'return');
  desk.loadURL(windowPage(true)).catch(() => { if (managed) quitNow(); });
  desk.once('ready-to-show', () => {
    if (!managed) desk?.show();
  });
  desk.on('moved', rememberBounds);
  desk.on('closed', () => { desk = null; dragFrom = null; if (!managed && !full && !quitting) app.quit(); });
}

function rememberBounds() {
  if (!desk) return;
  const b = desk.getBounds();
  Object.assign(prefs, { x: b.x, y: b.y, width: b.width });
  savePrefs();
}

/** 改宽度，高度按房间比例；以底边中点为锚（站在任务栏/Dock 上的房间不会往下掉出屏幕） */
function resizeDesk(width) {
  if (!desk) return;
  const b = desk.getBounds(), area = screen.getDisplayMatching(b).workArea;
  const size = fittedSize(width, area);
  desk.setBounds(fitBounds(b.x + (b.width - size.width) / 2, b.y + b.height - size.height, size, area));
  rememberBounds();
}

function restoreVisibleDesk() {
  if (!desk || quitting || dragFrom) return;
  rememberBounds();
  const next = initialBounds();
  const current = desk.getBounds();
  if (['x', 'y', 'width', 'height'].some(key => current[key] !== next[key])) {
    desk.setBounds(next);
    rememberBounds();
  }
}

function setTop(on) {
  prefs.top = !!on; savePrefs();
  if (desk) desk.setAlwaysOnTop(prefs.top, 'floating');
}
function setAllSpaces(on) {
  prefs.allSpaces = !!on; savePrefs();
  if (desk) desk.setVisibleOnAllWorkspaces(prefs.allSpaces, { visibleOnFullScreen: prefs.allSpaces });
}

/** 完整房间（带边框的普通窗口）；关掉后桌面窗口重新打开，读到最新存档 */
function openFull() {
  if (full) { full.show(); full.focus(); return; }
  full = new BrowserWindow({
    width: 1100, height: 760, minWidth: 480, minHeight: 360, title: '大肥鱼的房间', backgroundColor: '#0f1524',
    show: !managed, webPreferences: { ...secureWebPreferences, ...(managed ? desktopPreload : {}) },
  });
  lockDown(full);
  watchManaged(full, 'desk');
  full.loadURL(windowPage(false)).catch(() => { if (managed) quitNow(); });
  full.on('closed', () => { full = null; if (!managed && !quitting) createDesk(); });
  if (!managed && desk) desk.close();
}

/* ───────── 页面发来的请求（只认桌面窗口自己的） ───────── */

const fromDesk = (e) => desk && e.sender === desk.webContents && e.senderFrame === desk.webContents.mainFrame
  && e.senderFrame?.url === windowPage(true);

ipcMain.on('desk:solid', (e, solid) => {
  if (!fromDesk(e)) return;
  desk.setIgnoreMouseEvents(!solid, { forward: true });
});

ipcMain.on('desk:drag', (e, phase) => {
  if (!fromDesk(e)) return;
  const c = screen.getCursorScreenPoint();
  if (phase === 'start') {
    const [x, y] = desk.getPosition();
    dragFrom = { cx: c.x, cy: c.y, x, y };
  } else if (phase === 'move' && dragFrom) {
    desk.setPosition(Math.round(dragFrom.x + c.x - dragFrom.cx), Math.round(dragFrom.y + c.y - dragFrom.cy));
  } else if (phase === 'end') {
    dragFrom = null;
    restoreVisibleDesk();
  }
});

ipcMain.on('desk:scale', (e, factor) => {
  if (!fromDesk(e) || !Number.isFinite(factor)) return;
  resizeDesk(desk.getBounds().width * clamp(factor, 0.5, 2));
});

ipcMain.on('desk:aspect', (e, ratio) => {
  if (!fromDesk(e) || !Number.isFinite(ratio)) return;
  prefs.ratio = clamp(ratio, 0.4, 1.6);
  resizeDesk(desk.getBounds().width);
});

ipcMain.on('desk:full', (e) => { if (fromDesk(e)) { if (managed) managedAction('full'); else openFull(); } });

/** 右键菜单：房间/时间/天气由页面执行（返回动作字符串），大小/置顶/完整房间/退出在这里处理 */
ipcMain.handle('desk:menu', (e, spec) => {
  if (!fromDesk(e)) return null;
  const list = (v) => (Array.isArray(v) ? v.slice(0, 40) : []).filter((x) => x && typeof x.id === 'string');
  const s = spec || {};
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const radio = (items, prefix) => list(items).map((x) => ({ label: String(x.label || x.id).slice(0, 40), type: 'radio', checked: !!x.on, click: () => finish(prefix + x.id) }));
    const width = desk.getBounds().width;
    const near = SIZES.reduce((a, b) => (Math.abs(b.w - width) < Math.abs(a.w - width) ? b : a));
    const tpl = [
      { label: '房间', submenu: radio(s.rooms, 'room:') },
      { label: '时间', submenu: radio(s.periods, 'time:') },
      { label: '天气', submenu: radio(s.weathers, 'weather:') },
      { type: 'separator' },
      { label: '大小（也可以用滚轮）', submenu: SIZES.map((z) => ({ label: z.label, type: 'radio', checked: z === near, click: () => resizeDesk(z.w) })) },
      { label: '总在最前', type: 'checkbox', checked: !!prefs.top, click: (it) => setTop(it.checked) },
      IS_MAC ? { label: '在所有桌面显示', type: 'checkbox', checked: !!prefs.allSpaces, click: (it) => setAllSpaces(it.checked) } : null,
      { type: 'separator' },
      { label: '打开完整房间…', click: () => managed ? managedAction('full') : openFull() },
      managed ? { label: '回到 DSH', click: () => managedAction('return') } : { label: '退出', click: () => app.quit() },
    ].filter(Boolean);
    // 有的平台先通知"菜单关了"再执行点击：稍等一下再按"什么都没选"收尾
    Menu.buildFromTemplate(tpl).popup({ window: desk, callback: () => setTimeout(() => finish(null), 80) });
  });
});

/* ───────── 启动 ───────── */

app.on('second-instance', () => {
  const w = full || desk;
  if (w) { w.show(); w.focus(); }
});
app.on('before-quit', event => {
  if (managed && !quitting && (desk || full)) { event.preventDefault(); managedAction('return'); }
  else { quitting = true; flushPrefs(); }
});
// 不跟 window-all-closed 走：完整房间关掉的那一刻窗口数会短暂归零，随后桌面窗口会重新打开；退出看桌面窗口的 closed
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  loadPrefs();
  // 房间不需要摄像头、麦克风、定位、通知等任何权限
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  if (managed) session.defaultSession.webRequest.onBeforeRequest((details, respond) => {
    respond({ cancel: !/^(?:app:\/\/roomkit\/|data:|blob:app:\/\/roomkit\/)/.test(details.url) });
  });
  serveWeb();
  screen.on('display-removed', restoreVisibleDesk);
  screen.on('display-metrics-changed', restoreVisibleDesk);
  createDesk();
});
