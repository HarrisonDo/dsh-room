import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultHome, normalizeHome, Home } from '../web/roomkit/home.js';
import { parseActs } from '../web/roomkit/shell.js';

const door = { id: 'door', portal: true };
const pack = {
  id: 'default', name: '家',
  scenes: [
    { id: 'home', name: '卧室模板', objects: [{ id: 'd1', def: 'door', wall: 'right', at: 6, state: {} }], agents: [] },
    { id: 'living', name: '客厅模板', objects: [{ id: 'd2', def: 'door', wall: 'left', at: 5, state: {} }], agents: [] },
  ],
  home: { name: '大肥鱼的家', floors: ['2F', '1F'], rooms: [{ id: 'home', name: '卧室', floor: '2F', tpl: 'home' }, { id: 'living', name: '客厅', floor: '1F', tpl: 'living' }] },
};
function fakeApp(saved = {}, prefs = {}) {
  const scenes = new Map(Object.entries(saved));
  return {
    packs: [pack], catalog: { get: (id) => (id === 'door' ? door : null) }, world: { scene: { id: 'home', objects: [] }, apply() {} },
    storage: {
      pref(k, v) { if (v === undefined) return prefs[k]; prefs[k] = v; return v; },
      list: () => [...scenes.values()].map((s) => ({ id: s.id, name: s.name })),
      load: (id) => scenes.get(id) || null,
      save: (s) => scenes.set(s.id, s),
    },
    scenes, prefs,
  };
}

test('家：内容包声明的默认家，楼层从上到下，模板补上包 id', () => {
  const h = defaultHome([pack]);
  assert.deepEqual(h.floors, ['2F', '1F']);
  assert.equal(h.rooms[1].tpl, 'default|living');
  assert.equal(h.follow, true);
});

test('家：没声明时把模板都放进 1F；坏数据被过滤', () => {
  const h = defaultHome([{ id: 'p', scenes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }]);
  assert.deepEqual(h.rooms.map((r) => [r.id, r.floor]), [['a', '1F'], ['b', '1F']]);
  const n = normalizeHome({ rooms: [{ id: 'x' }, { id: 'x' }, null, { id: 'y', floor: '这个楼层名字实在太长了' }], floors: [1, '3F'] });
  assert.deepEqual(n.rooms.map((r) => r.id), ['x', 'y']);
  assert.equal(n.rooms[1].floor, '1F');
  assert.deepEqual(n.floors, ['3F', '1F']);
});

test('家：房间存档优先，没存过按模板现生成，用房间自己的 id 和名字', () => {
  const app = fakeApp({ home: { id: 'home', name: '我的卧室', format: 'roomkit.scene' } });
  const home = new Home(app);
  assert.equal(home.sceneFor('home').name, '我的卧室');
  const s = home.sceneFor('living');
  assert.deepEqual([s.id, s.name, s.template], ['living', '客厅', 'living']);
  s.objects[0].state.to = 'x';
  assert.equal(pack.scenes[1].objects[0].state.to, undefined, '生成的是副本，不改模板');
  assert.equal(home.sceneFor('nope'), null);
  assert.ok(app.prefs.home, '第一次创建就存下来');
});

test('家：老存档里从模板建的场景被认领，不重复生成', () => {
  const app = fakeApp({ sceneabc: { id: 'sceneabc', name: '老客厅', template: 'living' } });
  const home = new Home(app);
  assert.equal(home.room('living'), null);
  assert.deepEqual([home.room('sceneabc').name, home.room('sceneabc').floor], ['老客厅', '1F']);
});

test('家：数字键顺序按楼层；增删改；新楼层自动加入', () => {
  const home = new Home(fakeApp());
  assert.deepEqual(home.ordered().map((r) => r.id), ['home', 'living']);
  assert.equal(home.add({ id: 'yard', name: '小院' }, '户外'), true);
  assert.equal(home.add({ id: 'yard', name: '小院' }, '户外'), false);
  assert.deepEqual(home.byFloor().map((g) => g.floor), ['2F', '1F', '户外']);
  home.rename('yard', '后院');
  home.setFloor('yard', '1F');
  assert.deepEqual(home.ordered().map((r) => r.name), ['卧室', '客厅', '后院']);
  home.remove('yard');
  assert.equal(home.has('yard'), false);
});

test('家：门连回来——目标房间第一扇空门接上，已经连着就不动', () => {
  const app = fakeApp();
  const home = new Home(app);
  home.linkBack('living', 'home');
  assert.equal(app.scenes.get('living').objects[0].state.to, 'home');
  const again = app.scenes.get('living');
  home.linkBack('living', 'yard');
  assert.equal(again.objects[0].state.to, 'home', '没有空门了，不抢已经连好的门');
});

test('动作标记：从回复里剥掉，正文不留痕迹', () => {
  assert.deepEqual(parseActs('好呀~ [[sleep]]'), { text: '好呀~', acts: ['sleep'] });
  assert.deepEqual(parseActs('[[goto:冰箱]]我去看看 [[emote:heart]]'), { text: '我去看看', acts: ['goto:冰箱', 'emote:heart'] });
  assert.deepEqual(parseActs('没有动作'), { text: '没有动作', acts: [] });
});

test('家：包里新加的房间只搬进来一次，已有房间补上通往它的门', () => {
  const doorDef = { id: 'door', portal: true, wsize: [1, 200], wz: 0 };
  const pk = {
    id: 'default', name: '家',
    scenes: [
      { id: 'home', objects: [], agents: [] },
      { id: 'living', objects: [{ id: 'd1', def: 'door', wall: 'left', at: 5, state: { to: 'home' } }, { id: 'd2', def: 'door', wall: 'right', at: 7.5, state: { to: 'kitchen' } }], agents: [] },
      { id: 'kitchen', objects: [], agents: [] },
    ],
    home: { floors: ['2F', '1F'], rooms: [{ id: 'home', name: '卧室', floor: '2F', tpl: 'home' }, { id: 'living', name: '客厅', floor: '1F', tpl: 'living' }, { id: 'kitchen', name: '厨房', floor: '1F', tpl: 'kitchen' }] },
  };
  const living = { id: 'living', room: { w: 9, h: 7, walls: { left: true, right: true } }, objects: [{ id: 'd1', def: 'door', wall: 'left', at: 5, state: { to: 'home' } }] };
  const app = fakeApp({ living }, { home: { v: 1, name: '老家', floors: ['2F', '1F'], rooms: [{ id: 'home', floor: '2F', tpl: 'default|home' }, { id: 'living', floor: '1F', tpl: 'default|living' }] } });
  app.packs = [pk];
  app.catalog = { get: (id) => (id === 'door' ? doorDef : null) };
  const home = new Home(app);
  assert.deepEqual(home.rooms().map((r) => r.id), ['home', 'living', 'kitchen']);
  assert.deepEqual(app.prefs.home.seen, ['default|home', 'default|living', 'default|kitchen']);
  assert.ok(app.scenes.get('living').objects.some((o) => o.id === 'd2' && o.state.to === 'kitchen'), '客厅补上了去厨房的门');

  // 用户把厨房移出家：下次打开不会再搬回来，门也不会重复补
  home.remove('kitchen');
  const again = new Home(app);
  assert.equal(again.has('kitchen'), false);
  assert.equal(app.scenes.get('living').objects.filter((o) => o.id === 'd2').length, 1);
});

test('家：补门时位置被墙饰占了、墙不够长就不补', () => {
  const doorDef = { id: 'door', portal: true, wsize: [1, 200], wz: 0 }, frameDef = { id: 'frame', wsize: [1, 80], wz: 60 };
  const pk = {
    id: 'default', name: '家',
    scenes: [{ id: 'a', objects: [{ id: 'd', def: 'door', wall: 'right', at: 3, state: { to: 'b' } }] }, { id: 'b', objects: [] }],
    home: { rooms: [{ id: 'a', tpl: 'a' }, { id: 'b', tpl: 'b' }] },
  };
  const blocked = { id: 'a', room: { w: 8, h: 6, walls: { left: true, right: true } }, objects: [{ id: 'f', def: 'frame', wall: 'right', at: 3.2 }] };
  const app = fakeApp({ a: blocked }, { home: { rooms: [{ id: 'a', tpl: 'default|a' }] } });
  app.packs = [pk];
  app.catalog = { get: (id) => (id === 'door' ? doorDef : id === 'frame' ? frameDef : null) };
  new Home(app);
  assert.equal(app.scenes.get('a').objects.length, 1);
  const short = { id: 'a', room: { w: 3, h: 6, walls: { left: true, right: true } }, objects: [] };
  const app2 = fakeApp({ a: short }, { home: { rooms: [{ id: 'a', tpl: 'default|a' }] } });
  app2.packs = [pk];
  app2.catalog = app.catalog;
  new Home(app2);
  assert.equal(app2.scenes.get('a').objects.length, 0);
});
