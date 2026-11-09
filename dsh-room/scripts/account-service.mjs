import { createAccountResourceApi } from './account-resource-service.mjs';

const failure = (code, reason, message) => Object.assign(new Error(message), { code, reason });

// authenticate(context) resolves only a currently valid authenticated account ID.
export function createAccountService({ store, authenticate, validateDependencies, enableResources = Boolean(store.resources) }) {
  const resources = enableResources ? store.resources : null;
  function withAccount(context, operation) {
    return store.transaction(() => {
      const id = authenticate(context);
      const account = typeof id === 'string' && id && store.account(id);
      if (!account) throw failure(401, 'unauthorized', '请先登录');
      if (store.banned(id)) throw failure(403, 'account_banned', '账号已被封禁');
      return operation({ id: account.id, provider: account.provider || '', name: account.name || '' });
    });
  }

  function snapshot(account, characters, defaultCharacterId) {
    return {
      account, characters, defaultCharacterId,
      capabilities: {
        identity: true, defaultCharacter: true, homeSnapshots: Boolean(resources),
        assetValidation: Boolean(resources) && typeof validateDependencies === 'function',
        resourceSync: false, deviceSessions: false,
      },
    };
  }

  return {
    ...(resources ? createAccountResourceApi({ resources, withAccount, validateDependencies }) : {}),
    accountBootstrap(_payload, context) {
      return withAccount(context, (account) => {
        let characters = store.characters(account.id);
        if (!characters.length) {
          store.createNeutral(account.id);
          characters = store.characters(account.id);
        }
        let defaultId = store.defaultCharacter(account.id);
        if (!characters.some(({ id }) => id === defaultId)) {
          defaultId = characters[0].id;
          store.setDefault(account.id, defaultId);
        }
        return snapshot(account, characters, defaultId);
      });
    },
    accountSelectDefaultCharacter(payload, context) {
      return withAccount(context, (account) => {
        const id = payload?.characterId;
        if (typeof id !== 'string' || !id || id.length > 128) {
          throw failure(400, 'invalid_character', '角色标识无效');
        }
        const characters = store.characters(account.id);
        if (!characters.some((character) => character.id === id)) {
          throw failure(403, 'character_forbidden', '角色不属于当前账号');
        }
        store.setDefault(account.id, id);
        return snapshot(account, characters, id);
      });
    },
  };
}
