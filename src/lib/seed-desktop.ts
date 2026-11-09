import { SAMPLE } from "@/engine/sample";
import { defaultMeta } from "@/engine/meta";
import type { Store } from "./store";

let done = false;
/** First launch of the desktop app: never an empty workspace. */
export async function seedDesktop(s: Store) {
  if (done) return; done = true;
  if ((await s.list("local")).length) return;
  const meta = defaultMeta("The Last Light"); meta.titlePage.Author = "Your Name";
  await s.create("local", { title: "The Last Light", elements: SAMPLE.elements, cursor: SAMPLE.cursor, meta });
}
