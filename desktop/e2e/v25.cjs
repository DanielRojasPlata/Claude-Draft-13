// v2.5 checks against the real desktop shell. Usage: xvfb-run -a node_modules/.bin/electron --no-sandbox e2e/v25.cjs
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-"));
process.env.GUIONISTA_DATA = data;
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
process.env.GUIONISTA_DOCS = fs.mkdtempSync(path.join(os.tmpdir(), "gdocs-"));
const results = [], errors = [];
const ok = (name, cond, info) => { results.push({ name, pass: !!cond, ...(cond ? {} : { info }) }); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(info)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 240000);
require("../main.js");
const shot = async (win, f) => { try { const wc = win.webContents; const i = await wc.capturePage(); fs.writeFileSync(f, i.toPNG()); } catch (e) { console.log("shot failed", f, String(e)); } };
const wins = () => BrowserWindow.getAllWindows().filter((w) => /127\.0\.0\.1/.test(w.webContents.getURL()));
(async () => {
  let w; for (let i = 0; i < 300 && !(w = wins()[0]); i++) await sleep(100);
  if (!w) { console.log("no window"); process.exit(1); }
  await sleep(1200);
  const mk = (win) => {
    const wc = win.webContents; wc.on("console-message", (e) => { if (e.level === "error") errors.push(e.message); });
    const js = (s) => wc.executeJavaScript(s);
    const key = async (k, mods = []) => { wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods }); if (k.length === 1) wc.sendInputEvent({ type: "char", keyCode: k, modifiers: mods }); wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods }); await sleep(25); };
    const type = async (s) => { for (const c of s) await key(c); };
    const rows = () => js(`[...document.querySelectorAll('[data-page="0"] .page-line')].map(e=>e.textContent).filter(Boolean)`);
    const foot = () => js(`document.querySelector('footer')?.innerText ?? ''`);
    return { wc, js, key, type, rows, foot, win };
  };
  let A = mk(w);

  // ---------- welcome page ----------
  ok("starts on the welcome page", new URL(w.webContents.getURL()).pathname === "/");
  const lay = await A.js(`(()=>{const y=(id)=>document.getElementById(id)?.getBoundingClientRect().top; return {g:y('gallery'),o:y('open'),r:y('recent'),logo:!!document.querySelector('svg[aria-label=Guionista]'),cards:document.querySelectorAll('#gallery ~ ul > li, section[aria-labelledby=gallery] ul > li').length,txt:document.body.innerText}})()`);
  ok("gallery is first, then Open, then Recent", lay.g < lay.o && lay.o < lay.r, lay);
  ok("logo and 6 gallery cards", lay.logo && lay.cards === 6, lay);
  ok("open file + recent list present", /Abrir archivo/.test(lay.txt) && /Archivos recientes/.test(lay.txt) && /The Last Light/.test(lay.txt));
  await shot(w, "/tmp/shot/welcome.png");

  // ---------- blank script in this window ----------
  await A.js(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.includes('Guion en blanco')).click()`);
  for (let i = 0; i < 60 && !/\/scripts\//.test(w.webContents.getURL()); i++) await sleep(100);
  await sleep(1500);
  ok("blank script opens in the same (welcome) window", /\/scripts\//.test(w.webContents.getURL()) && wins().length === 1);
  ok("window title shows the script", /Guion sin título/.test(w.getTitle()), w.getTitle());
  ok("Scene Intros list does not open by itself", (await A.js(`document.querySelectorAll('[role=listbox]').length`)) === 0);
  await A.js(`document.querySelector('textarea').focus()`);
  await A.type("int. casa"); await sleep(200);
  ok("SmartType works once typing starts", (await A.js(`document.querySelectorAll('[role=listbox]').length`)) >= 0);
  await A.key("Escape"); await A.type(" - dia"); await A.key("Escape"); await A.key("Return"); await sleep(100);
  await A.type("hola mundo"); await sleep(100);
  ok("Action first letter capitalised", (await A.rows()).includes("Hola mundo"), await A.rows());
  await A.key("Return"); await sleep(100);
  await A.key("Return"); await sleep(150);   // empty line -> elements list
  const pick = await A.js(`[...document.querySelectorAll('[role=listbox] li')].map(e=>e.textContent)`);
  ok("elements list: [G] General ... [N] Note, letters only", JSON.stringify(pick) === JSON.stringify(["[G] General","[S] Scene Heading","[A] Action","[C] Character","[P] Parenthetical","[D] Dialogue","[T] Transition","[H] Shot","[U] Summary","[E] End of Act","[N] Note"]), pick);
  await shot(w, "/tmp/shot/picker.png");
  await A.key("5"); await sleep(100);
  ok("digits no longer pick an element", (await A.js(`document.querySelectorAll('[role=listbox]').length`)) === 0);
  await A.key("Return"); await sleep(100);
  // fresh empty line: pick Character by letter
  await A.key("Return"); await sleep(150); await A.key("c"); await sleep(100);
  await A.type("ana"); await A.key("Return"); await sleep(80);
  await A.key("Tab"); await sleep(80);
  ok("Dialogue + Tab opens ( ) with the caret inside", (await A.rows()).includes("()"), await A.rows());
  await A.type("bajo"); await sleep(80);
  ok("Parenthetical text goes inside the brackets, first letter capital", (await A.rows()).includes("(Bajo)"), await A.rows());
  await A.key("Return"); await sleep(80);
  await A.type("uno dos tres"); await sleep(100);
  ok("Dialogue first letter capital", (await A.rows()).includes("Uno dos tres"), await A.rows());
  await A.key("Backspace", ["control"]); await sleep(80);
  ok("Ctrl+Backspace deletes the word before the caret", (await A.rows()).includes("Uno dos "), await A.rows());
  await A.key("Home"); await A.key("Delete", ["control"]); await sleep(80);
  ok("Ctrl+Delete deletes the next word", (await A.rows()).includes("dos "), await A.rows());

  // ---------- right margin ----------
  await A.key("End"); await A.type("x".repeat(3));
  await A.js(`document.querySelector('textarea').focus()`);
  // Action line long enough to wrap: check the right edge
  await A.key("Return"); await sleep(60); await A.key("Return"); await sleep(120); await A.key("a"); await sleep(60);
  await A.type(("palabra ").repeat(20)); await sleep(300);
  const edge = await A.js(`(()=>{const s=document.querySelector('[data-page="0"]').getBoundingClientRect(); let m=0; for(const e of document.querySelectorAll('[data-page="0"] .page-line')){ if(!e.textContent.trim()) continue; const r=document.createRange(); r.selectNodeContents(e); const q=r.getBoundingClientRect(); m=Math.max(m,(q.right-s.left)/ (s.width/816)); } return {maxRightPx:m, sheet:s.width}})()`);
  ok("text never reaches closer than 3 cm to the right edge (right edge <= 703px of 816)", edge.maxRightPx <= 704 && edge.maxRightPx > 560, edge);

  // ---------- dual dialogue ----------
  await A.js(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='Home').click()`); await sleep(100);
  // put the caret in Ana's dialogue by clicking it
  const pos = await A.js(`(()=>{const e=[...document.querySelectorAll('[data-page="0"] .page-line')].find(e=>e.textContent==='Uno dos tres'||e.textContent==='dos xxx'||e.textContent.startsWith('dos')); const b=e.getBoundingClientRect(); return [b.left+6,b.top+6]})()`);
  A.wc.sendInputEvent({ type: "mouseDown", x: Math.round(pos[0]), y: Math.round(pos[1]), button: "left", clickCount: 1 }); A.wc.sendInputEvent({ type: "mouseUp", x: Math.round(pos[0]), y: Math.round(pos[1]), button: "left", clickCount: 1 }); await sleep(150);
  await A.js(`[...document.querySelectorAll('[role=tabpanel] button')].find(e=>e.textContent.trim()==='Dual Dialogue').click()`); await sleep(500);
  await A.type("ben"); await sleep(300);
  const dual = await A.js(`[...document.querySelectorAll('[data-page="0"] .page-line')].filter(e=>e.dataset.row).map(e=>[e.dataset.row,Math.round(parseFloat(e.style.left)*100)/100,e.textContent.slice(0,14)])`);
  const xs = new Set(dual.filter((d) => d[2] && d[1] > 0.9).map((d) => d[1]));
  ok("Dual Dialogue button creates two columns", (await A.foot()).includes("(dual)") && [...xs].some((x) => x >= 5.1), { dual, foot: await A.foot() });
  await shot(w, "/tmp/shot/dual.png");
  // toggling again restores
  await A.js(`[...document.querySelectorAll('[role=tabpanel] button')].find(e=>e.textContent.trim()==='Dual Dialogue').click()`); await sleep(300);
  ok("Dual Dialogue toggles off", !(await A.foot()).includes("(dual)"));

  // ---------- context menu ----------
  const pg = await A.js(`(()=>{const b=document.querySelector('[data-page="0"] .page-line').getBoundingClientRect(); return [b.left+10,b.top+6]})()`);
  A.wc.sendInputEvent({ type: "mouseDown", x: Math.round(pg[0]), y: Math.round(pg[1]), button: "right", clickCount: 1 }); A.wc.sendInputEvent({ type: "mouseUp", x: Math.round(pg[0]), y: Math.round(pg[1]), button: "right", clickCount: 1 }); await sleep(300);
  const menu = await A.js(`[...document.querySelectorAll('[role=menu] > div [role^=menuitem]')].map(e=>e.textContent)`);
  ok("context menu is short and has an Element submenu", menu.length <= 14 && menu.some((t) => /^Element/.test(t)) && !menu.some((t) => /Scene Heading/.test(t)), menu);
  const mb = await A.js(`(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.startsWith('Element')); const b=e.getBoundingClientRect(); return [b.left+20,b.top+6]})()`);
  A.wc.sendInputEvent({ type: "mouseMove", x: Math.round(mb[0]), y: Math.round(mb[1]) }); await sleep(300);
  const sub = await A.js(`[...document.querySelectorAll('[role=menu][aria-label=Element] [role^=menuitem]')].map(e=>e.textContent.replace(/\\s+/g,' ').trim())`);
  ok("submenu lists [G]..[N] on hover", sub.length === 11 && /^\[G\] ?General/.test(sub[0]) && /\[N\] ?Note$/.test(sub[10]), sub);
  await shot(w, "/tmp/shot/ctx.png");
  await A.key("Escape"); await A.key("Escape"); await sleep(100);

  // ---------- page layout: per element ----------
  await A.js(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='Document').click()`); await sleep(100);
  await A.js(`[...document.querySelectorAll('[role=tabpanel] button')].find(e=>e.textContent.trim()==='Page Layout').click()`); await sleep(300);
  await A.js(`[...document.querySelectorAll('[role=dialog] [role=tab]')].find(e=>/Each element/.test(e.textContent)).click()`); await sleep(200);
  await A.js(`[...document.querySelectorAll('[role=dialog] ul[aria-label=Elements] button')].find(b=>/Dialogue/.test(b.textContent)).click()`); await sleep(100);
  const before = await A.js(`Math.round(parseFloat([...document.querySelectorAll('[data-page="0"] .page-line')].find(e=>e.textContent.startsWith('Uno')||e.textContent.startsWith('dos')).style.left)*100)/100`);
  await A.js(`(()=>{const i=document.querySelector('[role=dialog] input[aria-label="Left margin"]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'8'); i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(500);
  const after = await A.js(`Math.round(parseFloat([...document.querySelectorAll('[data-page="0"] .page-line')].find(e=>e.textContent.startsWith('Uno')||e.textContent.startsWith('dos')).style.left)*100)/100`);
  const action = await A.js(`Math.round(parseFloat([...document.querySelectorAll('[data-page="0"] .page-line')].find(e=>e.textContent.startsWith('Hola')).style.left)*100)/100`);
  ok("changing Dialogue's left margin moves only Dialogue", after > before && Math.abs(after - 8 / 2.54) < 0.02 && action === 1.5, { before, after, action });
  await shot(w, "/tmp/shot/layout.png");
  await A.key("Escape"); await sleep(200);

  // ---------- immersive hint: once only ----------
  await A.js(`localStorage.removeItem('guionista:immersiveHint')`);
  await A.key("F11"); await sleep(400);
  const chipOn = () => A.js(`(()=>{const b=document.querySelector('button[aria-label="Exit immersive writing"]'); return b? getComputedStyle(b).opacity : null})()`);
  ok("immersive hint shows the first time", Number(await chipOn()) > 0.5, await chipOn());
  await sleep(5600);
  ok("hint fades away", Number(await chipOn()) < 0.1, await chipOn());
  A.wc.sendInputEvent({ type: "mouseMove", x: 300, y: 300 }); A.wc.sendInputEvent({ type: "mouseMove", x: 340, y: 320 }); await sleep(700);
  ok("moving the mouse does not bring it back", Number(await chipOn()) < 0.1, await chipOn());
  await A.key("Escape"); await sleep(400); await A.key("F11"); await sleep(500);
  ok("second immersive session: no hint", Number(await chipOn()) < 0.1, await chipOn());
  await A.key("Escape"); await sleep(300);

  // ---------- several windows ----------
  await A.js(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='File').click()`); await sleep(100);
  await A.js(`[...document.querySelectorAll('[role=tabpanel] button')].find(e=>e.textContent.trim()==='New').click()`);
  for (let i = 0; i < 60 && wins().length < 2; i++) await sleep(100);
  await sleep(1200);
  ok("New opens a second window (the script stays open)", wins().length === 2, wins().map((x) => x.webContents.getURL()));
  const w2 = wins().find((x) => x !== w); const B = mk(w2);
  ok("second window is the welcome page", new URL(w2.webContents.getURL()).pathname === "/");
  await B.js(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.includes('Series')).click()`);
  for (let i = 0; i < 60 && !/\/scripts\//.test(w2.webContents.getURL()); i++) await sleep(100);
  await sleep(1500);
  ok("template opens in the second window; first still shows its script", /\/scripts\//.test(w2.webContents.getURL()) && /\/scripts\//.test(w.webContents.getURL()) && wins().length === 2);
  ok("each window has its own title", w.getTitle() !== w2.getTitle() && /Guionista/.test(w2.getTitle()), [w.getTitle(), w2.getTitle()]);
  // open the first script again from window 2: focuses window 1 instead of a third window
  const firstPath = new URL(w.webContents.getURL()).pathname.split("/").pop();
  const r = await B.js(`window.guionista.openScript(${JSON.stringify(firstPath)}, true)`);
  ok("opening an already-open script focuses its window", r.handled && r.focused && wins().length === 2, r);
  // Open a recent script from window 2's Open dialog -> third window
  await B.js(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='File').click()`); await sleep(100);
  await B.js(`[...document.querySelectorAll('[role=tabpanel] button')].find(e=>e.textContent.trim()==='Open Recent').click()`); await sleep(800);
  const recentBtn = await B.js(`(()=>{const items=[...document.querySelectorAll('[role=dialog] li button')]; const t=items.find(b=>/The Last Light/.test(b.textContent)); if(!t) return items.map(b=>b.textContent.slice(0,30)); t.click(); return true})()`);
  for (let i = 0; i < 60 && wins().length < 3; i++) await sleep(100);
  ok("a recent script opens in a third window", recentBtn === true && wins().length === 3, { recentBtn, n: wins().length });

  // ---------- find & replace shows the match ----------
  const C = mk(wins().find((x) => x !== w && x !== w2)); await sleep(1500);
  await C.js(`document.querySelector('textarea').focus()`); await C.key("f", ["control"]); await sleep(200);
  await C.type("zzz"); await sleep(100);
  const lastWord = await C.js(`(()=>{const all=[...document.querySelectorAll('[data-page]')]; return 'x'})()`);
  void lastWord;
  await C.js(`(()=>{const i=document.querySelector('[role=search] input[aria-label=Find]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'light'); i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(500);
  for (let n = 0; n < 6; n++) { await C.js(`[...document.querySelectorAll('[role=search] button')].find(b=>b.textContent==='Next').click()`); await sleep(250); }
  const vis = await C.js(`(()=>{const m=document.querySelector('main').getBoundingClientRect(); const h=document.querySelector('.bg-accent\\\\/45'); const y=document.querySelectorAll('.bg-yellow-300\\\\/60').length; if(!h) return {sel:false,y}; const r=h.getBoundingClientRect(); return {sel:true, inView:r.top>=m.top&&r.bottom<=m.bottom, y, count:document.querySelector('[role=search]').innerText.match(/\\d+ of \\d+ match/)?.[0]}})()`);
  ok("Find selects the match, highlights matches and scrolls it into view", vis.sel && vis.inView && vis.y >= 1, vis);
  await shot(C.win, "/tmp/shot/find.png");

  // ---------- assistant: embedded web view, no API key ----------
  await C.js(`[...document.querySelectorAll('header button')].find(e=>e.textContent.includes('Assistant')).click()`); await sleep(1200);
  const kids = C.win.contentView.children.length;
  const host = await C.js(`(()=>{const r=document.querySelector('[data-assistant-host]').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height, key: !!document.querySelector('input[type=password]')}})()`);
  const vb = C.win.contentView.children.map((c) => c.getBounds()).find((b) => b.width > 100 && Math.abs(b.x - Math.round(host.x)) <= 1);
  ok("assistant embeds the web version (no API key field)", kids >= 1 && !!vb && Math.abs(vb.width - host.w) <= 2 && !host.key, { kids, host, vb });
  await shot(C.win, "/tmp/shot/assistant.png");
  await C.js(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='Gemini').click()`); await sleep(800);
  ok("provider switch adds a view", C.win.contentView.children.length >= 2, C.win.contentView.children.length);

  ok("zero console errors", errors.length === 0, errors.slice(0, 5));
  const bad = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: bad.length }));
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log("CRASH", e); process.exit(3); });
