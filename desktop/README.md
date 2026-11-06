# 大肥鱼的房间 · 桌面版

透明、无边框的窗口里只有房间和鲸鱼娘，可以放在桌面任何位置。支持 macOS 和 Windows。

## 打开

- macOS：双击仓库根目录的 `打开桌面鲸鱼.command`
- Windows：双击仓库根目录的 `打开桌面鲸鱼.cmd`（需要先装 [Node.js](https://nodejs.org/)）
- 命令行：`cd desktop && npm install && npm start`

第一次打开会安装 Electron（约 100MB）。Electron 下载慢时，可以在安装前自行设置 `ELECTRON_MIRROR` 环境变量指向你信任的镜像。

## 操作

| 操作 | 效果 |
|---|---|
| 点角色、家具、地板 | 和网页版一样：互动、走过去 |
| 在房间上拖动 | 移动窗口 |
| 滚轮 | 放大 / 缩小 |
| 右键（或鼠标碰到房间后，顶部出现的 ⋯） | 换房间、时间、天气、大小、总在最前、在所有桌面显示（macOS）、打开完整房间、退出 |
| 房间之外的透明处 | 点击穿透到下面的桌面和窗口 |

「打开完整房间」会打开带顶栏和菜单的普通窗口，可以布置、聊天、看地图。关掉它，桌面上的房间就会回来，布置的结果也跟着回来。

## 实现

- `main.js`：主进程。透明窗口默认忽略鼠标，同时把鼠标移动转发给页面。页面判断鼠标下面有没有东西，再通知主进程接不接点击（`setIgnoreMouseEvents(…, { forward: true })`）。
- `preload.cjs`：只给页面暴露几项窗口操作（`window.roomkitDesk`），页面拿不到 Node。
- 页面直接读 `../dsh-room/web`，走自定义协议 `app://roomkit/`，**不监听任何网络端口**。引擎的桌面模式见 `dsh-room/web/roomkit/desk.js`（`?desk=1`）。
- 窗口位置、大小、是否置顶存在系统的用户数据目录里的 `desk.json`（macOS：`~/Library/Application Support/大肥鱼的房间/`）。

## 存档

桌面版的存档在 Electron 自己的用户数据目录里，和浏览器预览、DSH 里的房间互不相通。打通 DSH 存档是后续工作。

## 还没做

- 打包成 `.app` / `.exe` 安装包（electron-builder 等）、代码签名、开机自启：涉及发布和系统设置，由你决定。
- Linux 上点击穿透（Electron 在 Linux 上不支持转发鼠标移动）。
