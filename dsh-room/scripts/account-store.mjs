import { migrateAccounts } from './account-migrations.mjs';
import { createAccountResourceStore } from './account-resource-store.mjs';
import { randomUUID } from 'node:crypto';
import { publicLook } from '../shared/public-appearance.js';

function decodeLook(value) {
  try { return publicLook(JSON.parse(value || '{}')); }
  catch { return {}; }
}

export function createAccountStore({ db, q, tx }) {
  migrateAccounts({ db, q, tx });

  return {
    transaction: tx,
    resources: createAccountResourceStore({ q }),
    account: (id) => q('SELECT id, provider, name FROM accounts WHERE id = ?').get(id),
    banned: (id) => Boolean(q(
      "SELECT 1 FROM bans WHERE member = ? AND kind = 'ban' AND (until IS NULL OR until = 0 OR until > ?)"
    ).get(id, Date.now())),
    characters: (id) => q(
      'SELECT id, name, kind, look FROM members WHERE account = ? ORDER BY created, id'
    ).all(id).map(({ id, name, kind, look }) => ({
      id, name, kind: kind === 'whale' ? 'whale' : 'girl', look: decodeLook(look),
    })),
    defaultCharacter: (id) => q('SELECT character_id FROM account_defaults WHERE account_id = ?').get(id)?.character_id,
    setDefault: (id, characterId) => q(`
      INSERT INTO account_defaults (account_id, character_id) VALUES (?, ?)
      ON CONFLICT (account_id) DO UPDATE SET character_id = excluded.character_id
    `).run(id, characterId),
    createNeutral: (id) => {
      const characterId = 'c_' + randomUUID();
      q('INSERT INTO members (id, key, name, kind, look, created, account) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(characterId, '', '角色', 'girl', '{}', Date.now(), id);
      return characterId;
    },
  };
}
