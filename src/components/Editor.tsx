"use client";
import { LogoMark } from "./Logo";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Archive, ArrowDown, FolderCog, History, FileDown, ExternalLink, SaveAll, LayoutTemplate, SpellCheck, ZoomIn, ZoomOut, FileSliders, ListChecks, Timer, Maximize2, Minimize2, ArrowUp, BookOpen, Bold, CaseLower, CaseSensitive, CaseUpper, Clapperboard, ClipboardPaste, Columns2, Copy, Download, Eraser, FileCode, FilePlus,
  FileText, FolderOpen, Highlighter, Hash, Info, Italic, Keyboard, LocateFixed, Lock, LockOpen, MoonStar, Moon, PanelLeft, PanelTop, Printer, Redo2, Replace, Save, Scissors,
  SeparatorHorizontal, Sparkles, Sun, Trash2, Underline, Undo2, Upload, Users, BarChart3, Search, Layers,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  changeCase, cycle, currentElement, tabFlow, trimDanglingParen, deleteBack, deleteForward, deleteWordBack, deleteWordForward, deleteScene, wordEnd, wordStart, DocState, enter, formatState, hasSelection, insertText, renameCharacter, replaceRange, selectAll, selectedText, selection, span,
  setType, stampRevision, toggleDual, toggleFormat, togglePageBreak,
} from "@/engine/doc";
import { parseFdx, toFdx } from "@/engine/fdx";
import { findMatches, replaceAll } from "@/engine/find";
import { parseFountain, toFountain } from "@/engine/fountain";
import { firstDiff, initHist, reduce } from "@/engine/history";
import { charW, lineH, lineLeftIn, lineRightIn, linesPerPage, rowTopIn } from "@/engine/layout";
import { CachedMeasurer } from "@/engine/measure";
import { defaultMeta, DocMeta, REVISION_COLORS, ViewMode } from "@/engine/meta";
import { moveScene, sceneList } from "@/engine/navigator";
import { lockEntries, Page, paginateElements, PLine } from "@/engine/paginate";
import { buildLists, CATEGORY_LABEL, suggest } from "@/engine/smarttype";
import { candidateWords, isChecked, grammarIssues, WORD } from "@/engine/grammar";
import { SpellService } from "@/lib/spell";
import { ELEMENT_KEY, ELEMENT_TYPES, Element, elementForKey, elementText, ElementType } from "@/engine/types";
import { Assistant } from "./Assistant";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { SmartPopup, Anchor } from "./SmartPopup";
import { importFileToScript, openNative, showScript, showWelcome } from "@/lib/import-client";
import { formatMinutes, progress as progressOf, screenMinutes } from "@/engine/screentime";
import { AboutDialog, characterNames, download, GoToDialog, OpenDialog, TargetDialog, HeaderFooterDialog, RenameCharacterDialog, ReportsDialog, PageLayoutDialog, RevisionsDialog, safeName, ShortcutsDialog, SmartTypeDialog, TitlePageDialog } from "./Dialogs";
import { Navigator, NavScene } from "./Navigator";
import { hasTitlePage, indexElements, PageSheet, TitleSheet } from "./PageSheet";
import { Ribbon, RibbonTab, Item, ribbonSig } from "./Ribbon";

/** "[G] General": the letter column keeps every element name aligned (the list is set in a fixed-width face). */
const elementLabel = (t: ElementType) => `[${ELEMENT_KEY[t]}] ${t}`;
type SaveStatus = "saved" | "saving" | "offline" | "conflict";
const SAVE_DELAY = 800, RETRY_DELAY = 4000;
type DialogId = null | "layout" | "open:file" | "open:recent" | "target" | "smarttype" | "title" | "headfoot" | "revisions" | "goto" | "rename" | "shortcuts" | "about" | `reports:${string}`;


interface VLine { page: number; row: number; line: PLine }
/** Off-screen pages render as empty sheets until they are near the viewport (keeps a 120-page script fast). */
function Lazy({ force, render }: { force: boolean; render: () => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => setNear(es.some((e) => e.isIntersecting)), { rootMargin: "1600px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{near || force ? render() : null}</div>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const px = (inches: number) => inches * 96;

export function Editor({ scriptId, title, initial, initialMeta, rev: initialRev, desktop }: { scriptId: string; title: string; initial: DocState; initialMeta: DocMeta; rev: number; desktop: boolean }) {
  const router = useRouter();
  const [h, dispatch] = useReducer(reduce, initial, initHist);
  const [meta, setMeta] = useState<DocMeta>(initialMeta);
  const metaRef = useRef(meta); metaRef.current = meta;
  const lay = meta.layout;
  const CH = charW(lay) * 96, LINE = lineH(lay) * 96, PW = lay.width * 96, PH = lay.height * 96;
  const lpp = linesPerPage(lay);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const zoomAnchor = useRef<{ px: number; py: number; ratio: number } | null>(null);
  const [spellVer, setSpellVer] = useState(0);
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [dialog, setDialog] = useState<DialogId>(null);
  const [find, setFind] = useState({ open: false, q: "", r: "", matchCase: false });
  const [notice, setNotice] = useState("");
  const [immersive, setImmersive] = useState(false);
  const [picker, setPicker] = useState<number | null>(null); // element list opened by Return on an empty line
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [chip, setChip] = useState(false);
  const [engaged, setEngaged] = useState(false); // SmartType lists stay closed until the writer has typed or pressed a key in this window
  const [ctx, setCtx] = useState<{ x: number; y: number; scene?: string } | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [popIdx, setPopIdx] = useState(0);
  const [mainW, setMainW] = useState(1200);
  const input = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const goalCol = useRef<number | null>(null);
  const drag = useRef<{ id: string; anchor: number } | null>(null);
  const ptr = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false); // while the mouse button is down on the page, popups step aside so they cannot catch the drag
  const scrollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const measurer = useRef(new CachedMeasurer()).current;
  const cache = useRef<{ els: DocState["elements"]; lock: DocMeta["revision"]["locked"]; mores: boolean; lang: DocMeta["language"]; layout: DocMeta["layout"]; pages: Page[] } | null>(null);
  const { cur } = h;
  const refocus = useCallback(() => input.current?.focus(), []);
  const say = (m: string) => { setNotice(m); setTimeout(() => setNotice((n) => (n === m ? "" : n)), 4500); };

  // ---------- persistence ----------
  const rev = useRef(initialRev);
  const latest = useRef({ cur, meta });
  const inflight = useRef(false);
  const again = useRef(false);
  const conflictRetries = useRef(0);
  const lastSaved = useRef({ cur, meta });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  latest.current = { cur, meta };
  const save = useCallback(async () => {
    if (inflight.current) { again.current = true; return; }
    const snap = latest.current;
    if (snap.cur === lastSaved.current.cur && snap.meta === lastSaved.current.meta) return;
    inflight.current = true; setStatus("saving");
    try {
      const body = JSON.stringify({ elements: snap.cur.elements, cursor: { id: snap.cur.cursor.id, offset: snap.cur.cursor.offset }, meta: snap.meta, rev: rev.current });
      // `keepalive` requests are capped at 64 KiB (bytes, not characters) by the browser: a longer body is rejected before it is sent ("Failed to fetch"),
      // which made every real-sized script look offline. Big scripts use a normal request (the window waits for the save before closing).
      const r = await fetch(`/api/scripts/${scriptId}`, {
        method: "PUT", headers: { "content-type": "application/json" }, ...(body.length < 20_000 ? { keepalive: true } : {}), body,
      });
      if (r.status === 409) {
        // The desktop app has a single writer per script (one window each), so a stale revision can only come from our own earlier request
        // (for example one that was cut off after the server stored it). Take the server's revision and save again instead of stopping.
        const server = desktop ? ((await r.json().catch(() => null)) as { rev?: number } | null)?.rev : undefined;
        if (typeof server === "number" && server !== rev.current && (conflictRetries.current += 1) <= 3) { rev.current = server; again.current = true; return; }
        setStatus("conflict"); return;
      }
      conflictRetries.current = 0;
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) throw new Error(String(r.status));
      rev.current = ((await r.json()) as { rev: number }).rev;
      lastSaved.current = snap;
      setStatus(latest.current.cur === snap.cur && latest.current.meta === snap.meta ? "saved" : "saving");
    } catch {
      setStatus("offline"); clearTimeout(timer.current); timer.current = setTimeout(save, RETRY_DELAY);
      return;
    } finally {
      inflight.current = false;
      if (again.current) { again.current = false; timer.current = setTimeout(save, 0); }
    }
  }, [scriptId]);
  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    while (inflight.current) await sleep(40);
    await save();
    while (inflight.current) await sleep(40);
  }, [save]);
  useEffect(() => {
    if (cur === lastSaved.current.cur && meta === lastSaved.current.meta) return;
    clearTimeout(timer.current); timer.current = setTimeout(save, SAVE_DELAY);
    return () => clearTimeout(timer.current);
  }, [cur, meta, save]);
  // the desktop shell asks every window to finish saving before it closes: resolves true when nothing is left unsaved
  const flushAll = useCallback(async () => {
    try {
      clearTimeout(fdxTimer.current);
      await saveNow();
      const snap = latest.current;
      const ok = snap.cur === lastSaved.current.cur && snap.meta === lastSaved.current.meta;
      if (ok && touched.current && window.guionista) { try { await writeFdx({ quiet: true }); } catch { /* the internal copy is already safe */ } }
      return ok;
    } catch { return false; }
  }, [saveNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    (window as unknown as { __guionistaFlush?: () => Promise<boolean> }).__guionistaFlush = flushAll;
    return () => { delete (window as unknown as { __guionistaFlush?: unknown }).__guionistaFlush; };
  }, [flushAll]);
  useEffect(() => {
    const flush = () => { clearTimeout(timer.current); void save(); };
    window.addEventListener("online", flush); window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("online", flush); window.removeEventListener("pagehide", flush); };
  }, [save]);
  useEffect(() => { input.current?.focus(); if (window.innerWidth < 900) { const z = Math.max(0.4, (window.innerWidth - 56) / PW); zoomRef.current = z; setZoomState(z); } }, []);
  useEffect(() => {
    const el = mainRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setMainW(el.clientWidth)); ro.observe(el); setMainW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---------- the .fdx file: the script is also written as Final Draft XML to a folder the writer chooses ----------
  const [filePath, setFilePath] = useState(initialMeta.file);
  const [fdxState, setFdxState] = useState<"idle" | "saving" | "saved" | "error">(initialMeta.file ? "saved" : "idle");
  const fdxTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touched = useRef(false); // an untouched blank script does not create a file by itself
  const fdxXml = () => toFdx(latest.current.cur.elements, latest.current.meta);
  const noteFile = (p: string, first: boolean) => {
    setFilePath(p);
    if (p !== metaRef.current.file) updateMeta({ ...metaRef.current, file: p });
    if (first) say(`Saved as ${p}`);
  };
  /** Write the .fdx now. Desktop: to the linked file (created in the scripts folder the first time). Web: a download. */
  const writeFdx = useCallback(async (opts?: { saveAs?: boolean; quiet?: boolean }) => {
    const g = window.guionista;
    const title = titleRef.current;
    if (!g) {
      if (opts?.saveAs || !opts?.quiet) download(`${safeName(title)}.fdx`, fdxXml(), "application/xml");
      return;
    }
    setFdxState("saving");
    const r = opts?.saveAs ? await g.saveFdxAs({ title, xml: fdxXml() }) : await g.saveFdx({ path: metaRef.current.file || undefined, title, xml: fdxXml() });
    if (r.ok && r.path) { setFdxState("saved"); noteFile(r.path, r.path !== metaRef.current.file); }
    else if ("canceled" in r && r.canceled) setFdxState(metaRef.current.file ? "saved" : "idle");
    else { setFdxState("error"); say(`Could not write the .fdx file${r.error ? `: ${r.error}` : "."}`); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const titleRef = useRef(title); titleRef.current = title;
  useEffect(() => { document.title = `${title} — Guionista`; }, [title]); // the window title is what the Windows taskbar shows for each open script
  useEffect(() => { // after the editor stops changing, mirror the script into its .fdx
    if (!window.guionista) return;
    if (cur !== initial) touched.current = true;
    if (!touched.current && !metaRef.current.file) return;
    if (cur === initial && meta === initialMeta) return;
    clearTimeout(fdxTimer.current);
    fdxTimer.current = setTimeout(() => { void writeFdx({ quiet: true }); }, 1800);
    return () => clearTimeout(fdxTimer.current);
  }, [cur, meta.titlePage, writeFdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseFolder = async () => { const r = await window.guionista?.chooseFolder(); if (r?.ok && r.folder) say(`New scripts are saved in ${r.folder}`); };

  // ---------- pagination: dirty range forward, reference-diffed so undo/redo repaginate the same way ----------
  const lock = meta.revision.locked;
  const pages = useMemo(() => {
    const prev = cache.current;
    const ok = prev && prev.lock === lock && prev.mores === meta.mores && prev.lang === meta.language && prev.layout === lay;
    const resume = ok ? { pages: prev.pages, dirty: firstDiff(prev.els, cur.elements) } : undefined;
    measurer.layout = lay;
    const next = paginateElements(cur.elements, measurer, { resume, lock, mores: meta.mores, lang: meta.language, layout: lay });
    cache.current = { els: cur.elements, lock, mores: meta.mores, lang: meta.language, layout: lay, pages: next };
    return next;
  }, [cur.elements, lock, meta.mores, meta.language, lay, measurer]);
  const elsById = useMemo(() => indexElements(cur.elements), [cur.elements]);
  const scenes = useMemo(() => sceneList(cur.elements), [cur.elements]);
  const sceneNo = useMemo(() => new Map(scenes.map((s) => [s.id, s.number])), [scenes]);
  const navRef = useRef<NavScene[]>([]);
  const navScenes = useMemo(() => {
    const first = new Map<string, string>();
    for (const p of pages) for (const l of p.lines) if (l.type === "Scene Heading" && !first.has(l.elementId)) first.set(l.elementId, p.label);
    const next = scenes.map((s) => ({ id: s.id, number: s.number, heading: s.heading, summary: s.summary, page: first.get(s.id) ?? "" }));
    const prev = navRef.current;
    const same = prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.number === next[i].number && p.heading === next[i].heading && p.summary === next[i].summary && p.page === next[i].page);
    return same ? prev : (navRef.current = next);
  }, [scenes, pages]);
  const vlines = useMemo(() => {
    const out: VLine[] = [];
    pages.forEach((p, pi) => p.lines.forEach((line) => { if (line.start !== undefined && !line.synthetic) out.push({ page: pi, row: line.row, line }); }));
    return out;
  }, [pages]);
  const locate = useCallback((id: string, offset: number) => {
    let best = -1;
    for (let i = 0; i < vlines.length; i++) {
      const v = vlines[i]; if (v.line.elementId !== id) { if (best >= 0) break; continue; }
      if (v.line.start! <= offset) best = i; else if (best < 0) best = i;
    }
    if (best < 0) return null;
    const v = vlines[best];
    return { index: best, v, col: Math.max(0, Math.min(offset - v.line.start!, v.line.text.length)) };
  }, [vlines]);
  const caret = locate(cur.cursor.id, cur.cursor.offset);
  const el = currentElement(cur);
  const cursorIdx = cur.elements.indexOf(el);
  const sel = selection(cur.cursor);           // selection inside one line
  const sp = useMemo(() => span(cur), [cur]);   // selection across several lines, scenes or pages
  const anySel = !!sel || !!sp;
  const currentScene = useMemo(() => { let s = null as string | null; for (const x of scenes) if (x.start <= cursorIdx) s = x.id; return s; }, [scenes, cursorIdx]);

  // ---------- SmartType ----------
  const wantsLists = engaged && meta.smartType.enabled && (el.type === "Character" || el.type === "Scene Heading" || el.type === "Transition");
  const lists = useMemo(() => (wantsLists ? buildLists(cur.elements, meta.smartType, meta.language) : null), [cur.elements, wantsLists, meta.smartType, meta.language]);
  const sug = useMemo(() => {
    const s = lists ? suggest(el, cur.cursor.offset, lists) : null;
    if (!s || hasSelection(cur)) return null;
    return dismissed === `${el.id}:${elementText(el)}:${cur.cursor.offset}` ? null : s;
  }, [el, cur, lists, dismissed]);
  useEffect(() => setPopIdx(sug?.open ? -1 : 0), [sug?.items.join("|"), sug?.open]);
  useLayoutEffect(() => {
    const r = caretRef.current?.getBoundingClientRect();
    setAnchor((a) => (r && (!a || Math.abs(a.x - r.left) > 0.5 || Math.abs(a.y - r.top) > 0.5 || a.h !== r.height) ? { x: r.left, y: r.top, h: r.height } : r ? a : null));
  });
  useEffect(() => { if (!revealRef.current) caretRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [cur.cursor, pages]);
  // a find result is shown where it is: the page is scrolled so the match sits in the middle of the window, even if that page was not drawn yet
  useEffect(() => {
    if (!revealRef.current) return;
    const sl = selection(cur.cursor), m = mainRef.current; if (!sl || !m) return;
    const at = locate(cur.cursor.id, sl[0]); if (!at) return;
    revealRef.current = false;
    const wrap = m.querySelector<HTMLElement>(`[data-pw="${at.v.page}"]`); if (!wrap) return;
    const mr = m.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const y = wr.top - mr.top + m.scrollTop + (lay.top + at.v.row * lineH(lay)) * 96 * zoomRef.current;
    m.scrollTo({ top: Math.max(0, y - m.clientHeight / 2), behavior: "auto" });
  }, [cur.cursor, locate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- editing ----------
  const edit = (fn: (s: DocState) => DocState, key?: string) => {
    goalCol.current = null; setEngaged(true);
    dispatch({ t: "edit", key, fn: (s) => { const n = fn(s); const r = metaRef.current.revision; return n !== s && r.active ? stampRevision(s, n, r.pass) : n; } });
  };
  /** Move the caret; with `extend` the selection grows from where it started, even if that was in another scene or page. */
  const moveTo = (id: string, offset: number, extend: boolean, keepGoal = false) => {
    if (!keepGoal) goalCol.current = null;
    let anchor: number | undefined, anchorId: string | undefined;
    if (extend) {
      const c = cur.cursor;
      anchor = c.anchor ?? c.offset; anchorId = c.anchor !== undefined ? c.anchorId ?? c.id : c.id;
      if (anchorId === id) anchorId = undefined;
    }
    dispatch({ t: "cursor", cursor: { id, offset, anchor, anchorId } });
  };
  const jump = (id: string) => { moveTo(id, 0, false); refocus(); };
  const jumpRef = useRef(jump); jumpRef.current = jump;
  const navJump = useCallback((id: string) => jumpRef.current(id), []);
  const editRef = useRef(edit); editRef.current = edit;
  const navMove = useCallback((id: string, before: string | null) => editRef.current((s) => { const els = moveScene(s.elements, id, before); return els === s.elements ? s : { ...s, elements: els }; }), []);
  const accept = () => {
    if (!sug) return;
    const item = sug.items[popIdx];
    if (item === undefined) return;
    edit((s) => replaceRange(s, sug.from, sug.to, sug.prefix + item + sug.suffix));
  };
  const fmt = (k: "bold" | "italic" | "underline") => {
    if (hasSelection(cur)) edit((s) => toggleFormat(s, k));
    else dispatch({ t: "cursor", cursor: toggleFormat(cur, k).cursor });
  };
  const updateMeta = (m: DocMeta) => setMeta(m);

  // ---------- find / replace ----------
  const matches = useMemo(() => (find.open ? findMatches(cur.elements, find.q, find.matchCase) : []), [find.open, find.q, find.matchCase, cur.elements]);
  const orderOf = useMemo(() => new Map(cur.elements.map((e, i) => [e.id, i])), [cur.elements]);
  const revealRef = useRef(false); // set when the find box moves the selection: scroll it into view once it is on screen
  const selectMatch = (m: { id: string; start: number; end: number }) => { revealRef.current = true; dispatch({ t: "cursor", cursor: { id: m.id, offset: m.end, anchor: m.start } }); };
  const findStep = (dir: 1 | -1, from?: "start") => {
    if (!matches.length) return;
    const sel = selection(cur.cursor);
    const pos = (id: string, off: number) => (orderOf.get(id) ?? 0) * 1e7 + off;
    const here = pos(cur.cursor.id, dir === 1 ? (sel && from !== "start" ? sel[1] : sel ? sel[0] : cur.cursor.offset) : (sel ? sel[0] : cur.cursor.offset));
    const list = dir === 1 ? matches : [...matches].reverse();
    const hit = list.find((m) => (dir === 1 ? pos(m.id, m.start) >= here : pos(m.id, m.start) < here));
    selectMatch(hit ?? list[0]);
  };
  const matchesById = useMemo(() => { const m = new Map<string, { start: number; end: number }[]>(); for (const x of matches) { const l = m.get(x.id); if (l) l.push(x); else m.set(x.id, [x]); } return m; }, [matches]);
  const matchNo = useMemo(() => { const sl = selection(cur.cursor); if (!sl) return 0; return matches.findIndex((m) => m.id === cur.cursor.id && m.start === sl[0] && m.end === sl[1]) + 1; }, [matches, cur.cursor]);
  // typing in the find box jumps to the first match at or after the caret
  useEffect(() => { if (find.open && find.q && matches.length) findStep(1, "start"); }, [find.q, find.matchCase]); // eslint-disable-line react-hooks/exhaustive-deps
  const afterReplace = useRef(false);
  const replaceOne = () => {
    const sel = selection(cur.cursor); if (!sel || !find.q) return findStep(1);
    const t = elementText(el).slice(sel[0], sel[1]);
    if ((find.matchCase ? t : t.toLowerCase()) === (find.matchCase ? find.q : find.q.toLowerCase())) { afterReplace.current = true; edit((s) => ({ ...replaceRange(s, sel[0], sel[1], find.r), cursor: { id: s.cursor.id, offset: sel[0] + find.r.length } })); }
    else findStep(1);
  };
  useEffect(() => { if (afterReplace.current) { afterReplace.current = false; findStep(1); } }, [cur.elements]); // eslint-disable-line react-hooks/exhaustive-deps
  const openFind = () => { setFind((f) => ({ ...f, open: true })); setTimeout(() => findRef.current?.select(), 0); };

  // ---------- files ----------
  const pdf = async (printIt: boolean) => {
    await saveNow();
    if (window.guionista) {
      const r = printIt ? await window.guionista.print(scriptId) : await window.guionista.exportPdf(scriptId, safeName(title));
      if (!r.ok && !("canceled" in r && r.canceled)) say("Could not create the PDF.");
      else if (r.ok && !printIt) say("PDF saved.");
    } else window.open(`/print/${scriptId}?auto=1`, "_blank", "noopener");
  };
  /** "New" and "Templates": the welcome page with the template gallery (a window of its own on desktop). */
  const newScript = async () => { await saveNow(); await showWelcome((u) => router.push(u)); };
  /** Every script opens in its own window, so the ones already open stay open (each has its own taskbar entry). */
  const showIn = async (id: string) => { await saveNow(); await showScript(id, (u) => router.push(u), true); };
  const openFile = async (f: File) => {
    try {
      say(`Opening ${f.name}…`);
      const r = await importFileToScript(f);
      await showIn(r.id);
    } catch (e) { say(e instanceof Error && e.message ? e.message : "That file could not be opened. Use a .fdx, .fountain, .txt screenplay or a Guionista backup."); }
  };
  const openNativeFile = async () => {
    try {
      const r = await openNative();
      if (!r) return;
      if (r.id === scriptId) return say("That file is this one.");
      if (r.existing) say(`That file is already open as “${r.title}”.`);
      await showIn(r.id);
    } catch (e) { say(e instanceof Error && e.message ? e.message : "That file could not be opened."); }
  };
  const openScript = async (id: string) => { if (id === scriptId) return close(); close(); await showIn(id); };
  const clip = async (cut: boolean) => {
    const t = selectedText(cur); if (!t) return;
    await navigator.clipboard.writeText(t); if (cut) edit(deleteBack);
  };
  const paste = async () => { try { const t = await navigator.clipboard.readText(); if (t) edit((s) => insertText(s, t)); } catch { say("Paste is blocked here: press Ctrl-V instead."); } };
  const plainText = (els: Element[]) => toFountain(els, { titlePage: defaultMeta().titlePage });
  const getContext = (scope: "scene" | "selection" | "script" | "none") => {
    if (scope === "none") return "";
    if (scope === "selection") return selectedText(cur);
    if (scope === "script") return plainText(cur.elements).slice(0, 110_000);
    const s = scenes.find((x) => x.id === currentScene);
    return s ? plainText(cur.elements.slice(s.start, s.end)) : plainText(cur.elements.slice(0, 60));
  };
  const markedCount = cur.elements.filter((e) => e.rev).length;
  const jumpRev = (dir: 1 | -1) => {
    const n = cur.elements.length;
    for (let k = 1; k <= n; k++) { const e = cur.elements[(cursorIdx + dir * k + n * 2) % n]; if (e.rev) return jump(e.id); }
    say("No revised elements yet.");
  };

  // ---------- spelling and grammar (QA corrector) ----------
  const spellRef = useRef<SpellService | null>(null);
  useEffect(() => {
    if (!meta.spell.enabled) { spellRef.current?.dispose(); spellRef.current = null; setSpellVer((v) => v + 1); return; }
    const sp = new SpellService(() => setSpellVer((v) => v + 1));
    spellRef.current = sp; sp.setLanguage(meta.language);
    return () => { sp.dispose(); if (spellRef.current === sp) spellRef.current = null; };
  }, [meta.spell.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { spellRef.current?.setLanguage(meta.language); }, [meta.language]);
  // names, places and transitions are never "misspelled": whatever appears in them is accepted, plus the writer's own list
  const [ignoreSet, setIgnoreSet] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const id = setTimeout(() => {
      const set = new Set(meta.spell.ignore.map((w) => w.toLocaleLowerCase()));
      for (const e of cur.elements) if (!isChecked(e)) for (const m of elementText(e).matchAll(WORD)) set.add(m[0].toLocaleLowerCase());
      setIgnoreSet((prev) => (prev.size === set.size && [...set].every((w) => prev.has(w)) ? prev : set));
    }, 350);
    return () => clearTimeout(id);
  }, [cur.elements, meta.spell.ignore]);
  useEffect(() => {
    const sp = spellRef.current; if (!sp || !sp.ready) return;
    const id = setTimeout(() => {
      const words = new Set<string>();
      for (const e of cur.elements) if (isChecked(e)) for (const w of candidateWords(elementText(e))) words.add(w.word);
      sp.request(words);
    }, 250);
    return () => clearTimeout(id);
  }, [cur.elements, spellVer, meta.language]);
  const marks = useMemo(() => (meta.spell.enabled ? { ver: spellVer, lang: meta.language, isBad: (w: string) => spellRef.current?.isBad(w) ?? false, ignore: ignoreSet } : null), [spellVer, meta.language, meta.spell.enabled, ignoreSet]);

  // ---------- zoom: pinch / Ctrl+wheel for fine zoom, anchored under the pointer like a word processor ----------
  const setZoom = useCallback((z: number, focus?: { px: number; py: number }) => {
    const next = Math.max(0.25, Math.min(4, Math.round(z * 1000) / 1000));
    const prev = zoomRef.current; if (next === prev) return;
    const m = mainRef.current;
    if (m) zoomAnchor.current = { px: focus?.px ?? m.clientWidth / 2, py: focus?.py ?? m.clientHeight / 2, ratio: next / prev };
    zoomRef.current = next; setZoomState(next);
  }, []);
  useLayoutEffect(() => {
    const a = zoomAnchor.current, m = mainRef.current; if (!a || !m) return;
    zoomAnchor.current = null;
    m.scrollTop = (m.scrollTop + a.py) * a.ratio - a.py;
    m.scrollLeft = Math.max(0, (m.scrollWidth - m.clientWidth) / 2); // the page stays centred while zooming
  }, [zoom]);
  useEffect(() => {
    const m = mainRef.current; if (!m) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a two-finger pinch arrives as a wheel event with ctrlKey set
      e.preventDefault();
      const r = m.getBoundingClientRect();
      const d = Math.max(-40, Math.min(40, e.deltaY));
      setZoom(zoomRef.current * Math.exp(-d * 0.0085), { px: e.clientX - r.left, py: e.clientY - r.top });
    };
    m.addEventListener("wheel", wheel, { passive: false });
    return () => m.removeEventListener("wheel", wheel);
  }, [setZoom]);
  useEffect(() => { try { setRibbonCollapsed(localStorage.getItem("guionista:ribbon") === "collapsed"); } catch { /* ignore */ } }, []);
  const collapseRibbon = (v: boolean) => { setRibbonCollapsed(v); try { localStorage.setItem("guionista:ribbon", v ? "collapsed" : "open"); } catch { /* ignore */ } };

  // ---------- immersive writing ----------
  const toggleImmersive = (on?: boolean) => {
    const next = on ?? !immersive;
    setImmersive(next); setCtx(null); setChip(false);
    if (next) { // the "how to exit" hint is shown the first time only; the writer knows it after that
      let seen = false; try { seen = localStorage.getItem("guionista:immersiveHint") === "1"; localStorage.setItem("guionista:immersiveHint", "1"); } catch { /* ignore */ }
      if (!seen) { setChip(true); clearTimeout(chipTimer.current); chipTimer.current = setTimeout(() => setChip(false), 4500); }
    }
    if (window.guionista?.setFullScreen) void window.guionista.setFullScreen(next);
    else if (next) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setTimeout(refocus, 0);
  };
  const chipTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // typewriter scrolling: keep the line being written in the middle of the screen
  useEffect(() => {
    if (!immersive) return;
    const m = mainRef.current, c = caretRef.current; if (!m || !c) return;
    const mr = m.getBoundingClientRect(), cr = c.getBoundingClientRect();
    m.scrollTo({ top: m.scrollTop + (cr.top - mr.top) - mr.height / 2 + cr.height / 2, behavior: "auto" });
  }, [immersive, cur.cursor, pages]);

  // ---------- context menu ----------
  const clipboardBlocked = () => say("Clipboard access is blocked here: use Ctrl-X / C / V.");
  interface CtxWord { text: string; id: string; start: number; end: number }
  interface CtxData {
    token: number; word?: CtxWord; issue?: { kind: "spelling" | "grammar"; message: string };
    suggestions?: string[]; syn?: { state: "loading" } | { state: "error"; message: string } | { state: "ok"; senses: { meaning: string; words: string[] }[] };
  }
  const [ctxData, setCtxData] = useState<CtxData | null>(null);
  const fixCase = (original: string, repl: string) => (original === original.toLocaleUpperCase() && original.length > 1 ? repl.toLocaleUpperCase() : original[0] === original[0].toLocaleUpperCase() && original[0] !== original[0].toLocaleLowerCase() ? repl[0].toLocaleUpperCase() + repl.slice(1) : repl);
  const replaceWord = (w: CtxWord, repl: string) => edit((s) => replaceRange({ ...s, cursor: { id: w.id, offset: w.start } }, w.start, w.end, fixCase(w.text, repl)));
  const addToDictionary = (w: string) => updateMeta({ ...meta, spell: { ...meta.spell, ignore: [...new Set([...meta.spell.ignore, w.toLocaleLowerCase()])].slice(-2000) } });
  /** Work out what is under the pointer (a word, a spelling or grammar issue), open the menu, then fetch suggestions and synonyms. */
  const openContext = (x: number, y: number, id: string, offset: number, selected?: [number, number]) => {
    const e = cur.elements.find((q) => q.id === id); const text = e ? elementText(e) : "";
    let word: CtxWord | undefined;
    if (selected && /^[\p{L}\p{M}'’-]{2,40}$/u.test(text.slice(selected[0], selected[1]).trim())) { const raw = text.slice(selected[0], selected[1]); const lead = raw.length - raw.trimStart().length; word = { text: raw.trim(), id, start: selected[0] + lead, end: selected[0] + lead + raw.trim().length }; }
    else for (const m of text.matchAll(WORD)) { const st = m.index ?? 0; if (offset >= st && offset <= st + m[0].length) { word = { text: m[0], id, start: st, end: st + m[0].length }; break; } }
    let issue: CtxData["issue"];
    if (e && isChecked(e)) {
      if (word && marks && spellRef.current?.isBad(word.text) && !ignoreSet.has(word.text.toLocaleLowerCase())) issue = { kind: "spelling", message: "" };
      else { const g = grammarIssues(text, meta.language).find((i) => offset >= i.start && offset <= i.end); if (g) issue = { kind: "grammar", message: g.message }; }
    }
    const token = Date.now();
    setCtxData({ token, word, issue, syn: word ? { state: "loading" } : undefined });
    setCtx({ x, y });
    if (word) {
      fetch(`/api/synonyms?word=${encodeURIComponent(word.text)}`).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => {
        setCtxData((d) => (d && d.token === token ? { ...d, syn: ok ? { state: "ok", senses: (j.senses ?? []).slice(0, 4) } : { state: "error", message: j.error ?? "No connection." } } : d));
      }).catch(() => setCtxData((d) => (d && d.token === token ? { ...d, syn: { state: "error", message: "No connection: synonyms need the internet." } } : d)));
      if (issue?.kind === "spelling") void spellRef.current?.suggest(word.text).then((list) => setCtxData((d) => (d && d.token === token ? { ...d, suggestions: list } : d)));
    }
  };
  const pageMenu = (d: CtxData | null): MenuItem[] => {
    const hasSel = hasSelection(cur);
    const items: MenuItem[] = [];
    if (d?.issue?.kind === "spelling" && d.word) {
      const w = d.word;
      if (!d.suggestions) items.push({ id: "sg-l", label: "Looking for suggestions…", disabled: true });
      else if (!d.suggestions.length) items.push({ id: "sg-n", label: "No suggestions", disabled: true });
      else d.suggestions.slice(0, 5).forEach((sg, i) => items.push({ id: `sg-${i}`, label: sg, onSelect: () => replaceWord(w, sg) }));
      items.push({ id: "dict", label: `Add “${w.text}” to the dictionary`, onSelect: () => addToDictionary(w.text) });
      items.push({ id: "s0", separator: true });
    } else if (d?.issue?.kind === "grammar") {
      items.push({ id: "gm", label: d.issue.message, disabled: true }); items.push({ id: "s0", separator: true });
    }
    if (d?.word) {
      const w = d.word; const sy = d.syn;
      const sub: MenuItem[] = !sy || sy.state === "loading" ? [{ id: "y-l", label: "Searching sinonimosonline.com…", disabled: true }]
        : sy.state === "error" ? [{ id: "y-e", label: sy.message, disabled: true }]
        : sy.senses.length === 0 ? [{ id: "y-n", label: "No synonyms found", disabled: true }]
        : sy.senses.flatMap((sn, si) => [{ id: `y-m${si}`, label: sn.meaning || "Synonyms", disabled: true } as MenuItem, ...sn.words.slice(0, 9).map((x, i) => ({ id: `y-${si}-${i}`, label: x, onSelect: () => replaceWord(w, x) }))]);
      items.push({ id: "syn", label: `Synonyms of “${w.text}”`, submenu: sub }); items.push({ id: "s0b", separator: true });
    }
    items.push(
      { id: "elem", label: "Element", submenu: ELEMENT_TYPES.map((t) => ({ id: `t-${t}`, label: t, key: ELEMENT_KEY[t], checked: el.type === t, onSelect: () => edit((s) => setType(s, t)) })) },
      { id: "s1", separator: true },
      { id: "cut", label: "Cut", shortcut: "Ctrl+X", disabled: !hasSel, onSelect: () => void clip(true).catch(clipboardBlocked) },
      { id: "copy", label: "Copy", shortcut: "Ctrl+C", disabled: !hasSel, onSelect: () => void clip(false).catch(clipboardBlocked) },
      { id: "paste", label: "Paste", shortcut: "Ctrl+V", onSelect: () => void paste() },
      { id: "all", label: "Select All", shortcut: "Ctrl+A", onSelect: () => dispatch({ t: "cursor", cursor: selectAll(cur).cursor }) },
      { id: "s2", separator: true },
      { id: "fmt", label: "Format", submenu: [
        { id: "b", label: "Bold", shortcut: "Ctrl+B", checked: formatState(cur, "bold"), onSelect: () => fmt("bold") },
        { id: "i", label: "Italic", shortcut: "Ctrl+I", checked: formatState(cur, "italic"), onSelect: () => fmt("italic") },
        { id: "u", label: "Underline", shortcut: "Ctrl+U", checked: formatState(cur, "underline"), onSelect: () => fmt("underline") },
        { id: "up", label: "UPPERCASE", onSelect: () => edit((s) => changeCase(s, "upper")) },
        { id: "low", label: "lowercase", onSelect: () => edit((s) => changeCase(s, "lower")) },
        { id: "ttl", label: "Title Case", onSelect: () => edit((s) => changeCase(s, "title")) },
      ] },
      { id: "dual", label: "Dual Dialogue", checked: !!el.dual, onSelect: () => edit(toggleDual) },
      { id: "pb", label: "Page Break Before", checked: !!el.breakBefore, onSelect: () => edit(togglePageBreak) },
      { id: "s3", separator: true },
      { id: "find", label: "Find & Replace…", shortcut: "Ctrl+F", onSelect: openFind },
      { id: "goto", label: "Go To…", shortcut: "Ctrl+G", onSelect: () => setDialog("goto") },
      { id: "imm", label: immersive ? "Exit Immersive Writing" : "Immersive Writing", shortcut: "F11", onSelect: () => toggleImmersive() },
    );
    return items;
  };
  const openMenuAtCaret = () => {
    const r = caretRef.current?.getBoundingClientRect();
    const sl = selection(cur.cursor);
    openContext(r ? r.left + 8 : 200, r ? r.bottom + 6 : 200, cur.cursor.id, cur.cursor.offset, sl ?? undefined);
  };
  const sceneMenu = (id: string): MenuItem[] => {
    const i = scenes.findIndex((x) => x.id === id);
    return [
      { id: "go", label: "Go to scene", onSelect: () => jump(id) },
      { id: "up", label: "Move up", disabled: i <= 0, onSelect: () => navMove(id, scenes[i - 1].id) },
      { id: "dn", label: "Move down", disabled: i < 0 || i >= scenes.length - 1, onSelect: () => navMove(id, scenes[i + 2]?.id ?? null) },
      { id: "s", separator: true },
      { id: "del", label: "Delete scene", disabled: scenes.length === 0, onSelect: () => edit((s) => deleteScene({ ...s, cursor: { id, offset: 0 } })) },
    ];
  };
  const navContext = useCallback((id: string, x: number, y: number) => { setCtxData(null); setCtx({ x, y, scene: id }); }, []);

  // keyboard focus belongs to the script: win it back after clicks, window focus, and closing panels
  useEffect(() => {
    const back = () => { if (!document.activeElement || document.activeElement === document.body) input.current?.focus(); };
    window.addEventListener("focus", back);
    const f6 = (e: KeyboardEvent) => {
      if (e.key !== "F6") return; e.preventDefault();
      const tab = document.querySelector<HTMLElement>('[role=tab][aria-selected="true"]');
      if (document.activeElement === input.current) tab?.focus(); else input.current?.focus();
    };
    window.addEventListener("keydown", f6);
    return () => { window.removeEventListener("focus", back); window.removeEventListener("keydown", f6); };
  }, []);

  // ---------- keyboard ----------
  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey; const k = e.key;
    const els = cur.elements; const i = els.findIndex((x) => x.id === cur.cursor.id); const text = elementText(els[i]);
    if (mod) {
      const l = k.toLowerCase();
      if (l === "z") { e.preventDefault(); dispatch({ t: e.shiftKey ? "redo" : "undo" }); }
      else if (l === "y") { e.preventDefault(); dispatch({ t: "redo" }); }
      else if (l === "a") { e.preventDefault(); dispatch({ t: "cursor", cursor: selectAll(cur).cursor }); }
      else if (l === "b" || l === "i" || l === "u") { e.preventDefault(); fmt(l === "b" ? "bold" : l === "i" ? "italic" : "underline"); }
      else if (l === "f") { e.preventDefault(); openFind(); }
      else if (l === "g") { e.preventDefault(); setDialog("goto"); }
      else if (l === "o") { e.preventDefault(); setDialog("open:file"); }
      else if (l === "s") { e.preventDefault(); void saveNow(); void writeFdx(); }
      else if (l === "p") { e.preventDefault(); void pdf(true); }
      else if (k === "+" || k === "=") { e.preventDefault(); setZoom(zoomRef.current * 1.1); }
      else if (k === "-" || k === "_") { e.preventDefault(); setZoom(zoomRef.current / 1.1); }
      else if (k === "0") { e.preventDefault(); setZoom(1); }
      else if (l === "d" && e.altKey) { e.preventDefault(); edit(toggleDual); }
      else if (k === "Backspace") { e.preventDefault(); edit(deleteWordBack, anySel ? undefined : `delw:${el.id}`); }      // like Word: delete the word before the caret
      else if (k === "Delete") { e.preventDefault(); edit(deleteWordForward, anySel ? undefined : `delw:${el.id}`); }      // ... and Ctrl+Delete the word after it
      else if (k === "ArrowLeft" || k === "ArrowRight") {
        e.preventDefault();
        const o = cur.cursor.offset;
        if (k === "ArrowLeft") { if (o > 0) moveTo(el.id, wordStart(text, o), e.shiftKey); else if (i > 0) moveTo(els[i - 1].id, elementText(els[i - 1]).length, e.shiftKey); }
        else if (o < text.length) moveTo(el.id, wordEnd(text, o), e.shiftKey);
        else if (i < els.length - 1) moveTo(els[i + 1].id, 0, e.shiftKey);
      }
      else if (k === "Home") { e.preventDefault(); moveTo(els[0].id, 0, e.shiftKey); }
      else if (k === "End") { e.preventDefault(); const last = els[els.length - 1]; moveTo(last.id, elementText(last).length, e.shiftKey); }
      return;
    }
    if (picker !== null) {
      const n = ELEMENT_TYPES.length;
      if (k === "ArrowDown") { e.preventDefault(); setPicker((picker + 1) % n); return; }
      if (k === "ArrowUp") { e.preventDefault(); setPicker((picker - 1 + n) % n); return; }
      if (k === "Enter" || k === "Tab") { e.preventDefault(); const t = ELEMENT_TYPES[picker]; setPicker(null); edit((s) => setType(s, t)); return; }
      if (k === "Escape") { e.preventDefault(); setPicker(null); return; }
      if (k.length === 1 && /[a-z]/i.test(k)) { // a letter applies that element at once
        e.preventDefault(); const t = elementForKey(k);
        if (t) { setPicker(null); edit((s) => setType(s, t)); }
        return;
      }
      setPicker(null);
    }
    if (sug && !(e.shiftKey && k.startsWith("Arrow"))) { // Shift+arrows always extend the selection, they never drive the list
      if (k === "Tab" && !e.shiftKey && popIdx >= 0) { e.preventDefault(); accept(); return; }
      if (k === "ArrowDown") { e.preventDefault(); setPopIdx((p) => (p + 1) % sug.items.length); return; }
      if (k === "ArrowUp") { e.preventDefault(); setPopIdx((p) => (p <= 0 ? sug.items.length - 1 : p - 1)); return; }
      if (k === "Enter" && popIdx >= 0) { e.preventDefault(); accept(); return; }
      if (k === "Escape") { e.preventDefault(); setDismissed(`${el.id}:${text}:${cur.cursor.offset}`); return; }
    }
    switch (k) {
      case "Tab": {
        e.preventDefault();
        const atEnd = !anySel && cur.cursor.offset === text.length && text.trim() !== "";
        const flow = !e.shiftKey ? tabFlow(cur) : null;
        if (flow) edit(() => flow);
        else if (!e.shiftKey && atEnd && el.type === "Character" && !text.includes("(")) edit((s) => replaceRange(s, text.length, text.length, " ("));   // extension list (V.O., O.S.…)
        else if (!e.shiftKey && atEnd && el.type === "Scene Heading" && !text.includes(" - ")) edit((s) => replaceRange(s, text.length, text.length, " - ")); // then the time of day
        else edit((s) => cycle(s, e.shiftKey ? -1 : 1));
        break;
      }
      case "Escape": if (immersive) { e.preventDefault(); toggleImmersive(false); } break;
      case "F11": e.preventDefault(); toggleImmersive(); break;
      case "ContextMenu": e.preventDefault(); openMenuAtCaret(); break;
      case "F10": if (e.shiftKey) { e.preventDefault(); openMenuAtCaret(); } break;
      case "Enter":
        e.preventDefault();
        if (text === "" && !anySel) setPicker(Math.max(0, ELEMENT_TYPES.indexOf(el.type))); // Return on an empty line: choose the element
        else edit((s) => enter(trimDanglingParen(s)));
        break;
      case "Backspace": e.preventDefault(); edit(deleteBack, anySel ? undefined : `del:${el.id}`); break;
      case "Delete": e.preventDefault(); edit(deleteForward, anySel ? undefined : `del:${el.id}`); break;
      case "ArrowLeft": case "ArrowRight": {
        e.preventDefault();
        const d = k === "ArrowLeft" ? -1 : 1; const sel = selection(cur.cursor); const m = span(cur);
        if (sel && !e.shiftKey) { moveTo(el.id, d < 0 ? sel[0] : sel[1], false); break; }
        if (m && !e.shiftKey) { if (d < 0) moveTo(els[m.a].id, m.ao, false); else moveTo(els[m.b].id, m.bo, false); break; } // collapse a selection across lines to its start / end
        const o = cur.cursor.offset + d;
        if (o >= 0 && o <= text.length) moveTo(el.id, o, e.shiftKey);
        else if (d < 0 && i > 0) moveTo(els[i - 1].id, elementText(els[i - 1]).length, e.shiftKey);
        else if (d > 0 && i < els.length - 1) moveTo(els[i + 1].id, 0, e.shiftKey);
        break;
      }
      case "Home": case "End": {
        e.preventDefault(); if (!caret) break;
        const l = caret.v.line; moveTo(el.id, k === "Home" ? l.start! : l.start! + l.text.length, e.shiftKey);
        break;
      }
      case "ArrowUp": case "ArrowDown": case "PageUp": case "PageDown": {
        e.preventDefault(); if (!caret) break;
        const dir = k === "ArrowUp" || k === "PageUp" ? -1 : 1; const steps = k.startsWith("Page") ? 40 : 1;
        const col = goalCol.current ?? caret.col; const side = caret.v.line.col;
        let idx = caret.index, moved = 0, t: VLine | undefined;
        while (moved < steps) {
          idx += dir; const c = vlines[idx]; if (!c) break;
          if (c.line.col && c.line.col !== (side ?? 1)) continue; // stay in the current dual column
          t = c; moved++;
        }
        if (!t) break;
        goalCol.current = col;
        moveTo(t.line.elementId, t.line.start! + Math.min(col, t.line.text.length), e.shiftKey, true);
        break;
      }
      default: break;
    }
  };
  const flush = (value: string) => { if (value && picker !== null) setPicker(null); if (value) edit((s) => insertText(s, value), hasSelection(cur) ? undefined : `type:${cur.cursor.id}`); if (input.current) input.current.value = ""; };

  // ---------- mouse ----------
  const effZoom = zoom;
  const hit = (cx: number, cy: number, sheet: HTMLElement, pi: number) => {
    const r = sheet.getBoundingClientRect();
    const x = (cx - r.left) / effZoom, y = (cy - r.top) / effZoom;
    const row = Math.floor((y - px(lay.top)) / LINE);
    let best: PLine | null = null, bd = Infinity;
    for (const l of pages[pi].lines) {
      if (l.start === undefined || l.synthetic) continue;
      const left = px(lineLeftIn(l)), right = px(lineRightIn(l));
      const d = Math.abs(l.row - row) * 1000 + (x < left ? left - x : x > right ? x - right : 0);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return null;
    const col = Math.max(0, Math.min(best.text.length, Math.round((x - px(lineLeftIn(best))) / CH)));
    return { id: best.elementId, offset: best.start! + col };
  };
  const onMouseDown = (e: React.MouseEvent, pi: number) => {
    e.preventDefault(); input.current?.focus();
    const t = hit(e.clientX, e.clientY, e.currentTarget as HTMLElement, pi); if (!t) return;
    if (e.detail >= 2) {
      const text = elementText(cur.elements.find((q) => q.id === t.id) ?? el);
      if (e.detail >= 3) { drag.current = null; dispatch({ t: "cursor", cursor: { id: t.id, offset: text.length, anchor: 0 } }); return; }
      for (const m of text.matchAll(WORD)) { const st = m.index ?? 0; if (t.offset >= st && t.offset <= st + m[0].length) { drag.current = null; dispatch({ t: "cursor", cursor: { id: t.id, offset: st + m[0].length, anchor: st } }); return; } }
    }
    const c = cur.cursor;
    // a drag starts where the button went down (or, with Shift, where the current selection started) and may end in any scene or page
    drag.current = e.shiftKey ? { id: c.anchor !== undefined ? c.anchorId ?? c.id : c.id, anchor: c.anchor ?? c.offset } : { id: t.id, anchor: t.offset };
    ptr.current = { x: e.clientX, y: e.clientY }; setDragging(true);
    moveTo(t.id, t.offset, e.shiftKey);
    clearInterval(scrollTimer.current);
    scrollTimer.current = setInterval(() => { // dragging past the top or bottom edge of the window scrolls the script
      const m = mainRef.current; if (!drag.current || !m) { clearInterval(scrollTimer.current); return; }
      const r = m.getBoundingClientRect(), y = ptr.current.y;
      const dy = y < r.top + 36 ? -Math.min(40, (r.top + 36 - y) / 2 + 4) : y > r.bottom - 36 ? Math.min(40, (y - r.bottom + 36) / 2 + 4) : 0;
      if (dy) { m.scrollTop += dy; dragTo(ptr.current.x, ptr.current.y); }
    }, 30);
  };
  /** Extend the drag selection to the point under the pointer: the nearest page, so the pointer may be over the gap between pages or the margin. */
  const dragTo = (cx: number, cy: number) => {
    const d = drag.current, m = mainRef.current; if (!d || !m) return;
    let best: HTMLElement | null = null, bd = Infinity;
    m.querySelectorAll<HTMLElement>("[data-pw]").forEach((w) => {
      if (!w.querySelector(".cursor-text")) return; // pages that are not drawn yet cannot be hit
      const r = w.getBoundingClientRect(); const dy = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (dy < bd) { bd = dy; best = w; }
    });
    const w = best as HTMLElement | null; const sheet = w?.querySelector<HTMLElement>(".cursor-text"); if (!w || !sheet) return;
    const t = hit(cx, cy, sheet, Number(w.dataset.pw)); if (!t) return;
    const anchorId = d.id !== t.id ? d.id : undefined; const c = cur.cursor;
    if (c.id === t.id && c.offset === t.offset && c.anchor === d.anchor && c.anchorId === anchorId) return; // nothing moved
    goalCol.current = null;
    dispatch({ t: "cursor", cursor: { id: t.id, offset: t.offset, anchor: d.anchor, anchorId } });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    if (!(e.buttons & 1)) { drag.current = null; clearInterval(scrollTimer.current); setDragging(false); return; }
    ptr.current = { x: e.clientX, y: e.clientY };
    dragTo(e.clientX, e.clientY);
  };
  useEffect(() => {
    const up = () => { drag.current = null; clearInterval(scrollTimer.current); setDragging(false); };
    window.addEventListener("mouseup", up); window.addEventListener("blur", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("blur", up); clearInterval(scrollTimer.current); };
  }, []);

  // ---------- ribbon ----------
  const typeOptions = ELEMENT_TYPES.map((t) => ({ value: t, label: elementLabel(t) }));
  const elementSelect = { t: "select" as const, id: "el", label: "Element", mono: true, value: el.type, options: typeOptions, onChange: (v: string) => edit((s) => setType(s, v as ElementType)) };
  const B = (id: string, label: string, icon: LucideIcon, onClick: () => void, extra: object = {}) => ({ t: "btn" as const, id, label, icon, onClick, ...extra });
  const casebtns = [
    B("up", "UPPER", CaseUpper, () => edit((s) => changeCase(s, "upper"))), B("low", "lower", CaseLower, () => edit((s) => changeCase(s, "lower"))), B("ttl", "Title Case", CaseSensitive, () => edit((s) => changeCase(s, "title"))),
  ];
  const style = [B("b", "Bold", Bold, () => fmt("bold"), { active: formatState(cur, "bold") }), B("i", "Italic", Italic, () => fmt("italic"), { active: formatState(cur, "italic") }), B("u", "Underline", Underline, () => fmt("underline"), { active: formatState(cur, "underline") })];
  const locked = !!meta.revision.locked;
  const tabs: RibbonTab[] = [
    { id: "file", label: "File", groups: [
      { label: "Script", items: [B("new", "New", FilePlus, () => void newScript()), B("open", "Open", FolderOpen, () => setDialog("open:file"), { title: "Open a file or a recent script (Ctrl+O)" }), B("recent", "Open Recent", History, () => setDialog("open:recent")), B("tpl", "Templates", LayoutTemplate, () => void newScript(), { title: "Template Gallery: screenplay, series, stage play, graphic novel, story structure" }), B("save", "Save", Save, () => { void saveNow(); void writeFdx(); }, { title: "Save now; the script is also written as a .fdx file (Ctrl+S)" }), B("saveas", "Save As…", SaveAll, () => void writeFdx({ saveAs: true }), { title: "Save a copy as .fdx in a folder you choose" }), ...(typeof window !== "undefined" && window.guionista ? [B("folder", "Scripts Folder", FolderCog, () => void chooseFolder(), { title: "Choose the default folder for your .fdx files" }), B("reveal", "Show File", ExternalLink, () => { if (filePath) void window.guionista?.reveal(filePath); else say("Not saved to a file yet: type something or use Save As."); }, { title: "Show the .fdx in its folder" })] : [])] },
      { label: "Import", items: [B("imp", "Import", Upload, () => (window.guionista ? void openNativeFile() : importRef.current?.click()), { title: "Import a .fdx, .fountain or .txt screenplay" })] },
      { label: "Export", items: [
        B("fnt", "Fountain", FileText, () => download(`${safeName(title)}.fountain`, toFountain(cur.elements, meta), "text/plain")),
        B("fdx", "Final Draft", FileCode, () => download(`${safeName(title)}.fdx`, toFdx(cur.elements, meta), "application/xml"), { title: "Export .fdx" }),
        B("pdf", "Save as PDF", Download, () => void pdf(false)), B("prt", "Print", Printer, () => void pdf(true)),
        B("bak", "Backup", Archive, () => download(`${safeName(title)}-backup.json`, JSON.stringify({ title, elements: cur.elements, meta }, null, 1), "application/json")),
      ] },
    ] },
    { id: "home", label: "Home", groups: [
      { label: "Clipboard", items: [B("cut", "Cut", Scissors, () => void clip(true), { disabled: !anySel }), B("copy", "Copy", Copy, () => void clip(false), { disabled: !anySel }), B("paste", "Paste", ClipboardPaste, () => void paste())] },
      { label: "History", items: [B("undo", "Undo", Undo2, () => dispatch({ t: "undo" }), { disabled: !h.past.length }), B("redo", "Redo", Redo2, () => dispatch({ t: "redo" }), { disabled: !h.future.length })] },
      { label: "Element", items: [elementSelect] },
      { label: "Font", items: style },
      { label: "Dialogue", items: [B("dual", "Dual Dialogue", Columns2, () => edit(toggleDual), { active: !!el.dual })] },
    ] },
    { id: "edit", label: "Edit", groups: [
      { label: "Find", items: [B("find", "Find & Replace", Search, openFind), B("goto", "Go To", LocateFixed, () => setDialog("goto"))] },
      { label: "Script", items: [B("ren", "Rename Character", Users, () => setDialog("rename")), B("dels", "Delete Scene", Trash2, () => edit(deleteScene), { disabled: !currentScene })] },
      { label: "Case", items: casebtns },
    ] },
    { id: "insert", label: "Insert", groups: [
      { label: "Dialogue", items: [B("dual2", "Dual Dialogue", Columns2, () => edit(toggleDual), { active: !!el.dual })] },
      { label: "Pages", items: [B("pb", "Page Break", SeparatorHorizontal, () => edit(togglePageBreak), { active: !!el.breakBefore })] },
    ] },
    { id: "format", label: "Format", groups: [
      { label: "Element", items: [elementSelect] }, { label: "Font", items: style }, { label: "Case", items: casebtns },
    ] },
    { id: "view", label: "View", groups: [
      { label: "Panels", items: [B("imm", "Immersive", Maximize2, () => toggleImmersive(true), { title: "Immersive writing (F11)" }), B("nav", "Navigator", PanelLeft, () => setNavOpen((v) => !v), { active: navOpen }), B("scn", "Scene Numbers", Hash, () => updateMeta({ ...meta, sceneNumbers: !meta.sceneNumbers }), { active: meta.sceneNumbers })] },
      { label: "Zoom", items: [
        { t: "select", id: "zoom", label: "Zoom", value: String(zoom), options: [...new Set([0.5, 0.75, 1, 1.25, 1.5, 2, 3, zoom])].sort((a, b) => a - b).map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` })), onChange: (v) => setZoom(Number(v)) },
        B("zin", "Zoom in", ZoomIn, () => setZoom(zoomRef.current * 1.1)), B("zout", "Zoom out", ZoomOut, () => setZoom(zoomRef.current / 1.1)),
      ] },
      { label: "Mode", items: ([["day", "Day", Sun], ["night", "Night", Moon], ["midnight", "Midnight", MoonStar]] as const).map(([v, l, ic]) => B(`m-${v}`, l, ic, () => updateMeta({ ...meta, view: v as ViewMode }), { active: meta.view === v })) },
    ] },
    { id: "document", label: "Document", groups: [
      { label: "Pages", items: [B("tp", "Title Page", BookOpen, () => setDialog("title")), B("st", "SmartType", ListChecks, () => setDialog("smarttype"), { active: meta.smartType.enabled, title: "SmartType: suggestions while you type" }), B("pl", "Page Layout", FileSliders, () => setDialog("layout"), { title: "Page size, margins, font, spacing and line breaks" }), B("hf", "Header & Footer", PanelTop, () => setDialog("headfoot"), { title: "Header, footer and watermark" })] },
      { label: "Breaks", items: [{ t: "select", id: "lang", label: "Script language", value: meta.language, options: [{ value: "es", label: "Spanish" }, { value: "en", label: "English" }], onChange: (v) => updateMeta({ ...meta, language: v === "en" ? "en" : "es" }) }, B("qa", "Spelling & Grammar", SpellCheck, () => updateMeta({ ...meta, spell: { ...meta.spell, enabled: !meta.spell.enabled } }), { active: meta.spell.enabled, title: "Underline typos (red) and grammar problems (blue)" }), B("tl", "Target Length", Timer, () => setDialog("target"), { title: "Target script length (screen time)" }), B("mc", "Mores & Continueds", Layers, () => updateMeta({ ...meta, mores: !meta.mores }), { active: meta.mores, title: "(MORE) and (CONT'D) at dialogue page breaks" })] },
    ] },
    { id: "production", label: "Production", groups: [
      { label: "Scenes", items: [B("sn", "Scene Numbers", Hash, () => updateMeta({ ...meta, sceneNumbers: !meta.sceneNumbers }), { active: meta.sceneNumbers })] },
      { label: "Revisions", items: [
        B("rm", "Revision Mode", Highlighter, () => updateMeta({ ...meta, revision: { ...meta.revision, active: !meta.revision.active } }), { active: meta.revision.active }),
        B("rs", "Revisions Setup", Layers, () => setDialog("revisions")),
        B("mk", "Mark Revised", Highlighter, () => edit((s) => ({ ...s, elements: s.elements.map((x) => (x.id === el.id ? { ...x, rev: meta.revision.pass } : x)) }))),
        B("cl", "Clear Revised", Eraser, () => edit((s) => ({ ...s, elements: s.elements.map((x) => { if (!x.rev) return x; const { rev: _r, ...rest } = x; return rest as Element; }) })), { disabled: !markedCount }),
        B("nr", "Next", ArrowDown, () => jumpRev(1), { disabled: !markedCount }), B("pr", "Previous", ArrowUp, () => jumpRev(-1), { disabled: !markedCount }),
      ] },
      { label: "Pages", items: [locked ? B("ul", "Unlock Pages", LockOpen, () => updateMeta({ ...meta, revision: { ...meta.revision, locked: null } })) : B("lk", "Lock Pages", Lock, () => updateMeta({ ...meta, revision: { ...meta.revision, locked: lockEntries(pages) } }))] },
    ] },
    { id: "tools", label: "Tools", groups: [
      { label: "Reports", items: ([["scene", "Scene", Clapperboard], ["character", "Character", Users], ["cast", "Cast", Users], ["location", "Location", LocateFixed], ["script", "Script / Pages", BarChart3]] as const).map(([id, l, ic]) => B(`r-${id}`, l, ic, () => setDialog(`reports:${id}`))) },
    ] },
    { id: "help", label: "Help", groups: [
      { label: "Help", items: [B("kb", "Shortcuts", Keyboard, () => setDialog("shortcuts")), B("ab", "About", Info, () => setDialog("about"))] },
      { label: "Assistant", items: [B("ai", "Assistant", Sparkles, () => setAssistant(true))] },
    ] },
  ];

  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const resolveItem = useCallback((id: string): Item | undefined => { for (const t of tabsRef.current) for (const g of t.groups) for (const i of g.items) if (i.id === id) return i; return undefined; }, []);
  const curPage = pages[caret?.v.page ?? 0];
  const minutes = useMemo(() => screenMinutes(pages, lpp), [pages, lpp]);
  const prog = progressOf(minutes, meta.targetMinutes);
  const showTitle = hasTitlePage(meta);
  const dlg = dialog;
  const close = () => { setDialog(null); setTimeout(refocus, 0); };

  return (
    <div className={`flex h-screen flex-col bg-canvas text-pink theme-${meta.view}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); void openFile(f); } }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('input, textarea, select, [role=dialog], [role=menu], [role=search], aside[aria-label="Writing assistant"]')) refocus(); }}>
      {!immersive && <header className="flex items-center gap-3 bg-chrome px-4 py-2 text-[13px] text-zinc-200">
        <button onClick={() => void newScript()} className="flex items-center gap-2 font-script text-sm font-bold uppercase tracking-[0.16em] text-accent" aria-label="New script (welcome page)" title="Welcome page: templates, open, recent"><LogoMark size={24} />Guionista</button>
        <span className="min-w-0 max-w-[30ch] truncate text-zinc-300" title={title}>{title}</span>
        {desktop && (
          <button onClick={() => (filePath ? void window.guionista?.reveal(filePath) : void writeFdx())} title={filePath ? `Saved as ${filePath}\nClick to show it in its folder` : "Not saved to a .fdx file yet. Click to save now."}
            className="max-w-[40ch] truncate text-xs text-zinc-400 hover:text-white">
            {fdxState === "saving" ? "Saving file…" : fdxState === "error" ? "File not saved" : filePath ? `📄 ${filePath.split(/[\\/]/).slice(-2).join("/")}` : "No file yet"}
          </button>
        )}
        <span role="status" aria-live="polite" className={`text-xs ${status === "saved" ? "text-emerald-400" : status === "saving" ? "text-muted" : "text-amber-400"}`}>
          {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "offline" ? "Offline — retrying" : "Not saved"}
        </span>
        <button onClick={() => setNavOpen((v) => !v)} aria-pressed={navOpen} title={navOpen ? "Hide the scenes panel" : "Show the scenes panel"} className={`ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${navOpen ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"}`}><PanelLeft size={15} /> Scenes</button>
        <button onClick={() => toggleImmersive(true)} title="Immersive writing (F11)" className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-[13px] font-medium transition hover:bg-white/20"><Maximize2 size={15} /> Immersive</button>
        <button onClick={() => setAssistant((v) => !v)} aria-expanded={assistant} aria-controls="assistant-panel" className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${assistant ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"}`}>
          <Sparkles size={15} /> Assistant
        </button>
      </header>}

      {!immersive && <Ribbon tabs={tabs} sig={ribbonSig(tabs)} resolve={resolveItem} onAfter={refocus} collapsed={ribbonCollapsed} onCollapsed={collapseRibbon} />}

      {find.open && !immersive && (
        <div role="search" className="flex flex-wrap items-center gap-2 border-b border-line bg-panel2 px-4 py-2 text-sm">
          <input ref={findRef} aria-label="Find" placeholder="Find" value={find.q} onChange={(e) => setFind({ ...find, q: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); } if (e.key === "Escape") { setFind({ ...find, open: false }); refocus(); } }} className="w-48 rounded-md px-2 py-1 ring-1 ring-line" />
          <input aria-label="Replace with" placeholder="Replace with" value={find.r} onChange={(e) => setFind({ ...find, r: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } if (e.key === "Escape") { setFind({ ...find, open: false }); refocus(); } }} className="w-48 rounded-md px-2 py-1 ring-1 ring-line" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={find.matchCase} onChange={(e) => setFind({ ...find, matchCase: e.target.checked })} />Match case</label>
          <button className="rounded-md px-2.5 py-1 ring-1 ring-line hover:bg-hover disabled:opacity-40" disabled={!matches.length} onClick={() => findStep(-1)}>Previous</button>
          <button className="rounded-md px-2.5 py-1 ring-1 ring-line hover:bg-hover disabled:opacity-40" disabled={!matches.length} onClick={() => findStep(1)}>Next</button>
          <button className="flex items-center gap-1 rounded-md px-2.5 py-1 ring-1 ring-line hover:bg-hover disabled:opacity-40" disabled={!matches.length} onClick={replaceOne}><Replace size={14} />Replace</button>
          <button className="rounded-md px-2.5 py-1 ring-1 ring-line hover:bg-hover disabled:opacity-40" disabled={!matches.length} onClick={() => { const n = matches.length; edit((s) => replaceAll(s, find.q, find.r, find.matchCase)); say(`Replaced ${n}.`); }}>Replace all</button>
          <span aria-live="polite" className="text-xs text-muted">{find.q ? (matches.length ? `${matchNo ? `${matchNo} of ` : ""}${matches.length} ${matches.length === 1 ? "match" : "matches"}` : "No matches") : ""}</span>
          <button aria-label="Close find" className="ml-auto rounded px-2 py-1 hover:bg-hover" onClick={() => { setFind({ ...find, open: false }); refocus(); }}>✕</button>
        </div>
      )}
      {notice && <div role="status" className="bg-zinc-800 px-4 py-1.5 text-sm text-zinc-100">{notice}</div>}
      {status === "conflict" && (
        <div role="alert" className="flex items-center gap-3 bg-amber-400 px-4 py-2 text-sm text-black">
          This script was changed somewhere else, so your latest edits were not saved.
          <button className="rounded bg-black px-3 py-1 text-white" onClick={() => window.location.reload()}>Reload latest</button>
        </div>
      )}

      <textarea ref={input} aria-label="Script editor input" className="fixed left-0 top-0 h-px w-px opacity-0" autoFocus spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onKeyDown={onKeyDown}
        onBeforeInput={(e) => { const t = (e.nativeEvent as InputEvent).inputType; if (t === "historyUndo" || t === "historyRedo") e.preventDefault(); }}
        onInput={(e) => { if (!(e.nativeEvent as InputEvent).isComposing) flush(e.currentTarget.value); }}
        onCompositionEnd={(e) => flush(e.data)}
        onPaste={(e) => { e.preventDefault(); flush(e.clipboardData.getData("text/plain")); }}
        onCopy={(e) => { e.preventDefault(); e.clipboardData.setData("text/plain", selectedText(cur)); }}
        onCut={(e) => { e.preventDefault(); e.clipboardData.setData("text/plain", selectedText(cur)); edit(deleteBack); }}
      />
      <input ref={importRef} type="file" accept=".fdx,.xml,.fountain,.txt,.spmd,.json" hidden aria-label="Import file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />

      <div className="relative flex min-h-0 flex-1">
        {navOpen && !immersive && (
          <div className="static z-auto h-full shrink-0">
            <Navigator scenes={navScenes} currentId={currentScene} onJump={navJump} onMove={navMove} onContext={navContext} />
          </div>
        )}
        <main ref={mainRef} className={`min-w-0 flex-1 overflow-auto ${immersive ? "no-scrollbar py-[40vh]" : "py-6"}`} onMouseMove={onMouseMove} onMouseUp={() => { drag.current = null; clearInterval(scrollTimer.current); setDragging(false); }} onClick={() => input.current?.focus()}>
          <div className="mx-auto flex flex-col items-center gap-6" style={{ width: "max-content", minWidth: "100%" }}>
            {showTitle && (
              <div style={{ width: PW * effZoom, height: PH * effZoom }} className="shrink-0">
                <div style={{ transform: `scale(${effZoom})`, transformOrigin: "top left", width: PW, height: PH }}><TitleSheet meta={meta} /></div>
              </div>
            )}
            {pages.map((p, pi) => (
              <div key={p.number} data-pw={pi} style={{ width: PW * effZoom, height: PH * effZoom }} className="relative shrink-0">
                <Lazy force={pi === (caret?.v.page ?? 0)} render={() => (
                <div className="cursor-text" style={{ transform: `scale(${effZoom})`, transformOrigin: "top left", width: PW, height: PH }}
                  onMouseDown={(e) => { if (e.button === 0) onMouseDown(e, pi); }}
                  onContextMenu={(e) => {
                    e.preventDefault(); input.current?.focus();
                    const t = hit(e.clientX, e.clientY, e.currentTarget as HTMLElement, pi);
                    const sel2 = selection(cur.cursor);
                    const ti = t ? cur.elements.findIndex((q) => q.id === t.id) : -1;
                    const inside = !!(t && ((sel2 && t.id === cur.cursor.id && t.offset >= sel2[0] && t.offset <= sel2[1]) || (sp && ti >= sp.a && ti <= sp.b && (ti > sp.a || t.offset >= sp.ao) && (ti < sp.b || t.offset <= sp.bo))));
                    if (t && !inside) moveTo(t.id, t.offset, false);
                    if (t) openContext(e.clientX, e.clientY, t.id, t.offset, inside && sel2 ? sel2 : undefined);
                  }}>
                  <PageSheet page={p} index={pi} elsById={elsById} sceneNo={sceneNo} meta={meta} marks={marks}>
                    {find.open && find.q && p.lines.map((l, k) => {
                      const list = matchesById.get(l.elementId); if (!list || l.start === undefined || l.synthetic) return null;
                      return list.map((mm, q) => {
                        const a = Math.max(mm.start, l.start!), b = Math.min(mm.end, l.start! + l.text.length);
                        if (b <= a) return null;
                        return <div key={`f${k}-${q}`} className="pointer-events-none absolute rounded-sm bg-yellow-300/60 outline outline-1 outline-yellow-500/70" style={{ top: px(rowTopIn(l.row, lay)), left: px(lineLeftIn(l)) + (a - l.start!) * CH, width: (b - a) * CH, height: LINE }} />;
                      });
                    })}
                    {anySel && p.lines.map((l, k) => {
                      if (l.start === undefined || l.synthetic) return null;
                      let from: number, to: number;
                      if (sp) {
                        const ei = orderOf.get(l.elementId); if (ei === undefined || ei < sp.a || ei > sp.b) return null;
                        from = ei === sp.a ? sp.ao : 0; to = ei === sp.b ? sp.bo : Infinity;
                      } else if (sel && l.elementId === cur.cursor.id) [from, to] = sel; else return null;
                      const a = Math.max(from, l.start), b = Math.min(to, l.start + l.text.length);
                      // an empty line inside a selection that runs on to a later line still shows as selected (one character wide)
                      const emptyThrough = l.text.length === 0 && sp && (orderOf.get(l.elementId) ?? 0) < sp.b;
                      if (b <= a && !emptyThrough) return null;
                      return <div key={`s${k}`} className="pointer-events-none absolute bg-accent/45" style={{ top: px(rowTopIn(l.row, lay)), left: px(lineLeftIn(l)) + (a - l.start) * CH, width: Math.max(b - a, 1) * CH, height: LINE }} />;
                    })}
                    {caret && caret.v.page === pi && (
                      <div ref={caretRef} className="caret absolute" style={{ visibility: anySel ? "hidden" : "visible", width: 2, height: LINE, background: "var(--ink)", top: px(rowTopIn(caret.v.row, lay)), left: px(lineLeftIn(caret.v.line)) + caret.col * CH }} />
                    )}
                  </PageSheet>
                </div>
                )} />
              </div>
            ))}
          </div>
        </main>
        {assistant && !immersive && <div id="assistant-panel" className="contents"><Assistant getContext={getContext} suspended={dlg !== null || !!ctx || ((picker !== null || !!sug) && !!anchor && anchor.x > window.innerWidth - 760)} onClose={() => { setAssistant(false); refocus(); }} /></div>}
      </div>

      {!immersive && <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-chrome px-4 py-1.5 text-xs text-muted">
        <span>Page {curPage?.label ?? 1} of {pages.length}</span>
        <span>{currentScene ? `Scene ${sceneNo.get(currentScene)} of ${scenes.length}` : "No scene"}</span>
        <span>{el.type}{el.dual ? " (dual)" : ""}</span>
        <span title="Script language" className="uppercase">{meta.language}</span>
        {meta.revision.active && <span className="text-accent">Revision: {REVISION_COLORS[meta.revision.pass].name}</span>}
        {locked && <span className="flex items-center gap-1"><Lock size={11} />Pages locked</span>}
        <button onClick={() => setDialog("target")} title="Estimated screen time: about one minute per page. Click to set a target." className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-white/10">
          <Timer size={12} />
          <span>{formatMinutes(minutes)}{prog.target ? ` of ${formatMinutes(prog.target)}` : " on screen"}</span>
          {prog.target > 0 && (
            <span role="progressbar" aria-label="Screen time against the target length" aria-valuemin={0} aria-valuemax={prog.target} aria-valuenow={Math.round(minutes)} aria-valuetext={`${formatMinutes(minutes)} of ${formatMinutes(prog.target)}`}
              className="relative h-2 w-40 overflow-hidden rounded-full bg-white/15">
              <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${prog.state === "over" ? "bg-red-400" : prog.state === "near" ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${prog.pct}%` }} />
            </span>
          )}
          {prog.target > 0 && <span className={prog.state === "over" ? "text-red-300" : ""}>{prog.state === "over" ? `over by ${formatMinutes(minutes - prog.target)}` : `${Math.round(prog.pct)}%`}</span>}
        </button>
        <span className="ml-auto hidden md:inline">Tab / Shift-Tab: element · Enter: next · Ctrl-Z: undo · Ctrl-F: find</span>
      </footer>}

      {immersive && (
        <button onClick={() => toggleImmersive(false)} aria-label="Exit immersive writing" tabIndex={chip ? 0 : -1}
          className={`fixed right-4 top-4 z-40 flex items-center gap-2 rounded-full bg-black/70 px-3.5 py-1.5 text-xs text-zinc-100 backdrop-blur transition-opacity duration-500 ${chip ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <Minimize2 size={13} /> Exit immersive <kbd className="rounded bg-white/15 px-1.5">Esc</kbd>
        </button>
      )}
      {anchor && !dragging && picker !== null && <SmartPopup anchor={anchor} title="Elements" items={ELEMENT_TYPES.map(elementLabel)} active={picker} hint="Press a letter or ↑↓ then Enter" onPick={(i) => { setPicker(null); edit((s) => setType(s, ELEMENT_TYPES[i])); refocus(); }} />}
      {anchor && !dragging && picker === null && sug && !ctx && dlg === null && <SmartPopup anchor={anchor} title={CATEGORY_LABEL[sug.kind]} items={sug.items} active={popIdx} hint={popIdx < 0 ? "↓ choose · Esc close" : "Enter / Tab select · Esc close"}
        onPick={(i) => { setPopIdx(i); edit((s) => replaceRange(s, sug.from, sug.to, sug.prefix + sug.items[i] + sug.suffix)); refocus(); }} />}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.scene ? sceneMenu(ctx.scene) : pageMenu(ctxData)} onClose={() => { setCtx(null); setTimeout(refocus, 0); }} />}

      {(dlg === "open:file" || dlg === "open:recent") && <OpenDialog currentId={scriptId} focus={dlg === "open:file" ? "file" : "recent"} onClose={close} onNative={() => { close(); void openNativeFile(); }} onOpenFile={(f) => { close(); void openFile(f); }} onOpenScript={(id) => void openScript(id)} />}
      {dlg === "layout" && <PageLayoutDialog meta={meta} setMeta={updateMeta} onClose={close} />}
      {dlg === "target" && <TargetDialog meta={meta} setMeta={updateMeta} minutes={minutes} onClose={close} />}
      {dlg === "smarttype" && <SmartTypeDialog meta={meta} setMeta={updateMeta} els={cur.elements} onClose={close} />}
      {dlg === "title" && <TitlePageDialog meta={meta} setMeta={updateMeta} onClose={close} />}
      {dlg === "headfoot" && <HeaderFooterDialog meta={meta} setMeta={updateMeta} onClose={close} />}
      {dlg === "revisions" && <RevisionsDialog meta={meta} setMeta={updateMeta} locked={locked} marked={markedCount} onClose={close}
        onLock={() => updateMeta({ ...meta, revision: { ...meta.revision, locked: lockEntries(pages) } })} onUnlock={() => updateMeta({ ...meta, revision: { ...meta.revision, locked: null } })}
        onClear={() => edit((s) => ({ ...s, elements: s.elements.map((x) => { if (!x.rev) return x; const { rev: _r, ...rest } = x; return rest as Element; }) }))} />}
      {dlg === "goto" && <GoToDialog els={cur.elements} pages={pages} onGo={(id) => { close(); jump(id); }} onClose={close} />}
      {dlg === "rename" && <RenameCharacterDialog names={characterNames(cur.elements)} onClose={close} onRename={(f, t) => { edit((s) => renameCharacter(s, f, t)); say(`Renamed ${f} to ${t.toUpperCase()}.`); close(); }} />}
      {dlg === "shortcuts" && <ShortcutsDialog onClose={close} />}
      {dlg === "about" && <AboutDialog onClose={close} desktop={desktop} elements={cur.elements.length} />}
      {dlg?.startsWith("reports:") && <ReportsDialog els={cur.elements} pages={pages} initial={dlg.slice(8)} title={title} onClose={close} />}
    </div>
  );
}
