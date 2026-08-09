import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKS,
  CHINESE_TEXT_MIN_CHARACTERS,
  ENGLISH_TEXT_MIN_CHARACTERS,
  SHARED_SENTENCE_MAX_SITES,
  indistinguishableSkinPairs,
  inspectGate2Site,
  matchingSkinsForDna,
  newSiteResult,
  shapeForPages,
  skinDimensionMismatches,
} from "../scripts/check-templates.mjs";
import {
  MIN_SKIN_DIFFERENCES,
  SHAPES,
  SKINS,
} from "../lib/template-skins.ts";
import { TARGET_TOTAL } from "../lib/template-taxonomy.ts";

function dnaForSkin(candidate, pages = SHAPES[0].pages) {
  return {
    shape: { key: "fixture", pages: [...pages] },
    skin: { key: candidate.key },
    palette: { key: candidate.palettes[0] },
    radius: candidate.radius,
    density: candidate.density,
    font: candidate.font,
    accentFx: candidate.fx,
    forceDark: candidate.dark,
  };
}

test("验收门保留第一批六项并追加第二批四项", () => {
  assert.deepEqual(
    CHECKS.map(([key]) => key),
    [
      "externalRequest",
      "emptyPictureSlot",
      "photoDominance",
      "sharedSentence",
      "crossKindLeak",
      "generationFailure",
      "shapeConvergence",
      "skinConvergence",
      "skinAdmission",
      "skinDistinguishability",
    ],
  );
  assert.equal(TARGET_TOTAL, 500);
  assert.equal(SHARED_SENTENCE_MAX_SITES, 25);
  assert.equal(CHINESE_TEXT_MIN_CHARACTERS, 8);
  assert.equal(ENGLISH_TEXT_MIN_CHARACTERS, 24);
  assert.equal(MIN_SKIN_DIFFERENCES, 3);
});

test("构成只接受 SHAPES 的四个完整页面序列", () => {
  for (const candidate of SHAPES) {
    assert.equal(shapeForPages([...candidate.pages])?.key, candidate.key);
  }
  assert.equal(shapeForPages(["home", "about", "news", "contact"]), null);
  assert.equal(shapeForPages(["home", "main", "about"]), null);

  const site = newSiteResult("bad-shape");
  inspectGate2Site(
    site,
    { industryKey: "business" },
    dnaForSkin(SKINS.find((candidate) => candidate.key === "paper"), ["home", "pricing", "contact"]),
  );
  assert.equal(site.failures.shapeConvergence.size, 1);
  assert.match([...site.failures.shapeConvergence][0], /home, pricing, contact/);
});

test("每套装六个维度必须整套命中，任一维度漂移都会失败", () => {
  for (const candidate of SKINS) {
    assert.deepEqual(matchingSkinsForDna(dnaForSkin(candidate)).map((skin) => skin.key), [candidate.key]);
  }

  const paper = SKINS.find((candidate) => candidate.key === "paper");
  const base = dnaForSkin(paper);
  const drifts = [
    ["配色", { palette: { key: "not-approved" } }],
    ["圆角", { radius: "round" }],
    ["字体", { font: "serif" }],
    ["疏密", { density: "compact" }],
    ["装饰", { accentFx: "aurora" }],
    ["明暗", { forceDark: true }],
  ];
  for (const [dimension, patch] of drifts) {
    assert.ok(skinDimensionMismatches({ ...base, ...patch }, paper).includes(dimension));
  }
});

test("行业准入拒绝不在 skinsFor(industryKey) 中的完整套装", () => {
  const paper = SKINS.find((candidate) => candidate.key === "paper");
  const allowed = newSiteResult("allowed-skin");
  inspectGate2Site(allowed, { industryKey: "business" }, dnaForSkin(paper));
  assert.equal(allowed.failures.skinConvergence.size, 0);
  assert.equal(allowed.failures.skinAdmission.size, 0);

  const brutalist = SKINS.find((candidate) => candidate.key === "brutalist");
  const rejected = newSiteResult("rejected-skin");
  inspectGate2Site(rejected, { industryKey: "business" }, dnaForSkin(brutalist));
  assert.equal(rejected.failures.skinConvergence.size, 0);
  assert.equal(rejected.failures.skinAdmission.size, 1);
  assert.match([...rejected.failures.skinAdmission][0], /brutalist.*business/);
});

test("十套装两两达到固定的 MIN_SKIN_DIFFERENCES，近似套装会被列名", () => {
  assert.deepEqual(indistinguishableSkinPairs(), []);

  const first = { ...SKINS[0], key: "fixture-a" };
  const second = { ...SKINS[0], key: "fixture-b" };
  const failures = indistinguishableSkinPairs([first, second]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].left, "fixture-a");
  assert.equal(failures[0].right, "fixture-b");
  assert.equal(failures[0].differences.length, 0);
});
