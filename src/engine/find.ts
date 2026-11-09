import { replaceRuns, formatAt } from "./runs";
import { DocState } from "./doc";
import { Element, elementText } from "./types";

export interface Match { id: string; start: number; end: number }

export function findMatches(els: Element[], q: string, matchCase: boolean): Match[] {
  if (!q) return [];
  const needle = matchCase ? q : q.toLowerCase();
  const out: Match[] = [];
  for (const e of els) {
    const t = elementText(e); const h = matchCase ? t : t.toLowerCase();
    for (let i = h.indexOf(needle); i >= 0; i = h.indexOf(needle, i + needle.length)) out.push({ id: e.id, start: i, end: i + needle.length });
  }
  return out;
}

/** Replace every match, keeping the formatting at the start of each match. */
export function replaceAll(s: DocState, q: string, r: string, matchCase: boolean): DocState {
  const ms = findMatches(s.elements, q, matchCase);
  if (!ms.length) return s;
  const by = new Map<string, Match[]>();
  for (const m of ms) by.set(m.id, [...(by.get(m.id) ?? []), m]);
  const elements = s.elements.map((e) => {
    const list = by.get(e.id); if (!list) return e;
    let runs = e.runs;
    for (const m of [...list].reverse()) runs = replaceRuns(runs, m.start, m.end, r, formatAt(runs, m.start + 1));
    return { ...e, runs };
  });
  return { elements, cursor: { id: s.cursor.id, offset: 0 } };
}
