import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prepareDesktopRuntime } from './desktop-runtime.js';
import { HOME_LIMIT } from '../shared/local-home-format.js';

const START_TIMEOUT = 15000;
const STOP_TIMEOUT = 2500;
const READY = 'roomkit.desktop.ready';
const QUIT = 'roomkit.desktop.quit';
const REQUEST = 'roomkit.desktop.request';
const RESPONSE = 'roomkit.desktop.response';

function launchEnvironment(webRoot, userData) {
  const env = { ROOMKIT_MANAGED: '1', ROOMKIT_WEB: webRoot, ROOMKIT_USER_DATA: userData };
  for (const name of [
    'HOME', 'PATH', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'SystemDrive',
    'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramData',
  ]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function waitForWindow(child, closed, signal) {
  const ready = Promise.withResolvers();
  const onMessage = (message) => {
    if (message?.type !== READY) return;
    if (message.protocol !== 2) ready.reject(new Error('桌面窗口协议不匹配'));
    else ready.resolve();
  };
  const onAbort = () => ready.reject(signal.reason);
  const timer = setTimeout(() => ready.reject(new Error('桌面窗口启动超时')), START_TIMEOUT);
  child.on('message', onMessage);
  child.once('error', ready.reject);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  return Promise.race([ready.promise, closed.then(() => { throw new Error('桌面窗口启动时退出'); })]).finally(() => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    child.removeListener('message', onMessage);
  });
}

async function closeChild(run) {
  const child = run.child;
  if (!child) return;
  if (child.connected) child.send({ type: QUIT }, () => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT);
  try { await run.closed; }
  finally { clearTimeout(timer); }
}

/** One process per plugin host. The caller owns the profile directory and disposes this manager with the plugin. */
export function createDesktopProcess({ directory, entry, webRoot, onRequest, onExit }) {
  const userData = path.join(directory, 'window');
  let current;
  let state = { phase: 'idle' };

  async function launch(run) {
    const { signal } = run.controller;
    try {
      const executable = await prepareDesktopRuntime(path.join(directory, 'runtime'), {
        signal,
        onProgress(progress) { if (!signal.aborted) state = progress; },
      });
      await mkdir(userData, { recursive: true, mode: 0o700 });
      signal.throwIfAborted();
      state = { phase: 'starting' };
      const child = spawn(executable, [entry], {
        cwd: directory,
        env: launchEnvironment(webRoot, userData),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        // Electron is a GUI executable. On Windows, windowsHide also hides the
        // first framed BrowserWindow when switching out of the transparent pet.
      });
      run.child = child;
      run.closed = new Promise(resolve => child.once('close', resolve));
      let pending = 0;
      child.on('message', async (message) => {
        if (message?.type !== REQUEST || !Number.isSafeInteger(message.id) || message.id < 1) return;
        const reply = data => { if (child.connected) child.send({ type: RESPONSE, id: message.id, ...data }, () => {}); };
        if (pending >= 4 || typeof message.method !== 'string' || Buffer.byteLength(JSON.stringify(message)) > HOME_LIMIT + 65536) {
          reply({ ok: false, error: '桌面请求过多或存档过大' });
          return;
        }
        pending++;
        try { reply({ ok: true, result: await onRequest(run.handoff, message.method, message.payload, signal) }); }
        catch (error) { reply({ ok: false, code: error.code, error: error.message || '桌面请求失败' }); }
        finally { pending--; }
      });
      void run.closed.then(() => onExit(run.handoff)).catch(() => {});
      await waitForWindow(child, run.closed, signal);
      signal.throwIfAborted();
      state = { phase: 'running' };
      void run.closed.then(code => {
        if (current !== run || signal.aborted) return;
        current = undefined;
        state = code === 0 ? { phase: 'idle' } : { phase: 'error', error: '桌面窗口意外退出' };
      });
    } catch (error) {
      await closeChild(run);
      current = undefined;
      state = signal.aborted ? { phase: 'idle' } : { phase: 'error', error: error.message };
      throw error;
    }
  }

  return {
    status: () => ({ ...state }),
    start(handoff) {
      if (current) return current.started;
      const run = { controller: new AbortController(), handoff };
      current = run;
      state = { phase: 'preparing' };
      run.started = launch(run);
      return run.started;
    },
    async stop() {
      const run = current;
      if (!run) return;
      if (run.stopping) return run.stopping;
      run.controller.abort();
      state = { phase: 'stopping' };
      run.stopping = (async () => {
        await run.started.catch(() => {});
        if (current !== run) return;
        await closeChild(run);
        current = undefined;
        state = { phase: 'idle' };
      })();
      return run.stopping;
    },
  };
}
