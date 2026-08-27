// 详情预览必须能放大、能滚动看整张。禁止 max-height + object-contain 把长图压成细线。
//
//   node --import ./tests/register-tsx.mjs --test tests/zoomable-preview.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PREVIEW_ZOOM_STEPS } from "../components/ZoomablePreview.tsx";

const PREVIEW = readFileSync(new URL("../components/ZoomablePreview.tsx", import.meta.url), "utf8");
const DETAIL = readFileSync(new URL("../components/AssetDetail.tsx", import.meta.url), "utf8");

test("缩放档位从铺满栏宽起，能放大到四倍", () => {
  assert.deepEqual([...PREVIEW_ZOOM_STEPS], [1, 1.5, 2, 3, 4]);
});

test("看图器按宽度铺开，高度随比例，不给 img 加 max-height", () => {
  assert.match(PREVIEW, /width: `\$\{zoom \* 100}%`/);
  assert.match(PREVIEW, /height: "auto"/);
  assert.match(PREVIEW, /maxWidth: "none"/);
  assert.doesNotMatch(PREVIEW, /className=\{?[`'"][^`'"]*object-contain/);
  assert.doesNotMatch(PREVIEW, /max-h-\[50vh\]/);
  assert.match(PREVIEW, /overflow-auto/);
  assert.match(PREVIEW, /全屏查看/);
  assert.match(PREVIEW, /cursor-zoom-in/);
  assert.match(PREVIEW, /ctrlKey/);
});

test("详情页图片、文档预览、PPT 页都走 ZoomablePreview，不再用 ZoomImage", () => {
  assert.doesNotMatch(DETAIL, /function ZoomImage/);
  assert.match(DETAIL, /<ZoomablePreview/);
  assert.match(DETAIL, /function DocumentPreview/);
  assert.match(DETAIL, /function PptPager/);
  assert.match(DETAIL, /preview = asset\.preview_url \|\| asset\.thumb_url/);
  assert.match(DETAIL, /<ZoomablePreview[\s\S]*full=\{preview\}/);
  assert.match(DETAIL, /pages\[idx\]/);
  assert.doesNotMatch(DETAIL, /max-h-\[50vh\] w-full object-contain/);
  assert.doesNotMatch(DETAIL, /mx-auto max-h-40 object-contain/);
});
