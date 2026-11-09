const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Fold letters Spanish speakers commonly swap, so "kasa" is 0 away from "casa" and "haver" from "haber". */
const fold = (s: string) => strip(s.toLocaleLowerCase()).replace(/(.)\1{2,}/g, "$1$1").replace(/qu/g, "c").replace(/ll/g, "y").replace(/[kq]/g, "c").replace(/v/g, "b").replace(/[zs]/g, "s").replace(/h/g, "").replace(/ñ/g, "n").replace(/w/g, "u");

function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Order spelling suggestions by how plausible they are for a typo (phonetic distance first, then plain distance, then same first letter). */
export function rankSuggestions(word: string, list: string[], max = 8): string[] {
  const w = word.toLocaleLowerCase(), fw = fold(word);
  return [...new Set(list)]
    .map((c) => ({ c, a: lev(fold(c), fw), b: lev(strip(c.toLocaleLowerCase()), strip(w)), f: strip(c)[0]?.toLocaleLowerCase() === strip(w)[0] ? 0 : 1, len: Math.abs(c.length - word.length) }))
    .sort((x, y) => x.a - y.a || x.f - y.f || x.b - y.b || x.len - y.len || x.c.localeCompare(y.c, "es"))
    .slice(0, max).map((x) => x.c);
}
