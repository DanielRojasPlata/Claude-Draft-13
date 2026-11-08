/* Editor de guion: bloques sobre un único contenteditable con flujo automático */
(function (root) {
  const G = root.G;
  const M = G.model, AC = G.autocomplete, LG = G.lang, FM = G.formats;

  const FLOW = { scene: 'action', action: 'action', character: 'dialogue', parenthetical: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action', general: 'scene', note: 'action' };
  const SPLIT_FLOW = new Set(['scene', 'character', 'parenthetical', 'transition', 'shot', 'general']);
  const TAB_NEXT = { action: 'character', character: 'parenthetical', parenthetical: 'dialogue', dialogue: 'character', scene: 'action', transition: 'scene', shot: 'action', general: 'scene', note: 'action' };
  const CYCLE = ['action', 'character', 'scene', 'transition'];
  const TYPE_KEYS = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'note'];

  function createEditor(rootEl, hooks) {
    hooks = hooks || {};
    let doc = M.newDoc();
    let fmt = FM.resolve(doc);
    const undo = [];
    const redo = [];
    let baseline = null;
    let burst = false;
    let burstTimer = null;
    let ac = null; // {items, index, from, kind, id}
    let acEl = null;
    let lastPag = null;
    let curId = null;
    let acEnabled = true;
    const styleEl = document.createElement('style');
    document.head.appendChild(styleEl);

    rootEl.contentEditable = 'true';
    rootEl.spellcheck = true;
    rootEl.setAttribute('role', 'textbox');
    rootEl.setAttribute('aria-multiline', 'true');
    rootEl.setAttribute('aria-label', 'Guion');

    // ---------- utilidades ----------
    const byId = (id) => doc.blocks.find((b) => b.id === id);
    const idxOf = (id) => doc.blocks.findIndex((b) => b.id === id);
    const blkEls = () => Array.from(rootEl.children).filter((c) => c.classList && c.classList.contains('blk'));
    const elOf = (id) => blkEls().find((e) => e.dataset.id === id);
    const blkOf = (node) => {
      let n = node;
      while (n && n !== rootEl) { if (n.nodeType === 1 && n.classList.contains('blk')) return n; n = n.parentNode; }
      return null;
    };
    const textLen = (b) => M.parseInline(b.html).chars.length;
    function offsetIn(el, container, off) {
      const r = document.createRange();
      r.selectNodeContents(el);
      try { r.setEnd(container, off); } catch (e) { return 0; }
      return r.toString().length;
    }

    function getSel() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      const a = blkOf(r.startContainer), z = blkOf(r.endContainer);
      if (!a || !z) return null;
      return { startId: a.dataset.id, startOff: offsetIn(a, r.startContainer, r.startOffset), endId: z.dataset.id, endOff: offsetIn(z, r.endContainer, r.endOffset), collapsed: r.collapsed, range: r };
    }

    function setCaret(id, off, endOff) {
      const el = elOf(id);
      if (!el) return;
      const locate = (target) => {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n, acc = 0;
        while ((n = w.nextNode())) {
          const l = n.nodeValue.length;
          if (target <= acc + l) return [n, target - acc];
          acc += l;
        }
        return [el, el.childNodes.length];
      };
      const r = document.createRange();
      const [n1, o1] = el.firstChild ? locate(off) : [el, 0];
      r.setStart(n1, o1);
      if (endOff != null) { const [n2, o2] = locate(endOff); r.setEnd(n2, o2); } else r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      keepVisible(el);
    }

    function keepVisible(el) {
      const sc = rootEl.closest('.scroller') || rootEl.parentElement;
      if (!sc) return;
      const er = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      if (hooks.typewriter && hooks.typewriter()) sc.scrollTop += er.top - (sr.top + sr.height * 0.4);
      else if (er.bottom > sr.bottom - 30) sc.scrollTop += er.bottom - sr.bottom + 60;
      else if (er.top < sr.top + 10) sc.scrollTop -= sr.top - er.top + 60;
    }

    // ---------- render ----------
    function applyBlockEl(el, b, sn) {
      el.className = 'blk';
      el.dataset.id = b.id;
      el.dataset.type = b.type;
      el.dataset.ph = LG.get(doc.settings.lang).elementNames[b.type];
      if (sn) el.dataset.sn = sn; else delete el.dataset.sn;
      if (b.rev && doc.revision) { el.classList.add('rev'); el.style.setProperty('--rev', (G.exporter && G.exporter.REVCOLORS[b.rev]) || '#cfe3ff'); } else el.style.removeProperty('--rev');
      if (b.id === curId) el.classList.add('cur');
    }

    function render() {
      const nums = doc.settings.sceneNumbers ? M.numberScenes(doc) : null;
      const frag = document.createDocumentFragment();
      for (const b of doc.blocks) {
        const el = document.createElement('div');
        applyBlockEl(el, b, nums && b.type === 'scene' ? nums.get(b.id) : null);
        el.innerHTML = b.html;
        frag.appendChild(el);
      }
      rootEl.replaceChildren(frag);
      if (lastPag) decorate(lastPag);
    }

    function buildStyle() {
      const m = FM.metrics(fmt);
      let css = `.paper{width:${m.page.w}in;min-height:${m.page.h}in;padding:${fmt.margins.top}in 0 ${fmt.margins.bottom}in 0;font-family:${fmt.font};font-size:${fmt.fontSize}pt;}\n`;
      css += `.paper .blk{line-height:${m.lineH}pt;}\n.paper .pgbreak{margin:0 0 0 0;}\n`;
      for (const t of TYPE_KEYS) {
        const e = fmt.elements[t];
        css += `.paper .blk[data-type=${t}]{margin-left:${e.left}in;width:${e.width}in;margin-top:${e.before * m.lineH}pt;text-align:${e.align};line-height:${m.lineH * e.spacing}pt;${e.caps ? 'text-transform:uppercase;' : ''}${e.bold ? 'font-weight:bold;' : ''}${e.italic ? 'font-style:italic;' : ''}${e.underline ? 'text-decoration:underline;' : ''}}\n`;
        css += `.paper .blk[data-type=${t}][data-sn]::after{left:${-(e.left - 0.7)}in}\n`;
      }
      css += `.paper .pgbreak{margin-left:0!important;width:${m.page.w}in}\n`;
      styleEl.textContent = css;
    }

    function decorate(pag) {
      lastPag = pag;
      for (const e of Array.from(rootEl.querySelectorAll('.pgbreak'))) e.remove();
      const els = blkEls();
      let prevEnd = 1;
      for (const el of els) {
        const inf = pag.info.get(el.dataset.id);
        if (!inf) continue;
        if (inf.startPage > prevEnd) {
          const d = document.createElement('div');
          d.className = 'pgbreak';
          d.contentEditable = 'false';
          d.dataset.page = String(inf.startPage);
          rootEl.insertBefore(d, el);
        }
        el.classList.toggle('pgsplit', inf.endPage > inf.startPage);
        prevEnd = inf.endPage;
      }
    }

    // ---------- historial ----------
    function snapshot() {
      const s = getSel();
      return { blocks: JSON.stringify(doc.blocks), caret: s ? { id: s.startId, off: s.startOff, end: s.collapsed ? null : s.endOff, eid: s.endId } : null };
    }
    function restore(snap) {
      doc.blocks = JSON.parse(snap.blocks);
      render();
      if (snap.caret && byId(snap.caret.id)) setCaret(snap.caret.id, snap.caret.off, snap.caret.eid === snap.caret.id ? snap.caret.end : null);
      baseline = snapshot();
      hooks.onChange && hooks.onChange('struct');
      emitCaret();
    }
    function flushBurst() {
      if (!burst) return;
      clearTimeout(burstTimer);
      burst = false;
      baseline = snapshot();
    }
    function startBurst() {
      if (!baseline) baseline = snapshot();
      if (!burst) { undo.push(baseline); if (undo.length > 500) undo.shift(); redo.length = 0; burst = true; }
      clearTimeout(burstTimer);
      burstTimer = setTimeout(() => { burst = false; baseline = snapshot(); }, 800);
    }
    function edit(fn) {
      flushBurst();
      const before = snapshot();
      undo.push(before); if (undo.length > 500) undo.shift();
      redo.length = 0;
      hideAc();
      const target = fn();
      render();
      if (target && byId(target.id)) setCaret(target.id, target.off, target.end);
      baseline = snapshot();
      hooks.onChange && hooks.onChange('struct');
      emitCaret();
    }
    function doUndo() {
      flushBurst();
      if (!undo.length) return;
      redo.push(snapshot());
      restore(undo.pop());
    }
    function doRedo() {
      flushBurst();
      if (!redo.length) return;
      undo.push(snapshot());
      restore(redo.pop());
    }

    // ---------- sincronización DOM -> modelo ----------
    function markRev(b) { if (doc.revision) b.rev = doc.revision.color; }
    function syncBlock(el) {
      const b = byId(el.dataset.id);
      if (!b) return;
      const html = M.sanitizeHtml(el.innerHTML);
      if (html !== b.html) { b.html = html; markRev(b); if (doc.revision) { el.classList.add('rev'); el.style.setProperty('--rev', G.exporter.REVCOLORS[doc.revision.color] || '#cfe3ff'); } }
    }
    function resyncAll() {
      const seen = new Set();
      const out = [];
      const byid = new Map(doc.blocks.map((b) => [b.id, b]));
      const kids = Array.from(rootEl.childNodes).filter((n) => !(n.nodeType === 1 && n.classList.contains('pgbreak')));
      for (const n of kids) {
        let b = null;
        if (n.nodeType === 1 && n.classList.contains('blk') && byid.has(n.dataset.id) && !seen.has(n.dataset.id)) {
          b = byid.get(n.dataset.id);
          const html = M.sanitizeHtml(n.innerHTML);
          if (html !== b.html) { b.html = html; markRev(b); }
        } else {
          const html = M.sanitizeHtml(n.nodeType === 1 ? n.innerHTML : M.escapeHtml(n.textContent || ''));
          const type = n.nodeType === 1 && TYPE_KEYS.includes(n.dataset && n.dataset.type) ? n.dataset.type : 'action';
          b = M.mkBlock(type, html);
          markRev(b);
        }
        seen.add(b.id);
        out.push(b);
      }
      doc.blocks = out.length ? out : [M.mkBlock('action')];
      const s = getSel();
      render();
      if (s && byId(s.startId)) setCaret(s.startId, s.startOff);
    }
    function structureOk() {
      const kids = Array.from(rootEl.childNodes).filter((n) => !(n.nodeType === 1 && n.classList.contains('pgbreak')));
      if (kids.length !== doc.blocks.length) return false;
      const ids = new Set();
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (!(k.nodeType === 1 && k.classList.contains('blk')) || k.dataset.id !== doc.blocks[i].id || ids.has(k.dataset.id)) return false;
        ids.add(k.dataset.id);
      }
      return true;
    }

    // ---------- transformaciones automáticas al escribir ----------
    function autoTransform(el, e) {
      const b = byId(el.dataset.id);
      if (!b || !e || !String(e.inputType).startsWith('insert')) return false;
      const text = M.htmlToText(b.html);
      let changed = false;
      if (b.type === 'action' || b.type === 'dialogue') {
        if (b.type === 'action' && (/^(int|ext|est)\.\s?/i.test(text) || /^(int\.?\/ext\.?|i\/e\.?)\s?/i.test(text) || /^(INT|EXT) /.test(text)) && text.length <= 12) {
          b.type = 'scene'; changed = true;
        } else if (/^\(/.test(text) && text.length <= 2) {
          b.type = 'parenthetical'; b.html = M.sanitizeHtml(el.innerHTML).replace(/^\(/, ''); changed = true;
        }
      } else if (b.type === 'parenthetical') {
        if (/^\(/.test(text)) { b.html = b.html.replace(/^\(/, ''); changed = true; }
        if (/\)$/.test(text) && e.data === ')') { b.html = b.html.replace(/\)$/, ''); changed = true; }
      }
      if (changed) {
        const s = getSel();
        const off = s ? Math.max(0, s.startOff - (b.type === 'parenthetical' ? 1 : 0)) : 0;
        applyBlockEl(el, b, el.dataset.sn);
        el.innerHTML = b.html;
        setCaret(b.id, Math.min(off, textLen(b)));
      }
      return changed;
    }

    // ---------- operaciones estructurales ----------
    function delSel(s) {
      const iA = idxOf(s.startId), iZ = idxOf(s.endId);
      const a = doc.blocks[iA], z = doc.blocks[iZ];
      const pa = M.parseInline(a.html), pz = M.parseInline(z.html);
      a.html = M.renderRun(pa.chars, pa.flags, 0, s.startOff) + M.renderRun(pz.chars, pz.flags, s.endOff, pz.chars.length);
      markRev(a);
      doc.blocks.splice(iA + 1, iZ - iA);
      if (a.html === '' && doc.blocks.length > 1 && false) doc.blocks.splice(iA, 1);
      return { id: a.id, off: s.startOff };
    }

    function doEnter() {
      const s = getSel();
      if (!s) return;
      edit(() => {
        let id = s.startId, off = s.startOff;
        if (!s.collapsed) { const t = delSel(s); id = t.id; off = t.off; }
        const idx = idxOf(id);
        const b = doc.blocks[idx];
        const p = M.parseInline(b.html);
        const len = p.chars.length;
        if (off >= len) {
          if (!p.text.trim()) { if (b.type !== 'action') { b.type = 'action'; markRev(b); } return { id: b.id, off: 0 }; }
          const nb = M.mkBlock(FLOW[b.type] || 'action', ''); markRev(nb);
          doc.blocks.splice(idx + 1, 0, nb);
          return { id: nb.id, off: 0 };
        }
        if (off === 0) {
          const nb = M.mkBlock(b.type, ''); markRev(nb);
          doc.blocks.splice(idx, 0, nb);
          return { id: b.id, off: 0 };
        }
        const before = M.renderRun(p.chars, p.flags, 0, off);
        const after = M.renderRun(p.chars, p.flags, off, len);
        b.html = before; markRev(b);
        const nb = M.mkBlock(SPLIT_FLOW.has(b.type) ? FLOW[b.type] : b.type, after); markRev(nb);
        if (b.type === 'scene') delete nb.sceneNumber;
        doc.blocks.splice(idx + 1, 0, nb);
        return { id: nb.id, off: 0 };
      });
    }

    function doTab(back) {
      const s = getSel();
      if (!s) return;
      const b = byId(s.startId);
      const len = textLen(b);
      const empty = !M.htmlToText(b.html).trim();
      if (empty) {
        edit(() => {
          const i = CYCLE.indexOf(b.type);
          const next = i < 0 ? 'action' : CYCLE[(i + (back ? CYCLE.length - 1 : 1)) % CYCLE.length];
          b.type = next; markRev(b);
          return { id: b.id, off: 0 };
        });
      } else if (s.collapsed && s.startOff >= len && !back) {
        edit(() => {
          const nb = M.mkBlock(TAB_NEXT[b.type] || 'action', ''); markRev(nb);
          doc.blocks.splice(idxOf(b.id) + 1, 0, nb);
          return { id: nb.id, off: 0 };
        });
      }
    }

    function doBackspace(e, s) {
      const idx = idxOf(s.startId);
      const b = doc.blocks[idx];
      e.preventDefault();
      edit(() => {
        const empty = !M.htmlToText(b.html).trim();
        if (empty && b.type !== 'action') { b.type = 'action'; markRev(b); return { id: b.id, off: 0 }; }
        if (idx === 0) return { id: b.id, off: 0 };
        const prev = doc.blocks[idx - 1];
        if (empty) { doc.blocks.splice(idx, 1); return { id: prev.id, off: textLen(prev) }; }
        if (!M.htmlToText(prev.html).trim()) { doc.blocks.splice(idx - 1, 1); return { id: b.id, off: 0 }; }
        const off = textLen(prev);
        prev.html += b.html; markRev(prev);
        doc.blocks.splice(idx, 1);
        return { id: prev.id, off };
      });
    }

    function doDeleteFwd(e, s) {
      const idx = idxOf(s.startId);
      if (idx >= doc.blocks.length - 1) return;
      e.preventDefault();
      edit(() => {
        const b = doc.blocks[idx], nx = doc.blocks[idx + 1];
        const off = textLen(b);
        if (!M.htmlToText(b.html).trim()) { doc.blocks.splice(idx, 1); return { id: nx.id, off: 0 }; }
        b.html += nx.html; markRev(b);
        doc.blocks.splice(idx + 1, 1);
        return { id: b.id, off };
      });
    }

    // bloques afectados por la selección: [{id,start,end}]
    function selectedBlocks() {
      const s = getSel();
      if (!s) return [];
      const out = [];
      let on = false;
      for (const b of doc.blocks) {
        if (b.id === s.startId) on = true;
        if (on) out.push({ id: b.id, start: b.id === s.startId ? s.startOff : 0, end: b.id === s.endId ? s.endOff : textLen(b) });
        if (b.id === s.endId) break;
      }
      return out;
    }
    function sliceHtml(b, start, end) { const p = M.parseInline(b.html); return M.renderRun(p.chars, p.flags, start, end); }

    function pasteBlocks(blocks, s) {
      edit(() => {
        let id = s.startId, off = s.startOff;
        if (!s.collapsed) { const t = delSel(s); id = t.id; off = t.off; }
        const idx = idxOf(id);
        const b = doc.blocks[idx];
        const p = M.parseInline(b.html);
        const before = M.renderRun(p.chars, p.flags, 0, off);
        const after = M.renderRun(p.chars, p.flags, off, p.chars.length);
        const list = blocks.map((x) => { const nb = M.mkBlock(x.type, x.html); markRev(nb); return nb; });
        if (M.htmlToText(before).trim()) { b.html = before + list[0].html; markRev(b); list.shift(); }
        else { b.type = list[0].type; b.html = list[0].html; list.shift(); markRev(b); }
        doc.blocks.splice(idx + 1, 0, ...list);
        const last = list.length ? list[list.length - 1] : b;
        const caretOff = textLen(last);
        last.html += after;
        return { id: last.id, off: caretOff };
      });
    }

    // ---------- autocompletado ----------
    function hideAc() {
      ac = null;
      if (acEl) { acEl.remove(); acEl = null; }
    }
    function showAc() {
      if (!acEnabled) return hideAc();
      const s = getSel();
      if (!s || !s.collapsed) return hideAc();
      const b = byId(s.startId);
      if (!b || !['scene', 'character', 'transition', 'shot'].includes(b.type)) return hideAc();
      const text = M.htmlToText(b.html);
      if (s.startOff !== text.length) return hideAc();
      const sg = AC.suggest(b.type, text, AC.collect(doc), doc.settings.lang);
      if (!sg.items.length) return hideAc();
      ac = { items: sg.items, index: 0, from: sg.from, kind: sg.kind, id: b.id };
      if (!acEl) {
        acEl = document.createElement('div');
        acEl.className = 'ac';
        acEl.setAttribute('role', 'listbox');
        document.body.appendChild(acEl);
      }
      acEl.innerHTML = '';
      sg.items.forEach((it, i) => {
        const d = document.createElement('div');
        d.className = 'ac-item' + (i === 0 ? ' sel' : '');
        d.textContent = it.trim();
        d.setAttribute('role', 'option');
        d.addEventListener('mousedown', (ev) => { ev.preventDefault(); ac.index = i; acceptAc(); });
        acEl.appendChild(d);
      });
      const el = elOf(b.id);
      const r = el.getBoundingClientRect();
      acEl.style.left = Math.round(r.left) + 'px';
      acEl.style.top = Math.round(r.bottom + 2) + 'px';
      const ar = acEl.getBoundingClientRect();
      if (ar.bottom > window.innerHeight - 8) acEl.style.top = Math.round(r.top - ar.height - 2) + 'px';
    }
    function moveAc(d) {
      ac.index = (ac.index + d + ac.items.length) % ac.items.length;
      Array.from(acEl.children).forEach((c, i) => c.classList.toggle('sel', i === ac.index));
    }
    function acceptAc() {
      if (!ac) return;
      const b = byId(ac.id);
      const text = M.htmlToText(b.html);
      let ins = ac.items[ac.index];
      if (ac.kind === 'location') ins += ' - ';
      const nt = text.slice(0, ac.from) + ins;
      flushBurst();
      undo.push(snapshot()); redo.length = 0;
      b.html = M.textToHtml(nt); markRev(b);
      const el = elOf(b.id);
      el.innerHTML = b.html;
      hideAc();
      setCaret(b.id, nt.length);
      baseline = snapshot();
      hooks.onChange && hooks.onChange('typing');
      showAc();
    }

    // ---------- eventos ----------
    function emitCaret() {
      const s = getSel();
      const id = s ? s.startId : null;
      if (id !== curId) {
        const old = curId && elOf(curId);
        if (old) old.classList.remove('cur');
        curId = id;
        const el = id && elOf(id);
        if (el) el.classList.add('cur');
      }
      hooks.onCaret && hooks.onCaret(id ? byId(id) : null);
    }

    rootEl.addEventListener('beforeinput', (e) => {
      // Deshacer/rehacer se gestionan solo desde el menú (evita doble ejecución con el atajo nativo)
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); return; }
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); doEnter(); return; }
      if (e.inputType === 'insertFromDrop') { e.preventDefault(); return; }
      const s = getSel();
      if (s && !s.collapsed && s.startId !== s.endId && (e.inputType.startsWith('insert') || e.inputType.startsWith('delete'))) {
        if (e.inputType === 'insertFromPaste') return;
        e.preventDefault();
        const ins = e.data;
        edit(() => delSel(s));
        if (ins && e.inputType === 'insertText') document.execCommand('insertText', false, ins);
        return;
      }
      startBurst();
    });

    rootEl.addEventListener('input', (e) => {
      if (!structureOk()) { resyncAll(); }
      else {
        const s = getSel();
        const el = s && elOf(s.startId);
        if (el) { syncBlock(el); autoTransform(el, e); }
      }
      hooks.onChange && hooks.onChange('typing');
      emitCaret();
      showAc();
    });

    rootEl.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (ac) {
        if (e.key === 'ArrowDown') { e.preventDefault(); return moveAc(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); return moveAc(-1); }
        if (e.key === 'Escape') { e.preventDefault(); return hideAc(); }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return acceptAc(); }
      }
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Enter' && !mod && !e.altKey) { e.preventDefault(); return doEnter(); }
      if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); return doTab(e.shiftKey); }
      if (mod || e.altKey) return;
      const s = getSel();
      if (!s) return;
      if (e.key === 'Backspace') {
        if (!s.collapsed && s.startId !== s.endId) { e.preventDefault(); return edit(() => delSel(s)); }
        if (s.collapsed && s.startOff === 0) return doBackspace(e, s);
      } else if (e.key === 'Delete') {
        if (!s.collapsed && s.startId !== s.endId) { e.preventDefault(); return edit(() => delSel(s)); }
        if (s.collapsed && s.startOff === textLen(byId(s.startId))) return doDeleteFwd(e, s);
      }
    });

    rootEl.addEventListener('copy', (e) => copyCut(e, false));
    rootEl.addEventListener('cut', (e) => copyCut(e, true));
    function copyCut(e, cut) {
      const s = getSel();
      if (!s || s.collapsed) return;
      const sel = selectedBlocks();
      if (sel.length < 2) return; // nativo
      e.preventDefault();
      const blocks = sel.map((x) => ({ type: byId(x.id).type, html: sliceHtml(byId(x.id), x.start, x.end) }));
      e.clipboardData.setData('application/x-guionista', JSON.stringify(blocks));
      e.clipboardData.setData('text/plain', blocks.map((b) => M.htmlToText(b.html)).join('\n'));
      if (cut) edit(() => delSel(s));
    }
    rootEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const s = getSel();
      if (!s) return;
      let blocks = null;
      const gj = e.clipboardData.getData('application/x-guionista');
      if (gj) {
        try {
          const arr = JSON.parse(gj);
          if (Array.isArray(arr) && arr.length) blocks = arr.map((x) => ({ type: TYPE_KEYS.includes(x.type) ? x.type : 'action', html: M.sanitizeHtml(String(x.html || '')) }));
        } catch (err) { blocks = null; }
      }
      if (!blocks) {
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;
        if (!/\n/.test(text.replace(/\n+$/, ''))) {
          if (!s.collapsed && s.startId !== s.endId) edit(() => delSel(s));
          startBurst();
          document.execCommand('insertText', false, text.replace(/\n+$/, ''));
          return;
        }
        blocks = G.fountain.parse(text).blocks.map((b) => ({ type: b.type, html: b.html }));
      }
      if (blocks.length === 1) {
        if (!s.collapsed && s.startId !== s.endId) edit(() => delSel(s));
        startBurst();
        document.execCommand('insertHTML', false, blocks[0].html);
        return;
      }
      pasteBlocks(blocks, s);
    });
    rootEl.addEventListener('dragover', (e) => e.preventDefault());
    rootEl.addEventListener('drop', (e) => e.preventDefault());
    rootEl.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== rootEl) hideAc(); }, 150));
    rootEl.addEventListener('mousedown', () => hideAc());
    document.addEventListener('selectionchange', () => { if (rootEl.contains(document.activeElement) || document.activeElement === rootEl) emitCaret(); });

    // ---------- API ----------
    const api = {
      load(d, opts) {
        doc = M.normalize(d);
        fmt = FM.resolve(doc);
        buildStyle();
        undo.length = 0; redo.length = 0; burst = false; baseline = null; lastPag = null; hideAc();
        render();
        baseline = snapshot();
        hooks.onChange && hooks.onChange('load');
        if (!opts || opts.focus !== false) setCaret(doc.blocks[0].id, 0);
      },
      getDoc: () => doc,
      setFormat(f) { fmt = f; buildStyle(); hooks.onChange && hooks.onChange('format'); },
      refreshFormat() { fmt = FM.resolve(doc); buildStyle(); render(); hooks.onChange && hooks.onChange('format'); },
      decorate,
      render,
      focus() { rootEl.focus(); },
      undo: doUndo,
      redo: doRedo,
      canUndo: () => undo.length > 0,
      current() { const s = getSel(); return s ? byId(s.startId) : null; },
      setType(type) {
        if (!TYPE_KEYS.includes(type)) return;
        const sel = selectedBlocks();
        const s = getSel();
        if (!sel.length) return;
        edit(() => {
          for (const x of sel) { const b = byId(x.id); b.type = type; markRev(b); if (type !== 'scene') delete b.sceneNumber; }
          return s ? { id: s.startId, off: s.startOff, end: s.collapsed ? null : (s.startId === s.endId ? s.endOff : null) } : null;
        });
      },
      exec(cmd) {
        rootEl.focus();
        if (!getSel()) return;
        startBurst();
        document.execCommand(cmd);
      },
      insertAfter(type, html, atId) {
        const s = getSel();
        const id = atId || (s ? s.startId : doc.blocks[doc.blocks.length - 1].id);
        edit(() => {
          const nb = M.mkBlock(type, html || ''); markRev(nb);
          doc.blocks.splice(idxOf(id) + 1, 0, nb);
          return { id: nb.id, off: textLen(nb) };
        });
      },
      goTo(id, select) {
        const b = byId(id);
        if (!b) return;
        setCaret(id, 0, select ? textLen(b) : undefined);
        rootEl.focus();
        const el = elOf(id);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      reveal(id) { const el = elOf(id); if (el) el.scrollIntoView({ block: 'center' }); },
      moveScene(fromIdx, toIdx) {
        const sc = M.scenes(doc);
        if (fromIdx === toIdx || !sc[fromIdx] || toIdx < 0 || toIdx >= sc.length) return;
        edit(() => {
          const f = sc[fromIdx];
          const chunk = doc.blocks.splice(f.startIdx, f.endIdx - f.startIdx);
          const after = M.scenes(doc);
          const at = toIdx > fromIdx ? (after[toIdx - 1] ? after[toIdx - 1].endIdx : doc.blocks.length) : after[toIdx].startIdx;
          doc.blocks.splice(at, 0, ...chunk);
          return { id: chunk[0].id, off: 0 };
        });
      },
      setSynopsis(id, text) { const b = byId(id); if (b) { if (text) b.synopsis = text; else delete b.synopsis; hooks.onChange && hooks.onChange('meta'); } },
      mutateDoc(fn) { edit(() => { fn(doc); return null; }); },
      selectionText() {
        const sel = selectedBlocks();
        return sel.map((x) => M.htmlToText(sliceHtml(byId(x.id), x.start, x.end))).join('\n');
      },
      sceneText(id) {
        const sc = M.scenes(doc);
        const s = id ? sc.find((x) => x.id === id) : sc.filter((x) => { const i = idxOf(curId); return i >= x.startIdx && i < x.endIdx; })[0];
        if (!s) return '';
        return doc.blocks.slice(s.startIdx, s.endIdx).filter((b) => b.type !== 'note').map((b) => {
          const t = M.htmlToText(b.html);
          return b.type === 'parenthetical' ? `(${t})` : t;
        }).join('\n');
      },
      setAutocomplete(on) { acEnabled = on; if (!on) hideAc(); },
      markCaret: emitCaret,
      // --- búsqueda ---
      findAll(q, opts) {
        opts = opts || {};
        const out = [];
        if (!q) return out;
        const needle = opts.matchCase ? q : q.toLowerCase();
        for (const b of doc.blocks) {
          const t = M.htmlToText(b.html);
          const h = opts.matchCase ? t : t.toLowerCase();
          let i = 0;
          while ((i = h.indexOf(needle, i)) !== -1) {
            if (!opts.wholeWord || (!/\w/.test(h[i - 1] || '') && !/\w/.test(h[i + needle.length] || ''))) out.push({ id: b.id, start: i, end: i + needle.length });
            i += Math.max(1, needle.length);
          }
        }
        return out;
      },
      highlight(matches, activeIdx) {
        if (!window.CSS || !CSS.highlights) return;
        CSS.highlights.delete('find'); CSS.highlights.delete('find-active');
        if (!matches || !matches.length) return;
        const mk = (m) => {
          const el = elOf(m.id); if (!el) return null;
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n, acc = 0, r = document.createRange(), startSet = false;
          while ((n = w.nextNode())) {
            const l = n.nodeValue.length;
            if (!startSet && m.start <= acc + l) { r.setStart(n, m.start - acc); startSet = true; }
            if (startSet && m.end <= acc + l) { r.setEnd(n, m.end - acc); return r; }
            acc += l;
          }
          return null;
        };
        const ranges = matches.map(mk).filter(Boolean);
        CSS.highlights.set('find', new Highlight(...ranges));
        if (activeIdx != null && matches[activeIdx]) { const r = mk(matches[activeIdx]); if (r) CSS.highlights.set('find-active', new Highlight(r)); }
      },
      replaceMatches(matches, str) {
        if (!matches.length) return 0;
        edit(() => {
          // de atrás hacia delante dentro de cada bloque
          const sorted = matches.slice().reverse();
          for (const m of sorted) {
            const b = byId(m.id); if (!b) continue;
            const p = M.parseInline(b.html);
            const f = p.flags[m.start] || 0;
            const ins = [...str];
            const chars = p.chars.slice(0, m.start).concat(ins, p.chars.slice(m.end));
            const flags = p.flags.slice(0, m.start).concat(ins.map(() => f), p.flags.slice(m.end));
            b.html = M.renderRun(chars, flags, 0, chars.length); markRev(b);
          }
          return null;
        });
        return matches.length;
      },
      selectionOffsets: getSel
    };
    buildStyle();
    return api;
  }

  root.G.createEditor = createEditor;
})(typeof self !== 'undefined' ? self : globalThis);
