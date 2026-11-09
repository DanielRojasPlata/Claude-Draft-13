import type { Lang } from "./meta";
import { Element, ElementType, elementText } from "./types";

export interface Issue { start: number; end: number; kind: "spelling" | "grammar"; message: string }

/** Elements whose text is prose and worth checking; names, headings and transitions are not. */
export const CHECKED: ElementType[] = ["Action", "Dialogue", "Parenthetical", "General", "Summary", "Note"];
export const isChecked = (e: Element) => CHECKED.includes(e.type);

export const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’]*/gu;

/** Words worth sending to the dictionary: not ALL CAPS shouts/acronyms, no digits, at least 3 letters. */
export function candidateWords(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(WORD)) {
    const w = m[0]; const start = m.index ?? 0;
    if (w.length < 3) continue;
    if (w === w.toLocaleUpperCase() && w.length > 1) continue;
    out.push({ word: w, start, end: start + w.length });
  }
  return out;
}

/**
 * Rule-based grammar and punctuation checks: repeated words, unbalanced ¿? and ¡! (Spanish), a sentence that starts
 * in lower case, and a few very common slips. Deliberately conservative: a false alarm costs more than a missed one.
 */
export function grammarIssues(text: string, lang: Lang): Issue[] {
  const out: Issue[] = [];
  // repeated word ("de de", "the the"), except where doubling is normal
  const ok = new Set(["que", "ja", "no", "sí", "si", "bla", "ha", "ay", "muy", "tan", "poco", "mucho", "ya", "vamos", "bye", "so", "very", "had", "that"]);
  const re = /(?<![\p{L}\p{M}])([\p{L}\p{M}]{2,})(\s+)\1(?![\p{L}\p{M}])/giu;
  for (const m of text.matchAll(re)) {
    if (ok.has(m[1].toLowerCase())) continue;
    const s = (m.index ?? 0) + m[1].length + m[2].length;
    out.push({ start: s, end: s + m[1].length, kind: "grammar", message: lang === "es" ? `Palabra repetida: «${m[1]}»` : `Repeated word: “${m[1]}”` });
  }
  if (lang === "es") {
    // ¿ ? and ¡ ! must pair up inside a sentence
    const pairs: [string, string, string][] = [["¿", "?", "pregunta"], ["¡", "!", "exclamación"]];
    for (const [open, close, name] of pairs) {
      let depth = 0, openAt = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === open) { depth++; openAt = i; }
        else if (text[i] === close) {
          if (depth > 0) depth--; else out.push({ start: i, end: i + 1, kind: "grammar", message: `Falta el signo de apertura ${open} de la ${name}` });
        }
      }
      if (depth > 0) out.push({ start: openAt, end: openAt + 1, kind: "grammar", message: `Falta el signo de cierre ${close} de la ${name}` });
    }
  }
  // a sentence that starts in lower case after . ? ! … (not after common abbreviations or ellipsis lists)
  for (const m of text.matchAll(/([.!?…])(["'»”)]*)(\s+)(\p{Ll})/gu)) {
    const before = text.slice(0, m.index ?? 0);
    if (/\b(Sr|Sra|Dr|Dra|etc|pág|Mr|Mrs|Ms|vs)$/i.test(before) || m[1] === "." && /\.\.$/.test(before + ".")) continue;
    const s = (m.index ?? 0) + m[1].length + m[2].length + m[3].length;
    out.push({ start: s, end: s + 1, kind: "grammar", message: lang === "es" ? "La oración debe empezar con mayúscula" : "A sentence should start with a capital letter" });
  }
  if (lang === "es") {
    for (const [bad, good] of [[/\ba ver\s+si\s+(?=\p{L})/giu, ""], [/\baver\b/giu, "a ver"], [/\bhaver\b/giu, "haber"], [/\bporque\s*\?/giu, "por qué"], [/\bdesde\s+que\s+hora\b/giu, "desde qué hora"]] as [RegExp, string][]) {
      if (!good) continue;
      for (const m of text.matchAll(bad)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: "grammar", message: `Quizá quisiste escribir «${good}»` });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const issuesFor = (e: Element, lang: Lang) => (isChecked(e) ? grammarIssues(elementText(e), lang) : []);
