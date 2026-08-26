// 库内 document 类型面：官方编号、像素尺寸退化、详情页不拼 null × null。
//
//   node --import ./tests/register-tsx.mjs --test tests/asset-document-surface.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assetFileName,
  assetFormat,
  dimensionLabel,
  formatByteSize,
  officialDocNumbers,
} from "../lib/asset-file-meta.ts";

const DETAIL = readFileSync(new URL("../components/AssetDetail.tsx", import.meta.url), "utf8");
const ASSETS = readFileSync(new URL("../lib/assets.ts", import.meta.url), "utf8");

test("官方发布编号从 tags 里挑出来，机器标签不算", () => {
  assert.deepEqual(
    officialDocNumbers(["pages:7", "GF-2026-2621", "法律", "SPC民-C01-003", "GF-2026-2621"]),
    ["GF-2026-2621", "SPC民-C01-003"],
  );
  assert.deepEqual(officialDocNumbers(["HF-2025-04", "SDF-2025-0003"]), ["HF-2025-04", "SDF-2025-0003"]);
  assert.deepEqual(officialDocNumbers(["OLW-0001", "律师业务文书"]), ["OLW-0001"]);
  assert.deepEqual(officialDocNumbers(["ind-law", "pages:3"]), []);
  assert.deepEqual(officialDocNumbers(undefined), []);
});

test("像素尺寸缺一就没有文案，拼不出 null × null", () => {
  assert.equal(dimensionLabel(1920, 1080), "1920 × 1080");
  assert.equal(dimensionLabel(null, null), null);
  assert.equal(dimensionLabel(null, 1080), null);
  assert.equal(dimensionLabel(1920, null), null);
  assert.equal(dimensionLabel(0, 0), null);
  assert.equal(dimensionLabel(Number.NaN, 100), null);
  const label = dimensionLabel(null, null);
  assert.equal((label ?? "").includes("null"), false);
});

test("文档文件名 / 格式 / 大小：有就用投影，没有就不编", () => {
  assert.equal(
    assetFileName({
      title: "公共机构能源费用托管项目服务合同",
      oss_key: "assets/document/GF-2026-2621.doc",
      format: "doc",
    }),
    "GF-2026-2621.doc",
  );
  assert.equal(assetFormat({ format: "pdf" }), "pdf");
  assert.equal(assetFormat({ full_url: "https://oss.example/a/b.DOCX?x=1" }), "docx");
  assert.equal(formatByteSize(null), null);
  assert.equal(formatByteSize(-1), null);
  assert.equal(formatByteSize(512), "512 B");
  assert.equal(formatByteSize(2048), "2.0 KB");
});

test("详情页文档走 DocumentPreview，尺寸行只渲染 dimensionLabel 的结果", () => {
  assert.match(DETAIL, /function DocumentPreview/);
  assert.match(DETAIL, /isDocument \? \(\s*<DocumentPreview/);
  assert.match(DETAIL, /dimensionLabel\(asset\.width, asset\.height\)/);
  assert.match(DETAIL, /\{dims \?/);
  assert.doesNotMatch(DETAIL, /\{asset\.width\}\s*[×x]\s*\{asset\.height\}/);
  assert.match(DETAIL, /officialDocNumbers\(asset\.tags\)/);
  assert.match(ASSETS, /export function listLibraryCategories/);
  assert.match(ASSETS, /const qs = new URLSearchParams\(\{ type \}\)/);
});
