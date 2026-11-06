#!/usr/bin/env node
/**
 * AI 小镇数据库在线备份：node scripts/town-backup.mjs <town.db> <备份目录> [保留天数，默认 14]
 * 用 SQLite 的 VACUUM INTO，服务不用停；文件名带日期，超过保留天数的旧备份自动删掉。
 */
import fs from 'node:fs';
import path from 'node:path';
import { openStore } from './town-store.mjs';

const [db, dir, keepArg] = process.argv.slice(2);
if (!db || !dir) { console.error('用法：node scripts/town-backup.mjs <town.db> <备份目录> [保留天数]'); process.exit(1); }
if (!fs.existsSync(db)) { console.error('找不到数据库：' + db); process.exit(1); }
const keep = Number(keepArg) > 0 ? Number(keepArg) : 14;
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const out = path.join(dir, `town-${stamp}.db`);
const store = await openStore(db);
store.backup(out);
store.close();
console.log('已备份：' + out + '（' + fs.statSync(out).size + ' 字节）');
for (const f of fs.readdirSync(dir)) {
  if (!/^town-.*\.db$/.test(f)) continue;
  const p = path.join(dir, f);
  if (Date.now() - fs.statSync(p).mtimeMs > keep * 86400000) { fs.unlinkSync(p); console.log('删除旧备份：' + f); }
}
