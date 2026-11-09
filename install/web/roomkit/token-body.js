/**
 * 中性版角色「团子」：圆滚滚的程序绘制小生物，零素材。look.body 决定颜色，look.size 决定大小。
 * 原点在脚底，y 向上为负；读 agent 的 pose / right / front / phase / blink / expr / sq 做动作。
 */
import { shade, rgba } from './util.js';

const SITTING = new Set(['sit', 'work', 'read', 'eat', 'sleep']);

export class TokenBody {
  constructor(agent) { this.a = agent; }
  update() {}
  bounce() {}
  talk() {}
  pointer() {}
  dispose() {}

  get metrics() { const s = this.a.look.size || 1; return { h: 56 * s, rx: 25 * s, ry: 30 * s }; }

  draw(g, t = 0) {
    const a = this.a, look = a.look || {};
    const body = look.body || '#438ca2';
    const pose = a.pose || 'stand', seed = a.seed || 0, ph = a.phase || 0;
    const sitting = SITTING.has(pose);
    const breathe = Math.sin(t * 2.4 + seed);
    let lift = 0, rot = 0, sx = 1 + breathe * 0.012, sy = 1 - breathe * 0.012, step = 0, wave = 0;
    switch (pose) {
      case 'walk': case 'run': {
        const k = pose === 'run' ? 1.4 : 1;
        lift = Math.abs(Math.sin(ph)) * 4 * k; step = Math.sin(ph) * 3.5 * k; rot = Math.sin(ph) * 0.06;
        sy *= 1 + Math.abs(Math.sin(ph)) * 0.05; sx *= 1 - Math.abs(Math.sin(ph)) * 0.03;
        break;
      }
      case 'dance': lift = Math.abs(Math.sin(t * 6)) * 6; rot = Math.sin(t * 6) * 0.16; step = Math.sin(t * 12) * 2; break;
      case 'jump': { const k = Math.abs(Math.sin(t * 5.5)); lift = k * 16; sy *= 1 + k * 0.08; sx *= 1 - k * 0.05; break; }
      case 'wave': wave = Math.sin(t * 11) * 0.5; break;
      case 'sad': sy *= 0.94; sx *= 1.03; break;
      case 'sleep': sy = 0.86 + Math.sin(t * 1.6) * 0.02; sx = 1.1; break;
      default: if (sitting) { sy *= 0.9; sx *= 1.06; }
    }
    sy *= 1 - (a.sq || 0); sx *= 1 + (a.sq || 0) * 0.6;
    const expr = a.expr || (pose === 'sleep' ? 'sleep' : pose === 'sad' ? 'sad' : pose === 'dance' || pose === 'jump' ? 'happy' : null);

    g.save();
    g.scale(look.size || 1, look.size || 1);
    if (a.right === false) g.scale(-1, 1);
    // 脚：坐下时收起
    if (!sitting) {
      g.fillStyle = shade(body, -0.32);
      g.beginPath(); g.ellipse(-8 + step, -2, 6.5, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(8 - step, -2, 6.5, 3.6, 0, 0, Math.PI * 2); g.fill();
    }
    g.translate(0, -lift - (sitting ? 0 : 3));
    g.rotate(rot);
    g.scale(sx, sy);
    // 身体：上圆下略扁的团子
    const grad = g.createLinearGradient(0, -52, 0, 0);
    grad.addColorStop(0, shade(body, 0.22));
    grad.addColorStop(1, shade(body, -0.12));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-24, -14);
    g.bezierCurveTo(-26, -40, -14, -52, 0, -52);
    g.bezierCurveTo(14, -52, 26, -40, 24, -14);
    g.bezierCurveTo(23, -2, 12, 0, 0, 0);
    g.bezierCurveTo(-12, 0, -23, -2, -24, -14);
    g.fill();
    // 头顶小芽
    g.strokeStyle = shade(body, -0.25); g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1, -51); g.quadraticCurveTo(3, -58, 8, -60); g.stroke();
    g.fillStyle = look.accent || '#8fd28f';
    g.beginPath(); g.ellipse(9, -60, 4.2, 2.4, -0.5, 0, Math.PI * 2); g.fill();
    // 小手
    g.fillStyle = shade(body, -0.06);
    g.beginPath(); g.ellipse(-22, -18, 4.5, 6, 0.4, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(21, -20); g.rotate(-0.4 - (pose === 'wave' ? 1.6 + wave : 0));
    g.beginPath(); g.ellipse(0, 3, 4.5, 6, 0, 0, Math.PI * 2); g.fill(); g.restore();
    if (a.front !== false) face(g, a, expr, t);
    else { g.fillStyle = rgba('#ffffff', 0.18); g.beginPath(); g.ellipse(-4, -40, 9, 6, -0.4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
}

function face(g, a, expr, t) {
  const ink = '#2b2f3a', blink = a.blink || 0;
  // 高光与腮红
  g.fillStyle = rgba('#ffffff', 0.32);
  g.beginPath(); g.ellipse(-9, -42, 7, 4.5, -0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = rgba('#ff8fa3', 0.45);
  g.beginPath(); g.ellipse(-6, -21, 4.5, 2.6, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(18, -21, 4.5, 2.6, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2; g.lineCap = 'round';
  const eye = (x) => {
    if (expr === 'sleep' || blink > 0.6) { g.beginPath(); g.moveTo(x - 3, -28); g.quadraticCurveTo(x, -26, x + 3, -28); g.stroke(); return; }
    if (expr === 'happy' || expr === 'love' || expr === 'excited') { g.beginPath(); g.moveTo(x - 3.2, -27); g.quadraticCurveTo(x, -32, x + 3.2, -27); g.stroke(); return; }
    g.beginPath(); g.ellipse(x, -29, 2.8, 3.8 * (1 - blink * 0.8), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 0.9, -30.4, 1, 0, Math.PI * 2); g.fill(); g.fillStyle = ink;
  };
  eye(1); eye(13);
  g.beginPath();
  if (expr === 'sad' || expr === 'worried') g.arc(7, -19, 2.6, Math.PI * 1.15, Math.PI * 1.85);
  else if (expr === 'sleep') { g.arc(7, -21, 1.4, 0, Math.PI * 2); g.stroke(); return; }
  else g.arc(7, -23, 2.8, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
}
