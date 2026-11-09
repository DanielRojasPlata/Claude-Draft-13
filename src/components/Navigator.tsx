"use client";
import { memo, useState } from "react";

export interface NavScene { id: string; number: number; heading: string; summary: string; page: string }

export const Navigator = memo(function Navigator({ scenes, currentId, onJump, onMove, onContext }: {
  scenes: NavScene[]; currentId: string | null; onContext: (id: string, x: number, y: number) => void;
  onJump: (id: string) => void; onMove: (id: string, beforeId: string | null) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null); // scene id, or "end"
  return (
    <aside aria-label="Scene Navigator" className="flex h-full w-64 shrink-0 xl:w-72 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>Scenes</span><span>{scenes.length}</span>
      </div>
      {scenes.length === 0 ? (
        <p className="px-4 text-sm text-muted">No scenes yet. Start a line with INT. or EXT. and it will appear here.</p>
      ) : (
        <ol className="flex-1 space-y-1.5 overflow-auto px-2 pb-4"
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}>
          {scenes.map((s, i) => (
            <li key={s.id} draggable onContextMenu={(e) => { e.preventDefault(); onContext(s.id, e.clientX, e.clientY); }}
              onDragStart={(e) => { setDrag(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? s.id : scenes[i + 1]?.id ?? "end"); }}
              onDrop={(e) => { e.preventDefault(); if (drag && over) onMove(drag, over === "end" ? null : over); setDrag(null); setOver(null); }}
              className={`group relative rounded-lg ring-1 transition ${s.id === currentId ? "bg-accent/15 ring-accent" : "bg-panel2 ring-line hover:ring-line"} ${drag === s.id ? "opacity-40" : ""}`}>
              {over === s.id && drag !== s.id && <div className="absolute -top-1 left-0 right-0 h-0.5 rounded bg-accent" />}
              <button onClick={() => onJump(s.id)} className="block w-full px-3 py-2 text-left" aria-label={`Scene ${s.number}: ${s.heading}`} aria-current={s.id === currentId}>
                <div className="flex items-baseline gap-2">
                  <span className="font-script text-xs font-bold text-muted">{s.number}</span>
                  <span className="truncate font-script text-[13px] font-bold">{s.heading}</span>
                </div>
                {s.summary && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{s.summary}</div>}
                <div className="mt-1 text-[11px] text-muted">Page {s.page || "—"}</div>
              </button>
              <div className="absolute right-1 top-1 flex items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                <button aria-label={`Move scene ${s.number} up`} disabled={i === 0} onClick={() => onMove(s.id, scenes[i - 1].id)} className="rounded px-1 text-[10px] leading-5 text-muted hover:bg-hover disabled:opacity-30">▲</button>
                <button aria-label={`Move scene ${s.number} down`} disabled={i === scenes.length - 1} onClick={() => onMove(s.id, scenes[i + 2]?.id ?? null)} className="rounded px-1 text-[10px] leading-5 text-muted hover:bg-hover disabled:opacity-30">▼</button>
                <span className="cursor-grab px-0.5 text-xs text-muted" aria-hidden>⋮⋮</span>
              </div>
            </li>
          ))}
          {drag && <li onDragOver={(e) => { e.preventDefault(); setOver("end"); }} onDrop={(e) => { e.preventDefault(); if (drag) onMove(drag, null); setDrag(null); setOver(null); }} className={`h-6 rounded ${over === "end" ? "border-t-2 border-accent" : ""}`} aria-hidden />}
        </ol>
      )}
    </aside>
  );
});
