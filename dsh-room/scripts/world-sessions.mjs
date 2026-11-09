import { randomUUID, randomBytes } from 'node:crypto';
import { hashToken } from './town-auth.mjs';
import { canonicalJSON, worldRuntime } from '../shared/world-format.js';
import { SESSION_TEXT, applySessionEvent, decideCommand, eventFor, initialSession, parseCommand, sessionError } from '../shared/session-core.js';
import { publicLook } from '../shared/public-appearance.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DEFAULTS = { seats: 4, active: 96, live: 192, pauseAfter: MINUTE, grace: 20_000, keepPaused: 7 * DAY,
  eventCount: 256, receiptCount: 512, retention: DAY, completionRetention: 30 * DAY,
  inviteTtl: DAY, ticketTtl: 15_000, streams: 96, peerStreams: 64, streamBytes: 64 * 1024, pendingSpeech: 32 };
const failure = (code, message, reason) => Object.assign(new Error(message), { code, reason });
const opaque = () => randomBytes(24).toString('base64url');
const matchingLease = (member, key) => member.leaseHash && typeof key === 'string' && key.length <= 80 && hashToken(key) === member.leaseHash;

function publicActor(role, position) {
  return { characterId: role.id, name: role.name, kind: role.kind === 'whale' ? 'whale' : 'girl', look: publicLook(role.look),
    x: position.x, y: position.y, online: true };
}

export function createWorldSessions({ store, account, actor, allowWrite, moderate, canSpeak, identityActive, owned, options, publicAccess = {} }) {
  const limits = { ...DEFAULTS, ...options };
  const runtimeCache = new Map();
  const streams = new Set();
  const tickets = new Map();
  const counters = { events: 0, commandsCommitted: 0, commandsRejected: 0, streamBytes: 0, streamDrops: 0 };
  let pruneAt = 0;
  let stopped = false;

  function access(sessionId, owner) {
    if (typeof sessionId !== 'string' || sessionId.length > 80) throw failure(400, '场次 id 不合法');
    const member = store.membership(sessionId, owner);
    const record = member && !member.revoked && store.session(sessionId);
    if (!record) throw failure(403, '没有本场权限');
    return { record, member };
  }

  function managed(sessionId, owner) {
    const { record } = access(sessionId, owner);
    if (record.owner !== owner) throw failure(403, '只有房主可以管理本场');
    return record;
  }

  function runtimeFor(state) {
    const key = state.worldId + '/' + state.revision;
    let runtime = runtimeCache.get(key);
    if (!runtime) {
      const release = store.release(state.worldId, state.revision);
      if (!release) throw failure(404, '世界发布版本不可用');
      runtime = { release, ...worldRuntime(release) };
    }
    runtimeCache.delete(key);
    runtimeCache.set(key, runtime);
    if (runtimeCache.size > 32) runtimeCache.delete(runtimeCache.keys().next().value);
    return runtime;
  }

  function write(client, name, data) {
    const line = name ? `event: ${name}\ndata: ${JSON.stringify(data)}\n\n` : ': ping\n\n';
    if (!client.res.writable) return;
    const bytes = Buffer.byteLength(line);
    if (client.res.writableLength + bytes > limits.streamBytes) {
      counters.streamDrops++;
      client.res.destroy();
      return;
    }
    counters.streamBytes += bytes;
    if (!client.res.write(line)) { counters.streamDrops++; client.res.destroy(); }
  }

  function close(client, reason) {
    if (!client.res.writable) return;
    if (client.res.writableLength > limits.streamBytes - 128) client.res.destroy();
    else client.res.end(`event: accessLost\ndata: ${JSON.stringify({ reason })}\n\n`);
  }

  function streamAllowed(client) {
    const member = store.membership(client.sessionId, client.accountId);
    return member && !member.revoked && member.characterId === client.characterId && identityActive(client);
  }

  function emit(event, owner) {
    if (Number.isInteger(event.seq)) counters.events++;
    for (const client of streams) {
      if (client.sessionId !== event.sessionId || (owner && client.accountId !== owner)) continue;
      if (!streamAllowed(client)) close(client, 'forbidden');
      else if (event.type === 'session.resync') write(client, 'resync', {});
      else if (event.type === 'control.changed') write(client, 'control', { generation: event.generation });
      else if (event.type === 'speech.review') write(client, 'review', { requestId: event.requestId, message: event.message });
      else write(client, 'event', event);
    }
  }

  function append(record, type, characterId, payload, at = Date.now()) {
    const event = eventFor(record.state, type, characterId, payload, at);
    record.state = applySessionEvent(record.state, event);
    record.updatedAt = at;
    store.saveSession(record);
    store.addEvent(event);
    store.trimEvents(event.sessionId, event.seq - limits.eventCount, at - limits.retention);
    return event;
  }

  function offline(record, member, at = Date.now(), emptyAt = at) {
    store.saveMember({ ...member, online: false, leaseHash: null, authHash: null, lastSeen: at });
    const before = record.state.participants.find((a) => a.characterId === member.characterId);
    if (!before?.online) return null;
    if (!record.state.participants.some((a) => a.characterId !== member.characterId && a.online)) record.emptySince = emptyAt;
    return append(record, 'member.changed', member.characterId, { participant: { ...before, online: false } }, at);
  }

  function recover() {
    store.transaction(() => {
      for (const record of store.liveSessions()) {
        const { sessionId } = record.state;
        for (const member of store.members(sessionId)) {
          if (member.online || member.leaseHash) store.saveMember({ ...member, online: false, leaseHash: null, authHash: null });
        }
        record.state = { ...record.state, status: 'paused', epoch: record.state.epoch + 1,
          participants: record.state.participants.map((participant) => ({ ...participant, online: false })) };
        record.emptySince = null;
        store.saveSession(record);
        store.clearReceipts(sessionId);
      }
    });
  }

  recover();

  function checkedCommand(command, input, ctx) {
    const owner = account(input, ctx);
    const { record, member } = access(command.sessionId, owner);
    const { state } = record;
    if (state.epoch !== command.epoch) throw Object.assign(sessionError('stale_epoch', '场次已更新，请同步后重试'), { latestSeq: state.seq });
    if (state.status !== 'active' || !member.online || member.characterId !== command.actorCharacterId) throw sessionError('forbidden', '角色尚未在场');
    if (member.generation !== command.controlGeneration || !matchingLease(member, input.controlKey)) throw sessionError('control_lost', '当前窗口没有角色控制权');
    if (actor({ ...input, me: member.characterId }, ctx).id !== member.characterId) throw sessionError('forbidden', '角色不属于此账号');
    if (command.op === 'say') canSpeak(owner);
    return { owner, record, member };
  }

  async function command(input, ctx, source) {
    let lastSeq = 0;
    let requestId = typeof input.requestId === 'string' ? input.requestId.slice(0, 80) : '';
    const rejected = (code, message, latestSeq = lastSeq) => {
      counters.commandsRejected++;
      return { requestId, status: 'rejected', code, message, latestSeq };
    };
    try {
      const cmd = parseCommand(input);
      requestId = cmd.requestId;
      const accessNow = checkedCommand(cmd, input, ctx);
      lastSeq = accessNow.record.state.seq;
      const fingerprint = hashToken(canonicalJSON({ ...cmd, args: input.args, source }));
      const findReceipt = (owner) => {
        const saved = store.receipt(cmd.sessionId, owner, requestId);
        if (!saved) return null;
        return saved.fingerprint === fingerprint ? saved.result : rejected('invalid_action', '同一请求 id 的内容不同');
      };
      const previous = findReceipt(accessNow.owner);
      if (previous) return previous;

      allowWrite(accessNow.owner, ctx, cmd.op === 'say');
      let review;
      if (cmd.op === 'say') {
        review = await moderate(cmd.args.text, accessNow.owner, cmd.sessionId);
        if (review.action === 'block') return rejected('forbidden', '发言未通过审核');
      }
      const runtime = runtimeFor(accessNow.record.state);
      const result = store.transaction(() => {
        const { record, owner, member } = checkedCommand(cmd, input, ctx);
        const { state } = record;
        lastSeq = state.seq;
        const prior = findReceipt(owner);
        if (prior) return { reply: prior };
        const at = Date.now();
        const window = store.receiptWindow(cmd.sessionId);
        if (window.count >= limits.receiptCount || (window.oldest != null && window.oldest < at - limits.retention)) {
          record.state = { ...state, epoch: state.epoch + 1 };
          store.saveSession(record);
          store.clearReceipts(cmd.sessionId);
          return { reply: rejected('stale_epoch', '回执窗口已更新，请同步后重试'), reset: true };
        }
        const text = review && (typeof review.text === 'string' ? review.text.trim().slice(0, SESSION_TEXT) : cmd.args.text);
        if (review && !text) return { reply: rejected('forbidden', '发言未通过审核') };
        if (review?.action === 'review') {
          if (store.speechCount(cmd.sessionId) >= limits.pendingSpeech) return { reply: rejected('rate_limited', '本场待审发言已满') };
          store.queueSpeech({ id: randomUUID(), sessionId: cmd.sessionId, owner, characterId: member.characterId,
            requestId, epoch: state.epoch, generation: member.generation, source, text, at });
          const reply = { requestId, status: 'pending', message: '发言已送审', latestSeq: state.seq };
          store.addReceipt(cmd.sessionId, owner, requestId, fingerprint, reply, at);
          return { reply };
        }
        const members = cmd.op === 'interact' ? store.members(cmd.sessionId) : [];
        const accountFor = (characterId) => members.find((m) => m.characterId === characterId)?.accountId;
        const eligible = (characterId) => characterId === cmd.actorCharacterId || [...streams].some((client) => client.sessionId === cmd.sessionId
          && client.characterId === characterId && client.res.writable && streamAllowed(client));
        const effect = decideCommand(state, cmd, runtime, { source, text, accountFor, eligible, completionId: cmd.op === 'interact' ? randomUUID() : undefined });
        if (effect.code) return { reply: rejected(effect.code, effect.message) };
        const event = append(record, effect.type, cmd.actorCharacterId, effect.payload, at);
        store.saveMember({ ...member, lastSeen: at });
        if (event.type === 'activity.completed') {
          const qualifiers = event.payload.participants.map(({ characterId }) => ({ characterId, accountId: accountFor(characterId) }));
          store.complete(event, qualifiers, at + limits.completionRetention);
        }
        const reply = { requestId, status: 'committed', seq: event.seq, events: [event] };
        store.addReceipt(cmd.sessionId, owner, requestId, fingerprint, reply, at);
        return { reply, event };
      });
      if (result.event) { counters.commandsCommitted++; emit(result.event); }
      if (result.reset) emit({ type: 'session.resync', sessionId: cmd.sessionId });
      return result.reply;
    } catch (error) {
      if (typeof error.code === 'string' && ['unsupported_version', 'invalid_action', 'stale_epoch', 'forbidden', 'control_lost'].includes(error.code)) return rejected(error.code, error.message, error.latestSeq ?? lastSeq);
      if ([401, 403, 429, 400, 404].includes(error.code)) {
        const code = error.code === 401 ? 'unauthorized' : error.code === 429 ? 'rate_limited' : error.code === 400 ? 'invalid_action' : 'forbidden';
        return rejected(code, error.message);
      }
      throw error;
    }
  }

  function resolveSpeech(id, approve) {
    const result = store.transaction(() => {
      const pending = store.speech(id);
      if (!pending) throw failure(404, '没有这条待审发言');
      const { session_id: sessionId, account_id: owner, character_id: characterId, request_id: requestId } = pending;
      const record = store.session(sessionId);
      const member = store.membership(sessionId, owner);
      let allowed = approve && pending.at >= Date.now() - limits.retention && record.state.status === 'active'
        && record.state.epoch === pending.epoch && member?.online && !member.revoked && member.characterId === characterId
        && member.generation === pending.generation && identityActive({ ...member, tokenHash: member.authHash });
      if (allowed) {
        try { canSpeak(owner); }
        catch (error) { if (error.code !== 403) throw error; allowed = false; }
      }
      const event = allowed ? append(record, 'actor.said', characterId, { text: pending.text, source: pending.source }) : null;
      const message = event ? '发言已通过审核' : approve ? '发言权限已失效' : '发言未通过审核';
      store.finishSpeech(id);
      const reply = event ? { requestId, status: 'committed', seq: event.seq, events: [event] }
        : { requestId, status: 'rejected', code: 'forbidden', message, latestSeq: record.state.seq };
      store.updateReceipt(sessionId, owner, requestId, reply);
      return { sessionId, owner, requestId, event, message };
    });
    if (result.event) { counters.commandsCommitted++; emit(result.event); }
    else counters.commandsRejected++;
    emit({ type: 'speech.review', sessionId: result.sessionId, requestId: result.requestId, message: result.message }, result.owner);
  }

  function replay(state, epoch, after) {
    if (epoch !== state.epoch || !Number.isSafeInteger(after) || after < 0 || after > state.seq) return { code: 'resync_required', state };
    const events = store.events(state.sessionId, after).filter(({ at }) => at >= Date.now() - limits.retention);
    if (events.length !== state.seq - after || events.some((event) => event.epoch !== state.epoch)) return { code: 'resync_required', state };
    return { events, seq: state.seq };
  }

  function consumeTicket(token, peer) {
    if (typeof token !== 'string' || token.length > 80) throw failure(401, '订阅票据无效');
    const hash = hashToken(token);
    const ticket = tickets.get(hash);
    tickets.delete(hash);
    if (!ticket || ticket.expiresAt <= Date.now() || ticket.peer !== peer) throw failure(401, '订阅票据已失效');
    if (!streamAllowed(ticket)) throw failure(403, '没有本场权限');
    if (store.session(ticket.sessionId).state.status === 'ended') throw failure(409, '场次已结束');
    const open = [...streams];
    if (open.length >= limits.streams || open.filter((c) => c.peer === peer).length >= limits.peerStreams
      || open.filter((c) => c.accountId === ticket.accountId).length >= 4) throw failure(429, '场次订阅数已满', 'rate_limited');
    return ticket;
  }

  function connectStream(ticket, res) {
    const client = { ...ticket, res };
    streams.add(client);
    res.once('close', () => {
      streams.delete(client);
      if (stopped) return;
      if ([...streams].some((other) => other.sessionId === client.sessionId && other.accountId === client.accountId && other.res.writable)) return;
      const member = store.membership(client.sessionId, client.accountId);
      if (member?.online) store.saveMember({ ...member, lastSeen: Date.now() });
    });
    const { state } = store.session(ticket.sessionId);
    const sync = replay(state, ticket.epoch, ticket.after);
    if (sync.state || sync.events.length > 32) write(client, 'sync', { state });
    else write(client, 'sync', sync);
  }

  function invalidate({ accountId, tokenHash, characterId }) {
    const affected = (item) => (accountId && item.accountId === accountId) || (characterId && item.characterId === characterId)
      || (tokenHash && (item.tokenHash === tokenHash || item.authHash === tokenHash));
    for (const client of streams) if (affected(client)) close(client, 'unauthorized');
    for (const [hash, ticket] of tickets) if (affected(ticket)) tickets.delete(hash);
    const events = store.transaction(() => {
      const changed = [];
      for (const record of store.liveSessions()) {
        for (const member of store.members(record.state.sessionId)) if (member.online && affected(member)) {
          const event = offline(record, member);
          if (event) changed.push(event);
        }
      }
      return changed;
    });
    for (const event of events) emit(event);
  }

  function tick(at = Date.now()) {
    for (const [hash, ticket] of tickets) if (ticket.expiresAt <= at) tickets.delete(hash);
    const connected = new Set();
    for (const client of streams) {
      if (streamAllowed(client)) {
        connected.add(client.sessionId + ':' + client.accountId);
        write(client);
      } else close(client, 'unauthorized');
    }
    const changes = [];
    store.transaction(() => {
      if (pruneAt <= at) { store.prune(at, limits.retention); pruneAt = at + MINUTE; }
      for (const record of store.liveSessions()) {
        const id = record.state.sessionId;
        if (record.state.status === 'active') {
          const online = store.members(id).filter((member) => member.online);
          const emptyAt = Math.max(0, ...online.map(({ lastSeen }) => lastSeen));
          for (const member of online) {
            const valid = identityActive({ ...member, tokenHash: member.authHash });
            if (!valid || (!connected.has(id + ':' + member.accountId) && at - member.lastSeen >= limits.grace)) {
              const event = offline(record, member, at, valid ? emptyAt : at);
              if (event) changes.push(event);
            }
          }
          if (record.emptySince != null && at - record.emptySince >= limits.pauseAfter) {
            record.emptySince = null;
            changes.push(append(record, 'session.status', null, { status: 'paused' }, at));
          }
        } else if (at - record.updatedAt >= limits.keepPaused) {
          changes.push(append(record, 'session.status', null, { status: 'ended' }, at));
        }
        const { oldest } = store.receiptWindow(id);
        if (oldest != null && oldest < at - limits.retention) {
          record.state = { ...record.state, epoch: record.state.epoch + 1 };
          store.saveSession(record);
          store.clearReceipts(id);
          changes.push({ type: 'session.resync', sessionId: id });
        }
      }
    });
    for (const event of changes) {
      emit(event);
      if (event.type === 'session.status' && event.payload.status === 'ended') {
        for (const client of streams) if (client.sessionId === event.sessionId) close(client, 'ended');
      }
    }
  }

  const onlineCount = (record) => record.state.participants.filter(({ online }) => online).length;
  const publicOwner = (worldId) => 'public:' + worldId;

  /** 公共目录里的一个世界此刻的开放状态：按实际在线人数和可开的场次算 */
  function publicStatus(item) {
    const live = store.publicSessions(item.worldId);
    const online = live.reduce((sum, record) => sum + onlineCount(record), 0);
    const free = live.some((record) => record.state.revision === item.revision && !record.state.activity?.completion && onlineCount(record) < item.seats);
    const canOpen = live.length < item.maxSessions && store.activeCount() < limits.active && store.liveCount() < limits.live;
    const open = publicAccess.open?.() !== false;
    return { online, sessions: live.length, status: !open ? 'closed' : free || canOpen ? 'open' : 'full' };
  }

  function publicCard(item) {
    const objects = (item.objects || []).slice(0, 400).map(({ x, y, wall }) => (wall ? { wall } : { x, y }));
    return { worldId: item.worldId, revision: item.revision, title: item.title, summary: item.summary,
      author: publicAccess.name?.(item.ownerAccountId) || '', activity: item.activity, seats: item.seats,
      preview: { room: item.room && { w: item.room.w, h: item.room.h, mats: item.room.mats, walls: item.room.walls }, objects },
      ...publicStatus(item) };
  }

  /** 选一场可加入的公共场次：先回到自己在的那场，再找有空位的，最后在额度内新开 */
  function publicSeat(listing, owner, at) {
    const changes = [];
    let mine = null, best = null;
    for (const record of store.publicSessions(listing.worldId)) {
      const member = store.membership(record.state.sessionId, owner);
      const online = onlineCount(record);
      // 无人在线时，已完成活动或旧版本的场次直接结束，让后来的人进新的一场
      if (!online && (record.state.activity?.completion || record.state.revision !== listing.revision)) {
        for (const m of store.members(record.state.sessionId)) if (m.leaseHash) store.saveMember({ ...m, online: false, leaseHash: null, authHash: null });
        record.emptySince = null;
        changes.push(append(record, 'session.status', null, { status: 'ended' }, at));
        continue;
      }
      if (member?.revoked) continue;
      if (member && (member.online || online < (record.seats ?? listing.seats))) { mine ??= record; continue; }
      if (record.state.revision !== listing.revision || record.state.activity?.completion || online >= (record.seats ?? listing.seats)) continue;
      if (!best || onlineCount(best) < online || (best.state.status !== 'active' && record.state.status === 'active')) best = record;
    }
    let record = mine || best;
    if (!record) {
      const live = store.publicSessions(listing.worldId).length;
      if (live >= listing.maxSessions || store.activeCount() >= limits.active || store.liveCount() >= limits.live) throw failure(429, '这场已满，稍后再来', 'room_full');
      const state = initialSession({ sessionId: randomUUID(), worldId: listing.worldId, revision: listing.revision });
      runtimeFor(state);
      store.insertSession(state, publicOwner(listing.worldId), at, { seats: listing.seats, isPublic: true });
      record = store.session(state.sessionId);
    }
    return { record, changes };
  }

  const api = {
    /** 未登录也可读：公开目录只含运营方列出的固定版本，不含场次聊天与角色私有信息 */
    publicWorldList(p, ctx) {
      publicAccess.limit?.(ctx);
      const { limit = 20, offset = 0 } = p;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) throw failure(400, '分页参数不合法');
      const rows = store.listings(limit + 1, offset);
      return { worlds: rows.slice(0, limit).map(publicCard), nextOffset: rows.length > limit ? offset + limit : null, open: publicAccess.open?.() !== false };
    },

    publicWorldGet(p, ctx) {
      publicAccess.limit?.(ctx);
      const item = typeof p.worldId === 'string' && p.worldId.length <= 80 && store.listing(p.worldId);
      if (!item?.listed) throw failure(404, '没有这个公共世界', 'not_listed');
      const release = store.release(item.worldId, item.revision);
      if (!release) throw failure(404, '没有此发布版本');
      return { world: publicCard({ ...item, activity: release.activity?.kind || null, room: release.scene.room, objects: release.scene.objects, title: release.title }), release };
    },

    /** 登录后进入公共世界：事务内检查开放状态、封禁、容量和已有成员资格，然后交给 worldJoin */
    publicWorldEnter(p, ctx) {
      const owner = account(p, ctx);
      if (publicAccess.open?.() === false) throw failure(403, '公共世界暂未开放', 'entry_closed');
      actor(p, ctx);
      allowWrite(owner, ctx);
      const result = store.transaction(() => {
        const listing = typeof p.worldId === 'string' && p.worldId.length <= 80 && store.listing(p.worldId);
        if (!listing?.listed) throw failure(404, '没有这个公共世界', 'not_listed');
        const at = Date.now();
        const { record, changes } = publicSeat(listing, owner, at);
        const id = record.state.sessionId;
        const elsewhere = store.onlineSession(owner);
        if (elsewhere && elsewhere !== id) throw failure(409, '请先离开其他场次', 'elsewhere');
        if (!store.membership(id, owner)) store.saveMember({ sessionId: id, accountId: owner, lastSeen: at });
        if (record.state.status === 'paused') {
          if (store.activeCount() >= limits.active) throw failure(429, '当前场次已满', 'room_full');
          record.emptySince = at;
          changes.push(append(record, 'session.status', null, { status: 'active' }, at));
        }
        return { changes, entered: { sessionId: id, worldId: record.state.worldId, revision: record.state.revision, status: record.state.status } };
      });
      for (const event of result.changes) {
        emit(event);
        if (event.payload?.status === 'ended') for (const client of streams) if (client.sessionId === event.sessionId) close(client, 'ended');
      }
      return result.entered;
    },

    /** 只读查看邀请：不兑换、不暴露谁用过；持有邀请码的人才查得到 */
    invitePreview(p, ctx) {
      publicAccess.limit?.(ctx);
      if (typeof p.code !== 'string' || p.code.length > 80) throw failure(400, '邀请码不合法');
      const viewer = publicAccess.viewer?.(ctx) || null;
      const invite = store.inviteByHash(hashToken(p.code.trim()));
      if (!invite) return { status: 'invalid' };
      const record = store.session(invite.session_id);
      const release = record && store.release(record.state.worldId, record.state.revision);
      const member = viewer && store.membership(invite.session_id, viewer);
      const seats = record?.seats ?? limits.seats;
      let status = 'ok';
      if (!record || record.state.status === 'ended') status = 'ended';
      else if (member?.revoked) status = 'removed';
      else if (invite.redeemed_by && invite.redeemed_by === viewer) status = 'mine';
      else if (invite.revoked) status = 'revoked';
      else if (invite.redeemed_by) status = 'used';
      else if (invite.expires_at <= Date.now()) status = 'expired';
      else if (!member && store.members(invite.session_id).filter((entry) => !entry.revoked).length >= seats) status = 'full';
      return { status, expiresAt: invite.expires_at,
        ...(release && ['ok', 'mine', 'full'].includes(status) ? { world: { title: release.title, host: publicAccess.name?.(record.owner) || '', activity: release.activity?.kind || null,
          online: onlineCount(record), seats } } : {}) };
    },

    worldOpen(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      return store.transaction(() => {
        const world = owned(p.worldId, owner);
        const revision = p.revision ?? world.revision;
        if (!Number.isSafeInteger(revision) || revision < 1) throw failure(404, '请先发布世界');
        if (store.onlineSession(owner)) throw failure(409, '请先离开其他场次');
        if (store.ownerSessionCount(owner) >= 4) throw failure(429, '此账号的未结束场次已满', 'room_full');
        if (store.activeCount() >= limits.active || store.liveCount() >= limits.live) throw failure(429, '当前场次已满', 'room_full');
        const state = initialSession({ sessionId: randomUUID(), worldId: world.worldId, revision });
        runtimeFor(state);
        const at = Date.now();
        store.insertSession(state, owner, at);
        store.saveMember({ sessionId: state.sessionId, accountId: owner, lastSeen: at });
        return { sessionId: state.sessionId, state };
      });
    },

    inviteCreate(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      return store.transaction(() => {
        const record = managed(p.sessionId, owner);
        if (record.state.status === 'ended') throw failure(409, '场次已结束');
        const at = Date.now();
        if (store.openInviteCount(p.sessionId, at) >= 8) throw failure(429, '本场未使用的邀请码过多', 'rate_limited');
        const code = opaque();
        const inviteId = randomUUID();
        const expiresAt = at + limits.inviteTtl;
        store.addInvite({ id: inviteId, hash: hashToken(code), sessionId: p.sessionId, expiresAt });
        return { inviteId, code, expiresAt };
      });
    },

    inviteRevoke(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      managed(p.sessionId, owner);
      if (typeof p.inviteId !== 'string' || p.inviteId.length > 80) throw failure(400, '邀请 id 不合法');
      return { revoked: Boolean(store.revokeInvite(p.sessionId, p.inviteId)) };
    },

    inviteRedeem(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      if (typeof p.code !== 'string' || p.code.length > 80) throw failure(400, '邀请码不合法');
      return store.transaction(() => {
        const invite = store.inviteByHash(hashToken(p.code.trim()));
        if (!invite || invite.revoked || (invite.expires_at <= Date.now() && invite.redeemed_by !== owner)) throw failure(410, '邀请已失效', 'expired_invite');
        const id = invite.session_id;
        const record = store.session(id);
        if (record.state.status === 'ended') throw failure(410, '场次已结束', 'expired_invite');
        const member = store.membership(id, owner);
        if (member?.revoked || (invite.redeemed_by && invite.redeemed_by !== owner)) throw failure(403, '邀请不可用');
        if (!member) {
          if (store.members(id).filter((entry) => !entry.revoked).length >= limits.seats) throw failure(429, '本场成员已满', 'room_full');
          store.saveMember({ sessionId: id, accountId: owner, lastSeen: Date.now() });
        }
        if (!invite.redeemed_by) store.redeemInvite(invite.id, owner);
        return { sessionId: id, worldId: record.state.worldId, revision: record.state.revision, status: record.state.status };
      });
    },

    worldJoin(p, ctx) {
      const role = actor(p, ctx);
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      const result = store.transaction(() => {
        const { record, member } = access(p.sessionId, owner);
        if (record.state.status !== 'active') throw failure(409, '请先恢复场次');
        if (member.characterId && member.characterId !== role.id) throw failure(403, '该账号在本场已选择其他角色');
        const elsewhere = store.onlineSession(owner);
        if (elsewhere && elsewhere !== p.sessionId) throw failure(409, '请先离开其他场次');
        if (!member.online && record.state.participants.filter(({ online }) => online).length >= (record.seats ?? limits.seats)) throw failure(429, '本场在线名额已满', 'room_full');
        if (member.online && member.leaseHash && p.takeControl !== true) {
          const controlKey = matchingLease(member, p.controlKey) ? p.controlKey : null;
          return { state: record.state, characterId: role.id, controlGeneration: member.generation, controlKey };
        }
        const key = opaque();
        const generation = member.generation + 1;
        const at = Date.now();
        const position = record.state.participants.find((item) => item.characterId === role.id) || runtimeFor(record.state).spawn;
        record.emptySince = null;
        store.saveMember({ ...member, characterId: role.id, generation, leaseHash: hashToken(key),
          authHash: ctx?.token ? hashToken(ctx.token) : null, online: true, lastSeen: at });
        const event = append(record, 'member.changed', role.id, { participant: publicActor(role, position) }, at);
        return { state: record.state, characterId: role.id, controlGeneration: generation, controlKey: key, event };
      });
      const { event, ...joined } = result;
      if (event) {
        emit(event);
        emit({ type: 'control.changed', sessionId: p.sessionId, generation: joined.controlGeneration }, owner);
      }
      return joined;
    },

    worldLeave(p, ctx) {
      const owner = account(p, ctx);
      const event = store.transaction(() => {
        const { record, member } = access(p.sessionId, owner);
        if (!member.online || !matchingLease(member, p.controlKey)) return null;
        return offline(record, member);
      });
      if (event) {
        emit(event);
        for (const client of streams) if (client.sessionId === p.sessionId && client.accountId === owner) close(client, 'left');
      }
      return { ok: true };
    },

    worldKick(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      let removedAccount;
      const event = store.transaction(() => {
        const record = managed(p.sessionId, owner);
        const member = typeof p.accountId === 'string' ? store.membership(p.sessionId, p.accountId)
          : store.members(p.sessionId).find(({ characterId }) => typeof p.characterId === 'string' && characterId === p.characterId);
        if (!member || member.revoked) return null;
        if (member.accountId === owner) throw failure(400, '不能移除房主');
        removedAccount = member.accountId;
        store.saveMember({ ...member, revoked: true, online: false, leaseHash: null, authHash: null });
        if (!record.state.participants.some((item) => item.online && item.characterId !== member.characterId)) record.emptySince ??= Date.now();
        if (!member.characterId) { store.saveSession(record); return null; }
        return append(record, 'member.removed', member.characterId, {});
      });
      for (const client of streams) if (client.sessionId === p.sessionId && client.accountId === removedAccount) close(client, 'forbidden');
      if (event) emit(event);
      return { ok: true };
    },

    worldResume(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      const result = store.transaction(() => {
        const { record } = access(p.sessionId, owner);
        if (record.state.status === 'ended') throw failure(409, '场次已结束');
        if (record.state.status === 'active') return { state: record.state };
        if (store.activeCount() >= limits.active) throw failure(429, '当前场次已满', 'room_full');
        record.emptySince = Date.now();
        const event = append(record, 'session.status', null, { status: 'active' });
        return { state: record.state, event };
      });
      if (result.event) emit(result.event);
      return { state: result.state };
    },

    worldEnd(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      const event = store.transaction(() => {
        const record = managed(p.sessionId, owner);
        if (record.state.status === 'ended') return null;
        for (const member of store.members(p.sessionId)) {
          if (member.online) store.saveMember({ ...member, online: false, leaseHash: null, authHash: null });
        }
        record.emptySince = null;
        return append(record, 'session.status', null, { status: 'ended' });
      });
      if (event) {
        emit(event);
        for (const client of streams) if (client.sessionId === p.sessionId) close(client, 'ended');
      }
      return { ok: true };
    },

    worldSnapshot(p, ctx) {
      const { record, member } = access(p.sessionId, account(p, ctx));
      return { state: record.state, characterId: member.characterId, controlGeneration: member.generation };
    },

    worldReplay(p, ctx) {
      const { record: { state } } = access(p.sessionId, account(p, ctx));
      return replay(state, p.epoch, p.after);
    },

    worldCompletion(p, ctx) {
      const owner = account(p, ctx);
      const { member } = access(p.sessionId, owner);
      const stored = store.completion(p.sessionId, Date.now());
      const eligible = stored?.qualifiers.some(({ accountId, characterId }) => accountId === owner && characterId === member.characterId);
      return { completion: eligible ? { event: stored.event, expiresAt: stored.expiresAt } : null };
    },

    worldStreamTicket(p, ctx) {
      const owner = account(p, ctx);
      const { member } = access(p.sessionId, owner);
      if (!member.characterId) throw failure(403, '请先选择角色入场');
      const at = Date.now();
      for (const [hash, ticket] of tickets) if (ticket.expiresAt <= at) tickets.delete(hash);
      if (tickets.size >= limits.streams * 4 || [...tickets.values()].filter((ticket) => ticket.accountId === owner).length >= 4) throw failure(429, '票据申请过于频繁', 'rate_limited');
      const ticket = opaque();
      tickets.set(hashToken(ticket), { sessionId: p.sessionId, accountId: owner, characterId: member.characterId,
        epoch: p.epoch, after: p.after, peer: ctx?.peer, tokenHash: ctx?.token ? hashToken(ctx.token) : null, expiresAt: at + limits.ticketTtl });
      return { ticket };
    },

    worldCommand: (p, ctx) => command(p, ctx, 'human'),
    worldAgentCommand: (p, ctx) => command(p, ctx, 'ai'),
    worldSayRemove(p, ctx) {
      const owner = account(p, ctx);
      allowWrite(owner, ctx);
      if (!Number.isSafeInteger(p.seq) || p.seq < 1) throw failure(400, '发言序号不合法');
      const event = store.transaction(() => {
        const { record, member } = access(p.sessionId, owner);
        const said = record.state.recent.find(({ seq }) => seq === p.seq);
        if (!said) return null;
        if (said.actorCharacterId !== member.characterId) throw failure(403, '只能撤回自己角色的发言');
        store.redactSpeech(said);
        return append(record, 'actor.said.removed', said.actorCharacterId, { seq: said.seq });
      });
      if (event) emit(event);
      return { events: event ? [event] : [] };
    },
  };

  function stop() {
    stopped = true;
    streams.clear();
    tickets.clear();
    runtimeCache.clear();
  }

  function metrics() {
    return { ...counters, streams: streams.size, tickets: tickets.size,
      activeSessions: store.activeCount(), liveSessions: store.liveCount(), limits: { ...limits } };
  }

  return { api, access, connectStream, consumeTicket, tick, invalidate, stop, metrics, resolveSpeech,
    speechQueue: () => store.pendingSpeech(Date.now() - limits.retention) };
}
