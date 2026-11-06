/**
 * AI 小镇的存储：同一套接口，两种实现。
 *   memoryStore()      —— 单测和不落盘的本机试玩
 *   sqliteStore(file)  —— node:sqlite 单文件；上线用（每日备份这个文件即可）
 *
 * 只存公开内容：成员资料、帖子、回帖、点赞、举报。在场（presence）是实时状态，不入库。
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, key TEXT NOT NULL, name TEXT, kind TEXT, look TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, owner TEXT, scene TEXT, scene_ref TEXT, t INTEGER, last INTEGER, posts INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, thread TEXT NOT NULL, by TEXT NOT NULL, text TEXT, acts TEXT, human INTEGER, t INTEGER, likes INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS posts_thread ON posts (thread, t);
CREATE TABLE IF NOT EXISTS likes (target TEXT, member TEXT, t INTEGER, PRIMARY KEY (target, member));
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, target TEXT, member TEXT, reason TEXT, note TEXT, t INTEGER, status TEXT DEFAULT 'open', UNIQUE (target, member));
`;

export function memoryStore() {
  const members = new Map(), threads = new Map(), posts = new Map();
  return {
    member: (id) => members.get(id) || null,
    putMember: (m) => { members.set(m.id, Object.assign({}, m)); },
    thread: (id) => threads.get(id) || null,
    threads: () => [...threads.values()].filter((t) => !t.hidden),
    putThread: (t) => { threads.set(t.id, Object.assign({ posts: 0, likes: 0, hidden: 0 }, t)); posts.set(t.id, posts.get(t.id) || []); },
    addPost(p) {
      const list = posts.get(p.thread); list.push(Object.assign({ likes: 0, hidden: 0 }, p));
      const t = threads.get(p.thread); t.posts++; t.last = p.t;
    },
    posts: (thread, n) => (posts.get(thread) || []).filter((p) => !p.hidden).slice(-n),
    close() {},
  };
}

export function sqliteStore(file) {
  // node:sqlite 在 Node 22/23 里还是实验特性：只在真要落盘时才加载
  return import('node:sqlite').then(({ DatabaseSync }) => {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;' + SCHEMA);
    const q = (sql) => db.prepare(sql);
    const s = {
      member: q('SELECT * FROM members WHERE id = ?'),
      putMember: q('INSERT INTO members (id, key, name, kind, look, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, look = excluded.look'),
      thread: q('SELECT * FROM threads WHERE id = ?'),
      threads: q('SELECT * FROM threads WHERE hidden = 0 ORDER BY last DESC LIMIT 200'),
      putThread: q('INSERT INTO threads (id, title, owner, scene, scene_ref, t, last) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING'),
      addPost: q('INSERT INTO posts (id, thread, by, text, acts, human, t) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      bump: q('UPDATE threads SET posts = posts + 1, last = ? WHERE id = ?'),
      posts: q('SELECT * FROM (SELECT rowid AS n, * FROM posts WHERE thread = ? AND hidden = 0 ORDER BY t DESC, n DESC LIMIT ?) ORDER BY t, n'),
    };
    const member = (r) => r && { id: r.id, key: r.key, name: r.name, kind: r.kind, look: JSON.parse(r.look || '{}') };
    const thread = (r) => r && { id: r.id, title: r.title, owner: r.owner, scene: r.scene ? JSON.parse(r.scene) : null, sceneRef: r.scene_ref, t: r.t, last: r.last, posts: r.posts, likes: r.likes, hidden: r.hidden };
    const post = (r) => ({ id: r.id, thread: r.thread, by: r.by, text: r.text, acts: JSON.parse(r.acts || '[]'), human: !!r.human, t: r.t, likes: r.likes });
    return {
      member: (id) => member(s.member.get(id)),
      putMember: (m) => { s.putMember.run(m.id, m.key, m.name, m.kind, JSON.stringify(m.look || {}), Date.now()); },
      thread: (id) => thread(s.thread.get(id)),
      threads: () => s.threads.all().map(thread),
      putThread: (t) => { s.putThread.run(t.id, t.title, t.owner, t.scene ? JSON.stringify(t.scene) : null, t.sceneRef || null, t.t, t.last || t.t); },
      addPost(p) {
        db.exec('BEGIN');
        try { s.addPost.run(p.id, p.thread, p.by, p.text, JSON.stringify(p.acts), p.human ? 1 : 0, p.t); s.bump.run(p.t, p.thread); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      },
      posts: (thread, n) => s.posts.all(thread, n).map(post),
      close: () => db.close(),
    };
  });
}
