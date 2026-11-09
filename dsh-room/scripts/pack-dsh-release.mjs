#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.env.ROOMKIT_RELEASE_VERSION;
if (!version || !/^\d+\.\d+\.\d+-[a-z0-9]+\.\d+$/.test(version)) throw new Error('请设置新的候选版本 ROOMKIT_RELEASE_VERSION；重建已发布版本请使用对应源码归档');
const engine = [
  'agent-adapter', 'agents', 'app', 'brain', 'catalog', 'character', 'depth', 'desk', 'dialog',
  'bodies', 'editor', 'env', 'experience', 'home', 'index', 'iso', 'memory', 'nav', 'packs', 'paint-emote',
  'paint-furniture', 'paint-girl', 'paint-room', 'paint-whale', 'renderer', 'scene', 'shell', 'story', 'style', 'token-body',
  'town', 'ui', 'util', 'version', 'workshop', 'world-drafts', 'world-hub', 'world-panel', 'world-session',
];
const whale = 'room/vendor/coopanion/whale';
const schemeIds = ['harness', 'chatgpt', 'claude', 'gemini', 'qwen', 'kimi', 'minimax'];
const inputs = new Map([
  'room/vendor/coopanion/LICENSE', 'room/vendor/coopanion/kit/body.js', 'room/vendor/coopanion/kit/rig.js',
  whale + '/figure.js', whale + '/model.json', 'web/vendor-src/whale-rig-entry.js',
  'web/vendor-src/whale-assets.gen.js',
  'LICENSE', 'cordis.patch.yml', 'locales/zh.json', 'locales/en.json',
  'lib/index.js', 'lib/chat.js', 'lib/agent-tools.js', 'lib/work-status.js', 'lib/desktop-process.js', 'lib/desktop-runtime.js', 'lib/local-home.js',
  'demo-theme/whale-girl.js', 'src/web.js', 'src/home-view.js', 'src/desktop-web.js', 'web/packs/home/pack.js',
  ...engine.map(name => 'web/roomkit/' + name + '.js'),
  ...['activities', 'agent-request', 'local-home-format', 'public-appearance', 'session-core', 'world-format'].map(name => 'shared/' + name + '.js'),
].map(name => [name, name]));
for (const scheme of schemeIds) {
  for (const part of ['tex', 'feat']) {
    const dir = `${whale}/schemes/${scheme}/${part}`;
    for (const name of (await readdir(path.join(root, dir))).sort()) {
      if (name.endsWith('.png')) inputs.set(dir + '/' + name, dir + '/' + name);
    }
  }
}
for (const part of ['tex', 'feat']) {
  const dir = whale + '/' + part;
  for (const name of (await readdir(path.join(root, dir))).sort()) {
    if (name.endsWith('.png')) inputs.set(dir + '/' + name, dir + '/' + name);
  }
}
inputs.set('shared/world-assets.gen.js', 'neutral/world-assets.gen.js');
inputs.set('scripts/build.mjs', 'release-dsh/build.mjs');
for (const name of ['README.md', 'NOTICE.md']) inputs.set(name, 'release-dsh/' + name);
for (const name of ['main.js', 'preload.cjs', 'package.json']) inputs.set('desktop/' + name, '../desktop/' + name);

const read = name => readFile(path.join(root, name), 'utf8');
const digest = data => createHash('sha256').update(data).digest('hex');
const json = data => JSON.stringify(data, null, 2) + '\n';

function replaceOnce(source, pattern, value) {
  const match = source.match(pattern);
  if (!match || source.slice(match.index + match[0].length).search(pattern) !== -1) {
    throw new Error('宿主入口已变化，请核对候选适配点 ' + pattern);
  }
  return source.replace(pattern, value);
}

async function stageClient() {
  let client = await read('src/client.js');
  client = replaceOnce(client, /import '\.\.\/web\/packs\/default\/pack\.js';\nimport '\.\/sprites\.gen\.js';/,
    "import '../web/packs/home/pack.js';\nimport '../web/packs/example/pack.js';");
  client = replaceOnce(client, /^const RIG_URL = .*\n/m, '');
  client = replaceOnce(client, /\/\*\* 真模型鲸鱼娘[^]*?(?=\/\* 存档同步)/, '');
  client = replaceOnce(client, /const loadingRig = loadRig\(\);/, 'const loadingRig = Promise.resolve();');
  return replaceOnce(client, /const packs = \(window\.RoomKitPacks \|\| \[\]\)\.map\([^]*?\n  \}\)\);/, 'const packs = window.RoomKitPacks || [];');
}

if (process.argv.length !== 3) throw new Error('用法：node scripts/pack-dsh-release.mjs <新交付目录>');
const output = path.resolve(process.argv[2]);
const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-room-r01-'));
const source = path.join(temporary, 'source');
const npm = args => execFileSync('npm', args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
try {
  for (const [target, input] of inputs) {
    const destination = path.join(source, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, input), destination);
  }
  const manifest = JSON.parse(await read('package.json'));
  manifest.version = version;
  manifest.description = 'DSH 房间插件，带 Canvas Q 版鲸鱼娘、小屋、小院和宿主模型互动。';
  manifest.dsh.compatibility.dshReleases = { '0.2.2-rc.1': 'unknown' };
  manifest.devDependencies = { esbuild: '0.25.12' };
  manifest.scripts = { build: 'node scripts/build.mjs', prepack: 'npm run build' };
  const index = replaceOnce(await read('web/example.html'), /<script src="packs\/example\/pack\.js"><\/script>/,
    '<script src="packs/home/pack.js"></script>\n<script src="packs/example/pack.js"></script>');
  const generated = new Map([
    ['src/client.js', await stageClient()],
    ['web/roomkit/appearance.js', "export { WHALE_LOOKS, paintWhale } from '../../demo-theme/whale-girl.js';\n"],
    ['web/roomkit/default-characters.js', "export { DEFAULT_CHARACTERS, DEFAULT_ROLE, APPEARANCE_NOTICE } from '../../demo-theme/whale-girl.js';\n"],
    ['web/packs/example/pack.js', replaceOnce(await read('web/packs/example/pack.js'),
      /window\.RoomKitPacks = \[([^]*?)\];/, 'window.RoomKitPacks ||= [];\n  window.RoomKitPacks.push($1);')],
    ['web/index.html', index],
    ['web/managed.html', replaceOnce(index, /dist\/launch\.js/, 'dist/desktop-launch.js')],
    ['assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#21344b"/><path d="M9 24 24 11l15 13v14H9z" fill="#7ed0c3"/><path d="M20 27h8v11h-8z" fill="#21344b"/></svg>\n'],
  ]);
  const bundle = ['lib/client.js', 'web/dist/roomkit.js', 'web/dist/launch.js', 'web/dist/desktop-launch.js',
    'web/vendor/whale-showcase-rig.js', ...schemeIds.map(id => `web/vendor/whale-scheme-${id}.json`)];
  const runtimeInputs = [...inputs.keys()].filter(name =>
    (!name.startsWith('room/vendor/') || name.endsWith('/LICENSE')) && !name.startsWith('web/vendor-src/'));
  manifest.files = [...runtimeInputs, ...generated.keys(), ...bundle].sort();
  generated.set('package.json', json(manifest));
  const lock = JSON.parse(await read('package-lock.json'));
  lock.name = manifest.name;
  lock.version = manifest.version;
  Object.assign(lock.packages[''], { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies });
  generated.set('package-lock.json', json(lock));
  for (const [name, value] of generated) {
    const file = path.join(source, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  const entries = [...inputs.keys(), ...generated.keys()].sort();
  const list = await Promise.all(entries.map(async name => digest(await readFile(path.join(source, name))) + '  ' + name));
  await writeFile(path.join(source, 'SOURCE-INPUTS.sha256'), list.join('\n') + '\n');
  const sourceArchive = manifest.name + '-' + manifest.version + '-source.tar.gz';
  execFileSync('tar', ['-czf', path.join(temporary, sourceArchive), '-C', temporary, 'source'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  npm(['ci', '--no-audit', '--no-fund']);
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary]));
  const expected = [...manifest.files, 'package.json'].sort();
  if (JSON.stringify(packed.files.map(({ path }) => path).sort()) !== JSON.stringify(expected)) {
    throw new Error('安装归档不符合白名单');
  }
  for (const name of expected) {
    if (name.startsWith('web/vendor/')) continue;
    const data = await readFile(path.join(source, name), 'utf8');
    if (/data:image\/[^;,]+;base64,[A-Za-z0-9+/]{128}/.test(data)) {
      throw new Error('发现候选排除内容 ' + name);
    }
  }
  const archives = [packed.filename, sourceArchive];
  const checksums = await Promise.all(archives.map(async name => digest(await readFile(path.join(temporary, name))) + '  ' + name));
  await mkdir(output);
  for (const name of archives) await cp(path.join(temporary, name), path.join(output, name));
  for (const name of ['README.md', 'SOURCE-INPUTS.sha256']) await cp(path.join(source, name), path.join(output, name));
  await writeFile(path.join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
  console.log(manifest.name + '@' + manifest.version + ' · ' + expected.length + ' package files · ' + entries.length + ' source inputs');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
