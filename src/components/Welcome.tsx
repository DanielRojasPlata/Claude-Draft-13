"use client";
import { Clapperboard, Compass, Drama, FileText, Film, FolderOpen, Images, Trash2, Tv, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteScript, logout } from "@/app/actions";
import type { Lang } from "@/engine/meta";
import { buildTemplate, TEMPLATES } from "@/engine/templates";
import { importFileToScript, IMPORT_ACCEPT, openNative, showScript } from "@/lib/import-client";
import { Logo, LogoMark } from "./Logo";

export interface RecentRow { id: string; title: string; updatedAt: string; count: number; file: string }

const ICONS: Record<string, { icon: LucideIcon; tint: string }> = {
  short: { icon: Film, tint: "from-zinc-500 to-zinc-700" },
  screenplay: { icon: Clapperboard, tint: "from-amber-400 to-orange-600" },
  series: { icon: Tv, tint: "from-sky-400 to-indigo-600" },
  stage: { icon: Drama, tint: "from-rose-400 to-fuchsia-700" },
  graphic: { icon: Images, tint: "from-emerald-400 to-teal-700" },
  structure: { icon: Compass, tint: "from-violet-400 to-purple-700" },
};
const T = {
  es: { gallery: "Galería de plantillas", galleryHint: "Empieza un guion nuevo", open: "Abrir un archivo", openHint: "Final Draft (.fdx), Fountain o texto. También puedes soltar un archivo en esta ventana.", openBtn: "Abrir archivo…", recent: "Archivos recientes", none: "Todavía no hay guiones. Crea uno desde la galería.", language: "Idioma del guion", create: "Crear", creating: "Creando…", elements: "elementos", tag: "Escribe tu guion" },
  en: { gallery: "Template Gallery", galleryHint: "Start a new script", open: "Open a file", openHint: "Final Draft (.fdx), Fountain or text. You can also drop a file on this window.", openBtn: "Open file…", recent: "Recent files", none: "No scripts yet. Create one from the gallery.", language: "Script language", create: "Create", creating: "Creating…", elements: "elements", tag: "Write your screenplay" },
} as const;

export function Welcome({ desktop, recent }: { desktop: boolean; recent: RecentRow[] }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("es");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState(recent);
  const [fmt, setFmt] = useState<Intl.DateTimeFormat | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const t = T[lang];
  useEffect(() => { setFmt(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })); try { const l = localStorage.getItem("guionista:tplLang"); if (l === "en" || l === "es") setLang(l); } catch { /* ignore */ } }, []);
  useEffect(() => { setRows(recent); }, [recent]);
  useEffect(() => { document.title = "Guionista"; }, []);
  const pickLang = (l: Lang) => { setLang(l); try { localStorage.setItem("guionista:tplLang", l); } catch { /* ignore */ } };
  const push = (u: string) => router.push(u);

  const create = async (id: string) => {
    setBusy(id); setMsg("");
    try {
      const b = buildTemplate(id, lang); const body = { title: b.title, elements: b.elements, meta: b.meta, newScript: true };
      const r = await fetch("/api/scripts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      await showScript(((await r.json()) as { id: string }).id, push, false);
    } catch { setMsg(lang === "es" ? "No se pudo crear el guion." : "The script could not be created."); }
    setBusy(null);
  };
  const fail = (e: unknown) => setMsg(e instanceof Error && e.message ? e.message : "That file could not be opened.");
  const openFile = async (f: File) => { setBusy("file"); setMsg(""); try { const r = await importFileToScript(f); await showScript(r.id, push, false); } catch (e) { fail(e); } setBusy(null); };
  const choose = async () => {
    if (!window.guionista) return input.current?.click();
    setBusy("file"); setMsg("");
    try { const r = await openNative(); if (r) { if (r.existing) setMsg(lang === "es" ? `Ya estaba abierto: “${r.title}”.` : `Already open: “${r.title}”.`); await showScript(r.id, push, false); } } catch (e) { fail(e); }
    setBusy(null);
  };
  useEffect(() => {
    const dragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setOver(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setOver(false); };
    const drop = (e: DragEvent) => { setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); void openFile(f); } };
    window.addEventListener("dragover", dragOver); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", dragOver); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  });
  const cards = [...TEMPLATES.map((x) => ({ id: x.id, name: x.name, blurb: x.blurb[lang], summary: x.summary }))];
  const where = (p: string) => (p ? p.split(/[\\/]/).slice(-3).join(" › ") : "");

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="relative overflow-hidden bg-chrome">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(60rem 22rem at 85% -30%, rgba(232,176,74,.28), transparent 60%), radial-gradient(36rem 18rem at 0% 120%, rgba(232,176,74,.12), transparent 60%)" }} />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-8 py-9">
          <LogoMark size={72} />
          <div>
            <h1 className="font-script text-[34px] font-bold uppercase leading-none tracking-[0.2em] text-white">Guionista</h1>
            <p className="mt-2 text-sm tracking-wide text-zinc-400">{t.tag}</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm text-zinc-300">
            <label htmlFor="wl" className="text-zinc-400">{t.language}</label>
            <div id="wl" role="group" aria-label={t.language} className="flex overflow-hidden rounded-md ring-1 ring-white/20">
              {(["es", "en"] as const).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => pickLang(l)} className={`px-3 py-1.5 text-[13px] font-medium transition ${lang === l ? "bg-accent text-black" : "hover:bg-white/10"}`}>{l === "es" ? "Español" : "English"}</button>)}
            </div>
            {!desktop && <form action={logout}><button className="rounded-md px-3 py-1.5 hover:bg-white/10">Sign out</button></form>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-8 py-10">
        <section aria-labelledby="gallery">
          <div className="mb-4 flex items-baseline gap-3"><h2 id="gallery" className="text-xl font-semibold">{t.gallery}</h2><span className="text-sm text-muted">{t.galleryHint}</span></div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c, i) => {
              const { icon: Icon, tint } = ICONS[c.id];
              return (
                <li key={c.id}>
                  <button data-autofocus={i === 0 ? "" : undefined} disabled={!!busy} onClick={() => void create(c.id)} aria-label={`${t.create}: ${c.name}`}
                    className="group flex h-full w-full items-start gap-4 rounded-2xl bg-panel2 p-4 text-left shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-accent disabled:opacity-60">
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-inner`}><Icon size={26} strokeWidth={1.75} aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">{c.name}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-muted">{c.blurb}</span>
                      <span className="mt-2 block text-xs font-medium text-amber-700 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{busy === c.id ? t.creating : `${t.create} →`}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="open">
          <h2 id="open" className="mb-4 text-xl font-semibold">{t.open}</h2>
          <div className={`flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition ${over ? "border-accent bg-accent/10" : "border-line bg-panel2"}`}>
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-hover"><FolderOpen size={24} strokeWidth={1.75} aria-hidden /></span>
            <p className="min-w-[16rem] flex-1 text-sm text-muted">{t.openHint}</p>
            <button disabled={!!busy} onClick={() => void choose()} className="rounded-lg bg-chrome px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:brightness-125 disabled:opacity-50">{t.openBtn}</button>
            <input ref={input} type="file" hidden accept={IMPORT_ACCEPT} aria-label={t.openBtn} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
          </div>
          {msg && <p role="status" className="mt-3 text-sm text-amber-800">{msg}</p>}
        </section>

        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-4 text-xl font-semibold">{t.recent}</h2>
          {rows.length === 0 ? (
            <p className="rounded-2xl bg-panel2 p-8 text-center text-sm text-muted ring-1 ring-line">{t.none}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-panel2 ring-1 ring-line">
              {rows.map((r) => (
                <li key={r.id} className="group flex items-center gap-3 pr-3 transition hover:bg-hover">
                  <button onClick={() => void showScript(r.id, push, false)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-hover"><FileText size={20} strokeWidth={1.75} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted">{where(r.file) || (lang === "es" ? "Sin archivo .fdx todavía" : "No .fdx file yet")}</span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
                      <span className="block">{fmt ? fmt.format(new Date(r.updatedAt)) : ""}</span>
                      <span className="block">{r.count} {t.elements}</span>
                    </span>
                  </button>
                  <form action={deleteScript} onSubmit={(e) => { if (!confirm(lang === "es" ? `¿Quitar “${r.title}” de la lista y borrar su copia interna? El archivo .fdx no se borra.` : `Remove “${r.title}” from this list and delete its internal copy? The .fdx file is not deleted.`)) e.preventDefault(); else setRows((x) => x.filter((q) => q.id !== r.id)); }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button aria-label={`Delete ${r.title}`} title={lang === "es" ? "Quitar de la lista" : "Remove from list"} className="rounded-md p-2 text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 size={16} /></button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
        <footer className="flex items-center justify-center gap-3 pb-4 pt-2 text-xs text-muted"><Logo size={22} tone="dark" /></footer>
      </main>
    </div>
  );
}
