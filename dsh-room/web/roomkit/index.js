/**
 * RoomKit 入口：可布置、会自己过日子、能接群体的 2.5D 房间引擎（零依赖）。
 * ES 模块直接用；esbuild 打成 IIFE（dist/roomkit.js）后为全局 RoomKit，file:// 双击可用。
 */
export { mount, localStore, VERSION } from './app.js';
export { Catalog, normalizeDef, paletteOf } from './catalog.js';
export { World, normalizeScene, ROOM_DEFAULTS } from './scene.js';
export { Iso, orient } from './iso.js';
export { Nav } from './nav.js';
export { envAt, PERIODS, WEATHERS } from './env.js';
export { WHALE_LOOKS } from './appearance.js';
export { PHRASES } from './brain.js';
export { normalizeStory } from './story.js';
export { normalizeCharacter, readCharacterFile, DEFAULT_CHARACTERS } from './character.js';
export { validatePack, exportPack, PackStore, LIMITS as PACK_LIMITS } from './packs.js';
export { Home, defaultHome, normalizeHome } from './home.js';
export { parseActs, OFFLINE_RULES } from './shell.js';
