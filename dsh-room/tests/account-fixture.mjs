import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../scripts/town-store.mjs';
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createAccountStore } from '../scripts/account-store.mjs';
import { createAccountService } from '../scripts/account-service.mjs';
import { hashToken } from '../scripts/town-auth.mjs';

export function connectAccountFixture(file, validateDependencies) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 3000');
  const q = (sql) => db.prepare(sql);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const store = createAccountStore({ db, q, tx });
  const api = createAccountService({
    store, validateDependencies,
    authenticate({ token } = {}) {
      if (!token) return null;
      return q('SELECT account FROM sessions WHERE hash = ? AND expires > ?').get(hashToken(token), Date.now())?.account;
    },
  });
  return { db, api };
}

export async function seed(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'account-identity-'));
  t.after(() => rm(dir, { recursive: true }));
  const file = path.join(dir, 'town.db');
  const town = await openStore(file);
  try {
    for (const id of ['alice', 'bob']) {
      town.upsertAccount({ id, provider: 'github', name: id, login: 'private-login' });
      town.createSession(hashToken(id + '-session'), id, Date.now() + 60000);
    }
    town.createSession(hashToken('expired'), 'alice', Date.now() - 1);
    town.putMember({ id: 'b-first', name: '已有角色', kind: 'whale', key: 'legacy-secret', look: { body: '#abc', persona: 'private' }, account: 'bob' });
    town.putMember({ id: 'b-second', name: '另一角色', kind: 'girl', account: 'bob' });
  } finally { town.close(); }
  return file;
}

if (!isMainThread) {
  const { db, api } = connectAccountFixture(workerData.file);
  parentPort.postMessage('ready');
  parentPort.once('message', () => {
    try { parentPort.postMessage(workerData.payload
      ? api.accountResourcePut(workerData.payload, { token: 'alice-session' })
      : api.accountBootstrap({}, { token: 'alice-session' })); }
    catch (error) { parentPort.postMessage({ code: error.code, reason: error.reason }); }
    finally { db.close(); }
  });
}
