/**
 * RoomCore —— 房间内核 v0.5（2.5D 实体化场景 + 相机 + hitZone）
 *
 * 场景 = 空房间壳（墙+地板，生成图或程序化占位）+ 家具实体（独立贴图，逐个摆放）。
 * 家具是实体：贴图 + 等距占地 + 状态机 + 自身交互反馈，可拖拽布置（吸附网格）、
 * 可从家具库更换、可增删；角色夹在家具之间受遮挡（深度三明治）。
 *
 * 数据模型：
 *   Scene   = { id, name, shell?, furniture: [{instId, defId, gx, gy, state}] }
 *   FurnDef = { id, name, sub?, sprite?, foot:[w,h], anchor:{pose,dx,dy}, flat?,
 *               states?, mount?(fx, api, inst), on:{act?,change?} }
 *   等距网格: cellW=128, cellH=64, origin=(768,320)（可被 pack.iso 覆盖）
 *
 * 渲染三明治：svgBack（壳+环境+低深度家具） ← 角色层(.room-pet-slot) ← svgFront（高深度家具）
 *   家具深度 = 脚底 y；room.updateResidentY(y) 时换边重排（painter's algorithm）。
 *   flat 家具（地毯）永远在 svgBack。
 *
 * 铁律不变：覆盖层 pointer-events:none；可点=家具命中区(.fz)与角色命中盒。
 * 事件：room:ready / room:scene / furn:hover / furn:act / furn:change / resident:goto /
 *       scene:change(时段天气) / weather:change / weather:auto / lamp:change / calib:toggle
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VERSION = '0.5.0';

  /* ───────────────────────── 工具 ───────────────────────── */

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function mixHex(a, b, t) {
    var p = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); };
    var A = p(a), B = p(b);
    return '#' + A.map(function (v, i) {
      return Math.round(lerp(v, B[i], clamp01(t))).toString(16).padStart(2, '0');
    }).join('');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* ─────────────── 纯函数：时段插值（可单测） ─────────────── */

  function resolveScene(periods, hour) {
    var list = periods.map(function (p) { return Object.assign({}, p); })
      .sort(function (x, y) { return x.hour - y.hour; });
    var ext = list.concat([Object.assign({}, list[0], { hour: list[0].hour + 24 })]);
    for (var i = 0; i < ext.length - 1; i++) {
      var a = ext[i], b = ext[i + 1];
      var h = hour < a.hour ? hour + 24 : hour;
      if (h >= a.hour && h <= b.hour) {
        var t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
        return {
          id: t < 0.5 ? a.id : b.id,
          sky: [mixHex(a.sky[0], b.sky[0], t), mixHex(a.sky[1], b.sky[1], t)],
          ambient: mixHex(a.ambient, b.ambient, t),
          brightness: lerp(a.brightness, b.brightness, t),
          sun: lerp(a.sun, b.sun, t),
          noSun: t < 0.5 ? a.noSun : b.noSun
        };
      }
    }
    return list[0];
  }

  var DEFAULT_PERIODS = [
    { id: 'dawn',      label: '清晨', hour: 6,  sky: ['#9fb6d8', '#e6d9c8'], ambient: '#b9c9e6', brightness: 0.92, sun: 0.35 },
    { id: 'noon',      label: '中午', hour: 12, sky: ['#8fc4ee', '#dff0fb'], ambient: '#ffffff', brightness: 1.00, sun: 0.10 },
    { id: 'afternoon', label: '下午', hour: 16, sky: ['#a9c6e8', '#ffd8ae'], ambient: '#ffe0c0', brightness: 0.97, sun: 0.55, noSun: true },
    { id: 'night',     label: '晚间', hour: 20, sky: ['#1b2a4d', '#3d4d78'], ambient: '#2a3760', brightness: 0.72, sun: 0 }
  ];
  var DEFAULT_WEATHERS = {
    clear: { label: '晴天', brightness: 1.00 },
    rain:  { label: '雨天', brightness: 0.93 },
    snow:  { label: '雪天', brightness: 0.97 }
  };

  /* 窗外天气粒子（窗口家具提供 windowRect；尺寸按 viewBox 缩放到看得见） */
  function buildRain(g, area) {
    for (var i = 0; i < 70; i++) {
      var x = area.x + Math.random() * area.w, y = area.y + Math.random() * area.h;
      var l = el('line', { x1: x, y1: y, x2: x - 5, y2: y + 20, stroke: '#dfeaf8', 'stroke-width': '1.8', opacity: '.65' });
      l.dataset.i = i; g.appendChild(l);
    }
    return function tick(t) {
      [].forEach.call(g.children, function (l, i) {
        l.setAttribute('transform', 'translate(' + (Math.sin((t + i) * 0.2) * 2).toFixed(1) + ',' + ((t * 9 + i * 5) % (area.h + 24) - 12) + ')');
      });
    };
  }
  function buildSnow(g, area) {
    for (var i = 0; i < 60; i++) {
      var c = el('circle', { cx: area.x + Math.random() * area.w, cy: area.y + Math.random() * area.h, r: (2 + Math.random() * 2.4).toFixed(1), fill: '#f2f7ff', opacity: '.9' });
      c.dataset.i = i; g.appendChild(c);
    }
    return function tick(t) {
      [].forEach.call(g.children, function (c, i) {
        c.setAttribute('transform', 'translate(' + (Math.sin((t + i) * 0.25) * 8).toFixed(1) + ',' + ((t * 1.6 + i * 3) % (area.h + 24) - 12) + ')');
      });
    };
  }
  var DEFAULT_FX = { rain: buildRain, snow: buildSnow };
  var CYCLE = ['clear', 'rain', 'snow'];

  /* ───────────────────────── 事件总线 / 注册表 ───────────────────────── */

  function Bus() { this.m = {}; }
  Bus.prototype.on = function (ev, fn) {
    (this.m[ev] = this.m[ev] || []).push(fn);
    var self = this;
    return function off() { self.off(ev, fn); };
  };
  Bus.prototype.off = function (ev, fn) {
    var a = this.m[ev]; if (!a) return;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  Bus.prototype.emit = function (ev, payload) {
    (this.m[ev] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[room] 事件处理器出错:', ev, e); }
    });
  };

  var TYPES = ['room-pack', 'environment', 'content', 'character', 'widget'];
  function Registry() {
    var self = this;
    this.map = {};
    TYPES.forEach(function (t) { self.map[t] = []; });
  }
  Registry.prototype.add = function (def) {
    if (!def || !def.type || TYPES.indexOf(def.type) < 0)
      throw new Error('[room] 未知插件类型: ' + (def && def.type) + '（合法: ' + TYPES.join('/') + '）');
    if (!def.id) throw new Error('[room] 插件缺少 id: ' + def.type);
    this.map[def.type].push(def);
    return def;
  };
  Registry.prototype.all = function (type) { return this.map[type] || []; };
  Registry.prototype.find = function (type, id) {
    return this.all(type).filter(function (d) { return d.id === id; })[0] || null;
  };

  /* ───────────────────────── 房间实例 ───────────────────────── */

  function create(host, options) {
    options = options || {};
    var bus = new Bus();
    var registry = new Registry();
    var booted = false;
    var clockTimer = null, fxTimer = null, ambientTimer = null, sayTimer = null;

    var state = {
      pack: null,
      viewBox: [1536, 1024],
      iso: { cellW: 128, cellH: 64, origin: [768, 320], grid: [6, 6] },
      scenes: [], sceneId: null,
      periods: DEFAULT_PERIODS.slice(),
      weathers: Object.assign({}, DEFAULT_WEATHERS),
      weather: 'clear',
      auto: true,
      manualPeriod: null,
      lamp: false,
      arrange: !!options.calib,          // 布置模式（原标注模式升级）
      ambient: options.ambient !== false,
      ambientGraceUntil: 0,
      hud: options.hud !== false,
      env: null,                          // 时段插值结果
      residentY: null,                    // 角色脚底（viewBox y），深度换边用
      windowRect: null                    // 天气粒子区域（窗口家具挂载时提供）
    };
    state.cam = { z: 1, x: 0, y: 0 };     // 相机：缩放 + 平移（host 布局像素）

    var insts = {};                       // instId -> { def, gx, gy, x, y, state, node, hit, fx }
    var dom = null;

    /* ──────────── 相机 ──────────── */
    function applyCam(ease) {
      if (!dom || !dom.camera) return;
      if (ease) {
        dom.camera.classList.add('ease');
        setTimeout(function () { dom.camera.classList.remove('ease'); }, 520);
      }
      dom.camera.style.transform = 'translate(' + state.cam.x.toFixed(1) + 'px,' + state.cam.y.toFixed(1) + 'px) scale(' + state.cam.z.toFixed(3) + ')';
    }
    function clampCam() {
      var w = host.clientWidth, h = host.clientHeight;
      state.cam.x = clamp(state.cam.x, Math.min(0, w - w * state.cam.z), 0);
      state.cam.y = clamp(state.cam.y, Math.min(0, h - h * state.cam.z), 0);
    }
    function camZoom(factor, cx, cy) {
      var z = clamp(state.cam.z * factor, 1, 2.6);
      var k = z / state.cam.z;
      state.cam.x = cx - (cx - state.cam.x) * k;
      state.cam.y = cy - (cy - state.cam.y) * k;
      state.cam.z = z;
      clampCam();
      applyCam(false);
    }
    function camReset() {
      state.cam = { z: 1, x: 0, y: 0 };
      applyCam(true);
    }
    /* viewBox 坐标 → host 布局像素（含相机变换；HUD 用） */
    function vbToHost(x, y) {
      var r = host.getBoundingClientRect();
      var pt = dom.svgBack.createSVGPoint();
      pt.x = x; pt.y = y;
      var p = pt.matrixTransform(dom.svgBack.getScreenCTM());
      return { x: p.x - r.left, y: p.y - r.top };
    }

    /* ──────────── 等距坐标 ──────────── */
    function gridToPx(gx, gy, foot) {
      var iso = state.iso;
      var fw = (foot ? foot[0] : 1), fh = (foot ? foot[1] : 1);
      var cx = iso.origin[0] + (gx + fw / 2 - gy - fh / 2) * iso.cellW / 2;
      var cy = iso.origin[1] + (gx + fw / 2 + gy + fh / 2) * iso.cellH / 2;
      return { x: cx, y: cy };
    }
    function pxToGrid(x, y) {
      var iso = state.iso;
      var dx = (x - iso.origin[0]) / (iso.cellW / 2);
      var dy = (y - iso.origin[1]) / (iso.cellH / 2);
      return { gx: (dy + dx) / 2, gy: (dy - dx) / 2 };
    }

    /* ──────────── DOM 骨架：双 svg 三明治 ──────────── */
    function buildDom(vb) {
      host.classList.add('room');
      host.innerHTML =
        '<div class="room-camera">' +
        '  <svg class="svg-back" viewBox="0 0 ' + vb[0] + ' ' + vb[1] + '"></svg>' +
        '  <div class="room-pet-slot"></div>' +
        '  <svg class="svg-front" viewBox="0 0 ' + vb[0] + ' ' + vb[1] + '"></svg>' +
        '</div>' +
        '<div class="room-clock"></div>' +
        '<div class="room-say"></div>' +
        '<div class="room-hint"></div>' +
        '<div class="room-drawer">' +
        '  <span class="room-drawer-x">×</span>' +
        '  <h4></h4><div class="room-drawer-sub"></div>' +
        '  <div class="room-drawer-body"></div>' +
        '  <div class="room-drawer-links"></div>' +
        '</div>' +
        '<div class="room-arrangebar">' +
        '  <button data-act="save">保存布置</button>' +
        '  <button data-act="reset">恢复默认</button>' +
        '  <button data-act="exit">退出布置</button>' +
        '  <span class="arrange-tip">拖家具摆位 · 右侧家具库添加 · 家具角上 × 移除</span>' +
        '</div>' +
        '<div class="room-lib">' +
        '  <div class="room-lib-title">家具库 <span class="room-lib-tip">点击添加</span></div>' +
        '  <div class="room-lib-items"></div>' +
        '</div>' +
        '<div class="room-widgets"></div>' +
        '<div class="room-floats"></div>' +
        '<div class="room-fade"></div>';

      var svgBack = host.querySelector('.svg-back');
      var svgFront = host.querySelector('.svg-front');
      var defs = el('defs');
      defs.innerHTML =
        '<radialGradient id="room-lampG">' +
        '<stop offset="0" stop-color="#ffe9bf" stop-opacity=".85"/>' +
        '<stop offset="1" stop-color="#ffe9bf" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="room-spotG">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".5"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
      svgBack.appendChild(defs);

      var shellG = el('g', { class: 'layer-shell' });
      var shellImg = el('image', { class: 'shell-img', width: vb[0], height: vb[1], preserveAspectRatio: 'none' });
      shellG.appendChild(shellImg);
      var castUnder = el('rect', { class: 'color-cast', width: vb[0], height: vb[1] });
      var sunbeam = el('path', { class: 'sunbeam', fill: '#ffdcac', d: sunbeamPath(vb) });
      var motes = el('g', { class: 'layer-motes' });
      for (var i = 0; i < 10; i++) {
        var m = el('circle', { cx: vb[0] * (0.55 + Math.random() * 0.22), cy: vb[1] * (0.5 + Math.random() * 0.4), r: (1 + Math.random() * 1.6).toFixed(1), fill: '#fff' });
        m.style.opacity = 0.18;
        m.style.animation = 'roomMote ' + (6 + Math.random() * 6).toFixed(1) + 's linear ' + (-Math.random() * 8).toFixed(1) + 's infinite';
        motes.appendChild(m);
      }
      var gWeather = el('g', { class: 'layer-weather' });
      var glass = el('rect', { class: 'weather-glass', visibility: 'hidden' });
      var gFurnBack = el('g', { class: 'layer-furn-back' });
      var gChar = el('g', { class: 'layer-char' });          // 占位角色（无 kit 时）

      svgBack.appendChild(shellG);
      svgBack.appendChild(castUnder);
      svgBack.appendChild(sunbeam);
      svgBack.appendChild(motes);
      svgBack.appendChild(gWeather);
      svgBack.appendChild(glass);
      svgBack.appendChild(gFurnBack);
      svgBack.appendChild(gChar);

      var gFurnFront = el('g', { class: 'layer-furn-front' });
      var castOver = el('rect', { class: 'color-cast', style: 'opacity:.05', width: vb[0], height: vb[1] });
      svgFront.appendChild(gFurnFront);
      svgFront.appendChild(castOver);

      dom = {
        camera: host.querySelector('.room-camera'),
        svgBack: svgBack, svgFront: svgFront, defs: defs,
        shellImg: shellImg, sunbeam: sunbeam, gWeather: gWeather, glass: glass,
        gFurnBack: gFurnBack, gFurnFront: gFurnFront, gChar: gChar,
        hint: host.querySelector('.room-hint'),
        say: host.querySelector('.room-say'),
        clock: host.querySelector('.room-clock'),
        drawer: host.querySelector('.room-drawer'),
        arrangebar: host.querySelector('.room-arrangebar'),
        lib: host.querySelector('.room-lib'),
        libItems: host.querySelector('.room-lib-items'),
        widgets: host.querySelector('.room-widgets'),
        floats: host.querySelector('.room-floats'),
        fade: host.querySelector('.room-fade')
      };

      dom.drawer.querySelector('.room-drawer-x').addEventListener('click', hideDrawer);
      dom.drawer.querySelector('.room-drawer-links').addEventListener('click', function (e) {
        var to = e.target.getAttribute && e.target.getAttribute('data-goto');
        if (to) { hideDrawer(); api.gotoFurniture(to); }
      });
      dom.arrangebar.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'save') saveLayout();
        else if (act === 'reset') resetLayout();
        else if (act === 'exit') enterArrange(false);
      });

      host.addEventListener('click', function (e) {
        state.lastClickX = e.clientX;
        var t = e.target;
        if (Date.now() - (state._panned || 0) < 220) return;   // 拖拽平移松手不算点击
        if (!(t.closest && t.closest('.room-drawer'))) hideDrawer();
      });
      /* 相机交互：滚轮缩放（光标为锚）、空白处拖拽平移、双击复位 */
      host.addEventListener('wheel', function (e) {
        if (e.target.closest && e.target.closest('.room-drawer, .room-widgets, .room-arrangebar')) return;
        e.preventDefault();
        var r = host.getBoundingClientRect();
        camZoom(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      host.addEventListener('dblclick', function () { camReset(); });
      host.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        var t = e.target;
        if (t.closest && t.closest('.fz, .pet-hit, .room-drawer, .room-arrangebar, .room-widgets, button, input')) return;
        var sx = e.clientX, sy = e.clientY, ox = state.cam.x, oy = state.cam.y, moved = false;
        function mv(m) {
          var dx = m.clientX - sx, dy = m.clientY - sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          state.cam.x = ox + dx; state.cam.y = oy + dy;
          clampCam(); applyCam(false);
        }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          host.classList.remove('panning');
          if (moved) state._panned = Date.now();
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        host.classList.add('panning');
      });
      /* 壳图缺失兜底：生成图没带上时画程序化壳，房间永远不是空的 */
      dom.shellImg.addEventListener('error', function () {
        buildPlaceholderShell(dom.shellImg.parentNode, state.viewBox);
      });
      /* 首次交互解锁音频 */
      host.addEventListener('pointerdown', sfxUnlock, { passive: true });
      try { if (localStorage.getItem('room.sound') === '1') sfx.on = true; } catch (e) {}
      if (state.hud) updateClockChip(); else dom.clock.style.display = 'none';
    }

    function sunbeamPath(vb) {
      var x1 = vb[0] * 0.78, y1 = vb[1] * 0.39, x2 = vb[0] * 0.885, y2 = vb[1] * 0.46;
      return 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' L' + vb[0] * 0.585 + ' ' + vb[1] +
             ' L' + vb[0] * 0.455 + ' ' + vb[1] + ' Z';
    }

    /* ──────────── 程序化占位壳（无生成图时：木地板菱形 + 两面墙） ──────────── */
    function buildPlaceholderShell(group, vb) {
      var iso = state.iso, o = iso.origin, gw = iso.grid[0], gh = iso.grid[1];
      var cw = iso.cellW, ch = iso.cellH;
      var W = gw * cw, H = gh * ch;
      var top = [o[0], o[1]], right = [o[0] + W / 2, o[1] + H / 2], bottom = [o[0], o[1] + H], left = [o[0] - W / 2, o[1] + H / 2];
      function poly(pts, fill) { var p = el('polygon', { points: pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '), fill: fill }); group.appendChild(p); return p; }
      // 地板：木色菱形 + 板缝
      poly([top, right, bottom, left], '#8a7a66');
      for (var i = 1; i < gw; i++) {
        var t = i / gw;
        var a = [top[0] + (right[0] - top[0]) * t, top[1] + (right[1] - top[1]) * t];
        var b = [left[0] + (bottom[0] - left[0]) * t, left[1] + (bottom[1] - left[1]) * t];
        group.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'rgba(60,45,30,.25)', 'stroke-width': 1.5 }));
      }
      for (var j = 1; j < gh; j++) {
        var t2 = j / gh;
        var a2 = [top[0] + (left[0] - top[0]) * t2, top[1] + (left[1] - top[1]) * t2];
        var b2 = [right[0] + (bottom[0] - right[0]) * t2, right[1] + (bottom[1] - right[1]) * t2];
        group.appendChild(el('line', { x1: a2[0], y1: a2[1], x2: b2[0], y2: b2[1], stroke: 'rgba(60,45,30,.25)', 'stroke-width': 1.5 }));
      }
      // 两面墙
      var wallH = 300;
      var wallL = [left, top], wallR = [top, right];
      poly([wallL[0], wallL[1], [wallL[1][0], wallL[1][1] - wallH], [wallL[0][0], wallL[0][1] - wallH]], '#5d6f9e');
      poly([wallR[0], wallR[1], [wallR[1][0], wallR[1][1] - wallH], [wallR[0][0], wallR[0][1] - wallH]], '#4f618f');
      poly([left, [left[0], left[1] - wallH], [top[0], top[1] - wallH], top].map(function (p) { return p; }), '#5d6f9e');
    }

    /* ──────────── 家具实体 ──────────── */
    function placeholderSprite(def) {
      var w = def.spriteSize ? def.spriteSize[0] : def.foot[0] * state.iso.cellW;
      var h = def.spriteSize ? def.spriteSize[1] : def.foot[1] * state.iso.cellH * 1.4;
      var hue = def.tint || '#8fb2e8';
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        '<polygon points="' + w / 2 + ',2 ' + (w - 2) + ',' + h * .22 + ' ' + (w - 2) + ',' + h * .62 + ' ' + w / 2 + ',' + h * .82 + '" fill="' + hue + '"/>' +
        '<polygon points="2,' + h * .22 + ' ' + w / 2 + ',' + h * .42 + ' ' + w / 2 + ',' + h + ' 2,' + h * .62 + '" fill="' + hue + '" opacity=".78"/>' +
        '<polygon points="' + w / 2 + ',' + h * .42 + ' ' + (w - 2) + ',' + h * .22 + ' ' + (w - 2) + ',' + h * .62 + ' ' + w / 2 + ',' + h * .82 + '" fill="#000" opacity=".14"/>' +
        '<text x="' + w / 2 + '" y="' + (h * .56) + '" font-size="' + Math.max(14, w / 9) + '" text-anchor="middle" fill="rgba(255,255,255,.92)">' + (def.name || def.id) + '</text>' +
        '</svg>');
    }

    function furnNode(inst) {
      var def = inst.def;
      var g = el('g', { class: 'furn', 'data-inst': inst.instId });
      var shadow = el('ellipse', {
        class: 'furn-shadow',
        cx: 0, cy: 0,
        rx: def.foot[0] * state.iso.cellW * 0.42,
        ry: def.foot[1] * state.iso.cellH * 0.42,
        fill: 'rgba(18,24,44,.20)'
      });
      g.appendChild(shadow);
      var sw = def.spriteSize ? def.spriteSize[0] : def.foot[0] * state.iso.cellW;
      var sh = def.spriteSize ? def.spriteSize[1] : Math.round(def.foot[1] * state.iso.cellH * 1.4);
      var img = el('image', {
        class: 'furn-img', width: sw, height: sh,
        x: (-sw / 2).toFixed(1),
        y: (def.flat ? -sh / 2 : def.foot[1] * state.iso.cellH / 2 - sh).toFixed(1)
      });
      img.setAttribute('href', def.sprite || placeholderSprite(def));
      img.addEventListener('error', function () {
        img.setAttribute('href', placeholderSprite(def));
      });
      g.appendChild(img);
      var fx = { g: el('g', { class: 'furn-fx' }), gFree: g, el: el, grad: function (id) { return 'url(#room-' + id + ')'; }, img: img };
      g.appendChild(fx.g);
      if (typeof def.mount === 'function') {
        try { def.mount(fx, api, inst.state); } catch (e) { console.error('[room] 家具 mount 失败:', def.id, e); }
      }
      // 命中区（占地菱形，pointer-events 只在这）
      var hit = el('polygon', { class: 'fz' });
      g.appendChild(hit);
      inst.node = g; inst.img = img; inst.fx = fx; inst.hit = hit;
      wireFurnHit(inst);
      /* 布置模式：右下角删除按钮（只对占格家具，hitZone 不动） */
      if (def.foot && !def.hitOnly) {
        var dTop = def.flat ? -sh / 2 : def.foot[1] * state.iso.cellH / 2 - sh;
        var delG = el('g', { class: 'furn-del' });
        delG.appendChild(el('circle', { cx: sw / 2 - 10, cy: dTop + 18, r: 20, fill: 'rgba(198,58,58,.94)', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 1.6 }));
        var dt = el('text', { x: sw / 2 - 10, y: dTop + 26, 'text-anchor': 'middle', 'font-size': 26, fill: '#fff' });
        dt.textContent = '×';
        delG.appendChild(dt);
        delG.addEventListener('click', function (e) {
          e.stopPropagation();
          api.removeFurniture(inst.instId);
        });
        g.appendChild(delG);
      }
      return g;
    }

    function updateHitGeom(inst) {
      var iso = state.iso;
      var fw = inst.def.foot[0], fh = inst.def.foot[1];
      var c = iso.origin;
      var corners = [
        [c[0] + (inst.gx - inst.gy) * iso.cellW / 2, c[1] + (inst.gx + inst.gy) * iso.cellH / 2],
        [c[0] + (inst.gx + fw - inst.gy) * iso.cellW / 2, c[1] + (inst.gx + fw + inst.gy) * iso.cellH / 2],
        [c[0] + (inst.gx + fw - inst.gy - fh) * iso.cellW / 2, c[1] + (inst.gx + fw + inst.gy + fh) * iso.cellH / 2],
        [c[0] + (inst.gx - inst.gy - fh) * iso.cellW / 2, c[1] + (inst.gx + inst.gy + fh) * iso.cellH / 2]
      ];
      inst.hit.setAttribute('points', corners.map(function (p) {
        return (p[0] - inst.x) + ',' + (p[1] - inst.y);   // 相对 group 原点（group 已 translate 到 inst.x/y）
      }).join(' '));
      inst.node.setAttribute('transform', 'translate(' + inst.x + ',' + inst.y + ')');
      var sw = inst.def.foot[0] * iso.cellW * 0.42;
      inst.node.querySelector('.furn-shadow').setAttribute('rx', sw);
      inst.node.querySelector('.furn-shadow').setAttribute('ry', inst.def.foot[1] * iso.cellH * 0.42);
    }

    function wireFurnHit(inst) {
      var hit = inst.hit;
      hit.addEventListener('mouseenter', function () {
        inst.node.classList.add('hover');
        dom.hint.textContent = inst.def.sub ? inst.def.name + ' · ' + inst.def.sub : inst.def.name;
        positionHint(inst.x, inst.y - (inst.def.spriteSize ? inst.def.spriteSize[1] : 100) * .5);
        bus.emit('furn:hover', { instId: inst.instId, defId: inst.def.id });
      });
      hit.addEventListener('mouseleave', function () {
        inst.node.classList.remove('hover');
        dom.hint.style.opacity = 0;
      });
      hit.addEventListener('mousedown', function (e) {
        if (state.arrange) { startDragFurn(inst, e); return; }
        inst.node.classList.add('press');
        setTimeout(function () { inst.node.classList.remove('press'); }, 160);
      });
      hit.addEventListener('click', function (e) {
        e.stopPropagation();
        if (state.arrange) return;
        beep(520 + Math.random() * 80, .07, 'triangle', .05);
        if (inst.def.on && typeof inst.def.on.act === 'function') {
          bus.emit('furn:act', { instId: inst.instId, defId: inst.def.id });
          inst.def.on.act(api, inst);
        } else {
          openFurnInfo(inst);
        }
      });
    }

    function positionHint(vbX, vbY) {
      var p = vbToHost(vbX, vbY);
      dom.hint.style.left = p.x + 'px';
      dom.hint.style.top = p.y + 'px';
      dom.hint.style.transform = 'translate(-50%,-130%)';
      dom.hint.style.opacity = 1;
    }

    /* 深度排序：家具按 foot 深度，角色夹中间 */
    function depthOf(inst) { return inst.y; }
    function sortFurniture() {
      var list = Object.values(insts);
      var ry = state.residentY;
      list.sort(function (a, b) { return depthOf(a) - depthOf(b); });
      list.forEach(function (inst) {
        var front = !inst.def.flat && ry != null && depthOf(inst) >= ry;
        var parent = front ? dom.gFurnFront : dom.gFurnBack;
        if (inst.node.parentNode !== parent) parent.appendChild(inst.node);
        else parent.appendChild(inst.node);   // append 重排同组内顺序
      });
    }

    /* ──────────── 场景装载 ──────────── */
    function loadScene(id, instant) {
      var scene = state.scenes.filter(function (s) { return s.id === id; })[0];
      if (!scene) return;
      var prev = state.sceneId;
      state.sceneId = id;
      insts = {};
      dom.gFurnBack.innerHTML = ''; dom.gFurnFront.innerHTML = '';
      // 壳
      var shell = scene.shell ? state.pack.shells && state.pack.shells[scene.shell] : null;
      if (shell) { dom.shellImg.setAttribute('href', shell); }
      else {
        dom.shellImg.setAttribute('href', '');
        buildPlaceholderShell(dom.shellImg.parentNode, state.viewBox);
      }
      if (scene.iso) state.iso = Object.assign({}, state.pack.iso || state.iso, scene.iso);
      else state.iso = Object.assign({}, state.pack.iso || state.iso);
      /* 布局（v2：items 位置覆盖 + added 新增 + removed 删除；v1 仅位置覆盖） */
      var layout = getLayout(id) || {};
      var saved = layout.items || layout;
      state._removed = (layout.removed || []).slice();
      (scene.furniture || []).forEach(function (f) {
        if (state._removed.indexOf(f.instId) >= 0) return;
        var pos = saved[f.instId];
        spawnFurn(f.instId, f.defId, pos ? pos.gx : f.gx, pos ? pos.gy : f.gy, f.state, false);
      });
      (layout.added || []).forEach(function (a) {
        spawnFurn(a.instId, a.defId, a.gx, a.gy, a.state, true);
      });
      /* hitZone：锚在壳图画面上的命中区（窗/门/画框……），无贴图不占格 */
      (scene.hitZones || []).forEach(function (z) {
        var def = {
          id: z.id, name: z.label || z.id, sub: z.sub || '', flat: true, hitOnly: true,
          on: z.act === 'weather' ? { act: function (api2) {
            api2.cycleWeather();
            api2.floatText(z.rect[0] + z.rect[2] / 2, z.rect[1] - 10, '天气变了');
          } } : undefined
        };
        var inst = {
          instId: z.id, def: def, gx: -1, gy: -1,
          x: z.rect[0] + z.rect[2] / 2, y: z.rect[1] + z.rect[3] / 2, state: {}
        };
        var g = el('g', { class: 'furn', 'data-inst': inst.instId });
        var hit = el('polygon', { class: 'fz' });
        g.appendChild(hit);
        inst.node = g; inst.hit = hit; inst.fx = null;
        inst.hit.setAttribute('points',
          z.rect[0] + ',' + z.rect[1] + ' ' + (z.rect[0] + z.rect[2]) + ',' + z.rect[1] + ' ' +
          (z.rect[0] + z.rect[2]) + ',' + (z.rect[1] + z.rect[3]) + ' ' + z.rect[0] + ',' + (z.rect[1] + z.rect[3]));
        wireFurnHit(inst);
        dom.gFurnBack.appendChild(g);
        insts[inst.instId] = inst;
        if (z.window) state.windowRect = { x: z.rect[0], y: z.rect[1], w: z.rect[2], h: z.rect[3] };
      });
      sortFurniture();
      hideDrawer();                       // 切场景时关掉上一个场景的信息抽屉
      if (!instant && dom.fade) {
        dom.fade.classList.add('on');
        setTimeout(function () { dom.fade.classList.remove('on'); }, 420);
      }
      bus.emit('room:scene', { id: id, name: scene.name, prev: prev });
      updateClockChip();
    }

    function rectAt(inst, rel) {
      var lift = inst.def.lift || 0;
      return { x: inst.x + rel[0], y: inst.y - lift + rel[1], w: rel[2], h: rel[3] };
    }

    /* 房间包的家具库：extends 继承 + 同名覆盖（换房间包不必重写家具定义） */
    function furnLib(pack) {
      var base = pack.extends ? registry.find('room-pack', pack.extends) : null;
      var lib = base && base.furniture ? base.furniture.slice() : [];
      (pack.furniture || []).forEach(function (d) {
        var i = -1;
        for (var k = 0; k < lib.length; k++) if (lib[k].id === d.id) { i = k; break; }
        if (i >= 0) lib[i] = d; else lib.push(d);
      });
      return lib;
    }

    /* 生成一件家具实例（场景装载 / 家具库添加共用） */
    function spawnFurn(instId, defId, gx, gy, initState, added) {
      var def = state.furn.filter(function (d) { return d.id === defId; })[0];
      if (!def) { console.warn('[room] 未知家具定义:', defId); return null; }
      var inst = {
        instId: instId, def: def, gx: gx, gy: gy, added: !!added,
        state: Object.assign({}, def.states || {}, initState || {})
      };
      var p = gridToPx(inst.gx, inst.gy, def.foot);
      inst.x = p.x; inst.y = p.y;
      furnNode(inst);
      insts[instId] = inst;
      updateHitGeom(inst);
      if (def.windowRect) state.windowRect = rectAt(inst, def.windowRect);
      return inst;
    }

    /* 家具库：添加（不给坐标就自动找空位，居中优先） */
    function addFurniture(defId, gx, gy) {
      var def = state.furn.filter(function (d) { return d.id === defId; })[0];
      if (!def || def.hitOnly) return null;
      if (gx == null || gy == null) { var spot = findFreeSpot(def); gx = spot.gx; gy = spot.gy; }
      var instId = defId + '#' + Date.now().toString(36);
      var inst = spawnFurn(instId, defId, gx, gy, null, true);
      if (!inst) return null;
      sortFurniture();
      saveLayout();
      inst.node.classList.add('bump');
      setTimeout(function () { inst.node.classList.remove('bump'); }, 520);
      bus.emit('furn:added', { instId: instId, defId: defId });
      return inst;
    }
    function removeFurniture(instId) {
      var inst = insts[instId];
      if (!inst || inst.def.hitOnly) return false;
      if (inst.node.parentNode) inst.node.parentNode.removeChild(inst.node);
      if (!inst.added) state._removed.push(instId);
      delete insts[instId];
      sortFurniture();
      saveLayout();
      bus.emit('furn:removed', { instId: instId, defId: inst.def.id });
      return true;
    }
    function findFreeSpot(def) {
      var grid = state.iso.grid, fw = def.foot[0], fh = def.foot[1];
      var taken = Object.values(insts).filter(function (i) { return i.def.foot && !i.def.flat && !i.def.hitOnly; })
        .map(function (i) { return [i.gx, i.gy, i.def.foot[0], i.def.foot[1]]; });
      function conflict(x, y) {
        return taken.some(function (t) {
          return x < t[0] + t[2] && x + fw > t[0] && y < t[1] + t[3] && y + fh > t[1];
        });
      }
      var best = null, bestD = Infinity;
      for (var y = 0; y <= grid[1] - fh; y++) {
        for (var x = 0; x <= grid[0] - fw; x++) {
          if (conflict(x, y)) continue;
          var d = Math.abs(x + fw / 2 - grid[0] / 2) + Math.abs(y + fh / 2 - grid[1] / 2);
          if (d < bestD) { bestD = d; best = { gx: x, gy: y }; }
        }
      }
      return best || { gx: 0, gy: 0 };
    }

    /* 换房间包：不重建 DOM（角色层保持存活），只换数据 + 重载首场景 */
    function setPack(id) {
      var pack = registry.find('room-pack', id);
      if (!pack) return false;
      if (state.pack === pack) return true;
      state.pack = pack;
      state.furn = furnLib(pack);
      state.viewBox = pack.viewBox || state.viewBox;
      state.iso = Object.assign({}, pack.iso || {});
      state.scenes = pack.scenes || [];
      state.windowRect = null;
      loadScene(state.scenes[0].id, false);
      populateLibrary();
      bus.emit('room:pack', { pack: pack, scene: state.sceneId });
      return true;
    }

    /* ──────────── 轻音效（WebAudio 合成，无素材；默认关） ──────────── */
    var sfx = { on: false, ac: null };
    function sfxUnlock() {
      if (!sfx.on) return;
      if (!sfx.ac) {
        try { sfx.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      }
      if (sfx.ac.state === 'suspended') sfx.ac.resume();
    }
    function beep(freq, dur, type, gain) {
      if (!sfx.on || !sfx.ac) return;
      var t = sfx.ac.currentTime;
      var o = sfx.ac.createOscillator(), g = sfx.ac.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || .06, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(sfx.ac.destination);
      o.start(t); o.stop(t + dur + .02);
    }
    function setSound(on) {
      sfx.on = !!on;
      if (sfx.on) sfxUnlock();
      try { localStorage.setItem('room.sound', sfx.on ? '1' : '0'); } catch (e) {}
      bus.emit('sound:toggle', { on: sfx.on });
    }

    /* ──────────── 家具库面板：列出 pack 里所有可摆家具 ──────────── */
    function populateLibrary() {
      if (!dom || !dom.libItems) return;
      dom.libItems.innerHTML = '';
      (state.furn || []).forEach(function (def) {
        if (def.hitOnly) return;
        var b = document.createElement('button');
        b.className = 'room-lib-item';
        b.dataset.def = def.id;
        b.title = def.name + (def.sub ? ' · ' + def.sub : '');
        if (def.sprite) { var im = document.createElement('img'); im.src = def.sprite; im.alt = def.name; b.appendChild(im); }
        var s = document.createElement('span');
        s.textContent = def.name;
        b.appendChild(s);
        dom.libItems.appendChild(b);
      });
      dom.lib.onclick = function (e) {
        var it = e.target.closest && e.target.closest('.room-lib-item');
        if (!it) return;
        var inst = addFurniture(it.dataset.def);
        if (inst) {
          positionHint(inst.x, inst.y - 40);
          dom.hint.textContent = '已添加：' + inst.def.name;
          setTimeout(function () { dom.hint.style.opacity = 0; }, 900);
        }
      };
    }
    function getLayout(sceneId) {
      try { return JSON.parse(localStorage.getItem('room.layout.' + (state.pack.id) + '.' + sceneId) || 'null'); } catch (e) { return null; }
    }
    function saveLayout() {
      var layout = { v: 2, items: {}, added: [], removed: (state._removed || []).slice() };
      Object.values(insts).forEach(function (i) {
        if (i.def.hitOnly) return;
        if (i.added) layout.added.push({ instId: i.instId, defId: i.def.id, gx: i.gx, gy: i.gy });
        else layout.items[i.instId] = { gx: i.gx, gy: i.gy };
      });
      localStorage.setItem('room.layout.' + state.pack.id + '.' + state.sceneId, JSON.stringify(layout));
      bus.emit('arrange:saved', { sceneId: state.sceneId, layout: layout });
    }
    function resetLayout() {
      localStorage.removeItem('room.layout.' + state.pack.id + '.' + state.sceneId);
      loadScene(state.sceneId, true);
    }

    /* ──────────── 布置模式（拖拽吸附） ──────────── */
    function enterArrange(on) {
      state.arrange = !!on;
      host.classList.toggle('arrange', state.arrange);
      if (dom) dom.arrangebar.style.display = state.arrange ? 'flex' : 'none';
      if (!state.arrange) { dom.hint.style.opacity = 0; saveLayout(); }
      bus.emit('calib:toggle', { on: state.arrange });
    }
    function startDragFurn(inst, down) {
      if (!inst.def.foot) return;           // hitZone（窗/门等）锚在画上，不可拖
      down.preventDefault();
      var move = function (mv) {
        var p = toViewBox(mv.clientX, mv.clientY);
        var g = pxToGrid(p.x, p.y);
        var fw = inst.def.foot[0], fh = inst.def.foot[1];
        inst.gx = clamp(Math.round(g.gx - fw / 2 + .5), 0, state.iso.grid[0] - fw);
        inst.gy = clamp(Math.round(g.gy - fh / 2 + .5), 0, state.iso.grid[1] - fh);
        var np = gridToPx(inst.gx, inst.gy, inst.def.foot);
        inst.x = np.x; inst.y = np.y;
        updateHitGeom(inst);
        sortFurniture();
      };
      var up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }
    function toViewBox(clientX, clientY) {
      var pt = dom.svgBack.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      return pt.matrixTransform(dom.svgBack.getScreenCTM().inverse());
    }

    /* ──────────── 家具状态与信息 ──────────── */
    function setFurnState(instId, patch) {
      var inst = insts[instId];
      if (!inst) return;
      Object.assign(inst.state, patch);
      if (inst.def.on && typeof inst.def.on.change === 'function') {
        try { inst.def.on.change(inst.state, api, inst.fx, inst); } catch (e) { console.error('[room] 家具 change 失败:', instId, e); }
      }
      bus.emit('furn:change', { instId: instId, defId: inst.def.id, state: Object.assign({}, inst.state) });
    }
    function hideDrawer() { if (dom) dom.drawer.style.display = 'none'; }
    function renderDrawer(data) {
      var d = dom.drawer;
      d.querySelector('h4').textContent = data.title || '';
      d.querySelector('.room-drawer-sub').textContent = data.sub || '';
      var body = d.querySelector('.room-drawer-body');
      if (data.html) body.innerHTML = data.html;
      else body.innerHTML = (data.lines || []).map(function (line) {
        if (Array.isArray(line)) return '<div class="kv"><span>' + esc(line[0]) + '</span><span>' + esc(line[1]) + '</span></div>';
        return '<div class="line">' + esc(line) + '</div>';
      }).join('');
      var links = d.querySelector('.room-drawer-links');
      links.innerHTML = (data.links || []).map(function (l) {
        return '<span class="link" data-goto="' + esc(l.furn) + '">' + esc(l.label) + ' →</span>';
      }).join('');
      links.style.display = (data.links && data.links.length) ? 'flex' : 'none';
      var box = host.getBoundingClientRect();
      var left = (state.lastClickX || 0) < box.left + box.width / 2 ? box.width - 292 : 20;
      d.style.left = Math.max(12, left) + 'px';
      d.style.top = '14%';
      d.style.display = 'block';
    }
    async function openFurnInfo(inst) {
      bus.emit('furn:open', { instId: inst.instId, defId: inst.def.id });
      var providers = registry.all('content').filter(function (p) {
        var ids = p.furniture || p.slots;
        return ids === '*' || (Array.isArray(ids) && ids.indexOf(inst.def.id) >= 0);
      });
      var data = null;
      for (var i = 0; i < providers.length; i++) {
        try {
          var r = await providers[i].provide(inst, api);
          if (r) { data = r; break; }
        } catch (e) { console.warn('[room] 内容源出错:', providers[i].id, e); }
      }
      data = data || { title: inst.def.name, sub: inst.def.sub || '这里还空着', lines: [] };
      renderDrawer(data);
      bus.emit('furn:content', { instId: inst.instId, data: data });
    }

    /* ──────────── 反馈动效 ──────────── */
    function furnShake(instId) {
      var inst = insts[instId];
      if (!inst) return;
      inst.node.classList.remove('shake');
      inst.node.classList.add('shake');
      setTimeout(function () { inst.node.classList.remove('shake'); }, 600);
    }
    function floatText(x, y, text, ms) {
      var f = document.createElement('div');
      f.className = 'room-float';
      f.textContent = text;
      var p = vbToHost(x, y);
      f.style.left = p.x + 'px';
      f.style.top = p.y + 'px';
      dom.floats.appendChild(f);
      setTimeout(function () { f.classList.add('bye'); }, (ms || 1400) - 500);
      setTimeout(function () { f.remove(); }, ms || 1400);
    }
    function sayCharacter(text, ms) {
      if (!dom) return;
      var c = state.character || { x: state.viewBox[0] / 2, y: state.viewBox[1] / 2, h: 120 };
      dom.say.textContent = text;
      var p = vbToHost(c.x, c.y - (c.h || 120) - 6);
      dom.say.style.left = p.x + 'px';
      dom.say.style.top = p.y + 'px';
      dom.say.classList.add('show');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(function () { dom.say.classList.remove('show'); }, ms || 2600);
    }

    /* ──────────── 环境渲染 ──────────── */
    function paint(hour) {
      if (!dom) return;
      var s = resolveScene(state.periods, hour);
      state.env = s;
      var w = state.weathers[state.weather] || DEFAULT_WEATHERS.clear;
      host.style.setProperty('--brightness', (s.brightness * (w.brightness != null ? w.brightness : 1)).toFixed(3));
      host.style.setProperty('--ambient', s.ambient);
      host.style.setProperty('--sun', s.noSun ? 0 : (s.sun * 0.65).toFixed(2));
      dom.sunbeam.setAttribute('opacity', s.noSun ? 0 : (s.sun * 0.65).toFixed(2));
      setWeatherFx(state.weather);
      updateClockChip();
      bus.emit('scene:change', { scene: s, weather: state.weather, hour: hour, lamp: state.lamp });
    }
    var fxGroups = {};
    function setWeatherFx(id) {
      if (!dom) return;
      Object.keys(fxGroups).forEach(function (k) { fxGroups[k].g.style.opacity = k === id ? 1 : 0; });
      var area = state.windowRect || { x: state.viewBox[0] * .62, y: state.viewBox[1] * .3, w: state.viewBox[0] * .16, h: state.viewBox[1] * .3 };
      dom.glass.setAttribute('x', area.x); dom.glass.setAttribute('y', area.y);
      dom.glass.setAttribute('width', area.w); dom.glass.setAttribute('height', area.h);
      dom.glass.setAttribute('visibility', id !== 'clear' ? 'visible' : 'hidden');
      if (fxGroups[id] || !state.weathers[id]) return;
      var g = el('g', { class: 'fx-' + id, style: 'opacity:0;transition:opacity 2s' });
      dom.gWeather.appendChild(g);
      var w = state.weathers[id];
      var tick = (typeof w.fx === 'function') ? w.fx(g, area) : (DEFAULT_FX[id] ? DEFAULT_FX[id](g, area) : null);
      fxGroups[id] = { g: g, tick: tick };
      g.style.opacity = id === state.weather ? 1 : 0;
    }
    function startFxLoop() {
      if (fxTimer) clearInterval(fxTimer);
      var t = 0;
      fxTimer = setInterval(function () {
        t += 1;
        Object.keys(fxGroups).forEach(function (k) { if (fxGroups[k].tick) fxGroups[k].tick(t); });
      }, 60);
    }
    function startAmbient() {
      if (!state.ambient) return;
      ambientTimer = setInterval(function () {
        if (!state.auto || Date.now() < state.ambientGraceUntil || Math.random() > 0.22) return;
        var pool = CYCLE.filter(function (w) { return w !== state.weather; });
        var next = pool[Math.floor(Math.random() * (Math.random() < 0.7 ? 1 : pool.length))];
        state._ambientSet = true;
        api.setWeather(next);
        state._ambientSet = false;
        bus.emit('weather:auto', { weather: next });
      }, 1000 * 75);
    }
    function updateClockChip() {
      if (!dom || !state.hud || !state.env) return;
      var h = state.auto ? nowHour() : (state.periods.find(function (p) { return p.id === state.manualPeriod; }) || { hour: 12 }).hour;
      var w = state.weathers[state.weather];
      var per = (state.periods.find(function (p) { return p.id === state.env.id; }) || {}).label || '';
      var sc = state.scenes.filter(function (s) { return s.id === state.sceneId; })[0];
      dom.clock.textContent = (sc ? sc.name + ' · ' : '') + per + ' · ' + (w ? w.label : '') + ' · ' + pad2(Math.floor(h % 24)) + ':' + pad2(Math.round((h % 1) * 60) % 60);
      dom.clock.classList.add('show');
      clearTimeout(dom.clock._t);
      dom.clock._t = setTimeout(function () { dom.clock.classList.remove('show'); }, 3500);
    }
    function nowHour() { var d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    function startClock() {
      if (clockTimer) clearInterval(clockTimer);
      clockTimer = setInterval(function () { if (state.auto) paint(nowHour()); }, 60000);
    }

    /* ──────────── 占位角色（无 kit 时） ──────────── */
    var charNode = null;
    function showCharacter(cfg) {
      if (!dom) return;
      if (!charNode) {
        charNode = el('image', { class: 'character' });
        dom.gChar.appendChild(charNode);
      }
      state.character = cfg;
      charNode.setAttribute('href', cfg.src);
      charNode.setAttribute('x', cfg.x - cfg.w / 2);
      charNode.setAttribute('y', cfg.y - cfg.h);
      charNode.setAttribute('width', cfg.w);
      charNode.setAttribute('height', cfg.h);
      charNode.style.visibility = 'visible';
      sortFurniture();
    }
    function hideCharacter() {
      if (charNode) charNode.style.visibility = 'hidden';
      state.character = null;
      bus.emit('character:hide', null);
    }

    /* ──────────── 部件层 ──────────── */
    function mountWidgets() {
      registry.all('widget').forEach(function (w) {
        var box = document.createElement('div');
        box.className = 'room-widget';
        box.dataset.widget = w.id;
        dom.widgets.appendChild(box);
        try { w.mount(box, api); } catch (e) { console.error('[room] 部件挂载失败:', w.id, e); }
      });
    }

    function applyEnvironments() {
      registry.all('environment').forEach(function (env) {
        if (env.periods) state.periods = env.periods;
        if (env.weathers) Object.assign(state.weathers, env.weathers);
      });
    }

    /* ──────────── 启动 ──────────── */
    function boot() {
      if (booted) return api;
      booted = true;
      var pack = registry.all('room-pack')[0] || null;
      if (!pack) throw new Error('[room] 没有注册任何 room-pack');
      state.pack = pack;
      state.furn = furnLib(pack);
      state.viewBox = pack.viewBox || state.viewBox;
      if (pack.iso) state.iso = Object.assign({}, state.iso, pack.iso);
      state.scenes = pack.scenes || [{ id: 'room', name: pack.name || '房间', shell: pack.base, furniture: pack.components || [] }];

      buildDom(state.viewBox);
      populateLibrary();
      applyEnvironments();
      TYPES.forEach(function (type) {
        registry.all(type).forEach(function (def) {
          if (typeof def.setup === 'function') {
            try { def.setup(api); } catch (e) { console.error('[room] 插件 setup 失败:', def.id, e); }
          }
        });
      });
      loadScene(state.scenes[0].id, true);
      mountWidgets();
      paint(state.manualPeriod != null
        ? (state.periods.find(function (p) { return p.id === state.manualPeriod; }) || { hour: 12 }).hour
        : nowHour());
      startClock();
      startFxLoop();
      startAmbient();
      if (state.arrange) enterArrange(true);
      bus.emit('room:ready', { pack: pack, viewBox: state.viewBox, scene: state.sceneId });
      return api;
    }

    /* ──────────── 对外 API ──────────── */
    var api = {
      version: VERSION,
      bus: bus, registry: registry, state: state, host: host,
      get svg() { return dom && dom.svgBack; },
      use: function (def) {
        registry.add(def);
        if (booted && typeof def.setup === 'function') {
          try { def.setup(api); } catch (e) { console.error('[room] 插件 setup 失败:', def.id, e); }
        }
        return api;
      },
      boot: boot,
      /* 场景 */
      scenes: function () { return state.scenes.map(function (s) { return { id: s.id, name: s.name }; }); },
      packs: function () { return registry.all('room-pack').map(function (p) { return { id: p.id, name: p.name }; }); },
      packId: function () { return state.pack && state.pack.id; },
      setPack: setPack,
      sceneId: function () { return state.sceneId; },
      switchScene: function (id) { if (state.sceneId !== id) loadScene(id, false); },
      /* 家具 */
      furniture: function (instId) { return insts[instId] || null; },
      furnitureList: function () { return Object.values(insts); },
      gotoFurniture: function (instId) {
        var inst = insts[instId];
        if (!inst || !inst.def.anchor) return;
        var a = inst.def.anchor;
        bus.emit('resident:goto', {
          x: inst.x + (a.dx || 0), y: inst.y + (a.dy || 0), pose: a.pose, instId: instId
        });
      },
      setFurnState: setFurnState,
      furnShake: furnShake,
      addFurniture: addFurniture,
      removeFurniture: removeFurniture,
      saveLayout: saveLayout,
      floatText: floatText,
      sayCharacter: sayCharacter,
      camReset: camReset,
      camZoom: camZoom,
      vbToHost: vbToHost,
      setSound: setSound,
      soundOn: function () { return sfx.on; },
      updateResidentY: function (y) {
        if (state.residentY === y) return;
        state.residentY = y;
        sortFurniture();
      },
      /* 环境与系统（兼容旧 API） */
      setWeather: function (id) {
        if (!state.weathers[id]) return;
        if (!state._ambientSet) state.ambientGraceUntil = Date.now() + 180000;
        state.weather = id;
        if (state.manualPeriod != null) paint((state.periods.find(function (p) { return p.id === state.manualPeriod; }) || { hour: 12 }).hour);
        else paint(nowHour());
        bus.emit('weather:change', { weather: id });
      },
      cycleWeather: function () {
        var i = CYCLE.indexOf(state.weather);
        api.setWeather(CYCLE[(i + 1) % CYCLE.length]);
      },
      setPeriod: function (id) {
        state.auto = id == null;
        state.manualPeriod = id;
        if (id != null) {
          var p = state.periods.find(function (x) { return x.id === id; });
          if (p) paint(p.hour);
        } else paint(nowHour());
      },
      setLamp: function (on) { state.lamp = !!on; bus.emit('lamp:change', { on: state.lamp }); },
      enterArrange: enterArrange,
      enterCalib: enterArrange,
      nowHour: nowHour,
      openInfo: function (instId) { var i = insts[instId]; if (i) return openFurnInfo(i); },
      /* 兼容占位角色 */
      showCharacter: showCharacter,
      hideCharacter: hideCharacter,
      component: function (id) { return insts[id] || null; },
      setCompState: setFurnState
    };
    return api;
  }

  global.RoomCore = {
    version: VERSION,
    create: create,
    resolveScene: resolveScene,
    lerp: lerp,
    mixHex: mixHex
  };
})(window);
