// Measures an exported PDF against the screenplay spec.
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const file = process.argv[2]; const buf = readFileSync(file);
const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false, verbosity: 0 }).promise;
const out = { pages: pdf.numPages, sizes: new Set(), fontsOk: buf.toString("latin1").includes("CourierPrime"), x: {}, sizesPt: new Set(), pitchOk: true, bottomOk: true, minTop: 1e9 };
let rowPitch = new Map();
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p); const v = page.getViewport({ scale: 1 });
  out.sizes.add(`${v.width}x${v.height}`);
  const tc = await page.getTextContent();
  const ys = new Set();
  for (const it of tc.items) {
    if (!it.str.trim()) continue;
    const x = Math.round(it.transform[4] * 10) / 10, y = it.transform[5];
    out.sizesPt.add(Math.round(it.transform[0] * 100) / 100);
    out.x[x] = (out.x[x] ?? 0) + 1; ys.add(Math.round(y * 100) / 100);
    out.minTop = Math.min(out.minTop, v.height - y);
    if (y < 72 - 0.5) out.bottomOk = false; // baseline below the 1in bottom margin
  }
  const sorted = [...ys].sort((a, b) => b - a);
  for (let i = 1; i < sorted.length; i++) { const d = Math.round((sorted[i - 1] - sorted[i]) * 100) / 100; if (d > 0.5 && Math.abs(d / 12 - Math.round(d / 12)) > 0.02) out.pitchOk = false; }
}
const hist = Object.entries(out.x).sort((a, b) => a[0] - b[0]).map(([x, n]) => `${x}pt(${(x / 72).toFixed(2)}in)x${n}`);
console.log(JSON.stringify({ pages: out.pages, pageSize: [...out.sizes], fontEmbeddedCourierPrime: out.fontsOk, fontSizesPt: [...out.sizesPt], lineGridMultipleOf12pt: out.pitchOk, nothingBelowBottomMargin: out.bottomOk, firstBaselineFromTopPt: Math.round(out.minTop * 10) / 10, leftEdges: hist }, null, 1));
