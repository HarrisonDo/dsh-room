import { SESSION_PROTOCOL, verifyWorldRelease, worldRuntime } from '../../shared/world-format.js';
import { applySessionEvent } from '../../shared/session-core.js';
import { publicLook } from '../../shared/public-appearance.js';
import { AgentAdapter } from './agent-adapter.js';
import { ExperienceStore, serviceOrigin } from './experience.js';
import { Memory } from './memory.js';

const VIEW_COMMANDS = new Set(['agent.list', 'object.list', 'scene.get', 'camera.fit', 'room.list', 'room.describe', 'ui.open', 'ui.close', 'ui.toast']);

export class WorldSession {
  constructor(app) {
    this.app = app;
    this.state = null;
    this.connected = false;
    this.controlKey = null;
    this.flow = null;
    this.error = '';
    this.agent = new AgentAdapter(app.ext.worldAgent, app.storage);
    this.experiences = new ExperienceStore(app.opts.storageKey || 'roomkit');
    this.auto = false;
  }

  get id() { return this.state?.sessionId; }
  get canAct() {
    return this.connected && !!this.controlKey && this.state?.status === 'active'
      && this.state.participants.some(({ characterId, online }) => characterId === this.characterId && online);
  }

  call(method, body) {
    if (this.serviceUrl !== this.app.town.url) return Promise.reject(new Error('小镇地址已改变'));
    return this.app.town.call(method, body, { signal: AbortSignal.timeout(15_000) });
  }

  async chooseRole(localAgentId) {
    const local = localAgentId ? this.app.agents.get(localAgentId) : this.app.mainAgent();
    if (!local || local.data.ephemeral) throw new Error('请先选择一个本机角色');
    if (!local.data.localCharacterId) {
      local.data.localCharacterId = globalThis.crypto.randomUUID();
      this.app._autosave();
    }
    this.localRole = local.data;
    this.localCharacter = this.app.characterOf(local);
    this.localCharacterId = local.data.localCharacterId;
    const town = this.app.town;
    if (town.cfg?.legacy) return town.me;
    if (this.app.opts.site) return town.char;   // 网页用账号默认角色入场，不把本机体验角色写回账号
    const { account, characters } = await this.call('me', {});
    town.account = account;
    const saved = this.app.storage.pref('worldRoleLinks');
    const links = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    const groupKey = new URL(this.serviceUrl).origin + '|' + account.id;
    const group = { ...links[groupKey] };
    const linked = group[this.localCharacterId];
    let id = characters.find((role) => role.id === linked)?.id;
    if (!id && !Object.values(group).includes(town.char)) id = characters.find((role) => role.id === town.char)?.id;
    const publicProfile = { name: local.name, kind: local.data.kind, look: publicLook(local.look) };
    const current = characters.find((role) => role.id === id);
    if (!current || current.name !== publicProfile.name || current.kind !== publicProfile.kind || JSON.stringify(current.look) !== JSON.stringify(publicProfile.look)) {
      id = (await this.call('character', { me: id || '', ...publicProfile })).character.id;
    }
    group[this.localCharacterId] = id;
    this.app.storage.pref('worldRoleLinks', { ...links, [groupKey]: group });
    return id;
  }

  async enter(sessionId, { localAgentId } = {}) {
    if (this.flow || this.app.visiting) throw new Error('请先回到自己的房间');
    const flow = this.flow = {};
    this.serviceUrl = this.app.town.url;
    let joined;
    try {
      const { release: raw } = await this.call('worldGet', { sessionId });
      const release = await verifyWorldRelease(raw);
      const runtime = worldRuntime(release, globalThis.RoomKitAssets);
      const { state } = await this.call('worldSnapshot', { sessionId });
      this.platformCharacterId = await this.chooseRole(localAgentId);
      if (state.status === 'paused') await this.call('worldResume', { sessionId });
      if (this.flow !== flow) throw new Error('入场已取消');
      joined = await this.call('worldJoin', { sessionId, me: this.platformCharacterId });
      if (this.flow !== flow) throw new Error('入场已取消');
      this.release = release;
      this.runtime = runtime;
      this.characterId = joined.characterId;
      this.controlKey = joined.controlKey;
      this.controlGeneration = joined.controlGeneration;
      this.state = joined.state;
      this.experienceError = '';
      this.visit = { v: 1, id: globalThis.crypto.randomUUID(), title: release.title, localCharacterId: this.localCharacterId,
        source: { serviceId: serviceOrigin(this.serviceUrl), worldId: release.worldId, revision: release.revision, sessionId },
        participants: [], facts: [], outcome: 'partial', reflection: { text: '', status: 'fallback' }, createdAt: Date.now() };
      try {
        const legacy = new Memory(this.serviceUrl.replace(/^https?:\/\//, '') + '|' + this.platformCharacterId);
        this.experiences.importLegacy(this.localCharacterId, this.serviceUrl, legacy.data.events);
      } catch (error) { this.experienceError = error.message; }
      this.applying = true;
      try { this.app.worldDrafts.view.open(release, runtime.catalog, 'world-session'); }
      finally { this.applying = false; }
      this.snapshot(joined.state);
      await this.connect(flow);
      this.agent.refresh().then(() => { if (this.flow === flow) this.changed(); }).catch(() => {});
      this.app.storage.pref('worldLastSession', { sessionId, service: this.app.town.url, localAgentId: this.localRole.id });
      if (this.app.opts.site) this.app.shell.hub.entered();
      else if (this.app.shell.page === 'social') this.app.shell.render();
      else this.app.shell.open('social');
      return this.state;
    } catch (error) {
      if (this.flow === flow) await this.leave();
      else if (joined?.controlKey) this.call('worldLeave', { sessionId, controlKey: joined.controlKey }).catch(() => {});
      throw error;
    }
  }

  async connect(flow) {
    const { sessionId, epoch, seq } = this.state;
    const { ticket } = await this.call('worldStreamTicket', { sessionId, epoch, after: seq });
    if (this.flow !== flow) return;
    const source = this.source = new EventSource(this.app.town.url + '/world-events?' + new URLSearchParams({ ticket }));
    await new Promise((resolve, reject) => {
      let synced = false;
      const finish = (error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const lost = () => {
        if (this.source !== source) { finish(new Error('订阅已关闭')); return; }
        source.close();
        this.source = null;
        this.connected = false;
        this.stopAI();
        if (!synced) finish(new Error('连接场次失败'));
        else {
          this.error = '连接中断，正在尝试恢复';
          this.retry(flow);
          this.changed();
        }
      };
      const timer = setTimeout(lost, 7000);
      this.endConnect = () => finish(new Error('订阅已关闭'));
      source.onerror = lost;
      source.addEventListener('sync', (message) => {
        if (this.source !== source) return;
        try {
          const data = JSON.parse(message.data);
          if (data.state) this.snapshot(data.state);
          else this.accept(data.events);
          this.connected = true;
          this.error = '';
          synced = true;
          finish();
          this.changed();
          if (this.state?.activity.completion) this.claimCompletion().catch(() => {});
        } catch { lost(); }
      });
      source.addEventListener('event', (message) => {
        if (this.source === source) this.accept([JSON.parse(message.data)]);
      });
      source.addEventListener('review', (message) => {
        if (this.source !== source) return;
        this.speechReview = JSON.parse(message.data);
        this.changed();
      });
      source.addEventListener('resync', () => this.sync().catch(() => lost()));
      source.addEventListener('control', (message) => {
        const { generation } = JSON.parse(message.data);
        if (this.source !== source || generation <= this.controlGeneration) return;
        this.controlGeneration = generation;
        this.controlKey = null;
        this.stopAI();
        this.error = '角色已由另一个窗口接管';
        this.changed();
      });
      source.addEventListener('accessLost', (message) => {
        if (this.source !== source) return;
        const { reason } = JSON.parse(message.data);
        this.leave({ notify: false }).catch(() => {});
        this.app.hud.toast(reason === 'ended' ? '场次已结束' : '本场访问权限已结束', 3000);
      });
    }).finally(() => { if (this.source === source) this.endConnect = null; });
  }

  retry(flow) {
    clearTimeout(this.reconnectTimer);
    if (this.flow !== flow) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.flow !== flow) return;
      this.connect(flow).catch((error) => {
        if (error.status === 401 || error.status === 403 || error.status === 409) {
          this.leave({ notify: false }).catch(() => {});
          this.app.hud.toast(error.message, 3000);
        } else this.retry(flow);
      });
    }, 1200);
  }

  async sync() {
    if (!this.state) return;
    if (this.syncing) return this.syncing;
    const flow = this.flow;
    const { sessionId, epoch, seq } = this.state;
    const operation = this.call('worldReplay', { sessionId, epoch, after: seq }).then((data) => {
      if (this.flow !== flow) return;
      if (data.state) this.snapshot(data.state);
      else this.accept(data.events, false);
    });
    this.syncing = operation;
    try { await operation; }
    finally {
      if (this.syncing === operation) this.syncing = null;
      if (this.flow === flow && this.wantsSync) {
        this.wantsSync = false;
        this.sync().catch(() => {});
      }
    }
  }

  accept(events, sync = true) {
    for (const event of events || []) {
      if (!this.state || event.sessionId !== this.id || event.seq <= this.state.seq) continue;
      try {
        this.state = applySessionEvent(this.state, event);
      } catch {
        if (sync) {
          if (this.syncing) this.wantsSync = true;
          else this.sync().catch(() => {});
        }
        return;
      }
      this.visual(event);
      if (['member.changed', 'beacon.lit', 'activity.completed'].includes(event.type)) this.recordExperience(event);
      this.app.bus.emit('world:committed', event);
    }
    if (events?.length) this.queueAI();
    this.changed();
  }

  snapshot(state) {
    if (!this.state || state.sessionId !== this.id || state.epoch < this.state.epoch || state.seq < this.state.seq) return;
    if (state.epoch !== this.state.epoch) this.stopAI();
    this.state = state;
    this.actors(true);
    this.paintActivity();
    this.recordExperience();
    if (state.status !== 'active') this.stopAI();
    this.app.bus.emit('world:snapshot', state);
    this.changed();
    if (this.connected && state.activity.completion) this.claimCompletion().catch(() => {});
  }

  actors(reset) {
    const app = this.app;
    app.world.scene.agents = this.state.participants.filter(({ online }) => online).map((actor) => ({
      ...actor, id: actor.characterId, brain: 'manual', ephemeral: true,
    }));
    app._syncAgents(false);
    if (!reset) return;
    for (const { characterId, x, y } of this.state.participants) {
      const agent = app.agents.get(characterId);
      if (agent) {
        agent.cancel();
        agent.x = x;
        agent.y = y;
        if (agent.speech?.seq && !this.state.recent.some(({ seq }) => seq === agent.speech.seq)) agent.say('');
      }
    }
  }

  paintActivity() {
    const activity = this.release.activity;
    if (!activity) return;
    const lit = new Set(this.state.activity.contributions.map(({ beaconId }) => beaconId));
    this.applying = true;
    try {
      for (const id of activity.beaconIds) this.app.world.apply({ t: 'state', id, patch: { on: lit.has(id) } }, { silent: true });
      this.app.world.apply({ t: 'state', id: activity.exitId, patch: { open: Boolean(this.state.activity.completion) } }, { silent: true });
    } finally { this.applying = false; }
  }

  visual(event) {
    const agent = this.app.agents.get(event.actorCharacterId);
    const { type, payload } = event;
    if (type === 'member.changed' || type === 'member.removed' || type === 'session.status') this.actors(false);
    if (type === 'session.status' && this.state.status !== 'active') this.stopAI();
    if (type === 'actor.moved' && agent) {
      Object.assign(agent.data, payload);
      if (this.app.reduceMotion) { agent.cancel(); Object.assign(agent, payload); }
      else agent.walkTo(payload.x, payload.y);
    }
    if (type === 'actor.said' && agent) {
      agent.say(payload.text, 4000);
      agent.speech.seq = event.seq;
    }
    if (type === 'actor.said.removed' && agent?.speech?.seq === payload.seq) agent.say('');
    if (type === 'actor.emoted' && agent) agent.bounce(payload.name === 'jump' ? 1.8 : 0.8);
    if (type === 'beacon.lit' || type === 'activity.completed') this.paintActivity();
    if (type === 'activity.completed') this.app.hud.toast('你们一起完成了活动！', 3000);
  }

  async takeControl() {
    if (!this.id) return;
    const flow = this.flow;
    if (this.state.status === 'paused') await this.call('worldResume', { sessionId: this.id });
    if (this.flow !== flow) return;
    const joined = await this.call('worldJoin', { sessionId: this.id, me: this.platformCharacterId, takeControl: true });
    if (this.flow !== flow) return;
    this.controlGeneration = joined.controlGeneration;
    this.controlKey = joined.controlKey;
    this.snapshot(joined.state);
  }

  async command(op, args, source = 'human') {
    if (!this.canAct) throw new Error(this.connected ? '当前窗口没有控制权' : '正在恢复连接');
    const flow = this.flow;
    const input = { protocol: SESSION_PROTOCOL, sessionId: this.id, epoch: this.state.epoch,
      requestId: globalThis.crypto.randomUUID(), actorCharacterId: this.characterId,
      controlGeneration: this.controlGeneration, controlKey: this.controlKey, op, args };
    const result = await this.call(source === 'ai' ? 'worldAgentCommand' : 'worldCommand', input);
    if (this.flow !== flow) return;
    if (result.status === 'committed') { this.error = ''; this.accept(result.events); return result; }
    if (result.status === 'pending') {
      this.error = '';
      if (this.speechReview?.requestId !== result.requestId) this.speechReview = result;
      this.changed();
      return result;
    }
    if (result.code === 'stale_epoch' || result.code === 'resync_required') await this.sync();
    if (result.code === 'control_lost') { this.controlKey = null; this.stopAI(); }
    this.error = result.message;
    this.changed();
    throw Object.assign(new Error(result.message), { code: result.code });
  }

  run(op, args) {
    this.command(op, args).catch((error) => this.app.hud.toast(error.message, 2500));
  }

  async useTarget(objectId) {
    const flow = this.flow;
    const actor = this.state?.participants.find(({ characterId }) => characterId === this.characterId);
    const points = this.runtime?.targets.get(objectId);
    if (!actor || !points?.length) throw new Error('这个物件没有可用交互位');
    const distance = ({ x, y }) => Math.hypot(x - actor.x, y - actor.y);
    const point = points.reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest);
    if (distance(point) > 0.85) await this.command('move', point);
    if (this.flow !== flow) return;
    return this.command('interact', { objectId });
  }

  observation() {
    const state = this.state;
    const objects = [...this.runtime.targets].map(([id, points]) => {
      const object = this.runtime.world.byId.get(id);
      const lit = state.activity.contributions.some(({ beaconId }) => beaconId === id);
      return { id, name: this.runtime.world.def(object).name, points,
        effect: id === this.release.activity?.exitId ? '打开出口' : '点亮信标', done: lit || state.activity.completion?.exitId === id };
    });
    return {
      title: this.release.title, actorCharacterId: this.characterId, allowed: ['move', 'interact', 'say', 'emote'],
      participants: state.participants.filter(({ online }) => online).map(({ characterId, name, x, y }) => ({ characterId, name, x, y })),
      activity: this.release.activity ? { ...state.activity, goal: '两个不同账号点亮三个信标，然后打开出口' } : null,
      objects, recent: state.recent.slice(-6).map(({ actorCharacterId, payload }) => ({ actorCharacterId, text: payload.text })), lastResult: this.error,
    };
  }

  privateContext() {
    let memory = '';
    try {
      memory = this.experiences.recall(this.localCharacterId, this.serviceUrl, this.state?.participants
        .map(({ characterId }) => characterId).filter((id) => id !== this.characterId));
    } catch (error) { this.experienceError = error.message; }
    return { name: this.localRole?.name, persona: this.localCharacter?.persona, scenario: this.localCharacter?.scenario, memory };
  }

  recordExperience(event) {
    if (!this.visit || !this.state) return;
    try {
      if (event?.type === 'activity.completed') {
        if (!event.payload.participants.some(({ characterId }) => characterId === this.characterId)) return;
        const { record, created } = this.experiences.complete(this.visit, event);
        if (created && this.auto && this.agent.describeCapabilities().available) {
          this.experiences.summarize(record, this.agent, this.privateContext()).catch((error) => {
            if (error.name !== 'AbortError') { this.experienceError = error.message; this.changed(); }
          });
        } else if (created) this.experiences.setReflection(record, '', 'fallback');
      } else if (this.controlKey && !this.state.activity.completion) {
        const participants = this.state.participants.filter(({ online }) => online).map(({ characterId, name }) => ({ characterId, name }));
        if (participants.some(({ characterId }) => characterId === this.characterId)) {
          this.experiences.recordVisit(this.visit, participants, event?.type === 'beacon.lit' ? event : null);
        }
      }
      this.experienceError = '';
    } catch (error) {
      this.experienceError = error.message;
      this.app.hud.toast(error.message, 3000);
    }
  }

  async claimCompletion() {
    if (!this.id) return false;
    const flow = this.flow;
    const { completion } = await this.call('worldCompletion', { sessionId: this.id });
    if (completion && this.flow === flow) {
      this.recordExperience(completion.event);
      this.changed();
      return true;
    }
    return false;
  }

  async think() {
    if (!this.canAct) throw new Error('需要当前角色的控制权');
    const flow = this.flow, key = this.controlKey, epoch = this.state.epoch;
    const pending = this.agent.decide(this.observation(), this.privateContext());
    this.changed();
    try {
      const intent = await pending;
      if (!intent || !this.canAct || this.flow !== flow || this.controlKey !== key || this.state.epoch !== epoch) return;
      await this.command(intent.op, intent.args, 'ai');
    } catch (error) {
      if (this.flow !== flow || !this.connected || this.controlKey !== key || error.name === 'AbortError') return;
      this.error = error.message;
      if (this.auto && ['too_far', 'invalid_action', 'already_done'].includes(error.code)) { this.queueAI(); return; }
      this.auto = false;
      throw error;
    } finally { this.changed(); }
  }

  setAuto(on) {
    this.auto = Boolean(on) && this.canAct && this.agent.describeCapabilities().available;
    if (this.auto) this.queueAI();
    else this.stopAI();
    this.changed();
  }

  queueAI() {
    if (!this.auto || !this.canAct || this.aiTimer || this.agent.describeCapabilities().busy) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.auto && this.canAct) this.think().catch(() => {});
    }, 4000);
  }

  stopAI() {
    clearTimeout(this.aiTimer);
    this.aiTimer = null;
    this.auto = false;
    this.agent.cancel();
  }

  bridge(command) {
    if (VIEW_COMMANDS.has(command.op)) return null;
    if (command.id && command.id !== this.characterId) return { ok: false, error: '只能控制自己的角色' };
    if (command.op === 'agent.goto' && Number.isFinite(command.x) && Number.isFinite(command.y)) this.run('move', { x: command.x, y: command.y });
    else if (command.op === 'agent.use' && typeof command.obj === 'string') this.run('interact', { objectId: command.obj });
    else if (command.op === 'agent.say') this.run('say', { text: String(command.text || '') });
    else if (command.op === 'agent.emote') this.run('emote', { name: command.kind || 'wave' });
    else return { ok: false, error: '共享场次禁止此本地操作' };
    return { ok: true, pending: true };
  }

  changed() {
    if (this.app.shell?.page === 'social') this.app.shell.render();
  }

  async leave({ notify = true, closing = false } = {}) {
    const sessionId = this.id;
    const controlKey = this.controlKey;
    this.stopAI();
    this.flow = null;
    this.connected = false;
    clearTimeout(this.reconnectTimer);
    this.endConnect?.();
    this.endConnect = null;
    this.source?.close();
    this.source = null;
    this.state = null;
    this.speechReview = null;
    this.visit = null;
    this.syncing = null;
    this.wantsSync = false;
    this.controlKey = null;
    if (sessionId && !closing) this.app.worldDrafts.view.close();
    if (sessionId) this.app.bus.emit('world:left', { sessionId });
    this.changed();
    if (notify && sessionId && controlKey) await this.call('worldLeave', { sessionId, controlKey }).catch(() => {});
  }
}
