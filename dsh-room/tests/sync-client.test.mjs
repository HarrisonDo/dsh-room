import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeSyncClient } from '../web/roomkit/sync-client.js';
import { HOME_FORMAT, RESOURCE_FORMAT } from '../shared/account-resource.js';
import { connectAccountFixture, seed } from './account-fixture.mjs';

const service = 'https://one.example';
const id = 'home-1';
const alice = { token: 'alice-session' };
const home = (name, homeId = id) => ({
  format: HOME_FORMAT, schemaVersion: 1, homeId, name, floors: ['1F'], assetRefs: [],
  rooms: [{ id: 'room', name: '房间', floor: '1F', layout: { room: { w: 5, h: 4 }, objects: [] } }],
});
const open = (client, request, options = {}) => client.open({ service, accountId: 'alice', resourceId: id, request, ...options });
const transport = api => async (method, payload) => api[method](payload, alice);

function memoryStorage() {
  const records = new Map();
  return {
    get: key => records.get(key),
    compareAndSet(key, expected, value) {
      if ((records.get(key)?.revision ?? null) !== expected) return false;
      records.set(key, value);
      return true;
    },
  };
}

async function backend(t) {
  const { db, api } = connectAccountFixture(await seed(t));
  t.after(() => db.close());
  return api;
}

test('离线和已提交后丢响应都用同一请求重试，重启恢复固定队列', async t => {
  const api = await backend(t);
  const storage = memoryStorage();
  const sent = [];
  const client = createHomeSyncClient({ storage });
  const request = async (method, body) => {
    sent.push(body);
    if (sent.length === 1) throw new Error('offline');
    const result = api[method](body, alice);
    if (sent.length === 2) throw new Error('response lost');
    return result;
  };
  await open(client, request, { create: true });
  assert.equal((await client.edit(home('A'))).localSaved, true);
  await assert.rejects(client.flush(), { kind: 'request' });
  assert.equal(client.snapshot.synced, false);
  const restarted = createHomeSyncClient({ storage });
  assert.equal((await open(restarted, request)).pending.mutationId, sent[0].mutationId);
  await assert.rejects(restarted.flush(), { kind: 'request' });
  assert.equal(api.accountResourceGet({ resourceId: id }, alice).syncVersion, 1);
  assert.equal((await restarted.flush()).synced, true);
  assert.deepEqual(sent, [sent[0], sent[0], sent[0]]);
  assert.equal(api.accountResourceGet({ resourceId: id }, alice).syncVersion, 1);
});

test('在途编辑 B 留存，确认 A 后仅推进基线', async t => {
  const api = await backend(t);
  const client = createHomeSyncClient({ storage: memoryStorage() });
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const sent = [];
  await open(client, async (method, body) => {
    sent.push(body);
    if (sent.length === 1) {
      started.resolve();
      await release.promise;
    }
    return api[method](body, alice);
  }, { create: true });
  await client.edit(home('A'));
  const first = client.flush();
  await started.promise;
  await assert.rejects(client.flush(), /进行中/);
  const edited = await client.edit(home('B'));
  edited.draft.name = 'mutated outside';
  edited.pending.payload.name = 'mutated queue';
  assert.equal(client.snapshot.draft.name, 'B');
  assert.equal(client.snapshot.pending.payload.name, 'A');
  release.resolve();
  const afterA = await first;
  assert.equal(afterA.draft.name, 'B');
  assert.equal(afterA.baselineVersion, 1);
  assert.equal(afterA.synced, false);
  assert.equal((await client.flush()).synced, true);
  assert.equal(sent[1].baseVersion, 1);
  assert.equal(sent[1].payload.name, 'B');
});

test('两端冲突保留双方，可另存本地副本再采用账户版', async t => {
  const api = await backend(t);
  const a = createHomeSyncClient({ storage: memoryStorage() });
  const b = createHomeSyncClient({ storage: memoryStorage() });
  await open(a, transport(api), { create: true });
  await a.edit(home('原版'));
  await a.flush();
  await open(b, transport(api));
  await b.pull();
  await a.edit(home('账户版'));
  await b.edit(home('本机版'));
  await a.flush();
  const clash = await b.flush();
  assert.equal(clash.conflict.remote.payload.name, '账户版');
  assert.equal(clash.draft.name, '本机版');
  assert.equal(await b.forkLocalCopy('copy'), 'copy');
  assert.equal((await b.adoptRemote()).draft.name, '账户版');
  await open(b, transport(api), { resourceId: 'copy' });
  assert.equal(b.snapshot.draft.name, '本机版');
  await assert.rejects(b.flush(), /缺少账户基线/);
  assert.equal(api.accountResourceList({}, alice).resources.length, 1);
});

test('远端墓碑不能被本机旧草稿复活，旧基线 404 也不降级为新建', async t => {
  const api = await backend(t);
  const client = createHomeSyncClient({ storage: memoryStorage() });
  await open(client, transport(api), { create: true });
  await client.edit(home('初始'));
  await client.flush();
  await client.edit(home('离线修改'));
  api.accountResourceDelete({
    format: RESOURCE_FORMAT, schemaVersion: 1, kind: 'home', resourceId: id, baseVersion: 1, mutationId: '1:delete',
  }, alice);
  assert.equal((await client.flush()).conflict.remote.deleted, true);
  assert.equal(client.snapshot.draft.name, '离线修改');
  await client.forkLocalCopy('copy');
  await client.adoptRemote();
  assert.equal((await client.flush()).deleted, true);
  assert.equal(api.accountResourceGet({ resourceId: id }, alice).syncVersion, 2);

  const missing = Object.assign(new Error('missing'), { status: 404, code: 'resource_not_found' });
  const storage = memoryStorage();
  const orphan = createHomeSyncClient({ storage });
  await open(orphan, transport(api));
  await orphan.pull();
  await open(orphan, async () => { throw missing; }, { create: true });
  await assert.rejects(orphan.pull(), { kind: 'request' });
  assert.equal(orphan.snapshot.baselineVersion, 2);
  const newcomer = createHomeSyncClient({ storage: memoryStorage() });
  await open(newcomer, async () => { throw missing; });
  await assert.rejects(newcomer.pull(), { kind: 'request' });
  assert.equal(newcomer.snapshot.baselineVersion, null);
});

test('切账号或服务后忽略迟到成功和失败，持久队列仍属于原作用域', async t => {
  const api = await backend(t);
  for (const reject of [false, true]) {
    const storage = memoryStorage();
    const client = createHomeSyncClient({ storage });
    const started = Promise.withResolvers(), done = Promise.withResolvers();
    let oldSignal;
    await open(client, (method, body, { signal }) => {
      oldSignal = signal;
      started.resolve();
      return done.promise;
    }, { create: true });
    await client.edit(home('A'));
    const old = client.flush();
    await started.promise;
    await open(client, async () => { throw new Error('不能将旧队列发送至新账号'); }, {
      service: 'https://two.example', accountId: 'bob', create: true,
    });
    assert.equal(oldSignal.aborted, true);
    if (reject) done.reject(new Error('late failure'));
    else done.resolve({ resourceId: id, syncVersion: 1, deleted: false });
    assert.equal(await old, null);
    assert.equal((await client.flush()).draft, null);
    await open(client, transport(api));
    assert.equal(client.snapshot.pending.payload.name, 'A');
  }
});

test('本地保存失败不会宣称成功，写入回执校验失败保留原队列', async () => {
  const records = memoryStorage();
  let fail = false;
  const storage = { ...records, async compareAndSet(key, expected, value) {
    if (fail) throw new Error('disk full');
    return records.compareAndSet(key, expected, value);
  } };
  const client = createHomeSyncClient({ storage });
  await open(client, async () => ({ resourceId: 'other', syncVersion: 1, deleted: false }), { create: true });
  fail = true;
  await assert.rejects(client.edit(home('A')), { kind: 'storage' });
  assert.equal(client.snapshot.localSaved, false);
  fail = false;
  await client.edit(home('A'));
  fail = true;
  await assert.rejects(client.edit(home('B')), { kind: 'storage' });
  assert.equal(client.snapshot.draft.name, 'A');
  assert.equal(client.snapshot.unsavedDraft.name, 'B');
  fail = false;
  await client.forkLocalCopy('recovery');
  await assert.rejects(client.flush(), { kind: 'protocol' });
  assert.equal(client.snapshot.pending.payload.name, 'A');
  assert.equal(client.snapshot.synced, false);
});

test('同一存储的两个实例不会覆盖对方待提交记录，失败的编辑可另存', async t => {
  const api = await backend(t);
  const storage = memoryStorage();
  const a = createHomeSyncClient({ storage });
  const b = createHomeSyncClient({ storage });
  await open(a, async () => { throw new Error('offline'); }, { create: true });
  await open(b, transport(api));
  await a.edit(home('先写的草稿'));
  await assert.rejects(a.flush(), { kind: 'request' });
  const fixed = a.snapshot.pending;
  await assert.rejects(b.edit(home('另一页的修改')), { kind: 'storage_conflict' });
  assert.equal(b.snapshot.localSaved, false);
  await b.forkLocalCopy('recovery');
  await open(b, transport(api), { resourceId: 'recovery' });
  assert.equal(b.snapshot.draft.name, '另一页的修改');
  await open(b, transport(api));
  assert.equal(b.snapshot.draft.name, '先写的草稿');
  assert.deepEqual(b.snapshot.pending, fixed);
  assert.equal((await b.flush()).synced, true);
});
