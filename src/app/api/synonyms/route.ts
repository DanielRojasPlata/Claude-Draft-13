import { NextResponse } from "next/server";
import { cleanWord, parseSynonyms, slug } from "@/lib/synonyms";

export const runtime = "nodejs";
const cache = new Map<string, { at: number; senses: ReturnType<typeof parseSynonyms> }>();
const TTL = 24 * 3600 * 1000;

/** Spanish synonyms for one word, looked up on sinonimosonline.com. The host is fixed; only a validated word reaches the URL. */
export async function GET(req: Request) {
  const word = cleanWord(new URL(req.url).searchParams.get("word") ?? "");
  if (!word) return NextResponse.json({ error: "Select a single word." }, { status: 400 });
  const key = slug(word); if (!key) return NextResponse.json({ error: "Select a single word." }, { status: 400 });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ word, senses: hit.senses, source: "https://www.sinonimosonline.com/" + key + "/" });
  try {
    const r = await fetch(`https://www.sinonimosonline.com/${key}/`, { headers: { "user-agent": "Mozilla/5.0 (Guionista screenplay editor)", "accept-language": "es" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (r.status === 404) return NextResponse.json({ word, senses: [], source: "https://www.sinonimosonline.com/" + key + "/" });
    if (!r.ok) throw new Error(String(r.status));
    const senses = parseSynonyms(await r.text());
    cache.set(key, { at: Date.now(), senses });
    return NextResponse.json({ word, senses, source: "https://www.sinonimosonline.com/" + key + "/" });
  } catch {
    return NextResponse.json({ error: "Could not reach sinonimosonline.com. Check your connection." }, { status: 504 });
  }
}
