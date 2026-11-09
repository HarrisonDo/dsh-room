import { accountOrigin, accountScope, characterIdentity } from '../../shared/account-identity.js';
import { publicLook } from '../../shared/public-appearance.js';

const string = (value) => typeof value === 'string' ? value : '';

export function createAccountClient({ storage } = {}) {
  let session;
  let pending;
  let snapshot = null;

  function clear() {
    const previous = pending;
    session = undefined;
    pending = undefined;
    snapshot = null;
    previous?.abort();
  }

  async function send(method, payload) {
    if (!session) throw new Error('请先确认账号');
    if (pending) throw new Error('账户请求进行中');
    const current = session;
    const controller = new AbortController();
    pending = controller;
    const isCurrent = () => session === current && pending === controller;
    try {
      const result = await current.request(method, payload, { signal: controller.signal });
      if (!isCurrent()) return null;
      if (result?.account?.id !== current.accountId || !Array.isArray(result.characters)) {
        throw new Error('账户响应与当前账号不匹配');
      }
      const characters = result.characters.filter((role) => typeof role?.id === 'string' && role.id)
        .map(({ id, name, kind, look }) => ({ id, name: string(name), kind: kind === 'whale' ? 'whale' : 'girl', look: publicLook(look) }));
      const id = result.defaultCharacterId;
      if (!characters.some((role) => role.id === id)) throw new Error('服务未返回有效的默认角色');
      const identity = characterIdentity(current.origin, current.accountId, id);
      const capabilities = Object.fromEntries(['identity', 'defaultCharacter', 'homeSnapshots', 'assetValidation', 'resourceSync', 'deviceSessions']
        .map((key) => [key, result.capabilities?.[key] === true]));
      const next = {
        account: { id: current.accountId, provider: string(result.account.provider), name: string(result.account.name) },
        characters, defaultCharacterId: id, identity, capabilities,
      };
      // A local selection hint is optional. The server remains authoritative.
      try { storage?.set(current.scope, id); } catch { /* storage unavailable */ }
      if (!isCurrent()) return null;
      snapshot = next;
      return structuredClone(next);
    } catch (error) {
      if (!isCurrent()) return null;
      if ([401, 403].includes(error?.status ?? error?.code) && error?.reason !== 'character_forbidden' && error?.code !== 'character_forbidden') clear();
      throw error;
    } finally {
      if (pending === controller) pending = undefined;
    }
  }

  return {
    switchAccount({ service, accountId, request }) {
      const origin = accountOrigin(service);
      const scope = accountScope(origin, accountId);
      if (typeof request !== 'function') throw new TypeError('缺少当前账号的请求适配器');
      clear();
      session = { origin, accountId, scope, request };
    },
    clear,
    get snapshot() { return snapshot && structuredClone(snapshot); },
    bootstrap: () => send('accountBootstrap', {}),
    selectDefaultCharacter: (characterId) => send('accountSelectDefaultCharacter', { characterId }),
  };
}
