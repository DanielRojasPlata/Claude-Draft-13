"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/session";
import { getStore } from "@/lib/store";
import { defaultMeta } from "@/engine/meta";
import { parseLayout } from "@/engine/layout";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { makeElement } from "@/engine/doc";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function uid() {
  const id = await currentUserId();
  if (!id) redirect("/login");
  return id;
}

export async function login(form: FormData) {
  try {
    const { signIn } = await import("@/auth");
    await signIn("credentials", { email: str(form.get("email")), password: str(form.get("password")), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=credentials");
    throw e;
  }
}

export async function register(form: FormData) {
  const name = str(form.get("name")), email = str(form.get("email")).toLowerCase(), password = str(form.get("password"));
  if (!name || name.length > 80) redirect("/login?mode=register&error=name");
  if (!EMAIL.test(email)) redirect("/login?mode=register&error=email");
  if (password.length < 8 || password.length > 200) redirect("/login?mode=register&error=password");
  if (await db.user.findUnique({ where: { email } })) redirect("/login?mode=register&error=taken");
  await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  await login(form);
}

export async function logout() { const { signOut } = await import("@/auth"); await signOut({ redirectTo: "/login" }); }

export async function createScript(form: FormData) {
  const userId = await uid();
  const title = str(form.get("title")).slice(0, 120) || "Untitled Screenplay";
  const first = makeElement("Scene Heading");
  const store = await getStore(); const meta = defaultMeta(title);
  const saved = await store.getLayoutDefault(userId).catch(() => null); if (saved) meta.layout = parseLayout(saved);
  const { id } = await store.create(userId, { title, elements: [first], cursor: { id: first.id, offset: 0 }, meta });
  redirect(`/scripts/${id}`);
}

export async function renameScript(form: FormData) {
  const userId = await uid();
  const title = str(form.get("title")).slice(0, 120);
  if (!title) return;
  await (await getStore()).rename(userId, str(form.get("id")), title);
  revalidatePath("/");
}

export async function deleteScript(form: FormData) {
  const userId = await uid();
  await (await getStore()).remove(userId, str(form.get("id")));
  revalidatePath("/");
}
