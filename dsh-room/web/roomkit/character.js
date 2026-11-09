/**
 * RoomKit · 角色卡。
 *
 * 原生格式 roomkit.character：
 *   { format:'roomkit.character', v:1, id, name, kind:'whale', look:{...}, persona, scenario,
 *     phrases:{ greet, idle, night, poke, cheer, oops, wait, chat }, likes:{ defId|cat: 倍数 }, schedule:[{ from, to, prefer:'sleep'|'eat'|'read'|'work'|... }] }
 * 也能直接导入 SillyTavern / TavernAI 角色卡（chara_card_v2/v3 JSON、v1 JSON、带 chara 文本块的 PNG）：
 *   开场白 → greet，示例对话里角色说的话 → idle，description+personality → persona（留给以后接模型对话）。
 * 角色卡只决定"说什么、偏好什么"，不含任何可执行内容。
 */
import { clone } from './util.js';

const KINDS = ['greet', 'idle', 'night', 'poke', 'cheer', 'oops', 'wait', 'chat'];
const MAX_LINE = 60;

function slug(s) {
  const base = String(s || 'char').toLowerCase().replace(/[^a-z0-9一-龥_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return base || 'char';
}
function clean(s, name) {
  return String(s == null ? '' : s)
    .replace(/\{\{char\}\}/gi, name || '我').replace(/\{\{user\}\}/gi, '你')
    .replace(/<[^>]*>/g, '').replace(/\*[^*]{0,80}\*/g, '').replace(/\r/g, '').trim();
}
/** 取一句适合头顶气泡的短句 */
function short(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^(.{2,60}?[。！？!?~～…]+)/);
  const one = m ? m[1] : t;
  return one.length > MAX_LINE ? one.slice(0, MAX_LINE - 1) + '…' : one;
}
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

export function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('角色卡不是 JSON 对象');
  if (raw.format === 'roomkit.character') return finish(clone(raw));
  if ((raw.spec === 'chara_card_v2' || raw.spec === 'chara_card_v3') && raw.data) return fromTavern(raw.data);
  if (raw.name && (raw.first_mes != null || raw.description != null || raw.char_persona != null)) return fromTavern(raw);
  throw new Error('认不出的角色卡格式（支持 roomkit.character 与 SillyTavern/TavernAI 卡）');
}

function finish(c) {
  c.format = 'roomkit.character';
  c.v = 1;
  c.name = String(c.name || '小鲸鱼').slice(0, 24);
  c.id = c.id ? String(c.id).slice(0, 48) : slug(c.name);
  c.kind = c.kind === 'whale' ? 'whale' : 'girl';
  c.look = Object.assign({}, c.look || {});
  c.persona = String(c.persona || '').slice(0, 4000);
  c.scenario = String(c.scenario || '').slice(0, 2000);
  const ph = {};
  for (const k of KINDS) {
    const list = Array.isArray(c.phrases && c.phrases[k]) ? c.phrases[k] : [];
    ph[k] = uniq(list.map((x) => short(clean(x, c.name)))).slice(0, 24);
  }
  c.phrases = ph;
  c.likes = Object.assign({}, c.likes || {});
  for (const k in c.likes) { const v = +c.likes[k]; if (!(v >= 0 && v <= 5)) delete c.likes[k]; else c.likes[k] = v; }
  c.schedule = (Array.isArray(c.schedule) ? c.schedule : []).filter((s) => s && isFinite(s.from) && isFinite(s.to) && typeof s.prefer === 'string').slice(0, 12);
  return c;
}

function fromTavern(d) {
  const name = clean(d.name || d.char_name || '角色', '').slice(0, 24) || '角色';
  const greet = [d.first_mes].concat(d.alternate_greetings || []).map((x) => short(clean(x, name)));
  const lines = clean(d.mes_example || d.example_dialogue || '', name).split(/\n+/);
  const said = [];
  for (const l of lines) {
    const m = l.match(new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:：]\\s*(.+)$'));
    if (m) said.push(short(m[1]));
  }
  return finish({
    name,
    id: slug(name),
    persona: [clean(d.description, name), clean(d.personality || d.char_persona, name)].filter(Boolean).join('\n'),
    scenario: clean(d.scenario || d.world_scenario, name),
    phrases: { greet, idle: said, poke: said.slice(0, 6) },
    source: 'tavern',
    creator: String(d.creator || '').slice(0, 40),
    tags: Array.isArray(d.tags) ? d.tags.slice(0, 12).map(String) : [],
  });
}

/* ───────── 读文件：JSON 或 PNG（tEXt 块 chara / ccv3，base64 的 UTF-8 JSON） ───────── */

export async function readCharacterFile(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const isPng = u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
  if (!isPng) return normalizeCharacter(JSON.parse(new TextDecoder().decode(u8)));
  const text = pngText(buf);
  const b64 = text.ccv3 || text.chara;
  if (!b64) throw new Error('这张 PNG 里没有角色卡数据');
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const card = normalizeCharacter(JSON.parse(new TextDecoder().decode(bytes)));
  card.avatar = await pngThumb(file);
  return card;
}

function pngText(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let p = 8;
  while (p + 12 <= u8.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (type === 'tEXt' && p + 8 + len <= u8.length) {
      const data = u8.subarray(p + 8, p + 8 + len);
      const z = data.indexOf(0);
      if (z > 0) {
        let key = '', val = '';
        for (let i = 0; i < z; i++) key += String.fromCharCode(data[i]);
        for (let i = z + 1; i < data.length; i++) val += String.fromCharCode(data[i]);
        out[key] = val;
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

/** 卡面缩成 96px 头像（剧情名牌、角色列表用） */
function pngThumb(file) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = 96 / Math.max(img.width, img.height), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

export { DEFAULT_CHARACTERS } from './default-characters.js';
