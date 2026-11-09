import { cycleType, nextOnEnter } from "./keymap";
import { allHave, Fmt, FmtKey, formatAt, plain, replaceRuns, sliceRuns, textOf, toggleRuns } from "./runs";
import { isCaps } from "./measure";
import { Element, ElementType, elementText } from "./types";

export interface Cursor {
  id: string; offset: number;
  /** where the selection started: an offset in `anchorId` (or in `id` when `anchorId` is absent) */
  anchor?: number;
  /** set when the selection started in a different element (a selection across lines, scenes and pages) */
  anchorId?: string;
  /** pending format for the next typed text */ fmt?: Fmt;
}
export interface DocState { elements: Element[]; cursor: Cursor }

let counter = 0;
export const uid = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`;
export const makeElement = (type: ElementType, text = ""): Element => ({ id: uid(), type, runs: plain(text) });
const withRuns = (e: Element, runs: Element["runs"]): Element => ({ ...e, runs });
const idx = (s: DocState) => s.elements.findIndex((e) => e.id === s.cursor.id);
const put = (els: Element[], i: number, e: Element) => { const c = els.slice(); c[i] = e; return c; };

/** Selection inside the caret's own element, as offsets. A selection that spans several elements is `span()`, not this. */
export const selection = (c: Cursor): [number, number] | null =>
  c.anchor === undefined || (c.anchorId !== undefined && c.anchorId !== c.id) || c.anchor === c.offset ? null : [Math.min(c.anchor, c.offset), Math.max(c.anchor, c.offset)];

/** A selection across two or more elements, in document order: from (a, ao) to (b, bo), a < b (indices into the elements). */
export interface Span { a: number; ao: number; b: number; bo: number }
export function span(s: DocState): Span | null {
  const c = s.cursor;
  if (c.anchor === undefined || c.anchorId === undefined || c.anchorId === c.id) return null;
  const ai = s.elements.findIndex((e) => e.id === c.anchorId), ci = idx(s);
  if (ai < 0 || ci < 0) return null;
  const ao = Math.max(0, Math.min(c.anchor, elementText(s.elements[ai]).length)), co = Math.max(0, Math.min(c.offset, elementText(s.elements[ci]).length));
  return ai < ci ? { a: ai, ao, b: ci, bo: co } : { a: ci, ao: co, b: ai, bo: ao };
}
/** True when anything at all is selected, in one element or across several. */
export const hasSelection = (s: DocState) => !!selection(s.cursor) || !!span(s);
/** The selected pieces: [element index, from, to] for each element touched, in document order. */
export function pieces(s: DocState): [number, number, number][] {
  const m = span(s);
  if (m) {
    const out: [number, number, number][] = [];
    for (let i = m.a; i <= m.b; i++) out.push([i, i === m.a ? m.ao : 0, i === m.b ? m.bo : elementText(s.elements[i]).length]);
    return out;
  }
  const r = selection(s.cursor); return r ? [[idx(s), r[0], r[1]]] : [];
}
/** The whole script selected (Ctrl+A). */
export function selectAll(s: DocState): DocState {
  const first = s.elements[0], last = s.elements[s.elements.length - 1];
  if (first.id === last.id) return { ...s, cursor: { id: last.id, offset: elementText(last).length, anchor: 0 } };
  return { ...s, cursor: { id: last.id, offset: elementText(last).length, anchor: 0, anchorId: first.id } };
}

export const selectedText = (s: DocState) => pieces(s).map(([i, a, b]) => elementText(s.elements[i]).slice(a, b)).join("\n");

/** Delete a selection that spans several elements: the first element keeps its head, joins the tail of the last, everything between goes. */
function deleteSpan(s: DocState): DocState {
  const m = span(s); if (!m) return s;
  const A = s.elements[m.a], B = s.elements[m.b];
  const head = sliceRuns(A.runs, 0, m.ao), tail = sliceRuns(B.runs, m.bo, elementText(B).length);
  const runs = [...head, ...tail].filter((r) => r.text);
  const merged = withRuns(A, runs.length ? runs : plain(""));
  return { elements: [...s.elements.slice(0, m.a), merged, ...s.elements.slice(m.b + 1)], cursor: { id: A.id, offset: m.ao } };
}

const next = (s: DocState, i: number, el: Element, offset: number): DocState => ({ elements: put(s.elements, i, el), cursor: { id: el.id, offset } });

/** Elements whose first letter is capitalised as it is typed (the others are always in capitals). */
const CAP_FIRST = new Set<ElementType>(["Action", "General", "Dialogue", "Summary", "Note"]);
/** The first letter of the line becomes a capital the moment it is typed (or pasted); later edits are left alone. A Parenthetical stays lowercase: it is a direction inside brackets, e.g. "(quietly)". */
function capFirst(el: Element, runs: Element["runs"], at: number, len: number): Element["runs"] {
  if (!CAP_FIRST.has(el.type)) return runs;
  const t = textOf(runs); const i0 = t.search(/\S/);
  if (i0 < 0 || i0 < at || i0 >= at + len) return runs;
  const ch = t[i0];
  if (ch === ch.toLocaleLowerCase() && ch !== ch.toLocaleUpperCase()) return replaceRuns(runs, i0, i0 + 1, ch.toLocaleUpperCase());
  return runs;
}

export function insertText(s: DocState, str: string): DocState {
  if (span(s)) s = deleteSpan(s);
  const i = idx(s); const el = s.elements[i]; const t = elementText(el);
  if (isCaps(el.type)) str = str.toLocaleUpperCase();
  let r = selection(s.cursor) ?? [s.cursor.offset, s.cursor.offset];
  // a Parenthetical is "( … )": whatever is typed stays inside the brackets, even when the caret sits after the closing one
  if (el.type === "Parenthetical" && t.startsWith("(") && t.endsWith(")") && t.length >= 2) {
    const lo = Math.max(1, Math.min(r[0], t.length - 1)), hi = Math.max(lo, Math.min(r[1], t.length - 1));
    r = [lo, hi]; str = str.replace(/^\(+|\)+$/g, "");
    if (!str && r[0] === r[1]) return s;
  }
  const parts = str.replace(/\r\n?/g, "\n").split("\n");
  if (parts.length === 1) {
    return next(s, i, withRuns(el, capFirst(el, replaceRuns(el.runs, r[0], r[1], str, s.cursor.fmt), r[0], str.length)), r[0] + str.length);
  }
  const tail = sliceRuns(el.runs, r[1], t.length);
  const head = replaceRuns(el.runs, r[0], t.length, parts[0], s.cursor.fmt);
  const mid = parts.slice(1, -1).map((p) => makeElement(el.type, isCaps(el.type) ? p.toLocaleUpperCase() : p));
  const lastText = parts[parts.length - 1];
  const last: Element = { ...makeElement(el.type), runs: [...plain(lastText), ...tail].filter((r) => r.text) };
  if (!last.runs.length) last.runs = plain("");
  return {
    elements: [...s.elements.slice(0, i), withRuns(el, head), ...mid, last, ...s.elements.slice(i + 1)],
    cursor: { id: last.id, offset: parts[parts.length - 1].length },
  };
}

function removeRange(s: DocState, a: number, b: number): DocState {
  const i = idx(s); const el = s.elements[i];
  return next(s, i, withRuns(el, replaceRuns(el.runs, a, b, "")), a);
}

export function deleteBack(s: DocState): DocState {
  if (span(s)) return deleteSpan(s);
  const r = selection(s.cursor); if (r) return removeRange(s, r[0], r[1]);
  const i = idx(s); const el = s.elements[i]; const t = elementText(el); const o = s.cursor.offset;
  if (el.type === "Parenthetical" && t === "()" && o === 1) return next(s, i, withRuns(el, plain("")), 0); // an empty pair of brackets goes away together
  if (o > 0) {
    const w = /[\uDC00-\uDFFF]/.test(t[o - 1]) && o > 1 ? 2 : 1;
    return removeRange(s, o - w, o);
  }
  if (i === 0) return s;
  const prev = s.elements[i - 1];
  const pt = elementText(prev);
  const merged = t === "" ? prev : withRuns(prev, [...prev.runs, ...el.runs]);
  return { elements: [...s.elements.slice(0, i - 1), merged, ...s.elements.slice(i + 1)], cursor: { id: prev.id, offset: pt.length } };
}

const cls = (c: string) => (/\s/.test(c) ? 0 : /[\p{L}\p{N}_'’]/u.test(c) ? 1 : 2);
/** Start of the word before `o`, like Ctrl+Backspace in Word: spaces first, then the run of letters (or punctuation) before them. */
export function wordStart(t: string, o: number): number {
  let i = o; while (i > 0 && cls(t[i - 1]) === 0) i--;
  if (i === 0) return 0;
  const c = cls(t[i - 1]); while (i > 0 && cls(t[i - 1]) === c) i--;
  return i;
}
/** Start of the next word after `o`, like Ctrl+Right in Word: finish this word, then skip the spaces. */
export function wordEnd(t: string, o: number): number {
  let i = o; const n = t.length;
  if (i < n && cls(t[i]) !== 0) { const c = cls(t[i]); while (i < n && cls(t[i]) === c) i++; }
  while (i < n && cls(t[i]) === 0) i++;
  return i;
}
/** Ctrl+Backspace: delete the word before the caret (or the selection). At the start of a line it joins with the previous one. */
export function deleteWordBack(s: DocState): DocState {
  if (span(s)) return deleteSpan(s);
  const r = selection(s.cursor); if (r) return removeRange(s, r[0], r[1]);
  const el = s.elements[idx(s)]; const t = elementText(el); const o = s.cursor.offset;
  if (o === 0) return deleteBack(s);
  return removeRange(s, wordStart(t, o), o);
}
/** Ctrl+Delete: delete the word after the caret, with the spaces that follow it (or the selection). At the end of a line it joins the next one. */
export function deleteWordForward(s: DocState): DocState {
  if (span(s)) return deleteSpan(s);
  const r = selection(s.cursor); if (r) return removeRange(s, r[0], r[1]);
  const el = s.elements[idx(s)]; const t = elementText(el); const o = s.cursor.offset;
  if (o >= t.length) return deleteForward(s);
  return removeRange(s, o, wordEnd(t, o));
}

export function deleteForward(s: DocState): DocState {
  if (span(s)) return deleteSpan(s);
  const r = selection(s.cursor); if (r) return removeRange(s, r[0], r[1]);
  const i = idx(s); const el = s.elements[i]; const t = elementText(el); const o = s.cursor.offset;
  if (o < t.length) {
    const w = /[\uD800-\uDBFF]/.test(t[o]) ? 2 : 1;
    return removeRange(s, o, o + w);
  }
  const nx = s.elements[i + 1];
  if (!nx) return s;
  return { elements: [...s.elements.slice(0, i), withRuns(el, [...el.runs, ...nx.runs]), ...s.elements.slice(i + 2)], cursor: { id: el.id, offset: t.length } };
}

/**
 * Enter: at the end of an element (or on an empty one) the next-logical type starts;
 * splitting Action or Dialogue in the middle keeps the same type for the rest of the text.
 */
export function enter(s: DocState): DocState {
  let base = hasSelection(s) ? deleteBack(s) : s;
  // inside "(...)" Return finishes the parenthetical: continue with Dialogue instead of splitting the closing bracket off
  const cur0 = base.elements[idx(base)];
  if (cur0.type === "Parenthetical" && elementText(cur0).endsWith(")") && base.cursor.offset >= elementText(cur0).length - 1) base = { ...base, cursor: { id: cur0.id, offset: elementText(cur0).length } };
  const i = idx(base); const el = base.elements[i]; const t = elementText(el); const o = base.cursor.offset;
  const tail = sliceRuns(el.runs, o, t.length);
  const midSplit = o < t.length && (el.type === "Action" || el.type === "Dialogue" || el.type === "General" || el.type === "Shot");
  let nextType: ElementType = midSplit ? el.type : nextOnEnter(el.type);
  if (!midSplit && el.type === "Dialogue" && inExchange(base.elements, i)) nextType = "Character"; // consecutive speeches: the next speaker, not Action
  const fresh: Element = { id: uid(), type: nextType, runs: tail.length ? tail : plain(""), ...(el.dual ? { dual: el.dual } : {}) };
  const head = sliceRuns(el.runs, 0, o);
  return { elements: [...base.elements.slice(0, i), withRuns(el, head.length ? head : plain("")), fresh, ...base.elements.slice(i + 1)], cursor: { id: fresh.id, offset: 0 } };
}

export function setType(s: DocState, type: ElementType): DocState {
  const i = idx(s); const el = s.elements[i];
  if (el.type === type) return s;
  let runs = isCaps(type) ? el.runs.map((r) => ({ ...r, text: r.text.toLocaleUpperCase() })) : el.runs;
  let cursor = s.cursor;
  if (type === "Parenthetical") {
    // choosing Parenthetical opens the brackets: an empty line becomes "( | )", existing text is wrapped
    const t = textOf(runs).trim();
    if (!t) { runs = plain("()"); cursor = { id: el.id, offset: 1 }; }
    else if (!(t.startsWith("(") && t.endsWith(")"))) {
      const inner = t.replace(/^\(+|\)+$/g, ""); runs = plain(`(${inner})`);
      cursor = { id: el.id, offset: Math.min(1 + inner.length, cursor.offset + 1) };
    }
  } else if (el.type === "Parenthetical") {
    const t = textOf(runs);
    if (t === "()") { runs = plain(""); cursor = { id: el.id, offset: 0 }; }
  }
  const moved: Element = { ...el, type, runs };
  const capped = CAP_FIRST.has(type) ? withRuns(moved, capFirst(moved, runs, 0, textOf(runs).length)) : moved;
  return { ...s, cursor, elements: put(s.elements, i, capped) };
}
export const cycle = (s: DocState, dir: 1 | -1) => setType(s, cycleType(s.elements[idx(s)].type, dir));
export const currentElement = (s: DocState) => s.elements[idx(s)];

export function replaceRange(s: DocState, from: number, to: number, str: string): DocState {
  const i = idx(s); const el = s.elements[i];
  return next(s, i, withRuns(el, replaceRuns(el.runs, from, to, str)), from + str.length);
}

/** Bold / italic / underline: toggles the selection, or the pending format for the next typed text. */
export function toggleFormat(s: DocState, key: FmtKey): DocState {
  const m = span(s);
  if (m) {
    const ps = pieces(s).filter(([i, a, b]) => b > a && elementText(s.elements[i]).length > 0);
    const on = !ps.every(([i, a, b]) => allHave(s.elements[i].runs, a, b, key)); // all bold already: turn it off, otherwise on everywhere
    const els = s.elements.slice();
    for (const [i, a, b] of ps) { const e = els[i]; els[i] = withRuns(e, allHave(e.runs, a, b, key) === on ? e.runs : toggleRuns(e.runs, a, b, key)); }
    return { elements: els, cursor: s.cursor };
  }
  const i = idx(s); const el = s.elements[i]; const r = selection(s.cursor);
  if (r) return { elements: put(s.elements, i, withRuns(el, toggleRuns(el.runs, r[0], r[1], key))), cursor: s.cursor };
  const cur = s.cursor.fmt ?? formatAt(el.runs, s.cursor.offset);
  return { ...s, cursor: { ...s.cursor, fmt: { ...cur, [key]: !cur[key] } } };
}
export const formatState = (s: DocState, key: FmtKey): boolean => {
  if (span(s)) { const ps = pieces(s).filter(([, a, b]) => b > a); return ps.length > 0 && ps.every(([i, a, b]) => allHave(s.elements[i].runs, a, b, key)); }
  const el = currentElement(s); const r = selection(s.cursor);
  if (r) return allHave(el.runs, r[0], r[1], key);
  return !!(s.cursor.fmt ?? formatAt(el.runs, s.cursor.offset))[key];
};

/** Change case of the selection (or the whole element when nothing is selected). */
export function changeCase(s: DocState, mode: "upper" | "lower" | "title"): DocState {
  const conv = (seg: string) => (mode === "upper" ? seg.toUpperCase() : mode === "lower" ? seg.toLowerCase() : seg.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, (_m, p, c: string) => p + c.toUpperCase()));
  if (span(s)) {
    const els = s.elements.slice(); let changed = false;
    for (const [i, a, b] of pieces(s)) {
      const e = els[i]; const seg = elementText(e).slice(a, b); const out = conv(seg);
      if (out !== seg) { changed = true; els[i] = withRuns(e, replaceRuns(e.runs, a, b, out, formatAt(e.runs, a + 1))); }
    }
    return changed ? { elements: els, cursor: s.cursor } : s;
  }
  const i = idx(s); const el = s.elements[i]; const t = elementText(el);
  const [a, b] = selection(s.cursor) ?? [0, t.length];
  const seg = t.slice(a, b);
  const out = conv(seg);
  if (out === seg) return s;
  return next({ ...s, cursor: { ...s.cursor, anchor: undefined, anchorId: undefined } }, i, withRuns(el, replaceRuns(el.runs, a, b, out, formatAt(el.runs, a + 1))), selection(s.cursor) ? b : s.cursor.offset);
}

/** The dialogue group (Character + Parenthetical/Dialogue run) containing index i, as [start,end). */
export function dialogueGroup(els: Element[], i: number): [number, number] | null {
  const ok = (e: Element) => e.type === "Character" || e.type === "Parenthetical" || e.type === "Dialogue";
  if (!els[i] || !ok(els[i])) return null;
  let a = i; while (a > 0 && els[a].type !== "Character" && ok(els[a - 1])) a--;
  if (els[a].type !== "Character") return null;
  let b = a + 1; while (b < els.length && els[b].type !== "Character" && ok(els[b])) b++;
  return [a, b];
}

/**
 * Dual dialogue (two speeches side by side), the way Final Draft does it: with the caret in a speech, the command pairs it with the
 * speech that follows, or opens an empty one in the right-hand column and moves the caret there. Used again it turns the pair back
 * into ordinary dialogue. Anywhere else (an empty line, an Action...) it starts a fresh pair at that point.
 */
export function toggleDual(s: DocState): DocState {
  const i = idx(s); let g = dialogueGroup(s.elements, i);
  const els = s.elements.slice();
  if (!g) {
    const el = els[i]; const blank = elementText(el).trim() === "";
    const c1 = blank ? { ...el, type: "Character" as const, runs: plain("") } : makeElement("Character"); const d1 = makeElement("Dialogue");
    const c2 = makeElement("Character"); const d2 = makeElement("Dialogue");
    const at = blank ? i : i + 1;
    els.splice(at, blank ? 1 : 0, c1, d1, c2, d2);
    for (const [e, side] of [[c1, 1], [d1, 1], [c2, 2], [d2, 2]] as const) els[els.indexOf(e)] = { ...e, dual: side };
    return { elements: els, cursor: { id: c1.id, offset: 0 } };
  }
  if (els[g[0]].dual) {
    const side = els[g[0]].dual;
    const left = side === 1 ? g : null;
    let ga = g, gb: [number, number] | null = null;
    if (left) gb = dialogueGroup(els, g[1]);
    else { const pg = g[0] > 0 ? dialogueGroup(els, g[0] - 1) : null; if (pg) { gb = g; ga = pg; } }
    for (const r of [ga, gb]) if (r) for (let k = r[0]; k < r[1]; k++) { const { dual: _d, ...rest } = els[k]; els[k] = rest as Element; }
    return { elements: els, cursor: s.cursor };
  }
  let other = g[1] < els.length ? dialogueGroup(els, g[1]) : null;
  let cursor = s.cursor;
  if (!other || els[other[0]].dual) {
    const c = makeElement("Character"); const d = makeElement("Dialogue");
    els.splice(g[1], 0, c, d); other = [g[1], g[1] + 2];
    cursor = { id: c.id, offset: 0 };
  }
  for (let k = g[0]; k < g[1]; k++) els[k] = { ...els[k], dual: 1 };
  for (let k = other[0]; k < other[1]; k++) els[k] = { ...els[k], dual: 2 };
  return { elements: els, cursor };
}

export function togglePageBreak(s: DocState): DocState {
  const i = idx(s); const el = s.elements[i];
  return { ...s, elements: put(s.elements, i, { ...el, breakBefore: el.breakBefore ? undefined : true }) };
}

/** Rewrite every Character cue (and its extension-free name) from one name to another. */
export function renameCharacter(s: DocState, from: string, to: string): DocState {
  const f = from.trim().toUpperCase(), t = to.trim().toUpperCase();
  if (!f || !t || f === t) return s;
  let changed = false;
  const elements = s.elements.map((e) => {
    if (e.type !== "Character") return e;
    const txt = textOf(e.runs);
    const m = /^(\s*)([^(]*?)(\s*(?:\(.*\))?\s*)$/.exec(txt);
    if (!m || m[2].toUpperCase() !== f) return e;
    changed = true;
    return withRuns(e, plain(`${m[1]}${t}${m[3]}`));
  });
  return changed ? { elements, cursor: { id: s.cursor.id, offset: 0 } } : s;
}

/** Remove the scene containing the cursor (always leaves at least one element). */
export function deleteScene(s: DocState): DocState {
  const i = idx(s); if (i < 0) return s;
  let a = i; while (a > 0 && s.elements[a].type !== "Scene Heading") a--;
  if (s.elements[a].type !== "Scene Heading") return s;
  let b = a + 1; while (b < s.elements.length && s.elements[b].type !== "Scene Heading") b++;
  const rest = [...s.elements.slice(0, a), ...s.elements.slice(b)];
  if (!rest.length) { const e = makeElement("Scene Heading"); return { elements: [e], cursor: { id: e.id, offset: 0 } }; }
  const near = rest[Math.min(a, rest.length - 1)];
  return { elements: rest, cursor: { id: near.id, offset: 0 } };
}

/** Stamp every element that differs from `prev` (new or edited) with the revision pass. */
export function stampRevision(prev: DocState, next: DocState, pass: number): DocState {
  const old = new Set(prev.elements);
  let changed = false;
  const elements = next.elements.map((e) => { if (old.has(e) || e.rev === pass) return e; changed = true; return { ...e, rev: pass }; });
  return changed ? { ...next, elements } : next;
}

/** A Character cue left as "NAME (" (extension list dismissed): remove the dangling parenthesis. */
export function trimDanglingParen(s: DocState): DocState {
  const i = idx(s); const el = s.elements[i]; const t = elementText(el);
  if (el.type !== "Character" || !/\s*\($/.test(t) || s.cursor.offset !== t.length) return s;
  const cut = t.replace(/\s*\($/, "").length;
  return next(s, i, withRuns(el, replaceRuns(el.runs, cut, t.length, "")), cut);
}

/**
 * Tab as the writer's flow key (from the spec): on an Action line it turns the line into a Character; in Dialogue it opens a
 * Parenthetical with the brackets already in place. Returns null when Tab has no special meaning here.
 */
export function tabFlow(s: DocState): DocState | null {
  const i = idx(s); const el = s.elements[i]; const t = elementText(el);
  if (el.type === "Action" && !selection(s.cursor)) {
    const c = setType(s, "Character");
    return { elements: c.elements, cursor: { id: el.id, offset: elementText(c.elements[i]).length } };
  }
  if (el.type === "Dialogue") {
    if (t === "") return { elements: put(s.elements, i, { ...el, type: "Parenthetical", runs: plain("()") }), cursor: { id: el.id, offset: 1 } };
    const p: Element = { id: uid(), type: "Parenthetical", runs: plain("()"), ...(el.dual ? { dual: el.dual } : {}) };
    return { elements: [...s.elements.slice(0, i + 1), p, ...s.elements.slice(i + 1)], cursor: { id: p.id, offset: 1 } };
  }
  return null;
}

/** True when the Dialogue at index i is the second (or later) speech in a row: the cue it belongs to follows another speech. */
export function inExchange(els: Element[], i: number): boolean {
  let c = i; while (c > 0 && (els[c].type === "Dialogue" || els[c].type === "Parenthetical")) c--;
  if (els[c]?.type !== "Character") return false;
  const before = els[c - 1];
  return !!before && (before.type === "Dialogue" || before.type === "Parenthetical");
}
