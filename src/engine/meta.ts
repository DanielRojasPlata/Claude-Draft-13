import { defaultSmartType, parseSmartType, SmartTypeConfig } from "./smarttype";
import { DEFAULT_LAYOUT, PageLayout, parseLayout } from "./layout";

export type Lang = "es" | "en";

export const REVISION_COLORS = [
  { name: "White", hex: "#ffffff" }, { name: "Blue", hex: "#cfe3ff" }, { name: "Pink", hex: "#ffd4e5" },
  { name: "Yellow", hex: "#fff6a8" }, { name: "Green", hex: "#d2f5d0" }, { name: "Goldenrod", hex: "#f0d27a" },
  { name: "Buff", hex: "#ecd9b5" }, { name: "Salmon", hex: "#ffc4b0" }, { name: "Cherry", hex: "#f5a3b0" },
] as const;

export const TITLE_FIELDS = ["Title", "Credit", "Author", "Source", "Contact", "Draft Date", "Copyright"] as const;
export type TitleField = (typeof TITLE_FIELDS)[number];
export type ViewMode = "day" | "night" | "midnight";

export interface LockEntry { id: string; label: string }
export interface DocMeta {
  titlePage: Record<TitleField, string>;
  header: string; footer: string; watermark: string;
  sceneNumbers: boolean; mores: boolean;
  /** target screen time in minutes (0 = no target) */
  targetMinutes: number;
  view: ViewMode;
  smartType: SmartTypeConfig;
  /** script language: drives SmartType lists, (MORE)/(CONT.), and the spelling and grammar checker */
  language: Lang;
  /** page size, margins, font, spacing (Document > Page Layout) */
  layout: PageLayout;
  /** desktop only: the .fdx file this script is saved to */
  file: string;
  spell: { enabled: boolean; ignore: string[] };
  revision: { active: boolean; pass: number; date: string; locked: LockEntry[] | null };
}
export const defaultMeta = (title = ""): DocMeta => ({
  titlePage: { Title: title, Credit: "Escrito por", Author: "", Source: "", Contact: "", "Draft Date": "", Copyright: "" },
  header: "", footer: "", watermark: "", sceneNumbers: false, mores: true, targetMinutes: 90, view: "day", smartType: defaultSmartType(), language: "es", layout: { ...DEFAULT_LAYOUT }, file: "", spell: { enabled: true, ignore: [] },
  revision: { active: false, pass: 1, date: "", locked: null },
});

const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);
/** Defensive merge of untrusted stored/received meta over defaults. */
export function parseMeta(v: unknown, title = ""): DocMeta {
  const d = defaultMeta(title);
  if (!v || typeof v !== "object") return d;
  const m = v as Record<string, unknown>;
  const tp = (m.titlePage ?? {}) as Record<string, unknown>;
  for (const k of TITLE_FIELDS) d.titlePage[k] = str(tp[k], 2000, d.titlePage[k]);
  d.header = str(m.header, 120); d.footer = str(m.footer, 120); d.watermark = str(m.watermark, 40);
  d.targetMinutes = typeof m.targetMinutes === "number" && m.targetMinutes >= 0 && m.targetMinutes <= 600 ? Math.round(m.targetMinutes) : 90;
  d.sceneNumbers = m.sceneNumbers === true; d.mores = m.mores !== false;
  d.view = m.view === "night" || m.view === "midnight" ? m.view : "day";
  d.smartType = parseSmartType(m.smartType);
  d.language = m.language === "en" ? "en" : "es";
  d.layout = parseLayout(m.layout);
  d.file = typeof m.file === "string" ? m.file.slice(0, 600) : "";
  const sp = (m.spell ?? {}) as Record<string, unknown>;
  d.spell = { enabled: sp.enabled !== false, ignore: Array.isArray(sp.ignore) ? sp.ignore.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 2000) : [] };
  const r = (m.revision ?? {}) as Record<string, unknown>;
  d.revision.active = r.active === true;
  d.revision.pass = typeof r.pass === "number" && r.pass >= 1 && r.pass < REVISION_COLORS.length ? Math.floor(r.pass) : 1;
  d.revision.date = str(r.date, 20);
  if (Array.isArray(r.locked)) {
    d.revision.locked = r.locked.filter((x): x is LockEntry => !!x && typeof (x as LockEntry).id === "string" && typeof (x as LockEntry).label === "string").slice(0, 5000)
      .map((x) => ({ id: x.id.slice(0, 64), label: x.label.slice(0, 8) }));
  }
  return d;
}
