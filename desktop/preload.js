"use strict";
const { contextBridge, ipcRenderer } = require("electron");
// The only privileged surface the web app gets: PDF export and printing of one of its own scripts.
contextBridge.exposeInMainWorld("guionista", {
  exportPdf: (id, title) => ipcRenderer.invoke("pdf:export", String(id), String(title)),
  print: (id) => ipcRenderer.invoke("pdf:print", String(id)),
  setFullScreen: (on) => ipcRenderer.invoke("win:fullscreen", !!on),
  saveFdx: (o) => ipcRenderer.invoke("fdx:save", o),
  saveFdxAs: (o) => ipcRenderer.invoke("fdx:saveAs", o),
  chooseFolder: () => ipcRenderer.invoke("fdx:chooseFolder"),
  getFolder: () => ipcRenderer.invoke("fdx:folder"),
  reveal: (p) => ipcRenderer.invoke("fdx:reveal", String(p)),
  openFile: () => ipcRenderer.invoke("fdx:openFile"),
  // several scripts at once: every script lives in its own window (and its own taskbar entry)
  openScript: (id, inNewWindow) => ipcRenderer.invoke("win:openScript", String(id), !!inNewWindow),
  openWelcome: () => ipcRenderer.invoke("win:welcome"),
  // the writing assistant shows the web versions of Claude, ChatGPT and Gemini in a panel
  ai: {
    show: (provider, b) => ipcRenderer.invoke("ai:show", String(provider), { x: +b.x, y: +b.y, width: +b.width, height: +b.height }),
    hide: () => ipcRenderer.invoke("ai:hide"),
    reload: (provider) => ipcRenderer.invoke("ai:reload", String(provider)),
    paste: () => ipcRenderer.invoke("ai:paste"),
    external: (provider) => ipcRenderer.invoke("ai:external", String(provider)),
  },
});
