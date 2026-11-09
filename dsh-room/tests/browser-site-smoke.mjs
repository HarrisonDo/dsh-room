// 真实 Chrome 走网页入口：游客保存、公共世界登录入场、朋友邀请连续进入。node tests/browser-site-smoke.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createTown, seedPublicWorlds, serve, webSite } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { authConfig, hashToken } from '../scripts/town-auth.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));
const shots = process.env.ROOMKIT_SHOTS;
const temp = await mkdtemp(path.join(tmpdir(), 'roomkit-site-'));
const site = path.join(temp, 'site'), profile = path.join(temp, 'chrome');
execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-site.mjs', import.meta.url)), site], { stdio: 'ignore' });
const chromePath = process.env.ROOMKIT_CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
const store = await openStore();
let server, chrome, socket;
try {
  const town = createTown(store, { auth: authConfig({ TOWN_DEV_LOGIN: '1', TOWN_PUBLIC_URL: 'http://127.0.0.1' }) });
  await seedPublicWorlds(town, path.join(site, 'public-worlds.json'));
  server = serve(town, 0, '127.0.0.1', { web: await webSite(path.join(site, 'web')) });
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;

  chrome = spawn(chromePath, ['--headless', '--no-first-run', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let endpoint = '';
  for (let i = 0; i < 100 && !endpoint; i++) { endpoint = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => ''); if (!endpoint) await delay(100); }
  assert.ok(endpoint, 'Chrome 调试入口未启动');
  const [port, target] = endpoint.trim().split('\n');
  socket = new WebSocket(`ws://127.0.0.1:${port}${target}`);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map(), popups = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Target.targetCreated' && message.params.targetInfo.type === 'page') popups.push(message.params.targetInfo);
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' 超时')); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  await cdp('Target.setDiscoverTargets', { discover: true });

  async function client(width = 1280, height = 800) {
    const { browserContextId } = await cdp('Target.createBrowserContext');
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    return { tab: sessionId, browserContextId };
  }
  const run = async (tab, expression) => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, tab);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  async function until(tab, expression, label) {
    for (let i = 0; i < 100; i++) { const value = await run(tab, expression).catch(() => null); if (value) return value; await delay(100); }
    throw new Error('等待超时：' + label + ' · ' + await run(tab, "document.querySelector('.rk-sheet-body')?.innerText || document.body.innerText.slice(0, 300)"));
  }
  const open = async (c, url) => { await cdp('Page.navigate', { url }, c.tab); await until(c.tab, 'Boolean(window.room?.town)', '页面启动'); };
  const click = (tab, selector) => run(tab, `document.querySelector(${JSON.stringify(selector)}).click()`);
  async function shot(c, name) {
    if (!shots) return;
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, c.tab);
    await (await import('node:fs/promises')).writeFile(path.join(shots, name + '.png'), Buffer.from(data, 'base64'));
  }
  /** 完成弹出的本机测试登录表单 */
  async function devLogin(c, name) {
    let info;
    for (let i = 0; i < 80 && !info; i++) { info = popups.find((p) => !p.used && p.browserContextId === c.browserContextId && p.targetId && p.openerId); if (!info) await delay(100); }
    assert.ok(info, '没有弹出登录窗口');
    info.used = true;
    const { sessionId } = await cdp('Target.attachToTarget', { targetId: info.targetId, flatten: true });
    await until(sessionId, "Boolean(document.querySelector('input[name=name]'))", '登录表单');
    await run(sessionId, `document.querySelector('input[name=name]').value = ${JSON.stringify(name)}; document.querySelector('form').submit()`);
    await until(c.tab, 'Boolean(window.room.town.account)', '登录完成');
  }
  const sessionId = (tab) => run(tab, 'window.room.worldSession.id || null');

  // 游客：无登录遮罩，布置后刷新仍在
  const guest = await client();
  await open(guest, base + '/');
  assert.equal(await run(guest.tab, "getComputedStyle(document.querySelector('.rk-welcome')).display"), 'block');
  await shot(guest, 'guest');
  assert.equal(await run(guest.tab, "document.querySelector('.rk-conn span').textContent"), '游客');
  await run(guest.tab, "window.room.world.apply({ t: 'meta', patch: { name: '访客改过的小屋' } })");
  await delay(800);
  await open(guest, base + '/');
  assert.equal(await run(guest.tab, 'window.room.world.scene.name'), '访客改过的小屋', '游客布置刷新后丢失');
  assert.equal(await run(guest.tab, 'window.room.town.account'), null);

  // 公共世界：卡片 → 登录弹窗 → 确认昵称 → 回到原目标
  const enterPlaza = async (c, name) => {
    await open(c, base + '/');
    await click(c.tab, '[data-page=social]');
    await until(c.tab, "Boolean(document.querySelector('[data-s=hub-enter]'))", '公共世界卡片');
    await click(c.tab, '[data-s=hub-enter]');
    await devLogin(c, name);
    await until(c.tab, "Boolean(document.querySelector('[data-s=hub-name-go]'))", '确认昵称');
    await run(c.tab, `document.querySelector('[data-hub-field=name]').value = ${JSON.stringify(name + '昵称')}`);
    await click(c.tab, '[data-s=hub-name-go]');
    await until(c.tab, 'Boolean(window.room.worldSession.canAct)', '入场');
    return sessionId(c.tab);
  };
  const alice = await client();
  const first = await enterPlaza(alice, 'alice');
  await shot(alice, 'plaza');
  assert.equal(await run(alice.tab, "document.querySelector('.rk-sheet').classList.contains('on')"), false, '入场后面板应收起');
  assert.equal(await run(alice.tab, "document.querySelector('.rk-world-chip b').textContent"), '星光广场');
  assert.equal(await run(alice.tab, 'window.room.town.identity.characters[0].name'), 'alice昵称');
  const bobby = await client(390, 720);
  assert.equal(await enterPlaza(bobby, 'bobby'), first, '第二位玩家应进入同一场');
  await until(alice.tab, 'window.room.worldSession.state.participants.filter(p => p.online).length === 2', '两人同场');
  await shot(bobby, 'plaza-narrow');
  assert.equal(await run(bobby.tab, "Boolean(document.querySelector('.rk-compact'))"), true, '390px 应使用紧凑布局');
  assert.equal(await run(bobby.tab, "document.querySelector('.rk-sheet').classList.contains('on')"), false, '窄窗口入场后面板应收起');
  const narrow = await client(390, 720);
  await open(narrow, base + '/');
  assert.ok(await run(narrow.tab, "document.querySelector('.rk-welcome').getBoundingClientRect().height / innerHeight") < 0.4, '窄窗口欢迎卡遮挡过多');

  // 朋友邀请：先看房间信息，登录后不用再粘贴
  const hostToken = 'host-token';
  store.putMember({ id: 'host', account: 'host', name: '房主', kind: 'girl' });
  store.createSession(hashToken(hostToken), 'host', Date.now() + 60_000);
  const ctx = { token: hostToken };
  const { world } = await town.api.worldPublish({ release: fixture.worldRelease }, ctx);
  const opened = town.api.worldOpen({ worldId: world.worldId }, ctx);
  const invite = town.api.inviteCreate({ sessionId: opened.sessionId }, ctx);
  const carol = await client();
  await open(carol, `${base}/invite#roomkit-invite=${invite.code}`);
  await until(carol.tab, "Boolean(document.querySelector('[data-s=hub-invite-enter]'))", '邀请卡片');
  assert.equal(await run(carol.tab, 'location.hash'), '', '邀请码应从地址栏移除');
  await shot(carol, 'invite');
  // 取消登录后邀请还在，重试不用再粘贴
  await click(carol.tab, '[data-s=hub-invite-enter]');
  await until(carol.tab, "Boolean(document.querySelector('[data-s=town-login-cancel]'))", '登录等待');
  await click(carol.tab, '[data-s=town-login-cancel]');
  await until(carol.tab, "Boolean(document.querySelector('[data-s=hub-invite-enter]'))", '取消后保留邀请');
  // 上一次轮询还没结束就重试：原目标不能被它清掉。登录窗按名字复用，等它换到新的登录页
  await delay(300);
  await click(carol.tab, '[data-s=hub-invite-enter]');
  await delay(800);
  await devLogin(carol, 'carol');
  await until(carol.tab, "Boolean(document.querySelector('[data-s=hub-name-go]'))", '邀请确认昵称');
  await click(carol.tab, '[data-s=hub-name-go]');
  await until(carol.tab, 'Boolean(window.room.worldSession.canAct)', '受邀入场');
  assert.equal(await sessionId(carol.tab), opened.sessionId);

  // 已用过的邀请在另一账号下说明原因
  const dave = await client();
  await open(dave, `${base}/invite#roomkit-invite=${invite.code}`);
  await until(dave.tab, "document.querySelector('.rk-hub-card')?.innerText.includes('已被别人使用')", '重复兑换提示');
  console.log('网页入口冒烟通过');
} finally {
  socket?.close();
  chrome?.kill();
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  store.close();
  await delay(200);
  await rm(temp, { recursive: true, force: true }).catch(() => {});
}
