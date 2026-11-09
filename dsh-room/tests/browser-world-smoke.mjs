import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createTown, serve } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { hashToken } from '../scripts/town-auth.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));
const example = process.argv.includes('--example');
const packageArg = process.argv.find(arg => arg.startsWith('--package-root='));
const previewModule = packageArg
  ? pathToFileURL(path.resolve(packageArg.slice('--package-root='.length), 'scripts/preview.mjs'))
  : new URL('../scripts/preview.mjs', import.meta.url);
const { startPreview } = await import(previewModule);
const { createLocalAgent } = await import(new URL('local-agent.mjs', previewModule));

const [courtyard] = fixture.worldRelease.packs;
courtyard.images = { beacon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
courtyard.furniture[0].art = { kind: 'sprite', src: '@beacon' };
const profile = await mkdtemp(path.join(tmpdir(), 'roomkit-browser-'));
const chromePath = process.env.ROOMKIT_CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
const closeServer = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
const store = await openStore();
let preview, townServer, chrome, socket;
try {
  for (const id of ['alice', 'bobby']) {
    store.putMember({ id, account: id, name: id, kind: 'girl' });
    store.createSession(hashToken(id), id, Date.now() + 60_000);
  }
  const town = createTown(store);
  preview = await startPreview({ port: 0, agent: createLocalAgent({ env: {} }) });
  townServer = serve(town, 0, '127.0.0.1');
  await once(townServer, 'listening');
  const address = (server) => 'http://127.0.0.1:' + server.address().port;

  chrome = spawn(chromePath, ['--headless', '--no-first-run', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let launchError;
  chrome.once('error', (error) => { launchError = error; });
  let endpoint = '';
  for (let i = 0; i < 100 && !endpoint; i++) {
    if (launchError || chrome.exitCode != null) throw launchError || new Error('Chrome 启动失败');
    endpoint = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    if (!endpoint) await delay(100);
  }
  assert.ok(endpoint, 'Chrome 调试入口未启动');
  const [port, target] = endpoint.trim().split('\n');
  socket = new WebSocket(`ws://127.0.0.1:${port}${target}`);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  function cdp(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' 超时')); }, 12000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async function newClient() {
    const { browserContextId } = await cdp('Target.createBrowserContext');
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId: tab } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    return tab;
  }
  async function run(tab, fn, input) {
    const result = await cdp('Runtime.evaluate', { expression: '(' + fn.toString() + ')(' + JSON.stringify(input) + ')', awaitPromise: true, returnByValue: true }, tab);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function open(tab, token) {
    await cdp('Page.navigate', { url: address(preview) + (example ? '/example.html' : '/?rig=0') }, tab);
    return run(tab, async ({ url, token, example }) => {
      for (let i = 0; i < 120 && !window.room?.world; i++) await new Promise((resolve) => setTimeout(resolve, 50));
      const app = window.room;
      if (!app?.world) throw new Error(document.body.innerText);
      if (example) {
        const model = await app.worldSession.agent.refresh();
        const themed = performance.getEntriesByType('resource').some(({ name }) => /\/(vendor\/|packs\/default\/)/.test(name));
        if (app.world.scene.id !== 'example-courtyard' || themed || window.RoomKitRig || app.characters.size || model.available) {
          throw new Error('中性示例加载了专用内容或模型');
        }
      }
      Object.assign(app.town, { url, token, char: token, cfg: { legacy: false }, account: { id: token }, online: true });
      app.shell.open('social');
      return { id: app.world.scene.id, actor: app.mainAgent()?.id };
    }, { url: address(townServer), token, example });
  }
  const a = await newClient();
  const b = await newClient();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 720, deviceScaleFactor: 1, mobile: false }, b);
  await open(a, 'alice');
  const homeB = await open(b, 'bobby');
  const created = await run(a, async ({ scene, packs, activity, example }) => {
    const app = window.room;
    if (!example) {
      await app.installPack(packs[0]);
      app.openScene({ ...scene, id: 'test-courtyard', agents: app.world.toJSON().agents }, { followers: [] });
    }
    const home = { id: app.world.scene.id, actor: app.mainAgent()?.id };
    const find = (query) => app.root.querySelector(query);
    const click = (action) => find('[data-s="world-' + action + '"]').click();
    const wait = async (check, label) => {
      for (let i = 0; i < 140 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 25));
      if (!check()) throw new Error(label + '：' + app.root.querySelector('.rk-flash')?.textContent);
    };
    click('toggle');
    await wait(() => find('[data-world-field="activity"]'), '世界面板');
    find('[data-world-field="activity"]').checked = true;
    activity.beaconIds.forEach((id, i) => { find('[data-world-field="beacon' + i + '"]').value = id; });
    find('[data-world-field="exit"]').value = activity.exitId;
    click('save');
    await wait(() => app.shell.worldPanel.draftTitle, '保存草稿');
    click('publish');
    await wait(() => find('[data-s="world-open"]'), '发布');
    click('open');
    await wait(() => app.worldSession.connected, '开场');
    click('invite');
    await wait(() => find('[aria-label="邀请链接"]'), '生成邀请');
    return { home, invite: find('[aria-label="邀请链接"]').value };
  }, { ...fixture.worldRelease, example });
  const homeA = created.home;
  const invitation = new URL(created.invite);
  assert.equal(invitation.search, '');
  assert.match(invitation.hash, /^#roomkit-invite=/);
  assert.equal((await fetch(invitation.href)).status, 200);
  const guest = await run(b, async ({ invite, example }) => {
    const app = window.room;
    app.root.querySelector('[data-s="world-toggle"]').click();
    const input = app.root.querySelector('[data-world-field="invite"]');
    input.value = invite;
    app.root.querySelector('[data-s="world-join"]').click();
    for (let i = 0; i < 140 && !app.worldSession.connected; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (!app.worldSession.connected) throw new Error('访客加入失败：' + app.root.querySelector('.rk-flash')?.textContent);
    const panel = app.root.querySelector('.rk-world-panel');
    const layout = { compact: app.compact, fits: panel.scrollWidth <= panel.clientWidth + 2 };
    const art = app.world.def(app.world.byId.get('beacon-west')).art;
    if (example) return { ...layout, art: art.kind };
    const image = new Image();
    image.src = art.src;
    await image.decode();
    return { ...layout, spriteWidth: image.naturalWidth };
  }, { invite: created.invite, example });
  assert.deepEqual(guest, { compact: true, fits: true, ...(example ? { art: 'proc' } : { spriteWidth: 1 }) });
  const ready = await run(a, async () => {
    const app = window.room;
    for (let i = 0; i < 100 && app.worldSession.state.participants.filter(({ online }) => online).length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    let denied;
    try { await app.worldSession.command('interact', { objectId: 'beacon-west' }); }
    catch (error) { denied = error.code; }
    const direct = app.world.apply({ t: 'state', id: 'beacon-west', patch: { on: true } });
    return { count: app.agents.size, brains: app.brains.size, denied, direct, lit: app.world.byId.get('beacon-west').state.on };
  });
  assert.deepEqual(ready, { count: 2, brains: 0, denied: 'too_far', direct: null, lit: false });
  await run(a, async () => {
    const app = window.room;
    const remove = () => app.root.querySelector('[data-s="world-say-remove"]');
    app.root.querySelector('.rk-world-say').value = '验收发言';
    app.root.querySelector('[data-s="world-say"]').click();
    for (let i = 0; i < 100 && !remove(); i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (!remove()) throw new Error('未能发送发言');
    remove().click();
    for (let i = 0; i < 100 && remove(); i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (remove()) throw new Error('未能撤回发言');
  });
  await run(a, () => window.room.worldSession.command('move', { x: 0.5, y: 1.5 }));
  await run(b, async () => {
    const session = window.room.worldSession;
    for (let i = 0; i < 120 && session.state.participants.find(({ characterId }) => characterId === 'alice')?.x !== 0.5; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (session.state.participants.find(({ characterId }) => characterId === 'alice')?.x !== 0.5) throw new Error('第二端没有收到移动');
  });
  await run(a, () => { window.room.worldSession.source.onerror(); });
  await run(b, () => window.room.worldSession.command('move', { x: 2.5, y: 1.5 }));
  const recovered = await run(a, async () => {
    const session = window.room.worldSession;
    for (let i = 0; i < 120 && !session.connected; i++) await new Promise((resolve) => setTimeout(resolve, 40));
    return { online: session.connected, seq: session.state.seq, guest: session.state.participants.find(({ characterId }) => characterId === 'bobby').y };
  });
  assert.equal(recovered.online, true);
  assert.equal(recovered.guest, 1.5);
  async function resumeGuest() {
    await open(b, 'bobby');
    return run(b, async () => {
      const app = window.room;
      app.root.querySelector('[data-s="world-toggle"]').click();
      app.root.querySelector('[data-s="world-resume"]').click();
      for (let i = 0; i < 140 && !app.worldSession.connected; i++) await new Promise((resolve) => setTimeout(resolve, 25));
      if (!app.worldSession.connected) throw new Error('刷新后无法恢复场次');
      return app.worldSession.state.seq;
    });
  }
  assert.equal(await resumeGuest(), recovered.seq);
  await run(b, async () => {
    const app = window.room;
    app.root.querySelector('[data-s="world-control"]').click();
    for (let i = 0; i < 100 && !app.worldSession.canAct; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (!app.worldSession.canAct) throw new Error('未能接管角色');
  });
  const use = (tab, id) => run(tab, async (id) => {
    const app = window.room, s = app.worldSession;
    app.root.querySelector('[data-s="world-use"][data-id="' + id + '"]').click();
    const done = () => s.state.activity.contributions.some(({ beaconId }) => beaconId === id) || s.state.activity.completion?.exitId === id;
    for (let i = 0; i < 100 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 25));
    if (!done()) throw new Error('未能使用 ' + id + '：' + s.error);
  }, id);
  await use(a, 'beacon-west');
  if (example) {
    await use(b, 'beacon-center');
  } else {
    await run(b, async () => {
      const app = window.room, session = app.worldSession;
      session.agent.transport = {
        describeCapabilities: () => ({ available: true, name: '确定性测试模型' }),
        async generate(request) {
          if (!request.data.objects.some(({ id }) => id === 'beacon-center')) throw new Error('模型没有收到物件观察');
          return JSON.stringify({ op: 'interact', args: { objectId: 'beacon-center' } });
        },
      };
      session.changed();
      app.root.querySelector('[data-s="world-think"]').click();
      for (let i = 0; i < 100 && !session.state.activity.contributions.some(({ beaconId }) => beaconId === 'beacon-center'); i++) await new Promise((resolve) => setTimeout(resolve, 25));
      if (!session.state.activity.contributions.some(({ beaconId }) => beaconId === 'beacon-center')) throw new Error('测试模型动作未提交');
    });
  }
  await use(a, 'beacon-east');
  await run(b, () => {
    const session = window.room.worldSession;
    const accept = session.accept.bind(session);
    session.accept = (events, sync) => accept(events.filter(({ type }) => type !== 'activity.completed'), sync);
  });
  await use(a, 'exit');
  assert.equal(await run(a, () => {
    const s = window.room.worldSession;
    return s.experiences.list(s.localCharacterId).filter(({ outcome }) => outcome === 'completed').length;
  }), 1);
  await resumeGuest();
  const guestRecords = await run(b, async () => {
    const s = window.room.worldSession;
    const completed = () => s.experiences.list(s.localCharacterId).filter(({ outcome }) => outcome === 'completed');
    for (let i = 0; i < 100 && !completed().length; i++) await new Promise((resolve) => setTimeout(resolve, 25));
    return completed().map(({ reflection }) => reflection.status);
  });
  assert.deepEqual(guestRecords, ['fallback']);
  for (const [tab, home] of [[a, homeA], [b, homeB]]) {
    assert.deepEqual(await run(tab, async () => {
      const app = window.room;
      app.root.querySelector('[data-s="world-leave"]').click();
      for (let i = 0; i < 100 && app.worldSession.id; i++) await new Promise((resolve) => setTimeout(resolve, 25));
      return { id: app.world.scene.id, actor: app.mainAgent()?.id };
    }), home);
  }
  process.stdout.write(example
    ? '中性示例双身份闭环通过，使用程序绘制道具和手动操作完成发布、邀请、合作、补领和回家\n'
    : '双身份 Chrome 闭环通过：保存发布、邀请、内嵌贴图、发言撤回、断线接管、确定性 AI、合作凭证、补领和回家\n');
} finally {
  socket?.close();
  if (chrome?.pid && chrome.exitCode === null) { const exited = once(chrome, 'exit'); chrome.kill('SIGTERM'); await exited; }
  if (townServer?.listening) await closeServer(townServer);
  if (preview?.listening) await closeServer(preview);
  store.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
