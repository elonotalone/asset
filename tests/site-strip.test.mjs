// 纯素材站：全仓活引用里不许再出现耐久块 / ResultCanvas / ArtifactShelf /
// /works 页面 / plugin-gallery。
//
//   node --test tests/site-strip.test.mjs

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".css"]);
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "out-sites",
  "scratch",
  "tests",
  "docs",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

function rel(p) {
  return p.slice(ROOT.length + 1);
}

test("已定位的非素材站路由与成品面都不在盘上", () => {
  const gone = [
    "app/works/page.tsx",
    "app/works/[id]/page.tsx",
    "app/plugin-gallery/page.tsx",
    "app/plugins/page.tsx",
    "app/collection/page.tsx",
    "app/account/page.tsx",
    "app/settings/page.tsx",
    "app/cost/page.tsx",
    "app/database/page.tsx",
    "app/general/page.tsx",
    "app/advanced/page.tsx",
    "app/templates/page.tsx",
    "app/elements/page.tsx",
    "app/design/[type]/page.tsx",
    "app/open/page.tsx",
    "app/series/page.tsx",
    "components/ArtifactShelf.tsx",
    "components/WorksGallery.tsx",
    "lib/works.ts",
    "lib/plugin-gallery.ts",
    "content/plugin-gallery.json",
    "content/works",
    "content/receipts",
    "public/works",
  ];
  for (const p of gone) {
    assert.equal(existsSync(join(ROOT, p)), false, `${p} 还在`);
  }
});

test("授权说明与素材 API 页还在", () => {
  assert.equal(existsSync(join(ROOT, "app/licenses/page.tsx")), true);
  assert.equal(existsSync(join(ROOT, "app/api/page.tsx")), true);
  assert.equal(existsSync(join(ROOT, "app/api/guide/page.tsx")), true);
  assert.equal(existsSync(join(ROOT, "app/api/oceanleo-catalog/v1/route.ts")), true);
});

test("活代码里没有耐久 / ResultCanvas / ArtifactShelf / /works 路由 / plugin-gallery", () => {
  const files = walk(ROOT);
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const r = rel(file);
    if (text.includes("ResultCanvas")) hits.push(`${r}: ResultCanvas`);
    if (text.includes("ArtifactShelf")) hits.push(`${r}: ArtifactShelf`);
    if (text.includes("plugin-gallery")) hits.push(`${r}: plugin-gallery`);
    if (/(^|[^a-zA-Z])耐久/.test(text)) hits.push(`${r}: 耐久`);
    if (
      /href:\s*["'`]\/works\b/.test(text) ||
      /href=["'`]\/works\b/.test(text) ||
      /["'`]\/works\/[a-z]/.test(text)
    ) {
      hits.push(`${r}: /works`);
    }
  }
  assert.deepEqual(hits, []);
});
