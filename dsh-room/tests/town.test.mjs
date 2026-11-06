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
