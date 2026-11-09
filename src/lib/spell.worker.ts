/// <reference lib="webworker" />
import nspell from "nspell";
import { rankSuggestions } from "./rank";

type Spell = ReturnType<typeof nspell>;
let spell: Spell | null = null;
let loading: Promise<void> | null = null;

/** Hunspell dictionaries run off the main thread: parsing the Spanish one takes a moment and must never freeze typing. */
self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { t: string; id?: number; lang?: string; words?: string[]; word?: string };
  if (m.t === "init") {
    spell = null;
    loading = (async () => {
      const [aff, dic] = await Promise.all([fetch(`/dict/${m.lang}.aff`).then((r) => r.text()), fetch(`/dict/${m.lang}.dic`).then((r) => r.text())]);
      spell = nspell(aff, dic);
    })();
    try { await loading; (self as unknown as Worker).postMessage({ t: "ready", lang: m.lang }); } catch { (self as unknown as Worker).postMessage({ t: "failed", lang: m.lang }); }
  } else if (m.t === "check") {
    await loading; if (!spell) return;
    const bad = (m.words ?? []).filter((w) => !spell!.correct(w) && !spell!.correct(w.toLocaleLowerCase()));
    (self as unknown as Worker).postMessage({ t: "checked", id: m.id, words: m.words, bad });
  } else if (m.t === "suggest") {
    await loading; if (!spell) { (self as unknown as Worker).postMessage({ t: "suggestions", id: m.id, list: [] }); return; }
    (self as unknown as Worker).postMessage({ t: "suggestions", id: m.id, list: rankSuggestions(m.word ?? "", spell.suggest(m.word ?? "")) });
  }
};
