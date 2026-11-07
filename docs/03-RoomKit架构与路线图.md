# 03 · RoomKit：可布置、会自己过日子、能接群体的 2.5D 房间（架构与路线图）

> 2026-11-07 导航：本文保留早期引擎设计背景。当前用户自建 AI 世界方向见 [09](09-AI世界方向与产品边界.md)，新开发顺序见 [10](10-AI世界分阶段开发计划.md)，首版联网约定见 [11](11-AI世界首版契约.md)。历史路线和许可意图不作为新功能已实现或已重新授权的证明。

> 2026-11-04 起草。取代 RoomCore v0.5（`dsh-room/room/`，保留为旧版对照，新版成熟后下线）。
> 新引擎在 `dsh-room/web/`：纯静态、零依赖；同一份引擎跑在 **独立网页 / DSH 插件 / 桌面壳** 三处。

---

## 一、为什么重做（对 v0.5 的诊断，都是结构性问题，打补丁修不完）

| # | 现象（"参差不齐"） | 根因 | 新做法 |
|---|---|---|---|
| 1 | 家具摆不正、每个房间网格都要手量 | 房间是**一张 AI 生成的整图**，网格靠肉眼校准；三个场景的格子比例分别是 138×78 / 143×83 / 149×69，**没有一个是 2:1 等距** | 地板、墙、踢脚线、窗、门全部**程序绘制**，几何严格 2:1，房间尺寸任意 |
| 2 | 壳图被拉伸 | 2496×1564（1.596:1）的图用 `preserveAspectRatio="none"` 塞进 1536×1024（1.5:1），**纵向被拉 6.4%** | 不再依赖壳图；壳图模式只作为可选"背景板" |
| 3 | 窗/门挪不动、房间改不了大小 | 窗门画死在壳图里，hitZone 是手量矩形 | 窗/门/画框是**墙面物件**，可沿墙拖动、增删 |
| 4 | 只能住一个角色 | 深度用"后层 svg ← 角色层 ← 前层 svg"三明治，只有一个 `residentY` | **统一画家算法**：家具与 N 个角色按 3D 包围盒拓扑排序 |
| 5 | 角色穿家具走直线 | `walkTo` 直线插值，没有可走网格 | 可走网格 + A* + 拐角平滑；家具占格自动阻挡 |
| 6 | 角色落位靠手调 dx/dy | 锚点是像素偏移，换房间就错 | 家具声明**交互位（slot）**：坐/睡/工作/阅读……位置随旋转变换 |
| 7 | 房间/家具定义写在 JS 函数里 | `mount()/on.act()` 不可序列化，无法导出分享 | 场景与家具库都是**纯 JSON**；行为用字符串引用内置动作 |
| 8 | 文档与实现不一致 | docs/01 写的右侧栏正文插槽 `sidebarRight.tab.<kind>` 是错的 | 以 dsh-pet 源码为准：`sidebar.right.pane.tab`，`key` = 标签 id（docs/01 已更正） |

结论：内核换成"程序化房间 + 数据驱动家具 + 统一深度 + 寻路角色"，美术素材（AI 贴图）照常复用。

---

## 二、对标 jolly-small-plays：拿它的交互，补上它没有的

| 交互要素 | 做法 |
|---|---|
| 等距 2:1 场景、分层贴图 + 画家算法 | Canvas 2D 世界层；3D AABB 拓扑排序 |
| 物件即按钮：悬停高亮 + 名牌，点击有反馈 | 透明度精确命中（http 下）/ 立体包围盒命中（file:// 兜底）；悬停外发光 + 名牌；点击 = 状态切换 / 小剧场 / 信息抽屉 |
| 相机：滚轮缩放（锚光标）、拖拽平移、双击复位 | 带惯性的相机，自动适配容器大小（右侧栏 320px 到全屏都能用） |
| 角色在场景里演"小戏" | 小剧场（Play）脚本：走到某处 → 动作 → 说话 → 等待，多人同台 |
| 声音、深浅主题 | WebAudio 合成音效（默认关）；CSS 变量主题 |

**它没有、我们要有的**：布置模式（房间编辑器）、角色自主生活（需求驱动 AI）、多人/群体接入、DSH 工作状态联动、模型可调用的房间工具。

---

## 三、总体结构

```
dsh-room/
├── web/                      ← 静态应用（独立网页 / DSH 静态资源 / 桌面壳都加载它）
│   ├── index.html            完整应用（游玩 + 布置）：优先加载 dist/roomkit.js（file:// 可双击），没有就走 ES 模块（需 http）
│   ├── roomkit/              引擎源码（ES 模块，零依赖）
│   │   ├── util.js iso.js depth.js   数学 / 等距投影与朝向 / 画家算法
│   │   ├── catalog.js scene.js       家具库 / 场景数据模型（纯 JSON、apply(op) 可撤销）
│   │   ├── nav.js agents.js brain.js 可走网格+A* / 角色动作 / 自主行为+聊天+工作状态+小剧场
│   │   ├── env.js                    时段 / 天气 / 光照参数
│   │   ├── paint-room.js paint-furniture.js paint-whale.js  程序化美术
│   │   ├── renderer.js               画布、相机、排序、光照、命中
│   │   ├── ui.js editor.js style.js  游玩 UI；布置模式；注入式样式
│   │   └── app.js index.js           装配 + 对外命令接口 + postMessage 桥
│   ├── packs/default/        默认内容包（pack.js + sprites/：AI 贴图复用，带程序化备选）
│   └── dist/roomkit.js       esbuild 打包（IIFE，全局 RoomKit）
├── src/client.js             DSH 浏览器半侧源码 → lib/client.js
├── lib/index.js              DSH 宿主半侧（s4.1 占位）
├── package.json cordis.patch.yml scripts/build.mjs tests/core.test.mjs
└── room/                     ← 旧版 v0.5（对照用）
```

### 3.1 坐标

- **格坐标** `(x, y)`：浮点，单位 = 1 格；`z` 单位为世界像素（高度）。
- **世界像素**：`wx = (x − y)·hw`，`wy = (x + y)·hh − z`；默认 `hw=64, hh=32`（严格 2:1，可按素材改比例）。
- **屏幕像素**：相机 `screen = (world − cam) · zoom + 视口中心`，再乘 devicePixelRatio。
- 两面后墙：**左墙**沿 `x=0`（向屏幕左下延伸），**右墙**沿 `y=0`（向屏幕右下延伸）；前两面墙剖开不画（经典等距剖面房间）。

### 3.2 场景 JSON（`roomkit.scene` v1）

```jsonc
{
  "format": "roomkit.scene", "v": 1, "id": "bedroom", "name": "卧室",
  "room": {
    "w": 8, "h": 6,                                  // 格数
    "cells": null,                                   // 可选：["aaaa..", ...] 每格材质槽，'.' = 空（做 L 形房间/镂空）
    "mats": [{ "kind": "wood", "color": "#e3a46a" }],// 地面材质槽：wood/tile/carpet/grass/stone/plain
    "walls": { "left": true, "right": true, "height": 230,
               "color": "#f6ead6", "wainscot": "#8fb0c9", "trim": "#ffffff" },
    "slab": 18                                       // 地台厚度（像素）
  },
  "objects": [
    { "id": "bed1", "def": "bed", "x": 0, "y": 3, "rot": 0 },
    { "id": "win1", "def": "window", "wall": "right", "at": 3.5, "z": 70 },
    { "id": "lamp1", "def": "floor-lamp", "x": 6, "y": 1, "state": { "on": true } }
  ],
  "agents": [
    { "id": "whale", "name": "大肥鱼", "kind": "whale", "x": 4.5, "y": 3.5,
      "look": { "body": "#5b8def" }, "brain": "pet" }
  ],
  "env": { "period": null, "weather": "clear" }    // period=null 跟随真实时间
}
```

### 3.3 家具定义（FurnitureDef，纯数据）

| 字段 | 说明 |
|---|---|
| `id / name / sub / cat / tags` | 身份、名牌文案、家具库分类 |
| `mount` | `floor`（占格）/ `flat`（地毯，永远在最底层）/ `wall`（墙面物件） |
| `size: [w, h]` · `height` | 占格（rot=0 时）与高度（像素，用于深度与命中） |
| `blocks` | 是否阻挡行走（地毯、门洞为 false） |
| `art` | `{ kind:'sprite', src, fit, dx, dy, rot:2 }`：贴图，宽度按占格自动缩放，镜像得到第二朝向；或 `{ kind:'proc', draw:'sofa', colors }`：程序化，四朝向、可换色 |
| `slots` | 交互位：`{ id, pose, at:[lx,ly], face:[dx,dy], need:{energy:+.6}, dur:[8,20] }`，随旋转变换 |
| `states` · `act` | 状态（如 `{on:false}`）与点击动作：`toggle:on` / `use:sleep` / `info` / `play:<id>` / `weather` |
| `light` | 光源：`{ color, radius, z, when:'on' }`，夜里在暗场里挖出光斑 |

### 3.4 深度排序

每个可绘物有 3D 包围盒 `[x0,x1]×[y0,y1]×[z0,z1]`。两两比较（只比屏幕矩形相交的）：
`A.x1 ≤ B.x0 或 A.y1 ≤ B.y0 或 A.z1 ≤ B.z0 ⇒ A 在 B 后`，然后 DFS 拓扑排序。角色占用交互位时按 slot 指定"在家具前/后"。
地毯先画，墙面物件随墙画——永远不会穿帮。

### 3.5 角色与自主行为

- **身体**：可插拔渲染器。内置"小鲸鱼"（纯 Canvas 程序绘制，MIT，零素材，成本低到可以几十只同屏）；预留 `sprite`（帧图）、`coopanion`（vendor 里的真模型，AGPL-3.0，单独授权注意）适配器。
- **寻路**：地面格 − 阻挡家具 = 可走网格；A* 八向、禁止切角；拉直路径。
- **需求驱动（类 Sims 效用 AI）**：精力 / 乐趣 / 社交随时间下降；家具交互位宣告能补什么；按 `需求紧迫度 × 收益 ÷ 距离 × 随机扰动` 选下一件事，夜里偏好睡觉。
- **社交**：两只空闲角色靠近时会相互走近、面对面聊天（气泡 + 表情），这就是"自己互动"。
- **小剧场（Play）**：一组步骤 `goto / use / say / emote / wait / face`，可多角色同台；点家具可触发，内容包可扩展。
- **外部大脑**：`brain: 'pet' | 'external'` 的角色由外部指令驱动（DSH 工作状态、模型工具调用、网络对端），空闲时回到自主。

### 3.6 对外命令接口（三种载体共用一套 JSON）

```js
const app = RoomKit.mount(el, { pack, scene, mode: 'play' | 'edit', ui: 'full' | 'compact' });
app.command({ op: 'agent.say', id: 'whale', text: '在呢~' });
app.command({ op: 'agent.status', id: 'whale', status: 'working', task: '写代码' });
app.command({ op: 'agent.add', agent: { id: 'a2', name: '小蓝', kind: 'whale' } });
app.command({ op: 'object.add', def: 'sofa', x: 2, y: 4, rot: 1 });
app.command({ op: 'play.run', script: [...] });
app.on('object:click', e => ...);   // 事件同样是 JSON，可原样转发
```

载体：页面内直接调用 · iframe `postMessage({roomkit: cmd})` · DSH 宿主 SSE/HTTP · BroadcastChannel（多标签页同步）。

---

## 四、三种运行形态

| 形态 | 做法 |
|---|---|
| 独立网页 | `web/index.html` 双击即开；`?mode=play&ui=compact&dock=1` 右下角挂件；`embed` 用 iframe + postMessage |
| DSH 插件 | 宿主半侧：把 `web/` 挂到 DSH Web 服务 `/dsh-room/*`；聚合会话事件 → 每个会话的工作状态；场景存盘到 DSH 用户目录；给模型注册 `room_*` 工具。客户端半侧：右侧栏标签（`sidebarRightTabs` + `sidebar.right.pane.tab`）挂 RoomKit；读 `petApi7340` 工作状态 |
| 桌面 | DSH 桌面版自动覆盖（插件 `platform: web` 通用）；另给一个极简 Electron 壳（透明置顶窗加载 `index.html?dock=1`） |

## 五、群体场景（"接入一个群体"）

- **一个会话 = 一只角色**：DSH 里每个活跃会话（以及 dsh-agent-teams 的每个子 Agent）在房间里有自己的角色，工作状态直接驱动它：thinking→去书桌冒思考泡、working→敲键盘、waiting→踱步张望、success→跳起来庆祝、error→垂头冒汗、空闲→自主生活。
- **多人同屏**：同一场景 JSON + 命令流，经宿主中转（SSE/WebSocket）即可多人同看一间房；本地多标签页用 BroadcastChannel。
- **协议**：`agent.upsert / agent.cmd / scene.patch` 三类消息，载体无关。

---

## 六、路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| s1 | 引擎核心：程序化房间、贴图/程序化家具、统一深度、相机、悬停/点击、环境（时段/天气/灯光） | 代码完成，待真浏览器验收 |
| s2 | 布置模式：家具库、放置幽灵（红/绿合法性）、移动/旋转/删除/换色、墙面物件、房间尺寸/材质/墙色、撤销重做、导入导出 | 代码完成，待真浏览器验收 |
| s3 | 角色：寻路、交互位、需求驱动自主行为、社交、小剧场、多角色 | 代码完成，待真浏览器验收 |
| s4 | DSH 插件：s4.1 客户端右侧栏标签 + overlay 兜底 + `petApi7340` 联动 + 会话同伴（已写）；s4.2 宿主静态服务 + 工作状态聚合 + 场景存盘 + `room_*` 工具（需先核实 dsh-host-webserver 路由 API） | s4.1 已写待装机验证 / s4.2 待做 |
| s5 | 群体：会话→角色映射（s4.1 已有雏形）、多端同步、Agent 团队接入 | 待做 |
| s6 | 美术：贴图校准工具（布置模式里拖 fit/dx/dy）、统一风格的 AI 出图提示词模板、更多程序化家具 | 待做 |

> 2026-11-04 进度：s1–s3 与 s4.1 的代码已全部写完（约 15 个模块），纯逻辑单测见 `tests/core.test.mjs`；
> 本轮工具环境故障（命令行/网页抓取暂不可用），**尚未构建 dist、尚未在浏览器里跑过**——下一轮第一件事就是构建 + 单测 + 真浏览器验收，修掉跑出来的问题。

### 6.1 生态路线（2026-11-05 需求扩展）

目标场景：**DeepSeek 角色卡的鲸鱼娘生活场景** → 网友上传设施、拼场景 → 有剧情的互动场景 → 多只大肥鱼互相交流 → 形成内容生态。

| 层 | 要做的事 | 状态 |
|---|---|---|
| 内容格式 | 家具包 / 场景 / 剧情 / 角色卡 四种纯 JSON 格式，导入白名单校验 + 命名空间（`docs/04-内容格式规范.md`） | ✅ 已定稿并实现（`packs.js` `story.js` `character.js`） |
| 创作工具 | 布置模式「素材」页：自制家具工坊（上传透明图 → 调大小/对齐，旁边小鲸鱼做比例参照 → 一键摆放）、导入/导出/卸载内容包；「场景」页：多场景、模板、露天广场、复制/导入导出 | ✅ 已写（`workshop.js`），待浏览器验收 |
| 剧情 | 视觉小说式对话框（名牌、打字机、选项、跳过）；剧情触发：进场 / 点家具 / 点角色 / 时段；多角色同台走位、剧情变量、"！"标记 | ✅ 已写（`story.js` `dialog.js`），默认包带 4 段示范剧情 |
| 角色卡 | 原生 `roomkit.character`（台词、喜好、作息）+ 直接导入 SillyTavern/TavernAI 卡（JSON/PNG）——鲸鱼娘角色卡搬进房间就会按自己的台词和作息过日子 | ✅ 已写，待验收 |
| 大场景 | 露天地面 + 镂空格拼街道院子（已支持 40×40）；下一步：静态层缓存（地板/墙离屏缓存，只在编辑时重画）、视野裁剪、多房间之间用门互相传送（`portal` 家具） | ⏳ |
| 模型对话 | 角色卡 persona → 接 DeepSeek（DSH 里走宿主转发，网页版走用户自己的 key）；点角色可聊天，聊天内容驱动动作（"去睡觉吧" → 走去床上） | ⏳ s4.2 之后 |
| 多鲸鱼联机 | 场景状态 = 一串 `apply(op)` + 角色命令，天然可同步：同机多标签 BroadcastChannel → 局域网/公网 WebSocket 中继 → "串门"（把自己的大肥鱼送到朋友房间做客） | ⏳ s5 |
| 内容广场 | 静态托管的内容索引（GitHub Pages + JSON 清单），应用里一键浏览/安装网友的包与场景；评分与举报后置 | ⏳ s7 |

## 七、许可提醒

- `vendor/coopanion`（真模型鲸鱼）为 **AGPL-3.0**：若随 DSH 插件分发，整个插件需按 AGPL 开源。RoomKit 内置小鲸鱼为自绘 MIT，Coopanion 作为可选适配器单独加载。
- dsh-pet 代码 MIT，但其鲸鱼娘素材为 CC BY-NC-SA 4.0（非商用）。
