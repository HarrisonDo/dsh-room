/* 中性示例只使用程序绘制的道具。信标和出口沿用共享活动的交互规则。 */
(function () {
  const id = 'roomkit-example';
  const beacon = id + '/beacon';
  const gate = id + '/gate';
  window.RoomKitPacks = [{
    id, name: '示例道具', author: 'RoomKit', license: 'AGPL-3.0-only', version: '1.0.0',
    furniture: [
      {
        id: beacon, name: '信标', mount: 'floor', size: [1, 1], height: 44,
        art: { kind: 'proc', parts: [{ t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.23, h: 44, c: '#438ca2' }] },
        slots: [{ id: 'use', at: [0.5, 1.5], face: [0, -1] }],
        states: { on: false }, light: { when: 'on', z: 44 },
      },
      {
        id: gate, name: '出口', mount: 'floor', size: [1, 1], height: 68,
        art: { kind: 'proc', parts: [{ t: 'box', x: 0.15, y: 0.35, z: 0, w: 0.7, d: 0.3, h: 68, c: '#92775a', when: '!open' }] },
        slots: [{ id: 'use', at: [0.5, -0.5], face: [0, 1] }],
        states: { open: false },
      },
    ],
    scenes: [{
      id: 'example-courtyard', name: '示例庭院',
      room: { w: 5, h: 4, mats: [{ kind: 'wood', color: '#c1b69e' }], walls: { left: false, right: false } },
      objects: [
        { id: 'beacon-west', def: beacon, x: 0, y: 0 },
        { id: 'beacon-center', def: beacon, x: 2, y: 0 },
        { id: 'beacon-east', def: beacon, x: 4, y: 0 },
        { id: 'exit', def: gate, x: 4, y: 3 },
      ],
      agents: [{ id: 'example-role', name: '示例角色', kind: 'girl', brain: 'manual', x: 2.5, y: 2.5 }],
    }],
  }];
})();
