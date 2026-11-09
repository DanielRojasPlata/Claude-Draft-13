import { Element, elementText } from "./types";

export interface SceneInfo { id: string; number: number; heading: string; start: number; end: number; summary: string }

/** Scenes in document order. Elements before the first heading are not a scene. */
export function sceneList(els: Element[]): SceneInfo[] {
  const heads: number[] = [];
  els.forEach((e, i) => { if (e.type === "Scene Heading") heads.push(i); });
  return heads.map((start, n) => {
    const end = heads[n + 1] ?? els.length;
    const act = els.slice(start + 1, end).find((e) => e.type === "Action" && elementText(e).trim());
    const t = act ? elementText(act).replace(/\s+/g, " ").trim() : "";
    return { id: els[start].id, number: n + 1, heading: elementText(els[start]).trim().toUpperCase() || "(UNTITLED SCENE)", start, end, summary: t.length > 90 ? t.slice(0, 89) + "…" : t };
  });
}

/** Move a whole scene so it sits before `beforeId` (or at the end when null). */
export function moveScene(els: Element[], sceneId: string, beforeId: string | null): Element[] {
  const scenes = sceneList(els);
  const from = scenes.find((s) => s.id === sceneId); if (!from) return els;
  if (beforeId === sceneId) return els;
  const block = els.slice(from.start, from.end);
  const rest = [...els.slice(0, from.start), ...els.slice(from.end)];
  let at = rest.length;
  if (beforeId) { const i = rest.findIndex((e) => e.id === beforeId); if (i < 0) return els; at = i; }
  const out = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  return out.every((e, i) => e === els[i]) ? els : out;
}
