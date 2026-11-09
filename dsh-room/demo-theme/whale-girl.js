import { GIRL_H, paintGirl } from '../web/roomkit/paint-girl.js';
import { TokenBody } from '../web/roomkit/token-body.js';

const look = { body: '#5b8def', belly: '#eef5ff', hat: 'maid', rig: false };
export const DEFAULT_CHARACTERS = [];
export const DEFAULT_ROLE = { id: 'role', name: '示例角色', kind: 'girl', brain: 'manual', look };
export const APPEARANCE_NOTICE = '「大肥鱼」鲸鱼娘原设为溟月（上善无形），DeepSeek 女仆二创为 ZipZipPipe，形象沿用 CC BY-NC-SA 4.0。<br>';
export const WHALE_LOOKS = [look, ...['#8976c4', '#bf745b', '#579977'].map(body => ({ body, rig: false }))];
export { paintGirl as paintWhale };

export class RigPool {}

class GirlBody {
  constructor(agent) { this.agent = agent; }
  get metrics() {
    const size = this.agent.look.size || 1;
    return { h: GIRL_H * size, rx: 30 * size, ry: 54 * size };
  }
  draw(ctx, time) { paintGirl(ctx, this.agent, time); }
  update() {}
  bounce() {}
  talk() {}
  pointer() {}
  dispose() {}
}

// The variant changes rendering only. Non-girl roles keep the existing token body.
export const bodyFor = (agent) => agent.data.kind === 'girl' ? new GirlBody(agent) : new TokenBody(agent);
