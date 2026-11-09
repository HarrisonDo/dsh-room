import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ExperienceStore, experienceSummary } from '../web/roomkit/experience.js';

const { experience, completionEvent } = JSON.parse(await readFile(new URL('./fixtures/cooperative-beacons.json', import.meta.url), 'utf8'));
const visit = { ...experience, id: 'visit-one', title: '合作点亮庭院', outcome: 'partial', facts: [] };

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('事实先保存，摘要失败可重试，刷新补领去重，删除不补回', async () => {
  const storage = memoryStorage();
  const original = new ExperienceStore('test', storage);
  original.recordVisit(visit, visit.participants, { type: 'beacon.lit', seq: 3, payload: { beaconId: 'beacon-west' } });
  const { record } = original.complete(visit, completionEvent);
  assert.equal(record.reflection.status, 'pending');
  assert.equal(record.facts.length, 2);

  const reopened = new ExperienceStore('test', storage);
  assert.equal(reopened.complete(visit, completionEvent).created, false);
  await assert.rejects(reopened.summarize(record, { summarize: async () => { throw new Error('model timeout'); } }, {}), /timeout/);
  const failed = reopened.list(experience.localCharacterId)[0];
  assert.equal(failed.reflection.status, 'fallback');
  assert.match(experienceSummary(failed), /合作点亮庭院/);
  assert.equal(failed.outcome, 'completed');
  const summarized = await reopened.summarize(record, { summarize: async () => '我记得那盏灯。' }, {});
  assert.equal(summarized.reflection.status, 'ready');
  assert.deepEqual(summarized.facts, record.facts);
  assert.match(reopened.recall(experience.localCharacterId, 'https://roomkit.example/path', ['character-bo']), /那盏灯/);
  assert.equal(reopened.recall('different-role', 'https://roomkit.example', ['character-bo']), '');

  const data = reopened.export(experience.localCharacterId);
  const imported = new ExperienceStore('copy', memoryStorage());
  assert.throws(() => imported.import(data, 'different-role'), /身份/);
  assert.equal(imported.import(data, experience.localCharacterId), 1);
  reopened.remove(experience.localCharacterId, experience.source.serviceId, record.id);
  assert.equal(reopened.complete(visit, completionEvent).record, null);
  assert.deepEqual(reopened.list(experience.localCharacterId), []);
});

test('旧小镇摘要独立标记，存储不足时仍可导出本次经历', () => {
  const storage = memoryStorage();
  const records = new ExperienceStore('test', storage);
  const legacy = [{ thread: 'old', title: '旧小镇', t: 1, summary: '一起聊天', ids: ['character-bo'], with: ['小波'] }];
  assert.equal(records.importLegacy(experience.localCharacterId, experience.source.serviceId, legacy), 1);
  assert.equal(records.importLegacy(experience.localCharacterId, experience.source.serviceId, legacy), 0);
  assert.equal(records.list(experience.localCharacterId)[0].source.kind, 'legacy-town');
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => records.complete(visit, completionEvent), /空间不足/);
  assert.equal(records.export(experience.localCharacterId).records[0].outcome, 'completed');
});
