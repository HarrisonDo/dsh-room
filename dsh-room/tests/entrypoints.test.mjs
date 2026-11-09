import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { apply as applyHost } from '../lib/index.js';

const root = new URL('../', import.meta.url);
test('桌面宿主给出本机 Web 预览地址，不携带认证凭据', () => {
  const routes = [];
  applyHost({ effect: fn => fn(), webServer: { register: route => { routes.push(route); return () => {}; } } });
  const info = routes.find(r => r.path === '/plugins/dsh-room/api/info');
  let body;
  info.handler({ method: 'GET', headers: { host: '127.0.0.1:3080' }, socket: { localPort: 3080 } }, { writeHead() {}, end: value => { body = value; } });
  assert.deepEqual(JSON.parse(body), { name: 'dsh-room', webUrl: 'http://127.0.0.1:3080/plugins/dsh-room/web/' });
});
test('发布包包含可解析的中文名称、图标和所有网页脚本', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const require = createRequire(new URL('package.json', root));
  const locale = JSON.parse(await readFile(require.resolve('dsh-room/locale/zh.json'), 'utf8'));
  assert.equal(locale.meta.title, '大肥鱼的房间');
  assert.ok((await readFile(new URL(manifest.icon, root))).length < 256 * 1024);
  const html = await readFile(new URL('web/index.html', root), 'utf8');
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) await readFile(new URL('web/' + src, root));
  assert.ok(!html.includes('type="module"'), 'file:// 双击入口不依赖跨源 ES 模块');
});

for (const sidebar of [false, true]) {
  test(`DSH ${sidebar ? '有' : '无'}侧栏时，常驻入口和插件页都注册`, async () => {
    let registration;
    const window = { addEventListener() {}, removeEventListener() {}, __ModuleLoader__: { load: info => { registration = info; } } };
    vm.runInNewContext(await readFile(new URL('lib/client.js', root), 'utf8'), { window, console, setTimeout, clearTimeout, TextEncoder, crypto: webcrypto });
    assert.equal(registration.id, 'dsh-room');
    const jsx = (type, props) => ({ type, props });
    const plugin = registration.factory(id => {
      if (id === 'react') return { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useRef: () => ({ current: null }) };
      if (id === 'react/jsx-runtime') return { jsx };
      throw new Error('意外的运行依赖：' + id);
    });
    const entries = [];
    const navigation = [];
    const ctx = {
      get(name) {
        if (name === 'layout') return { selectPanel: panel => navigation.push({ panel }) };
        if (name === 'sidebarRight') return { openTab: tab => navigation.push({ tab }) };
      }, provide() {}, effect: fn => fn(),
      slots: {
        inject(name, fn) { const value = fn(); if (value && value[Symbol.iterator]) [...value]; },
        register(options, component) { entries.push({ ...options, component }); return () => {}; },
      },
      inject(names, fn) { if (sidebar) fn({ ...ctx, sidebarRightTabs: { register: () => () => {} } }); },
    };
    plugin.apply(ctx);
    assert.ok(entries.some(e => e.name === 'settings.plugins.tab' && e.id === 'dsh-room'));
    assert.ok(entries.some(e => e.name === 'plugins.tab' && e.id === 'dsh-room'));
    assert.ok(entries.some(e => e.name === 'plugins.bundle.config' && e.key === 'dsh-room'));
    const overlay = entries.find(e => e.name === 'shell.overlay');
    assert.ok(overlay, '有侧栏也必须注册悬浮入口');
    const vnode = overlay.component();
    const view = vnode.type(vnode.props);
    assert.equal(view.props['aria-label'], '大肥鱼的房间小窗');
    assert.equal(entries.some(e => e.key === 'dsh-room-tab'), sidebar);
    const entry = entries.find(e => e.name === 'plugins.tab').component();
    const page = entry.type(entry.props);
    page.props.children[2].props.children[1].props.onClick();
    assert.deepEqual(navigation, sidebar ? [{ panel: null }, { tab: 'dsh-room' }] : [], '从插件页打开侧栏时先返回会话工作区；没有侧栏则全屏降级');
  });
}
