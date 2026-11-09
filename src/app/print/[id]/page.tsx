import { notFound, redirect } from "next/navigation";
import { AutoPrint } from "@/components/AutoPrint";
import { hasTitlePage, indexElements, PageSheet, TitleSheet } from "@/components/PageSheet";
import { CachedMeasurer } from "@/engine/measure";
import { parseMeta } from "@/engine/meta";
import { sceneList } from "@/engine/navigator";
import { paginateElements } from "@/engine/paginate";
import { docFromRow } from "@/lib/scripts";
import { currentUserId } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Server-rendered, fixed-geometry pages for PDF export and printing. */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const { id } = await params; const { auto } = await searchParams;
  const row = await (await getStore()).get(userId, id);
  if (!row) notFound();
  const doc = docFromRow(row.elements, row.cursor);
  if (!doc) notFound();
  const meta = parseMeta(row.meta, row.title);
  const pages = paginateElements(doc.elements, new CachedMeasurer(meta.layout), { lock: meta.revision.locked, mores: meta.mores, lang: meta.language });
  const byId = indexElements(doc.elements);
  const sceneNo = new Map(sceneList(doc.elements).map((s) => [s.id, s.number]));
  return (
    <div className="print-root">
      <style>{`@page { size: ${meta.layout.width}in ${meta.layout.height}in; margin: 0 } html, body { background: #fff !important; margin: 0 } .print-root .sheet { position: relative; overflow: hidden; break-after: page; page-break-after: always; box-shadow: none } .print-root .sheet:last-child { break-after: auto; page-break-after: auto } @media screen { .print-root .sheet { margin: 12px auto; box-shadow: 0 2px 12px rgba(0,0,0,.2) } html, body { background: #888 !important } }`}</style>
      {hasTitlePage(meta) && <TitleSheet meta={meta} print />}
      {pages.map((p, i) => <PageSheet key={p.number} page={p} index={i} elsById={byId} sceneNo={sceneNo} meta={meta} print />)}
      {auto === "1" && <AutoPrint />}
    </div>
  );
}
