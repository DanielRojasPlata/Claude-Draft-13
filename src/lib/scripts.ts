import { DocState } from "@/engine/doc";
import { ELEMENT_TYPES, Element } from "@/engine/types";

export const MAX_BYTES = 8 * 1024 * 1024;

/** Strict validation of untrusted element JSON. Returns null when malformed. */
export function parseElements(v: unknown): Element[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 50000) return null;
  const seen = new Set<string>();
  const out: Element[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") return null;
    const { id, type, runs, dual, rev, breakBefore } = e as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64 || seen.has(id)) return null;
    if (typeof type !== "string" || !(ELEMENT_TYPES as readonly string[]).includes(type)) return null;
    if (!Array.isArray(runs) || runs.length > 200) return null;
    const rs = [];
    for (const r of runs) {
      if (!r || typeof r !== "object" || typeof (r as { text?: unknown }).text !== "string") return null;
      const q = r as { text: string; bold?: unknown; italic?: unknown; underline?: unknown };
      rs.push({ text: q.text, ...(q.bold === true ? { bold: true } : {}), ...(q.italic === true ? { italic: true } : {}), ...(q.underline === true ? { underline: true } : {}) });
    }
    seen.add(id);
    out.push({
      id, type: type as Element["type"], runs: rs,
      ...(dual === 1 || dual === 2 ? { dual } : {}),
      ...(typeof rev === "number" && Number.isInteger(rev) && rev > 0 && rev < 9 ? { rev } : {}),
      ...(breakBefore === true ? { breakBefore: true } : {}),
    });
  }
  return out;
}

export function docFromRow(elements: unknown, cursor: unknown): DocState | null {
  const els = parseElements(elements);
  if (!els) return null;
  const c = cursor as { id?: unknown; offset?: unknown } | null;
  const ok = c && typeof c.id === "string" && typeof c.offset === "number" && els.some((e) => e.id === c.id);
  return { elements: els, cursor: ok ? { id: c.id as string, offset: Math.max(0, c.offset as number) } : { id: els[0].id, offset: 0 } };
}

/** Our validated plain-JSON structures are safe for Prisma Json columns; interfaces lack index signatures. */
export const toJson = (v: unknown) => v as import("@prisma/client").Prisma.InputJsonValue;

export const cleanTitle = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "") || "Untitled Screenplay";
