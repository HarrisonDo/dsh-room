/**
 * dsh-room · 让 DSH 里的 Agent 驱动房间：room_look / room_say / room_do。
 * 默认关（工具会进每个对话的清单）；页面「社区」里打开才注册，关掉即注销。
 * 工具本身不碰房间：命令进队列，页面下一次取状态时领走执行。
 * 工具对象按 dsh-tools 的 ToolDefinition 形状直接写（本地链接安装时解析不到 DSH 内部包，不能用 defineTool）。
 */

const ACTS = ['wave', 'dance', 'sleep', 'read', 'goto', 'use', 'room', 'emote'];
const MAX_QUEUE = 20;
/** 页面这么久没来取状态，就当房间没打开 */
export const PAGE_TTL_MS = 6000;

export class RoomLink {
  constructor(now = Date.now) { this.now = now; this.queue = []; this.seenAt = -Infinity; this.room = null; }
  /** 页面来取状态：记下它还活着，领走待执行的命令 */
  poll(room) {
    this.seenAt = this.now();
    if (room && typeof room === 'object') this.room = room;
    return this.queue.splice(0, this.queue.length);
  }
  get open() { return this.now() - this.seenAt < PAGE_TTL_MS; }
  push(cmd) { if (this.queue.length >= MAX_QUEUE) this.queue.shift(); this.queue.push(cmd); }
}

function describe(room) {
  if (!room) return '房间信息还没有同步过来。';
  const who = (Array.isArray(room.agents) ? room.agents : []).map((a) => `${a.name}（${a.doing || '发呆'}）`).join('、') || '没有人';
  return [
    `现在在：${[room.floor, room.scene].filter(Boolean).join(' ')}，${room.period || ''}，天气 ${room.weather || ''}`,
    `角色：${who}`,
    `家具：${(room.furniture || []).join('、') || '无'}`,
    `家里的房间：${(room.rooms || []).join('、') || '无'}`,
  ].join('\n');
}

const textOutput = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] };
const closed = '房间没有打开：请主人先打开「大肥鱼的房间」。';

export function roomTools(link) {
  const tool = (name, description, parameters, run) => ({
    name, description, parameters, output: textOutput, timeoutMs: 5000,
    isConcurrencySafe: () => true,
    async execute(args) { return link.open ? run(args || {}) : closed; },
  });
  return [
    tool('room_look', '看一眼「大肥鱼的房间」：当前房间、角色在做什么、有哪些家具和房间。', { type: 'object', properties: {} }, () => describe(link.room)),
    tool('room_say', '让房间里的鲸鱼娘说一句话（头顶气泡）。用来和主人打招呼、汇报进度。', {
      type: 'object', required: ['text'],
      properties: { text: { type: 'string', description: '要说的话，60 字以内' } },
    }, (a) => {
      const text = String(a.text || '').slice(0, 120).trim();
      if (!text) return '没有内容。';
      link.push({ op: 'agent.say', text });
      return '已经说了：' + text;
    }),
    tool('room_do', '让房间里的鲸鱼娘做一个动作。wave 招手、dance 跳舞、sleep 去睡觉、read 去看书、goto 走到家具旁、use 使用家具、room 去别的房间、emote 头顶符号。', {
      type: 'object', required: ['action'],
      properties: {
        action: { type: 'string', enum: ACTS, description: '动作' },
        target: { type: 'string', description: 'goto/use 的家具名，room 的房间名，emote 的符号（heart note ! ? spark idea）' },
      },
    }, (a) => {
      if (!ACTS.includes(a.action)) return '不认识的动作：' + a.action;
      const target = String(a.target || '').slice(0, 40).trim();
      if (['goto', 'use', 'room'].includes(a.action) && !target) return a.action + ' 需要 target。';
      link.push({ op: 'room.act', act: target ? a.action + ':' + target : a.action });
      return '已经让她去做了。';
    }),
  ];
}
