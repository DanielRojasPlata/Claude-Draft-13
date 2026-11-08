/* Importación/exportación Fountain y FDX (interoperabilidad) */
(function (root) {
  const M = typeof require === 'function' ? require('./model.js') : root.G.model;
  const L = typeof require === 'function' ? require('./lang.js') : root.G.lang;

  const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E|INTERIOR|EXTERIOR)[. ]/i;

  // Fountain inline -> html (b,i,u)
  function inlineToHtml(s) {
    let t = M.escapeHtml(s);
    t = t.replace(/\\\*/g, '\u0001').replace(/\\_/g, '\u0002');
    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/_(.+?)_/g, '<u>$1</u>');
    return t.replace(/\u0001/g, '*').replace(/\u0002/g, '_');
  }
  function htmlToInline(html) {
    const { chars, flags } = M.parseInline(html);
    let out = '';
    let cur = 0;
    const mark = (f) => (f & 1 && f & 2 ? '***' : f & 1 ? '**' : f & 2 ? '*' : '');
    for (let k = 0; k <= chars.length; k++) {
      const f = k < chars.length ? flags[k] : 0;
      if (f !== cur) {
        out += (cur & 4 ? '_' : '') + mark(cur) + mark(f) + (f & 4 ? '_' : '');
        cur = f;
      }
      if (k < chars.length) out += chars[k] === '*' || chars[k] === '_' ? '\\' + chars[k] : chars[k];
    }
    return out;
  }

  function parse(src) {
    src = String(src || '').replace(/\r\n?/g, '\n');
    const doc = M.newDoc();
    doc.blocks = [];
    // portada
    const lines = src.split('\n');
    let i = 0;
    const keyRe = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes)\s*:\s*(.*)$/i;
    if (keyRe.test(lines[0] || '')) {
      let key = null;
      for (; i < lines.length; i++) {
        const ln = lines[i];
        if (!ln.trim()) { i++; break; }
        const m = keyRe.exec(ln);
        if (m) { key = m[1].toLowerCase(); setMeta(doc.meta, key, m[2]); }
        else if (key) setMeta(doc.meta, key, ln.trim(), true);
      }
    }
    const rest = lines.slice(i);
    // quitar notas [[ ]] y boneyard /* */
    let text = rest.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const notes = [];
    text = text.replace(/\[\[([\s\S]*?)\]\]/g, (_, n) => { notes.push(n.trim()); return ''; });
    const ls = text.split('\n');
    const push = (type, s) => doc.blocks.push(M.mkBlock(type, inlineToHtml(s.trim())));
    for (let k = 0; k < ls.length; k++) {
      const ln = ls[k];
      const t = ln.trim();
      if (!t) continue;
      if (/^={3,}$/.test(t)) continue; // salto de página
      if (/^#+\s/.test(t)) { push('general', t.replace(/^#+\s*/, '')); continue; } // secciones
      if (t.startsWith('=') && !t.startsWith('==')) continue; // sinopsis
      const prevBlank = k === 0 || !ls[k - 1].trim();
      const nextLine = ls[k + 1];
      if (t.startsWith('.') && !t.startsWith('..')) { push('scene', t.slice(1).replace(/\s+#[\w.-]+#\s*$/, '')); continue; }
      if (SCENE_RE.test(t) && prevBlank) { push('scene', t.replace(/\s+#[\w.-]+#\s*$/, '')); continue; }
      if (t.startsWith('>') && !t.endsWith('<')) { push('transition', t.slice(1)); continue; }
      if (t.startsWith('>') && t.endsWith('<')) { push('general', t.slice(1, -1)); continue; }
      if (t === t.toUpperCase() && /:$/.test(t) && prevBlank && !(nextLine && nextLine.trim())) { push('transition', t); continue; }
      const forced = t.startsWith('@');
      const isChar = forced || (prevBlank && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑÜ]/.test(t) && nextLine !== undefined && nextLine.trim() && !/^\(?[\W\d]+\)?$/.test(t));
      if (isChar) {
        push('character', forced ? t.slice(1) : t);
        k++;
        for (; k < ls.length && ls[k].trim(); k++) {
          const d = ls[k].trim();
          if (/^\(.*\)$/.test(d)) push('parenthetical', d.slice(1, -1));
          else push('dialogue', d);
        }
        continue;
      }
      // acción: unir líneas consecutivas
      let para = t;
      while (ls[k + 1] && ls[k + 1].trim()) { k++; para += ' ' + ls[k].trim(); }
      push('action', para);
    }
    for (const n of notes) if (n) doc.blocks.push(M.mkBlock('note', M.escapeHtml(n)));
    if (!doc.blocks.length) doc.blocks.push(M.mkBlock('scene'));
    return doc;
  }

  function setMeta(meta, key, val, append) {
    const map = { title: 'title', credit: 'credit', author: 'author', authors: 'author', source: 'source', 'draft date': 'date', date: 'date', contact: 'contact' };
    const k = map[key];
    if (!k) return;
    meta[k] = append ? (meta[k] ? meta[k] + '\n' : '') + val : val;
  }

  function serialize(doc) {
    const out = [];
    const m = doc.meta;
    const meta = [['Title', m.title], ['Credit', m.credit], ['Author', m.author], ['Source', m.source], ['Draft date', m.date], ['Contact', m.contact]].filter((x) => x[1]);
    for (const [k, v] of meta) out.push(`${k}: ${String(v).split('\n').join('\n    ')}`);
    if (meta.length) out.push('');
    let lastWasChar = false;
    const bl = doc.blocks;
    bl.forEach((b, idx) => {
      const CAPS = ['scene', 'character', 'transition', 'shot', 'general'].includes(b.type);
      const raw = CAPS ? htmlToInlineSafe(b.html).toUpperCase() : htmlToInlineSafe(b.html);
      const plain = CAPS ? M.htmlToText(b.html).toUpperCase() : M.htmlToText(b.html);
      if (!plain.trim()) return;
      const prevType = idx > 0 ? bl[idx - 1].type : '';
      switch (b.type) {
        case 'scene': out.push(SCENE_RE.test(plain) ? raw : '.' + raw, ''); break;
        case 'action': out.push(/^[@.>!~=#]/.test(plain) || plain === plain.toUpperCase() && /TO:$/.test(plain) ? '!' + raw : raw, ''); break;
        case 'character': out.push((plain === plain.toUpperCase() ? '' : '@') + raw); lastWasChar = true; return;
        case 'parenthetical': out.push(`(${raw})`); return;
        case 'dialogue': out.push(raw); if (!(bl[idx + 1] && (bl[idx + 1].type === 'dialogue' || bl[idx + 1].type === 'parenthetical'))) out.push(''); return;
        case 'transition': out.push(plain === plain.toUpperCase() && /TO:$/.test(plain) ? raw : '> ' + raw, ''); break;
        case 'shot': out.push('!' + raw.toUpperCase(), ''); break;
        case 'general': out.push('> ' + raw + ' <', ''); break;
        case 'note': out.push(`[[${plain}]]`, ''); break;
      }
      void prevType; void lastWasChar;
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }
  const htmlToInlineSafe = (h) => htmlToInline(h);

  // ---- FDX ----
  const FDX_TYPES = { 'Scene Heading': 'scene', Action: 'action', Character: 'character', Parenthetical: 'parenthetical', Dialogue: 'dialogue', Transition: 'transition', Shot: 'shot', General: 'general' };
  const FDX_NAMES = { scene: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'General' };

  const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function toFdx(doc) {
    const paras = doc.blocks.filter((b) => b.type !== 'note').map((b) => {
      const { chars, flags } = M.parseInline(b.html);
      let texts = '';
      let k = 0;
      while (k < chars.length) {
        let j = k;
        while (j < chars.length && flags[j] === flags[k]) j++;
        const f = flags[k];
        const style = [f & 1 ? 'Bold' : '', f & 2 ? 'Italic' : '', f & 4 ? 'Underline' : ''].filter(Boolean).join('+');
        let t = chars.slice(k, j).join('');
        texts += `<Text${style ? ` Style="${style}"` : ''}>${xmlEsc(t)}</Text>`;
        k = j;
      }
      if (!texts) texts = '<Text></Text>';
      return `    <Paragraph Type="${FDX_NAMES[b.type]}">${texts}</Paragraph>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">\n  <Content>\n${paras.join('\n')}\n  </Content>\n</FinalDraft>\n`;
  }

  function fromFdx(xmlText, DOMParserCtor) {
    const P = DOMParserCtor || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!P) throw new Error('DOMParser no disponible');
    const xml = new P().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('FDX no válido');
    const doc = M.newDoc();
    doc.blocks = [];
    const content = xml.getElementsByTagName('Content')[0];
    if (!content) throw new Error('FDX sin contenido');
    for (const p of Array.from(content.children)) {
      if (p.tagName !== 'Paragraph') continue;
      const type = FDX_TYPES[p.getAttribute('Type')] || 'action';
      let html = '';
      for (const t of Array.from(p.children)) {
        if (t.tagName !== 'Text') continue;
        const st = (t.getAttribute('Style') || '').split('+');
        let h = M.escapeHtml(t.textContent || '');
        if (!h) continue;
        if (st.includes('Underline')) h = `<u>${h}</u>`;
        if (st.includes('Italic')) h = `<i>${h}</i>`;
        if (st.includes('Bold')) h = `<b>${h}</b>`;
        html += h;
      }
      let plain = M.htmlToText(html);
      let hh = html;
      if (type === 'parenthetical') hh = html.replace(/^\(/, '').replace(/\)$/, '');
      if (plain.trim() || type === 'action') doc.blocks.push(M.mkBlock(type, hh));
    }
    if (!doc.blocks.length) doc.blocks.push(M.mkBlock('scene'));
    return doc;
  }

  const api = { parse, serialize, toFdx, fromFdx, inlineToHtml, htmlToInline, SCENE_RE, L };
  if (typeof module === 'object') module.exports = api; else { root.G = root.G || {}; root.G.fountain = api; }
})(typeof self !== 'undefined' ? self : globalThis);
