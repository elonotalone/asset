// LeoAsset 不可信内容渲染面回归防线（W17）。
//
// 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md
//   UC-3  不可信来源的 iframe 不得同时出现 allow-scripts 与 allow-same-origin
//   UC-4  用户可控字符串不得进入 dangerouslySetInnerHTML / innerHTML / document.write
//
// 风格元素墙（/elements）已从本站拿掉，这条防线只守还在的详情预览。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const assetDetail = source("../components/AssetDetail.tsx");

test("UC-3 图表 iframe 不得拿到同源能力", () => {
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
  for (const [, value] of assetDetail.matchAll(/sandbox="([^"]*)"/g)) {
    const tokens = value.split(/\s+/).filter(Boolean);
    assert.ok(
      !(tokens.includes("allow-scripts") && tokens.includes("allow-same-origin")),
      `AssetDetail.tsx 的 sandbox="${value}" 同时给了 allow-scripts 与 allow-same-origin`,
    );
  }
});

test("UC-4 asset 站维持零 dangerouslySetInnerHTML 白名单", () => {
  assert.doesNotMatch(assetDetail, /dangerouslySetInnerHTML/);
});
