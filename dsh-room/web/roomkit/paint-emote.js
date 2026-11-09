/** 角色头顶的小表情（画在世界层；文字气泡在 DOM 层）。top = 头顶到脚底的高度（世界像素） */
export function paintEmote(ctx, kind, t, k, top = 90) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 3);
  const y = -top - 16 - (1 - Math.min(1, k * 4)) * 6;
  if (kind === 'zzz') {
    ctx.fillStyle = '#9fb4e8'; ctx.font = 'bold 13px sans-serif';
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i / 3) % 1;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.fillText('z', 12 + p * 14 + i * 2, -top * 0.7 - p * 26);
    }
    ctx.restore();
    return;
  }
  if (kind === 'sweat') {
    ctx.fillStyle = '#8fd0ff';
    const sy = -top * 0.82;
    ctx.beginPath(); ctx.moveTo(28, sy - 7); ctx.quadraticCurveTo(33, sy + 1, 28, sy + 4); ctx.quadraticCurveTo(23, sy + 1, 28, sy - 7); ctx.fill();
    ctx.restore();
    return;
  }
  // 气泡底
  ctx.translate(0, y);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.shadowColor = 'rgba(20,30,60,.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-13, -12, 26, 20, 10); else ctx.rect(-13, -12, 26, 20);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(0, 12); ctx.lineTo(3, 7); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  switch (kind) {
    case 'heart':
      ctx.fillStyle = '#ff5c8a';
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-9, -1, -5, -9, 0, -4); ctx.bezierCurveTo(5, -9, 9, -1, 0, 5); ctx.fill();
      break;
    case 'note': ctx.fillStyle = '#6b7fd7'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('♪', 0, -1); break;
    case '!': ctx.fillStyle = '#f08a24'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('!', 0, -1); break;
    case '?': ctx.fillStyle = '#6b7fd7'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('?', 0, -1); break;
    case 'spark':
      ctx.fillStyle = '#f2c14e';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 5, Math.sin(a) * 4 - 2, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -2, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'idea': ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(0, -3, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c9a24a'; ctx.fillRect(-2.5, 2, 5, 3); break;
    case 'anger':
      ctx.strokeStyle = '#e8505b'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-1, -3); ctx.moveTo(5, -7); ctx.lineTo(1, -3); ctx.moveTo(-5, 3); ctx.lineTo(-1, -1); ctx.moveTo(5, 3); ctx.lineTo(1, -1); ctx.stroke();
      break;
    case 'think':
    default: {
      ctx.fillStyle = '#6b7fd7';
      for (let i = 0; i < 3; i++) {
        const on = Math.floor(t * 3) % 3 >= i;
        ctx.globalAlpha = on ? 1 : 0.3;
        ctx.beginPath(); ctx.arc(-6 + i * 6, -2, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}
