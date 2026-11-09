// 桌面窗口的页面桥：只暴露几项窗口操作，页面拿不到 Node 和 ipcRenderer 本身。
// 页面一侧的用法见 dsh-room/web/roomkit/desk.js（app.ext.desk）。
const { contextBridge, ipcRenderer } = require('electron');
const managed = process.argv.includes('--roomkit-managed');

contextBridge.exposeInMainWorld('roomkitDesk', {
  setSolid: (solid) => ipcRenderer.send('desk:solid', !!solid),
  drag: (phase) => ipcRenderer.send('desk:drag', String(phase)),
  scale: (factor) => ipcRenderer.send('desk:scale', Number(factor)),
  aspect: (ratio) => ipcRenderer.send('desk:aspect', Number(ratio)),
  menu: (spec) => ipcRenderer.invoke('desk:menu', spec),
  openFull: () => ipcRenderer.send('desk:full'),
});

if (managed) {
  const call = (method, input) => ipcRenderer.invoke('roomkit:home', method, input);
  contextBridge.exposeInMainWorld('roomkitHome', {
    claim: input => call('claim', input),
    save: input => call('save', input),
    model: input => call('model', input),
    chat: input => call('chat', input),
    cancelModel: input => call('cancel-model', input),
    ready: () => ipcRenderer.send('roomkit:home-ready'),
    returnHome: () => ipcRenderer.invoke('roomkit:home-return'),
    onPrepare(callback) {
      ipcRenderer.on('roomkit:home-prepare', async (_, id, action) => {
        try {
          await callback(action, input => call(action, input));
          ipcRenderer.send('roomkit:home-prepared', id, { ok: true });
        } catch (error) {
          ipcRenderer.send('roomkit:home-prepared', id, { ok: false, error: error.message, code: error.code });
        }
      });
    },
  });
}
