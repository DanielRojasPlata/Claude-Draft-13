"use strict";
const { app, BrowserWindow, WebContentsView, dialog, ipcMain, Menu, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "server");
const TOKEN = crypto.randomBytes(24).toString("hex");
const ID = /^[A-Za-z0-9-]{1,64}$/;
let server = null, port = 0, quitting = false, logFile = null;
const restarts = [];
/** every editor / welcome window: each one is its own taskbar entry */
const wins = new Set();
let lastFocused = null;
const T0 = Date.now();

/** Everything that happens during startup goes to GuionistaData/guionista.log, so a failed launch is never silent. */
function log(msg) {
  const line = `${new Date().toISOString()} +${Date.now() - T0}ms ${msg}\n`;
  try { if (logFile) fs.appendFileSync(logFile, line); } catch { /* logging must never break the app */ }
}
function fatal(title, err) {
  const text = String((err && err.stack) || err);
  log(`FATAL ${title}: ${text}`);
  try { dialog.showErrorBox(title, `${text.slice(0, 1200)}\n\nDetails were saved to:\n${logFile || "(no log file)"}`); } catch { /* ignore */ }
}
// Once the app is running, a stray error must never close it: the writer may have unsaved work in the windows. It is logged and the app carries on.
let started = false, shownErr = 0;
function survive(e) {
  log(`ERROR (ignored, the app keeps running): ${String((e && e.stack) || e)}`);
  if (!started) { fatal("Guionista hit an unexpected error", e); app.exit(1); return; }
  if (shownErr++ < 1) { try { dialog.showErrorBox("Guionista hit a minor error", `${String((e && e.message) || e).slice(0, 600)}\n\nYour scripts are saved automatically and Guionista keeps running. Details: ${logFile || "(no log)"}`); } catch { /* ignore */ } }
}
process.on("uncaughtException", survive);
process.on("unhandledRejection", survive);
const origin = () => `http://127.0.0.1:${port}`;

/** Portable: keep scripts next to the exe. Falls back to the user profile when that folder is read-only. */
function dataDir() {
  if (process.env.GUIONISTA_DATA) return process.env.GUIONISTA_DATA;
  const base = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath("exe"));
  const candidates = app.isPackaged ? [path.join(base, "GuionistaData"), path.join(app.getPath("userData"), "GuionistaData")] : [path.join(__dirname, "GuionistaData")];
  for (const c of candidates) {
    try { fs.mkdirSync(c, { recursive: true }); fs.accessSync(c, fs.constants.W_OK); return c; } catch { /* try the next location */ }
  }
  return path.join(app.getPath("userData"), "GuionistaData");
}

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const ping = () => new Promise((res) => { const r = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (m) => { m.resume(); res(m.statusCode === 200); }); r.on("error", () => res(false)); r.on("timeout", () => { r.destroy(); res(false); }); });

async function startServer() {
  port = await freePort();
  const dir = dataDir();
  try { logFile = path.join(dir, "guionista.log"); if (fs.existsSync(logFile) && fs.statSync(logFile).size > 512 * 1024) fs.renameSync(logFile, logFile + ".old"); } catch { logFile = null; }
  log(`start v${app.getVersion()} packaged=${app.isPackaged} exe=${app.getPath("exe")} server=${APP_DIR} data=${dir} port=${port}`);
  if (!fs.existsSync(path.join(APP_DIR, "server.js"))) throw new Error(`The editor engine files are missing:\n${APP_DIR}\n\nThe .exe may have been extracted incompletely (a path that is too long, or antivirus removing files). Move it to a short folder like C:\\Guionista and try again.`);
  const launch = () => {
  server = spawn(process.execPath, [path.join(APP_DIR, "boot.cjs")], {
    cwd: APP_DIR, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", GUIONISTA_DESKTOP: "1", GUIONISTA_DATA: dir, GUIONISTA_TOKEN: TOKEN, NEXT_TELEMETRY_DISABLED: "1", GUIONISTA_PARENT_PID: String(process.pid), AUTH_SECRET: TOKEN, AUTH_TRUST_HOST: "true" },
  });
  let out = "";
  const keep = (d) => { out = (out + d).slice(-4000); log(`server: ${String(d).trim().slice(0, 500)}`); };
  server.stdout.on("data", keep); server.stderr.on("data", keep);
  server.on("error", (e) => log(`server spawn error: ${e.message}`));
  server.on("exit", (code) => {
    log(`server exited code=${code}`); server = null;
    if (quitting || !started) return;
    // The windows keep their text and retry saving every few seconds; the engine is started again on the same port so nothing is lost.
    restarts.push(Date.now()); while (restarts.length && Date.now() - restarts[0] > 120000) restarts.shift();
    if (restarts.length > 5) { fatal("Guionista stopped", `The editor engine keeps stopping (code ${code}).\n\n${out.slice(-800)}\n\nYour scripts are saved in:\n${dataDir()}`); return; }
    log("restarting the editor engine"); setTimeout(() => { if (!quitting) launch(); }, 500);
  });
  };
  launch();
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (await ping()) { log(`server ready after ${Date.now() - t0}ms`); return; } if (!server) throw new Error("The editor engine exited during startup:\n" + out.slice(-800)); await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("The editor engine did not start within 60 seconds.\n" + out.slice(-800));
}

function splash() {
  const w = new BrowserWindow({ width: 420, height: 220, frame: false, resizable: false, show: true, backgroundColor: "#14161b", webPreferences: { sandbox: true } });
  w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#14161b;color:#e8b04a;font:700 15px 'Courier New',monospace;letter-spacing:.06em"><div>INT. GUIONISTA - DAY</div><div style="margin-top:14px;color:#8b8f99;font-weight:400;font-size:12px">Opening your scripts…</div></body>`));
  return w;
}

function lockdown(wc) {
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (!url.startsWith(origin())) { e.preventDefault(); if (/^https:\/\//.test(url)) void shell.openExternal(url); } });
}

const pathOf = (w) => { try { return new URL(w.webContents.getURL()).pathname; } catch { return ""; } };
const appWin = (e) => { const w = BrowserWindow.fromWebContents(e.sender); return w && wins.has(w) ? w : null; };

/** Opens a window on one of the app's own pages ("/" is the welcome page, "/scripts/<id>" an editor). */
async function openWindow(pathname, from) {
  const b = from && !from.isDestroyed() ? from.getBounds() : null;
  const maxed = !b || from.isMaximized();
  const w = new BrowserWindow({
    width: b ? b.width : 1440, height: b ? b.height : 900, ...(b && !maxed ? { x: b.x + 32, y: b.y + 32 } : {}),
    minWidth: 720, minHeight: 520, show: false, backgroundColor: "#e9e6e1", title: "Guionista", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  wins.add(w); lastFocused = w;
  lockdown(w.webContents);
  w.on("focus", () => { lastFocused = w; });
  w.webContents.on("did-fail-load", (_e, code, desc, url, isMain) => { log(`did-fail-load ${code} ${desc} ${url}`); if (isMain) fatal("Guionista could not open the editor", `${desc} (${code})`); });
  let crashes = [];
  w.webContents.on("render-process-gone", (_e, d) => {
    log(`render-process-gone ${d.reason}`); if (quitting || d.reason === "clean-exit" || w.isDestroyed()) return;
    // the script was saved a moment ago (autosave): bring the window back from the saved copy instead of leaving it dead
    crashes = crashes.filter((t) => Date.now() - t < 60000); crashes.push(Date.now());
    if (crashes.length > 3) { fatal("The editor window keeps crashing", `${d.reason}\n\nYour scripts are saved in:\n${dataDir()}`); return; }
    setTimeout(() => { if (!w.isDestroyed()) w.webContents.reload(); }, 300);
  });
  w.webContents.on("unresponsive", () => log("window unresponsive"));
  w.webContents.on("responsive", () => log("window responsive again"));
  // closing a window: let the editor finish saving first (the last keystrokes are still in memory for up to a second)
  let closing = false;
  w.on("close", (e) => {
    if (closing || quitting) return;
    closing = true; e.preventDefault();
    const finish = () => { closing = true; if (!w.isDestroyed()) w.destroy(); };
    const ask = w.webContents.isDestroyed() || w.webContents.isCrashed() ? Promise.resolve(true)
      : Promise.race([w.webContents.executeJavaScript("window.__guionistaFlush ? window.__guionistaFlush() : true").catch(() => false), new Promise((r) => setTimeout(() => r(null), 8000))]);
    ask.then((ok) => {
      if (ok === false || ok === null) {
        const pick = dialog.showMessageBoxSync(w, { type: "warning", buttons: ["Keep writing", "Close anyway"], defaultId: 0, cancelId: 0, title: "Guionista", message: "Your latest changes could not be saved yet.", detail: ok === null ? "Saving is taking longer than expected." : "Guionista could not reach its saving engine." });
        if (pick === 0) { closing = false; return; }
      }
      finish();
    }).catch(finish);
  });
  w.on("closed", () => { wins.delete(w); disposeAi(w); if (lastFocused === w) lastFocused = [...wins][0] || null; });
  await w.loadURL(origin() + pathname);
  log(`window loaded ${pathname}`);
  if (maxed) w.maximize();
  w.show();
  return w;
}
async function createWindow() {
  await session.defaultSession.cookies.set({ url: origin(), name: "gt", value: TOKEN, httpOnly: true, sameSite: "strict" });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(wc.getURL().startsWith(origin()) && (permission === "clipboard-read" || permission === "clipboard-sanitized-write")));
  await openWindow("/", null);
}

// ---------- the writing assistant: the free web versions of Claude, ChatGPT and Gemini, shown inside the window ----------
const AI = { claude: "https://claude.ai/new", chatgpt: "https://chatgpt.com/", gemini: "https://gemini.google.com/app" };
const aiState = new Map(); // window -> { views: Map(provider -> WebContentsView), cur }
let aiSession = null;
function aiSess() {
  if (aiSession) return aiSession;
  aiSession = session.fromPartition("persist:guionista-ai"); // keeps the writer signed in between launches
  // present as a regular Chrome: the sites' sign-in pages reject unknown shells
  aiSession.setUserAgent(app.userAgentFallback.replace(/\s*Electron\/\S+/, "").replace(/\s*guionista-desktop\/\S+/i, "").replace(/\s*Guionista\/\S+/i, ""));
  aiSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write"));
  return aiSession;
}
function lockAi(wc) {
  wc.setWindowOpenHandler(({ url }) => (/^https:\/\//.test(url)
    ? { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 740, autoHideMenuBar: true, title: "Sign in", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } } // sign-in pop-ups
    : { action: "deny" }));
  wc.on("will-navigate", (e, url) => { if (!/^https:\/\//.test(url)) e.preventDefault(); });
  wc.on("did-create-window", (child) => { child.setMenuBarVisibility(false); lockAi(child.webContents); });
}
function aiViewFor(w, provider) {
  let st = aiState.get(w); if (!st) aiState.set(w, (st = { views: new Map(), cur: null }));
  let v = st.views.get(provider);
  if (!v) {
    v = new WebContentsView({ webPreferences: { session: aiSess(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    lockAi(v.webContents);
    void v.webContents.loadURL(AI[provider]).catch((err) => log(`ai load ${provider}: ${err.message}`));
    st.views.set(provider, v);
  }
  return v;
}
function disposeAi(w) {
  const st = aiState.get(w); if (!st) return;
  for (const v of st.views.values()) { try { if (!w.isDestroyed()) w.contentView.removeChildView(v); v.webContents.close(); } catch { /* already gone */ } }
  aiState.delete(w);
}
const num = (n) => typeof n === "number" && Number.isFinite(n);
ipcMain.handle("ai:show", (e, provider, b) => {
  const w = appWin(e); if (!w || !AI[provider] || !b || !num(b.x) || !num(b.y) || !num(b.width) || !num(b.height)) return false;
  const v = aiViewFor(w, provider); const st = aiState.get(w);
  if (st.cur && st.cur !== v) st.cur.setVisible(false);
  if (!w.contentView.children.includes(v)) w.contentView.addChildView(v);
  v.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(0, Math.round(b.width)), height: Math.max(0, Math.round(b.height)) });
  v.setVisible(true); st.cur = v; return true;
});
ipcMain.handle("ai:hide", (e) => { const w = appWin(e); const st = w && aiState.get(w); if (st && st.cur) st.cur.setVisible(false); return true; });
ipcMain.handle("ai:reload", (e, provider) => { const w = appWin(e); const v = w && aiState.get(w)?.views.get(provider); if (v) v.webContents.loadURL(AI[provider]); return !!v; });
ipcMain.handle("ai:paste", (e) => { const w = appWin(e); const v = w && aiState.get(w)?.cur; if (!v) return false; v.webContents.focus(); v.webContents.paste(); return true; });
ipcMain.handle("ai:external", (e, provider) => { if (appWin(e) && AI[provider]) void shell.openExternal(AI[provider]); return true; });

// ---------- several scripts at once: each opens in its own window ----------
ipcMain.handle("win:openScript", async (e, id, inNew) => {
  const from = appWin(e); if (!from || !ID.test(String(id))) return { handled: false };
  const target = `/scripts/${id}`;
  for (const w of wins) if (!w.isDestroyed() && pathOf(w) === target) { if (w.isMinimized()) w.restore(); w.focus(); return { handled: true, focused: true }; }
  if (inNew) { await openWindow(target, from); return { handled: true }; }
  return { handled: false };
});
ipcMain.handle("win:welcome", async (e) => {
  const from = appWin(e); if (!from) return false;
  for (const w of wins) if (!w.isDestroyed() && pathOf(w) === "/") { if (w.isMinimized()) w.restore(); w.focus(); return true; }
  await openWindow("/", from); return true;
});

/** Renders /print/:id with the app's own engine into a hidden window and returns it once fonts are loaded. */
async function printWindow(id) {
  if (!ID.test(id)) throw new Error("bad id");
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  lockdown(w.webContents);
  await w.loadURL(`${origin()}/print/${id}`);
  await w.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  return w;
}

// ---------- .fdx files: scripts are saved as Final Draft XML in a folder the writer chooses ----------
const SETTINGS = () => path.join(app.getPath("userData"), "settings.json");
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS(), "utf8")); } catch { return {}; } }
function writeSettings(patch) { try { fs.mkdirSync(path.dirname(SETTINGS()), { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify({ ...readSettings(), ...patch })); } catch { /* settings are best effort */ } }
const defaultFolder = () => process.env.GUIONISTA_DOCS || path.join(app.getPath("documents"), "Guionista");
const scriptsFolder = () => { const f = readSettings().scriptsFolder; return typeof f === "string" && path.isAbsolute(f) ? f : defaultFolder(); };
const norm = (p) => path.resolve(p).toLowerCase();
const known = () => new Set((readSettings().known || []).map(norm));
function remember(p) { const k = readSettings().known || []; if (!k.map(norm).includes(norm(p))) writeSettings({ known: [...k, path.resolve(p)].slice(-500) }); }
const safeName = (t) => (String(t).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().replace(/\s+/g, " ").slice(0, 80) || "Script");
/** A path may be written when it is a .fdx the writer picked in a dialog (now or before), or lives inside the scripts folder. */
function writable(p) {
  if (typeof p !== "string" || !path.isAbsolute(p) || !/\.fdx$/i.test(p) || p.length > 600) return false;
  const inFolder = norm(p).startsWith(norm(scriptsFolder()) + path.sep.toLowerCase());
  return inFolder || known().has(norm(p));
}
function uniquePath(dir, name) {
  let p = path.join(dir, `${name}.fdx`), n = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${name} (${n++}).fdx`);
  return p;
}
function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`; fs.writeFileSync(tmp, text, "utf8"); fs.renameSync(tmp, p);
}
const fromWin = (e) => !!appWin(e);

ipcMain.handle("fdx:save", (e, o) => {
  if (!fromWin(e) || !o || typeof o.xml !== "string" || o.xml.length > 30e6) return { ok: false, error: "bad request" };
  try {
    let p = o.path;
    if (p) { if (!writable(p)) return { ok: false, error: "That file is not in your scripts folder." }; }
    else p = uniquePath(scriptsFolder(), safeName(o.title));
    writeAtomic(p, o.xml); remember(p);
    return { ok: true, path: p };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle("fdx:saveAs", async (e, o) => {
  if (!fromWin(e) || !o || typeof o.xml !== "string" || o.xml.length > 30e6) return { ok: false, error: "bad request" };
  try {
    fs.mkdirSync(scriptsFolder(), { recursive: true });
    const r = await dialog.showSaveDialog(appWin(e), { title: "Save script as Final Draft (.fdx)", defaultPath: path.join(scriptsFolder(), `${safeName(o.title)}.fdx`), filters: [{ name: "Final Draft", extensions: ["fdx"] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const p = /\.fdx$/i.test(r.filePath) ? r.filePath : r.filePath + ".fdx";
    writeAtomic(p, o.xml); remember(p);
    return { ok: true, path: p };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle("fdx:chooseFolder", async (e) => {
  if (!fromWin(e)) return { ok: false };
  const r = await dialog.showOpenDialog(appWin(e), { title: "Choose the folder for your scripts", defaultPath: scriptsFolder(), properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  writeSettings({ scriptsFolder: r.filePaths[0] });
  return { ok: true, folder: r.filePaths[0] };
});
ipcMain.handle("fdx:folder", (e) => (fromWin(e) ? { folder: scriptsFolder() } : { folder: "" }));
ipcMain.handle("fdx:reveal", (e, p) => { if (fromWin(e) && typeof p === "string" && fs.existsSync(p)) { shell.showItemInFolder(p); return true; } return false; });
ipcMain.handle("fdx:openFile", async (e) => {
  if (!fromWin(e)) return { ok: false };
  const r = await dialog.showOpenDialog(appWin(e), { title: "Open a screenplay", defaultPath: scriptsFolder(), properties: ["openFile"], filters: [{ name: "Screenplays", extensions: ["fdx", "fountain", "txt", "json"] }, { name: "All files", extensions: ["*"] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  try {
    const p = r.filePaths[0]; const st = fs.statSync(p);
    if (st.size > 12e6) return { ok: false, error: "That file is larger than 12 MB." };
    if (/\.fdx$/i.test(p)) remember(p); // opening a .fdx links the script to it, so Save writes back to the same file
    return { ok: true, path: p, name: path.basename(p), text: fs.readFileSync(p, "utf8") };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

ipcMain.handle("win:fullscreen", (e, on) => {
  const w = appWin(e); if (!w) return false;
  w.setFullScreen(!!on); return true;
});

ipcMain.handle("pdf:export", async (e, id, title) => {
  const owner = appWin(e); if (!owner) return { ok: false, error: "forbidden" };
  let w;
  try {
    w = await printWindow(id);
    const data = await w.webContents.printToPDF({ pageSize: "Letter", printBackground: true, margins: { marginType: "none" }, preferCSSPageSize: true });
    const safe = String(title).replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "script";
    const r = await dialog.showSaveDialog(owner, { title: "Save as PDF", defaultPath: `${safe}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, data);
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; } finally { if (w) w.destroy(); }
});

ipcMain.handle("pdf:print", async (e, id) => {
  if (!appWin(e)) return { ok: false };
  let w;
  try {
    w = await printWindow(id);
    await new Promise((res) => w.webContents.print({ silent: false, printBackground: true, margins: { marginType: "none" } }, () => res()));
    return { ok: true };
  } catch { return { ok: false }; } finally { if (w) w.destroy(); }
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const w = lastFocused && !lastFocused.isDestroyed() ? lastFocused : [...wins][0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  // quitting (Alt+F4 on the last window, the OS shutting down): the windows are closed through the save handshake above, then the engine is stopped
  let flushing = false;
  app.on("before-quit", (e) => {
    if (quitting) return;
    const open = [...wins].filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed() && !w.webContents.isCrashed());
    if (!open.length) { quitting = true; return; }
    e.preventDefault(); if (flushing) return; flushing = true;
    const one = (w) => Promise.race([w.webContents.executeJavaScript("window.__guionistaFlush ? window.__guionistaFlush() : true").catch(() => false), new Promise((r) => setTimeout(() => r(null), 6000))]);
    Promise.all(open.map(one)).then((r) => { log(`flush before quit: ${JSON.stringify(r)}`); }, () => undefined).finally(() => { quitting = true; app.quit(); });
  });
  app.on("will-quit", () => { if (server) { try { server.kill(); } catch { /* already gone */ } } });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const sp = splash();
    const slow = setTimeout(() => { if (!sp.isDestroyed()) void sp.webContents.executeJavaScript(`document.querySelector('div+div').textContent='Still starting. The first launch can take a moment…'`).catch(() => undefined); }, 8000);
    try { await startServer(); started = true; await createWindow(); }
    catch (err) { fatal("Guionista could not start", err); app.quit(); }
    finally { clearTimeout(slow); if (!sp.isDestroyed()) sp.destroy(); }
  });
}
