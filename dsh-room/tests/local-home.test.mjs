import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalHome } from '../lib/local-home.js';
import { emptyHome } from '../shared/local-home-format.js';

const browser = 'browser-home-view-a';
const other = 'browser-home-view-b';
const desktop = 'desktop-home-view-a';
const full = 'desktop-full-view-b';
const identity = (view, claim) => ({ view, epoch: claim.epoch });
const update = (owner, sequence, snapshot) => ({ ...owner, sequence, snapshot });

test('migration, failed handoff, stale writes, helper rotation and host restart preserve one home', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'local-home-'));
  try {
    const directory = path.join(root, 'profile');
    const legacyFile = path.join(root, 'store.json');
    const legacy = { 'dsh-room.last': '"cabin"', 'dsh-room.unrelated': 'discard' };
    await writeFile(legacyFile, JSON.stringify(legacy));
    const initial = { ...emptyHome(), keys: { 'dsh-room.last': '"garden"' }, packs: [{ id: 'furniture' }], drafts: [{ id: 'draft' }] };
    const home = createLocalHome({ directory, legacyFile });
    assert.equal((await home.acquire({ view: browser })).initialize, true);
    const original = await home.acquire({ view: browser, legacy: initial });
    const owner = identity(browser, original);
    const oldAI = await home.modelSignal('embed', owner);
    assert.deepEqual(await home.acquire({ view: other }), { owner: 'embed' });
    assert.deepEqual(original.snapshot.keys, { 'dsh-room.last': '"cabin"' });
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'home-legacy-browser.json'))), initial);
    assert.deepEqual(JSON.parse(await readFile(legacyFile)), legacy);
    assert.equal(await home.writeLegacy(() => assert.fail('legacy writer called')), false);

    const scene = { id: 'cabin', agents: [{ id: 'me' }], objects: [{ id: 'door', state: { to: 'garden' } }] };
    const withScene = { ...original.snapshot, keys: { ...original.snapshot.keys, 'dsh-room.scene.cabin': JSON.stringify(scene) } };
    await assert.rejects(home.beginDesktop(update(owner, 1, { ...withScene, drafts: null })), { code: 'invalid' });
    assert.equal((await home.status(owner)).owned, true);
    const handoff = await home.beginDesktop(update(owner, 2, withScene));
    assert.equal(oldAI.aborted, true);
    await assert.rejects(home.save('embed', update(owner, 3, initial)), { code: 'stale' });
    await assert.rejects(home.beginDesktop(update(owner, 4, initial)), { code: 'stale' });
    const deskClaim = await home.acquireDesktop({ view: desktop }, handoff);
    assert.deepEqual(deskClaim.snapshot, withScene);
    const desk = identity(desktop, deskClaim);
    const afterEdit = { ...withScene, drafts: [{ id: 'draft', changed: true }] };
    await home.save('desktop', update(desk, 2, afterEdit), handoff);
    await home.save('desktop', update(desk, 1, initial), handoff);
    await home.leaveDesktop(update(desk, 3, afterEdit), handoff, true);
    await assert.rejects(home.save('desktop', update(desk, 4, initial), handoff), { code: 'stale' });
    const fullClaim = await home.acquireDesktop({ view: full }, handoff);
    assert.deepEqual(fullClaim.snapshot, afterEdit);
    await home.leaveDesktop(update(identity(full, fullClaim), 1, afterEdit), handoff);
    const back = await home.acquire({ view: browser });
    assert.notEqual(back.epoch, owner.epoch);
    const reboot = createLocalHome({ directory, legacyFile });
    await assert.rejects(reboot.acquire({ view: other }), { code: 'busy' });
    await home.dispose();
    assert.deepEqual((await reboot.acquire({ view: other })).snapshot, afterEdit);
    await reboot.dispose();
    const secondProfile = createLocalHome({ directory: path.join(root, 'another-profile'), legacyFile });
    assert.equal((await secondProfile.acquire({ view: other })).initialize, true);
    await secondProfile.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});
