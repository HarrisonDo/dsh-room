/**
 * 大肥鱼 · 真模型 resident 插件 v2（Coopanion whale，AGPL-3.0，见 vendor/coopanion/LICENSE）
 *
 * v0.4 协议：内核计算走位目标（家具锚点，viewBox 坐标），本插件只负责：
 *   把 kit 身体挂进 .room-pet-slot（渲染三明治的中间层）、vb→px 转换、walkTo 斜向走位、
 *   到达后按 pose 做词（sleep/sit/stand）、书桌 working 联动、rAF 驱动 + 深度回报
 *   （updateResidentY 让内核把家具换边，实现前后遮挡）。
 * 需要 vendor/whale-kit.js；缺省时 demo.js 的占位角色自动顶上。
 */
(function () {
  window.RoomPlugins = window.RoomPlugins || [];
  window.RoomPlugins.push({
    type: 'character',
    id: 'whale-resident',
    name: '大肥鱼',
    setup: function (room) {
      if (!window.CorticoWhale) {
        console.warn('[whale-resident] 未找到 vendor/whale-kit.js，由占位角色顶上');
        return;
      }
      var CW = window.CorticoWhale;
      var vb = room.state.viewBox;

      var layer = document.createElement('div');
      layer.className = 'room-pet-layer';
      layer.innerHTML =
        '<svg class="pet-svg">' +
        '  <ellipse class="shadow" rx="0" ry="0"></ellipse>' +
        '  <g class="pet-g"></g>' +
        '  <g class="fx-g"></g>' +
        '</svg>' +
        '<div class="pet-hit"></div>';
      var slot = room.host.querySelector('.room-pet-slot') || room.host;
      slot.appendChild(layer);
      var petG = layer.querySelector('.pet-g');
      var shadowEl = layer.querySelector('.shadow');
      var fxG = layer.querySelector('.fx-g');
      var hit = layer.querySelector('.pet-hit');

      var style = document.createElement('style');
      style.textContent =
        '.room-pet-layer{position:absolute;inset:0;pointer-events:none}' +
        '.room-pet-layer .pet-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;' +
        '  filter:brightness(var(--brightness)) saturate(var(--saturation,1));transition:filter 4s}' +
        '.room-pet-layer .pet-hit{position:absolute;pointer-events:auto;cursor:pointer;border-radius:42%}' +
        '.room-pet-layer .shadow{fill:rgba(18,24,44,.22)}' +
        '.room-pet-layer .p-heart{stroke:#ff5c93;fill:#ffd0df}' +
        '.room-pet-layer .p-dust{stroke:#9aa3c0}' +
        '.room-pet-layer .tearf{fill:#8fd0ff}' +
        '.room-pet-layer .eye{stroke:#3d6ee6}';
      document.head.appendChild(style);

      var base = new URL('vendor/coopanion/whale/', location.href);
      var pendingPose = null;
      var sceneReady = false, pendingGoto = null;

      CW.createWhaleFigure(base, { model: CW.model }).then(function (figure) {
        var sfx = CW.createSfx({ storageKey: 'room.whale.sound' });
        ['pointerdown', 'keydown'].forEach(function (ev) {
          addEventListener(ev, function () { sfx.unlock(); }, { capture: true });
        });

        var ctl = CW.createPet(
          { petG: petG, shadowEl: shadowEl, fxG: fxG },
          {
            figure: figure,
            sfx: sfx,
            ground: 'free',
            enter: 'drop',
            roam: 'off',
            bounds: function () {
              /* 相机缩放是 CSS transform：角色层内布局尺寸不变，用 clientWidth/Height */
              var W = room.host.clientWidth, H = room.host.clientHeight;
              return {
                W: W, H: H,
                floorY: H * (950 / vb[1]),
                S: Math.max(.3, (H / vb[1]) * 1.05)
              };
            },
            onEvent: function (kind) {
              if (kind === 'arrived' && pendingPose) {
                applyPose(pendingPose);
                pendingPose = null;
              }
            }
          }
        );
        room._whaleCtl = ctl;
        sceneReady = true;                 // 模型就绪即视为场景就绪（room:ready 可能已错过）
        setTimeout(function () { initialWalk(); }, 300);

        function vbToPx(x, y) {
          var W = room.host.clientWidth, H = room.host.clientHeight;
          return { x: x / vb[0] * W, y: y / vb[1] * H };
        }
        function syncDesk(working) {
          var inst = room.furnitureList().filter(function (f) { return f.def.id === 'desk'; })[0];
          if (inst) room.setFurnState(inst.instId, { working: working });
        }
        function applyPose(pose) {
          if (pose === 'sleep') ctl.doWord('sleep');
          else if (pose === 'work') { ctl.doWord('sit'); ctl.setExpr('determined', 2.4); }
          else ctl.doWord('stand');
          syncDesk(pose === 'work');
          room.bus.emit('resident:pose', { pose: pose });
        }

        /* 开场作息：夜里回床，白天到书桌 */
        function initialWalk() {
          var h = room.nowHour();
          var inst = room.furnitureList().filter(function (f) { return f.def.id === (h >= 23 || h < 7 ? 'bed' : 'desk'); })[0];
          if (inst && inst.def.anchor) {
            room.bus.emit('resident:goto', {
              x: inst.x + inst.def.anchor.dx, y: inst.y + inst.def.anchor.dy, pose: inst.def.anchor.pose
            });
          }
        }

        /* 走位指令：内核发 vb 坐标（家具锚点已算好）；busy（入场下落等）时每 0.5s 重试 */
        room.bus.on('resident:goto', function (p) {
          if (!sceneReady) { pendingGoto = p; return; }
          pendingGoto = p;
          tryWalk();
        });
        function tryWalk() {
          var p = pendingGoto;
          if (!p) return;
          if (p.anchor) {                     // 导演小抄的 {anchor:'bed'|'desk'|'shelf'} 形式
            var byDef = room.furnitureList().filter(function (f) { return f.def.id === p.anchor; })[0];
            if (!byDef || !byDef.def.anchor) { pendingGoto = null; return; }
            p = { x: byDef.x + byDef.def.anchor.dx, y: byDef.y + byDef.def.anchor.dy, pose: byDef.def.anchor.pose };
          }
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { pendingGoto = null; return; }
          var pt = vbToPx(p.x, p.y);
          pendingPose = p.pose || 'stand';
          if (ctl.walkTo(pt.x, false, 'goto', pt.y)) pendingGoto = null;
          else setTimeout(tryWalk, 500);
        }

        /* 场景切换后她掉进新场景，重新执行开场作息（走到新场景的书桌/床） */
        room.bus.on('room:scene', function () {
          sceneReady = false;
          setTimeout(function () { sceneReady = true; initialWalk(); }, 500);
        });

        /* 开场作息（room:ready 若已错过，setup 层的 300ms 定时会补一次） */
        room.bus.on('room:ready', function () {
          sceneReady = true;
          setTimeout(initialWalk, 900);
        });

        /* 点她：随机表情 + 浮字 */
        hit.addEventListener('click', function (e) {
          e.stopPropagation();
          ctl.holdRoam(4);
          var faces = ['happy', 'wink', 'love', 'surprised', 'shy'];
          ctl.setExpr(faces[Math.floor(Math.random() * faces.length)], 1.5);
          var lay = ctl.layout();
          var W = room.host.clientWidth, H = room.host.clientHeight;
          room.floatText(
            Math.round(lay.bubble.x / W * vb[0]),
            Math.round(lay.bubble.y / H * vb[1]) - 30,
            ['在呢~', '泡泡……', '这就去!', '别戳啦', '嘿嘿'][Math.floor(Math.random() * 5)], 1600);
        });

        /* 驱动循环：step/render + 命中盒 + 深度回报（内核拿它给家具换边）。
           看门狗：页面后台/合成器空闲导致 rAF 停滞时，interval 兕底推进（dt 有上限，慢速不乱）。 */
        var last = performance.now(), syncAt = 0;
        function loop(t) {
          var dt = Math.min(.05, Math.max(0, (t - last) / 1000));
          last = t;
          ctl.step(dt);
          ctl.render();
          if (t - syncAt > 120) {
            syncAt = t;
            var b = ctl.layout().box;
            hit.style.left = b.x + 'px';
            hit.style.top = b.y + 'px';
            hit.style.width = b.w + 'px';
            hit.style.height = b.h + 'px';
            var vy = ctl.pet.gy / room.host.clientHeight * vb[1];
            if (Number.isFinite(vy)) room.updateResidentY(Math.round(vy));   // NaN 会让深度分区失效
          }
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
        setInterval(function () { if (performance.now() - last > 400) loop(performance.now()); }, 400);
        if (window.ResizeObserver) new ResizeObserver(function () { ctl.resize(); }).observe(room.host);
      }).catch(function (e) {
        console.error('[whale-resident] 模型加载失败，占位角色顶上:', e);
      });
    }
  });
})();
