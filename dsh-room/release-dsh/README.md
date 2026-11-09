# 大肥鱼的房间 · DeepSeek Harness 插件

1. 打开 DeepSeek Harness 桌面版，进入「插件 → 添加插件」。
2. 粘贴 `https://github.com/HarrisonDo/dsh-room`，点「安装」，完成后点「立即启用」。
3. 从右下角打开「大肥鱼的房间」，也可按 Alt+Shift+R。小屋里可以点家具互动，从左上角换到小院。

## 把房间放到桌面

在 DSH 的房间顶部点「放到桌面」。首次会下载并解包 Electron，界面会显示进度，可以取消后再打开。后续使用本机缓存。

在桌面小窗右键可选「打开完整房间」或「回到 DSH」。同一 DSH profile 内，桌面和内嵌窗口接续同一份家。若正在多人场次，先返回自己的小屋再切换。聊天用当前 DSH 会话已选的模型，模型凭据由宿主管理。没有选模型时仍可布置和操作家具。

## 本地候选与源码

也可在「添加插件」输入下载的 `.tgz` 的绝对路径。升级第三方插件时，按 DSH 的提示卸载旧版再安装新版。用随附的 `SHA256SUMS` 核对归档。解开同版本源码后，在其根目录用 Node.js 24 执行 `npm ci` 和 `npm pack`。包内含许可证和署名说明。

实机验收平台及发布状态见随交付附上的项目交接记录。 [项目仓库](https://github.com/HarrisonDo/dsh-room) · [问题反馈](https://github.com/HarrisonDo/dsh-room/issues)
