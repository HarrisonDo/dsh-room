/**
 * AI 小镇登录：GitHub、linux.do（OAuth2 授权码）；本机开发另有 dev 登录。
 *
 * 流程（页面和小镇不同源，DSH 桌面版里弹窗也未必有 opener，所以用轮询，不用 postMessage）：
 *   1. 页面生成一次性 nonce（32 字节随机），打开 {town}/auth/{provider}/start?nonce=…
 *   2. 小镇记下 state → nonce，跳到服务商授权页（带 PKCE）
 *   3. 回调：校验 state，换 token，取用户信息 → 建或更新账号 → 发会话令牌，挂在 nonce 下
 *   4. 页面轮询 POST /api/authPoll { nonce }，拿到令牌（只给一次），之后请求带 Authorization: Bearer
 *
 * 服务器只存令牌的 sha256；服务商的 access token 用完即丢，不保存。
 *
 * 环境变量：TOWN_PUBLIC_URL（回调用的公网地址，如 https://town.example.com；设了公网地址就不允许原型身份）
 *           GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 *           LINUXDO_CLIENT_ID / LINUXDO_CLIENT_SECRET / LINUXDO_MIN_TRUST（最低信任等级，默认 0）
 *           TOWN_DEV_LOGIN=1（只在本机地址下生效：随便填个名字就能登录，测试用）
 *           TOWN_REGISTRATION=0（暂停新账号注册；已有账号照常登录）
 */
import crypto from 'node:crypto';

const STATE_MS = 10 * 60 * 1000;
export const SESSION_MS = 30 * 86400000;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const PROVIDERS = {
  github: {
    label: 'GitHub', prefix: 'gh',
    authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', user: 'https://api.github.com/user',
    scope: 'read:user',
    profile: (u) => ({ uid: String(u.id), login: u.login, name: u.name || u.login, avatar: u.avatar_url || '' }),
  },
  linuxdo: {
    label: 'linux.do', prefix: 'ld',
    authorize: 'https://connect.linux.do/oauth2/authorize', token: 'https://connect.linux.do/oauth2/token', user: 'https://connect.linux.do/api/user',
    scope: 'openid profile',
    profile: (u) => ({ uid: String(u.id != null ? u.id : u.sub), login: u.username || u.login, name: u.name || u.username || u.login, avatar: u.avatar_url || '', trust: u.trust_level, active: u.active, silenced: u.silenced }),
  },
};

export function authConfig(env = process.env) {
  const publicUrl = String(env.TOWN_PUBLIC_URL || '').replace(/\/+$/, '');
  const local = !publicUrl || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(publicUrl);
  const providers = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.github = { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET };
  if (env.LINUXDO_CLIENT_ID && env.LINUXDO_CLIENT_SECRET) providers.linuxdo = { id: env.LINUXDO_CLIENT_ID, secret: env.LINUXDO_CLIENT_SECRET, minTrust: Number(env.LINUXDO_MIN_TRUST) || 0 };
  if (env.TOWN_DEV_LOGIN === '1' && local) providers.dev = {};
  return {
    publicUrl, providers,
    // 没配任何登录方式时，沿用原型的 id + key 身份（只适合本机）
    // 公网地址上永远不开（忘了配登录也不会变成谁都能冒充）
    legacy: local && (env.TOWN_LEGACY ? env.TOWN_LEGACY === '1' : !Object.keys(providers).length),
    owners: String(env.TOWN_OWNER || '').split(',').map((s) => s.trim()).filter(Boolean),
    registration: env.TOWN_REGISTRATION !== '0',
  };
}

/**
 * auth.start(provider, nonce, base) → 跳转地址；auth.callback(provider, query) → { html }；auth.poll(nonce) → { token } | null
 * accounts.upsert(provider, profile) → account；sessions.create(account) → token
 */
export function createAuth({ config, store, onAccount, fetchImpl, now = Date.now }) {
  fetchImpl = fetchImpl || globalThis.fetch;
  const pending = new Map();    // state → { provider, nonce, verifier, t }
  const done = new Map();       // nonce → { token, t } | { error, t }
  const sweep = () => { const t = now(); for (const m of [pending, done]) for (const [k, v] of m) if (t - v.t > STATE_MS) m.delete(k); };
  const callbackUrl = (provider, base) => (config.publicUrl || base) + '/auth/' + provider + '/callback';

  function finish(nonce, account) {
    const token = b64url(crypto.randomBytes(32));
    store.createSession(hashToken(token), account.id, now() + SESSION_MS);
    done.set(nonce, { token, t: now() });
  }
  const page = (title, msg) => ({ html: `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font:15px system-ui;padding:40px;text-align:center"><h2>${esc(title)}</h2><p>${esc(msg)}</p><script>setTimeout(()=>window.close(),1500)</script>` });
  const fail = (nonce, msg) => { if (nonce) done.set(nonce, { error: msg, t: now() }); return page('登录没有成功', msg); };

  return {
    providers: () => Object.keys(config.providers).map((id) => ({ id, label: id === 'dev' ? '本机测试登录' : PROVIDERS[id].label })),

    start(provider, nonce, base) {
      sweep();
      if (!config.providers[provider]) throw Object.assign(new Error('没有开启这种登录方式'), { code: 404 });
      if (!/^[A-Za-z0-9_-]{32,64}$/.test(nonce || '')) throw Object.assign(new Error('nonce 不合法'), { code: 400 });
      const state = b64url(crypto.randomBytes(24));
      if (provider === 'dev') { pending.set(state, { provider, nonce, t: now() }); return { html: devForm(state) }; }
      const verifier = b64url(crypto.randomBytes(32));
      pending.set(state, { provider, nonce, verifier, t: now() });
      const P = PROVIDERS[provider], c = config.providers[provider];
      const q = new URLSearchParams({ client_id: c.id, redirect_uri: callbackUrl(provider, base), response_type: 'code', scope: P.scope, state, code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
      return { redirect: P.authorize + '?' + q };
    },

    async callback(provider, query, base) {
      const st = pending.get(String(query.get('state') || ''));
      if (!st || st.provider !== provider || now() - st.t > STATE_MS) return page('登录没有成功', '登录链接过期了，回到房间重新点登录');
      pending.delete(query.get('state'));
      try {
        let profile;
        if (provider === 'dev') {
          const name = String(query.get('name') || '').trim().slice(0, 16);
          if (!name) return fail(st.nonce, '名字不能为空');
          profile = { uid: name, login: name, name, avatar: '' };
        } else {
          if (query.get('error')) return fail(st.nonce, '你取消了授权');
          const P = PROVIDERS[provider], c = config.providers[provider];
          const tr = await fetchImpl(P.token, {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'authorization_code', code: String(query.get('code') || ''), redirect_uri: callbackUrl(provider, base), client_id: c.id, client_secret: c.secret, code_verifier: st.verifier }),
            signal: AbortSignal.timeout(10000),
          });
          const tok = await tr.json().catch(() => ({}));
          if (!tr.ok || !tok.access_token) return fail(st.nonce, '服务商没有给出授权（' + (tok.error || tr.status) + '）');
          const ur = await fetchImpl(P.user, { headers: { authorization: 'Bearer ' + tok.access_token, accept: 'application/json', 'user-agent': 'dsh-room-town' }, signal: AbortSignal.timeout(10000) });
          if (!ur.ok) return fail(st.nonce, '取不到账号信息（' + ur.status + '）');
          profile = P.profile(await ur.json());
          if (!profile.uid || profile.uid === 'undefined') return fail(st.nonce, '账号信息不完整');
          if (provider === 'linuxdo') {
            if (profile.active === false || profile.silenced) return fail(st.nonce, 'linux.do 账号未激活或被禁言');
            if ((profile.trust || 0) < c.minTrust) return fail(st.nonce, `需要 linux.do 信任等级 ${c.minTrust} 以上`);
          }
        }
        const id = (provider === 'dev' ? 'dev' : PROVIDERS[provider].prefix) + ':' + profile.uid;
        if (config.registration === false && !store.account(id)) return fail(st.nonce, '暂未开放新账号注册，已有账号可以照常登录');
        const account = store.upsertAccount({ id, provider, login: profile.login, name: profile.name, avatar: profile.avatar });
        if (onAccount) onAccount(account);
        finish(st.nonce, account);
        return page('登录成功', '可以关掉这个窗口，回到房间了');
      } catch (e) {
        return fail(st.nonce, '登录出错：' + (e.message || e));
      }
    },

    poll(nonce) {
      sweep();
      const d = done.get(String(nonce || ''));
      if (!d) return null;
      done.delete(nonce);
      return d;
    },
  };
}

function devForm(state) {
  return `<!doctype html><meta charset="utf-8"><title>本机测试登录</title><body style="font:15px system-ui;padding:40px;text-align:center">
<h2>本机测试登录</h2><p>只在本机开发时可用。填个名字就会建一个测试账号。</p>
<form action="callback" method="get"><input type="hidden" name="state" value="${esc(state)}"><input name="name" maxlength="16" autofocus placeholder="名字"> <button>登录</button></form>`;
}
