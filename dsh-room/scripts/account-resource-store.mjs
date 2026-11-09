export const MAX_ACCOUNT_HOMES = 32;
export const MUTATION_WINDOW = 64;

export function createAccountResourceStore({ q }) {
  return {
    list: (account) => q(`
      SELECT resource_id AS resourceId, sync_version AS syncVersion, deleted FROM account_resources
      WHERE account_id = ? ORDER BY resource_id LIMIT ?
    `).all(account, MAX_ACCOUNT_HOMES).map(row => ({ ...row, deleted: Boolean(row.deleted) })),
    get: (account, id) => q(`
      SELECT sync_version AS syncVersion, deleted, home_json AS homeJson FROM account_resources
      WHERE account_id = ? AND resource_id = ?
    `).get(account, id),
    count: (account) => q('SELECT count(*) AS n FROM account_resources WHERE account_id = ?').get(account).n,
    save: (account, { resourceId, syncVersion, deleted }, homeJson) => q(`
      INSERT INTO account_resources VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (account_id, resource_id) DO UPDATE SET
        sync_version = excluded.sync_version, deleted = excluded.deleted, home_json = excluded.home_json
    `).run(account, resourceId, syncVersion, Number(deleted), homeJson),
    receipt: (account, id, mutationId) => q(`
      SELECT digest, result_json AS resultJson FROM account_mutations
      WHERE account_id = ? AND resource_id = ? AND mutation_id = ?
    `).get(account, id, mutationId),
    remember: (account, result, mutationId, digest) => {
      const { resourceId, syncVersion } = result;
      q('INSERT INTO account_mutations VALUES (?, ?, ?, ?, ?, ?)').run(
        account, resourceId, mutationId, digest, JSON.stringify(result), syncVersion,
      );
      q('DELETE FROM account_mutations WHERE account_id = ? AND resource_id = ? AND sync_version <= ?')
        .run(account, resourceId, syncVersion - MUTATION_WINDOW);
    },
  };
}
