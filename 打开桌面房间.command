#!/bin/zsh
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
"$ROOM_NODE" "$ROOM_ROOT/dsh-room/scripts/launch.mjs" --desktop
