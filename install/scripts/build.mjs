import { build } from 'esbuild';

const common = { bundle: true, format: 'iife', target: 'es2019', charset: 'utf8', legalComments: 'inline' };
await build({ ...common, entryPoints: ['web/roomkit/index.js'], globalName: 'RoomKit', outfile: 'web/dist/roomkit.js' });
await build({ ...common, entryPoints: ['src/web.js'], outfile: 'web/dist/launch.js' });
await build({ ...common, entryPoints: ['src/desktop-web.js'], outfile: 'web/dist/desktop-launch.js' });
await build({ ...common, entryPoints: ['src/client.js'], outfile: 'lib/client.js' });
