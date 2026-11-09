"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildReports, reportCsv } from "@/engine/reports";
import { DocMeta, REVISION_COLORS, TITLE_FIELDS } from "@/engine/meta";
import type { Element } from "@/engine/types";
import type { Page } from "@/engine/paginate";
import { sceneList } from "@/engine/navigator";
import { CATEGORIES, CATEGORY_LABEL, Category, entries } from "@/engine/smarttype";
import { alignOf, boxOf, charW, DEFAULT_LAYOUT, defaultBox, ElementStyle, FONTS, lineH, linesPerPage, PageLayout, parseLayout, spaceBefore, widthCharsFor } from "@/engine/layout";
import { ELEMENT_KEY, ELEMENT_TYPES, ElementType } from "@/engine/types";
import { isCaps } from "@/engine/measure";
import { indexElements, TitleSheet } from "./PageSheet";
import { btn2Cls, btnCls, inputCls, Modal } from "./Modal";

export function download(name: string, data: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = (s: string) => (s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "script").slice(0, 60);

const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{children}</span>;

export function TitlePageDialog({ meta, setMeta, onClose }: { meta: DocMeta; setMeta: (m: DocMeta) => void; onClose: () => void }) {
  const set = (k: (typeof TITLE_FIELDS)[number], v: string) => setMeta({ ...meta, titlePage: { ...meta.titlePage, [k]: v } });
  const SCALE = 0.62; // the preview is a true-to-shape page at 62%, about twice the earlier size
  const L = meta.layout;
  return (
    <Modal title="Title Page" onClose={onClose} huge>
      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,1fr)_auto]">
        <div className="space-y-3">
          {TITLE_FIELDS.map((k) => (
            <label key={k} className="block"><Label>{k}</Label>
              {k === "Contact" ? <textarea rows={4} maxLength={2000} className={inputCls} value={meta.titlePage[k]} onChange={(e) => set(k, e.target.value)} />
                : <input maxLength={2000} className={inputCls} value={meta.titlePage[k]} onChange={(e) => set(k, e.target.value)} data-autofocus={k === "Title" ? "" : undefined} />}
            </label>
          ))}
        </div>
        <div aria-label="Title page preview" className="overflow-auto rounded-md bg-zinc-300/60 p-3">
          <div style={{ width: L.width * 96 * SCALE, height: L.height * 96 * SCALE }}>
            <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left" }}><TitleSheet meta={meta} print /></div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

/** A number box that lets you type freely and applies the value as soon as it is a valid number. */
function NumField({ label, value, onChange, step = 0.1, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const last = useRef(value);
  useEffect(() => { if (Math.abs(value - last.current) > 1e-9) { last.current = value; setText(String(value)); } }, [value]);
  return (
    <label className="block"><Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        <input type="number" step={step} min={min} max={max} className={inputCls} value={text} aria-label={label}
          onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) { last.current = n; onChange(n); } }} />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

export function PageLayoutDialog({ meta, setMeta, onClose }: { meta: DocMeta; setMeta: (m: DocMeta) => void; onClose: () => void }) {
  const L = meta.layout;
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const k = unit === "cm" ? 2.54 : 1;
  const show = (inch: number) => Math.round(inch * k * 100) / 100;
  const patch = (p: Partial<PageLayout>) => setMeta({ ...meta, layout: parseLayout({ ...L, ...p }) });
  const edge = (key: "left" | "right" | "top" | "bottom", label: string) => <NumField label={label} value={show(L[key])} min={0} max={15} step={unit === "cm" ? 0.1 : 0.05} suffix={unit} onChange={(v) => patch({ [key]: v / k })} />;
  const tw = L.width - L.left - L.right, th = L.height - L.top - L.bottom;
  const cpl = Math.floor(tw / charW(L) + 1e-6), lpp = linesPerPage(L);
  const select = "w-full rounded-md bg-panel2 px-3 py-2 text-sm text-pink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent";
  const SPACING = [1, 1.15, 1.5, 2];
  const [tab, setTab] = useState<"page" | "elements">("page");
  // the writer's saved default for new scripts: null = still checking, false = none (the original layout), true = saved
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/layout-default").then((r) => (r.ok ? r.json() : null)).then((j: { layout: unknown } | null) => { if (live) setSaved(j ? j.layout != null : null); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const saveDefault = async () => {
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/layout-default", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: L }) });
      if (!r.ok) throw new Error();
      setSaved(true); setNote("Saved. Every new script will start with this page layout. Scripts you already have are not changed.");
    } catch { setNote("The default could not be saved. This script keeps its layout; try again."); }
    setBusy(false);
  };
  const forgetDefault = async () => {
    setBusy(true); setNote("");
    try { const r = await fetch("/api/layout-default", { method: "DELETE" }); if (!r.ok) throw new Error(); setSaved(false); setNote("Done. New scripts will start with the original layout."); }
    catch { setNote("The saved default could not be removed. Try again."); }
    setBusy(false);
  };
  return (
    <Modal title="Page Layout" onClose={onClose} wide>
      <div role="tablist" aria-label="Page layout sections" className="mb-4 flex gap-1 border-b border-line">
        {([["page", "Page and text"], ["elements", "Each element"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px rounded-t-md px-4 py-2 text-sm ${tab === id ? "border-b-2 border-accent font-semibold" : "text-muted hover:bg-hover"}`}>{label}</button>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Changes apply to this script immediately, on screen and in the PDF.</span>
        <label className="flex items-center gap-2">Units
          <select aria-label="Units" value={unit} onChange={(e) => setUnit(e.target.value as "cm" | "in")} className="rounded-md bg-panel2 px-2 py-1 ring-1 ring-line"><option value="cm">Centimetres</option><option value="in">Inches</option></select>
        </label>
      </div>
      {tab === "elements" && <ElementsPane L={L} patch={patch} unit={unit} k={k} show={show} />}
      {tab === "page" && <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Page</legend>
          <label className="block"><Label>Page size</Label>
            <select data-autofocus aria-label="Page size" className={select} value={L.page} onChange={(e) => patch({ page: e.target.value as PageLayout["page"] })}>
              <option value="letter">US Letter (21.59 × 27.94 cm)</option><option value="a4">A4 (21.0 × 29.7 cm)</option><option value="legal">US Legal (21.59 × 35.56 cm)</option><option value="a5">A5 (14.8 × 21.0 cm)</option><option value="custom">Custom…</option>
            </select></label>
          {L.page === "custom" && <div className="grid grid-cols-2 gap-3"><NumField label="Width" value={show(L.width)} min={5} max={60} suffix={unit} onChange={(v) => patch({ width: v / k })} /><NumField label="Height" value={show(L.height)} min={5} max={80} suffix={unit} onChange={(v) => patch({ height: v / k })} /></div>}
        </fieldset>
        <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Margins</legend>
          <div className="grid grid-cols-2 gap-3">{edge("left", "Left")}{edge("right", "Right")}{edge("top", "Top")}{edge("bottom", "Bottom")}</div>
        </fieldset>
        <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Font</legend>
          <label className="block"><Label>Typeface (fixed-width)</Label>
            <select aria-label="Typeface" className={select} value={L.font} onChange={(e) => patch({ font: e.target.value })}>{FONTS.map((f) => <option key={f} value={f}>{f}{f === "Courier Prime" ? " (built in)" : " (if installed)"}</option>)}</select></label>
          <NumField label="Size" value={L.fontPt} min={8} max={16} step={0.5} suffix="pt" onChange={(v) => patch({ fontPt: v })} />
        </fieldset>
        <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Spacing and line breaks</legend>
          <label className="block"><Label>Line spacing</Label>
            <select aria-label="Line spacing" className={select} value={SPACING.includes(L.spacing) ? String(L.spacing) : "custom"} onChange={(e) => e.target.value !== "custom" && patch({ spacing: Number(e.target.value) })}>
              {SPACING.map((v) => <option key={v} value={v}>{v === 1 ? "Single (1.0)" : v === 2 ? "Double (2.0)" : v.toFixed(2).replace(/0$/, "")}</option>)}{!SPACING.includes(L.spacing) && <option value="custom">{L.spacing} (custom)</option>}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Blank lines before scene headings" value={L.headingGap} min={0} max={4} step={1} onChange={(v) => patch({ headingGap: Math.round(v) })} />
            <NumField label="Blank lines between other blocks" value={L.blockGap} min={0} max={3} step={1} onChange={(v) => patch({ blockGap: Math.round(v) })} />
          </div>
        </fieldset>
      </div>}
      {tab === "page" && <p className="mt-5 rounded-md bg-hover px-3 py-2 text-sm" aria-live="polite">
        Text area {show(tw)} × {show(th)} {unit} · {cpl} characters per line · {lpp} lines per page · line height {Math.round(lineH(L) * 72 * 10) / 10} pt
      </p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn2Cls} onClick={() => void saveDefault()} disabled={busy} title="New scripts will start with this page layout (like “Set as Default” in Word)">Save as default for new scripts</button>
          <button className={btn2Cls} onClick={() => { setMeta({ ...meta, layout: { ...DEFAULT_LAYOUT } }); setNote("This script now uses the original layout. Your saved default for new scripts has not changed."); }} title="Back to the layout the program came with">Reset to original</button>
          {saved && <button className={btn2Cls} onClick={() => void forgetDefault()} disabled={busy} title="New scripts will use the original layout again">Forget my saved default</button>}
        </div>
        <button className={btnCls} onClick={onClose}>Done</button>
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted" role="status" aria-live="polite">{note || (saved === null ? "" : saved ? "New scripts start with the layout you saved as default." : "New scripts start with the original layout.")}</p>
    </Modal>
  );
}

/** Settings for one element type at a time: General, Scene Heading, Action, Dialogue... Values shown are the ones in effect now. */
function ElementsPane({ L, patch, unit, k, show }: { L: PageLayout; patch: (p: Partial<PageLayout>) => void; unit: "cm" | "in"; k: number; show: (inch: number) => number }) {
  const [t, setT] = useState<ElementType>("Dialogue");
  const st: ElementStyle = L.elements?.[t] ?? {};
  const d = defaultBox(t, L), box = boxOf(t, L);
  const setSt = (p: Partial<ElementStyle>) => patch({ elements: { ...L.elements, [t]: { ...st, ...p } } });
  const customised = (n: ElementType) => !!L.elements?.[n];
  const eff = { bold: st.bold ?? t === "End of Act", italic: st.italic ?? (t === "Note" || t === "Summary"), underline: st.underline ?? t === "End of Act", caps: isCaps(t) || !!st.caps, align: alignOf(t, L) };
  const select = "w-full rounded-md bg-panel2 px-3 py-2 text-sm text-pink ring-1 ring-line outline-none focus:ring-2 focus:ring-accent";
  const check = (label: string, key: "bold" | "italic" | "underline", value: boolean) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} onChange={(e) => setSt({ [key]: e.target.checked })} />{label}</label>;
  return (
    <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
      <ul aria-label="Elements" className="space-y-0.5">
        {ELEMENT_TYPES.map((n) => (
          <li key={n}><button onClick={() => setT(n)} aria-pressed={n === t} className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left font-script text-[13px] ${n === t ? "bg-accent text-black" : "hover:bg-hover"}`}>
            <span className="font-bold">[{ELEMENT_KEY[n]}]</span><span className="flex-1">{n}</span>{customised(n) && <span title="Customised" className={`h-1.5 w-1.5 rounded-full ${n === t ? "bg-black" : "bg-accent"}`} />}
          </button></li>
        ))}
      </ul>
      <div className="space-y-4">
        <h3 className="text-base font-semibold">{t}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><Label>Typeface</Label>
            <select aria-label="Element typeface" className={select} value={st.font ?? ""} onChange={(e) => setSt({ font: e.target.value || undefined })}>
              <option value="">Same as the script ({L.font})</option>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select></label>
          <label className="block"><Label>Alignment</Label>
            <select aria-label="Element alignment" className={select} value={eff.align} onChange={(e) => setSt({ align: e.target.value as "left" | "center" | "right" })}>
              <option value="left">Left</option><option value="center">Centred</option><option value="right">Right</option>
            </select></label>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {check("Bold", "bold", eff.bold)}{check("Italic", "italic", eff.italic)}{check("Underline", "underline", eff.underline)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={eff.caps} disabled={isCaps(t)} onChange={(e) => setSt({ caps: e.target.checked })} />ALL CAPS{isCaps(t) ? " (always)" : ""}</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Left margin" value={show(box.left)} min={0} max={20} step={unit === "cm" ? 0.1 : 0.05} suffix={unit} onChange={(v) => setSt({ left: v / k })} />
          <NumField label="Right margin" value={show(L.width - box.right)} min={0} max={20} step={unit === "cm" ? 0.1 : 0.05} suffix={unit} onChange={(v) => setSt({ right: v / k })} />
          <NumField label="Blank lines before" value={spaceBefore(t, L)} min={0} max={6} step={1} onChange={(v) => setSt({ before: Math.round(v) })} />
        </div>
        <p className="rounded-md bg-hover px-3 py-2 text-xs text-muted" aria-live="polite">
          Margins are measured from the edge of the page. Text box {show(box.left)}–{show(box.right)} {unit} from the left edge · {widthCharsFor(t, L)} characters per line
          {st.left === undefined && st.right === undefined ? ` (default ${show(d.left)}–${show(d.right)} ${unit})` : ""}. Size and line spacing are shared by all elements so the page keeps its fixed grid.
        </p>
        <div className="flex gap-2">
          <button className={btn2Cls} disabled={!customised(t)} onClick={() => { const { [t]: _drop, ...rest } = L.elements ?? {}; patch({ elements: rest }); }}>Reset {t}</button>
          <button className={btn2Cls} disabled={!L.elements} onClick={() => patch({ elements: {} })}>Reset all elements</button>
        </div>
      </div>
    </div>
  );
}

export function HeaderFooterDialog({ meta, setMeta, onClose }: { meta: DocMeta; setMeta: (m: DocMeta) => void; onClose: () => void }) {
  return (
    <Modal title="Header and Footer" onClose={onClose}>
      <div className="space-y-3">
        <label className="block"><Label>Header (top left of every page)</Label><input data-autofocus className={inputCls} maxLength={120} value={meta.header} onChange={(e) => setMeta({ ...meta, header: e.target.value })} /></label>
        <label className="block"><Label>Footer (bottom centre)</Label><input className={inputCls} maxLength={120} value={meta.footer} onChange={(e) => setMeta({ ...meta, footer: e.target.value })} /></label>
        <label className="block"><Label>Watermark</Label><input className={inputCls} maxLength={40} placeholder="e.g. CONFIDENTIAL" value={meta.watermark} onChange={(e) => setMeta({ ...meta, watermark: e.target.value })} /></label>
      </div>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export function RevisionsDialog({ meta, setMeta, locked, onLock, onUnlock, onClear, marked, onClose }: {
  meta: DocMeta; setMeta: (m: DocMeta) => void; locked: boolean; onLock: () => void; onUnlock: () => void; onClear: () => void; marked: number; onClose: () => void;
}) {
  const r = meta.revision;
  const up = (p: Partial<DocMeta["revision"]>) => setMeta({ ...meta, revision: { ...r, ...p } });
  return (
    <Modal title="Revisions" onClose={onClose}>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-autofocus checked={r.active} onChange={(e) => up({ active: e.target.checked })} /> Revision mode (changes are marked with an asterisk in the left margin)</label>
        <label className="block"><Label>Revision colour</Label>
          <select className={inputCls} value={r.pass} onChange={(e) => up({ pass: Number(e.target.value) })}>
            {REVISION_COLORS.slice(1).map((c, i) => <option key={c.name} value={i + 1}>{c.name}</option>)}
          </select></label>
        <label className="block"><Label>Revision date shown on revised pages</Label><input className={inputCls} maxLength={20} placeholder="03/14/26" value={r.date} onChange={(e) => up({ date: e.target.value })} /></label>
        <div className="rounded-md bg-hover p-3 text-sm">
          <p className="mb-2">{locked ? "Pages are locked: numbers are frozen and new pages become 12A, 12B." : "Pages are unlocked: numbering follows the script."}</p>
          <div className="flex gap-2">
            {locked ? <button className={btn2Cls} onClick={onUnlock}>Unlock all pages</button> : <button className={btn2Cls} onClick={onLock}>Lock pages</button>}
            <button className={btn2Cls} onClick={onClear} disabled={!marked}>Clear {marked} revised {marked === 1 ? "element" : "elements"}</button>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export function GoToDialog({ els, pages, onGo, onClose }: { els: Element[]; pages: Page[]; onGo: (id: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"scene" | "page">("scene");
  const [v, setV] = useState(""); const [err, setErr] = useState("");
  const scenes = useMemo(() => sceneList(els), [els]);
  const go = () => {
    const t = v.trim();
    if (mode === "scene") { const s = scenes.find((x) => String(x.number) === t); if (s) return onGo(s.id); setErr(`There is no scene ${t || "—"} (1–${scenes.length}).`); }
    else { const p = pages.find((x) => x.label.toLowerCase() === t.toLowerCase()); const f = p?.lines.find((l) => l.start !== undefined && !l.synthetic); if (f) return onGo(f.elementId); setErr(`There is no page ${t || "—"} (1–${pages.length}).`); }
  };
  return (
    <Modal title="Go To" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); go(); }} className="space-y-3">
        <div className="flex gap-4 text-sm">
          {(["scene", "page"] as const).map((m) => <label key={m} className="flex items-center gap-1.5"><input type="radio" checked={mode === m} onChange={() => { setMode(m); setErr(""); }} />{m === "scene" ? "Scene number" : "Page number"}</label>)}
        </div>
        <input data-autofocus className={inputCls} inputMode="text" value={v} onChange={(e) => { setV(e.target.value); setErr(""); }} aria-label="Number" />
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btn2Cls} onClick={onClose}>Cancel</button><button className={btnCls}>Go</button></div>
      </form>
    </Modal>
  );
}

export function RenameCharacterDialog({ names, onRename, onClose }: { names: string[]; onRename: (from: string, to: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState(names[0] ?? ""); const [to, setTo] = useState("");
  return (
    <Modal title="Rename Character" onClose={onClose}>
      {names.length === 0 ? <p className="text-sm text-muted">This script has no character cues yet.</p> : (
        <form onSubmit={(e) => { e.preventDefault(); if (to.trim()) onRename(from, to); }} className="space-y-3">
          <label className="block"><Label>Character</Label><select data-autofocus className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="block"><Label>New name</Label><input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} maxLength={60} /></label>
          <p className="text-xs text-muted">Every cue is renamed; extensions like (V.O.) are kept. Undo reverses it.</p>
          <div className="flex justify-end gap-2"><button type="button" className={btn2Cls} onClick={onClose}>Cancel</button><button className={btnCls} disabled={!to.trim()}>Rename</button></div>
        </form>
      )}
    </Modal>
  );
}

export function ReportsDialog({ els, pages, initial, title, onClose }: { els: Element[]; pages: Page[]; initial: string; title: string; onClose: () => void }) {
  const reports = useMemo(() => buildReports(els, pages), [els, pages]);
  const [id, setId] = useState(initial);
  const r = reports.find((x) => x.id === id) ?? reports[0];
  return (
    <Modal title="Reports" onClose={onClose} wide>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1">
        {reports.map((x) => <button key={x.id} role="tab" aria-selected={x.id === r.id} onClick={() => setId(x.id)} className={`rounded-md px-3 py-1.5 text-sm ${x.id === r.id ? "bg-accent text-black" : "ring-1 ring-line hover:bg-hover"}`}>{x.title.replace(" Report", "")}</button>)}
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-md ring-1 ring-line">
        {r.rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nothing to report yet. Add a scene heading and some dialogue.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-100"><tr>{r.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
            <tbody>{r.rows.map((row, i) => <tr key={i} className="border-t border-black/5">{row.map((c, j) => <td key={j} className="px-3 py-1.5 align-top">{c}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn2Cls} disabled={!r.rows.length} onClick={() => download(`${safeName(title)}-${r.id}-report.csv`, reportCsv(r), "text/csv")}>Export CSV</button>
        <button className={btnCls} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

export function characterNames(els: Element[]) {
  const set = new Set<string>();
  for (const e of els) if (e.type === "Character") { const n = e.runs.map((r) => r.text).join("").replace(/\(.*?\)/g, "").trim().toUpperCase(); if (n) set.add(n); }
  return [...set].sort();
}

export function SmartTypeDialog({ meta, setMeta, els, onClose }: { meta: DocMeta; setMeta: (m: DocMeta) => void; els: Element[]; onClose: () => void }) {
  const [cat, setCat] = useState<Category>("characters"); const [v, setV] = useState("");
  const cfg = meta.smartType;
  const list = useMemo(() => entries(els, cfg, cat), [els, cfg, cat]);
  const up = (c: typeof cfg) => setMeta({ ...meta, smartType: c });
  const add = () => {
    const t = v.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 80); if (!t) return;
    up({ ...cfg, custom: { ...cfg.custom, [cat]: [...new Set([...cfg.custom[cat], t])] }, hidden: { ...cfg.hidden, [cat]: cfg.hidden[cat].filter((x) => x !== t) } }); setV("");
  };
  const toggle = (t: string, hidden: boolean) => up({ ...cfg, hidden: { ...cfg.hidden, [cat]: hidden ? cfg.hidden[cat].filter((x) => x !== t) : [...cfg.hidden[cat], t] } });
  const remove = (t: string) => up({ ...cfg, custom: { ...cfg.custom, [cat]: cfg.custom[cat].filter((x) => x !== t) } });
  return (
    <Modal title="SmartType" onClose={onClose} wide>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" data-autofocus checked={cfg.enabled} onChange={(e) => up({ ...cfg, enabled: e.target.checked })} /> Suggest characters, locations, times of day, extensions and transitions while I type</label>
      <p className="mb-3 text-xs text-muted">Suggestions come from your script (most used first), then the entries you add here, then built-in ones. Untick an entry to stop it being suggested.</p>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {CATEGORIES.map((c) => <button key={c} role="tab" aria-selected={c === cat} onClick={() => setCat(c)} className={`rounded-md px-3 py-1.5 text-sm ${c === cat ? "bg-accent text-black" : "ring-1 ring-line hover:bg-hover"}`}>{CATEGORY_LABEL[c]}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="mb-3 flex gap-2">
        <input aria-label={`Add to ${CATEGORY_LABEL[cat]}`} className={inputCls} placeholder={`Add to ${CATEGORY_LABEL[cat].toLowerCase()}`} maxLength={80} value={v} onChange={(e) => setV(e.target.value)} />
        <button className={btnCls} disabled={!v.trim()}>Add</button>
      </form>
      <div className="max-h-[42vh] overflow-auto rounded-md ring-1 ring-line">
        {list.length === 0 ? <p className="p-5 text-center text-sm text-muted">Nothing here yet. It fills up as you write, or add your own above.</p> : (
          <ul className="divide-y divide-line">
            {list.map((e) => (
              <li key={e.text} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <input type="checkbox" aria-label={`Suggest ${e.text}`} checked={!e.hidden} onChange={() => toggle(e.text, e.hidden)} />
                <span className={`flex-1 font-script ${e.hidden ? "text-muted line-through" : ""}`}>{e.text}</span>
                <span className="text-xs text-muted">{e.source}</span>
                {e.source === "custom" && <button aria-label={`Remove ${e.text}`} className="rounded px-1.5 text-muted hover:bg-hover" onClick={() => remove(e.text)}>✕</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export interface RecentScript { id: string; title: string; updatedAt: string; count: number }
export function OpenDialog({ currentId, onOpenFile, onNative, onOpenScript, onClose, focus }: {
  currentId: string; onOpenFile: (f: File) => void; onNative: () => void; onOpenScript: (id: string) => void; onClose: () => void; focus: "file" | "recent";
}) {
  const [recent, setRecent] = useState<RecentScript[] | null>(null); const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/scripts").then((r) => (r.ok ? r.json() : Promise.reject(new Error("load")))).then((j: { scripts: RecentScript[] }) => { if (live) setRecent(j.scripts); }).catch(() => { if (live) setErr("Could not load your recent scripts."); });
    return () => { live = false; };
  }, []);
  const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Modal title="Open" onClose={onClose}>
      <button data-autofocus={focus === "file" ? "" : undefined} className={`${btnCls} w-full`} onClick={() => (window.guionista ? onNative() : input.current?.click())}>Open a file… (.fdx, .fountain, .txt, backup .json)</button>
      <input ref={input} type="file" hidden accept=".fdx,.xml,.fountain,.txt,.spmd,.json" aria-label="Choose a screenplay file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onOpenFile(f); }} />
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Open recent</h3>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {!err && recent === null && <p className="text-sm text-muted">Loading…</p>}
      {recent && recent.length === 0 && <p className="text-sm text-muted">No scripts yet.</p>}
      {recent && recent.length > 0 && (
        <ul className="max-h-[40vh] divide-y divide-line overflow-auto rounded-md ring-1 ring-line">
          {recent.map((r, i) => (
            <li key={r.id}>
              <button data-autofocus={focus === "recent" && i === 0 ? "" : undefined} onClick={() => onOpenScript(r.id)} aria-current={r.id === currentId}
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-hover">
                <span className="min-w-0 flex-1 truncate font-medium">{r.title}{r.id === currentId ? " (open now)" : ""}</span>
                <span className="shrink-0 text-xs text-muted">{fmt.format(new Date(r.updatedAt))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function TargetDialog({ meta, setMeta, minutes, onClose }: { meta: DocMeta; setMeta: (m: DocMeta) => void; minutes: number; onClose: () => void }) {
  const [v, setV] = useState(String(meta.targetMinutes || ""));
  const apply = (n: number) => { setV(String(n || "")); setMeta({ ...meta, targetMinutes: Math.max(0, Math.min(600, Math.round(n))) }); };
  return (
    <Modal title="Target Script Length" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">The bar at the bottom of the window compares your estimated screen time (about one minute per page, {Math.round(minutes)} min now) with this target.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[30, 60, 90, 120, 150].map((n) => <button key={n} onClick={() => apply(n)} className={`${btn2Cls} ${meta.targetMinutes === n ? "ring-2 ring-accent" : ""}`}>{n} min</button>)}
        <button onClick={() => apply(0)} className={btn2Cls}>No target</button>
      </div>
      <label className="block"><Label>Custom target (minutes)</Label>
        <input data-autofocus type="number" min={0} max={600} className={inputCls} value={v} onChange={(e) => { setV(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== "") setMeta({ ...meta, targetMinutes: Math.max(0, Math.min(600, Math.round(n))) }); }} /></label>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

const KEYS: [string, string][] = [
  ["Return", "New element: Action → Action, Character → Dialogue, Dialogue → Action, Scene Heading → Action, Transition → Scene Heading"],
  ["Return on an empty line", "Quick Elements menu: press the letter ([G] General, [S] Scene Heading, [A] Action…) or ↑↓ and Enter"],
  ["Ctrl+Backspace · Ctrl+Delete", "Delete the word before / after the caret (like Word); Ctrl+← → move by word"], ["Ctrl+Alt+D", "Dual Dialogue"],
  ["Tab on Action", "Turns the line into a Character"], ["Tab in Dialogue", "Opens a Parenthetical with () already in place; Return goes back to Dialogue"],
  ["Tab after a Character name", "Extension list: (V.O.), (O.S.)…"], ["Tab after a location", "Adds \" - \" and offers the time of day (DÍA, NOCHE…)"],
  ["Tab with a SmartType entry highlighted", "Accepts it"], ["Shift-Tab", "Previous element type"],
  ["Double-click / triple-click", "Select a word / the whole element"], ["Right-click · Shift-F10", "Context menu: elements, spelling, synonyms"],
  ["Ctrl+wheel · two-finger pinch", "Fine zoom (Ctrl +, Ctrl -, Ctrl 0 also work)"], ["Double-click the tab bar", "Hide or show the toolbar"],
  ["F11", "Immersive writing; Esc exits"], ["Ctrl-O", "Open a file or a recent script"], ["Ctrl-Z / Ctrl-Shift-Z", "Undo / redo"], ["Ctrl-B / I / U", "Bold / italic / underline"],
  ["Ctrl-F · Ctrl-G · Ctrl-S · Ctrl-P", "Find & replace · go to · save · print / PDF"], ["F6", "Move focus to the ribbon and back"],
];
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose}>
      <dl className="space-y-1.5 text-sm">{KEYS.map(([k, d]) => <div key={k} className="grid grid-cols-[14rem_1fr] gap-3"><dt className="font-mono text-xs leading-5 text-muted">{k}</dt><dd>{d}</dd></div>)}</dl>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Close</button></div>
    </Modal>
  );
}
export function AboutDialog({ onClose, desktop, elements }: { onClose: () => void; desktop: boolean; elements: number }) {
  return (
    <Modal title="About Guionista" onClose={onClose}>
      <p className="font-script text-sm font-bold uppercase tracking-wide">INT. GUIONISTA - DAY</p>
      <p className="mt-3 text-sm">Guionista 2.5 — screenplay editor with industry-standard formatting, live pagination, revisions, reports, and import/export.</p>
      <p className="mt-2 text-sm text-muted">{desktop ? "Your scripts are stored in the GuionistaData folder next to this app." : "Your scripts are stored in your account."} This script has {elements} elements.</p>
      <div className="mt-5 flex justify-end"><button className={btnCls} onClick={onClose}>Close</button></div>
    </Modal>
  );
}
void indexElements;
