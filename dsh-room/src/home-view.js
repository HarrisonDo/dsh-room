import { emptyHome, homeKey, HOME_LIMIT } from '../shared/local-home-format.js';

export async function legacyBrowserHome(PackStore) {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && homeKey(key)) keys[key] = localStorage.getItem(key);
  }
  const [packs, drafts] = await Promise.all([
    new PackStore('dsh-room').listStrict(), new PackStore('dsh-room-world-drafts').listStrict(),
  ]);
  const snapshot = { ...emptyHome(), keys, packs, drafts };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > HOME_LIMIT) {
    throw Object.assign(new Error('房间和素材超过本机接续的 64 MB 上限'), { code: 'too_large' });
  }
  return snapshot;
}

/** A view keeps an in-memory copy. Only acknowledged saves may cross the host boundary. */
export function homeView({ claim, view, localStore, send, onError }) {
  const { epoch } = claim;
  const keys = { ...claim.snapshot.keys };
  const packs = new Map(claim.snapshot.packs.map(item => [item.id, item]));
  const drafts = new Map(claim.snapshot.drafts.map(item => [item.id, item]));
  let sequence = claim.sequence, dirty = 0, saved = 0, pending, timer, paused = false, app;
  const identity = { view, epoch };
  const snapshot = () => ({ ...emptyHome(), keys, packs: [...packs.values()], drafts: [...drafts.values()] });
  const next = () => ({ ...identity, sequence: ++sequence, snapshot: snapshot() });

  function flush() {
    if (paused || dirty === saved) return pending || Promise.resolve();
    if (pending) return pending;
    const captured = dirty;
    pending = send('save', next()).then(() => { saved = captured; }).finally(() => { pending = null; });
    return pending;
  }
  function changed() {
    dirty++;
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(onError), 350);
  }
  function mutable() {
    if (paused) throw new Error('房间正在切换窗口');
  }
  function records(items) {
    return {
      async list() { return structuredClone([...items.values()]); },
      async get(id) { return structuredClone(items.get(id)); },
      async put(item) {
        mutable();
        const previous = items.get(item.id);
        items.set(item.id, structuredClone(item));
        if (new TextEncoder().encode(JSON.stringify(snapshot())).byteLength > HOME_LIMIT) {
          if (previous) items.set(item.id, previous); else items.delete(item.id);
          throw new Error('房间和素材超过本机接续的 64 MB 上限');
        }
        changed();
      },
      async remove(id) { mutable(); items.delete(id); changed(); },
    };
  }
  const storage = localStore('dsh-room', {
    get length() { return Object.keys(keys).length; },
    key: index => Object.keys(keys)[index] || null,
    getItem: key => keys[key] ?? null,
    setItem(key, value) { mutable(); if (keys[key] !== value) { keys[key] = value; changed(); } },
    removeItem(key) { mutable(); if (key in keys) { delete keys[key]; changed(); } },
  });
  return {
    identity,
    options: { storage, storageKey: 'dsh-room', packStore: records(packs), draftStore: records(drafts), initialStoredPacks: structuredClone(claim.snapshot.packs) },
    attach(instance) {
      app = instance;
      const retry = setInterval(() => flush().catch(onError), 1800);
      return () => { clearTimeout(timer); clearInterval(retry); };
    },
    group: () => keys['dsh-room.group'] === '1',
    setGroup(on) { mutable(); keys['dsh-room.group'] = on ? '1' : '0'; changed(); },
    async handoff(action, before) {
      if (paused || app.visiting || app.worldSession.id || app.town.thread || app._going) throw new Error('请先回家并结束当前换房，再切换窗口');
      app.pauseHome(true);
      app.checkpointHome();
      paused = true;
      clearTimeout(timer);
      await before?.();
      await pending?.catch(() => {});
      return send(action, next());
    },
    resume() {
      if (!paused) return;
      paused = false;
      app.pauseHome(false);
      changed();
    },
    async close(release = false, keepalive = false) {
      if (paused) return;
      app.checkpointHome();
      clearTimeout(timer);
      await pending?.catch(() => {});
      if (release) return send('release', next(), keepalive);
      return flush();
    },
  };
}
