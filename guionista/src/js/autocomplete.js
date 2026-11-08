/* Sugerencias de autocompletado (puras, testeables) */
(function (root) {
  const M = typeof require === 'function' ? require('./model.js') : root.G.model;
  const LG = typeof require === 'function' ? require('./lang.js') : root.G.lang;

  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const startsWith = (a, q) => norm(a).startsWith(norm(q));

  // Contexto del documento: localizaciones y personajes usados
  function collect(doc) {
    const locs = new Map();
    const chars = new Map();
    const lang = LG.get(doc.settings.lang);
    for (const b of doc.blocks) {
      const t = M.htmlToText(b.html).trim();
      if (!t) continue;
      if (b.type === 'scene') {
        const m = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|EST\.?|I\/E\.?)\s+(.*?)(?:\s+-\s+[^-]*)?$/i.exec(t);
        if (m && m[2]) locs.set(m[2].toUpperCase(), (locs.get(m[2].toUpperCase()) || 0) + 1);
      } else if (b.type === 'character') {
        const name = t.replace(/\s*\(.*\)\s*$/, '').toUpperCase();
        if (name) chars.set(name, (chars.get(name) || 0) + 1);
      }
    }
    void lang;
    const byCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
    return { locations: byCount(locs), characters: byCount(chars) };
  }

  /**
   * Devuelve {from, items:[string]} donde 'from' es el índice del texto a reemplazar (hasta el final del texto).
   */
  function suggest(type, text, ctx, langId) {
    const lang = LG.get(langId);
    const items = [];
    if (type === 'scene') {
      const dash = /\s-\s([^-]*)$/.exec(text);
      if (dash) {
        const from = dash.index + 3;
        const q = dash[1];
        for (const t of lang.times) if (startsWith(t, q) && norm(t) !== norm(q)) items.push(t);
        return { from, items, kind: 'time' };
      }
      const pm = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|EST\.|I\/E\.)\s+(.*)$/i.exec(text);
      if (pm) {
        const from = pm[1].length + 1;
        const q = pm[2];
        for (const l of ctx.locations) if (startsWith(l, q) && norm(l) !== norm(q)) items.push(l);
        return { from, items: items.slice(0, 8), kind: 'location' };
      }
      const q = text.trim();
      for (const p of lang.prefixes) if (!q || (startsWith(p, q) && norm(p) !== norm(q))) items.push(p + ' ');
      return { from: 0, items, kind: 'prefix' };
    }
    if (type === 'character') {
      const ext = /\s\(([^)]*)$/.exec(text);
      if (ext) {
        for (const x of lang.extensions) if (startsWith(x, ext[1]) && norm(x) !== norm(ext[1])) items.push(x + ')');
        return { from: ext.index + 2, items };
      }
      if (!text.trim()) return { from: 0, items: ctx.characters.slice(0, 8) };
      for (const c of ctx.characters) if (startsWith(c, text) && norm(c) !== norm(text)) items.push(c);
      return { from: 0, items: items.slice(0, 8) };
    }
    if (type === 'transition') {
      for (const t of lang.transitions) if (!text.trim() || (startsWith(t, text) && norm(t) !== norm(text))) items.push(t);
      return { from: 0, items };
    }
    if (type === 'shot') {
      for (const t of lang.shots) if (!text.trim() || (startsWith(t, text) && norm(t) !== norm(text))) items.push(t);
      return { from: 0, items };
    }
    return { from: 0, items };
  }

  const api = { collect, suggest, norm };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.autocomplete = api; }
})(typeof self !== 'undefined' ? self : globalThis);
