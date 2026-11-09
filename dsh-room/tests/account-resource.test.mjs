import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { connectAccountFixture, seed } from './account-fixture.mjs';
import { HOME_FORMAT, RESOURCE_FORMAT, projectAccountHome } from '../shared/account-resource.js';

const alice = { token: 'alice-session' };
const bob = { token: 'bob-session' };
const home = (name = '我的家') => ({
  format: HOME_FORMAT, schemaVersion: 1, homeId: 'home-1', name, floors: ['1F'], assetRefs: [],
  rooms: ['study', 'hall'].map(id => ({ id, name: id, floor: '1F', layout: { room: { w: 6, h: 4 }, objects: [] } })),
});
const mutation = (version, suffix, snapshot) => ({
  format: RESOURCE_FORMAT, schemaVersion: 1, kind: 'home', resourceId: 'home-1',
  baseVersion: version, mutationId: version + ':' + suffix, ...(snapshot ? { payload: snapshot } : {}),
});
const ref = { resourceId: 'home-1' };
const result = (syncVersion, deleted = false) => ({ ...ref, syncVersion, deleted });

test('两端同时条件更新只提交一次，同请求重试拿原回执', async t => {
  const file = await seed(t);
  const { db, api } = connectAccountFixture(file);
  t.after(() => db.close());
  const original = mutation(0, 'new', home());
  assert.deepEqual(api.accountResourcePut(original, alice), result(1));
  const changes = [mutation(1, 'a', home('A')), mutation(1, 'b', home('B'))];
  const workers = changes.map(payload => new Worker(new URL('./account-fixture.mjs', import.meta.url), { workerData: { file, payload } }));
  try {
    await Promise.all(workers.map(worker => once(worker, 'message')));
    const pending = workers.map(worker => once(worker, 'message'));
    workers.forEach(worker => worker.postMessage('put'));
    const replies = (await Promise.all(pending)).flat();
    assert.equal(replies.filter(reply => reply.syncVersion === 2).length, 1);
    assert.equal(replies.filter(reply => reply.reason === 'version_conflict').length, 1);
    const winner = changes[replies.findIndex(reply => reply.syncVersion === 2)];
    assert.deepEqual(api.accountResourcePut(winner, alice), result(2));
    assert.deepEqual(api.accountResourcePut(original, alice), result(1));
    assert.throws(() => api.accountResourcePut({ ...winner, payload: home('改了请求') }, alice), { reason: 'mutation_reused' });
    assert.equal(api.accountResourceGet(ref, alice).payload.name, winner.payload.name);
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
});

test('账号隔离、墓碑与恢复、过期回执均保持版本约束', async t => {
  const { db, api } = connectAccountFixture(await seed(t));
  t.after(() => db.close());
  const original = mutation(0, 'new', home());
  api.accountResourcePut(original, alice);
  assert.deepEqual(api.accountResourceList({}, bob), { resources: [] });
  for (const [method, payload] of [
    ['accountResourceGet', ref], ['accountResourcePut', mutation(1, 'other', home())],
    ['accountResourceDelete', mutation(1, 'other')], ['accountResourceRestore', mutation(1, 'other')],
  ]) assert.throws(() => api[method](payload, bob), { code: 404, reason: 'resource_not_found' });
  assert.deepEqual(api.accountResourcePut(original, bob), result(1));
  const deletion = mutation(1, 'delete');
  assert.deepEqual(api.accountResourceDelete(deletion, alice), result(2, true));
  assert.deepEqual(api.accountResourceGet(ref, alice), result(2, true));
  assert.throws(() => api.accountResourcePut(mutation(1, 'stale', home()), alice), { reason: 'version_conflict' });
  assert.throws(() => api.accountResourcePut(mutation(2, 'revive', home()), alice), { reason: 'resource_state_conflict' });
  const restore = mutation(2, 'restore');
  assert.deepEqual(api.accountResourceRestore(restore, alice), result(3));
  assert.deepEqual(api.accountResourceRestore(restore, alice), result(3));
  assert.deepEqual(api.accountResourceDelete(deletion, alice), result(2, true));
  assert.equal(api.accountResourceGet(ref, alice).payload.name, '我的家');
  for (let version = 3; version < 66; version++) api.accountResourcePut(mutation(version, 'next', home()), alice);
  assert.throws(() => api.accountResourcePut(original, alice), { reason: 'mutation_expired' });
  assert.equal(api.accountResourceGet(ref, alice).syncVersion, 66);
  assert.equal(db.prepare("SELECT count(*) AS n FROM account_mutations WHERE account_id = 'alice'").get().n, 64);
});

test('旧默认角色迁移可重入，门和布局重启后保持', async t => {
  const file = await seed(t);
  const town = await import('node:sqlite');
  const previous = new town.DatabaseSync(file);
  previous.exec("CREATE TABLE account_defaults (account_id TEXT PRIMARY KEY, character_id TEXT NOT NULL); INSERT INTO account_defaults VALUES ('bob','b-second');");
  previous.close();
  const snapshot = home();
  snapshot.rooms[0].layout.objects.push({ id: 'door1', def: 'door', wall: 'left', at: 2, z: 0, state: { to: 'hall' } });
  snapshot.assetRefs.push({ def: 'door', assetId: 'builtins', version: '1.0.0', hash: 'a'.repeat(64) });
  const approve = ({ accountId, home }) => accountId === 'alice' && home.assetRefs[0].def === 'door';
  const first = connectAccountFixture(file, approve);
  try { assert.deepEqual(first.api.accountResourcePut(mutation(0, 'new', snapshot), alice), result(1)); }
  finally { first.db.close(); }
  const restarted = connectAccountFixture(file);
  t.after(() => restarted.db.close());
  assert.equal(restarted.api.accountResourceGet(ref, alice).payload.rooms[0].layout.objects[0].state.to, 'hall');
  assert.equal(restarted.api.accountBootstrap({}, bob).defaultCharacterId, 'b-second');
  assert.deepEqual(restarted.db.prepare('SELECT version FROM account_schema_migrations ORDER BY version').all().map(row => row.version), [1, 2]);
});

test('拒绝私密字段、缺少布局和素材无权，投影保留门连接', async t => {
  const file = await seed(t);
  let allowed = false;
  const checked = connectAccountFixture(file, () => allowed);
  t.after(() => checked.db.close());
  const { api } = checked;
  for (const privateFields of [{ agents: [{ persona: 'secret' }] }, { memory: 'secret' }, { modelKey: 'secret' }]) {
    assert.throws(() => api.accountResourcePut(mutation(0, 'private', { ...home(), ...privateFields }), alice), { reason: 'invalid_resource' });
  }
  const snapshot = home();
  const scenes = new Map(snapshot.rooms.map(({ id, layout }) => [id, { ...layout, id, v: 2, format: 'roomkit.scene', agents: [{ persona: 'private' }] }]));
  scenes.get('study').objects.push({ id: 'door1', def: 'door', wall: 'left', at: 2, state: { to: 'hall' } });
  const assets = [{ def: 'door', assetId: 'builtins', version: '1.0.0', hash: 'a'.repeat(64) }];
  const input = { homeId: snapshot.homeId, home: snapshot, sceneFor: id => scenes.get(id), assetRefs: assets };
  const projected = projectAccountHome(input);
  assert.equal(projected.rooms[0].layout.objects[0].state.to, 'hall');
  assert.doesNotMatch(JSON.stringify(projected), /private|agents/);
  assert.throws(() => projectAccountHome({ ...input, sceneFor: () => null }), { reason: 'invalid_resource' });
  assert.throws(() => api.accountResourcePut(mutation(0, 'missing', { ...projected, assetRefs: [] }), alice), { reason: 'missing_asset' });
  assert.throws(() => api.accountResourcePut(mutation(0, 'denied', projected), alice), { reason: 'missing_asset' });
  const unsupported = connectAccountFixture(file);
  try { assert.throws(() => unsupported.api.accountResourcePut(mutation(0, 'unsupported', projected), alice), { reason: 'unsupported' }); }
  finally { unsupported.db.close(); }
  assert.deepEqual(api.accountResourceList({}, alice), { resources: [] });
  allowed = true;
  api.accountResourcePut(mutation(0, 'allowed', projected), alice);
  api.accountResourceDelete(mutation(1, 'delete'), alice);
  allowed = false;
  assert.throws(() => api.accountResourceRestore(mutation(2, 'restore'), alice), { reason: 'missing_asset' });
  assert.deepEqual(api.accountResourceGet(ref, alice), result(2, true));
});

test('默认客厅换色和家具显示状态、导入包房间和门均可保存读回', async t => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const { validatePack } = await import('../web/roomkit/packs.js');
  const window = {};
  runInNewContext(await readFile(new URL('../web/packs/default/pack.js', import.meta.url), 'utf8'), { window });
  const pack = JSON.parse(JSON.stringify(window.RoomKitPacks[0]));
  const imported = validatePack({
    format: 'roomkit.pack', v: 1, id: 'garden',
    scenes: [{ id: '茶室', name: '茶室', format: 'roomkit.scene', v: 2, room: { w: 5, h: 4 }, objects: [] }],
  });
  assert.equal(imported.ok, true);
  const [tea] = imported.pack.scenes;
  assert.equal(tea.id, 'garden/茶室');
  const scenes = new Map([...pack.scenes, tea].map(scene => [scene.id, scene]));
  const living = scenes.get('living');
  living.objects.find(o => o.id === 'door2').state.to = tea.id;
  const defs = new Map(pack.furniture.map(def => [def.id, def]));
  const poster = living.objects.find(o => o.id === 'poster1');
  poster.state = defs.get(poster.def).states;
  const working = pack.furniture.find(def => Object.hasOwn(def.states ?? {}, 'working'));
  living.objects.push({ id: 'work-display', def: working.id, x: 0, y: 2, state: { ...working.states, working: true } });
  const assetRefs = [...new Set([...scenes.values()].flatMap(scene => scene.objects.map(o => o.def)))]
    .map(def => ({ def, assetId: 'default', version: '1.0.0', hash: 'a'.repeat(64) }));
  const payload = projectAccountHome({
    homeId: 'home-1', sceneFor: id => scenes.get(id), assetRefs,
    home: { name: '示例', floors: ['1F'], rooms: [...scenes.values()].map(({ id, name }) => ({ id, name, floor: '1F' })) },
  });
  const { db, api } = connectAccountFixture(await seed(t), ({ home }) => home.assetRefs.every(ref => defs.has(ref.def)));
  t.after(() => db.close());
  assert.deepEqual(api.accountResourcePut(mutation(0, 'real', payload), alice), result(1));
  const stored = api.accountResourceGet(ref, alice).payload;
  const objects = stored.rooms.find(r => r.id === 'living').layout.objects;
  assert.deepEqual(objects.find(o => o.id === 'bean2').colors, { main: '#9fc8f0' });
  assert.equal(objects.find(o => o.id === 'bean2').variant, 0);
  assert.equal(objects.find(o => o.id === 'poster1').state.text, 'DeepSeek');
  assert.equal(objects.find(o => o.id === 'work-display').state.working, true);
  assert.equal(objects.find(o => o.id === 'door2').state.to, 'garden/茶室');
  for (const patch of [{ colors: { main: 'url(https://example.com/img)' } }, { variant: 8 }, { state: { text: { secret: 'bad' } } }]) {
    const bad = structuredClone(payload);
    Object.assign(bad.rooms.find(r => r.id === 'living').layout.objects.find(o => o.id === 'bean2'), patch);
    assert.throws(() => api.accountResourcePut(mutation(1, 'bad', bad), alice), { reason: 'invalid_resource' });
  }
});

test('快照能力与同步能力分开，32 家额度包含墓碑', async t => {
  const file = await seed(t);
  const { db, api } = connectAccountFixture(file);
  t.after(() => db.close());
  const capabilities = api.accountBootstrap({}, alice).capabilities;
  assert.deepEqual(capabilities, {
    identity: true, defaultCharacter: true, homeSnapshots: true, assetValidation: false, resourceSync: false, deviceSessions: false,
  });
  const wired = connectAccountFixture(file, () => false);
  try {
    const client = (await import('../web/roomkit/account-client.js')).createAccountClient();
    client.switchAccount({ service: 'https://example.com', accountId: 'alice', request: async method => wired.api[method]({}, alice) });
    assert.deepEqual((await client.bootstrap()).capabilities, { ...capabilities, assetValidation: true });
  } finally { wired.db.close(); }
  const create = id => ({ ...mutation(0, 'create', { ...home(), homeId: id }), resourceId: id });
  for (let i = 1; i <= 32; i++) api.accountResourcePut(create('home-' + i), alice);
  assert.throws(() => api.accountResourcePut(create('home-33'), alice), { reason: 'resource_quota' });
  api.accountResourceDelete(mutation(1, 'delete'), alice);
  assert.throws(() => api.accountResourcePut(create('home-33'), alice), { reason: 'resource_quota' });
  const { resources } = api.accountResourceList({}, alice);
  assert.equal(resources.length, 32);
  assert.equal(resources.find(resource => resource.resourceId === 'home-1').deleted, true);
  assert.deepEqual(api.accountResourceRestore(mutation(2, 'restore'), alice), result(3));
});
