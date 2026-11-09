import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { hashToken } from '../scripts/town-auth.mjs';
import { createAccountClient } from '../web/roomkit/account-client.js';
import { connectAccountFixture, seed } from './account-fixture.mjs';

test('两个连接同时初始化只创建同一个中性角色', async (t) => {
  const file = await seed(t);
  const workers = [0, 1].map(() => new Worker(new URL('./account-fixture.mjs', import.meta.url), { workerData: { file } }));
  try {
    await Promise.all(workers.map(worker => once(worker, 'message')));
    const results = workers.map(worker => once(worker, 'message'));
    for (const worker of workers) worker.postMessage('bootstrap');
    const [[first], [second]] = await Promise.all(results);
    assert.deepEqual(first, second);
    assert.equal(first.characters.length, 1);
    assert.equal(first.characters[0].name, '角色');
    const { db } = connectAccountFixture(file);
    try { assert.equal(db.prepare("SELECT count(*) AS n FROM members WHERE account = 'alice'").get().n, 1); }
    finally { db.close(); }
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
});

test('已有公开角色保持原样，跨账号选择被拒，默认角色重启后恢复', async (t) => {
  const file = await seed(t);
  const bob = { token: 'bob-session' };
  const first = connectAccountFixture(file);
  try {
    const result = first.api.accountBootstrap({ accountId: 'alice' }, bob);
    assert.equal(result.account.id, 'bob');
    assert.deepEqual(result.characters[0], { id: 'b-first', name: '已有角色', kind: 'whale', look: { body: '#abc' } });
    assert.doesNotMatch(JSON.stringify(result), /private|legacy-secret|session|token|"key"/);
    const stored = first.db.prepare("SELECT key, look FROM members WHERE id = 'b-first'").get();
    assert.equal(stored.key, 'legacy-secret');
    assert.equal(JSON.parse(stored.look).persona, 'private');
    assert.throws(() => first.api.accountSelectDefaultCharacter({ characterId: 'b-first', accountId: 'bob' }, { token: 'alice-session' }), { code: 403, reason: 'character_forbidden' });
    for (let i = 0; i < 2; i++) {
      assert.equal(first.api.accountSelectDefaultCharacter({ characterId: 'b-second' }, bob).defaultCharacterId, 'b-second');
    }
  } finally { first.db.close(); }
  const restarted = connectAccountFixture(file);
  try {
    assert.equal(restarted.api.accountBootstrap({}, bob).defaultCharacterId, 'b-second');
    restarted.db.prepare("DELETE FROM members WHERE id = 'b-second'").run();
    assert.equal(restarted.api.accountBootstrap({}, bob).defaultCharacterId, 'b-first');
  } finally { restarted.db.close(); }
});

test('过期、撤销和封禁的身份无法初始化或选择', async (t) => {
  const { db, api } = connectAccountFixture(await seed(t));
  try {
    db.prepare('INSERT INTO bans (member, kind) VALUES (?, ?)').run('bob', 'ban');
    db.prepare('DELETE FROM sessions WHERE hash = ?').run(hashToken('alice-session'));
    for (const method of ['accountBootstrap', 'accountSelectDefaultCharacter']) {
      for (const token of ['', 'expired', 'alice-session']) assert.throws(() => api[method]({}, { token }), { code: 401 });
      assert.throws(() => api[method]({}, { token: 'bob-session' }), { code: 403, reason: 'account_banned' });
    }
  } finally { db.close(); }
});

test('切号中止旧请求，迟到结果与错误均不能写入当前账号或本地存储', async () => {
  const storage = new Map();
  const client = createAccountClient({ storage });
  const response = (id) => ({
    account: { id }, characters: [{ id: 'role', key: 'secret', look: { secret: 'hidden' } }], defaultCharacterId: 'role',
  });
  for (const lateError of [false, true]) {
    const previous = Promise.withResolvers();
    let oldSignal;
    client.switchAccount({ service: 'https://one.example', accountId: 'alice', request(_method, _payload, { signal }) {
      oldSignal = signal;
      return previous.promise;
    } });
    const old = client.bootstrap();
    client.switchAccount({ service: 'https://two.example', accountId: 'bob', request: async () => response('bob') });
    assert.equal(oldSignal.aborted, true);
    assert.equal(client.snapshot, null);
    const current = await client.bootstrap();
    if (lateError) previous.reject(Object.assign(new Error('expired'), { status: 401 }));
    else previous.resolve(response('alice'));
    assert.equal(await old, null);
    assert.deepEqual(client.snapshot, current);
    assert.deepEqual(current.identity, { serviceOrigin: 'https://two.example', accountId: 'bob', characterId: 'role' });
    assert.deepEqual(current.characters[0].look, {});
    assert.equal(Object.hasOwn(current.characters[0], 'key'), false);
    assert.deepEqual([...storage], [['["https://two.example","bob"]', 'role']]);
  }
  client.clear();
  assert.equal(client.snapshot, null);
});

test('当前会话失效或封禁清除身份，角色越权选择保留身份', async () => {
  for (const denial of [{ status: 401 }, { status: 403, code: 'account_banned' }, { status: 403, code: 'character_forbidden' }]) {
    const client = createAccountClient();
    client.switchAccount({ service: 'https://one.example', accountId: 'alice', request: async (method) => {
      if (method === 'accountSelectDefaultCharacter') throw Object.assign(new Error('denied'), denial);
      return { account: { id: 'alice' }, characters: [{ id: 'role' }], defaultCharacterId: 'role' };
    } });
    const before = await client.bootstrap();
    await assert.rejects(client.selectDefaultCharacter('other'), denial);
    assert.deepEqual(client.snapshot, denial.code === 'character_forbidden' ? before : null);
  }
});
