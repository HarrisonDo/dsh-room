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
import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = realpathSync(path.resolve(process.env.ROOMKIT_WEB || path.join(HERE, '../dsh-room/web')));
const ORIGIN = 'app://roomkit';
const IS_MAC = process.platform === 'darwin';
const SIZES = [{ label: '小', w: 320 }, { label: '中', w: 460 }, { label: '大', w: 680 }];
const MIN_W = 220;

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
function savePrefs() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { writeFileSync(PREFS_FILE(), JSON.stringify(prefs, null, 2)); } catch (e) { console.warn('保存窗口位置失败', e); } }, 400);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const maxWidth = () => Math.round(screen.getPrimaryDisplay().workArea.width * 0.9);
const heightFor = (w) => Math.round(w * clamp(prefs.ratio, 0.4, 1.6));

/** 记住的位置还在某块屏幕上就用，否则放到主屏右下角 */
function initialBounds() {
  const width = clamp(Math.round(prefs.width) || 460, MIN_W, maxWidth()), height = heightFor(width);
  if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) {
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      prefs.x + width > a.x + 40 && prefs.x < a.x + a.width - 40 && prefs.y + height > a.y + 40 && prefs.y < a.y + a.height - 40);
    if (onScreen) return { x: Math.round(prefs.x), y: Math.round(prefs.y), width, height };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - width - 24, y: a.y + a.height - height - 24, width, height };
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
    return net.fetch(pathToFileURL(real).toString());
  });
}

/** 两个窗口共用：只许待在 app://roomkit，外部 https 链接交给系统浏览器 */
function lockDown(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) e.preventDefault(); });
}

/* ───────── 桌面窗口 ───────── */

let desk = null, full = null, dragFrom = null, quitting = false;

function createDesk() {
  desk = new BrowserWindow({
    ...initialBounds(),
    title: '大肥鱼的房间',
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: !!prefs.top, show: false,
    webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  if (prefs.top) desk.setAlwaysOnTop(true, 'floating');
  if (IS_MAC && prefs.allSpaces) desk.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  desk.setIgnoreMouseEvents(true, { forward: true });
  lockDown(desk);
  desk.loadURL(ORIGIN + '/index.html?desk=1');
  desk.once('ready-to-show', () => desk && desk.show());
  desk.on('moved', rememberBounds);
  desk.on('closed', () => { desk = null; dragFrom = null; if (!full && !quitting) app.quit(); });
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
  const b = desk.getBounds(), w = clamp(Math.round(width), MIN_W, maxWidth()), h = heightFor(w);
  desk.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: b.y + b.height - h, width: w, height: h });
  rememberBounds();
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  lockDown(full);
  full.loadURL(ORIGIN + '/index.html');
  full.on('closed', () => { full = null; if (!quitting) createDesk(); });
  if (desk) desk.close();
}

/* ───────── 页面发来的请求（只认桌面窗口自己的） ───────── */

const fromDesk = (e) => desk && e.sender === desk.webContents;

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
    rememberBounds();
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

ipcMain.on('desk:full', (e) => { if (fromDesk(e)) openFull(); });

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
      { label: '打开完整房间…', click: () => openFull() },
      { label: '退出', click: () => app.quit() },
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
app.on('before-quit', () => { quitting = true; });
// 不跟 window-all-closed 走：完整房间关掉的那一刻窗口数会短暂归零，随后桌面窗口会重新打开；退出看桌面窗口的 closed
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  loadPrefs();
  // 房间不需要摄像头、麦克风、定位、通知等任何权限
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  serveWeb();
  createDesk();
});
