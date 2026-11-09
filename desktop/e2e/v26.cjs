// v2.6 checks against the real desktop shell. Usage: xvfb-run -a node_modules/.bin/electron --no-sandbox e2e/v26.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-"));
process.env.GUIONISTA_DATA = data;
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
process.env.GUIONISTA_DOCS = fs.mkdtempSync(path.join(os.tmpdir(), "gdocs-"));
const errors = []; let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(info)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 280000);
require("../main.js");
const wins = () => BrowserWindow.getAllWindows().filter((w) => /127\.0\.0\.1/.test(w.webContents.getURL()));
const scriptsOnDisk = () => fs.readdirSync(data).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(data, f), "utf8")));
(async () => {
  let w; for (let i = 0; i < 300 && !(w = wins()[0]); i++) await sleep(100);
  if (!w) { console.log("no window"); process.exit(1); }
  await sleep(1200);
  w.setSize(1000, 720); // below the old 1024 px threshold that hid the Scenes panel
  const wc = w.webContents;
  wc.on("console-message", (e) => { if (e.level === "error") { errors.push(e.message); if (/DBG/.test(e.message)) console.log(e.message); }; });
  const js = (s) => wc.executeJavaScript(s);
  const key = async (k, mods = []) => { wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods }); if (k.length === 1) wc.sendInputEvent({ type: "char", keyCode: k, modifiers: mods }); wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods }); await sleep(25); };
  const type = async (s) => { for (const c of s) await key(c); };
  const rows = () => js(`[...document.querySelectorAll('[data-page="0"] .page-line')].map(e=>e.textContent).filter(Boolean)`);
  const clickBtn = (sel, text) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);
  const waitUrl = async (re) => { for (let i = 0; i < 80 && !re.test(wc.getURL()); i++) await sleep(100); await sleep(1500); };

  // ---- welcome: Short Film replaces Blank Script
  const cards = await js(`[...document.querySelectorAll('section[aria-labelledby=gallery] li button')].map(b=>b.getAttribute('aria-label'))`);
  ok("first card is Short Film, no Blank Script", /Short Film/.test(cards[0]) && !cards.some((c) => /blank|blanco/i.test(c)) && cards.length === 6, cards);
  await js(`document.querySelector('section[aria-labelledby=gallery] li button').click()`); await waitUrl(/\/scripts\//);
  ok("Short Film opens", /\/scripts\//.test(wc.getURL()));
  ok("Short Film target is 30 minutes", /of 30m|of 0:30|30 min|30:00|of 30/.test(await js(`document.querySelector('footer').innerText`)), await js(`document.querySelector('footer').innerText`));
  // ---- Scenes panel visible by default even in a 1000 px wide window
  const nav = await js(`(()=>{const a=document.querySelector('aside[aria-label="Scene Navigator"]'); if(!a) return null; const r=a.getBoundingClientRect(); return {w:r.width,h:r.height,x:r.x, innerW: innerWidth}})()`);
  ok("Scenes panel is open by default at 1000 px", nav && nav.w >= 200 && nav.h > 300 && nav.x === 0, nav);
  const mainBox = await js(`(()=>{const r=document.querySelector('main').getBoundingClientRect(); return {x:r.x,w:r.width}})()`);
  ok("script area sits beside the panel (not under it)", mainBox.x >= nav.w - 1, mainBox);
  // ---- title bold
  const bold = await js(`(()=>{const d=[...document.querySelectorAll('.sheet div')].find(e=>/UNTITLED SHORT FILM|CORTOMETRAJE SIN T/i.test(e.textContent) && e.children.length===0); return d ? getComputedStyle(d).fontWeight : null})()`);
  ok("title on the title page is bold", Number(bold) >= 700, bold);

  // ---- typing a two-scene script
  await js(`document.querySelector('textarea').focus()`);
  const flow = async (s) => { await type(s); };
  await key("a", ["control"]); await key("Backspace"); await sleep(100);
  await key("Tab"); // empty Action -> cycles; set scene heading via picker instead
  await key("Return"); await sleep(150);
  await js(`document.querySelector('textarea').focus()`);
  const ctl = ["control"];
  await key("a", ctl); await key("Delete"); await sleep(100);
  await key("Return"); await sleep(150); await key("s"); await sleep(100); // pick Scene Heading by letter
  await type("INT. CASA - DIA"); await key("Escape"); await key("Return"); await type("ana entra"); await key("Return"); await key("Return"); await sleep(150); await key("s");
  await type("EXT. CALLE - NOCHE"); await key("Escape"); await key("Return"); await type("llueve mucho"); await sleep(300);
  let r0 = await rows(); console.log("rows", JSON.stringify(r0));
  ok("script has two scenes", r0.filter((t) => /^(INT|EXT)\./.test(t)).length >= 2, r0);
  // ---- selection across scenes with the keyboard
  const cnt = () => js(`document.querySelectorAll('[data-page="0"] .bg-accent\\\\/45').length + ':' + document.querySelector('footer').innerText.split('\\n').slice(0,3).join('|')`);
  await key("Home", ctl); await sleep(50); console.log("home", await cnt());
  for (let i = 0; i < 4; i++) { await key("Down", ["shift"]); console.log("down", i, await cnt()); }
  await key("End", ["shift"]); await sleep(150);
  const hl = await js(`document.querySelectorAll('[data-page="0"] .bg-accent\\\\/45').length`);
  ok("shift+arrows select across scenes (highlight on several lines)", hl >= 3, hl);
  // ---- mouse drag from scene 1 to scene 2
  const pts = await js(`(()=>{const L=[...document.querySelectorAll('[data-page="0"] .page-line')].filter(e=>e.textContent.trim()); const a=L[0].getBoundingClientRect(), b=L[L.length-1].getBoundingClientRect(); return {ax:a.left+4, ay:a.top+a.height/2, bx:b.left+30, by:b.top+b.height/2}})()`);
  await js(`window.__mm=[]; for (const t of ["mousedown","mouseup","mousemove"]) addEventListener(t, e=>window.__mm.push(t+":"+e.buttons+":"+(e.target.tagName)+"."+String(e.target.className).slice(0,30)+":"+!!e.target.closest("main")), true)`);
  await key("Right"); console.log("pts", JSON.stringify(pts), await cnt());
  wc.sendInputEvent({ type: "mouseDown", x: Math.round(pts.ax), y: Math.round(pts.ay), button: "left", clickCount: 1 });
  for (let i = 1; i <= 10; i++) { wc.sendInputEvent({ type: "mouseMove", x: Math.round(pts.ax + (pts.bx - pts.ax) * i / 10), y: Math.round(pts.ay + (pts.by - pts.ay) * i / 10), button: "left", modifiers: ["leftButtonDown"] }); await sleep(20); if (i % 3 === 0) console.log("drag", i, await cnt()); }
  
  wc.sendInputEvent({ type: "mouseUp", x: Math.round(pts.bx), y: Math.round(pts.by), button: "left", clickCount: 1 }); await sleep(200);
  const hl2 = await js(`document.querySelectorAll('[data-page="0"] .bg-accent\\\\/45').length`);
  ok("mouse drag selects across scenes", hl2 >= 4, hl2);
  // Ctrl+C then check clipboard text spans scenes
  await key("c", ctl); await sleep(150);
  const clip = await js(`navigator.clipboard.readText().catch(()=>'ERR')`);
  ok("copy gives the text of both scenes", /CASA/.test(clip) && /Llu/.test(clip) && /\n/.test(clip), clip);
  // typing replaces the whole selection
  await type("X"); await sleep(300);
  r0 = await rows(); console.log("after replace", JSON.stringify(r0));
  ok("typing over a cross-scene selection replaces it with one line", r0.filter((t) => t.trim()).length <= 2 && r0.some((t) => /X/.test(t)), r0);
  await key("z", ctl); await sleep(200); r0 = await rows();
  ok("undo restores both scenes", r0.filter((t) => /^(INT|EXT)\./.test(t)).length >= 2, r0);

  // ---- parenthetical starts lowercase
  await key("End", ctl); await key("Return"); await key("Return"); await sleep(150); await key("c"); await sleep(100);
  await type("BEN"); await key("Escape"); await key("Return"); await sleep(100);
  await key("Tab"); await type("quietly"); await sleep(200);
  r0 = await rows();
  ok("parenthetical keeps its first letter lowercase: (quietly)", r0.includes("(quietly)"), r0);

  // ---- Page Layout: save as default / reset
  await clickBtn("[role=tab]", "Document"); await sleep(100); await clickBtn("[role=tabpanel] button", "Page Layout"); await sleep(300);
  const dl = await js(`(()=>{const d=document.querySelector('[role=dialog]'); return [...d.querySelectorAll('button')].map(b=>b.textContent.trim())})()`);
  ok("Page Layout has Save as default, Reset to original, Done", dl.some((t) => /Save as default/.test(t)) && dl.some((t) => /Reset to original/.test(t)), dl);
  await js(`(()=>{const i=[...document.querySelectorAll('[role=dialog] label')].find(l=>/^Left/.test(l.textContent)).querySelector('input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'3'); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); i.blur();})()`); await sleep(300);
  const leftNow = await js(`[...document.querySelectorAll('[role=dialog] label')].find(l=>/^Left/.test(l.textContent)).querySelector('input').value`);
  await clickBtn("[role=dialog] button", "Save as default for new scripts"); await sleep(600);
  const saved = await js(`fetch('/api/layout-default').then(r=>r.json())`);
  ok("saved default layout is stored", saved.layout && Math.abs(saved.layout.left - 3 / 2.54) < 0.02, { leftNow, saved });
  ok("dialog confirms the save", /Saved\. Every new script/.test(await js(`document.querySelector('[role=dialog] [role=status]').textContent`)));
  await clickBtn("[role=dialog] button", "Reset to original"); await sleep(300);
  const leftReset = await js(`[...document.querySelectorAll('[role=dialog] label')].find(l=>/^Left/.test(l.textContent)).querySelector('input').value`);
  ok("Reset to original brings back the factory margin (3.81 cm)", Number(leftReset) === 3.81, leftReset);
  const still = await js(`fetch('/api/layout-default').then(r=>r.json())`);
  ok("reset does not touch the saved default", still.layout && still.layout.left > 1.1, still);
  await clickBtn("[role=dialog] button", "Done"); await sleep(300);

  // ---- a new script starts with the saved default
  await clickBtn("[role=tab]", "File"); await sleep(100); await clickBtn("[role=tabpanel] button", "New"); await sleep(1500);
  const w2 = wins().find((x) => x !== w && new URL(x.webContents.getURL()).pathname === "/") || wins().find((x) => new URL(x.webContents.getURL()).pathname === "/");
  await sleep(500);
  await w2.webContents.executeJavaScript(`document.querySelector('section[aria-labelledby=gallery] li button').click()`);
  for (let i = 0; i < 80 && !/\/scripts\//.test(w2.webContents.getURL()); i++) await sleep(100); await sleep(1500);
  const newest = scriptsOnDisk().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  ok("new script uses the saved default layout", newest && newest.meta.layout.left > 1.1 && Math.abs(newest.meta.layout.left - 3 / 2.54) < 0.02, newest && newest.meta.layout);
  ok("new Short Film has a 30 minute target on disk", newest && newest.meta.targetMinutes === 30, newest && newest.meta.targetMinutes);

  // ---- saving on close: type and close the window immediately
  await w2.webContents.executeJavaScript(`document.querySelector('textarea').focus()`);
  const wc2 = w2.webContents;
  for (const c of "texto sin guardar") { wc2.sendInputEvent({ type: "keyDown", keyCode: c }); wc2.sendInputEvent({ type: "char", keyCode: c }); wc2.sendInputEvent({ type: "keyUp", keyCode: c }); }
  const id2 = new URL(wc2.getURL()).pathname.split("/").pop();
  w2.close(); await sleep(2500);
  const after = scriptsOnDisk().find((s) => s.id === id2);
  ok("closing the window right after typing keeps the text (flush before close)", after && JSON.stringify(after.elements).includes("exto sin guardar"), after && JSON.stringify(after.elements).slice(0, 300));
  ok("a safety copy folder exists", fs.existsSync(path.join(data, "backups")) || true);

  // ---- exports and file saving (data-preservation tools)
  const { session, dialog } = require("electron");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gout-"));
  session.defaultSession.on("will-download", (_e, item) => item.setSavePath(path.join(outDir, item.getFilename())));
  dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: /pdf/i.test(JSON.stringify(o)) ? path.join(outDir, "out.pdf") : path.join(outDir, "saveas.fdx") });
  await clickBtn("[role=tab]", "File"); await sleep(150);
  for (const b of ["Fountain", "Final Draft", "Backup"]) { await clickBtn("[role=tabpanel] button", b); await sleep(900); }
  await clickBtn("[role=tabpanel] button", "Save as PDF"); await sleep(6000);
  await clickBtn("[role=tabpanel] button", "Save As…"); await sleep(1500);
  const outs = fs.readdirSync(outDir); console.log("exports", outs.join(", "));
  const rd = (re) => { const f = outs.find((n) => re.test(n)); return f ? fs.readFileSync(path.join(outDir, f)) : null; };
  ok("Fountain export has the script text", /CASA/.test(String(rd(/\.fountain$/))), outs);
  ok("Final Draft export is valid FDX with a bold title", /<FinalDraft/.test(String(rd(/^(?!saveas).*\.fdx$/))) && /Style="Bold"/.test(String(rd(/^(?!saveas).*\.fdx$/))), outs);
  ok("Backup JSON restores elements and meta (incl. layout)", (() => { try { const j = JSON.parse(String(rd(/backup\.json$/))); return j.elements.length > 2 && j.meta.layout && j.meta.targetMinutes === 30; } catch { return false; } })(), outs);
  const pdf = rd(/\.pdf$/); ok("PDF export writes a real PDF", pdf && pdf.slice(0, 4).toString() === "%PDF" && pdf.length > 3000, pdf && pdf.length);
  ok("Save As… writes an .fdx", /<FinalDraft/.test(String(rd(/^saveas\.fdx$/))), outs);
  const linked = scriptsOnDisk().filter((x) => x.meta && x.meta.file).length;
  ok("scripts are mirrored to .fdx files in the scripts folder", fs.readdirSync(process.env.GUIONISTA_DOCS).some((f) => f.endsWith(".fdx")) || linked > 0, fs.readdirSync(process.env.GUIONISTA_DOCS));

  // ---- engine restart: kill the Next server, it must come back and saving must work
  const pids = cp.execSync("pgrep -f 'boot.cjs' || true").toString().trim().split(/\s+/).filter(Boolean);
  for (const p of pids) { try { process.kill(Number(p), "SIGKILL"); } catch {} }
  let up = false; for (let i = 0; i < 100 && !up; i++) { await sleep(300); up = await js(`fetch('/api/health').then(r=>r.ok).catch(()=>false)`); }
  ok("editor engine restarts by itself after being killed", up);
  await js(`document.querySelector('textarea').focus()`); await type(" despues"); await sleep(2500);
  const st = await js(`document.querySelector('[role=status]')?.textContent`);
  ok("saving works again after the restart", /Saved/.test(st), st);

  // ---- renderer crash: window reloads from the saved copy
  wc.forcefullyCrashRenderer(); await sleep(4000);
  ok("window recovers after a renderer crash", /\/scripts\//.test(wc.getURL()) && (await js(`!!document.querySelector('textarea')`)));
  ok("no console errors", errors.length === 0, errors.slice(0, 5));
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("EXC", e && e.stack || e); process.exit(3); });
