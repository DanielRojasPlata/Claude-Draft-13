/* Formatos de industria y plantillas personalizables */
(function (root) {
  const PAGES = { letter: { w: 8.5, h: 11 }, a4: { w: 8.27, h: 11.69 } };
  const FONT = '"Courier Prime","Courier New",Courier,"Liberation Mono",Cousine,monospace';
  const el = (left, width, o) => Object.assign({ left, width, caps: false, bold: false, italic: false, underline: false, align: 'left', before: 1, spacing: 1 }, o || {});

  function standard(pageKey) {
    return {
      name: 'Largometraje', pageSize: pageKey, font: FONT, fontSize: 12,
      margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
      pageNumbers: true,
      elements: {
        scene: el(1.5, 6.0, { caps: true, bold: false, before: 2 }),
        action: el(1.5, 6.0, { before: 1 }),
        character: el(3.7, 3.3, { caps: true, before: 1 }),
        parenthetical: el(3.1, 2.0, { before: 0 }),
        dialogue: el(2.5, 3.5, { before: 0 }),
        transition: el(5.5, 2.0, { caps: true, align: 'right', before: 1 }),
        shot: el(1.5, 6.0, { caps: true, before: 1 }),
        general: el(1.5, 6.0, { align: 'center', bold: true, underline: true, caps: true, before: 1 }),
        note: el(1.5, 6.0, { before: 1 })
      }
    };
  }

  const PRESETS = {
    'feature-letter': Object.assign(standard('letter'), { name: 'Largometraje (Carta)' }),
    'feature-a4': Object.assign(standard('a4'), { name: 'Largometraje (A4)' }),
    'tv-hour': (() => {
      const f = standard('letter'); f.name = 'TV – Drama 1 hora';
      f.elements.scene.bold = true; f.elements.general.before = 2; return f;
    })(),
    sitcom: (() => {
      const f = standard('letter'); f.name = 'Sitcom (interlineado doble)';
      f.elements.dialogue.spacing = 2; f.elements.parenthetical.spacing = 2; f.elements.action.spacing = 2;
      f.elements.action.caps = false; f.elements.scene.bold = true; f.elements.scene.underline = true; f.elements.scene.before = 2;
      f.elements.character.spacing = 2; f.elements.character.before = 1; return f;
    })(),
    theatre: (() => {
      const f = standard('letter'); f.name = 'Teatro';
      f.elements.character = el(4.0, 2.5, { caps: true, align: 'center', before: 1 });
      f.elements.dialogue = el(2.5, 4.0, { before: 0 });
      f.elements.action = el(2.5, 4.0, { italic: true, before: 1 });
      f.elements.scene = el(1.5, 6.0, { caps: true, bold: true, align: 'center', before: 2 });
      return f;
    })()
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

  // Valida/normaliza un formato (importado o editado)
  function sanitizeFormat(f) {
    const base = standard('letter');
    const out = { name: String((f && f.name) || 'Personalizado').slice(0, 60), pageSize: f && PAGES[f.pageSize] ? f.pageSize : 'letter' };
    out.font = typeof (f && f.font) === 'string' && /^[\w\s,"'-]{1,200}$/.test(f.font) ? f.font : base.font;
    out.fontSize = num(f && f.fontSize, 12, 8, 18);
    const m = (f && f.margins) || {};
    out.margins = { top: num(m.top, 1, 0.25, 3), bottom: num(m.bottom, 1, 0.25, 3), left: num(m.left, 1.5, 0.25, 3), right: num(m.right, 1, 0.25, 3) };
    out.pageNumbers = !(f && f.pageNumbers === false);
    out.elements = {};
    const page = PAGES[out.pageSize];
    for (const t of Object.keys(base.elements)) {
      const e = (f && f.elements && f.elements[t]) || {};
      const b = base.elements[t];
      const left = num(e.left, b.left, 0, page.w - 1);
      out.elements[t] = {
        left, width: num(e.width, b.width, 0.5, page.w - left),
        caps: !!e.caps, bold: !!e.bold, italic: !!e.italic, underline: !!e.underline,
        align: ['left', 'right', 'center'].includes(e.align) ? e.align : 'left',
        before: Math.round(num(e.before, b.before, 0, 4)), spacing: Math.round(num(e.spacing, b.spacing, 1, 3))
      };
    }
    return out;
  }

  // Valores derivados
  function metrics(fmt) {
    const page = PAGES[fmt.pageSize];
    const lineH = fmt.fontSize; // pt por línea (6 lpi a 12 pt)
    const charW = fmt.fontSize * 0.6; // pt
    const usableH = (page.h - fmt.margins.top - fmt.margins.bottom) * 72;
    const cols = (inches) => Math.max(1, Math.floor((inches * 72 + 0.01) / charW));
    return { page, lineH, charW, linesPerPage: Math.floor(usableH / lineH + 1e-6), cols };
  }

  function resolve(doc) {
    const id = doc.settings && doc.settings.formatId;
    if (id === 'custom' && doc.custom) return sanitizeFormat(doc.custom);
    return PRESETS[id] || PRESETS['feature-letter'];
  }

  const api = { PAGES, FONT, PRESETS, standard, clone, sanitizeFormat, metrics, resolve };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.formats = api; }
})(typeof self !== 'undefined' ? self : globalThis);
