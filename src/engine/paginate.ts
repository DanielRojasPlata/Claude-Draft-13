import { Element, elementText, Script } from "./types";
import { charW, dualBox, linesPerPage, PageLayout, placeLine, spaceBefore } from "./layout";
import { isCaps, lineStarts, Measurer } from "./measure";
import { Lang, LockEntry } from "./meta";

export interface PLine {
  text: string; type: Element["type"]; elementId: string; row: number;
  start?: number; synthetic?: boolean;
  /** horizontal extent of the line in inches, from the page layout */
  leftIn: number; rightIn: number; col?: 1 | 2;
  /** automatic text drawn after the line but not part of the element: " (CONT'D)" for a speaker who keeps talking in the same scene */
  suffix?: string;
}
export interface Page { number: number; label: string; lines: PLine[]; rows: number }
export interface PaginateOpts { resume?: { pages: Page[]; dirty: number }; lock?: LockEntry[] | null; mores?: boolean; lang?: Lang; layout?: PageLayout }
/** Screenplay convention, kept in English for every script language: "(MORE)" at the foot of a page and "NAME (CONT'D)" on the next. */
const MORE_TXT = "(MORE)", CONTD_TXT = " (CONT'D)";
const baseName = (t: string) => t.toUpperCase().replace(/\s*\(.*$/, "").trim();
/**
 * True when this Character cue repeats the previous speaker of the same scene (only action,
 * parentheticals, dialogue, etc. in between): the page then shows "NAME (CONT'D)" by itself.
 */
export function isContd(els: Element[], i: number): boolean {
  const e = els[i];
  if (!e || e.type !== "Character" || e.dual) return false;
  const t = elementText(e);
  const name = baseName(t);
  if (!name || /CONT/i.test(t)) return false;
  for (let j = i - 1; j >= 0; j--) {
    const q = els[j];
    if (q.type === "Scene Heading") return false;
    if (q.type === "Character") return !q.dual && baseName(elementText(q)) === name;
  }
  return false;
}



export const paginate = (script: Script, m: Measurer): Page[] => paginateElements(script.scenes.flatMap((s) => s.elements), m);

const isContinuation = (pages: Page[], k: number) => {
  const first = pages[k]?.lines[0];
  if (!first) return true;
  if (first.synthetic) return true;
  const prevLast = pages[k - 1]?.lines.at(-1);
  return !!prevLast && prevLast.elementId === first.elementId;
};

const letters = (n: number) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

/** Page labels: plain numbers, or locked numbers with A/B pages for overflow. */
function label(pages: Page[], lock: LockEntry[] | null | undefined) {
  if (!lock || !lock.length) { pages.forEach((p, i) => { p.label = String(i + 1); }); return; }
  const map = new Map(lock.map((l) => [l.id, l.label]));
  let base = "1", extra = 0;
  pages.forEach((p, i) => {
    const first = p.lines[0];
    const lab = first && !isContinuation(pages, i) ? map.get(first.elementId) : undefined;
    if (lab) { base = lab; extra = 0; p.label = lab; }
    else if (i === 0) p.label = base;
    else { extra++; p.label = `${base}${letters(extra)}`; }
  });
}

/** Lock the current pagination: remember the first element and label of each page. */
export function lockEntries(pages: Page[]): LockEntry[] {
  const out: LockEntry[] = [];
  pages.forEach((p, i) => { const f = p.lines[0]; if (f && !isContinuation(pages, i)) out.push({ id: f.elementId, label: p.label }); });
  return out;
}

interface Cell { text: string; start: number; el: Element; leftIn: number; rightIn: number }

/**
 * Paginate a flat element list. With `resume`, pages before the dirty element are reused
 * and only the dirty range forward is recomputed.
 */
export function paginateElements(els: Element[], m: Measurer, opts: PaginateOpts = {}): Page[] {
  const { resume, lock, mores = true, lang = "en" } = opts;
  const L = opts.layout ?? m.layout; const LPP = linesPerPage(L); const CW = charW(L);
  const blankBefore = (el: Element, prev?: Element) => (prev ? spaceBefore(el.type, L) : 0);
  const moreTxt = MORE_TXT, contTxt = CONTD_TXT; void lang;
  const lockSet = new Set((lock ?? []).map((l) => l.id));
  let pages: Page[] = [{ number: 1, label: "1", lines: [], rows: 0 }];
  let startAt = 0;
  if (resume && resume.pages.length > 1) {
    const index = new Map<string, number>();
    els.forEach((e, i) => index.set(e.id, i));
    for (let k = resume.pages.length - 1; k >= 1; k--) {
      const first = resume.pages[k].lines[0];
      const si = first ? index.get(first.elementId) : undefined;
      if (si !== undefined && si <= resume.dirty - 2 && !isContinuation(resume.pages, k)) {
        pages = resume.pages.slice(0, k);
        pages.push({ number: k + 1, label: String(k + 1), lines: [], rows: 0 });
        startAt = si;
        break;
      }
    }
  }
  let page = pages[pages.length - 1];
  const used = () => page.rows;
  const newPage = () => { page = { number: pages.length + 1, label: "", lines: [], rows: 0 }; pages.push(page); };
  const emit = (text: string, el: Element, start?: number, synthetic?: boolean, x?: { leftIn: number; rightIn: number; col: 1 | 2 }) => {
    page.lines.push({ text, type: el.type, elementId: el.id, row: page.rows, start, synthetic, ...(x ?? placeLine(el.type, text, L)) });
    page.rows++;
  };
  const blank = () => { if (page.rows > 0) page.rows++; };
  const caps = (el: Element, t: string) => (isCaps(el.type) ? t.toUpperCase() : t);

  for (let i = startAt; i < els.length; i++) {
    const el = els[i];
    const prev = els[i - 1];
    if ((el.breakBefore || lockSet.has(el.id)) && used() > 0) newPage();

    // ---- dual dialogue block: two groups side by side, laid out atomically ----
    if (el.dual === 1) {
      let j = i; while (j < els.length && els[j].dual === 1) j++;
      let k = j; while (k < els.length && els[k].dual === 2) k++;
      if (k > j) {
        const build = (a: number, b: number, side: 1 | 2): (Cell | null)[] => {
          const cells: (Cell | null)[] = [];
          for (let n = a; n < b; n++) {
            const e = els[n]; const ind = dualBox(e.type, side, L);
            if (n > a) for (let g = 0; g < blankBefore(e, els[n - 1]); g++) cells.push(null);
            const raw = elementText(e);
            const lines = m.linesW(raw, e.type, Math.max(8, Math.floor((ind.right - ind.left) / CW + 1e-6)));
            const starts = lineStarts(caps(e, raw), lines);
            lines.forEach((text, q) => cells.push({ text, start: starts[q], el: e, leftIn: ind.left, rightIn: ind.right }));
          }
          return cells;
        };
        const LC = build(i, j, 1), RC = build(j, k, 2);
        const height = Math.max(LC.length, RC.length);
        const gap = used() === 0 ? 0 : 1;
        if (used() + gap + height > LPP && height <= LPP) newPage();
        else for (let g = 0; g < gap; g++) blank();
        let r = 0;
        while (r < height) {
          if (page.rows >= LPP) newPage();
          const n = Math.min(LPP - page.rows, height - r);
          const base = page.rows;
          for (const [cells, col] of [[LC, 1], [RC, 2]] as const) {
            for (let q = r; q < r + n; q++) {
              const c = cells[q]; if (!c) continue;
              page.lines.push({ text: c.text, type: c.el.type, elementId: c.el.id, row: base + (q - r), start: c.start, leftIn: c.leftIn, rightIn: c.rightIn, col });
            }
          }
          page.rows = base + n; r += n;
        }
        i = k - 1;
        continue;
      }
    }

    const raw = elementText(el);
    const lines = m.lines(raw, el.type);
    const starts = lineStarts(caps(el, raw), lines);
    const gap = used() === 0 ? 0 : blankBefore(el, prev);
    let need = gap + lines.length;
    const next = els[i + 1];
    if ((el.type === "Scene Heading" || el.type === "Character") && next) need += spaceBefore(next.type, L) + Math.min(2, m.lines(elementText(next), next.type).length);
    const contd = isContd(els, i);
    const put = (from: number, to: number) => {
      for (let j = from; j < to; j++) {
        emit(lines[j], el, starts[j]);
        if (contd && j === 0) page.lines[page.lines.length - 1].suffix = CONTD_TXT;
      }
    };
    if (used() + need <= LPP) {
      for (let g = 0; g < gap; g++) blank();
      put(0, lines.length);
      continue;
    }
    if (used() + gap + lines.length <= LPP) { newPage(); put(0, lines.length); continue; }
    if (el.type === "Dialogue" || el.type === "Action") {
      const dlg = el.type === "Dialogue" && mores;
      if (LPP - used() - gap - (dlg ? 1 : 0) >= 2 && lines.length > LPP - used() - gap - (dlg ? 1 : 0)) {
        for (let g = 0; g < gap; g++) blank();
        let off = 0;
        for (;;) {
          const rel = off ? m.lines(raw.slice(off), el.type) : lines;
          const st = (off ? lineStarts(caps(el, raw.slice(off)), rel) : starts).map((x) => x + off);
          const free = LPP - page.rows;
          if (rel.length <= free) { for (let j = 0; j < rel.length; j++) { emit(rel[j], el, st[j]); if (contd && off === 0 && j === 0) page.lines[page.lines.length - 1].suffix = CONTD_TXT; } break; }
          const room = free - (dlg ? 1 : 0);
          // end the page on the last complete sentence that fits (the rest of that line moves to the next page)
          const seg = raw.slice(off, off + (st[room - 1] - off) + rel[room - 1].length);
          let p = 0; for (const mm of seg.matchAll(/[.!?…]+["'”’)\]]*(?=\s|$)/g)) p = mm.index! + mm[0].length;
          let pre = p > 0 ? m.lines(seg.slice(0, p), el.type) : [];
          let preSt = pre.length ? lineStarts(caps(el, seg.slice(0, p)), pre).map((x) => x + off) : [];
          let next = off + p;
          if (pre.length < 2 || next >= raw.length) { pre = rel.slice(0, room); preSt = st.slice(0, room); next = room < rel.length ? st[room] : raw.length; }
          for (let j = 0; j < pre.length; j++) { emit(pre[j], el, preSt[j]); if (contd && off === 0 && j === 0) page.lines[page.lines.length - 1].suffix = CONTD_TXT; }
          if (dlg) emit(moreTxt, { ...el, type: "Character" }, undefined, true);
          newPage();
          if (dlg) {
            let c = i - 1; while (c >= 0 && els[c].type !== "Character") c--;
            if (c >= 0) emit(`${m.lines(elementText(els[c]), "Character")[0].trimEnd().replace(/ \((CONT'D|CONT\.)\)$/, "")}${contTxt}`, els[c], undefined, true);
          }
          while (next < raw.length && /\s/.test(raw[next])) next++;
          off = next;
          if (off >= raw.length) break;
        }
        continue;
      }
    }
    newPage(); put(0, lines.length);
  }
  label(pages, lock);
  return pages;
}
