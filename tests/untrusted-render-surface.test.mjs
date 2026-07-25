// LeoAsset 不可信内容渲染面回归防线（W17）。
//
// 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md
//   UC-3  不可信来源的 iframe 不得同时出现 allow-scripts 与 allow-same-origin
//   UC-4  用户可控字符串不得进入 dangerouslySetInnerHTML / innerHTML / document.write
//
// 为什么这些断言写在源码层而不是行为层：翻掉这几条性质只需要改一个属性字符串，
// 行为测试照样全绿。源码断言逼改动者同时改测试，从而在 review 里可见。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const assetDetail = source("../components/AssetDetail.tsx");
const styleElements = source("../components/StyleElements.tsx");
const elementShowcase = source("../lib/element-showcase.ts");
const elementsRoute = source("../app/elements/[fx]/route.ts");

test("UC-3 图表 iframe 不得拿到同源能力", () => {
  // asset.full_url 不是第一方白名单：saveToCollection() 把整个 asset 快照原样
  // POST 给 /v1/assets/collection，后端 supa.collection_add 原样入库、
  // collection_list 原样取回，_validate_collection_asset 只校验
  // https / 无凭据 / 443 端口——主机名由调用方决定，可以是 asset.oceanleo.com
  // 自己。因此这个 src 必须按不可信来源处理。
  const chartFrame = assetDetail.slice(
    assetDetail.indexOf("function ChartFrame"),
    assetDetail.indexOf("function CopyButton"),
  );
  assert.ok(chartFrame.includes("<iframe"), "ChartFrame 应当仍在渲染 iframe");
  assert.match(chartFrame, /sandbox="allow-scripts"/);
  assert.doesNotMatch(chartFrame, /allow-same-origin/);
  assert.doesNotMatch(chartFrame, /allow-top-navigation/);
  assert.doesNotMatch(chartFrame, /allow-popups-to-escape-sandbox/);
});

test("UC-3 全仓任何 iframe 都不得同时给脚本与同源", () => {
  // 集合相等式的守法检查：逐个 sandbox 属性值比对，新增 iframe 不会漏网。
  for (const [name, code] of [
    ["AssetDetail.tsx", assetDetail],
    ["StyleElements.tsx", styleElements],
  ]) {
    for (const [, value] of code.matchAll(/sandbox="([^"]*)"/g)) {
      const tokens = value.split(/\s+/).filter(Boolean);
      assert.ok(
        !(tokens.includes("allow-scripts") && tokens.includes("allow-same-origin")),
        `${name} 的 sandbox="${value}" 同时给了 allow-scripts 与 allow-same-origin`,
      );
    }
  }
});

test("风格元素墙的 iframe 是第一方且无权能", () => {
  // 这两个 iframe 的 src 是同源的 /elements/<fx>，同源意味着一旦该路由能回显
  // 攻击者的 HTML 就是 asset.oceanleo.com 上的 XSS = SSO cookie 失守。
  // 下面三条一起构成「它确实是第一方静态内容」的证明。
  // `<iframe\s` 只匹配 JSX 元素起始，避开正文注释里的 `<iframe>` 字样。
  const frames = [...styleElements.matchAll(/<iframe\s[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.equal(frames.length, 2, "风格元素墙应当只有两个 iframe（卡片 + 全屏弹层）");
  for (const frame of frames) {
    assert.match(frame, /sandbox=""/);
  }
});

test("/elements/<fx> 的两个 query 参数都不可回显", () => {
  // fx 走 FX_META 白名单，未命中直接 404；palette 未命中回落到 PALETTES_V2[0]。
  // 任何一条改成「把原始字符串拼进文档」都会让上一条测试的前提失效。
  // 分号是有意断言的：`metaFor(fx) || FX_META[0]` 这类兜底会让下面的 404 分支
  // 变成死代码，白名单就废了，但宽松的前缀匹配看不出来。
  assert.match(elementsRoute, /const meta = metaFor\(fx\);/);
  assert.match(elementsRoute, /if \(!meta\)[\s\S]{0,200}status: 404/);
  assert.match(
    elementShowcase,
    /export function metaFor[\s\S]{0,120}FX_META\.find/,
  );
  assert.match(
    elementShowcase,
    /export function paletteByKey[\s\S]{0,160}PALETTES_V2\.find[\s\S]{0,40}\|\| PALETTES_V2\[0\]/,
  );
});

test("展示页是纯 CSS —— sandbox=\"\" 的前提", () => {
  // sandbox="" 连脚本都不放行。这是安全的，当且仅当生成器不产出 <script>。
  // 将来若特效真的需要 JS，这条会先变红，提醒改动者同步放宽 sandbox。
  assert.doesNotMatch(elementShowcase, /<script/i);
});

test("UC-4 asset 站维持零 dangerouslySetInnerHTML 白名单", () => {
  for (const [name, code] of [
    ["AssetDetail.tsx", assetDetail],
    ["StyleElements.tsx", styleElements],
    ["element-showcase.ts", elementShowcase],
  ]) {
    assert.doesNotMatch(code, /dangerouslySetInnerHTML/, name);
  }
});
