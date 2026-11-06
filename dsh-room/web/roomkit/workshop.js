/**
 * RoomKit · 创作者工具：场景管理、内容包（导入/导出/卸载）、自制家具工坊、角色卡导入。
 * 这些面板挂在布置模式的「场景」「素材」两页；所有内容都能导出成 JSON 分享给别人（格式见 docs/04）。
 */
import { esc } from './ui.js';
import { uid, clone, clamp, pick } from './util.js';
import { Iso } from './iso.js';
import { normalizeDef, CATEGORY_NAMES } from './catalog.js';
import { paintSprite } from './paint-furniture.js';
import { paintWallItem, wallItemFrame } from './paint-room.js';
import { paintWhale, WHALE_LOOKS } from './paint-whale.js';
import { exportPack } from './packs.js';
import { readCharacterFile } from './character.js';

export function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function pickFile(accept) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.onchange = () => { res(inp.files && inp.files[0]); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}

/** 我的家具包（自制家具、导入的角色卡都放这里；可一键导出分享） */
export async function myPack(app) {
  let p = app.packs.find((x) => x.id === 'my');
  if (!p && app.packStore) p = await app.packStore.get('my');
  if (!p) p = { format: 'roomkit.pack', v: 1, id: 'my', name: '我的家具包', author: '', validated: true, mine: true, furniture: [], characters: [], stories: [], scenes: [], plays: [] };
  return p;
}
async function saveMyPack(app, p) {
  if (app.packStore) await app.packStore.put(p);
  app.usePack(p);
}

/* ───────── 场景页 ───────── */

export function renderScenesPane(ed, el) {
  const app = ed.app, sc = app.world.scene;
  const saved = app.storage.list ? app.storage.list() : [];
  const tpls = [];
  app.packs.forEach((p) => (p.scenes || []).forEach((s) => tpls.push({ key: p.id + '|' + s.id, name: s.name || s.id, pack: p.name })));
  el.innerHTML = `
    <div class="rk-field">当前场景</div>
    <div class="rk-line"><input type="text" data-sc-in="name" value="${esc(sc.name)}" maxlength="24"></div>
    <div class="rk-chips" style="margin-top:6px">
      <button data-sc="new">＋ 空房间</button><button data-sc="open-air">＋ 露天广场</button><button data-sc="dup">复制当前</button><button data-sc="export">导出场景</button><button data-sc="import">导入场景</button>
    </div>
    <div class="rk-field">我的场景</div>
    ${saved.length ? saved.map((s) => `<div class="rk-scene ${s.id === sc.id ? 'on' : ''}" data-sc-open="${esc(s.id)}"><span>${esc(s.name || s.id)}</span><small>${s.w || '?'}×${s.h || '?'}</small>${s.id === sc.id ? '' : `<button data-sc-del="${esc(s.id)}" title="删除">×</button>`}</div>`).join('') : '<div class="rk-hint">还没有存过的场景（改动会自动保存）</div>'}
    <div class="rk-field">从模板新建</div>
    <div class="rk-chips">${tpls.map((t) => `<button data-sc-tpl="${esc(t.key)}" title="${esc(t.pack)}">${esc(t.name)}</button>`).join('') || '<span class="rk-hint">没有模板</span>'}</div>
    <div class="rk-hint">露天广场没有墙、地面更大，适合把多个房间、街道拼成大场景；场景 JSON 里可以带自己的剧情（stories），导出后发给别人就是一个"可玩的场景"。</div>`;
}

export async function onScenesClick(ed, e) {
  const app = ed.app;
  const b = e.target.closest('[data-sc],[data-sc-open],[data-sc-del],[data-sc-tpl]');
  if (!b) return false;
  if (b.hasAttribute('data-sc-del')) {
    e.stopPropagation();
    const id = b.getAttribute('data-sc-del');
    if (confirm('删除这个场景？（不能撤销）')) { app.storage.remove(id); ed.refresh(); }
    return true;
  }
  if (b.hasAttribute('data-sc-open')) {
    const id = b.getAttribute('data-sc-open');
    if (id !== app.world.scene.id) app.goRoom(id);
    return true;
  }
  if (b.hasAttribute('data-sc-tpl')) {
    const [pid, sid] = b.getAttribute('data-sc-tpl').split('|');
    const p = app.packs.find((x) => x.id === pid), t = p && (p.scenes || []).find((s) => s.id === sid);
    if (t) { const s = clone(t); s.template = t.id; s.id = uid('scene'); app.openScene(s); app.hud.toast('已从模板新建：' + s.name); }
    return true;
  }
  const a = b.getAttribute('data-sc');
  if (a === 'new' || a === 'open-air') {
    const open = a === 'open-air';
    app.openScene({
      id: uid('scene'), name: open ? '露天广场' : '新房间',
      room: open
        ? { w: 16, h: 12, mats: [{ kind: 'grass', color: '#9bd17a' }, { kind: 'stone', color: '#d9d2c3' }], walls: { left: false, right: false, height: 300 }, slab: 22 }
        : { w: 8, h: 6, walls: { left: true, right: true, height: 300 } },
      objects: open ? [] : [{ def: 'door', wall: 'right', at: 6.5, z: 0 }, { def: 'window', wall: 'left', at: 2.5, z: 100 }],
      agents: [{ id: 'whale', name: '大肥鱼', brain: 'pet', character: 'dafeiyu', x: open ? 8 : 4, y: open ? 6 : 3, look: { body: '#5b8def', belly: '#eef5ff', hat: 'maid' } }],
    });
    return true;
  }
  if (a === 'dup') {
    const s = app.world.toJSON();
    s.id = uid('scene'); s.name = (s.name || '房间') + ' 副本';
    app.openScene(s);
    app.hud.toast('已复制为：' + s.name);
    return true;
  }
  if (a === 'export') { app.exportScene(); return true; }
  if (a === 'import') { ed.el.file.click(); return true; }
  return true;
}

export function onScenesChange(ed, e) {
  const t = e.target;
  if (t.getAttribute('data-sc-in') !== 'name') return false;
  const name = t.value.trim().slice(0, 24);
  if (name && name !== ed.app.world.scene.name) ed.exec({ t: 'meta', patch: { name } });
  return true;
}

/* ───────── 素材页：内容包 / 自制家具 / 角色卡 ───────── */

export function renderPacksPane(ed, el) {
  const app = ed.app;
  const count = (p) => [(p.furniture || []).length + ' 件家具', (p.stories || []).length ? p.stories.length + ' 段剧情' : '', (p.characters || []).length ? p.characters.length + ' 张角色卡' : ''].filter(Boolean).join(' · ');
  const chars = [...app.characters.values()];
  el.innerHTML = `
    <div class="rk-chips">
      <button data-pk="workshop" class="on">＋ 自制家具</button><button data-pk="import">导入内容包</button><button data-pk="export-my">导出我的包</button>
    </div>
    <div class="rk-field">已安装的内容包</div>
    ${app.packs.map((p) => `<div class="rk-pack"><b>${esc(p.name || p.id)}</b><span>${esc((p.author ? p.author + ' · ' : '') + count(p))}</span>${p.community || p.mine ? `<button data-pk-del="${esc(p.id)}" title="卸载">卸载</button>` : '<small>内置</small>'}</div>`).join('')}
    <div class="rk-field">角色卡</div>
    <div class="rk-chips"><button data-pk="char">导入角色卡（PNG / JSON）</button></div>
    ${chars.map((c) => `<div class="rk-pack">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover">` : ''}<b>${esc(c.name)}</b><span>${esc((c.persona || '').slice(0, 26))}</span><button data-pk-spawn="${esc(c.id)}" title="请进房间">请进来</button></div>`).join('')}
    <div class="rk-hint">内容包就是一个 .json 文件：家具、场景、剧情、角色卡都能打包，图片内嵌其中（格式见 docs/04）。导入时会自动校验并加命名空间，别人的包也能放心装。角色卡兼容 SillyTavern / TavernAI 卡。</div>`;
}

export async function onPacksClick(ed, e) {
  const app = ed.app;
  const b = e.target.closest('[data-pk],[data-pk-del],[data-pk-spawn]');
  if (!b) return false;
  if (b.hasAttribute('data-pk-del')) {
    const id = b.getAttribute('data-pk-del');
    if (confirm('卸载这个内容包？场景里用到它的家具会暂时消失（重新导入即可恢复）。')) { await app.uninstallPack(id); app.hud.toast('已卸载'); ed.refresh(); }
    return true;
  }
  if (b.hasAttribute('data-pk-spawn')) {
    const c = app.characters.get(b.getAttribute('data-pk-spawn'));
    if (c) spawnCharacter(ed, c);
    return true;
  }
  const a = b.getAttribute('data-pk');
  if (a === 'workshop') openWorkshop(ed);
  else if (a === 'import') {
    const f = await pickFile('.json,application/json');
    if (!f) return true;
    try {
      const v = await app.installPack(await f.text());
      if (!v.ok) { app.hud.toast('导入失败：' + v.errors.join('；'), 4000); return true; }
      app.hud.toast(`已安装「${v.pack.name}」：${v.pack.furniture.length} 件家具` + (v.warnings.length ? `（${v.warnings.length} 条提醒，见控制台）` : ''), 3200);
      if (v.warnings.length) console.warn('[roomkit] 导入提醒:', v.warnings);
      ed.refresh();
    } catch (err) { app.hud.toast('导入失败：' + err.message, 4000); }
  } else if (a === 'export-my') {
    const p = await myPack(app);
    if (!(p.furniture || []).length && !(p.characters || []).length) { app.hud.toast('「我的家具包」还是空的：先自制几件家具吧'); return true; }
    const name = prompt('给你的家具包起个名字', p.name || '我的家具包');
    if (name === null) return true;
    const author = prompt('作者署名（会写进包里）', p.author || '') || '';
    const out = exportPack(Object.assign({}, p, { name: name || p.name, author }));
    out.id = (prompt('包 id（字母数字，别人导入后家具 id 会是 "包id/家具id"）', p.exportId || 'my-furniture') || 'my-furniture').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'my-furniture';
    p.exportId = out.id; p.name = out.name; p.author = author;
    if (app.packStore) app.packStore.put(p);
    download(out.id + '.roomkit.json', out);
    app.hud.toast('已导出：' + out.id + '.roomkit.json');
  } else if (a === 'char') {
    const f = await pickFile('.png,.json,application/json,image/png');
    if (!f) return true;
    try {
      const card = await readCharacterFile(f);
      card.id = 'my/' + card.id;
      const p = await myPack(app);
      p.characters = (p.characters || []).filter((c) => c.id !== card.id).concat([card]);
      await saveMyPack(app, p);
      spawnCharacter(ed, card);
      ed.refresh();
    } catch (err) { app.hud.toast('角色卡读取失败：' + err.message, 4000); }
  }
  return true;
}

function spawnCharacter(ed, card) {
  const app = ed.app, w = app.world;
  const spot = app.nav.nearestFree(w.room.w / 2, w.room.h / 2, 8) || { x: 1, y: 1 };
  const look = Object.assign({}, pick(WHALE_LOOKS), card.look || {});
  ed.exec({ t: 'agent.add', agent: { id: uid('a'), name: card.name, kind: card.kind === 'whale' ? 'whale' : 'girl', brain: 'auto', character: card.id, x: spot.x, y: spot.y, look } });
  app.hud.toast(card.name + ' 搬进来了！');
  app.sfx('place');
}

/* ───────── 自制家具工坊 ───────── */

const SLOT_PRESETS = {
  '': null,
  sit: (w, h) => ({ id: 'sit', pose: 'sit', at: [w / 2, h / 2], z: 40, face: [0, 1], need: { energy: 0.15, fun: 0.1 }, dur: [6, 14], label: '坐一会儿' }),
  sleep: (w, h) => ({ id: 'sleep', pose: 'sleep', at: [w / 2, h / 2], z: 36, face: [1, 0], need: { energy: 0.8 }, dur: [25, 45], label: '睡觉' }),
  read: (w, h) => ({ id: 'read', pose: 'read', at: [w / 2, h + 0.45], face: [0, 1], need: { fun: 0.35 }, dur: [10, 20], label: '看书' }),
  work: (w, h) => ({ id: 'work', pose: 'work', at: [w / 2, h + 0.45], face: [0, -1], need: { fun: 0.1 }, dur: [12, 25], label: '干活' }),
  look: (w, h) => ({ id: 'look', pose: 'look', at: [w / 2, h + 0.5], face: [0, -1], need: { fun: 0.3 }, dur: [5, 9], label: '看看' }),
  eat: (w, h) => ({ id: 'eat', pose: 'eat', at: [w / 2, h + 0.45], face: [0, 1], need: { energy: 0.3, fun: 0.2 }, dur: [5, 9], label: '吃东西' }),
  dance: (w, h) => ({ id: 'play', pose: 'dance', at: [w / 2, h + 0.5], face: [0, -1], need: { fun: 0.5 }, dur: [6, 12], label: '玩一会儿' }),
};

async function loadImageFile(file, max = 768) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('图片打不开')); im.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    let x0 = 0, y0 = 0, x1 = img.width, y1 = img.height;
    try {
      // 裁掉透明边：贴图只留家具本身，fit/对齐才好调
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (d[(y * img.width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
      }
      if (maxX >= minX && maxY >= minY) { x0 = minX; y0 = minY; x1 = maxX + 1; y1 = maxY + 1; }
    } catch (e) { /* 读不到像素就不裁 */ }
    const w = x1 - x0, h = y1 - y0, k = Math.min(1, max / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
    out.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, out.width, out.height);
    let src = out.toDataURL('image/webp', 0.9);
    if (src.indexOf('data:image/webp') !== 0) src = out.toDataURL('image/png');
    const im2 = new Image();
    await new Promise((res) => { im2.onload = res; im2.onerror = res; im2.src = src; });
    return { src, img: im2, iw: out.width, ih: out.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildDef(st) {
  const def = { id: st.id || 'my/draft', name: st.name || '我的家具', sub: '自制', cat: st.cat || 'misc', mount: st.mount, palette: {}, pack: 'my' };
  if (st.mount === 'wall') {
    def.wsize = [st.w, Math.max(10, Math.round(((st.w * 64 * st.ih) / st.iw) * st.fit))];
    def.wz = 100;
    def.art = { kind: 'wall', draw: 'image', src: st.src };
  } else {
    def.size = [st.w, st.h];
    const sy = st.mount === 'flat' ? st.sy : 1;
    def.art = { kind: 'sprite', src: st.src, fit: st.fit, dx: st.dx, dy: st.dy, sy };
    const span = (st.w + st.h) * 64, dh = ((span * st.fit) / st.iw) * st.ih * sy;
    def.height = st.mount === 'flat' ? 2 : Math.max(16, Math.round(dh - (st.w + st.h) * 16));
    const slot = SLOT_PRESETS[st.slot] && SLOT_PRESETS[st.slot](st.w, st.h);
    def.slots = slot ? [slot] : [];
    if (slot) def.act = 'use:' + slot.id;
  }
  if (st.act === 'toggle') {
    def.states = { on: false };
    def.light = { at: [st.w / 2, st.h / 2], z: Math.max(40, (def.height || 100) * 0.8), radius: 3, color: '#ffd59a', when: 'on' };
    def.act = 'toggle:on';
    def.say = ['开灯', '关灯'];
  } else if (st.act === 'shake' && !def.act) { def.act = 'shake'; def.say = ['晃了晃']; }
  else if (!def.act) def.act = 'info';
  return def;
}

function drawPreview(canvas, st) {
  const dpr = 2, W = 220, H = 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const iso = new Iso(64, 32);
  const def = normalizeDef(buildDef(st));
  const w = st.mount === 'wall' ? 2 : st.w, h = st.mount === 'wall' ? 1 : st.h;
  const G = Math.max(w, h) + 2;
  const b = { l: -(G - 0.5) * 64, r: (G + 0.5) * 64, t: -300, b: (G * 2) * 32 + 10 };
  const k = Math.min((W - 10) / (b.r - b.l), (H - 10) / (b.b - b.t));
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (W / 2 - ((b.l + b.r) / 2) * k) * dpr, (H / 2 - ((b.t + b.b) / 2) * k) * dpr);
  // 地面网格 + 占地
  for (let y = -1; y < G - 1; y++) for (let x = -1; x < G - 1; x++) {
    const pts = iso.diamond(x, y, x + 1, y + 1);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = (x + y) % 2 ? '#e8d6bf' : '#ecdcc7'; ctx.fill();
  }
  if (st.mount === 'wall') {
    const H2 = 260, p0 = iso.toWorld(-1, -1, 0), p1 = iso.toWorld(G - 1, -1, 0);
    ctx.fillStyle = '#f6ead6';
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p1.x, p1.y - H2); ctx.lineTo(p0.x, p0.y - H2); ctx.closePath(); ctx.fill();
  } else {
    const pts = iso.diamond(0, 0, w, h, 0.5);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = 'rgba(80,200,120,.25)'; ctx.fill(); ctx.strokeStyle = 'rgba(60,170,100,.9)'; ctx.lineWidth = 2; ctx.stroke();
  }
  const ident = { map: (x, y) => [x, y], dir: (a, c) => [a, c], localFace: (f) => f, mirror: false };
  const fp = { x0: 0, y0: 0, x1: w, y1: h, w, h, o: ident };
  const whale = { pose: 'stand', look: { body: '#5b8def', belly: '#eef5ff' }, front: true, right: false, phase: 0, blink: 0, sq: 0, seed: 1 };
  const wp = iso.toWorld(w + 0.7, h * 0.5 + 0.3);
  const drawWhale = () => { ctx.save(); ctx.translate(wp.x, wp.y); paintWhale(ctx, whale, 0); ctx.restore(); };
  if (st.img && st.mount === 'wall') {
    const fr = wallItemFrame(iso, 'right', (G - 2) / 2, def.wsize[0], 100, def.wsize[1]);
    fr.e += 64; fr.f -= 32;   // 预览里的墙画在 y=-1 那条线上
    paintWallItem(ctx, fr, def, { state: {}, at: 0 }, () => '#cccccc', { night: false, sky: ['#9cc8f0', '#e6f3ff'], weather: 'clear' }, 0, 'right');
    drawWhale();
  } else if (st.img) {
    paintSprite(ctx, iso, def, { x: 0, y: 0, rot: 0, state: {} }, fp, st.img);
    drawWhale();
  } else {
    drawWhale();
  }
}

export function openWorkshop(ed) {
  const app = ed.app, root = app.root;
  let modal = root.querySelector('.rk-modal');
  if (!modal) { root.insertAdjacentHTML('beforeend', '<div class="rk-modal"></div>'); modal = root.querySelector('.rk-modal'); }
  const cats = Object.keys(CATEGORY_NAMES);
  const st = { name: '我的家具', cat: 'deco', mount: 'floor', w: 1, h: 1, fit: 1, dx: 0, dy: 0, sy: 0.6, slot: '', act: 'info', src: null, img: null, iw: 1, ih: 1 };
  modal.innerHTML = `
    <div class="rk-modal-box">
      <h4>自制家具 <small style="color:var(--rk-sub);font-weight:400">上传一张透明背景的等距图（PNG/WebP），调到和旁边的小鲸鱼比例合适</small></h4>
      <div class="rk-ws">
        <canvas class="rk-ws-prev"></canvas>
        <div class="rk-ws-form">
          <label>图片 <input type="file" accept="image/png,image/webp,image/jpeg,image/gif" data-w="file"></label>
          <label>名字 <input type="text" data-w="name" value="${esc(st.name)}" maxlength="24"></label>
          <label>分类 <select data-w="cat">${cats.map((c) => `<option value="${c}" ${c === st.cat ? 'selected' : ''}>${esc(CATEGORY_NAMES[c])}</option>`).join('')}</select></label>
          <label>摆法 <select data-w="mount"><option value="floor">落地家具</option><option value="flat">地毯（贴地）</option><option value="wall">挂在墙上</option></select></label>
          <label>占地 宽 <input type="number" min="1" max="6" step="1" data-w="w" value="1"> 深 <input type="number" min="1" max="6" step="1" data-w="h" value="1"></label>
          <label>大小 <input type="range" min="0.2" max="1.8" step="0.01" data-w="fit" value="1"></label>
          <label>左右 <input type="range" min="-120" max="120" step="1" data-w="dx" value="0"></label>
          <label>上下 <input type="range" min="-160" max="120" step="1" data-w="dy" value="0"></label>
          <label>压扁（地毯） <input type="range" min="0.3" max="1" step="0.01" data-w="sy" value="0.6"></label>
          <label>互动 <select data-w="slot"><option value="">无</option><option value="sit">坐</option><option value="sleep">睡</option><option value="read">看书</option><option value="work">干活</option><option value="look">观赏</option><option value="eat">吃东西</option><option value="dance">玩耍</option></select></label>
          <label>点击 <select data-w="act"><option value="info">显示名字</option><option value="shake">摇一摇</option><option value="toggle">开关灯（会发光）</option></select></label>
        </div>
      </div>
      <div class="rk-row">
        <button type="button" class="rk-btn on" data-w="save">保存并摆放</button>
        <button type="button" class="rk-btn" data-w="cancel">取消</button>
      </div>
    </div>`;
  modal.classList.add('on');
  const prev = modal.querySelector('.rk-ws-prev');
  const redraw = () => drawPreview(prev, st);
  redraw();
  const read = () => {
    modal.querySelectorAll('[data-w]').forEach((inp) => {
      const k = inp.getAttribute('data-w');
      if (!(k in st) || inp.type === 'file' || inp.tagName === 'BUTTON') return;
      st[k] = inp.type === 'range' || inp.type === 'number' ? +inp.value : inp.value;
    });
    st.w = clamp(Math.round(st.w) || 1, 1, 6); st.h = clamp(Math.round(st.h) || 1, 1, 6);
    redraw();
  };
  modal.oninput = (e) => { if (e.target.type !== 'file') read(); };
  modal.onchange = async (e) => {
    if (e.target.getAttribute('data-w') !== 'file') { read(); return; }
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const r = await loadImageFile(f);
      Object.assign(st, r);
      if (st.name === '我的家具') { st.name = f.name.replace(/\.[^.]+$/, '').slice(0, 24); modal.querySelector('[data-w=name]').value = st.name; }
      redraw();
    } catch (err) { app.hud.toast(err.message); }
  };
  modal.onclick = async (e) => {
    const b = e.target.closest('[data-w]');
    if (e.target === modal) { modal.classList.remove('on'); return; }
    if (!b || b.tagName !== 'BUTTON') return;
    const a = b.getAttribute('data-w');
    if (a === 'cancel') { modal.classList.remove('on'); return; }
    if (a === 'save') {
      if (!st.src) { app.hud.toast('先选一张图片'); return; }
      read();
      const def = buildDef(st);
      def.id = 'my/' + uid('f');
      const p = await myPack(app);
      p.furniture = (p.furniture || []).concat([def]);
      try { await saveMyPack(app, p); } catch (err) { app.hud.toast('保存失败：' + err.message, 3500); return; }
      modal.classList.remove('on');
      ed.refresh();
      ed.switchTab(def.mount === 'wall' ? 'wall' : 'furn');
      ed.startPlace(def.id);
      app.hud.toast('「' + def.name + '」已加入家具库：点地面摆上去吧');
    }
  };
}
