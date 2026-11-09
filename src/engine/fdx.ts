import { DocMeta, TitleField } from "./meta";
import { normalize } from "./runs";
import { ELEMENT_TYPES, Element, ElementType, Run, elementText } from "./types";

let n = 0;
const id = () => `x${Date.now().toString(36)}${(n++).toString(36)}`;
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TOKEN = /<(\/?)(Paragraph|DualDialogue|Text|TitlePage|Content)\b([^>]*?)(\/?)>|([^<]+)/g;
const attr = (a: string, k: string) => new RegExp(`${k}="([^"]*)"`).exec(a)?.[1];

export interface FdxParsed { elements: Element[]; titlePage: Partial<Record<TitleField, string>> }

/** Regex-free of DOM so it runs identically in tests, the browser, and the server. */
export function parseFdx(xml: string): FdxParsed {
  const els: Element[] = [];
  const titleParas: string[] = [];
  let inTitle = false, dual = 0, para: { type: string; runs: Run[]; dualSide?: 1 | 2 } | null = null;
  let textStyle = "", inText = false;
  let prevWasDialogueGroup = false; // detect group boundaries inside DualDialogue
  const dualCharCount = { v: 0 };
  for (const m of xml.matchAll(TOKEN)) {
    const [, close, tag, attrs, selfClose, txt] = m;
    if (txt !== undefined) { if (inText && para) { para.runs.push({ text: unesc(txt), ...(/Bold/.test(textStyle) ? { bold: true } : {}), ...(/Italic/.test(textStyle) ? { italic: true } : {}), ...(/Underline/.test(textStyle) ? { underline: true } : {}) }); } continue; }
    if (tag === "TitlePage") { inTitle = !close; continue; }
    if (tag === "DualDialogue") { dual = close ? 0 : 1; dualCharCount.v = 0; continue; }
    if (tag === "Text") { if (close) inText = false; else if (!selfClose) { inText = true; textStyle = attr(attrs, "Style") ?? ""; } continue; }
    if (tag === "Paragraph") {
      if (!close) {
        if (selfClose) continue;
        const type = attr(attrs, "Type") ?? "";
        if (!type && !inTitle) continue; // wrapper paragraph around <DualDialogue>
        para = { type, runs: [] };
      } else if (para) {
        const p = para; para = null;
        const text = p.runs.map((r) => r.text).join("");
        if (inTitle) { titleParas.push(text); continue; }
        const type = (ELEMENT_TYPES as readonly string[]).includes(p.type) ? (p.type as ElementType) : "General";
        const e: Element = { id: id(), type, runs: normalize(p.runs) };
        if (dual) { if (type === "Character") dualCharCount.v++; e.dual = dualCharCount.v >= 2 ? 2 : 1; }
        els.push(e);
        prevWasDialogueGroup = type === "Dialogue";
      }
    }
  }
  void prevWasDialogueGroup;
  const tp: FdxParsed["titlePage"] = {};
  const lines = titleParas.map((t) => t.trim()).filter(Boolean);
  if (lines.length) {
    tp.Title = lines[0];
    const bi = lines.findIndex((l, k) => k > 0 && /^((written\s+)?by|escrito\s+por|guion\s+de|gui[oó]n\s+de|por)$/i.test(l));
    if (bi > 0) { tp.Credit = lines[bi]; if (lines[bi + 1]) tp.Author = lines[bi + 1]; tp.Contact = lines.slice(bi + 2).join("\n"); }
    else tp.Contact = lines.slice(1).join("\n");
    if (!tp.Contact) delete tp.Contact;
  }
  return { elements: els.length ? els : [{ id: id(), type: "Scene Heading", runs: [{ text: "" }] }], titlePage: tp };
}

const style = (r: Run) => [r.bold && "Bold", r.italic && "Italic", r.underline && "Underline"].filter(Boolean).join("+");
const para = (e: Element) =>
  `<Paragraph Type="${e.type}">${e.runs.map((r) => `<Text${style(r) ? ` Style="${style(r)}"` : ""}>${esc(r.text)}</Text>`).join("") || "<Text></Text>"}</Paragraph>`;

export function toFdx(els: Element[], meta: Pick<DocMeta, "titlePage">): string {
  const body: string[] = [];
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.dual === 1) {
      let j = i; while (j < els.length && els[j].dual) j++;
      body.push(`<Paragraph><DualDialogue>${els.slice(i, j).map(para).join("")}</DualDialogue></Paragraph>`);
      i = j - 1; continue;
    }
    body.push(para(e));
  }
  const tp = meta.titlePage;
  const tpLines = [tp.Title, tp.Credit, tp.Author, tp.Source, ...(tp.Contact ? tp.Contact.split("\n") : []), tp["Draft Date"], tp.Copyright].filter((x) => x && x.trim());
  const title = tpLines.length ? `<TitlePage><Content>${tpLines.map((t, i) => `<Paragraph Alignment="Center"><Text${i === 0 && t === tp.Title ? ' Style="Bold"' : ""}>${esc(t!)}</Text></Paragraph>`).join("")}</Content></TitlePage>` : "";
  void elementText;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n<Content>\n${body.join("\n")}\n</Content>\n${title}\n</FinalDraft>\n`;
}
