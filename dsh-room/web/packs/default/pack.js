/**
 * RoomKit 默认内容包「大肥鱼的家」—— 家具库 + 场景模板 + 小剧场 + 抽屉文案。
 *
 * 普通脚本（file:// 可用）：push 到 window.RoomKitPacks，RoomKit.mount 时读取。
 * 换房间/加设施 = 改这里的数据（或另写一个包），不碰引擎。字段说明见 docs/03 §3.3。
 *
 * 两类家具：
 *   贴图家具：复用 AI 出图的透明素材（单视角，镜像得第二朝向）；fit/dx/dy/sy 按素材实测校准到 2:1 网格。
 *   程序化家具：零件拼成（四朝向、可换色、可按状态发光）—— 风格与贴图一致：扁平、无描边、左亮右暗。
 */
(function () {
  var SP = 'packs/default/sprites/';

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
    /* ───────── 贴图家具（AI 素材）─────────
     * parts = 程序化备选：贴图还在加载 / 加载失败（如 DSH 里没有静态资源路由）时画它，房间永远不会缺家具。 */
    {
      id: 'bed', name: '大床', sub: '大肥鱼的窝', cat: 'bedroom', size: [2, 2], height: 90,
      palette: { frame: '#e8a36a', sheet: '#fff1e0', blanket: '#9cc9f0', pillow: '#e4f0fb', leg: '#d08f58' },
      art: { kind: 'sprite', src: SP + 'bed.webp', fit: 1.0, dx: -7, dy: 0, parts: [].concat(legs(0.06, 0.04, 1.94, 1.96, 8), [
        { t: 'box', x: 0.04, y: 0.02, z: 8, w: 1.92, d: 1.96, h: 20, c: 'frame' },
        { t: 'box', x: 0.04, y: 0.02, z: 28, w: 1.92, d: 0.1, h: 52, c: 'frame' },
        { t: 'box', x: 0.08, y: 0.12, z: 28, w: 1.84, d: 1.82, h: 12, c: 'sheet' },
        { t: 'box', x: 0.07, y: 0.85, z: 36, w: 1.86, d: 1.1, h: 6, c: 'blanket' },
        { t: 'ball', x: 0.55, y: 0.36, z: 38, r: 0.24, c: 'pillow', sq: 0.45 },
        { t: 'ball', x: 1.45, y: 0.36, z: 38, r: 0.24, c: 'pillow', sq: 0.45 },
      ]) },
      slots: [{ id: 'sleep', pose: 'sleep', at: [1.0, 1.0], z: 38, face: [1, 0], need: { energy: 0.85 }, dur: [25, 45], label: '睡觉', say: ['困了……', '睡个回笼觉'] }],
      act: 'use:sleep',
    },
    {
      id: 'desk', name: '书桌', sub: '干活的地方', cat: 'study', size: [2, 2], height: 120,
      palette: { top: '#f6eccb', main: '#8fc3ee', leg: '#8fc3ee', chair: '#e8a36a', seat: '#8fc3ee', metal: '#c4c7cf', screen: '#2b3346', glow: '#cfe8ff' },
      art: { kind: 'sprite', src: SP + 'desk.webp', fit: 0.8, dx: 23, dy: -30, parts: [].concat([
        { t: 'box', x: 0.04, y: 0.1, z: 0, w: 0.07, d: 0.07, h: 62, c: 'leg' },
        { t: 'box', x: 0.04, y: 0.84, z: 0, w: 0.07, d: 0.07, h: 62, c: 'leg' },
        { t: 'box', x: 1.3, y: 0.1, z: 0, w: 0.64, d: 0.82, h: 62, c: 'main' },
        { t: 'box', x: 0, y: 0.05, z: 62, w: 2, d: 0.92, h: 7, c: 'top' },
        { t: 'box', x: 0.8, y: 0.3, z: 69, w: 0.5, d: 0.34, h: 3, c: 'metal' },
        { t: 'box', x: 0.8, y: 0.27, z: 72, w: 0.5, d: 0.04, h: 30, c: 'metal', faces: { py: 'screen' }, glow: 'py', lit: 'working' },
      ], legs(0.47, 1.08, 0.95, 1.56, 42, 'chair', 0.06), [
        { t: 'box', x: 0.45, y: 1.06, z: 42, w: 0.52, d: 0.52, h: 6, c: 'seat' },
        { t: 'box', x: 0.45, y: 1.52, z: 48, w: 0.52, d: 0.06, h: 36, c: 'chair' },
      ]) },
      states: { working: false },
      light: { at: [1.2, 0.45], z: 95, radius: 1.5, color: '#bfe0ff', when: 'working', power: 0.7 },
      slots: [{ id: 'work', pose: 'work', at: [0.71, 1.32], z: 48, face: [0, -1], need: { fun: 0.1 }, dur: [12, 25], label: '写代码', sets: { working: true } }],
      act: 'use:work',
    },
    {
      id: 'shelf', name: '书架', sub: '读过的都堆在这儿', cat: 'study', size: [2, 1], height: 250,
      palette: { main: '#e8a36a', back: '#d08f58', book1: '#cfe3f5', book2: '#9cc9f0', book3: '#fdf6e8', book4: '#b8d6f2', book5: '#e4f0fb' },
      art: { kind: 'sprite', src: SP + 'shelf.webp', fit: 0.83, dx: 13, dy: -13, parts: [].concat([
        { t: 'box', x: 0, y: 0.02, z: 0, w: 2, d: 0.05, h: 240, c: 'back' },
        { t: 'box', x: 0, y: 0.02, z: 0, w: 0.07, d: 0.5, h: 240, c: 'main' },
        { t: 'box', x: 1.93, y: 0.02, z: 0, w: 0.07, d: 0.5, h: 240, c: 'main' },
        { t: 'box', x: 0.07, y: 0.07, z: 0, w: 1.86, d: 0.45, h: 8, c: 'main' },
        { t: 'box', x: 0.07, y: 0.07, z: 78, w: 1.86, d: 0.45, h: 5, c: 'main' },
        { t: 'box', x: 0.07, y: 0.07, z: 156, w: 1.86, d: 0.45, h: 5, c: 'main' },
        { t: 'box', x: 0, y: 0.02, z: 234, w: 2, d: 0.5, h: 6, c: 'main' },
      ], books(0.1, 1.9, 0.12, 0.34, 8, 44, 64, 2), books(0.1, 1.9, 0.12, 0.34, 83, 44, 64, 5), books(0.1, 1.9, 0.12, 0.34, 161, 40, 60, 3)) },
      slots: [{ id: 'read', pose: 'read', at: [1, 1.45], face: [0, 1], need: { fun: 0.35 }, dur: [10, 20], label: '看书', say: ['这本好看', '再看一章'] }],
      act: 'use:read',
    },
    {
      id: 'wardrobe', name: '衣柜', sub: '换装的地方', cat: 'bedroom', size: [2, 1], height: 280,
      palette: { main: '#f6e3d3', accent: '#8fc8ee', line: '#e3cbb5' },
      art: { kind: 'sprite', src: SP + 'wardrobe.webp', fit: 0.91, dx: 0, dy: 5, parts: [
        { t: 'box', x: 0.18, y: 0.04, z: 0, w: 1.64, d: 0.92, h: 270, c: 'main' },
        { t: 'box', x: 0.28, y: 0.96, z: 30, w: 0.66, d: 0.02, h: 224, c: 'accent' },
        { t: 'box', x: 0.32, y: 0.98, z: 36, w: 0.58, d: 0.02, h: 212, c: 'main' },
        { t: 'box', x: 1.06, y: 0.96, z: 30, w: 0.66, d: 0.02, h: 224, c: 'accent' },
        { t: 'box', x: 1.1, y: 0.98, z: 36, w: 0.58, d: 0.02, h: 212, c: 'main' },
        { t: 'box', x: 0.95, y: 1.0, z: 120, w: 0.03, d: 0.02, h: 26, c: 'line' },
        { t: 'box', x: 1.02, y: 1.0, z: 120, w: 0.03, d: 0.02, h: 26, c: 'line' },
      ] },
      slots: [{ id: 'dress', pose: 'look', at: [1, 1.5], face: [0, -1], need: { fun: 0.25 }, dur: [3, 5], label: '换衣服' }],
      act: 'play:outfit',
    },
    {
      id: 'lamp', name: '落地灯', sub: '啪嗒', cat: 'light', size: [1, 1], height: 235, blocks: true,
      palette: { base: '#e3a46a', metal: '#a9cbe8', shade: '#fdf2dc', glow: '#fff7cf' },
      art: { kind: 'sprite', src: SP + 'lamp.webp', fit: 0.55, dx: 0, dy: -12, parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.24, h: 8, c: 'base' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 8, r: 0.03, h: 150, c: 'metal' },
        { t: 'cone', x: 0.5, y: 0.5, z: 152, r0: 0.34, r1: 0.22, h: 56, c: 'shade', lit: 'on', open: true },
      ] },
      states: { on: false },
      light: { at: [0.5, 0.5], z: 175, radius: 3.4, color: '#ffd59a', when: 'on' },
      act: 'toggle:on', say: ['啪嗒，开灯', '啪嗒，关灯'],
    },
    {
      id: 'plant', name: '圆叶绿植', sub: '摸摸叶子', cat: 'plant', size: [1, 1], height: 130,
      palette: { pot: '#c9784e', leaf: '#6fbf73', leaf2: '#8fd28f' },
      art: { kind: 'sprite', src: SP + 'plant.webp', fit: 0.49, dx: -6, dy: -27, parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.22, h: 36, c: 'pot' },
        { t: 'ball', x: 0.5, y: 0.5, z: 34, r: 0.28, c: 'leaf' },
        { t: 'ball', x: 0.4, y: 0.42, z: 58, r: 0.2, c: 'leaf2' },
        { t: 'ball', x: 0.6, y: 0.52, z: 64, r: 0.19, c: 'leaf' },
      ] },
      act: 'shake', say: ['叶子沙沙响', '要浇水啦', '长高了一点'],
    },
    {
      id: 'rug', name: '格子地毯', sub: 'Q 弹', cat: 'rug', size: [3, 3], mount: 'flat',
      palette: { main: '#8fc3ee', border: '#f6f0e4' },
      art: { kind: 'sprite', src: SP + 'rug.webp', fit: 0.85, sy: 0.6, dx: -27, dy: -25, parts: [{ t: 'rug', shape: 'round', x: 0, y: 0, w: 3, d: 3, c: 'main', b: 'border', pattern: 'rings' }] },
      act: 'shake', say: ['Q 弹 Q 弹', '软乎乎'],
    },

    /* ───────── 程序化家具（四朝向、可换色） ───────── */
    {
      id: 'sofa', name: '双人沙发', sub: '陷进去就不想起来', cat: 'living', size: [2, 1], height: 78,
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
      id: 'chair', name: '木椅子', sub: '坐一会儿', cat: 'living', size: [1, 1], height: 92,
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
      id: 'table', name: '长餐桌', sub: '吃饭和聊天', cat: 'living', size: [2, 1], height: 70,
      palette: { main: '#f3e1b6', leg: '#e3a46a', cup: '#ffffff', flower: '#ff9fb2' },
      art: { kind: 'proc', parts: [].concat(legs(0.1, 0.14, 1.9, 0.9, 56), [
        { t: 'box', x: 0.04, y: 0.08, z: 56, w: 1.92, d: 0.84, h: 8, c: 'main' },
        { t: 'cyl', x: 1.55, y: 0.5, z: 64, r: 0.07, h: 11, c: 'cup' },
        { t: 'cyl', x: 0.45, y: 0.45, z: 64, r: 0.08, h: 16, c: '#a9cbef' },
        { t: 'ball', x: 0.45, y: 0.45, z: 78, r: 0.09, c: 'flower' },
      ]) },
    },
    {
      id: 'round-table', name: '小圆桌', sub: '放杯奶茶', cat: 'living', size: [1, 1], height: 62,
      palette: { main: '#f6efe4', leg: '#c98a55' },
      art: { kind: 'proc', parts: [
        { t: 'cyl', x: 0.5, y: 0.5, z: 0, r: 0.24, h: 4, c: 'leg' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 4, r: 0.05, h: 50, c: 'leg' },
        { t: 'cyl', x: 0.5, y: 0.5, z: 54, r: 0.42, h: 6, c: 'main' },
        { t: 'cyl', x: 0.62, y: 0.42, z: 60, r: 0.07, h: 10, c: '#d9a26b' },
      ] },
    },
    {
      id: 'coffee-table', name: '茶几', sub: '摆点零食', cat: 'living', size: [1, 1], height: 42,
      palette: { main: '#e3a46a', leg: '#c98a55', accent: '#f28f6b' },
      art: { kind: 'proc', parts: [].concat(legs(0.12, 0.12, 0.88, 0.88, 32), [
        { t: 'box', x: 0.12, y: 0.12, z: 10, w: 0.76, d: 0.76, h: 3, c: 'leg' },
        { t: 'box', x: 0.08, y: 0.08, z: 32, w: 0.84, d: 0.84, h: 6, c: 'main' },
        { t: 'box', x: 0.3, y: 0.32, z: 38, w: 0.3, d: 0.22, h: 4, c: 'accent' },
      ]) },
    },
    {
      id: 'bookcase', name: '大书柜', sub: '四朝向的书柜', cat: 'study', size: [2, 1], height: 190,
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
      id: 'bed-single', name: '单人床', sub: '四朝向的小床', cat: 'bedroom', size: [1, 2], height: 70,
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
      id: 'desk-pc', name: '电脑桌', sub: '带小凳子', cat: 'study', size: [2, 2], height: 104,
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
      id: 'fridge', name: '冰箱', sub: '零食仓库', cat: 'kitchen', size: [1, 1], height: 180,
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
      act: 'play:snack',
    },
    {
      id: 'tv', name: '电视柜', sub: '一起看电视', cat: 'living', size: [2, 1], height: 112,
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
      id: 'aquarium', name: '鱼缸', sub: '小鱼游来游去', cat: 'fun', size: [2, 1], height: 112,
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
      id: 'floor-lamp', name: '台式落地灯', sub: '四朝向灯', cat: 'light', size: [1, 1], height: 180,
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
      id: 'plant-big', name: '大盆栽', sub: '要浇水啦', cat: 'plant', size: [1, 1], height: 120,
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
      id: 'beanbag', name: '懒人豆袋', sub: '窝一会儿', cat: 'living', size: [1, 1], height: 46,
      palette: { main: '#f2b56b' },
      variants: [{ main: '#9fc8f0' }, { main: '#f29cb5' }, { main: '#a7d3a0' }],
      art: { kind: 'proc', parts: [
        { t: 'ball', x: 0.5, y: 0.56, z: 0, r: 0.36, c: 'main', sq: 0.62 },
        { t: 'ball', x: 0.5, y: 0.34, z: 14, r: 0.26, c: 'main', sq: 0.8 },
      ] },
      slots: [{ id: 'sit', pose: 'sit', at: [0.5, 0.6], z: 24, face: [0, 1], need: { fun: 0.2, energy: 0.12 }, dur: [8, 16], label: '窝一会儿' }],
    },
    {
      id: 'rug-round', name: '圆地毯', sub: '软软的', cat: 'rug', size: [3, 3], mount: 'flat',
      palette: { main: '#a9cbef', border: '#f6f0e4' },
      variants: [{ main: '#f5c9c4', border: '#fff6ee' }, { main: '#c6e3c0', border: '#f4f8ef' }],
      art: { kind: 'proc', parts: [{ t: 'rug', shape: 'round', x: 0, y: 0, w: 3, d: 3, c: 'main', b: 'border', pattern: 'rings' }] },
      act: 'shake', say: ['软乎乎'],
    },
    {
      id: 'rug-rect', name: '条纹地毯', sub: '可以打滚', cat: 'rug', size: [3, 2], mount: 'flat',
      palette: { main: '#f2d1b3', border: '#d9a77a' },
      variants: [{ main: '#cfe3f5', border: '#8fb0c9' }, { main: '#e8dcf5', border: '#b39ddb' }],
      art: { kind: 'proc', parts: [{ t: 'rug', shape: 'rect', x: 0, y: 0, w: 3, d: 2, c: 'main', b: 'border', pattern: 'stripes' }] },
      act: 'shake', say: ['在地毯上打个滚'],
    },

    /* ───────── 厨房 ───────── */
    {
      id: 'counter', name: '橱柜', sub: '切菜备料', cat: 'kitchen', size: [2, 1], height: 112,
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
      id: 'stove', name: '灶台', sub: '咕嘟咕嘟', cat: 'kitchen', size: [2, 1], height: 118,
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
      id: 'sink', name: '水槽', sub: '洗洗涮涮', cat: 'kitchen', size: [1, 1], height: 120,
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
      id: 'tree', name: '大树', sub: '夏天在树下乘凉', cat: 'outdoor', size: [2, 2], height: 240,
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
      id: 'flowerbed', name: '花坛', sub: '要浇水哦', cat: 'outdoor', size: [2, 1], height: 48,
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
      id: 'bench', name: '长椅', sub: '晒太阳', cat: 'outdoor', size: [2, 1], height: 80,
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
      id: 'swing', name: '秋千', sub: '荡高高', cat: 'outdoor', size: [2, 1], height: 190,
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
      id: 'pond', name: '小池塘', sub: '锦鲤游来游去', cat: 'outdoor', size: [2, 2], height: 10,
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
      id: 'garden-lamp', name: '庭院灯', sub: '晚上点亮', cat: 'light', size: [1, 1], height: 150,
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
      id: 'mailbox', name: '信箱', sub: '有时候会有信', cat: 'outdoor', size: [1, 1], height: 104,
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
      id: 'fence', name: '小栅栏', sub: '围出一块小院', cat: 'outdoor', size: [2, 1], height: 56,
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
    { id: 'window', name: '窗户', sub: '点一下换天气', mount: 'wall', wsize: [1.6, 120], wz: 100, art: { kind: 'wall', draw: 'window' }, palette: { frame: '#ffffff', curtain: '#f6c9a8' }, variants: [{ curtain: '#a9cbef' }, { curtain: '#c6e3c0' }], act: 'weather' },
    { id: 'window-plain', name: '小窗', sub: '没有窗帘', mount: 'wall', wsize: [1.1, 100], wz: 110, art: { kind: 'wall', draw: 'window' }, palette: { frame: '#ffffff' }, act: 'weather' },
    { id: 'door', name: '房门', sub: '通往家里的另一个房间', mount: 'wall', wsize: [1.0, 200], wz: 0, art: { kind: 'wall', draw: 'door' }, palette: { frame: '#ffffff', main: '#c98a55' }, states: { open: false }, portal: true },
    { id: 'frame', name: '挂画', sub: '大海和一只小鲸鱼', mount: 'wall', wsize: [1.0, 80], wz: 150, art: { kind: 'wall', draw: 'frame' }, palette: { frame: '#c99a6b', sky: '#9fd0f0', sea: '#5b8def' }, act: 'info' },
    { id: 'clock', name: '挂钟', sub: '走的是真实时间', mount: 'wall', wsize: [0.8, 52], wz: 190, art: { kind: 'wall', draw: 'clock' }, palette: { frame: '#e3a46a', accent: '#e8505b' }, act: 'info' },
    { id: 'wall-shelf', name: '墙上搁板', sub: '放几本书', mount: 'wall', wsize: [1.4, 44], wz: 150, art: { kind: 'wall', draw: 'shelf' }, palette: { main: '#d9a066' } },
    { id: 'wall-cabinet', name: '吊柜', sub: '碗碟都在里面', mount: 'wall', wsize: [1.8, 70], wz: 165, art: { kind: 'wall', draw: 'cabinet' }, palette: { main: '#d9b48a', accent: '#fbf6ee' }, variants: [{ main: '#f6efe4', accent: '#8fc3ee' }, { main: '#f6efe4', accent: '#a7d3a0' }] },
    { id: 'kitchen-rack', name: '厨具挂架', sub: '锅铲汤勺', mount: 'wall', wsize: [1.4, 56], wz: 135, art: { kind: 'wall', draw: 'rack' }, palette: { main: '#b8c0cc' } },
    { id: 'poster', name: '海报', sub: 'DeepSeek', mount: 'wall', wsize: [0.8, 100], wz: 110, art: { kind: 'wall', draw: 'poster' }, palette: { main: '#4d6bfe', accent: '#ffffff' }, states: { text: 'DeepSeek' } },
  ];

  /* ───────── 场景模板 ───────── */
  var bedroom = {
    format: 'roomkit.scene', v: 2, id: 'home', name: '大肥鱼的卧室',
    room: {
      w: 7, h: 6, mats: [{ kind: 'wood', color: '#e3a46a' }],
      walls: { left: true, right: true, height: 300, color: '#f6ead6', wainscot: '#8fb0c9', trim: '#ffffff', pattern: 'plain' },
      slab: 18,
    },
    objects: [
      { id: 'bed1', def: 'bed', x: 0, y: 0, rot: 0 },
      { id: 'lamp1', def: 'lamp', x: 2, y: 0, rot: 0 },
      { id: 'desk1', def: 'desk', x: 3, y: 0, rot: 0 },
      { id: 'shelf1', def: 'shelf', x: 0, y: 3, rot: 1 },
      { id: 'rug1', def: 'rug-round', x: 2, y: 2, rot: 0 },
      { id: 'bean1', def: 'beanbag', x: 5, y: 3, rot: 0 },
      { id: 'plant1', def: 'plant', x: 6, y: 2, rot: 0 },
      { id: 'fridge1', def: 'fridge', x: 5, y: 0, rot: 0 },
      { id: 'win1', def: 'window', wall: 'right', at: 3.9, z: 100 },
      { id: 'door1', def: 'door', wall: 'right', at: 6.5, z: 0, state: { to: 'living' } },
      { id: 'frame1', def: 'frame', wall: 'left', at: 1.0, z: 150 },
      { id: 'clock1', def: 'clock', wall: 'left', at: 2.5, z: 200 },
    ],
    agents: [
      { id: 'whale', name: '大肥鱼', kind: 'girl', brain: 'pet', character: 'dafeiyu', x: 3.5, y: 3.5, look: { body: '#5b8def', hat: 'maid' } },
      { id: 'paopao', name: '泡泡', kind: 'girl', brain: 'auto', character: 'paopao', follow: true, x: 4.5, y: 4.5, look: { body: '#4fc3d9', hair: '#2b7f9e', hat: 'bow', accent: '#ff8fb1', size: 0.95 } },
    ],
    env: { period: null, weather: 'clear' },
  };

  var living = {
    format: 'roomkit.scene', v: 2, id: 'living', name: '鲸鱼客厅',
    room: {
      w: 9, h: 7, mats: [{ kind: 'wood', color: '#d9a575' }, { kind: 'tile', color: '#e8e1d4' }],
      cells: ['aaaaaabbb', 'aaaaaabbb', 'aaaaaabbb', 'aaaaaaaaa', 'aaaaaaaaa', 'aaaaaaaaa', 'aaaaaaa..'],
      walls: { left: true, right: true, height: 300, color: '#e3f2ea', wainscot: '#7fb59a', trim: '#ffffff', pattern: 'stripes' },
      slab: 18,
    },
    objects: [
      { id: 'tv1', def: 'tv', x: 1, y: 0, rot: 0 },
      { id: 'sofa1', def: 'sofa', x: 1, y: 3, rot: 2 },
      { id: 'ct1', def: 'coffee-table', x: 1, y: 2, rot: 0 },
      { id: 'rugr', def: 'rug-rect', x: 0, y: 1, rot: 0 },
      { id: 'aq1', def: 'aquarium', x: 0, y: 4, rot: 1 },
      { id: 'fridge1', def: 'fridge', x: 7, y: 0, rot: 0 },
      { id: 'table1', def: 'table', x: 6, y: 2, rot: 0 },
      { id: 'ch1', def: 'chair', x: 6, y: 3, rot: 2 },
      { id: 'ch2', def: 'chair', x: 7, y: 3, rot: 2 },
      { id: 'bean1', def: 'beanbag', x: 4, y: 5, rot: 0 },
      { id: 'bean2', def: 'beanbag', x: 5, y: 5, rot: 0, colors: { main: '#9fc8f0' }, variant: 0 },
      { id: 'lamp1', def: 'floor-lamp', x: 0, y: 0, rot: 0 },
      { id: 'plant1', def: 'plant-big', x: 8, y: 5, rot: 0 },
      { id: 'bc1', def: 'bookcase', x: 4, y: 0, rot: 0 },
      { id: 'win1', def: 'window', wall: 'right', at: 6.3, z: 100 },
      { id: 'door1', def: 'door', wall: 'left', at: 6.0, z: 0, state: { to: 'home' } },
      { id: 'door2', def: 'door', wall: 'right', at: 8.4, z: 0, state: { to: 'kitchen' } },
      { id: 'poster1', def: 'poster', wall: 'right', at: 3.0, z: 140 },
      { id: 'clock1', def: 'clock', wall: 'left', at: 2.2, z: 200 },
      { id: 'shelfw', def: 'wall-shelf', wall: 'left', at: 3.6, z: 150 },
    ],
    agents: [
      { id: 'whale', name: '大肥鱼', kind: 'girl', brain: 'pet', character: 'dafeiyu', x: 3.5, y: 4.5, look: { body: '#5b8def', hat: 'maid' } },
      { id: 'paopao', name: '泡泡', kind: 'girl', brain: 'auto', character: 'paopao', follow: true, x: 5.5, y: 4.5, look: { body: '#4fc3d9', hair: '#2b7f9e', hat: 'bow', accent: '#ff8fb1', size: 0.95 } },
      { id: 'tuanzi', name: '团子', kind: 'girl', brain: 'auto', x: 2.5, y: 5.5, look: { body: '#f29cb5', hair: '#b5577a', hat: 'cap', accent: '#ffd36e', size: 0.92 } },
    ],
    env: { period: null, weather: 'clear' },
  };

  var kitchen = {
    format: 'roomkit.scene', v: 2, id: 'kitchen', name: '暖阳厨房',
    room: {
      w: 7, h: 6, mats: [{ kind: 'tile', color: '#f1e6d2' }],
      walls: { left: true, right: true, height: 290, color: '#fbf1e1', wainscot: '#e9b48a', trim: '#ffffff', pattern: 'dots' },
      slab: 18,
    },
    objects: [
      { id: 'fridge1', def: 'fridge', x: 0, y: 0, rot: 0, variant: 0 },
      { id: 'counter1', def: 'counter', x: 1, y: 0, rot: 0 },
      { id: 'stove1', def: 'stove', x: 3, y: 0, rot: 0 },
      { id: 'sink1', def: 'sink', x: 5, y: 0, rot: 0 },
      { id: 'plant1', def: 'plant-big', x: 6, y: 0, rot: 0 },
      { id: 'table1', def: 'table', x: 3, y: 3, rot: 0 },
      { id: 'ch1', def: 'chair', x: 3, y: 2, rot: 0 },
      { id: 'ch2', def: 'chair', x: 4, y: 2, rot: 0 },
      { id: 'ch3', def: 'chair', x: 3, y: 4, rot: 2 },
      { id: 'ch4', def: 'chair', x: 4, y: 4, rot: 2 },
      { id: 'lamp1', def: 'floor-lamp', x: 6, y: 2, rot: 0 },
      { id: 'cab1', def: 'wall-cabinet', wall: 'right', at: 2.0, z: 170 },
      { id: 'rack1', def: 'kitchen-rack', wall: 'right', at: 4.0, z: 140 },
      { id: 'win1', def: 'window-plain', wall: 'right', at: 5.5, z: 130 },
      { id: 'door1', def: 'door', wall: 'left', at: 4.6, z: 0, state: { to: 'living' } },
      { id: 'door2', def: 'door', wall: 'left', at: 2.0, z: 0, state: { to: 'yard' } },
      { id: 'clock1', def: 'clock', wall: 'left', at: 3.3, z: 205 },
    ],
    agents: [
      { id: 'whale', name: '大肥鱼', kind: 'girl', brain: 'pet', character: 'dafeiyu', x: 2.5, y: 1.5, look: { body: '#5b8def', hat: 'maid' } },
      { id: 'paopao', name: '泡泡', kind: 'girl', brain: 'auto', character: 'paopao', follow: true, x: 5.5, y: 2.5, look: { body: '#4fc3d9', hair: '#2b7f9e', hat: 'bow', accent: '#ff8fb1', size: 0.95 } },
    ],
    env: { period: null, weather: 'clear' },
  };

  var yard = {
    format: 'roomkit.scene', v: 2, id: 'yard', name: '后院小花园',
    room: {
      w: 10, h: 8, outdoor: true,
      mats: [{ kind: 'grass', color: '#9bd17a' }, { kind: 'stone', color: '#d9d2c3' }, { kind: 'wood', color: '#c98a55' }],
      cells: ['cccccaaaaa', 'cccccaaaaa', 'aabaaaaaaa', 'aabaaaaaaa', 'aabbbbaaaa', 'aaaaabaaaa', 'aaaaabaaaa', 'aaaaabaaaa'],
      walls: { left: false, right: true, height: 260, color: '#e9c4a6', wainscot: '#b98a6a', trim: '#f6efe4', pattern: 'bricks' },
      slab: 22,
    },
    objects: [
      { id: 'door1', def: 'door', wall: 'right', at: 2.0, z: 0, state: { to: 'kitchen' } },
      { id: 'win1', def: 'window', wall: 'right', at: 5.0, z: 100 },
      { id: 'bench1', def: 'bench', x: 3, y: 0, rot: 0 },
      { id: 'tree1', def: 'tree', x: 7, y: 1, rot: 0 },
      { id: 'fb1', def: 'flowerbed', x: 0, y: 2, rot: 1 },
      { id: 'fb2', def: 'flowerbed', x: 6, y: 6, rot: 0, variant: 0 },
      { id: 'pond1', def: 'pond', x: 3, y: 5, rot: 0 },
      { id: 'swing1', def: 'swing', x: 7, y: 4, rot: 0 },
      { id: 'lamp1', def: 'garden-lamp', x: 0, y: 0, rot: 0 },
      { id: 'lamp2', def: 'garden-lamp', x: 1, y: 5, rot: 0 },
      { id: 'mail1', def: 'mailbox', x: 9, y: 7, rot: 0 },
      { id: 'fence1', def: 'fence', x: 0, y: 7, rot: 0 },
      { id: 'fence2', def: 'fence', x: 2, y: 7, rot: 0 },
      { id: 'fence3', def: 'fence', x: 7, y: 7, rot: 0 },
    ],
    agents: [
      { id: 'whale', name: '大肥鱼', kind: 'girl', brain: 'pet', character: 'dafeiyu', x: 2.5, y: 1.5, look: { body: '#5b8def', hat: 'maid' } },
      { id: 'paopao', name: '泡泡', kind: 'girl', brain: 'auto', character: 'paopao', follow: true, x: 4.5, y: 3.5, look: { body: '#4fc3d9', hair: '#2b7f9e', hat: 'bow', accent: '#ff8fb1', size: 0.95 } },
      { id: 'qiuqiu', name: '球球', kind: 'whale', brain: 'auto', x: 5.5, y: 6.5, look: { body: '#7ec8e3', belly: '#f2fbff', size: 1.1 } },
    ],
    env: { period: null, weather: 'clear' },
  };

  /* ───────── 剧情（有剧情、有选择、多角色同台；见 docs/04 剧本格式） ───────── */
  var stories = [
    {
      id: 'welcome', name: '初次见面', once: true,
      trigger: { on: 'start', scene: 'home' },
      roles: { fish: 'whale', pao: 'paopao' },
      nodes: {
        start: [
          { do: 'goto', who: 'fish', to: [3.5, 4.3] },
          { do: 'line', who: 'fish', text: '欸？有人来了！', expr: 'surprised', emote: '!' },
          { do: 'line', who: 'fish', text: '你好呀，我是大肥鱼，这里是我的小窝~', expr: 'happy' },
          { do: 'goto', who: 'pao', to: 'whale', run: true },
          { do: 'line', who: 'pao', text: '还有我还有我！我是泡泡！', emote: 'heart' },
          { do: 'choice', text: '要参观一下吗？', options: [{ label: '好呀，带我看看', goto: 'tour' }, { label: '下次吧', goto: 'later' }] },
        ],
        tour: [
          { do: 'goto', who: 'fish', obj: 'bed1' },
          { do: 'line', who: 'fish', text: '这是我的床。午觉、回笼觉、晚觉，都在这儿睡。', expr: 'happy' },
          { do: 'goto', who: 'fish', obj: 'desk1' },
          { do: 'line', who: 'fish', text: '这是书桌——你在 DSH 里忙的时候，我就坐在这儿陪你写代码。' },
          { do: 'goto', who: 'fish', obj: 'fridge1' },
          { do: 'line', who: 'pao', text: '那个是冰箱！里面有好多零食！', emote: 'spark' },
          { do: 'line', who: 'fish', text: '……泡泡，不许偷吃。', expr: 'sad' },
          { do: 'line', who: 'fish', text: '想改造房间的话，点下面的「🛠 布置」，家具随便摆~', expr: 'happy' },
          { do: 'goto', who: 'fish', obj: 'door1' },
          { do: 'line', who: 'fish', text: '这扇门通到楼下客厅，点门就能过去，泡泡和团子常在那儿玩。', expr: 'happy' },
          { do: 'set', flag: 'toured' },
        ],
        later: [
          { do: 'line', who: 'fish', text: '好吧~ 那我去睡个回笼觉，想我了就点点我。', expr: 'sleep' },
          { do: 'cmd', cmd: { op: 'agent.use', id: '$fish', obj: 'bed1', slot: 'sleep', s: 40 } },
        ],
      },
    },
    {
      id: 'fridge-secret', name: '冰箱的秘密', marker: false,
      trigger: { on: 'click', obj: 'fridge1', chance: 0.6 },
      roles: { fish: 'whale', pao: 'paopao' },
      nodes: {
        start: [
          { do: 'use', who: 'pao', obj: 'fridge1', slot: 'eat', s: 2.5 },
          { do: 'line', who: 'pao', text: '（小声）就吃一口……就一口……', expr: 'happy' },
          { do: 'goto', who: 'fish', to: 'paopao', run: true },
          { do: 'line', who: 'fish', text: '泡泡！又偷吃！', expr: 'surprised', emote: '!' },
          { do: 'choice', text: '你要……', options: [{ label: '帮泡泡打掩护', goto: 'cover' }, { label: '和大肥鱼一起"审问"', goto: 'catch' }] },
        ],
        cover: [
          { do: 'line', who: 'pao', text: '是…是{{user}}让我拿的！', emote: 'sweat' },
          { do: 'line', who: 'fish', text: '……那好吧，下不为例。分我一半！', expr: 'happy', emote: 'heart' },
          { do: 'inc', flag: 'snacks' },
        ],
        catch: [
          { do: 'line', who: 'pao', text: '呜…对不起……', expr: 'sad', pose: 'sad' },
          { do: 'line', who: 'fish', text: '算啦算啦，一起吃吧！', expr: 'happy' },
          { par: [{ do: 'pose', who: 'fish', pose: 'eat', s: 3 }, { do: 'pose', who: 'pao', pose: 'eat', s: 3 }] },
        ],
      },
    },
    {
      id: 'night-reading', name: '深夜读书', daily: true,
      trigger: { on: 'hour', from: 22, to: 3, scene: 'home' },
      roles: { fish: 'whale' },
      nodes: {
        start: [
          { do: 'state', obj: 'lamp1', patch: { on: true } },
          { do: 'use', who: 'fish', obj: 'shelf1', slot: 'read', s: 3 },
          { do: 'line', who: 'fish', text: '这么晚了，{{user}}还没睡呀？', expr: 'surprised' },
          { do: 'choice', options: [{ label: '陪你看会儿书', goto: 'stay' }, { label: '一起早点睡吧', goto: 'sleep' }] },
        ],
        stay: [
          { do: 'line', who: 'fish', text: '嘿嘿，那我给你讲讲这本书……', expr: 'happy', emote: 'heart' },
          { do: 'pose', who: 'fish', pose: 'read', s: 3 },
          { do: 'set', flag: 'readTogether' },
        ],
        sleep: [
          { do: 'line', who: 'fish', text: '晚安~ 明天见！', expr: 'happy' },
          { do: 'state', obj: 'lamp1', patch: { on: false } },
          { do: 'cmd', cmd: { op: 'agent.use', id: '$fish', obj: 'bed1', slot: 'sleep', s: 90 } },
        ],
      },
    },
    {
      id: 'living-party', name: '客厅派对', once: true,
      trigger: { on: 'start', scene: 'living' },
      roles: { fish: 'whale', pao: 'paopao', tuan: 'tuanzi' },
      nodes: {
        start: [
          { do: 'line', who: 'tuan', text: '大家都到齐啦！', expr: 'happy', emote: 'spark' },
          { do: 'line', who: 'fish', text: '那……开派对！', expr: 'happy' },
          { do: 'state', obj: 'tv1', patch: { on: true } },
          { par: [{ do: 'pose', who: 'fish', pose: 'dance', s: 4 }, { do: 'pose', who: 'pao', pose: 'dance', s: 4 }, { do: 'pose', who: 'tuan', pose: 'dance', s: 4 }] },
          { do: 'line', who: 'pao', text: '下次叫上更多鲸鱼来玩吧！', emote: 'heart' },
        ],
      },
    },

    {
      id: 'kitchen-first', name: '第一次下厨', once: true,
      trigger: { on: 'start', scene: 'kitchen' },
      roles: { fish: 'whale', pao: 'paopao' },
      nodes: {
        start: [
          { do: 'goto', who: 'fish', obj: 'stove1' },
          { do: 'line', who: 'fish', text: '欢迎来到厨房！今天我来露一手~', expr: 'happy' },
          { do: 'use', who: 'fish', obj: 'stove1', slot: 'cook', s: 3 },
          { do: 'goto', who: 'pao', to: 'whale', run: true },
          { do: 'line', who: 'pao', text: '好香！做的什么做的什么？', emote: 'spark' },
          { do: 'choice', text: '{{user}}想吃……', options: [{ label: '煎蛋！', goto: 'egg' }, { label: '海鲜面！', goto: 'noodle' }] },
        ],
        egg: [
          { do: 'use', who: 'fish', obj: 'stove1', slot: 'cook', s: 2.5 },
          { do: 'line', who: 'fish', text: '煎蛋来咯——呃，好像有点焦……', expr: 'sad', emote: 'sweat' },
          { do: 'line', who: 'pao', text: '焦的才香！', expr: 'happy', emote: 'heart' },
          { do: 'set', flag: 'cooked', value: 'egg' },
          { do: 'goto', node: 'eat' },
        ],
        noodle: [
          { do: 'line', who: 'fish', text: '海鲜面……等等，我是鲸鱼，吃海鲜好像不太对？', expr: 'surprised', emote: '!' },
          { do: 'line', who: 'pao', text: '那就吃泡面！', expr: 'happy' },
          { do: 'line', who: 'fish', text: '……行吧。', expr: 'sad' },
          { do: 'set', flag: 'cooked', value: 'noodle' },
          { do: 'goto', node: 'eat' },
        ],
        eat: [
          { par: [{ do: 'pose', who: 'fish', pose: 'eat', s: 3 }, { do: 'pose', who: 'pao', pose: 'eat', s: 3 }] },
          { do: 'line', who: 'fish', text: '以后饿了就来厨房找我~', expr: 'happy' },
        ],
      },
    },
    {
      id: 'stove-oops', name: '锅里冒泡泡', marker: false,
      trigger: { on: 'click', obj: 'stove1', chance: 0.4 },
      roles: { fish: 'whale', pao: 'paopao' },
      nodes: {
        start: [
          { do: 'use', who: 'fish', obj: 'stove1', slot: 'cook', s: 2 },
          { do: 'line', who: 'fish', text: '咦，锅里怎么一直冒泡泡……', expr: 'surprised' },
          { do: 'line', who: 'fish', text: '啊啊啊要溢出来了！', expr: 'worried', emote: '!', pose: 'jump', s: 1.5 },
          { do: 'choice', text: '快！', options: [{ label: '关火！', goto: 'off' }, { label: '叫泡泡来帮忙', goto: 'pao' }] },
        ],
        off: [
          { do: 'state', obj: 'stove1', patch: { on: false } },
          { do: 'line', who: 'fish', text: '呼……得救了。{{user}}反应真快！', expr: 'happy', emote: 'heart' },
        ],
        pao: [
          { do: 'goto', who: 'pao', to: 'whale', run: true },
          { do: 'line', who: 'pao', text: '我来吹一吹！呼——呼——', expr: 'determined' },
          { do: 'line', who: 'fish', text: '泡泡你吹出来的泡泡更多了啦！', expr: 'surprised', emote: 'sweat' },
          { do: 'state', obj: 'stove1', patch: { on: false } },
          { do: 'inc', flag: 'oops' },
        ],
      },
    },
    {
      id: 'midnight-noodles', name: '深夜泡面', daily: true,
      trigger: { on: 'hour', from: 23, to: 3, scene: 'kitchen' },
      roles: { fish: 'whale' },
      nodes: {
        start: [
          { do: 'state', obj: 'stove1', patch: { on: true } },
          { do: 'use', who: 'fish', obj: 'stove1', slot: 'cook', s: 3 },
          { do: 'line', who: 'fish', text: '嘘——{{user}}也饿醒了吗？', expr: 'surprised' },
          { do: 'choice', options: [{ label: '一起吃一碗', goto: 'share' }, { label: '早点睡吧', goto: 'sleep' }] },
        ],
        share: [
          { do: 'line', who: 'fish', text: '那加个蛋！两个人吃的面最好吃了。', expr: 'happy', emote: 'heart' },
          { do: 'pose', who: 'fish', pose: 'eat', s: 3 },
          { do: 'state', obj: 'stove1', patch: { on: false } },
          { do: 'set', flag: 'noodlesTogether' },
        ],
        sleep: [
          { do: 'line', who: 'fish', text: '嗯……吃完这碗就去睡。晚安~', expr: 'sleep' },
          { do: 'state', obj: 'stove1', patch: { on: false } },
        ],
      },
    },
    {
      id: 'yard-hello', name: '院子里的球球', once: true,
      trigger: { on: 'start', scene: 'yard' },
      roles: { fish: 'whale', pao: 'paopao', qiu: 'qiuqiu' },
      nodes: {
        start: [
          { do: 'line', who: 'qiu', text: '噗噜噗噜~', emote: 'heart' },
          { do: 'line', who: 'fish', text: '这是球球，住在院子里的小鲸鱼！', expr: 'happy' },
          { do: 'goto', who: 'qiu', obj: 'pond1' },
          { do: 'line', who: 'pao', text: '它最喜欢在池塘边看锦鲤，看着看着就睡着了。', emote: 'spark' },
          { do: 'choice', text: '要和球球打个招呼吗？', options: [{ label: '摸摸球球', goto: 'pet' }, { label: '给它起个外号', goto: 'nick' }] },
        ],
        pet: [
          { do: 'line', who: 'qiu', text: '噗噜！（开心地转了个圈）', emote: 'heart' },
          { do: 'line', who: 'fish', text: '它喜欢你！以后常来院子玩吧~', expr: 'happy' },
        ],
        nick: [
          { do: 'line', who: 'pao', text: '叫它「小胖球」怎么样！', expr: 'happy' },
          { do: 'line', who: 'qiu', text: '噗噜……（不太满意）', emote: 'sweat' },
          { do: 'line', who: 'fish', text: '哈哈，还是叫球球吧。', expr: 'happy' },
          { do: 'set', flag: 'nickname' },
        ],
      },
    },
    {
      id: 'stargazing', name: '院子里看星星', daily: true,
      trigger: { on: 'hour', from: 20, to: 2, scene: 'yard' },
      roles: { fish: 'whale', pao: 'paopao' },
      nodes: {
        start: [
          { do: 'state', obj: 'lamp1', patch: { on: true } },
          { do: 'use', who: 'fish', obj: 'bench1', slot: 'sit1', s: 3 },
          { do: 'line', who: 'fish', text: '{{user}}，今晚的星星好多！', expr: 'happy' },
          { do: 'choice', options: [{ label: '许个愿吧', goto: 'wish' }, { label: '一起数星星', goto: 'count' }] },
        ],
        wish: [
          { do: 'line', who: 'fish', text: '我希望……{{user}}写的代码，一次就能跑通！', expr: 'happy', emote: 'spark' },
          { do: 'line', who: 'pao', text: '我希望冰箱里的零食永远吃不完！', emote: 'heart' },
          { do: 'set', flag: 'wished' },
        ],
        count: [
          { do: 'line', who: 'fish', text: '一颗、两颗……三百二十七颗……三百……', expr: 'sleep' },
          { do: 'pose', who: 'fish', pose: 'sleep', s: 3 },
          { do: 'line', who: 'pao', text: '（小声）她睡着了……', expr: 'happy' },
        ],
      },
    },
    {
      id: 'yard-letter', name: '一封信', once: true,
      trigger: { on: 'click', obj: 'mail1' },
      roles: { fish: 'whale' },
      nodes: {
        start: [
          { do: 'goto', who: 'fish', obj: 'mail1' },
          { do: 'line', who: 'fish', text: '有信！……咦，是写给{{user}}的。', expr: 'surprised', emote: '!' },
          { do: 'line', who: 'fish', text: '「谢谢你每天都来看我。今天也辛苦啦！——大肥鱼」', expr: 'shy', emote: 'heart' },
          { do: 'line', who: 'fish', text: '……被你发现了，是我写的。', expr: 'shy' },
        ],
      },
    },
  ];

  /* ───────── 小剧场 ───────── */
  var plays = [
    { id: 'snack', name: '偷吃零食', steps: [
      { do: 'say', text: '冰箱里有什么呢~' },
      { do: 'use', obj: '$target', slot: 'eat', s: 4 },
      { do: 'expr', expr: 'happy', s: 2 },
      { do: 'say', text: '嗝~ 好吃！' },
      { do: 'emote', kind: 'heart', s: 2 },
    ] },
    { id: 'outfit', name: '换装', steps: [
      { do: 'use', obj: '$target', slot: 'dress', s: 1.5 },
      { do: 'outfit' },
      { do: 'say', text: '换好啦，好看吗？' },
      { do: 'emote', kind: 'spark', s: 2 },
    ] },
  ];

  /* ───────── 抽屉文案（点家具时的信息窗；接 DSH 后可换成待办/会话/余额） ───────── */
  var INFO = {
    frame: { title: '挂画', sub: '大海和一只小鲸鱼', lines: [['画的是', '老家的海'], ['作者', '大肥鱼（自称）']], links: [{ label: '看看窗外', obj: 'window' }] },
    clock: { title: '挂钟', sub: '走的是你电脑上的时间', lines: ['房间的天色、灯光也跟着真实时间变化', '顶栏的 🕒 可以手动切时段'] },
    mailbox: { title: '信箱', sub: '空空的', lines: ['今天没有新的信', '说不定哪天会收到一封'] },
  };
  function content(o, def) { return INFO[def.id] || null; }

  window.RoomKitPacks = window.RoomKitPacks || [];
  /* ───────── 默认的家：卧室在楼上；楼下客厅 ↔ 厨房，厨房后门通小院 ───────── */
  var home = {
    name: '大肥鱼的家', floors: ['2F', '1F', '户外'],
    rooms: [
      { id: 'home', name: '卧室', floor: '2F', tpl: 'home' },
      { id: 'living', name: '客厅', floor: '1F', tpl: 'living' },
      { id: 'kitchen', name: '厨房', floor: '1F', tpl: 'kitchen' },
      { id: 'yard', name: '小院', floor: '户外', tpl: 'yard' },
    ],
  };

  window.RoomKitPacks.push({ id: 'default', name: '大肥鱼的家', furniture: furniture, scenes: [bedroom, living, kitchen, yard], plays: plays, stories: stories, content: content, home: home });
})();
