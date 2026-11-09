import { db } from "./db";
import { toJson } from "./scripts";
import type { NewScript, SaveResult, ScriptRecord, ScriptSummary, Store } from "./store";

export class PrismaStore implements Store {
  async list(userId: string): Promise<ScriptSummary[]> {
    const rows = await db.script.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, updatedAt: true, elements: true, meta: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt, count: Array.isArray(r.elements) ? r.elements.length : 0, file: typeof (r.meta as { file?: unknown } | null)?.file === "string" ? (r.meta as { file: string }).file : "" }));
  }
  async get(userId: string, id: string): Promise<ScriptRecord | null> {
    const r = await db.script.findFirst({ where: { id, userId } });
    return r && { id: r.id, title: r.title, elements: r.elements, cursor: r.cursor, meta: r.meta, rev: r.rev, updatedAt: r.updatedAt };
  }
  async create(userId: string, d: NewScript) {
    const s = await db.script.create({ data: { userId, title: d.title, elements: toJson(d.elements), cursor: toJson(d.cursor), meta: d.meta == null ? undefined : toJson(d.meta) } });
    return { id: s.id };
  }
  async save(userId: string, id: string, rev: number, d: { elements: unknown; cursor?: unknown; meta?: unknown }): Promise<SaveResult> {
    const r = await db.script.updateMany({
      where: { id, userId, rev },
      data: { elements: toJson(d.elements), cursor: d.cursor === undefined ? undefined : toJson(d.cursor), meta: d.meta === undefined ? undefined : toJson(d.meta), rev: { increment: 1 } },
    });
    if (r.count === 1) return { status: "ok", rev: rev + 1 };
    const cur = await db.script.findFirst({ where: { id, userId }, select: { rev: true } });
    return cur ? { status: "conflict", rev: cur.rev } : { status: "missing" };
  }
  async rename(userId: string, id: string, title: string) { await db.script.updateMany({ where: { id, userId }, data: { title } }); }
  async remove(userId: string, id: string) { await db.script.deleteMany({ where: { id, userId } }); }
  async getLayoutDefault(userId: string) { return (await db.user.findUnique({ where: { id: userId }, select: { layoutDefault: true } }))?.layoutDefault ?? null; }
  async setLayoutDefault(userId: string, layout: unknown | null) {
    const { Prisma } = await import("@prisma/client");
    await db.user.updateMany({ where: { id: userId }, data: { layoutDefault: layout == null ? Prisma.DbNull : toJson(layout) } });
  }
}
