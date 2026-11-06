import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startPreview } from '../scripts/preview.mjs';

test('预览只监听本机：页面、HEAD、错误路径和写请求', async t => {
  const server = await startPreview({ port: 0 });
  t.after(async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); });
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base + '/')).text(), /大肥鱼的房间/);
  assert.equal((await fetch(base + '/dist/launch.js')).status, 200);
  assert.equal(await (await fetch(base + '/', { method: 'HEAD' })).text(), '');
  assert.equal((await fetch(base + '/missing')).status, 404);
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
  assert.equal((await fetch(base + '/..%2fpackage.json')).status, 403);
  assert.equal((await fetch(base + '/', { method: 'PUT', body: 'x' })).status, 405);
});

test('预览不允许通过素材链接读取网页目录之外的文件', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'room-preview-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'web'));
  await writeFile(path.join(dir, 'private.txt'), 'private');
  await symlink(path.join(dir, 'private.txt'), path.join(dir, 'web/link.txt'));
  const server = await startPreview({ port: 0, root: path.join(dir, 'web') });
  t.after(async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/link.txt`)).status, 403);
});
