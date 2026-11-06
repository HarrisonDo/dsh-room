/**
 * AI 小镇的审核管线：回帖、帖子标题、角色名入库前过一遍。
 *
 *   外部屏蔽词服务（可选）：POST {url}  { text, kind, author, thread }
 *     → { action: 'pass' | 'mask' | 'review' | 'block', text?, labels? }
 *   本地词表（兜底）：每行一个词；以 "review:" 开头的词命中时送人工审核，其余打码。
 *
 * 外部服务超时或出错：先过本地词表，再按 onError 处理 —— 'review'（默认，进人工审核）或 'local'（只看本地词表）。
 * 不会因为外部服务挂了就全部放行。
 */
import fs from 'node:fs';

const ACTIONS = ['pass', 'mask', 'review', 'block'];
const RANK = { pass: 0, mask: 1, review: 2, block: 3 };

/** 比较时忽略大小写、空白和常见分隔符，防止「傻 逼」「s.b」这种绕过 */
const fold = (s) => String(s).toLowerCase().replace(/[\s._\-*·・|/\\]+/g, '');

export function parseWords(text) {
  const mask = [], review = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('review:')) { const w = fold(line.slice(7)); if (w) review.push(w); } else { const w = fold(line); if (w) mask.push(w); }
  }
  return { mask, review };
}

export function localCheck(text, words) {
  const src = String(text || '');
  // 逐字建索引：折叠后的位置 → 原文位置，这样打码能落回原文
  const keep = [], map = [];
  for (let i = 0; i < src.length; i++) { const f = fold(src[i]); if (f) { keep.push(f); map.push(i); } }
  const flat = keep.join('');
  const hit = (w) => flat.indexOf(w) >= 0;
  if (words.review.some(hit)) return { action: 'review', text: src, labels: ['本地词表'] };
  let out = src.split(''), masked = false;
  for (const w of words.mask) {
    let i = flat.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) out[map[k]] = '*';
      masked = true;
      i = flat.indexOf(w, i + w.length);
    }
  }
  return masked ? { action: 'mask', text: out.join(''), labels: ['本地词表'] } : { action: 'pass', text: src, labels: [] };
}

export function createModerator(opts = {}) {
  let words = opts.words || { mask: [], review: [] };
  const file = opts.wordsFile;
  const reload = () => {
    if (!file) return;
    if (!fs.existsSync(file)) { console.warn('[town] 找不到词表文件：' + file); return; }
    words = parseWords(fs.readFileSync(file, 'utf8'));
  };
  reload();
  if (file) { try { fs.watchFile(file, { interval: 5000 }, reload).unref?.(); } catch (e) { /* 忽略 */ } }
  const timeoutMs = opts.timeoutMs || 1500;
  const onError = opts.onError === 'local' ? 'local' : 'review';
  const fetchImpl = opts.fetch || globalThis.fetch;

  async function remote(text, kind, ctx) {
    const r = await fetchImpl(opts.url, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, opts.token ? { authorization: 'Bearer ' + opts.token } : {}),
      body: JSON.stringify({ text, kind, author: ctx.author || '', thread: ctx.thread || '' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d || !ACTIONS.includes(d.action)) throw new Error('bad response');
    return { action: d.action, text: typeof d.text === 'string' ? d.text : text, labels: Array.isArray(d.labels) ? d.labels.map(String).slice(0, 5) : [] };
  }

  return {
    reload,
    size: () => words.mask.length + words.review.length,
    /** → { action, text, labels, degraded? } */
    async check(text, kind = 'post', ctx = {}) {
      const local = localCheck(text, words);
      if (!opts.url) return local;
      let res;
      try { res = await remote(local.text, kind, ctx); } catch (e) {
        const out = onError === 'review' && local.action !== 'block' ? Object.assign({}, local, { action: RANK[local.action] < RANK.review ? 'review' : local.action }) : local;
        return Object.assign(out, { degraded: e.message || String(e) });
      }
      // 外部和本地取更严的那个
      return RANK[res.action] >= RANK[local.action] ? res : Object.assign({}, local, { labels: local.labels.concat(res.labels) });
    },
  };
}
