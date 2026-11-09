import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { SAMPLE } from "../src/engine/sample";
import { toJson } from "../src/lib/scripts";

const db = new PrismaClient();
async function main() {
  const user = await db.user.upsert({
    where: { email: "demo@guionista.app" },
    update: {},
    create: { email: "demo@guionista.app", name: "Demo Writer", passwordHash: await hashPassword("guionista-demo") },
  });
  const has = await db.script.count({ where: { userId: user.id } });
  if (has === 0) {
    await db.script.create({ data: { userId: user.id, title: "The Last Light", elements: toJson(SAMPLE.elements), cursor: toJson(SAMPLE.cursor) } });
    await db.script.create({ data: { userId: user.id, title: "Untitled Screenplay", elements: toJson([{ id: "n0", type: "Scene Heading", runs: [{ text: "" }] }]), cursor: toJson({ id: "n0", offset: 0 }) } });
  }
}
main().finally(() => db.$disconnect());
