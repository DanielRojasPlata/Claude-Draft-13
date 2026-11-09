// electron-builder drops node_modules from extraResources, so copy the prepared Next.js server in verbatim.
const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");
exports.default = async function afterPack(ctx) {
  const src = path.join(__dirname, "server");
  if (!existsSync(path.join(src, "server.js"))) throw new Error("desktop/server is missing: run `node prepare.mjs` first");
  const dest = path.join(ctx.appOutDir, ctx.electronPlatformName === "darwin" ? `${ctx.packager.appInfo.productFilename}.app/Contents/Resources` : "resources", "server");
  cpSync(src, dest, { recursive: true });
  if (!existsSync(path.join(dest, "node_modules", "next"))) throw new Error("node_modules/next did not make it into the package");
};
