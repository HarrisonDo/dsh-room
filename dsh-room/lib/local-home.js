import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyHome, HOME_ID, HOME_LIMIT, HOME_VERSION, homeKey, homeKeys } from '../shared/local-home-format.js';

const LEASE_MS = 12000;
const problem = (code, message) => Object.assign(new Error(message), { code });
const stale = () => problem('stale', '房间已交给另一个窗口');

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== HOME_VERSION || !snapshot.keys
    || typeof snapshot.keys !== 'object' || Array.isArray(snapshot.keys)
    || !Object.entries(snapshot.keys).every(([key, value]) => homeKey(key) && typeof value === 'string')) {
    throw problem('invalid', '房间存档格式无效');
  }
  for (const records of [snapshot.packs, snapshot.drafts]) {
    if (!Array.isArray(records) || records.length > 2048 || !records.every(item => typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 160)
      || new Set(records.map(item => item.id)).size !== records.length) throw problem('invalid', '家具包或世界草稿格式无效');
  }
  const data = { version: HOME_VERSION, keys: snapshot.keys, packs: snapshot.packs, drafts: snapshot.drafts };
  if (Buffer.byteLength(JSON.stringify(data)) > HOME_LIMIT) throw problem('too_large', '房间和素材超过本机接续的 64 MB 上限');
  return data;
}

async function readJSON(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function putFile(file, data) {
  const temp = file + '.' + randomUUID();
  try {
    await writeFile(temp, JSON.stringify(data), { flag: 'wx', mode: 0o600, flush: true });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

/** Host-local authority. All transfers go through the same queue as snapshot writes. */
export function createLocalHome({ directory, legacyFile, now = Date.now }) {
  const file = path.join(directory, 'home.json');
  const backup = path.join(directory, 'home-legacy-browser.json');
  let lock, disposed = false, loaded = false, document = null, current = null, chain = Promise.resolve();

  async function read() {
    if (loaded) return;
    if (!lock) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const { DatabaseSync } = await import('node:sqlite');
      const writer = new DatabaseSync(path.join(directory, 'home-writer.sqlite'));
      try { writer.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
      catch (error) {
        writer.close();
        if (error.errcode === 5) throw problem('busy', '这个 DSH profile 已由另一个宿主打开');
        throw error;
      }
      lock = writer;
    }
    const stored = await readJSON(file);
    if (stored) {
      if (!Number.isSafeInteger(stored.revision) || stored.revision < 1) throw problem('invalid', '现有房间存档无法读取');
      document = { revision: stored.revision, snapshot: validateSnapshot(stored.snapshot) };
    }
    loaded = true;
  }
  function serial(fn) {
    if (disposed) return Promise.reject(stale());
    const next = chain.then(async () => { await read(); expire(); return fn(); });
    chain = next.catch(() => {});
    return next;
  }
  function replace(lease) {
    current?.abort.abort();
    current = lease;
  }
  function expire() {
    if (current?.kind === 'embed' && current.until <= now()) replace(null);
  }
  function lease(kind, view, handoff) {
    return { kind, view, handoff, epoch: randomUUID(), sequence: 0, until: now() + LEASE_MS, abort: new AbortController() };
  }
  function own(kind, input, handoff) {
    expire();
    if (!current || current.kind !== kind || current.view !== input?.view || current.epoch !== input?.epoch
      || (kind === 'desktop' && current.handoff !== handoff)) throw stale();
    if (kind === 'embed') current.until = now() + LEASE_MS;
    return current;
  }
  function viewState() {
    return current ? { owner: current.kind } : { owner: null };
  }
  function claimState() {
    return { ...viewState(), epoch: current.epoch, sequence: current.sequence, snapshot: document.snapshot };
  }
  async function commit(snapshot) {
    const next = { revision: (document?.revision || 0) + 1, snapshot: validateSnapshot(snapshot) };
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await putFile(file, next);
    document = next;
  }
  async function save(owner, input, transfer = false) {
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw problem('invalid', '存档顺序无效');
    if (input.sequence <= owner.sequence) {
      if (transfer) throw stale();
      return;
    }
    await commit(input.snapshot);
    owner.sequence = input.sequence;
  }

  return {
    writeLegacy: (write) => serial(async () => {
      if (document) return false;
      await write();
      return true;
    }),
    status: (input) => serial(() => {
      const owned = current?.kind === 'embed' && current.view === input?.view && current.epoch === input?.epoch;
      if (owned) own('embed', input);
      return { ...viewState(), owned };
    }),
    acquire: (input) => serial(async () => {
      const { view, legacy } = input || {};
      if (typeof view !== 'string' || !HOME_ID.test(view)) throw problem('invalid', '房间窗口标识无效');
      if (current && (current.kind !== 'embed' || current.view !== view)) return viewState();
      if (!document) {
        if (legacy === undefined) return { ...viewState(), initialize: true };
        const browser = validateSnapshot(legacy);
        const old = legacyFile ? homeKeys(await readJSON(legacyFile)) : {};
        await mkdir(directory, { recursive: true, mode: 0o700 });
        // Keep both browser/IndexedDB and the previous host store; the old host file is never replaced.
        if (!await readJSON(backup)) await putFile(backup, browser);
        await commit({ ...browser, keys: { ...browser.keys, ...old } });
      }
      if (!current) replace(lease('embed', view));
      own('embed', { view, epoch: current.epoch });
      return claimState();
    }),
    acquireDesktop: (input, handoff) => serial(() => {
      const view = input?.view;
      if (typeof view !== 'string' || !HOME_ID.test(view)) throw problem('invalid', '房间窗口标识无效');
      if (current?.kind !== 'desktop' || current.handoff !== handoff || (current.view && current.view !== view)) throw stale();
      current.view = view;
      return claimState();
    }),
    save: (kind, input, handoff) => serial(async () => { await save(own(kind, input, handoff), input); }),
    release: (input) => serial(async () => {
      const owner = own('embed', input);
      if (input.snapshot) await save(owner, input);
      replace(null);
    }),
    beginDesktop: (input) => serial(async () => {
      await save(own('embed', input), input, true);
      const handoff = randomUUID();
      replace(lease('desktop', null, handoff));
      return handoff;
    }),
    leaveDesktop: (input, handoff, rotate = false) => serial(async () => {
      await save(own('desktop', input, handoff), input, true);
      replace(rotate ? lease('desktop', null, handoff) : null);
    }),
    desktopExited: (handoff) => serial(() => {
      if (current?.kind === 'desktop' && current.handoff === handoff) replace(null);
    }),
    modelSignal: (kind, input, handoff) => serial(() => own(kind, input, handoff).abort.signal),
    cancelModel: (kind, input, handoff) => serial(() => {
      const owner = own(kind, input, handoff);
      owner.abort.abort();
      owner.abort = new AbortController();
    }),
    active: () => serial(() => Boolean(document)),
    dispose() {
      if (disposed) return chain;
      disposed = true;
      return chain.then(() => { replace(null); lock?.close(); });
    },
  };
}
