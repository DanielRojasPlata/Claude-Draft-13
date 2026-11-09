import { describe, expect, it } from "vitest";
import { cycle, deleteBack, DocState, enter, insertText, makeElement, setType } from "./doc";
import { firstDiff, initHist, reduce } from "./history";
import { cycleType, nextOnEnter } from "./keymap";
import { CachedMeasurer } from "./measure";
import { paginate, paginateElements } from "./paginate";
import { buildLists, defaultSmartType, entries, parseSmartType, suggest } from "./smarttype";
import { ELEMENT_TYPES, Script } from "./types";

const el = (id: string, type: any, text: string) => ({ id, type, runs: [{ text }] });
const doc = (...els: any[]): DocState => ({ elements: els, cursor: { id: els[0].id, offset: els[0].runs[0].text.length } });
const txt = (s: DocState) => s.elements.map((e) => e.runs.map((r) => r.text).join(""));

describe("keymap", () => {
  it("wraps both directions", () => {
    expect(cycleType("General", 1)).toBe("Scene Heading");
    expect(cycleType("Scene Heading", -1)).toBe("General");
    expect(cycleType("Note", 1)).toBe("General"); expect(cycleType("General", -1)).toBe("Note");
    expect(ELEMENT_TYPES.reduce((t) => cycleType(t, 1), ELEMENT_TYPES[0])).toBe(ELEMENT_TYPES[0]);
  });
  it("enter map", () => {
    expect(nextOnEnter("Scene Heading")).toBe("Action");
    expect(nextOnEnter("Character")).toBe("Dialogue");
    expect(nextOnEnter("Parenthetical")).toBe("Dialogue");
    expect(nextOnEnter("Dialogue")).toBe("Action"); // original: Dialogue returns to Action
    expect(nextOnEnter("Action")).toBe("Action"); expect(nextOnEnter("Shot")).toBe("Action"); expect(nextOnEnter("General")).toBe("General");
    expect(nextOnEnter("Transition")).toBe("Scene Heading");
  });
});

describe("doc ops", () => {
  it("types, enters with next-logical type, merges on backspace", () => {
    let s = doc(el("a", "Scene Heading", "INT. KITCHEN"));
    s = enter(s);
    expect(s.elements[1].type).toBe("Action");
    s = insertText(s, "Rain.");
    s = deleteBack(deleteBack(deleteBack(deleteBack(deleteBack(s)))));
    s = deleteBack(s);
    expect(txt(s)).toEqual(["INT. KITCHEN"]);
    expect(s.cursor).toEqual({ id: "a", offset: 12 });
  });
  it("splits mid-text on enter and replaces selections", () => {
    let s: DocState = { elements: [el("a", "Dialogue", "hello world")], cursor: { id: "a", offset: 5 } };
    s = enter(s);
    expect(txt(s)).toEqual(["hello", " world"]);
    expect(s.elements[1].type).toBe("Dialogue"); // mid-line split keeps the type
    const end = enter({ elements: [el("d", "Dialogue", "done")], cursor: { id: "d", offset: 4 } });
    expect(end.elements[1].type).toBe("Action"); // end of line applies the next-logical type
    s = { ...s, cursor: { id: s.elements[1].id, offset: 6, anchor: 1 } };
    expect(txt(insertText(s, "X"))).toEqual(["hello", " X"]);
  });
  it("multi-line paste makes elements", () => {
    expect(txt(insertText(doc(el("a", "Action", "")), "one\ntwo\nthree"))).toEqual(["one", "two", "three"]);
  });
  it("type cycling", () => {
    expect(setType(cycle(doc(el("a", "Action", "")), 1), "Action").elements[0].type).toBe("Action");
  });
});

describe("history", () => {
  it("survives 200 undos and redoes them exactly", () => {
    let h = initHist(doc(el("a", "Action", "")));
    const snaps: string[][] = [txt(h.cur)];
    for (let i = 0; i < 200; i++) {
      h = reduce(h, { t: "edit", fn: (s) => (i % 3 === 0 ? enter(s) : insertText(s, "x")), now: i * 5000 });
      snaps.push(txt(h.cur));
    }
    for (let i = 199; i >= 0; i--) { h = reduce(h, { t: "undo" }); expect(txt(h.cur)).toEqual(snaps[i]); }
    expect(reduce(h, { t: "undo" })).toBe(h);
    for (let i = 1; i <= 200; i++) h = reduce(h, { t: "redo" });
    expect(txt(h.cur)).toEqual(snaps[200]);
  });
  it("coalesces typing in one element, breaks on cursor move", () => {
    let h = initHist(doc(el("a", "Action", "")));
    for (const [i, c] of [..."abc"].entries()) h = reduce(h, { t: "edit", fn: (s) => insertText(s, c), key: "type:a", now: i });
    expect(h.past.length).toBe(1);
    h = reduce(h, { t: "undo" });
    expect(txt(h.cur)).toEqual([""]);
  });
  it("firstDiff finds dirty index by reference", () => {
    const a = [el("1", "Action", ""), el("2", "Action", "")]; const b = [a[0], el("2", "Action", "x")];
    expect(firstDiff(a, b)).toBe(1);
    expect(firstDiff(a, a.slice())).toBe(Infinity);
  });
});

describe("smarttype", () => {
  const els = [el("h", "Scene Heading", "INT. KITCHEN - NIGHT"), el("h2", "Scene Heading", "INT. KITCHEN - DAY"), el("c", "Character", "MARA (V.O.)"), el("c2", "Character", "MARIO"), el("c3", "Character", "MARA"), el("t", "Transition", "CUT TO:")];
  const L = buildLists(els, defaultSmartType(), "en");
  it("ranks script entries by use, then adds built-ins (works on an empty script too)", () => {
    expect(L.characters).toEqual(["MARA", "MARIO"]);
    expect(L.locations[0]).toBe("KITCHEN");
    expect(L.times.slice(0, 2)).toEqual(["DAY", "NIGHT"]);
    const fresh = buildLists([], defaultSmartType(), "en");
    expect(fresh.intros).toContain("INT."); expect(fresh.times).toContain("NIGHT"); expect(fresh.extensions).toContain("V.O."); expect(fresh.transitions).toContain("FADE OUT.");
    const es = buildLists([]); // Spanish is the default language
    expect(es.times).toEqual(expect.arrayContaining(["DÍA", "NOCHE", "MAÑANA"])); expect(es.transitions).toContain("CORTE A:");
  });
  it("suggests per context, prefix first then word matches", () => {
    expect(suggest(el("x", "Character", "MAR"), 3, L)?.items).toEqual(["MARA", "MARIO"]);
    expect(suggest(el("x", "Character", "MARA (V"), 7, L)?.items).toContain("V.O.");
    expect(suggest(el("x", "Scene Heading", "INT. KIT"), 8, L)?.items).toEqual(["KITCHEN"]);
    expect(suggest(el("x", "Scene Heading", "INT. KITCHEN - N"), 16, L)?.items).toEqual(["NIGHT"]);
    expect(suggest(el("x", "Scene Heading", "I"), 1, L)?.items).toEqual(["INT.", "INT./EXT.", "I/E."]);
    expect(suggest(el("x", "Transition", "FA"), 2, L)?.items).toEqual(["FADE IN:", "FADE OUT.", "FADE TO BLACK."]);
    expect(suggest(el("x", "Action", "MAR"), 3, L)).toBeNull();
    expect(suggest(el("x", "Character", "MARA"), 4, L)).toBeNull();
  });
  it("matches Spanish times of day without typing accents", () => {
    const es = buildLists([]);
    const day = suggest(el("x", "Scene Heading", "INT. SALA - D"), 13, es)!;
    expect(day.items[0]).toBe("DÍA");
    expect(suggest(el("x", "Scene Heading", "INT. SALA - NO"), 14, es)!.items).toEqual(["NOCHE"]);
    expect(suggest(el("x", "Scene Heading", "INT. SALA - MAN"), 15, es)!.items).toEqual(["MAÑANA"]);
  });
  it("offers a menu in empty elements without pre-selecting", () => {
    const c = suggest(el("x", "Character", ""), 0, L)!; expect(c.open).toBe(true); expect(c.items[0]).toBe("MARA");
    const s = suggest(el("x", "Scene Heading", "INT."), 4, L)!; expect(s.open).toBe(true); expect(s.prefix).toBe(" "); expect(s.suffix).toBe(" - ");
    expect(suggest(el("x", "Scene Heading", ""), 0, L)!.items).toContain("EXT.");
  });
  it("honours custom and hidden entries", () => {
    const cfg = defaultSmartType(); cfg.custom.locations = ["THE LIGHTHOUSE"]; cfg.hidden.times = ["DAY"]; cfg.hidden.characters = ["MARIO"];
    const l = buildLists(els, cfg);
    expect(l.locations).toContain("THE LIGHTHOUSE"); expect(l.times).not.toContain("DAY"); expect(l.characters).toEqual(["MARA"]);
    expect(entries(els, cfg, "times").find((e) => e.text === "DAY")?.hidden).toBe(true);
    expect(parseSmartType({ enabled: false, custom: { locations: ["a", 5, "  b  "] } }).custom.locations).toEqual(["A", "B"]);
  });
});

describe("paginate", () => {
  const big = (n: number): Script => ({ scenes: Array.from({ length: n }, (_, s) => ({ id: "s" + s, elements: [
    el(`h${s}`, "Scene Heading", "INT. ROOM - DAY"),
    el(`a${s}`, "Action", "Mara crosses the room. She stops at the window. ".repeat(4)),
    el(`c${s}`, "Character", "MARA"),
    el(`d${s}`, "Dialogue", "I never said that. ".repeat(12)),
  ] })) });
  it("never exceeds page height and splits dialogue with MORE/CONT'D", () => {
    const long = [el("h", "Scene Heading", "INT. ROOM - DAY"), el("a", "Action", "Rain. ".repeat(20)), el("c", "Character", "MARA"), el("d", "Dialogue", "I never said that. ".repeat(160))];
    const pages = paginateElements(long, new CachedMeasurer());
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.rows <= 54)).toBe(true);
    const all = pages.flatMap((p) => p.lines.map((l) => l.text));
    expect(all).toContain("(MORE)");
    expect(all).toContain("MARA (CONT'D)");
    expect(paginate(big(60), new CachedMeasurer()).every((p) => p.rows <= 54)).toBe(true);
  });
  it("scene headings get two blank lines before them, action one, dialogue none (original spacing)", () => {
    const p = paginateElements([el("a", "Action", "one"), el("h", "Scene Heading", "INT. X - DAY"), el("c", "Character", "ANA"), el("d", "Dialogue", "Hi.")], new CachedMeasurer())[0];
    const row = (id: string) => p.lines.find((l) => l.elementId === id)!.row;
    expect(row("h") - row("a")).toBe(3); // action line + 2 blank lines
    expect(row("c") - row("h")).toBe(2); // heading line + 1 blank
    expect(row("d") - row("c")).toBe(1);
  });
  it("heading is never last line of a page", () => {
    for (const p of paginate(big(80), new CachedMeasurer())) expect(p.lines.at(-1)?.type === "Scene Heading").toBe(false);
  });
  it("120 pages repaginate under 100ms", () => {
    const m = new CachedMeasurer(); const s = big(450);
    paginate(s, m); const t = performance.now(); const pages = paginate(s, m);
    expect(pages.length).toBeGreaterThan(100); expect(performance.now() - t).toBeLessThan(100);
  });
  it("incremental repagination equals full repagination", () => {
    const m = new CachedMeasurer();
    const els = big(200).scenes.flatMap((s) => s.elements);
    const pages = paginateElements(els, m);
    for (const at of [0, 1, 37, 300, 799]) {
      const edited = els.slice();
      edited[at] = { ...els[at], runs: [{ text: els[at].runs[0].text + " And then a very long extra sentence follows here. ".repeat(3) }] };
      const inc = paginateElements(edited, m, { resume: { pages, dirty: at } });
      expect(JSON.stringify(inc)).toBe(JSON.stringify(paginateElements(edited, m)));
    }
  });
  it("lines carry element offsets for caret mapping", () => {
    const pages = paginate({ scenes: [{ id: "s", elements: [el("a", "Action", "word ".repeat(30))] }] }, new CachedMeasurer());
    const ls = pages[0].lines;
    expect(ls[0].start).toBe(0);
    expect(ls[1].start).toBe(ls[0].text.length); // trailing spaces stay on their line, so lines tile the text exactly
    expect(ls[0].text.endsWith(" ")).toBe(true);
  });
});

describe("screen time", () => {
  it("counts rows used: 54 rows is one minute, and the progress state flips at 90% / 100%", async () => {
    const { screenMinutes, progress, formatMinutes } = await import("./screentime");
    const pages = [{ number: 1, label: "1", lines: [], rows: 54 }, { number: 2, label: "2", lines: [], rows: 27 }];
    expect(screenMinutes(pages)).toBe(1.5);
    expect(progress(45, 90)).toMatchObject({ pct: 50, state: "ok" });
    expect(progress(82, 90).state).toBe("near"); expect(progress(95, 90)).toMatchObject({ pct: 100, state: "over" });
    expect(progress(10, 0).state).toBe("none");
    expect(formatMinutes(72)).toBe("1 h 12 min"); expect(formatMinutes(42.4)).toBe("42 min");
  });
});
