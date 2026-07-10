// Reusable review tool: given a list of image URLs (typically OSS), download and
// stitch them into a labeled contact-sheet montage so a whole category can be
// eyeballed at once for quality + suitability-as-hero-background.
//
//   node scripts/oss-montage.mjs --file urls.json --out /tmp/oss --tag fashion --cols 5
//
// urls.json: ["https://...webp", ...]  (order preserved; index label drawn on each)
// Output: <out>/<tag>-N.png (grids of up to --per cells). Prints index->url map.
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1] ?? "true"]);
    return acc;
  }, []),
);
const OUT = args.out || "/tmp/oss-shots";
const TAG = args.tag || "cat";
const COLS = Number(args.cols || 5);
const PER = Number(args.per || 30);
const CELL = Number(args.cell || 320); // cell width px
const CONC = Number(args.conc || 8);

const urls = JSON.parse(readFileSync(args.file, "utf8"));
mkdirSync(OUT, { recursive: true });

async function fetchCell(url, idx) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { idx, ok: false, err: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    // fit into 4:3 cell, letterbox on dark, draw index label
    const cw = CELL;
    const ch = Math.round((CELL * 3) / 4);
    const base = await sharp(buf)
      .resize(cw, ch, { fit: "cover", position: "attention" })
      .toBuffer()
      .catch(async () => sharp(buf).resize(cw, ch, { fit: "cover" }).toBuffer());
    const label = Buffer.from(
      `<svg width="${cw}" height="26"><rect width="100%" height="100%" fill="#000a"/><text x="6" y="19" font-family="monospace" font-size="16" fill="#0f0">#${idx}</text></svg>`,
    );
    const cell = await sharp(base)
      .composite([{ input: label, top: 0, left: 0 }])
      .png()
      .toBuffer();
    return { idx, ok: true, buf: cell };
  } catch (e) {
    return { idx, ok: false, err: String(e).slice(0, 60) };
  }
}

async function main() {
  const results = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await fetchCell(urls[i], i);
      process.stdout.write(results[i].ok ? "." : "x");
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  process.stdout.write("\n");

  const good = results.filter((r) => r && r.ok);
  const bad = results.filter((r) => r && !r.ok);
  if (bad.length) console.log("FAILED idx:", bad.map((b) => `${b.idx}(${b.err})`).join(", "));

  const cw = CELL;
  const ch = Math.round((CELL * 3) / 4) + 26;
  let page = 0;
  for (let i = 0; i < good.length; i += PER) {
    const chunk = good.slice(i, i + PER);
    const rows = Math.ceil(chunk.length / COLS);
    const composites = chunk.map((c, k) => ({
      input: c.buf,
      left: (k % COLS) * cw,
      top: Math.floor(k / COLS) * ch,
    }));
    const outPath = join(OUT, `${TAG}-${page}.png`);
    await sharp({ create: { width: COLS * cw, height: rows * ch, channels: 3, background: "#1a1a1a" } })
      .composite(composites)
      .png()
      .toFile(outPath);
    console.log("wrote", outPath, `(${chunk.length} cells, idx ${chunk[0].idx}-${chunk[chunk.length-1].idx})`);
    page++;
  }
  console.log(`done: ${good.length} ok, ${bad.length} failed`);
}
main();
