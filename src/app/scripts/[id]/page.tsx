import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/Editor";
import { parseMeta } from "@/engine/meta";
import { docFromRow } from "@/lib/scripts";
import { currentUserId } from "@/lib/session";
import { getStore, isDesktop } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const { id } = await params;
  const row = await (await getStore()).get(userId, id);
  if (!row) notFound();
  const doc = docFromRow(row.elements, row.cursor);
  if (!doc) throw new Error("Stored script is malformed");
  return <Editor scriptId={row.id} title={row.title} initial={doc} initialMeta={parseMeta(row.meta, row.title)} rev={row.rev} desktop={isDesktop()} />;
}
