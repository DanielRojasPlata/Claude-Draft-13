import { NextResponse } from "next/server";
import { parseLayout } from "@/engine/layout";
import { parseMeta } from "@/engine/meta";
import { currentUserId } from "@/lib/session";
import { cleanTitle, MAX_BYTES, parseElements } from "@/lib/scripts";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Create a script from imported content (.fountain / .fdx parsed on the client). */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { title?: unknown; elements?: unknown; meta?: unknown; newScript?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const elements = parseElements(body.elements);
  if (!elements) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const title = cleanTitle(body.title);
  const meta = parseMeta(body.meta, title);
  const store = await getStore();
  // a brand-new script (template or imported screenplay) starts with the layout the writer saved as their default; a backup keeps its own
  if (body.newScript === true) { const saved = await store.getLayoutDefault(userId).catch(() => null); if (saved) meta.layout = parseLayout(saved); }
  const { id } = await store.create(userId, { title, elements, cursor: { id: elements[0].id, offset: 0 }, meta });
  return NextResponse.json({ id });
}

/** Recent scripts, newest first (for Open / Open Recent). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await (await getStore()).list(userId);
  return NextResponse.json({ scripts: rows.slice(0, 50).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt, count: r.count, file: r.file ?? "" })) });
}
