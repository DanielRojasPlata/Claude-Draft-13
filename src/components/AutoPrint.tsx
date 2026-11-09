"use client";
import { useEffect } from "react";
export function AutoPrint() {
  useEffect(() => {
    const go = () => setTimeout(() => window.print(), 200);
    if (document.fonts?.ready) void document.fonts.ready.then(go); else go();
  }, []);
  return null;
}
