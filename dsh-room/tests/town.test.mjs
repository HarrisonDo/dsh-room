import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createTown, LIMIT } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { createModerator, parseWords, localCheck } from '../scripts/town-moderation.mjs';

const KEY = 'k'.repeat(16);
const scene = { format: 'roomkit.scene', v: 2, id: 'home', room: { w: 8, h: 6 }, objects: [], agents: [{ id: 'x' }] };
const as = (me) => ({ me, key: KEY + me });
const words = parseWords('坏词\nreview:可疑\n# 注释\n');

async function town(opts = {}) {
  const t = createTown(await openStore(), Object.assign({ moderator: createModerator({ words }) }, opts));
  for (const me of ['alice', 'bobby', 'carol', 'dave1', 'erin1']) await t.api.hello(Object.assign({ name: me }, as(me)));
  return t;
}
async function threadWith(t, who) {
  const { thread } = await t.api.create(Object.assign({ title: '下午茶', scene }, as('alice')));
  for (const me of who) t.api.join(Object.assign({ thread: thread.id }, as(me)));
  return thread.id;
}

test('identity binds id to key', async () => {
  const t = await town();
  await assert.rejects(t.api.hello({ me: 'alice', key: 'z'.repeat(16) }), /绑定/);
  await assert.rejects(t.api.post({ me: 'alice', key: 'z'.repeat(16), thread: 'plaza', text: 'hi' }), /身份/);
});

test('threads carry a scene without agents; posts need presence and are cleaned', async () => {
  const t = await town();
  const id = (await t.api.create(Object.assign({ title: '下午茶', scene }, as('alice')))).thread.id;
  assert.deepEqual(t.api.get({ thread: id }).thread.scene.agents, []);
  await assert.rejects(t.api.post(Object.assign({ thread: id, text: 'hi' }, as('alice'))), /先进入/);
  t.api.join(Object.assign({ thread: id }, as('alice')));
  const { post } = await t.api.post(Object.assign({ thread: id, text: 'x'.repeat(500), acts: ['wave', 'rm -rf', 'goto:沙发', 'dance'] }, as('alice')));
  assert.equal(post.text.length, 200);
  assert.deepEqual(post.acts, ['wave', 'goto:沙发']);
  assert.equal(post.by.key, undefined);
});

test('joining one thread leaves the others; posting is rate limited', async () => {
  const t = await town();
  const id = await threadWith(t, []);
  t.api.join(Object.assign({ thread: 'plaza' }, as('alice')));
  t.api.join(Object.assign({ thread: id }, as('alice')));
  assert.equal(t.api.get({ thread: 'plaza' }).thread.here.length, 0);
  for (let i = 0; i < 12; i++) await t.api.post(Object.assign({ thread: id, text: 'hi' + i }, as('alice')));
  await assert.rejects(t.api.post(Object.assign({ thread: id, text: 'more' }, as('alice'))), /太快/);
});

test('thread pagination and transactional quota use the full visible count', async (ctx) => {
  const t = await town();
  ctx.after(() => t.store.close());
  const now = Date.now();
  t.store.transaction(() => {
    for (let i = 0; i < LIMIT.threads - 2; i++) t.store.putThread({ id: `seed-${i}`, owner: 'bobby', title: `Seed ${i}`, scene, t: now + i });
  });
  const first = t.api.threads({ sort: 'new', limit: 3 });
  const second = t.api.threads({ sort: 'new', limit: 3, offset: first.nextOffset });
  assert.equal(first.nextOffset, 3);
  assert.equal(new Set([...first.threads, ...second.threads].map(({ id }) => id)).size, 6);
  assert.equal(t.store.threads()[0].scene, undefined);
  await assert.rejects(t.api.create({ ...as('alice'), scene: { ...scene, objects: {} } }), /objects/);

  const outcomes = await Promise.allSettled([1, 2].map((n) => t.api.create({ ...as('alice'), title: `房间 ${n}`, scene })));
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(({ status }) => status === 'rejected').reason.code, 429);
  assert.equal(t.store.threadCount(), LIMIT.threads);

  const { thread } = outcomes.find(({ status }) => status === 'fulfilled').value;
  let broadcasts = 0;
  t.clients.add({ res: { writable: true, writableLength: 0, write() { broadcasts++; return true; } } });
  t.api.join({ ...as('alice'), thread: thread.id });
  assert.ok(broadcasts > 0);
  const afterJoin = broadcasts;
  t.api.join({ ...as('alice'), thread: thread.id });
  assert.equal(broadcasts, afterJoin);
});

test('sqlite store keeps threads, posts and bindings across restarts', async () => {
  const dir = mkdtempSync(tmpdir() + '/town-');
  try {
    let t = createTown(await openStore(dir + '/t.db'));
    await t.api.hello(Object.assign({ name: '大肥鱼', look: { body: '#fff' } }, as('alice')));
    const { thread } = await t.api.create(Object.assign({ title: '下午茶', scene }, as('alice')));
    t.api.join(Object.assign({ thread: thread.id }, as('alice')));
    for (let i = 0; i < 3; i++) await t.api.post(Object.assign({ thread: thread.id, text: 'hi' + i, acts: ['wave'], human: i === 0 }, as('alice')));
    t.store.close();

    t = createTown(await openStore(dir + '/t.db'));
    const got = t.api.get({ thread: thread.id }).thread;
    assert.equal(got.title, '下午茶');
    assert.deepEqual(got.posts.map((p) => p.text), ['hi0', 'hi1', 'hi2']);
    assert.deepEqual(got.posts[0].acts, ['wave']);
    assert.equal(got.posts[0].human, true);
    assert.equal(got.posts[0].by.name, '大肥鱼');
    assert.equal(got.here.length, 0);                       // 在场不入库
    assert.equal(t.api.threads().threads.find((x) => x.id === thread.id).posts, 3);
    await assert.rejects(t.api.hello({ me: 'alice', key: 'z'.repeat(16) }), /绑定/);
    t.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ───────── 审核 ───────── */

test('local word list masks through spacing tricks and flags review words', () => {
  assert.equal(localCheck('你这个坏词', words).text, '你这个**');
  assert.equal(localCheck('你这个坏 · 词！', words).text, '你这个* · *！');
  assert.equal(localCheck('有点可疑', words).action, 'review');
  assert.equal(localCheck('今天天气不错', words).action, 'pass');
});

test('posts are masked, held for review, or blocked; titles and names are checked', async () => {
  const t = await town();
  const id = await threadWith(t, ['alice', 'bobby']);
  const masked = (await t.api.post(Object.assign({ thread: id, text: '这是坏词' }, as('alice')))).post;
  assert.equal(masked.text, '这是**');
  const held = (await t.api.post(Object.assign({ thread: id, text: '有点可疑' }, as('alice')))).post;
  assert.equal(held.pending, true);
  assert.equal(t.api.get(Object.assign({ thread: id }, as('alice'))).thread.posts.length, 2);   // 作者自己看得到
  assert.equal(t.api.get(Object.assign({ thread: id }, as('bobby'))).thread.posts.length, 1);   // 别人看不到
  assert.equal(t.api.threads().threads.find((x) => x.id === id).posts, 1);
  await assert.rejects(t.api.create(Object.assign({ title: '可疑的帖子', scene }, as('alice'))), /标题不合适/);
  await assert.rejects(t.api.hello({ me: 'zed01', key: KEY, name: '可疑' }), /名字不合适/);
});

test('remote moderation wins when stricter; outages fall back to review, never pass', async () => {
  const ok = (body) => async () => ({ ok: true, json: async () => body });
  let m = createModerator({ url: 'http://mod', words, fetch: ok({ action: 'block', labels: ['辱骂'] }) });
  assert.equal((await m.check('普通的话')).action, 'block');
  m = createModerator({ url: 'http://mod', words, fetch: ok({ action: 'pass' }) });
  assert.equal((await m.check('这是坏词')).text, '这是**');          // 本地更严：保留本地打码
  m = createModerator({ url: 'http://mod', words, fetch: async () => { throw new Error('timeout'); } });
  const down = await m.check('普通的话');
  assert.equal(down.action, 'review');
  assert.ok(down.degraded);
  m = createModerator({ url: 'http://mod', words, onError: 'local', fetch: async () => { throw new Error('timeout'); } });
  assert.equal((await m.check('普通的话')).action, 'pass');
});

test('three distinct reports hide a post until an admin restores it', async () => {
  const t = await town({ owner: 'erin1' });
  const id = await threadWith(t, ['alice']);
  const { post } = await t.api.post(Object.assign({ thread: id, text: '有争议的话' }, as('alice')));
  const target = 'p:' + post.id;
  await assert.rejects(Promise.resolve().then(() => t.api.report(Object.assign({ target, reason: '辱骂' }, as('alice')))), /自己/);
  t.api.report(Object.assign({ target, reason: '辱骂' }, as('bobby')));
  t.api.report(Object.assign({ target, reason: '辱骂' }, as('bobby')));       // 同一人重复举报只算一次
  t.api.report(Object.assign({ target, reason: '广告' }, as('carol')));
  assert.equal(t.api.get({ thread: id }).thread.posts.length, 1);
  t.api.report(Object.assign({ target, reason: '其他', note: '看着不舒服' }, as('dave1')));
  assert.equal(t.api.get({ thread: id }).thread.posts.length, 0);

  assert.throws(() => t.api.adminQueue(as('bobby')), /没有管理权限/);
  const q = t.api.adminQueue(as('erin1'));
  assert.equal(q.reports.length, 1);
  assert.equal(q.reports[0].n, 3);
  assert.deepEqual(q.reports[0].reasons.sort(), ['其他', '广告', '辱骂'].sort());
  t.api.adminAct(Object.assign({ action: 'restore', target }, as('erin1')));
  assert.equal(t.api.get({ thread: id }).thread.posts.length, 1);
  assert.equal(t.api.adminQueue(as('erin1')).reports.length, 0);
  assert.ok(t.api.adminQueue(as('erin1')).log.some((l) => l.action === 'auto-hide'));
});

test('roles: owner grants admin, admin grants scoped mods, mods only act in their thread', async () => {
  const t = await town({ owner: 'erin1' });
  const mine = await threadWith(t, ['alice', 'bobby']);
  const other = (await t.api.create(Object.assign({ title: '另一帖', scene }, as('carol')))).thread.id;
  t.api.join(Object.assign({ thread: other }, as('carol')));

  t.api.adminAct(Object.assign({ action: 'grant', target: 'm:dave1', role: 'admin' }, as('erin1')));
  assert.throws(() => t.api.adminAct(Object.assign({ action: 'grant', target: 'm:bobby', role: 'admin' }, as('dave1'))), /没有这项权限/);
  t.api.adminAct(Object.assign({ action: 'grant', target: 'm:bobby', role: 'mod', scope: mine }, as('dave1')));

  const p1 = (await t.api.post(Object.assign({ thread: mine, text: 'a' }, as('alice')))).post;
  const p2 = (await t.api.post(Object.assign({ thread: other, text: 'b' }, as('carol')))).post;
  t.api.adminAct(Object.assign({ action: 'hide', target: 'p:' + p1.id }, as('bobby')));
  assert.throws(() => t.api.adminAct(Object.assign({ action: 'hide', target: 'p:' + p2.id }, as('bobby'))), /没有这项权限/);
  assert.throws(() => t.api.adminAct(Object.assign({ action: 'mute', target: 'm:alice', days: 1 }, as('bobby'))), /没有这项权限/);
  assert.throws(() => t.api.adminAct(Object.assign({ action: 'ban', target: 'm:erin1' }, as('dave1'))), /站长/);
});

test('mute blocks posting until lifted; thread owner can lock and kick', async () => {
  const t = await town({ owner: 'erin1' });
  const id = await threadWith(t, ['alice', 'bobby', 'carol']);
  t.api.adminAct(Object.assign({ action: 'mute', target: 'm:bobby', days: 1 }, as('erin1')));
  await assert.rejects(t.api.post(Object.assign({ thread: id, text: 'hi' }, as('bobby'))), /禁言/);
  t.api.adminAct(Object.assign({ action: 'unban', target: 'm:bobby' }, as('erin1')));
  await t.api.post(Object.assign({ thread: id, text: 'hi' }, as('bobby')));

  assert.throws(() => t.api.lock(Object.assign({ thread: id, locked: true }, as('bobby'))), /帖主/);
  t.api.lock(Object.assign({ thread: id, locked: true }, as('alice')));
  await assert.rejects(t.api.post(Object.assign({ thread: id, text: 'hi' }, as('carol'))), /已锁/);
  await t.api.post(Object.assign({ thread: id, text: '帖主还能说' }, as('alice')));

  t.api.kick(Object.assign({ thread: id, member: 'carol' }, as('alice')));
  assert.ok(!t.api.get({ thread: id }).thread.here.some((m) => m.id === 'carol'));
  assert.throws(() => t.api.join(Object.assign({ thread: id }, as('carol'))), /请出/);
  assert.throws(() => t.api.kick(Object.assign({ thread: id, member: 'alice' }, as('alice'))), /自己/);
});
