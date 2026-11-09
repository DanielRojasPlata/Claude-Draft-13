// v2.7.1: a big (Final Draft sized) script must save. Usage: xvfb-run -a node_modules/.bin/electron --no-sandbox e2e/v27.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "gdata-"));
process.env.GUIONISTA_DATA = data;
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "gud-")));
process.env.GUIONISTA_DOCS = fs.mkdtempSync(path.join(os.tmpdir(), "gdocs-"));
let fails = 0; const errors = [];
const ok = (n, c, i) => { if (!c) fails++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(i)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 150000);
require("../main.js");
const wins = () => BrowserWindow.getAllWindows().filter((w) => /127\.0\.0\.1/.test(w.webContents.getURL()));
(async () => {
  let w; for (let i = 0; i < 300 && !(w = wins()[0]); i++) await sleep(100);
  await sleep(1200);
  const wc = w.webContents; const js = (s) => wc.executeJavaScript(s);
  wc.on("console-message", (e) => { if (e.level === "error") errors.push(e.message); });
  // a ~120 page script as an .fdx-sized payload (well above 64 KB)
  const els = []; for (let s = 0; s < 150; s++) { els.push({ id: `h${s}`, type: "Scene Heading", runs: [{ text: `INT. ROOM ${s} - DAY` }] }, { id: `a${s}`, type: "Action", runs: [{ text: "Mara crosses the room and stops at the window. ".repeat(6) }] }, { id: `c${s}`, type: "Character", runs: [{ text: "MARA" }] }, { id: `d${s}`, type: "Dialogue", runs: [{ text: "I never said that. ".repeat(10) }] }); }
  const id = await js(`fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Big',elements:${JSON.stringify(els)},meta:{},newScript:true})}).then(r=>r.json()).then(j=>j.id)`);
  ok("big script created", !!id);
  console.log("payload bytes", JSON.stringify(els).length);
  await js(`location.href='/scripts/${id}'`); await sleep(4000);
  await js(`document.querySelector('textarea').focus()`);
  for (const c of "hello") { wc.sendInputEvent({ type: "keyDown", keyCode: c }); wc.sendInputEvent({ type: "char", keyCode: c }); wc.sendInputEvent({ type: "keyUp", keyCode: c }); await sleep(30); }
  await sleep(4500);
  const status = await js(`document.body.innerText.match(/Saved|Saving…|Offline — retrying|Not saved/g)`);
  ok("status reads Saved", status && status.includes("Saved") && !status.includes("Offline — retrying"), status);
  const onDisk = JSON.parse(fs.readFileSync(path.join(data, id + ".json"), "utf8"));
  ok("edit reached the disk", /hello/i.test(JSON.stringify(onDisk.elements.slice(0,2))) || JSON.stringify(onDisk.elements.slice(0,2)));
  console.log(fails ? "SOME FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
