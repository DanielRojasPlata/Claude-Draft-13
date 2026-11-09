"use client";
import { useEffect } from "react";

/** Last line of defence: if a page throws, the writer sees this instead of a blank window. Everything typed so far was autosaved. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-chrome px-4 text-center">
      <p className="font-script text-lg font-bold uppercase tracking-wide text-accent">CUT TO BLACK.</p>
      <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-300">Your script is saved automatically, so your work is safe. Reload to open it again from the last saved copy.</p>
      <div className="flex gap-3">
        <button onClick={() => window.location.reload()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black">Reload</button>
        <button onClick={reset} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">Try again</button>
        <button onClick={() => { window.location.href = "/"; }} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">Start page</button>
      </div>
    </main>
  );
}
