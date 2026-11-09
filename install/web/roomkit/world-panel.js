import { WORLD_BYTES } from '../../shared/world-format.js';
import { esc } from './ui.js';
import { download, pickFile } from './workshop.js';
import { experienceSummary, serviceOrigin } from './experience.js';

const button = (action, label, extra = '') => `<button class="rk-btn" data-s="world-${action}" ${extra}>${label}</button>`;
const selected = (value, key) => value === key ? ' selected' : '';
const INPUTS = ['title', 'author', 'license', 'activity', 'beacon0', 'beacon1', 'beacon2', 'exit', 'role', 'invite'];

export function readInvite(value) {
  const text = value.trim();
  if (/^[a-z0-9_-]{16,80}$/i.test(text)) return { code: text };
  let url;
  try { url = new URL(text); } catch { throw new Error('请输入有效的邀请链接或邀请码'); }
  const code = url && new URLSearchParams(url.hash.slice(1)).get('roomkit-invite');
  if (!code || !/^[a-z0-9_-]{16,80}$/i.test(code)) throw new Error('请输入有效的邀请链接或邀请码');
  return { code, service: serviceOrigin(url.href) };
}

export class WorldPanel {
  constructor(shell) {
    this.shell = shell;
    this.app = shell.app;
    this.open = false;
    this.form = {};
    this.worlds = [];
    if (typeof location !== 'undefined') {
      const parts = new URLSearchParams(location.hash.slice(1));
      const code = parts.get('roomkit-invite');
      if (code && /^[a-z0-9_-]{16,80}$/i.test(code)) {
        this.form.invite = code;
        this.open = true;
        parts.delete('roomkit-invite');
        try { history.replaceState(history.state, '', location.pathname + location.search + (parts.size ? '#' + parts : '')); } catch {}
      }
    }
  }

  get session() { return this.app.worldSession; }
  get town() { return this.app.town; }
  get authorized() { return Boolean(this.town.online || this.town.token); }

  rememberForm() {
    for (const key of INPUTS) {
      const input = this.shell.el.body.querySelector('[data-world-field="' + key + '"]');
      if (input) this.form[key] = input.type === 'checkbox' ? input.checked : input.value;
    }
  }

  localRole() { return this.app.agents.get(this.form.role) || this.app.mainAgent(); }
  experienceId() { return this.session.id ? this.session.localCharacterId : this.localRole()?.data.localCharacterId; }

  renderExperiences() {
    const localId = this.experienceId();
    if (!localId) return '';
    let records;
    try { records = this.session.experiences.list(localId); }
    catch { return '<div class="rk-hint">本机经历存储不可用。</div>'; }
    const actions = `<div class="rk-row">${button('experience-export', '导出')}${button('experience-import', '导入')}</div>`;
    const rows = records.map((record) => {
      const attributes = `data-id="${esc(record.id)}" data-service="${esc(record.source.serviceId)}"`;
      const origin = record.source.kind === 'legacy-town' ? '旧小镇' : record.outcome === 'completed' ? '已完成' : '到访';
      return `<div class="rk-kv"><span><b>${esc(record.title)}</b><small>${origin} · ${esc(experienceSummary(record))}</small></span><span>
        ${record.outcome === 'completed' && record.reflection.status !== 'ready' ? button('experience-retry', '补写感想', attributes) : ''}
        ${button('experience-delete', '删除', attributes)}</span></div>`;
    }).join('');
    return `<details class="rk-world-experiences"><summary>我的经历（${records.length}）</summary>${actions}${rows || '<div class="rk-hint">还没有保存的经历。</div>'}</details>`;
  }

  renderSession() {
    const session = this.session;
    const { state } = session;
    const activity = session.release.activity;
    const model = session.agent.describeCapabilities();
    const owner = session.release.authorAccountId === (this.town.account?.id || this.town.me);
    const targets = activity ? [...activity.beaconIds, activity.exitId].map((id, index) => {
      const done = state.activity.contributions.some(({ beaconId }) => beaconId === id) || state.activity.completion?.exitId === id;
      const exit = id === activity.exitId;
      const label = exit ? '出口' : '信标 ' + (index + 1);
      const object = this.app.world.byId.get(id);
      const ready = !exit || state.activity.contributions.length === activity.beaconIds.length;
      return `<div class="rk-kv"><span>${label}<small>${esc(this.app.world.def(object)?.name || '')}</small></span>
        ${button('use', done ? '已完成' : '前往并使用', `data-id="${esc(id)}" ${session.canAct && !done && ready ? '' : 'disabled'}`)}</div>`;
    }).join('') : '';
    const invitation = this.invitation?.sessionId === session.id ? this.invitation : null;
    const invite = invitation ? `<div class="rk-chat-bar"><input readonly aria-label="邀请链接" value="${esc(invitation.url)}">${button('invite-copy', '复制')}${button('invite-revoke', '撤销')}</div><div class="rk-hint">邀请码 ${esc(invitation.code)} · 一次有效</div>` : '';
    const recent = state.recent.slice(-6).map(({ seq, actorCharacterId, payload }) => {
      const name = state.participants.find(({ characterId }) => characterId === actorCharacterId)?.name || '成员';
      const remove = session.connected && actorCharacterId === session.characterId ? button('say-remove', '撤回', `data-id="${seq}"`) : '';
      return `<div class="rk-kv"><span>${esc(name)}<small>${payload.source === 'ai' ? 'AI' : '主人通道'}</small></span><span>${esc(payload.text)} ${remove}</span></div>`;
    }).join('');
    const control = session.connected && !session.canAct && state.status !== 'ended' ? button('control', state.status === 'paused' ? '恢复并控制角色' : '接管我的角色') : '';
    const status = !session.connected ? '正在同步场次' : state.status === 'paused' ? '场次暂停' : session.canAct ? '正在控制自己的角色' : '只读观看';
    return `<section class="rk-world-panel"><div class="rk-field">${esc(session.release.title)}</div>
      <div class="rk-kv"><span>${status}</span>${button('leave', '回家')}</div>${control}
      ${owner ? `<div class="rk-row">${button('invite', '邀请朋友')}${button('end', '结束场次')}</div>${invite}` : ''}
      ${activity ? `<div class="rk-hint">${state.activity.completion ? '活动已完成。完成凭证保留 30 天，可在「我的经历」查看。' : `两个账号合作点亮三个信标，再打开出口。已点亮 ${state.activity.contributions.length} / 3。`}</div>` : ''}
      ${targets}
      <div class="rk-kv"><span>${model.available ? '已接模型 · ' + esc(model.name) : '手动模式'}<small>本小时 ${model.used} / ${model.limit} 次</small></span>
        ${button('think', model.busy ? '正在思考' : '让 AI 行动一次', session.canAct && model.available && !model.busy ? '' : 'disabled')}</div>
      <label class="rk-check"><input type="checkbox" data-s="world-auto" ${session.auto ? 'checked' : ''} ${session.canAct && model.available ? '' : 'disabled'}>允许 AI 自动行动</label>
      ${session.error || session.experienceError ? `<div class="rk-hint">${esc(session.error || session.experienceError)}</div>` : ''}
      ${session.speechReview ? `<div class="rk-hint">${esc(session.speechReview.message)}</div>` : ''}
      ${recent}
      <div class="rk-chat-bar"><input class="rk-world-say" maxlength="200" placeholder="以自己的角色发言">${button('say', '发送', session.canAct ? '' : 'disabled')}</div>
      ${state.activity.completion ? button('claim', '补领完成经历') : ''}
      ${this.renderExperiences()}</section>`;
  }

  renderHome() {
    const app = this.app;
    if (!this.open) return `<div class="rk-kv"><span><b>AI 世界</b></span>${button('toggle', '建世界或加入邀请')}</div>`;
    const form = this.form;
    const roleId = form.role || app.mainAgent()?.id;
    const roles = [...app.agents.values()].filter(({ data }) => !data.ephemeral).map((role) => `<option value="${esc(role.id)}"${selected(roleId, role.id)}>${esc(role.name)}</option>`).join('');
    const fields = ['信标 1', '信标 2', '信标 3', '出口'];
    const selections = fields.map((label, index) => {
      const field = index < 3 ? 'beacon' + index : 'exit';
      const options = app.world.objects.map((object) => {
        const place = object.wall ? '墙面' : `格 (${object.x + 1}, ${object.y + 1})`;
        return `<option value="${esc(object.id)}"${selected(form[field], object.id)}>${esc((app.world.def(object)?.name || object.def) + ' · ' + place)}</option>`;
      }).join('');
      return `<label>${label}<select data-world-field="${field}"><option value="">选择场景物件</option>${options}</select></label>`;
    }).join('');
    const last = app.storage.pref('worldLastSession');
    const resume = last?.service === this.town.url ? button('resume', '回到上次场次') : '';
    const items = (this.authorized && this.listIdentity === this.identity() ? this.worlds : []).map((world) => {
      const attr = `data-id="${esc(world.worldId)}"`;
      return `<div class="rk-kv"><span><b>${esc(world.title)}</b><small>${world.revision ? '第 ' + world.revision + ' 版' : '待发布'}</small></span><span>
        ${button('open', '开场', attr + (world.revision ? '' : ' disabled'))}
        ${button('update', '发布新版', attr)}</span></div>`;
    }).join('');
    const signed = this.authorized ? '' : '<div class="rk-hint">发布或加入前，先在下方连接小镇并登录。草稿可以在本机保存。</div>';
    return `<section class="rk-world-panel"><div class="rk-kv"><span><b>AI 世界</b></span>${button('toggle', '收起')}</div>${signed}
      <label>本机角色<select data-world-field="role">${roles}</select></label>
      <div class="rk-chat-bar"><input data-world-field="invite" value="${esc(form.invite || '')}" placeholder="粘贴邀请链接或邀请码">${button('join', '加入', this.authorized ? '' : 'disabled')}</div>
      ${this.authorized ? resume : ''}
      <div class="rk-field">把当前房间做成世界</div>
      <label>世界名称<input data-world-field="title" value="${esc(form.title || app.world.scene.name)}" maxlength="80"></label>
      <label class="rk-check"><input type="checkbox" data-world-field="activity" ${form.activity ? 'checked' : ''}>添加合作信标活动</label>
      <div class="rk-world-targets">${selections}</div>
      <div class="rk-world-targets"><label>素材作者（缺失时填写）<input data-world-field="author" value="${esc(form.author || '')}" maxlength="40"></label><label>素材许可（缺失时填写）<input data-world-field="license" value="${esc(form.license || '')}" maxlength="40"></label></div>
      <div class="rk-row">${button('save', '保存世界草稿')}${button('import', '导入草稿')}${button('publish', '发布最近草稿', this.authorized ? '' : 'disabled')}</div>
      ${this.draftTitle ? `<div class="rk-hint">最近草稿是「${esc(this.draftTitle)}」。</div>` : ''}
      <div class="rk-field">我的世界 ${button('list', '刷新', this.authorized ? '' : 'disabled')}</div>${items || '<div class="rk-hint">发布后可在这里开场。</div>'}
      ${this.renderExperiences()}</section>`;
  }

  async list() {
    const identity = this.identity();
    const worlds = this.authorized ? (await this.town.call('worldList', {})).worlds : [];
    if (this.identity() === identity) { this.listIdentity = identity; this.worlds = worlds; }
  }

  identity() { return this.town.url + '|' + (this.town.account?.id || this.town.me); }

  async action(action, element) {
    this.rememberForm();
    const { app, session, town } = this;
    const id = element?.dataset.id;
    switch (action) {
      case 'toggle':
        this.open = !this.open;
        this.shell.render();
        if (this.open) {
          await this.list();
          this.draftTitle = (await app.worldDrafts.latest().catch(() => null))?.title;
        }
        break;
      case 'list': await this.list(); break;
      case 'save': {
        const { title, author, license, activity, beacon0, beacon1, beacon2, exit } = this.form;
        const release = await app.worldDrafts.save({ title, author, license,
          activity: activity ? { kind: 'cooperative-beacons', v: 1, beaconIds: [beacon0, beacon1, beacon2], exitId: exit, minContributors: 2 } : null });
        this.draftTitle = release.title;
        app.hud.toast('世界草稿已保存');
        break;
      }
      case 'import': {
        const file = await pickFile('.json,application/json');
        if (!file) return;
        if (file.size > WORLD_BYTES) throw new Error('世界包超过 4 MiB');
        this.draftTitle = (await app.worldDrafts.import(JSON.parse(await file.text()))).title;
        app.hud.toast('世界包已保存为本机草稿');
        break;
      }
      case 'publish':
      case 'update': {
        const release = await app.worldDrafts.latest();
        const current = action === 'update' ? this.worlds.find((world) => world.worldId === id) : null;
        await town.call('worldPublish', { release, ...(current ? { worldId: current.worldId, expectedRevision: current.revision } : {}) });
        await this.list();
        app.hud.toast('世界已发布');
        break;
      }
      case 'open': {
        const { sessionId } = await town.call('worldOpen', { worldId: id });
        await session.enter(sessionId, { localAgentId: this.form.role });
        break;
      }
      case 'join': {
        const { code, service } = readInvite(this.form.invite || '');
        if (service && service !== serviceOrigin(town.url)) throw new Error('请先连接邀请链接中的小镇地址');
        const { sessionId } = await town.call('inviteRedeem', { code });
        this.form.invite = '';
        const invite = this.shell.el.body.querySelector('[data-world-field="invite"]');
        if (invite) invite.value = '';
        await session.enter(sessionId, { localAgentId: this.form.role });
        break;
      }
      case 'resume': {
        const last = app.storage.pref('worldLastSession');
        if (last?.service === town.url) await session.enter(last.sessionId, { localAgentId: last.localAgentId });
        break;
      }
      case 'invite': {
        const invite = await session.call('inviteCreate', { sessionId: session.id });
        const url = new URL('/invite', town.url);
        url.hash = new URLSearchParams({ 'roomkit-invite': invite.code }).toString();
        this.invitation = { ...invite, url: url.href, sessionId: session.id };
        break;
      }
      case 'invite-copy':
        await navigator.clipboard.writeText(this.invitation.url);
        app.hud.toast('邀请链接已复制');
        break;
      case 'invite-revoke':
        await session.call('inviteRevoke', { sessionId: session.id, inviteId: this.invitation.inviteId });
        this.invitation = null;
        break;
      case 'end':
        await session.call('worldEnd', { sessionId: session.id });
        app.storage.pref('worldLastSession', null);
        await session.leave({ notify: false });
        break;
      case 'preview-close': app.worldDrafts.view.close(); break;
      case 'leave': await session.leave(); break;
      case 'control': await session.takeControl(); break;
      case 'think': await session.think(); break;
      case 'auto': session.setAuto(!!element.checked); return;
      case 'use': await session.useTarget(id); break;
      case 'claim': if (!await session.claimCompletion()) app.hud.toast('本角色没有可补领的经历'); break;
      case 'say': {
        const input = this.shell.el.body.querySelector('.rk-world-say');
        const text = input?.value.trim();
        if (text) { input.value = ''; session.run('say', { text }); }
        return;
      }
      case 'say-remove': {
        const { events } = await session.call('worldSayRemove', { sessionId: session.id, seq: Number(id) });
        session.accept(events);
        break;
      }
      case 'experience-export': {
        const localId = this.experienceId();
        if (localId) download('roomkit-experiences.json', session.experiences.export(localId), true);
        return;
      }
      case 'experience-import': {
        const file = await pickFile('.json,application/json');
        if (!file) return;
        if (file.size > 1024 * 1024) throw new Error('经历文件超过 1 MiB');
        const count = session.experiences.import(JSON.parse(await file.text()), this.experienceId());
        app.hud.toast(`已导入 ${count} 条经历`);
        break;
      }
      case 'experience-delete': session.experiences.remove(this.experienceId(), element.dataset.service, id); break;
      case 'experience-retry': {
        const record = session.experiences.get(this.experienceId(), element.dataset.service, id);
        if (!record) return;
        await session.agent.refresh();
        const role = this.localRole();
        const card = app.characterOf(role);
        const context = session.id ? session.privateContext() : { name: role?.name, persona: card?.persona, scenario: card?.scenario };
        await session.experiences.summarize(record, session.agent, context);
        break;
      }
    }
    this.shell.render();
  }
}
