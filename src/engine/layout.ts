import type { PLine } from "./paginate";
import type { ElementType } from "./types";

/** Everything the writer can customise about the page. All distances are in inches; the UI shows centimetres or inches. */
export interface ElementStyle {
  /** typeface (fixed-width only, so the character grid never changes) */
  font?: string;
  bold?: boolean; italic?: boolean; underline?: boolean;
  /** show in capitals (Scene Heading, Character, Transition, Shot and End of Act always are) */
  caps?: boolean;
  align?: "left" | "center" | "right";
  /** distance from the left / right edge of the page to the text, in inches */
  left?: number; right?: number;
  /** blank lines before the element */
  before?: number;
}
export const STYLE_KEYS = ["font", "bold", "italic", "underline", "caps", "align", "left", "right", "before"] as const;

export interface PageLayout {
  /** layout version: 2 = right margin is 3 cm by default */
  v?: number;
  page: "letter" | "a4" | "legal" | "a5" | "custom";
  width: number; height: number;
  left: number; right: number; top: number; bottom: number;
  font: string; fontPt: number;
  /** line height as a multiple of the font size (1 = single) */
  spacing: number;
  /** blank lines before a Scene Heading / End of Act, and before other blocks */
  headingGap: number; blockGap: number;
  /** per-element overrides (Document > Page Layout > Elements) */
  elements?: Partial<Record<ElementType, ElementStyle>>;
}

export const PAGE_SIZES: Record<Exclude<PageLayout["page"], "custom">, [number, number]> = { letter: [8.5, 11], a4: [8.27, 11.69], legal: [8.5, 14], a5: [5.83, 8.27] };
/** Fixed-pitch families only: the whole layout assumes every character is 0.6 em wide. */
export const FONTS = ["Courier Prime", "Courier New", "Liberation Mono"] as const;
/** 3 cm, the right margin the writer asked for */
export const DEFAULT_RIGHT = 3 / 2.54;
export const DEFAULT_LAYOUT: PageLayout = { v: 2, page: "letter", width: 8.5, height: 11, left: 1.5, right: DEFAULT_RIGHT, top: 1, bottom: 1, font: "Courier Prime", fontPt: 12, spacing: 1, headingGap: 2, blockGap: 1 };

export const charW = (L: PageLayout) => (L.fontPt * 0.6) / 72;
export const lineH = (L: PageLayout) => (L.fontPt * L.spacing) / 72;
export const textLeft = (L: PageLayout) => L.left;
export const textRight = (L: PageLayout) => L.width - L.right;
export const linesPerPage = (L: PageLayout) => Math.max(8, Math.floor((L.height - L.top - L.bottom) / lineH(L) + 1e-6));
export const rowTopIn = (row: number, L: PageLayout) => L.top + row * lineH(L);
export const fontStack = (L: PageLayout) => `"${L.font}", "Courier New", Courier, monospace`;

/** Default horizontal extent of an element in inches. Dialogue and parentheticals keep their classic width whatever the margins are. */
export function defaultBox(type: ElementType, L: PageLayout): { left: number; right: number } {
  const a = textLeft(L), b = textRight(L);
  switch (type) {
    case "Character": return { left: Math.min(a + 2.2, b - 1), right: b };
    case "Parenthetical": return { left: Math.min(a + 1.6, b - 1), right: Math.min(a + 4.0, b) };
    case "Dialogue": return { left: Math.min(a + 1.0, b - 1), right: Math.min(a + 4.5, b) };
    case "Transition": return { left: Math.min(a + 4.0, b - 1), right: b };
    default: return { left: a, right: b };
  }
}
/** Horizontal extent of an element, including the writer's per-element margins. */
export function boxOf(type: ElementType, L: PageLayout): { left: number; right: number } {
  const d = defaultBox(type, L); const s = L.elements?.[type];
  if (!s || (s.left === undefined && s.right === undefined)) return d;
  const left = Math.max(0, Math.min(s.left ?? d.left, L.width - 1));
  const right = Math.min(L.width, Math.max(s.right === undefined ? d.right : L.width - s.right, left + 0.8));
  return { left, right };
}
export const styleOf = (type: ElementType, L: PageLayout): ElementStyle => L.elements?.[type] ?? {};
export const defaultAlign = (type: ElementType): "left" | "center" | "right" => (type === "Transition" ? "right" : type === "End of Act" ? "center" : "left");
export const alignOf = (type: ElementType, L: PageLayout) => styleOf(type, L).align ?? defaultAlign(type);
/** Dual dialogue columns: they start half an inch into the left margin and end at the right margin, so a wider margin narrows them (3.2in each at most). */
export function dualBox(type: ElementType, side: 1 | 2, L: PageLayout): { left: number; right: number } {
  const start = textLeft(L) - 0.5, gap = 0.3;
  const w = Math.max(1.6, Math.min(3.2, (textRight(L) - start - gap) / 2));
  const x = start + (side === 1 ? 0 : w + gap);
  if (type === "Character") return { left: x + Math.min(0.9, w / 3), right: x + w };
  if (type === "Parenthetical") return { left: x + 0.5, right: x + w - 0.5 };
  return { left: x, right: x + w };
}
export const widthCharsFor = (type: ElementType, L: PageLayout) => { const b = boxOf(type, L); return Math.max(8, Math.floor((b.right - b.left) / charW(L) + 1e-6)); };

/** Blank lines before an element (the original's 24pt scene heading / 12pt block / 0pt dialogue, adjustable). */
export function spaceBefore(type: ElementType, L: PageLayout): number {
  const o = L.elements?.[type]?.before; if (o !== undefined) return o;
  switch (type) {
    case "Scene Heading": case "End of Act": return L.headingGap;
    case "Dialogue": case "Parenthetical": case "General": return 0;
    default: return L.blockGap;
  }
}

/** Where a line starts and ends on the page. Transitions are right-aligned and End of Act is centred unless the writer chose otherwise. */
export function placeLine(type: ElementType, text: string, L: PageLayout): { leftIn: number; rightIn: number } {
  const b = boxOf(type, L); const w = text.trimEnd().length * charW(L);
  const al = alignOf(type, L);
  if (al === "right") return { leftIn: Math.max(b.left, b.right - w), rightIn: b.right };
  if (al === "center") return { leftIn: Math.max(b.left, (b.left + b.right) / 2 - w / 2), rightIn: b.right };
  return { leftIn: b.left, rightIn: b.right };
}
export const lineLeftIn = (l: PLine) => l.leftIn;
export const lineRightIn = (l: PLine) => l.rightIn;

const ELEMENT_NAMES = ["General", "Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Transition", "Shot", "Summary", "End of Act", "Note"] as const;
function parseStyles(v: unknown): PageLayout["elements"] {
  if (!v || typeof v !== "object") return undefined;
  const out: Partial<Record<ElementType, ElementStyle>> = {};
  for (const t of ELEMENT_NAMES) {
    const o = (v as Record<string, unknown>)[t]; if (!o || typeof o !== "object") continue;
    const q = o as Record<string, unknown>; const st: ElementStyle = {};
    if ((FONTS as readonly string[]).includes(q.font as string)) st.font = q.font as string;
    for (const k of ["bold", "italic", "underline", "caps"] as const) if (typeof q[k] === "boolean") st[k] = q[k] as boolean;
    if (q.align === "left" || q.align === "center" || q.align === "right") st.align = q.align;
    for (const k of ["left", "right"] as const) if (typeof q[k] === "number" && Number.isFinite(q[k])) st[k] = Math.max(0, Math.min(12, q[k] as number));
    if (typeof q.before === "number" && Number.isFinite(q.before)) st.before = Math.round(Math.max(0, Math.min(6, q.before)));
    if (Object.keys(st).length) out[t] = st;
  }
  return Object.keys(out).length ? out : undefined;
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
/** Defensive merge of untrusted stored layout over the defaults; the text area can never collapse. */
export function parseLayout(v: unknown): PageLayout {
  const d = { ...DEFAULT_LAYOUT };
  if (!v || typeof v !== "object") return d;
  const o = v as Record<string, unknown>;
  const page = (["letter", "a4", "legal", "a5", "custom"] as const).find((p) => p === o.page) ?? "letter";
  const [pw, ph] = page === "custom" ? [num(o.width, 4, 20, 8.5), num(o.height, 5, 30, 11)] : PAGE_SIZES[page];
  const L: PageLayout = {
    v: 2, page, width: pw, height: ph,
    left: num(o.left, 0, 6, d.left),
    // layouts saved before version 2 carried the old narrow default (about 1.5 cm): move them to 3 cm; a wider margin the writer chose is kept
    right: o.v === 2 || num(o.right, 0, 6, d.right) > 1.2 ? num(o.right, 0, 6, d.right) : d.right, top: num(o.top, 0, 6, d.top), bottom: num(o.bottom, 0, 6, d.bottom),
    font: (FONTS as readonly string[]).includes(o.font as string) ? (o.font as string) : d.font,
    fontPt: num(o.fontPt, 8, 16, d.fontPt), spacing: num(o.spacing, 0.8, 3, d.spacing),
    headingGap: Math.round(num(o.headingGap, 0, 4, d.headingGap)), blockGap: Math.round(num(o.blockGap, 0, 3, d.blockGap)),
    elements: parseStyles(o.elements),
  };
  if (!L.elements) delete L.elements;
  if (L.width - L.left - L.right < 3) { L.left = d.left; L.right = d.right; }
  if (L.height - L.top - L.bottom < 3) { L.top = d.top; L.bottom = d.bottom; }
  if (L.width - L.left - L.right < 3 || L.height - L.top - L.bottom < 3) return d;
  return L;
}
