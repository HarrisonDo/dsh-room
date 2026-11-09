/**
 * AI 小镇的存储：node:sqlite 单文件（上线时每日备份这个文件）；file = ':memory:' 时只在内存里（单测、本机试玩）。
 *
 * 只存公开内容和管理记录：账号、角色（members）、帖子、回帖、点赞、举报、权限、禁言、处理日志。
 * 账号是人（GitHub / linux.do 登录），角色是账号名下的鲸鱼（最多 3 只）。权限、禁言、举报去重都按账号算。
 * 会话只存令牌的 sha256。
 * 在场（presence）是实时状态，不入库。
 * hidden：0 正常 · 1 被隐藏（举报或管理员） · 2 待审核（只有作者看得到） · 3 已删除
 */

import { createWorldStore } from './world-store.mjs';
import { createAccountStore } from './account-store.mjs';

export function backupDatabase(db, file) { db.prepare('VACUUM INTO ?').run(file); }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, provider TEXT, login TEXT, name TEXT, avatar TEXT, created INTEGER, seen INTEGER);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL, created INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, key TEXT NOT NULL, name TEXT, kind TEXT, look TEXT, created INTEGER, account TEXT);
CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, owner TEXT, scene TEXT, scene_ref TEXT, t INTEGER, last INTEGER, posts INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, locked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, thread TEXT NOT NULL, by TEXT NOT NULL, text TEXT, acts TEXT, human INTEGER, t INTEGER, likes INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, labels TEXT);
CREATE INDEX IF NOT EXISTS posts_thread ON posts (thread, t);
CREATE TABLE IF NOT EXISTS likes (target TEXT, member TEXT, t INTEGER, PRIMARY KEY (target, member));
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, target TEXT, member TEXT, reason TEXT, note TEXT, t INTEGER, status TEXT DEFAULT 'open', UNIQUE (target, member));
CREATE TABLE IF NOT EXISTS roles (member TEXT, role TEXT, scope TEXT DEFAULT '', by TEXT, t INTEGER, PRIMARY KEY (member, role, scope));
CREATE TABLE IF NOT EXISTS bans (member TEXT PRIMARY KEY, kind TEXT, until INTEGER, reason TEXT, by TEXT, t INTEGER);
CREATE TABLE IF NOT EXISTS mod_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, target TEXT, detail TEXT, t INTEGER);
`;
const THREAD_ORDER = {
  active: 'last + min(likes, 50) * 600000',
  new: 't',
  hot: '(likes * 3 + posts) / pow(max(0, (? - last) / 3600000.0) + 2, 1.5)',
};
// 旧库（T1）补列
const MIGRATIONS = ['ALTER TABLE threads ADD COLUMN locked INTEGER DEFAULT 0', 'ALTER TABLE posts ADD COLUMN labels TEXT', 'ALTER TABLE members ADD COLUMN account TEXT'];

export async function openStore(file = ':memory:') {
  // node:sqlite 在 Node 22/23 里还是实验特性
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec((file === ':memory:' ? '' : 'PRAGMA journal_mode = WAL;') + SCHEMA);
  for (const m of MIGRATIONS) { try { db.exec(m); } catch (e) { /* 列已存在 */ } }
  const cache = new Map();
  const q = (sql) => { if (!cache.has(sql)) cache.set(sql, db.prepare(sql)); return cache.get(sql); };
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  tx(() => {
    if (!q('PRAGMA table_info(threads)').all().some(({ name }) => name === 'owner_account')) {
      db.exec('ALTER TABLE threads ADD COLUMN owner_account TEXT');
      db.exec('UPDATE threads SET owner_account = COALESCE((SELECT account FROM members WHERE id = threads.owner), owner) WHERE owner IS NOT NULL');
    }
    db.exec('CREATE INDEX IF NOT EXISTS threads_owner_account_time ON threads (owner_account, t)');
  });

  const member = (r) => r && { id: r.id, key: r.key, name: r.name, kind: r.kind, look: JSON.parse(r.look || '{}'), account: r.account || r.id };
  const account = (r) => r && { id: r.id, provider: r.provider, login: r.login, name: r.name, avatar: r.avatar };
  const threadSummary = (r) => r && { id: r.id, title: r.title, owner: r.owner, ownerAccount: r.owner_account, t: r.t, last: r.last, posts: r.posts, likes: r.likes, hidden: r.hidden, locked: !!r.locked };
  const post = (r) => r && { id: r.id, thread: r.thread, by: r.by, text: r.text, acts: JSON.parse(r.acts || '[]'), human: !!r.human, t: r.t, likes: r.likes, hidden: r.hidden, labels: JSON.parse(r.labels || '[]') };

  let accounts;
  return {
    transaction: tx,
    world: createWorldStore({ db, q, tx }),
    // 首次访问时才建账户表：createTown 启动时会读取它，只开库的工具和备份不受影响
    get accountStore() { return (accounts ??= createAccountStore({ db, q, tx })); },
    member: (id) => member(q('SELECT * FROM members WHERE id = ?').get(id)),
    putMember: (m) => { q('INSERT INTO members (id, key, name, kind, look, created, account) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, look = excluded.look').run(m.id, m.key || '', m.name, m.kind, JSON.stringify(m.look || {}), Date.now(), m.account || m.id); },
    charactersOf: (acc) => q('SELECT * FROM members WHERE account = ? ORDER BY created').all(acc).map(member),
    characterCount: (acc) => q('SELECT COUNT(*) AS n FROM members WHERE account = ?').get(acc).n,
    deleteMember: (id) => { q('DELETE FROM members WHERE id = ?').run(id); },

    account: (id) => account(q('SELECT * FROM accounts WHERE id = ?').get(id)),
    upsertAccount: (a) => {
      q('INSERT INTO accounts (id, provider, login, name, avatar, created, seen) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar = excluded.avatar, seen = excluded.seen').run(a.id, a.provider, a.login, a.name, a.avatar || '', Date.now(), Date.now());
      return account(q('SELECT * FROM accounts WHERE id = ?').get(a.id));
    },
    createSession: (hash, acc, expires) => { q('INSERT INTO sessions (hash, account, created, expires) VALUES (?, ?, ?, ?)').run(hash, acc, Date.now(), expires); },
    session: (hash) => { const r = q('SELECT account, expires FROM sessions WHERE hash = ?').get(hash); return r && r.expires > Date.now() ? r.account : null; },
    endSession: (hash) => { q('DELETE FROM sessions WHERE hash = ?').run(hash); },
    endSessionsOf: (acc) => { q('DELETE FROM sessions WHERE account = ?').run(acc); },

    thread: (id) => {
      const row = q('SELECT * FROM threads WHERE id = ?').get(id);
      return row && { ...threadSummary(row), scene: row.scene ? JSON.parse(row.scene) : null, sceneRef: row.scene_ref };
    },
    threads: (sort = 'active', limit = 200, offset = 0) => {
      if (!Object.hasOwn(THREAD_ORDER, sort)) sort = 'active';
      const args = sort === 'hot' ? [Date.now(), limit, offset] : [limit, offset];
      return q(`SELECT id, title, owner, owner_account, t, last, posts, likes, hidden, locked FROM threads WHERE hidden = 0 ORDER BY ${THREAD_ORDER[sort]} DESC, last DESC, id LIMIT ? OFFSET ?`).all(...args).map(threadSummary);
    },
    threadCount: () => q('SELECT COUNT(*) AS n FROM threads WHERE hidden = 0').get().n,
    threadsBy: (accountId, since) => q('SELECT COUNT(*) AS n FROM threads WHERE owner_account = ? AND t > ?').get(accountId, since).n,
    putThread: (t) => { q('INSERT INTO threads (id, title, owner, owner_account, scene, scene_ref, t, last) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING').run(t.id, t.title, t.owner, t.ownerAccount || t.owner, t.scene ? JSON.stringify(t.scene) : null, t.sceneRef || null, t.t, t.last || t.t); },
    setThread: (id, patch) => {
      if ('hidden' in patch) q('UPDATE threads SET hidden = ? WHERE id = ?').run(patch.hidden, id);
      if ('locked' in patch) q('UPDATE threads SET locked = ? WHERE id = ?').run(patch.locked ? 1 : 0, id);
    },

    post: (id) => post(q('SELECT * FROM posts WHERE id = ?').get(id)),
    addPost: (p, checkAccess) => tx(() => {
      checkAccess?.();
      q('INSERT INTO posts (id, thread, by, text, acts, human, t, hidden, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(p.id, p.thread, p.by, p.text, JSON.stringify(p.acts), p.human ? 1 : 0, p.t, p.hidden || 0, JSON.stringify(p.labels || []));
      if (!p.hidden) q('UPDATE threads SET posts = posts + 1, last = ? WHERE id = ?').run(p.t, p.thread);
    }),
    /** 帖子里的回帖：公开的 + viewer 自己待审的 */
    posts: (thread, n, viewer = '') => q('SELECT * FROM (SELECT rowid AS n, * FROM posts WHERE thread = ? AND (hidden = 0 OR (hidden = 2 AND by = ?)) ORDER BY t DESC, n DESC LIMIT ?) ORDER BY t, n').all(thread, viewer, n).map(post),
    setPostHidden: (id, hidden) => tx(() => {
      const p = q('SELECT thread, hidden FROM posts WHERE id = ?').get(id);
      if (!p || p.hidden === hidden) return;
      q('UPDATE posts SET hidden = ? WHERE id = ?').run(hidden, id);
      const d = (hidden === 0 ? 1 : 0) - (p.hidden === 0 ? 1 : 0);
      if (d) q('UPDATE threads SET posts = posts + ? WHERE id = ?').run(d, p.thread);
    }),
    pendingPosts: () => q('SELECT * FROM posts WHERE hidden = 2 ORDER BY t LIMIT 100').all().map(post),

    /** 点赞 / 取消：每个账号对每条内容一次；返回最新赞数。target = p:回帖 / t:帖子 */
    like: (target, acc, on) => tx(() => {
      const [kind, id] = target.split(':'), table = kind === 'p' ? 'posts' : 'threads';
      const had = !!q('SELECT 1 FROM likes WHERE target = ? AND member = ?').get(target, acc);
      if (on && !had) { q('INSERT INTO likes (target, member, t) VALUES (?, ?, ?)').run(target, acc, Date.now()); q(`UPDATE ${table} SET likes = likes + 1 WHERE id = ?`).run(id); }
      if (!on && had) { q('DELETE FROM likes WHERE target = ? AND member = ?').run(target, acc); q(`UPDATE ${table} SET likes = likes - 1 WHERE id = ?`).run(id); }
      return q(`SELECT likes FROM ${table} WHERE id = ?`).get(id).likes;
    }),
    /** 这个账号点过赞的目标（只查给定的这些） */
    likedBy: (acc, targets) => {
      if (!acc || !targets.length) return new Set();
      return new Set(q(`SELECT target FROM likes WHERE member = ? AND target IN (${targets.map(() => '?').join(',')})`).all(acc, ...targets).map((r) => r.target));
    },

    /** 举报：同一人对同一目标只记一次；返回这个目标还没处理的举报人数 */
    report: (r) => {
      q('INSERT INTO reports (id, target, member, reason, note, t) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (target, member) DO NOTHING').run(r.id, r.target, r.member, r.reason, r.note, r.t);
      return q("SELECT COUNT(*) AS n FROM reports WHERE target = ? AND status = 'open'").get(r.target).n;
    },
    openReports: () => q("SELECT target, COUNT(*) AS n, GROUP_CONCAT(reason) AS reasons, GROUP_CONCAT(note, ' / ') AS notes, MAX(t) AS t FROM reports WHERE status = 'open' GROUP BY target ORDER BY n DESC, t DESC LIMIT 100").all()
      .map((r) => ({ target: r.target, n: r.n, reasons: [...new Set(String(r.reasons || '').split(','))], notes: r.notes || '', t: r.t })),
    closeReports: (target, status) => { q("UPDATE reports SET status = ? WHERE target = ? AND status = 'open'").run(status, target); },

    roles: (memberId) => q('SELECT role, scope FROM roles WHERE member = ?').all(memberId).map((r) => ({ role: r.role, scope: r.scope })),
    allRoles: () => q('SELECT member, role, scope FROM roles ORDER BY role, member').all().map((r) => ({ member: r.member, role: r.role, scope: r.scope })),
    grant: (memberId, role, scope, by) => { q('INSERT INTO roles (member, role, scope, by, t) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(memberId, role, scope || '', by, Date.now()); },
    revoke: (memberId, role, scope) => { q('DELETE FROM roles WHERE member = ? AND role = ? AND scope = ?').run(memberId, role, scope || ''); },

    ban: (memberId) => { const b = q('SELECT * FROM bans WHERE member = ?').get(memberId); return b && (!b.until || b.until > Date.now()) ? { kind: b.kind, until: b.until, reason: b.reason } : null; },
    setBan: (memberId, kind, until, reason, by) => { q('INSERT INTO bans (member, kind, until, reason, by, t) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (member) DO UPDATE SET kind = excluded.kind, until = excluded.until, reason = excluded.reason, by = excluded.by, t = excluded.t').run(memberId, kind, until, reason, by, Date.now()); },
    unban: (memberId) => { q('DELETE FROM bans WHERE member = ?').run(memberId); },

    log: (actor, action, target, detail) => { q('INSERT INTO mod_log (actor, action, target, detail, t) VALUES (?, ?, ?, ?, ?)').run(actor, action, target, JSON.stringify(detail || {}), Date.now()); },
    logs: (n = 50) => q('SELECT * FROM mod_log ORDER BY id DESC LIMIT ?').all(n).map((r) => ({ actor: r.actor, action: r.action, target: r.target, detail: JSON.parse(r.detail || '{}'), t: r.t })),

    /** 在线备份成一个独立的数据库文件（服务不停） */
    backup: (file) => backupDatabase(db, file),
    close: () => db.close(),
  };
}
