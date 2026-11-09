/**
 * dsh-room · 工作状态聚合（纯逻辑，可单测）：DSH 的 session/event → 每个会话一档状态 → 一个展示快照。
 * 档位与 dsh-pet 一致：thinking / working / result / waiting / success / error；null = 空闲。
 * 不调用模型，不读会话内容，只取事件类型和 todo 文案（任务文本只在本机页面显示）。
 */

const PRIORITY = { waiting: 60, error: 50, working: 40, thinking: 30, result: 25, success: 20 };
const ASK_USER_TOOL = 'ask_user_question';
const TASK_MAX = 40;
/** 完成 / 出错是一下子的事：过这么久自动回空闲，不然角色会一直庆祝 */
export const TERMINAL_MS = 8000;
/** 回合没收到结束事件（宿主重启、异常）时的兜底：这么久没动静就当空闲 */
export const STALE_MS = 10 * 60 * 1000;

function turnEndState(kind) {
  if (kind === 'completed') return 'success';
  if (kind === 'error' || kind === 'max-tokens' || kind === 'timeout') return 'error';
  if (kind === 'blocked') return 'waiting';
  return null;            // aborted 等：回空闲，别卡在上一档
}

/** 事件 → 档位；undefined = 这个事件不关心，null = 这个会话回空闲 */
export function reduceEvent(event) {
  switch (event && event.type) {
    case 'turn/start': return 'thinking';
    case 'tool/call': return String((event.data && event.data.name) || '') === ASK_USER_TOOL ? 'waiting' : 'working';
    case 'tool/result': return 'result';
    case 'approval/asked': return 'waiting';
    case 'turn/end': return turnEndState(String((event.data && event.data.reason && event.data.reason.kind) || ''));
    default: return undefined;
  }
}

/** todo/write → 当前任务：最后一个进行中的，没有就第一个待办；按码点截断，避免切开 emoji */
export function taskFromTodos(event) {
  const todos = event && event.data && Array.isArray(event.data.todos) ? event.data.todos : [];
  let cur = null;
  for (const t of todos) if (t && t.status === 'in_progress') cur = t;
  if (!cur) cur = todos.find((t) => t && t.status === 'pending') || null;
  const text = String((cur && cur.content) || '').trim();
  if (!text) return null;
  const points = Array.from(text);
  return points.length > TASK_MAX ? points.slice(0, TASK_MAX).join('') + '…' : text;
}

export class WorkStatus {
  constructor(now = Date.now) {
    this.now = now;
    this.sessions = new Map();      // sessionId → { state, task, seq, at }
    this.seq = 0;
    this.events = 0;                // 收到过多少条会话事件（「连接」页用来判断监听是否生效）
    this.lastEventAt = 0;
  }

  observe(sessionId, event) {
    const type = event && event.type;
    if (!type || !sessionId) return;
    this.events++;
    this.lastEventAt = this.now();
    const cur = this.sessions.get(sessionId);
    if (type === 'todo/write') { if (cur) cur.task = taskFromTodos(event); return; }
    const state = reduceEvent(event);
    if (state === undefined) return;
    if (state === null) { this.sessions.delete(sessionId); return; }
    this.sessions.set(sessionId, { state, task: type === 'turn/start' ? null : cur ? cur.task : null, seq: ++this.seq, at: this.now() });
  }

  /** 到期的条目清掉：完成 / 出错过 TERMINAL_MS 回空闲，其余过 STALE_MS 回空闲 */
  sweep() {
    const now = this.now();
    for (const [id, e] of this.sessions) {
      const ttl = e.state === 'success' || e.state === 'error' ? TERMINAL_MS : STALE_MS;
      if (now - e.at > ttl) this.sessions.delete(id);
    }
  }

  /** 展示快照：优先级最高的会话，同档取最近；空闲时 state 为 null */
  display() {
    this.sweep();
    let best = null, id = null;
    for (const [sid, e] of this.sessions) {
      if (!best || PRIORITY[e.state] > PRIORITY[best.state] || (PRIORITY[e.state] === PRIORITY[best.state] && e.seq > best.seq)) { best = e; id = sid; }
    }
    return { state: best ? best.state : null, task: best ? best.task : null, sessionId: id, ts: best ? best.at : 0 };
  }

  snapshot() {
    const display = this.display();
    const sessions = {};
    for (const [id, e] of this.sessions) sessions[id] = { state: e.state, task: e.task };
    return { display, sessions, events: this.events, lastEventAt: this.lastEventAt };
  }
}
