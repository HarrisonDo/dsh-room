import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Catalog } from '../web/roomkit/catalog.js';
import { Nav } from '../web/roomkit/nav.js';
import { validatePack } from '../web/roomkit/packs.js';
import { World } from '../web/roomkit/scene.js';
import { digestJSON, verifyWorldRelease } from '../shared/world-format.js';

test('合作信标样例可加载，场景、完成事件和经历引用一致', async () => {
  const file = new URL('./fixtures/cooperative-beacons.json', import.meta.url);
  const { worldRelease, participants, completionEvent, experience } = JSON.parse(readFileSync(file, 'utf8'));
  const { hash, ...release } = worldRelease;
  assert.equal(release.format, 'roomkit.world');
  assert.equal(release.v, 1);
  assert.equal(release.protocol, 'roomkit.session/1');
  assert.equal(hash, await digestJSON(release));
  assert.deepEqual(await verifyWorldRelease(worldRelease), worldRelease);

  const [embedded] = release.packs;
  assert.equal(embedded.v, 1);
  const { ok, pack, errors, warnings } = validatePack(embedded);
  assert.ok(ok, errors.join('\n'));
  assert.deepEqual(warnings, []);
  assert.deepEqual(release.dependencies, [
    { id: pack.id, version: pack.version, hash: await digestJSON(embedded), source: 'embedded' },
  ]);

  const world = new World(new Catalog().addAll(pack.furniture), release.scene);
  assert.deepEqual(world.toJSON(), release.scene);
  const nav = new Nav(world);
  const spawn = nav.nearestFree(world.room.w / 2, world.room.h / 2);
  assert.ok(spawn, '样例应有可用出生点');
  assert.equal(release.activity.kind, 'cooperative-beacons');
  assert.equal(release.activity.v, 1);
  const { beaconIds, exitId, minContributors } = release.activity;
  assert.equal(beaconIds.length, 3);
  assert.equal(minContributors, 2);
  const targets = [...beaconIds, exitId];
  assert.equal(new Set(targets).size, 4);
  for (const id of targets) {
    const object = world.byId.get(id);
    const def = world.def(object);
    assert.ok(def?.slots.length, `${id} 应有可解析的家具定义和交互位`);
    const target = world.slotPose(object, def.slots[0]);
    assert.ok(nav.freeAt(target.x, target.y) && nav.path(spawn, target), `${id} 的交互位应可达`);
  }

  const { sessionId, seq, type, payload } = completionEvent;
  assert.equal(type, 'activity.completed');
  assert.equal(payload.worldId, release.worldId);
  assert.equal(payload.revision, release.revision);
  assert.equal(payload.exitId, exitId);
  assert.equal(participants.length, 2);
  assert.ok(participants.every((member) => member.sessionId === sessionId));
  assert.deepEqual(payload.participants, participants.map(({ characterId, name }) => ({ characterId, name })));
  assert.deepEqual(payload.contributions.map(({ beaconId }) => beaconId), beaconIds);
  const accounts = new Map(participants.map(({ characterId, accountId }) => [characterId, accountId]));
  assert.ok(accounts.has(completionEvent.actorCharacterId));
  const contributors = new Set(payload.contributions.map(({ characterId }) => accounts.get(characterId)));
  assert.ok(!contributors.has(undefined) && contributors.size >= minContributors);

  assert.equal(experience.v, 1);
  assert.equal(experience.id, payload.completionId);
  assert.equal(experience.source.worldId, release.worldId);
  assert.equal(experience.source.revision, release.revision);
  assert.equal(experience.source.sessionId, sessionId);
  assert.equal(experience.source.completionSeq, seq);
  assert.deepEqual(experience.participants, payload.participants);
  assert.deepEqual(experience.facts, [{ seq, type, payload: { exitId } }]);
  assert.equal(experience.outcome, 'completed');
});
