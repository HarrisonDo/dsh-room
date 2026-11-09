#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 3) throw new Error('用法：node scripts/pack-neutral.mjs <新建的交付目录>');
const output = path.resolve(process.argv[2]);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'roomkit-neutral-'));
const source = path.join(temporary, 'source');
const engine = [
  'agent-adapter', 'agents', 'app', 'brain', 'catalog', 'character', 'depth', 'desk', 'dialog',
  'editor', 'env', 'experience', 'home', 'index', 'iso', 'memory', 'nav', 'packs', 'paint-emote',
  'paint-furniture', 'paint-room', 'renderer', 'scene', 'shell', 'story', 'style', 'token-body',
  'town', 'ui', 'util', 'version', 'workshop', 'world-drafts', 'world-panel', 'world-session',
];
const runtime = [
  'LICENSE', 'scripts/preview.mjs', 'scripts/local-agent.mjs', 'web/example.html', 'web/packs/example/pack.js',
  ...engine.map(name => 'web/roomkit/' + name + '.js'),
  ...['activities', 'agent-request', 'public-appearance', 'session-core', 'world-format'].map(name => 'shared/' + name + '.js'),
];
const inputs = new Map([...runtime, 'src/web.js'].map(name => [name, name]));
for (const name of ['package.json', 'package-lock.json', 'README.md', 'NOTICE.md']) inputs.set(name, 'neutral/' + name);
for (const name of ['appearance', 'bodies', 'default-characters']) inputs.set('web/roomkit/' + name + '.js', 'neutral/' + name + '.js');
inputs.set('shared/world-assets.gen.js', 'neutral/world-assets.gen.js');
inputs.set('scripts/build.mjs', 'neutral/build.mjs');
const npm = (args) => execFileSync('npm', args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');

try {
  const manifest = [];
  for (const [target, input] of [...inputs].sort()) {
    const destination = path.join(source, target);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, input), destination);
    manifest.push(await hash(destination) + '  ' + target);
  }
  await writeFile(path.join(source, 'SOURCE-INPUTS.sha256'), manifest.join('\n') + '\n');
  const { name, version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const sourceArchive = name + '-' + version + '-source.tar.gz';
  // Archive before installing dependencies or building.
  execFileSync('tar', ['-czf', path.join(temporary, sourceArchive), '-C', temporary, 'source'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  npm(['ci', '--no-audit', '--no-fund']);
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary]));
  const expected = [...inputs.keys()].filter(name => name !== 'package-lock.json');
  expected.push('web/dist/roomkit.js', 'web/dist/launch.js', 'web/index.html');
  if (JSON.stringify(packed.files.map(({ path }) => path).sort()) !== JSON.stringify(expected.sort())) {
    throw new Error('npm 包文件与白名单不一致');
  }
  const archives = [packed.filename, sourceArchive];
  const checksums = await Promise.all(archives.map(async name => await hash(path.join(temporary, name)) + '  ' + name));
  await mkdir(output);
  for (const name of archives) await cp(path.join(temporary, name), path.join(output, name));
  await cp(path.join(source, 'README.md'), path.join(output, 'README.md'));
  await cp(path.join(source, 'SOURCE-INPUTS.sha256'), path.join(output, 'SOURCE-INPUTS.sha256'));
  await writeFile(path.join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
  console.log(name + '@' + version + ' · ' + packed.files.length + ' npm files · ' + inputs.size + ' source inputs');
  console.log((await readdir(output)).join('\n'));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
