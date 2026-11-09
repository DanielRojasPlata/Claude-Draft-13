const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
process.env.GUIONISTA_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-")); process.env.GUIONISTA_DOCS = fs.mkdtempSync(path.join(os.tmpdir(), "gdocs-"));
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("unhandledRejection", (e) => { console.log("ERR", e); process.exit(1); });
(async () => {
  let w; for (let i = 0; i < 300 && !(w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/scripts"))); i++) await sleep(100);
  const wc = w.webContents; const js = (s) => wc.executeJavaScript(s); await sleep(500);
  await js(`document.querySelector('li a').click()`); await sleep(1800);
  const info = (l) => js(`(()=>{const m=document.querySelector('main'); const p=document.querySelector('[data-page="0"]').getBoundingClientRect(); const mr=m.getBoundingClientRect(); const wrap=m.firstElementChild.getBoundingClientRect(); return {scrollLeft:Math.round(m.scrollLeft), scrollWidth:m.scrollWidth, clientWidth:m.clientWidth, pageL:Math.round(p.left-mr.left), pageW:Math.round(p.width), wrapL:Math.round(wrap.left-mr.left), wrapW:Math.round(wrap.width), off:Math.round((p.left+p.right)/2-(mr.left+mr.right)/2)}})()`).then((x) => console.log(l, JSON.stringify(x)));
  await info("start");
  for (let i = 0; i < 6; i++) { await js(`(()=>{const m=document.querySelector('main'); const r=m.getBoundingClientRect(); m.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-30,clientX:r.left+60,clientY:r.top+200,bubbles:true,cancelable:true}))})()`); await sleep(120); await info("zoom" + i); }
  process.exit(0);
})();
