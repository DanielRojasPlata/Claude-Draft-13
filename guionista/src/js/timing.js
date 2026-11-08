/* Estimación de tiempo en pantalla */
(function (root) {
  const M = typeof require === 'function' ? require('./model.js') : root.G.model;
  const DEFAULTS = { dialogueWps: 2.7, actionWps: 3.3, scene: 2.5, transition: 1.5, shot: 1.5, paren: 1.0, general: 2 };

  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  function blockSeconds(b, p) {
    const t = M.htmlToText(b.html);
    const w = words(t);
    switch (b.type) {
      case 'scene': return p.scene;
      case 'action': return w ? w / p.actionWps + 0.5 : 0;
      case 'dialogue': return w ? w / p.dialogueWps + 0.4 : 0;
      case 'parenthetical': return w ? p.paren : 0;
      case 'transition': return w ? p.transition : 0;
      case 'shot': return w ? p.shot : 0;
      case 'general': return w ? p.general : 0;
      default: return 0; // character, note
    }
  }

  // Devuelve {total, perBlock: Map id->s, perScene: [{id, seconds}]}
  function estimate(doc, params) {
    const p = Object.assign({}, DEFAULTS, params || {});
    let total = 0;
    const perScene = [];
    let cur = null;
    for (const b of doc.blocks) {
      const s = blockSeconds(b, p);
      total += s;
      if (b.type === 'scene') { cur = { id: b.id, seconds: 0 }; perScene.push(cur); }
      if (cur) cur.seconds += s;
    }
    return { total, perScene };
  }

  function wordCount(doc) {
    let n = 0;
    for (const b of doc.blocks) if (b.type !== 'note') n += words(M.htmlToText(b.html));
    return n;
  }

  function format(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p2 = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
  }

  const api = { DEFAULTS, blockSeconds, estimate, wordCount, format, words };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.timing = api; }
})(typeof self !== 'undefined' ? self : globalThis);
