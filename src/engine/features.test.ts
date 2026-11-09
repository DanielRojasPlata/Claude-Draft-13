import { describe, expect, it } from "vitest";
import { changeCase, DocState, insertText, renameCharacter, toggleDual, toggleFormat, formatState } from "./doc";
import { parseFdx, toFdx } from "./fdx";
import { parseFountain, toFountain } from "./fountain";
import { CachedMeasurer } from "./measure";
import { defaultMeta, parseMeta } from "./meta";
import { moveScene, sceneList } from "./navigator";
import { lockEntries, paginateElements } from "./paginate";
import { buildReports } from "./reports";
import { normalize, toggleRuns } from "./runs";
import { elementText } from "./types";

const el = (id: string, type: any, text: string, extra: object = {}) => ({ id, type, runs: [{ text }], ...extra });
const m = new CachedMeasurer();

describe("runs / formatting", () => {
  it("toggles bold on a range and merges neighbours", () => {
    const r = toggleRuns([{ text: "hello world" }], 0, 5, "bold");
    expect(r).toEqual([{ text: "hello", bold: true }, { text: " world" }]);
    expect(toggleRuns(r, 0, 5, "bold")).toEqual([{ text: "hello world" }]);
    expect(normalize([{ text: "a" }, { text: "b" }, { text: "" }])).toEqual([{ text: "ab" }]);
  });
  it("typing with pending format and inheriting format", () => {
    let s: DocState = { elements: [el("a", "Action", "x")], cursor: { id: "a", offset: 1 } };
    s = toggleFormat(s, "italic");
    expect(formatState(s, "italic")).toBe(true);
    s = insertText(s, "yz");
    expect(s.elements[0].runs).toEqual([{ text: "x" }, { text: "yz", italic: true }]);
    s = insertText({ ...s, cursor: { id: "a", offset: 3 } }, "!");
    expect(s.elements[0].runs).toEqual([{ text: "x" }, { text: "yz!", italic: true }]);
  });
  it("change case and rename character", () => {
    let s: DocState = { elements: [el("a", "Action", "the end"), el("c", "Character", "MARA (V.O.)")], cursor: { id: "a", offset: 0, anchor: 7 } };
    expect(elementText(changeCase(s, "title").elements[0])).toBe("The End");
    s = renameCharacter(s, "mara", "Nora");
    expect(elementText(s.elements[1])).toBe("NORA (V.O.)");
  });
});

describe("dual dialogue", () => {
  const els = [el("c1", "Character", "ANA"), el("d1", "Dialogue", "Hello there my friend."), el("c2", "Character", "BEN"), el("d2", "Dialogue", "Hi.")];
  it("toggle marks both groups and toggles off", () => {
    const on = toggleDual({ elements: els, cursor: { id: "d1", offset: 0 } });
    expect(on.elements.map((e) => e.dual)).toEqual([1, 1, 2, 2]);
    expect(toggleDual({ elements: on.elements, cursor: { id: "d2", offset: 0 } }).elements.every((e) => !e.dual)).toBe(true);
  });
  it("toggle creates the second speaker when missing", () => {
    const on = toggleDual({ elements: els.slice(0, 2), cursor: { id: "d1", offset: 0 } });
    expect(on.elements.map((e) => e.dual)).toEqual([1, 1, 2, 2]);
  });
  it("lays columns side by side, top aligned", () => {
    const p = paginateElements(els.map((e, i) => ({ ...e, dual: (i < 2 ? 1 : 2) as 1 | 2 })), m)[0];
    const left = p.lines.filter((l) => l.col === 1), right = p.lines.filter((l) => l.col === 2);
    expect(left[0].row).toBe(0); expect(right[0].row).toBe(0);
    expect(left[0].leftIn!).toBeLessThan(right[0].leftIn!);
    expect(right.every((l) => l.rightIn! <= 8.0)).toBe(true);
    expect(left.every((l) => l.rightIn! <= 4.5)).toBe(true);
  });
});

describe("locking / page break / mores", () => {
  const big = Array.from({ length: 60 }, (_, i) => [el(`h${i}`, "Scene Heading", `INT. R${i} - DAY`), el(`a${i}`, "Action", "Words here. ".repeat(10))]).flat();
  it("locked pages keep numbers; overflow becomes A pages", () => {
    const pages = paginateElements(big, m);
    const lock = lockEntries(pages);
    const edited = big.slice(); edited[1] = el("a0", "Action", "Extra sentence here. ".repeat(80));
    const after = paginateElements(edited, m, { lock });
    expect(after.some((p) => /^\d+A$/.test(p.label))).toBe(true);
    const base = new Set(lock.map((l) => l.label));
    expect(after.filter((p) => !/[A-Z]$/.test(p.label)).every((p) => base.has(p.label))).toBe(true);
  });
  it("forces a page break", () => {
    const pages = paginateElements([el("a", "Action", "one"), el("b", "Action", "two", { breakBefore: true })], m);
    expect(pages.length).toBe(2);
  });
  it("omits MORE/CONT'D when disabled", () => {
    const els = [el("c", "Character", "MARA"), el("d", "Dialogue", "word ".repeat(900))];
    const all = paginateElements(els, m, { mores: false }).flatMap((p) => p.lines.map((l) => l.text));
    expect(all.some((t) => t === "(MORE)" || t.includes("CONT'D"))).toBe(false);
  });
});

describe("navigator + reports", () => {
  const els = [el("h1", "Scene Heading", "INT. A - DAY"), el("a1", "Action", "First."), el("h2", "Scene Heading", "EXT. B - NIGHT"), el("c", "Character", "ANA"), el("d", "Dialogue", "Hi there."), el("h3", "Scene Heading", "INT. A - NIGHT"), el("a3", "Action", "Third.")];
  it("lists and reorders scenes with live numbers", () => {
    expect(sceneList(els).map((s) => [s.number, s.heading])).toEqual([[1, "INT. A - DAY"], [2, "EXT. B - NIGHT"], [3, "INT. A - NIGHT"]]);
    const moved = moveScene(els, "h3", "h1");
    expect(moved.map((e) => e.id)).toEqual(["h3", "a3", "h1", "a1", "h2", "c", "d"]);
    expect(moveScene(els, "h1", null).map((e) => e.id).slice(-2)).toEqual(["h1", "a1"]);
    expect(moveScene(els, "h1", "h1")).toBe(els);
  });
  it("reports", () => {
    const r = Object.fromEntries(buildReports(els, paginateElements(els, m)).map((x) => [x.id, x]));
    expect(r.scene.rows.map((x) => x[1])).toEqual(["INT. A - DAY", "EXT. B - NIGHT", "INT. A - NIGHT"]);
    expect(r.character.rows[0].slice(0, 4)).toEqual(["ANA", 1, 1, 2]);
    expect(r.location.rows[0].slice(0, 2)).toEqual(["A", 2]);
    expect(r.script.rows[0]).toEqual(["Pages", 1]);
  });
});

describe("fountain", () => {
  const src = `Title: The Test\nAuthor: A. Writer\n\nINT. HOUSE - DAY\n\nAction with *italic* and **bold**.\n\nMARA\n(softly)\nI am here.\n\nBEN ^\nMe too.\n\nCUT TO:\n\n.FLASHBACK\n`;
  it("parses elements, title page, dual and inline styles", () => {
    const p = parseFountain(src);
    expect(p.titlePage).toEqual({ Title: "The Test", Author: "A. Writer" });
    expect(p.elements.map((e) => e.type)).toEqual(["Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Character", "Dialogue", "Transition", "Scene Heading"]);
    expect(p.elements[1].runs).toEqual([{ text: "Action with " }, { text: "italic", italic: true }, { text: " and " }, { text: "bold", bold: true }, { text: "." }]);
    expect(p.elements.slice(2, 7).map((e) => e.dual)).toEqual([1, 1, 1, 2, 2]);
  });
  it("round-trips", () => {
    const p = parseFountain(src);
    const meta = { ...defaultMeta(), titlePage: { ...defaultMeta().titlePage, ...p.titlePage, Credit: "" } };
    const again = parseFountain(toFountain(p.elements, meta));
    expect(again.elements.map((e) => [e.type, elementText(e), e.dual])).toEqual(p.elements.map((e) => [e.type, elementText(e), e.dual]));
  });
});

describe("fdx", () => {
  it("round-trips including dual dialogue, styles and escaping", () => {
    const els = [el("h", "Scene Heading", "INT. A & B - DAY"), { id: "a", type: "Action", runs: [{ text: "x " }, { text: "bold", bold: true, italic: true }] },
      el("c1", "Character", "ANA", { dual: 1 }), el("d1", "Dialogue", "<hi>", { dual: 1 }), el("c2", "Character", "BEN", { dual: 2 }), el("d2", "Dialogue", "yo", { dual: 2 })] as any[];
    const meta = { ...defaultMeta("Pilot"), titlePage: { ...defaultMeta("Pilot").titlePage, Author: "Sam" } };
    const xml = toFdx(els, meta);
    const p = parseFdx(xml);
    expect(p.elements.map((e) => [e.type, elementText(e), e.dual])).toEqual(els.map((e) => [e.type, elementText(e), e.dual]));
    expect(p.elements[1].runs[1]).toEqual({ text: "bold", bold: true, italic: true });
    expect(p.titlePage.Title).toBe("Pilot"); expect(p.titlePage.Author).toBe("SAM");
  });
});

describe("fdx from Final Draft", () => {
  const P = 'Alignment="Left" FirstIndent="0.00" Leading="Regular" LeftIndent="0.00" RightIndent="1.39" SpaceBefore="0" Spacing="1" StartsNewPage="No"';
  const F = 'AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier Final Draft" RevisionID="0" Size="12"';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="6">
  <Content>
    <Paragraph Type="Scene Heading">
      <SceneProperties Length="2 1/8" Page="1" Title="">
        <SceneArcBeats><CharacterArcBeat Name="X"><Paragraph ${P}><Text ${F} Style=""></Text></Paragraph></CharacterArcBeat></SceneArcBeats>
      </SceneProperties>
      <ScriptNote Author="" Color="#000000000000" Name="" Type=""><Paragraph ${P}><Text ${F} Style="">note body</Text></Paragraph></ScriptNote>
      <Text>INT. KITCHEN - DAY</Text>
    </Paragraph>
    <Paragraph Type="Action"><Text ${F} Style="Bold">He </Text><Text ${F} Style="">waits &amp; sighs.</Text></Paragraph>
    <Paragraph Type="Scene Heading" Number="2"><SceneProperties Length="1" Page="2" Title="a &gt; b"/><Text Style="AllCaps">ext. street - night</Text></Paragraph>
    <Paragraph><DualDialogue>
      <Paragraph Type="Character"><Text>ANA</Text></Paragraph><Paragraph Type="Dialogue"><Text>Hi</Text></Paragraph>
      <Paragraph Type="Character"><Text>BEN</Text></Paragraph><Paragraph Type="Dialogue"><Text>Yo</Text></Paragraph>
    </DualDialogue></Paragraph>
    <Paragraph Type="Scene Heading"><Text>INT. ROOM - NIGHT</Text></Paragraph>
  </Content>
  <TitlePage><Content><Paragraph Alignment="Center"><Text Style="Bold">MY FILM</Text></Paragraph><Paragraph Alignment="Center"><Text>Written by</Text></Paragraph><Paragraph Alignment="Center"><Text>Sam</Text></Paragraph></Content></TitlePage>
</FinalDraft>`;
  it("keeps every scene heading even with nested SceneProperties / ScriptNote paragraphs", () => {
    const p = parseFdx(xml);
    expect(p.elements.map((e) => [e.type, elementText(e), e.dual])).toEqual([
      ["Scene Heading", "INT. KITCHEN - DAY", undefined], ["Action", "He waits & sighs.", undefined], ["Scene Heading", "EXT. STREET - NIGHT", undefined],
      ["Character", "ANA", 1], ["Dialogue", "Hi", 1], ["Character", "BEN", 2], ["Dialogue", "Yo", 2], ["Scene Heading", "INT. ROOM - NIGHT", undefined],
    ]);
    expect(p.elements[1].runs[0]).toEqual({ text: "He ", bold: true });
    expect(p.titlePage).toMatchObject({ Title: "MY FILM", Credit: "Written by", Author: "Sam" });
  });
});

describe("meta", () => {
  it("sanitises untrusted meta", () => {
    const x = parseMeta({ header: 5, watermark: "x".repeat(100), revision: { pass: 99, locked: [{ id: "a", label: "1" }, { nope: 1 }] }, view: "evil" });
    expect(x.header).toBe(""); expect(x.watermark.length).toBe(40); expect(x.revision.pass).toBe(1); expect(x.revision.locked).toEqual([{ id: "a", label: "1" }]); expect(x.view).toBe("day");
  });
});

describe("grammar + synonyms", () => {
  it("finds repeated words, unbalanced ¿? ¡!, and lower-case sentence starts (Spanish)", async () => {
    const { grammarIssues } = await import("./grammar");
    const kinds = (t: string) => grammarIssues(t, "es").map((i) => i.message);
    expect(kinds("Fui a la la tienda.")[0]).toContain("repetida");
    expect(kinds("Dónde estás?")[0]).toContain("apertura");
    expect(kinds("¿Dónde estás")[0]).toContain("cierre");
    expect(kinds("Se fue. luego volvió.")[0]).toContain("mayúscula");
    expect(kinds("¿Dónde estás? ¡Ven aquí! Ya voy, ya ya.")).toEqual([]);
    expect(kinds("Fue a ver si venía. Etc. pero no")).toEqual([]);
  });
  it("parses sinonimosonline.com senses", async () => {
    const { parseSynonyms, cleanWord, slug } = await import("../lib/synonyms");
    const html = '<div class="synonim"><div class="sentido">Lugar donde alguien vive:</div><p class="sinonimos"><em class="number">1</em> <a href="/domicilio/" class="sinonimo">domicilio</a>, <a href="/residencia/" class="sinonimo">residencia</a>, <a href="/habitacion/" class="sinonimo">habitaci&oacute;n</a>.<span class="ejemplo">Ejemplo: <em>x</em></span></p></div><div class="synonim"><div class="sentido">Familia:</div><p class="sinonimos"><a href="/linaje/" class="sinonimo">linaje</a></p></div>';
    expect(parseSynonyms(html)).toEqual([{ meaning: "Lugar donde alguien vive", words: ["domicilio", "residencia", "habitación"] }, { meaning: "Familia", words: ["linaje"] }]);
    expect(cleanWord(" Casa ")).toBe("casa"); expect(cleanWord("../etc/passwd")).toBeNull(); expect(cleanWord("dos palabras")).toBeNull();
    expect(slug("habitación")).toBe("habitacion"); expect(slug("niño")).toBe("nino");
  });
});

describe("typing flow (spec)", () => {
  it("uppercases scene headings and characters as you type", async () => {
    const d = await import("./doc");
    let s: DocState = { elements: [el("h", "Scene Heading", "")], cursor: { id: "h", offset: 0 } };
    s = d.insertText(s, "int. cocina - día");
    expect(s.elements[0].runs[0].text).toBe("INT. COCINA - DÍA");
  });
  it("Tab turns Action into Character; Tab in Dialogue opens a Parenthetical with brackets; Enter after it returns to Dialogue", async () => {
    const d = await import("./doc");
    let s: DocState = { elements: [el("a", "Action", "marta")], cursor: { id: "a", offset: 5 } };
    s = d.tabFlow(s)!; expect(s.elements[0].type).toBe("Character"); expect(s.elements[0].runs[0].text).toBe("MARTA");
    s = d.enter(s); expect(s.elements[1].type).toBe("Dialogue");
    s = d.tabFlow(s)!; expect(s.elements[1].type).toBe("Parenthetical"); expect(s.elements[1].runs[0].text).toBe("()"); expect(s.cursor.offset).toBe(1);
    s = d.insertText(s, "susurrando"); expect(s.elements[1].runs[0].text).toBe("(susurrando)");
    s = d.enter(s); expect(s.elements[2].type).toBe("Dialogue"); expect(s.elements[1].runs[0].text).toBe("(susurrando)");
    const withText: DocState = { elements: [el("c", "Character", "A"), el("d", "Dialogue", "Hola")], cursor: { id: "d", offset: 4 } };
    const t = d.tabFlow(withText)!; expect(t.elements.map((e) => e.type)).toEqual(["Character", "Dialogue", "Parenthetical"]);
  });
  it("spaces stay on their line, so the caret can follow every typed space", async () => {
    const { wrap, lineStarts } = await import("./measure");
    const text = "uno  dos tres    ";
    const lines = wrap(text, 8);
    expect(lines.join("")).toBe(text);
    expect(lineStarts(text, lines)[1]).toBe(lines[0].length);
  });
});

describe("new elements in Fountain", () => {
  it("round-trips Summary, Note and End of Act", async () => {
    const { parseFountain, toFountain } = await import("./fountain");
    const els = [el("s", "Summary", "Ella llega a casa."), el("n", "Note", "revisar el tono"), el("h", "Scene Heading", "INT. CASA - DÍA"), el("e", "End of Act", "FIN DEL ACTO UNO")] as any[];
    const out = parseFountain(toFountain(els, defaultMeta()));
    expect(out.elements.map((e) => [e.type, elementText(e)])).toEqual([["Summary", "Ella llega a casa."], ["Note", "revisar el tono"], ["Scene Heading", "INT. CASA - DÍA"], ["End of Act", "FIN DEL ACTO UNO"]]);
  });
});

describe("templates", () => {
  it("builds all six templates in both languages with valid, unique elements", async () => {
    const { TEMPLATES, buildTemplate } = await import("./templates");
    const { parseElements } = await import("../lib/scripts");
    expect(TEMPLATES.map((t) => t.id)).toEqual(["short", "screenplay", "series", "stage", "graphic", "structure"]);
    for (const t of TEMPLATES) for (const lang of ["es", "en"] as const) {
      const b = buildTemplate(t.id, lang);
      expect(parseElements(JSON.parse(JSON.stringify(b.elements)))).not.toBeNull();
      expect(b.meta.language).toBe(lang); expect(b.title.length).toBeGreaterThan(3);
    }
    expect(buildTemplate("series", "es").elements.filter((e) => e.type === "End of Act").length).toBe(5);
    expect(buildTemplate("structure", "es").elements.some((e) => e.type === "Summary")).toBe(true);
    // Short Film replaces the old blank script: 30 minutes by default, a title page and a first scene heading
    const sf = buildTemplate("short", "en");
    expect(sf.meta.targetMinutes).toBe(30); expect(sf.title).toBe("Untitled Short Film"); expect(sf.meta.titlePage.Title).toBe("Untitled Short Film");
    expect(sf.elements.some((e) => e.type === "Scene Heading")).toBe(true);
    expect(buildTemplate("screenplay", "en").meta.targetMinutes).toBe(90);
  });
});

describe("spelling suggestions (real Spanish dictionary)", () => {
  it("puts the most plausible correction first", async () => {
    const fs = await import("node:fs"); const nspell = (await import("nspell")).default; const { rankSuggestions } = await import("../lib/rank");
    const sp = nspell(fs.readFileSync("public/dict/es.aff", "utf8"), fs.readFileSync("public/dict/es.dic", "utf8"));
    const top = (w: string) => rankSuggestions(w, sp.suggest(w))[0];
    expect(top("kasa")).toBe("casa"); expect(top("tambien")).toBe("también"); expect(top("asi")).toBe("así");
    expect(top("haver")).toBe("haber"); expect(top("perrro")).toBe("perro"); expect(top("exsistir")).toBe("existir");
    expect(sp.correct("tienda")).toBe(true); expect(sp.correct("perro")).toBe(true);
  });
});

describe("capital letters and exchanges (user rules)", () => {
  it("capitalises the first word of an Action line as it is typed, but not later edits", async () => {
    const d = await import("./doc");
    let s: DocState = { elements: [el("a", "Action", "")], cursor: { id: "a", offset: 0 } };
    s = d.insertText(s, "m"); expect(s.elements[0].runs[0].text).toBe("M");
    s = d.insertText(s, "aría camina"); expect(s.elements[0].runs[0].text).toBe("María camina");
    // user lowercases it on purpose later: left alone
    s = { elements: [el("a", "Action", "María camina")], cursor: { id: "a", offset: 12 } };
    s = d.insertText(s, " rápido"); expect(s.elements[0].runs[0].text).toBe("María camina rápido");
    const mid: DocState = { elements: [el("a", "Action", "hola")], cursor: { id: "a", offset: 4 } };
    expect(d.insertText(mid, "!").elements[0].runs[0].text).toBe("hola!"); // typing elsewhere does not rewrite the first letter
    const dlg: DocState = { elements: [el("d", "Dialogue", "")], cursor: { id: "d", offset: 0 } };
    expect(d.insertText(dlg, "hola").elements[0].runs[0].text).toBe("Hola"); // Dialogue, General, Summary and Note too (not Parenthetical)
    const pasted: DocState = { elements: [el("a", "Action", "")], cursor: { id: "a", offset: 0 } };
    expect(d.insertText(pasted, "luego sale").elements[0].runs[0].text).toBe("Luego sale");
  });
  it("Return after the second speech in a row starts a new Character, after a lone speech it starts Action", async () => {
    const d = await import("./doc");
    const lone: DocState = { elements: [el("a", "Action", "x"), el("c1", "Character", "ANA"), el("d1", "Dialogue", "Hola")], cursor: { id: "d1", offset: 4 } };
    expect(d.enter(lone).elements[3].type).toBe("Action");
    const exch: DocState = { elements: [el("a", "Action", "x"), el("c1", "Character", "ANA"), el("d1", "Dialogue", "Hola"), el("c2", "Character", "BEN"), el("d2", "Dialogue", "Qué tal")], cursor: { id: "d2", offset: 7 } };
    expect(d.enter(exch).elements[5].type).toBe("Character");
    const withParen: DocState = { elements: [el("c1", "Character", "ANA"), el("d1", "Dialogue", "Hola"), el("c2", "Character", "BEN"), el("p", "Parenthetical", "(sonríe)"), el("d2", "Dialogue", "Bien")], cursor: { id: "d2", offset: 4 } };
    expect(d.enter(withParen).elements[5].type).toBe("Character");
    expect(d.inExchange(lone.elements, 2)).toBe(false);
  });
});

describe("page layout", () => {
  it("parses and clamps untrusted layouts; the text area can never collapse", async () => {
    const { parseLayout, DEFAULT_LAYOUT, linesPerPage, widthCharsFor } = await import("./layout");
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(linesPerPage(DEFAULT_LAYOUT)).toBe(54);
    expect(widthCharsFor("Dialogue", DEFAULT_LAYOUT)).toBe(35); // dialogue keeps its 3.5in column whatever the margins
    const a4 = parseLayout({ page: "a4", left: 2, right: 2, top: 2.5, bottom: 2.5, fontPt: 11, spacing: 1.5 });
    expect(a4.width).toBe(8.27); expect(a4.height).toBe(11.69);
    expect(linesPerPage(a4)).toBeLessThan(54);
    const crazy = parseLayout({ left: 99, right: 99, fontPt: 400, spacing: -4, font: "Comic Sans", headingGap: 99 });
    expect(crazy.width - crazy.left - crazy.right).toBeGreaterThanOrEqual(3); expect(crazy.fontPt).toBeLessThanOrEqual(16); expect(crazy.font).toBe("Courier Prime"); expect(crazy.headingGap).toBeLessThanOrEqual(4);
  });
  it("narrower margins give longer Action lines; pages follow page size, spacing and gaps", async () => {
    const { parseLayout, DEFAULT_LAYOUT, widthCharsFor, linesPerPage } = await import("./layout");
    const wide = parseLayout({ v: 2, right: 0.3 });
    expect(widthCharsFor("Action", wide)).toBeGreaterThan(widthCharsFor("Action", DEFAULT_LAYOUT));
    const els = Array.from({ length: 120 }, (_, i) => el(`a${i}`, "Action", "Una línea de acción que ocupa varias palabras. ".repeat(4)));
    const pagesDefault = paginateElements(els, new CachedMeasurer(DEFAULT_LAYOUT));
    const dbl = parseLayout({ spacing: 2 });
    const pagesDouble = paginateElements(els, new CachedMeasurer(dbl));
    expect(pagesDouble.length).toBeGreaterThan(pagesDefault.length);
    expect(pagesDouble.every((p) => p.rows <= linesPerPage(dbl))).toBe(true);
    const tight = parseLayout({ blockGap: 0 });
    expect(paginateElements(els, new CachedMeasurer(tight)).length).toBeLessThan(pagesDefault.length);
    // every line carries its own horizontal extent
    expect(pagesDefault[0].lines.every((l) => l.rightIn > l.leftIn)).toBe(true);
  });
});

import { deleteWordBack, deleteWordForward, setType, wordEnd, wordStart } from "./doc";
import { DEFAULT_LAYOUT, parseLayout, boxOf, placeLine, spaceBefore } from "./layout";

describe("v2.5 editing rules", () => {
  const st = (type: any, text: string, offset = text.length): DocState => ({ elements: [el("a", type, text)], cursor: { id: "a", offset } });
  it("Parenthetical opens its brackets and keeps typing inside them", () => {
    let s = setType(st("Dialogue", ""), "Parenthetical");
    expect(elementText(s.elements[0])).toBe("()"); expect(s.cursor.offset).toBe(1);
    s = insertText(s, "quietly");
    expect(elementText(s.elements[0])).toBe("(quietly)");
    s = insertText({ ...s, cursor: { id: "a", offset: 9 } }, " now"); // caret after the closing bracket
    expect(elementText(s.elements[0])).toBe("(quietly now)");
    expect(elementText(setType(st("Dialogue", "whispering"), "Parenthetical").elements[0])).toBe("(whispering)");
  });
  it("first letter is capitalised in General, Dialogue, Summary, Note and Action", () => {
    for (const t of ["General", "Dialogue", "Summary", "Note", "Action"]) expect(elementText(insertText(st(t, "", 0), "hola").elements[0])).toBe("Hola");
    expect(elementText(insertText(st("Character", "", 0), "ana").elements[0])).toBe("ANA");
  });
  it("Ctrl+Backspace / Ctrl+Delete work like Word", () => {
    const t = "one two  three";
    expect(wordStart(t, 14)).toBe(9); expect(wordStart(t, 9)).toBe(4); expect(wordStart(t, 3)).toBe(0);
    expect(wordEnd(t, 0)).toBe(4); expect(wordEnd(t, 4)).toBe(9);
    expect(elementText(deleteWordBack(st("Action", t)).elements[0])).toBe("one two  ");
    expect(elementText(deleteWordBack(st("Action", t, 9)).elements[0])).toBe("one three");
    expect(elementText(deleteWordForward(st("Action", t, 0)).elements[0])).toBe("two  three");
    expect(elementText(deleteWordForward(st("Action", t, 4)).elements[0])).toBe("one three");
  });
  it("Dual Dialogue starts a pair from an empty line", () => {
    const on = toggleDual({ elements: [el("s", "Scene Heading", "INT. A - DAY"), el("a", "Action", "")], cursor: { id: "a", offset: 0 } });
    expect(on.elements.map((e) => [e.type, e.dual])).toEqual([["Scene Heading", undefined], ["Character", 1], ["Dialogue", 1], ["Character", 2], ["Dialogue", 2]]);
    expect(on.cursor.id).toBe(on.elements[1].id);
  });
  it("right margin is 3 cm; old narrow layouts are moved, wider ones kept", () => {
    expect(DEFAULT_LAYOUT.right).toBeCloseTo(1.1811, 3);
    expect(parseLayout({ page: "letter", right: 0.6 }).right).toBeCloseTo(1.1811, 3);
    expect(parseLayout({ page: "letter", right: 1.5 }).right).toBe(1.5);
    expect(parseLayout({ v: 2, right: 0.8 }).right).toBe(0.8);
    const p = paginateElements([el("a", "Action", "word ".repeat(40))], new CachedMeasurer(parseLayout({})))[0];
    expect(Math.max(...p.lines.map((l) => l.rightIn))).toBeCloseTo(8.5 - 1.1811, 3);
  });
  it("dual dialogue columns stay inside the 3 cm right margin", () => {
    const L = parseLayout({});
    const p = paginateElements([el("c1", "Character", "ANA", { dual: 1 }), el("d1", "Dialogue", "x ".repeat(40), { dual: 1 }), el("c2", "Character", "BEN", { dual: 2 }), el("d2", "Dialogue", "y ".repeat(40), { dual: 2 })], new CachedMeasurer(L), { layout: L })[0];
    expect(Math.max(...p.lines.map((l) => l.rightIn))).toBeLessThanOrEqual(8.5 - 1.1811 + 1e-6);
    expect(Math.max(...p.lines.filter((l) => l.col === 1).map((l) => l.rightIn))).toBeLessThan(Math.min(...p.lines.filter((l) => l.col === 2).map((l) => l.leftIn)));
  });
  it("per-element layout moves, aligns and spaces one element type only", () => {
    const L = parseLayout({ v: 2, elements: { Dialogue: { left: 3, right: 2.5, before: 2 }, Action: { align: "center" }, Bogus: { left: 1 } } });
    expect(boxOf("Dialogue", L)).toEqual({ left: 3, right: 6 });
    expect(boxOf("Character", L).left).toBeCloseTo(3.7, 5);
    expect(spaceBefore("Dialogue", L)).toBe(2); expect(spaceBefore("Action", L)).toBe(1);
    expect(placeLine("Action", "abcd", L).leftIn).toBeGreaterThan(1.5);
    const m2 = new CachedMeasurer(L);
    const pg = paginateElements([el("c", "Character", "ANA"), el("d", "Dialogue", "x ".repeat(60))], m2, { layout: L })[0];
    expect(pg.lines.filter((l) => l.type === "Dialogue").every((l) => l.leftIn === 3 && l.rightIn === 6)).toBe(true);
  });
});

describe("v2.6 selection across lines, scenes and pages", () => {
  const doc = (anchorId: string | undefined, anchor: number | undefined, id: string, offset: number): DocState => ({
    elements: [el("h1", "Scene Heading", "INT. CASA - DÍA"), el("a1", "Action", "Ana entra."), el("h2", "Scene Heading", "EXT. CALLE - NOCHE"), el("a2", "Action", "Llueve mucho.")],
    cursor: { id, offset, anchor, anchorId },
  });
  it("reads, deletes and replaces text spanning scenes, in either direction", async () => {
    const d = await import("./doc");
    const fwd = doc("a1", 4, "a2", 6), back = doc("a2", 6, "a1", 4);
    for (const s of [fwd, back]) {
      expect(d.span(s)).toEqual({ a: 1, ao: 4, b: 3, bo: 6 });
      expect(d.selectedText(s)).toBe("entra.\nEXT. CALLE - NOCHE\nLlueve");
      const del = d.deleteBack(s);
      expect(del.elements.map((e) => elementText(e))).toEqual(["INT. CASA - DÍA", "Ana  mucho."]);
      expect(del.cursor).toEqual({ id: "a1", offset: 4 });
      expect(elementText(insertText(s, "X").elements[1])).toBe("Ana X mucho.");
      expect(d.deleteForward(s).elements.length).toBe(2);
    }
  });
  it("Enter over a selection splits at its start; the selection never leaves orphan elements", async () => {
    const d = await import("./doc");
    const out = d.enter(doc("h1", 0, "a2", 12));
    expect(out.elements.length).toBe(2); // all text removed: first line stays, then the new line
    expect(out.cursor.anchor).toBeUndefined();
  });
  it("select all covers every element and survives a deleted anchor", async () => {
    const d = await import("./doc");
    const s = d.selectAll(doc(undefined, undefined, "a1", 0));
    expect(d.pieces(s).length).toBe(4);
    expect(d.deleteBack(s).elements.length).toBe(1);
    const stale = doc("gone", 2, "a1", 3);
    expect(d.span(stale)).toBeNull(); expect(d.hasSelection(stale)).toBe(false);
    expect(d.deleteBack(stale).elements.length).toBe(4 - 0); // plain Backspace on one character
  });
  it("bold and case apply to every selected line; bold turns off when all of it is bold", async () => {
    const d = await import("./doc");
    const s = doc("a1", 0, "a2", 5);
    const b = toggleFormat(s, "bold");
    expect(b.elements[1].runs.every((r) => r.bold)).toBe(true); expect(b.elements[2].runs.every((r) => r.bold)).toBe(true);
    expect(b.elements[3].runs[0].bold).toBe(true); expect(b.elements[3].runs[1].bold).toBeFalsy();
    expect(formatState(b, "bold")).toBe(true);
    const off = toggleFormat(b, "bold");
    expect(off.elements.every((e) => e.runs.every((r) => !r.bold))).toBe(true);
    const lo = changeCase(s, "lower");
    expect(elementText(lo.elements[2])).toBe("ext. calle - noche"); expect(elementText(lo.elements[3])).toBe("llueve mucho.");
    void d;
  });
});

describe("v2.6 stability and layout defaults", () => {
  it("a stale caret or an empty document is repaired instead of crashing the editor", async () => {
    const { sane, reduce, initHist } = await import("./history");
    const ok: DocState = { elements: [el("a", "Action", "hola")], cursor: { id: "a", offset: 2 } };
    expect(sane(ok)).toBe(ok);
    expect(sane({ elements: [el("a", "Action", "hola")], cursor: { id: "gone", offset: 2 } }).cursor).toEqual({ id: "a", offset: 0 });
    expect(sane({ elements: [el("a", "Action", "hola")], cursor: { id: "a", offset: 99 } }).cursor.offset).toBe(4);
    expect(sane({ elements: [], cursor: { id: "x", offset: 0 } }).elements.length).toBe(1);
    const h = reduce(initHist(ok), { t: "edit", fn: () => ({ elements: [], cursor: { id: "a", offset: 0 } }) });
    expect(h.cur.elements.length).toBe(1);
  });
  it("saved layouts are validated; the original layout and the saved one stay separate", async () => {
    const { parseLayout, DEFAULT_LAYOUT } = await import("./layout");
    const mine = parseLayout({ ...DEFAULT_LAYOUT, left: 2, fontPt: 11, elements: { Dialogue: { bold: true } } });
    expect(mine.left).toBe(2); expect(mine.fontPt).toBe(11); expect(mine.elements?.Dialogue?.bold).toBe(true);
    expect(DEFAULT_LAYOUT.left).toBe(1.5); expect(DEFAULT_LAYOUT.elements).toBeUndefined();
    expect(parseLayout({ left: 99, right: 99 }).left).toBe(DEFAULT_LAYOUT.left); // an unusable layout falls back, never collapses the page
  });
  it("the file store keeps safety copies, a saved default layout, and never lists them as scripts", async () => {
    const fs = await import("node:fs"); const os = await import("node:os"); const path = await import("node:path");
    const { FileStore } = await import("../lib/store");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gst-")); const st = new FileStore(dir);
    const { id } = await st.create("u", { title: "T", elements: [el("a", "Action", "one")], cursor: null });
    expect((await st.save("u", id, 0, { elements: [el("a", "Action", "two")] })).status).toBe("ok");
    expect(fs.readdirSync(path.join(dir, "backups")).filter((f) => f.startsWith(id)).length).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "backups", fs.readdirSync(path.join(dir, "backups"))[0]), "utf8")).elements[0].runs[0].text).toBe("one");
    expect(await st.getLayoutDefault()).toBeNull();
    await st.setLayoutDefault("u", { left: 2 }); expect(await st.getLayoutDefault()).toEqual({ left: 2 });
    expect((await st.list()).length).toBe(1);
    await st.setLayoutDefault("u", null); expect(await st.getLayoutDefault()).toBeNull();
    await st.remove("u", id); expect((await st.list()).length).toBe(0);
    expect(fs.readdirSync(path.join(dir, "backups")).filter((f) => f.startsWith(id)).length).toBe(2); // the deleted script is kept too
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
