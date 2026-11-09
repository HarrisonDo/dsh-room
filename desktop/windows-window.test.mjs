import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('desktop bounds use the active work area and persist on exit', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'roomkit-bounds-'));
  const prefs = path.join(profile, 'desk.json');
  const primary = { workArea: { x: 0, y: 0, width: 1800, height: 1000 } };
  const secondary = { workArea: { x: -600, y: 0, width: 600, height: 480 } };
  let second = secondary, window, checkPermission;
  const app = Object.assign(new EventEmitter(), {
    getPath: () => profile, setName() {}, requestSingleInstanceLock: () => true, whenReady: async () => {},
  });
  const screen = Object.assign(new EventEmitter(), {
    getPrimaryDisplay: () => primary,
    getDisplayMatching: ({ x }) => x < 0 && second ? second : primary,
  });
  const ipcMain = Object.assign(new EventEmitter(), { handle() {} });
  class BrowserWindow extends EventEmitter {
    constructor({ x, y, width, height }) {
      super();
      window = this;
      this.bounds = { x, y, width, height };
      this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {} });
    }
    loadURL(url) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents(ignore) { this.ignoring = ignore; }
    setBounds(bounds) { this.bounds = bounds; }
    getBounds() { return this.bounds; }
  }
  globalThis.roomkitTestElectron = {
    app, BrowserWindow, ipcMain, screen, protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler(fn) { checkPermission = fn; } } },
    dialog: {}, Menu: {}, net: {}, shell: {},
  };
  const shim = 'data:text/javascript,' + encodeURIComponent('export const {app,BrowserWindow,dialog,ipcMain,Menu,net,protocol,screen,session,shell} = globalThis.roomkitTestElectron;');
  const hook = registerHooks({ resolve(specifier, context, next) {
    return specifier === 'electron' ? { url: shim, shortCircuit: true } : next(specifier, context);
  } });
  try {
    await writeFile(prefs, JSON.stringify({ x: -430, y: 400, width: 680, ratio: 1.6 }));
    await import('./main.js');
    assert.deepEqual(window.getBounds(), { x: -430, y: 0, width: 300, height: 480 });
    const sender = window.webContents;
    ipcMain.emit('desk:solid', { sender, senderFrame: { url: sender.mainFrame.url } }, true);
    assert.equal(window.ignoring, true);
    ipcMain.emit('desk:solid', { sender, senderFrame: sender.mainFrame }, true);
    assert.equal(window.ignoring, false);
    assert.equal(checkPermission(), false);
    ipcMain.emit('desk:scale', { sender, senderFrame: sender.mainFrame }, 0.5);
    assert.deepEqual(window.getBounds(), { x: -390, y: 128, width: 220, height: 352 });
    second = null;
    screen.emit('display-removed');
    assert.deepEqual(window.getBounds(), { x: 1556, y: 624, width: 220, height: 352 });
    app.emit('before-quit');
    const saved = JSON.parse(await readFile(prefs, 'utf8'));
    assert.deepEqual([saved.x, saved.y, saved.width], [1556, 624, 220]);
  } finally {
    hook.deregister();
    delete globalThis.roomkitTestElectron;
    await rm(profile, { recursive: true, force: true });
  }
});
