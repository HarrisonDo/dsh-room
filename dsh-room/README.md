# 大肥鱼的房间 · dsh-room

DSH 的 2.5D 可布置房间，同时提供独立 Web 预览。

## 使用

- DSH 左侧「插件 → 大肥鱼的房间」标签、该插件的详情配置区、设置页，以及右下角小窗均提供入口。
- `Alt+Shift+R` 切换房间小窗；小窗可收起、切到侧栏或全屏。
- 插件配置页的「Web 预览」打开当前宿主的本机静态房间，不传递宿主认证凭据。
- `npm run preview` 启动并打开独立浏览器预览，地址 <http://127.0.0.1:18766/>。
- `npm run desktop` 用本机已有的 Chrome 打开独立应用窗口；未安装 Chrome 时使用默认浏览器。
- `npm run serve` 在前台启动仅本机可访问的静态服务；Ctrl+C 退出。
- 可直接双击 `web/index.html` 离线运行。

底部菜单：游玩、布置、场景、角色、剧情。点角色打开动作卡片，点家具互动，点地面移动。开场剧情不自动播放。

DSH 小窗/侧栏/全屏共用 `dsh-room` 存档命名空间，宿主路由可用时同步保存；独立网页使用浏览器本地存档。

## 本地安装

```sh
dsh plugin --profile web add ./dsh-room
```

桌面端先退出 DSH，再用其随应用分发的 dsh 命令安装到 `desktop` profile，安装后重新打开应用。官方说明：<https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md>。

## 源码开发

在完整源码目录中运行 `npm install`、`npm run build`、`npm test`。发布包内已经包含构建产物，不需要在 DSH 中执行构建。

引擎的扩展接口、素材和场景格式见 `web/README.md`。可选的鲸鱼娘模型来自 [Pal-AI-Lab/Coopanion](https://github.com/Pal-AI-Lab/Coopanion)，其许可为 AGPL-3.0，原始声明保留在完整源码的 `room/vendor/coopanion/`。
