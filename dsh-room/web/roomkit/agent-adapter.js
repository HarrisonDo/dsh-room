import { cleanAction } from '../../shared/session-core.js';

const HOUR = 3600000;
const BUDGET = 12;

function intentFrom(text) {
  let intent;
  try { intent = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')); }
  catch { throw new Error('模型未返回可识别的动作'); }
  if (intent?.op === 'none') return null;
  return { op: intent?.op, args: cleanAction(intent?.op, intent?.args) };
}

export class AgentAdapter {
  constructor(transport, storage) {
    this.transport = transport;
    this.storage = storage;
    const stamps = storage?.pref('worldModelStamps');
    this.stamps = Array.isArray(stamps) ? stamps.filter(Number.isFinite).slice(-BUDGET) : [];
    this.backoffUntil = 0;
    this.failures = 0;
  }

  describeCapabilities() {
    const status = this.transport?.describeCapabilities() || { available: false, name: '手动模式' };
    this.stamps = this.stamps.filter((stamp) => stamp > Date.now() - HOUR);
    return { ...status, used: this.stamps.length, limit: BUDGET, busy: Boolean(this.pending) };
  }

  async refresh() { await this.transport?.refresh?.(); return this.describeCapabilities(); }

  async generate(kind, data, context) {
    const status = this.describeCapabilities();
    if (!status.available) throw new Error('模型未连接，可手动操作');
    if (this.pending) throw new Error('模型正在处理上一条请求');
    if (status.used >= BUDGET) throw new Error('本小时模型额度已用完');
    if (this.backoffUntil > Date.now()) throw new Error('模型暂时不可用，稍后可重试');
    const pending = this.pending = new AbortController();
    const signal = AbortSignal.any([pending.signal, AbortSignal.timeout(45_000)]);
    this.stamps.push(Date.now());
    this.storage?.pref('worldModelStamps', this.stamps);
    try {
      const text = await this.transport.generate({ kind, data, context }, signal);
      signal.throwIfAborted();
      if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回正文');
      const result = kind === 'decide' ? intentFrom(text) : text.trim().slice(0, 160);
      this.failures = 0;
      this.backoffUntil = 0;
      return result;
    } catch (error) {
      if (!pending.signal.aborted) {
        this.failures++;
        this.backoffUntil = Date.now() + Math.min(60_000, 2 ** this.failures * 1000);
      }
      throw error;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  decide(observation, context) { return this.generate('decide', observation, context); }
  summarize(facts, context) { return this.generate('summarize', facts, context); }
  cancel() { this.pending?.abort(); }
}

export function createPreviewAgent() {
  let status = { available: false, name: '手动模式' };
  let token = '';
  return {
    describeCapabilities: () => status,
    async refresh() {
      try {
        const response = await fetch('/__roomkit_agent', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        if (!response.ok) throw new Error('no gateway');
        const data = await response.json();
        token = data.ticket || '';
        status = { available: Boolean(data.available && token), name: data.available ? data.model : '手动模式' };
      } catch {
        token = '';
        status = { available: false, name: '手动模式' };
      }
    },
    async generate(request, signal) {
      const response = await fetch('/__roomkit_agent', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-roomkit-agent': token },
        signal, body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '模型调用失败');
      return data.text;
    },
  };
}
