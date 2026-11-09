"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  id: string; label?: string; shortcut?: string; /** a letter shown as [G] before the label; pressing it picks the item while its submenu is open */ key?: string; disabled?: boolean; checked?: boolean; separator?: boolean;
  onSelect?: () => void; submenu?: MenuItem[];
}

/** Hand-built context menu: keyboard (arrows, Enter, Esc, Right/Left for submenus), clamped to the window, closes on outside click. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [subActive, setSubActive] = useState<string | null>(null);
  const selectable = (list: MenuItem[]) => list.filter((it) => !it.separator && !it.disabled).map((it) => it.id);
  const byId = (list: MenuItem[], id: string | null) => list.find((it) => it.id === id);

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const clamp = () => {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
    };
    clamp();
    const ro = new ResizeObserver(clamp); ro.observe(el); // fonts and checks can change the size after the first paint
    return () => ro.disconnect();
  }, [x, y]);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const blur = () => onClose();
    document.addEventListener("mousedown", away, true); window.addEventListener("blur", blur); window.addEventListener("resize", blur);
    return () => { document.removeEventListener("mousedown", away, true); window.removeEventListener("blur", blur); window.removeEventListener("resize", blur); };
  }, [onClose]);

  const choose = (it: MenuItem) => { if (it.disabled || it.separator) return; if (it.submenu) return; onClose(); it.onSelect?.(); };
  const step = (list: MenuItem[], cur: string | null, d: 1 | -1) => { const ids = selectable(list); if (!ids.length) return null; const i = cur ? ids.indexOf(cur) : -1; return ids[(i + d + ids.length) % ids.length] ?? ids[0]; };
  const subItems = sub !== null ? byId(items, sub)?.submenu ?? [] : [];
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); if (sub !== null) { setSub(null); setSubActive(null); } else onClose(); return; }
    e.stopPropagation();
    const inSub = sub !== null;
    const list = inSub ? subItems : items;
    if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); const n = step(list, inSub ? subActive : active, k === "ArrowDown" ? 1 : -1); inSub ? setSubActive(n) : setActive(n); }
    else if (k === "ArrowRight" && !inSub && active !== null && byId(items, active)?.submenu) { e.preventDefault(); setSub(active); setSubActive(selectable(byId(items, active)!.submenu!)[0] ?? null); }
    else if (k === "ArrowLeft" && inSub) { e.preventDefault(); setSub(null); setSubActive(null); }
    else if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (inSub) { const it = byId(list, subActive); if (it) choose(it); }
      else if (active !== null) { const it = byId(items, active); if (it?.submenu) { setSub(active); setSubActive(selectable(it.submenu)[0] ?? null); } else if (it) choose(it); }
    } else if (k === "Tab") e.preventDefault();
    else if (inSub && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const it = subItems.find((x) => x.key === k.toUpperCase()); if (it) { e.preventDefault(); choose(it); } }
  };

  const row = (it: MenuItem, isActive: boolean, onHover: () => void) => it.separator ? <div key={it.id} role="separator" className="my-1 h-px bg-line" /> : (
    <div key={it.id} role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"} aria-checked={it.checked} aria-disabled={it.disabled} aria-haspopup={it.submenu ? "menu" : undefined}
      onMouseEnter={onHover} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)}
      className={`flex cursor-default items-center gap-2.5 rounded px-3 py-1.5 text-[13px] ${it.disabled ? "text-muted" : isActive ? "bg-accent text-black" : "text-pink"}`}>
      <span className="w-4 text-center text-xs">{it.checked ? "✓" : ""}</span>
      {it.key && <span className="font-script text-[12px] font-bold opacity-70">[{it.key}]</span>}
      <span className="flex-1">{it.label}</span>
      {it.shortcut && <span className={`text-[11px] ${isActive ? "text-black/60" : "text-muted"}`}>{it.shortcut}</span>}
      {it.submenu && <span className="text-xs">▸</span>}
    </div>
  );

  return (
    <div ref={ref} role="menu" tabIndex={-1} aria-label="Context menu" onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] max-h-[calc(100vh-8px)] min-w-52 overflow-y-auto overscroll-contain rounded-lg bg-panel2 p-1 text-pink shadow-2xl ring-1 ring-line outline-none" style={{ left: pos.x, top: pos.y }} onScroll={() => { setSub(null); setSubActive(null); }}>
      {items.map((it) => (
        <div key={it.id} className="relative">
          {row(it, sub === null ? active === it.id : sub === it.id, () => { setActive(it.id); if (it.submenu) { setSub(it.id); setSubActive(null); } else setSub(null); })}
          {it.submenu && sub === it.id && (
            <SubMenu label={it.label ?? ""}>{it.submenu.map((s2) => row(s2, subActive === s2.id, () => setSubActive(s2.id)))}</SubMenu>
          )}
        </div>
      ))}
    </div>
  );
}

/** A submenu opens beside its parent row (fixed position, so a scrolling parent cannot clip it), flips left at the window edge, and slides up to stay on screen. */
function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", left: 0, top: 0, visibility: "hidden" });
  useLayoutEffect(() => {
    const el = ref.current; const parent = el?.parentElement; if (!el || !parent) return;
    const place = () => {
      const r = el.getBoundingClientRect(), p = parent.getBoundingClientRect();
      const flip = p.right + r.width + 6 > window.innerWidth && p.left - r.width - 6 > 0;
      const maxH = window.innerHeight - 12;
      const h = Math.min(r.height, maxH);
      const top = Math.max(6, Math.min(p.top, window.innerHeight - 6 - h));
      setStyle({ position: "fixed", left: flip ? p.left - r.width - 4 : Math.min(p.right + 4, window.innerWidth - r.width - 6), top, visibility: "visible", maxHeight: maxH, overflowY: "auto" });
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} role="menu" aria-label={label} className="min-w-44 rounded-lg bg-panel2 p-1 text-pink shadow-2xl ring-1 ring-line" style={style}>{children}</div>;
}
