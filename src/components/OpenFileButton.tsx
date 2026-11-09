"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IMPORT_ACCEPT, importFileToScript, openNative } from "@/lib/import-client";

/** Open a .fdx / .fountain / .txt / backup file from disk as a new script. Also accepts a file dropped anywhere on the page. */
export function OpenFileButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const open = async (f: File) => {
    setBusy(true); setMsg(`Opening ${f.name}…`);
    try { const r = await importFileToScript(f); router.push(`/scripts/${r.id}`); }
    catch (e) { setMsg(e instanceof Error && e.message ? e.message : "That file could not be opened."); setBusy(false); }
  };
  const choose = async () => {
    if (window.guionista) {
      setBusy(true); setMsg("");
      try { const r = await openNative(); if (r) router.push(`/scripts/${r.id}`); else setBusy(false); }
      catch (e) { setMsg(e instanceof Error && e.message ? e.message : "That file could not be opened."); setBusy(false); }
    } else input.current?.click();
  };
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); void open(f); } };
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  });
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void choose()} className="rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-black/15 transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">Open file…</button>
      <input ref={input} type="file" hidden accept={IMPORT_ACCEPT} aria-label="Choose a screenplay file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void open(f); }} />
      {msg && <p role="status" className="basis-full text-right text-sm text-zinc-600">{msg}</p>}
    </>
  );
}
