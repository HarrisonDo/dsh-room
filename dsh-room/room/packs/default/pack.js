/**
 * 示范房间包 v5 —— 贴图接线版（修"全是占位方块"的根因）
 *
 * 壳 = AI 生成等距空房间（shells/*.jpg，水印已除）；
 * 家具 = 幕布法抠好的透明贴图（furniture/*.webp，由 tools/room-furnish.py 产出）；
 * 命中区 = 家具占地菱形 + hitZone（锚在壳图画好的窗户/门上，无贴图不占格）。
 *
 * 尺寸约定：spriteSize = [宽, 高]，宽按 foot 跨度定，高按贴图纵横比；
 *   普通家具底边锚在占地菱形下顶点，flat（地毯）中心锚。
 * iso 校准：origin = 壳图地板菱形顶点（后墙角），cellW/H = 菱形宽高 ÷ 6 格（壳图实测）。
 * 布局与设施后续自定义：改 furniture[]（库）与 scenes[].furniture（摆位）即可，
 *   游戏内布置模式拖拽的结果存 localStorage，不动代码。
 */
(function () {
  window.RoomPlugins = window.RoomPlugins || [];
  window.RoomPlugins.push({
    type: 'room-pack',
    id: 'default',
    name: '大肥鱼的家',
    viewBox: [1536, 1024],
    iso: { cellW: 138, cellH: 78, origin: [756, 470], grid: [6, 6] },

    shells: {
      bedroom: 'packs/default/shells/bedroom.jpg',
      study: 'packs/default/shells/study.jpg'
    },

    /* ── 家具库（defId → 定义；sprite 缺失时内核自动画占位块兜底） ── */
    furniture: [
      {
        id: 'bed', name: '床', sub: '大肥鱼的窝', foot: [2, 3],
        sprite: 'packs/default/furniture/bed.webp', spriteSize: [430, 345],
        anchor: { pose: 'sleep', dx: 0, dy: -10 },
        on: {
          act: function (api, inst) { api.gotoFurniture(inst.instId); api.openInfo(inst.instId); }
        }
      },
      {
        id: 'desk', name: '书桌', sub: '干活的地方', foot: [2, 2],
        sprite: 'packs/default/furniture/desk.webp', spriteSize: [310, 323],
        anchor: { pose: 'work', dx: -60, dy: 42 },
        states: { working: false },
        mount: function (fx) {
          /* 笔记本屏幕光：坐标按 desk.png 里屏幕盖的位置（贴图 310x323，底边锚 +64） */
          var screen = fx.el('rect', { x: -14, y: -84, width: 72, height: 50, rx: 3, fill: '#cfe6ff', opacity: 0 });
          screen.style.mixBlendMode = 'screen';
          screen.style.transition = 'opacity 1s';
          fx.g.appendChild(screen);
          fx._paint = function (on, night) { screen.style.opacity = on ? .4 : (night ? .18 : 0); };
        },
        on: {
          act: function (api, inst) { api.gotoFurniture(inst.instId); api.openInfo(inst.instId); },
          change: function (state, api, fx) { if (fx && fx._paint) fx._paint(state.working, api.state.env && api.state.env.id === 'night'); }
        }
      },
      {
        id: 'shelf', name: '书架', sub: '读过的都堆在这儿', foot: [2, 1],
        sprite: 'packs/default/furniture/shelf.webp', spriteSize: [210, 339],
        anchor: { pose: 'stand', dx: 24, dy: 96 },
        on: {
          act: function (api, inst) {
            api.furnShake(inst.instId);
            api.floatText(inst.x, inst.y - 200, '抽出一本书');
            api.openInfo(inst.instId);
          }
        }
      },
      {
        id: 'wardrobe', name: '衣柜', sub: '换装的地方', foot: [2, 1],
        sprite: 'packs/default/furniture/wardrobe.webp', spriteSize: [200, 325],
        states: { open: false },
        on: {
          act: function (api, inst) {
            api.setFurnState(inst.instId, { open: !inst.state.open });
            api.floatText(inst.x, inst.y - 210, inst.state.open ? '门开了，里面的衣服真多' : '关好了');
          }
        }
      },
      {
        id: 'rug', name: '地毯', sub: 'Q弹', foot: [3, 3], flat: true,
        sprite: 'packs/default/furniture/rug.webp', spriteSize: [400, 225],
        on: {
          act: function (api, inst) {
            api.furnShake(inst.instId);
            api.floatText(inst.x, inst.y - 40, 'Q 弹 Q 弹');
          }
        }
      },
      {
        id: 'lamp', name: '落地灯', sub: '啪嗒', foot: [1, 1],
        sprite: 'packs/default/furniture/lamp.webp', spriteSize: [120, 402],
        states: { on: false },
        mount: function (fx) {
          /* 灯罩光晕 + 地板光斑：灯罩中心在贴图上部（y≈-280） */
          var glow = fx.el('ellipse', { cx: 0, cy: -280, rx: 120, ry: 96, fill: fx.grad('lampG'), opacity: 0 });
          glow.style.transition = 'opacity .8s';
          var spot = fx.el('ellipse', { cx: 6, cy: 42, rx: 140, ry: 62, fill: fx.grad('spotG'), opacity: 0 });
          spot.style.transition = 'opacity 1.2s';
          fx.gFree.appendChild(glow); fx.gFree.appendChild(spot);
          fx._paint = function (on) { glow.style.opacity = on ? .95 : 0; spot.style.opacity = on ? .5 : 0; };
        },
        on: {
          act: function (api, inst) { api.setFurnState(inst.instId, { on: !inst.state.on }); },
          change: function (state, api, fx) { if (fx && fx._paint) fx._paint(state.on); }
        }
      },
      {
        id: 'plant', name: '绿植', sub: '摸摸叶子', foot: [1, 1],
        sprite: 'packs/default/furniture/plant.webp', spriteSize: [110, 224],
        on: {
          act: function (api, inst) {
            api.furnShake(inst.instId);
            api.floatText(inst.x, inst.y - 160, '叶子沙沙响');
          }
        }
      }
    ],

    /* ── 场景：壳 + 摆位 + hitZone（窗/门锚在壳图上，rect 为 viewBox 坐标） ── */
    scenes: [
      {
        id: 'bedroom', name: '卧室', shell: 'bedroom',
        iso: { cellW: 138, cellH: 78, origin: [756, 470] },
        furniture: [
          { instId: 'bed1', defId: 'bed', gx: 0, gy: 2 },
          { instId: 'rug1', defId: 'rug', gx: 2, gy: 2 },
          { instId: 'desk1', defId: 'desk', gx: 3, gy: 3 },
          { instId: 'shelf1', defId: 'shelf', gx: 1, gy: 0 },
          { instId: 'wardrobe1', defId: 'wardrobe', gx: 3, gy: 0 },
          { instId: 'lamp1', defId: 'lamp', gx: 5, gy: 4 },
          { instId: 'plant1', defId: 'plant', gx: 0, gy: 5 }
        ],
        hitZones: [
          { id: 'window', label: '窗户', sub: '看看外面', rect: [754, 190, 201, 271], window: true, act: 'weather' },
          { id: 'door', label: '房门', sub: '通向走廊', rect: [1033, 360, 123, 259] }
        ]
      },
      {
        id: 'study', name: '书房', shell: 'study',
        iso: { cellW: 143, cellH: 83, origin: [756, 478] },
        furniture: [
          { instId: 's-desk1', defId: 'desk', gx: 2, gy: 4 },
          { instId: 's-shelf1', defId: 'shelf', gx: 0, gy: 1 },
          { instId: 's-shelf2', defId: 'shelf', gx: 2, gy: 0 },
          { instId: 's-rug1', defId: 'rug', gx: 3, gy: 1 },
          { instId: 's-lamp1', defId: 'lamp', gx: 4, gy: 5 },
          { instId: 's-plant1', defId: 'plant', gx: 5, gy: 0 },
          { instId: 's-wardrobe1', defId: 'wardrobe', gx: 1, gy: 5 }
        ],
        hitZones: [
          { id: 'window', label: '拱窗', sub: '看看外面', rect: [652, 164, 138, 337], window: true, act: 'weather' },
          { id: 'frame', label: '空画框', sub: '还没挂画', rect: [822, 265, 157, 252] }
        ]
      }
    ]
  });
})();
