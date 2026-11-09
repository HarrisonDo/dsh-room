import { Catalog } from '../web/roomkit/catalog.js';
import { validatePack, exportPack, LIMITS } from '../web/roomkit/packs.js';
import { normalizeScene, ROOM_DEFAULTS, World } from '../web/roomkit/scene.js';
import { activityLayout } from './activities.js';
import { BUILTIN } from './world-assets.gen.js';

export const WORLD_BYTES = 4 * 1024 * 1024;
export const SESSION_PROTOCOL = 'roomkit.session/1';
const encoder = new TextEncoder();
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (source, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

export function worldError(field, message, code = 'invalid_action') {
  return Object.assign(new Error(`${field} ${message}`), { field, code });
}

export function canonicalJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (isObject(value)) {
    const fields = Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJSON(value[key]));
    return '{' + fields.join(',') + '}';
  }
  return JSON.stringify(value);
}

export async function digestJSON(value) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(canonicalJSON(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkTree(value, field, depth = 0) {
  if (depth > 12) throw worldError(field, '嵌套过深');
  if (Array.isArray(value)) {
    if (value.length > 500) throw worldError(field, '项目过多');
    for (const child of value) checkTree(child, field, depth + 1);
  } else if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > 300) throw worldError(field, '字段过多');
    for (const key of keys) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 80) throw worldError(field, '含不允许的字段名');
      checkTree(value[key], field, depth + 1);
    }
  } else if (value !== null && (typeof value === 'string' ? value.length > (value.startsWith('data:image/') ? WORLD_BYTES : 1000) : typeof value !== 'boolean' && !between(value, -1e8, 1e8))) {
    throw worldError(field, '含超出范围的值');
  }
}

function checkImage(value, field) {
  const match = typeof value === 'string' && /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length * 0.75 > LIMITS.imageBytes) throw worldError(field, '需要小于 2.5 MB 的内嵌 PNG 或 WebP');
  let data;
  try { data = atob(match[2]); } catch { throw worldError(field, '图片编码无效'); }
  const byte = (index) => data.charCodeAt(index);
  let w, h;
  if (match[1] === 'png' && data.startsWith('\x89PNG\r\n\x1a\n') && data.slice(12, 16) === 'IHDR') {
    const u32 = (offset) => byte(offset) * 2 ** 24 + byte(offset + 1) * 2 ** 16 + byte(offset + 2) * 256 + byte(offset + 3);
    w = u32(16); h = u32(20);
  } else if (match[1] === 'webp' && data.startsWith('RIFF') && data.slice(8, 12) === 'WEBP') {
    const tag = data.slice(12, 16);
    if (tag === 'VP8X' && !(byte(20) & 2)) {
      const u24 = (offset) => byte(offset) + byte(offset + 1) * 256 + byte(offset + 2) * 65536;
      w = u24(24) + 1; h = u24(27) + 1;
    } else if (tag === 'VP8L' && byte(20) === 47 && data.length >= 25) {
      w = 1 + (byte(21) | (byte(22) & 63) << 8);
      h = 1 + ((byte(22) >> 6) | byte(23) << 2 | (byte(24) & 15) << 10);
    } else if (tag === 'VP8 ' && data.slice(23, 26) === '\x9d\x01\x2a' && data.length >= 30) {
      w = (byte(26) | byte(27) << 8) & 16383; h = (byte(28) | byte(29) << 8) & 16383;
    }
  }
  if (!between(w, 1, 4096) || !between(h, 1, 4096) || w * h > 4_194_304) throw worldError(field, '图片格式或像素尺寸不合法');
}

const PACK_FIELDS = ['format', 'v', 'id', 'name', 'author', 'version', 'license', 'description', 'furniture', 'images'];
const DEF_FIELDS = ['id', 'name', 'sub', 'cat', 'mount', 'tags', 'size', 'height', 'blocks', 'wsize', 'wz', 'palette', 'variants', 'art', 'slots', 'states', 'act', 'light', 'info'];
function cleanPack(raw, index) {
  const field = `packs[${index}]`;
  if (!isObject(raw) || raw.format !== 'roomkit.pack' || raw.v !== 1 || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(raw.id || '') || raw.id === BUILTIN.id) throw worldError(field, '内容包版本或 id 不合法');
  if (![raw.name, raw.author, raw.license].every((value) => text(value, 40)) || !text(raw.version, 20)) throw worldError(field, '缺少名称、作者、版本或许可');
  if (!Array.isArray(raw.furniture) || !raw.furniture.length || raw.furniture.length > LIMITS.furniture) throw worldError(field, '家具数量不合法');
  const pack = pick(raw, PACK_FIELDS);
  if (pack.images != null && !isObject(pack.images)) throw worldError(field, '图片清单不合法');
  for (const [key, image] of Object.entries(pack.images || {})) checkImage(image, `${field}.images.${key}`);
  const ids = new Set();
  pack.furniture = pack.furniture.map((definition) => {
    if (!isObject(definition) || !text(definition.id, 48) || ids.has(definition.id)) throw worldError(field, '家具 id 不合法或重复');
    ids.add(definition.id);
    const def = pick(definition, DEF_FIELDS);
    if (def.art != null) {
      if (!isObject(def.art)) throw worldError(field, '家具外观无效');
      def.art = pick(def.art, ['kind', 'src', 'fit', 'dx', 'dy', 'sy', 'parts', 'draw']);
      if (def.art.src != null && def.art.src !== 'data:,') {
        if (typeof def.art.src === 'string' && def.art.src.startsWith('@')) {
          if (!Object.hasOwn(pack.images || {}, def.art.src.slice(1))) throw worldError(field, '图片引用缺失', 'missing_asset');
        } else checkImage(def.art.src, `${field}.furniture.${def.id}.art.src`);
      }
    }
    if (typeof def.act === 'string' && !/^(toggle:[a-z0-9_]+|use(:[a-z0-9_]+)?|info)$/.test(def.act)) delete def.act;
    return def;
  });
  checkTree(pack, field);
  let validated;
  try { validated = validatePack(pack); } catch { throw worldError(field, '内容包字段不合法'); }
  if (!validated.ok || validated.warnings.length || validated.pack.furniture.length !== pack.furniture.length) throw worldError(field, [...validated.errors, ...validated.warnings].join('、') || '家具校验失败');
  return { pack, definitions: validated.pack.furniture };
}

function cleanScene(raw) {
  if (!isObject(raw) || raw.format !== 'roomkit.scene' || ![1, 2].includes(raw.v)) throw worldError('scene.format/v', '场景版本不受支持', 'unsupported_version');
  if (!text(raw.id, 80) || !text(raw.name, 80)) throw worldError('scene', '缺少 id 或名称');
  if (!isObject(raw.room)) throw worldError('scene.room', '需要房间对象');
  const room = pick(raw.room, Object.keys(ROOM_DEFAULTS));
  if (![room.w, room.h].every((n) => Number.isInteger(n) && between(n, 1, 40))) throw worldError('scene.room', '尺寸必须在 1 到 40 格之间');
  if (room.cells != null && (!Array.isArray(room.cells) || room.cells.length > room.h || !room.cells.every((row) => typeof row === 'string' && row.length <= room.w && /^[a-z.]*$/.test(row)))) throw worldError('scene.room.cells', '格子布局不合法');
  if (room.mats != null) {
    if (!Array.isArray(room.mats) || room.mats.length > 26 || !room.mats.every(isObject)) throw worldError('scene.room.mats', '材质清单不合法');
    room.mats = room.mats.map((material) => pick(material, ['kind', 'color']));
  }
  if (room.walls != null) {
    if (!isObject(room.walls)) throw worldError('scene.room.walls', '墙面配置不合法');
    room.walls = pick(room.walls, Object.keys(ROOM_DEFAULTS.walls));
    for (const side of ['left', 'right']) if (room.walls[side] != null && typeof room.walls[side] !== 'boolean') throw worldError('scene.room.walls', '墙面开关不合法');
    if (room.walls.height != null && !between(room.walls.height, 0, 600)) throw worldError('scene.room.walls.height', '墙高超限');
  }
  if (room.slab != null && !between(room.slab, 0, 100)) throw worldError('scene.room.slab', '地板厚度超限');
  if (!Array.isArray(raw.objects) || raw.objects.length > 400) throw worldError('scene.objects', '物件数量不合法');
  const ids = new Set();
  const objects = raw.objects.map((item, index) => {
    const field = `scene.objects[${index}]`;
    if (!isObject(item) || !text(item.id, 80) || !text(item.def, 100) || ids.has(item.id)) throw worldError(field, '实例或定义 id 不合法');
    ids.add(item.id);
    const object = pick(item, ['id', 'def', 'x', 'y', 'wall', 'at', 'z', 'rot', 'state', 'variant', 'colors']);
    const { x, y, wall, at, z, rot, state, colors } = object;
    if (wall == null) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || !between(x, 0, room.w - 1) || !between(y, 0, room.h - 1)) throw worldError(field, '地面坐标不合法');
    } else if (!['left', 'right'].includes(wall) || !between(at, 0, wall === 'left' ? room.h : room.w) || (z != null && !between(z, 0, 600))) throw worldError(field, '墙面坐标不合法');
    if (rot != null && (!Number.isInteger(rot) || !between(rot, 0, 3))) throw worldError(field, '朝向不合法');
    if (state != null && !isObject(state)) throw worldError(field, '状态不合法');
    if (colors != null && !isObject(colors)) throw worldError(field, '调色不合法');
    if (state) {
      checkTree(state, field);
      object.state = Object.fromEntries(Object.entries(state).filter(([key, value]) => key !== 'to' && ['boolean', 'number', 'string'].includes(typeof value)));
    }
    return object;
  });
  const env = isObject(raw.env) ? pick(raw.env, ['period', 'weather']) : {};
  checkTree({ room, objects, env }, 'scene');
  return normalizeScene({ format: 'roomkit.scene', v: raw.v, id: raw.id, name: raw.name, room, objects, agents: [], env });
}

function cleanActivity(raw) {
  if (raw == null) return null;
  if (!isObject(raw) || raw.kind !== 'cooperative-beacons' || raw.v !== 1 || raw.minContributors !== 2
    || !Array.isArray(raw.beaconIds) || raw.beaconIds.length !== 3 || ![...raw.beaconIds, raw.exitId].every((id) => text(id, 80))
    || new Set([...raw.beaconIds, raw.exitId]).size !== 4) throw worldError('activity', '需要三个不同信标和一个出口');
  return pick(raw, ['kind', 'v', 'beaconIds', 'exitId', 'minContributors']);
}

function catalogFor(release, definitions, sprites) {
  const catalog = new Catalog();
  if (release.dependencies.some(({ source }) => source === 'builtin')) {
    catalog.addAll(BUILTIN.furniture.map((def) => {
      const file = def.art?.src?.split('/').pop();
      return file && sprites?.[file] ? { ...def, art: { ...def.art, src: sprites[file] } } : def;
    }));
  }
  catalog.addAll(definitions);
  return catalog;
}

export function worldRuntime(release, sprites) {
  const definitions = release.packs.flatMap((pack) => validatePack(pack).pack.furniture);
  const catalog = catalogFor(release, definitions, sprites);
  const world = new World(catalog, release.scene);
  return { catalog, world, ...activityLayout(world, release.activity) };
}

export async function buildWorldRelease({ worldId, revision, title, authorAccountId, scene, packs = [], activity = null }) {
  if (![worldId, title, authorAccountId].every((value) => text(value, 80)) || !Number.isSafeInteger(revision) || revision < 1) throw worldError('worldId/revision/title/authorAccountId', '发布信息不合法');
  const clean = cleanScene(scene);
  if (!Array.isArray(packs) || packs.length > 16) throw worldError('packs', '依赖数量超限');
  const embedded = packs.map(cleanPack);
  if (new Set(embedded.map(({ pack }) => pack.id)).size !== embedded.length) throw worldError('packs', '同名内容包冲突', 'missing_asset');

  const used = new Set(clean.objects.map((object) => object.def));
  const builtin = BUILTIN.furniture.some(({ id }) => used.has(id));
  const sources = new Set(builtin ? BUILTIN.furniture.map(({ id }) => id) : []);
  const dependencies = builtin ? [{ id: BUILTIN.id, version: BUILTIN.version, hash: BUILTIN.hash, source: 'builtin' }] : [];
  const release = { format: 'roomkit.world', v: 1, worldId, revision, title, authorAccountId, protocol: SESSION_PROTOCOL,
    scene: clean, dependencies, packs: embedded.map(({ pack }) => pack), activity: cleanActivity(activity) };
  if (encoder.encode(JSON.stringify(release)).length + 74 > WORLD_BYTES) throw worldError('world', '发布包超过 4 MiB', 'body_too_large');

  for (const { pack, definitions } of embedded) {
    for (const { id } of definitions) sources.add(id);
    dependencies.push({ id: pack.id, version: pack.version, hash: await digestJSON(pack), source: 'embedded' });
  }
  if (encoder.encode(JSON.stringify(release)).length + 74 > WORLD_BYTES) throw worldError('world', '发布包超过 4 MiB', 'body_too_large');
  for (const id of used) if (!sources.has(id)) throw worldError('scene.objects.def', `缺少家具 ${id}`, 'missing_asset');
  const catalog = catalogFor(release, embedded.flatMap(({ definitions }) => definitions));
  const world = new World(catalog, clean);
  for (const object of world.objects) {
    const def = world.def(object);
    if ((def.mount === 'wall') !== Boolean(object.wall)) throw worldError('scene.objects', `家具 ${object.id} 的摆放方式不符`);
    const area = world.footprint(object, def);
    if (area && (area.x1 > world.room.w || area.y1 > world.room.h)) throw worldError('scene.objects', `家具 ${object.id} 超出房间`);
  }
  try { activityLayout(world, release.activity); }
  catch (error) { throw worldError('activity', error.message); }
  return { ...release, hash: await digestJSON(release) };
}

export async function verifyWorldRelease(raw) {
  if (!isObject(raw) || raw.format !== 'roomkit.world' || raw.v !== 1 || raw.protocol !== SESSION_PROTOCOL) throw worldError('format/v/protocol', '世界版本不受支持', 'unsupported_version');
  if (!Array.isArray(raw.dependencies) || raw.dependencies.length > 17) throw worldError('dependencies', '依赖清单不合法', 'missing_asset');
  checkTree(raw.dependencies, 'dependencies');
  const release = await buildWorldRelease(raw);
  if (canonicalJSON(raw.dependencies) !== canonicalJSON(release.dependencies)) throw worldError('dependencies', '素材版本或摘要不一致', 'missing_asset');
  if (raw.hash !== release.hash) throw worldError('hash', '世界摘要不一致');
  return release;
}

export function collectWorldPacks(scene, packs, metadata = {}) {
  const used = new Set(scene.objects.map(({ def }) => def));
  const byId = new Map();
  for (const pack of packs) if (pack.id !== BUILTIN.id) {
    for (const furniture of pack.furniture || []) if (used.has(furniture.id)) {
      if (byId.has(furniture.id)) throw worldError('packs', `同名家具冲突 ${furniture.id}`, 'missing_asset');
      byId.set(furniture.id, pack);
    }
  }
  return [...new Set(byId.values())].map((pack) => exportPack({
    ...pack, furniture: pack.furniture.filter(({ id }) => used.has(id)),
    author: pack.author || metadata.author, license: pack.license || metadata.license,
    scenes: [], stories: [], plays: [], characters: [],
  }));
}
