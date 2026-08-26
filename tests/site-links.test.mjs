// 站内链接枚举（静态，不许开浏览器）
//
//   node --test tests/site-links.test.mjs
//
// 活代码里每一条站内 href / router.push / location 跳转，目标必须是本仓真实存在
// 的路由，或者是首页 query（/?type= / ?view= / ?cat=）。已删除的账户/设置/积分
// 路由一条都不许再出现。

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "out-sites",
  "scratch",
  "tests",
  "docs",
  "messages",
  "public",
]);

const GONE = [
  "/account",
  "/settings",
  "/cost",
  "/general",
  "/advanced",
  "/works",
  "/collection",
  "/plugin-gallery",
  "/plugins",
  "/templates",
  "/elements",
  "/design",
  "/open",
  "/series",
];

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

function appRoutes() {
  const app = join(ROOT, "app");
  const routes = new Set(["/"]);
  function rec(dir, url) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("_")) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        rec(p, `${url}/${name}`);
      } else if (name === "page.tsx" || name === "page.ts" || name === "page.jsx") {
        routes.add(url || "/");
      } else if (name === "route.ts" || name === "route.js") {
        routes.add(url || "/");
      }
    }
  }
  rec(app, "");
  return routes;
}

function logicalPath(raw) {
  const trimmed = raw.split("?")[0].split("#")[0];
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

function extractHrefs(text) {
  const out = [];
  const patterns = [
    /href\s*[:=]\s*["'`](\/[^"'`]*)["'`]/g,
    /href\s*=\s*\{["'`](\/[^"'`]*)["'`]/g,
    /router\.push\(\s*["'`](\/[^"'`]*)["'`]/g,
    /location\.href\s*=\s*["'`](\/[^"'`]*)["'`]/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) out.push(m[1]);
  }
  return out;
}

const files = walk(ROOT);
const routes = appRoutes();
const hits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const href of extractHrefs(text)) {
    hits.push({ rel, href, path: logicalPath(href) });
  }
}

test("活代码不链到已删除的账户/设置/积分/成品路由", () => {
  const bad = hits.filter((h) =>
    GONE.some((g) => h.path === g || h.path.startsWith(`${g}/`)),
  );
  assert.deepEqual(
    bad.map((h) => `${h.rel}: ${h.href}`),
    [],
  );
});

test("枚举到的站内路径都能在 app/ 路由树里对上，或是动态分区 / 首页 query", () => {
  const missing = [];
  for (const h of hits) {
    if (h.path === "/") continue;
    if (routes.has(h.path)) continue;
    // Next 动态段：/zones/[slug] 在路由树里是 /zones/[slug]
    const dynamicOk = [...routes].some((r) => {
      if (!r.includes("[")) return false;
      const re = new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$");
      return re.test(h.path);
    });
    if (dynamicOk) continue;
    missing.push(`${h.rel}: ${h.href} → ${h.path}`);
  }
  assert.deepEqual(missing, []);
});

test("根布局与外壳本身没有 LeoAssistant /account 入口", () => {
  const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
  const shell = readFileSync(join(ROOT, "components/SiteShell.tsx"), "utf8");
  assert.equal(layout.includes("LeoAssistant"), false);
  assert.equal(shell.includes("/account"), false);
  assert.equal(shell.includes("/settings"), false);
});

test("站内链接清单可打印（给 journal 用）", () => {
  const uniq = [...new Set(hits.map((h) => h.path))].sort();
  assert.ok(uniq.includes("/"), "首页不在清单里");
  assert.ok(uniq.includes("/licenses"), "授权说明不在清单里");
  // 把清单写到 stdout，journal 从测试输出抄。
  console.log("SITE_LINKS " + uniq.join(" "));
});
