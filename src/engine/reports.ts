import { Page } from "./paginate";
import { sceneList } from "./navigator";
import { Element, elementText } from "./types";

export interface Report { id: string; title: string; columns: string[]; rows: (string | number)[][] }

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const cueName = (t: string) => t.replace(/\(.*?\)/g, "").trim().toUpperCase();
const place = (h: string) => h.replace(/^(INT\.\/EXT\.|INT\/EXT\.|I\/E\.?|INT\.|EXT\.|EST\.)\s*/i, "").replace(/\s+-\s+[^-]*$/, "").trim();

function pageIndex(pages: Page[]) {
  const first = new Map<string, string>(); const lines = new Map<string, number>();
  for (const p of pages) for (const l of p.lines) {
    if (l.synthetic) continue;
    if (!first.has(l.elementId)) first.set(l.elementId, p.label);
    lines.set(l.elementId, (lines.get(l.elementId) ?? 0) + 1);
  }
  return { first, lines };
}

export function buildReports(els: Element[], pages: Page[], linesPerPage = 54): Report[] {
  const { first, lines } = pageIndex(pages);
  const scenes = sceneList(els);

  const sceneRows = scenes.map((s) => {
    const body = els.slice(s.start, s.end);
    const n = body.reduce((a, e) => a + (lines.get(e.id) ?? 0), 0);
    const speakers = [...new Set(body.filter((e) => e.type === "Character").map((e) => cueName(elementText(e))).filter(Boolean))];
    return [s.number, s.heading, first.get(s.id) ?? "", n, `${Math.max(1, Math.round(n / (linesPerPage / 8)))}/8`, speakers.join(", ")];
  });

  interface C { speeches: number; dlines: number; words: number; scenes: Set<number>; first: string; adlib: number }
  const chars = new Map<string, C>();
  let cur: C | null = null;
  scenes.forEach((s) => {
    for (let i = s.start; i < s.end; i++) {
      const e = els[i];
      if (e.type === "Character") {
        const name = cueName(elementText(e)); if (!name) { cur = null; continue; }
        if (!chars.has(name)) chars.set(name, { speeches: 0, dlines: 0, words: 0, scenes: new Set(), first: first.get(e.id) ?? "", adlib: 0 });
        cur = chars.get(name)!; cur.speeches++; cur.scenes.add(s.number);
      } else if (e.type === "Dialogue" && cur) { cur.dlines += lines.get(e.id) ?? 0; cur.words += words(elementText(e)); }
      else if (e.type === "Parenthetical" && cur && /ad[\s-]?lib/i.test(elementText(e))) cur.adlib++;
      else if (e.type !== "Parenthetical" && e.type !== "Dialogue") cur = null;
    }
  });
  const byLines = [...chars.entries()].sort((a, b) => b[1].dlines - a[1].dlines || a[0].localeCompare(b[0]));

  const locs = new Map<string, { scenes: number; pages: Set<string> }>();
  scenes.forEach((s) => {
    const k = place(s.heading) || "(UNKNOWN)";
    const v = locs.get(k) ?? { scenes: 0, pages: new Set() }; v.scenes++; const p = first.get(s.id); if (p) v.pages.add(p); locs.set(k, v);
  });

  const dialogueWords = [...chars.values()].reduce((a, c) => a + c.words, 0);
  const actionWords = els.filter((e) => e.type === "Action").reduce((a, e) => a + words(elementText(e)), 0);
  const totalWords = els.reduce((a, e) => a + words(elementText(e)), 0);

  return [
    { id: "scene", title: "Scene Report", columns: ["#", "Scene", "Page", "Lines", "Length", "Speaking"], rows: sceneRows },
    { id: "character", title: "Character Report", columns: ["Character", "Speeches", "Dialogue lines", "Words", "Ad-libs", "Scenes", "First page"],
      rows: byLines.map(([n, c]) => [n, c.speeches, c.dlines, c.words, c.adlib, c.scenes.size, c.first]) },
    { id: "cast", title: "Cast Report", columns: ["Order", "Character", "First scene", "Scenes", "First page"],
      rows: [...chars.entries()].map(([n, c], i) => [i + 1, n, Math.min(...c.scenes), c.scenes.size, c.first]) },
    { id: "location", title: "Location Report", columns: ["Location", "Scenes", "Pages"],
      rows: [...locs.entries()].sort((a, b) => b[1].scenes - a[1].scenes || a[0].localeCompare(b[0])).map(([n, v]) => [n, v.scenes, [...v.pages].join(", ")]) },
    { id: "script", title: "Script Report", columns: ["Measure", "Value"], rows: [
      ["Pages", pages.length], ["Scenes", scenes.length], ["Speaking characters", chars.size],
      ["Speeches", [...chars.values()].reduce((a, c) => a + c.speeches, 0)], ["Words (total)", totalWords],
      ["Words (dialogue)", dialogueWords], ["Words (action)", actionWords],
      ["Dialogue share", totalWords ? `${Math.round((dialogueWords / totalWords) * 100)}%` : "0%"],
      ["Estimated running time", `${pages.length} min`] ] },
  ];
}

const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const reportCsv = (r: Report) => [r.columns, ...r.rows].map((row) => row.map(esc).join(",")).join("\n");
