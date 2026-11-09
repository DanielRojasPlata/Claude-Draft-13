const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
process.env.GUIONISTA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-"));
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("unhandledRejection", (e) => { console.log("ERR", e); process.exit(1); });
(async () => {
  let w; for (let i = 0; i < 300 && !(w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/scripts"))); i++) await sleep(100);
  const wc = w.webContents; const js = (s) => wc.executeJavaScript(s); await sleep(500);
  const qa = await js(`(async()=>{const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Qa',elements:[{id:'q0',type:'Action',runs:[{text:'Hello there'}]},{id:'q1',type:'Action',runs:[{text:'split here and then some more text'}]}]})});return (await r.json()).id})()`);
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${qa}`); await sleep(1500);
  for (let i = 0; i < 40 && !(await js(`document.querySelectorAll('.sp-bad').length`)); i++) await sleep(400);
  await sleep(2500);
  // corner geometry
  const vh = await js(`innerHeight`), vw = await js(`innerWidth`);
  const pg = await js(`(()=>{const r=document.querySelector('[data-page="0"]').getBoundingClientRect(); return {r:r.right}})()`);
  const mb = await js(`document.querySelector('main').getBoundingClientRect().bottom`);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" }); await sleep(200);
  wc.sendInputEvent({ type: "mouseDown", x: Math.round(pg.r - 14), y: Math.round(mb - 10), button: "right", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x: Math.round(pg.r - 14), y: Math.round(mb - 10), button: "right", clickCount: 1 }); await sleep(400);
  console.log("MENUS", JSON.stringify(await js(`[...document.querySelectorAll('[role=menu]')].map(m=>{const r=m.getBoundingClientRect(); return [Math.round(r.top),Math.round(r.bottom),Math.round(r.left),Math.round(r.right), m.children.length]})`)), "vh", vh, "vw", vw);
  for (let k = 0; k < 6; k++) {
    await js(`(()=>{const it=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('Format')); if (it) { it.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); it.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false})); }})()`); await sleep(300);
    console.log("TRY", k, JSON.stringify(await js(`[...document.querySelectorAll('[role=menu]')].length`)), JSON.stringify(await js(`[...document.querySelectorAll('[role=menu] > div > [role=menuitem], [role=menu] > div > [role=menuitemcheckbox]')].length`)));
  }
  console.log("ITEMS", JSON.stringify(await js(`[...document.querySelectorAll('[role=menu] > div > *')].map(e=>e.textContent.trim().slice(0,22))`)));
  console.log("AFTER HOVER", JSON.stringify(await js(`[...document.querySelectorAll('[role=menu]')].map(m=>{const r=m.getBoundingClientRect(); return [Math.round(r.top),Math.round(r.bottom),Math.round(r.left),Math.round(r.right)]})`)));
  process.exit(0);
})();
