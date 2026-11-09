import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ScriptRecord { id: string; title: string; elements: unknown; cursor: unknown; meta: unknown; rev: number; updatedAt: Date }
export interface ScriptSummary { id: string; title: string; updatedAt: Date; count: number; file?: string }
export interface NewScript { title: string; elements: unknown; cursor: unknown; meta?: unknown }
export type SaveResult = { status: "ok"; rev: number } | { status: "conflict"; rev: number } | { status: "missing" };
export interface Store {
  list(userId: string): Promise<ScriptSummary[]>;
  get(userId: string, id: string): Promise<ScriptRecord | null>;
  create(userId: string, data: NewScript): Promise<{ id: string }>;
  save(userId: string, id: string, rev: number, data: { elements: unknown; cursor?: unknown; meta?: unknown }): Promise<SaveResult>;
  rename(userId: string, id: string, title: string): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
  /** The writer's saved page layout for new scripts (null = the original layout). Always re-validated with parseLayout by the caller. */
  getLayoutDefault(userId: string): Promise<unknown | null>;
  setLayoutDefault(userId: string, layout: unknown | null): Promise<void>;
}

export const isDesktop = () => process.env.GUIONISTA_DESKTOP === "1";

// ---------- file store (desktop): one atomic JSON file per script ----------
const SAFE = /^[A-Za-z0-9-]{1,64}$/;
interface FileDoc { id: string; title: string; elements: unknown; cursor: unknown; meta: unknown; rev: number; createdAt: string; updatedAt: string }

export class FileStore implements Store {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private dir: string) {}
  private file(id: string) { if (!SAFE.test(id)) throw new Error("bad id"); return path.join(this.dir, `${id}.json`); }
  private lock<T>(fn: () => Promise<T>): Promise<T> { const r = this.chain.then(fn, fn); this.chain = r.catch(() => undefined); return r; }
  private async read(id: string): Promise<FileDoc | null> {
    try { return JSON.parse(await readFile(this.file(id), "utf8")) as FileDoc; } catch { return null; }
  }
  /**
   * Safety copies: before a save overwrites a script, the previous version is copied to `backups/` (at most one every 5 minutes per
   * script, the newest 15 kept). A deleted script is moved there too, so nothing the writer typed is ever lost to a mistake.
   */
  private async backup(id: string, force = false) {
    try {
      const dir = path.join(this.dir, "backups"); await mkdir(dir, { recursive: true });
      const mine = (await readdir(dir)).filter((f) => f.startsWith(`${id}.`) && f.endsWith(".json")).sort();
      if (!force && mine.length) { const last = await stat(path.join(dir, mine[mine.length - 1])).catch(() => null); if (last && Date.now() - last.mtimeMs < 5 * 60_000) return; }
      await copyFile(this.file(id), path.join(dir, `${id}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
      for (const old of mine.slice(0, Math.max(0, mine.length + 1 - 15))) await unlink(path.join(dir, old)).catch(() => undefined);
    } catch { /* a failed safety copy must never block saving */ }
  }
  private async write(d: FileDoc) {
    await mkdir(this.dir, { recursive: true });
    const f = this.file(d.id); const tmp = `${f}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(d), "utf8"); await rename(tmp, f);
  }
  private rec(d: FileDoc): ScriptRecord { return { id: d.id, title: d.title, elements: d.elements, cursor: d.cursor, meta: d.meta, rev: d.rev, updatedAt: new Date(d.updatedAt) }; }
  async list() {
    await mkdir(this.dir, { recursive: true });
    const out: ScriptSummary[] = [];
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith(".json")) continue;
      const d = await this.read(f.slice(0, -5)); if (!d) continue;
      out.push({ id: d.id, title: d.title, updatedAt: new Date(d.updatedAt), count: Array.isArray(d.elements) ? d.elements.length : 0, file: typeof (d.meta as { file?: unknown } | null)?.file === "string" ? (d.meta as { file: string }).file : "" });
    }
    return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async get(_u: string, id: string) { if (!SAFE.test(id)) return null; const d = await this.read(id); return d ? this.rec(d) : null; }
  create(_u: string, data: NewScript) {
    return this.lock(async () => {
      const now = new Date().toISOString(); const id = randomUUID();
      await this.write({ id, title: data.title, elements: data.elements, cursor: data.cursor, meta: data.meta ?? null, rev: 0, createdAt: now, updatedAt: now });
      return { id };
    });
  }
  save(_u: string, id: string, rev: number, data: { elements: unknown; cursor?: unknown; meta?: unknown }) {
    return this.lock(async (): Promise<SaveResult> => {
      if (!SAFE.test(id)) return { status: "missing" };
      const d = await this.read(id); if (!d) return { status: "missing" };
      if (d.rev !== rev) return { status: "conflict", rev: d.rev };
      await this.backup(id);
      d.elements = data.elements; if (data.cursor !== undefined) d.cursor = data.cursor; if (data.meta !== undefined) d.meta = data.meta;
      d.rev++; d.updatedAt = new Date().toISOString();
      await this.write(d); return { status: "ok", rev: d.rev };
    });
  }
  rename(_u: string, id: string, title: string) {
    return this.lock(async () => { const d = SAFE.test(id) ? await this.read(id) : null; if (d) { d.title = title; d.updatedAt = new Date().toISOString(); await this.write(d); } });
  }
  remove(_u: string, id: string) { return this.lock(async () => { if (SAFE.test(id)) { await this.backup(id, true); await unlink(this.file(id)).catch(() => undefined); } }); }
  // not a .json file, so it never shows up in the list of scripts
  private get layoutFile() { return path.join(this.dir, "layout-default.cfg"); }
  async getLayoutDefault() { try { return JSON.parse(await readFile(this.layoutFile, "utf8")) as unknown; } catch { return null; } }
  setLayoutDefault(_u: string, layout: unknown | null) {
    return this.lock(async () => {
      if (layout == null) { await unlink(this.layoutFile).catch(() => undefined); return; }
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.layoutFile}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(layout), "utf8"); await rename(tmp, this.layoutFile);
    });
  }
}

let cached: Store | undefined;
export async function getStore(): Promise<Store> {
  if (cached) return cached;
  if (isDesktop()) {
    const s = new FileStore(process.env.GUIONISTA_DATA || path.join(process.cwd(), ".data"));
    const { seedDesktop } = await import("./seed-desktop");
    await seedDesktop(s);
    return (cached = s);
  }
  const { PrismaStore } = await import("./prisma-store");
  return (cached = new PrismaStore());
}
