const { contextBridge, ipcRenderer, webUtils } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  openDialog: inv('file:open-dialog'),
  readFile: inv('file:read'),
  save: inv('file:save'),
  exportFile: inv('file:export'),
  saveFormat: inv('format:save'),
  loadFormat: inv('format:load'),
  autosaveWrite: inv('autosave:write'),
  autosaveRead: inv('autosave:read'),
  autosaveClear: inv('autosave:clear'),
  setDirty: (v) => ipcRenderer.send('app:set-dirty', !!v),
  setState: (s) => ipcRenderer.send('app:state', s),
  setTheme: (t) => ipcRenderer.send('app:set-theme', t),
  openAI: () => ipcRenderer.send('ai:open'),
  closeNow: () => ipcRenderer.send('app:close-now'),
  confirmBox: inv('app:confirm'),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } },
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action, arg) => cb(action, arg)),
  onRequest: (cb) => ipcRenderer.on('app-request', async (_e, id, kind, arg) => {
    let v = null;
    try { v = await cb(kind, arg); } catch (e) { v = null; }
    ipcRenderer.send('app-response', id, v);
  }),
  initialFile: inv('app:initial-file'),
  systemDark: inv('app:system-dark'),
  version: inv('app:version')
});
