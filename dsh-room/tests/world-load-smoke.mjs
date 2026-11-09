import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createTown, serve } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { hashToken } from '../scripts/town-auth.mjs';
import { SESSION_PROTOCOL } from '../shared/world-format.js';

const { worldRelease } = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));
const store = await openStore();
const town = createTown(store);
const server = serve(town, 0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;

async function post(method, token, body) {
  const response = await fetch(base + '/api/' + method, { method: 'POST', headers: { authorization: 'Bearer ' + token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(method + ' HTTP ' + response.status);
  return response.json();
}

function seed(account) {
  store.putMember({ id: account, account, name: account, kind: 'girl' });
  store.createSession(hashToken(account), account, Date.now() + 60_000);
  return { token: account };
}

async function prepare(roomCount) {
  const rooms = [];
  for (let index = 0; index < roomCount; index++) {
    const owner = 'owner-' + roomCount + '-' + index;
    const guest = 'guest-' + roomCount + '-' + index;
    const a = seed(owner), b = seed(guest);
    const { world } = await town.api.worldPublish({ release: worldRelease }, a);
    const { sessionId } = town.api.worldOpen({ worldId: world.worldId }, a);
    const { code } = town.api.inviteCreate({ sessionId }, a);
    town.api.inviteRedeem({ code }, b);
    const members = [];
    for (const token of [owner, guest]) {
      const joined = await post('worldJoin', token, { sessionId, me: token });
      const { ticket } = await post('worldStreamTicket', token, { sessionId, epoch: joined.state.epoch, after: joined.state.seq });
      const stream = await fetch(base + '/world-events?ticket=' + ticket, { signal: AbortSignal.timeout(15000) });
      assert.equal(stream.status, 200);
      const drained = (async () => { for await (const chunk of stream.body) assert.ok(chunk.length > 0); })();
      members.push({ token, joined, drained });
    }
    rooms.push({ owner, sessionId, members });
  }
  return rooms;
}

function bytes() { return town.transport.jsonBytes + town.worlds.sessions.metrics().streamBytes; }
const round = (value) => Math.round(value * 100) / 100;

try {
  for (const count of [1, 4, 8]) {
    const rooms = await prepare(count);
    const baseline = bytes();
    const cpuStart = process.cpuUsage();
    const begin = performance.now();
    const times = [];
    let failures = 0;
    for (let step = 0; step < 5; step++) {
      await Promise.all(rooms.flatMap(({ members, sessionId }) => members.map(async ({ token, joined }) => {
        const start = performance.now();
        try {
          const result = await post('worldCommand', token, {
            protocol: SESSION_PROTOCOL, sessionId, epoch: joined.state.epoch, requestId: 'move-' + step,
            actorCharacterId: joined.characterId, controlGeneration: joined.controlGeneration,
            controlKey: joined.controlKey, op: 'move', args: { x: step % 2 ? 1.5 : 2.5, y: 1.5 },
          });
          if (result.status !== 'committed') failures++;
        } catch { failures++; }
        times.push(performance.now() - start);
      })));
    }
    const elapsed = performance.now() - begin;
    const cpu = process.cpuUsage(cpuStart);
    const output = bytes() - baseline;
    times.sort((a, b) => a - b);
    const metrics = town.worlds.sessions.metrics();
    assert.equal(failures, 0);
    assert.equal(metrics.streams, count * 2);
    for (const { sessionId, owner } of rooms) town.api.worldEnd({ sessionId }, { token: owner });
    await Promise.all(rooms.flatMap(({ members }) => members.map(({ drained }) => drained)));
    for (let i = 0; i < 20 && town.worlds.sessions.metrics().streams > 0; i++) await delay(10);
    assert.equal(town.worlds.sessions.metrics().streams, 0);
    assert.equal(town.worlds.sessions.metrics().activeSessions, 0);
    console.log(JSON.stringify({ rooms: count, connections: metrics.streams, actions: times.length, failures,
      p95Ms: round(times[Math.ceil(times.length * 0.95) - 1]), elapsedMs: round(elapsed),
      cpuMs: round((cpu.user + cpu.system) / 1000), rssMiB: round(process.memoryUsage.rss() / 1024 / 1024),
      applicationBytes: output, streamsAfter: 0 }));
  }
} finally {
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  store.close();
}
