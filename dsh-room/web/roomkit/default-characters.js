/** 内置：大肥鱼（形象出自社区二创的 DeepSeek「大肥鱼」鲸鱼娘，见 dsh-pet 的形象授权说明） */
export const DEFAULT_CHARACTERS = [
  {
    format: 'roomkit.character', v: 1, id: 'dafeiyu', name: '大肥鱼', kind: 'girl',
    look: { body: '#5b8def', belly: '#eef5ff', hat: 'maid' },
    persona: '吃白饭的蓝色大肥鱼，赖在 DeepSeek Harness 里不走了。爱玩魔方、爱吃零食、偶尔打个盹；你忙起来它跟着忙前忙后，闲下来就碎碎念。',
    phrases: {
      greet: ['你来啦！', '欢迎回来~', '今天也一起加油吧'],
      idle: ['今天也要加油鸭', '泡泡……', '有点想吃零食', '魔方又转乱了', '要不要去看看书', '这个房间真舒服'],
      night: ['好困……', '再看五分钟就睡', '月亮出来了'],
      poke: ['在呢~', '别戳啦', '嘿嘿', '干嘛呀', '泡泡……'],
      cheer: ['搞定啦！', '完成！✨', '这一版顺利！'],
      oops: ['呜…出错了', '等等我看看', '哎呀，翻车了'],
      wait: ['在等你回复哦', '需要你确认一下~'],
    },
    likes: { fridge: 1.6, bed: 1.2, shelf: 1.0, desk: 1.1 },
    schedule: [{ from: 23, to: 7, prefer: 'sleep' }, { from: 12, to: 13, prefer: 'eat' }, { from: 9, to: 12, prefer: 'work' }],
  },
  {
    format: 'roomkit.character', v: 1, id: 'paopao', name: '泡泡', kind: 'girl',
    look: { body: '#7ec8e3', belly: '#f2fbff', hat: 'bow', size: 1.15 },
    persona: '大肥鱼的好朋友，爱吐泡泡，嘴馋，偷吃零食被抓住会装无辜。',
    phrases: {
      idle: ['噗噜噗噜~', '冰箱在呼唤我', '我才没有偷吃！', '一起玩嘛'],
      poke: ['呀！', '痒痒的~', '再来再来'],
      night: ['呼……呼……'],
    },
    likes: { fridge: 2.0, beanbag: 1.5, aquarium: 1.6, tv: 1.4 },
  },
];

export const DEFAULT_ROLE = {
  id: 'whale', name: '大肥鱼', brain: 'pet', character: 'dafeiyu',
  look: { body: '#5b8def', belly: '#eef5ff', hat: 'maid' },
};

export const APPEARANCE_NOTICE = `「大肥鱼」鲸鱼娘形象沿用 CC BY-NC-SA 4.0。原设为溟月（上善无形），DeepSeek 女仆二创为 ZipZipPipe。<br>
        可选真模型的运行时代码来自 Pal-AI-Lab/Coopanion。模型贴图与品牌图案的来源见 NOTICE.md。<br>`;
