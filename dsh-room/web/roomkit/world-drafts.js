import { buildWorldRelease, collectWorldPacks, verifyWorldRelease, worldRuntime } from '../../shared/world-format.js';
import { PackStore } from './packs.js';

export class WorldView {
  constructor(app) { this.app = app; this.home = null; }

  open(release, catalog, label = 'world-preview') {
    const app = this.app;
    if (this.home || app.visiting) throw new Error('请先回家再进入另一个世界');
    this.home = { scene: app.world.toJSON(), catalog: app.world.catalog, autosave: app.opts.autosave, stories: app.opts.stories, mode: app.mode };
    if (this.home.autosave) app.storage.save(this.home.scene);
    app.opts.autosave = false;
    app.opts.stories = false;
    app.visiting = label;
    app.world.catalog = catalog;
    try {
      app.setMode('play');
      app.openScene(release.scene, { followers: [] });
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close() {
    const saved = this.home;
    if (!saved) return;
    this.home = null;
    const app = this.app;
    app.world.catalog = saved.catalog;
    app.visiting = null;
    try {
      app.openScene(saved.scene, { followers: [] });
      app.setMode(saved.mode);
    } finally {
      app.opts.autosave = saved.autosave;
      app.opts.stories = saved.stories;
    }
  }
}

export class WorldDrafts {
  constructor(app) {
    this.app = app;
    this.store = app.opts.draftStore || new PackStore((app.opts.storageKey || 'roomkit') + '-world-drafts');
    this.view = new WorldView(app);
  }

  async capture({ id, title, activity = null, author, license } = {}) {
    if (this.app.visiting) throw new Error('请先回到自己的房间');
    const scene = this.app.world.toJSON();
    const packs = collectWorldPacks(scene, this.app.packs, { author, license });
    return buildWorldRelease({
      worldId: id || globalThis.crypto.randomUUID(),
      title: title || scene.name, revision: 1, authorAccountId: 'local', scene, packs, activity,
    });
  }

  async save(options = {}) {
    const previous = (await this.store.list()).filter(({ release }) => release?.scene?.id === this.app.world.scene.id)
      .sort((a, b) => b.updated - a.updated)[0];
    const release = await this.capture({ id: previous?.id, ...options });
    await this.store.put({ id: release.worldId, updated: Date.now(), release });
    return release;
  }

  async import(input) {
    const valid = await verifyWorldRelease(input);
    const release = await buildWorldRelease({ ...valid, worldId: globalThis.crypto.randomUUID(), revision: 1, authorAccountId: 'local' });
    await this.store.put({ id: release.worldId, updated: Date.now(), release });
    return release;
  }

  async latest() {
    const drafts = await this.store.list();
    const draft = drafts.sort((a, b) => b.updated - a.updated)[0];
    if (!draft) throw new Error('还没有保存过世界草稿');
    return draft.release;
  }

  async preview(input) {
    const release = await verifyWorldRelease(input);
    const { catalog } = worldRuntime(release, globalThis.RoomKitAssets);
    this.view.open(release, catalog);
    if (this.app.opts.site) this.app.shell.hub.entered();
    else if (this.app.shell.page === 'social') this.app.shell.render();
    else this.app.shell.open('social');
    return release;
  }
}
