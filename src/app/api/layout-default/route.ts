import { NextResponse } from "next/server";
import { parseLayout } from "@/engine/layout";
import { currentUserId } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The writer's saved page layout for new scripts (Page Layout > Save as default). `layout: null` means the original layout. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await (await getStore()).getLayoutDefault(userId);
  return NextResponse.json({ layout: raw == null ? null : parseLayout(raw) });
}

export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: { layout?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body.layout || typeof body.layout !== "object") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const layout = parseLayout(body.layout);
  await (await getStore()).setLayoutDefault(userId, layout);
  return NextResponse.json({ layout });
}

/** Forget the saved default: new scripts use the original layout again. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await (await getStore()).setLayoutDefault(userId, null);
  return NextResponse.json({ layout: null });
}
