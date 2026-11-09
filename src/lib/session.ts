import { isDesktop } from "@/lib/store";

/** The signed-in user's id; the desktop app is a single local profile with no sign-in. */
export async function currentUserId(): Promise<string | null> {
  if (isDesktop()) return "local";
  const { auth } = await import("@/auth");
  return (await auth())?.user?.id ?? null;
}
