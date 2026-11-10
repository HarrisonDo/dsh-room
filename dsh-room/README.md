# 大肥鱼的房间 · dsh-room

DSH 的 2.5D 可布置房间，同时提供独立 Web 预览。

## 使用

- DSH 左侧「插件 → 大肥鱼的房间」标签、该插件的详情配置区、设置页，以及右下角小窗均提供入口。
- `Alt+Shift+R` 切换房间小窗；小窗可收起、切到侧栏或全屏。
- 插件配置页的「Web 预览」打开当前宿主的本机静态房间，不传递宿主认证凭据。
- `npm run preview` 启动并打开独立浏览器预览，地址 <http://127.0.0.1:18766/>。
- `npm run desktop` 用本机已有的 Chrome 打开独立应用窗口；未安装 Chrome 时使用默认浏览器。
- `npm run serve` 在前台启动仅本机可访问的静态服务；Ctrl+C 退出。
- 独立中性示例入口为 `http://127.0.0.1:18766/example.html`，使用程序绘制的角色和道具以及独立存档。
- 可直接双击 `web/index.html` 离线运行。

底部菜单：游玩、布置、剧情、聊天、地图、社区；场景和角色管理在布置页。点角色打开动作卡片，点家具互动，点地面移动。游玩时左键点已连接的房门直接换房，右键点门打开门旁菜单，可开关门和修改目的地；没有目的地时只显示简短提示。开场剧情不自动播放。

DSH 小窗/侧栏/全屏共用 `dsh-room` 存档命名空间，宿主路由可用时同步保存；独立网页使用浏览器本地存档。

## 已有 DSH：首次体验

在 DSH「插件 → 添加插件」中直接粘贴 `https://github.com/HarrisonDo/dsh-room`，安装完成后点「立即启用」，打开房间。普通用户不需要克隆仓库或进入这个开发子目录。 [安装与桌面使用指南](../docs/17-安装与桌面使用.md) · [备用下载](https://dshroom.pigeongugu.store/assets/dsh-install.html)

点击「放到桌面」会准备桌面组件并打开透明辅助窗，房间、角色、家具包和草稿随窗口接续。模型继续使用 DSH 的选择，DSH 需要保持运行。无模型时可以布置、换房和手动互动。Windows 仍待实机验收。

网页预览使用浏览器自己的存档，不会自动取得 DSH 的模型凭据、角色和记忆。同一个 DSH 内的桌面接续不代表跨设备云同步已完成。分享与共同世界按 [当前发布路线](../docs/10-AI世界分阶段开发计划.md#0-当前发布路线) 后续完善。

## 命令行安装（可选）

```sh
dsh plugin --profile web add https://github.com/HarrisonDo/dsh-room
```

桌面端先退出 DSH，再用其随应用分发的 dsh 命令安装到 `desktop` profile，安装后重新打开应用。官方说明：<https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md>。

## 源码开发

在完整源码目录中运行 `npm ci`、`npm run build`、`npm test`。发布包内已经包含构建产物，不需要在 DSH 中执行构建。

在本目录用 Node.js 24 运行 `node scripts/pack-neutral.mjs <新的交付目录>` 可制作独立的 `roomkit-neutral` 候选。交付目录包含 npm 包、同版本源码归档、输入清单和 SHA-256 校验值。解包后用 `npm run serve` 打开示例。 [中性候选说明](neutral/README.md)

DSH 安装包使用 Canvas Q 版鲸鱼娘主题；试玩站点另提供可选外观。角色绘制与站点主题分别位于 `web/roomkit/paint-girl.js` 和 `demo-theme/`。共建代码或反馈问题请使用公开仓库，重建安装包使用其同版本源码归档。 [项目仓库](https://github.com/HarrisonDo/dsh-room) · [问题反馈](https://github.com/HarrisonDo/dsh-room/issues) · [演示署名](release-dsh/NOTICE.md)

只构建中性示例时，在源码仓库的 `dsh-room/` 运行 `npm run build:example`，再用 `npm run serve` 打开示例庭院。示例支持连接小镇、发布庭院并手动完成合作信标。

引擎的扩展接口、素材和场景格式见 `web/README.md`。发布包附带 AGPL-3.0 正文及模型和形象的署名。 [许可证正文](LICENSE) · [许可证与署名](NOTICE.md)
