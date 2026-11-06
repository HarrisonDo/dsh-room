/**
 * RoomKit · 角色记忆（只存在主人本机的 localStorage，不上传小镇）。
 *
 *   people：认识的角色 { id → { name, met, last, impression, lines:[最近几句原话] } }
 *   events：聊过的事 [{ thread, title, with:[名字], summary, t }]，最多 50 条
 *
 * 每次进帖相遇时记次数；离开帖子时写一条摘要（有模型就让她自己总结一句，没有就记最后几句原话）。
 * 回帖时 recall() 只取和当前在场成员、当前帖子有关的条目，≤ 600 字。
 */
const MAX_EVENTS = 50, MAX_LINES = 3, MAX_RECALL = 600;

export class Memory {
  constructor(key) { this.key = 'roomkit.memory.' + key; this.data = this._load(); }
  _load() {
    try { const d = JSON.parse(localStorage.getItem(this.key)); if (d && d.people && d.events) return d; } catch (e) { /* 忽略 */ }
    return { people: {}, events: [] };
  }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 存满了就算了 */ } }

  /** 在帖子里碰到了谁（同一次进帖只算一次） */
  meet(m, visit) {
    const p = this.data.people[m.id] || (this.data.people[m.id] = { name: m.name, met: 0, last: 0, impression: '', lines: [] });
    p.name = m.name;
    if (!visit.met.has(m.id)) { visit.met.add(m.id); p.met++; p.prev = p.last; }
    p.last = Date.now();
    this._save();
  }
  /** 记下对方说的一句原话 */
  heard(m, text) {
    const p = this.data.people[m.id];
    if (!p || !text) return;
    p.lines.push(String(text).slice(0, 60));
    if (p.lines.length > MAX_LINES) p.lines.splice(0, p.lines.length - MAX_LINES);
    this._save();
  }
  remember(ev) {
    this.data.events.push(Object.assign({ t: Date.now() }, ev));
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    for (const id of ev.ids || []) if (this.data.people[id] && ev.summary) this.data.people[id].impression = ev.summary.slice(0, 60);
    this._save();
  }

  /** 给提示词用：在场的人我认不认识、上次聊了什么；这个帖子以前发生过什么 */
  recall(here, threadId) {
    const out = [];
    for (const m of here) {
      const p = this.data.people[m.id];
      if (!p || !p.met) continue;
      const days = Math.floor((Date.now() - (p.prev || p.last)) / 86400000);
      out.push(`${p.name}：见过 ${p.met} 次${p.met > 1 ? '，上次' + (days < 1 ? '是今天' : '约 ' + days + ' 天前') : ''}${p.impression ? '；印象：' + p.impression : ''}`);
    }
    const ids = new Set(here.map((m) => m.id));
    const evs = this.data.events.filter((e) => e.thread === threadId || (e.ids || []).some((id) => ids.has(id))).slice(-4);
    for (const e of evs) out.push(`在「${e.title}」${e.with.length ? '和' + e.with.join('、') : ''}：${e.summary}`);
    let s = out.join('\n');
    if (s.length > MAX_RECALL) s = s.slice(s.length - MAX_RECALL);
    return s;
  }

  stats() { return { people: Object.keys(this.data.people).length, events: this.data.events.length }; }
  list() { return { people: Object.entries(this.data.people).map(([id, p]) => Object.assign({ id }, p)), events: this.data.events.slice().reverse() }; }
  forget(id) { delete this.data.people[id]; this._save(); }
  clear() { this.data = { people: {}, events: [] }; this._save(); }
  export() { return JSON.stringify(this.data, null, 2); }
  import(text) { const d = JSON.parse(text); if (!d || typeof d.people !== 'object' || !Array.isArray(d.events)) throw new Error('不是记忆文件'); this.data = d; this._save(); }
}
