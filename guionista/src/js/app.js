/* Aplicación: interfaz, menús, archivos, paneles, diálogos */
(function (root) {
  'use strict';
  const G = root.G;
  const M = G.model, FM = G.formats, T = G.timing, PG = G.paginate, F = G.fountain, EX = G.exporter, LG = G.lang, AC = G.autocomplete;
  const api = root.api;
  const $ = (id) => document.getElementById(id);

  // ---------- helpers DOM ----------
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }
  const ICONS = {
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/></svg>',
    bold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>',
    italic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 5h8M6 19h8M14 5l-4 14"/></svg>',
    underline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.7L19.5 9.5l-5.7 1.8L12 17l-1.8-5.7L4.5 9.5l5.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const setIcon = (el, name) => { el.innerHTML = ICONS[name] || ''; };
  document.querySelectorAll('[data-icon]').forEach((el) => { const n = el.dataset.icon; if (el.tagName === 'BUTTON' && el.children.length === 0 && !el.textContent.trim()) setIcon(el, n); else if (el.tagName === 'SPAN') setIcon(el, n); });

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- preferencias ----------
  const DEFAULTS = { theme: 'system', sidebar: true, viewMode: 'page', zoom: 1, autocomplete: true, timing: Object.assign({}, T.DEFAULTS, { target: 90, mode: 'content' }) };
  let prefs;
  try { prefs = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('guionista.prefs') || '{}')); prefs.timing = Object.assign({}, DEFAULTS.timing, prefs.timing); } catch (e) { prefs = JSON.parse(JSON.stringify(DEFAULTS)); }
  const savePrefs = () => { try { localStorage.setItem('guionista.prefs', JSON.stringify(prefs)); } catch (e) { /* sin almacenamiento */ } };

  // ---------- estado ----------
  let fileInfo = { path: null, name: 'Sin título' };
  let dirty = false;
  let focusMode = false;
  let mainView = 'script';
  let lastPag = null;
  let est = { total: 0, perScene: [] };
  let curBlock = null;
  let sideTab = 'scenes';
  let rcTimer = null, sideTimer = null;
  let lastState = '';

  const editor = G.createEditor($('script'), {
    onChange(kind) {
      if (kind !== 'load') setDirty(true);
      scheduleRecompute(kind === 'typing' ? 150 : 0);
      if (findOpen()) debounceFind();
    },
    onCaret(b) { curBlock = b; updateCaretUI(); },
    typewriter: () => focusMode
  });
  editor.setAutocomplete(prefs.autocomplete);

  function setDirty(v) {
    if (dirty === v) return;
    dirty = v; api.setDirty(v); updateTitle(); updateSave();
  }
  function updateTitle() { document.title = (dirty ? '• ' : '') + fileInfo.name + ' — Guionista'; }
  function updateSave() { const s = $('stSave'); s.textContent = dirty ? 'Sin guardar' : 'Guardado'; s.classList.toggle('dirty', dirty); }

  // ---------- recálculo ----------
  function scheduleRecompute(delay) {
    clearTimeout(rcTimer);
    rcTimer = setTimeout(recompute, delay);
  }
  function recompute() {
    const doc = editor.getDoc();
    const fmt = FM.resolve(doc);
    lastPag = PG.paginate(doc, fmt);
    editor.decorate(lastPag);
    est = T.estimate(doc, prefs.timing);
    updateStatus();
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => { renderSide(); if (mainView === 'cards') renderCards(); }, 250);
  }
  function runtimeSeconds() { return prefs.timing.mode === 'page' && lastPag ? lastPag.pages.length * 60 : est.total; }
  function updateStatus() {
    const doc = editor.getDoc();
    const pages = lastPag ? lastPag.pages.length : 1;
    const inf = curBlock && lastPag ? lastPag.info.get(curBlock.id) : null;
    $('stPage').textContent = `Página ${inf ? inf.startPage : 1} de ${pages}`;
    $('stWords').textContent = `${T.wordCount(doc)} palabras`;
    $('stScenes').textContent = `${doc.blocks.filter((b) => b.type === 'scene').length} escenas`;
    const sec = runtimeSeconds();
    $('stTime').textContent = 'Duración ' + T.format(sec);
    $('stTime').title = `Por contenido: ${T.format(est.total)} · Por páginas: ${T.format(pages * 60)}`;
    $('stFormat').textContent = FM.resolve(doc).name;
    $('meterTime').textContent = T.format(sec);
    $('meterTarget').textContent = `/ ${prefs.timing.target} min`;
    const fill = $('meterFill');
    fill.style.width = Math.min(100, (sec / 60 / prefs.timing.target) * 100) + '%';
    fill.style.background = sec / 60 > prefs.timing.target ? 'linear-gradient(90deg,#f0b429,#e5484d)' : '';
    $('meter').title = `Tiempo estimado en pantalla (${prefs.timing.mode === 'page' ? 'por páginas' : 'por contenido'})\nContenido: ${T.format(est.total)} · Páginas: ${T.format(pages * 60)}`;
  }

  // ---------- selector de elementos ----------
  const ES = LG.get('es').elementNames;
  const TYPE_ORDER = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'note'];
  const sel = $('elementSelect');
  TYPE_ORDER.forEach((t, i) => sel.append(h('option', { value: t }, `${ES[t]}  (Ctrl+${i + 1})`)));
  sel.addEventListener('change', () => { editor.setType(sel.value); editor.focus(); });
  function updateCaretUI() {
    if (curBlock) { sel.value = curBlock.type; $('stElement').textContent = ES[curBlock.type]; }
    updateStatus();
    if (sideTab === 'scenes') markCurrentScene();
    pushState();
  }

  // ---------- formato ----------
  const fsel = $('formatSelect');
  function refreshFormatSelect() {
    const doc = editor.getDoc();
    fsel.innerHTML = '';
    for (const [id, f] of Object.entries(FM.PRESETS)) fsel.append(h('option', { value: id }, f.name));
    if (doc.custom || doc.settings.formatId === 'custom') fsel.append(h('option', { value: 'custom' }, 'Personalizado: ' + (doc.custom && doc.custom.name || 'Mi formato')));
    fsel.value = doc.settings.formatId;
  }
  fsel.addEventListener('change', () => setFormatId(fsel.value));
  function setFormatId(id) {
    const doc = editor.getDoc();
    if (id === 'custom' && !doc.custom) {
      const base = FM.clone(FM.resolve(doc)); base.name = 'Mi formato';
      editor.mutateDoc((d) => { d.custom = base; d.settings.formatId = 'custom'; });
      editor.refreshFormat(); refreshFormatSelect(); openFormatEditor(); return;
    }
    editor.mutateDoc((d) => { d.settings.formatId = id; });
    editor.refreshFormat(); refreshFormatSelect(); recompute();
  }

  // ---------- tema / zoom / vistas ----------
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const eff = prefs.theme === 'system' ? (mq.matches ? 'dark' : 'light') : prefs.theme;
    document.documentElement.dataset.eff = eff;
    document.documentElement.dataset.theme = prefs.theme;
    setIcon($('btnTheme'), eff === 'dark' ? 'sun' : 'moon');
    api.setTheme(prefs.theme);
  }
  mq.addEventListener('change', applyTheme);
  function setTheme(t) { prefs.theme = t; savePrefs(); applyTheme(); pushState(); }
  function applyZoom() { $('paper').style.zoom = String(prefs.zoom); $('zoomLabel').textContent = Math.round(prefs.zoom * 100) + '%'; }
  function zoomBy(d) { prefs.zoom = Math.min(2, Math.max(0.5, Math.round((prefs.zoom + d) * 100) / 100)); savePrefs(); applyZoom(); }
  function applyViewMode() { $('scroller').classList.toggle('draft', prefs.viewMode === 'draft'); }
  function applySidebar() { $('sidebar').classList.toggle('hidden', !prefs.sidebar); }
  function setMainView(v) {
    mainView = v;
    $('scroller').hidden = v !== 'script'; $('cardsView').hidden = v !== 'cards';
    $('btnViewScript').classList.toggle('active', v === 'script'); $('btnViewCards').classList.toggle('active', v === 'cards');
    if (v === 'cards') { closeFind(); renderCards(); } else editor.focus();
    pushState();
  }
  function setFocusMode(on) {
    focusMode = on; document.getElementById('app').classList.toggle('focus', on); $('btnFocus').classList.toggle('on', on);
    if (on) setMainView('script');
    pushState(); editor.focus();
  }

  // ---------- barra lateral ----------
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    sideTab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    renderSide();
  }));
  $('sideFilter').addEventListener('input', renderSide);

  function headingParts(text) {
    const m = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|EST\.?|I\/E\.?)\s+(.*?)(?:\s+-\s+([^-]*))?$/i.exec(text.trim());
    return m ? { prefix: m[1].toUpperCase(), location: (m[2] || '').trim().toUpperCase(), time: (m[3] || '').trim().toUpperCase() } : { prefix: '', location: text.trim().toUpperCase(), time: '' };
  }
  function characterStats(doc) {
    const map = new Map();
    let cur = null, si = -1;
    for (const b of doc.blocks) {
      const t = M.htmlToText(b.html).trim();
      if (b.type === 'scene') { si++; cur = null; }
      else if (b.type === 'character') {
        const name = t.replace(/\s*\(.*\)\s*$/, '').toUpperCase();
        cur = null;
        if (name) { cur = map.get(name) || { name, lines: 0, words: 0, scenes: new Set(), first: b.id }; map.set(name, cur); cur.scenes.add(si); }
      } else if (b.type === 'dialogue' && cur) { cur.lines++; cur.words += T.words(t); }
      else if (b.type !== 'parenthetical' && b.type !== 'note') cur = null;
    }
    return [...map.values()].sort((a, b) => b.words - a.words);
  }

  let dragFrom = -1;
  function attachDrag(el, idx, cls, container) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'scene:' + idx); });
    el.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return; e.preventDefault();
      const r = el.getBoundingClientRect();
      const before = cls === 'card' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      container.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      el.classList.add(before ? 'drop-before' : 'drop-after');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      if (dragFrom < 0) return; e.preventDefault();
      const r = el.getBoundingClientRect();
      const before = cls === 'card' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      const pos = before ? idx : idx + 1;
      const to = pos > dragFrom ? pos - 1 : pos;
      const from = dragFrom; dragFrom = -1;
      editor.moveScene(from, to);
    });
    el.addEventListener('dragend', () => { dragFrom = -1; container.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); });
  }

  function renderSide() {
    const doc = editor.getDoc();
    const list = $('sideList');
    const q = $('sideFilter').value.trim().toLowerCase();
    list.innerHTML = '';
    if (sideTab === 'scenes') {
      const sc = M.scenes(doc);
      const nums = M.numberScenes(doc);
      const secs = new Map(est.perScene.map((s) => [s.id, s.seconds]));
      sc.forEach((s) => {
        if (q && !s.heading.toLowerCase().includes(q)) return;
        const it = h('div', { class: 'side-item', role: 'listitem', 'data-id': s.id, title: 'Arrastra para reordenar la escena' },
          h('span', { class: 'n' }, nums.get(s.id)), h('span', { class: 't' }, s.heading || '(sin encabezado)'), h('span', { class: 'd' }, T.format(secs.get(s.id) || 0)));
        it.addEventListener('click', () => editor.goTo(s.id));
        if (!q) attachDrag(it, s.index, 'side', list);
        list.append(it);
      });
      if (!list.children.length) list.append(h('div', { class: 'side-empty' }, 'Aún no hay escenas. Escribe «INT.» o «EXT.» o pulsa Ctrl+1.'));
      markCurrentScene();
    } else if (sideTab === 'characters') {
      for (const c of characterStats(doc)) {
        if (q && !c.name.toLowerCase().includes(q)) continue;
        const it = h('div', { class: 'side-item', role: 'listitem' }, h('span', { class: 't' }, c.name), h('span', { class: 'd' }, `${c.lines} intervenc. · ${c.scenes.size} esc.`));
        it.addEventListener('click', () => openFind(false, c.name));
        list.append(it);
      }
      if (!list.children.length) list.append(h('div', { class: 'side-empty' }, 'Los personajes aparecerán al escribirlos.'));
    } else {
      doc.blocks.filter((b) => b.type === 'note').forEach((b) => {
        const t = M.htmlToText(b.html);
        if (q && !t.toLowerCase().includes(q)) return;
        const it = h('div', { class: 'side-item', role: 'listitem' }, h('span', { class: 't', style: 'text-transform:none' }, t || '(nota vacía)'));
        it.addEventListener('click', () => editor.goTo(b.id));
        list.append(it);
      });
      if (!list.children.length) list.append(h('div', { class: 'side-empty' }, 'Sin notas. Ctrl+Alt+N inserta una nota que no se imprime.'));
    }
  }
  function markCurrentScene() {
    if (!curBlock) return;
    const doc = editor.getDoc();
    const i = doc.blocks.findIndex((b) => b.id === curBlock.id);
    let id = null;
    for (let k = i; k >= 0; k--) if (doc.blocks[k].type === 'scene') { id = doc.blocks[k].id; break; }
    $('sideList').querySelectorAll('.side-item[data-id]').forEach((e) => e.classList.toggle('current', e.dataset.id === id));
  }

  // ---------- fichas ----------
  function renderCards() {
    const doc = editor.getDoc();
    const box = $('cardsView');
    box.innerHTML = '';
    const nums = M.numberScenes(doc);
    const secs = new Map(est.perScene.map((s) => [s.id, s.seconds]));
    const sc = M.scenes(doc);
    sc.forEach((s) => {
      const blk = doc.blocks[s.startIdx];
      const firstAction = doc.blocks.slice(s.startIdx + 1, s.endIdx).find((b) => b.type === 'action');
      const ta = h('textarea', { placeholder: 'Sinopsis de la escena…', 'aria-label': 'Sinopsis', value: blk.synopsis || '' });
      ta.addEventListener('input', () => editor.setSynopsis(s.id, ta.value));
      ta.addEventListener('dragstart', (e) => e.stopPropagation());
      const card = h('div', { class: 'card' },
        h('div', { class: 'ch' }, h('span', { class: 'cn' }, nums.get(s.id)), h('span', { class: 'ct', title: s.heading, onclick: () => { setMainView('script'); editor.goTo(s.id); } }, s.heading || '(sin encabezado)'), h('span', { class: 'cd' }, T.format(secs.get(s.id) || 0))),
        ta, h('div', { class: 'cx' }, firstAction ? M.htmlToText(firstAction.html) : ''));
      attachDrag(card, s.index, 'card', box);
      box.append(card);
    });
    if (!sc.length) box.append(h('div', { class: 'side-empty' }, 'No hay escenas todavía.'));
  }

  // ---------- modales ----------
  function modal(o) {
    const prevFocus = document.activeElement;
    const back = h('div', { class: 'backdrop' });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus(); o.onClose && o.onClose(); };
    const foot = h('div', { class: 'mf' });
    const buttons = o.buttons || [{ label: 'Cerrar', primary: true }];
    for (const b of buttons) foot.append(h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => { if (!b.action || b.action() !== false) close(); } }, b.label));
    const box = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title }, h('h2', null, o.title), h('div', { class: 'mb' }, o.body), foot);
    back.append(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && o.enter !== false) { const p = buttons.find((b) => b.primary); if (p) { e.preventDefault(); if (!p.action || p.action() !== false) close(); } }
    }
    document.addEventListener('keydown', onKey, true);
    $('modalRoot').append(back);
    const f = box.querySelector('input,select,textarea'); if (f) f.focus(); else foot.querySelector('button').focus();
    return { close, el: box };
  }
  const field = (label, input) => [h('label', null, label), input];
  const download = () => 0; void download;

  function titlePageDialog() {
    const m = editor.getDoc().meta;
    const inp = (k, ph) => h('input', { class: 'input', value: m[k] || '', placeholder: ph || '' });
    const f = { title: inp('title', 'Título del guion'), credit: inp('credit'), author: inp('author', 'Nombre del autor'), source: inp('source', 'Basado en…'), date: inp('date', 'Fecha'), draft: inp('draft', 'Ej.: Primer borrador') };
    f.contact = h('textarea', { rows: 3, placeholder: 'Contacto' }, m.contact || '');
    const form = h('div', { class: 'form' }, field('Título', f.title), field('Crédito', f.credit), field('Autor', f.author), field('Fuente', f.source), field('Borrador', f.draft), field('Fecha', f.date), field('Contacto', f.contact));
    modal({ title: 'Portada y datos', body: form, buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { editor.mutateDoc((d) => { for (const k of Object.keys(f)) d.meta[k] = f[k].value.slice(0, 500); }); fileInfo.name === 'Sin título' && f.title.value && (fileInfo.name = f.title.value, updateTitle()); } }] });
  }

  function promptDialog(title, label, value, cb) {
    const i = h('input', { class: 'input', value: value || '' });
    modal({ title, body: h('div', { class: 'form' }, field(label, i)), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => cb(i.value) }] });
  }

  function openFormatEditor() {
    const doc = editor.getDoc();
    const cur = FM.clone(doc.custom && doc.settings.formatId === 'custom' ? doc.custom : FM.resolve(doc));
    const num = (v, step, min, max) => h('input', { class: 'input', type: 'number', step, min, max, value: v });
    const g = { name: h('input', { class: 'input', value: cur.name }), page: h('select', { class: 'select' }, h('option', { value: 'letter' }, 'Carta (8.5×11 in)'), h('option', { value: 'a4' }, 'A4')), fs: num(cur.fontSize, 0.5, 8, 18), mt: num(cur.margins.top, 0.05, 0.25, 3), mb: num(cur.margins.bottom, 0.05, 0.25, 3), ml: num(cur.margins.left, 0.05, 0.25, 3), mr: num(cur.margins.right, 0.05, 0.25, 3), pn: h('input', { type: 'checkbox', checked: cur.pageNumbers }), font: h('input', { class: 'input', value: cur.font }) };
    g.page.value = cur.pageSize;
    const preset = h('select', { class: 'select' }, h('option', { value: '' }, 'Cargar valores de…'), ...Object.entries(FM.PRESETS).map(([id, f]) => h('option', { value: id }, f.name)));
    const rows = {};
    const tbl = h('table', { class: 't' }, h('thead', null, h('tr', null, ['Elemento', 'Izq. (in)', 'Ancho (in)', 'Alinear', 'Líneas antes', 'Interlín.', 'MAY', 'B', 'I', 'U'].map((x) => h('th', null, x)))));
    const tb = h('tbody');
    const fill = (fm) => {
      for (const t of TYPE_ORDER) {
        const e = fm.elements[t], r = rows[t];
        r.left.value = e.left; r.width.value = e.width; r.align.value = e.align; r.before.value = e.before; r.spacing.value = e.spacing;
        r.caps.checked = e.caps; r.bold.checked = e.bold; r.italic.checked = e.italic; r.underline.checked = e.underline;
      }
    };
    for (const t of TYPE_ORDER) {
      const r = rows[t] = { left: num(0, 0.05, 0, 8), width: num(0, 0.05, 0.5, 8), align: h('select', { class: 'select' }, h('option', { value: 'left' }, 'Izq.'), h('option', { value: 'center' }, 'Centro'), h('option', { value: 'right' }, 'Der.')), before: num(0, 1, 0, 4), spacing: num(1, 1, 1, 3), caps: h('input', { type: 'checkbox' }), bold: h('input', { type: 'checkbox' }), italic: h('input', { type: 'checkbox' }), underline: h('input', { type: 'checkbox' }) };
      tb.append(h('tr', null, h('td', null, ES[t]), ...['left', 'width', 'align', 'before', 'spacing', 'caps', 'bold', 'italic', 'underline'].map((k) => h('td', null, r[k]))));
    }
    tbl.append(tb);
    fill(cur);
    preset.addEventListener('change', () => { if (!preset.value) return; const p = FM.PRESETS[preset.value]; g.page.value = p.pageSize; g.fs.value = p.fontSize; g.mt.value = p.margins.top; g.mb.value = p.margins.bottom; g.ml.value = p.margins.left; g.mr.value = p.margins.right; fill(p); });
    const collect = () => FM.sanitizeFormat({
      name: g.name.value, pageSize: g.page.value, fontSize: g.fs.value, font: g.font.value, pageNumbers: g.pn.checked,
      margins: { top: g.mt.value, bottom: g.mb.value, left: g.ml.value, right: g.mr.value },
      elements: Object.fromEntries(TYPE_ORDER.map((t) => { const r = rows[t]; return [t, { left: r.left.value, width: r.width.value, align: r.align.value, before: r.before.value, spacing: r.spacing.value, caps: r.caps.checked, bold: r.bold.checked, italic: r.italic.checked, underline: r.underline.checked }]; }))
    });
    const apply = () => { const f = collect(); editor.mutateDoc((d) => { d.custom = f; d.settings.formatId = 'custom'; }); editor.refreshFormat(); refreshFormatSelect(); recompute(); pushState(); };
    const body = h('div', null,
      h('div', { class: 'form', style: 'grid-template-columns:130px 1fr 130px 1fr;margin-bottom:12px' }, ...field('Nombre', g.name), ...field('Papel', g.page), ...field('Fuente', g.font), ...field('Tamaño (pt)', g.fs), ...field('Margen sup.', g.mt), ...field('Margen inf.', g.mb), ...field('Margen izq.', g.ml), ...field('Margen der.', g.mr), ...field('Núm. de página', g.pn), ...field('Plantilla base', preset)),
      h('p', { class: 'muted' }, 'Las medidas de elemento se cuentan desde el borde izquierdo de la hoja. 1 línea = 1 interlineado (6 líneas por pulgada a 12 pt).'), tbl);
    modal({ title: 'Editar formato de guion', body, wide: true, enter: false, buttons: [{ label: 'Exportar plantilla…', action: () => { api.saveFormat({ data: JSON.stringify(collect(), null, 2) }); return false; } }, { label: 'Aplicar', action: () => { apply(); toast('Formato aplicado'); return false; } }, { label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: apply }] });
  }

  function prefsDialog() {
    const doc = editor.getDoc();
    const theme = h('select', { class: 'select' }, h('option', { value: 'system' }, 'Seguir al sistema'), h('option', { value: 'light' }, 'Claro'), h('option', { value: 'dark' }, 'Oscuro'));
    theme.value = prefs.theme;
    const lang = h('select', { class: 'select' }, h('option', { value: 'es' }, 'Español'), h('option', { value: 'en' }, 'English'));
    lang.value = doc.settings.lang;
    const ac = h('input', { type: 'checkbox', checked: prefs.autocomplete });
    const contd = h('input', { type: 'checkbox', checked: doc.settings.autoContd !== false });
    const nums = h('input', { type: 'checkbox', checked: !!doc.settings.sceneNumbers });
    const body = h('div', { class: 'form' }, ...field('Tema', theme), ...field('Idioma del guion', lang), ...field('Autocompletado', ac), ...field("(CONT'D) automático", contd), ...field('Números de escena', nums));
    modal({ title: 'Preferencias', body, buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
      setTheme(theme.value); prefs.autocomplete = ac.checked; editor.setAutocomplete(ac.checked); savePrefs();
      editor.mutateDoc((d) => { d.settings.lang = lang.value; d.settings.autoContd = contd.checked; d.settings.sceneNumbers = nums.checked; });
      editor.refreshFormat(); pushState(); recompute();
    } }] });
  }

  function timingDialog() {
    const t = prefs.timing;
    const n = (v, step) => h('input', { class: 'input', type: 'number', step, min: 0.1, value: v });
    const f = { target: n(t.target, 5), dialogueWps: n(t.dialogueWps, 0.1), actionWps: n(t.actionWps, 0.1), scene: n(t.scene, 0.5), transition: n(t.transition, 0.5) };
    const mode = h('select', { class: 'select' }, h('option', { value: 'content' }, 'Por contenido (diálogo y acción)'), h('option', { value: 'page' }, 'Una página = un minuto'));
    mode.value = t.mode;
    const body = h('div', null, h('div', { class: 'form' }, ...field('Método del medidor', mode), ...field('Duración objetivo (min)', f.target), ...field('Diálogo (palabras/seg)', f.dialogueWps), ...field('Acción (palabras/seg)', f.actionWps), ...field('Encabezado de escena (seg)', f.scene), ...field('Transición (seg)', f.transition)),
      h('p', { class: 'muted' }, 'El método por contenido estima la lectura en voz alta de diálogos y la acción visual; el de páginas usa la regla clásica de 1 página ≈ 1 minuto.'));
    modal({ title: 'Tiempo en pantalla', body, buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
      const v = (x, d) => { const k = parseFloat(x.value); return Number.isFinite(k) && k > 0 ? k : d; };
      prefs.timing = { ...t, mode: mode.value, target: v(f.target, 90), dialogueWps: v(f.dialogueWps, 2.7), actionWps: v(f.actionWps, 3.3), scene: v(f.scene, 2.5), transition: v(f.transition, 1.5) };
      savePrefs(); recompute();
    } }] });
  }

  function tableModal(title, head, rows, onRow) {
    const csv = [head, ...rows.map((r) => r.cells)].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const tbl = h('table', { class: 't' }, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, rows.map((r) => { const tr = h('tr', { class: onRow ? 'clk' : '' }, r.cells.map((c) => h('td', null, String(c)))); if (onRow) tr.addEventListener('click', () => { onRow(r); }); return tr; })));
    modal({ title, body: rows.length ? tbl : h('p', { class: 'muted' }, 'No hay datos todavía.'), wide: true, buttons: [{ label: 'Copiar CSV', action: () => { navigator.clipboard.writeText(csv).then(() => toast('CSV copiado'), () => toast('No se pudo copiar')); return false; } }, { label: 'Cerrar', primary: true }] });
  }
  function reportCharacters() {
    const doc = editor.getDoc();
    const st = characterStats(doc);
    tableModal('Reporte de personajes', ['Personaje', 'Intervenciones', 'Palabras', 'Escenas', 'Tiempo aprox.'], st.map((c) => ({ id: c.first, cells: [c.name, c.lines, c.words, c.scenes.size, T.format(c.words / prefs.timing.dialogueWps)] })), (r) => { setMainView('script'); editor.goTo(r.id); });
  }
  function reportLocations() {
    const doc = editor.getDoc();
    const secs = new Map(est.perScene.map((s) => [s.id, s.seconds]));
    const map = new Map();
    for (const s of M.scenes(doc)) {
      const p = headingParts(s.heading);
      const k = (p.prefix ? p.prefix + ' ' : '') + p.location;
      const e = map.get(k) || { n: 0, sec: 0, first: s.id }; e.n++; e.sec += secs.get(s.id) || 0; map.set(k, e);
    }
    const rows = [...map.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => ({ id: e.first, cells: [k, e.n, T.format(e.sec)] }));
    tableModal('Reporte de localizaciones', ['Localización', 'Escenas', 'Tiempo'], rows, (r) => { setMainView('script'); editor.goTo(r.id); });
  }
  function reportScenes() {
    const doc = editor.getDoc();
    const nums = M.numberScenes(doc);
    const secs = new Map(est.perScene.map((s) => [s.id, s.seconds]));
    const rows = M.scenes(doc).map((s) => {
      const chars = new Set();
      doc.blocks.slice(s.startIdx, s.endIdx).forEach((b) => { if (b.type === 'character') { const n = M.htmlToText(b.html).replace(/\s*\(.*\)\s*$/, '').toUpperCase().trim(); if (n) chars.add(n); } });
      const inf = lastPag && lastPag.info.get(s.id);
      return { id: s.id, cells: [nums.get(s.id), s.heading, inf ? inf.startPage : '', T.format(secs.get(s.id) || 0), [...chars].join(', ')] };
    });
    tableModal('Reporte de escenas', ['#', 'Encabezado', 'Pág.', 'Tiempo', 'Personajes'], rows, (r) => { setMainView('script'); editor.goTo(r.id); });
  }
  function statsDialog() {
    const doc = editor.getDoc();
    const pages = lastPag ? lastPag.pages.length : 1;
    let dw = 0, aw = 0;
    for (const b of doc.blocks) { const w = T.words(M.htmlToText(b.html)); if (b.type === 'dialogue') dw += w; else if (b.type === 'action') aw += w; }
    const scenes = doc.blocks.filter((b) => b.type === 'scene').length;
    const total = dw + aw || 1;
    const row = (a, b) => h('div', { class: 'stat' }, h('span', null, a), h('b', null, b));
    modal({ title: 'Estadísticas del guion', body: h('div', null, row('Páginas', pages), row('Palabras', T.wordCount(doc)), row('Escenas', scenes), row('Personajes', characterStats(doc).length), row('Duración estimada (contenido)', T.format(est.total)), row('Duración estimada (1 pág = 1 min)', T.format(pages * 60)), row('Diálogo / Acción', `${Math.round((dw / total) * 100)}% / ${Math.round((aw / total) * 100)}%`), row('Duración media de escena', scenes ? T.format(est.total / scenes) : '—')) });
  }
  function shortcutsDialog() {
    const rows = [['Ctrl+1 … Ctrl+9', 'Escena, Acción, Personaje, Paréntesis, Diálogo, Transición, Toma, General, Nota'], ['Enter', 'Nuevo elemento según el flujo (Escena→Acción, Personaje→Diálogo, Diálogo→Acción)'], ['Tab', 'En bloque vacío: cambia el tipo · Al final de línea: crea el siguiente elemento (Acción→Personaje)'], ['Shift+Tab', 'Cambia el tipo hacia atrás en un bloque vacío'], ['Backspace', 'En bloque vacío vuelve a Acción; al inicio une con el anterior'], ['Escribir INT. / EXT.', 'Convierte la línea en encabezado de escena'], ['Escribir (', 'Convierte la línea en paréntesis'], ['↑ ↓ Enter/Tab', 'Navegar y aceptar sugerencias del autocompletado'], ['Ctrl+B / I / U', 'Negrita, cursiva, subrayado'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / Rehacer'], ['Ctrl+F / Ctrl+H', 'Buscar / Reemplazar (F3, Shift+F3)'], ['Ctrl+Shift+F', 'Modo foco'], ['Ctrl+\\', 'Barra lateral'], ['Ctrl+Alt+1 / 2', 'Guion / Fichas'], ['Ctrl+Alt+N', 'Insertar nota'], ['Ctrl+Shift+A', 'Asistente IA flotante'], ['Ctrl+Shift+L', 'Tema claro/oscuro'], ['Ctrl+P', 'Exportar PDF']];
    modal({ title: 'Atajos de teclado', wide: true, body: h('table', { class: 't' }, h('tbody', null, rows.map(([k, d]) => h('tr', null, h('td', null, h('kbd', null, k)), h('td', null, d))))) });
  }
  async function aboutDialog() {
    const v = await api.version();
    modal({ title: 'Acerca de Guionista', body: h('div', null, h('p', null, `Guionista ${v}`), h('p', { class: 'muted' }, 'Editor de guiones con formato de industria automático, formatos personalizables, medidor de tiempo en pantalla y asistente de IA flotante. Aplicación original; sin telemetría ni conexiones propias: solo se conecta a los sitios de IA cuando abres el asistente.')) });
  }

  // ---------- buscar / reemplazar ----------
  let fState = { matches: [], idx: 0 };
  let findTimer = null;
  const findOpen = () => !$('findbar').hidden;
  function openFind(replace, text) {
    if (mainView !== 'script') setMainView('script');
    $('findbar').hidden = false;
    const s = text || editor.selectionText();
    if (s && !s.includes('\n')) $('findInput').value = s;
    (replace ? $('replaceInput') : $('findInput')).focus();
    $('findInput').select && !replace && $('findInput').select();
    doFind();
  }
  function closeFind() {
    if (!findOpen()) return;
    $('findbar').hidden = true;
    const m = fState.matches[fState.idx];
    editor.highlight([]);
    if (m) editor.goTo(m.id, false); else editor.focus();
  }
  const debounceFind = () => { clearTimeout(findTimer); findTimer = setTimeout(() => doFind(true), 200); };
  function fopts() { return { matchCase: $('findCase').checked, wholeWord: $('findWord').checked }; }
  function doFind(keep) {
    const q = $('findInput').value;
    const prev = fState.matches[fState.idx];
    fState.matches = editor.findAll(q, fopts());
    if (!keep || !prev) fState.idx = 0;
    else { const k = fState.matches.findIndex((m) => m.id === prev.id && m.start >= prev.start); fState.idx = k < 0 ? 0 : k; }
    showMatch(!keep);
  }
  function showMatch(scroll) {
    const n = fState.matches.length;
    $('findCount').textContent = n ? `${fState.idx + 1}/${n}` : (($('findInput').value) ? 'sin resultados' : '0/0');
    editor.highlight(fState.matches, fState.idx);
    const m = fState.matches[fState.idx];
    if (m && scroll) editor.reveal(m.id);
  }
  function stepFind(d) {
    if (!findOpen()) { openFind(false); return; }
    if (!fState.matches.length) return doFind();
    fState.idx = (fState.idx + d + fState.matches.length) % fState.matches.length;
    showMatch(true);
  }
  $('findInput').addEventListener('input', () => doFind());
  $('findInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') closeFind(); });
  $('replaceInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('replaceOne').click(); } if (e.key === 'Escape') closeFind(); });
  $('findCase').addEventListener('change', () => doFind());
  $('findWord').addEventListener('change', () => doFind());
  $('findNext').addEventListener('click', () => stepFind(1));
  $('findPrev').addEventListener('click', () => stepFind(-1));
  $('findClose').addEventListener('click', closeFind);
  $('replaceOne').addEventListener('click', () => {
    const m = fState.matches[fState.idx]; if (!m) return;
    editor.replaceMatches([m], $('replaceInput').value);
    doFind(true);
  });
  $('replaceAll').addEventListener('click', () => {
    const n = editor.replaceMatches(fState.matches, $('replaceInput').value);
    doFind(); if (n) toast(`${n} reemplazos`);
  });

  // ---------- archivos ----------
  const serializeDoc = () => JSON.stringify({ app: 'guionista', ...editor.getDoc() });
  function loadDoc(doc, info) {
    fileInfo = info || { path: null, name: 'Sin título' };
    editor.load(doc);
    refreshFormatSelect(); applyViewMode();
    dirty = false; api.setDirty(false); updateTitle(); updateSave();
    setMainView('script');
    recompute(); pushState(); renderSide();
  }
  async function confirmDiscard() {
    if (!dirty) return true;
    const r = await api.confirmBox({ message: 'Hay cambios sin guardar.', detail: '¿Quieres guardarlos antes de continuar?', buttons: ['Guardar', 'No guardar', 'Cancelar'] });
    if (r === 0) return !!(await save(false));
    return r === 1;
  }
  async function save(saveAs) {
    const doc = editor.getDoc();
    const r = await api.save({ path: fileInfo.path, data: serializeDoc(), saveAs: !!saveAs, suggestedName: doc.meta.title || fileInfo.name.replace(/\.guion$/i, '') });
    if (!r) return null;
    fileInfo = { path: r.path, name: r.name };
    setDirty(false); updateTitle(); api.autosaveClear(); toast('Guardado');
    return r;
  }
  function docFromFile(res) {
    const ext = res.ext;
    if (ext === '.guion' || ext === '.json') {
      const o = JSON.parse(res.data);
      if (!o || !Array.isArray(o.blocks)) throw new Error('El archivo no es un guion válido');
      return { doc: o, info: ext === '.guion' ? { path: res.path, name: res.name } : null };
    }
    if (ext === '.fdx') return { doc: F.fromFdx(res.data), info: null };
    return { doc: F.parse(res.data), info: null };
  }
  async function openResult(res) {
    if (!res) return;
    try {
      if (!(await confirmDiscard())) return;
      const { doc, info } = docFromFile(res);
      loadDoc(doc, info || { path: null, name: res.name.replace(/\.[^.]+$/, '') });
      if (!info) setDirty(true);
    } catch (e) { toast('No se pudo abrir: ' + e.message); }
  }
  async function exportAs(kind) {
    const doc = editor.getDoc();
    const base = doc.meta.title || fileInfo.name.replace(/\.guion$/i, '') || 'Guion';
    let data;
    try {
      if (kind === 'pdf') data = EX.buildHtml(doc);
      else if (kind === 'html') data = EX.buildHtml(doc, { screen: true });
      else if (kind === 'fountain') data = F.serialize(doc);
      else if (kind === 'fdx') data = F.toFdx(doc);
      else data = EX.buildText(doc);
    } catch (e) { toast('Error al generar: ' + e.message); return; }
    const r = await api.exportFile({ kind, data, suggestedName: base });
    if (r) toast('Exportado: ' + r.path.split(/[\\/]/).pop());
  }

  // ---------- acciones de menú ----------
  const actions = {
    new: async () => { if (await confirmDiscard()) { loadDoc(M.newDoc(editor.getDoc().settings.lang)); api.autosaveClear(); } },
    open: async () => openResult(await api.openDialog({})),
    'open-path': async (p) => openResult(await api.readFile(p)),
    save: () => save(false), 'save-as': () => save(true),
    'save-then-close': async () => { const r = await save(false); if (r) api.closeNow(); },
    'import-text': async () => openResult(await api.openDialog({ kind: 'text' })),
    'import-fdx': async () => openResult(await api.openDialog({ kind: 'fdx' })),
    'export-pdf': () => exportAs('pdf'), 'export-fountain': () => exportAs('fountain'), 'export-fdx': () => exportAs('fdx'), 'export-txt': () => exportAs('txt'), 'export-html': () => exportAs('html'),
    'title-page': titlePageDialog,
    watermark: () => promptDialog('Marca de agua', 'Texto (vacío = ninguna)', editor.getDoc().settings.watermark, (v) => { editor.mutateDoc((d) => { d.settings.watermark = v.slice(0, 40); }); }),
    undo: () => { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) document.execCommand('undo'); else editor.undo(); },
    redo: () => { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) document.execCommand('redo'); else editor.redo(); },
    find: () => openFind(false), replace: () => openFind(true), 'find-next': () => stepFind(1), 'find-prev': () => stepFind(-1),
    prefs: prefsDialog,
    bold: () => editor.exec('bold'), italic: () => editor.exec('italic'), underline: () => editor.exec('underline'),
    uppercase: () => { const t = editor.selectionText(); if (t && !t.includes('\n')) { editor.focus(); document.execCommand('insertText', false, t.toUpperCase()); } },
    'edit-format': openFormatEditor,
    'save-format': () => { const f = FM.resolve(editor.getDoc()); api.saveFormat({ data: JSON.stringify(f, null, 2) }); },
    'load-format': async () => {
      const txt = await api.loadFormat(); if (!txt) return;
      try { const f = FM.sanitizeFormat(JSON.parse(txt)); editor.mutateDoc((d) => { d.custom = f; d.settings.formatId = 'custom'; }); editor.refreshFormat(); refreshFormatSelect(); recompute(); pushState(); toast('Plantilla cargada: ' + f.name); } catch (e) { toast('Plantilla no válida'); }
    },
    'toggle-scene-numbers': () => { editor.mutateDoc((d) => { d.settings.sceneNumbers = !d.settings.sceneNumbers; }); pushState(); recompute(); },
    'toggle-lock': () => { editor.mutateDoc((d) => { M.lockScenes(d, !d.locked); if (d.locked) d.settings.sceneNumbers = true; }); pushState(); recompute(); },
    'view:page': () => { prefs.viewMode = 'page'; savePrefs(); applyViewMode(); pushState(); },
    'view:draft': () => { prefs.viewMode = 'draft'; savePrefs(); applyViewMode(); pushState(); },
    'main:script': () => setMainView('script'), 'main:cards': () => setMainView('cards'),
    'toggle-sidebar': () => { prefs.sidebar = !prefs.sidebar; savePrefs(); applySidebar(); pushState(); },
    'toggle-focus': () => setFocusMode(!focusMode),
    'theme-toggle': () => setTheme(document.documentElement.dataset.eff === 'dark' ? 'light' : 'dark'),
    'zoom-in': () => zoomBy(0.1), 'zoom-out': () => zoomBy(-0.1), 'zoom-reset': () => { prefs.zoom = 1; savePrefs(); applyZoom(); },
    'report-characters': reportCharacters, 'report-locations': reportLocations, 'report-scenes': reportScenes,
    'timing-prefs': timingDialog, stats: statsDialog,
    'toggle-autocomplete': () => { prefs.autocomplete = !prefs.autocomplete; editor.setAutocomplete(prefs.autocomplete); savePrefs(); pushState(); },
    'toggle-contd': () => { editor.mutateDoc((d) => { d.settings.autoContd = d.settings.autoContd === false; }); pushState(); recompute(); },
    'insert-note': (text) => { if (mainView !== 'script') setMainView('script'); editor.insertAfter('note', typeof text === 'string' ? M.escapeHtml(text) : ''); },
    shortcuts: shortcutsDialog, about: aboutDialog
  };
  api.onMenu((action, arg) => {
    let fn = actions[action];
    if (fn) return fn(arg);
    const [k, v] = action.split(':');
    if (k === 'type' && TYPE_ORDER.includes(v)) { if (mainView === 'script') editor.setType(v); }
    else if (k === 'format') setFormatId(v);
    else if (k === 'theme' && ['system', 'light', 'dark'].includes(v)) setTheme(v);
    else if (k === 'lang' && LG.LANGS[v]) { editor.mutateDoc((d) => { d.settings.lang = v; }); editor.refreshFormat(); pushState(); }
    else if (k === 'revision') {
      editor.mutateDoc((d) => {
        if (v === 'none') d.revision = null;
        else if (v === 'clear') { d.revision = null; for (const b of d.blocks) delete b.rev; }
        else if (EX.REVCOLORS[v]) d.revision = { color: v };
      });
      pushState(); toast(v === 'none' ? 'Revisión terminada' : v === 'clear' ? 'Marcas de revisión eliminadas' : 'Revisión iniciada: los cambios se marcarán');
    }
    return undefined;
  });
  api.onRequest((kind, arg) => {
    if (kind !== 'context') return null;
    if (arg === 'selection') return editor.selectionText();
    if (arg === 'scene') return editor.sceneText();
    if (arg === 'script') return F.serialize({ ...editor.getDoc(), meta: {} });
    return null;
  });

  function pushState() {
    const d = editor.getDoc();
    const s = { theme: prefs.theme, viewMode: prefs.viewMode, mainView, sidebar: prefs.sidebar, focus: focusMode, sceneNumbers: d.settings.sceneNumbers, locked: d.locked, formatId: d.settings.formatId, lang: d.settings.lang, autocomplete: prefs.autocomplete, autoContd: d.settings.autoContd !== false, revision: d.revision ? d.revision.color : null, currentType: curBlock ? curBlock.type : null };
    const j = JSON.stringify(s);
    if (j !== lastState) { lastState = j; api.setState(s); }
  }

  // ---------- botones ----------
  $('btnBold').addEventListener('mousedown', (e) => e.preventDefault());
  $('btnItalic').addEventListener('mousedown', (e) => e.preventDefault());
  $('btnUnderline').addEventListener('mousedown', (e) => e.preventDefault());
  $('btnBold').addEventListener('click', actions.bold);
  $('btnItalic').addEventListener('click', actions.italic);
  $('btnUnderline').addEventListener('click', actions.underline);
  $('btnEditFormat').addEventListener('click', openFormatEditor);
  $('btnViewScript').addEventListener('click', () => setMainView('script'));
  $('btnViewCards').addEventListener('click', () => setMainView('cards'));
  $('btnZoomIn').addEventListener('click', () => zoomBy(0.1));
  $('btnZoomOut').addEventListener('click', () => zoomBy(-0.1));
  $('btnFocus').addEventListener('click', () => setFocusMode(!focusMode));
  $('btnTheme').addEventListener('click', actions['theme-toggle']);
  $('btnAI').addEventListener('click', () => api.openAI());
  $('meter').addEventListener('click', timingDialog);
  $('stTime').addEventListener('click', timingDialog);
  $('stTime').style.cursor = 'pointer'; $('meter').style.cursor = 'pointer';

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (findOpen()) closeFind(); else if (focusMode) setFocusMode(false); }
  });
  // arrastrar archivos al editor
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    const p = api.pathForFile(f);
    if (p) openResult(await api.readFile(p));
  });

  // autoguardado / recuperación
  setInterval(() => { if (dirty) api.autosaveWrite(JSON.stringify({ doc: editor.getDoc(), name: fileInfo.name, path: fileInfo.path })); }, 20000);

  // ---------- arranque ----------
  (async function init() {
    applyTheme(); applyZoom(); applyViewMode(); applySidebar();
    loadDoc(M.newDoc('es'));
    const init = await api.initialFile();
    if (init) { openResult(await api.readFile(init)); return; }
    const raw = await api.autosaveRead();
    if (raw) {
      try {
        const a = JSON.parse(raw);
        if (a && a.doc && Array.isArray(a.doc.blocks)) {
          const r = await api.confirmBox({ message: 'Se encontró un documento sin guardar de la sesión anterior.', detail: '¿Quieres recuperarlo?', buttons: ['Recuperar', 'Descartar'] });
          if (r === 0) { loadDoc(a.doc, { path: a.path || null, name: a.name || 'Recuperado' }); setDirty(true); return; }
        }
      } catch (e) { /* autoguardado corrupto */ }
      api.autosaveClear();
    }
    editor.focus();
  })();
})(self);
