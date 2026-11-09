import { accountOrigin, accountScope } from '../../shared/account-identity.js';
import { RESOURCE_FORMAT, resourceId, validateAccountHome } from '../../shared/account-resource.js';

const empty = () => ({ baselineVersion: null, deleted: false, draft: null, dirty: false, pending: null, conflict: null });
const conflictCodes = new Set(['version_conflict', 'mutation_expired', 'resource_state_conflict', 'resource_not_found']);
const errorCode = error => error?.reason || error?.code;
const version = value => Number.isSafeInteger(value) && value >= 0;
const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function syncError(kind, cause) {
  return Object.assign(new Error(cause.message, { cause }), { kind });
}

function checkHome(raw, id) {
  const home = validateAccountHome(raw);
  if (home.homeId !== id) throw new Error('家标识与资源不匹配');
  return home;
}

function parseRemote(value, scope) {
  if (value?.resourceId !== scope.id || !version(value.syncVersion) || value.syncVersion < 1 ||
      typeof value.deleted !== 'boolean' || (value.accountId !== undefined && value.accountId !== scope.accountId)) {
    throw new Error('账户资源响应无效');
  }
  const { resourceId, syncVersion, deleted } = value;
  return deleted ? { resourceId, syncVersion, deleted }
    : { resourceId, syncVersion, deleted, payload: checkHome(value.payload, scope.id) };
}

function restore(raw, scope) {
  if (raw == null) return empty();
  const { key, state } = raw;
  if (key !== scope.key || !state || (state.baselineVersion !== null && !version(state.baselineVersion)) ||
      typeof state.deleted !== 'boolean' || typeof state.dirty !== 'boolean') throw new Error('本机同步记录无效');
  const result = {
    baselineVersion: state.baselineVersion, deleted: state.deleted,
    draft: state.draft === null ? null : checkHome(state.draft, scope.id), dirty: state.dirty,
    pending: null, conflict: null,
  };
  if (state.pending != null) {
    const { baseVersion, mutationId, payload } = state.pending;
    if (baseVersion !== result.baselineVersion || !version(baseVersion) || typeof mutationId !== 'string' ||
        !mutationId.startsWith(baseVersion + ':') || !/^[0-9]+:[a-zA-Z0-9_-]{1,80}$/.test(mutationId) ||
        result.deleted || !result.dirty || !result.draft) throw new Error('本机待提交记录无效');
    result.pending = { baseVersion, mutationId, payload: checkHome(payload, scope.id) };
  }
  if (state.conflict != null) {
    if (!result.dirty || !result.pending || !conflictCodes.has(state.conflict.reason)) throw new Error('本机冲突记录无效');
    result.conflict = { reason: state.conflict.reason, remote: state.conflict.remote === null ? null : parseRemote(state.conflict.remote, scope) };
  }
  if ((result.dirty && !result.draft) || (result.deleted && (!result.baselineVersion || result.draft))) {
    throw new Error('本机草稿状态无效');
  }
  return result;
}

export function createHomeSyncClient({ storage, mutationNonce = () => globalThis.crypto.randomUUID() }) {
  let current;
  let localQueue = Promise.resolve();

  function serialized(operation) {
    const job = localQueue.then(operation);
    localQueue = job.catch(() => {});
    return job;
  }

  function clear() {
    const previous = current;
    current = undefined;
    previous?.controller.abort();
  }

  function snapshot() {
    if (!current?.state) return null;
    const state = structuredClone(current.state);
    return {
      ...state,
      unsavedDraft: current.unsavedDraft ? structuredClone(current.unsavedDraft) : null,
      localSaved: state.draft !== null && !current.unsavedDraft,
      synced: state.baselineVersion > 0 && !state.dirty && !state.pending && !state.conflict && !current.unsavedDraft,
    };
  }

  async function compareAndSave(key, expected, state) {
    const revision = (expected ?? 0) + 1;
    let applied;
    try {
      applied = await storage.compareAndSet(key, expected, structuredClone({ key, revision, state }));
    } catch (error) { throw syncError('storage', error); }
    if (applied !== true) throw syncError('storage_conflict', new Error('本机记录已被另一窗口更新'));
    return revision;
  }

  async function save(scope, state) {
    scope.revision = await compareAndSave(scope.key, scope.revision, state);
    if (current === scope) scope.state = state;
  }

  function local(scope, operation) {
    return serialized(async () => {
      if (current !== scope) return null;
      try { return await operation(); }
      catch (error) { if (current !== scope) return null; throw error; }
    });
  }

  function active() {
    if (!current?.state) throw new Error('请先打开本机同步记录');
    return current;
  }

  async function request(scope, method, body) {
    try { return await scope.request(method, structuredClone(body), { signal: scope.controller.signal }); }
    catch (error) { throw syncError('request', error); }
  }

  async function remote(scope, { allowMissing = false } = {}) {
    let reply;
    try { reply = await request(scope, 'accountResourceGet', { resourceId: scope.id }); }
    catch (error) {
      if (allowMissing && errorCode(error.cause) === 'resource_not_found') return null;
      throw error;
    }
    try { return parseRemote(reply, scope); }
    catch (error) { throw syncError('protocol', error); }
  }

  function fromRemote(reply) {
    return { ...empty(), baselineVersion: reply.syncVersion, deleted: reply.deleted, draft: reply.deleted ? null : reply.payload };
  }

  async function network(scope, operation) {
    if (scope.busy) throw new Error('账户家请求进行中');
    scope.busy = true;
    try { return await operation(); }
    catch (error) { if (current !== scope) return null; throw error; }
    finally { scope.busy = false; }
  }

  return {
    async open({ service, accountId, resourceId: id, request, create = false }) {
      const origin = accountOrigin(service);
      const key = JSON.stringify([...JSON.parse(accountScope(origin, accountId)), resourceId(id)]);
      if (typeof request !== 'function') throw new TypeError('缺少当前账号请求适配器');
      clear();
      const scope = { id, accountId, key, request, controller: new AbortController() };
      current = scope;
      return local(scope, async () => {
        let state;
        try {
          const raw = await storage.get(key);
          if (raw != null && (!version(raw.revision) || raw.revision < 1)) throw new Error('本机记录版本无效');
          state = restore(raw, scope);
          scope.revision = raw?.revision ?? null;
        }
        catch (error) { throw syncError('storage', error); }
        if (current !== scope) return null;
        if (create && state.baselineVersion === null) await save(scope, { ...state, baselineVersion: 0 });
        else scope.state = state;
        return current === scope ? snapshot() : null;
      });
    },
    clear,
    get snapshot() { return snapshot(); },
    async pull() {
      const scope = active();
      return network(scope, async () => {
        if (scope.state.dirty || scope.unsavedDraft) throw new Error('请先处理本机草稿');
        const reply = await remote(scope);
        return local(scope, async () => {
          if (scope.state.dirty || scope.unsavedDraft) throw new Error('拉取期间有新的本机草稿');
          if (scope.state.baselineVersion > reply.syncVersion) throw syncError('protocol', new Error('远端版本倒退'));
          await save(scope, fromRemote(reply));
          return current === scope ? snapshot() : null;
        });
      });
    },
    async edit(home) {
      const scope = active();
      const draft = checkHome(home, scope.id);
      return local(scope, async () => {
        if (scope.state.deleted) throw new Error('账户家已删除，请另存副本或显式恢复');
        try { await save(scope, { ...scope.state, draft, dirty: true }); }
        catch (error) { scope.unsavedDraft = draft; throw error; }
        scope.unsavedDraft = null;
        return current === scope ? snapshot() : null;
      });
    },
    async flush() {
      const scope = active();
      return network(scope, async () => {
        const pending = await local(scope, async () => {
          const state = scope.state;
          if (scope.unsavedDraft) throw new Error('请先重试本机保存或另存副本');
          if (state.conflict || !state.dirty) return null;
          if (state.baselineVersion === null) throw new Error('缺少账户基线，请先读取或显式新建');
          if (state.pending) return state.pending;
          const nonce = mutationNonce();
          if (typeof nonce !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(nonce)) throw new Error('操作标识无效');
          const next = { baseVersion: state.baselineVersion, mutationId: state.baselineVersion + ':' + nonce, payload: state.draft };
          await save(scope, { ...state, pending: next });
          return next;
        });
        if (current !== scope) return null;
        if (!pending) return snapshot();
        let reply;
        try {
          reply = await request(scope, 'accountResourcePut', {
            format: RESOURCE_FORMAT, schemaVersion: 1, kind: 'home', resourceId: scope.id, ...pending,
          });
        } catch (error) {
          const reason = errorCode(error.cause);
          if (current !== scope || !conflictCodes.has(reason)) throw error;
          const latest = await remote(scope, { allowMissing: true });
          return local(scope, async () => {
            if (latest && latest.syncVersion < pending.baseVersion) throw syncError('protocol', new Error('远端版本倒退'));
            await save(scope, { ...scope.state, conflict: { reason, remote: latest } });
            return current === scope ? snapshot() : null;
          });
        }
        return local(scope, async () => {
          if (reply?.resourceId !== scope.id || reply.syncVersion !== pending.baseVersion + 1 ||
              reply.deleted !== false || (reply.accountId !== undefined && reply.accountId !== scope.accountId)) {
            throw syncError('protocol', new Error('账户家写入回执无效'));
          }
          const state = scope.state;
          await save(scope, { ...state, baselineVersion: reply.syncVersion, pending: null, dirty: !sameDraft(state.draft, pending.payload) });
          return current === scope ? snapshot() : null;
        });
      });
    },
    async adoptRemote() {
      const scope = active();
      return local(scope, async () => {
        if (scope.unsavedDraft) throw new Error('请先处理未保存的本机草稿');
        const reply = scope.state.conflict?.remote;
        if (!reply) throw new Error('没有可采用的账户版本');
        await save(scope, fromRemote(reply));
        return current === scope ? snapshot() : null;
      });
    },
    async forkLocalCopy(copyId) {
      const scope = active();
      const parts = JSON.parse(scope.key);
      const key = JSON.stringify([parts[0], parts[1], resourceId(copyId)]);
      if (key === scope.key) throw new Error('副本需要新的资源标识');
      return local(scope, async () => {
        const original = scope.unsavedDraft || scope.state.draft;
        if (!original) throw new Error('没有可复制的草稿');
        const draft = checkHome({ ...original, homeId: copyId }, copyId);
        await compareAndSave(key, null, { ...empty(), draft, dirty: true });
        scope.unsavedDraft = null;
        return current === scope ? copyId : null;
      });
    },
  };
}
