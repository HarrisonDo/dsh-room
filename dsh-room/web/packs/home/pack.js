/**
 * RoomKit 中性小屋 —— Web 首页与公共广场使用的程序绘制家具和场景。
 * 只有项目代码绘制的零件（四朝向、可换色），没有贴图、角色卡或品牌图案；按 AGPL-3.0-only 随引擎分发。
 * 家具 id 带包名前缀，发布成世界时不会和其他版本的内置家具混淆。
 */
(function () {
  var P = 'roomkit-home/';
  var X = 'roomkit-example/';

  /* 书架上的书：按格子生成一排排小盒子（确定性的，不随机） */
  function books(x0, x1, y, d, z, hmin, hmax, seed) {
    var out = [], x = x0, i = 0, keys = ['book1', 'book2', 'book3', 'book4', 'book5'];
    while (x < x1 - 0.06) {
      var w = 0.07 + ((seed * 7 + i * 13) % 5) * 0.012, h = hmin + ((seed * 3 + i * 7) % 6) * ((hmax - hmin) / 5);
      if (x + w > x1) break;
      out.push({ t: 'box', x: x, y: y, z: z, w: w, d: d, h: h, c: keys[(seed + i * 3) % 5] });
      x += w + 0.012; i++;
      if ((seed + i) % 7 === 0) x += 0.12;      // 留个空隙，像真的书架
    }
    return out;
  }
  function legs(x0, y0, x1, y1, h, c, w) {
    w = w || 0.07;
    return [[x0, y0], [x1 - w, y0], [x0, y1 - w], [x1 - w, y1 - w]].map(function (p) {
      return { t: 'box', x: p[0], y: p[1], z: 0, w: w, d: w, h: h, c: c || 'leg' };
    });
  }

  var furniture = [
    /* ───────── 程序化家具（四朝向、可换色） ───────── */
    {
      id: P + 'sofa', name: '双人沙发', sub: '陷进去就不想起来', cat: 'living', size: [2, 1], height: 78,
      palette: { main: '#7aa7d9', cushion: '#a9cbef', leg: '#b9824f', pillow: '#f6d6a8' },
      variants: [{ main: '#e9a6a6', cushion: '#f5c9c4', pillow: '#fff1d6' }, { main: '#8bbf9a', cushion: '#b9dcc3', pillow: '#f4e2b8' }, { main: '#c9b28f', cushion: '#e5d5b8', pillow: '#a8c6e8' }],
      art: { kind: 'proc', parts: [].concat(legs(0.06, 0.1, 1.94, 0.94, 6, 'leg', 0.08), [
        { t: 'box', x: 0.02, y: 0.06, z: 6, w: 1.96, d: 0.9, h: 26, c: 'main' },
        { t: 'box', x: 0.02, y: 0.06, z: 32, w: 1.96, d: 0.26, h: 42, c: 'main' },
        { t: 'box', x: 0.02, y: 0.06, z: 32, w: 0.2, d: 0.9, h: 22, c: 'main' },
        { t: 'box', x: 1.78, y: 0.06, z: 32, w: 0.2, d: 0.9, h: 22, c: 'main' },
        { t: 'box', x: 0.23, y: 0.33, z: 32, w: 0.76, d: 0.6, h: 10, c: 'cushion' },
        { t: 'box', x: 1.01, y: 0.33, z: 32, w: 0.76, d: 0.6, h: 10, c: 'cushion' },
        { t: 'ball', x: 0.55, y: 0.42, z: 42, r: 0.15, c: 'pillow', sq: 0.85 },
        { t: 'ball', x: 1.45, y: 0.42, z: 42, r: 0.15, c: 'pillow', sq: 0.85 },
      ]) },
      slots: [
        { id: 'sit1', pose: 'sit', at: [0.6, 0.64], z: 42, face: [0, 1], need: { energy: 0.2, fun: 0.15 }, dur: [8, 16], label: '窝在沙发里' },
        { id: 'sit2', pose: 'sit', at: [1.4, 0.64], z: 42, face: [0, 1], need: { energy: 0.2, fun: 0.15 }, dur: [8, 16], label: '窝在沙发里' },
      ],
    },
    {
      id: P + 'chair', name: '木椅子', sub: '坐一会儿', cat: 'living', size: [1, 1], height: 92,
      palette: { main: '#e8a36a', accent: '#8fc3ee', leg: '#d08f58' },
      variants: [{ main: '#f2f2f0', accent: '#f4b6c2', leg: '#d9d9d6' }, { main: '#6f8fb8', accent: '#f3d27a', leg: '#5b789e' }],
      art: { kind: 'proc', parts: [].concat(legs(0.16, 0.16, 0.84, 0.84, 40), [
        { t: 'box', x: 0.12, y: 0.12, z: 40, w: 0.76, d: 0.76, h: 7, c: 'main' },
        { t: 'box', x: 0.17, y: 0.2, z: 47, w: 0.66, d: 0.62, h: 6, c: 'accent' },
        { t: 'box', x: 0.12, y: 0.12, z: 47, w: 0.08, d: 0.08, h: 44, c: 'main' },
        { t: 'box', x: 0.8, y: 0.12, z: 47, w: 0.08, d: 0.08, h: 44, c: 'main' },
        { t: 'box', x: 0.12, y: 0.1, z: 70, w: 0.76, d: 0.08, h: 22, c: 'main' },
      ]) },
      slots: [{ id: 'sit', pose: 'sit', at: [0.5, 0.56], z: 52, face: [0, 1], need: { energy: 0.15 }, dur: [6, 14], label: '坐一会儿' }],
    },
    {
      id: P + 'table', name: '长餐桌', sub: '吃饭和聊天', cat: 'living', size: [2, 1], height: 70,
      palette: { main: '#f3e1b6', leg: '#e3a46a', cup: '#ffffff', flower: '#ff9fb2' },
      art: { kind: 'proc', parts: [].concat(legs(0.1, 0.14, 1.9, 0.9, 56), [
        { t: 'box', x: 0.04, y: 0.08, z: 56, w: 1.92, d: 0.84, h: 8, c: 'main' },
        { t: 'cyl', x: 1.55, y: 0.5, z: 64, r: 0.07, h: 11, c: 'cup' },
        { t: 'cyl', x: 0.45, y: 0.45, z: 64, r: 0.08, h: 16, c: '#a9cbef' },
        { t: 'ball', x: 0.45, y: 0.45, z: 78, r: 0.09, c: 'flower' },
      ]) },
    },
    {
      id: P + 'round-table', name: '小圆桌', sub: '放杯奶茶', cat: 'living', size: [1, 1], height: 62,
      palette: { main: '#f6efe4', leg: '#c98a55' },
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.24, h: 4, c: 'leg' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 4, r: 0.05, h: 50, c: 'leg' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 54, r: 0.42, h: 6, c: 'main' },
        { t: 'cyl', x: 0.62, y: 0.42, z: 60, r: 0.07, h: 10, c: '#d9a26b' },
      ] },
    },
    {
      id: P + 'coffee-table', name: '茶几', sub: '摆点零食', cat: 'living', size: [1, 1], height: 42,
      palette: { main: '#e3a46a', leg: '#c98a55', accent: '#f28f6b' },
      art: { kind: 'proc', parts: [].concat(legs(0.12, 0.12, 0.88, 0.88, 32), [
        { t: 'box', x: 0.12, y: 0.12, z: 10, w: 0.76, d: 0.76, h: 3, c: 'leg' },
        { t: 'box', x: 0.08, y: 0.08, z: 32, w: 0.84, d: 0.84, h: 6, c: 'main' },
        { t: 'box', x: 0.3, y: 0.32, z: 38, w: 0.3, d: 0.22, h: 4, c: 'accent' },
      ]) },
    },
    {
      id: P + 'bookcase', name: '大书柜', sub: '四朝向的书柜', cat: 'study', size: [2, 1], height: 190,
      palette: { main: '#d9a066', back: '#c08850', book1: '#8fb6e8', book2: '#f2c77b', book3: '#e88f8f', book4: '#9fd3b4', book5: '#c7b2ee' },
      art: { kind: 'proc', parts: [].concat([
        { t: 'box', x: 0, y: 0.1, z: 0, w: 2, d: 0.06, h: 190, c: 'back' },
        { t: 'box', x: 0, y: 0.1, z: 0, w: 0.08, d: 0.8, h: 190, c: 'main' },
        { t: 'box', x: 1.92, y: 0.1, z: 0, w: 0.08, d: 0.8, h: 190, c: 'main' },
        { t: 'box', x: 0.08, y: 0.16, z: 0, w: 1.84, d: 0.74, h: 8, c: 'main' },
        { t: 'box', x: 0.08, y: 0.16, z: 62, w: 1.84, d: 0.74, h: 5, c: 'main' },
        { t: 'box', x: 0.08, y: 0.16, z: 124, w: 1.84, d: 0.74, h: 5, c: 'main' },
        { t: 'box', x: 0, y: 0.1, z: 184, w: 2, d: 0.8, h: 6, c: 'main' },
      ], books(0.12, 1.88, 0.24, 0.5, 8, 34, 50, 1), books(0.12, 1.88, 0.24, 0.5, 67, 34, 50, 4), books(0.12, 1.88, 0.24, 0.5, 129, 32, 48, 2)) },
      slots: [{ id: 'read', pose: 'read', at: [1, 1.45], face: [0, 1], need: { fun: 0.35 }, dur: [10, 20], label: '看书' }],
      act: 'use:read',
    },
    {
      id: P + 'bed-single', name: '单人床', sub: '四朝向的小床', cat: 'bedroom', size: [1, 2], height: 70,
      palette: { frame: '#e3a46a', sheet: '#fff6ea', blanket: '#8fc3ee', pillow: '#ffffff', leg: '#c98a55' },
      variants: [{ blanket: '#f29cb5' }, { blanket: '#a7d3a0' }, { blanket: '#f2c14e' }],
      art: { kind: 'proc', parts: [].concat(legs(0.06, 0.04, 0.94, 1.96, 6), [
        { t: 'box', x: 0.04, y: 0.02, z: 6, w: 0.92, d: 1.96, h: 18, c: 'frame' },
        { t: 'box', x: 0.04, y: 0.02, z: 24, w: 0.92, d: 0.1, h: 46, c: 'frame' },
        { t: 'box', x: 0.08, y: 0.12, z: 24, w: 0.84, d: 1.82, h: 12, c: 'sheet' },
        { t: 'box', x: 0.07, y: 0.78, z: 32, w: 0.86, d: 1.18, h: 6, c: 'blanket' },
        { t: 'ball', x: 0.5, y: 0.36, z: 34, r: 0.22, c: 'pillow', sq: 0.5 },
      ]) },
      slots: [{ id: 'sleep', pose: 'sleep', at: [0.5, 0.95], z: 40, face: [1, 0], need: { energy: 0.85 }, dur: [25, 45], label: '睡觉' }],
      act: 'use:sleep',
    },
    {
      id: P + 'desk-pc', name: '电脑桌', sub: '带小凳子', cat: 'study', size: [2, 2], height: 104,
      palette: { top: '#f3e1b6', main: '#8fb6e8', leg: '#e3a46a', metal: '#b8c0cc', screen: '#2b3346', glow: '#cfe8ff', stool: '#e3a46a', accent: '#f4b6c2' },
      states: { working: false },
      light: { at: [0.75, 0.6], z: 90, radius: 1.6, color: '#bfe0ff', when: 'working', power: 0.7 },
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.08, z: 0, w: 0.07, d: 0.07, h: 62, c: 'leg' },
        { t: 'box', x: 0.04, y: 0.86, z: 0, w: 0.07, d: 0.07, h: 62, c: 'leg' },
        { t: 'box', x: 1.3, y: 0.1, z: 0, w: 0.64, d: 0.82, h: 62, c: 'main' },
        { t: 'box', x: 1.36, y: 0.92, z: 40, w: 0.52, d: 0.02, h: 3, c: '#ffffff' },
        { t: 'box', x: 1.36, y: 0.92, z: 18, w: 0.52, d: 0.02, h: 3, c: '#ffffff' },
        { t: 'box', x: 0, y: 0.05, z: 62, w: 2, d: 0.92, h: 7, c: 'top' },
        { t: 'box', x: 0.5, y: 0.3, z: 69, w: 0.52, d: 0.36, h: 3, c: 'metal' },
        { t: 'box', x: 0.5, y: 0.27, z: 72, w: 0.52, d: 0.04, h: 32, c: 'metal', faces: { py: 'screen' }, glow: 'py', lit: 'working' },
        { t: 'cyl', x: 1.62, y: 0.4, z: 69, r: 0.07, h: 12, c: '#ffffff' },
        { t: 'cyl', x: 0.75, y: 1.45, z: 0, r: 0.07, h: 34, c: 'stool' },
        { t: 'cyl', x: 0.75, y: 1.45, z: 34, r: 0.22, h: 6, c: 'stool' },
        { t: 'cyl', x: 0.75, y: 1.45, z: 40, r: 0.2, h: 3, c: 'accent' },
      ] },
      slots: [{ id: 'work', pose: 'work', at: [0.75, 1.45], z: 43, face: [0, -1], need: { fun: 0.1 }, dur: [12, 25], label: '写代码', sets: { working: true } }],
      act: 'use:work',
    },
    {
      id: P + 'fridge', name: '冰箱', sub: '零食仓库', cat: 'kitchen', size: [1, 1], height: 180,
      palette: { main: '#f4f6fa', line: '#cfd6e2', metal: '#b8c0cc', accent: '#ff9fb2' },
      variants: [{ main: '#bfe3ff', line: '#9cc6e6' }, { main: '#ffd8d8', line: '#e8b4b4' }, { main: '#d9f2d9', line: '#b5d9b5' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.08, y: 0.1, z: 0, w: 0.84, d: 0.82, h: 178, c: 'main' },
        { t: 'box', x: 0.08, y: 0.9, z: 112, w: 0.84, d: 0.03, h: 3, c: 'line' },
        { t: 'box', x: 0.75, y: 0.93, z: 122, w: 0.05, d: 0.04, h: 34, c: 'metal' },
        { t: 'box', x: 0.75, y: 0.93, z: 60, w: 0.05, d: 0.04, h: 40, c: 'metal' },
        { t: 'box', x: 0.2, y: 0.93, z: 140, w: 0.14, d: 0.02, h: 11, c: 'accent' },
        { t: 'box', x: 0.4, y: 0.93, z: 150, w: 0.1, d: 0.02, h: 9, c: '#8fc3ee' },
      ] },
      slots: [{ id: 'eat', pose: 'eat', at: [0.5, 1.45], face: [0, 1], need: { energy: 0.3, fun: 0.2 }, dur: [5, 9], label: '偷吃零食', say: ['偷吃一口~', '冰箱里有好吃的！'] }],
      act: 'use:eat',
    },
    {
      id: P + 'tv', name: '电视柜', sub: '一起看电视', cat: 'living', size: [2, 1], height: 112,
      palette: { main: '#e3a46a', drawer: '#f3e1b6', frame: '#2b2f3a', screen: '#1d2230', glow: '#a9d4ff' },
      states: { on: false },
      light: { at: [1, 1.1], z: 60, radius: 2.4, color: '#a9d4ff', when: 'on', power: 0.85 },
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.05, y: 0.3, z: 0, w: 1.9, d: 0.6, h: 34, c: 'main' },
        { t: 'box', x: 0.15, y: 0.9, z: 9, w: 0.78, d: 0.02, h: 16, c: 'drawer' },
        { t: 'box', x: 1.07, y: 0.9, z: 9, w: 0.78, d: 0.02, h: 16, c: 'drawer' },
        { t: 'box', x: 0.85, y: 0.45, z: 34, w: 0.3, d: 0.2, h: 6, c: 'frame' },
        { t: 'box', x: 0.28, y: 0.5, z: 40, w: 1.44, d: 0.08, h: 66, c: 'frame', faces: { py: 'screen' }, glow: 'py', lit: 'on' },
      ] },
      slots: [{ id: 'watch', pose: 'sit', at: [1, 2.2], face: [0, -1], need: { fun: 0.45 }, dur: [12, 25], label: '看电视', sets: { on: true } }],
      act: 'toggle:on', say: ['开电视', '关电视'],
    },
    {
      id: P + 'aquarium', name: '鱼缸', sub: '小鱼游来游去', cat: 'fun', size: [2, 1], height: 112,
      palette: { main: '#7fa7c9', water: '#a8dcf0', rim: '#e8f4fa', sand: '#f3e2b5' },
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.1, z: 0, w: 1.92, d: 0.8, h: 46, c: 'main' },
        { t: 'box', x: 0.1, y: 0.16, z: 46, w: 1.8, d: 0.68, h: 5, c: 'sand', bias: -0.02 },
        { t: 'fx', fx: 'fish', x: 0.12, y: 0.2, z: 52, w: 1.76, d: 0.6, h: 48, bias: -0.01 },
        { t: 'box', x: 0.08, y: 0.14, z: 46, w: 1.84, d: 0.72, h: 62, c: 'water', o: 0.5, bias: 0.01 },
        { t: 'box', x: 0.06, y: 0.12, z: 108, w: 1.88, d: 0.76, h: 4, c: 'rim', bias: 0.02 },
      ] },
      slots: [{ id: 'look', pose: 'look', at: [1, 1.6], face: [0, -1], need: { fun: 0.3 }, dur: [6, 10], label: '看鱼' }],
      act: 'use:look',
    },
    {
      id: P + 'floor-lamp', name: '台式落地灯', sub: '四朝向灯', cat: 'light', size: [1, 1], height: 180,
      palette: { base: '#e3a46a', metal: '#9fb9d6', shade: '#fff2d9', glow: '#fff7cf' },
      states: { on: false },
      light: { at: [0.5, 0.5], z: 160, radius: 3.2, color: '#ffd59a', when: 'on' },
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.22, h: 5, c: 'base' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 5, r: 0.025, h: 140, c: 'metal' },
        { t: 'cone', x: 0.5, y: 0.5, z: 138, r0: 0.3, r1: 0.19, h: 40, c: 'shade', lit: 'on', open: true },
      ] },
      act: 'toggle:on', say: ['啪嗒，开灯', '啪嗒，关灯'],
    },
    {
      id: P + 'plant-big', name: '大盆栽', sub: '要浇水啦', cat: 'plant', size: [1, 1], height: 120,
      palette: { pot: '#e9a17a', soil: '#6b4a35', leaf: '#6fbf73', leaf2: '#8fd28f' },
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.2, h: 34, c: 'pot' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 34, r: 0.18, h: 1, c: 'soil' },
        { t: 'ball', x: 0.5, y: 0.5, z: 34, r: 0.27, c: 'leaf' },
        { t: 'ball', x: 0.38, y: 0.44, z: 56, r: 0.2, c: 'leaf2' },
        { t: 'ball', x: 0.62, y: 0.5, z: 60, r: 0.2, c: 'leaf' },
        { t: 'ball', x: 0.5, y: 0.56, z: 80, r: 0.17, c: 'leaf2' },
      ] },
      act: 'shake', say: ['叶子沙沙响', '要浇水啦'],
    },
    {
      id: P + 'beanbag', name: '懒人豆袋', sub: '窝一会儿', cat: 'living', size: [1, 1], height: 46,
      palette: { main: '#f2b56b' },
      variants: [{ main: '#9fc8f0' }, { main: '#f29cb5' }, { main: '#a7d3a0' }],
      art: { kind: 'proc', parts: [
        { t: 'ball', x: 0.5, y: 0.56, z: 0, r: 0.36, c: 'main', sq: 0.62 },
        { t: 'ball', x: 0.5, y: 0.34, z: 14, r: 0.26, c: 'main', sq: 0.8 },
      ] },
      slots: [{ id: 'sit', pose: 'sit', at: [0.5, 0.6], z: 24, face: [0, 1], need: { fun: 0.2, energy: 0.12 }, dur: [8, 16], label: '窝一会儿' }],
    },
    {
      id: P + 'rug-round', name: '圆地毯', sub: '软软的', cat: 'rug', size: [3, 3], mount: 'flat',
      palette: { main: '#a9cbef', border: '#f6f0e4' },
      variants: [{ main: '#f5c9c4', border: '#fff6ee' }, { main: '#c6e3c0', border: '#f4f8ef' }],
      art: { kind: 'proc', parts: [{ t: 'rug', shape: 'round', x: 0, y: 0, w: 3, d: 3, c: 'main', b: 'border', pattern: 'rings' }] },
      act: 'shake', say: ['软乎乎'],
    },
    {
      id: P + 'rug-rect', name: '条纹地毯', sub: '可以打滚', cat: 'rug', size: [3, 2], mount: 'flat',
      palette: { main: '#f2d1b3', border: '#d9a77a' },
      variants: [{ main: '#cfe3f5', border: '#8fb0c9' }, { main: '#e8dcf5', border: '#b39ddb' }],
      art: { kind: 'proc', parts: [{ t: 'rug', shape: 'rect', x: 0, y: 0, w: 3, d: 2, c: 'main', b: 'border', pattern: 'stripes' }] },
      act: 'shake', say: ['在地毯上打个滚'],
    },

    /* ───────── 厨房 ───────── */
    {
      id: P + 'counter', name: '橱柜', sub: '切菜备料', cat: 'kitchen', size: [2, 1], height: 112,
      palette: { main: '#f6efe4', top: '#e8d5b5', door: '#8fc3ee', knob: '#c98a55', jar: '#f2b56b', cup: '#ffffff' },
      variants: [{ door: '#a7d3a0' }, { door: '#f4b6c2' }, { door: '#f2c77b' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.1, z: 0, w: 1.92, d: 0.82, h: 84, c: 'main' },
        { t: 'box', x: 0.12, y: 0.92, z: 10, w: 0.82, d: 0.02, h: 64, c: 'door' },
        { t: 'box', x: 1.06, y: 0.92, z: 10, w: 0.82, d: 0.02, h: 64, c: 'door' },
        { t: 'box', x: 0.84, y: 0.94, z: 52, w: 0.05, d: 0.02, h: 12, c: 'knob' },
        { t: 'box', x: 1.11, y: 0.94, z: 52, w: 0.05, d: 0.02, h: 12, c: 'knob' },
        { t: 'box', x: 0, y: 0.06, z: 84, w: 2, d: 0.9, h: 6, c: 'top' },
        { t: 'box', x: 0.25, y: 0.35, z: 90, w: 0.5, d: 0.34, h: 3, c: '#d9a066' },
        { t: 'cyl', x: 1.0, y: 0.35, z: 90, r: 0.1, h: 18, c: 'jar' },
        { t: 'cyl', x: 1.0, y: 0.35, z: 108, r: 0.1, h: 3, c: 'door' },
        { t: 'cyl', x: 1.55, y: 0.45, z: 90, r: 0.17, h: 18, c: 'cup' },
        { t: 'cyl', x: 1.55, y: 0.45, z: 108, r: 0.15, h: 3, c: 'door' },
      ] },
      slots: [{ id: 'prep', pose: 'cook', at: [1, 1.45], face: [0, -1], need: { fun: 0.15 }, dur: [6, 12], label: '切菜', say: ['笃笃笃笃', '切得好整齐！'] }],
      act: 'use:prep',
    },
    {
      id: P + 'stove', name: '灶台', sub: '咕嘟咕嘟', cat: 'kitchen', size: [2, 1], height: 118,
      palette: { main: '#f4f1ea', top: '#cfd6e2', burner: '#3a3f4a', glow: '#ff9a4d', pot: '#e8505b', lid: '#f27a83', pan: '#2b2f3a', door: '#2b3346', knob: '#b8c0cc' },
      variants: [{ main: '#3a4656', top: '#5b6676', pot: '#f2c14e', lid: '#f6d77f' }, { main: '#bfe3ff', top: '#9cc6e6', pot: '#7fcf9a', lid: '#a7e0b8' }],
      states: { on: false },
      light: { at: [1, 0.5], z: 110, radius: 1.8, color: '#ffb36b', when: 'on', power: 0.6 },
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.1, z: 0, w: 1.92, d: 0.82, h: 86, c: 'main' },
        { t: 'box', x: 0.24, y: 0.92, z: 14, w: 1.52, d: 0.02, h: 48, c: 'door' },
        { t: 'box', x: 0.3, y: 0.94, z: 66, w: 1.4, d: 0.02, h: 4, c: 'knob' },
        { t: 'box', x: 0, y: 0.06, z: 86, w: 2, d: 0.9, h: 5, c: 'top' },
        { t: 'cyl', x: 0.55, y: 0.48, z: 91, r: 0.21, h: 2, c: 'burner', lit: 'on' },
        { t: 'cyl', x: 1.45, y: 0.48, z: 91, r: 0.21, h: 2, c: 'burner', lit: 'on' },
        { t: 'cyl', x: 0.55, y: 0.48, z: 93, r: 0.19, h: 20, c: 'pot' },
        { t: 'cyl', x: 0.55, y: 0.48, z: 113, r: 0.2, h: 3, c: 'lid' },
        { t: 'cyl', x: 1.45, y: 0.48, z: 93, r: 0.22, h: 4, c: 'pan' },
        { t: 'box', x: 1.66, y: 0.45, z: 94, w: 0.34, d: 0.06, h: 2, c: 'pan' },
      ] },
      slots: [{ id: 'cook', pose: 'cook', at: [1, 1.45], face: [0, -1], need: { fun: 0.2, energy: 0.1 }, dur: [8, 16], label: '做饭', sets: { on: true }, say: ['咕嘟咕嘟~', '香不香？'] }],
      act: 'use:cook',
    },
    {
      id: P + 'sink', name: '水槽', sub: '洗洗涮涮', cat: 'kitchen', size: [1, 1], height: 120,
      palette: { main: '#f6efe4', top: '#e8d5b5', door: '#8fc3ee', basin: '#c9d6e3', metal: '#b8c0cc' },
      variants: [{ door: '#a7d3a0' }, { door: '#f4b6c2' }, { door: '#f2c77b' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.06, y: 0.1, z: 0, w: 0.88, d: 0.82, h: 84, c: 'main' },
        { t: 'box', x: 0.14, y: 0.92, z: 10, w: 0.72, d: 0.02, h: 64, c: 'door' },
        { t: 'box', x: 0.02, y: 0.06, z: 84, w: 0.96, d: 0.9, h: 6, c: 'top' },
        { t: 'box', x: 0.18, y: 0.3, z: 90, w: 0.64, d: 0.5, h: 1, c: 'basin' },
        { t: 'cyl', x: 0.5, y: 0.17, z: 90, r: 0.035, h: 28, c: 'metal' },
        { t: 'box', x: 0.47, y: 0.17, z: 114, w: 0.06, d: 0.22, h: 4, c: 'metal' },
      ] },
      slots: [{ id: 'wash', pose: 'cook', at: [0.5, 1.45], face: [0, -1], need: { fun: 0.1 }, dur: [5, 9], label: '洗碗', say: ['哗啦哗啦', '碗洗干净啦'] }],
      act: 'use:wash',
    },

    /* ───────── 小院 ───────── */
    {
      id: P + 'tree', name: '大树', sub: '夏天在树下乘凉', cat: 'outdoor', size: [2, 2], height: 240,
      palette: { trunk: '#9a6b4a', leaf: '#6fbf73', leaf2: '#8fd28f', fruit: '#ff8f8f' },
      variants: [{ leaf: '#f4a6b8', leaf2: '#fbc9d4', fruit: '#ffffff' }, { leaf: '#e9a94f', leaf2: '#f2c77b', fruit: '#d9653b' }],
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 1, y: 1, z: 0, r: 0.16, h: 96, c: 'trunk' },
        { t: 'ball', x: 1, y: 1, z: 70, r: 0.9, c: 'leaf', sq: 0.8 },
        { t: 'ball', x: 0.62, y: 0.8, z: 128, r: 0.6, c: 'leaf2' },
        { t: 'ball', x: 1.38, y: 1.2, z: 118, r: 0.6, c: 'leaf' },
        { t: 'ball', x: 1, y: 1, z: 170, r: 0.5, c: 'leaf2' },
        { t: 'ball', x: 0.5, y: 1.55, z: 100, r: 0.07, c: 'fruit' },
        { t: 'ball', x: 1.55, y: 1.7, z: 120, r: 0.07, c: 'fruit' },
        { t: 'ball', x: 1.1, y: 1.8, z: 150, r: 0.07, c: 'fruit' },
      ] },
      slots: [{ id: 'rest', pose: 'sit', at: [1, 2.35], face: [0, 1], need: { energy: 0.25 }, dur: [10, 18], label: '在树下乘凉' }],
      act: 'shake', say: ['树叶沙沙响', '掉下来一个果子！', '好凉快~'],
    },
    {
      id: P + 'flowerbed', name: '花坛', sub: '要浇水哦', cat: 'outdoor', size: [2, 1], height: 48,
      palette: { box: '#c98a55', soil: '#7a5238', leaf: '#6fbf73', f1: '#ff9fb2', f2: '#ffd166', f3: '#b39ddb', f4: '#ffffff' },
      variants: [{ box: '#f6efe4', f1: '#ff8f8f', f2: '#ffb36b', f3: '#ff9fb2' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.1, z: 0, w: 1.92, d: 0.8, h: 16, c: 'box' },
        { t: 'box', x: 0.1, y: 0.16, z: 16, w: 1.8, d: 0.68, h: 1, c: 'soil' },
        { t: 'ball', x: 0.32, y: 0.5, z: 16, r: 0.16, c: 'leaf', sq: 0.8 },
        { t: 'ball', x: 0.78, y: 0.45, z: 16, r: 0.17, c: 'leaf', sq: 0.8 },
        { t: 'ball', x: 1.24, y: 0.52, z: 16, r: 0.16, c: 'leaf', sq: 0.8 },
        { t: 'ball', x: 1.7, y: 0.46, z: 16, r: 0.15, c: 'leaf', sq: 0.8 },
        { t: 'ball', x: 0.3, y: 0.42, z: 34, r: 0.08, c: 'f1' },
        { t: 'ball', x: 0.8, y: 0.55, z: 34, r: 0.08, c: 'f2' },
        { t: 'ball', x: 1.2, y: 0.4, z: 35, r: 0.08, c: 'f3' },
        { t: 'ball', x: 1.68, y: 0.55, z: 33, r: 0.08, c: 'f4' },
        { t: 'ball', x: 1.0, y: 0.3, z: 30, r: 0.07, c: 'f1' },
      ] },
      slots: [{ id: 'water', pose: 'look', at: [1, 1.5], face: [0, -1], need: { fun: 0.2 }, dur: [5, 9], label: '浇花', say: ['喝水啦~', '快快长大'] }],
      act: 'use:water',
    },
    {
      id: P + 'bench', name: '长椅', sub: '晒太阳', cat: 'outdoor', size: [2, 1], height: 80,
      palette: { main: '#d9a066', leg: '#5b6472' },
      variants: [{ main: '#8fc3ee' }, { main: '#f6efe4' }],
      art: { kind: 'proc', parts: [].concat(legs(0.12, 0.2, 1.88, 0.86, 40, 'leg', 0.07), [
        { t: 'box', x: 0.04, y: 0.2, z: 40, w: 1.92, d: 0.2, h: 5, c: 'main' },
        { t: 'box', x: 0.04, y: 0.43, z: 40, w: 1.92, d: 0.2, h: 5, c: 'main' },
        { t: 'box', x: 0.04, y: 0.66, z: 40, w: 1.92, d: 0.2, h: 5, c: 'main' },
        { t: 'box', x: 0.12, y: 0.16, z: 45, w: 0.06, d: 0.06, h: 34, c: 'leg' },
        { t: 'box', x: 1.82, y: 0.16, z: 45, w: 0.06, d: 0.06, h: 34, c: 'leg' },
        { t: 'box', x: 0.04, y: 0.12, z: 58, w: 1.92, d: 0.06, h: 9, c: 'main' },
        { t: 'box', x: 0.04, y: 0.12, z: 70, w: 1.92, d: 0.06, h: 9, c: 'main' },
      ]) },
      slots: [
        { id: 'sit1', pose: 'sit', at: [0.6, 0.6], z: 45, face: [0, 1], need: { energy: 0.2, fun: 0.1 }, dur: [8, 16], label: '晒太阳' },
        { id: 'sit2', pose: 'sit', at: [1.4, 0.6], z: 45, face: [0, 1], need: { energy: 0.2, fun: 0.1 }, dur: [8, 16], label: '晒太阳' },
      ],
    },
    {
      id: P + 'swing', name: '秋千', sub: '荡高高', cat: 'outdoor', size: [2, 1], height: 190,
      palette: { frame: '#c98a55', rope: '#f6efe4', seat: '#8fc3ee' },
      variants: [{ seat: '#f29cb5' }, { seat: '#f2c14e' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.04, y: 0.42, z: 0, w: 0.1, d: 0.1, h: 182, c: 'frame' },
        { t: 'box', x: 1.86, y: 0.42, z: 0, w: 0.1, d: 0.1, h: 182, c: 'frame' },
        { t: 'box', x: 0.04, y: 0.42, z: 182, w: 1.92, d: 0.1, h: 8, c: 'frame' },
        { t: 'box', x: 0.56, y: 0.46, z: 52, w: 0.03, d: 0.03, h: 130, c: 'rope' },
        { t: 'box', x: 1.41, y: 0.46, z: 52, w: 0.03, d: 0.03, h: 130, c: 'rope' },
        { t: 'box', x: 0.5, y: 0.3, z: 46, w: 1.0, d: 0.36, h: 6, c: 'seat' },
      ] },
      slots: [{ id: 'swing', pose: 'sit', at: [1, 0.5], z: 52, face: [0, 1], need: { fun: 0.4 }, dur: [8, 14], label: '荡秋千', say: ['荡高高~', '呜哇——'] }],
      act: 'use:swing',
    },
    {
      id: P + 'pond', name: '小池塘', sub: '锦鲤游来游去', cat: 'outdoor', size: [2, 2], height: 10,
      palette: { water: '#7ec8e3', stone: '#cfc8b8', lily: '#6fbf73' },
      art: { kind: 'proc', parts: [
        { t: 'rug', shape: 'round', x: 0, y: 0, w: 2, d: 2, c: 'water', b: 'stone' },
        { t: 'fx', fx: 'fish', x: 0.35, y: 0.35, z: 2, w: 1.3, d: 1.3, h: 6 },
        { t: 'ball', x: 0.62, y: 1.3, z: 2, r: 0.13, c: 'lily', sq: 0.3 },
        { t: 'ball', x: 1.4, y: 0.7, z: 2, r: 0.1, c: 'lily', sq: 0.3 },
      ] },
      slots: [{ id: 'look', pose: 'look', at: [1, 2.4], face: [0, -1], need: { fun: 0.3 }, dur: [6, 10], label: '看锦鲤' }],
      act: 'use:look',
    },
    {
      id: P + 'garden-lamp', name: '庭院灯', sub: '晚上点亮', cat: 'light', size: [1, 1], height: 150,
      palette: { metal: '#4a5262', glass: '#fff2d9', glow: '#fff2b0' },
      states: { on: false },
      light: { at: [0.5, 0.5], z: 140, radius: 2.8, color: '#ffd59a', when: 'on' },
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.14, h: 6, c: 'metal' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 6, r: 0.035, h: 118, c: 'metal' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 124, r: 0.12, h: 22, c: 'glass', lit: 'on' },
        { t: 'cone', x: 0.5, y: 0.5, z: 146, r0: 0.17, r1: 0.04, h: 10, c: 'metal' },
      ] },
      act: 'toggle:on', say: ['啪嗒，亮灯', '啪嗒，关灯'],
    },
    {
      id: P + 'mailbox', name: '信箱', sub: '有时候会有信', cat: 'outdoor', size: [1, 1], height: 104,
      palette: { post: '#c98a55', box: '#e8505b', flag: '#ffd166' },
      variants: [{ box: '#5b8def' }, { box: '#7fcf9a' }],
      art: { kind: 'proc', parts: [
        { t: 'box', x: 0.45, y: 0.45, z: 0, w: 0.1, d: 0.1, h: 70, c: 'post' },
        { t: 'box', x: 0.28, y: 0.25, z: 70, w: 0.44, d: 0.5, h: 28, c: 'box' },
        { t: 'box', x: 0.72, y: 0.4, z: 84, w: 0.03, d: 0.06, h: 20, c: 'flag' },
      ] },
      act: 'info',
    },
    {
      id: P + 'fence', name: '小栅栏', sub: '围出一块小院', cat: 'outdoor', size: [2, 1], height: 56,
      palette: { main: '#f6efe4' },
      variants: [{ main: '#c98a55' }, { main: '#8fc3ee' }],
      art: { kind: 'proc', parts: [0, 1, 2, 3, 4].map(function (i) {
        return { t: 'box', x: 0.1 + i * 0.4, y: 0.45, z: 0, w: 0.12, d: 0.08, h: 56, c: 'main' };
      }).concat([
        { t: 'box', x: 0.02, y: 0.48, z: 14, w: 1.96, d: 0.04, h: 6, c: 'main' },
        { t: 'box', x: 0.02, y: 0.48, z: 38, w: 1.96, d: 0.04, h: 6, c: 'main' },
      ]) },
    },

    /* ───────── 墙面物件 ───────── */
    { id: P + 'window', name: '窗户', sub: '点一下换天气', mount: 'wall', wsize: [1.6, 120], wz: 100, art: { kind: 'wall', draw: 'window' }, palette: { frame: '#ffffff', curtain: '#f6c9a8' }, variants: [{ curtain: '#a9cbef' }, { curtain: '#c6e3c0' }], act: 'weather' },
    { id: P + 'window-plain', name: '小窗', sub: '没有窗帘', mount: 'wall', wsize: [1.1, 100], wz: 110, art: { kind: 'wall', draw: 'window' }, palette: { frame: '#ffffff' }, act: 'weather' },
    { id: P + 'door', name: '房门', sub: '通往家里的另一个房间', mount: 'wall', wsize: [1.0, 200], wz: 0, art: { kind: 'wall', draw: 'door' }, palette: { frame: '#ffffff', main: '#c98a55' }, states: { open: false }, portal: true },
    { id: P + 'frame', name: '挂画', sub: '一片海', mount: 'wall', wsize: [1.0, 80], wz: 150, art: { kind: 'wall', draw: 'frame' }, palette: { frame: '#c99a6b', sky: '#9fd0f0', sea: '#5b8def' }, act: 'info' },
    { id: P + 'clock', name: '挂钟', sub: '走的是真实时间', mount: 'wall', wsize: [0.8, 52], wz: 190, art: { kind: 'wall', draw: 'clock' }, palette: { frame: '#e3a46a', accent: '#e8505b' }, act: 'info' },
    { id: P + 'wall-shelf', name: '墙上搁板', sub: '放几本书', mount: 'wall', wsize: [1.4, 44], wz: 150, art: { kind: 'wall', draw: 'shelf' }, palette: { main: '#d9a066' } },
    { id: P + 'wall-cabinet', name: '吊柜', sub: '碗碟都在里面', mount: 'wall', wsize: [1.8, 70], wz: 165, art: { kind: 'wall', draw: 'cabinet' }, palette: { main: '#d9b48a', accent: '#fbf6ee' }, variants: [{ main: '#f6efe4', accent: '#8fc3ee' }, { main: '#f6efe4', accent: '#a7d3a0' }] },
    { id: P + 'kitchen-rack', name: '厨具挂架', sub: '锅铲汤勺', mount: 'wall', wsize: [1.4, 56], wz: 135, art: { kind: 'wall', draw: 'rack' }, palette: { main: '#b8c0cc' } },
  ];

  var look = { body: '#5b8def', belly: '#eef5ff', hat: 'maid', rig: false };
  var buddy = { body: '#f2b07a', accent: '#f29cb5', size: 0.86 };

  /* ───────── 场景模板 ───────── */
  var living = {
    format: 'roomkit.scene', v: 2, id: 'cabin', name: '小屋',
    room: {
      w: 8, h: 7, mats: [{ kind: 'wood', color: '#d9a575' }, { kind: 'tile', color: '#ece4d6' }],
      cells: ['aaaaabbb', 'aaaaabbb', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa'],
      walls: { left: true, right: true, height: 290, color: '#f3ebdd', wainscot: '#9fb9a8', trim: '#ffffff', pattern: 'plain' },
      slab: 18,
    },
    objects: [
      { id: 'lamp1', def: P + 'floor-lamp', x: 0, y: 0, rot: 0 },
      { id: 'tv1', def: P + 'tv', x: 1, y: 0, rot: 0 },
      { id: 'bc1', def: P + 'bookcase', x: 3, y: 0, rot: 0 },
      { id: 'fridge1', def: P + 'fridge', x: 5, y: 0, rot: 0, variant: 0 },
      { id: 'counter1', def: P + 'counter', x: 6, y: 0, rot: 0 },
      { id: 'rug1', def: P + 'rug-rect', x: 0, y: 2, rot: 0 },
      { id: 'ct1', def: P + 'coffee-table', x: 1, y: 3, rot: 0 },
      { id: 'sofa1', def: P + 'sofa', x: 1, y: 4, rot: 2 },
      { id: 'table1', def: P + 'round-table', x: 6, y: 3, rot: 0 },
      { id: 'ch1', def: P + 'chair', x: 6, y: 2, rot: 0 },
      { id: 'ch2', def: P + 'chair', x: 6, y: 4, rot: 2, variant: 0 },
      { id: 'bean1', def: P + 'beanbag', x: 4, y: 5, rot: 0 },
      { id: 'plant1', def: P + 'plant-big', x: 7, y: 6, rot: 0 },
      { id: 'aq1', def: P + 'aquarium', x: 0, y: 5, rot: 1 },
      { id: 'win1', def: P + 'window', wall: 'right', at: 4.4, z: 100, variant: 0 },
      { id: 'door1', def: P + 'door', wall: 'left', at: 1.4, z: 0, state: { to: 'garden' } },
      { id: 'clock1', def: P + 'clock', wall: 'left', at: 3.2, z: 195 },
      { id: 'frame1', def: P + 'frame', wall: 'left', at: 4.6, z: 150 },
      { id: 'shelfw', def: P + 'wall-shelf', wall: 'right', at: 2.2, z: 160 },
    ],
    agents: [
      { id: 'me', name: '体验角色', kind: 'girl', brain: 'pet', x: 3.5, y: 3.5, look: look },
      { id: 'buddy', name: '小橘', kind: 'girl', brain: 'auto', follow: true, x: 4.5, y: 4.5, look: buddy },
    ],
    env: { period: null, weather: 'clear' },
  };

  var garden = {
    format: 'roomkit.scene', v: 2, id: 'garden', name: '小院',
    room: {
      w: 9, h: 8, outdoor: true,
      mats: [{ kind: 'grass', color: '#a6d37f' }, { kind: 'stone', color: '#ddd5c4' }, { kind: 'wood', color: '#c98a55' }],
      cells: ['ccccaaaaa', 'ccccaaaaa', 'aabaaaaaa', 'aabaaaaaa', 'aabbbbaaa', 'aaaaabaaa', 'aaaaabaaa', 'aaaaabaaa'],
      walls: { left: false, right: true, height: 250, color: '#ecd2b8', wainscot: '#b98a6a', trim: '#f6efe4', pattern: 'bricks' },
      slab: 22,
    },
    objects: [
      { id: 'door1', def: P + 'door', wall: 'right', at: 2.0, z: 0, state: { to: 'cabin' } },
      { id: 'win1', def: P + 'window', wall: 'right', at: 5.0, z: 100 },
      { id: 'bench1', def: P + 'bench', x: 0, y: 0, rot: 0 },
      { id: 'tree1', def: P + 'tree', x: 6, y: 1, rot: 0 },
      { id: 'fb1', def: P + 'flowerbed', x: 0, y: 3, rot: 1 },
      { id: 'fb2', def: P + 'flowerbed', x: 6, y: 7, rot: 0, variant: 0 },
      { id: 'pond1', def: P + 'pond', x: 3, y: 5, rot: 0 },
      { id: 'swing1', def: P + 'swing', x: 7, y: 4, rot: 1 },
      { id: 'lamp1', def: P + 'garden-lamp', x: 4, y: 3, rot: 0 },
      { id: 'mail1', def: P + 'mailbox', x: 8, y: 7, rot: 0 },
    ],
    agents: [],
    env: { period: null, weather: 'clear' },
  };

  /* 公共广场：发布成公共世界；三盏信标和出口沿用示例包的合作活动道具 */
  var plaza = {
    format: 'roomkit.scene', v: 2, id: 'plaza', name: '星光广场',
    room: {
      w: 10, h: 8, outdoor: true,
      mats: [{ kind: 'grass', color: '#a6d37f' }, { kind: 'stone', color: '#e3dccd' }],
      cells: ['aabbbbbbaa', 'abbbbbbbba', 'bbbbbbbbbb', 'bbbbbbbbbb', 'bbbbbbbbbb', 'abbbbbbbba', 'aabbbbbbaa', 'aaabbbbaaa'],
      walls: { left: false, right: false, height: 230 },
      slab: 22,
    },
    objects: [
      { id: 'beacon-west', def: X + 'beacon', x: 2, y: 1 },
      { id: 'beacon-center', def: X + 'beacon', x: 5, y: 1 },
      { id: 'beacon-east', def: X + 'beacon', x: 8, y: 1 },
      { id: 'exit', def: X + 'gate', x: 5, y: 7 },
      { id: 'tree-w', def: P + 'tree', x: 0, y: 0, rot: 0 },
      { id: 'tree-e', def: P + 'tree', x: 8, y: 5, rot: 0, variant: 0 },
      { id: 'bench-w', def: P + 'bench', x: 1, y: 4, rot: 1 },
      { id: 'bench-e', def: P + 'bench', x: 7, y: 3, rot: 3 },
      { id: 'pond', def: P + 'pond', x: 4, y: 3, rot: 0 },
      { id: 'lamp-w', def: P + 'garden-lamp', x: 3, y: 6, rot: 0 },
      { id: 'lamp-e', def: P + 'garden-lamp', x: 7, y: 6, rot: 0 },
      { id: 'flowers', def: P + 'flowerbed', x: 0, y: 6, rot: 0, variant: 0 },
    ],
    agents: [],
    env: { period: null, weather: 'clear' },
  };

  window.RoomKitPacks = window.RoomKitPacks || [];
  window.RoomKitPacks.push({
    id: 'roomkit-home', name: 'RoomKit 小屋', author: 'RoomKit', license: 'AGPL-3.0-only', version: '1.0.0',
    furniture: furniture, scenes: [living, garden],
    home: { name: '我的小屋', floors: ['1F'], rooms: [{ id: 'cabin', name: '小屋', floor: '1F', tpl: 'cabin' }, { id: 'garden', name: '小院', floor: '1F', tpl: 'garden' }] },
    // 不放进家；构建站点时据此生成公共世界
    worlds: [{ worldId: 'roomkit-plaza', scene: plaza, summary: '大家都能来的广场。和另一位玩家各点亮信标，再一起打开出口。',
      activity: { kind: 'cooperative-beacons', v: 1, beaconIds: ['beacon-west', 'beacon-center', 'beacon-east'], exitId: 'exit', minContributors: 2 } }],
  });
})();
