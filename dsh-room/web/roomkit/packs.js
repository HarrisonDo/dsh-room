/**
 * RoomKit · 社区内容包：格式校验、命名空间、图片内嵌、本地持久化（IndexedDB）。
 *
 * 一个包 = 一个 JSON 文件（roomkit.pack v1），图片以 data URL 内嵌在 images 里，家具用 "@名字" 引用：
 *   { format:'roomkit.pack', v:1, id, name, author, version, license, description,
 *     images:{ 名字: 'data:image/webp;base64,...' },
 *     furniture:[FurnitureDef...], scenes:[Scene...], stories:[Story...], plays:[Play...], characters:[Character...] }
 * 导入时：
 *   · 所有 id 自动加 "包id/" 前缀（同名不打架；包内互相引用会一起改名）
 *   · 只保留白名单字段与动作；任何 html、函数、外链图片都会被丢掉（别人的包也能放心装）
 *   · 有大小与数量上限，超出直接拒绝
 * 详细字段见 docs/04-内容格式规范.md。
 */
import { clone } from './util.js';
import { normalizeCharacter } from './character.js';

export const LIMITS = { imageBytes: 2.5e6, totalBytes: 15e6, furniture: 300, parts: 200, scenes: 20, stories: 60, steps: 400, text: 400 };

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/i;
const POSES = ['stand', 'walk', 'run', 'sit', 'sleep', 'work', 'read', 'eat', 'dance', 'jump', 'sad', 'wave', 'look', 'cook'];
const PART_T = ['box', 'cyl', 'cone', 'ball', 'rug', 'fx'];
const WALL_DRAW = ['window', 'door', 'frame', 'clock', 'shelf', 'cabinet', 'rack', 'poster', 'image'];
const STEP_DO = ['line', 'narrate', 'choice', 'goto', 'end', 'set', 'inc', 'camera', 'cmd', 'use', 'pose', 'emote', 'expr', 'face', 'state', 'env', 'outfit', 'wait', 'sfx', 'say'];
const CMD_OPS = ['agent.say', 'agent.use', 'agent.goto', 'agent.pose', 'agent.emote', 'env.set', 'object.state'];
const ACT_RE = /^(toggle:[a-z0-9_]{1,24}|use(:[a-z0-9_]{1,24})?|play:[a-z0-9_/-]{1,64}|weather|shake|info)$/i;
const DATA_URL_RE = /^data:image\/(png|webp|jpeg|gif|avif);base64,[a-z0-9+/=]+$/i;

const num = (v, a, b, d) => { const n = +v; return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n || LIMITS.text);
const colorOrKey = (v) => (typeof v === 'string' && (COLOR_RE.test(v) || KEY_RE.test(v)) ? v : null);

export function validatePack(raw) {
  const errors = [], warnings = [];
  const fail = (m) => { errors.push(m); return { ok: false, errors, warnings }; };
  if (!raw || typeof raw !== 'object') return fail('不是 JSON 对象');
  if (raw.format && raw.format !== 'roomkit.pack') return fail('format 不是 roomkit.pack');
  if (!raw.format) warnings.push('缺少 format 字段，按 roomkit.pack 处理');
  if (!ID_RE.test(raw.id || '')) return fail('包 id 只能用字母数字、下划线、连字符（≤48）');
  const id = String(raw.id).toLowerCase();
  const pack = {
    format: 'roomkit.pack', v: 1, id, community: true,
    name: str(raw.name || id, 40), author: str(raw.author, 40), version: str(raw.version || '1.0.0', 20),
    license: str(raw.license, 40), description: str(raw.description, 300),
    furniture: [], scenes: [], stories: [], plays: [], characters: [],
  };
  // 图片
  const images = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw.images || {})) {
    if (!KEY_RE.test(k.replace(/[-.]/g, '_'))) { warnings.push('图片名不合法，已跳过：' + k); continue; }
    if (typeof v !== 'string' || !DATA_URL_RE.test(v)) { warnings.push('图片必须是内嵌 data URL（png/webp/jpeg），已跳过：' + k); continue; }
    const bytes = Math.round(v.length * 0.75);
    if (bytes > LIMITS.imageBytes) return fail(`图片 ${k} 太大（${(bytes / 1e6).toFixed(1)}MB > 2.5MB）`);
    total += bytes;
    images[k] = v;
  }
  if (total > LIMITS.totalBytes) return fail(`图片总量太大（${(total / 1e6).toFixed(1)}MB > 15MB）`);
  const localIds = new Set((raw.furniture || []).map((d) => d && d.id).filter(Boolean));
  const localPlays = new Set((raw.plays || []).map((p) => p && p.id).filter(Boolean));
  const localScenes = new Set((raw.scenes || []).map((s) => s && s.id).filter(Boolean));
  const ns = (x) => (x && localIds.has(x) ? id + '/' + x : x);
  const nsPlay = (x) => (x && localPlays.has(x) ? id + '/' + x : x);
  ns.scene = (x) => (x && localScenes.has(x) ? id + '/' + x : x);
  // 家具
  for (const d of (raw.furniture || []).slice(0, LIMITS.furniture)) {
    try { pack.furniture.push(cleanDef(d, id, images, warnings, nsPlay)); } catch (e) { warnings.push('家具 ' + (d && d.id) + ' 已跳过：' + e.message); }
  }
  // 场景
  for (const s of (raw.scenes || []).slice(0, LIMITS.scenes)) {
    if (!s || !s.room) { warnings.push('场景缺少 room，已跳过'); continue; }
    const c = clone(s);
    c.id = id + '/' + str(c.id || 'scene', 40);
    c.name = str(c.name || c.id, 40);
    c.objects = (c.objects || []).slice(0, 400).map((o) => Object.assign({}, o, { def: ns(o.def) }));
    c.stories = (c.stories || []).slice(0, 20).map((st) => cleanStory(st, id, ns, warnings)).filter(Boolean);
    c.agents = (c.agents || []).slice(0, 30).map((a) => ({ id: str(a.id, 48), name: str(a.name, 16), kind: a.kind === 'whale' ? 'whale' : 'girl', brain: ['auto', 'pet', 'manual'].includes(a.brain) ? a.brain : 'auto', x: num(a.x, 0, 40, 1), y: num(a.y, 0, 40, 1), look: cleanLook(a.look), character: a.character ? id + '/' + str(a.character, 40) : undefined }));
    pack.scenes.push(c);
  }
  for (const st of (raw.stories || []).slice(0, LIMITS.stories)) { const c = cleanStory(st, id, ns, warnings); if (c) pack.stories.push(c); }
  for (const pl of (raw.plays || []).slice(0, LIMITS.stories)) {
    if (!pl || !pl.id || !Array.isArray(pl.steps)) continue;
    pack.plays.push({ id: id + '/' + str(pl.id, 40), name: str(pl.name, 40), steps: pl.steps.slice(0, LIMITS.steps).map((s) => cleanStep(s, ns)).filter(Boolean) });
  }
  for (const ch of (raw.characters || []).slice(0, 30)) {
    try { const c = normalizeCharacter(ch); c.id = id + '/' + c.id; c.look = cleanLook(c.look); if (ch.avatar && DATA_URL_RE.test(ch.avatar)) c.avatar = ch.avatar; pack.characters.push(c); } catch (e) { warnings.push('角色卡已跳过：' + e.message); }
  }
  if (!pack.furniture.length && !pack.scenes.length && !pack.stories.length && !pack.characters.length) return fail('包里没有可用内容');
  return { ok: true, pack, errors, warnings };
}

function cleanLook(l) {
  const o = {};
  if (!l || typeof l !== 'object') return o;
  for (const k of ['body', 'belly', 'cheek', 'accent']) if (COLOR_RE.test(l[k] || '')) o[k] = l[k];
  if (['maid', 'bow', 'cap', ''].includes(l.hat)) o.hat = l.hat;
  if (l.size != null) o.size = num(l.size, 0.6, 2.2, 1.4);
  return o;
}

function cleanDef(d, packId, images, warnings, nsPlay) {
  if (!d || !ID_RE.test(d.id || '')) throw new Error('id 不合法');
  const mount = ['floor', 'flat', 'wall'].includes(d.mount) ? d.mount : 'floor';
  const def = {
    id: packId + '/' + d.id, name: str(d.name || d.id, 24), sub: str(d.sub, 40), cat: KEY_RE.test(d.cat || '') ? d.cat : 'misc',
    mount, tags: Array.isArray(d.tags) ? d.tags.slice(0, 8).map((t) => str(t, 16)) : [], pack: packId,
  };
  if (mount === 'wall') {
    def.wsize = [num(d.wsize && d.wsize[0], 0.3, 6, 1), num(d.wsize && d.wsize[1], 10, 400, 80)];
    def.wz = num(d.wz, 0, 400, 80);
  } else {
    def.size = [Math.round(num(d.size && d.size[0], 1, 8, 1)), Math.round(num(d.size && d.size[1], 1, 8, 1))];
    def.height = num(d.height, 1, 600, mount === 'flat' ? 2 : 60);
    if (d.blocks === false) def.blocks = false;
  }
  // 调色
  def.palette = {};
  for (const [k, v] of Object.entries(d.palette || {})) if (KEY_RE.test(k) && COLOR_RE.test(v)) def.palette[k] = v;
  def.variants = (Array.isArray(d.variants) ? d.variants : []).slice(0, 8).map((vr) => { const o = {}; for (const [k, v] of Object.entries(vr || {})) if (KEY_RE.test(k) && COLOR_RE.test(v)) o[k] = v; return o; });
  // 外观
  const art = d.art || {};
  if (art.kind === 'sprite') {
    let src = typeof art.src === 'string' ? art.src : '';
    if (src[0] === '@') src = images[src.slice(1)] || '';
    else if (!DATA_URL_RE.test(src)) src = '';
    const parts = cleanParts(art.parts);
    if (!src && !parts.length) throw new Error('贴图必须引用包内图片（"@名字"）');
    def.art = { kind: 'sprite', src: src || 'data:,', fit: num(art.fit, 0.1, 3, 1), dx: num(art.dx, -400, 400, 0), dy: num(art.dy, -400, 400, 0), sy: num(art.sy, 0.2, 2, 1) };
    if (parts.length) def.art.parts = parts;
  } else if (art.kind === 'wall' || mount === 'wall') {
    def.art = { kind: 'wall', draw: WALL_DRAW.includes(art.draw) ? art.draw : 'frame' };
    if (def.art.draw === 'image') {
      let src = typeof art.src === 'string' ? art.src : '';
      if (src[0] === '@') src = images[src.slice(1)] || '';
      else if (!DATA_URL_RE.test(src)) src = '';
      if (!src) throw new Error('图片墙饰必须引用包内图片（"@名字"）');
      def.art.src = src;
    }
  } else {
    def.art = { kind: 'proc', parts: cleanParts(art.parts) };
  }
  // 交互位
  def.slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 8).map((s, i) => ({
    id: KEY_RE.test(s.id || '') ? s.id : 'slot' + i, pose: POSES.includes(s.pose) ? s.pose : 'stand',
    at: [num(s.at && s.at[0], -2, 10, 0.5), num(s.at && s.at[1], -2, 10, 0.5)],
    face: [Math.sign(num(s.face && s.face[0], -1, 1, 0)), Math.sign(num(s.face && s.face[1], -1, 1, 1))],
    z: num(s.z, 0, 300, 0), dur: [num(s.dur && s.dur[0], 1, 600, 6), num(s.dur && s.dur[1], 1, 600, 14)],
    need: cleanNeed(s.need), layer: s.layer === 'back' ? 'back' : 'front', label: str(s.label, 16),
    say: Array.isArray(s.say) ? s.say.slice(0, 6).map((x) => str(x, 40)) : undefined,
  }));
  // 状态、动作、灯
  def.states = {};
  for (const [k, v] of Object.entries(d.states || {})) if (KEY_RE.test(k) && ['boolean', 'number'].includes(typeof v)) def.states[k] = v;
  if (typeof d.act === 'string' && ACT_RE.test(d.act)) {
    // 引用包内小剧场时跟着加命名空间；引用默认包等外部剧场时保持原样
    def.act = d.act.indexOf('play:') === 0 ? 'play:' + nsPlay(d.act.slice(5)) : d.act;
  }
  if (Array.isArray(d.say)) def.say = d.say.slice(0, 6).map((x) => str(x, 40));
  if (mount === 'wall' && d.portal === true) def.portal = true;   // 门：state.to 通往家里的另一个房间
  if (d.light && typeof d.light === 'object') {
    def.light = { at: [num(d.light.at && d.light.at[0], -2, 10, 0.5), num(d.light.at && d.light.at[1], -2, 10, 0.5)], z: num(d.light.z, 0, 400, 80), radius: num(d.light.radius, 0.3, 8, 2.5), color: COLOR_RE.test(d.light.color || '') ? d.light.color : '#ffd59a', power: num(d.light.power, 0.1, 1.5, 1) };
    if (typeof d.light.when === 'string' && /^!?[a-z0-9_]{1,24}$/i.test(d.light.when)) def.light.when = d.light.when;
  }
  if (d.info && typeof d.info === 'object') {
    def.info = { title: str(d.info.title, 40), sub: str(d.info.sub, 60), lines: (Array.isArray(d.info.lines) ? d.info.lines : []).slice(0, 12).map((l) => (Array.isArray(l) ? [str(l[0], 24), str(l[1], 60)] : str(l, 80))) };
  }
  return def;
}

function cleanNeed(n) {
  const o = {};
  for (const k of ['energy', 'fun', 'social']) if (n && n[k] != null) o[k] = num(n[k], -1, 1, 0);
  return o;
}

function cleanParts(parts) {
  if (!Array.isArray(parts)) return [];
  const out = [];
  for (const p of parts.slice(0, LIMITS.parts)) {
    if (!p || !PART_T.includes(p.t)) continue;
    const q = { t: p.t };
    for (const k of ['x', 'y', 'w', 'd', 'r', 'r0', 'r1']) if (p[k] != null) q[k] = num(p[k], -2, 12, 0);
    for (const k of ['z', 'h']) if (p[k] != null) q[k] = num(p[k], 0, 600, 0);
    if (p.o != null) q.o = num(p.o, 0.05, 1, 1);
    if (p.sq != null) q.sq = num(p.sq, 0.2, 2, 0.9);
    if (p.bias != null) q.bias = num(p.bias, -0.1, 0.1, 0);
    for (const k of ['c', 'b', 'glowC']) { const c = colorOrKey(p[k]); if (c) q[k] = c; }
    if (p.faces) { q.faces = {}; for (const f of ['top', 'px', 'nx', 'py', 'ny']) { const c = colorOrKey(p.faces[f]); if (c) q.faces[f] = c; } }
    if (['px', 'nx', 'py', 'ny'].includes(p.glow)) q.glow = p.glow;
    for (const k of ['lit', 'when']) if (typeof p[k] === 'string' && /^!?[a-z0-9_]{1,24}$/i.test(p[k])) q[k] = p[k];
    if (p.open) q.open = true;
    if (p.t === 'rug') { q.shape = p.shape === 'round' ? 'round' : 'rect'; if (['stripes', 'rings'].includes(p.pattern)) q.pattern = p.pattern; }
    if (p.t === 'fx') q.fx = 'fish';
    out.push(q);
  }
  return out;
}

function cleanStep(s, ns) {
  if (!s || typeof s !== 'object') return null;
  if (Array.isArray(s.par)) return { par: s.par.slice(0, 12).map((x) => cleanStep(x, ns)).filter(Boolean) };
  if (!STEP_DO.includes(s.do)) return null;
  const o = { do: s.do };
  for (const k of ['who', 'node', 'flag', 'slot', 'pose', 'kind', 'expr', 'emote', 'name', 'period', 'weather', 'hat', 'focus']) if (s[k] != null) o[k] = str(s[k], 48);
  for (const k of ['text', 'if']) if (s[k] != null) o[k] = typeof s[k] === 'string' ? str(s[k]) : clone(s[k]);
  for (const k of ['s', 'ms', 'x', 'y', 'dx', 'dy', 'by', 'zoom']) if (s[k] != null) o[k] = num(s[k], -100, 100000, 0);
  if (s.value != null && ['string', 'number', 'boolean'].includes(typeof s.value)) o.value = s.value;
  if (s.obj != null) o.obj = s.obj === '$target' ? '$target' : ns(str(s.obj, 64));
  if (s.to != null) o.to = Array.isArray(s.to) ? [num(s.to[0], 0, 40, 0), num(s.to[1], 0, 40, 0)] : ns(str(s.to, 64));
  if (s.patch && typeof s.patch === 'object') { o.patch = {}; for (const [k, v] of Object.entries(s.patch)) if (KEY_RE.test(k) && ['boolean', 'number', 'string'].includes(typeof v)) o.patch[k] = v; }
  if (s.do === 'choice') o.options = (Array.isArray(s.options) ? s.options : []).slice(0, 6).map((x) => ({ label: str(x.label, 60), goto: x.goto ? str(x.goto, 48) : undefined, if: x.if, set: x.set && typeof x.set === 'object' ? clone(x.set) : undefined }));
  if (s.do === 'cmd') {
    if (!s.cmd || !CMD_OPS.includes(s.cmd.op)) return null;
    o.cmd = clone(s.cmd);
    if (o.cmd.obj) o.cmd.obj = ns(o.cmd.obj);
  }
  if (s.camera === false) o.camera = false;
  if (s.run) o.run = true;
  if (s.required) o.required = true;
  return o;
}

function cleanStory(st, packId, ns, warnings) {
  if (!st || !ID_RE.test(st.id || '') || !st.nodes || typeof st.nodes !== 'object') { warnings.push('剧情缺少 id/nodes，已跳过'); return null; }
  const t = st.trigger || {};
  const out = {
    id: packId + '/' + st.id, name: str(st.name || st.id, 40), once: !!st.once, daily: !!st.daily, marker: st.marker !== false,
    trigger: { on: ['start', 'click', 'agent', 'hour', 'manual'].includes(t.on) ? t.on : 'manual' },
    roles: {}, start: str(st.start || 'start', 48), nodes: {},
  };
  if (t.obj) out.trigger.obj = str(t.obj, 64);
  if (t.def) out.trigger.def = ns(str(t.def, 64));
  if (t.agent) out.trigger.agent = str(t.agent, 48);
  if (t.scene) out.trigger.scene = ns.scene ? ns.scene(str(t.scene, 64)) : str(t.scene, 64);
  if (t.from != null) out.trigger.from = num(t.from, 0, 24, 0);
  if (t.to != null) out.trigger.to = num(t.to, 0, 24, 24);
  if (t.chance != null) out.trigger.chance = num(t.chance, 0, 1, 1);
  if (t.if != null) out.trigger.if = t.if;
  for (const [k, v] of Object.entries(st.roles || {})) if (KEY_RE.test(k)) out.roles[k] = str(v, 48);
  let steps = 0;
  for (const [k, list] of Object.entries(st.nodes)) {
    if (!/^[a-z0-9_-]{1,48}$/i.test(k) || !Array.isArray(list)) continue;
    out.nodes[k] = list.slice(0, LIMITS.steps - steps).map((s) => cleanStep(s, ns)).filter(Boolean);
    steps += out.nodes[k].length;
  }
  return out;
}

/* ───────── 本地持久化：IndexedDB（装过的社区包、自制家具包） ───────── */

export class PackStore {
  constructor(name) { this.name = (name || 'roomkit') + '-packs'; this._p = null; }
  _db() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('浏览器不支持 IndexedDB')); return; }
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  }
  async _tx(mode, fn) {
    const db = await this._db();
    return new Promise((res, rej) => {
      const tx = db.transaction('packs', mode), st = tx.objectStore('packs'), q = fn(st);
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  listStrict() { return this._tx('readonly', (st) => st.getAll()).then((r) => r || []); }
  list() { return this.listStrict().catch(() => []); }
  get(id) { return this._tx('readonly', (st) => st.get(id)).catch(() => null); }
  put(pack) { return this._tx('readwrite', (st) => st.put(pack)); }
  remove(id) { return this._tx('readwrite', (st) => st.delete(id)); }
}

/** 把包导出成可分享的 JSON：内嵌图片收进 images，家具里改回 "@名字" 引用，id 去掉命名空间前缀 */
export function exportPack(pack) {
  const out = { format: 'roomkit.pack', v: 1, id: pack.id, name: pack.name, author: pack.author || '', version: pack.version || '1.0.0', license: pack.license || '', description: pack.description || '', images: {}, furniture: [], scenes: clone(pack.scenes || []), stories: [], plays: [], characters: [] };
  const strip = (x) => (typeof x === 'string' && x.indexOf(pack.id + '/') === 0 ? x.slice(pack.id.length + 1) : x);
  let n = 0;
  for (const d of pack.furniture || []) {
    const c = clone(d);
    c.id = strip(c.id);
    delete c.pack; delete c.rotMode; delete c.rots; delete c._img;
    if (c.art && (c.art.kind === 'sprite' || c.art.draw === 'image') && /^data:/.test(c.art.src)) { const key = 'img' + n++; out.images[key] = c.art.src; c.art.src = '@' + key; }
    if (c.act && c.act.indexOf('play:') === 0) c.act = 'play:' + strip(c.act.slice(5));
    out.furniture.push(c);
  }
  for (const s of out.scenes) { s.id = strip(s.id); (s.objects || []).forEach((o) => { o.def = strip(o.def); }); (s.stories || []).forEach((st) => stripStory(st, strip)); }
  out.stories = (pack.stories || []).map((s) => stripStory(Object.assign(clone(s), { id: strip(s.id) }), strip));
  out.plays = (pack.plays || []).map((p) => { const c = Object.assign(clone(p), { id: strip(p.id) }); (c.steps || []).forEach((st) => stripStep(st, strip)); return c; });
  out.characters = (pack.characters || []).map((c) => Object.assign(clone(c), { id: strip(c.id) }));
  return out;
}

/** 导出时去掉包内引用的命名空间前缀（再导入时会重新加上，不会变成 "包/包/xx"） */
function stripStep(st, strip) {
  if (!st || typeof st !== 'object') return;
  if (Array.isArray(st.par)) st.par.forEach((x) => stripStep(x, strip));
  if (typeof st.obj === 'string') st.obj = strip(st.obj);
  if (typeof st.to === 'string') st.to = strip(st.to);
  if (st.cmd && typeof st.cmd.obj === 'string') st.cmd.obj = strip(st.cmd.obj);
}
function stripStory(s, strip) {
  if (s.trigger) { if (s.trigger.scene) s.trigger.scene = strip(s.trigger.scene); if (s.trigger.def) s.trigger.def = strip(s.trigger.def); }
  for (const k in s.nodes || {}) (s.nodes[k] || []).forEach((st) => stripStep(st, strip));
  return s;
}
