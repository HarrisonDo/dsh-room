/**
 * RoomKit · 内置角色「小鲸鱼」：纯 Canvas 程序绘制（零素材、MIT），成本低到可以几十只同屏。
 *
 * 局部坐标：原点 = 脚底接地点，默认朝屏幕右、y 向上为负；front=false 时画背影。
 * 姿态：stand walk run sit sleep work read eat dance jump sad wave look
 * 外观 look：{ body, belly, cheek, hat:'maid'|'bow'|'cap'|null, size }
 */
import { shade, rgba } from './util.js';

export const WHALE_LOOKS = [
  { body: '#5b8def', belly: '#eef5ff' },
  { body: '#7ec8e3', belly: '#f2fbff' },
  { body: '#9b8cf0', belly: '#f4f1ff' },
  { body: '#f29cb5', belly: '#fff3f6' },
  { body: '#7fcf9a', belly: '#f1fff5' },
  { body: '#f2b56b', belly: '#fff7ec' },
];

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-27, -18);
  ctx.bezierCurveTo(-27, -40, -12, -46, 2, -46);
  ctx.bezierCurveTo(20, -46, 29, -34, 29, -20);
  ctx.bezierCurveTo(29, -6, 18, 0, 0, 0);
  ctx.bezierCurveTo(-18, 0, -27, -6, -27, -18);
  ctx.closePath();
}

function tail(ctx, color, wag, back) {
  ctx.save();
  if (back) {
    ctx.translate(-16, -9);
    ctx.rotate(0.5 + wag);
  } else {
    ctx.translate(-22, -17);
    ctx.rotate(wag);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(4, 5);
  ctx.quadraticCurveTo(-8, 2, -12, -12);
  ctx.lineTo(-6, -13);
  ctx.quadraticCurveTo(-2, -2, 6, -3);
  ctx.closePath();
  ctx.fill();
  // 尾鳍：两片叶
  ctx.beginPath(); ctx.ellipse(-15, -15, 8, 3.6, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-7, -19, 8, 3.6, -1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function eye(ctx, x, y, s, open, look) {
  if (open <= 0.12) {
    ctx.strokeStyle = '#1d2740'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 3 * s, y); ctx.quadraticCurveTo(x, y + 2.2 * s, x + 3 * s, y); ctx.stroke();
    return;
  }
  ctx.fillStyle = '#1d2740';
  ctx.beginPath(); ctx.ellipse(x + look, y, 3 * s, 4 * s * open, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + look + 0.9 * s, y - 1.5 * s * open, 1.15 * s, 0, Math.PI * 2); ctx.fill();
}

function happyEye(ctx, x, y, s) {
  ctx.strokeStyle = '#1d2740'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 3 * s, y + 1); ctx.quadraticCurveTo(x, y - 3 * s, x + 3 * s, y + 1); ctx.stroke();
}

/** a：角色运行时对象（pose, t, phase, blink, expr, look, facing），t：全局秒 */
export function paintWhale(ctx, a, t) {
  const look = a.look || {};
  const body = look.body || '#5b8def', belly = look.belly || '#eef5ff';
  const size = (look.size || 1.4) * (a.scale || 1);
  const pose = a.pose || 'stand';
  const front = a.front !== false, right = a.right !== false;
  const ph = a.phase || 0;
  let lift = 0, sx = 1, sy = 1, rot = 0, wag = Math.sin(t * 2.2 + (a.seed || 0)) * 0.12;
  let finRot = 0.5, finX = -2, finY = -12;
  const breathe = Math.sin(t * 2.4 + (a.seed || 0));
  switch (pose) {
    case 'walk': case 'run': {
      const k = pose === 'run' ? 1.6 : 1;
      lift = Math.abs(Math.sin(ph)) * 6 * k;
      const land = 1 - Math.abs(Math.sin(ph));
      sy = 1 - land * 0.06 * k + (1 - land) * 0.03; sx = 1 + land * 0.05 * k;
      rot = 0.06 * k; wag = Math.sin(ph * 2) * 0.22; finRot = 0.5 + Math.sin(ph * 2) * 0.45;
      break;
    }
    case 'sit': sy = 0.93 + breathe * 0.012; sx = 1.04; finRot = 0.9; break;
    case 'sleep': sy = 0.78 + Math.sin(t * 1.6) * 0.02; sx = 1.12; wag = Math.sin(t * 1.1) * 0.05; finRot = 1.2; break;
    case 'work': sy = 0.95 + breathe * 0.01; finRot = 0.4 + Math.sin(t * 14) * 0.35; finY = -15; break;
    case 'read': sy = 0.95 + breathe * 0.012; finRot = -0.2; finX = 6; finY = -14; break;
    case 'eat': sy = 0.97 + Math.abs(Math.sin(t * 7)) * 0.03; finRot = -0.1; finX = 7; finY = -13; break;
    case 'dance': lift = Math.abs(Math.sin(t * 6)) * 5; rot = Math.sin(t * 6) * 0.18; wag = Math.sin(t * 12) * 0.3; finRot = -0.6 + Math.sin(t * 12) * 0.5; break;
    case 'jump': { const k = Math.abs(Math.sin(t * 5.5)); lift = k * 16; sy = 1 + k * 0.08; sx = 1 - k * 0.05; finRot = -1 + Math.sin(t * 11) * 0.4; break; }
    case 'sad': sy = 0.93; sx = 1.03; finRot = 1.1; wag = Math.sin(t * 0.8) * 0.04; break;
    case 'wave': finRot = -1.3 + Math.sin(t * 10) * 0.4; finX = -2; finY = -26; sy = 1 + breathe * 0.015; break;
    default: sy = 1 + breathe * 0.018; sx = 1 - breathe * 0.008;
  }
  sy *= 1 - (a.sq || 0); sx *= 1 + (a.sq || 0) * 0.6;

  ctx.save();
  ctx.scale(size, size);
  if (!right) ctx.scale(-1, 1);
  ctx.translate(0, -lift);
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  const dark = shade(body, -0.12);
  if (front) tail(ctx, dark, wag, false);

  // 身体
  const g = ctx.createLinearGradient(-20, -46, 24, 0);
  g.addColorStop(0, shade(body, 0.16)); g.addColorStop(0.6, body); g.addColorStop(1, shade(body, -0.1));
  bodyPath(ctx);
  ctx.fillStyle = g; ctx.fill();

  if (front) {
    // 肚皮
    ctx.save(); bodyPath(ctx); ctx.clip();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(10, -6, 20, 11, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(shade(belly, -0.12), 0.6);
    for (let i = 0; i < 3; i++) { ctx.fillRect(2 + i * 6, -9 + i * 0.6, 3.5, 1.2); }
    ctx.restore();
  } else {
    ctx.save(); bodyPath(ctx); ctx.clip();
    ctx.fillStyle = rgba(shade(body, 0.25), 0.35);
    ctx.beginPath(); ctx.ellipse(2, -40, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 高光
  ctx.fillStyle = 'rgba(255,255,255,.32)';
  ctx.beginPath(); ctx.ellipse(-9, -37, 8, 4, -0.35, 0, Math.PI * 2); ctx.fill();

  if (!front) tail(ctx, dark, wag, true);

  // 脸
  if (front) {
    const expr = a.expr || (pose === 'sleep' ? 'sleep' : pose === 'sad' ? 'sad' : pose === 'jump' || pose === 'dance' ? 'happy' : null);
    const blink = a.blink || 0;
    const lookX = pose === 'read' ? -0.6 : pose === 'look' ? Math.sin(t * 1.3) * 1.6 : 0;
    const eyeY = pose === 'read' ? -23.5 : -25;
    if (expr === 'sleep') { eye(ctx, 13, eyeY + 1, 1, 0, 0); eye(ctx, 23, eyeY, 0.85, 0, 0); }
    else if (expr === 'happy' || expr === 'love') { happyEye(ctx, 13, eyeY, 1); happyEye(ctx, 23, eyeY - 0.5, 0.85); }
    else {
      const open = (expr === 'surprised' ? 1.25 : expr === 'sad' ? 0.75 : pose === 'read' ? 0.6 : 1) * (1 - blink);
      eye(ctx, 13, eyeY, 1, open, lookX);
      eye(ctx, 23, eyeY - 0.8, 0.85, open, lookX);
      if (expr === 'sad') {
        ctx.strokeStyle = '#1d2740'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(9, -31); ctx.lineTo(15, -32.5); ctx.moveTo(20.5, -33); ctx.lineTo(25.5, -32); ctx.stroke();
      }
    }
    // 腮红
    ctx.fillStyle = rgba(look.cheek || '#ff8fab', expr === 'love' || expr === 'shy' ? 0.8 : 0.5);
    ctx.beginPath(); ctx.ellipse(8.5, -18.5, 4, 2.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(26, -19.5, 3.2, 2, 0, 0, Math.PI * 2); ctx.fill();
    // 嘴
    ctx.strokeStyle = '#1d2740'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    if (pose === 'eat') {
      const o = Math.abs(Math.sin(t * 7));
      ctx.fillStyle = '#7a2c3a'; ctx.beginPath(); ctx.ellipse(18.5, -18.5, 2.4, 0.8 + o * 2, 0, 0, Math.PI * 2); ctx.fill();
    } else if (expr === 'surprised') {
      ctx.beginPath(); ctx.ellipse(18.5, -18.5, 1.8, 2.3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (expr === 'sad') {
      ctx.beginPath(); ctx.moveTo(16.5, -17.5); ctx.quadraticCurveTo(18.7, -20, 21, -17.5); ctx.stroke();
    } else if (expr === 'sleep') {
      ctx.beginPath(); ctx.moveTo(17.5, -19); ctx.lineTo(20, -19); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(16.3, -20); ctx.quadraticCurveTo(18.7, expr === 'happy' ? -16 : -17.4, 21.2, -20); ctx.stroke();
    }
  }

  // 胸鳍
  ctx.save();
  ctx.translate(finX, finY);
  ctx.rotate(finRot);
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(-4, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 手上的道具
  if (front && pose === 'read') {
    ctx.save(); ctx.translate(15, -12); ctx.rotate(-0.12);
    ctx.fillStyle = look.accent || '#f28f6b'; ctx.fillRect(-9, -7, 18, 11);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(-8, -8, 7.5, 10); ctx.fillRect(0.5, -8, 7.5, 10);
    ctx.strokeStyle = 'rgba(80,80,100,.35)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-7, -6 + i * 2.6); ctx.lineTo(-2, -6 + i * 2.6); ctx.moveTo(1.5, -6 + i * 2.6); ctx.lineTo(6.5, -6 + i * 2.6); ctx.stroke(); }
    ctx.restore();
  } else if (front && pose === 'eat') {
    ctx.save(); ctx.translate(17, -7);
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -0.5, 7, 2.6, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
  }

  // 帽饰
  if (look.hat === 'maid') {
    ctx.fillStyle = '#ffffff';
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 4.2 + 2, -44.5 + Math.abs(i) * 0.6, 3.1, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#26304a'; ctx.fillRect(-11, -45, 26, 2.2);
  } else if (look.hat === 'bow') {
    ctx.fillStyle = look.accent || '#ff7aa2';
    ctx.beginPath(); ctx.ellipse(6, -47, 5, 3.2, -0.5, 0, Math.PI * 2); ctx.ellipse(14, -47, 5, 3.2, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -46.5, 2, 0, Math.PI * 2); ctx.fill();
  } else if (look.hat === 'cap') {
    ctx.fillStyle = look.accent || '#f2c14e';
    ctx.beginPath(); ctx.ellipse(2, -44, 15, 7, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(10, -45, 14, 3);
  }

  ctx.restore();
}

export { paintEmote } from './paint-emote.js';
