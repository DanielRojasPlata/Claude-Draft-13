"use client";
import { ClipboardPaste, ExternalLink, RotateCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Provider = "claude" | "chatgpt" | "gemini";
type Scope = "scene" | "selection" | "script";

export const PROVIDERS: Record<Provider, { label: string; url: string }> = {
  claude: { label: "Claude", url: "https://claude.ai/new" },
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/app" },
};
const STORE = "guionista:assistant:provider";

/**
 * The writing assistant is the free web version of Claude, ChatGPT or Gemini, shown inside this panel (desktop). No API key:
 * sign in on the site once and the session is remembered. "Paste into chat" copies the scene, the selection or the whole script
 * and pastes it into the chat box. In a plain browser the panel offers links instead (these sites cannot be embedded in a page).
 */
export function Assistant({ getContext, onClose, suspended }: { getContext: (s: Scope | "none") => string; onClose: () => void; suspended: boolean }) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [scope, setScope] = useState<Scope>("scene");
  const [note, setNote] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Window["guionista"]>(undefined);
  useEffect(() => {
    setG(window.guionista);
    try { const p = localStorage.getItem(STORE); if (p && p in PROVIDERS) setProvider(p as Provider); } catch { /* ignore */ }
  }, []);
  const pick = (p: Provider) => { setProvider(p); try { localStorage.setItem(STORE, p); } catch { /* ignore */ } };

  const place = useCallback(() => {
    const el = host.current; if (!el || !g?.ai) return;
    const r = el.getBoundingClientRect();
    void g.ai.show(provider, { x: r.left, y: r.top, width: r.width, height: r.height });
  }, [g, provider]);
  useEffect(() => {
    if (!g?.ai) return;
    if (suspended) { void g.ai.hide(); return; } // dialogs and menus must not end up underneath the web view
    place();
    const el = host.current; const ro = new ResizeObserver(place); if (el) ro.observe(el);
    window.addEventListener("resize", place);
    const poll = setInterval(place, 400); // the panel can move without changing size (ribbon, banners)
    return () => { ro.disconnect(); window.removeEventListener("resize", place); clearInterval(poll); };
  }, [g, place, suspended]);
  useEffect(() => () => { void window.guionista?.ai?.hide(); }, []);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote((n) => (n === m ? "" : n)), 4000); };
  const paste = async () => {
    const text = getContext(scope);
    if (!text.trim()) return flash(scope === "selection" ? "Select some text in the script first." : "There is nothing to share yet.");
    try { await navigator.clipboard.writeText(text); } catch { return flash("The clipboard is blocked here."); }
    if (g?.ai && (await g.ai.paste())) flash(`Pasted ${scope === "scene" ? "the current scene" : scope === "selection" ? "the selection" : "the script"} into the chat box: add your question and send.`);
    else flash("Copied: paste it into the chat with Ctrl+V.");
  };

  return (
    <aside aria-label="Writing assistant" className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[31.5rem] flex-col border-l border-line bg-panel shadow-2xl lg:static lg:z-auto lg:w-[25.5rem] lg:max-w-[34vw] lg:shadow-none">
      <div className="flex items-center gap-2 border-b border-line bg-chrome px-3 py-2 text-zinc-100">
        <Sparkles size={16} className="text-accent" /><h2 className="text-sm font-semibold">Writing assistant</h2>
        <span className="text-xs text-zinc-400">free web version</span>
        <button onClick={onClose} aria-label="Close assistant" className="ml-auto rounded p-1.5 hover:bg-white/10"><X size={16} /></button>
      </div>
      <div role="tablist" aria-label="Assistant provider" className="flex gap-1 border-b border-line p-2">
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
          <button key={p} role="tab" aria-selected={p === provider} onClick={() => pick(p)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm ${p === provider ? "bg-accent text-black" : "ring-1 ring-line hover:bg-hover"}`}>{PROVIDERS[p].label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted">
        <label htmlFor="ctx" className="shrink-0">Share</label>
        <select id="ctx" value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="min-w-0 flex-1 rounded-md bg-panel2 px-2 py-1 text-ink ring-1 ring-line">
          <option value="scene">Current scene</option><option value="selection">Selected text</option><option value="script">Whole script</option>
        </select>
        <button onClick={() => void paste()} title="Copy it and paste it into the chat box" className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 font-medium text-black hover:brightness-105"><ClipboardPaste size={14} />Paste into chat</button>
        {g?.ai && <button onClick={() => void g.ai.reload(provider)} aria-label="Reload" title="Reload the page" className="rounded p-1.5 hover:bg-hover"><RotateCw size={15} /></button>}
        <button onClick={() => (g?.ai ? void g.ai.external(provider) : window.open(PROVIDERS[provider].url, "_blank", "noopener"))} aria-label="Open in browser" title="Open in your browser" className="rounded p-1.5 hover:bg-hover"><ExternalLink size={15} /></button>
      </div>
      {note && <p role="status" className="border-b border-line bg-panel2 px-3 py-1.5 text-xs">{note}</p>}
      <div ref={host} className="min-h-0 flex-1 bg-panel2" data-assistant-host>
        {!g?.ai && (
          <div className="space-y-3 p-5 text-sm">
            <p>The free web versions open inside the desktop app. In a browser, open them in a tab:</p>
            <ul className="space-y-1">{(Object.keys(PROVIDERS) as Provider[]).map((p) => <li key={p}><a className="text-blue-700 underline" href={PROVIDERS[p].url} target="_blank" rel="noopener noreferrer">{PROVIDERS[p].label}</a></li>)}</ul>
            <p className="text-muted">Use “Paste into chat” to copy the scene, then paste it there.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
