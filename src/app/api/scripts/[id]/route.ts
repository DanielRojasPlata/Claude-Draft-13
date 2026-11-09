import { NextResponse } from "next/server";
import { parseMeta } from "@/engine/meta";
import { currentUserId } from "@/lib/session";
import { MAX_BYTES, parseElements } from "@/lib/scripts";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { elements?: unknown; cursor?: { id?: unknown; offset?: unknown }; rev?: unknown; meta?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const elements = parseElements(body.elements);
  if (!elements || typeof body.rev !== "number" || !Number.isInteger(body.rev)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const c = body.cursor;
  const cursor = c && typeof c.id === "string" && typeof c.offset === "number" ? { id: c.id, offset: c.offset } : undefined;
  const meta = body.meta === undefined ? undefined : parseMeta(body.meta);
  const r = await (await getStore()).save(userId, id, body.rev, { elements, cursor, meta });
  if (r.status === "ok") return NextResponse.json({ rev: r.rev });
  if (r.status === "conflict") return NextResponse.json({ error: "conflict", rev: r.rev }, { status: 409 });
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
