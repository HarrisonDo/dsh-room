/**
 * RoomKit · 等距投影与朝向。
 *
 * 格坐标 (x, y) 浮点、单位 1 格；z 为世界像素（高度）。
 *   世界像素：wx = (x − y)·hw，wy = (x + y)·hh − z（默认 hw=64、hh=32，严格 2:1）
 * 视线从 +x+y 方向看过来：x+y 越大越靠前；左墙沿 x=0，右墙沿 y=0。
 */

export class Iso {
  constructor(hw = 64, hh = 32) { this.hw = hw; this.hh = hh; }

  toWorld(x, y, z = 0) { return { x: (x - y) * this.hw, y: (x + y) * this.hh - z }; }

  /** 世界像素 → 地面（z=0）格坐标 */
  toTile(wx, wy, z = 0) {
    const a = wx / this.hw, b = (wy + z) / this.hh;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  /** 立体盒的屏幕轮廓（六边形，世界像素）——命中测试与外发光都用它 */
  boxHull(x0, y0, x1, y1, z0, z1) {
    const P = (x, y, z) => { const p = this.toWorld(x, y, z); return [p.x, p.y]; };
    return [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1)];
  }

  /** 立体盒的屏幕外接矩形 {l,t,r,b} */
  boxRect(x0, y0, x1, y1, z0, z1) {
    return {
      l: (x0 - y1) * this.hw, r: (x1 - y0) * this.hw,
      t: (x0 + y0) * this.hh - z1, b: (x1 + y1) * this.hh - z0,
    };
  }

  /** 地面菱形（一格或一块占地），世界像素点列 */
  diamond(x0, y0, x1, y1, z = 0) {
    const P = (x, y) => { const p = this.toWorld(x, y, z); return [p.x, p.y]; };
    return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  }
}

/* ───────── 朝向 ─────────
 * 约定：rot=0 时家具"正面"朝 +y（屏幕左下），背靠 y=0（右墙）。
 *   rot4 模式（程序化家具）：rot 1 → 正面朝 +x（屏幕右下），2 → 朝 −y，3 → 朝 −x
 *   mirror 模式（单视角贴图）：rot 1 = 沿对角线镜像（贴图水平翻转），正面朝 +x，只有两向
 * map/dir 把 rot=0 的局部格坐标/方向变换到摆放后的局部坐标（占格左上角为原点）。
 */
const FACES = { px: [1, 0], nx: [-1, 0], py: [0, 1], ny: [0, -1] };

export function orient(size, rot, mode) {
  const w = size[0], h = size[1];
  let r = ((rot % 4) + 4) % 4;
  let o;
  if (mode === 'mirror') {
    o = r % 2 === 0
      ? { w, h, map: (x, y) => [x, y], dir: (dx, dy) => [dx, dy], mirror: false }
      : { w: h, h: w, map: (x, y) => [y, x], dir: (dx, dy) => [dy, dx], mirror: true };
  } else if (r === 0) {
    o = { w, h, map: (x, y) => [x, y], dir: (dx, dy) => [dx, dy] };
  } else if (r === 1) {
    o = { w: h, h: w, map: (x, y) => [y, w - x], dir: (dx, dy) => [dy, -dx] };
  } else if (r === 2) {
    o = { w, h, map: (x, y) => [w - x, h - y], dir: (dx, dy) => [-dx, -dy] };
  } else {
    o = { w: h, h: w, map: (x, y) => [h - y, x], dir: (dx, dy) => [-dy, dx] };
  }
  o.rot = r;
  /** 摆放后朝向世界 face（'px'|'py'…）的那一面，原本是局部的哪一面 */
  o.localFace = (worldFace) => {
    const t = FACES[worldFace];
    for (const k in FACES) {
      const d = o.dir(FACES[k][0], FACES[k][1]);
      if (d[0] === t[0] && d[1] === t[1]) return k;
    }
    return worldFace;
  };
  return o;
}

/** 方向向量 → 屏幕朝向：right（朝屏幕右）、front（朝向观众） */
export function screenFacing(dx, dy) {
  const sx = dx - dy, sy = dx + dy;
  return { right: sx > 0.0001 ? true : sx < -0.0001 ? false : null, front: sy >= -0.0001 };
}
