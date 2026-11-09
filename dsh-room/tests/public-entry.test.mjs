import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createTown, serve, webSite } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { hashToken } from '../scripts/town-auth.mjs';

const { worldRelease } = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));

function seed(store, id) {
  store.putMember({ id, account: id, name: id, kind: 'girl' });
  store.createSession(hashToken(id), id, Date.now() + 60_000);
  return { token: id };
}

async function plaza(t, { listing = {}, ...options } = {}) {
  const store = await openStore();
  t.after(() => store.close());
  const town = createTown(store, { owner: 'alice', ...options });
  await town.worlds.seedPublicWorld({ worldId: 'plaza', owner: 'system:roomkit', release: worldRelease, listing: { summary: '广场', seats: 2, maxSessions: 1, ...listing } });
  return { store, town, api: town.api, seed: (id) => seed(store, id) };
}

const fails = (fn, code, reason) => assert.throws(fn, (e) => e.code === code && (!reason || e.reason === reason), `应返回 ${code} ${reason || ''}`);

test('公共目录只列运营方开放的固定版本，私人世界查不到', async (t) => {
  const { api, seed: account } = await plaza(t);
  const alice = account('alice');
  const { world } = await api.worldPublish({ release: worldRelease }, alice);
  const { worlds, nextOffset, open } = api.publicWorldList({}, {});
  assert.deepEqual(worlds.map((w) => w.worldId), ['plaza']);
  assert.equal(nextOffset, null);
  assert.equal(open, true);
  assert.equal(worlds[0].status, 'open');
  assert.equal(worlds[0].release, undefined);
  fails(() => api.publicWorldGet({ worldId: world.worldId }, {}), 404, 'not_listed');
  assert.equal(api.publicWorldGet({ worldId: 'plaza' }, {}).release.worldId, 'plaza');
  fails(() => api.publicWorldList({ limit: 51 }, {}), 400);
});

test('公共入场需要登录，重复进入回到同一场，满员如实拒绝', async (t) => {
  const { api, seed: account } = await plaza(t);
  const alice = account('alice'), bobby = account('bobby'), carol = account('carol');
  assert.throws(() => api.publicWorldEnter({ worldId: 'plaza' }, {}));
  fails(() => api.publicWorldEnter({ worldId: 'private', me: 'alice' }, alice), 404, 'not_listed');
  const first = api.publicWorldEnter({ worldId: 'plaza', me: 'alice' }, alice);
  assert.equal(api.publicWorldEnter({ worldId: 'plaza', me: 'alice' }, alice).sessionId, first.sessionId);
  api.worldJoin({ sessionId: first.sessionId, me: 'alice' }, alice);
  assert.equal(api.publicWorldEnter({ worldId: 'plaza', me: 'bobby' }, bobby).sessionId, first.sessionId);
  api.worldJoin({ sessionId: first.sessionId, me: 'bobby' }, bobby);
  assert.equal(api.publicWorldList({}, {}).worlds[0].status, 'full');
  fails(() => api.publicWorldEnter({ worldId: 'plaza', me: 'carol' }, carol), 429, 'room_full');
  assert.equal(api.publicWorldEnter({ worldId: 'plaza', me: 'alice' }, alice).sessionId, first.sessionId, '在场的人刷新后仍回到原场');
});

test('最后一个空位被两人同时选中时，后入座者收到满员而不是超员', async (t) => {
  const { api, seed: account } = await plaza(t);
  const alice = account('alice'), bobby = account('bobby'), carol = account('carol');
  const { sessionId } = api.publicWorldEnter({ worldId: 'plaza', me: 'alice' }, alice);
  api.worldJoin({ sessionId, me: 'alice' }, alice);
  assert.equal(api.publicWorldEnter({ worldId: 'plaza', me: 'bobby' }, bobby).sessionId, sessionId);
  assert.equal(api.publicWorldEnter({ worldId: 'plaza', me: 'carol' }, carol).sessionId, sessionId);
  api.worldJoin({ sessionId, me: 'bobby' }, bobby);
  fails(() => api.worldJoin({ sessionId, me: 'carol' }, carol), 429, 'room_full');
});

test('关闭公共入场时目录标明暂未开放，入场返回明确原因', async (t) => {
  const { api, seed: account } = await plaza(t, { publicEntry: false });
  assert.equal(api.config().open.publicWorlds, false);
  assert.equal(api.publicWorldList({}, {}).worlds[0].status, 'closed');
  fails(() => api.publicWorldEnter({ worldId: 'plaza', me: 'alice' }, account('alice')), 403, 'entry_closed');
});

test('邀请预览只读，能区分各种不可用原因', async (t) => {
  const { api, seed: account } = await plaza(t);
  const host = account('alice'), bobby = account('bobby'), carol = account('carol');
  const { world } = await api.worldPublish({ release: worldRelease }, host);
  const { sessionId } = api.worldOpen({ worldId: world.worldId }, host);
  assert.equal(api.invitePreview({ code: 'nope' }, {}).status, 'invalid');

  const invite = api.inviteCreate({ sessionId }, host);
  const preview = api.invitePreview({ code: invite.code }, carol);
  assert.equal(preview.status, 'ok');
  assert.equal(preview.world.title, worldRelease.title);
  assert.equal(api.invitePreview({ code: invite.code }, carol).status, 'ok', '预览不能兑换邀请');

  api.inviteRedeem({ code: invite.code }, bobby);
  assert.equal(api.invitePreview({ code: invite.code }, bobby).status, 'mine');
  const used = api.invitePreview({ code: invite.code }, carol);
  assert.equal(used.status, 'used');
  assert.equal(used.world, undefined);

  const revoked = api.inviteCreate({ sessionId }, host);
  api.inviteRevoke({ sessionId, inviteId: revoked.inviteId }, host);
  assert.equal(api.invitePreview({ code: revoked.code }, carol).status, 'revoked');

  api.worldKick({ sessionId, accountId: 'bobby' }, host);
  assert.equal(api.invitePreview({ code: invite.code }, bobby).status, 'removed');

  const open = api.inviteCreate({ sessionId }, host);
  api.worldEnd({ sessionId }, host);
  assert.equal(api.invitePreview({ code: open.code }, carol).status, 'ended');
});

test('过期的邀请在预览时说明已过期', async (t) => {
  const { api, seed: account } = await plaza(t, { worldLimits: { inviteTtl: 1 } });
  const host = account('alice');
  const { world } = await api.worldPublish({ release: worldRelease }, host);
  const { sessionId } = api.worldOpen({ worldId: world.worldId }, host);
  const invite = api.inviteCreate({ sessionId }, host);
  await delay(5);
  assert.equal(api.invitePreview({ code: invite.code }, {}).status, 'expired');
});

test('Web 入口只开放页面和摘要资源，接口错误不被首页接管', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'roomkit-web-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'web/assets'), { recursive: true });
  await writeFile(path.join(dir, 'secret.json'), '{}');
  await writeFile(path.join(dir, 'web/index.html'), 'INDEX');
  await writeFile(path.join(dir, 'web/guide.html'), 'GUIDE');
  await writeFile(path.join(dir, 'web/build.json'), '{}');
  await writeFile(path.join(dir, 'web/assets/app.0123456789abcdef.js'), 'hashed');
  await writeFile(path.join(dir, 'web/assets/plain.js'), 'plain');
  const store = await openStore();
  const server = serve(createTown(store, {}), 0, '127.0.0.1', { web: await webSite(path.join(dir, 'web')) });
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); server.close(); store.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p) => fetch(base + p, { redirect: 'manual' });

  for (const p of ['/', '/invite', '/home', '/worlds', '/worlds/plaza']) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    assert.equal(await res.text(), 'INDEX', p);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  }
  assert.equal(await (await get('/guide')).text(), 'GUIDE');
  const hashed = await get('/assets/app.0123456789abcdef.js');
  assert.match(hashed.headers.get('cache-control'), /immutable/);
  assert.equal((await get('/assets/plain.js')).headers.get('cache-control'), 'no-cache');

  for (const p of ['/build.json', '/index.html', '/assets/%2e%2e/%2e%2e/secret.json', '/assets/../../secret.json', '/assets/missing.js', '/.env']) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(await res.text(), /INDEX|\{\}/, p);
  }

  assert.equal(await (await get('/health')).text(), 'ok');
  const missing = await fetch(base + '/api/nope', { method: 'POST', body: '{}' });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /json/);
  assert.equal((await missing.json()).error, 'not found');
  const config = await fetch(base + '/api/config', { method: 'POST', body: '{}' });
  assert.ok(Array.isArray((await config.json()).providers));
});
