# 大肥鱼的房间

一个可布置的 2.5D 小屋。鲸鱼娘住在里面，会自己做饭、睡觉、看书，也会跟着 DSH 的工作状态忙前忙后。

同一份代码可以作为 [DSH](https://github.com/deepseek-ai/deepseek-harness) 插件、独立网页和透明桌面窗口运行。

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
| [接入说明](docs/07-接入说明.md) | 嵌入网页、命令接口、DSH 路由 |
| [内容格式规范](docs/04-内容格式规范.md) | 内容包、家具、场景和剧情格式 |
| [引擎说明](dsh-room/web/README.md) | 运行参数、命令示例、目录结构 |
| [架构与路线图](docs/03-RoomKit架构与路线图.md) | 引擎设计 |
| [完整开发计划](docs/05-完整开发计划.md) | 阶段、进度和待办 |
| [DSH 插件契约](docs/01-DSH插件契约备忘录.md) | 插件接入的约束 |

`docs/02` 和 `docs/06` 是历史诊断与修复记录。部分文档提到的 `参考/` 是本地参考资料，不在本仓库中。

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
| `docs/` | 设计与接入文档 |

## 许可

本仓库的代码按 [AGPL-3.0](LICENSE) 发布，因为其中打包并默认加载了 AGPL-3.0 的 [Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 鲸鱼模型。其许可证保留在 `dsh-room/room/vendor/coopanion/`。

「大肥鱼」鲸鱼娘形象是社区二创，按 CC BY-NC-SA 4.0 授权，**不可商用**。这项限制独立于 AGPL，单独适用于形象素材。使用形象时需保留署名，并按相同方式共享。

本项目是社区插件，不是 DSH 官方项目。
