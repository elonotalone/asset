// Generate one contact-sheet montage set per OSS category from oss-cats.json,
// so every candidate image can be personally eyeballed for quality + hero
// suitability. Writes /tmp/catrev/<category>-N.png and an index json mapping
// each montage cell (#idx) back to its URL for later curation.
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2] || "/tmp/oss-cats.json";
const OUT = process.argv[3] || "/tmp/catrev";
const ONLY = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
const COLS = 6;
const PER = 36;
const CELL = 300;
const CONC = 10;
mkdirSync(OUT, { recursive: true });

const cats = JSON.parse(readFileSync(SRC, "utf8"));
const indexMap = {};

async function fetchCell(url, idx) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { idx, ok: false };
    const buf = Buffer.from(await res.arrayBuffer());
    const cw = CELL, ch = Math.round((CELL * 3) / 4);
    const base = await sharp(buf).resize(cw, ch, { fit: "cover" }).toBuffer();
    const label = Buffer.from(`<svg width="${cw}" height="24"><rect width="100%" height="100%" fill="#000b"/><text x="5" y="18" font-family="monospace" font-size="15" fill="#0f0">#${idx}</text></svg>`);
    const cell = await sharp(base).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
    return { idx, ok: true, buf: cell };
  } catch {
    return { idx, ok: false };
  }
}

async function doCat(cat, urls) {
  indexMap[cat] = urls;
  const results = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await fetchCell(urls[i], i);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const good = results.filter((r) => r && r.ok);
  const cw = CELL, ch = Math.round((CELL * 3) / 4) + 24;
  let page = 0;
  for (let i = 0; i < good.length; i += PER) {
    const chunk = good.slice(i, i + PER);
    const rows = Math.ceil(chunk.length / COLS);
    const composites = chunk.map((c, k) => ({ input: c.buf, left: (k % COLS) * cw, top: Math.floor(k / COLS) * ch }));
    const outPath = join(OUT, `${cat}-${page}.png`);
    await sharp({ create: { width: COLS * cw, height: rows * ch, channels: 3, background: "#1a1a1a" } })
      .composite(composites).png().toFile(outPath);
    page++;
  }
  console.log(`${cat}: ${good.length}/${urls.length} imgs, ${page} montage(s)`);
}

const run = [];
for (const { category, urls } of cats) {
  if (ONLY && !ONLY.has(category)) continue;
  run.push([category, urls]);
}
for (const [cat, urls] of run) {
  await doCat(cat, urls);
}
writeFileSync(join(OUT, "_index.json"), JSON.stringify(indexMap));
console.log("index written:", join(OUT, "_index.json"));
