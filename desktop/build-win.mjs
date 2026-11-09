// Builds desktop/dist/Guionista-Portable.exe: electron-builder packs the app (win-unpacked), 7-Zip compresses it,
// and the NSIS launcher (launcher/launcher.nsi) embeds it and extracts it once per build into %LOCALAPPDATA%.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: here, ...opts });
const find = (root, pred) => { for (const d of readdirSync(root)) { const p = path.join(root, d); if (pred(p)) return p; } return null; };

if (!process.argv.includes("--skip-prepare")) run("node", ["prepare.mjs"]);
rmSync(dist, { recursive: true, force: true });
run("npx", ["electron-builder", "--win", "dir", "--x64"]);

const cache = path.join(os.homedir(), ".cache", "electron-builder");
const sevenZip = (() => { const r = path.join(cache, "7zip@1.0.0"); const d = find(r, (p) => statSync(p).isDirectory()); return path.join(d, "bin", "7za"); })();
const nsisDir = (() => { const r = path.join(cache, "nsis-3.0.4.1"); return find(r, (p) => statSync(p).isDirectory() && existsSync(path.join(p, "linux", "makensis"))); })();
const pluginDir = (() => { const r = path.join(cache, "nsis-resources-3.4.1"); const d = find(r, (p) => statSync(p).isDirectory()); return path.join(d, "plugins", "x86-unicode"); })();
if (!existsSync(sevenZip) || !nsisDir || !existsSync(pluginDir)) throw new Error("electron-builder's cached 7-Zip / NSIS tools were not found; run electron-builder once first");

const app7z = path.join(dist, "app.7z");
run(sevenZip, ["a", "-t7z", "-m0=lzma", "-mx=5", "-ms=on", "-bd", app7z, "."], { cwd: path.join(dist, "win-unpacked") });
const buildId = createHash("sha256").update(readFileSync(app7z)).digest("hex").slice(0, 12);
const out = path.join(dist, "Guionista-Portable.exe");
run(path.join(nsisDir, "linux", "makensis"), ["-V2", `-DAPP_7Z=${app7z}`, `-DBUILD_ID=${buildId}`, `-DOUT_FILE=${out}`, `-DPLUGIN_DIR=${pluginDir}`, path.join(here, "launcher", "launcher.nsi")], { env: { ...process.env, NSISDIR: nsisDir } });
rmSync(app7z, { force: true });
console.log(`built ${out} (${Math.round(statSync(out).size / 1e6)} MB, build ${buildId})`);
