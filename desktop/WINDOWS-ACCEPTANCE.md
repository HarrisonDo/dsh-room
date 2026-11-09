# R03c Windows 实机验收

候选 `dsh-room@0.1.0-r03c.1`。本机已核对打包与窗口逻辑，Windows 各项均待实机。建议先测 Windows 11 x64，ARM64 另记。用本机的 DSH 桌面版、普通 Windows 用户和两个不同缩放的屏幕，例如 100% 与 150%。

## 1. 安装与冷启动

1. 把候选 `.tgz`、`SHA256SUMS` 和 `windows-diagnose.mjs` 放到同一目录。用 PowerShell 的 `Get-FileHash -Algorithm SHA256 .\dsh-room-0.1.0-r03c.1.tgz` 与清单比对。
2. 启动已安装的 DeepSeek Harness 桌面版。若要隔离，先退出已有 Harness，在 PowerShell 里把 `DSH_HOME` 指到一个新测试目录，再从同一窗口运行已安装的 Harness 可执行文件。原生应用会在该目录初始化保留名 `profiles\desktop`。验模型时在测试环境中选一条已能正常聊天的会话。
3. 在原生 DSH 的「插件 → 添加插件」填入候选归档的绝对路径，安装后点「立即启用」。以下命令可取得需要粘贴的路径。

   ```powershell
   $candidate = (Resolve-Path '.\dsh-room-0.1.0-r03c.1.tgz').Path
   $candidate
   ```

4. 找到实际 profile 目录，即其子目录下会出现 `storages\dsh-room` 的目录。在插件内点「放到桌面」前先跑诊断。干净测试 profile 的 `runtimeReady` 应为空。然后点「放到桌面」，观察下载进度、解包和小窗出现。可另用干净 profile 或移动旧缓存后测一次取消、失败后重试。记录实际提示，取消后 `stagingCount` 应回到 0。运行时来自固定的 Electron 发行版本。 [Electron 45.2.3](https://github.com/electron/electron/releases/tag/v45.2.3)
5. 小窗出现后再跑诊断。应看到该架构的运行时缓存和该 profile 的 Electron PID。第二次打开应复用缓存。若系统提示阻止，记录提示和签名状态，验收继续使用普通用户权限。

   ```powershell
   $profileDir = 'C:\路径\profiles\desktop'
   $expected = ((Get-Content .\SHA256SUMS | Select-String 'r03c\.1\.tgz$').Line -split '\s+')[0]
   node .\windows-diagnose.mjs "$profileDir" "$candidate" "$expected"
   ```

诊断只读。输出包括系统与 Node 架构、是否提权、候选 SHA-256、是否已生成存档和位置偏好、运行时缓存和本 profile 下可识别的 Electron PID。不读取模型凭据或房间内容，也不输出进程命令行和文件路径。进程路径不可读的数量另列，出现时用任务管理器核对退出状态。

## 2. 窗口与多屏

- 把小窗放在普通权限的记事本上方。透明处应能点到记事本，房间实体应接收点击、拖动、滚轮和右键。拖出透明区再松手，下一次点击和拖动应正常。记录菜单打开及「总在最前」切换。Windows 在高权限窗口获得焦点时可能暂时停止转发鼠标移动，因此用同级普通窗口验收。 [Electron 鼠标穿透说明](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options)
- 拖到第二屏，滚轮放大和缩小，切换横向和较高的房间。观察跨不同缩放时是否突然跳位、画面裁切、鼠标命中偏移，窗口能否留在工作区内。放在第二屏后关闭，再重开，记录位置和尺寸。然后断开第二屏，检查正在显示的小窗和再次打开的小窗能否回到可用屏幕。
- 移动窗口后立即「回到 DSH」，再打开核对位置。重复点一次「放到桌面」检查只出现一个辅助窗口。分别测试菜单返回、完整窗口关闭和退出 DSH，关闭后跑诊断，确认本 profile 的 `managedElectronPids` 为空。

## 3. 同家和模型

1. 在内嵌小屋改房间名、移动一件家具。若手头有旧 profile 的自建家具包和世界草稿，在隔离副本里保留它们用于接续检查。
2. 走「内嵌 → 桌面小窗 → 右键打开完整房间 → 关完整房间回小窗 → 回到 DSH」。在完整房间再做一处容易识别的改动。确认返回后两处改动均在，小屋与小院切换正常，另一视图交接期间不会继续写入。重启同一 DSH profile，核对房间、角色及已有自建内容。
3. 在完整房间的聊天界面使用宿主当前选中的真实模型取得一条回复。取消模型选择后再打开，确认点灯或家具互动仍能使用，聊天给出可理解的状态。无需记录模型密钥、账户信息或聊天内容。
4. 确认系统未要求房间使用摄像头、麦克风、定位或通知。若遇外链、异常弹窗、退出后残留进程，记录触发步骤。

验收结果逐项记为通过、失败或未测，附 Windows 版本与架构、DSH 版本、两屏缩放、候选 SHA-256、首次下载及退出后的诊断输出。失败时保留原始界面错误文本，并说明发生在下载、解包、窗口出现、回到 DSH 或宿主模型的哪一步。
