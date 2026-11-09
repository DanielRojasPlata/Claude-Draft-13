// Runs the real desktop shell (main.js) against a throwaway data folder and drives the UI.
// Usage: xvfb-run -a node_modules/.bin/electron --no-sandbox e2e/harness.cjs
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-")); const pdfOut = path.join(data, "out.pdf");
process.env.GUIONISTA_DATA = data;
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
const docs = fs.mkdtempSync(path.join(os.tmpdir(), "gdocs-")); process.env.GUIONISTA_DOCS = docs;
const chosen = path.join(data, "chosen-folder"); const openFdx = path.join(data, "to-open.fdx");
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: o && /\.fdx$/i.test(o.defaultPath || "") ? path.join(data, "saveas", path.basename(o.defaultPath)) : pdfOut });
dialog.showOpenDialog = async (_w, o) => ({ canceled: false, filePaths: [o && o.properties && o.properties.includes("openDirectory") ? chosen : openFdx] });
const results = []; const errors = [];
const ok = (name, cond, info) => { results.push({ name, pass: !!cond, ...(cond ? {} : { info }) }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log(JSON.stringify({ timeout: true, results }, null, 1)); process.exit(2); }, 390000);
require("../main.js");

(async () => {
  let w; for (let i = 0; i < 300 && !(w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/scripts"))); i++) await sleep(100);
  if (!w) { console.log(JSON.stringify({ fatal: "no window", results })); process.exit(1); }
  const wc = w.webContents; wc.on("console-message", (e) => { if (e.level === "error") errors.push(e.message); });
  const js = (s) => wc.executeJavaScript(s);
  const key = async (k, mods = []) => { wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods }); if (k.length === 1) wc.sendInputEvent({ type: "char", keyCode: k, modifiers: mods }); wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods }); await sleep(22); };
  const type = async (s) => { for (const c of s) await key(c); };
  const click = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);
  const tab = async (name) => js(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()===${JSON.stringify(name)}); if(!t) return false; t.click(); return true})()`);
  const btn = async (label) => { await sleep(60); return js(`(()=>{const b=[...document.querySelectorAll('[role=tabpanel] button, [role=tabpanel] a')].find(e=>e.textContent.trim()===${JSON.stringify(label)}); if(!b||b.disabled) return false; b.click(); return true})()`); };
  const rows = () => js(`[...document.querySelectorAll('[data-page="0"] .page-line')].map(e=>e.textContent).filter(Boolean)`);
  const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);

  // ---- list page + seed + token
  await sleep(500);
  ok("desktop opens the scripts list without sign-in", w.webContents.getURL().endsWith("/scripts"));
  ok("first launch seeds a script", (await js(`document.body.innerText.includes('The Last Light')`)));
  const forbidden = await js(`fetch('/api/health').then(r=>r.status)`);
  ok("health endpoint is open", forbidden === 200);
  // another local process (no cookie) is rejected
  const noCookie = await new Promise((res) => require("node:http").get({ host: "127.0.0.1", port: new URL(w.webContents.getURL()).port, path: "/scripts" }, (m) => { m.resume(); res(m.statusCode); }));
  ok("requests without the launch token are rejected (403)", noCookie === 403, noCookie);

  // ---- open the editor
  await js(`document.querySelector('li a').click()`); await sleep(1800);
  ok("editor loads with pages", (await rows()).length > 10);
  ok("navigator lists scenes", (await js(`document.querySelectorAll('aside[aria-label="Scene Navigator"] li button[aria-label^="Scene"]').length`)) >= 4);
  ok("all ribbon tabs present", (await js(`[...document.querySelectorAll('[role=tab]')].map(e=>e.textContent.trim()).filter(t=>['File','Home','Edit','Insert','Format','View','Document','Production','Tools','Help'].includes(t)).length`)) === 10);
  ok("assistant button is in the top-right corner", await js(`(()=>{const b=[...document.querySelectorAll('header button')].find(e=>e.textContent.includes('Assistant')); const r=b.getBoundingClientRect(); return r.right>window.innerWidth-40 && r.top<60})()`));

  // ---- formatting
  await js(`document.querySelector('textarea').focus()`);
  await key("a", ["control"]); await key("b", ["control"]);
  ok("bold applies to selection (Ctrl-B)", await js(`!!document.querySelector('[data-page="0"] .page-line span[style*="700"]')`));
  await key("Right"); await key("b", ["control"]);   // collapse selection; unbold via re-select
  await key("a", ["control"]); await key("b", ["control"]);

  // ---- SmartType + Enter flow + undo
  const footEl = () => js("document.querySelector('footer').innerText.split('\\n')[2]");
  const el0 = await footEl();
  await key("Tab", ["shift"]);
  const el1 = await footEl();
  ok("Shift-Tab moves to the previous element type (wrapping)", el0 !== el1, { el0, el1 });
  await key("z", ["control"]); await key("z", ["control"]); await key("z", ["control"]);

  // ---- navigator reorder (buttons) changes order
  const before = await js(`[...document.querySelectorAll('aside[aria-label="Scene Navigator"] li button[aria-label^="Scene"]')].map(b=>b.getAttribute('aria-label').replace(/^Scene \\d+: /,''))`);
  await js(`document.querySelector('aside[aria-label="Scene Navigator"] button[aria-label="Move scene 1 down"]').click()`); await sleep(500);
  const after = await js(`[...document.querySelectorAll('aside[aria-label="Scene Navigator"] li button[aria-label^="Scene"]')].map(b=>b.getAttribute('aria-label').replace(/^Scene \\d+: /,''))`);
  ok("moving a scene reorders the navigator with live numbers", after[0] === before[1] && after[1] === before[0], { before, after });
  const labels = await js(`[...document.querySelectorAll('aside[aria-label="Scene Navigator"] li button[aria-label^="Scene"]')].map(b=>b.getAttribute('aria-label').slice(0,8))`);
  ok("scene numbers stay sequential", labels.every((l, i) => l.startsWith(`Scene ${i + 1}:`)), labels);
  await js(`document.querySelector('textarea').focus()`); await key("z", ["control"]); await sleep(400);
  const undone = await js(`[...document.querySelectorAll('aside[aria-label="Scene Navigator"] li button[aria-label^="Scene"]')].map(b=>b.getAttribute('aria-label').replace(/^Scene \\d+: /,''))`);
  ok("undo restores the scene order", undone[0] === before[0], undone);

  // ---- dual dialogue
  await js(`document.querySelector('textarea').focus()`);
  await js(`(()=>{const e=[...document.querySelectorAll('[data-page="0"] .page-line')].find(e=>e.textContent==='IRIS'); e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); window.__x=[b.left+4,b.top+6]})()`);
  const [cx, cy] = await js(`window.__x`);
  wc.sendInputEvent({ type: "mouseDown", x: Math.round(cx), y: Math.round(cy), button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x: Math.round(cx), y: Math.round(cy), button: "left", clickCount: 1 }); await sleep(100);
  await tab("Home"); await btn("Dual Dialogue"); await sleep(400);
  ok("Dual Dialogue creates the paired right-hand speaker", (await js(`document.querySelector('footer').innerText`)).includes("(dual)"));
  await type("BEN"); await key("Return"); await type("Right side here."); await sleep(500);
  const dual = await js(`(()=>{const rows={}; for(const e of document.querySelectorAll('.page-line[data-row]')){(rows[e.dataset.row] ||= []).push(parseFloat(e.style.left))} return Object.values(rows).some(a=>a.some(x=>x<=2.0) && a.some(x=>x>=4.4 && x<=6.0))})()`);
  ok("dual dialogue renders two columns on the same rows", dual);
  // ---- find
  await key("f", ["control"]); await sleep(150); await type("storm"); await sleep(200);
  ok("find reports matches", /1 match/.test(await text('[role=search] span[aria-live]') ?? ""), await text('[role=search] span[aria-live]'));
  await key("Escape");

  // ---- title page
  const sheets0 = await js(`document.querySelectorAll('.sheet').length`);
  await tab("Document"); await btn("Title Page"); await sleep(250);
  await js(`(()=>{const i=document.querySelector('[role=dialog] input'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'The Last Light'); i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(200);
  ok("title page preview renders the title", await js(`document.querySelector('[role=dialog]').innerText.toUpperCase().includes('THE LAST LIGHT')`));
  await key("Escape"); await sleep(250);
  ok("title page is an unnumbered first sheet in the editor", await js(`(()=>{const sheets=[...document.querySelectorAll('main .sheet')]; return !sheets[0].hasAttribute('data-page') && sheets[1].dataset.page==='0' && sheets[0].innerText.toUpperCase().includes('THE LAST LIGHT') && sheets[0].innerText.includes('Your Name')})()`));

  // ---- revisions
  await tab("Production"); await btn("Revision Mode"); await js(`document.querySelector('textarea').focus()`);
  await key("End"); await type("X"); await sleep(300);
  ok("revision mode marks edits with a left-margin asterisk", await js(`[...document.querySelectorAll('.page-line')].some(e=>e.textContent==='*' && parseFloat(e.style.left)<1.5)`));
  await btn("Lock Pages"); await sleep(300);
  ok("locking pages shows in the status bar", await js(`document.querySelector('footer').innerText.includes('Pages locked')`));

  // ---- reports
  await tab("Tools"); await btn("Character"); await sleep(400);
  ok("character report lists speakers", await js(`[...document.querySelectorAll('[role=dialog] tbody tr')].length >= 2`));
  await key("Escape"); await sleep(250);

  // ---- view modes
  await tab("View"); await btn("Night"); await sleep(250);
  ok("night mode darkens the page", await js(`getComputedStyle(document.querySelector('[data-page="0"]')).backgroundColor`) !== "rgb(255, 255, 255)");
  await btn("Day");

  // ---- assistant
  await js(`[...document.querySelectorAll('header button')].find(e=>e.textContent.includes('Assistant')).click()`); await sleep(300);
  ok("assistant offers Claude, ChatGPT and Gemini", await js(`['Claude','ChatGPT','Gemini'].every(n=>[...document.querySelectorAll('[aria-label="Assistant provider"] [role=tab]')].some(t=>t.textContent.includes(n)))`));
  await js(`(()=>{const t=document.querySelector('aside[aria-label="Writing assistant"] textarea'); const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; s.call(t,'hello'); t.dispatchEvent(new Event('input',{bubbles:true})); t.form.requestSubmit()})()`); await sleep(500);
  ok("assistant asks for a key instead of failing silently", await js(`document.querySelector('aside[aria-label="Writing assistant"] [role=alert]')?.textContent.includes('API key')`));
  const apiNoKey = await js(`fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'evil',messages:[{role:'user',content:'x'}]})}).then(r=>r.status)`);
  ok("assistant API rejects unknown providers", apiNoKey === 400, apiNoKey);

  // ---- keyboard flows, SmartType from an empty script, focus, context menu, immersive writing
  const fresh = await js(`(async()=>{const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Flow',elements:[{id:'n0',type:'Scene Heading',runs:[{text:''}]}]})});return (await r.json()).id})()`);
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${fresh}`); await sleep(1500);
  const rect = (sel, txt) => js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>!${JSON.stringify(txt || "")}||e.textContent.trim()===${JSON.stringify(txt || "")}); const b=e.getBoundingClientRect(); return [Math.round(b.left+b.width/2),Math.round(b.top+b.height/2)]})()`);
  const mouse = async (x, y, button = "left") => { wc.sendInputEvent({ type: "mouseDown", x, y, button, clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x, y, button, clickCount: 1 }); await sleep(120); };
  const opts = () => js(`[...document.querySelectorAll('[role=listbox] [role=option]')].map(e=>e.textContent)`);
  const popTitle = () => js(`document.querySelector('[role=listbox]')?.getAttribute('aria-label') ?? null`);
  const footType = async () => (await js(`document.querySelector('footer').innerText.split('\\n')[2]`)).replace(" (dual)", "");
  const pageText = () => js(`[...document.querySelectorAll('[data-page="0"] .page-line[data-row]')].map(e=>e.textContent.replace(/\\s+$/,''))`);

  const [tx, ty] = await rect("[role=tab]", "View"); await mouse(tx, ty);
  ok("clicking a ribbon tab keeps keyboard focus in the script", await js(`document.activeElement.tagName === 'TEXTAREA'`), await js(`document.activeElement.tagName`));
  await type("I");
  ok("SmartType offers INT./EXT. in a brand-new script (no prior use needed)", (await opts()).includes("INT."), await opts());
  ok("the SmartType list is titled and floats above the page (not clipped by it)", (await popTitle()) === "Scene intros" && await js(`(()=>{const l=document.querySelector('[role=listbox]'); return !l.closest('.sheet') && getComputedStyle(l).position==='fixed'})()`));
  await key("Return");
  ok("Enter accepts the highlighted suggestion", (await pageText())[0] === "INT.", await pageText());
  await type("kitchen"); await key("Tab"); await sleep(80);
  ok("scene headings are capitalised as you type", (await pageText())[0].startsWith("INT. KITCHEN"), await pageText());
  ok("Tab after the location adds ' - ' and opens the times of day in Spanish", (await pageText())[0] === "INT. KITCHEN -" && (await opts()).includes("NOCHE") && (await opts()).includes("DÍA"), { t: await pageText(), o: await opts() });
  await type("N");
  ok("the first letter filters the times list (N -> NOCHE)", (await opts())[0] === "NOCHE", await opts());
  await key("Tab"); await sleep(80);
  ok("Tab accepts the highlighted time", (await pageText())[0] === "INT. KITCHEN - NOCHE", await pageText());
  await key("Return"); await sleep(80);
  ok("Return after a Scene Heading starts an Action", (await footType()) === "Action", await footType());
  await type("Rain."); await key("Return"); await sleep(60);
  ok("Return after Action starts another Action (original default)", (await footType()) === "Action" && (await pageText()).length >= 2, await footType());
  await key("Return"); await sleep(120);
  ok("Return on an empty line opens the element list (11 elements)", (await popTitle()) === "Element" && (await opts()).length === 11, { t: await popTitle(), o: await opts() });
  await key("c"); await key("Return"); await sleep(80);
  ok("typing a letter jumps to the element and Return applies it (Character)", (await footType()) === "Character", await footType());
  await type("MARA"); await key("Tab"); await sleep(100);
  ok("Tab after a Character name adds an extension list", (await opts()).includes("V.O.") && (await pageText()).some((t) => t.startsWith("MARA (")), { o: await opts(), t: await pageText() });
  await key("Down"); await key("Return"); await sleep(100);
  ok("choosing an extension completes the cue: MARA (V.O.)", (await pageText()).some((t) => t === "MARA (V.O.)"), await pageText());
  await key("Return"); await sleep(80);
  ok("Return after a Character cue starts Dialogue", (await footType()) === "Dialogue", await footType());
  await key("Tab"); await sleep(80);
  ok("Tab in Dialogue opens a Parenthetical with the brackets in place", (await footType()) === "Parenthetical" && (await pageText()).includes("()"), { t: await footType(), p: await pageText() });
  await type("bajito"); await sleep(60);
  ok("typing goes inside the brackets", (await pageText()).includes("(bajito)"), await pageText());
  await key("Return"); await sleep(80);
  ok("Return after the parenthetical drops back into Dialogue", (await footType()) === "Dialogue" && (await pageText()).includes("(bajito)"), { t: await footType(), p: await pageText() });
  await type("Hello there"); await key("Return"); await sleep(80);
  ok("Return after Dialogue goes to Action (original default)", (await footType()) === "Action", await footType());
  await key("Tab"); await sleep(80);
  ok("Tab on an Action line turns it into a Character and offers the script's names", (await footType()) === "Character" && (await opts()).includes("MARA"), { t: await footType(), o: await opts() });
  await key("Tab", ["shift"]); await key("Tab", ["shift"]); await sleep(60);
  ok("Shift-Tab cycles backward and wraps (Action, then Scene Heading)", (await footType()) === "Scene Heading", await footType());
  await key("Tab"); await key("Tab"); await key("Tab"); await key("Tab"); await sleep(60);
  await type("split here"); for (let i = 0; i < 4; i++) await key("Left"); await key("Return"); await sleep(80);
  ok("Return in the middle of Dialogue keeps the type (no stray element)", (await footType()) === "Dialogue", await footType());

  // spacing before each element follows the original (24pt scene heading, 12pt action/character, 0 dialogue)
  // SmartType settings: a custom entry is suggested
  await tab("Document"); await btn("SmartType"); await sleep(300);
  await js(`document.querySelector('[role=dialog]').querySelectorAll('[role=tab]')[1].click()`); await sleep(150);
  await js(`(()=>{const i=document.querySelector('[role=dialog] input[aria-label^="Add to"]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i,'the lamp room'); i.dispatchEvent(new Event('input',{bubbles:true})); i.form.requestSubmit()})()`); await sleep(250);
  ok("SmartType settings list the new custom entry", await js(`document.querySelector('[role=dialog]').innerText.includes('THE LAMP ROOM')`));
  await key("Escape"); await sleep(250);
  await js(`document.querySelector('textarea').focus()`);
  for (let i = 0; i < 9 && (await footType()) !== "Scene Heading"; i++) await key("Tab", ["shift"]);
  await type("INT. THE");
  ok("custom locations are suggested after INT.", (await opts()).includes("THE LAMP ROOM"), { o: await opts(), t: await footType() });
  await key("Escape");

  // context menu, including near the bottom edge of the window
  const [cx2, cy2] = await rect('[data-page="0"] .page-line[data-row]');
  await mouse(cx2, cy2, "right");
  const menu = await js(`[...document.querySelectorAll('[role=menu] [role=menuitem], [role=menu] [role=menuitemcheckbox]')].map(e=>e.textContent.replace(/[✓▸]/g,'').trim())`);
  ok("right-click opens a context menu with clipboard, element and format commands", ["General", "Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Transition", "Shot", "Summary", "End of Act", "Note", "Cut", "Copy", "Paste", "Select All", "Format", "Dual Dialogue", "Find & Replace…"].every((x) => menu.some((m) => m.startsWith(x))), menu);
  await key("Escape"); await sleep(120);
  const vh = await js(`innerHeight`), vw = await js(`innerWidth`);
  const mainBox = await js(`(()=>{const r=document.querySelector('main').getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom}})()`);
  const inPage = await js(`(()=>{const r=document.querySelector('[data-page="0"]').getBoundingClientRect(); return {l:r.left,r:r.right}})()`);
  for (const [px, py, label] of [[Math.round((inPage.l + inPage.r) / 2), Math.round(mainBox.b - 10), "bottom"], [Math.round(inPage.r - 14), Math.round(mainBox.b - 10), "bottom-right corner"], [Math.round(inPage.r - 14), cy2, "right side"]]) {
    await mouse(px, py, "right");
    let boxes = [], texts = [];
    for (let k = 0; k < 8 && boxes.length < 2; k++) {
      await js(`(()=>{const it=[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(e=>e.textContent.trim().startsWith('Format')); if (it) { it.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); it.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false})) }})()`); await sleep(300);
      boxes = await js(`[...document.querySelectorAll('[role=menu]')].map(m=>{const r=m.getBoundingClientRect(); return {t:r.top,b:r.bottom,l:r.left,r:r.right}})`);
    }
    texts = await js(`[...document.querySelectorAll('[role=menu] [role=menuitem], [role=menu] [role=menuitemcheckbox]')].map(e=>e.textContent.trim().slice(0,18))`);
    ok(`context menu and submenu stay fully on screen (${label})`, boxes.length >= 2 && boxes.every((r) => r.t >= -1 && r.b <= vh + 1 && r.l >= -1 && r.r <= vw + 1), { vh, vw, click: [px, py], boxes, texts });
    await key("Escape"); await sleep(120);
  }
  await mouse(cx2, cy2, "right");
  await js(`(()=>{const it=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('Format')); it.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); it.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false}))})()`); await sleep(150);
  await key("Escape"); await sleep(150);
  await mouse(cx2, cy2, "right");
  await js(`[...document.querySelectorAll('[role=menu] [role=menuitemcheckbox]')].find(e=>e.textContent.trim().endsWith('Transition')).click()`); await sleep(200);
  ok("choosing an element type from the menu changes the element", (await footType()) === "Transition", await footType());
  ok("the menu closes after choosing and focus returns to the script", await js(`!document.querySelector('[role=menu]') && document.activeElement.tagName==='TEXTAREA'`));
  await key("F10", ["shift"]); await sleep(150);
  ok("Shift-F10 opens the context menu from the keyboard", await js(`!!document.querySelector('[role=menu]')`));
  await key("Escape"); await sleep(120);
  ok("Esc closes the context menu", await js(`!document.querySelector('[role=menu]')`));

  // ---- spec features: spaces, double-click, QA corrector, synonyms, zoom, rulers, panels, ribbon, templates
  const qa = await js(`(async()=>{const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Qa',elements:[{id:'q0',type:'Action',runs:[{text:'Voy a la tienda kasa. Luego el el perro corre'}]},{id:'q1',type:'Action',runs:[{text:'uno'}]}]})});return (await r.json()).id})()`);
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${qa}`); await sleep(1800);
  // the spacing glitch: every typed space moves the caret
  await js(`document.querySelector('textarea').focus()`); await key("End"); await key("Down"); await key("End");
  const caretX = () => js(`document.querySelector('.caret')?.getBoundingClientRect().left ?? -1`);
  const x0 = await caretX(); await key(" "); const x1 = await caretX(); await key(" "); await key(" "); const x2 = await caretX();
  ok("each typed space moves the caret (no stuck spaces, no jumps)", x1 > x0 && Math.abs((x1 - x0) - 9.6) < 1.5 && Math.abs((x2 - x1) - 19.2) < 2.5, { x0, x1, x2 });
  await type("dos"); const x3 = await caretX();
  ok("text after several spaces lands exactly where the spaces end", Math.abs((x3 - x2) - 28.8) < 3, { x2, x3 });
  // double-click selects a word; triple-click selects the element
  const wordPos = await js(`(()=>{const l=[...document.querySelectorAll('[data-page="0"] .page-line[data-row]')].find(e=>e.textContent.includes('tienda')); const r=l.getBoundingClientRect(); const i=l.textContent.indexOf('tienda'); return [Math.round(r.left + (i+3)*9.6), Math.round(r.top+8), 'tienda'.length*9.6]})()`);
  wc.sendInputEvent({ type: "mouseDown", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseDown", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 2 }); wc.sendInputEvent({ type: "mouseUp", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 2 }); await sleep(150);
  const selW = await js(`[...document.querySelectorAll('[data-page="0"] .bg-accent\\\\/45')].map(e=>e.getBoundingClientRect().width)`);
  ok("double-click selects exactly the word under the pointer", selW.length === 1 && Math.abs(selW[0] - wordPos[2]) < 2, { selW, want: wordPos[2] });
  wc.sendInputEvent({ type: "mouseDown", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 3 }); wc.sendInputEvent({ type: "mouseUp", x: wordPos[0], y: wordPos[1], button: "left", clickCount: 3 }); await sleep(150);
  const selAll = await js(`[...document.querySelectorAll('[data-page="0"] .bg-accent\\\\/45')].length`);
  ok("triple-click selects the whole element", selAll >= 1);
  // QA corrector: Spanish dictionary + grammar rules
  let bad = [], gram = [];
  for (let i = 0; i < 40; i++) { await sleep(400); bad = await js(`[...document.querySelectorAll('.sp-bad')].map(e=>e.textContent)`); if (bad.length) break; }
  gram = await js(`[...document.querySelectorAll('.sp-gram')].map(e=>e.textContent)`);
  ok("Spanish spelling: 'kasa' is underlined, correct words are not", bad.includes("kasa") && !bad.includes("tienda") && !bad.includes("perro"), bad);
  ok("grammar: a repeated word is flagged ('el el')", gram.includes("el"), gram);
  const kasa = await js(`(()=>{const e=[...document.querySelectorAll('.sp-bad')].find(x=>x.textContent==='kasa'); const r=e.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]})()`);
  await mouse(kasa[0], kasa[1], "right");
  let sg = [];
  for (let i = 0; i < 30; i++) { await sleep(300); sg = await js(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(e=>e.textContent.trim())`); if (sg.some((t) => /^casa$/i.test(t))) break; }
  ok("right-click on a typo offers Spanish suggestions and 'Add to the dictionary'", sg.some((t) => /^casa$/i.test(t)) && sg.some((t) => /dictionary/.test(t)), sg);
  ok("the menu has a Synonyms submenu for the word", sg.some((t) => t.startsWith("Synonyms of")), sg);
  await js(`(()=>{const it=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.startsWith('Synonyms of')); it.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); it.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false}))})()`);
  let syn = [];
  for (let i = 0; i < 30; i++) { await sleep(400); syn = await js(`[...document.querySelectorAll('[role=menu] [role=menu] [role=menuitem]')].map(e=>e.textContent.trim())`); if (syn.length && !syn.some((t) => /^Searching/.test(t))) break; }
  ok("synonyms from sinonimosonline.com load (or a clear offline message)", syn.length > 0 && !syn.some((t) => /^Searching/.test(t)), syn);
  await js(`[...document.querySelectorAll('[role=menuitem]')].find(e=>/^casa$/i.test(e.textContent.trim())).click()`); await sleep(300);
  ok("choosing a suggestion replaces the word", (await pageText()).join(" ").includes("tienda casa."), await pageText());
  await js(`document.querySelector('textarea').focus()`);

  // fine zoom: ctrl+wheel / pinch
  const sheetW = () => js(`document.querySelector('[data-page="0"]').getBoundingClientRect().width`);
  const w0 = await sheetW();
  const prevented = await js(`(()=>{const m=document.querySelector('main'); const r=m.getBoundingClientRect(); const ev=new WheelEvent('wheel',{ctrlKey:true,deltaY:-18,clientX:r.left+300,clientY:r.top+200,bubbles:true,cancelable:true}); m.dispatchEvent(ev); return ev.defaultPrevented})()`); await sleep(200);
  const w1 = await sheetW();
  ok("pinch / Ctrl+wheel zooms in smoothly (not in fixed steps) and blocks page zoom", prevented && w1 > w0 * 1.05 && w1 < w0 * 1.4 && Math.abs(w1 / 816 - Math.round(w1 / 816 * 4) / 4) > 0.005, { w0, w1, prevented });
  await js(`document.querySelector('main').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:12,clientX:400,clientY:300,bubbles:true,cancelable:true}))`); await sleep(150);
  ok("pinching back out zooms out", (await sheetW()) < w1);
  await key("0", ["control"]); await sleep(150);
  ok("Ctrl+0 resets the zoom to 100%", Math.abs((await sheetW()) - 816) < 2, await sheetW());

  ok("rulers are removed (no ruler on screen, no Rulers button)", await js(`!document.querySelector('svg[aria-label*="ruler"]') && ![...document.querySelectorAll('button')].some(b=>/rulers/i.test(b.textContent))`));

  // scenes panel on/off button, ribbon double-click
  const navShown = () => js(`!!document.querySelector('aside[aria-label="Scene Navigator"]')`);
  const had = await navShown();
  await js(`[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Scenes')).click()`); await sleep(250);
  const hid = !(await navShown());
  await js(`[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Scenes')).click()`); await sleep(250);
  ok("the Scenes button hides and shows the left panel", had && hid && (await navShown()));
  await js(`document.querySelector('[role=tablist][aria-label="Ribbon tabs"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`); await sleep(250);
  const collapsed = await js(`!document.querySelector('[role=tabpanel]') && !!document.querySelector('[role=tab]')`);
  await js(`document.querySelector('[role=tablist][aria-label="Ribbon tabs"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`); await sleep(250);
  ok("double-click on the tab bar hides the toolbar, and again shows it", collapsed && await js(`!!document.querySelector('[role=tabpanel]')`));

  // assistant: no suggestion chips, roomy chat
  await js(`[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Assistant')).click()`); await sleep(300);
  const asst = await js(`(()=>{const a=document.querySelector('aside[aria-label="Writing assistant"]'); return {w:a.getBoundingClientRect().width, chips:[...a.querySelectorAll('button')].filter(b=>/feedback|dialogue natural|pacing|stronger way|format problems/i.test(b.textContent)).length, rows:a.querySelector('textarea[aria-label=Message]').rows}})()`);
  ok("assistant: chips removed, and the panel is 3/4 of its old width (about 408px, was 544px)", asst.chips === 0 && asst.w >= 385 && asst.w <= 440 && asst.rows >= 4, asst);
  await js(`[...document.querySelectorAll('header button')].find(b=>b.textContent.includes('Assistant')).click()`); await sleep(200);

  // template gallery
  await tab("File"); await btn("Templates"); await sleep(400);
  const cards = await js(`[...document.querySelectorAll('[role=dialog] ul button')].map(b=>b.querySelector('span:nth-child(2)')?.textContent)`);
  ok("File > Templates shows Screenplay, Series, Stage Play, Graphic Novel, Story Structure", ["Screenplay", "Series", "Stage Play", "Graphic Novel", "Story Structure"].every((n) => cards.includes(n)), cards);
  await js(`[...document.querySelectorAll('[role=dialog] ul button')].find(b=>b.textContent.includes('Series')).click()`);
  for (let i = 0; i < 40; i++) { await sleep(250); if ((await js(`location.pathname`)) !== `/scripts/${qa}`) break; }
  await sleep(1500);
  const tp = await pageText();
  ok("a Series template opens a new script with teaser and acts (in Spanish)", tp.includes("TEASER") && (await js(`document.body.innerText`)).includes("FIN DEL TEASER"), tp);
  ok("End of Act is centred", await js(`(()=>{const l=[...document.querySelectorAll('.page-line[data-row]')].find(e=>e.textContent.includes('FIN DEL TEASER')); return l ? parseFloat(l.style.left) > 2.5 : false})()`));
  await tab("Home"); 

  // ---- this round: scene heading not bold, page layout, title page typing, capitals, exchanges, centred zoom
  ok("Scene Heading is not bold", await js(`(()=>{const l=[...document.querySelectorAll('[data-page="0"] .page-line[data-row]')].find(e=>/^INT\\./.test(e.textContent)); return l ? getComputedStyle(l).fontWeight==='400' : null})()`), await js(`[...document.querySelectorAll('.page-line')].slice(0,5).map(e=>e.textContent+':'+getComputedStyle(e).fontWeight)`));
  await tab("Document"); await btn("Page Layout"); await sleep(400);
  const sumText = () => js(`document.querySelector('[role=dialog] p[aria-live]')?.textContent ?? ''`);
  ok("Page Layout opens with the default numbers (64 characters per line, 54 lines per page)", /64 characters per line/.test(await sumText()) && /54 lines per page/.test(await sumText()), await sumText());
  const setSelect = (label, value) => js(`(()=>{const e=document.querySelector('[role=dialog] [aria-label=${JSON.stringify(label)}]'); const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; s.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const setNum = (label, v) => js(`(()=>{const e=document.querySelector('[role=dialog] input[aria-label=${JSON.stringify(label)}]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(e, ${JSON.stringify(String(v))}); e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const sheetPx = () => js(`(()=>{const r=document.querySelector('[data-page="0"]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})()`);
  await setSelect("Page size", "a4"); await sleep(300);
  const [aw, ah] = await sheetPx();
  ok("choosing A4 changes the page size (21.0 x 29.7 cm)", Math.abs(aw - 794) <= 2 && Math.abs(ah - 1122) <= 2, [aw, ah]);
  await setNum("Right", 0.3); await sleep(300);
  ok("a narrower right margin gives longer lines (A4 is narrower, so more than 63)", +(/(\d+) characters per line/.exec(await sumText())?.[1]) > 64, await sumText());
  await setSelect("Line spacing", "2"); await sleep(300);
  ok("double line spacing reduces the lines per page", +(/(\d+) lines per page/.exec(await sumText())?.[1]) < 40, await sumText());
  await setNum("Size", 14); await sleep(300);
  ok("a bigger font changes characters per line", +(/(\d+) characters per line/.exec(await sumText())?.[1]) < 70, await sumText());
  await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Reset to defaults').click()`); await sleep(300);
  const [rw] = await sheetPx();
  ok("Reset to defaults restores Letter and the standard layout", Math.abs(rw - 816) <= 2 && /64 characters per line/.test(await sumText()), [rw, await sumText()]);
  await key("Escape"); await sleep(250);

  // title page: every field can be filled; focus no longer jumps back to Title
  await tab("Document"); await btn("Title Page"); await sleep(350);
  const focusAndType = async (label, text) => { await js(`(()=>{const f=[...document.querySelectorAll('[role=dialog] label')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)})); f.querySelector('input,textarea').focus()})()`); await type(text); await sleep(80); };
  await focusAndType("Author", "Ana Ruiz"); await focusAndType("Source", "Basado en una novela"); await focusAndType("Draft Date", "Marzo 2026"); await focusAndType("Copyright", "(c) Ana");
  const fields = await js(`Object.fromEntries([...document.querySelectorAll('[role=dialog] label')].map(l=>[l.firstChild.textContent.trim(), l.querySelector('input,textarea').value]))`);
  ok("the Title Page fields all keep what you type (no jump back to Title)", fields.Author === "Ana Ruiz" && fields.Source.endsWith("Basado en una novela") && fields["Draft Date"] === "Marzo 2026" && fields.Copyright === "(c) Ana", fields);
  const keepsFocus = await js(`(()=>{const f=[...document.querySelectorAll('[role=dialog] label')].find(l=>l.textContent.trim().startsWith('Copyright')).querySelector('input,textarea'); return document.activeElement===f})()`);
  ok("typing keeps the cursor in the field you are in", keepsFocus);
  const pv = await js(`(()=>{const e=document.querySelector('[aria-label="Title page preview"] .sheet'); const r=e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})()`);
  ok("the title page preview is at least twice its old size (old 245 px wide)", pv[0] >= 490, pv);
  await key("Escape"); await sleep(250);

  // Action capital letter and conversation flow, in fresh scripts
  const mk = (title, els) => js(`(async()=>{const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:${JSON.stringify(title)},elements:${JSON.stringify(els)}})});return (await r.json()).id})()`);
  const goto = async (id) => { await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${id}`); await sleep(1500); await js(`document.querySelector('textarea').focus()`); };
  const caps = await mk("Caps", [{ id: "c0", type: "Action", runs: [{ text: "" }] }]);
  await goto(caps); await type("hola mundo"); await sleep(120);
  ok("the first word of an Action line is capitalised automatically", (await pageText())[0] === "Hola mundo", await pageText());
  const exch = await mk("Exch", [{ id: "a", type: "Action", runs: [{ text: "Escena." }] }, { id: "c1", type: "Character", runs: [{ text: "ANA" }] }, { id: "d1", type: "Dialogue", runs: [{ text: "Hola" }] }, { id: "c2", type: "Character", runs: [{ text: "BEN" }] }, { id: "d2", type: "Dialogue", runs: [{ text: "Que tal" }] }]);
  await goto(exch); await key("End", ["control"]); await sleep(100); await key("Return"); await sleep(120);
  ok("two speeches in a row: the next Return creates a Character, not an Action", (await footType()) === "Character", await footType());
  const lone = await mk("Lone", [{ id: "a", type: "Action", runs: [{ text: "Escena." }] }, { id: "c1", type: "Character", runs: [{ text: "ANA" }] }, { id: "d1", type: "Dialogue", runs: [{ text: "Hola" }] }]);
  await goto(lone); await key("End", ["control"]); await sleep(100); await key("Return"); await sleep(120);
  ok("a single speech: Return still creates an Action", (await footType()) === "Action", await footType());

  // saved as .fdx in a folder, visible in the header
  const docFiles = () => fs.existsSync(docs) ? fs.readdirSync(docs).filter((f) => f.endsWith(".fdx")) : [];
  await goto(caps); await type(" otra frase"); 
  for (let i = 0; i < 30 && !docFiles().includes("Caps.fdx"); i++) await sleep(300);
  ok("the script is written as Caps.fdx in the default scripts folder", docFiles().includes("Caps.fdx"), docFiles());
  const fdxText = docFiles().includes("Caps.fdx") ? fs.readFileSync(path.join(docs, "Caps.fdx"), "utf8") : "";
  ok("the .fdx is Final Draft XML with the script text", /<FinalDraft/.test(fdxText) && /Hola mundo otra frase/.test(fdxText), fdxText.slice(0, 300));
  await sleep(600);
  ok("the header tells you where the file is", (await js(`document.querySelector('header').innerText`)).includes("Caps.fdx"), await js(`document.querySelector('header').innerText`));
  await tab("File"); await btn("Scripts Folder"); await sleep(500);
  ok("Scripts Folder lets you choose the folder", (await js(`document.body.innerText`)).includes("chosen-folder"));
  const brand = await mk("Brand New", [{ id: "n0", type: "Action", runs: [{ text: "" }] }]);
  await goto(brand); await type("texto nuevo");
  for (let i = 0; i < 30 && !(fs.existsSync(chosen) && fs.readdirSync(chosen).includes("Brand New.fdx")); i++) await sleep(300);
  ok("new scripts are saved in the folder you chose", fs.existsSync(chosen) && fs.readdirSync(chosen).includes("Brand New.fdx"), fs.existsSync(chosen) ? fs.readdirSync(chosen) : "no folder");
  await tab("File"); await btn("Save As…"); await sleep(1200);
  ok("Save As… writes the .fdx where you pick", fs.existsSync(path.join(data, "saveas", "Brand New.fdx")), fs.existsSync(path.join(data, "saveas")) ? fs.readdirSync(path.join(data, "saveas")) : "none");
  fs.writeFileSync(openFdx, '<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content><Paragraph Type="Scene Heading"><Text>INT. FARO - NOCHE</Text></Paragraph><Paragraph Type="Action"><Text>El mar golpea.</Text></Paragraph></Content></FinalDraft>');
  await tab("File"); await btn("Open"); await sleep(300);
  await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Open a file')).click()`);
  for (let i = 0; i < 40 && !(await rows()).includes("INT. FARO - NOCHE"); i++) await sleep(300);
  ok("Open uses the native file dialog and opens a real .fdx", (await rows()).includes("INT. FARO - NOCHE"), await rows());
  await js(`document.querySelector('textarea').focus()`); await key("End", ["control"]); await type(" ZZ");
  for (let i = 0; i < 30 && !/ZZ/.test(fs.readFileSync(openFdx, "utf8")); i++) await sleep(300);
  ok("editing an opened .fdx saves back into that same file", /El mar golpea\. ZZ/.test(fs.readFileSync(openFdx, "utf8")), fs.readFileSync(openFdx, "utf8").slice(-260));
  const pathBefore = await js(`location.pathname`);
  await tab("File"); await btn("Open"); await sleep(300);
  await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Open a file')).click()`); await sleep(1500);
  ok("opening the same .fdx again reopens the same script instead of copying it", (await js(`location.pathname`)) === pathBefore, [pathBefore, await js(`location.pathname`)]);

  // fine zoom keeps the page centred
  const centreOff = () => js(`(()=>{const m=document.querySelector('main').getBoundingClientRect(); const p=document.querySelector('[data-page="0"]').getBoundingClientRect(); return Math.round(((p.left+p.right)/2) - ((m.left+m.right)/2))})()`);
  for (const [cx, n] of [[60, 6], [1000, 6], [400, 4]]) {
    for (let i = 0; i < n; i++) { await js(`(()=>{const m=document.querySelector('main'); const r=m.getBoundingClientRect(); m.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-30,clientX:r.left+${cx},clientY:r.top+200,bubbles:true,cancelable:true}))})()`); await sleep(90); }
  }
  await sleep(250);
  const off1 = await centreOff();
  ok("pinch-zooming in keeps the page centred (even with the pointer at the edge)", Math.abs(off1) <= 12 && (await js(`document.querySelector('[data-page="0"]').getBoundingClientRect().width`)) > 1100, [off1, await js(`document.querySelector('[data-page="0"]').getBoundingClientRect().width`)]);
  for (let i = 0; i < 12; i++) { await js(`(()=>{const m=document.querySelector('main'); const r=m.getBoundingClientRect(); m.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:30,clientX:r.left+900,clientY:r.top+300,bubbles:true,cancelable:true}))})()`); await sleep(90); }
  await sleep(250);
  ok("and zooming out keeps it centred", Math.abs(await centreOff()) <= 12, await centreOff());
  await key("0", ["control"]); await sleep(200);

  // screen-time bar
  const bar0 = await js(`(()=>{const b=document.querySelector('footer [role=progressbar]'); return b ? {now:+b.getAttribute('aria-valuenow'), max:+b.getAttribute('aria-valuemax'), text:b.getAttribute('aria-valuetext')} : null})()`);
  ok("the status bar shows a screen-time progress bar", !!bar0 && bar0.max === 90, bar0);
  await tab("Document"); await btn("Target Length"); await sleep(250);
  await js(`document.querySelectorAll('[role=dialog] button')[1] && [...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='30 min').click()`); await sleep(200);
  await key("Escape"); await sleep(250);
  ok("changing the target length updates the bar", await js(`document.querySelector('footer [role=progressbar]')?.getAttribute('aria-valuemax')`) === "30", await js(`document.querySelector('footer [role=progressbar]')?.getAttribute('aria-valuemax')`));

  // themes: every surface follows the theme, the page edge and text are visible
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  for (const mode of ["Night", "Midnight", "Day"]) {
    await tab("View"); await btn(mode); await sleep(300);
    await js(`document.querySelector('textarea').focus()`);
    const th = await js(`(()=>{const cs=(e)=>e?getComputedStyle(e):null; const sheet=document.querySelector('[data-page="0"]'); const line=sheet.querySelector('.page-line'); const caret=document.querySelector('.caret')||document.querySelector('[data-page] .caret');
      return {paper:cs(sheet).backgroundColor, ink:cs(line).color, edge:cs(sheet).boxShadow, ribbon:cs(document.querySelector('[role=tabpanel]')).backgroundColor, nav:cs(document.querySelector('aside[aria-label="Scene Navigator"]'))?.backgroundColor, canvas:cs(document.querySelector('main')).backgroundColor, caret: caret?cs(caret).backgroundColor:null, ribbonInk: cs(document.querySelector('[role=tabpanel] button')).color}})()`);
    const dark = mode !== "Day";
    ok(`${mode}: page text is readable (contrast >= 7)`, contrast(th.paper, th.ink) >= 7, th);
    ok(`${mode}: the page edge is drawn and distinct from the canvas`, /rgb/.test(th.edge) && contrast(th.paper, th.canvas) >= 1.0 && th.edge !== "none", th);
    ok(`${mode}: the cursor is visible against the page`, th.caret === null || contrast(th.paper, th.caret) >= 7, th);
    ok(`${mode}: ribbon and navigator follow the theme`, dark ? lum(th.ribbon) < 0.12 && lum(th.nav) < 0.12 && contrast(th.ribbon, th.ribbonInk) >= 7 : lum(th.ribbon) > 0.6 && lum(th.nav) > 0.6, th);
    if (mode !== "Day") await wc.capturePage().then((i) => fs.writeFileSync(`/tmp/shot/theme-${mode.toLowerCase()}.png`, i.toPNG()));
  }

  // immersive writing
  await tab("View"); await btn("Immersive"); await sleep(500);
  const imm = await js(`({header: !!document.querySelector('header'), ribbon: !!document.querySelector('nav[aria-label=Ribbon]'), nav: !!document.querySelector('aside'), footer: !!document.querySelector('footer'), page: !!document.querySelector('[data-page="0"]'), full: document.fullscreenElement !== null})`);
  ok("immersive mode hides header, ribbon, navigator and status bar but keeps the page", !imm.header && !imm.ribbon && !imm.nav && !imm.footer && imm.page, imm);
  ok("the desktop window goes full screen in immersive mode", w.isFullScreen(), w.isFullScreen());
  await type("x"); await sleep(120);
  if ((await opts()).length) { await key("Escape"); await sleep(150); }
  await key("Escape"); await sleep(500);
  ok("Esc leaves immersive mode and restores the panels", await js(`!!document.querySelector('header') && !!document.querySelector('nav[aria-label=Ribbon]') && !!document.querySelector('footer')`) && !w.isFullScreen());
  await key("F11"); await sleep(500);
  ok("F11 toggles immersive mode", await js(`!document.querySelector('header')`));
  await key("F11"); await sleep(400);

  // Open / Open Recent / .fdx
  await tab("File"); await btn("Open Recent"); await sleep(600);
  ok("File > Open Recent lists recent scripts", await js(`[...document.querySelectorAll('[role=dialog] ul button')].length >= 2`));
  const opened = await js(`(()=>{const b=[...document.querySelectorAll('[role=dialog] ul button')].find(x=>x.textContent.includes('The Last Light')); if(!b) return false; b.click(); return true})()`); await sleep(2000);
  ok("clicking a recent script opens it", opened && (await js(`location.pathname`)).startsWith("/scripts/") && (await js(`document.querySelector('header').innerText`)).includes("The Last Light"));
  await tab("File"); await btn("Open"); await sleep(300);
  const fdxReal = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?><FinalDraft DocumentType="Script" Template="No" Version="2"><Content><Paragraph Type="Scene Heading"><SceneProperties Length="1/8" Page="1" Title=""/><Text>EXT. HARBOR - DAWN</Text></Paragraph><Paragraph Type="Action"><Text>Gulls </Text><Text Style="Italic">circle</Text><Text> the cranes.</Text></Paragraph><Paragraph Type="Character"><Text>OLD MAN</Text></Paragraph><Paragraph Type="Dialogue"><Text>Tide is turning.</Text></Paragraph></Content><TitlePage><Content><Paragraph Alignment="Center"><Text>HARBOR LIGHTS</Text></Paragraph></Content></TitlePage></FinalDraft>';
  await js(`(()=>{const i=document.querySelector('[role=dialog] input[type=file]'); const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(fdxReal)}], 'Harbor.fdx')); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  for (let i = 0; i < 60; i++) { await sleep(150); if ((await rows()).includes("EXT. HARBOR - DAWN")) break; }
  const hr = await rows();
  ok("File > Open opens a Final Draft .fdx (formatting and title page kept)", hr.includes("EXT. HARBOR - DAWN") && hr.some((l) => l.includes("Gulls circle")) && hr.includes("OLD MAN") && await js(`document.querySelector('main .sheet').innerText.toUpperCase().includes('HARBOR LIGHTS')`), hr);
  // the scripts list (first page) has Open file and the recent list
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts`); await sleep(1000);
  ok("the first page offers Open file… and Recent scripts", await js(`/open file/i.test(document.body.innerText) && /recent scripts/i.test(document.body.innerText) && !!document.querySelector('input[aria-label="Choose a screenplay file"]')`));
  await js(`(()=>{const i=document.querySelector('input[aria-label="Choose a screenplay file"]'); const dt=new DataTransfer(); dt.items.add(new File(["Title: From The List\\n\\nINT. ATTIC - DAY\\n\\nDust.\\n"], 'List.fountain')); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  for (let i = 0; i < 60; i++) { await sleep(150); if ((await js(`location.pathname`)).startsWith("/scripts/")) break; }
  await sleep(1200);
  ok("Open file… on the first page opens a screenplay", (await rows()).includes("INT. ATTIC - DAY"), await rows());

  // ---- performance: a 120-page script
  const big = await js(`(async()=>{
    const types=['Scene Heading','Action','Character','Dialogue','Action','Character','Parenthetical','Dialogue'];
    const lorem=['Rain hammers the glass as the lamp swings overhead. She counts the steps again.','I never said that, and you know it. Not once, not in all these years.','(quietly)','Then why does it feel like I did?'];
    const els=[]; for(let s=0;s<430;s++){ els.push({id:'h'+s,type:'Scene Heading',runs:[{text:'INT. ROOM '+s+' - NIGHT'}]}); els.push({id:'a'+s,type:'Action',runs:[{text:lorem[0].repeat(2)}]}); els.push({id:'c'+s,type:'Character',runs:[{text:s%2?'MARA':'IRIS'}]}); els.push({id:'d'+s,type:'Dialogue',runs:[{text:lorem[1]+' '+lorem[3]}]}); els.push({id:'k'+s,type:'Character',runs:[{text:s%2?'IRIS':'MARA'}]}); els.push({id:'p'+s,type:'Parenthetical',runs:[{text:lorem[2]}]}); els.push({id:'e'+s,type:'Dialogue',runs:[{text:lorem[3]}]}); }
    const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Big',elements:els})}); return (await r.json()).id })()`);
  const t0 = Date.now();
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${big}`);
  let first = -1; for (let i = 0; i < 100 && first < 0; i++) { first = await js(`document.querySelector('[data-page="0"] .page-line') ? Math.round(performance.now()) : -1`); if (first < 0) await sleep(20); }
  const pageCount = await js(`Number(document.querySelector('footer').innerText.match(/of (\\d+)/)?.[1])`);
  ok("120+ page script opens and page 1 renders in under 1s", first > 0 && first < 1000 && pageCount >= 100, { firstMs: first, wall: Date.now() - t0, pageCount });
  const perf = await js(`(async()=>{
    const ta=document.querySelector('textarea'); ta.focus();
    const raf=()=>new Promise(r=>requestAnimationFrame(()=>r()));
    const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    const key=(k,o={})=>ta.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...o}));
    const pages=()=>document.querySelector('footer').innerText.match(/of (\\d+)/)[1];
    const p0=pages(); const times=[];
    for(const c of 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn'){ const t=performance.now(); set.call(ta,c); ta.dispatchEvent(new Event('input',{bubbles:true})); times.push(performance.now()-t); }
    await raf(); times.sort((a,b)=>a-b);
    const typeMed=times[20], typeMax=times[times.length-1];
    for(let i=0;i<200;i++) key('Enter');
    await raf(); const p1=pages();
    const u=performance.now(); for(let i=0;i<200;i++) key('z',{ctrlKey:true}); await raf(); const undoMs=performance.now()-u;
    await new Promise(r=>setTimeout(r,200));
    return {typeMed,typeMax,undoMs,p0,p1,p2:pages()};
  })()`);
  ok("typing in a 120-page script costs about one frame per key or less (median < 20ms in software rendering)", perf.typeMed < 20, perf);
  ok("200 Enters then 200 undos restore the page count", perf.p1 >= perf.p0 && perf.p2 === perf.p0 || perf.p2 <= perf.p0 + 1, perf);
  ok("200 undos complete in under 2s", perf.undoMs < 2000, perf);

  // ---- import (.fountain and .fdx) through the File tab's hidden file input
  const importVia = async (name, content) => {
    await js(`(()=>{const i=document.querySelector('input[aria-label="Import file"]'); const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)})); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    for (let i = 0; i < 80; i++) { await sleep(100); if (await js(`document.querySelector('[data-page="0"] .page-line')?.textContent ?? ''`)) { const t = await rows(); if (t.length && !t[0].includes("ROOM 0")) break; } }
    await sleep(500); return rows();
  };
  const fr = await importVia("Pilot.fountain", "Title: Imported One\nAuthor: Test Author\n\nINT. DINER - NIGHT\n\nSteam rises from a *chipped* mug.\n\nMARA\nYou're late.\n");
  ok("Fountain import opens a new script with the content", fr.includes("INT. DINER - NIGHT") && fr.some((l) => l.includes("YOU'RE LATE") || l.includes("You're late")) , fr);
  ok("Fountain import keeps the title page", await js(`document.querySelector('main .sheet').innerText.toUpperCase().includes('IMPORTED ONE')`));
  const fdx = '<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content><Paragraph Type="Scene Heading"><Text>EXT. PIER - DAWN</Text></Paragraph><Paragraph Type="Action"><Text Style="Bold">Gulls wheel overhead.</Text></Paragraph></Content></FinalDraft>';
  const xr = await importVia("Pier.fdx", fdx);
  ok("FDX import opens a new script with the content", xr.includes("EXT. PIER - DAWN") && xr.some((l) => l.includes("Gulls wheel")), xr);
  ok("FDX bold survives import", await js(`!!document.querySelector('[data-page="0"] .page-line span[style*="700"]')`));

  // ---- persistence in the file store + PDF export
  await sleep(1800);
  const files = fs.readdirSync(data).filter((f) => f.endsWith(".json"));
  ok("scripts are saved as JSON files in the data folder", files.length >= 2, files);
  const saved = files.map((f) => JSON.parse(fs.readFileSync(path.join(data, f), "utf8"))).find((d) => d.title === "The Last Light");
  ok("saved file has revision lock + title page meta", saved.meta?.revision?.locked?.length > 0 && saved.meta?.titlePage?.Title === "The Last Light" && saved.rev > 0, saved.meta);
  const llId = JSON.parse(JSON.stringify(files.map((f) => JSON.parse(fs.readFileSync(path.join(data, f), "utf8"))).find((d) => d.title === "The Last Light"))).id;
  const r = await js(`window.guionista.exportPdf(${JSON.stringify(llId)}, 'The Last Light')`);
  ok("PDF export succeeds", r.ok, r);
  ok("PDF file exists and is a PDF", fs.existsSync(pdfOut) && fs.readFileSync(pdfOut).subarray(0, 5).toString() === "%PDF-");
  await sleep(300);
  ok("no console errors", errors.length === 0, errors);
  const failed = results.filter((x) => !x.pass);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, failures: failed, pdf: pdfOut, data }, null, 1));
  fs.copyFileSync(pdfOut, "/tmp/shot/e2e-out.pdf");
  await w.webContents.capturePage().then((i) => fs.writeFileSync("/tmp/shot/e2e-final.png", i.toPNG()));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ crash: String(e && e.stack || e), results })); process.exit(1); });
