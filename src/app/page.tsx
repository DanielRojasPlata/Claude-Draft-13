import { redirect } from "next/navigation";
import { Welcome } from "@/components/Welcome";
import { currentUserId } from "@/lib/session";
import { getStore, isDesktop } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The first page: template gallery, open a file, recent scripts. */
export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const rows = await (await getStore()).list(userId);
  return <Welcome desktop={isDesktop()} recent={rows.slice(0, 40).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(), count: r.count, file: r.file ?? "" }))} />;
}
