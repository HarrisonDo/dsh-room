import test from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from '../scripts/town.mjs';

const KEY = 'k'.repeat(16);
const scene = { format: 'roomkit.scene', id: 'home', agents: [{ id: 'x' }] };

test('identity binds id to key', () => {
  const t = createTown();
  t.api.hello({ me: 'alice', key: KEY, name: '大肥鱼' });
  assert.throws(() => t.api.hello({ me: 'alice', key: 'z'.repeat(16) }), /绑定/);
  assert.throws(() => t.api.post({ me: 'alice', key: 'z'.repeat(16), thread: 'plaza', text: 'hi' }), /身份/);
});

test('threads carry a scene without agents; posts need presence and are cleaned', () => {
  const t = createTown();
  t.api.hello({ me: 'alice', key: KEY, name: '大肥鱼' });
  const { thread } = t.api.create({ me: 'alice', key: KEY, title: '下午茶', scene });
  assert.deepEqual(t.api.get({ thread: thread.id }).thread.scene.agents, []);
  assert.throws(() => t.api.post({ me: 'alice', key: KEY, thread: thread.id, text: 'hi' }), /先进入/);
  t.api.join({ me: 'alice', key: KEY, thread: thread.id });
  const { post } = t.api.post({ me: 'alice', key: KEY, thread: thread.id, text: 'x'.repeat(500), acts: ['wave', 'rm -rf', 'goto:沙发', 'dance'] });
  assert.equal(post.text.length, 200);
  assert.deepEqual(post.acts, ['wave', 'goto:沙发']);
  assert.equal(post.by.key, undefined);
});

test('joining one thread leaves the others; posting is rate limited', () => {
  const t = createTown();
  t.api.hello({ me: 'alice', key: KEY });
  const { thread } = t.api.create({ me: 'alice', key: KEY, scene });
  t.api.join({ me: 'alice', key: KEY, thread: 'plaza' });
  t.api.join({ me: 'alice', key: KEY, thread: thread.id });
  assert.equal(t.api.get({ thread: 'plaza' }).thread.here.length, 0);
  for (let i = 0; i < 12; i++) t.api.post({ me: 'alice', key: KEY, thread: thread.id, text: 'hi' + i });
  assert.throws(() => t.api.post({ me: 'alice', key: KEY, thread: thread.id, text: 'more' }), /太快/);
});

test('sqlite store keeps threads and posts across restarts', async () => {
  const { sqliteStore } = await import('../scripts/town-store.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/town-');
  try {
    let t = createTown(await sqliteStore(dir + '/t.db'));
    t.api.hello({ me: 'alice', key: KEY, name: '大肥鱼', look: { body: '#fff' } });
    const { thread } = t.api.create({ me: 'alice', key: KEY, title: '下午茶', scene });
    t.api.join({ me: 'alice', key: KEY, thread: thread.id });
    for (let i = 0; i < 3; i++) t.api.post({ me: 'alice', key: KEY, thread: thread.id, text: 'hi' + i, acts: ['wave'], human: i === 0 });
    t.store.close();

    t = createTown(await sqliteStore(dir + '/t.db'));
    const got = t.api.get({ thread: thread.id }).thread;
    assert.equal(got.title, '下午茶');
    assert.equal(got.posts.length, 3);
    assert.deepEqual(got.posts.map((p) => p.text), ['hi0', 'hi1', 'hi2']);
    assert.deepEqual(got.posts[0].acts, ['wave']);
    assert.equal(got.posts[0].human, true);
    assert.equal(got.posts[0].by.name, '大肥鱼');
    assert.equal(got.here.length, 0);                       // 在场不入库：重启后大家都不在了
    assert.equal(t.api.threads().threads.find((x) => x.id === thread.id).posts, 3);
    assert.throws(() => t.api.hello({ me: 'alice', key: 'z'.repeat(16) }), /绑定/);   // 绑定也在库里
    t.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
