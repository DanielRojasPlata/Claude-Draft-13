const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/js/model.js');
const F = require('../src/js/fountain.js');
const FM = require('../src/js/formats.js');
const P = require('../src/js/paginate.js');
const T = require('../src/js/timing.js');
const A = require('../src/js/autocomplete.js');
const E = require('../src/js/export.js');

const mk = (...pairs) => { const d = M.newDoc(); d.blocks = pairs.map(([t, h]) => M.mkBlock(t, h)); return d; };

test('inline: parse/render conserva formato y escapa', () => {
  const p = M.parseInline('a <b>b&amp;c</b> <i>d</i>');
  assert.strictEqual(p.text, 'a b&c d');
  assert.strictEqual(M.renderRun(p.chars, p.flags, 0, p.chars.length), 'a <b>b&amp;c</b> <i>d</i>');
  assert.strictEqual(M.sanitizeHtml('<div onclick="x()"><strong>hi</strong><script>1</script><br></div>'), '<b>hi</b>1');
});

test('fountain: ida y vuelta conserva tipos', () => {
  const d = mk(['scene', 'INT. CASA - DÍA'], ['action', 'Juan entra <b>rápido</b>.'], ['character', 'JUAN'], ['parenthetical', 'susurrando'], ['dialogue', 'Hola <i>mundo</i>.'], ['transition', 'CORTE A:']);
  const back = F.parse(F.serialize(d));
  assert.deepStrictEqual(back.blocks.map((b) => b.type), ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition']);
  assert.strictEqual(back.blocks[1].html, 'Juan entra <b>rápido</b>.');
});

test('fountain: personaje y escena se exportan en mayúsculas', () => {
  const s = F.serialize(mk(['scene', 'int. casa - dia'], ['character', 'Juan'], ['dialogue', 'Hola']));
  assert.match(s, /^INT\. CASA - DIA$/m);
  assert.match(s, /^JUAN$/m);
});

test('paginación: 54 líneas por página en Carta y reparte diálogos con (MÁS)/(CONT\'D)', () => {
  const fmt = FM.PRESETS['feature-letter'];
  assert.strictEqual(FM.metrics(fmt).linesPerPage, 54);
  const d = M.newDoc(); d.blocks = [];
  for (let i = 0; i < 12; i++) { d.blocks.push(M.mkBlock('scene', 'INT. CASA - DÍA'), M.mkBlock('character', 'JUAN'), M.mkBlock('dialogue', 'No sé qué hacer con todo esto. '.repeat(14))); }
  const r = P.paginate(d, fmt);
  assert.ok(r.pages.length >= 3);
  for (const pg of r.pages) assert.ok(pg.reduce((n, x) => n + (x.spacing || 1), 0) <= 54, 'página desbordada');
  const kinds = r.pages.flat().map((x) => x.kind);
  assert.ok(kinds.includes('more') && kinds.includes('contd'));
});

test('paginación: encabezado de escena nunca queda solo al final de página', () => {
  const fmt = FM.PRESETS['feature-letter'];
  const d = M.newDoc(); d.blocks = [];
  for (let i = 0; i < 40; i++) d.blocks.push(M.mkBlock('action', 'Línea de acción ' + i), M.mkBlock('scene', 'EXT. CALLE - NOCHE'), M.mkBlock('action', 'Algo ocurre aquí.'));
  const r = P.paginate(d, fmt);
  for (const pg of r.pages) { const rows = pg.filter((x) => !x.blank); if (rows.length) assert.notStrictEqual(rows[rows.length - 1].type, 'scene'); }
});

test('paginación: CONT\'D automático para el mismo personaje', () => {
  const d = mk(['scene', 'INT. A - DÍA'], ['character', 'ANA'], ['dialogue', 'Hola'], ['action', 'Ella mira.'], ['character', 'ANA'], ['dialogue', 'Sigo']);
  const r = P.paginate(d, FM.PRESETS['feature-letter']);
  const chars = r.pages[0].filter((x) => x.type === 'character').map((x) => x.html);
  assert.strictEqual(chars[0], 'ANA'); assert.match(chars[1], /CONT'D/);
});

test('paginación: ancho de elementos estándar (60/33/35 columnas)', () => {
  const m = FM.metrics(FM.PRESETS['feature-letter']);
  const e = FM.PRESETS['feature-letter'].elements;
  assert.deepStrictEqual([m.cols(e.action.width), m.cols(e.dialogue.width), m.cols(e.character.width)], [60, 35, 33]);
});

test('timing: estima por contenido y formatea', () => {
  const d = mk(['scene', 'INT. A - DÍA'], ['dialogue', 'uno dos tres cuatro cinco seis siete ocho']);
  const e = T.estimate(d);
  assert.ok(e.total > 5 && e.total < 10);
  assert.strictEqual(T.format(125), '2:05');
});

test('autocompletado: prefijos, localizaciones, horas, personajes', () => {
  const d = mk(['scene', 'INT. COCINA - DÍA'], ['character', 'MARTA']);
  const ctx = A.collect(d);
  assert.deepStrictEqual(A.suggest('scene', 'in', ctx, 'es').items, ['INT. ', 'INT./EXT. ']);
  assert.deepStrictEqual(A.suggest('scene', 'INT. co', ctx, 'es').items, ['COCINA']);
  assert.ok(A.suggest('scene', 'INT. COCINA - no', ctx, 'es').items.includes('NOCHE'));
  assert.deepStrictEqual(A.suggest('character', 'ma', ctx, 'es').items, ['MARTA']);
});

test('numeración de escenas: bloqueada genera 12A', () => {
  const d = mk(['scene', 'A'], ['scene', 'B']);
  M.lockScenes(d, true);
  d.blocks.splice(1, 0, M.mkBlock('scene', 'NUEVA'));
  const n = M.numberScenes(d);
  assert.deepStrictEqual(d.blocks.map((b) => n.get(b.id)), ['1', '1A', '2']);
});

test('formato: sanitizeFormat limita valores peligrosos', () => {
  const f = FM.sanitizeFormat({ fontSize: 9999, font: 'x;}</style><script>', margins: { top: -4 }, elements: { action: { left: 99, width: 99 } } });
  assert.strictEqual(f.fontSize, 18);
  assert.ok(!/[<;}]/.test(f.font));
  assert.ok(f.margins.top >= 0.25);
  assert.ok(f.elements.action.left + f.elements.action.width <= 8.5 + 1e-9);
});

test('export: HTML imprimible escapa contenido y respeta tamaño de página', () => {
  const d = mk(['scene', 'INT. A - DÍA'], ['action', '<img src=x onerror=alert(1)> & más']);
  d.settings.watermark = '<b>x</b>';
  const html = E.buildHtml(d);
  assert.ok(!/<img /.test(html));
  assert.ok(!/<b>x<\/b>/.test(html));
  assert.match(html, /size:8\.5in 11in/);
});

test('paginación: un párrafo de acción de más de una página nunca desborda', () => {
  const fmt = FM.PRESETS['feature-letter'];
  const d = mk(['scene', 'INT. A - DÍA'], ['action', 'palabra '.repeat(1500)], ['dialogue', 'otra '.repeat(900)]);
  const r = P.paginate(d, fmt);
  assert.ok(r.pages.length >= 4);
  for (const pg of r.pages) assert.ok(pg.reduce((n, x) => n + (x.spacing || 1), 0) <= 54);
  const words = r.pages.flat().filter((x) => x.type === 'action').map((x) => x.html).join(' ').split(/\s+/).filter(Boolean).length;
  assert.strictEqual(words, 1500);
});
