/**
 * RoomKit · 网页版的「世界」页与连续入场：公共世界、朋友邀请、登录后继续原目标。
 * 只在 opts.site 下启用；DSH / Electron 继续用 world-panel.js，等三端适配时再接入。
 *
 * 登录在弹窗里完成，页面不跳走；目标同时记在 sessionStorage，刷新后还能接着走。
 */
import { esc } from './ui.js';
import { readInvite } from './world-panel.js';
import { drawSceneThumb } from './shell.js';

const NEUTRAL_NAME = '角色';
const INVITE_TEXT = {
  invalid: '这条邀请不存在，请向朋友要一条新的。',
  expired: '这条邀请已过期，请向朋友要一条新的。',
  revoked: '房主已撤销这条邀请。',
  used: '这条邀请已被别人使用，请向朋友要一条新的。',
  ended: '这一场已经结束了。',
  full: '这一场已满，稍后再试或请房主另开一场。',
  removed: '你已被房主移出这一场。',
};
const btn = (action, label, extra = '') => `<button class="rk-btn" data-s="hub-${action}" ${extra}>${label}</button>`;
const primary = (action, label, extra = '') => `<button class="rk-btn on" data-s="hub-${action}" ${extra}>${label}</button>`;

export class WorldHub {
  constructor(shell) {
    this.shell = shell;
    this.app = shell.app;
    this.worlds = [];
    this.form = {};
    this.invite = null;
    this.error = '';
    this.loaded = false;
    this.targetKey = (this.app.opts.storageKey || 'roomkit') + '.target';
  }

  get town() { return this.app.town; }
  get session() { return this.app.worldSession; }
  get signedIn() { return Boolean(this.town?.token && this.town.online && this.town.account); }
  get cfg() { return this.town?.cfg || null; }

  get target() { try { return JSON.parse(sessionStorage.getItem(this.targetKey)); } catch { return null; } }
  set target(value) {
    try {
      if (value) sessionStorage.setItem(this.targetKey, JSON.stringify(value));
      else sessionStorage.removeItem(this.targetKey);
    } catch { /* 无痕模式下只靠内存里的弹窗流程 */ }
  }

  /** 顶栏右侧的状态：世界连接和账号，不代表模型或同步 */
  connection() {
    const town = this.town;
    if (town?.error && !town.online) return { level: 'error', label: '世界连不上', detail: town.error };
    if (this.signedIn) return { level: 'ok', label: town.account.name || town.account.login || '已登录', detail: '已登录；房间仍保存在此浏览器' };
    return { level: 'local', label: '游客', detail: '房间仅保存在此浏览器' };
  }

  async start() {
    const panel = this.shell.worldPanel;
    if (panel.form.invite) {
      this.invite = { code: panel.form.invite, preview: null };
      panel.form.invite = '';
      panel.open = false;
    }
    const focus = /^\/worlds(?:\/|$)/.test(location.pathname);
    await this.town.connect().catch(() => {});
    if (this.invite) await this.previewInvite();
    if (this.invite || focus) this.shell.open('social');
    await this.load();
    const target = this.target;
    if (target && this.signedIn) await this.guard(() => this.continueTarget(target));
    this.shell.syncConn();
  }

  async load() {
    try {
      const { worlds } = await this.town.call('publicWorldList', {});
      this.worlds = worlds;
      this.loaded = true;
      this.listError = '';
    } catch (error) {
      this.listError = error.message === 'Failed to fetch' ? '世界暂时连不上' : error.message;
    }
    this.refresh();
  }

  async previewInvite() {
    try { this.invite.preview = await this.town.call('invitePreview', { code: this.invite.code }); }
    catch (error) { this.invite.preview = null; this.error = error.message === 'Failed to fetch' ? '世界暂时连不上，邀请还保留着。' : error.message; }
    this.refresh();
  }

  refresh() { if (this.shell.page === 'social') this.shell.render(); }

  async guard(fn) {
    this.error = '';
    try { await fn(); }
    catch (error) {
      this.error = error.message === 'Failed to fetch' ? '世界暂时连不上，请稍后重试。' : error.message;
      if (error.code === 'room_full') await this.load();
      if (this.invite && !this.session.id) await this.previewInvite();
    }
    this.refresh();
  }

  /* ───────── 登录与继续 ───────── */

  /** 已登录返回 true；否则记下目标并开始登录。只有一种登录方式时直接打开，保持在点击手势内 */
  needLogin(target) {
    if (this.signedIn) return false;
    this.target = target;
    this.pendingLogin = true;
    const providers = this.cfg?.providers || [];
    if (providers.length === 1) this.login(providers[0].id);
    else this.refresh();
    return true;
  }

  login(provider) {
    this.pendingLogin = false;
    const wanted = this.target;
    this.town.login(provider).then(async (ok) => {
      // 取消后最多 2 秒才结束轮询，这期间用户可能已经重新点了别的目标
      if (!ok) { if (this.target === wanted && !this.town.loginAttempt) this.target = null; this.refresh(); return; }
      const target = this.target;
      if (target) await this.guard(() => this.continueTarget(target));
      else this.refresh();
      this.shell.syncConn();
    }).catch((error) => { this.error = error.message; this.refresh(); });
    this.refresh();
  }

  /** 第一次登录：只确认公开昵称，其余都能以后再改 */
  askingName() {
    const town = this.town, me = town.identity?.characters.find((c) => c.id === town.char);
    return me && me.name === NEUTRAL_NAME && !this.app.storage.pref('named:' + town.account.id);
  }

  async continueTarget(target) {
    if (this.askingName()) { this.confirming = target; this.refresh(); return; }
    this.confirming = null;
    this.target = null;
    if (target.kind === 'public') await this.enterPublic(target.worldId);
    else if (target.kind === 'invite') await this.enterInvite(target.code);
  }

  async saveName(value) {
    const town = this.town, me = town.identity.characters.find((c) => c.id === town.char);
    const name = value.trim().slice(0, 16) || me.name;
    if (name !== me.name) {
      const { character } = await town.call('character', { me: me.id, name, kind: me.kind, look: me.look });
      Object.assign(me, character);
    }
    this.app.storage.pref('named:' + town.account.id, true);
    this.form.name = '';
  }

  async enterPublic(worldId) {
    if (this.needLogin({ kind: 'public', worldId })) return;
    if (this.app.worldDrafts.view.home) this.app.worldDrafts.view.close();
    const { sessionId } = await this.town.call('publicWorldEnter', { worldId });
    await this.session.enter(sessionId, {});
  }

  async enterInvite(code) {
    if (this.needLogin({ kind: 'invite', code })) return;
    const { sessionId } = await this.town.call('inviteRedeem', { code });
    await this.session.enter(sessionId, {});
    this.invite = null;
  }

  /** 进入场景后收起面板，让场景占满；顶部小条负责显示位置和回家 */
  entered() {
    this.shell.close();
    this.syncChip();
    if (!this.app.storage.pref('worldHinted')) {
      this.app.storage.pref('worldHinted', true);
      this.app.hud.toast('点地面走动，点物件互动，上方可以回家', 4200);
    }
  }

  /* ───────── 首次欢迎与场景内小条 ───────── */

  welcome() {
    if (this.app.storage.pref('welcomed') || this.shell.worldPanel.form.invite) return;
    const el = this.shell.el.coach;
    el.classList.add('rk-welcome');
    el.innerHTML = `<b>这间小屋可以直接逛</b>
      <p>点地面走动，点家具和角色互动。不用安装，也不用注册。</p>
      <div class="rk-row">${primary('welcome-stay', '先逛逛')}${btn('welcome-worlds', '去公共世界')}</div>
      <div class="rk-welcome-links"><a href="#" data-s="hub-welcome-edit">布置我的房间</a><a href="/guide" target="_blank" rel="noopener">创作指南</a><a href="/guide#install" target="_blank" rel="noopener">桌面版与 DSH</a></div>`;
    el.classList.add('on');
  }
  dismissWelcome() {
    this.app.storage.pref('welcomed', true);
    this.shell.el.coach.classList.remove('on');
  }

  syncChip() {
    const app = this.app, chip = this.shell.el.chip, session = this.session;
    const preview = app.worldDrafts?.view.home;
    let key = '';
    if (session?.id) key = 's|' + session.release.title + '|' + (session.connected ? session.state.status : 'sync') + '|' + (session.canAct ? 1 : 0);
    else if (preview) key = 'p|' + (app.world.scene.name || '');
    if (key === this._chipKey) return;
    this._chipKey = key;
    if (!key) { chip.classList.remove('on'); return; }
    if (session?.id) {
      const status = !session.connected ? '连接中' : session.state.status === 'paused' ? '暂停中' : session.canAct ? '手动模式' : '只读观看';
      chip.innerHTML = `<b>${esc(session.release.title)}</b><small>${status}</small><button class="rk-btn" data-s="world-leave">回家</button>`;
    } else {
      chip.innerHTML = `<b>${esc(app.world.scene.name || '世界')}</b><small>本机预览</small>${this.previewing ? primary('preview-enter', '进入') : ''}<button class="rk-btn" data-s="world-preview-close">回家</button>`;
    }
    chip.classList.add('on');
  }

  /* ───────── 页面 ───────── */

  rememberForm(body) {
    for (const input of body.querySelectorAll('[data-hub-field]')) this.form[input.dataset.hubField] = input.value;
  }

  renderWho() {
    const town = this.town, app = this.app;
    const saved = app.storage.failed ? '这个浏览器无法保存，当前只是临时体验' : '房间仅保存在此浏览器';
    if (this.signedIn) {
      const me = town.identity?.characters.find((c) => c.id === town.char);
      return `<div class="rk-hub-who"><span><b>${esc(town.account.name || town.account.login || '已登录')}</b><small>角色：${esc(me?.name || '')} · 手动模式 · ${saved}</small></span><a href="#" class="rk-link" data-s="town-logout">退出</a></div>`;
    }
    return `<div class="rk-hub-who"><span><b>游客</b><small>体验角色 · ${saved}</small></span></div>`;
  }

  renderLogin() {
    const town = this.town, providers = this.cfg?.providers || [];
    if (town.loginAttempt) {
      const link = town.loginAttempt.fallbackUrl;
      return `<div class="rk-hub-card"><b>在新窗口完成登录</b><div class="rk-hint">完成后会自动回到这里继续。</div><div class="rk-row">${link ? `<a class="rk-btn on" href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开登录页</a>` : ''}<button class="rk-btn" data-s="town-login-cancel">取消</button></div></div>`;
    }
    if (!this.pendingLogin) return '';
    if (!providers.length) return '<div class="rk-hint">这个站点还没有开放登录，可以继续以游客身份体验。</div>';
    return `<div class="rk-hub-card"><b>登录后继续</b><div class="rk-row">${providers.map((p) => primary('login', '用 ' + esc(p.label) + ' 登录', `data-id="${esc(p.id)}"`)).join('')}${btn('login-cancel', '取消')}</div></div>`;
  }

  renderConfirm() {
    if (!this.confirming || !this.signedIn) return '';
    const me = this.town.identity.characters.find((c) => c.id === this.town.char);
    return `<div class="rk-hub-card"><b>别人会怎么称呼你？</b><div class="rk-chat-bar"><input data-hub-field="name" maxlength="16" value="${esc(this.form.name ?? me?.name ?? '')}" aria-label="公开昵称">${primary('name-go', '进入')}</div><div class="rk-hint">只公开昵称，之后还能改。</div></div>`;
  }

  renderInvite() {
    if (!this.invite) return '';
    const preview = this.invite.preview;
    if (!preview) return `<div class="rk-hub-card"><b>收到一条邀请</b><div class="rk-hint">正在确认邀请…</div>${btn('invite-retry', '重试')}</div>`;
    const usable = preview.status === 'ok' || preview.status === 'mine';
    if (!usable) return `<div class="rk-hub-card"><b>这条邀请用不了</b><div class="rk-hint">${esc(INVITE_TEXT[preview.status] || '邀请不可用。')}</div>${btn('invite-dismiss', '返回世界')}</div>`;
    const { world } = preview;
    const until = preview.status === 'ok' ? ` · 有效至 ${new Date(preview.expiresAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
    return `<div class="rk-hub-card"><b>${esc(world.title)}</b><small>${world.host ? '房主 ' + esc(world.host) + ' · ' : ''}${world.online} / ${world.seats} 人在场${until}</small>
      <div class="rk-row">${primary('invite-enter', preview.status === 'mine' ? '回到房间' : '进入房间')}${btn('invite-dismiss', '先不去')}</div></div>`;
  }

  renderWorlds() {
    if (this.listError) return `<div class="rk-hint">${esc(this.listError)}，你的房间不受影响。</div>${btn('reload', '重试')}`;
    if (!this.loaded) return '<div class="rk-hint">正在读取公共世界…</div>';
    if (this.cfg?.open?.publicWorlds === false) return '<div class="rk-hint">公共世界暂未开放，可以继续在自己的房间里体验。</div>';
    if (!this.worlds.length) return '<div class="rk-hint">现在还没有开放的公共世界。</div>';
    return this.worlds.map((world) => {
      const full = world.status !== 'open';
      const state = world.status === 'closed' ? '暂未开放' : full ? '这场已满' : world.online ? `${world.online} 人在线` : '开放中';
      return `<article class="rk-world-card"><canvas width="240" height="120" data-thumb="${esc(world.worldId)}" aria-hidden="true"></canvas>
        <div><b>${esc(world.title)}</b><small>${state}</small></div>
        ${world.summary ? `<p>${esc(world.summary)}</p>` : ''}
        <div class="rk-row">${primary('enter', '进入', `data-id="${esc(world.worldId)}" ${full ? 'disabled' : ''}`)}${btn('preview', '先看看', `data-id="${esc(world.worldId)}"`)}</div></article>`;
    }).join('');
  }

  render() {
    const app = this.app, town = this.town, panel = this.shell.worldPanel;
    if (this.session?.id) return panel.renderSession();
    if (app.worldDrafts?.view.home) {
      return `<div class="rk-hub-card"><b>${esc(app.world.scene.name || '世界')}</b><div class="rk-hint">这是本机预览，别人看不到你，也不会加入真实场次。</div><div class="rk-row">${this.previewing ? primary('preview-enter', '进入') : ''}<button class="rk-btn" data-s="world-preview-close">回到自己的房间</button></div></div>`;
    }
    const closed = this.cfg?.open?.registration === false && !this.signedIn ? '<div class="rk-hint">暂未开放新账号注册，已有账号可以登录。</div>' : '';
    const offline = town?.error && !town.online ? `<div class="rk-hint">${esc(town.error)}，你的房间和布置不受影响。</div>${btn('reconnect', '重试')}` : '';
    const signIn = !this.signedIn && !town?.loginAttempt && !this.pendingLogin && (this.cfg?.providers || []).length ? `<div class="rk-row">${btn('sign-in', '登录')}</div>` : '';
    const last = app.storage.pref('worldLastSession');
    const resume = this.signedIn && last?.service === town.url ? btn('resume', '回到上次场次') : '';
    return `${this.renderWho()}${signIn}${closed}${this.renderLogin()}${this.renderConfirm()}${this.renderInvite()}
      ${this.error ? `<div class="rk-hint rk-hub-error">${esc(this.error)}</div>` : ''}${offline}
      ${resume ? `<div class="rk-row">${resume}</div>` : ''}
      <div class="rk-field">公共世界</div>${this.renderWorlds()}
      <details class="rk-hub-more"><summary>有朋友的邀请？</summary><div class="rk-chat-bar"><input data-hub-field="code" value="${esc(this.form.code || '')}" placeholder="粘贴邀请链接或邀请码" aria-label="邀请链接或邀请码">${btn('invite-paste', '查看')}</div></details>
      ${panel.renderExperiences()}
      <div class="rk-hub-foot"><a href="#" class="rk-link" data-s="hub-legacy">旧社区与世界创作</a><a class="rk-link" href="/guide" target="_blank" rel="noopener">创作指南</a></div>`;
  }

  afterRender(body) {
    for (const canvas of body.querySelectorAll('canvas[data-thumb]')) {
      const world = this.worlds.find(({ worldId }) => worldId === canvas.dataset.thumb);
      if (world) drawSceneThumb(canvas, world.preview);
    }
  }

  async action(action, element) {
    const { shell, town, app } = this;
    this.rememberForm(shell.el.body);
    const id = element?.dataset.id;
    switch (action) {
      case 'welcome-stay': this.dismissWelcome(); return;
      case 'welcome-worlds': this.dismissWelcome(); shell.open('social'); return;
      case 'welcome-edit': this.dismissWelcome(); shell.open('edit'); return;
      case 'legacy': shell.open('legacy'); return;
      case 'reload': await this.load(); return;
      case 'reconnect': await town.connect(); await this.load(); return;
      case 'sign-in': this.pendingLogin = true; if ((this.cfg?.providers || []).length === 1) this.login(this.cfg.providers[0].id); else this.refresh(); return;
      case 'login': this.login(id); return;
      case 'login-cancel': this.pendingLogin = false; this.target = null; this.refresh(); return;
      case 'enter': await this.guard(() => this.enterPublic(id)); return;
      case 'preview': await this.guard(async () => {
        const { release } = await town.call('publicWorldGet', { worldId: id });
        this.previewing = id;
        await app.worldDrafts.preview(release);
      }); return;
      case 'preview-enter': await this.guard(() => this.enterPublic(this.previewing)); return;
      case 'name-go': await this.guard(async () => {
        await this.saveName(this.form.name || '');
        await this.continueTarget(this.confirming);
      }); return;
      case 'invite-enter': await this.guard(() => this.enterInvite(this.invite.code)); return;
      case 'invite-retry': await this.previewInvite(); return;
      case 'invite-dismiss': this.invite = null; this.target = null; this.refresh(); return;
      case 'invite-paste': await this.guard(async () => {
        const { code, service } = readInvite(this.form.code || '');
        if (service && service !== location.origin) throw new Error(`这条邀请来自另一个服务（${service}），请在对应的站点打开。`);
        this.form.code = '';
        this.invite = { code, preview: null };
        await this.previewInvite();
      }); return;
      case 'resume': await this.guard(async () => {
        const last = app.storage.pref('worldLastSession');
        await this.session.enter(last.sessionId, {});
      }); return;
    }
  }
}
