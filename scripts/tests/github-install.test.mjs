import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('GitHub 根包直接提供 DSH 入口，不需要安装时构建', async () => {
  const manifest = await read('package.json');
  const payload = await read('install/package.json');
  assert.equal(manifest.name, payload.name);
  assert.equal(manifest.version, payload.version);
  assert.deepEqual(manifest.peerDependencies, payload.peerDependencies);
  for (const script of ['prepare', 'preinstall', 'install', 'postinstall', 'prepack', 'postpack']) {
    assert.equal(manifest.scripts?.[script], undefined);
  }
  assert.equal(manifest.devDependencies, undefined);
  for (const file of [manifest.main, manifest.icon, manifest.exports['./client'], manifest.dsh.bundle.patch]) {
    assert.ok((await stat(path.join(root, file))).isFile(), file);
  }
  assert.match(await readFile(path.join(root, manifest.dsh.bundle.patch), 'utf8'), /name: ['"]?dsh-room/);
  const plugin = await import(path.join(root, manifest.main));
  assert.equal(plugin.name, 'dsh-room');
  assert.equal(typeof plugin.apply, 'function');
});

test('安装载荷与验收归档逐文件相同，无多余文件', async () => {
  const record = await read('release.json');
  const found = [];
  async function walk(dir = '') {
    for (const item of await readdir(path.join(root, 'install', dir), { withFileTypes: true })) {
      const file = dir ? dir + '/' + item.name : item.name;
      if (item.isDirectory()) await walk(file);
      else {
        assert.ok(item.isFile(), '不接受符号链接：' + file);
        found.push(file);
        const hash = createHash('sha256').update(await readFile(path.join(root, 'install', file))).digest('hex');
        assert.equal(hash, record.files[file], file);
      }
    }
  }
  await walk();
  assert.deepEqual(found.sort(), Object.keys(record.files).sort());
  assert.equal(record.version, (await read('package.json')).version);
});

test('npm 打包只包含已验收载荷和公开说明', async () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const record = await read('release.json');
  const expected = ['package.json', 'release.json', 'LICENSE', 'README.md', ...Object.keys(record.files).map(file => 'install/' + file)].sort();
  assert.deepEqual(packed.files.map(file => file.path).sort(), expected);
});
