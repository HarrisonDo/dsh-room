#!/usr/bin/env node
/**
 * 构建 Web 试玩站点（Canvas Q 版鲸鱼娘和程序绘制场景）：
 *   <out>/web/index.html、guide.html、assets/*.<摘要>.js   —— 交给 town.mjs --web 或 TOWN_WEB_ROOT
 *   <out>/public-worlds.json                               —— 交给 TOWN_PUBLIC_WORLDS，不放进静态目录
 *   <out>/build.json                                       —— 版本、协议和各文件摘要，回滚时对照
 * 用法：node scripts/build-site.mjs [输出目录，默认 site]
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'site'));
const web = path.join(out, 'web');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const whaleDir = 'room/vendor/coopanion/whale';
const showcaseLooks = [...new Set((process.env.ROOMKIT_SHOWCASE_LOOKS || '').split(',').filter(Boolean))];
const alternateSchemes = showcaseLooks.filter(look => look !== 'blue' && look !== 'rose');
if (alternateSchemes.some(look => !['harness', 'chatgpt', 'claude', 'gemini', 'qwen', 'kimi', 'minimax'].includes(look))) {
  throw new Error('ROOMKIT_SHOWCASE_LOOKS 包含未知的分件配色');
}

const DEMO = new Map([
  ['web/roomkit/appearance.js', 'demo-theme/whale-girl.js'],
  ['web/roomkit/bodies.js', 'demo-theme/whale-girl.js'],
  ['web/roomkit/default-characters.js', 'demo-theme/whale-girl.js'],
  ['shared/world-assets.gen.js', 'neutral/world-assets.gen.js'],
]);
const demo = (showcase = false) => ({
  name: 'roomkit-demo',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, (args) => {
      const target = path.relative(root, path.resolve(args.resolveDir, args.path)).split(path.sep).join('/');
      if (showcase && target === 'web/roomkit/bodies.js') return;
      return DEMO.has(target) ? { path: path.join(root, DEMO.get(target)) } : undefined;
    });
  },
});
const common = { absWorkingDir: root, bundle: true, format: 'iife', target: 'es2019', charset: 'utf8', legalComments: 'inline', write: false, plugins: [demo()] };
const bundle = async (entry, extra) => (await build({ ...common, entryPoints: [path.join(root, entry)], ...extra })).outputFiles[0].contents;

await rm(out, { recursive: true, force: true });
await mkdir(path.join(web, 'assets'), { recursive: true });

async function asset(name, data) {
  const hash = digest(data).slice(0, 16);
  const file = `${name}.${hash}.js`;
  await writeFile(path.join(web, 'assets', file), data);
  return { file: '/assets/' + file, sha256: digest(data) };
}

const packSources = await Promise.all(['web/packs/example/pack.js', 'web/packs/home/pack.js'].map((f) => readFile(path.join(root, f), 'utf8')));
const assets = {
  engine: await asset('roomkit', await bundle('web/roomkit/index.js', {
    globalName: 'RoomKit', plugins: [demo(Boolean(showcaseLooks.length))],
  })),
  packs: await asset('packs', Buffer.from(packSources.join('\n'))),
  launch: await asset('launch', await bundle('src/web.js')),
};

const template = await readFile(path.join(root, 'web/site.html'), 'utf8');
const html = template.replace(/\{\{(engine|packs|launch)\}\}/g, (_, key) => assets[key].file)
  .replace('data-roomkit-site', showcaseLooks.length
    ? `data-roomkit-site data-roomkit-rig="${showcaseLooks.join(',')}"` : 'data-roomkit-site')
  .replace('<!-- ROOMKIT_SHOWCASE_LINK -->', showcaseLooks.length
    ? '<a class="whale-showcase-link" href="/assets/whale-showcase.html">大肥鱼外观试玩</a>' : '');
if (showcaseLooks.length) {
  const rig = await bundle('web/vendor-src/whale-rig-entry.js');
  // Stable URL with revalidation so an asset can be withdrawn without a year-long immutable cache.
  const rigFile = '/assets/whale-showcase-rig.js';
  await writeFile(path.join(web, rigFile.slice(1)), rig);
  assets.rig = { file: rigFile, sha256: digest(rig) };
  for (const scheme of alternateSchemes) {
    const textures = {};
    for (const dir of ['tex', 'feat']) {
      const relative = `schemes/${scheme}/${dir}`;
      const from = path.join(root, whaleDir, relative);
      for (const name of (await readdir(from)).sort()) {
        if (!name.endsWith('.png')) continue;
        textures[`${relative}/${name}`] = 'data:image/png;base64,' + (await readFile(path.join(from, name))).toString('base64');
      }
    }
    const file = `/assets/whale-scheme-${scheme}.json`;
    const data = JSON.stringify(textures);
    await writeFile(path.join(web, file.slice(1)), data);
    assets[scheme] = { file, sha256: digest(data) };
  }
  assets.showcase = await asset('whale-showcase', await bundle('demo-theme/whale-showcase.js', {
    plugins: [demo(true)],
    define: { __ROOMKIT_SHOWCASE_LOOKS__: JSON.stringify(showcaseLooks) },
  }));
  const showcase = await readFile(path.join(root, 'demo-theme/whale-showcase.html'), 'utf8');
  await writeFile(path.join(web, 'assets/whale-showcase.html'),
    showcase.replace(/\{\{(rig|packs|showcase)\}\}/g, (_, key) => assets[key].file));
}
await writeFile(path.join(web, 'index.html'), html);
const guide = await readFile(path.join(root, 'web/guide.html'), 'utf8');
const includeSource = process.env.ROOMKIT_SITE_SOURCE === '1';
const sourceLink = includeSource
  ? '<p><a href="/assets/roomkit-source.tar.gz">下载本站版本的源码与许可证</a></p>'
  : '';
await writeFile(path.join(web, 'guide.html'), guide.replace('<!-- ROOMKIT_SITE_SOURCE -->', sourceLink));

// 公共世界在 Node 里按正式流程校验，再交给服务端
const context = { window: {} };
for (const source of packSources) runInNewContext(source, context, { timeout: 1000 });
const packs = context.window.RoomKitPacks;
const { buildWorldRelease, collectWorldPacks } = await import('../shared/world-format.js');
const { exportPack } = await import('../web/roomkit/packs.js');
const SYSTEM_OWNER = 'system:roomkit';
const exported = packs.map((pack) => ({ ...exportPack({ ...pack, scenes: [] }), furniture: pack.furniture }));
const worlds = [];
for (const pack of packs) {
  for (const item of pack.worlds || []) {
    const release = await buildWorldRelease({
      worldId: item.worldId, revision: 1, title: item.scene.name, authorAccountId: SYSTEM_OWNER,
      scene: item.scene, packs: collectWorldPacks(item.scene, exported), activity: item.activity || null,
    });
    worlds.push({ worldId: item.worldId, release, listing: { summary: item.summary || '', seats: item.seats, maxSessions: item.maxSessions, sort: item.sort } });
  }
}
await writeFile(path.join(out, 'public-worlds.json'), JSON.stringify(worlds));

const { VERSION } = await import('../web/roomkit/version.js');
const { SESSION_PROTOCOL } = await import('../shared/world-format.js');
await writeFile(path.join(out, 'build.json'), JSON.stringify({ engine: VERSION, protocol: SESSION_PROTOCOL, assets, worlds: worlds.map(({ worldId, release }) => ({ worldId, hash: release.hash })) }, null, 2) + '\n');

if (includeSource) {
  const inputs = async (dir, filter) => (await readdir(path.join(root, dir), { withFileTypes: true }))
    .filter(file => file.isFile() && filter(file.name))
    .map(file => dir + '/' + file.name).sort();
  const roomkit = (await inputs('web/roomkit', name => name.endsWith('.js')))
    .filter(file => !DEMO.has(file) && file !== 'web/roomkit/paint-whale.js');
  const scripts = await inputs('scripts', name => /^(?:build-site|(?:town|world|account)[\w-]*)\.mjs$/.test(name));
  const notice = 'release-dsh/NOTICE.md';
  const defaultCharacters = 'web/roomkit/default-characters.js';
  const staging = await mkdtemp(path.join(tmpdir(), 'roomkit-site-source-'));
  try {
    await copyFile(path.join(root, showcaseLooks.length ? 'NOTICE.md' : notice), path.join(staging, 'NOTICE.md'));
    // The server also imports character.js directly, outside the esbuild resolver.
    await mkdir(path.join(staging, 'web/roomkit'), { recursive: true });
    await writeFile(path.join(staging, defaultCharacters),
      "export { DEFAULT_CHARACTERS, DEFAULT_ROLE, APPEARANCE_NOTICE } from '../../demo-theme/whale-girl.js';\n");
    execFileSync('tar', [
      '-czf', path.join(web, 'assets/roomkit-source.tar.gz'),
      '-C', staging, 'NOTICE.md', defaultCharacters, '-C', root, 'LICENSE', 'package.json', 'package-lock.json', notice,
      'demo-theme/whale-girl.js', 'neutral/world-assets.gen.js', 'src/web.js', 'web/site.html', 'web/guide.html',
      'web/packs/example/pack.js', 'web/packs/home/pack.js',
      ...(showcaseLooks.length ? [
        'demo-theme/whale-showcase.js', 'demo-theme/whale-showcase.html',
        'web/roomkit/bodies.js', 'web/roomkit/paint-whale.js', 'web/vendor-src',
        'room/vendor/coopanion/LICENSE', 'room/vendor/coopanion/kit',
        ...['figure.js', 'figure.json', 'model.json', 'tex', 'feat', ...alternateSchemes.map(id => 'schemes/' + id)]
          .map(file => whaleDir + '/' + file),
      ] : []),
      ...roomkit, ...scripts, ...await inputs('shared', name => name.endsWith('.js')),
    ], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
console.log(`站点已构建：${out}（${Object.values(assets).map((a) => path.basename(a.file)).join('、')}；公共世界 ${worlds.length} 个）`);
