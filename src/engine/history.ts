import { Cursor, DocState, makeElement } from "./doc";
import { elementText } from "./types";

export interface Hist { cur: DocState; past: DocState[]; future: DocState[]; key?: string; at: number }
export type Act =
  | { t: "edit"; fn: (s: DocState) => DocState; key?: string; now?: number }
  | { t: "cursor"; cursor: Cursor }
  | { t: "undo" } | { t: "redo" }
  | { t: "reset"; state: DocState };

export const MAX_HISTORY = 1000;
const COALESCE_MS = 1000;
/**
 * Whatever an edit produced, the document always has at least one element and the caret always sits on a real one, inside its text
 * (a stale caret would crash the editor and lose the session). Returns the same object when nothing needs fixing.
 */
export function sane(s: DocState): DocState {
  if (!s.elements.length) { const e = makeElement("Action"); return { elements: [e], cursor: { id: e.id, offset: 0 } }; }
  const c = s.cursor; const e = s.elements.find((x) => x.id === c.id);
  if (!e) return { ...s, cursor: { id: s.elements[0].id, offset: 0 } };
  const n = elementText(e).length;
  if (c.offset < 0 || c.offset > n || !Number.isFinite(c.offset)) return { ...s, cursor: { ...c, offset: Math.max(0, Math.min(n, Number.isFinite(c.offset) ? c.offset : 0)), anchor: undefined, anchorId: undefined } };
  if (c.anchor !== undefined && c.anchorId === undefined && (c.anchor < 0 || c.anchor > n)) return { ...s, cursor: { ...c, anchor: Math.max(0, Math.min(n, c.anchor)) } };
  return s;
}
export const initHist = (cur: DocState): Hist => ({ cur: sane(cur), past: [], future: [], at: 0 });

/** Element-level history: snapshots share unchanged Element objects, so undo is O(1) and pagination-aware via reference diffing. */
export function reduce(h: Hist, a: Act): Hist {
  switch (a.t) {
    case "reset": return initHist(a.state);
    case "cursor": return { ...h, cur: sane({ ...h.cur, cursor: a.cursor }), key: undefined };
    case "edit": {
      const next = sane(a.fn(h.cur));
      if (next === h.cur) return h;
      const now = a.now ?? Date.now();
      if (a.key && a.key === h.key && now - h.at < COALESCE_MS) return { ...h, cur: next, future: [], at: now };
      const past = h.past.length >= MAX_HISTORY ? h.past.slice(1) : h.past;
      return { cur: next, past: [...past, h.cur], future: [], key: a.key, at: now };
    }
    case "undo": {
      const prev = h.past[h.past.length - 1]; if (!prev) return h;
      return { cur: prev, past: h.past.slice(0, -1), future: [h.cur, ...h.future], key: undefined, at: 0 };
    }
    case "redo": {
      const nx = h.future[0]; if (!nx) return h;
      return { cur: nx, past: [...h.past, h.cur], future: h.future.slice(1), key: undefined, at: 0 };
    }
  }
}

/** First index where two element arrays differ by reference (the dirty start). */
export function firstDiff<T>(a: T[], b: T[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? Infinity : n;
}
