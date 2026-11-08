const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
app.disableHardwareAcceleration();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
let sentState = null;
for (const [c, v] of [['app:initial-file', null], ['autosave:read', null], ['app:version', 'test']]) ipcMain.handle(c, () => v);
ipcMain.handle('file:read', (_e, f) => ({ path: f, name: path.basename(f), ext: path.extname(f), data: fs.readFileSync(f, 'utf8') }));
ipcMain.handle('app:confirm', () => 1);
for (const c of ['app:set-dirty', 'app:set-theme']) ipcMain.on(c, () => {});
ipcMain.on('app:state', (_e, s) => { sentState = s; });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: true, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true } });
  const errors = [];
  win.webContents.on('console-message', (e) => { if ((e.level === 'error' || e.level === 3)) errors.push(e.message); });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html')); await sleep(500);
  const ev = (js) => win.webContents.executeJavaScript(js);
  const menu = async (a, arg) => { win.webContents.send('menu', a, arg); await sleep(500); };
  // guion largo en Fountain
  let src = 'Title: Largo\nAuthor: Test\n\n';
  for (let i = 1; i <= 40; i++) src += `INT. LUGAR ${i % 5} - DÍA\n\nAlguien camina por el lugar observando todo con mucho detenimiento y cuidado, pensando en lo ocurrido ayer.\n\nANA\n(bajito)\nNo sé si deba decirlo. ${'Esto es una frase larga de diálogo. '.repeat(6)}\n\nLUIS\nClaro que sí.\n\nCORTE A:\n\n`;
  const f = path.join(os.tmpdir(), 'largo.fountain'); fs.writeFileSync(f, src);
  await menu('open-path', f); await sleep(700);
  const n = await ev("document.querySelectorAll('#script .blk').length");
  ok(n > 200, 'importa Fountain: ' + n + ' bloques');
  const pages = await ev("document.getElementById('stPage').textContent");
  ok(/de (\d+)/.exec(pages) && +/de (\d+)/.exec(pages)[1] >= 8, 'paginación: ' + pages);
  ok((await ev("document.querySelectorAll('.pgbreak').length")) >= 7, 'separadores de página visibles');
  ok((await ev("document.querySelectorAll('#sideList .side-item').length")) === 40, '40 escenas en el navegador');
  // formatos
  await menu('format:sitcom'); await sleep(300);
  const pages2 = await ev("document.getElementById('stPage').textContent");
  ok(pages2 !== pages, 'formato sitcom cambia paginación: ' + pages2);
  await menu('format:feature-letter');
  // numeración de escenas
  await menu('toggle-scene-numbers');
  ok((await ev("document.querySelectorAll('.blk[data-sn]').length")) === 40, 'números de escena');
  await menu('toggle-lock'); 
  ok((await ev("document.querySelectorAll('.blk[data-sn]').length")) === 40, 'numeración bloqueada');
  // buscar
  await menu('find'); await ev("(()=>{const i=document.getElementById('findInput');i.value='ana';i.dispatchEvent(new Event('input'))})()"); await sleep(300);
  const fc = await ev("document.getElementById('findCount').textContent");
  ok(/1\/40/.test(fc), 'buscar "ana" (sin distinguir mayúsculas): ' + fc);
  await ev("(()=>{document.getElementById('replaceInput').value='EVA';document.getElementById('replaceAll').click()})()"); await sleep(400);
  ok((await ev("document.querySelector('#script').textContent.includes('EVA')")) && !(await ev("/ANA(?![A-Za-z])/.test(document.querySelector('#script').textContent)")), 'reemplazar todo');
  await ev("document.activeElement.blur(); document.getElementById('script').focus()");
  await menu('undo'); await sleep(300);
  ok(await ev("document.querySelector('#script').textContent.includes('ANA') && !document.querySelector('#script').textContent.includes('EVA')"), 'deshacer reemplazo');
  await menu('redo'); await sleep(300);
  ok(await ev("document.querySelector('#script').textContent.includes('EVA')"), 'rehacer reemplazo');
  await ev("document.getElementById('findClose').click()");
  // fichas
  await menu('main:cards');
  ok((await ev("document.querySelectorAll('.card').length")) === 40, 'fichas: 40 tarjetas');
  // mover escena
  await ev("(()=>{})()");
  fs.writeFileSync('/tmp/shot-cards.png', (await win.webContents.capturePage()).toPNG());
  await menu('main:script');
  // reportes
  await menu('report-characters');
  ok((await ev("document.querySelector('.modal table') && document.querySelectorAll('.modal tbody tr').length")) === 2, 'reporte de personajes');
  await ev("document.querySelector('.modal .mf .btn.primary').click()"); await sleep(200);
  // tema, foco
  await menu('timing-prefs'); await ev("document.querySelector('.modal .mf .btn.primary').click()"); await sleep(200);
  await menu('revision:blue');
  ok(sentState && sentState.revision === 'blue', 'estado enviado al menú (revisión)');
  // editor de formato
  await menu('edit-format');
  ok(await ev("!!document.querySelector('.modal.wide table')"), 'editor de formato abre');
  await ev("document.querySelector('.modal .mf .btn.primary').click()"); await sleep(300);
  ok((await ev("document.getElementById('formatSelect').value")) === 'custom', 'formato personalizado activo');
  // modo oscuro + captura
  await menu('theme:dark'); await sleep(800);
  await ev("document.querySelector('#script .blk').scrollIntoView()");
  fs.writeFileSync('/tmp/shot-long.png', (await win.webContents.capturePage()).toPNG());
  ok(errors.length === 0, 'sin errores de consola: ' + errors.join(' | '));
  console.log(out.join('\n'));
  app.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
});
