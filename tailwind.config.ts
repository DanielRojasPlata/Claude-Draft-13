import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { fontFamily: { script: ['"Courier Prime"', "Courier New", "monospace"] },
    colors: {
      canvas: "var(--canvas)", chrome: "var(--chrome)", accent: "#e8b04a",
      ink: "var(--panel-ink)", pink: "var(--panel-ink)", panel: "var(--panel)", panel2: "var(--panel2)",
      muted: "var(--muted)", line: "var(--line)", hover: "var(--hover)",
    } } },
} satisfies Config;
