import { Element, elementText } from "./types";

export const CATEGORIES = ["characters", "locations", "times", "extensions", "transitions", "intros"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Lists = Record<Category, string[]>;
export const CATEGORY_LABEL: Record<Category, string> = {
  characters: "Characters", locations: "Locations", times: "Times of day", extensions: "Extensions", transitions: "Transitions", intros: "Scene intros",
};

/** Per-script SmartType settings: entries the writer added, and entries they asked not to see. */
export interface SmartTypeConfig { enabled: boolean; custom: Record<Category, string[]>; hidden: Record<Category, string[]> }
const empty = (): Record<Category, string[]> => ({ characters: [], locations: [], times: [], extensions: [], transitions: [], intros: [] });
export const defaultSmartType = (): SmartTypeConfig => ({ enabled: true, custom: empty(), hidden: empty() });

/** Built-in entries, so SmartType works from the first keystroke of a new script. */
export const BUILT_IN_BY_LANG: Record<"es" | "en", Lists> = {
  es: {
    characters: [], locations: [],
    intros: ["INT.", "EXT.", "INT./EXT.", "I/E."],
    times: ["DÍA", "NOCHE", "MAÑANA", "TARDE", "ATARDECER", "AMANECER", "ANOCHECER", "CONTINUO", "MÁS TARDE", "MOMENTOS DESPUÉS", "MISMO MOMENTO"],
    extensions: ["V.O.", "O.S.", "EN OFF", "FUERA DE CAMPO", "CONT."],
    transitions: ["CORTE A:", "CORTE SECO A:", "SALTO A:", "DISOLVENCIA A:", "FUNDIDO DE ENTRADA:", "FUNDE A NEGRO.", "FUNDIDO A:", "VOLVEMOS A:", "INTERCALADO CON:"],
  },
  en: {
    characters: [], locations: [],
    intros: ["INT.", "EXT.", "INT./EXT.", "I/E."],
    times: ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "DAWN", "DUSK", "LATER", "CONTINUOUS", "MOMENTS LATER", "SAME TIME", "SAME"],
    extensions: ["V.O.", "O.S.", "O.C.", "CONT'D", "FILTER"],
    transitions: ["CUT TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "DISSOLVE TO:", "FADE IN:", "FADE OUT.", "FADE TO BLACK.", "BACK TO:", "INTERCUT WITH:"],
  },
};
export const BUILT_IN = BUILT_IN_BY_LANG.es;

const INTRO = /^(INT\.\/EXT\.|INT\/EXT\.|I\/E\.?|INT\.|EXT\.)\s*/i;
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const cleanList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => norm(x).slice(0, 80)).filter(Boolean).slice(0, max) : []);

export function parseSmartType(v: unknown): SmartTypeConfig {
  const d = defaultSmartType();
  if (!v || typeof v !== "object") return d;
  const o = v as Record<string, unknown>;
  d.enabled = o.enabled !== false;
  for (const k of ["custom", "hidden"] as const) {
    const src = (o[k] ?? {}) as Record<string, unknown>;
    for (const c of CATEGORIES) d[k][c] = [...new Set(cleanList(src[c], 500))];
  }
  return d;
}

interface Stat { n: number; last: number }
/** Entries found in the script, most used first, then most recent. */
function fromScript(els: Element[]): Lists {
  const S: Record<Category, Map<string, Stat>> = { characters: new Map(), locations: new Map(), times: new Map(), extensions: new Map(), transitions: new Map(), intros: new Map() };
  const hit = (c: Category, k: string, i: number) => { if (!k) return; const s = S[c].get(k); S[c].set(k, { n: (s?.n ?? 0) + 1, last: i }); };
  els.forEach((e, i) => {
    const t = norm(elementText(e));
    if (!t) return;
    if (e.type === "Character") {
      const m = /^([^(]*?)\s*(?:\(.*\))?$/.exec(t); if (m) hit("characters", m[1].trim(), i);
      for (const x of t.matchAll(/\(([^)]*)\)/g)) hit("extensions", norm(x[1]), i);
    } else if (e.type === "Scene Heading") {
      const im = INTRO.exec(t); if (im) hit("intros", norm(im[1]), i);
      const rest = t.slice(im ? im[0].length : 0); const d = rest.lastIndexOf(" - ");
      if (d >= 0) { hit("locations", rest.slice(0, d).trim(), i); hit("times", rest.slice(d + 3).trim(), i); } else hit("locations", rest.trim(), i);
    } else if (e.type === "Transition") hit("transitions", t, i);
  });
  const out = {} as Lists;
  for (const c of CATEGORIES) out[c] = [...S[c].entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(([k]) => k);
  return out;
}

export type Source = "script" | "custom" | "built-in";
export interface Entry { text: string; source: Source; hidden: boolean }

/** Every entry of a category with where it came from (for the settings dialog). */
export function entries(els: Element[], cfg: SmartTypeConfig, cat: Category, doc = fromScript(els), lang: "es" | "en" = "es"): Entry[] {
  const hid = new Set(cfg.hidden[cat]); const seen = new Set<string>(); const out: Entry[] = [];
  const add = (list: string[], source: Source) => { for (const t of list) if (!seen.has(t)) { seen.add(t); out.push({ text: t, source, hidden: hid.has(t) }); } };
  add(doc[cat], "script"); add(cfg.custom[cat], "custom"); add(BUILT_IN_BY_LANG[lang][cat], "built-in");
  return out;
}

/** The lists the popup draws from: script entries (ranked), then the writer's own, then built-ins; minus hidden ones. */
export function buildLists(els: Element[], cfg: SmartTypeConfig = defaultSmartType(), lang: "es" | "en" = "es"): Lists {
  const doc = fromScript(els);
  const out = {} as Lists;
  for (const c of CATEGORIES) out[c] = entries(els, cfg, c, doc, lang).filter((e) => !e.hidden).map((e) => e.text);
  return out;
}

export interface Suggestion {
  kind: Category;
  items: string[]; from: number; to: number;
  /** text inserted before the item (a space after "INT.") and after it (")" / " - ") */
  prefix: string; suffix: string;
  /** nothing typed yet: the list is a menu, so nothing is pre-selected and Enter keeps its normal job */
  open: boolean;
}

const plainText = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const rank = (list: string[], token: string): string[] => {
  const q = plainText(norm(token));
  if (!q) return list;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const starts = list.filter((x) => plainText(x).startsWith(q) && plainText(x) !== q);
  const words = list.filter((x) => !plainText(x).startsWith(q) && plainText(x) !== q && new RegExp(`(^|[\\s.\\-/'(])${esc}`).test(plainText(x)));
  return [...starts, ...words];
};

/** What popup (if any) applies at the cursor. Accepting replaces [from,to) with prefix + item + suffix. */
export function suggest(el: Element, offset: number, L: Lists): Suggestion | null {
  const text = elementText(el);
  const before = text.slice(0, offset); const after = text.slice(offset);
  const done = (kind: Category, items: string[], from: number, extra: Partial<Suggestion> = {}): Suggestion | null =>
    items.length ? { kind, items: items.slice(0, 8), from, to: offset, prefix: "", suffix: "", open: false, ...extra } : null;

  if (el.type === "Character") {
    const open = before.lastIndexOf("(");
    if (open >= 0 && !before.includes(")", open)) {
      const tok = before.slice(open + 1);
      return done("extensions", rank(L.extensions, tok), open + 1, { suffix: after.startsWith(")") ? "" : ")", open: !tok.trim() });
    }
    if (open >= 0) return null;
    return done("characters", rank(L.characters, before), 0, { open: !before.trim() });
  }
  if (el.type === "Scene Heading") {
    const dash = before.lastIndexOf(" - ");
    if (dash >= 0) { const tok = before.slice(dash + 3); return done("times", rank(L.times, tok), dash + 3, { open: !tok.trim() }); }
    const im = INTRO.exec(before);
    if (!im) return done("intros", rank(L.intros, before), 0, { suffix: " ", open: !before.trim() });
    const tok = before.slice(im[0].length);
    const hasDash = after.includes(" - ");
    return done("locations", rank(L.locations, tok), im[0].length, { prefix: /\s$/.test(im[0]) ? "" : " ", suffix: after.trim() || hasDash ? "" : " - ", open: !tok.trim() });
  }
  if (el.type === "Transition") return done("transitions", rank(L.transitions, before), 0, { open: !before.trim() });
  return null;
}
