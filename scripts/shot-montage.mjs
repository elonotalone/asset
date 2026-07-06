// Reusable review tool: screenshot a set of template slugs (or arbitrary URLs)
// from the LOCAL dev server and stitch them into montage grids so the whole
// set can be eyeballed at once. Used to review the template gallery hero/color
// fixes and per-industry image quality without opening 500 tabs.
//
//   node scripts/shot-montage.mjs --slugs womenswear-1,loan-5 --out /tmp/m --tag hero
//   node scripts/shot-montage.mjs --file slugs.json --cols 4 --shot-h 620
//
// Output: <out>/<tag>-montage-N.png (grids of up to --per images).
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1] ?? "true"]);
    return acc;
  }, []),
);

const BASE = args.base || process.env.SHOT_BASE || "http://127.0.0.1:3947/templates";
const OUT = args.out || "/tmp/tpl-shots";
const TAG = args.tag || "montage";
const COLS = Number(args.cols || 3);
const PER = Number(args.per || 12);
const SHOT_W = Number(args["shot-w"] || 1200);
const SHOT_H = Number(args["shot-h"] || 760); // hero-focused crop height
const CELL_W = Number(args["cell-w"] || 640);
const CONC = Number(args.conc || 4);
const WAIT = Number(args.wait || 2200);

let slugs = [];
if (args.slugs) slugs = args.slugs.split(",").map((s) => s.trim()).filter(Boolean);
else if (args.file) slugs = JSON.parse(readFileSync(args.file, "utf8"));
else {
  console.error("need --slugs a,b,c or --file slugs.json");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const SHOTDIR = join(OUT, "_raw");
mkdirSync(SHOTDIR, { recursive: true });

async function shotOne(browser, slug) {
  const isUrl = slug.startsWith("http");
  const url = isUrl ? slug : `${BASE}/${slug}`;
  const name = (isUrl ? slug.replace(/[^a-z0-9]+/gi, "_").slice(0, 40) : slug);
  const raw = join(SHOTDIR, `${TAG}_${name}.png`);
  const ctx = await browser.newContext({ viewport: { width: SHOT_W, height: SHOT_H }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  try {
    await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pg.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(WAIT);
    const png = await pg.screenshot({ clip: { x: 0, y: 0, width: SHOT_W, height: SHOT_H } });
    // label bar with slug
    const label = Buffer.from(
      `<svg width="${SHOT_W}" height="34"><rect width="100%" height="100%" fill="#111"/><text x="12" y="23" font-family="monospace" font-size="18" fill="#0f0">${name}</text></svg>`,
    );
    const labeled = await sharp(png)
      .composite([{ input: label, top: 0, left: 0 }])
      .png()
      .toBuffer();
    const cell = await sharp(labeled).resize(CELL_W).png().toBuffer();
    writeFileSync(raw, cell);
    return { slug: name, ok: true, buf: cell };
  } catch (e) {
    return { slug: name, ok: false, err: String(e).slice(0, 100) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const results = [];
  const queue = [...slugs];
  async function worker() {
    while (queue.length) {
      const s = queue.shift();
      const r = await shotOne(browser, s);
      results.push(r);
      process.stdout.write(r.ok ? "." : "x");
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();
  process.stdout.write("\n");

  const good = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  if (bad.length) console.log("FAILED:", bad.map((b) => `${b.slug}(${b.err})`).join(", "));

  // build montages
  let page = 0;
  for (let i = 0; i < good.length; i += PER) {
    const chunk = good.slice(i, i + PER);
    const metas = await Promise.all(chunk.map((c) => sharp(c.buf).metadata()));
    const cellH = Math.max(...metas.map((m) => m.height));
    const rows = Math.ceil(chunk.length / COLS);
    const W = COLS * CELL_W;
    const H = rows * cellH;
    const composites = chunk.map((c, idx) => ({
      input: c.buf,
      left: (idx % COLS) * CELL_W,
      top: Math.floor(idx / COLS) * cellH,
    }));
    const outPath = join(OUT, `${TAG}-montage-${page}.png`);
    await sharp({ create: { width: W, height: H, channels: 3, background: "#222" } })
      .composite(composites)
      .png()
      .toFile(outPath);
    console.log("wrote", outPath, `(${chunk.length} imgs)`);
    page++;
  }
  console.log(`done: ${good.length} ok, ${bad.length} failed`);
}

main();
