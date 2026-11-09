# Windows 完整房间窗口隐藏诊断

2026-11-09，基于 GitHub 提交 `ead5e5f` / 安装包 `0.1.0-r03c.2`，使用本机已安装的 Electron `45.2.3 win32 x64`。

用户触发路径为「桌面小窗 → 右键 → 打开完整房间」。现场 Electron 进程仍存在，CPU 使用量很低，没有可见窗口；DSH 显示房间仍在桌面。这一路径容易被误认为卡死。

## 根因

`dsh-room/lib/desktop-process.js` 使用 `spawn(..., { windowsHide: true })` 启动 Electron。在本机 Windows 上，这个参数使小窗之后创建的第一个带边框 `BrowserWindow` 保持隐藏。`desktop/main.js` 已收到 `roomkit:home-ready` 并调用 `window.show()`，窗口仍报告 `isVisible() === false`。

页面加载、角色模拟和宿主请求均继续执行。小窗在成功保存后已销毁，因此用户看不到任何房间窗口。

源码修复移除 `windowsHide`，采用默认值 `false`。Electron 本身是 GUI 可执行文件，不需要借这个参数隐藏终端窗口。

## 验证

使用复制到临时目录的房间存档、真正的 Electron 主进程和 preload，以及源码 `createLocalHome` 处理存档交接。模型状态由诊断宿主返回不可用，没有调用真实模型，也没有写入原存档。

| 路径 | 启动参数 | 完整窗口状态 | 结果 |
| --- | --- | --- | --- |
| 直接调用窗口切换 | `windowsHide: true` | `visible: false, enabled: true` | 问题复现，页面模拟仍在前进 |
| 右键原生菜单 | `windowsHide: true` | ready 后可见性为 false | 问题复现 |
| 直接调用窗口切换并停留 20 秒 | `windowsHide: false` | 一直 `visible: true` | 对照通过 |
| 右键原生菜单 | `windowsHide: false` | 小窗、完整窗口、返回小窗均 `visible: true` | 往返通过，返回操作后进程以 0 退出 |

诊断日志与脚本保存在本机 `.diagnostics/` 中，未提交到仓库，也不属于发布载荷。

现有定向测试通过：

```text
node --test desktop/windows-window.test.mjs dsh-room/tests/local-home.test.mjs
tests 2, pass 2, fail 0
```

## 原生 DSH 本地安装实测

使用 DSH 自带的插件 CLI，完整退出宿主后移除 `github:HarrisonDo/dsh-room`，通过 `link:` 安装本地 `artifacts/local-dsh-room/`。本地候选以既有 `install/` 载荷为基础，复制修复后的 `lib/desktop-process.js`，版本记为 `0.1.0-r03c.3`，重新构建客户端和网页。公开分发的 `install/` 未修改。

配置、锁文件、房间存档与窗口偏好已在本机 `artifacts/` 下备份，未提交到仓库。原 profile 的存档与 Electron 运行时缓存继续使用。

真实 DSH 验证通过：

- 重启后本地插件自动加载，内嵌房间恢复原存档，旧目录元数据错误消失。
- 「放到桌面」启动本地候选的 Electron 小窗。自动化鼠标点击受透明穿透影响，因此使用 `Shift+F10` 打开同一原生上下文菜单，再选择「打开完整房间」。完整窗口可见，角色正常绘制，页面为 `app://roomkit/managed.html`。
- 完整窗口的「地图」页可打开和绘制，保持响应。旧存档列出 6 个房间，当前分发载荷可渲染卧室、小屋与小院卡片；没有将其余旧模板记为已验证。
- `Alt+F4` 关闭完整窗口，自动回到桌面小窗。
- 小窗原生菜单「回到 DSH」成功，内嵌房间恢复，profile 下的 Electron 辅助进程数为 0。
- 安装后的宿主文件 SHA-256 与修复源码一致，桌面主进程文件与仓库原文件一致。临时诊断插桩已从本地候选移除。

本轮没有测试真实模型、多屏缩放或冷下载；这些项目仍按 Windows 验收清单执行。
