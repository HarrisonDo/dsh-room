import test from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { authConfig } from '../scripts/town-auth.mjs';

const scene = { format: 'roomkit.scene', v: 2, id: 'home', room: { w: 8, h: 6 }, objects: [], agents: [] };
const nonce = () => 'n'.repeat(20) + Math.random().toString(36).slice(2, 14).padEnd(12, 'x');
const env = { GITHUB_CLIENT_ID: 'gid', GITHUB_CLIENT_SECRET: 'gsec', LINUXDO_CLIENT_ID: 'lid', LINUXDO_CLIENT_SECRET: 'lsec', LINUXDO_MIN_TRUST: '1', TOWN_OWNER: 'github:boss', TOWN_PUBLIC_URL: 'https://town.example.com' };

/** 假服务商：token 接口记下收到的参数，user 接口按 token 返回不同的人 */
function fakeOAuth(users) {
  const seen = [];
  return {
    seen,
    fetch: async (url, init) => {
      if (/token/.test(url)) {
        const body = new URLSearchParams(init.body); seen.push(Object.fromEntries(body));
        return { ok: true, json: async () => ({ access_token: 'at-' + body.get('code') }) };
      }
      const code = init.headers.authorization.replace('Bearer at-', '');
      return { ok: true, json: async () => users[code] };
    },
  };
}

async function setup(users) {
  const store = await openStore();
  const fake = fakeOAuth(users);
  return { town: createTown(store, { auth: authConfig(env), fetch: fake.fetch }), fake, store };
}
/** 走一遍登录：start → 服务商回调 → poll 拿令牌 */
async function signIn(town, provider, code) {
  const n = nonce();
  const r = town.login.start(provider, n, 'http://127.0.0.1:18780');
  const state = new URL(r.redirect).searchParams.get('state');
  const page = await town.login.callback(provider, new URLSearchParams({ state, code }), 'http://127.0.0.1:18780');
  const got = await Promise.resolve().then(() => town.api.authPoll({ nonce: n })).catch((e) => ({ error: e.message }));
  return { page: page.html, ...got };
}

test('config lists enabled providers; legacy identity is off once a provider is configured', async () => {
  const { town } = await setup({});
  assert.deepEqual(town.api.config().providers.map((p) => p.id).sort(), ['github', 'linuxdo']);
  assert.equal(town.api.config().legacy, false);
  await assert.rejects(town.api.hello({ me: 'alice', key: 'k'.repeat(16) }), /需要登录/);
  assert.throws(() => town.api.me({}, {}), /先登录/);
});

test('github sign-in: PKCE, callback URL from TOWN_PUBLIC_URL, one-time token, owner claimed by login name', async () => {
  const { town, fake } = await setup({ c1: { id: 7, login: 'boss', name: 'Boss' } });
  const n = nonce();
  const r = town.login.start('github', n, 'http://ignored');
  const q = new URL(r.redirect).searchParams;
  assert.equal(q.get('redirect_uri'), 'https://town.example.com/auth/github/callback');
  assert.equal(q.get('code_challenge_method'), 'S256');
  await town.login.callback('github', new URLSearchParams({ state: q.get('state'), code: 'c1' }), '');
  assert.ok(fake.seen[0].code_verifier);
  assert.equal(town.api.authPoll({ nonce: 'x'.repeat(32) }).pending, true);
  const { token } = town.api.authPoll({ nonce: n });
  assert.ok(token);
  assert.equal(town.api.authPoll({ nonce: n }).pending, true);          // 令牌只给一次
  const me = town.api.me({}, { token });
  assert.equal(me.account.id, 'gh:7');
  assert.deepEqual(me.roles.map((x) => x.role), ['owner']);
  // state 只能用一次
  const again = await town.login.callback('github', new URLSearchParams({ state: q.get('state'), code: 'c1' }), '');
  assert.match(again.html, /过期/);
});

test('linux.do sign-in checks trust level and silenced accounts', async () => {
  const { town } = await setup({ low: { id: 1, username: 'newbie', trust_level: 0, active: true }, ok: { id: 2, username: 'regular', trust_level: 2, active: true }, sil: { id: 3, username: 'x', trust_level: 3, active: true, silenced: true } });
  assert.match((await signIn(town, 'linuxdo', 'low')).error, /信任等级 1/);
  assert.match((await signIn(town, 'linuxdo', 'sil')).error, /禁言/);
  const { token } = await signIn(town, 'linuxdo', 'ok');
  assert.equal(town.api.me({}, { token }).account.id, 'ld:2');
});

test('characters belong to an account (max 3); others cannot speak as them; logout ends the session', async () => {
  const { town } = await setup({ a: { id: 1, login: 'alice' }, b: { id: 2, login: 'bob' } });
  const A = (await signIn(town, 'github', 'a')).token, B = (await signIn(town, 'github', 'b')).token;
  const c = (await town.api.character({ name: '大肥鱼' }, { token: A })).character;
  const results = await Promise.allSettled(['泡泡', '团子', '第四只'].map((name) => town.api.character({ name }, { token: A })));
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 2);
  assert.match(results.find(({ status }) => status === 'rejected').reason.message, /最多 3/);
  await town.api.character({ me: c.id, name: '大肥鱼改' }, { token: A });
  assert.equal(town.api.me({}, { token: A }).characters.find((x) => x.id === c.id).name, '大肥鱼改');
  await assert.rejects(town.api.character({ me: c.id, name: '抢' }, { token: B }), /不是你的/);
  assert.throws(() => town.api.join({ me: c.id, thread: 'plaza' }, { token: B }), /不是你的/);
  town.api.join({ me: c.id, thread: 'plaza' }, { token: A });
  await town.api.post({ me: c.id, thread: 'plaza', text: 'hi' }, { token: A });
  town.api.logout({}, { token: A });
  assert.throws(() => town.api.me({}, { token: A }), /过期/);
});

test('moderation follows the account, not the character', async () => {
  const { town } = await setup({ boss: { id: 9, login: 'boss' }, a: { id: 1, login: 'alice' }, b: { id: 2, login: 'bob' } });
  const O = (await signIn(town, 'github', 'boss')).token, A = (await signIn(town, 'github', 'a')).token, B = (await signIn(town, 'github', 'b')).token;
  const a1 = (await town.api.character({ name: '一号' }, { token: A })).character.id;
  const a2 = (await town.api.character({ name: '二号' }, { token: A })).character.id;
  const b1 = (await town.api.character({ name: 'B' }, { token: B })).character.id;
  const o1 = (await town.api.character({ name: '站长' }, { token: O })).character.id;
  const tid = (await town.api.create({ me: b1, title: 'B 的帖子', scene }, { token: B })).thread.id;
  town.api.join({ me: b1, thread: tid }, { token: B });
  town.api.join({ me: a1, thread: tid }, { token: A });

  // 请离开按账号：换一只角色也进不来
  town.api.kick({ thread: tid, member: a1 }, { token: B });
  assert.throws(() => town.api.join({ me: a2, thread: tid }, { token: A }), /请出/);

  // 禁言按账号：两只角色都不能说话
  town.api.join({ me: a1, thread: 'plaza' }, { token: A });
  town.api.adminAct({ action: 'mute', target: 'm:' + a2, days: 1 }, { token: O });
  await assert.rejects(town.api.post({ me: a1, thread: 'plaza', text: 'hi' }, { token: A }), /禁言/);

  // 举报去重按账号：同一人用两只角色也只算一次；举报自己的另一只角色不行
  town.api.join({ me: o1, thread: 'plaza' }, { token: O });
  const p = (await town.api.post({ me: o1, thread: 'plaza', text: '站长的话' }, { token: O })).post;
  town.api.report({ target: 'p:' + p.id, reason: '其他' }, { token: A });
  town.api.report({ target: 'p:' + p.id, reason: '其他' }, { token: A });
  assert.equal(town.api.adminQueue({}, { token: O }).reports[0].n, 1);

  // 封号：会话作废
  town.api.adminAct({ action: 'ban', target: 'a:gh:1' }, { token: O });
  assert.throws(() => town.api.me({}, { token: A }), /过期/);
});

test('dev login only works on a local public URL', () => {
  assert.ok(authConfig({ TOWN_DEV_LOGIN: '1' }).providers.dev);
  assert.ok(!authConfig({ TOWN_DEV_LOGIN: '1', TOWN_PUBLIC_URL: 'https://town.example.com' }).providers.dev);
});

test('likes: one per account, can undo, not on yourself; hot sort uses them', async () => {
  const { town } = await setup({ a: { id: 1, login: 'alice' }, b: { id: 2, login: 'bob' }, c: { id: 3, login: 'carol' } });
  const A = (await signIn(town, 'github', 'a')).token, B = (await signIn(town, 'github', 'b')).token, Cc = (await signIn(town, 'github', 'c')).token;
  const a1 = (await town.api.character({ name: 'A' }, { token: A })).character.id;
  const a2 = (await town.api.character({ name: 'A2' }, { token: A })).character.id;
  const b1 = (await town.api.character({ name: 'B' }, { token: B })).character.id;
  const quiet = (await town.api.create({ me: a1, title: '冷帖', scene }, { token: A })).thread.id;
  const hot = (await town.api.create({ me: b1, title: '热帖', scene }, { token: B })).thread.id;
  town.api.join({ me: a1, thread: hot }, { token: A });
  const p = (await town.api.post({ me: a1, thread: hot, text: '好帖' }, { token: A })).post;
  assert.throws(() => town.api.like({ target: 'p:' + p.id }, { token: A }), /自己/);
  assert.throws(() => town.api.like({ me: a2, target: 'p:' + p.id }, { token: A }), /自己/);   // 换角色也是自己
  assert.equal(town.api.like({ target: 'p:' + p.id }, { token: B }).likes, 1);
  assert.equal(town.api.like({ target: 'p:' + p.id }, { token: B }).likes, 1);                 // 重复点不加
  assert.equal(town.api.like({ target: 'p:' + p.id }, { token: Cc }).likes, 2);
  assert.equal(town.api.like({ target: 'p:' + p.id, on: false }, { token: Cc }).likes, 1);
  assert.throws(() => town.api.like({ target: 'p:' + p.id }, {}), /先登录/);
  const view = town.api.get({ me: b1, thread: hot }, { token: B }).thread;
  assert.equal(view.posts[0].liked, true);
  assert.equal(view.posts[0].likes, 1);
  town.api.like({ target: 't:' + hot }, { token: A });
  town.api.like({ target: 't:' + hot }, { token: Cc });
  assert.equal(town.api.threads({ sort: 'hot' }).threads[0].id, hot);
  assert.ok(town.api.threads({ sort: 'hot' }).threads.some((t) => t.id === quiet));
});

test('a public deployment never falls back to the prototype identity', () => {
  assert.equal(authConfig({}).legacy, true);
  assert.equal(authConfig({ TOWN_PUBLIC_URL: 'https://town.example.com' }).legacy, false);
  assert.equal(authConfig({ TOWN_PUBLIC_URL: 'https://town.example.com', TOWN_LEGACY: '1' }).legacy, false);
});
