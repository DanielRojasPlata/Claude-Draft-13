"use client";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { KeyboardEvent, memo, useEffect, useState } from "react";

export type Item =
  | { t: "btn"; id: string; label: string; icon: LucideIcon; onClick: () => void; active?: boolean; disabled?: boolean; title?: string }
  | { t: "link"; id: string; label: string; icon: LucideIcon; href: string; title?: string }
  | { t: "select"; id: string; label: string; mono?: boolean; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void };
export interface Group { label: string; items: Item[] }
export interface RibbonTab { id: string; label: string; groups: Group[] }

const btn = "flex min-w-[3.6rem] flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[11px] leading-tight text-pink transition enabled:hover:bg-hover disabled:opacity-35 aria-pressed:bg-accent/25 aria-pressed:text-black";

/** Cheap fingerprint of everything the ribbon displays; handlers are looked up by id at click time. */
export const ribbonSig = (tabs: RibbonTab[]) =>
  tabs.map((t) => t.groups.map((g) => g.items.map((i) => `${i.id}:${"active" in i ? i.active : ""}:${"disabled" in i ? i.disabled : ""}:${"value" in i ? i.value : ""}`).join(",")).join(";")).join("|");

interface RibbonProps { tabs: RibbonTab[]; sig: string; resolve: (id: string) => Item | undefined; onAfter: () => void; collapsed: boolean; onCollapsed: (v: boolean) => void }

export const Ribbon = memo(function Ribbon({ tabs, resolve, onAfter, collapsed, onCollapsed }: RibbonProps) {
  const [active, setActive] = useState(tabs[1]?.id ?? tabs[0].id);
  const [peek, setPeek] = useState(false); // while collapsed, a single click on a tab shows its commands until the next click elsewhere
  useEffect(() => {
    if (!peek) return;
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("nav[aria-label=Ribbon]")) setPeek(false); };
    document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away);
  }, [peek]);
  const showPanel = !collapsed || peek;
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault(); const t = tabs[(n + tabs.length) % tabs.length]; setActive(t.id);
    document.getElementById(`tab-${t.id}`)?.focus();
  };
  return (
    <nav aria-label="Ribbon" className="bg-chrome text-zinc-300">
      <div role="tablist" aria-label="Ribbon tabs" onKeyDown={onKey} onDoubleClick={() => { onCollapsed(!collapsed); setPeek(false); onAfter(); }} title="Double-click to hide or show the toolbar" className="flex gap-0.5 overflow-x-auto px-3">
        {tabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={t.id === active} aria-controls={`panel-${t.id}`} tabIndex={t.id === active ? 0 : -1} onMouseDown={(e) => e.preventDefault()} onClick={() => { setActive(t.id); if (collapsed) setPeek(true); onAfter(); }}
            className={`whitespace-nowrap rounded-t-md px-3.5 py-1.5 text-[13px] transition ${t.id === active ? "bg-panel text-ink" : "hover:bg-white/10"}`}>{t.label}</button>
        ))}
      </div>
      {showPanel && <div id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-3 py-1.5 text-ink">
        {tab.groups.map((g, gi) => (
          <div key={g.label} className={`flex shrink-0 flex-col ${gi ? "border-l border-line pl-1" : ""}`}>
            <div className="flex flex-1 items-start gap-0.5">
              {g.items.map((it) => {
                if (it.t === "select") return (
                  <label key={it.id} className="flex flex-col items-start justify-center gap-1 px-2 text-[11px] text-muted">{it.label}
                    <select value={it.value} onChange={(e) => { const cur = resolve(it.id); if (cur && cur.t === "select") cur.onChange(e.target.value); onAfter(); }} className={`rounded-md bg-panel2 px-2 py-1 text-[12px] text-ink ring-1 ring-line ${it.mono ? "font-script" : ""}`}>
                      {it.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                );
                const Icon = it.icon;
                if (it.t === "link") return <Link key={it.id} href={it.href} title={it.title ?? it.label} className={btn}><Icon size={20} strokeWidth={1.75} />{it.label}</Link>;
                return (
                  <button key={it.id} title={it.title ?? it.label} aria-pressed={it.active === undefined ? undefined : it.active} disabled={it.disabled}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => { const cur = resolve(it.id); if (cur && cur.t === "btn") cur.onClick(); setPeek(false); onAfter(); }} className={btn}>
                    <Icon size={20} strokeWidth={1.75} />{it.label}
                  </button>
                );
              })}
            </div>
            <div className="pt-0.5 text-center text-[10px] uppercase tracking-wide text-muted">{g.label}</div>
          </div>
        ))}
      </div>}
    </nav>
  );
}, (a, b) => a.sig === b.sig && a.collapsed === b.collapsed);
