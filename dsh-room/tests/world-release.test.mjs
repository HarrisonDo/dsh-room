import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildWorldRelease, verifyWorldRelease, worldRuntime } from '../shared/world-format.js';
import { createTown, serve } from '../scripts/town.mjs';
import { openStore } from '../scripts/town-store.mjs';
import { hashToken } from '../scripts/town-auth.mjs';

const { worldRelease: fixture } = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('含透明贴图的世界在空素材库重建，校验摘要与素材引用', async () => {
  const input = structuredClone(fixture);
  input.scene.agents.push({ id: 'private', persona: 'local only' });
  input.packs[0].images = { beacon: PNG };
  input.packs[0].furniture[0].art = { kind: 'sprite', src: '@beacon' };
  const release = await buildWorldRelease(input);
  const imported = await verifyWorldRelease(JSON.parse(JSON.stringify(release)));
  const { world, catalog, targets } = worldRuntime(imported);
  assert.equal(catalog.get('courtyard/beacon').art.src, PNG);
  assert.deepEqual(world.objects.map(({ x, y }) => [x, y]), input.scene.objects.map(({ x, y }) => [x, y]));
  assert.ok(targets.get('beacon-west').length);
  assert.deepEqual(imported.scene.agents, []);
  await assert.rejects(buildWorldRelease({ ...input, packs: [] }), /缺少家具/);
  await assert.rejects(buildWorldRelease({ ...input, packs: [...input.packs, ...input.packs] }), /同名/);
  await assert.rejects(verifyWorldRelease({ ...imported, hash: 'wrong' }), /摘要/);
  await assert.rejects(verifyWorldRelease({ ...imported, v: 2 }), /版本/);
  input.packs[0].images.beacon = 'https://invalid.example/image.png';
  await assert.rejects(buildWorldRelease(input), /内嵌/);
});

test('迁移旧库后可私密发布两版，重开后保留旧帖和固定版本', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'roomkit-world-'));
  const file = path.join(directory, 'town.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, owner TEXT, scene TEXT, scene_ref TEXT, t INTEGER, last INTEGER, posts INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0);
    INSERT INTO threads (id, title, t, last) VALUES ('legacy-thread', '旧帖', 1, 1);
  `);
  old.close();

  let store = await openStore(file);
  for (const account of ['alice', 'bobby']) store.createSession(hashToken(account), account, Date.now() + 60_000);
  const town = createTown(store);
  const server = serve(town, 0, '127.0.0.1');
  await once(server, 'listening');
  const close = () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  t.after(async () => {
    if (server.listening) await close();
    store?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const post = (api, body, token = 'alice') => fetch(`http://127.0.0.1:${server.address().port}/api/${api}`, {
    method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
  });
  const saved = await post('worldSave', { release: fixture });
  assert.equal(saved.status, 200);
  const { world: { worldId } } = await saved.json();
  const first = await post('worldPublish', { worldId });
  assert.equal(first.status, 200);
  const { release: v1 } = await first.json();
  assert.equal(v1.authorAccountId, 'alice');
  assert.equal((await post('worldGet', { worldId }, 'bobby')).status, 404);
  assert.equal((await post('worldPublish', { worldId, release: fixture }, 'bobby')).status, 404);
  const edited = await buildWorldRelease({ ...fixture, title: '第二版' });
  const second = await post('worldPublish', { worldId, release: edited, expectedRevision: 1 });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).release.revision, 2);
  assert.equal((await post('worldPublish', { worldId, release: edited, expectedRevision: 1 })).status, 409);
  await close();
  store.close();
  store = await openStore(file);
  const reopened = createTown(store);
  assert.equal(reopened.api.get({ thread: 'legacy-thread' }).thread.title, '旧帖');
  assert.deepEqual(reopened.api.worldGet({ worldId, revision: 1 }, { token: 'alice' }).release, v1);
  assert.equal(reopened.api.worldGet({ worldId }, { token: 'alice' }).release.title, '第二版');
  const backupDir = path.join(directory, 'backups');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/town-backup.mjs', import.meta.url)), file, backupDir]);
  const [backup] = await readdir(backupDir);
  const restored = await openStore(path.join(backupDir, backup));
  try {
    assert.equal(restored.thread('legacy-thread').title, '旧帖');
    assert.deepEqual(restored.world.release(worldId, 1), v1);
    assert.equal(restored.world.release(worldId, 2).title, '第二版');
  } finally { restored.close(); }
});
