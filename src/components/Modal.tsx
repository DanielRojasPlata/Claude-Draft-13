"use client";
import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Hand-built accessible modal: focus trap, Escape to close, focus returns to the opener. */
export function Modal({ title, onClose, children, wide, huge }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; huge?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose; // callers pass a new function every render; the focus trap must not restart because of it
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const q = () => [...(ref.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((e) => !e.hasAttribute("disabled"));
    (q().find((e) => e.dataset.autofocus !== undefined) ?? q()[1] ?? q()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = q(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); opener?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[88vh] w-full flex-col rounded-xl bg-panel2 text-pink shadow-2xl ${huge ? "max-w-[78rem]" : wide ? "max-w-4xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="Close" onClick={() => closeRef.current()} className="rounded p-1 text-muted hover:bg-hover"><X size={18} /></button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls = "w-full rounded-md bg-panel2 px-3 py-2 text-sm text-pink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent";
export const btnCls = "rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40";
export const btn2Cls = "rounded-md px-3.5 py-2 text-sm font-medium text-pink ring-1 ring-line hover:bg-hover disabled:opacity-40";
