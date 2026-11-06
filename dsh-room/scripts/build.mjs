/**
 * 构建：
 *   web/dist/roomkit.js    —— 引擎 IIFE（全局 RoomKit），独立网页 file:// 双击可用（MIT）
 *   web/vendor/whale-rig.js —— 可选真模型 IIFE（全局 RoomKitRig），贴图全部内嵌（AGPL-3.0，来自 room/vendor/coopanion）
 *   lib/client.js          —— DSH 浏览器半侧（IIFE，无顶层 import/export；react 由 DSH 的 require 提供）
 * 用法：npm i && node scripts/build.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const common = { bundle: true, format: 'iife', target: 'es2019', charset: 'utf8', legalComments: 'inline', logLevel: 'info' };

/* 真模型贴图 → 内嵌表（tex/*.png、feat/*.png → data URL） */
const whale = path.join(root, 'room/vendor/coopanion/whale');
const assets = {};
for (const dir of ['tex', 'feat']) {
  for (const f of readdirSync(path.join(whale, dir))) {
    if (f.endsWith('.png')) assets[`${dir}/${f}`] = 'data:image/png;base64,' + readFileSync(path.join(whale, dir, f)).toString('base64');
  }
}
mkdirSync(path.join(root, 'web/vendor-src'), { recursive: true });
writeFileSync(path.join(root, 'web/vendor-src/whale-assets.gen.js'), 'export const ASSETS = ' + JSON.stringify(assets) + ';\n');

/* 家具贴图 → 内嵌表（DSH 插件用：不依赖静态资源路由，桌面版也能显示） */
const spriteDir = path.join(root, 'web/packs/default/sprites');
const sprites = {};
for (const f of readdirSync(spriteDir)) {
  if (/\.(webp|png)$/.test(f)) sprites[f] = `data:image/${f.endsWith('webp') ? 'webp' : 'png'};base64,` + readFileSync(path.join(spriteDir, f)).toString('base64');
}
writeFileSync(path.join(root, 'src/sprites.gen.js'), 'window.RoomKitAssets = ' + JSON.stringify(sprites) + ';\n');

await build({ ...common, entryPoints: [path.join(root, 'web/roomkit/index.js')], globalName: 'RoomKit', outfile: path.join(root, 'web/dist/roomkit.js') });
await build({ ...common, entryPoints: [path.join(root, 'web/vendor-src/whale-rig-entry.js')], outfile: path.join(root, 'web/vendor/whale-rig.js') });
await build({ ...common, entryPoints: [path.join(root, 'src/client.js')], outfile: path.join(root, 'lib/client.js') });
await build({ ...common, entryPoints: [path.join(root, 'src/web.js')], outfile: path.join(root, 'web/dist/launch.js') });
