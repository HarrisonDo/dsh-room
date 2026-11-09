import { build } from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const schemes = ['harness', 'chatgpt', 'claude', 'gemini', 'qwen', 'kimi', 'minimax'];

const common = { bundle: true, format: 'iife', target: 'es2019', charset: 'utf8', legalComments: 'inline',
  define: { ROOMKIT_PACKAGED_LOOKS: JSON.stringify(['blue', ...schemes, 'rose']) } };
await build({ ...common, entryPoints: ['web/roomkit/index.js'], globalName: 'RoomKit', outfile: 'web/dist/roomkit.js' });
await build({ ...common, entryPoints: ['src/web.js'], outfile: 'web/dist/launch.js' });
await build({ ...common, entryPoints: ['src/desktop-web.js'], outfile: 'web/dist/desktop-launch.js' });
await build({ ...common, entryPoints: ['src/client.js'], outfile: 'lib/client.js' });

await build({ ...common, entryPoints: ['web/vendor-src/whale-rig-entry.js'], outfile: 'web/vendor/whale-showcase-rig.js' });
for (const scheme of schemes) {
  const textures = {};
  for (const part of ['tex', 'feat']) {
    const dir = `schemes/${scheme}/${part}`;
    const input = 'room/vendor/coopanion/whale/' + dir;
    for (const name of (await readdir(input)).sort()) {
      if (!name.endsWith('.png')) continue;
      textures[dir + '/' + name] = 'data:image/png;base64,' + (await readFile(input + '/' + name)).toString('base64');
    }
  }
  await writeFile(`web/vendor/whale-scheme-${scheme}.json`, JSON.stringify(textures));
}
