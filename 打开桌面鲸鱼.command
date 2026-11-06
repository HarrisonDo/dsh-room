#!/bin/zsh
# 桌面版：透明窗口里只有房间和鲸鱼娘（desktop/ 里的 Electron）。第一次打开会安装 Electron（约 100MB）。
set -e
ROOM_ROOT="${0:A:h}"
ROOM_NODE="$(command -v node || true)"
if [[ -z "$ROOM_NODE" ]]; then
  ROOM_NODES=("$HOME"/.nvm/versions/node/*/bin/node(N))
  ROOM_NODE="${ROOM_NODES[-1]:-}"
fi
if [[ -z "$ROOM_NODE" ]]; then
  print '找不到 Node.js。请安装 Node.js 后重试。'
  read '?按回车关闭'; exit 1
fi
export PATH="${ROOM_NODE:h}:$PATH"
cd "$ROOM_ROOT/desktop"
if [[ ! -x node_modules/.bin/electron ]]; then
  print '第一次打开：正在安装 Electron（约 100MB）…'
  npm install
fi
[[ -d node_modules/electron/dist ]] || node node_modules/electron/install.js
( node_modules/.bin/electron . >/dev/null 2>&1 & )
print '大肥鱼已经在桌面上了，这个窗口可以关掉。'
