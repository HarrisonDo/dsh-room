import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTown, serve } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { hashToken } from '../scripts/town-auth.mjs';
import { createModerator, parseWords } from '../scripts/town-moderation.mjs';
import { applySessionEvent } from '../shared/session-core.js';
import { SESSION_PROTOCOL } from '../shared/world-format.js';

const { worldRelease } = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));

function seed(store, id) {
  store.putMember({ id, account: id, name: id, kind: 'girl' });
  store.createSession(hashToken(id), id, Date.now() + 60_000);
  return { token: id };
}

function envelope(joined, requestId, op, args) {
  return { protocol: SESSION_PROTOCOL, sessionId: joined.state.sessionId, epoch: joined.state.epoch,
    requestId, actorCharacterId: joined.characterId, controlGeneration: joined.controlGeneration,
    controlKey: joined.controlKey, op, args };
}

test('场次发言审核私下处理，撤回后重放和回执均移除原文', async (t) => {
  const store = await openStore();
  t.after(() => store.close());
  const alice = seed(store, 'alice');
  const bobby = seed(store, 'bobby');
  const { api } = createTown(store, { owner: 'alice', moderator: createModerator({ words: parseWords('review:待审样例') }) });
  const { world } = await api.worldPublish({ release: worldRelease }, alice);
  const { sessionId } = api.worldOpen({ worldId: world.worldId }, alice);
  const invite = api.inviteCreate({ sessionId }, alice);
  api.inviteRedeem({ code: invite.code }, bobby);
  const joined = api.worldJoin({ sessionId, me: 'bobby' }, bobby);
  const input = envelope(joined, 'speech-one', 'say', { text: '待审样例' });
  const pending = await api.worldAgentCommand(input, bobby);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(await api.worldAgentCommand(input, bobby), pending);
  const replay = { sessionId, epoch: joined.state.epoch, after: joined.state.seq };
  assert.deepEqual(api.worldReplay(replay, alice).events, []);
  assert.deepEqual(api.worldSnapshot({ sessionId }, alice).state.recent, []);
  assert.throws(() => api.adminQueue({}, bobby), /没有管理权限/);
  const [{ target }] = api.adminQueue({}, alice).pending;
  api.adminAct({ action: 'approve', target }, alice);
  const accepted = await api.worldAgentCommand(input, bobby);
  assert.equal(accepted.status, 'committed');
  assert.deepEqual(api.worldReplay(replay, alice).events[0].payload, { text: '待审样例', source: 'ai' });
  assert.throws(() => api.worldSayRemove({ sessionId, seq: accepted.seq }, alice), /只能撤回自己/);
  api.worldSayRemove({ sessionId, seq: accepted.seq }, bobby);
  const removed = api.worldReplay(replay, alice).events;
  assert.equal(removed.at(-1).type, 'actor.said.removed');
  assert.doesNotMatch(JSON.stringify([removed, await api.worldAgentCommand(input, bobby)]), /待审样例/);
  assert.deepEqual(removed.reduce(applySessionEvent, joined.state), api.worldSnapshot({ sessionId }, alice).state);
});

test('RoomHost 事件可重放，重复请求只写一次，窗口及重启提升代次', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'roomkit-session-'));
  const file = path.join(dir, 'sessions.sqlite');
  let store = await openStore(file);
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  const alice = seed(store, 'alice');
  let { api } = createTown(store, { worldLimits: { eventCount: 2, receiptCount: 2 } });
  const { world } = await api.worldPublish({ release: worldRelease }, alice);
  const { sessionId } = api.worldOpen({ worldId: world.worldId }, alice);
  const joined = api.worldJoin({ sessionId, me: 'alice' }, alice);

  const input = envelope(joined, 'move-one', 'move', { x: 1.5, y: 1.5 });
  const first = await api.worldCommand(input, alice);
  assert.equal(first.status, 'committed');
  assert.deepEqual(await api.worldCommand(input, alice), first);
  assert.equal((await api.worldCommand({ ...input, args: { x: 2.5, y: 2.5 } }, alice)).code, 'invalid_action');

  const next = await api.worldCommand(envelope(joined, 'move-two', 'move', { x: 2.5, y: 1.5 }), alice);
  const replica = [first.events[0], next.events[0]].reduce(applySessionEvent, joined.state);
  assert.deepEqual(replica, api.worldSnapshot({ sessionId }, alice).state);
  assert.equal(api.worldReplay({ sessionId, epoch: 1, after: 0 }, alice).code, 'resync_required');
  assert.deepEqual(api.worldReplay({ sessionId, epoch: 1, after: joined.state.seq }, alice).events, [first.events[0], next.events[0]]);
  const rotated = await api.worldCommand(envelope(joined, 'window-full', 'emote', { name: 'wave' }), alice);
  assert.equal(rotated.code, 'stale_epoch');
  assert.equal((await api.worldCommand(input, alice)).code, 'stale_epoch');

  store.close();
  store = await openStore(file);
  ({ api } = createTown(store));
  const recovered = api.worldSnapshot({ sessionId }, alice).state;
  assert.equal(recovered.status, 'paused');
  assert.equal(recovered.epoch, 3);
  assert.equal(recovered.seq, replica.seq);
  assert.equal(recovered.participants[0].x, 2.5);
  assert.equal(recovered.participants[0].online, false);
  assert.equal(api.worldResume({ sessionId }, alice).state.status, 'active');
});

test('邀请兑换、一次性 SSE 票据、控制权接管和撤权走 HTTP 生效', async (t) => {
  const store = await openStore();
  for (const id of ['alice', 'bobby', 'carol', 'david']) seed(store, id);
  const town = createTown(store);
  const server = serve(town, 0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (method, token, body) => {
    const res = await fetch(`${base}/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    return { status: res.status, data: await res.json() };
  };
  const { data: { world } } = await post('worldPublish', 'alice', { release: worldRelease });
  const { data: { sessionId } } = await post('worldOpen', 'alice', { worldId: world.worldId });
  assert.equal((await post('worldSnapshot', 'bobby', { sessionId })).status, 403);
  assert.equal((await post('worldGet', 'bobby', { sessionId })).status, 403);
  const { data: { code } } = await post('inviteCreate', 'alice', { sessionId });
  const redeemed = await post('inviteRedeem', 'bobby', { code });
  assert.equal(redeemed.data.sessionId, sessionId);
  assert.deepEqual(await post('inviteRedeem', 'bobby', { code }), redeemed);
  const raceCode = (await post('inviteCreate', 'alice', { sessionId })).data.code;
  const race = await Promise.all(['carol', 'david'].map((account) => post('inviteRedeem', account, { code: raceCode })));
  assert.deepEqual(race.map(({ status }) => status).sort(), [200, 403]);
  assert.equal((await post('worldGet', 'bobby', { sessionId })).data.release.revision, 1);

  const { data: first } = await post('worldJoin', 'bobby', { sessionId, me: 'bobby' });
  assert.ok(first.controlKey);
  assert.equal((await post('worldJoin', 'bobby', { sessionId, me: 'bobby' })).data.controlKey, null);
  const ticket = (await post('worldStreamTicket', 'bobby', { sessionId, epoch: first.state.epoch, after: first.state.seq })).data.ticket;
  const streamUrl = `${base}/world-events?ticket=${ticket}`;
  const stream = await fetch(streamUrl, { signal: AbortSignal.timeout(3000) });
  assert.equal(stream.status, 200);
  assert.equal((await fetch(streamUrl)).status, 401);
  const reader = stream.body.getReader();
  const { data: takeover } = await post('worldJoin', 'bobby', { sessionId, me: 'bobby', takeControl: true });
  assert.equal(takeover.controlGeneration, first.controlGeneration + 1);
  assert.equal((await post('worldCommand', 'bobby', envelope(first, 'old-window', 'emote', { name: 'wave' }))).data.code, 'control_lost');
  assert.equal((await post('worldCommand', 'bobby', envelope(takeover, 'new-window', 'emote', { name: 'wave' }))).data.status, 'committed');

  assert.equal((await post('worldKick', 'alice', { sessionId, characterId: 'bobby' })).status, 200);
  let frames = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    frames += Buffer.from(value).toString('utf8');
  }
  assert.match(frames, /event: control/);
  assert.match(frames, /event: accessLost/);
  assert.equal((await post('worldReplay', 'bobby', { sessionId, after: 0 })).status, 403);
  assert.equal((await post('worldGet', 'bobby', { sessionId })).status, 403);
  assert.equal((await post('worldCommand', 'bobby', envelope(takeover, 'revoked', 'emote', { name: 'wave' }))).data.code, 'forbidden');
  town.worlds.sessions.tick(Date.now() + 65_000);
  assert.equal((await post('worldSnapshot', 'alice', { sessionId })).data.state.status, 'paused');
});

test('合作信标按账号计贡献，凭证只给完成时在场角色，两场进度隔离', async (t) => {
  const store = await openStore();
  const alice = seed(store, 'alice'), bobby = seed(store, 'bobby'), carol = seed(store, 'carol');
  store.putMember({ id: 'alice-other', account: 'alice', name: '备用角色', kind: 'girl' });
  const town = createTown(store);
  const { api } = town;
  const server = serve(town, 0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    store.close();
  });
  const { world } = await api.worldPublish({ release: worldRelease }, alice);
  const { sessionId } = api.worldOpen({ worldId: world.worldId }, alice);
  const { code } = api.inviteCreate({ sessionId }, alice);
  api.inviteRedeem({ code }, bobby);
  const a = api.worldJoin({ sessionId, me: 'alice' }, alice);
  const b = api.worldJoin({ sessionId, me: 'bobby' }, bobby);
  assert.throws(() => api.worldJoin({ sessionId, me: 'alice-other' }, alice), /已选择其他角色/);
  const { ticket } = api.worldStreamTicket({ sessionId, epoch: b.state.epoch, after: b.state.seq }, { ...bobby, peer: '127.0.0.1' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/world-events?ticket=${ticket}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);

  let sequence = 0;
  const command = (joined, identity, op, args) => api.worldCommand(envelope(joined, 'activity-' + ++sequence, op, args), identity);
  const go = (joined, identity, x, y) => command(joined, identity, 'move', { x, y });
  const use = (joined, identity, objectId) => command(joined, identity, 'interact', { objectId });
  await go(a, alice, 0.5, 1.5);
  await go(b, bobby, 0.5, 1.5);
  const contested = await Promise.all([use(a, alice, 'beacon-west'), use(b, bobby, 'beacon-west')]);
  assert.deepEqual(contested.map(({ status }) => status), ['committed', 'rejected']);
  assert.equal(contested[1].code, 'already_done');
  await go(b, bobby, 2.5, 1.5);
  assert.equal((await use(b, bobby, 'beacon-center')).status, 'committed');
  await go(a, alice, 4.5, 1.5);
  assert.equal((await use(a, alice, 'beacon-east')).status, 'committed');
  await go(a, alice, 4.5, 2.5);
  const completed = await use(a, alice, 'exit');
  assert.equal(completed.events[0].type, 'activity.completed');
  assert.deepEqual(completed.events[0].payload.participants.map(({ characterId }) => characterId).sort(), ['alice', 'bobby']);
  assert.deepEqual(api.worldCompletion({ sessionId }, bobby).completion.event, completed.events[0]);
  assert.equal((await use(a, alice, 'exit')).code, 'already_done');

  const late = api.inviteCreate({ sessionId }, alice);
  api.inviteRedeem({ code: late.code }, carol);
  api.worldJoin({ sessionId, me: 'carol' }, carol);
  assert.equal(api.worldCompletion({ sessionId }, carol).completion, null);
  api.worldLeave({ sessionId, controlKey: a.controlKey }, alice);
  const other = api.worldOpen({ worldId: world.worldId }, alice);
  const solo = api.worldJoin({ sessionId: other.sessionId, me: 'alice-other' }, alice);
  assert.deepEqual(other.state.activity.contributions, []);
  for (const [id, x] of [['beacon-west', 0.5], ['beacon-center', 2.5], ['beacon-east', 4.5]]) {
    await go(solo, alice, x, 1.5);
    assert.equal((await use(solo, alice, id)).status, 'committed');
  }
  await go(solo, alice, 4.5, 2.5);
  assert.equal((await use(solo, alice, 'exit')).code, 'invalid_action');
  assert.equal(api.worldSnapshot({ sessionId }, alice).state.activity.completion.seq, completed.seq);
});
