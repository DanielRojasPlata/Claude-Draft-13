import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/session";
import { login, register } from "@/app/actions";

const ERRORS: Record<string, string> = {
  credentials: "That email and password don't match.",
  name: "Enter a name (80 characters max).",
  email: "Enter a valid email address.",
  password: "Use a password of at least 8 characters.",
  taken: "An account with that email already exists.",
};
const field = "w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-accent";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  if (await currentUserId()) redirect("/");
  const { mode, error } = await searchParams;
  const reg = mode === "register";
  return (
    <main className="flex min-h-screen items-center justify-center bg-chrome px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center font-script text-lg font-bold uppercase tracking-wide text-accent">INT. GUIONISTA - DAY</h1>
        <form action={reg ? register : login} className="space-y-3 rounded-xl bg-white/5 p-6 ring-1 ring-white/10">
          <h2 className="pb-1 text-base font-semibold text-white">{reg ? "Create your account" : "Sign in"}</h2>
          {error && <p role="alert" className="rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-200">{ERRORS[error] ?? "Something went wrong."}</p>}
          {reg && <input name="name" required maxLength={80} autoComplete="name" placeholder="Name" aria-label="Name" className={field} />}
          <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} />
          <input name="password" type="password" required minLength={reg ? 8 : 1} autoComplete={reg ? "new-password" : "current-password"} placeholder="Password" aria-label="Password" className={field} />
          <button className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-black transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{reg ? "Create account" : "Sign in"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-400">
          {reg ? <>Already have an account? <Link className="text-accent underline" href="/login">Sign in</Link></> : <>New here? <Link className="text-accent underline" href="/login?mode=register">Create an account</Link></>}
        </p>
      </div>
    </main>
  );
}
