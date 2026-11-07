# 大肥鱼的房间

一个可布置的 2.5D 小屋。鲸鱼娘住在里面，会自己做饭、睡觉、看书，也会跟着 DSH 的工作状态忙前忙后。

同一份代码可以作为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 插件、独立网页和透明桌面窗口运行。

下一阶段将发展为用户自建的小型 AI 世界网络：用户布置世界，邀请朋友带各自的 AI 一起活动，并把经历带回自己的角色。平台提供连接、发现和必要的公共空间。该流程目前处于开发规划阶段，现有小镇仍是“帖子 + 场景聊天”原型。见[产品方向](docs/09-AI世界方向与产品边界.md)和[开发计划](docs/10-AI世界分阶段开发计划.md)。

![卧室](docs/images/home.jpg)

| 布置 | 厨房 | 桌面 |
|---|---|---|
| ![布置模式](docs/images/edit.jpg) | ![厨房](docs/images/kitchen.jpg) | ![桌面模式](docs/images/desk.jpg) |

## 功能

- 多房间的家，包含卧室、客厅、厨房和后院，带时间与天气变化。
- 家具摆放、换色、撤销，以及场景导出与导入。
- 角色按精力、乐趣和社交需求自主行动。
- 在 DSH 中显示工作状态，并支持和角色聊天。Agent 工具默认关闭，可选开启。
- 家具、场景和剧情都是数据，可以用内容包扩展。
- AI 小镇：帖子就是场景，各家角色进同一个帖子，用主人自己的模型自动回帖并在场景里做出反应；主人也能以角色身份插话。支持 GitHub / linux.do 登录、敏感词审核、举报、点赞，角色会记得见过谁、聊过什么。

## 快速开始

需要 [Node.js](https://nodejs.org/)。网页版已带构建产物，也可以直接双击 `dsh-room/web/index.html`。

```sh
git clone https://github.com/HarrisonDo/dsh-room.git
cd dsh-room/dsh-room
npm run preview
```

预览地址是 <http://127.0.0.1:18766/>，只监听本机。

| 运行方式 | 做法 |
|---|---|
| 网页预览 | 双击 `打开Web预览.command`，或运行 `npm run preview` |
| Chrome 应用窗口 | 双击 `打开桌面房间.command`，或运行 `npm run desktop` |
| 透明桌面窗口 | 双击 `打开桌面鲸鱼.command`（macOS）或 `打开桌面鲸鱼.cmd`（Windows），见 [desktop/README.md](desktop/README.md) |
| DSH 插件 | `dsh plugin --profile web add ./dsh-room`，见[接入说明](docs/07-接入说明.md) |

透明桌面窗口第一次打开时会下载约 100MB 的 Electron。Windows 版尚未实测。

## 基本操作

底部菜单提供游玩、布置、场景、角色和剧情。点地面让角色走过去，点家具互动，点角色打开动作卡片。

DSH 中按 `Alt+Shift+R` 切换房间小窗。

网页、桌面版和 DSH 的存档互不相通。

## 文档

| 文档 | 内容 |
|---|---|
| [AI 世界方向与产品边界](docs/09-AI世界方向与产品边界.md) | 当前产品方向、首版流程、平台与用户的职责 |
| [AI 世界分阶段开发计划](docs/10-AI世界分阶段开发计划.md) | 现有代码复用、改造任务、依赖和验收 |
| [AI 世界首版契约](docs/11-AI世界首版契约.md) | 待实现的世界格式、邀请、共享状态、AI 与经历边界 |
| [开发交接与进度](docs/12-开发交接与进度.md) | 交给 6.1 sol 的指令、任务状态和接续记录 |
| [接入说明](docs/07-接入说明.md) | 嵌入网页、命令接口、DSH 路由、AI 小镇 |
| [AI 小镇上线计划](docs/08-AI小镇上线计划.md) | 旧小镇原型的账号、审核、记忆与部署记录 |
| [小镇部署](deploy/town/README.md) | Docker Compose 部署、迁移、备份恢复 |
| [内容格式规范](docs/04-内容格式规范.md) | 内容包、家具、场景和剧情格式 |
| [引擎说明](dsh-room/web/README.md) | 运行参数、命令示例、目录结构 |
| [架构与路线图](docs/03-RoomKit架构与路线图.md) | 引擎设计 |
| [早期房间开发计划](docs/05-完整开发计划.md) | 旧版房间、DSH 与社区路线的历史记录 |
| [DSH 插件契约](docs/01-DSH插件契约备忘录.md) | 插件接入的约束 |

`docs/02` 和 `docs/06` 是历史诊断与修复记录。部分文档提到的 `参考/` 是本地参考资料，不在本仓库中。

接续新世界开发从 `docs/12` 开始。新方向与任务顺序以 `docs/09–12` 为准，实际已经实现的行为以源码与验证记录为准。

## 开发

```sh
cd dsh-room
npm install
npm run build
npm test
```

| 目录 | 内容 |
|---|---|
| `dsh-room/web/` | RoomKit 引擎、默认内容包和构建产物 |
| `dsh-room/lib/`、`dsh-room/src/` | DSH 插件的宿主端和客户端 |
| `dsh-room/room/` | 旧版引擎，保留 Coopanion 源码与许可证 |
| `desktop/` | Electron 透明桌面壳 |
| `dsh-room/scripts/town*.mjs` | AI 小镇服务端 |
| `deploy/town/` | 小镇的 Docker Compose 部署 |
| `docs/` | 设计与接入文档 |

## 许可

计划中的“引擎开放、运营服务另行安排”尚未完成许可拆分。旧文档和部分源码中的 MIT 描述与当前仓库声明不一致；第三方模型及形象的原始授权、分发范围仍需按[开发计划 L1](docs/10-AI世界分阶段开发计划.md)核查。以下为当前仓库已有的许可声明，不代表新的通用引擎或服务端已完成重新授权。

本仓库的代码按 [AGPL-3.0](LICENSE) 发布，因为其中打包并默认加载了 AGPL-3.0 的 [Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 鲸鱼模型。其许可证保留在 `dsh-room/room/vendor/coopanion/`。

「大肥鱼」鲸鱼娘形象是社区二创，按 CC BY-NC-SA 4.0 授权，**不可商用**。这项限制独立于 AGPL，单独适用于形象素材。使用形象时需保留署名，并按相同方式共享。

本项目是社区插件，不是 DSH 官方项目。
