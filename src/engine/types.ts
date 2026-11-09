export const ELEMENT_TYPES = [
  "General",
  "Scene Heading",
  "Action",
  "Character",
  "Parenthetical",
  "Dialogue",
  "Transition",
  "Shot",
  "Summary",
  "End of Act",
  "Note",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
/** The letter that picks each element in the Elements menu. */
export const ELEMENT_KEY: Record<ElementType, string> = {
  General: "G", "Scene Heading": "S", Action: "A", Character: "C", Parenthetical: "P", Dialogue: "D", Transition: "T", Shot: "H", Summary: "U", "End of Act": "E", Note: "N",
};
export const elementForKey = (k: string): ElementType | undefined => ELEMENT_TYPES.find((t) => ELEMENT_KEY[t] === k.toUpperCase());

export interface Run { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
export interface Element {
  id: string; type: ElementType; runs: Run[];
  /** dual dialogue side: 1 = left column, 2 = right column */
  dual?: 1 | 2;
  /** revision pass (index into REVISION_COLORS, > 0) that last changed this element */
  rev?: number;
  /** force a page break before this element */
  breakBefore?: boolean;
}
export interface Scene { id: string; elements: Element[] }
export interface Script { scenes: Scene[] }

/** Geometry in inches, 10 chars/in and 6 lines/in for Courier 12pt. */
export const PAGE = { width: 8.5, height: 11, left: 1.5, right: 1, top: 1, bottom: 1 } as const;
export const CPI = 10;
export const LINES_PER_PAGE = 54; // 9in usable * 6 lpi
/** left indent from page edge (in) and right edge (in) per element. */
export const INDENT: Record<ElementType, { left: number; right: number }> = {
  "Scene Heading": { left: 1.5, right: 7.5 },
  Action: { left: 1.5, right: 7.5 },
  Character: { left: 3.7, right: 7.5 },
  Parenthetical: { left: 3.1, right: 5.5 },
  Dialogue: { left: 2.5, right: 6.0 },
  Transition: { left: 5.5, right: 7.5 },
  Shot: { left: 1.5, right: 7.5 },
  General: { left: 1.5, right: 7.5 },
  Summary: { left: 1.5, right: 7.5 },
  "End of Act": { left: 1.5, right: 7.5 }, // centred in this column
  Note: { left: 1.5, right: 7.5 },
};
/** Dual dialogue column geometry (inches from page left). */
export const DUAL = { leftX: 1.0, rightX: 4.5, dialogueWidth: 3.2, characterOffset: 0.9, characterWidth: 2.3, parenOffset: 0.5, parenWidth: 2.2 } as const;
export const dualIndent = (type: ElementType, side: 1 | 2): { left: number; right: number } => {
  const x = side === 1 ? DUAL.leftX : DUAL.rightX;
  if (type === "Character") return { left: x + DUAL.characterOffset, right: x + DUAL.characterOffset + DUAL.characterWidth };
  if (type === "Parenthetical") return { left: x + DUAL.parenOffset, right: x + DUAL.parenOffset + DUAL.parenWidth };
  return { left: x, right: x + DUAL.dialogueWidth };
};
/** Space before an element, in blank lines (6 lines per inch): the original's 24pt / 12pt / 0pt. */
export const SPACE_BEFORE: Record<ElementType, number> = {
  "Scene Heading": 2, Action: 1, Character: 1, Parenthetical: 0, Dialogue: 0, Transition: 1, Shot: 1, General: 0, Summary: 1, "End of Act": 2, Note: 1,
};
export const elementText = (e: Element) => e.runs.map((r) => r.text).join("");
