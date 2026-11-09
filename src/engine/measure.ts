import { DEFAULT_LAYOUT, PageLayout, widthCharsFor } from "./layout";
import { ElementType } from "./types";

export interface Measurer { layout: PageLayout; lines(text: string, type: ElementType): string[]; linesW(text: string, type: ElementType, width: number): string[] }

export const widthChars = (t: ElementType, L: PageLayout = DEFAULT_LAYOUT) => widthCharsFor(t, L);

export const isCaps = (t: ElementType) => t === "Scene Heading" || t === "Character" || t === "Transition" || t === "Shot" || t === "End of Act";

/**
 * Greedy word wrap at a character width (Courier is monospace: 1 char = 0.1in). Spaces stay on the line they were typed on
 * (they may hang past the margin, like a word processor), so every character of the text is on exactly one line and the
 * caret can always sit right after a typed space.
 */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(?<= )/)) {
      if ((line + word).trimEnd().length > width && line.trim()) { out.push(line); line = ""; }
      let w = word;
      while (w.trimEnd().length > width) { out.push(w.slice(0, width)); w = w.slice(width); }
      line += w;
    }
    out.push(line);
  }
  return out;
}

/** Offset in `text` where each wrapped line begins. Lines tile the text exactly; only the "\n" between paragraphs is skipped. */
export function lineStarts(text: string, lines: string[]): number[] {
  const starts: number[] = [];
  let p = 0;
  for (const l of lines) {
    starts.push(p);
    p += l.length;
    if (text[p] === "\n") p++;
  }
  return starts;
}

/** Cached by (text, elementType, width). */
export class CachedMeasurer implements Measurer {
  private cache = new Map<string, string[]>();
  constructor(public layout: PageLayout = DEFAULT_LAYOUT) {}
  lines(text: string, type: ElementType) { return this.linesW(text, type, widthChars(type, this.layout)); }
  linesW(text: string, type: ElementType, w: number) {
    const key = `${type}\u0000${w}\u0000${text}`;
    let v = this.cache.get(key);
    if (!v) {
      v = wrap(isCaps(type) ? text.toUpperCase() : text, w);
      if (this.cache.size > 20000) this.cache.clear();
      this.cache.set(key, v);
    }
    return v;
  }
}
