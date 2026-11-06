# 01 · DSH 插件契约备忘录（已核实）

> 来源：dsh-handbook-zh 官方教程、hello-plugin 最小示例、dsh-pet v0.4.1 源码（现役复杂插件标本）。
> 原始留档：`参考/hello-plugin-ref/`、`参考/dsh-pet-ref/`。核实日期：2026-11-03。

## 1. 一个 DSH 插件长什么样

插件 = npm 包（`.tgz` 或本地目录），**两半结构**：

| 半侧 | 入口 | 运行位置 |
| --- | --- | --- |
| 宿主半侧 | `main`（如 `lib/index.js`），Cordis 插件模块 | DSH 宿主进程 |
| 浏览器半侧 | `exports['./client']`（如 `lib/client.js`） | DSH Web 页面内，由 DSH 模块系统以 `/plugins/<包名>/client.js` 提供 |

### package.json 关键字段（dsh-pet 实测）

```jsonc
{
  "type": "module",
  "main": "lib/index.js",                    // 宿主半侧入口
  "icon": "assets/logo.png",                 // 插件管理页图标（svg/png/jpg/webp，≤256KiB）
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js"            // 浏览器半侧入口
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 声明 bundle + patch 文件
    "client": {
      "inject": ["@deepseek-ai/dsh-client-connection"],  // 浏览器半侧注入依赖
      "platform": "web"                    // web = WebUI 与官方桌面端通用
    },
    "compatibility": { "dshReleases": { "0.2.1-rc.2": "compatible" } }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.4", "...": "宿主提供的模块不打包" }
}
```

### cordis.patch.yml（挂载声明）

```yaml
- insert:
    - id: dsh-room            # 全局唯一，必须与包名一致（商城按它比对 entryIds）
      name: 'dsh-room'        # 模块名：解析到 main
      # config: {...}         # 插件默认配置
```

坑（dsh-pet 注释原话）：`id:` 那一行**不能写行尾注释**，商城预检正则抓不到会整份判 SUBMISSION_ENTRY_MISSING。

## 2. 宿主半侧：Cordis 插件模块（hello-plugin 实测）

```js
// lib/index.js —— name / inject / Config / apply 四件套
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "hello";
export const inject = ["tools"];              // 声明依赖的服务，就绪后才 apply
export const Config = z.object({ greeting: z.string().default("你好，DSH！") });

export function apply(ctx, config) {
  ctx.tools.register(defineTool({ name, description, parameters, execute, ... }));
}
```

## 3. 浏览器半侧：页面内注册（dsh-pet 实测）

### 3.1 入口是普通副作用脚本

构建后的 `lib/client.js` **不能有顶层 ESM import/export**，只做一件事：

```js
window.__ModuleLoader__.load({
  id: 'dsh-room',
  factory: makeFactory(),   // factory = (require: (m:string)=>any) => 模块{name,inject,apply}
});
```

构建器把 react 等改成 factory 内 `require('react')` 取得（平台种子模块：`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives`）。

### 3.2 客户端 ctx 可用的服务（全部已实测出现）

| 服务 | 用法 | 用途 |
| --- | --- | --- |
| `slots` | `ctx.slots.inject(name, function*(){ yield ctx.slots.register({name, id/key, order}, Component); })` | 往页面插槽挂 UI；`inject` 等插槽声明后执行，随插件卸载自动注销 |
| `locale` | `ctx.locale.register(NS, dicts)` / `ctx.locale.bind(NS)` | 文案字典与翻译 |
| `connection` / `remote` / `remote.commands` | `ctx.remote.commands.execute(sessionId, '/pet main', [])` | 会话连接与远程命令 |
| `commandUi` | `ctx.get('commandUi').decorate({name, ui:{kind:'popupSelect',...}})` | `/` 命令的补全 UI |
| `sidebarRightTabs` | 见 3.3 | **注册右侧栏标签页（我们的房间 Tab 走这里）** |
| `sidebarRight` | `ctx.get('sidebarRight').openTab(kind)` | 打开某个标签 |
| `uiWorkspace` | `ctx.get('uiWorkspace')?.openSession?.(id)` | 打开会话 |
| `sessions` | `ctx.get('sessions')?.list?.getSnapshot?.()?.byId` | 会话列表（标题等） |
| 通用 | `ctx.get(name)`（软取，拿不到=老版本/另一侧）、`ctx.provide(name, api)`（注册服务）、`ctx.effect(fn, label)`（作用域生命周期） | Cordis 基础 |

inject 列表参考：`['slots', 'locale', 'connection', 'remote', 'remote.commands', 'commandUi']`。

### 3.3 右侧栏标签页注册配方（dsh-pet chat/register.ts，逐行核实）

```js
const tabs = ctx.get('sidebarRightTabs');
if (!tabs) { console.warn('右侧栏不可用（可选能力，缺失只降级不报错）'); return; }

// ① 注册标签类型
const dispose = tabs.register({
  id: 'dsh-room-tab',            // 标签实现身份，也是正文插槽的 key
  kind: 'dsh-room',              // openTab 按它打开
  priority: 'extension',         // 外部插件的最高优先级，不与内置类型抢地址
  title: () => '大肥鱼的房间',
  guide: [{ id: 'room-guide', order: 1, title: () => '进入房间', description: () => '…', icon: () => imgEl }],
});

// ② 正文插槽（keyed：key 必须等于标签 id，写 id 会落到"没有查看方式"兜底）
//    2026-11-04 更正：插槽名是所有标签共用的 'sidebar.right.pane.tab'（按 key 分派），
//    不是旧稿写的 'sidebarRight.tab.<kind>'——以 dsh-pet src/client/chat/register.ts 为准。
ctx.slots.inject('sidebar.right.pane.tab', function* () {
  yield ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: 'dsh-room-tab', order: 100 },
    () => h(RoomPanel, {}),
  );
});

// ③ 打开：ctx.get('sidebarRight')?.openTab?.('dsh-room')
```

> 注意：右侧栏是**可选能力**（缺 `sidebarRightTabs` 只降级）；dsh-pet 把 overlay 挂在 `ctx.slots.inject('shell.overlay', …)`、设置页挂在 `ctx.slots.inject('settings.section', …)`。房间插件的兜底方案：Tab 不可用时把房间挂为 overlay 或设置区入口。

## 4. 安装 / 开发循环（官方手册实测）

```bash
dsh plugin --profile web add dsh-room          # npm 包
dsh plugin --profile web add ./dsh-room        # 本地目录（开发期，等价 pnpm add <路径>）
dsh plugin --profile web remove dsh-room
dsh --profile web --dump-config | grep dsh-room  # 验证进了组合树
```

装/卸后**必须重启 DSH**（配置树在启动时组合，不热加载）。profile 目录三变化：`package.json` 多依赖、`dsh.profile` bundles 多一行、`node_modules/` 有产物。三样缺一 = 插件没生效。

## 5. dsh-pet 对外接口（「给它安家」的数据通道）

两条通道，**只读**（控制仍走它自己的 HTTP）：

| 通道 | 位置 | 取法 |
| --- | --- | --- |
| Cordis 服务 `petApi7340` | DSH web 页面内（与房间同容器，零网络） | `ctx.get('petApi7340')`，拿不到=未装/过旧 |
| HTTP `/dsh-pet-7340/*` | DSH 自带 Web 服务上，本机无鉴权 | `GET /state` |

### 状态快照（`getState()`，与 `GET /state` 同形）

```js
{
  counter: number,                      // 版本号，叶子变了就递增
  sections: { balance, workStatus, notify, config, menu },  // 每项是 {counter, data}
  pets: { main: { say, anim, position, throw, lock } }
}
```

### 工作状态（sections.workStatus.data，六档，宿主从 DSH 会话事件聚合）

```ts
interface WorkStatusSnapshot {
  state: 'thinking' | 'working' | 'result' | 'waiting' | 'success' | 'error' | null; // null=空闲
  task: string | null;      // 当前任务详情（todo/write 提供）
  sessionId: string | null; // 归属会话；空闲/外部槽为 null
  ts: number;               // 最近变化时间戳
}
```

回合结束映射：completed→success；error/max-tokens/timeout→error；blocked→waiting；aborted→null（回空闲）。
房间映射：thinking/working→书桌干活；waiting→原地踱步张望；success→庆祝；error→惊吓；null→空闲（深夜回床上睡）。

### 宠物实况（页面内）

- `pose(petId)` → `{x, y, facing}`（视口归一化 0–1）——大肥鱼当前在屏幕哪里
- `progress(petId)` → `{anim, currentTime, paused, ...}` 当前动画播放

## 6. 房间插件的设计映射（下一步直接引用）

| 房间需求 | 用哪个契约 |
| --- | --- |
| 侧边栏 Tab | `sidebarRightTabs.register` + keyed slots 正文（3.3 配方） |
| Tab 缺失兜底 | `shell.overlay` 或 `settings.section` |
| 大肥鱼在干嘛 | `petApi7340.getState().sections.workStatus.data`（同容器零网络） |
| 未装 dsh-pet 兜底 | 宿主半侧自订会话事件，写进自己的 roomApi 服务 |
| 反向开放 | 宿主+客户端各 `ctx.provide('roomApi<dna>', {...})`，命名带后缀防同名冲突 |
| 静态房间资源 | 随包分发，走 `/plugins/dsh-room/` 静态路径或 data/blob（iframe 免鉴权坑见攻略 §4） |
| 文案 | `ctx.locale.register/bind` |
| 验证 | `--dump-config` 组合树 + 会话里模型调用工具 + 页面可见 UI |
