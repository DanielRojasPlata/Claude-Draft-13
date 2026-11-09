// Assembles desktop/app: the Next.js standalone server + static assets. Run after `pnpm build` at the repo root.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "server");
if (!process.argv.includes("--skip-build")) execSync("pnpm build", { cwd: root, stdio: "inherit" });
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Run `pnpm build` first: .next/standalone/server.js is missing");
rmSync(out, { recursive: true, force: true });
cpSync(standalone, out, { recursive: true, dereference: true });
mkdirSync(path.join(out, ".next", "static"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
// pnpm's nested .pnpm layout produces paths > 200 chars, which break when the portable exe unpacks itself
// under %TEMP% on Windows (MAX_PATH 260). Replace it with a flat, short-path, Windows-safe install.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
const ver = (name) => JSON.parse(readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
rmSync(path.join(out, "node_modules"), { recursive: true, force: true });
writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: "guionista-server", version: "1.0.0", private: true, type: "module", dependencies: { next: ver("next"), react: ver("react"), "react-dom": ver("react-dom"), "@prisma/client": ver("@prisma/client") } }, null, 1));
execSync("npm install --omit=dev --ignore-scripts --no-audit --no-fund --install-strategy=hoisted --no-package-lock", { cwd: out, stdio: "inherit" });
// @prisma/client requires the generated client at load time (it is never instantiated in desktop mode): ship its JavaScript, not the Linux query engine
const pnpmDir = path.join(root, "node_modules", ".pnpm");
const found = [path.join(root, "node_modules", ".prisma", "client"), ...(existsSync(pnpmDir) ? readdirSync(pnpmDir).filter((d) => d.startsWith("@prisma+client@")).map((d) => path.join(pnpmDir, d, "node_modules", ".prisma", "client")) : [])];
const gen = found.find((f) => existsSync(f));
if (!gen) throw new Error("Run `pnpm exec prisma generate` first");
cpSync(gen, path.join(out, "node_modules", ".prisma", "client"), { recursive: true, filter: (f) => !/\.(so|dll|dylib)(\.node)?$|\.node$|query_engine|schema\.prisma$/.test(f) || f.endsWith("schema.prisma") });
// the desktop build never talks to Postgres and runs the compiled server only: drop engines, compilers and Linux-only binaries
for (const p of ["@prisma/engines", "prisma", "typescript", "@img", ".package-lock.json", ".bin", ".data", ".env"]) rmSync(path.join(out, "node_modules", p), { recursive: true, force: true });
for (const d of readdirSync(path.join(out, "node_modules", "@next"))) if (d.startsWith("swc-")) rmSync(path.join(out, "node_modules", "@next", d), { recursive: true, force: true });
// Next ships experimental React builds that are never loaded in production; they hold the deepest paths
const compiled = path.join(out, "node_modules", "next", "dist", "compiled");
for (const d of readdirSync(compiled)) if (/experimental/.test(d)) rmSync(path.join(compiled, d), { recursive: true, force: true });
rmSync(path.join(out, ".data"), { recursive: true, force: true }); rmSync(path.join(out, ".env"), { recursive: true, force: true });
// The portable exe re-extracts itself on every launch and Windows scans each file, so file count is startup time.
// Remove what a production server never loads: type declarations, source maps, the duplicate ESM build, dev tooling, build-time-only trees.
(function prune(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f); const st = statSync(p);
    if (st.isDirectory()) { prune(p); continue; }
    if (/\.(d\.ts|d\.cts|d\.mts|map|md|markdown)$/i.test(f) && !/^LICEN[CS]E/i.test(f)) rmSync(p, { force: true });
  }
})(path.join(out, "node_modules"));
for (const p of ["next/dist/esm", "caniuse-lite", "sharp", "detect-libc", "next/dist/compiled/@vercel/og", "next/dist/compiled/webpack", "next/dist/compiled/terser", "next/dist/compiled/sass-loader", "next/dist/compiled/postcss-loader", "next/dist/compiled/css-loader", "next/dist/compiled/mini-css-extract-plugin"]) rmSync(path.join(out, "node_modules", p), { recursive: true, force: true });
const rt = path.join(out, "node_modules", "@prisma", "client", "runtime");
if (existsSync(rt)) for (const f of readdirSync(rt)) if (!/^(library|client|binary|react-native|index-browser|wasm-engine-edge|edge)\.js$/.test(f) || /wasm|edge|react-native|browser/.test(f)) rmSync(path.join(rt, f), { force: true });
// guard: nothing may be deep enough to break extraction (temp prefix is ~100 chars; keep the total under ~230)
let longest = 0, longestPath = "";
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); const rel = path.relative(out, p); if (rel.length > longest) { longest = rel.length; longestPath = rel; } if (statSync(p).isDirectory()) walk(p); } })(out);
if (longest > 150) throw new Error(`Path too long for Windows extraction (${longest}): ${longestPath}`);
writeFileSync(path.join(out, "boot.cjs"), `// Starts the Next.js server and makes sure it never outlives the desktop shell.
if (process.send) process.on("disconnect", () => process.exit(0));
const ppid = Number(process.env.GUIONISTA_PARENT_PID || 0);
if (ppid) setInterval(() => { try { process.kill(ppid, 0); } catch { process.exit(0); } }, 3000).unref();
import("./server.js").catch((e) => { console.error(e && e.stack || e); process.exit(1); });
`);
let count = 0; (function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else count++; } })(out);
console.log(`desktop/server ready: ${count} files, longest relative path ${longest} chars`);
