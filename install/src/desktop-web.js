import { homeView } from './home-view.js';

const el = document.getElementById('room');
const host = window.roomkitHome;
const desk = new URLSearchParams(location.search).get('desk') === '1';
const notice = document.createElement('span');

function report(error) {
  notice.textContent = error.message || '桌面房间暂不可用';
  if (desk) window.room?.hud?.toast(notice.textContent);
}

async function unwrap(pending) {
  const result = await pending;
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'DSH 暂未响应'), { code: result?.code });
  return result.data;
}

async function start() {
  if (!host || !window.RoomKit) throw new Error('没有连上 DSH 宿主');
  const view = crypto.randomUUID();
  const claim = await unwrap(host.claim({ view }));
  let transfer, model = {};
  const home = homeView({
    claim, view, localStore: window.RoomKit.localStore, onError: report,
    send(method, input) { return unwrap(method === 'save' ? host.save(input) : transfer(input)); },
  });
  const refreshModel = () => unwrap(host.model(home.identity)).then(value => { model = value; }).catch(() => { model = {}; });
  void refreshModel();
  setInterval(refreshModel, 4000);
  if (desk) document.documentElement.classList.add('desk');
  else {
    const bar = document.createElement('nav');
    bar.style.cssText = 'position:fixed;inset:0 0 auto;height:36px;display:flex;align-items:center;gap:12px;padding:0 12px;color:#eef5ff;font:13px system-ui';
    const button = document.createElement('button');
    button.textContent = '回到 DSH';
    button.onclick = () => unwrap(host.returnHome()).catch(report);
    bar.append(button, notice);
    el.before(bar);
    el.style.top = '36px';
  }
  el.replaceChildren();
  const app = window.RoomKit.mount(el, {
    ...home.options, desk, coach: false, bridge: false,
    ext: {
      desk: desk ? window.roomkitDesk : undefined,
      openFull: desk ? () => window.roomkitDesk.openFull() : undefined,
      chatStatus: () => model.available ? '模型：' + model.model : '未连接宿主模型，可手动互动和使用离线台词',
      async chat(request) {
        const result = await unwrap(host.chat({ ...home.identity, chat: request }));
        return result.ok ? { text: result.text } : { error: result.error };
      },
    },
  });
  window.room = app;
  home.attach(app);
  host.onPrepare(async (action, send) => {
    transfer = send;
    try { await home.handoff(action, () => unwrap(host.cancelModel(home.identity))); }
    catch (error) {
      try { await unwrap(host.model(home.identity)); home.resume(); }
      catch { throw Object.assign(new Error('桌面已失去房间编辑权，请在 DSH 重新打开'), { code: 'lost' }); }
      report(error);
      throw error;
    }
    finally { transfer = null; }
  });
  await app.packsReady;
  host.ready();
}

start().catch(error => { el.textContent = error.message || '桌面房间暂时未能打开'; });
