import { DocMeta, TitleField } from "./meta";
import { normalize } from "./runs";
import { ELEMENT_TYPES, Element, ElementType, Run, elementText } from "./types";

let n = 0;
const id = () => `x${Date.now().toString(36)}${(n++).toString(36)}`;
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_m, d: string) => String.fromCodePoint(parseInt(d, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal XML tree: Final Draft nests <Paragraph>s inside a paragraph (SceneProperties, ScriptNote, ...), so a flat scan loses the real text. */
interface XNode { tag: string; attrs: string; kids: (XNode | string)[] }
const XTOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!(?!--|\[CDATA\[)[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
const attr = (a: string, k: string) => new RegExp(`(?:^|\\s)${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(a)?.slice(1).find((v) => v !== undefined);

function parseXml(xml: string): XNode {
  const root: XNode = { tag: "#root", attrs: "", kids: [] };
  const stack: XNode[] = [root];
  for (const m of xml.replace(/^\uFEFF/, "").matchAll(XTOKEN)) {
    const [, cdata, close, tag, attrs, selfClose, txt] = m;
    const top = stack[stack.length - 1];
    if (cdata !== undefined) { top.kids.push(cdata); continue; }
    if (txt !== undefined) { top.kids.push(unesc(txt)); continue; }
    if (!tag) continue;
    if (close) { // pop to the matching tag; tolerate stray closers
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const node: XNode = { tag, attrs, kids: [] };
    top.kids.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}
const children = (n: XNode, tag: string) => n.kids.filter((k): k is XNode => typeof k !== "string" && k.tag === tag);
const find = (n: XNode, tag: string): XNode | undefined => { for (const k of n.kids) if (typeof k !== "string") { if (k.tag === tag) return k; const f = find(k, tag); if (f) return f; } return undefined; };

/** Final Draft paragraph types -> ours. Anything unknown is kept as General so no text is dropped. */
const TYPE_MAP: Record<string, ElementType> = { "new act": "End of Act", "end of act": "End of Act", "show/episode": "General", "cast list": "General", panel: "Action", "lyric": "Dialogue" };
function mapType(t: string): ElementType {
  const exact = (ELEMENT_TYPES as readonly string[]).find((x) => x.toLowerCase() === t.trim().toLowerCase());
  if (exact) return exact as ElementType;
  const k = t.trim().toLowerCase();
  if (TYPE_MAP[k]) return TYPE_MAP[k];
  if (/^outline\b/.test(k)) return "Summary";
  if (!k) return "Action"; // Final Draft's default when Type is missing
  return "General";
}

/** Runs from the paragraph's OWN <Text> children (never from nested notes / scene properties). */
function runsOf(p: XNode): Run[] {
  const runs: Run[] = [];
  for (const t of children(p, "Text")) {
    const st = attr(t.attrs, "Style") ?? "";
    let text = t.kids.map((k) => (typeof k === "string" ? k : "")).join("").replace(/\r\n?/g, "\n");
    if (/AllCaps/.test(st)) text = text.toUpperCase();
    runs.push({ text, ...(/Bold/.test(st) ? { bold: true } : {}), ...(/Italic/.test(st) ? { italic: true } : {}), ...(/Underline/.test(st) ? { underline: true } : {}) });
  }
  return runs;
}

export interface FdxParsed { elements: Element[]; titlePage: Partial<Record<TitleField, string>> }

export function parseFdx(xml: string): FdxParsed {
  const root = parseXml(xml);
  const fd = find(root, "FinalDraft") ?? root;
  const els: Element[] = [];
  const add = (p: XNode, dual?: 1 | 2) => {
    const runs = normalize(runsOf(p));
    const e: Element = { id: id(), type: mapType(attr(p.attrs, "Type") ?? ""), runs: runs.length ? runs : [{ text: "" }] };
    if (dual) e.dual = dual;
    els.push(e);
  };
  const body = children(fd, "Content")[0];
  const walk = (n: XNode) => {
    for (const p of children(n, "Paragraph")) {
      const dd = children(p, "DualDialogue")[0];
      if (dd) {
        let chars = 0;
        for (const q of children(dd, "Paragraph")) {
          const type = mapType(attr(q.attrs, "Type") ?? "");
          if (type === "Character") chars++;
          add(q, chars >= 2 ? 2 : 1);
        }
        continue;
      }
      add(p);
    }
  };
  if (body) walk(body);

  const titleParas: string[] = [];
  const tpNode = find(fd, "TitlePage");
  const tpc = tpNode && (children(tpNode, "Content")[0] ?? tpNode);
  if (tpc) for (const p of children(tpc, "Paragraph")) titleParas.push(runsOf(p).map((r) => r.text).join(""));
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
  const tpLines = [tp.Title, tp.Credit, tp.Author?.toUpperCase(), tp.Source, ...(tp.Contact ? tp.Contact.split("\n") : []), tp["Draft Date"], tp.Copyright].filter((x) => x && x.trim());
  const title = tpLines.length ? `<TitlePage><Content>${tpLines.map((t, i) => `<Paragraph Alignment="Center"><Text${i === 0 && t === tp.Title ? ' Style="Bold"' : ""}>${esc(t!)}</Text></Paragraph>`).join("")}</Content></TitlePage>` : "";
  void elementText;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n<Content>\n${body.join("\n")}\n</Content>\n${title}\n</FinalDraft>\n`;
}
