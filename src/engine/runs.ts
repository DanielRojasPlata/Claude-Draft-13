import { Run } from "./types";

export type FmtKey = "bold" | "italic" | "underline";
export type Fmt = Partial<Record<FmtKey, boolean>>;
const same = (a: Run, b: Run) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline;
const fmtOf = (r: Run): Fmt => ({ ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.underline ? { underline: true } : {}) });

export function normalize(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && same(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push({ text: r.text, ...fmtOf(r) });
  }
  return out.length ? out : [{ text: "" }];
}

export const plain = (text: string): Run[] => [{ text }];
export const textOf = (runs: Run[]) => runs.map((r) => r.text).join("");

export function sliceRuns(runs: Run[], a: number, b: number): Run[] {
  const out: Run[] = []; let p = 0;
  for (const r of runs) {
    const s = Math.max(a, p), e = Math.min(b, p + r.text.length);
    if (e > s) out.push({ ...r, text: r.text.slice(s - p, e - p) });
    p += r.text.length;
  }
  return out;
}

/** Format of the character before offset i (the first character when i is 0). */
export function formatAt(runs: Run[], i: number): Fmt {
  let p = 0;
  for (const r of runs) {
    if (!r.text) continue;
    if (i > p && i <= p + r.text.length) return fmtOf(r);
    p += r.text.length;
  }
  const first = runs.find((r) => r.text);
  return i <= 0 && first ? fmtOf(first) : fmtOf(runs[runs.length - 1] ?? { text: "" });
}

export function replaceRuns(runs: Run[], a: number, b: number, str: string, fmt?: Fmt): Run[] {
  const f = fmt ?? formatAt(runs, a);
  const total = textOf(runs).length;
  return normalize([...sliceRuns(runs, 0, a), ...(str ? [{ text: str, ...f }] : []), ...sliceRuns(runs, b, total)]);
}

export function allHave(runs: Run[], a: number, b: number, key: FmtKey): boolean {
  const s = sliceRuns(runs, a, b);
  return s.length > 0 && s.every((r) => !!r[key]);
}

export function toggleRuns(runs: Run[], a: number, b: number, key: FmtKey): Run[] {
  const on = !allHave(runs, a, b, key);
  const total = textOf(runs).length;
  const mid = sliceRuns(runs, a, b).map((r) => ({ ...r, [key]: on ? true : undefined }));
  return normalize([...sliceRuns(runs, 0, a), ...mid, ...sliceRuns(runs, b, total)]);
}

export interface Segment { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
/** Runs restricted to [a,b) as render segments. */
export function segments(runs: Run[], a: number, b: number): Segment[] {
  return sliceRuns(runs, a, b);
}
