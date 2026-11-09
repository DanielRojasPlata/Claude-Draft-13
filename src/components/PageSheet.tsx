import { memo, type CSSProperties, type ReactNode } from "react";
import { REVISION_COLORS, DocMeta, ViewMode } from "@/engine/meta";
import { fontStack, lineH, lineLeftIn, PageLayout, rowTopIn, styleOf, textLeft, textRight } from "@/engine/layout";
import type { Page } from "@/engine/paginate";
import { isCaps } from "@/engine/measure";
import { segments } from "@/engine/runs";
import { candidateWords, isChecked, grammarIssues, Issue } from "@/engine/grammar";
import { Element, elementText } from "@/engine/types";

export const VIEW_VARS: Record<ViewMode, { paper: string; ink: string; canvas: string; faint: string }> = {
  day: { paper: "#ffffff", ink: "#111111", canvas: "#e9e6e1", faint: "rgba(0,0,0,.07)" },
  night: { paper: "#2a2c31", ink: "#e4e2dc", canvas: "#16171a", faint: "rgba(255,255,255,.08)" },
  midnight: { paper: "#000000", ink: "#c9c7c1", canvas: "#050506", faint: "rgba(255,255,255,.08)" },
};

/** On screen the page follows the active theme (CSS variables); printing and PDF are always black on white. */
export const sheetColors = (print?: boolean) => print
  ? { paper: "#ffffff", ink: "#111111", faint: "rgba(0,0,0,.07)" }
  : { paper: "var(--paper)", ink: "var(--ink)", faint: "var(--faint)" };

export interface SheetProps {
  page: Page; index: number; elsById: Map<string, Element>; sceneNo: Map<string, number>; meta: DocMeta;
  /** the print/PDF variant never uses the dark view modes */
  print?: boolean; children?: ReactNode; marks?: Marks | null;
}

const pos = (L: PageLayout, row: number, left: number, extra?: CSSProperties): CSSProperties => ({ top: `${rowTopIn(row, L)}in`, left: `${left}in`, ...extra });
/** CSS variables every page line inherits: size, line height and family come from the layout. */
const fontVars = (L: PageLayout) => ({ "--fs": `${L.fontPt}pt`, "--lh": `${lineH(L)}in`, "--ff": fontStack(L) }) as CSSProperties;

export function revisionLabel(page: Page, elsById: Map<string, Element>, meta: DocMeta): string {
  let top = 0;
  for (const l of page.lines) { const r = elsById.get(l.elementId)?.rev ?? 0; if (r > top) top = r; }
  return top ? `(${REVISION_COLORS[top].name} Rev.${meta.revision.date ? " " + meta.revision.date : ""})` : "";
}

/** Spelling and grammar marks for the editor (never for print). `ver` changes whenever the dictionary learns new words. */
export interface Marks { ver: number; lang: DocMeta["language"]; isBad: (w: string) => boolean; ignore: Set<string> }
interface TextProps { page: Page; elsById: Map<string, Element>; sceneNo: Map<string, number>; showNumbers: boolean; marks?: Marks | null; layout: PageLayout }

const issueCache = new WeakMap<Element, { key: string; issues: Issue[] }>();
function issuesOf(el: Element, m: Marks): Issue[] {
  const key = `${m.ver}|${m.lang}|${m.ignore.size}`;
  const hit = issueCache.get(el); if (hit && hit.key === key) return hit.issues;
  const text = elementText(el);
  const issues: Issue[] = [];
  for (const w of candidateWords(text)) if (m.isBad(w.word) && !m.ignore.has(w.word.toLocaleLowerCase())) issues.push({ start: w.start, end: w.end, kind: "spelling", message: "" });
  issues.push(...grammarIssues(text, m.lang));
  issueCache.set(el, { key, issues });
  return issues;
}
type Piece = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; mark?: Issue["kind"] };
/** Split render segments where a spelling or grammar issue starts or ends inside this line. */
function withMarks(segs: Piece[], lineStart: number, issues: Issue[]): Piece[] {
  if (!issues.length) return segs;
  const out: Piece[] = []; let pos = lineStart;
  for (const sg of segs) {
    const end = pos + sg.text.length; let cur = pos;
    const cuts = new Set<number>([pos, end]);
    for (const i of issues) { if (i.start > pos && i.start < end) cuts.add(i.start); if (i.end > pos && i.end < end) cuts.add(i.end); }
    for (const c of [...cuts].sort((a, b) => a - b)) {
      if (c <= cur) continue;
      const hit = issues.find((i) => i.start <= cur && i.end >= c);
      out.push({ ...sg, text: sg.text.slice(cur - pos, c - pos), ...(hit ? { mark: hit.kind } : {}) });
      cur = c;
    }
    pos = end;
  }
  return out;
}

/**
 * The text layer of one page. Pages before the edited element keep object identity (incremental
 * pagination), so memoising on `page` skips re-rendering everything except the dirty range.
 */
const PageText = memo(function PageText({ page, elsById, sceneNo, showNumbers, marks, layout: L }: TextProps) {
  return (
    <>
      {page.lines.map((l, k) => {
        if (!l.text) return null;
        const el = elsById.get(l.elementId);
        const es = styleOf(l.type, L);
        const caps = isCaps(l.type) || !!es.caps;
        const base: Piece[] = l.start !== undefined && el ? segments(el.runs, l.start, l.start + l.text.length) : [{ text: l.text }];
        const segs = marks && el && l.start !== undefined && !l.synthetic && isChecked(el) ? withMarks(base, l.start, issuesOf(el, marks)) : base;
        const italicDefault = l.type === "Note" || l.type === "Summary", boldDefault = l.type === "End of Act", underDefault = l.type === "End of Act";
        const styleLine: CSSProperties = {
          fontWeight: (es.bold ?? boldDefault) ? 700 : 400,
          ...((es.italic ?? italicDefault) ? { fontStyle: "italic" } : {}),
          ...((es.underline ?? underDefault) ? { textDecoration: "underline" } : {}),
          ...(es.font ? { fontFamily: `"${es.font}", "Courier New", Courier, monospace` } : {}),
          ...(l.type === "Note" ? { opacity: 0.72 } : {}),
        };
        const head = l.type === "Scene Heading" && l.start === 0;
        const num = head ? sceneNo.get(l.elementId) : undefined;
        return (
          <div key={k}>
            <div className="page-line" data-row={l.row} style={pos(L, l.row, lineLeftIn(l), styleLine)}>
              {segs.map((s, q) => {
                const sg = s as Piece;
                const st: CSSProperties = { ...(sg.bold ? { fontWeight: 700 } : {}), ...(sg.italic ? { fontStyle: "italic" } : {}), ...(sg.underline ? { textDecoration: "underline" } : {}) };
                const t = caps ? sg.text.toUpperCase() : sg.text;
                if (sg.mark) return <span key={q} className={sg.mark === "spelling" ? "sp-bad" : "sp-gram"} style={st}>{t}</span>;
                return Object.keys(st).length ? <span key={q} style={st}>{t}</span> : t;
              })}
              {l.suffix ? <span data-auto>{l.suffix}</span> : null}
            </div>
            {el && el.rev && !l.synthetic ? <div className="page-line" aria-hidden style={pos(L, l.row, textLeft(L) - 0.25)}>*</div> : null}
            {showNumbers && num !== undefined ? (
              <>
                <div className="page-line" style={pos(L, l.row, Math.max(0.05, textLeft(L) - 0.8), { width: "0.5in", textAlign: "right" })}>{num}</div>
                <div className="page-line" style={pos(L, l.row, textRight(L) + 0.1)}>{num}</div>
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}, (a, b) => a.page === b.page && a.layout === b.layout && a.showNumbers === b.showNumbers && (!a.showNumbers || a.sceneNo === b.sceneNo) && a.marks?.ver === b.marks?.ver && a.marks?.lang === b.marks?.lang && a.marks?.ignore.size === b.marks?.ignore.size && !!a.marks === !!b.marks);

/** One fixed 8.5x11in page. Geometry is in inches/points so screen and PDF match exactly. */
export function PageSheet({ page, index, elsById, sceneNo, meta, print, children, marks }: SheetProps) {
  const rev = revisionLabel(page, elsById, meta);
  const c = sheetColors(print); const L = meta.layout;
  const headTop = `${Math.max(0.15, L.top - 0.5)}in`;
  return (
    <div data-page={index} className="sheet" style={{ width: `${L.width}in`, height: `${L.height}in`, background: c.paper, color: c.ink, ...fontVars(L) }}>
      {meta.watermark && <div className="watermark" aria-hidden style={{ color: c.faint }}>{meta.watermark}</div>}
      {meta.header && <div className="page-line" style={{ top: headTop, left: `${textLeft(L)}in` }}>{meta.header}</div>}
      {rev && <div className="page-line" style={{ top: headTop, right: `${L.right + 0.9}in`, textAlign: "right" }}>{rev}</div>}
      {index > 0 && <div className="page-line" style={{ top: headTop, right: `${L.right}in`, width: "0.9in", textAlign: "right" }}>{page.label}.</div>}
      {meta.footer && <div className="page-line" style={{ top: `${L.height - Math.max(0.15, L.bottom - 0.5) - lineH(L)}in`, left: `${textLeft(L)}in`, width: `${textRight(L) - textLeft(L)}in`, textAlign: "center" }}>{meta.footer}</div>}
      <PageText page={page} elsById={elsById} sceneNo={sceneNo} showNumbers={meta.sceneNumbers} marks={print ? null : marks} layout={L} />
      {children}
    </div>
  );
}

export function TitleSheet({ meta, print }: { meta: DocMeta; print?: boolean }) {
  const t = meta.titlePage; const c = sheetColors(print); const L = meta.layout;
  const block: CSSProperties = { whiteSpace: "pre-wrap", fontFamily: fontStack(L), fontSize: `${L.fontPt}pt`, lineHeight: `${lineH(L)}in` };
  const w = textRight(L) - textLeft(L);
  return (
    <div className="sheet" style={{ width: `${L.width}in`, height: `${L.height}in`, background: c.paper, color: c.ink }}>
      {meta.watermark && <div className="watermark" aria-hidden style={{ color: c.faint }}>{meta.watermark}</div>}
      <div style={{ position: "absolute", top: `${L.height * 0.32}in`, left: `${textLeft(L)}in`, width: `${w}in`, textAlign: "center", ...block }}>
        {t.Title && <div style={{ textTransform: "uppercase", textDecoration: "underline", fontWeight: 700 }}>{t.Title}</div>}
        {t.Credit && <div style={{ marginTop: "2em" }}>{t.Credit}</div>}
        {t.Author && <div style={{ marginTop: "1em", textTransform: "uppercase" }}>{t.Author}</div>}
        {t.Source && <div style={{ marginTop: "2em" }}>{t.Source}</div>}
      </div>
      {t.Contact && <div style={{ position: "absolute", top: `${L.height - L.bottom - 2}in`, left: `${textLeft(L)}in`, width: `${w * 0.55}in`, ...block }}>{t.Contact}</div>}
      {(t["Draft Date"] || t.Copyright) && (
        <div style={{ position: "absolute", top: `${L.height - L.bottom - 2}in`, left: `${textLeft(L) + w * 0.55}in`, width: `${w * 0.45}in`, textAlign: "right", ...block }}>{[t["Draft Date"], t.Copyright].filter(Boolean).join("\n")}</div>
      )}
    </div>
  );
}

export function indexElements(els: Element[]) {
  const m = new Map<string, Element>();
  for (const e of els) m.set(e.id, e);
  return m;
}
export const hasTitlePage = (meta: DocMeta) => Object.values(meta.titlePage).some((v) => v.trim()) ;
void elementText;
