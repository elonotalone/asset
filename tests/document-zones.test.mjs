// 八个中文文档分区：路由、中文名、官方编号、空分区文案。
//
//   node --import ./tests/register-tsx.mjs --test tests/document-zones.test.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  DOCUMENT_ZONES,
  DOCUMENT_ZONE_SLUGS,
  documentZoneBySlug,
  documentZoneHref,
} from "../lib/document-zones.ts";

const SHELL = readFileSync(new URL("../components/SiteShell.tsx", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../components/DocumentZoneView.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../app/zones/[slug]/page.tsx", import.meta.url), "utf8");

test("八个分区一个不少，标题是中文直白名不是英文 category", () => {
  assert.deepEqual(
    DOCUMENT_ZONES.map((z) => z.title),
    [
      "合同区",
      "尽职调查区",
      "诉讼文书区",
      "律师文书区",
      "简历区",
      "流程架构图区",
      "长图海报区",
      "电商详情区",
    ],
  );
  assert.deepEqual(
    DOCUMENT_ZONES.map((z) => z.category),
    [
      "contract-agreement",
      "legal-diligence",
      "legal-litigation-form",
      "legal-lawyer-template",
      "resume-template",
      "flowchart-diagram",
      "longform-poster",
      "ecommerce-detail",
    ],
  );
  for (const z of DOCUMENT_ZONES) {
    assert.notEqual(z.title, z.category);
    assert.match(z.title, /区$/);
    assert.equal(documentZoneHref(z.slug), `/zones/${z.slug}`);
    assert.equal(documentZoneBySlug(z.slug)?.category, z.category);
  }
  assert.equal(documentZoneBySlug("not-a-zone"), undefined);
  assert.deepEqual(DOCUMENT_ZONE_SLUGS, DOCUMENT_ZONES.map((z) => z.slug));
});

test("官方来源分区标出国家编号，自有分区不冒充官方", () => {
  const contract = documentZoneBySlug("contract");
  const diligence = documentZoneBySlug("diligence");
  const litigation = documentZoneBySlug("litigation");
  const resume = documentZoneBySlug("resume");
  assert.ok(contract.officialNumbers.includes("GF-2026-24"));
  assert.ok(diligence.officialNumbers.includes("证监会公告〔2022〕36号"));
  assert.ok(diligence.officialNumbers.includes("证监会公告〔2022〕35号"));
  assert.equal(contract.licenseKind, "official-public-domain");
  assert.equal(diligence.licenseKind, "official-public-domain");
  assert.equal(litigation.licenseKind, "official-public-domain");
  assert.equal(resume.licenseKind, "oceanleo-owned");
  assert.deepEqual(resume.officialNumbers, []);
  assert.equal(contract.licenseLabel, "官方公有领域");
  assert.equal(resume.licenseLabel, "OceanLeo 自有");
});

test("左栏能看见八个分区，路由文件在盘上", () => {
  assert.match(SHELL, /heading:\s*tt\("文档分区"\)/);
  assert.match(SHELL, /DOCUMENT_ZONES/);
  assert.match(SHELL, /\/zones\/\$\{z\.slug\}/);
  assert.equal(existsSync(new URL("../app/zones/[slug]/page.tsx", import.meta.url)), true);
  assert.match(PAGE, /documentZoneBySlug/);
  assert.match(PAGE, /DocumentZoneView/);
});

test("空分区显示整理中，不把失败画成报错页", () => {
  assert.match(VIEW, /整理中/);
  assert.match(VIEW, /官方原文/);
  assert.match(VIEW, /许可来源/);
  assert.match(VIEW, /可下载格式/);
  assert.match(VIEW, /素材数/);
  assert.doesNotMatch(VIEW, /throw /);
});
