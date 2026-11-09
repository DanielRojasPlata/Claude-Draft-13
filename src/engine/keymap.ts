import { ELEMENT_TYPES, ElementType } from "./types";

/** Tab / Shift-Tab: cycle the whole list, wrapping both directions. */
export function cycleType(t: ElementType, dir: 1 | -1): ElementType {
  const n = ELEMENT_TYPES.length;
  return ELEMENT_TYPES[(ELEMENT_TYPES.indexOf(t) + dir + n) % n];
}

/**
 * Return key: the element that starts next. These are the original's Screenplay defaults, read from its
 * element settings: Scene Heading, Action and Shot continue with Action; Character and Parenthetical lead
 * to Dialogue; Dialogue returns to Action (the next speaker is one Tab away); Transition opens a new scene.
 */
export const NEXT_ON_ENTER: Record<ElementType, ElementType> = {
  "Scene Heading": "Action",
  Action: "Action",
  Character: "Dialogue",
  Parenthetical: "Dialogue",
  Dialogue: "Action",
  Transition: "Scene Heading",
  Shot: "Action",
  General: "General",
  Summary: "Summary",
  "End of Act": "Scene Heading",
  Note: "Action",
};
export const nextOnEnter = (t: ElementType): ElementType => NEXT_ON_ENTER[t] ?? t;
