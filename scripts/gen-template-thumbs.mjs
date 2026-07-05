// 生成模板缩略图 = 每个模板整页 HTML 的真实首屏截图。
// ---------------------------------------------------------------------------
// 为什么要这个脚本：/templates 网格里的缩略图必须是模板**真实的样子**（对标稿定/
// 云·速成美站），否则整墙灰蒙蒙合成卡毫无吸引力。每个模板都是 /templates/<slug>
// 直出的自包含 HTML，所以离线渲染它、截首屏、裁 4:3、转 webp，就得到真实缩略图。
//
// 管线（两段，各用对的环境）：
//   1) 本机（有 playwright + sharp）：本脚本
//        node scripts/gen-template-thumbs.mjs            # 截全部 500 张 -> out/
//        node scripts/gen-template-thumbs.mjs --slugs a-1,b-2   # 只截指定
//      产物：scripts/.thumb-out/<slug>.webp（800x600）
//   2) lucy 容器（有 oss2 + OSS 凭证）：上传
//        python3 /app/scripts/asset_ingest/upload_template_thumbs.py --dir <out>
//      产物：OSS assets/template-thumb/<slug>.webp（公有读，对齐
//      lib/template-thumb-url.ts）
//
// slug 清单来源 = 线上 /templates 网格实际渲染出的所有 <a href="/templates/…">，
// 保证与部署站零漂移（不在本脚本里重算 taxonomy 的 countForSub 裁剪逻辑）。
//
// 依赖：playwright（截图）、sharp（webp）。二者未装时脚本给出安装提示。
// 引擎改版后重跑本脚本 + 上传，并把 lib/template-thumb-url.ts 的 THUMB_VERSION +1。

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".thumb-out");
const BASE = process.env.THUMB_BASE || "https://asset.oceanleo.com/templates";
const CONCURRENCY = Number(process.env.THUMB_CONCURRENCY || 5);
const VIEWPORT = { width: 1200, height: 900 };
const DSF = 1.5;
const OUT_W = 800;
const OUT_H = 600; // 4:3

async function loadDeps() {
  let chromium, sharp;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("缺少 playwright：npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("缺少 sharp：npm i -D sharp");
    process.exit(1);
  }
  return { chromium, sharp };
}

async function extractSlugs(chromium) {
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 2000 } });
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(3000);
  // 客户端分页（每页 60）→ 反复点「加载更多」直到消失，让所有卡进 DOM。
  for (let i = 0; i < 30; i++) {
    const clicked = await pg.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /加载更多|还有|load more/i.test(b.textContent || ""),
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!clicked) break;
    await pg.waitForTimeout(400);
  }
  const hrefs = await pg.$$eval("a[href*='/templates/']", (els) =>
    els.map((e) => e.getAttribute("href")),
  );
  await b.close();
  const seen = new Set();
  const slugs = [];
  for (const h of hrefs) {
    if (!h) continue;
    const s = h.split("/templates/")[1]?.split(/[?#]/)[0]?.replace(/\/+$/, "");
    if (s && !seen.has(s)) {
      seen.add(s);
      slugs.push(s);
    }
  }
  return slugs;
}

async function shotOne(browser, sharp, slug) {
  const out = join(OUT, `${slug}.webp`);
  if (existsSync(out) && statSync(out).size > 2000) return { slug, ok: true, skip: true };
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DSF });
  const pg = await ctx.newPage();
  try {
    await pg.goto(`${BASE}/${slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await pg.waitForLoadState("networkidle", { timeout: 9000 }).catch(() => {});
    await pg.waitForTimeout(1800);
    const png = await pg.screenshot();
    const cropH = Math.min(Math.round(VIEWPORT.width / (4 / 3)) * DSF, VIEWPORT.height * DSF);
    await sharp(png)
      .extract({ left: 0, top: 0, width: Math.round(VIEWPORT.width * DSF), height: Math.round(cropH) })
      .resize(OUT_W, OUT_H)
      .webp({ quality: 82 })
      .toFile(out);
    return { slug, ok: true };
  } catch (e) {
    return { slug, ok: false, err: String(e).slice(0, 80) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { chromium, sharp } = await loadDeps();

  const argSlugs = process.argv.find((a) => a.startsWith("--slugs="));
  let slugs;
  if (argSlugs) {
    slugs = argSlugs.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    console.log("提取 slug 清单（从线上 /templates 网格）…");
    slugs = await extractSlugs(chromium);
  }
  writeFileSync(join(OUT, "_slugs.json"), JSON.stringify(slugs, null, 0));
  console.log(`共 ${slugs.length} 个模板，输出目录 ${OUT}`);

  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--no-sandbox"] });
  let done = 0;
  const fails = [];
  const t0 = Date.now();
  const queue = [...slugs];
  async function worker() {
    while (queue.length) {
      const slug = queue.shift();
      const r = await shotOne(browser, sharp, slug);
      done++;
      if (!r.ok) fails.push(slug);
      if (done % 20 === 0) {
        const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1);
        console.log(`[${done}/${slugs.length}] ${slug} ${r.ok ? "ok" : "FAIL"} (${rate}/s, fails=${fails.length})`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  console.log(`DONE：成功 ${slugs.length - fails.length}/${slugs.length}，失败 ${fails.length}`);
  if (fails.length) console.log("失败 slug：", fails.slice(0, 20).join(", "));
  console.log(`下一步：在 lucy 容器里上传 -> python3 /app/scripts/asset_ingest/upload_template_thumbs.py --dir ${OUT}`);
}

main();
