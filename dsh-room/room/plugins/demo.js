/**
 * 演示插件 v3 —— 一切服务故事：大肥鱼住在这间房里。
 * 内容源：抽屉文案（信息窗只在要看的时候出现）；动线 links 让浏览成为动线。
 * 角色：占位小蓝鲸（s1.7 换成 Coopanion 真模型），听 resident:goto 走到组件锚点，
 *       并把「在桌前」同步成书桌组件的 working 状态（驱动屏幕光）。
 */
(function () {
  window.RoomPlugins = window.RoomPlugins || [];

  /* ── 内容源：动线 ── */
  var DEMO = {
    bed: {
      title: '大肥鱼的窝', sub: '被子还是早上那个形状',
      lines: [['最近写日记', '今天 09:12'], ['午睡', '昨天 40 分钟'], ['玩偶', '鲸鱼在左手边']],
      links: [{ label: '去看看书架', furn: 'shelf' }, { label: '回到桌子', furn: 'desk' }]
    },
    desk: {
      title: '书桌', sub: '台灯还留着昨晚的暖光',
      lines: [['正在做', '一个 2.5D 小房间'], ['手边的书', '《我是猫》读到 11%'], ['杯子', '看她喝了几口']],
      links: [{ label: '翻翻书架', furn: 'shelf' }, { label: '看看窗外', furn: 'window' }]
    },
    shelf: {
      title: '书架', sub: '按读过的顺序放',
      lines: [['最上面', '万物简史'], ['中间', '自私的基因'], ['最下面', '还没拆封的那本']],
      links: [{ label: '回到桌子', furn: 'desk' }, { label: '回窝看看', furn: 'bed' }]
    },
    window: {
      title: '窗户', sub: '天气住在外面',
      lines: [['点窗户', '换一种天气'], ['外面', '偶尔自己变']],
      links: [{ label: '回到桌子', furn: 'desk' }]
    },
    door: {
      title: '房门', sub: '通向走廊',
      lines: [['门外', '还没做完的房间'], ['大肥鱼', '今天哪儿也不去']],
      links: [{ label: '回窝看看', furn: 'bed' }]
    },
    frame: {
      title: '空画框', sub: '还没挂画',
      lines: [['计划', '画一张两个场景的'], ['进度', '颜料还没买']],
      links: [{ label: '看看窗外', furn: 'window' }]
    }
  };
  window.RoomPlugins.push({
    type: 'content',
    id: 'demo-static',
    name: '房间故事（演示）',
    slots: '*',
    provide: function (inst) { return DEMO[inst.def.id] || null; }
  });

  /* ── 角色：占位小蓝鲸（听组件锚点走位）—— 仅当真模型 vendor/whale-kit.js 不可用时顶上 ── */
  function whaleSvg(note) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="110" viewBox="0 0 140 110">' +
      '<ellipse cx="70" cy="100" rx="40" ry="8" fill="rgba(10,18,38,.30)"/>' +
      '<path d="M18 78 C18 44 46 26 76 26 C108 26 126 48 126 70 C126 86 108 96 84 96 L34 96 C24 96 18 90 18 78 Z" fill="#6ea8e8"/>' +
      '<path d="M18 78 C18 60 30 48 52 44 L52 96 L34 96 C24 96 18 90 18 78 Z" fill="#5f97dd"/>' +
      '<path d="M120 62 L138 48 L134 70 L138 92 L118 80 Z" fill="#5f97dd"/>' +
      '<path d="M52 26 C58 12 74 10 78 22 C68 20 60 22 52 26 Z" fill="#8fc0f2"/>' +
      '<ellipse cx="52" cy="72" rx="14" ry="11" fill="#eaf4ff"/>' +
      '<circle cx="98" cy="56" r="4.6" fill="#16233d"/>' +
      '<path d="M108 68 Q114 74 122 70" stroke="#16233d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M30 52 Q36 44 44 50" stroke="#3f7ec9" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      (note ? '<text x="70" y="14" font-size="12" text-anchor="middle" fill="rgba(10,16,30,.6)">' + note + '</text>' : '') +
      '</svg>');
  }
  var POSES = {
    sleep: { src: whaleSvg('zZ…'), w: 148, h: 116 },
    work:  { src: whaleSvg(''),    w: 148, h: 116 },
    stand: { src: whaleSvg(''),    w: 148, h: 116 }
  };
  if (!window.CorticoWhale) {
  window.RoomPlugins.push({
    type: 'character',
    id: 'demo-whale',
    name: '大肥鱼（占位）',
    setup: function (room) {
      function syncDesk(working) {
        var inst = room.furnitureList().filter(function (f) { return f.def.id === 'desk'; })[0];
        if (inst) room.setFurnState(inst.instId, { working: working });
      }
      function goto(x, y, pose) {
        var poseDef = POSES[pose] || POSES.stand;
        room.showCharacter(Object.assign({ x: x, y: y }, poseDef));
        syncDesk(pose === 'work');
      }
      room.bus.on('resident:goto', function (p) { goto(p.x, p.y, p.pose); });
      room.bus.on('character:click', function () {
        var words = ['泡泡……', '在呢~', '这一版快好了', '别戳啦', '杯子要空了哦'];
        room.sayCharacter(words[Math.floor(Math.random() * words.length)], 2400);
      });
      room.bus.on('room:ready', function () {
        var h = room.nowHour();
        var inst = room.furnitureList().filter(function (f) { return f.def.id === (h >= 23 || h < 7 ? 'bed' : 'desk'); })[0];
        if (inst && inst.def.anchor) {
          goto(inst.x + inst.def.anchor.dx, inst.y + inst.def.anchor.dy, inst.def.anchor.pose);
        }
      });
    }
  });
  }

  /* ── 导演小抄：调试工具，只在导演模式（?director=1）上戏台 ── */
  if (new URLSearchParams(location.search).get('director') === '1') {
    window.RoomPlugins.push({
      type: 'widget',
      id: 'demo-director',
      name: '导演小抄',
      mount: function (el, room) {
        el.innerHTML =
          '<div class="w-title">导演小抄（调试用）</div>' +
          '<div style="margin-top:4px">让她动：' +
          '  <button data-goto="bed">回窝</button>' +
          '  <button data-goto="desk">办公</button>' +
          '  <button data-goto="shelf">看书</button>' +
          '  <button data-goto="">隐身</button>' +
          '</div>' +
          '<div style="margin-top:4px">说一句：<input class="w-say" style="width:118px;background:rgba(255,255,255,.08);' +
          'border:1px solid rgba(140,180,240,.3);border-radius:8px;color:#e8eefb;font-size:12px;padding:2px 6px">' +
          ' <button data-say>说</button></div>';
        el.addEventListener('click', function (e) {
          var t = e.target;
          var go = t.getAttribute && t.getAttribute('data-goto');
          if (go !== null && go !== undefined) {
            [].forEach.call(el.querySelectorAll('[data-goto]'), function (b) { b.classList.toggle('on', b === t); });
            if (go) room.bus.emit('resident:goto', { anchor: go }); else room.hideCharacter();
          }
          if (t.hasAttribute && t.hasAttribute('data-say')) {
            var v = el.querySelector('.w-say').value.trim();
            if (v) room.sayCharacter(v, 2800);
          }
        });
      }
    });
  }
})();
