import { DocMeta, TITLE_FIELDS, TitleField } from "./meta";
import { normalize, plain } from "./runs";
import { Element, ElementType, Run, elementText } from "./types";

let n = 0;
const id = () => `f${Date.now().toString(36)}${(n++).toString(36)}`;
const mk = (type: ElementType, runs: Run[], extra: Partial<Element> = {}): Element => ({ id: id(), type, runs: normalize(runs), ...extra });

/** Inline emphasis: ***bold italic***, **bold**, *italic*, _underline_. */
export function parseInline(s: string): Run[] {
  const runs: Run[] = []; const st = { b: false, i: false, u: false }; let buf = "";
  const flush = () => { if (buf) { runs.push({ text: buf, ...(st.b ? { bold: true } : {}), ...(st.i ? { italic: true } : {}), ...(st.u ? { underline: true } : {}) }); buf = ""; } };
  for (let k = 0; k < s.length; k++) {
    if (s[k] === "\\" && k + 1 < s.length) { buf += s[++k]; continue; }
    if (s.startsWith("***", k)) { flush(); st.b = !st.b; st.i = !st.i; k += 2; }
    else if (s.startsWith("**", k)) { flush(); st.b = !st.b; k += 1; }
    else if (s[k] === "*") { flush(); st.i = !st.i; }
    else if (s[k] === "_") { flush(); st.u = !st.u; }
    else buf += s[k];
  }
  flush();
  return runs.length ? runs : plain("");
}

export function inlineToFountain(runs: Run[]): string {
  return runs.map((r) => {
    let t = r.text;
    if (!t) return "";
    if (r.underline) t = `_${t}_`;
    if (r.bold && r.italic) t = `***${t}***`; else if (r.bold) t = `**${t}**`; else if (r.italic) t = `*${t}*`;
    return t;
  }).join("");
}

const SCENE = /^(INT|EXT|EST|INT\.?\/EXT|INT\/EXT|I\/E)[. ]/i;
const NOTE_MARK = "\u0001NOTE:";
const keepBlockNotes = (s: string) => s.replace(/^[ \t]*\[\[([^\]\n]*)\]\][ \t]*$/gm, (_m, t: string) => NOTE_MARK + t);
const stripNotes = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\[\[[\s\S]*?\]\]/g, "");

export interface Parsed { elements: Element[]; titlePage: Partial<Record<TitleField, string>> }

export function parseFountain(source: string): Parsed {
  const text = stripNotes(keepBlockNotes(source.replace(/\r\n?/g, "\n"))).replace(/^﻿/, "");
  const titlePage: Parsed["titlePage"] = {};
  let body = text;
  const tm = /^((?:[A-Za-z ]+:[^\n]*(?:\n(?:[ \t]+[^\n]*))*\n?)+)(?:\n|$)/.exec(text);
  if (tm && /^(title|credit|author|authors|source|draft date|contact|copyright)\s*:/i.test(tm[1])) {
    body = text.slice(tm[0].length);
    let key = "";
    for (const line of tm[1].split("\n")) {
      const km = /^([A-Za-z ]+):\s*(.*)$/.exec(line);
      if (km && !/^[ \t]/.test(line)) { key = km[1].trim().toLowerCase(); put(key, km[2]); } else if (key && line.trim()) put(key, line.trim(), true);
    }
    function put(k: string, v: string, more = false) {
      const f = ({ title: "Title", credit: "Credit", author: "Author", authors: "Author", source: "Source", "draft date": "Draft Date", contact: "Contact", copyright: "Copyright" } as Record<string, TitleField>)[k];
      if (f) titlePage[f] = more ? `${titlePage[f] ?? ""}\n${v}` : v;
    }
  }
  const lines = body.split("\n");
  const els: Element[] = [];
  let i = 0;
  const blank = (k: number) => k < 0 || k >= lines.length || !lines[k].trim();
  let dualPrev = false;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const t = line.trim();
    if (t.startsWith(NOTE_MARK)) { els.push(mk("Note", plain(t.slice(NOTE_MARK.length).trim()))); i++; continue; }
    if (/^#{1,6}\s/.test(t)) { i++; continue; } // sections
    if (t.startsWith("=") && !t.startsWith("===")) { els.push(mk("Summary", parseInline(t.slice(1).trim()))); i++; continue; } // synopsis
    if (/^={3,}$/.test(t)) { els.push(mk("Action", plain(""), { breakBefore: true })); i++; continue; }
    if (t.startsWith(".") && !t.startsWith("..")) { els.push(mk("Scene Heading", plain(t.slice(1).replace(/\s*#[^#]+#\s*$/, "")))); i++; continue; }
    if (SCENE.test(t) && blank(i - 1) && !blank(i + 1)) { els.push(mk("Scene Heading", plain(t.replace(/\s*#[^#]+#\s*$/, "")))); i++; continue; }
    if (SCENE.test(t) && blank(i - 1)) { els.push(mk("Scene Heading", plain(t.replace(/\s*#[^#]+#\s*$/, "")))); i++; continue; }
    if (t.startsWith(">") && !t.endsWith("<")) { els.push(mk("Transition", plain(t.slice(1).trim()))); i++; continue; }
    if (/^[A-Z0-9 .,'\-]+TO:$/.test(t) && blank(i - 1)) { els.push(mk("Transition", plain(t))); i++; continue; }
    const forcedChar = t.startsWith("@");
    const charTxt = forcedChar ? t.slice(1) : t;
    const cm = /^([^a-z\n]*?[A-Z][^a-z\n]*?)(\s*\([^)]*\))?(\s*\^)?$/.exec(charTxt);
    if ((forcedChar || (cm && blank(i - 1) && !blank(i + 1) && /[A-Z]/.test(charTxt) && !/^\(/.test(charTxt)))) {
      const dual = /\^\s*$/.test(charTxt);
      const name = charTxt.replace(/\s*\^\s*$/, "");
      const group: Element[] = [mk("Character", plain(name))];
      i++;
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i].trim();
        group.push(mk(/^\(.*\)$/.test(l) ? "Parenthetical" : "Dialogue", parseInline(l)));
        i++;
      }
      if (dual && els.length) {
        // pair with the preceding dialogue group
        let a = els.length - 1; while (a > 0 && els[a].type !== "Character") a--;
        if (els[a]?.type === "Character") { for (let k = a; k < els.length; k++) els[k] = { ...els[k], dual: 1 }; group.forEach((g) => (g.dual = 2)); }
      }
      els.push(...group); dualPrev = dual;
      continue;
    }
    // action (preserve intentional line breaks inside the block)
    const block: string[] = [];
    while (i < lines.length && lines[i].trim()) { block.push(lines[i].replace(/^!/, "").replace(/\s+$/, "")); i++; }
    const centered = block.length === 1 && /^>.*<$/.test(block[0].trim());
    const inner = centered ? block[0].trim().slice(1, -1).trim() : "";
    if (centered && inner && inner === inner.toLocaleUpperCase()) els.push(mk("End of Act", plain(inner)));
    else els.push(mk("Action", parseInline(centered ? inner : block.join("\n"))));
  }
  void dualPrev;
  return { elements: els.length ? els : [mk("Scene Heading", plain(""))], titlePage };
}

export function toFountain(els: Element[], meta: Pick<DocMeta, "titlePage">): string {
  const out: string[] = [];
  const tp = meta.titlePage;
  const keys: [TitleField, string][] = [["Title", "Title"], ["Credit", "Credit"], ["Author", "Author"], ["Source", "Source"], ["Draft Date", "Draft date"], ["Contact", "Contact"], ["Copyright", "Copyright"]];
  const head = keys.filter(([k]) => tp[k]?.trim()).map(([k, label]) => `${label}: ${tp[k].replace(/\n/g, "\n    ")}`);
  if (head.length) out.push(head.join("\n"), "");
  els.forEach((e, i) => {
    const t = inlineToFountain(e.runs);
    if (e.breakBefore) out.push("===", "");
    switch (e.type) {
      case "Scene Heading": out.push(SCENE.test(t) ? t.toUpperCase() : `.${t.toUpperCase()}`, ""); break;
      case "Character": {
        const name = t.toUpperCase(); const forced = t !== t.toUpperCase() ? "@" + t : name;
        const isSecondDual = e.dual === 2 && els[i - 1]?.dual !== 2;
        out.push(forced + (isSecondDual ? " ^" : "")); break;
      }
      case "Parenthetical": out.push(t.startsWith("(") ? t : `(${t})`); break;
      case "Dialogue": { out.push(t); const nx = els[i + 1]; if (!nx || nx.type !== "Dialogue" && nx.type !== "Parenthetical") out.push(""); break; }
      case "Transition": out.push(t.toUpperCase().endsWith("TO:") ? t.toUpperCase() : `> ${t.toUpperCase()}`, ""); break;
      case "Shot": out.push(`!${t.toUpperCase()}`, ""); break;
      case "Summary": out.push(`= ${t}`, ""); break;
      case "Note": out.push(`[[${t}]]`, ""); break;
      case "End of Act": out.push(`> ${t.toUpperCase()} <`, ""); break;
      default: out.push(t.split("\n").map((l, k) => (k === 0 && /^[.@>!~=#]/.test(l) || (k === 0 && l === l.toUpperCase() && /[A-Z]/.test(l)) ? "!" + l : l)).join("\n"), "");
    }
  });
  void elementText;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export { TITLE_FIELDS };
