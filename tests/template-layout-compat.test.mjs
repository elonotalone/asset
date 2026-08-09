// 定装后的版式相容性判据：旧 21 家族/业态候选已经收敛为业务下限驱动的四种构成，
// 外观则只能从行业准入的十套装里选择。

import assert from "node:assert/strict";
import test from "node:test";

import {
  LAYOUT_FAMILIES,
  SHAPE_SECTION_BLUEPRINTS,
  dnaFor,
  mainPageKey,
  mainSectionKind,
} from "../lib/template-dna.ts";
import {
  INDUSTRY_SKINS,
  SHAPES,
  SKINS,
  shapeFloor,
  skinsFor,
} from "../lib/template-skins.ts";
import {
  ALL_SUB_KEYS,
  INDUSTRIES,
  allTemplates,
  subByKey,
} from "../lib/template-taxonomy.ts";

const SHAPE_ORDER = SHAPES.map((shape) => shape.key);

test("A1 旧布局家族只留下四种固定页面构成", () => {
  assert.deepEqual(LAYOUT_FAMILIES.map((layout) => layout.key), ["s3", "s4", "s5", "s6"]);
  assert.deepEqual(SHAPES.map((shape) => shape.pages.length), [3, 4, 5, 6]);
  assert.deepEqual(Object.keys(SHAPE_SECTION_BLUEPRINTS).sort(), ["s3", "s4", "s5", "s6"]);
});

test("A2 105 个子类都有有效构成下限", () => {
  assert.equal(ALL_SUB_KEYS.length, 105);
  for (const subKey of ALL_SUB_KEYS) {
    const hit = subByKey(subKey);
    assert.ok(hit, `${subKey}: 分类树缺失`);
    assert.ok(SHAPE_ORDER.includes(shapeFloor(hit.ind.key, subKey)), `${subKey}: 构成下限无效`);
  }
});

test("B1 全量 500 站不低于业务下限，页面与板块只来自对应构成", () => {
  for (const meta of allTemplates()) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const floor = shapeFloor(meta.industryKey, meta.subKey);
    assert.ok(
      SHAPE_ORDER.indexOf(dna.shape.key) >= SHAPE_ORDER.indexOf(floor),
      `${meta.slug}: ${dna.shape.key} 低于 ${floor}`,
    );

    const mainKey = mainPageKey(meta.industryKey, meta.subKey);
    const mainKind = mainSectionKind(mainKey);
    const expectedPages = dna.shape.pages.map((page) => page === "main" ? mainKey : page);
    assert.deepEqual(dna.layout.pages, expectedPages, `${meta.slug}: 页面构成漂移`);
    for (const semanticPage of dna.shape.pages) {
      const pageKey = semanticPage === "main" ? mainKey : semanticPage;
      const expectedSections = SHAPE_SECTION_BLUEPRINTS[dna.shape.key][semanticPage].map((kind) =>
        kind === "main" ? mainKind : kind,
      );
      assert.deepEqual(dna.layout.sections[pageKey], expectedSections, `${meta.slug}/${pageKey}: 板块漂移`);
    }
  }
});

test("B2 同一子类从下限起步，只在下限到六页之间循环", () => {
  const bySub = new Map();
  for (const meta of allTemplates()) {
    if (!bySub.has(meta.subKey)) bySub.set(meta.subKey, []);
    bySub.get(meta.subKey).push(meta);
  }
  for (const [subKey, metas] of bySub) {
    const floor = shapeFloor(metas[0].industryKey, subKey);
    const pool = SHAPE_ORDER.slice(SHAPE_ORDER.indexOf(floor));
    const actual = metas.map((meta) => dnaFor(meta.slug, meta.industryKey, meta.variant).shape.key);
    assert.equal(actual[0], floor, `${subKey}: 第一个变体没有从下限起步`);
    assert.deepEqual(
      actual,
      metas.map((meta) => pool[Math.abs(meta.variant - 1) % pool.length]),
      `${subKey}: 构成没有在合法相邻档位循环`,
    );
  }
});

test("C1 搬家与保洁按小型服务落四页，医疗机构固定六页", () => {
  assert.equal(shapeFloor("life", "moving"), "s4");
  assert.equal(shapeFloor("life", "cleaning"), "s4");
  assert.equal(shapeFloor("grocery", "hospital"), "s6");
  assert.equal(shapeFloor("grocery", "dental"), "s6");
  assert.equal(shapeFloor("fashion", "medical-beauty"), "s6");
});

test("C2 行业准入表覆盖十套装，每个行业至少三套且都有素白兜底", () => {
  const known = new Set(SKINS.map((skin) => skin.key));
  const used = new Set();
  for (const industry of INDUSTRIES) {
    assert.deepEqual(INDUSTRY_SKINS[industry.key], skinsFor(industry.key));
    assert.ok(skinsFor(industry.key).length >= 3, `${industry.key}: 准入套装少于三套`);
    assert.ok(skinsFor(industry.key).includes("paper"), `${industry.key}: 缺素白兜底`);
    for (const skinKey of skinsFor(industry.key)) assert.ok(known.has(skinKey), `${industry.key}: 未知套装 ${skinKey}`);
  }
  for (const meta of allTemplates()) {
    const skinKey = dnaFor(meta.slug, meta.industryKey, meta.variant).skin.key;
    assert.ok(skinsFor(meta.industryKey).includes(skinKey), `${meta.slug}: ${skinKey} 越过行业准入`);
    used.add(skinKey);
  }
  assert.deepEqual([...used].sort(), [...known].sort(), "有套装在 500 件货里饿死");
});

test("C3 明显不合主题的组合仍被准入表挡住", () => {
  for (const industryKey of ["life", "grocery", "org"]) {
    assert.ok(!skinsFor(industryKey).includes("brutalist"), `${industryKey}: 不应准入粗野装`);
    assert.ok(!skinsFor(industryKey).includes("neon"), `${industryKey}: 不应准入霓虹装`);
  }
  assert.ok(skinsFor("tech").includes("neon"));
  assert.ok(skinsFor("tech").includes("brutalist"));
});
