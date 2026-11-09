import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config) => { config.resolve.alias["@"] = path.join(root, "src"); return config; },
};
