import { randomUUID } from 'node:crypto';
import { digestJSON, verifyWorldRelease } from '../shared/world-format.js';
import { createWorldSessions } from './world-sessions.mjs';

const DAY = 86_400_000;
const WORLD_LIMIT = 20;
const PUBLISH_LIMIT = 12;
export const serviceError = (code, message) => Object.assign(new Error(message), { code });

async function checkRelease(input) {
  try { return await verifyWorldRelease(input); }
  catch (error) {
    if (!error.field) throw error;
    throw serviceError(error.code === 'body_too_large' ? 413 : 400, error.message);
  }
}

async function bindRelease(input, worldId, revision, authorAccountId) {
  const { hash, ...data } = input;
  const release = { ...data, worldId, revision, authorAccountId };
  return { ...release, hash: await digestJSON(release) };
}

const PUBLIC_SEATS = 8;
const PUBLIC_SESSIONS = 4;

function listingInput(p) {
  const seats = p.seats ?? PUBLIC_SEATS, maxSessions = p.maxSessions ?? PUBLIC_SESSIONS;
  if (!Number.isSafeInteger(seats) || seats < 2 || seats > 16 || !Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 16) throw serviceError(400, '人数或场次上限不合法');
  if (p.summary != null && (typeof p.summary !== 'string' || p.summary.length > 120)) throw serviceError(400, '简介最多 120 字');
  if (p.sort != null && !Number.isSafeInteger(p.sort)) throw serviceError(400, '排序值不合法');
  return { seats, maxSessions, summary: (p.summary || '').trim(), sort: p.sort || 0 };
}

export function createWorldService({ store, account, actor, allowWrite, moderate, canSpeak, identityActive, options, isStaff, publicAccess }) {
  function owned(id, owner) {
    if (typeof id !== 'string' || id.length > 80) throw serviceError(400, '世界 id 不合法');
    const world = store.definition(id);
    if (!world || world.ownerAccountId !== owner) throw serviceError(404, '没有可访问的世界');
    return world;
  }

  function beforeWrite(p, ctx) {
    const owner = account(p, ctx);
    allowWrite(owner, ctx);
    return owner;
  }

  function createIfNeeded(world, id, owner, title, at) {
    if (world) return;
    if (store.count(owner) >= WORLD_LIMIT) throw serviceError(429, '已达到世界数量上限');
    store.insert(id, owner, title, at);
  }

  const api = {
    async worldSave(p, ctx) {
      const owner = beforeWrite(p, ctx);
      const world = p.worldId == null ? null : owned(p.worldId, owner);
      const id = world?.worldId || randomUUID();
      const input = await checkRelease(p.release);
      const draft = await bindRelease(input, id, Math.max(1, world?.revision || 0), owner);
      return store.transaction(() => {
        if (account(p, ctx) !== owner) throw serviceError(403, '账号已失去权限');
        if (world) owned(id, owner);
        const at = Date.now();
        createIfNeeded(world, id, owner, draft.title, at);
        store.saveDraft(id, draft, at);
        return { world: store.definition(id), draft };
      });
    },

    async worldPublish(p, ctx) {
      const owner = beforeWrite(p, ctx);
      const world = p.worldId == null ? null : owned(p.worldId, owner);
      if (store.releaseCount(owner, Date.now() - DAY) >= PUBLISH_LIMIT) throw serviceError(429, '已达到今天的发布额度');
      const id = world?.worldId || randomUUID();
      const previous = world?.revision || 0;
      if (p.expectedRevision != null && p.expectedRevision !== previous) throw serviceError(409, '世界版本已更新，请刷新后发布');
      const input = await checkRelease(p.release ?? (world && store.draft(id)));
      const release = await bindRelease(input, id, previous + 1, owner);
      return store.transaction(() => {
        if (account(p, ctx) !== owner) throw serviceError(403, '账号已失去权限');
        if (world && owned(id, owner).revision !== previous) throw serviceError(409, '世界版本已更新，请刷新后发布');
        const at = Date.now();
        if (store.releaseCount(owner, at - DAY) >= PUBLISH_LIMIT) throw serviceError(429, '已达到今天的发布额度');
        createIfNeeded(world, id, owner, release.title, at);
        store.publish(release, at);
        return { world: store.definition(id), release };
      });
    },

    worldGet(p, ctx) {
      const owner = account(p, ctx);
      if (p.sessionId != null && p.draft !== true) {
        const { record: { state } } = sessions.access(p.sessionId, owner);
        if ((p.worldId != null && p.worldId !== state.worldId) || (p.revision != null && p.revision !== state.revision)) throw serviceError(404, '没有此场次版本');
        const release = store.release(state.worldId, state.revision);
        if (!release) throw serviceError(404, '没有此发布版本');
        return { release };
      }
      const world = owned(p.worldId, owner);
      if (p.draft === true) return { world, draft: store.draft(world.worldId) };
      const revision = p.revision ?? world.revision;
      if (!Number.isSafeInteger(revision) || revision < 1) throw serviceError(404, '没有此发布版本');
      const release = store.release(world.worldId, revision);
      if (!release) throw serviceError(404, '没有此发布版本');
      return { world, release };
    },

    /** 站点管理者把某个已发布版本列入/移出公共目录；正在进行的旧场次继续使用原版本 */
    publicWorldSet(p, ctx) {
      const staff = account(p, ctx);
      if (!isStaff?.(staff)) throw serviceError(403, '只有站点管理者可以管理公共目录');
      allowWrite(staff, ctx);
      if (typeof p.worldId !== 'string' || p.worldId.length > 80) throw serviceError(400, '世界 id 不合法');
      const input = listingInput(p);
      return store.transaction(() => {
        const world = store.definition(p.worldId);
        if (!world) throw serviceError(404, '没有这个世界');
        const revision = p.revision ?? world.revision;
        if (!Number.isSafeInteger(revision) || revision < 1 || !store.release(world.worldId, revision)) throw serviceError(404, '没有此发布版本');
        store.setListing({ worldId: world.worldId, revision, listed: p.listed !== false, ...input }, Date.now());
        return { listing: store.listing(world.worldId) };
      });
    },

    worldList(p, ctx) {
      const owner = account(p, ctx);
      const { limit = 20, offset = 0 } = p;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) throw serviceError(400, '分页参数不合法');
      const rows = store.list(owner, limit + 1, offset);
      return { worlds: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
    },
  };
  const sessions = createWorldSessions({ store, account, actor, allowWrite, moderate, canSpeak, identityActive, owned, options, publicAccess });

  /**
   * 运营方随服务一起发布的公共世界：内容摘要变了才发新版本，旧场次继续用原版本。
   * release 由 buildWorldRelease 生成（worldId 与 revision 会在这里重新绑定）。
   */
  async function seedPublicWorld({ worldId, owner, release: input, listing = {} }) {
    const checked = await checkRelease(input);
    const world = store.definition(worldId);
    if (world && world.ownerAccountId !== owner) throw serviceError(409, '公共世界 id 已被占用');
    const current = world?.revision ? store.release(worldId, world.revision) : null;
    const same = current && current.scene && await digestJSON({ ...checked, worldId, revision: 0, authorAccountId: owner, hash: '' })
      === await digestJSON({ ...current, revision: 0, hash: '' });
    const release = same ? current : await bindRelease(checked, worldId, (world?.revision || 0) + 1, owner);
    const options = listingInput(listing);
    store.transaction(() => {
      const at = Date.now();
      if (!same) {
        if (!store.definition(worldId)) store.insert(worldId, owner, release.title, at);
        store.publish(release, at);
      }
      const old = store.listing(worldId);
      if (!same || !old || old.seats !== options.seats || old.maxSessions !== options.maxSessions || old.summary !== options.summary || old.sort !== options.sort) {
        store.setListing({ worldId, revision: release.revision, listed: old ? old.listed : true, ...options }, at);
      }
    });
    return { worldId, revision: release.revision, published: !same };
  }

  return { api: { ...api, ...sessions.api }, sessions, seedPublicWorld };
}
