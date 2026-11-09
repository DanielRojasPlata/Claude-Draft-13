import { defaultMeta, DocMeta, Lang } from "./meta";
import { Element, ElementType } from "./types";

export interface TemplateInfo { id: string; name: string; summary: string; blurb: Record<Lang, string> }
export interface Built { title: string; elements: Element[]; meta: DocMeta }

let n = 0;
const el = (type: ElementType, text: string): Element => ({ id: `t${Date.now().toString(36)}${(n++).toString(36)}`, type, runs: [{ text }] });

export const TEMPLATES: TemplateInfo[] = [
  { id: "short", name: "Short Film", summary: "Short film: title page, opening image, first scene. Target length 30 minutes.", blurb: { es: "Cortometraje de hasta 30 minutos: portada, imagen inicial y primera escena.", en: "Short film of up to 30 minutes: title page, opening image and first scene." } },
  { id: "screenplay", name: "Screenplay", summary: "Feature film: title page, opening image, first scene.", blurb: { es: "Largometraje con página de título y primera escena.", en: "Feature film with a title page and a first scene." } },
  { id: "series", name: "Series", summary: "TV episode: teaser and four acts with act breaks.", blurb: { es: "Episodio de televisión: teaser y cuatro actos.", en: "TV episode: teaser and four acts." } },
  { id: "stage", name: "Stage Play", summary: "Acts and scenes, cast list, stage directions.", blurb: { es: "Obra de teatro: reparto, actos, escenas y acotaciones.", en: "Stage play: cast, acts, scenes and stage directions." } },
  { id: "graphic", name: "Graphic Novel", summary: "Pages and panels with captions and balloons.", blurb: { es: "Novela gráfica: páginas, viñetas, cartelas y bocadillos.", en: "Graphic novel: pages, panels, captions and balloons." } },
  { id: "structure", name: "Story Structure", summary: "Three-act outline with beats, to plan before you write.", blurb: { es: "Esquema en tres actos con puntos de giro para planificar la historia.", en: "Three-act outline with turning points to plan the story." } },
];

/** Build a template's starting document. Text is written for the chosen script language. */
export function buildTemplate(id: string, lang: Lang): Built {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const meta = defaultMeta(); meta.language = lang;
  meta.titlePage.Credit = t("Escrito por", "Written by");
  let title = t("Guion sin título", "Untitled Screenplay"); let elements: Element[] = [];
  if (id === "short") meta.targetMinutes = 30; // a short film: 30 minutes on screen at most
  switch (id) {
    case "series":
      title = t("Episodio sin título", "Untitled Episode");
      meta.titlePage.Source = t("Serie · Episodio 1", "Series · Episode 1");
      elements = [
        el("Summary", t("Logline del episodio: quién quiere qué y qué se lo impide.", "Episode logline: who wants what, and what stands in the way.")),
        el("General", t("TEASER", "TEASER")), el("Scene Heading", t("INT. LUGAR - DÍA", "INT. PLACE - DAY")), el("Action", t("Un gancho que obliga a seguir viendo.", "A hook that makes the audience stay.")),
        el("End of Act", t("FIN DEL TEASER", "END OF TEASER")),
        ...[t("PRIMER ACTO", "ACT ONE"), t("SEGUNDO ACTO", "ACT TWO"), t("TERCER ACTO", "ACT THREE"), t("CUARTO ACTO", "ACT FOUR")].flatMap((a, i) => [
          el("General", a), el("Scene Heading", t("INT. LUGAR - NOCHE", "INT. PLACE - NIGHT")), el("Action", ""),
          el("End of Act", i === 3 ? t("FIN DEL EPISODIO", "END OF EPISODE") : t(`FIN DEL ACTO ${["UNO", "DOS", "TRES"][i]}`, `END OF ACT ${["ONE", "TWO", "THREE"][i]}`)),
        ]),
      ];
      break;
    case "stage":
      title = t("Obra sin título", "Untitled Play");
      elements = [
        el("General", t("PERSONAJES", "CHARACTERS")), el("General", t("PRIMER PERSONAJE, edad y rasgo.", "FIRST CHARACTER, age and trait.")), el("General", t("SEGUNDO PERSONAJE, edad y rasgo.", "SECOND CHARACTER, age and trait.")),
        el("General", t("ACTO I", "ACT I")), el("Scene Heading", t("ESCENA 1. Un lugar, una hora.", "SCENE 1. A place, a time.")),
        el("Action", t("(Acotación: el estado del escenario al abrirse el telón.)", "(Stage direction: the state of the stage as the curtain rises.)")),
        el("Character", t("PRIMER PERSONAJE", "FIRST CHARACTER")), el("Dialogue", ""),
        el("End of Act", t("TELÓN", "CURTAIN")),
      ];
      break;
    case "graphic":
      title = t("Novela gráfica sin título", "Untitled Graphic Novel");
      elements = [
        el("General", t("PÁGINA 1", "PAGE 1")),
        el("Shot", t("VIÑETA 1", "PANEL 1")), el("Action", t("Plano general. Describe lo que se ve, no lo que se piensa.", "Wide shot. Describe what is seen, not what is thought.")),
        el("Parenthetical", t("(CARTELA)", "(CAPTION)")), el("Dialogue", ""),
        el("Shot", t("VIÑETA 2", "PANEL 2")), el("Action", ""),
        el("Character", t("PERSONAJE", "CHARACTER")), el("Dialogue", ""),
        el("Note", t("Notas para el dibujante: ritmo, encuadre, color.", "Notes for the artist: pacing, framing, colour.")),
      ];
      break;
    case "structure":
      title = t("Planificación de la historia", "Story Structure Plan");
      meta.titlePage.Credit = "";
      elements = [
        el("Summary", t("Idea central en una frase.", "Core idea in one sentence.")),
        el("General", t("ACTO 1 · PLANTEAMIENTO", "ACT 1 · SETUP")), el("Summary", t("Imagen inicial y mundo del protagonista.", "Opening image and the protagonist's world.")), el("Summary", t("Incidente incitante: lo que rompe la rutina.", "Inciting incident: what breaks the routine.")),
        el("Summary", t("Primer punto de giro: no hay vuelta atrás.", "First turning point: no way back.")), el("End of Act", t("FIN DEL ACTO 1", "END OF ACT 1")),
        el("General", t("ACTO 2 · CONFRONTACIÓN", "ACT 2 · CONFRONTATION")), el("Summary", t("Obstáculos crecientes y aliados.", "Rising obstacles and allies.")), el("Summary", t("Punto medio: todo cambia.", "Midpoint: everything changes.")),
        el("Summary", t("Todo está perdido: el punto más bajo.", "All is lost: the lowest point.")), el("End of Act", t("FIN DEL ACTO 2", "END OF ACT 2")),
        el("General", t("ACTO 3 · RESOLUCIÓN", "ACT 3 · RESOLUTION")), el("Summary", t("Clímax: la decisión final.", "Climax: the final choice.")), el("Summary", t("Imagen final: qué ha cambiado.", "Final image: what has changed.")),
        el("Note", t("Convierte cada resumen en una escena cuando estés listo.", "Turn each summary into a scene when you are ready.")),
      ];
      break;
    case "short":
      title = t("Cortometraje sin título", "Untitled Short Film");
      meta.titlePage.Source = t("Cortometraje", "Short film");
      elements = [
        el("Action", t("FUNDIDO DE ENTRADA:", "FADE IN:")), el("Scene Heading", t("INT. LUGAR - DÍA", "INT. PLACE - DAY")),
        el("Action", t("Una imagen que presente el mundo y la pregunta de la historia.", "An image that introduces the world and the question of the story.")),
        el("Character", t("PROTAGONISTA", "PROTAGONIST")), el("Dialogue", ""),
      ];
      break;
    default: // screenplay
      meta.titlePage.Title = "";
      elements = [
        el("Action", t("FUNDIDO DE ENTRADA:", "FADE IN:")), el("Scene Heading", t("INT. LUGAR - DÍA", "INT. PLACE - DAY")),
        el("Action", t("Presenta el mundo y al protagonista con una imagen, no con una explicación.", "Introduce the world and the protagonist with an image, not an explanation.")),
        el("Character", t("PROTAGONISTA", "PROTAGONIST")), el("Parenthetical", t("(en voz baja)", "(quietly)")), el("Dialogue", t("Una primera frase que diga quién es.", "A first line that says who they are.")),
        el("Transition", t("CORTE A:", "CUT TO:")), el("Scene Heading", t("EXT. OTRO LUGAR - NOCHE", "EXT. ANOTHER PLACE - NIGHT")), el("Action", ""),
      ];
  }
  meta.titlePage.Title = id === "screenplay" ? "" : title;
  if (id === "short") meta.titlePage.Credit = t("Escrito por", "Written by");
  return { title, elements, meta };
}
