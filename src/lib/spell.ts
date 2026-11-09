"use client";
import type { Lang } from "@/engine/meta";

/** Client side of the spelling checker: a worker with the Hunspell dictionary, plus a cache of words already judged. */
export class SpellService {
  private worker: Worker | null = null;
  private seen = new Set<string>();
  private bad = new Set<string>();
  private pending = new Map<number, (list: string[]) => void>();
  private next = 1;
  ready = false;
  lang: Lang | null = null;
  version = 0;
  constructor(private onChange: () => void) {}

  setLanguage(lang: Lang) {
    if (this.lang === lang) return;
    this.lang = lang; this.ready = false; this.seen.clear(); this.bad.clear(); this.version++;
    this.worker ??= this.start();
    this.worker.postMessage({ t: "init", lang });
    this.onChange();
  }
  private start() {
    const w = new Worker(new URL("./spell.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { t: string; id?: number; lang?: string; words?: string[]; bad?: string[]; list?: string[] };
      if (m.t === "ready" && m.lang === this.lang) { this.ready = true; this.version++; this.onChange(); }
      else if (m.t === "checked" && m.words) { const b = new Set(m.bad); for (const x of m.words) { this.seen.add(x); if (b.has(x)) this.bad.add(x); } this.version++; this.onChange(); }
      else if (m.t === "suggestions" && m.id !== undefined) { this.pending.get(m.id)?.(m.list ?? []); this.pending.delete(m.id); }
    };
    return w;
  }
  /** Send words not judged yet; results arrive asynchronously and bump `version`. */
  request(words: Iterable<string>) {
    if (!this.worker || !this.ready) return;
    const fresh: string[] = [];
    for (const w of words) if (!this.seen.has(w)) { this.seen.add(w); fresh.push(w); }
    for (let i = 0; i < fresh.length; i += 2000) this.worker.postMessage({ t: "check", id: this.next++, words: fresh.slice(i, i + 2000) });
  }
  isBad = (w: string) => this.bad.has(w);
  suggest(word: string): Promise<string[]> {
    if (!this.worker || !this.ready) return Promise.resolve([]);
    const id = this.next++;
    return new Promise((res) => { this.pending.set(id, res); this.worker!.postMessage({ t: "suggest", id, word }); setTimeout(() => { if (this.pending.delete(id)) res([]); }, 4000); });
  }
  dispose() { this.worker?.terminate(); this.worker = null; }
}
