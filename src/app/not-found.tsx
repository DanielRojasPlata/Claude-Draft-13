import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-chrome px-4 text-center">
      <p className="font-script text-lg font-bold uppercase tracking-wide text-accent">FADE OUT.</p>
      <h1 className="text-2xl font-semibold text-white">Page not found</h1>
      <Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black">Back to your scripts</Link>
    </main>
  );
}
