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
  const id = await js(`(async()=>{const L='Rain hammers the glass as the lamp swings overhead. She counts the steps again. ';const els=[];for(let s=0;s<430;s++){els.push({id:'h'+s,type:'Scene Heading',runs:[{text:'INT. ROOM '+s+' - NIGHT'}]},{id:'a'+s,type:'Action',runs:[{text:L.repeat(2)}]},{id:'c'+s,type:'Character',runs:[{text:'MARA'}]},{id:'d'+s,type:'Dialogue',runs:[{text:L}]},{id:'k'+s,type:'Character',runs:[{text:'IRIS'}]},{id:'p'+s,type:'Parenthetical',runs:[{text:'(quietly)'}]},{id:'e'+s,type:'Dialogue',runs:[{text:'Then why?'}]});}
    const r=await fetch('/api/scripts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Big',elements:els})});return (await r.json()).id})()`);
  await wc.loadURL(`${new URL(wc.getURL()).origin}/scripts/${id}`); await sleep(1500);
  await js(`document.querySelector('textarea').focus()`);
  wc.debugger.attach("1.3"); await wc.debugger.sendCommand("Profiler.enable"); await wc.debugger.sendCommand("Profiler.setSamplingInterval", { interval: 200 }); await wc.debugger.sendCommand("Profiler.start");
  const t = await js(`(async()=>{const ta=document.querySelector('textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const a=performance.now();for(const c of 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn'){set.call(ta,c);ta.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,0));}return (performance.now()-a)/40})()`);
  const { profile } = await wc.debugger.sendCommand("Profiler.stop");
  const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas; profile.samples.forEach((sid, i) => { const n = byId.get(sid); const k = `${n.callFrame.functionName || "(anon)"} ${path.basename(n.callFrame.url)}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + dt[i] / 1000); });
  console.log("ms/key (incl. event-loop turn):", t.toFixed(1));
  console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${v.toFixed(0).padStart(6)}ms  ${k}`).join("\n"));
  process.exit(0);
})();
