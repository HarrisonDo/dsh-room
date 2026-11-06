#!/usr/bin/env node
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_PORT } from './preview.mjs';

const port = Number(process.env.ROOMKIT_PORT || DEFAULT_PORT);
const url = `http://127.0.0.1:${port}/`;
function probe() {
  return new Promise(resolve => {
    const req = http.get(url + '__roomkit_health', res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(body).app === 'dsh-room' ? 'ready' : 'occupied'); } catch { resolve('occupied'); } });
    });
    req.setTimeout(1500, () => req.destroy()); req.on('error', e => resolve(e.code === 'ECONNREFUSED' ? 'offline' : 'occupied'));
  });
}
export async function ensurePreview() {
  const status = await probe();
  if (status === 'ready') return url;
  if (status === 'occupied') throw new Error(`端口 ${port} 正被其他程序使用。设置 ROOMKIT_PORT 后重试。`);
  await new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./preview.mjs', import.meta.url)), [], {
      detached: true, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, ROOMKIT_PORT: String(port) },
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error('预览服务启动超时')); }, 8000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('预览服务退出：' + code)); });
    child.once('message', () => { clearTimeout(timer); child.disconnect(); child.unref(); resolve(); });
  });
  return url;
}
function openWindow(target, desktop) {
  let command, args;
  const chrome = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe') : '/usr/bin/google-chrome';
  if (desktop && existsSync(chrome)) { command = chrome; args = [`--app=${target}?ui=compact`, '--window-size=740,620']; }
  else if (process.platform === 'darwin') { command = '/usr/bin/open'; args = [target]; }
  else if (process.platform === 'win32') { command = 'explorer.exe'; args = [target]; }
  else { command = 'xdg-open'; args = [target]; }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', error => console.error(`请手动打开 ${target}（${error.message}）`)); child.unref();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const target = await ensurePreview(); console.log('大肥鱼的房间：' + target); openWindow(target, process.argv.includes('--desktop')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
