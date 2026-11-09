const DAY_MS = 86_400_000;
const MIGRATIONS = [
  `
  CREATE TABLE world_definitions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
    draft TEXT, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
  );
  CREATE INDEX world_definitions_owner ON world_definitions (owner, updated_at DESC);
  CREATE TABLE world_releases (
    world_id TEXT NOT NULL REFERENCES world_definitions(id), revision INTEGER NOT NULL,
    release TEXT NOT NULL, hash TEXT NOT NULL, published_at INTEGER NOT NULL,
    PRIMARY KEY (world_id, revision)
  );
  `,
  `
  CREATE TABLE world_sessions (
    id TEXT PRIMARY KEY, world_id TEXT NOT NULL, revision INTEGER NOT NULL, owner TEXT NOT NULL,
    status TEXT NOT NULL, state TEXT NOT NULL, empty_since INTEGER, updated_at INTEGER NOT NULL,
    FOREIGN KEY (world_id, revision) REFERENCES world_releases (world_id, revision)
  );
  CREATE INDEX world_sessions_status ON world_sessions (status, updated_at);
  CREATE TABLE world_members (
    session_id TEXT NOT NULL REFERENCES world_sessions(id), account_id TEXT NOT NULL, character_id TEXT,
    generation INTEGER NOT NULL DEFAULT 0, lease_hash TEXT, online INTEGER NOT NULL DEFAULT 0,
    revoked INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL, PRIMARY KEY (session_id, account_id)
  );
  CREATE INDEX world_members_online ON world_members (account_id, online);
  CREATE TABLE world_events (
    session_id TEXT NOT NULL REFERENCES world_sessions(id), seq INTEGER NOT NULL, at INTEGER NOT NULL,
    event TEXT NOT NULL, PRIMARY KEY (session_id, seq)
  );
  CREATE TABLE world_receipts (
    session_id TEXT NOT NULL REFERENCES world_sessions(id), account_id TEXT NOT NULL, request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (session_id, account_id, request_id)
  );
  CREATE TABLE world_completions (
    session_id TEXT PRIMARY KEY REFERENCES world_sessions(id), event TEXT NOT NULL,
    qualifiers TEXT NOT NULL, expires_at INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE world_members ADD COLUMN lease_auth TEXT;
  CREATE TABLE world_invites (
    id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL REFERENCES world_sessions(id),
    expires_at INTEGER NOT NULL, redeemed_by TEXT, revoked INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX world_invites_session ON world_invites (session_id, expires_at);
  `,
  `
  CREATE TABLE world_speech_review (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES world_sessions(id),
    account_id TEXT NOT NULL, character_id TEXT NOT NULL, request_id TEXT NOT NULL,
    epoch INTEGER NOT NULL, generation INTEGER NOT NULL, source TEXT NOT NULL,
    text TEXT NOT NULL, at INTEGER NOT NULL
  );
  CREATE INDEX world_speech_review_session ON world_speech_review (session_id);
  CREATE INDEX world_speech_review_at ON world_speech_review (at);
  `,
  `
  CREATE TABLE world_public (
    world_id TEXT PRIMARY KEY REFERENCES world_definitions(id), revision INTEGER NOT NULL,
    seats INTEGER NOT NULL, max_sessions INTEGER NOT NULL, listed INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
    FOREIGN KEY (world_id, revision) REFERENCES world_releases (world_id, revision)
  );
  ALTER TABLE world_sessions ADD COLUMN seats INTEGER;
  ALTER TABLE world_sessions ADD COLUMN public INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX world_sessions_public ON world_sessions (world_id, public, status);
  `,
];

export function createWorldStore({ db, q, tx }) {
  tx(() => {
    db.exec('CREATE TABLE IF NOT EXISTS world_schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    const applied = new Set(q('SELECT version FROM world_schema_migrations').all().map(({ version }) => version));
    for (const [index, migration] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      db.exec(migration);
      q('INSERT INTO world_schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now());
    }
  });

  const summary = ({ id, owner, title, revision, updated_at }) => ({ worldId: id, ownerAccountId: owner, title, revision, updatedAt: updated_at });
  const session = (row) => row && { state: JSON.parse(row.state), owner: row.owner, emptySince: row.empty_since, updatedAt: row.updated_at,
    seats: row.seats ?? null, public: !!row.public };
  const listing = (row) => row && { worldId: row.world_id, revision: row.revision, seats: row.seats, maxSessions: row.max_sessions,
    listed: !!row.listed, sort: row.sort, summary: row.summary, updatedAt: row.updated_at,
    ...(row.title != null ? { title: row.title, ownerAccountId: row.owner } : {}) };
  const member = (row) => row && ({
    sessionId: row.session_id, accountId: row.account_id, characterId: row.character_id,
    generation: row.generation, leaseHash: row.lease_hash, authHash: row.lease_auth, online: !!row.online, revoked: !!row.revoked, lastSeen: row.last_seen,
  });
  return {
    transaction: tx,
    definition(id) {
      const row = q('SELECT id, owner, title, revision, updated_at FROM world_definitions WHERE id = ?').get(id);
      return row && summary(row);
    },
    list(owner, limit, offset) {
      return q('SELECT id, owner, title, revision, updated_at FROM world_definitions WHERE owner = ? ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(owner, limit, offset).map(summary);
    },
    count(owner) { return q('SELECT COUNT(*) AS n FROM world_definitions WHERE owner = ?').get(owner).n; },
    insert(id, owner, title, at) {
      q('INSERT INTO world_definitions (id, owner, title, updated_at) VALUES (?, ?, ?, ?)').run(id, owner, title, at);
    },
    draft(id) {
      const data = q('SELECT draft FROM world_definitions WHERE id = ?').get(id)?.draft;
      return data ? JSON.parse(data) : null;
    },
    saveDraft(id, draft, at) {
      q('UPDATE world_definitions SET draft = ?, title = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(draft), draft.title, at, id);
    },
    release(id, revision) {
      const row = q('SELECT release FROM world_releases WHERE world_id = ? AND revision = ?').get(id, revision);
      return row && JSON.parse(row.release);
    },
    publish(release, at) {
      const { worldId, revision, title, hash } = release;
      q('INSERT INTO world_releases (world_id, revision, release, hash, published_at) VALUES (?, ?, ?, ?, ?)').run(worldId, revision, JSON.stringify(release), hash, at);
      q('UPDATE world_definitions SET revision = ?, title = ?, updated_at = ? WHERE id = ?').run(revision, title, at, worldId);
    },
    releaseCount(owner, since) {
      return q('SELECT COUNT(*) AS n FROM world_releases r JOIN world_definitions d ON d.id = r.world_id WHERE d.owner = ? AND r.published_at > ?').get(owner, since).n;
    },
    session(id) { return session(q('SELECT * FROM world_sessions WHERE id = ?').get(id)); },
    liveSessions() { return q("SELECT * FROM world_sessions WHERE status <> 'ended'").all().map(session); },
    liveCount() { return q("SELECT COUNT(*) AS n FROM world_sessions WHERE status <> 'ended'").get().n; },
    activeCount() { return q("SELECT COUNT(*) AS n FROM world_sessions WHERE status = 'active'").get().n; },
    ownerSessionCount(owner) { return q("SELECT COUNT(*) AS n FROM world_sessions WHERE owner = ? AND status <> 'ended'").get(owner).n; },
    insertSession(state, owner, at, { seats = null, isPublic = false } = {}) {
      q('INSERT INTO world_sessions (id, world_id, revision, owner, status, state, empty_since, updated_at, seats, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(state.sessionId, state.worldId, state.revision, owner, state.status, JSON.stringify(state), at, at, seats, Number(isPublic));
    },
    /* 公共目录：只列运营方明确公开的固定版本 */
    setListing({ worldId, revision, seats, maxSessions, listed, sort = 0, summary = '' }, at) {
      q(`INSERT INTO world_public (world_id, revision, seats, max_sessions, listed, sort, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (world_id) DO UPDATE SET revision = excluded.revision, seats = excluded.seats, max_sessions = excluded.max_sessions,
         listed = excluded.listed, sort = excluded.sort, summary = excluded.summary, updated_at = excluded.updated_at`)
        .run(worldId, revision, seats, maxSessions, Number(!!listed), sort, summary, at);
    },
    listing(worldId) {
      return listing(q('SELECT p.*, d.title, d.owner FROM world_public p JOIN world_definitions d ON d.id = p.world_id WHERE p.world_id = ?').get(worldId));
    },
    listings(limit, offset) {
      return q(`SELECT p.*, d.owner, json_extract(r.release, '$.title') AS title, json_extract(r.release, '$.activity.kind') AS activity,
                json_extract(r.release, '$.scene.room') AS room, json_extract(r.release, '$.scene.objects') AS objects
                FROM world_public p JOIN world_definitions d ON d.id = p.world_id
                JOIN world_releases r ON r.world_id = p.world_id AND r.revision = p.revision
                WHERE p.listed = 1 ORDER BY p.sort DESC, p.updated_at DESC, p.world_id LIMIT ? OFFSET ?`).all(limit, offset)
        .map((row) => ({ ...listing(row), activity: row.activity || null, room: JSON.parse(row.room), objects: JSON.parse(row.objects) }));
    },
    publicSessions(worldId) {
      return q("SELECT * FROM world_sessions WHERE world_id = ? AND public = 1 AND status <> 'ended' ORDER BY updated_at DESC, id").all(worldId).map(session);
    },
    saveSession(record) {
      const { state, emptySince, updatedAt } = record;
      q('UPDATE world_sessions SET status = ?, state = ?, empty_since = ?, updated_at = ? WHERE id = ?')
        .run(state.status, JSON.stringify(state), emptySince, updatedAt, state.sessionId);
    },
    membership(id, owner) { return member(q('SELECT * FROM world_members WHERE session_id = ? AND account_id = ?').get(id, owner)); },
    members(id) { return q('SELECT * FROM world_members WHERE session_id = ?').all(id).map(member); },
    onlineSession(owner) {
      return q('SELECT session_id FROM world_members WHERE account_id = ? AND online = 1').get(owner)?.session_id;
    },
    saveMember(m) {
      q(`INSERT INTO world_members (session_id, account_id, character_id, generation, lease_hash, lease_auth, online, revoked, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, account_id) DO UPDATE SET
         character_id = excluded.character_id, generation = excluded.generation, lease_hash = excluded.lease_hash,
         lease_auth = excluded.lease_auth, online = excluded.online, revoked = excluded.revoked, last_seen = excluded.last_seen`)
        .run(m.sessionId, m.accountId, m.characterId ?? null, m.generation || 0, m.leaseHash ?? null, m.authHash ?? null, Number(!!m.online), Number(!!m.revoked), m.lastSeen);
    },
    addEvent(event) {
      q('INSERT INTO world_events (session_id, seq, at, event) VALUES (?, ?, ?, ?)').run(event.sessionId, event.seq, event.at, JSON.stringify(event));
    },
    events(id, after) {
      return q('SELECT event FROM world_events WHERE session_id = ? AND seq > ? ORDER BY seq').all(id, after).map(({ event }) => JSON.parse(event));
    },
    trimEvents(id, beforeSeq, beforeTime) {
      q('DELETE FROM world_events WHERE session_id = ? AND (seq <= ? OR at < ?)').run(id, beforeSeq, beforeTime);
    },
    receipt(id, owner, requestId) {
      const row = q('SELECT fingerprint, result FROM world_receipts WHERE session_id = ? AND account_id = ? AND request_id = ?').get(id, owner, requestId);
      return row && { fingerprint: row.fingerprint, result: JSON.parse(row.result) };
    },
    receiptWindow(id) { return q('SELECT COUNT(*) AS count, MIN(at) AS oldest FROM world_receipts WHERE session_id = ?').get(id); },
    addReceipt(id, owner, requestId, fingerprint, result, at) {
      q('INSERT INTO world_receipts (session_id, account_id, request_id, fingerprint, result, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, owner, requestId, fingerprint, JSON.stringify(result), at);
    },
    updateReceipt(id, owner, requestId, result) {
      q('UPDATE world_receipts SET result = ? WHERE session_id = ? AND account_id = ? AND request_id = ?')
        .run(JSON.stringify(result), id, owner, requestId);
    },
    clearReceipts(id) { q('DELETE FROM world_receipts WHERE session_id = ?').run(id); },
    redactSpeech(event) {
      const { sessionId, seq } = event;
      const redacted = { ...event, type: 'actor.said.removed', payload: { seq } };
      q('UPDATE world_events SET event = ? WHERE session_id = ? AND seq = ?').run(JSON.stringify(redacted), sessionId, seq);
      q("UPDATE world_receipts SET result = json_set(result, '$.events', json(?)) WHERE session_id = ? AND json_extract(result, '$.seq') = ?")
        .run(JSON.stringify([redacted]), sessionId, seq);
    },
    queueSpeech({ id, sessionId, owner, characterId, requestId, epoch, generation, source, text, at }) {
      q('INSERT INTO world_speech_review VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, sessionId, owner, characterId, requestId, epoch, generation, source, text, at);
    },
    pendingSpeech(at) { return q('SELECT * FROM world_speech_review WHERE at >= ? ORDER BY at, id LIMIT 100').all(at); },
    speechCount(id) { return q('SELECT COUNT(*) AS n FROM world_speech_review WHERE session_id = ?').get(id).n; },
    speech(id) { return q('SELECT * FROM world_speech_review WHERE id = ?').get(id); },
    finishSpeech(id) { q('DELETE FROM world_speech_review WHERE id = ?').run(id); },
    complete(event, qualifiers, expiresAt) {
      q('INSERT INTO world_completions (session_id, event, qualifiers, expires_at) VALUES (?, ?, ?, ?)')
        .run(event.sessionId, JSON.stringify(event), JSON.stringify(qualifiers), expiresAt);
    },
    completion(id, at) {
      const row = q('SELECT event, qualifiers, expires_at FROM world_completions WHERE session_id = ? AND expires_at > ?').get(id, at);
      return row && { event: JSON.parse(row.event), qualifiers: JSON.parse(row.qualifiers), expiresAt: row.expires_at };
    },
    addInvite({ id, hash, sessionId, expiresAt }) {
      q('INSERT INTO world_invites (id, hash, session_id, expires_at) VALUES (?, ?, ?, ?)').run(id, hash, sessionId, expiresAt);
    },
    inviteByHash(hash) { return q('SELECT * FROM world_invites WHERE hash = ?').get(hash); },
    openInviteCount(id, at) {
      return q('SELECT COUNT(*) AS n FROM world_invites WHERE session_id = ? AND expires_at > ? AND revoked = 0 AND redeemed_by IS NULL').get(id, at).n;
    },
    revokeInvite(sessionId, id) {
      return q('UPDATE world_invites SET revoked = 1 WHERE session_id = ? AND id = ? AND redeemed_by IS NULL').run(sessionId, id).changes;
    },
    redeemInvite(id, owner) { q('UPDATE world_invites SET redeemed_by = ? WHERE id = ?').run(owner, id); },
    prune(at, retention) {
      q('DELETE FROM world_invites WHERE expires_at < ?').run(at - DAY_MS);
      q('DELETE FROM world_events WHERE at < ?').run(at - retention);
      q('DELETE FROM world_speech_review WHERE at < ?').run(at - retention);
      q('DELETE FROM world_completions WHERE expires_at <= ?').run(at);
      q("DELETE FROM world_receipts WHERE at < ? AND session_id IN (SELECT id FROM world_sessions WHERE status = 'ended')").run(at - retention);
    },
  };
}
