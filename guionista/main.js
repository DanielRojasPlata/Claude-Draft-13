'use strict';
const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, shell, nativeTheme, clipboard, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FILE = 50 * 1024 * 1024;
const OPEN_EXT = new Set(['.guion', '.fountain', '.fdx', '.txt', '.json']);
let mainWin = null;
let aiWin = null;
let dirty = false;
let allowClose = false;
let uiState = {};
let menuTimer = null;
const pending = new Map();
let reqId = 0;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on('second-instance', (_e, argv) => {
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); const f = argFile(argv); if (f) mainWin.webContents.send('menu', 'open-path', f); }
});
const argFile = (argv) => argv.slice(1).find((a) => !a.startsWith('-') && OPEN_EXT.has(path.extname(a).toLowerCase()) && fs.existsSync(a));

// ---------- util ----------
function askRenderer(kind, arg) {
  return new Promise((resolve) => {
    if (!mainWin || mainWin.isDestroyed()) return resolve(null);
    const id = ++reqId;
    const t = setTimeout(() => { pending.delete(id); resolve(null); }, 4000);
    pending.set(id, (v) => { clearTimeout(t); resolve(v); });
    mainWin.webContents.send('app-request', id, kind, arg);
  });
}
ipcMain.on('app-response', (e, id, v) => {
  if (!mainWin || e.sender !== mainWin.webContents) return;
  const f = pending.get(id); if (f) { pending.delete(id); f(v); }
});
const fromMain = (e) => mainWin && !mainWin.isDestroyed() && e.sender === mainWin.webContents;
const send = (action, arg) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('menu', action, arg); };

function atomicWrite(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
const autosavePath = () => path.join(app.getPath('userData'), 'autosave.guion');

// ---------- menú ----------
function buildMenu() {
  const s = uiState || {};
  const item = (label, action, accel, extra) => Object.assign({ label, accelerator: accel, click: () => send(action) }, extra || {});
  const types = [['Escena', 'scene', 1], ['Acción', 'action', 2], ['Personaje', 'character', 3], ['Paréntesis', 'parenthetical', 4], ['Diálogo', 'dialogue', 5], ['Transición', 'transition', 6], ['Toma', 'shot', 7], ['General (acto)', 'general', 8], ['Nota (no se imprime)', 'note', 9]];
  const presets = [['feature-letter', 'Largometraje (Carta)'], ['feature-a4', 'Largometraje (A4)'], ['tv-hour', 'TV – Drama 1 hora'], ['sitcom', 'Sitcom (interlineado doble)'], ['theatre', 'Teatro']];
  const colors = [['blue', 'Azul'], ['pink', 'Rosa'], ['yellow', 'Amarillo'], ['green', 'Verde'], ['goldenrod', 'Dorado'], ['buff', 'Crema'], ['salmon', 'Salmón'], ['cherry', 'Cereza']];
  const template = [
    { label: 'Archivo', submenu: [
      item('Nuevo', 'new', 'CmdOrCtrl+N'), item('Abrir…', 'open', 'CmdOrCtrl+O'), { type: 'separator' },
      item('Guardar', 'save', 'CmdOrCtrl+S'), item('Guardar como…', 'save-as', 'CmdOrCtrl+Shift+S'), { type: 'separator' },
      { label: 'Importar', submenu: [item('Fountain / Texto…', 'import-text'), item('Final Draft (.fdx)…', 'import-fdx')] },
      { label: 'Exportar', submenu: [item('PDF…', 'export-pdf', 'CmdOrCtrl+P'), item('Fountain…', 'export-fountain'), item('Final Draft (.fdx)…', 'export-fdx'), item('Texto plano…', 'export-txt'), item('HTML…', 'export-html')] },
      { type: 'separator' }, item('Portada y datos…', 'title-page'), item('Marca de agua…', 'watermark'), { type: 'separator' },
      { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ] },
    { label: 'Edición', submenu: [
      item('Deshacer', 'undo', 'CmdOrCtrl+Z'), item('Rehacer', 'redo', process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y'), { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }, { type: 'separator' },
      item('Buscar…', 'find', 'CmdOrCtrl+F'), item('Reemplazar…', 'replace', 'CmdOrCtrl+H'), item('Buscar siguiente', 'find-next', 'F3'), item('Buscar anterior', 'find-prev', 'Shift+F3'), { type: 'separator' },
      item('Preferencias…', 'prefs', 'CmdOrCtrl+,')
    ] },
    { label: 'Formato', submenu: [
      { label: 'Elemento', submenu: types.map(([l, t, n]) => item(l, 'type:' + t, 'CmdOrCtrl+' + n, { type: 'radio', checked: s.currentType === t })) },
      { type: 'separator' },
      item('Negrita', 'bold', 'CmdOrCtrl+B'), item('Cursiva', 'italic', 'CmdOrCtrl+I'), item('Subrayado', 'underline', 'CmdOrCtrl+U'), { type: 'separator' },
      { label: 'Formato de guion', submenu: [...presets.map(([id, l]) => item(l, 'format:' + id, null, { type: 'radio', checked: s.formatId === id })), item('Personalizado', 'format:custom', null, { type: 'radio', checked: s.formatId === 'custom' }), { type: 'separator' }, item('Editar formato…', 'edit-format'), item('Guardar plantilla…', 'save-format'), item('Cargar plantilla…', 'load-format')] },
      { type: 'separator' },
      item('Mostrar números de escena', 'toggle-scene-numbers', null, { type: 'checkbox', checked: !!s.sceneNumbers }),
      item('Bloquear numeración de escenas', 'toggle-lock', null, { type: 'checkbox', checked: !!s.locked }),
      { label: 'Revisiones', submenu: [...colors.map(([c, l]) => item('Iniciar revisión ' + l, 'revision:' + c, null, { type: 'radio', checked: s.revision === c })), { type: 'separator' }, item('Terminar revisión', 'revision:none'), item('Quitar marcas de revisión', 'revision:clear')] },
      { type: 'separator' }, item('Convertir selección a mayúsculas', 'uppercase', 'CmdOrCtrl+Shift+U')
    ] },
    { label: 'Ver', submenu: [
      item('Vista de página', 'view:page', null, { type: 'radio', checked: s.viewMode !== 'draft' }), item('Vista borrador', 'view:draft', null, { type: 'radio', checked: s.viewMode === 'draft' }), { type: 'separator' },
      item('Guion', 'main:script', 'CmdOrCtrl+Alt+1', { type: 'radio', checked: s.mainView !== 'cards' }), item('Fichas (tarjetas)', 'main:cards', 'CmdOrCtrl+Alt+2', { type: 'radio', checked: s.mainView === 'cards' }), { type: 'separator' },
      item('Barra lateral', 'toggle-sidebar', 'CmdOrCtrl+\\', { type: 'checkbox', checked: s.sidebar !== false }),
      item('Modo foco', 'toggle-focus', 'CmdOrCtrl+Shift+F', { type: 'checkbox', checked: !!s.focus }), { type: 'separator' },
      { label: 'Tema', submenu: [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => item(l, 'theme:' + v, null, { type: 'radio', checked: (s.theme || 'system') === v })) },
      item('Alternar claro/oscuro', 'theme-toggle', 'CmdOrCtrl+Shift+L'), { type: 'separator' },
      item('Acercar', 'zoom-in', 'CmdOrCtrl+='), item('Alejar', 'zoom-out', 'CmdOrCtrl+-'), item('Tamaño real', 'zoom-reset', 'CmdOrCtrl+0'), { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Herramientas de desarrollo' }])
    ] },
    { label: 'Herramientas', submenu: [
      { label: 'Asistente IA flotante', accelerator: 'CmdOrCtrl+Shift+A', click: () => openAi() }, { type: 'separator' },
      item('Reporte de personajes…', 'report-characters'), item('Reporte de localizaciones…', 'report-locations'), item('Reporte de escenas…', 'report-scenes'), { type: 'separator' },
      item('Tiempo en pantalla: parámetros…', 'timing-prefs'), item('Estadísticas…', 'stats'), { type: 'separator' },
      item('Autocompletado', 'toggle-autocomplete', null, { type: 'checkbox', checked: s.autocomplete !== false }),
      item('(CONT\'D) automático', 'toggle-contd', null, { type: 'checkbox', checked: s.autoContd !== false }),
      { label: 'Idioma del guion', submenu: [item('Español', 'lang:es', null, { type: 'radio', checked: (s.lang || 'es') === 'es' }), item('English', 'lang:en', null, { type: 'radio', checked: s.lang === 'en' })] },
      { type: 'separator' }, item('Insertar nota', 'insert-note', 'CmdOrCtrl+Alt+N')
    ] },
    { label: 'Ayuda', submenu: [item('Atajos de teclado', 'shortcuts', 'F1'), item('Acerca de Guionista', 'about')] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function scheduleMenu() { clearTimeout(menuTimer); menuTimer = setTimeout(buildMenu, 80); }

// ---------- ventana principal ----------
function hardenSession(ses) {
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['clipboard-sanitized-write', 'fullscreen'].includes(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ['clipboard-sanitized-write', 'fullscreen'].includes(perm));
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600, show: false, title: 'Guionista',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161a' : '#f4f5f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true, webviewTag: false }
  });
  hardenSession(mainWin.webContents.session);
  try { mainWin.webContents.session.setSpellCheckerLanguages(['es-ES', 'en-US']); } catch (e) { /* idioma no disponible */ }
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWin.webContents.on('context-menu', (_e, p) => {
    const tpl = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) tpl.push({ label: s, click: () => mainWin.webContents.replaceMisspelling(s) });
      if (!p.dictionarySuggestions.length) tpl.push({ label: '(sin sugerencias)', enabled: false });
      tpl.push({ label: 'Añadir al diccionario', click: () => mainWin.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
    }
    tpl.push({ role: 'cut', label: 'Cortar', enabled: p.editFlags.canCut }, { role: 'copy', label: 'Copiar', enabled: p.editFlags.canCopy }, { role: 'paste', label: 'Pegar', enabled: p.editFlags.canPaste });
    Menu.buildFromTemplate(tpl).popup();
  });
  mainWin.on('close', (e) => {
    if (allowClose || !dirty) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(mainWin, { type: 'question', buttons: ['Guardar', 'No guardar', 'Cancelar'], defaultId: 0, cancelId: 2, title: 'Guionista', message: 'Hay cambios sin guardar.', detail: '¿Quieres guardarlos antes de salir?' });
    if (r === 0) send('save-then-close');
    else if (r === 1) { allowClose = true; try { fs.unlinkSync(autosavePath()); } catch (e2) { /* nada */ } mainWin.close(); }
  });
  mainWin.on('closed', () => { mainWin = null; if (aiWin && !aiWin.isDestroyed()) aiWin.destroy(); });
}

// ---------- IPC archivos ----------
ipcMain.handle('app:initial-file', (e) => { if (!fromMain(e)) return null; return argFile(process.argv) || null; });
ipcMain.handle('app:system-dark', () => nativeTheme.shouldUseDarkColors);
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('app:set-dirty', (e, v) => { if (fromMain(e)) dirty = !!v; });
ipcMain.on('app:state', (e, s) => { if (fromMain(e) && s && typeof s === 'object') { uiState = s; scheduleMenu(); } });
ipcMain.on('app:set-theme', (e, t) => { if (fromMain(e) && ['system', 'light', 'dark'].includes(t)) nativeTheme.themeSource = t; });
ipcMain.on('app:close-now', (e) => { if (fromMain(e)) { allowClose = true; mainWin.close(); } });
ipcMain.handle('app:confirm', async (e, o) => {
  if (!fromMain(e)) return -1;
  const r = await dialog.showMessageBox(mainWin, { type: 'question', buttons: (o.buttons || ['Aceptar', 'Cancelar']).slice(0, 4).map(String), defaultId: 0, cancelId: (o.buttons || [1, 2]).length - 1, title: 'Guionista', message: String(o.message || ''), detail: String(o.detail || '') });
  return r.response;
});

function readAllowed(file) {
  const ext = path.extname(file).toLowerCase();
  if (!OPEN_EXT.has(ext)) throw new Error('Tipo de archivo no admitido');
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > MAX_FILE) throw new Error('Archivo no válido o demasiado grande');
  return { path: file, name: path.basename(file), ext, data: fs.readFileSync(file, 'utf8') };
}
ipcMain.handle('file:open-dialog', async (e, o) => {
  if (!fromMain(e)) return null;
  const filters = o && o.kind === 'fdx' ? [{ name: 'Final Draft', extensions: ['fdx'] }] : o && o.kind === 'text' ? [{ name: 'Fountain / Texto', extensions: ['fountain', 'txt'] }] : [{ name: 'Guiones', extensions: ['guion', 'fountain', 'fdx', 'txt'] }, { name: 'Todos', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return readAllowed(r.filePaths[0]); } catch (err) { dialog.showErrorBox('No se pudo abrir', String(err.message)); return null; }
});
ipcMain.handle('file:read', (e, f) => { if (!fromMain(e) || typeof f !== 'string') return null; try { return readAllowed(f); } catch (err) { return null; } });
ipcMain.handle('file:save', async (e, o) => {
  if (!fromMain(e) || typeof o.data !== 'string') return null;
  let file = typeof o.path === 'string' && path.extname(o.path).toLowerCase() === '.guion' ? o.path : null;
  if (!file || o.saveAs) {
    const r = await dialog.showSaveDialog(mainWin, { defaultPath: (o.suggestedName || 'Guion') + '.guion', filters: [{ name: 'Guion de Guionista', extensions: ['guion'] }] });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath.toLowerCase().endsWith('.guion') ? r.filePath : r.filePath + '.guion';
  }
  try { atomicWrite(file, o.data); return { path: file, name: path.basename(file) }; } catch (err) { dialog.showErrorBox('No se pudo guardar', String(err.message)); return null; }
});
const EXPORTS = { pdf: ['PDF', 'pdf'], fountain: ['Fountain', 'fountain'], fdx: ['Final Draft', 'fdx'], txt: ['Texto', 'txt'], html: ['HTML', 'html'] };
ipcMain.handle('file:export', async (e, o) => {
  if (!fromMain(e) || !EXPORTS[o.kind] || typeof o.data !== 'string') return null;
  const [name, ext] = EXPORTS[o.kind];
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: (o.suggestedName || 'Guion') + '.' + ext, filters: [{ name, extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  const file = r.filePath.toLowerCase().endsWith('.' + ext) ? r.filePath : r.filePath + '.' + ext;
  try {
    if (o.kind === 'pdf') {
      const tmp = path.join(os.tmpdir(), 'guionista-' + process.pid + '-' + Date.now() + '.html');
      fs.writeFileSync(tmp, o.data);
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
      try {
        await w.loadFile(tmp);
        const pdf = await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { marginType: 'none' } });
        atomicWrite(file, pdf);
      } finally { w.destroy(); try { fs.unlinkSync(tmp); } catch (e2) { /* nada */ } }
    } else atomicWrite(file, o.data);
    return { path: file };
  } catch (err) { dialog.showErrorBox('No se pudo exportar', String(err.message)); return null; }
});
ipcMain.handle('format:save', async (e, o) => {
  if (!fromMain(e) || typeof o.data !== 'string') return null;
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: 'formato.guionformat.json', filters: [{ name: 'Plantilla de formato', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  atomicWrite(r.filePath, o.data); return true;
});
ipcMain.handle('format:load', async (e) => {
  if (!fromMain(e)) return null;
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters: [{ name: 'Plantilla de formato', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  try { const st = fs.statSync(r.filePaths[0]); if (st.size > 1024 * 1024) return null; return fs.readFileSync(r.filePaths[0], 'utf8'); } catch (err) { return null; }
});
ipcMain.handle('autosave:write', (e, data) => { if (fromMain(e) && typeof data === 'string') { try { atomicWrite(autosavePath(), data); return true; } catch (err) { return false; } } return false; });
ipcMain.handle('autosave:read', (e) => { if (!fromMain(e)) return null; try { return fs.readFileSync(autosavePath(), 'utf8'); } catch (err) { return null; } });
ipcMain.handle('autosave:clear', (e) => { if (fromMain(e)) { try { fs.unlinkSync(autosavePath()); } catch (err) { /* nada */ } } return true; });

// ---------- Asistente IA flotante ----------
const PROVIDERS = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', hosts: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com', 'google.com', 'accounts.google.com', 'appleid.apple.com', 'apple.com', 'microsoftonline.com', 'live.com', 'microsoft.com'] },
  claude: { name: 'Claude', url: 'https://claude.ai/', hosts: ['claude.ai', 'anthropic.com', 'google.com', 'accounts.google.com'] },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', hosts: ['gemini.google.com', 'google.com', 'gstatic.com', 'googleusercontent.com', 'accounts.google.com'] }
};
const TOP = 96;
const views = {};
let activeProvider = 'claude';
let pinned = true;

const hostAllowed = (url, p) => { try { const u = new URL(url); if (u.protocol !== 'https:') return false; return PROVIDERS[p].hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)); } catch (e) { return false; } };

function layoutAi() {
  if (!aiWin || aiWin.isDestroyed()) return;
  const [w, h] = aiWin.getContentSize();
  for (const [id, v] of Object.entries(views)) { v.setBounds(id === activeProvider ? { x: 0, y: TOP, width: w, height: Math.max(0, h - TOP) } : { x: 0, y: 0, width: 0, height: 0 }); v.setVisible(id === activeProvider); }
}
function getView(p) {
  if (views[p]) return views[p];
  const ses = session.fromPartition('persist:ai-' + p);
  hardenSession(ses);
  const v = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const wc = v.webContents;
  wc.setUserAgent(wc.session.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\sguionista\/\S+/i, ''));
  wc.setWindowOpenHandler(({ url }) => {
    if (hostAllowed(url, p)) { wc.loadURL(url); } else if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => { if (!hostAllowed(url, p)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  wc.on('will-redirect', (e, url) => { if (!hostAllowed(url, p)) { e.preventDefault(); } });
  wc.on('did-navigate', () => pushAiState());
  wc.on('did-navigate-in-page', () => pushAiState());
  wc.on('did-fail-load', (_e, code, desc, _u, isMain) => { if (isMain && code !== -3) wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="font-family:system-ui;padding:32px;background:#1b1d22;color:#ddd"><h3>No se pudo cargar ${PROVIDERS[p].name}</h3><p>${desc}</p><p>Comprueba tu conexión y usa «Recargar».</p></body>`)); });
  aiWin.contentView.addChildView(v);
  views[p] = v;
  wc.loadURL(PROVIDERS[p].url);
  return v;
}
function pushAiState() {
  if (!aiWin || aiWin.isDestroyed()) return;
  const v = views[activeProvider];
  aiWin.webContents.send('ai:state', { provider: activeProvider, pinned, canBack: v ? v.webContents.navigationHistory.canGoBack() : false, canForward: v ? v.webContents.navigationHistory.canGoForward() : false });
}
function openAi() {
  if (aiWin && !aiWin.isDestroyed()) { aiWin.show(); aiWin.focus(); return; }
  aiWin = new BrowserWindow({
    width: 460, height: 740, minWidth: 340, minHeight: 420, title: 'Asistente IA', alwaysOnTop: pinned, autoHideMenuBar: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161a' : '#f4f5f7',
    webPreferences: { preload: path.join(__dirname, 'ai-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  aiWin.setMenuBarVisibility(false);
  if (mainWin) { const b = mainWin.getBounds(); aiWin.setPosition(Math.max(0, b.x + b.width - 480), b.y + 60); }
  aiWin.loadFile(path.join(__dirname, 'src', 'ai.html'));
  aiWin.webContents.on('will-navigate', (e) => e.preventDefault());
  aiWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  aiWin.once('ready-to-show', () => { aiWin.show(); getView(activeProvider); layoutAi(); pushAiState(); });
  aiWin.on('resize', layoutAi);
  aiWin.on('closed', () => { for (const k of Object.keys(views)) delete views[k]; aiWin = null; });
}
const fromAi = (e) => aiWin && !aiWin.isDestroyed() && e.sender === aiWin.webContents;
ipcMain.on('ai:open', (e) => { if (fromMain(e)) openAi(); });
ipcMain.on('ai:select', (e, p) => { if (!fromAi(e) || !PROVIDERS[p]) return; activeProvider = p; getView(p); layoutAi(); pushAiState(); });
ipcMain.on('ai:external', (e) => { if (!fromAi(e)) return; const v = views[activeProvider]; const u = v ? v.webContents.getURL() : PROVIDERS[activeProvider].url; shell.openExternal(/^https:\/\//.test(u) ? u : PROVIDERS[activeProvider].url); });
ipcMain.on('ai:nav', (e, a) => { if (!fromAi(e)) return; const v = views[activeProvider]; if (!v) return; const wc = v.webContents; if (a === 'back') wc.navigationHistory.goBack(); else if (a === 'forward') wc.navigationHistory.goForward(); else if (a === 'reload') wc.reload(); else if (a === 'home') wc.loadURL(PROVIDERS[activeProvider].url); });
ipcMain.handle('ai:pin', (e) => { if (!fromAi(e)) return pinned; pinned = !pinned; aiWin.setAlwaysOnTop(pinned); pushAiState(); return pinned; });
const PROMPTS = {
  feedback: 'Actúa como un script doctor profesional. Dame feedback concreto y accionable sobre este fragmento de guion (ritmo, conflicto, claridad visual, diálogo). Sé breve y prioriza:',
  dialogue: 'Mejora los diálogos de este fragmento: hazlos más naturales, con subtexto y voces diferenciadas. Propón alternativas sin cambiar la intención:',
  format: 'Revisa este fragmento: errores de formato de guion, continuidad, ortografía y consistencia de nombres/lugares:',
  logline: 'Escribe tres opciones de logline y una sinopsis de un párrafo a partir de este material:',
  free: ''
};
ipcMain.handle('ai:send', async (e, o) => {
  if (!fromAi(e) || !o) return { ok: false };
  const v = views[activeProvider];
  if (!v) return { ok: false };
  const scope = ['selection', 'scene', 'script', 'none'].includes(o.scope) ? o.scope : 'selection';
  const ctx = scope === 'none' ? '' : await askRenderer('context', scope);
  if (scope !== 'none' && !ctx) return { ok: false, reason: scope === 'selection' ? 'No hay texto seleccionado.' : 'No hay texto para enviar.' };
  const head = Object.prototype.hasOwnProperty.call(PROMPTS, o.template) ? PROMPTS[o.template] : '';
  const text = (head ? head + '\n\n' : '') + (ctx ? '"""\n' + String(ctx).slice(0, 30000) + '\n"""' : '');
  clipboard.writeText(text);
  v.webContents.focus();
  v.webContents.paste();
  return { ok: true, chars: text.length };
});
ipcMain.handle('ai:insert-note', async (e) => {
  if (!fromAi(e)) return { ok: false };
  const v = views[activeProvider];
  if (!v) return { ok: false };
  let sel = '';
  try { sel = String(await v.webContents.executeJavaScript('String(window.getSelection())')); } catch (err) { sel = ''; }
  sel = sel.trim().slice(0, 5000);
  if (!sel) return { ok: false, reason: 'Selecciona texto en la respuesta de la IA primero.' };
  send('insert-note', sel);
  return { ok: true };
});

// ---------- arranque ----------
app.whenReady().then(() => {
  if (!gotLock) return;
  app.setName('Guionista');
  buildMenu();
  createMain();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
});
app.on('window-all-closed', () => app.quit());
