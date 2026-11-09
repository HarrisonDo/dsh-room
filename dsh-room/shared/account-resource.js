export const MAX_HOME_BYTES = 256 * 1024;
export const HOME_FORMAT = 'roomkit.account-home';
export const RESOURCE_FORMAT = 'roomkit.account-resource';

export const accountError = (code, reason, message) => Object.assign(new Error(message), { code, reason });
const invalid = (field) => { throw accountError(400, 'invalid_resource', '无效字段 ' + field); };

export function fields(value, allowed, label) {
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
      Object.keys(value).some(key => !allowed.includes(key))) invalid(label);
  return value;
}

function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid(label);
  return value;
}

export function resourceId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) invalid('resourceId');
  return value;
}

function roomId(value) {
  const id = text(value, 120, 'room id');
  if (/[\\:?#]/u.test(id) || id.split('/').some(part => !part.trim() || part === '.' || part === '..')) invalid('room id');
  return id;
}

const definitionId = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value) || value.length > 120) invalid('def');
  return value;
};

function number(value, min, max, label, integer = false) {
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) invalid(label);
  return value === 0 ? 0 : value;
}

function choice(value, values, label) {
  if (!values.includes(value)) invalid(label);
  return value;
}

function color(value) {
  if (typeof value !== 'string' || !/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value)) invalid('color');
  return value;
}

function array(value, min, max, label) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(label);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) invalid(label);
}

function normalizeRoom(raw) {
  fields(raw, ['w', 'h', 'mats', 'cells', 'walls', 'slab', 'outdoor'], 'room');
  const w = number(raw.w, 1, 40, 'room.w', true);
  const h = number(raw.h, 1, 40, 'room.h', true);
  const out = { w, h };
  if (raw.outdoor !== undefined) out.outdoor = choice(raw.outdoor, [true, false], 'outdoor');
  if (raw.mats !== undefined) {
    out.mats = array(raw.mats, 1, 26, 'mats').map(mat => {
      fields(mat, ['kind', 'color'], 'mat');
      return { kind: choice(mat.kind, ['wood', 'tile', 'carpet', 'stone', 'grass', 'plain'], 'mat.kind'), color: color(mat.color) };
    });
  }
  if (raw.cells !== undefined) {
    const size = out.mats?.length ?? 1;
    out.cells = raw.cells === null ? null : array(raw.cells, h, h, 'cells').map(row => {
      if (typeof row !== 'string' || row.length !== w || [...row].some(cell => cell !== '.' && (cell.charCodeAt(0) < 97 || cell.charCodeAt(0) >= 97 + size))) invalid('cells');
      return row;
    });
  }
  if (raw.walls !== undefined) {
    fields(raw.walls, ['left', 'right', 'height', 'color', 'wainscot', 'trim', 'pattern'], 'walls');
    out.walls = {};
    for (const key of ['left', 'right']) if (raw.walls[key] !== undefined) out.walls[key] = choice(raw.walls[key], [true, false], 'walls.' + key);
    if (raw.walls.height !== undefined) out.walls.height = number(raw.walls.height, 0, 1000, 'wall height');
    for (const key of ['color', 'wainscot', 'trim']) if (raw.walls[key] !== undefined) out.walls[key] = color(raw.walls[key]);
    if (raw.walls.pattern !== undefined) out.walls.pattern = choice(raw.walls.pattern, ['plain', 'stripes', 'dots', 'bricks'], 'wall pattern');
  }
  if (raw.slab !== undefined) out.slab = number(raw.slab, 0, 100, 'slab');
  return out;
}

function normalizeObject(raw, room, roomIds) {
  fields(raw, ['id', 'def', 'rot', 'state', 'x', 'y', 'wall', 'at', 'z', 'colors', 'variant'], 'object');
  const out = { id: resourceId(raw.id), def: definitionId(raw.def), rot: number(raw.rot ?? 0, 0, 3, 'rot', true) };
  if (raw.wall === undefined) {
    if (raw.at !== undefined || raw.z !== undefined) invalid('floor position');
    out.x = number(raw.x, 0, room.w - 1, 'x', true);
    out.y = number(raw.y, 0, room.h - 1, 'y', true);
  } else {
    if (raw.x !== undefined || raw.y !== undefined) invalid('wall position');
    out.wall = choice(raw.wall, ['left', 'right'], 'wall');
    if (room.walls?.[out.wall] === false) invalid('wall position');
    out.at = number(raw.at, 0, out.wall === 'left' ? room.h : room.w, 'at');
    if (raw.z !== undefined) out.z = raw.z === null ? null : number(raw.z, 0, 1000, 'z');
  }
  if (raw.variant !== undefined) out.variant = number(raw.variant, 0, 7, 'variant', true);
  if (raw.colors !== undefined) {
    const paletteKeys = ['__proto__', 'constructor', 'prototype'];
    const keys = Object.keys(raw.colors ?? {});
    fields(raw.colors, keys, 'colors');
    if (keys.length > 24 || keys.some(key => !/^[a-z][a-z0-9_]{0,23}$/i.test(key) || paletteKeys.includes(key))) invalid('colors');
    out.colors = Object.fromEntries(keys.sort().map(key => [key, color(raw.colors[key])]));
  }
  const state = fields(raw.state === undefined ? {} : raw.state, ['to', 'on', 'open', 'curtain', 'working', 'text'], 'state');
  out.state = {};
  if (Object.hasOwn(state, 'to')) {
    if (state.to !== null && !roomIds.has(state.to)) invalid('state.to');
    out.state.to = state.to;
  }
  for (const key of ['on', 'open', 'curtain', 'working']) {
    if (Object.hasOwn(state, key)) out.state[key] = choice(state[key], [true, false], 'state.' + key);
  }
  if (Object.hasOwn(state, 'text')) {
    const value = state.text;
    if (value !== '') text(value, 120, 'state.text');
    out.state.text = value;
  }
  return out;
}

export function validateAccountHome(raw) {
  fields(raw, ['format', 'schemaVersion', 'homeId', 'name', 'floors', 'rooms', 'assetRefs'], 'home');
  if (raw.format !== HOME_FORMAT || raw.schemaVersion !== 1) throw accountError(400, 'unsupported_format', '不支持的家快照格式');
  const floors = array(raw.floors, 1, 24, 'floors').map(floor => text(floor, 8, 'floor'));
  unique(floors, 'floors');
  const roomInput = array(raw.rooms, 1, 24, 'rooms');
  const ids = roomInput.map(r => roomId(fields(r, ['id', 'name', 'floor', 'layout'], 'room entry').id));
  unique(ids, 'room IDs');
  const roomIds = new Set(ids);
  const used = new Set();
  let objectCount = 0;
  const rooms = roomInput.map(({ id, name, floor, layout }) => {
    fields(layout, ['room', 'objects'], 'layout');
    const room = normalizeRoom(layout.room);
    const objects = array(layout.objects, 0, 400, 'objects').map(rawObject => {
      const object = normalizeObject(rawObject, room, roomIds);
      if (++objectCount > 1200) invalid('object count');
      used.add(object.def);
      return object;
    });
    unique(objects.map(object => object.id), 'object IDs');
    return { id, name: text(name, 80, 'room name'), floor: choice(floor, floors, 'room floor'), layout: { room, objects } };
  });
  const assetRefs = array(raw.assetRefs, 0, 256, 'assetRefs').map(ref => {
    fields(ref, ['def', 'assetId', 'version', 'hash'], 'asset reference');
    if (typeof ref.hash !== 'string' || !/^[a-f0-9]{64}$/.test(ref.hash)) invalid('asset hash');
    if (typeof ref.version !== 'string' || !/^[a-zA-Z0-9_.-]{1,40}$/.test(ref.version)) invalid('asset version');
    return { def: definitionId(ref.def), assetId: resourceId(ref.assetId), version: ref.version, hash: ref.hash };
  });
  unique(assetRefs.map(ref => ref.def), 'asset definitions');
  if (assetRefs.length !== used.size || assetRefs.some(ref => !used.has(ref.def))) {
    throw accountError(400, 'missing_asset', '布局与素材清单不匹配');
  }
  assetRefs.sort((a, b) => a.def < b.def ? -1 : a.def > b.def ? 1 : 0);
  const result = { format: HOME_FORMAT, schemaVersion: 1, homeId: resourceId(raw.homeId), name: text(raw.name, 80, 'home name'), floors, rooms, assetRefs };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_HOME_BYTES) throw accountError(413, 'resource_too_large', '家快照过大');
  return result;
}

// Local projection omits scene-level personal state. Unsupported layout fields are surfaced by validation.
export function projectAccountHome({ homeId, home, sceneFor, assetRefs }) {
  return validateAccountHome({
    format: HOME_FORMAT, schemaVersion: 1, homeId, name: home.name, floors: home.floors, assetRefs,
    rooms: home.rooms.map(({ id, name, floor }) => {
      const scene = sceneFor(id);
      if (scene?.format !== 'roomkit.scene' || scene.v !== 2 || scene.id !== id) invalid('scene ' + id);
      return { id, name, floor, layout: { room: scene.room, objects: scene.objects } };
    }),
  });
}
