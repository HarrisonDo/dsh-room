/**
 * 客厅房间包 —— 多房间包示范（s2.2）
 *
 * 演示「换房间 = 换目录」：
 *   · 壳图：packs/living/shells/living.jpg（2496×1664，3:2，无水印）
 *   · 家具库：extends:'default' 继承，自己不需要重写任何家具定义
 *   · 网格：8×6 格（比卧室 6×6 更大），cellW/cellH 按地板菱形实测
 *   · hitZone：窗/门锚在壳图画面上（rect 为 viewBox 坐标）
 */
(function () {
  window.RoomPlugins = window.RoomPlugins || [];
  window.RoomPlugins.push({
    type: 'room-pack',
    id: 'living',
    name: '客厅',
    extends: 'default',
    viewBox: [1536, 1024],
    iso: { cellW: 149, cellH: 69, origin: [693, 471], grid: [8, 6] },

    shells: { living: 'packs/living/shells/living.jpg' },

    scenes: [
      {
        id: 'living', name: '客厅', shell: 'living',
        furniture: [
          { instId: 'l-shelf1', defId: 'shelf', gx: 0, gy: 0 },
          { instId: 'l-wardrobe1', defId: 'wardrobe', gx: 6, gy: 0 },
          { instId: 'l-rug1', defId: 'rug', gx: 3, gy: 2 },
          { instId: 'l-desk1', defId: 'desk', gx: 4, gy: 3 },
          { instId: 'l-lamp1', defId: 'lamp', gx: 7, gy: 5 },
          { instId: 'l-plant1', defId: 'plant', gx: 0, gy: 5 }
        ],
        hitZones: [
          { id: 'window', label: '窗户', sub: '看看外面', rect: [397, 312, 184, 203], window: true, act: 'weather' },
          { id: 'door', label: '房门', sub: '通向走廊', rect: [954, 330, 129, 262] }
        ]
      }
    ]
  });
})();
