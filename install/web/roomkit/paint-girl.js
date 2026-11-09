/**
 * RoomKit · 内置角色「Q 版鲸鱼娘」：用 Canvas 程序绘制，不加载模型或贴图。
 * 绘制代码沿用项目 AGPL-3.0-only 声明，形象署名与适用许可见随附 NOTICE。
 * 没加载真模型（vendor/whale-rig.js）或真模型名额用完时就是她；look 决定配色和头饰，所以一群鲸鱼娘各有各的样子。
 *
 * 局部坐标：原点 = 脚底接地点，y 向上为负，默认朝屏幕右；身高约 104（含头饰）× look.size。
 * look：{ body 代表色, hair, hair2, dress, tail, eye, skin, hat:'maid'|'bow'|'cap'|'', size }
 */
import { shade, mix, rgba } from './util.js';

export const GIRL_H = 104;

function palette(look) {
  const body = look.body || '#5b8def';
  return {
    hair: look.hair || shade(body, -0.46),
    hair2: look.hair2 || shade(body, -0.04),
    dress: look.dress || mix(shade(body, -0.6), '#232a48', 0.55),
    dress2: look.dress2 || mix(shade(body, -0.42), '#343d63', 0.5),
    tail: look.tail || body,
    fin: look.fin || shade(body, 0.28),
    eye: look.eye || shade(body, -0.12),
    skin: look.skin || '#ffeadf',
    accent: look.accent || shade(body, 0.05),
  };
}

function limb(ctx, x, y, a, len, width, color, hand) {
  const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  if (hand) { ctx.fillStyle = hand; ctx.beginPath(); ctx.arc(ex, ey, width * 0.62, 0, Math.PI * 2); ctx.fill(); }
  return [ex, ey];
}

function tail(ctx, c, wag, sit) {
  ctx.save();
  ctx.translate(-9, sit ? -9 : -21);
  ctx.rotate(wag);
  ctx.fillStyle = c.tail;
  ctx.beginPath();
  ctx.moveTo(4, -5);
  ctx.bezierCurveTo(-10, -7, -20, -3, -25, 8);
  ctx.lineTo(-20, 11);
  ctx.bezierCurveTo(-16, 5, -8, 6, 4, 6);
  ctx.closePath();
  ctx.fill();
  // 尾鳍两片
  ctx.beginPath();
  ctx.moveTo(-23, 9);
  ctx.quadraticCurveTo(-37, 7, -41, -3);
  ctx.quadraticCurveTo(-30, -3, -22, 5);
  ctx.quadraticCurveTo(-24, -7, -16, -13);
  ctx.quadraticCurveTo(-11, -2, -19, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.28);
  ctx.beginPath();
  ctx.moveTo(4, 3);
  ctx.bezierCurveTo(-8, 3, -16, 3, -21, 9);
  ctx.lineTo(-20, 11);
  ctx.bezierCurveTo(-16, 5, -8, 6, 4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function backHair(ctx, c, sway, frontView) {
  const g = ctx.createLinearGradient(0, -98, 0, -20);
  g.addColorStop(0, c.hair); g.addColorStop(0.55, mix(c.hair, c.hair2, 0.35)); g.addColorStop(1, c.hair2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-23, -80);
  ctx.bezierCurveTo(-34, -60, -31 + sway, -36, -25 + sway * 1.6, -19);
  ctx.quadraticCurveTo(-18 + sway, -24, -14 + sway * 0.8, -20);
  ctx.quadraticCurveTo(-7 + sway * 0.5, -30, -2, -40);
  if (frontView) ctx.lineTo(24, -44);
  else { ctx.quadraticCurveTo(8 + sway * 0.5, -26, 13 + sway * 0.8, -22); ctx.quadraticCurveTo(20 + sway, -28, 25 + sway * 1.2, -24); }
  ctx.bezierCurveTo(34, -52, 35, -68, 29, -82);
  ctx.bezierCurveTo(24, -104, -18, -104, -23, -80);
  ctx.closePath();
  ctx.fill();
}

function fin(ctx, x, y, s, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-8, 4, -17, -3, -19, -13);
  ctx.bezierCurveTo(-12, -13, -2, -9, 3, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.35);
  ctx.beginPath();
  ctx.moveTo(-2, 1);
  ctx.bezierCurveTo(-7, -1, -13, -6, -16, -11);
  ctx.bezierCurveTo(-10, -9, -4, -6, 1, -1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function eye(ctx, x, y, s, open, c, lookX) {
  if (open < 0.14) {
    ctx.strokeStyle = '#2b2440'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 5.2 * s, y); ctx.quadraticCurveTo(x, y + 3 * s, x + 5.2 * s, y); ctx.stroke();
    return;
  }
  const rx = 5.6 * s, ry = 7.6 * s * open;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(x, y, rx + 0.6, ry + 0.4, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
  g.addColorStop(0, shade(c.eye, -0.5)); g.addColorStop(0.55, c.eye); g.addColorStop(1, shade(c.eye, 0.5));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x + lookX, y + 0.2, rx - 0.3, ry - 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(c.eye, -0.72);
  ctx.beginPath(); ctx.ellipse(x + lookX, y - 0.6 * open, rx * 0.46, ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + lookX - rx * 0.28, y - ry * 0.42, 1.9 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + lookX + rx * 0.3, y + ry * 0.4, 1 * s, 0, Math.PI * 2); ctx.fill();
  // 上睫毛
  ctx.strokeStyle = '#2b2440'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(x, y, rx + 0.4, ry + 0.3, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
}

function arcEye(ctx, x, y, s) {
  ctx.strokeStyle = '#2b2440'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 5 * s, y + 1.5); ctx.quadraticCurveTo(x, y - 5 * s, x + 5 * s, y + 1.5); ctx.stroke();
}
function heartEye(ctx, x, y, s) {
  ctx.fillStyle = '#ff5c8a';
  ctx.beginPath();
  ctx.moveTo(x, y + 5 * s);
  ctx.bezierCurveTo(x - 8 * s, y - 1 * s, x - 4 * s, y - 7 * s, x, y - 2.5 * s);
  ctx.bezierCurveTo(x + 4 * s, y - 7 * s, x + 8 * s, y - 1 * s, x, y + 5 * s);
  ctx.fill();
}

function face(ctx, a, c, t, expr, pose) {
  const blink = a.blink || 0, lx = pose === 'read' ? 0.8 : pose === 'look' ? Math.sin(t * 1.3) * 1.6 : (a.gaze || 0);
  const ey = pose === 'read' || pose === 'work' ? -64 : -66;
  const nx = -3.5, fx = 15.5;
  if (expr === 'sleep') { eye(ctx, nx, ey + 1, 1, 0, c, 0); eye(ctx, fx, ey, 0.86, 0, c, 0); }
  else if (expr === 'happy') { arcEye(ctx, nx, ey, 1); arcEye(ctx, fx, ey - 0.5, 0.86); }
  else if (expr === 'love') { heartEye(ctx, nx, ey, 1); heartEye(ctx, fx, ey - 0.5, 0.86); }
  else {
    const open = (expr === 'surprised' ? 1.16 : expr === 'sad' ? 0.78 : expr === 'determined' ? 0.72 : pose === 'read' ? 0.68 : 1) * (1 - blink);
    eye(ctx, nx, ey, 1, open, c, lx);
    eye(ctx, fx, ey - 0.6, 0.86, open, c, lx * 0.6);
  }
  // 眉
  ctx.strokeStyle = shade(c.hair, -0.1); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  const browY = ey - (expr === 'surprised' ? 12.5 : 10.5), tilt = expr === 'sad' ? -2 : expr === 'determined' ? 2.2 : 0;
  ctx.beginPath(); ctx.moveTo(nx - 4, browY - tilt * 0.3); ctx.lineTo(nx + 3.5, browY + tilt * 0.7);
  ctx.moveTo(fx - 3, browY + tilt * 0.7); ctx.lineTo(fx + 3.5, browY - tilt * 0.3); ctx.stroke();
  // 腮红
  ctx.fillStyle = rgba('#ff8fa8', expr === 'love' || expr === 'shy' ? 0.65 : 0.34);
  ctx.beginPath(); ctx.ellipse(nx - 5, ey + 8.5, 4.6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx + 4.6, ey + 8, 3.4, 2.1, 0, 0, Math.PI * 2); ctx.fill();
  // 嘴
  const mx = 7, my = ey + 12.5;
  ctx.strokeStyle = '#7a3347'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const talk = a.speech && (t * 9) % 1 < 0.5 && a.t < a.speech.until - 0.3;
  if (pose === 'eat') {
    const o = Math.abs(Math.sin(t * 7));
    ctx.fillStyle = '#8e3a4c'; ctx.beginPath(); ctx.ellipse(mx, my, 2.6, 0.8 + o * 2, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'surprised' || talk) {
    ctx.fillStyle = '#8e3a4c'; ctx.beginPath(); ctx.ellipse(mx, my, 2, talk ? 1.7 : 2.6, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'sad') {
    ctx.beginPath(); ctx.moveTo(mx - 3, my + 1.2); ctx.quadraticCurveTo(mx, my - 1.6, mx + 3, my + 1.2); ctx.stroke();
  } else if (expr === 'sleep') {
    ctx.beginPath(); ctx.moveTo(mx - 1.6, my); ctx.lineTo(mx + 1.6, my); ctx.stroke();
  } else if (expr === 'happy' || expr === 'love') {
    ctx.fillStyle = '#c9506a'; ctx.beginPath(); ctx.moveTo(mx - 3.4, my - 1); ctx.quadraticCurveTo(mx, my + 5, mx + 3.4, my - 1); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(mx - 2.6, my - 0.4); ctx.quadraticCurveTo(mx, my + 2, mx + 2.6, my - 0.4); ctx.stroke();
  }
  if (expr === 'sad') { ctx.fillStyle = '#8fd0ff'; ctx.beginPath(); ctx.ellipse(nx - 2, ey + 8 + ((t * 18) % 7), 1.3, 1.9, 0, 0, Math.PI * 2); ctx.fill(); }
}

function bangs(ctx, c, sway) {
  const g = ctx.createLinearGradient(0, -96, 0, -60);
  g.addColorStop(0, c.hair); g.addColorStop(1, mix(c.hair, c.hair2, 0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-22, -68);
  ctx.bezierCurveTo(-27, -86, -14, -97, 4, -97);
  ctx.bezierCurveTo(22, -97, 32, -86, 28, -68);
  ctx.quadraticCurveTo(25 + sway * 0.3, -75, 22, -79);
  ctx.quadraticCurveTo(20 + sway * 0.3, -72, 15, -73);
  ctx.quadraticCurveTo(12, -78, 9, -81);
  ctx.quadraticCurveTo(7, -73, 2, -73);
  ctx.quadraticCurveTo(-1, -78, -4, -80);
  ctx.quadraticCurveTo(-6, -73, -11, -73);
  ctx.quadraticCurveTo(-14, -78, -16, -79);
  ctx.quadraticCurveTo(-20, -75, -22, -68);
  ctx.closePath();
  ctx.fill();
  // 鬓发
  ctx.beginPath();
  ctx.moveTo(-23, -74);
  ctx.bezierCurveTo(-27, -62, -24 + sway * 0.4, -52, -19 + sway * 0.6, -45);
  ctx.quadraticCurveTo(-16 + sway * 0.4, -56, -16, -72);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(29, -74);
  ctx.bezierCurveTo(31, -66, 30 + sway * 0.4, -58, 26 + sway * 0.5, -51);
  ctx.quadraticCurveTo(24, -60, 25, -72);
  ctx.closePath();
  ctx.fill();
  // 高光
  ctx.strokeStyle = rgba('#ffffff', 0.26); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, -84); ctx.quadraticCurveTo(4, -92, 21, -85); ctx.stroke();
}

function hat(ctx, look, c, t) {
  const kind = look.hat;
  if (kind === 'maid') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) ctx.arc(-15 + i * 6.2, -94 - Math.sin((i / 6) * Math.PI) * 4.2, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c.dress, 0.05);
    ctx.beginPath();
    ctx.moveTo(-19, -89); ctx.quadraticCurveTo(4, -99, 26, -89); ctx.lineTo(26, -86.5); ctx.quadraticCurveTo(4, -96, -19, -86.5);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'bow') {
    ctx.fillStyle = look.accent || c.accent;
    ctx.beginPath(); ctx.ellipse(-16, -92, 7, 4.4, -0.5, 0, Math.PI * 2); ctx.ellipse(-4, -96, 7, 4.4, 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(look.accent || c.accent, -0.2); ctx.beginPath(); ctx.arc(-10, -94, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'cap') {
    ctx.fillStyle = look.accent || '#f2c14e';
    ctx.beginPath(); ctx.ellipse(3, -91, 22, 11, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(14, -92.5, 19, 3.6);
    ctx.fillStyle = rgba('#ffffff', 0.3); ctx.beginPath(); ctx.ellipse(-3, -96, 8, 3.2, -0.2, 0, Math.PI * 2); ctx.fill();
  }
  // 呆毛
  ctx.strokeStyle = c.hair; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  const w = Math.sin(t * 2.1) * 1.6;
  ctx.beginPath(); ctx.moveTo(5, -96); ctx.bezierCurveTo(4 + w, -106, 13 + w, -110, 15 + w, -103); ctx.stroke();
}

/** a：角色运行时（pose, t, phase, blink, expr, look, right, front, sq），t：全局秒 */
export function paintGirl(ctx, a, t) {
  const look = a.look || {}, c = palette(look);
  const size = (look.size || 1) * (a.scale || 1);
  const pose = a.pose || 'stand', front = a.front !== false, right = a.right !== false;
  const ph = a.phase || 0, seed = a.seed || 0;
  const sitting = pose === 'sit' || pose === 'work' || pose === 'read' || pose === 'eat' || pose === 'sleep';
  const breathe = Math.sin(t * 2.4 + seed);
  let lift = 0, rot = 0, sx = 1, sy = 1 + breathe * 0.012, headTilt = Math.sin(t * 0.9 + seed) * 0.02;
  let armN = 0.1, armF = -0.1, legSwing = 0, legLift = 0;
  let wag = Math.sin(t * 2.3 + seed) * 0.1;
  let sway = Math.sin(t * 1.5 + seed) * 0.8;
  switch (pose) {
    case 'walk': case 'run': {
      const k = pose === 'run' ? 1.5 : 1;
      lift = Math.abs(Math.sin(ph)) * 2.6 * k;
      rot = 0.05 * k;
      legSwing = 7.5 * k; legLift = 3.2 * k;
      armN = -Math.sin(ph) * 0.65 * k; armF = Math.sin(ph) * 0.65 * k;
      wag = Math.sin(ph) * 0.2; sway = -3 * k + Math.sin(ph) * 1.2;
      break;
    }
    case 'sit': armN = 0.45; armF = 0.3; break;
    case 'sleep': armN = 0.3; armF = 0.2; headTilt = 0.12; wag = Math.sin(t * 1.1) * 0.04; sy = 1 + Math.sin(t * 1.6) * 0.012; break;
    case 'work': armN = 1.2 + Math.sin(t * 15) * 0.1; armF = 1.15 - Math.sin(t * 15) * 0.1; headTilt = 0.03; break;
    case 'read': armN = 1.05; armF = 0.95; headTilt = 0.07; break;
    case 'eat': armN = 1.5 + Math.abs(Math.sin(t * 3.5)) * 0.8; armF = 0.5; break;
    case 'cook': armN = 1.25 + Math.sin(t * 6) * 0.3; armF = 1.0 + Math.cos(t * 6) * 0.12; headTilt = 0.08; sway = Math.sin(t * 3) * 1.2; break;
    case 'dance': lift = Math.abs(Math.sin(t * 6)) * 4.5; rot = Math.sin(t * 6) * 0.13; armN = 2.4 + Math.sin(t * 12) * 0.5; armF = -2.4 + Math.sin(t * 12) * 0.5; wag = Math.sin(t * 12) * 0.28; legSwing = 3; sway = Math.sin(t * 6) * 3; break;
    case 'jump': { const k = Math.abs(Math.sin(t * 5.5)); lift = k * 15; sy = 1 + k * 0.05; sx = 1 - k * 0.03; armN = 2.2; armF = -2.2; sway = -k * 2; break; }
    case 'sad': armN = 0.05; armF = -0.05; headTilt = 0.1; wag = Math.sin(t * 0.8) * 0.03; sy = 0.97; break;
    case 'wave': armN = 2.7 + Math.sin(t * 11) * 0.34; armF = -0.1; headTilt = -0.04; break;
    default: break;
  }
  sy *= 1 - (a.sq || 0); sx *= 1 + (a.sq || 0) * 0.6;
  const expr = a.expr || (pose === 'sleep' ? 'sleep' : pose === 'sad' ? 'sad' : pose === 'jump' || pose === 'dance' ? 'happy' : pose === 'work' ? 'determined' : null);

  ctx.save();
  ctx.scale(size, size);
  if (!right) ctx.scale(-1, 1);
  ctx.translate(0, -lift + (sitting ? 10 : 0));
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  const head = () => {
    ctx.save();
    ctx.translate(3, -46); ctx.rotate(headTilt); ctx.translate(-3, 46);
    if (front) {
      fin(ctx, 26, -76, 0.74, 2.45, c.fin);
      ctx.fillStyle = c.skin;
      ctx.beginPath(); ctx.ellipse(4, -68, 24, 23, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba('#d98f7c', 0.2);
      ctx.beginPath(); ctx.ellipse(4, -48.5, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      face(ctx, a, c, t, expr, pose);
      bangs(ctx, c, sway);
      fin(ctx, -21, -75, 1, 0.08, c.fin);
      hat(ctx, look, c, t);
    } else {
      fin(ctx, 26, -76, 0.74, 2.45, c.fin);
      fin(ctx, -21, -75, 1, 0.08, c.fin);
      hat(ctx, look, c, t);
    }
    ctx.restore();
  };

  if (front) {
    tail(ctx, c, wag, sitting);
    ctx.save(); ctx.translate(3, -46); ctx.rotate(headTilt * 0.5); ctx.translate(-3, 46); backHair(ctx, c, sway, true); ctx.restore();
  } else {
    ctx.save(); ctx.translate(3, -46); ctx.rotate(headTilt * 0.5); ctx.translate(-3, 46); ctx.restore();
  }

  // 远侧手臂
  const armColorF = shade(c.skin, -0.06);
  ctx.fillStyle = c.dress;
  ctx.beginPath(); ctx.arc(10, -44, 4.2, 0, Math.PI * 2); ctx.fill();
  limb(ctx, 10, -43, armF, 12.5, 3.8, armColorF, armColorF);

  // 腿
  const legs = (x, i) => {
    const p = ph + i * Math.PI;
    if (sitting) {
      const fx = x + 13, fy = -9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, -11); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = shade(c.dress, -0.15);
      ctx.beginPath(); ctx.ellipse(fx + 2.4, fy - 0.4, 4.2, 3.1, -0.15, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const fx = x + Math.sin(p) * legSwing, fy = -2.6 - Math.max(0, Math.cos(p)) * legLift;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = shade(c.dress, -0.15);
    ctx.beginPath(); ctx.ellipse(fx + 1.4, fy + 0.3, 4.6, 2.9, 0, 0, Math.PI * 2); ctx.fill();
  };
  legs(5.5, 1);
  legs(-3.5, 0);

  // 裙摆：白色荷叶边 + 深色外裙 + 围裙
  const hemY = sitting ? -7 : -14, hemW = sitting ? 27 : 22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) ctx.arc(-hemW + (i * hemW) / 4, hemY + 1, 3.6, 0, Math.PI * 2);
  ctx.fill();
  const sg = ctx.createLinearGradient(-22, 0, 22, 0);
  sg.addColorStop(0, c.dress2); sg.addColorStop(0.55, c.dress); sg.addColorStop(1, shade(c.dress, -0.18));
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(-10, -40);
  ctx.bezierCurveTo(-14, -30, -hemW + 1, -22, -hemW, hemY);
  ctx.quadraticCurveTo(0, hemY + 5, hemW, hemY);
  ctx.bezierCurveTo(hemW - 1, -22, 14, -30, 11, -40);
  ctx.closePath();
  ctx.fill();
  if (front) {
    ctx.fillStyle = '#fbfcff';
    ctx.beginPath();
    ctx.moveTo(-3, -41);
    ctx.lineTo(9.5, -41);
    ctx.quadraticCurveTo(16, -26, 15, hemY + 2);
    ctx.quadraticCurveTo(4, hemY + 7, -7, hemY + 2);
    ctx.quadraticCurveTo(-8, -28, -3, -41);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.ellipse(4.5, -25, 3.8, 2.5, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.8, -25); ctx.lineTo(-2.2, -27.4); ctx.lineTo(-2, -22.8); ctx.closePath(); ctx.fill();
  }
  // 上身
  ctx.fillStyle = c.dress;
  ctx.beginPath();
  ctx.moveTo(-10, -50); ctx.quadraticCurveTo(1, -53, 12, -50);
  ctx.lineTo(11.4, -38); ctx.quadraticCurveTo(1, -35.6, -10.4, -38);
  ctx.closePath();
  ctx.fill();
  if (front) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-4, -51); ctx.lineTo(10, -51); ctx.lineTo(8.6, -39.5); ctx.lineTo(-2.4, -39.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.ellipse(0.6, -48.4, 3.3, 2, -0.4, 0, Math.PI * 2); ctx.ellipse(6.6, -48.6, 3.3, 2, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(c.accent, -0.25); ctx.beginPath(); ctx.arc(3.6, -48.5, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  if (!front) {
    // 背影：长发盖住上身，腰后大蝴蝶结，尾巴在最前
    backHair(ctx, c, sway, false);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-5, -38, 7, 4.2, 0.4, 0, Math.PI * 2); ctx.ellipse(8, -38, 7, 4.2, -0.4, 0, Math.PI * 2); ctx.fill();
    tail(ctx, c, wag, sitting);
  }

  // 书 / 碗：手里的道具画在手臂下面
  if (front && pose === 'read') {
    ctx.save(); ctx.translate(16, -31); ctx.rotate(-0.1);
    ctx.fillStyle = look.accent || '#f28f6b'; ctx.fillRect(-9, -6.5, 18, 11);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(-8, -7.5, 7.6, 10.5); ctx.fillRect(0.4, -7.5, 7.6, 10.5);
    ctx.strokeStyle = 'rgba(90,90,110,.35)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-7, -5 + i * 2.6); ctx.lineTo(-1.6, -5 + i * 2.6); ctx.moveTo(1.6, -5 + i * 2.6); ctx.lineTo(7, -5 + i * 2.6); ctx.stroke(); }
    ctx.restore();
  } else if (front && pose === 'eat') {
    ctx.save(); ctx.translate(16, -33);
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -0.6, 7, 3, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
  }

  // 近侧手臂
  ctx.fillStyle = c.dress2;
  ctx.beginPath(); ctx.arc(-9.5, -44.5, 5, 0, Math.PI * 2); ctx.fill();
  limb(ctx, -9.5, -43, armN, 13.5, 4.2, c.skin, c.skin);

  head();
  ctx.restore();
}
