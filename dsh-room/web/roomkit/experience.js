const FORMAT = 'roomkit.experiences';
const MAX_BYTES = 1024 * 1024;
const MAX_RECORDS = 100;
const MAX_FACTS = 16;
const bounded = (value, size) => typeof value === 'string' && value.length > 0 && value.length <= size;
const statuses = ['pending', 'ready', 'fallback'];
const encoder = new TextEncoder();

export function serviceOrigin(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('世界服务地址不合法');
  return parsed.origin;
}

export function experienceSummary(record) {
  if (record.reflection.text) return record.reflection.text;
  const company = record.participants.map(({ name }) => name).join('、');
  if (record.outcome === 'completed') return `完成了「${record.title}」的合作活动。${company ? '参与角色有' + company + '。' : ''}`;
  const lit = record.facts.filter(({ type }) => type === 'beacon.lit').length;
  return `到访「${record.title}」${company ? '，遇到' + company : ''}${lit ? '，见证点亮 ' + lit + ' 个信标' : ''}。`;
}

function parseRecord(raw, localCharacterId) {
  if (raw?.v !== 1 || raw.localCharacterId !== localCharacterId || !bounded(raw.id, 160) || !bounded(raw.title, 80)
    || !['partial', 'completed'].includes(raw.outcome) || !statuses.includes(raw.reflection?.status)
    || typeof raw.reflection?.text !== 'string' || raw.reflection.text.length > 160) throw new Error('经历字段或角色身份不匹配');
  const source = raw.source;
  if (!source || !bounded(source.serviceId, 300) || serviceOrigin(source.serviceId) !== source.serviceId
    || !bounded(source.worldId, 100) || !bounded(source.sessionId, 100)
    || !Number.isSafeInteger(source.revision) || source.revision < (source.kind === 'legacy-town' ? 0 : 1)) throw new Error('经历来源不合法');
  if (!Array.isArray(raw.participants) || raw.participants.length > 12 || !raw.participants.every((p) => bounded(p?.characterId, 80) && bounded(p.name, 40))) throw new Error('经历参与者不合法');
  if (!Array.isArray(raw.facts) || raw.facts.length > MAX_FACTS) throw new Error('经历事实超限');
  const facts = raw.facts.map((fact) => {
    if (!Number.isSafeInteger(fact?.seq) || fact.seq < 1 || !['beacon.lit', 'activity.completed'].includes(fact.type)) throw new Error('经历事件不合法');
    const field = fact.type === 'beacon.lit' ? 'beaconId' : 'exitId';
    if (!bounded(fact.payload?.[field], 80)) throw new Error('经历物件不合法');
    return { seq: fact.seq, type: fact.type, payload: { [field]: fact.payload[field] } };
  });
  if (new Set(facts.map(({ seq }) => seq)).size !== facts.length) throw new Error('经历事件重复');
  if (raw.outcome === 'completed' && (!Number.isSafeInteger(source.completionSeq)
    || !facts.some((fact) => fact.type === 'activity.completed' && fact.seq === source.completionSeq))) throw new Error('缺少完成事实');
  if (!Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt) || raw.createdAt > raw.updatedAt) throw new Error('经历时间不合法');
  return {
    v: 1, id: raw.id, title: raw.title, localCharacterId,
    source: { serviceId: source.serviceId, worldId: source.worldId, revision: source.revision, sessionId: source.sessionId,
      ...(raw.outcome === 'completed' ? { completionSeq: source.completionSeq } : {}),
      ...(source.kind === 'legacy-town' ? { kind: 'legacy-town' } : {}) },
    participants: raw.participants.map(({ characterId, name }) => ({ characterId, name })), facts, outcome: raw.outcome,
    reflection: { text: raw.reflection.text, status: raw.reflection.status }, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  };
}

export class ExperienceStore {
  constructor(prefix = 'roomkit', storage) {
    this.prefix = prefix + '.experience.';
    this.storage = storage;
  }

  get local() {
    const storage = this.storage || globalThis.localStorage;
    if (!storage) throw new Error('本机经历存储不可用');
    return storage;
  }

  key(localId, serviceId, id) {
    return this.prefix + [localId, serviceId, id].map(encodeURIComponent).join('|');
  }

  tombstone(key) { return this.prefix + 'deleted:' + key.slice(this.prefix.length); }

  get(localId, serviceId, id) {
    const key = this.key(localId, serviceId, id);
    if (this.local.getItem(this.tombstone(key))) return null;
    const data = this.local.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  put(record) {
    const key = this.key(record.localCharacterId, record.source.serviceId, record.id);
    if (this.local.getItem(this.tombstone(key))) return false;
    const value = JSON.stringify(record);
    if (encoder.encode(value).length > 8192) throw new Error('单条经历超过存储上限');
    const storage = this.local;
    try { storage.setItem(key, value); }
    catch {
      this.unsaved = record;
      throw new Error('本机空间不足，经历暂未保存。可导出或清理旧经历后重试');
    }
    if (this.unsaved?.id === record.id && this.unsaved?.localCharacterId === record.localCharacterId) this.unsaved = null;
    const rows = this.rows();
    const expired = rows.slice(MAX_RECORDS);
    for (const old of expired) storage.removeItem(old.key);
    return !expired.some((old) => old.key === key);
  }

  rows(localId) {
    const keyPrefix = localId ? this.prefix + encodeURIComponent(localId) + '|' : this.prefix;
    const rows = [];
    const storage = this.local;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(keyPrefix) || key.startsWith(this.prefix + 'deleted:') || storage.getItem(this.tombstone(key))) continue;
      try {
        const row = JSON.parse(storage.getItem(key));
        if (row?.v === 1) rows.push({ key, record: row });
      } catch { /* 其他条目仍可读取 */ }
    }
    return rows.sort((a, b) => b.record.updatedAt - a.record.updatedAt);
  }

  list(localId) { return this.rows(localId).map(({ record }) => record); }

  recordVisit(visit, participants, event) {
    const prior = this.get(visit.localCharacterId, visit.source.serviceId, visit.id);
    const facts = prior?.facts || [];
    if (event && !facts.some(({ seq }) => seq === event.seq)) {
      facts.push({ seq: event.seq, type: event.type, payload: { beaconId: event.payload.beaconId } });
    }
    const record = { ...visit, participants, facts: facts.slice(-MAX_FACTS), updatedAt: Date.now() };
    this.put(record);
    return record;
  }

  complete(visit, event) {
    const id = event.payload.completionId;
    const { localCharacterId, source } = visit;
    const existing = this.get(localCharacterId, source.serviceId, id);
    if (existing) return { record: existing, created: false };
    const partial = this.get(localCharacterId, source.serviceId, visit.id);
    const facts = (partial?.facts || []).filter(({ seq }) => seq !== event.seq).slice(-(MAX_FACTS - 1));
    facts.push({ seq: event.seq, type: event.type, payload: { exitId: event.payload.exitId } });
    const record = {
      ...visit, id, outcome: 'completed', source: { ...source, completionSeq: event.seq },
      participants: event.payload.participants, facts, reflection: { text: '', status: 'pending' }, updatedAt: Date.now(),
    };
    if (!this.put(record)) return { record: null, created: false };
    if (partial) this.local.removeItem(this.key(localCharacterId, source.serviceId, visit.id));
    return { record, created: true };
  }

  setReflection(record, text, status) {
    const current = this.get(record.localCharacterId, record.source.serviceId, record.id);
    if (!current || current.reflection.status === 'ready') return current;
    const changed = { ...current, reflection: { text, status }, updatedAt: Date.now() };
    return this.put(changed) ? changed : null;
  }

  async summarize(record, adapter, context) {
    const current = this.get(record.localCharacterId, record.source.serviceId, record.id);
    if (!current || current.reflection.status === 'ready') return current;
    try {
      const text = await adapter.summarize({
        title: current.title, outcome: current.outcome, participants: current.participants, facts: current.facts,
      }, context);
      return this.setReflection(current, text, 'ready');
    } catch (error) {
      this.setReflection(current, '', 'fallback');
      throw error;
    }
  }

  remove(localId, serviceId, id) {
    const key = this.key(localId, serviceId, id);
    try { this.local.setItem(this.tombstone(key), String(Date.now())); }
    catch { throw new Error('空间不足，无法保存删除记录'); }
    this.local.removeItem(key);
  }

  recall(localId, service, participants = []) {
    if (!localId || !service) return '';
    const serviceId = serviceOrigin(service);
    const ids = new Set(participants);
    return this.list(localId).filter(({ source, participants }) => source.serviceId === serviceId
      && participants.some(({ characterId }) => ids.has(characterId))).slice(0, 4).map(experienceSummary).join('\n').slice(0, 600);
  }

  export(localId) {
    const records = this.list(localId);
    if (this.unsaved?.localCharacterId === localId && !records.some(({ id }) => id === this.unsaved.id)) records.unshift(this.unsaved);
    return { format: FORMAT, v: 1, localCharacterId: localId, records: records.slice(0, MAX_RECORDS) };
  }

  import(raw, localId) {
    if (raw?.format !== FORMAT || raw.v !== 1 || raw.localCharacterId !== localId || !Array.isArray(raw.records) || raw.records.length > MAX_RECORDS
      || encoder.encode(JSON.stringify(raw)).length > MAX_BYTES) throw new Error('经历文件格式、大小或角色身份不匹配');
    const records = raw.records.map((record) => parseRecord(record, localId));
    let count = 0;
    for (const record of records) {
      const existing = this.get(localId, record.source.serviceId, record.id);
      if ((!existing || existing.updatedAt < record.updatedAt) && this.put(record)) count++;
    }
    return count;
  }

  importLegacy(localId, service, events) {
    const serviceId = serviceOrigin(service);
    let count = 0;
    for (const event of Array.isArray(events) ? events.slice(-50) : []) {
      if (!bounded(event?.thread, 70) || !Number.isSafeInteger(event.t) || !bounded(event.title, 80)) continue;
      const id = 'legacy:' + event.t + ':' + event.thread;
      if (this.get(localId, serviceId, id)) continue;
      const participants = (Array.isArray(event.ids) ? event.ids : []).slice(0, 12)
        .filter((value) => bounded(value, 80)).map((characterId, i) => ({ characterId, name: String(event.with?.[i] || characterId).slice(0, 40) }));
      const record = { v: 1, id, localCharacterId: localId, title: event.title,
        source: { serviceId, worldId: event.thread, revision: 0, sessionId: event.thread, kind: 'legacy-town' },
        participants, facts: [], outcome: 'partial', reflection: { text: String(event.summary || '').slice(0, 160), status: 'ready' },
        createdAt: event.t, updatedAt: event.t };
      if (this.put(record)) count++;
    }
    return count;
  }
}
