/**
 * RoomKit · 深度排序（画家算法，3D 包围盒拓扑排序）。
 *
 * item = { x0,x1, y0,y1（格）, z0,z1（像素）, l,t,r,b（屏幕外接矩形）, id?, after?, before? }
 * 两两比较（只比屏幕上相交的）：沿 x / y / z 任一轴分离 ⇒ 小的一方在后面；
 * 视线来自 +x+y+z，所以分离轴判定严格成立。家具零件与角色、家具之间都用这一套。
 * after/before：角色坐在交互位上时显式指定"画在某件家具之后/之前"。
 */
const EPS = 1e-4;
const key = (it) => (it.x0 + it.x1 + it.y0 + it.y1) * 0.5 + (it.z0 + it.z1) * 0.0005 + (it.bias || 0);

function cmp(a, b) {
  if (a.after && a.after === b.id) return 1;
  if (b.after && b.after === a.id) return -1;
  if (a.before && a.before === b.id) return -1;
  if (b.before && b.before === a.id) return 1;
  if (a.x1 <= b.x0 + EPS) return -1;
  if (b.x1 <= a.x0 + EPS) return 1;
  if (a.y1 <= b.y0 + EPS) return -1;
  if (b.y1 <= a.y0 + EPS) return 1;
  if (a.z1 <= b.z0 + EPS) return -1;
  if (b.z1 <= a.z0 + EPS) return 1;
  return key(a) < key(b) ? -1 : 1;
}

export function depthSort(items) {
  const n = items.length;
  if (n < 2) return items.slice();
  const behind = new Array(n);
  for (let i = 0; i < n; i++) behind[i] = [];
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = i + 1; j < n; j++) {
      const b = items[j];
      if (a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t) continue;
      if (cmp(a, b) < 0) behind[j].push(i); else behind[i].push(j);
    }
  }
  const order = items.map((_, i) => i).sort((i, j) => key(items[i]) - key(items[j]));
  const mark = new Uint8Array(n), out = [];
  const visit = (i) => {
    if (mark[i]) return;
    mark[i] = 1;
    for (const j of behind[i]) visit(j);
    out.push(items[i]);
  };
  for (const i of order) visit(i);
  return out;
}
