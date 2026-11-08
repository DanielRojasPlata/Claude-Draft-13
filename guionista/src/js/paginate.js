/* Paginación determinista basada en líneas de fuente monoespaciada */
(function (root) {
  const M = typeof require === 'function' ? require('./model.js') : root.G.model;
  const F = typeof require === 'function' ? require('./formats.js') : root.G.formats;
  const LG = typeof require === 'function' ? require('./lang.js') : root.G.lang;

  // Corte de palabras voraz sobre {chars, flags}; devuelve [[from,to],...]
  function wrap(chars, width) {
    if (!chars.length) return [[0, 0]];
    const lines = [];
    let start = 0;
    const n = chars.length;
    while (start < n) {
      if (n - start <= width) { lines.push([start, n]); break; }
      let end = start + width; // exclusivo
      if (chars[end] === ' ') { lines.push([start, end]); start = end + 1; continue; }
      let k = end;
      while (k > start && chars[k - 1] !== ' ') k--;
      if (k === start) { lines.push([start, end]); start = end; } // palabra larga
      else { lines.push([start, k - 1]); start = k; }
    }
    return lines;
  }

  function applyCaps(parsed, caps) {
    if (!caps) return parsed;
    const chars = parsed.chars.map((c) => c.toUpperCase().length === 1 ? c.toUpperCase() : c);
    return { text: chars.join(''), chars, flags: parsed.flags };
  }

  function appendPlain(parsed, str, flag) {
    for (const ch of str) { parsed.chars.push(ch); parsed.flags.push(flag || 0); }
    parsed.text += str;
  }

  /**
   * @returns {{pages: Array<Array<Row>>, info: Map, linesPerPage:number}}
   * Row: {blockId,type,html,left,width,align,sceneNo?,rev?,blank?,kind}
   */
  function paginate(doc, fmt, opts) {
    opts = opts || {};
    const lang = LG.get(doc.settings.lang);
    const met = F.metrics(fmt);
    const LPP = met.linesPerPage;
    const sceneNums = M.numberScenes(doc);
    const showNums = !!doc.settings.sceneNumbers;
    const autoContd = doc.settings.autoContd !== false;

    // Preparar bloques imprimibles
    const items = [];
    let lastChar = null; // nombre del último personaje (para CONT'D)
    let curCharIdx = -1;
    doc.blocks.forEach((b) => {
      if (b.type === 'note') return;
      const e = fmt.elements[b.type] || fmt.elements.action;
      let p = M.parseInline(b.html);
      if (b.type === 'parenthetical') { appendPlain({ chars: [], flags: [], text: '' }, ''); p = { text: '(' + p.text + ')', chars: ['(', ...p.chars, ')'], flags: [0, ...p.flags, 0] }; }
      p = applyCaps(p, e.caps);
      if (b.type === 'character') {
        const name = p.text.replace(/\s*\(.*\)\s*$/, '').trim();
        const hasContd = /\(CONT/i.test(p.text);
        if (autoContd && lastChar && name && name === lastChar && !hasContd) appendPlain(p, ' ' + lang.contd, 0);
        lastChar = name || lastChar;
      }
      if (b.type === 'scene') lastChar = null;
      if (b.type === 'character') curCharIdx = items.length;
      const width = met.cols(e.width);
      let lines = wrap(p.chars, width);
      if (!p.chars.length && b.type !== 'action') lines = [[0, 0]];
      items.push({ b, e, p, lines, width, charIdx: b.type === 'dialogue' || b.type === 'parenthetical' ? curCharIdx : -1, sceneNo: b.type === 'scene' && showNums ? sceneNums.get(b.id) : null });
    });

    const pages = [[]];
    const info = new Map();
    let used = 0;
    const cur = () => pages[pages.length - 1];
    const newPage = () => { pages.push([]); used = 0; };
    const mkRow = (it, from, to, extra) => Object.assign({
      blockId: it.b.id, type: it.b.type, html: M.renderRun(it.p.chars, it.p.flags, from, to),
      left: it.e.left, width: it.e.width, align: it.e.align, spacing: it.e.spacing, rev: it.b.rev || null
    }, extra || {});
    const blank = (n) => { for (let k = 0; k < n; k++) cur().push({ blank: true, spacing: 1, blockId: null }); used += n; };
    const mark = (id, pg) => { const i = info.get(id); if (!i) info.set(id, { startPage: pg, endPage: pg }); else i.endPage = pg; };

    const contdRow = (it) => {
      if (it.b.type !== 'dialogue' || it.charIdx < 0) return;
      const ch = items[it.charIdx];
      const nm = ch.p.text.replace(/\s*\(.*\)\s*$/, '').trim();
      cur().push({ blockId: it.b.id, type: 'character', html: M.escapeHtml(nm + ' ' + lang.contd), left: ch.e.left, width: ch.e.width, align: ch.e.align, spacing: ch.e.spacing, kind: 'contd' });
      used += ch.e.spacing;
    };
    function placeLines(it, from, to) {
      for (let k = from; k < to; k++) {
        const [a, z] = it.lines[k];
        cur().push(mkRow(it, a, z, { first: k === 0, sceneNo: k === 0 ? it.sceneNo : null }));
        mark(it.b.id, pages.length);
        used += it.e.spacing;
      }
    }
    // Coloca un bloque dividiéndolo cuantas veces haga falta (huérfanas/viudas de 2 líneas)
    function flow(it, before) {
      const sp = it.e.spacing, L = it.lines.length;
      const splittable = it.b.type === 'action' || it.b.type === 'dialogue';
      const reserve = it.b.type === 'dialogue' ? 1 : 0;
      let from = 0;
      blank(before);
      while (from < L) {
        const room = Math.floor((LPP - used) / sp);
        if (L - from <= room) { placeLines(it, from, L); return; }
        let k = Math.min(room - reserve, L - from - 2);
        if (!splittable || k < 2 || (from === 0 && L < 4)) {
          if (used > 0) { newPage(); if (from > 0) contdRow(it); continue; }
          k = Math.max(1, room - reserve); // página vacía y aun así no cabe: forzar
        }
        placeLines(it, from, from + k);
        if (reserve) { cur().push({ blockId: it.b.id, type: 'more', html: M.escapeHtml(lang.more), left: it.e.left + 0.5, width: it.e.width, align: 'left', spacing: 1, kind: 'more' }); used += 1; }
        newPage();
        from += k;
        contdRow(it);
      }
    }

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const sp = it.e.spacing;
      const L = it.lines.length;
      let before = used === 0 ? 0 : it.e.before;
      const need = before + L * sp;
      // mantener con siguiente (escena, toma, general, personaje): la primera línea del siguiente debe caber
      const keep = ['scene', 'shot', 'general', 'character'].includes(it.b.type);
      let nextNeed = 0;
      if (keep && items[idx + 1]) { const nx = items[idx + 1]; nextNeed = nx.e.before + Math.min(2, nx.lines.length) * nx.e.spacing; }
      const canSplit = ['action', 'dialogue'].includes(it.b.type) && used + before + 2 * sp <= LPP;
      if (used > 0 && used + need + nextNeed > LPP && !canSplit) { newPage(); before = 0; }
      flow(it, before);
    }
    // quitar última página vacía
    if (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
    return { pages, info, linesPerPage: LPP };
  }

  const api = { paginate, wrap };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.paginate = api; }
})(typeof self !== 'undefined' ? self : globalThis);
