import test from 'node:test';
import assert from 'node:assert/strict';
import { paintFloor } from '../web/roomkit/paint-room.js';
import { Iso } from '../web/roomkit/iso.js';

for (const [w, h] of [[9, 7], [40, 40]]) {
  test(`木地板 ${w}×${h}：接缝舍入不会使绘制空转`, () => {
    let calls = 0;
    const ctx = new Proxy({}, {
      get: (_, key) => (...args) => {
        // 旧实现会在第 9 列不断重画同一条零宽板，明确终止回归以免卡住测试进程。
        if (++calls > 500000) throw new Error('木地板绘制没有前进');
        if (['moveTo', 'lineTo'].includes(key)) assert.ok(args.every(Number.isFinite));
      },
    });
    paintFloor(ctx, { room: { w, h, mats: [{ kind: 'wood', color: '#e3a46a' }], slab: 0 }, cell: () => 0, isFloor: () => true }, new Iso(64, 32));
    assert.ok(calls > w * h);
  });
}
