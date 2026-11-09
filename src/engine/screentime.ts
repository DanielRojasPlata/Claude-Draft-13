import type { Page } from "./paginate";

/**
 * Estimated screen time in minutes. The industry rule is one screenplay page per minute; measuring
 * the rows actually used (blank lines included) makes a half-empty last page count as half a minute.
 */
export function screenMinutes(pages: Page[], linesPerPage = 54): number {
  return pages.reduce((a, p) => a + p.rows, 0) / linesPerPage;
}

export function formatMinutes(m: number): string {
  const t = Math.round(m);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60), r = t % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export interface Progress { minutes: number; target: number; pct: number; state: "none" | "ok" | "near" | "over" }
export function progress(minutes: number, target: number): Progress {
  if (!target) return { minutes, target: 0, pct: 0, state: "none" };
  const pct = Math.min(100, (minutes / target) * 100);
  return { minutes, target, pct, state: minutes > target ? "over" : minutes >= target * 0.9 ? "near" : "ok" };
}
