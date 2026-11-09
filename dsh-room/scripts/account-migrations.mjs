const migrations = [
  `CREATE TABLE IF NOT EXISTS account_defaults (
    account_id TEXT PRIMARY KEY, character_id TEXT NOT NULL
  );`,
  `CREATE TABLE account_resources (
    account_id TEXT NOT NULL, resource_id TEXT NOT NULL, sync_version INTEGER NOT NULL,
    deleted INTEGER NOT NULL, home_json TEXT NOT NULL,
    PRIMARY KEY (account_id, resource_id)
  );
  CREATE TABLE account_mutations (
    account_id TEXT NOT NULL, resource_id TEXT NOT NULL, mutation_id TEXT NOT NULL,
    digest TEXT NOT NULL, result_json TEXT NOT NULL, sync_version INTEGER NOT NULL,
    PRIMARY KEY (account_id, resource_id, mutation_id)
  );
  CREATE INDEX account_mutations_version ON account_mutations (account_id, resource_id, sync_version);`,
];

export function migrateAccounts({ db, q, tx }) {
  tx(() => {
    db.exec('CREATE TABLE IF NOT EXISTS account_schema_migrations (version INTEGER PRIMARY KEY)');
    const applied = new Set(q('SELECT version FROM account_schema_migrations').all().map(row => row.version));
    for (const [index, sql] of migrations.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      db.exec(sql);
      q('INSERT INTO account_schema_migrations (version) VALUES (?)').run(version);
    }
  });
}
