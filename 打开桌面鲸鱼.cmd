@echo off
rem 桌面版：透明窗口里只有房间和鲸鱼娘（desktop\ 里的 Electron）。第一次打开会安装 Electron（约 100MB）。
chcp 65001 >nul
cd /d "%~dp0desktop"
where node >nul 2>nul || (echo 找不到 Node.js，请先安装 https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules\.bin\electron.cmd (
  echo 第一次打开：正在安装 Electron（约 100MB）…
  call npm install || (pause & exit /b 1)
)
if not exist node_modules\electron\dist\electron.exe node node_modules\electron\install.js
start "" node_modules\electron\dist\electron.exe .
