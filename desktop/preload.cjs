// 桌面窗口的页面桥：只暴露几项窗口操作，页面拿不到 Node 和 ipcRenderer 本身。
// 页面一侧的用法见 dsh-room/web/roomkit/desk.js（app.ext.desk）。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roomkitDesk', {
  setSolid: (solid) => ipcRenderer.send('desk:solid', !!solid),
  drag: (phase) => ipcRenderer.send('desk:drag', String(phase)),
  scale: (factor) => ipcRenderer.send('desk:scale', Number(factor)),
  aspect: (ratio) => ipcRenderer.send('desk:aspect', Number(ratio)),
  menu: (spec) => ipcRenderer.invoke('desk:menu', spec),
  openFull: () => ipcRenderer.send('desk:full'),
});
