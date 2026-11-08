const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ai', {
  select: (p) => ipcRenderer.send('ai:select', p),
  send: (o) => ipcRenderer.invoke('ai:send', o),
  external: () => ipcRenderer.send('ai:external'),
  nav: (a) => ipcRenderer.send('ai:nav', a),
  pin: () => ipcRenderer.invoke('ai:pin'),
  insertNote: () => ipcRenderer.invoke('ai:insert-note'),
  onState: (cb) => ipcRenderer.on('ai:state', (_e, s) => cb(s))
});
