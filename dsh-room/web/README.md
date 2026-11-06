# RoomKit · 大肥鱼的房间（新版引擎）

可布置、会自己过日子、能接群体的 2.5D 等距房间。纯静态、零依赖：同一份代码跑在**独立网页 / DSH 插件 / 桌面壳**。
架构、数据格式与路线图见 [`docs/03-RoomKit架构与路线图.md`](../../docs/03-RoomKit架构与路线图.md)。

## 运行

| 方式 | 做法 |
|---|---|
| 双击打开 | `index.html`（需要先打包出 `dist/roomkit.js`，见下） |
| 开发（改了源码立刻生效） | 在 `web/` 下起任意静态服务：`python3 -m http.server 8765`，打开 `http://localhost:8765/`（没有 dist 时自动走 ES 模块） |
| 打包 | `npx esbuild roomkit/index.js --bundle --format=iife --global-name=RoomKit --outfile=dist/roomkit.js` |

URL 参数：`?mode=edit` 直接进布置模式 · `?scene=living` 用客厅模板 · `?fresh=1` 不读存档 · `?dock=1&w=620` 右下角挂件 · `?ui=compact` 窄屏（DSH 右侧栏）· `?transparent=1` 透明背景 · `?bridge=any` 接受任意来源的 postMessage 命令（默认只收同源）。

## 怎么玩

- **游玩**：滚轮缩放（锚光标）· 拖拽平移 · 双击空白复位 · 悬停家具/角色显示名牌 · 点家具触发动作（开灯、看电视、偷吃零食、换装、换天气……）· 点地面让角色走过去 · 点角色打开角色卡片（精力/乐趣/社交、打招呼/跳舞/睡觉/看书）。
- **布置**（🛠 或 `B` 键）：右侧家具库点选 → 地面上绿色可放、红色冲突（会说原因）→ 点击落位（可连放，`Esc` 结束）；点已摆家具可拖动、`R` 旋转、`Ctrl+D` 复制、🎨 换色、`Del` 删除、方向键微调；墙饰沿墙拖、跨墙角换墙；「房间」页改尺寸、地面材质（整屋铺/刷子/挖空做 L 形房）、墙色墙纸、地台；「角色」页增删小鲸鱼、改名、换色、帽饰、行为模式；`Ctrl+Z / Ctrl+Shift+Z` 撤销重做；导出/导入布局 JSON。
- 所有改动自动存到 `localStorage['roomkit.scene.<id>']`。

## 角色会自己做什么

需求驱动（精力 / 乐趣 / 社交随时间下降）：困了去床上睡（深夜睡得久）、无聊了去看书看鱼看电视、想说话了就走到同伴身边面对面聊几句；家具通过「交互位」告诉角色能在哪儿、以什么姿势、补什么需求。
「宠物」模式的角色额外跟随 DSH 工作状态：思考/干活 → 去书桌（屏幕亮起）；等待 → 书桌旁踱步张望；完成 → 蹦跶庆祝；出错 → 垂头冒汗。

## 对外命令（页面内 `room.command(...)`，或 `postMessage({ roomkit: {...} })`）

```js
room.command({ op: 'agent.say', id: 'whale', text: '在呢~' });
room.command({ op: 'agent.status', id: 'whale', status: 'working', task: '写代码' }); // thinking/working/result/waiting/success/error/null
room.command({ op: 'agent.goto', id: 'whale', x: 3.5, y: 2.5 });
room.command({ op: 'agent.use', id: 'whale', obj: 'bed1', slot: 'sleep', s: 30 });
room.command({ op: 'agent.add', agent: { name: '小蓝', look: { body: '#9b8cf0' } } });   // 从门口进来
room.command({ op: 'object.add', def: 'sofa', x: 2, y: 4, rot: 1 });
room.command({ op: 'env.set', period: 'night', weather: 'rain' });                         // period=null 跟随真实时间
room.command({ op: 'play.run', id: 'snack', target: 'fridge1' });
room.command({ op: 'scene.get' });                                                         // 导出当前场景 JSON
room.on('*', (data, ev) => console.log(ev, data));                                         // object:click / agent:say / scene:change …
```

## 目录

| 路径 | 作用 |
|---|---|
| `roomkit/iso.js` `util.js` `depth.js` | 等距投影与朝向、工具、画家算法（3D 包围盒拓扑排序） |
| `roomkit/catalog.js` `scene.js` | 家具库与场景数据模型（纯 JSON，所有编辑走 `apply(op)` → 可撤销/可同步） |
| `roomkit/nav.js` `agents.js` `brain.js` | 寻路、角色动作（Promise 可打断）、需求驱动自主行为 + 聊天 + 工作状态 + 小剧场 |
| `roomkit/paint-*.js` `renderer.js` | 程序化房间/家具/小鲸鱼、Canvas 渲染、光照、命中 |
| `roomkit/ui.js` `editor.js` `style.js` `app.js` | 游玩 UI、布置模式、样式、装配与命令接口 |
| `packs/default/pack.js` | 默认内容包：家具库（贴图 + 程序化 + 墙饰）、卧室/客厅模板、小剧场、抽屉文案 |
| `packs/default/sprites/` | AI 出图的透明家具贴图（来自 `room/packs/default/furniture/`） |

## 加家具（不改引擎）

在任意内容包的 `furniture` 里加一条：

```js
{ id: 'piano', name: '小钢琴', cat: 'fun', size: [2, 1], height: 110,
  palette: { main: '#2b2f3a', key: '#ffffff' },
  art: { kind: 'proc', parts: [
    { t: 'box', x: 0.05, y: 0.2, z: 0, w: 1.9, d: 0.7, h: 80, c: 'main' },
    { t: 'box', x: 0.1, y: 0.85, z: 70, w: 1.8, d: 0.12, h: 4, c: 'key' } ] },
  slots: [{ id: 'play', pose: 'dance', at: [1, 1.5], face: [0, -1], need: { fun: 0.5 }, dur: [8, 15], label: '弹琴' }] }
```

贴图家具：`art: { kind: 'sprite', src, fit, dx, dy, sy }`——`fit` 让贴图宽度贴合占格，`dx/dy` 微调对齐，`sy` 把俯视画法的素材压回 2:1。
