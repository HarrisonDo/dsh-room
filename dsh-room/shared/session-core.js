import { SESSION_PROTOCOL } from './world-format.js';
import { beaconEffect } from './activities.js';

const EMOTES = new Set(['wave', 'dance', 'jump', 'look']);
export const SESSION_TEXT = 200;

export function sessionError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function initialSession({ sessionId, worldId, revision }) {
  return {
    sessionId, worldId, revision, epoch: 1, seq: 0, status: 'active', participants: [],
    activity: { contributions: [], completion: null }, recent: [],
  };
}

const key = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_:-]{0,79}$/i.test(value);

export function cleanAction(op, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw sessionError('invalid_action', '操作参数不合法');
  let clean;
  switch (op) {
    case 'move': {
      const { x, y } = args;
      if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v < 40)) throw sessionError('invalid_action', '移动坐标不合法');
      clean = { x, y };
      break;
    }
    case 'interact':
      if (typeof args.objectId !== 'string' || !args.objectId || args.objectId.length > 80) throw sessionError('invalid_action', '物件 id 不合法');
      clean = { objectId: args.objectId };
      break;
    case 'say': {
      if (typeof args.text !== 'string' || args.text.length > SESSION_TEXT) throw sessionError('invalid_action', '发言文字超限');
      const text = args.text.replace(/[\u0000-\u001f]/g, ' ').trim();
      if (!text) throw sessionError('invalid_action', '发言为空');
      clean = { text };
      break;
    }
    case 'emote':
      if (!EMOTES.has(args.name)) throw sessionError('invalid_action', '表情动作不受支持');
      clean = { name: args.name };
      break;
    default: throw sessionError('invalid_action', '操作不受支持');
  }
  if (Object.keys(args).some((field) => !Object.hasOwn(clean, field))) throw sessionError('invalid_action', '含未定义的操作参数');
  return clean;
}

export function parseCommand(raw) {
  if (raw.protocol !== SESSION_PROTOCOL) throw sessionError('unsupported_version', '场次协议版本不受支持');
  const { sessionId, epoch, requestId, actorCharacterId, controlGeneration, op, args } = raw;
  if (![sessionId, requestId, actorCharacterId].every(key) || !Number.isSafeInteger(epoch) || epoch < 1
    || !Number.isSafeInteger(controlGeneration) || controlGeneration < 1) throw sessionError('invalid_action', '命令身份或代次不合法');
  return { protocol: SESSION_PROTOCOL, sessionId, epoch, requestId, actorCharacterId, controlGeneration, op, args: cleanAction(op, args) };
}

export function eventFor(state, type, actorCharacterId, payload, at) {
  return { sessionId: state.sessionId, epoch: state.epoch, seq: state.seq + 1, type, actorCharacterId, payload, at };
}

export function applySessionEvent(state, event) {
  if (event.sessionId !== state.sessionId || event.epoch !== state.epoch || event.seq !== state.seq + 1) {
    throw sessionError('resync_required', '事件与本地场次状态不连续');
  }
  const next = { ...state, seq: event.seq };
  const { type, payload, actorCharacterId } = event;
  switch (type) {
    case 'session.status':
      next.status = payload.status;
      if (next.status === 'ended') next.participants = state.participants.map((participant) => ({ ...participant, online: false }));
      break;
    case 'member.changed': {
      const index = state.participants.findIndex(({ characterId }) => characterId === actorCharacterId);
      next.participants = [...state.participants];
      if (index < 0) next.participants.push(payload.participant);
      else next.participants[index] = payload.participant;
      break;
    }
    case 'member.removed': next.participants = state.participants.filter(({ characterId }) => characterId !== actorCharacterId); break;
    case 'actor.moved': next.participants = state.participants.map((actor) => actor.characterId === actorCharacterId ? { ...actor, ...payload } : actor); break;
    case 'beacon.lit': next.activity = { ...state.activity, contributions: [...state.activity.contributions, { beaconId: payload.beaconId, characterId: actorCharacterId }] }; break;
    case 'activity.completed': next.activity = { ...state.activity, completion: { ...payload, seq: event.seq } }; break;
    case 'actor.said': next.recent = [...state.recent.slice(-39), event]; break;
    case 'actor.said.removed': next.recent = state.recent.filter(({ seq }) => seq !== payload.seq); break;
    case 'actor.emoted': break;
    default: throw sessionError('resync_required', '收到不支持的事件');
  }
  return next;
}

export function decideCommand(state, command, runtime, context) {
  const actor = state.participants.find(({ characterId, online }) => characterId === command.actorCharacterId && online);
  if (state.status !== 'active' || !actor) return { code: 'forbidden', message: '角色尚未在场' };
  const args = command.args;
  switch (command.op) {
    case 'move': {
      const to = { x: Math.floor(args.x) + 0.5, y: Math.floor(args.y) + 0.5 };
      if (!runtime.nav.freeAt(to.x, to.y) || !runtime.nav.path(actor, to)) return { code: 'invalid_action', message: '目标落点不可达' };
      return { type: 'actor.moved', payload: to };
    }
    case 'interact': return beaconEffect({
      activity: runtime.release.activity, runtime, state, actor, objectId: args.objectId,
      accountFor: context.accountFor, eligible: context.eligible, completionId: context.completionId,
    });
    case 'say': return { type: 'actor.said', payload: { text: context.text || args.text, source: context.source } };
    case 'emote': return { type: 'actor.emoted', payload: args };
  }
}
