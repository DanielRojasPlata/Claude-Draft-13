import { parseFdx } from "@/engine/fdx";
import { parseFountain } from "@/engine/fountain";
import { defaultMeta, parseMeta } from "@/engine/meta";
import { parseElements } from "@/lib/scripts";

declare global { interface Window { guionista?: GuionistaBridge } }
export interface GuionistaBridge {
  exportPdf: (id: string, title: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  print: (id: string) => Promise<{ ok: boolean }>;
  setFullScreen?: (on: boolean) => Promise<unknown>;
  saveFdx: (o: { path?: string; title: string; xml: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveFdxAs: (o: { title: string; xml: string }) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  chooseFolder: () => Promise<{ ok: boolean; folder?: string; canceled?: boolean }>;
  getFolder: () => Promise<{ folder: string }>;
  reveal: (p: string) => Promise<boolean>;
  openFile: () => Promise<{ ok: true; path: string; name: string; text: string } | { ok: false; canceled?: boolean; error?: string }>;
  /** Show a script in its own window (or bring the window that already shows it to the front). `handled: false` means "navigate here instead". */
  openScript: (id: string, inNewWindow: boolean) => Promise<{ handled: boolean; focused?: boolean }>;
  openWelcome: () => Promise<boolean>;
  ai: {
    show: (provider: string, b: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
    hide: () => Promise<boolean>;
    reload: (provider: string) => Promise<boolean>;
    paste: () => Promise<boolean>;
    external: (provider: string) => Promise<boolean>;
  };
}

export const IMPORT_ACCEPT = ".fdx,.xml,.fountain,.txt,.spmd,.json";
const MAX = 6 * 1024 * 1024;

/** Parses screenplay text (.fdx, .fountain/.txt, or a Guionista backup .json) and saves it as a new script. `filePath` links it to the .fdx it came from. */
export async function importTextToScript(name: string, text: string, filePath?: string): Promise<{ id: string; title: string }> {
  if (text.length > MAX) throw new Error("That file is larger than 6 MB.");
  const base = name.replace(/\.[^.]+$/, "").trim() || "Imported Screenplay";
  let elements, title = base, meta = defaultMeta(base), newScript = true;
  const head = text.slice(0, 4000);
  if (/\.json$/i.test(name) || /^\s*\{/.test(head)) {
    const j = JSON.parse(text) as { title?: unknown; elements?: unknown; meta?: unknown };
    elements = parseElements(j.elements);
    if (!elements) throw new Error("That JSON file is not a Guionista backup.");
    title = typeof j.title === "string" && j.title.trim() ? j.title.trim().slice(0, 120) : base; meta = parseMeta(j.meta, title); newScript = false;
  } else {
    const isFdx = /\.(fdx|xml)$/i.test(name) || /<FinalDraft[\s>]/i.test(head);
    if (isFdx && !/<(Paragraph|Content)[\s>]/i.test(text)) throw new Error("That XML file has no screenplay content (expected a Final Draft .fdx).");
    const p = isFdx ? parseFdx(text) : parseFountain(text);
    elements = p.elements;
    title = (p.titlePage.Title ?? base).trim().slice(0, 120) || base;
    meta = defaultMeta(title); Object.assign(meta.titlePage, p.titlePage, { Title: title });
    if (isFdx && filePath && /\.fdx$/i.test(filePath)) meta.file = filePath; // Save will write back to this very file
  }
  const r = await fetch("/api/scripts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, elements, meta, newScript }) });
  if (!r.ok) throw new Error(r.status === 413 ? "That script is too large to open." : "The script could not be saved.");
  return { id: ((await r.json()) as { id: string }).id, title };
}

export async function importFileToScript(f: File): Promise<{ id: string; title: string }> {
  if (f.size > MAX) throw new Error("That file is larger than 6 MB.");
  return importTextToScript(f.name, await f.text());
}

/** Desktop: choose a file with the native dialog. A script already linked to that .fdx is simply opened again. */
export async function openNative(): Promise<{ id: string; title: string; existing?: boolean } | null> {
  const g = window.guionista; if (!g) return null;
  const r = await g.openFile();
  if (!r.ok) { if (r.canceled) return null; throw new Error(r.error || "That file could not be opened."); }
  if (/\.fdx$/i.test(r.path)) {
    const list = await fetch("/api/scripts").then((x) => (x.ok ? x.json() : null)).catch(() => null) as { scripts: { id: string; title: string; file?: string }[] } | null;
    const hit = list?.scripts.find((x) => x.file && x.file.toLowerCase() === r.path.toLowerCase());
    if (hit) return { id: hit.id, title: hit.title, existing: true };
  }
  return importTextToScript(r.name, r.text, r.path);
}

/** Open a script: desktop shows it in its own window (an editor window never gets replaced); the browser navigates. */
export async function showScript(id: string, push: (url: string) => void, inNewWindow: boolean) {
  const g = window.guionista;
  if (g?.openScript) { const r = await g.openScript(id, inNewWindow); if (r.handled) return; }
  push(`/scripts/${id}`);
}
/** "New": the welcome page with the template gallery, in a window of its own on desktop. */
export async function showWelcome(push: (url: string) => void) {
  if (window.guionista?.openWelcome && (await window.guionista.openWelcome())) return;
  push("/");
}
