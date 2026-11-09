"use client";
import { useLayoutEffect, useRef, useState } from "react";

export interface Anchor { x: number; y: number; h: number }

/**
 * The SmartType / element list. It is positioned from the caret's screen rectangle (not inside the page,
 * so the page edge can never clip it), flips above the line near the bottom of the window, and is clamped to the right edge.
 */
export function SmartPopup({ anchor, title, items, active, onPick, hint }: {
  anchor: Anchor; title: string; items: string[]; active: number; onPick: (i: number) => void; hint: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y + anchor.h + 4 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const below = anchor.y + anchor.h + 4, above = anchor.y - r.height - 4;
    const top = below + r.height > window.innerHeight - 6 && above > 6 ? above : Math.min(below, Math.max(6, window.innerHeight - r.height - 6));
    setPos({ left: Math.max(6, Math.min(anchor.x, window.innerWidth - r.width - 6)), top });
  }, [anchor.x, anchor.y, anchor.h, items.length, title]);
  return (
    <div ref={ref} role="listbox" aria-label={title} className="fixed z-[55] min-w-48 max-w-xs overflow-hidden rounded-lg bg-panel2 text-pink shadow-2xl ring-1 ring-line" style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.preventDefault()}>
      <div className="border-b border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <ul className="py-1">
        {items.map((it, i) => (
          <li key={it} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
            className={`cursor-default px-3 py-1 font-script text-[13px] ${i === active ? "bg-accent text-black" : "hover:bg-hover"}`}>{it}</li>
        ))}
      </ul>
      <div className="border-t border-line px-3 py-1 text-[10px] text-muted">{hint}</div>
    </div>
  );
}
