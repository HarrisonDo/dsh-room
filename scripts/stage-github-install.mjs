#!/usr/bin/env node
// Materialize a verified release at the repository's installable package root.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = process.argv[2];
if (!release || process.argv.length !== 3) throw new Error('用法：node scripts/stage-github-install.mjs <已验收候选目录>');
const digest = data => createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const sums = await readFile(path.join(release, 'SHA256SUMS'), 'utf8');
const matched = /^([a-f0-9]{64}) {2}(dsh-room-(\d+\.\d+\.\d+-[a-z0-9]+\.\d+))\.tgz\n([a-f0-9]{64}) {2}\2-source\.tar\.gz\n$/.exec(sums);
if (!matched) throw new Error('需要同一版本的插件包、源码归档和 SHA256SUMS');
const [, packageHash, name, version, sourceHash] = matched;
for (const [file, hash] of [[name + '.tgz', packageHash], [name + '-source.tar.gz', sourceHash]]) {
  if (digest(await readFile(path.join(release, file))) !== hash) throw new Error('校验失败：' + file);
}

const temporary = await mkdtemp(path.join(tmpdir(), 'roomkit-github-'));
try {
  const archive = path.resolve(release, name + '.tgz');
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  if (listing.some(file => !file.startsWith('package/') || file.includes('..') || file.includes('\\'))) {
    throw new Error('插件归档含异常路径');
  }
  execFileSync('tar', ['-xzf', archive, '-C', temporary]);
  const payload = path.join(temporary, 'package');
  const manifest = JSON.parse(await readFile(path.join(payload, 'package.json'), 'utf8'));
  if (manifest.name !== 'dsh-room' || manifest.version !== version) throw new Error('候选名称或版本不一致');
  const files = {};
  for (const file of listing.filter(file => !file.endsWith('/')).map(file => file.slice(8)).sort()) {
    files[file] = digest(await readFile(path.join(payload, file)));
  }
  const wrapper = {
    name: manifest.name,
    version,
    description: manifest.description,
    license: manifest.license,
    type: 'module',
    repository: { type: 'git', url: 'https://github.com/HarrisonDo/dsh-room.git' },
    homepage: 'https://dshroom.pigeongugu.store/assets/dsh-install.html',
    bugs: { url: 'https://github.com/HarrisonDo/dsh-room/issues' },
    keywords: manifest.keywords,
    icon: './install/' + manifest.icon.replace(/^\.\//, ''),
    main: './install/' + manifest.main.replace(/^\.\//, ''),
    exports: Object.fromEntries(Object.entries(manifest.exports).map(([key, value]) => [
      key, key === './package.json' ? './package.json' : './install/' + value.replace(/^\.\//, ''),
    ])),
    files: ['install', 'release.json', 'LICENSE', 'README.md'],
    scripts: { 'test:install': 'node --test scripts/tests/github-install.test.mjs' },
    dsh: { ...manifest.dsh, bundle: { ...manifest.dsh.bundle, patch: './install/cordis.patch.yml' } },
    peerDependencies: manifest.peerDependencies,
  };
  const record = {
    version,
    package: { file: name + '.tgz', sha256: packageHash },
    source: { file: name + '-source.tar.gz', sha256: sourceHash },
    downloads: 'https://dshroom.pigeongugu.store/assets/',
    files,
  };
  await rm(path.join(root, 'install'), { recursive: true, force: true });
  await cp(payload, path.join(root, 'install'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), json(wrapper));
  await writeFile(path.join(root, 'release.json'), json(record));
  console.log('GitHub 安装入口已准备：' + version + '，' + Object.keys(files).length + ' 个已校验文件');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
