/* Modelo de documento: bloques tipados + texto en línea (b/i/u) */
(function (root) {
  const TYPES = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'note'];
  let counter = 0;
  const uid = () => 'b' + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const B = 1, I = 2, U = 4;

  // html (sólo b,i,u y entidades) -> {text, flags[]}
  function parseInline(html) {
    const text = [];
    const flags = [];
    let f = 0;
    const re = /<(\/?)(b|i|u)>|&(?:amp|lt|gt|nbsp|quot|#39);|[^<&]+|[&<]/g;
    let m;
    html = html || '';
    while ((m = re.exec(html))) {
      if (m[2]) {
        const bit = m[2] === 'b' ? B : m[2] === 'i' ? I : U;
        f = m[1] ? f & ~bit : f | bit;
      } else {
        const chunk = decode(m[0]);
        for (const ch of chunk) { text.push(ch); flags.push(f); }
      }
    }
    return { text: text.join(''), chars: text, flags };
  }

  function renderRun(chars, flags, from, to) {
    let out = '';
    let cur = 0;
    let buf = '';
    const open = (f) => (f & B ? '<b>' : '') + (f & I ? '<i>' : '') + (f & U ? '<u>' : '');
    const close = (f) => (f & U ? '</u>' : '') + (f & I ? '</i>' : '') + (f & B ? '</b>' : '');
    for (let k = from; k < to; k++) {
      if (flags[k] !== cur) {
        if (buf) out += open(cur) + escapeHtml(buf) + close(cur);
        buf = ''; cur = flags[k];
      }
      buf += chars[k];
    }
    if (buf) out += open(cur) + escapeHtml(buf) + close(cur);
    return out;
  }

  // Limpia el innerHTML de contenteditable a b/i/u + entidades
  function sanitizeHtml(html) {
    let out = '';
    const re = /<\/?([a-zA-Z0-9]+)[^>]*>|[^<]+|</g;
    let m;
    while ((m = re.exec(html || ''))) {
      if (m[1]) {
        const tag = m[1].toLowerCase();
        const closing = m[0][1] === '/';
        const map = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u' };
        if (map[tag]) out += `<${closing ? '/' : ''}${map[tag]}>`;
      } else if (m[0] !== '<') {
        out += m[0].replace(/&(?!amp;|lt;|gt;|nbsp;|quot;|#39;)/g, '&amp;');
      }
    }
    return out;
  }

  const htmlToText = (html) => parseInline(html).text;
  const textToHtml = (t) => escapeHtml(t || '');
  const mkBlock = (type, html) => ({ id: uid(), type: TYPES.includes(type) ? type : 'action', html: html || '' });

  function newDoc(lang) {
    return {
      version: 1,
      meta: { title: '', credit: lang === 'en' ? 'Written by' : 'Escrito por', author: '', source: '', date: '', contact: '', draft: '' },
      blocks: [mkBlock('scene')],
      settings: { lang: lang || 'es', formatId: 'feature-letter', sceneNumbers: false, watermark: '', autoContd: true },
      revision: null,
      locked: false,
      custom: null
    };
  }

  function nextSceneNumber(last) {
    const m = /^(\d+)([A-Z]*)$/.exec(last || '');
    if (!m) return last ? last + 'A' : '1';
    if (!m[2]) return m[1] + 'A';
    const letters = m[2].split('');
    let k = letters.length - 1;
    while (k >= 0) {
      if (letters[k] === 'Z') { letters[k] = 'A'; k--; } else { letters[k] = String.fromCharCode(letters[k].charCodeAt(0) + 1); break; }
    }
    if (k < 0) letters.unshift('A');
    return m[1] + letters.join('');
  }

  // Devuelve Map id -> número. Con locked=true congela y asigna 12A, 12B... a las nuevas.
  function numberScenes(doc) {
    const map = new Map();
    let n = 0;
    let last = '';
    for (const b of doc.blocks) {
      if (b.type !== 'scene') continue;
      if (doc.locked) {
        if (!b.sceneNumber) b.sceneNumber = last ? nextSceneNumber(last) : '0A';
        last = b.sceneNumber;
        map.set(b.id, b.sceneNumber);
      } else {
        n++;
        map.set(b.id, String(n));
      }
    }
    return map;
  }

  function lockScenes(doc, lock) {
    if (lock) {
      let n = 0;
      for (const b of doc.blocks) if (b.type === 'scene') b.sceneNumber = String(++n);
      doc.locked = true;
    } else {
      for (const b of doc.blocks) delete b.sceneNumber;
      doc.locked = false;
    }
  }

  // Escenas: [{index, id, heading, startIdx, endIdx}]
  function scenes(doc) {
    const out = [];
    doc.blocks.forEach((b, i) => {
      if (b.type === 'scene') out.push({ index: out.length, id: b.id, heading: htmlToText(b.html), startIdx: i, endIdx: doc.blocks.length });
      else if (!out.length && b.type !== 'note') { /* preámbulo sin escena */ }
    });
    out.forEach((s, k) => { if (out[k + 1]) s.endIdx = out[k + 1].startIdx; });
    return out;
  }

  function normalize(doc) {
    const d = Object.assign(newDoc(), doc || {});
    d.meta = Object.assign(newDoc().meta, d.meta || {});
    d.settings = Object.assign(newDoc().settings, d.settings || {});
    d.blocks = (Array.isArray(d.blocks) ? d.blocks : []).filter((b) => b && typeof b === 'object').map((b) => ({
      id: typeof b.id === 'string' ? b.id : uid(),
      type: TYPES.includes(b.type) ? b.type : 'action',
      html: sanitizeHtml(String(b.html || '')),
      ...(b.sceneNumber ? { sceneNumber: String(b.sceneNumber) } : {}),
      ...(b.rev ? { rev: String(b.rev) } : {}),
      ...(b.synopsis ? { synopsis: String(b.synopsis) } : {})
    }));
    if (!d.blocks.length) d.blocks.push(mkBlock('scene'));
    return d;
  }

  const api = { TYPES, uid, escapeHtml, decode, parseInline, renderRun, sanitizeHtml, htmlToText, textToHtml, mkBlock, newDoc, numberScenes, lockScenes, nextSceneNumber, scenes, normalize, B, I, U };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.model = api; }
})(typeof self !== 'undefined' ? self : globalThis);
