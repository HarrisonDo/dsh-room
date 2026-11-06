import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { Memory } = await import('../web/roomkit/memory.js');
const { systemPrompt, cleanRequest } = await import('../lib/chat.js');

test('memory counts meetings once per visit, keeps summaries, and recalls only who is here', () => {
  const m = new Memory('t1');
  const bob = { id: 'b', name: '泡泡' }, cat = { id: 'c', name: '团子' };
  let v = { met: new Set() };
  m.meet(bob, v); m.meet(bob, v);
  m.heard(bob, '今天下雨了');
  m.remember({ thread: 't', title: '下午茶', ids: ['b'], with: ['泡泡'], summary: '泡泡喜欢下雨天' });
  v = { met: new Set() }; m.meet(bob, v);
  assert.equal(m.data.people.b.met, 2);
  const r = m.recall([bob], 'other');
  assert.match(r, /泡泡：见过 2 次/);
  assert.match(r, /泡泡喜欢下雨天/);
  assert.equal(m.recall([cat], 'other'), '');
  assert.equal(new Memory('t1').stats().people, 1);           // 落在本机存储里
  m.forget('b'); assert.equal(m.stats().people, 0);
});

test('memory goes into the prompt, capped, and is framed as her own', () => {
  const sys = systemPrompt(cleanRequest({ text: 'hi', thread: '下午茶', memory: '泡泡：见过 2 次'.repeat(100) }));
  assert.match(sys, /你记得的事/);
  assert.ok(cleanRequest({ text: 'hi', memory: 'x'.repeat(2000) }).memory.length === 600);
  assert.doesNotMatch(systemPrompt(cleanRequest({ text: 'hi' })), /你记得的事/);
});
