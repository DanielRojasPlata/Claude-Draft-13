/** Parse the synonym lists out of a sinonimosonline.com word page. Pure, so it can be tested without the network. */
export interface SynonymSense { meaning: string; words: string[] }

const decode = (s: string) => s.replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/&uuml;/g, "ü")
  .replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

export function parseSynonyms(html: string): SynonymSense[] {
  const out: SynonymSense[] = [];
  for (const block of html.matchAll(/<div class="synonim">([\s\S]*?)(?=<div class="synonim">|<div class="gtp-|<\/section|$)/g)) {
    const meaning = decode((/<div class="sentido">([\s\S]*?)<\/div>/.exec(block[1])?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/:\s*$/, "").trim());
    const words = [...block[1].matchAll(/<a [^>]*class="sinonimo"[^>]*>([^<]+)<\/a>/g)].map((m) => decode(m[1]).trim()).filter(Boolean);
    if (words.length) out.push({ meaning, words: [...new Set(words)] });
  }
  return out;
}

/** Only a single Spanish word is ever looked up (letters, accents, ñ, hyphen). */
export const cleanWord = (w: string) => { const t = w.trim().toLowerCase(); return /^[\p{L}\p{M}'-]{2,40}$/u.test(t) ? t : null; };
// the site's URLs drop accents: "habitación" -> /habitacion/
export const slug = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n").replace(/[^a-z-]/g, "");
