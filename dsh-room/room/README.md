# 大肥鱼的房间 · room/

房间内核（RoomCore v0.5，2.5D 实体房间）+ 示范房间包 + 演示插件。**纯静态、零依赖，双击 `index.html` 就能跑**（Chrome/Edge）。

> s2.0（2026-11-04）：修掉"房间只是几个可交互 box"——壳图扩展名、家具 sprite 未接线、命中区坐标错位、svg 根拦截点击、角色 `room:ready` 竞态全部修复；新增相机（滚轮缩放/拖拽平移/双击复位）与 hitZone（窗/门锚在壳图画面上）。
> s2.1：布置模式加**家具库**（点击添加/角标删除，布局存档 v2）；新增**多房间包**（`packs/living/` 客厅，`extends` 继承家具库，8×6 大网格）；**右下角常驻模式**（`?dock=1`，S/M/L + 收起，尺寸记忆）；轻音效（默认关）。诊断与规范见 `docs/02-房间诊断与2.5D升级方案.md`。

## 运行 / 挂载

| 场景 | 入口 |
| --- | --- |
| 开发/整页 | 打开 `index.html`（舞台最大 1100px，自适应视口） |
| Web 右下角挂件 / 桌面右下角 | `index.html?dock=1&w=620`（`w` 可 420/620/860，也可页内 S/M/L 按钮，尺寸存 localStorage） |
| 嵌 DSH 右侧栏 / iframe | 直接嵌 `index.html`（窄到 320px 可用；Tab 集成见 docs/01） |

导演模式（⚙ / D 键）：场景、时段、天气、布置模式、声音开关。

## 体验设计原则（源自 Geode 分享：场景是戏台）

> 一个场景就是一个戏台，物件是道具，点击是动作，动线让故事完整，一切服务故事。

- **组件化戏台**：场景不是一张图+热区，而是拆成一个个 SceneComponent——每个物件有自己的地盘（裁剪副本）、状态机、自身反馈；窗口只在要看信息时出现
- **物件即按钮**：台灯点了亮（光晕+地板光斑）、杯子能喝空再接满、挂画会摇、地毯 Q 弹、窗户换天气、床/桌子让大肥鱼走位（屏幕光跟着工作状态亮）
- **天气住在窗外**：雨雪粒子裁剪在窗户矩形（pack.window）里；天气偶尔自己变（ambient，手动选择后 3 分钟内不打架）
- **动线**：抽屉底部有 `links`，看完桌子可以「翻翻书架」
- **生命感**：角色呼吸（CSS）、阳光尘埃、时钟角标几秒后隐入画面、组件头顶浮字
- **导演模式**：所有调试控制藏进 ⚙ / `D` 键 / `?director=1`，观众看戏，导演才进场

## 组件模型（SceneComponent）

```js
// room-pack 的 furniture[] 里定义（s2.0：必须接 sprite，否则退化成占位方块）：
{
  id: 'lamp', label: '落地灯', sub: '啪嗒',
  foot: [1, 1],                       // 等距占地（格）；命中菱形/深度都按它
  sprite: 'packs/default/furniture/lamp.png',
  spriteSize: [120, 402],            // 宽按 foot 跨度、高按贴图纵横比
  states: { on: false },              // 组件状态机，room.setFurnState(id, patch) 翻转
  anchor: { x, y, pose },             // 可选：大肥鱼落位锚点（pose: sleep/work/stand）
  mount(fx, api, state) { ... },      // 可选：自绘活动件；fx.g=裁剪区组，fx.gFree=溢出组（光晕用）
  on: {
    act(api, comp) { ... },           // 点击动作；不给则弹 info 抽屉（内容源按 id 提供）
    change(state, api, fx) { ... }    // 状态变化 → 世界后果（灯亮/屏幕光）
  }
}

// 场景里的 hitZone：锚在壳图画面上的命中区（窗/门/画框），无贴图不占格
// scenes[].hitZones = [{ id, label, sub, rect:[x,y,w,h], window?, act:'weather' }]
//   rect 用 viewBox 坐标（真实像素 × 1536/图宽、×1024/图高）；window:true → 天气粒子裁剪区
```

反馈动效库（内核内建，组件免写 CSS）：hover 高光 · press 按压下沉 · shake 摇晃（`room.compShake`）· `room.floatText(x,y,text)` 浮字 · `room.sayCharacter` 角色气泡。

相机（v0.5）：滚轮缩放 1–2.6×（锚光标）、空白处拖拽平移、双击复位；`room.camReset()` / `room.camZoom(k, cx, cy)` / `room.vbToHost(x, y)`（HUD 坐标反算）。

## 踩过的坑

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| 顶层色罩挡点击 | 点热区/角色毫无反应、也不报错 | 覆盖层（色罩/阳光/尘埃/玻璃/灯光）一律 `pointer-events: none`；SVG 里只留 `.hz` 和 `.character` 可点 |
| **svg 根拦截点击** | 后排家具/窗户/门点不到，`elementFromPoint` 返回 `svg.svg-front` | `svg-back/svg-front { pointer-events:none }`，`.fz { pointer-events:auto }` |
| **命中区漂移** | 真实鼠标点不到，`dispatchEvent` 却能过 | `.fz` 的 points 必须是**相对 group 原点**（group 已 translate 到 inst.x/y）；验收只用 `elementFromPoint` |
| **壳图扩展名** | 房间没有墙和地板、只有暗底 | `pack.js` shells 的路径必须和磁盘一致（`.jpg` vs `.png`），SVG `<image>` 失败不报错 |
| **sprite 未接线** | 所有家具都是带名字的方块 | `furniture[]` 每项必须有 `sprite`；兜底方块是提示，不是效果 |
| **壳图参照尺寸** | 窗户坐标全错、雨雪落到门框 | 图片查看器显示的是缩略尺寸；坐标按原图真实像素量（经确认壳图 2496×1564） |
| **`room:ready` 竞态** | 大肥鱼不走位、不落座 | 异步加载的插件可能错过同步事件：模型就绪后自行补一次开场作息 |
| 合成事件假阳性 | `dispatchEvent` 测通了，真鼠标点不动 | 合成事件绕过命中测试；验收必须用 `elementFromPoint` 或真实点击（自动化里用 Playwright click） |

## 看什么

| 文件 | 说明 |
| --- | --- |
| `index.html` | 演示壳：戏台 + 隐藏的导演条 + 启动顺序（内核 → 房间包 → 插件 → boot） |
| `core/room-core.js` | 房间内核：层栈渲染、相机（缩放/平移）、等距网格、家具实体与 hitZone、抽屉+动线、角色气泡、注册表、事件总线 |
| `core/room-core.css` | 内核样式（CSS 变量协议：`--brightness / --ambient / --sun / --lamp`；相机层） |
| `packs/default/pack.js` | 示范房间包：壳（jpg）+ 家具库（sprite/尺寸/锚点/状态机）+ 场景摆位 + hitZone |
| `packs/living/pack.js` | 客厅房间包：`extends:'default'` 继承家具库，8×6 网格（演示“换房间=换目录”） |
| `packs/default/shells/*.jpg` | AI 生成等距空房间（去水印），2048+ 分辨率 |
| `packs/default/furniture/*.png` | 透明家具贴图（`tools/room-furnish.py` 产出）+ `sizes.json` 尺寸表 |
| `tools/room-furnish.py` | 素材流水线：raw 重抠 / 品红幕布抠图 / trim / 一图两物拆分 / 壳图去水印 |
| `plugins/whale-resident.js` | 真模型住客层：kit 身体挂进相机层、锚点走位（ground:'free' 斜向 walkTo）、姿态词映射（sleep/work/stand）、点她有表情回应 |
| `plugins/demo.js` | 演示：房间故事（content+动线）、占位小蓝鲸（仅无 bundle 时顶上）、导演小抄（widget，仅导演模式） |
| `vendor/coopanion/` | Coopanion 鲸鱼模型（AGPL-3.0）：kit 身体运行时 + Live2D 式分件模型（tex/feat，deepseek 原版配色） |
| `vendor/whale-kit.js` | 上者的 esbuild IIFE 打包（model.json 内联绕开 file:// fetch 限制；重建：`npx esbuild vendor/entry.js --bundle --format=iife --outfile=vendor/whale-kit.js`） |

## 五类扩展点（`room.use(def)`）

```js
room.use({
  type: 'content',            // room-pack / environment / content / character / widget
  id: 'my-diary',             // 全局唯一
  name: '我的日记',
  slots: ['bed'],             // 接管哪些热区；'*' 为兜底
  provide: async (slot, room) => ({
    title: '床', sub: '昨天',
    lines: [['日记', '写了两段']],   // [k,v] 行或纯字符串
    // html: '<div>…</div>',        // 本地可信插件可给富内容
  }),
});
```

- **room-pack**：`{ base, viewBox, hotspots:[{id,label,sub?,rect,poly?,onClick?(room)}], window?, lamp? }` —— 换房间；`onClick` 把热区变成动作道具（开灯/换天/走位），不给则点击弹抽屉
- **environment**：`{ periods?, weathers? }`，天气可带 `fx(g, area)` 粒子函数 —— 换天色/加天气
- **content**：见上 —— 热区里显示什么；先注册先响应，返回 null 轮到下一个；`links:[{label,slot}]` 是动线
- **character**：两个实现二选一自动降级 —— `whale-resident.js`（真模型，需 vendor/whale-kit.js）或 `demo.js` 占位小蓝鲸。真模型版：`ctl.walkTo(x, false, id, y)` 斜向走到组件锚点 → 到达后按 anchor.pose 做 sleep/sit/stand，同步书桌 working；`ctl.setExpr` 表情回应；rAF 驱动 step/render，命中盒跟身
- **widget**：`mount(el, room)` —— 挂进右上角部件区（调试工具才用，戏台上克制）

## 事件总线（room.bus）

`room:ready` `scene:change` `weather:change` `lamp:change` `slot:hover` `slot:open` `slot:content` `resident:pose` `calib:toggle` `calib:saved`

## 标注模式

`?calib=1` 或点「标注模式」：拖动热区、保存到 `localStorage`（键 `room.hotspots.<包id>`）、重置还原。退出标注即自动保存。

## 下一步（对照 docs/01-DSH插件契约备忘录.md 与 docs/02-房间诊断与2.5D升级方案.md）

- 阶段 2：把本目录作为静态资源随 DSH 插件包分发，客户端半侧注册右侧栏 Tab
- s2.2 ✅：多房间包（`packs/<id>/` + `extends` 继承家具库）
- s2.3：家具库支持“换皮肤/分类”（同一 defId 多套 sprite），布置模式导出/导入布局 JSON
- s3：`character` 插件读 `petApi7340` 六档工作状态驱动行为；`content` 接 DSH 待办/会话/余额/外部天气
