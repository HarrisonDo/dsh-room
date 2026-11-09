import { createHash } from 'node:crypto';
import { accountError, fields, RESOURCE_FORMAT, resourceId, validateAccountHome } from '../shared/account-resource.js';
import { MAX_ACCOUNT_HOMES, MUTATION_WINDOW } from './account-resource-store.mjs';

const absent = () => accountError(404, 'resource_not_found', '找不到账户家');
const meta = (id, row) => ({ resourceId: id, syncVersion: row.syncVersion, deleted: Boolean(row.deleted) });

export function createAccountResourceApi({ resources, withAccount, validateDependencies }) {
  function requireAssets(accountId, home) {
    if (!home.assetRefs.length) return;
    if (typeof validateDependencies !== 'function') throw accountError(409, 'unsupported', '素材验证暂未接入');
    if (validateDependencies({ accountId, home }) !== true) {
      throw accountError(409, 'missing_asset', '素材缺失或不可用');
    }
  }

  function mutate(action, payload, context) {
    return withAccount(context, ({ id: account }) => {
      const envelope = ['format', 'schemaVersion', 'kind', 'resourceId', 'baseVersion', 'mutationId'];
      fields(payload, action === 'put' ? [...envelope, 'payload'] : envelope, 'mutation');
      const { format, schemaVersion, kind, baseVersion, mutationId } = payload;
      if (format !== RESOURCE_FORMAT || schemaVersion !== 1 || kind !== 'home') {
        throw accountError(400, 'unsupported_format', '不支持的资源格式');
      }
      const id = resourceId(payload.resourceId);
      if (!Number.isSafeInteger(baseVersion) || baseVersion < 0 || baseVersion >= Number.MAX_SAFE_INTEGER ||
          typeof mutationId !== 'string' || !mutationId.startsWith(baseVersion + ':') ||
          !/^[0-9]+:[a-zA-Z0-9_-]{1,80}$/.test(mutationId)) {
        throw accountError(400, 'invalid_mutation', '操作标识必须与基线版本绑定');
      }
      const row = resources.get(account, id);
      if (!row && (action !== 'put' || baseVersion !== 0)) throw absent();

      const home = action === 'put' ? validateAccountHome(payload.payload) : null;
      if (home && home.homeId !== id) throw accountError(400, 'invalid_resource', '家与资源标识必须一致');
      const digest = createHash('sha256').update(JSON.stringify([action, baseVersion, home])).digest('hex');
      const saved = resources.receipt(account, id, mutationId);
      if (saved) {
        if (saved.digest !== digest) throw accountError(409, 'mutation_reused', '操作标识已用于其他内容');
        return JSON.parse(saved.resultJson);
      }
      const current = row?.syncVersion ?? 0;
      if (baseVersion !== current) {
        const expired = baseVersion < current - MUTATION_WINDOW;
        throw Object.assign(accountError(409, expired ? 'mutation_expired' : 'version_conflict',
          expired ? '操作已超出回执保留窗口，请重新读取账户家' : '账户家版本已变化'), { currentVersion: current });
      }
      if (action === 'restore' ? !row.deleted : row?.deleted) {
        throw accountError(409, 'resource_state_conflict', '账户家的删除状态与操作不匹配');
      }
      if (!row && resources.count(account) >= MAX_ACCOUNT_HOMES) {
        throw accountError(409, 'resource_quota', '账户家数量已达上限');
      }
      const homeJson = home ? JSON.stringify(home) : row.homeJson;
      if (action !== 'delete') requireAssets(account, home || JSON.parse(homeJson));
      const result = { resourceId: id, syncVersion: current + 1, deleted: action === 'delete' };
      resources.save(account, result, homeJson);
      resources.remember(account, result, mutationId, digest);
      return result;
    });
  }

  return {
    accountResourceList(payload, context) {
      return withAccount(context, ({ id }) => {
        fields(payload, [], 'list');
        return { resources: resources.list(id) };
      });
    },
    accountResourceGet(payload, context) {
      return withAccount(context, ({ id }) => {
        fields(payload, ['resourceId'], 'get');
        const resource = resourceId(payload.resourceId);
        const row = resources.get(id, resource);
        if (!row) throw absent();
        const result = meta(resource, row);
        if (!result.deleted) result.payload = JSON.parse(row.homeJson);
        return result;
      });
    },
    accountResourcePut: (payload, context) => mutate('put', payload, context),
    accountResourceDelete: (payload, context) => mutate('delete', payload, context),
    accountResourceRestore: (payload, context) => mutate('restore', payload, context),
  };
}
