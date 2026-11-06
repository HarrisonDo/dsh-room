/**
 * RoomKit 纯逻辑单测（无 DOM）：node --test tests/
 * 覆盖：等距投影与朝向、场景编辑与逆操作（撤销）、摆放校验、寻路、深度排序、时段插值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Iso, orient } from '../web/roomkit/iso.js';
import { Catalog } from '../web/roomkit/catalog.js';
import { World, resizeCells } from '../web/roomkit/scene.js';
import { Nav } from '../web/roomkit/nav.js';
import { depthSort } from '../web/roomkit/depth.js';
import { envAt } from '../web/roomkit/env.js';

const catalog = () => new Catalog().addAll([
  { id: 'box2x1', size: [2, 1], height: 60, art: { kind: 'proc', parts: [] }, slots: [{ id: 's', at: [1, 1.5], face: [0, 1] }] },
  { id: 'rug', size: [3, 3], mount: 'flat', art: { kind: 'proc', parts: [] } },
  { id: 'pic', mount: 'wall', wsize: [1, 80], wz: 100, art: { kind: 'wall', draw: 'frame' } },
  { id: 'spr', size: [2, 1], height: 80, art: { kind: 'sprite', src: 'x.webp' } },
]);
const scene = (extra) => Object.assign({ room: { w: 6, h: 5 }, objects: [], agents: [] }, extra);

test('等距投影：世界↔格子互逆，2:1', () => {
  const iso = new Iso(64, 32);
  const p = iso.toWorld(3, 2);
  assert.deepEqual(p, { x: 64, y: 160 });
  const t = iso.toTile(p.x, p.y);
  assert.ok(Math.abs(t.x - 3) < 1e-9 && Math.abs(t.y - 2) < 1e-9);
});

test('朝向：四向旋转把占格映射回自身边界，正面方向依次转向', () => {
  const fronts = [];
  for (let r = 0; r < 4; r++) {
    const o = orient([2, 1], r, 'rot4');
    for (const [x, y] of [[0, 0], [2, 0], [0, 1], [2, 1]]) {
      const [mx, my] = o.map(x, y);
      assert.ok(mx >= -1e-9 && mx <= o.w + 1e-9 && my >= -1e-9 && my <= o.h + 1e-9, `rot${r} 越界 ${mx},${my}`);
    }
    fronts.push(o.dir(0, 1).join(','));
    // localFace 与 dir 互逆（+0 归一：旋转会产生 −0）
    for (const wf of ['px', 'py']) {
      const lf = o.localFace(wf);
      const d = o.dir(...{ px: [1, 0], nx: [-1, 0], py: [0, 1], ny: [0, -1] }[lf]);
      assert.deepEqual(d.map((v) => v + 0), wf === 'px' ? [1, 0] : [0, 1]);
    }
  }
  assert.deepEqual(fronts, ['0,1', '1,0', '0,-1', '-1,0']);
  const m = orient([2, 1], 1, 'mirror');
  assert.equal(m.mirror, true);
  assert.deepEqual([m.w, m.h], [1, 2]);
});

test('编辑：每个 op 的逆 op 能还原（撤销基础）', () => {
  const w = new World(catalog(), scene());
  const snap = () => JSON.stringify(w.toJSON());
  const s0 = snap();
  const inv1 = w.apply({ t: 'add', obj: { id: 'a', def: 'box2x1', x: 1, y: 1 } });
  const inv2 = w.apply({ t: 'set', id: 'a', patch: { x: 3, rot: 1 } });
  const inv3 = w.apply({ t: 'room', patch: { w: 8, cells: resizeCells(w.room, 8, 5) } });
  const inv4 = w.apply({ t: 'batch', ops: [{ t: 'agent.add', agent: { id: 'z', name: 'Z' } }, { t: 'state', id: 'a', patch: { on: true } }] });
  assert.equal(w.objects[0].x, 3);
  assert.equal(w.room.w, 8);
  assert.equal(w.scene.agents.length, 1);
  [inv4, inv3, inv2, inv1].forEach((inv) => w.apply(inv));
  assert.equal(snap(), s0);
});

test('摆放：越界、重叠、地毯可叠、镂空格不能放', () => {
  const w = new World(catalog(), scene({ room: { w: 6, h: 5, cells: ['aaaaaa', 'aaaaaa', 'aa..aa', 'aaaaaa', 'aaaaaa'] } }));
  assert.equal(w.canPlace('box2x1', 5, 0, 0).ok, false, '越界');
  assert.equal(w.canPlace('box2x1', 2, 2, 0).ok, false, '镂空');
  assert.equal(w.canPlace('box2x1', 0, 0, 0).ok, true);
  w.apply({ t: 'add', obj: { id: 'a', def: 'box2x1', x: 0, y: 0 } });
  assert.equal(w.canPlace('box2x1', 1, 0, 0).ok, false, '重叠');
  assert.equal(w.canPlace('box2x1', 1, 0, 0, 'a').ok, true, '忽略自身');
  assert.equal(w.canPlace('rug', 0, 0, 0).ok, false, '地毯也不能压在镂空上');
  assert.equal(w.canPlace('rug', 0, 3, 0).ok, false, '地毯越界');
  assert.equal(w.canPlace('box2x1', 0, 0, 1).ok, false, '转 90° 后变 1×2 与自身原位重叠');
  assert.equal(w.canPlaceWall('pic', 'right', 0.5, 100).ok, true);
  w.apply({ t: 'add', obj: { id: 'p', def: 'pic', wall: 'right', at: 0.5, z: 100 } });
  assert.equal(w.canPlaceWall('pic', 'right', 1.0, 120).ok, false, '墙饰重叠');
  assert.equal(w.canPlaceWall('pic', 'right', 5.8, 100).ok, false, '超出墙面');
});

test('交互位：随旋转变换位置与朝向', () => {
  const w = new World(catalog(), scene());
  w.apply({ t: 'add', obj: { id: 'a', def: 'box2x1', x: 1, y: 1, rot: 1 } });
  const sp = w.slotPose(w.byId.get('a'), w.def(w.byId.get('a')).slots[0]);
  // rot1：(x,y)→(y, w−x)，at (1,1.5) → (1.5, 1)；正面 (0,1) → (1,0)
  assert.deepEqual([sp.x, sp.y], [2.5, 2]);
  assert.deepEqual(sp.face.map((v) => v + 0), [1, 0]);
});

test('寻路：绕开家具、不切角、走不到时返回 null', () => {
  const w = new World(catalog(), scene({ room: { w: 6, h: 5 } }));
  w.apply({ t: 'add', obj: { id: 'a', def: 'box2x1', x: 2, y: 0 } });
  w.apply({ t: 'add', obj: { id: 'b', def: 'box2x1', x: 2, y: 1, rot: 0 } });
  w.apply({ t: 'add', obj: { id: 'c', def: 'box2x1', x: 2, y: 2 } });
  const nav = new Nav(w);
  const p = nav.path({ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 });
  assert.ok(p && p.length >= 2);
  for (let i = 1; i < p.length; i++) assert.ok(nav.los(p[i - 1], p[i], 0.05), '相邻路点之间畅通');
  assert.ok(p.some((q) => q.y > 3), '必须从下方绕过去');
  // 把下面也堵死 → 走不到
  w.apply({ t: 'add', obj: { id: 'd', def: 'box2x1', x: 2, y: 3 } });
  w.apply({ t: 'add', obj: { id: 'e', def: 'box2x1', x: 2, y: 4 } });
  assert.equal(nav.path({ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }), null);
  // 版本号变了才重建
  assert.equal(nav.freeAt(2.5, 0.5), false);
});

test('深度排序：沿轴分离的在后；角色指定 after 时画在家具之后', () => {
  const iso = new Iso(64, 32);
  const item = (id, x0, y0, x1, y1, z0, z1, extra) => Object.assign({ id, x0, y0, x1, y1, z0, z1 }, iso.boxRect(x0, y0, x1, y1, z0, z1), extra);
  const back = item('back', 0, 0, 2, 1, 0, 60), front = item('front', 0, 1, 2, 2, 0, 60);
  assert.deepEqual(depthSort([front, back]).map((i) => i.id), ['back', 'front']);
  const bed = item('bed', 0, 0, 2, 2, 0, 80);
  const agent = item('agent', 0.8, 0.8, 1.2, 1.2, 38, 100, { after: 'bed' });
  assert.deepEqual(depthSort([agent, bed]).map((i) => i.id), ['bed', 'agent']);
  const agentBack = item('agent', 0.8, 0.8, 1.2, 1.2, 0, 60, { before: 'bed' });
  assert.deepEqual(depthSort([bed, agentBack]).map((i) => i.id), ['agent', 'bed']);
});

test('时段：深夜是夜，正午不暗，雨天更暗', () => {
  assert.equal(envAt(3, 'clear').id, 'night');
  assert.equal(envAt(3, 'clear').night, true);
  const noon = envAt(12, 'clear');
  assert.equal(noon.id, 'noon');
  assert.equal(noon.dark, 0);
  assert.ok(envAt(12, 'rain').dark > noon.dark);
  assert.equal(envAt(23.9, 'clear').id, envAt(0.1, 'clear').id, '跨午夜连续');
});

test('存档：临时角色（会话同伴）不进存档', () => {
  const w = new World(catalog(), scene());
  w.apply({ t: 'agent.add', agent: { id: 'keep', name: 'A' } });
  w.apply({ t: 'agent.add', agent: { id: 'tmp', name: 'B', ephemeral: true } });
  assert.deepEqual(w.toJSON().agents.map((a) => a.id), ['keep']);
  assert.equal(w.scene.agents.length, 2);
});
