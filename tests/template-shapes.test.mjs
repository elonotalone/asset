// 第二批「定装」判据：页面构成、套装准入与主营页命名。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-shapes.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  INDUSTRY_SKINS,
  MAIN_PAGE_LABEL_BY_SUB,
  SHAPE_FLOOR,
  SHAPE_FLOOR_BY_SUB,
  SHAPES,
  SKINS,
  mainPageLabel,
  shapeFloor,
  skinsFor,
} from "../lib/template-skins.ts";
import {
  LAYOUT_FAMILIES,
  SHAPE_SECTION_BLUEPRINTS,
  dnaFor,
  mainPageKey,
  mainSectionKind,
} from "../lib/template-dna.ts";
import {
  ALL_SUB_KEYS,
  INDUSTRIES,
  allTemplates,
} from "../lib/template-taxonomy.ts";

test("105 个子类的主营页覆盖没有漏写键或幽灵键", () => {
  assert.equal(ALL_SUB_KEYS.length, 105);
  const real = new Set(ALL_SUB_KEYS);
  const ghosts = Object.keys(MAIN_PAGE_LABEL_BY_SUB).filter((key) => !real.has(key));
  assert.deepEqual(ghosts, []);
});

test("餐饮保留菜单，住宿、旅行与签证不叫菜单", () => {
  for (const subKey of ["fastfood", "hotpot", "western", "japanese-korean", "bakery", "bbq"]) {
    assert.equal(mainPageLabel("food", subKey), "菜单", subKey);
  }
  assert.equal(mainPageLabel("food", "farmstay"), "客房");
  assert.equal(mainPageLabel("food", "resort"), "客房");
  assert.equal(mainPageLabel("food", "hotel"), "客房");
  assert.equal(mainPageLabel("food", "travel-agency"), "线路");
  assert.equal(mainPageLabel("food", "local-tour"), "线路");
  assert.equal(mainPageLabel("food", "visa"), "服务");
});

test("粗行业里的非典型子类使用自己的业务语言", () => {
  assert.equal(mainPageLabel("fashion", "medical-beauty"), "服务");
  assert.equal(mainPageLabel("org", "government"), "服务");
  assert.equal(mainPageLabel("grocery", "hospital"), "服务");
  assert.equal(mainPageLabel("general", "mall"), "商品");
  assert.equal(mainPageLabel("general", "personal"), "作品");
});

test("21 个骨架收敛为父级钉死的 4 种构成", () => {
  assert.deepEqual(
    LAYOUT_FAMILIES.map((layout) => layout.key),
    SHAPES.map((shape) => shape.key),
  );
  assert.deepEqual(SHAPES.map((shape) => shape.pages.length), [3, 4, 5, 6]);

  const used = new Set(allTemplates().map((meta) =>
    dnaFor(meta.slug, meta.industryKey, meta.variant).shape.key,
  ));
  assert.deepEqual([...used].sort(), ["s3", "s4", "s5", "s6"]);
});

test("500 件站点都从所属子类下限向上分布，没有一件被压小", () => {
  const shapeOrder = SHAPES.map((shape) => shape.key);
  const firstBySub = new Map();

  for (const meta of allTemplates()) {
    const floor = shapeFloor(meta.industryKey, meta.subKey);
    const actual = dnaFor(meta.slug, meta.industryKey, meta.variant).shape.key;
    assert.ok(
      shapeOrder.indexOf(actual) >= shapeOrder.indexOf(floor),
      `${meta.slug}: 下限 ${floor}，实际 ${actual}`,
    );
    if (!firstBySub.has(meta.subKey)) firstBySub.set(meta.subKey, { floor, actual });
  }

  for (const [subKey, row] of firstBySub) {
    assert.equal(row.actual, row.floor, `${subKey} 没有从自己的下限起步`);
  }
});

test("构成下限覆盖 105 个真实子类，且没有无效行业、幽灵键或未知档位", () => {
  const knownShapes = new Set(SHAPES.map((shape) => shape.key));
  const knownIndustries = new Set(INDUSTRIES.map((industry) => industry.key));
  const realSubs = new Set(ALL_SUB_KEYS);

  assert.deepEqual(
    Object.keys(SHAPE_FLOOR).filter((key) => !knownIndustries.has(key)),
    [],
  );
  assert.deepEqual(
    INDUSTRIES.map((industry) => industry.key).filter((key) => !SHAPE_FLOOR[key]),
    [],
  );
  assert.deepEqual(
    Object.keys(SHAPE_FLOOR_BY_SUB).filter((key) => !realSubs.has(key)),
    [],
  );
  for (const floor of [...Object.values(SHAPE_FLOOR), ...Object.values(SHAPE_FLOOR_BY_SUB)]) {
    assert.ok(knownShapes.has(floor), `未知构成下限 ${floor}`);
  }
  for (const industry of INDUSTRIES) {
    for (const sub of industry.subs) {
      assert.ok(knownShapes.has(shapeFloor(industry.key, sub.key)), sub.key);
    }
  }
});

test("500 件站点逐页使用所属构成的唯一板块序列", () => {
  for (const meta of allTemplates()) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const mainKey = mainPageKey(meta.industryKey, meta.subKey);
    const mainKind = mainSectionKind(mainKey);
    const expectedPages = dna.shape.pages.map((page) => page === "main" ? mainKey : page);
    assert.deepEqual(dna.layout.pages, expectedPages, `${meta.slug} 页面顺序`);

    const blueprint = SHAPE_SECTION_BLUEPRINTS[dna.shape.key];
    for (const semanticPage of dna.shape.pages) {
      const actualPage = semanticPage === "main" ? mainKey : semanticPage;
      const expectedSections = blueprint[semanticPage].map((section) =>
        section === "main" ? mainKind : section,
      );
      assert.deepEqual(
        dna.layout.sections[actualPage],
        expectedSections,
        `${meta.slug}/${actualPage} 板块顺序`,
      );
    }
  }
});

test("500 件站点的整套长相都来自行业准入表", () => {
  for (const meta of allTemplates()) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    assert.ok(skinsFor(meta.industryKey).includes(dna.skin.key), `${meta.slug}: ${dna.skin.key}`);
    assert.ok(dna.skin.palettes.includes(dna.palette.key), `${meta.slug}: ${dna.palette.key}`);
    assert.equal(dna.radius, dna.skin.radius, `${meta.slug}: radius`);
    assert.equal(dna.density, dna.skin.density, `${meta.slug}: density`);
    assert.equal(dna.font, dna.skin.font, `${meta.slug}: font`);
    assert.equal(dna.accentFx, dna.skin.fx, `${meta.slug}: fx`);
    assert.equal(dna.forceDark, dna.skin.dark, `${meta.slug}: dark`);
  }
});

test("同行业同变体不再因 slug 哈希得到不同长相", () => {
  const a = dnaFor("finance-2", "business", 2, "blue");
  const b = dnaFor("investment-2", "business", 2, "blue");
  assert.deepEqual(
    {
      shape: a.shape.key,
      skin: a.skin.key,
      palette: a.palette.key,
      radius: a.radius,
      density: a.density,
      font: a.font,
      styleSeed: a.styleSeed,
      fx: a.accentFx,
      dark: a.forceDark,
      layout: a.layout,
    },
    {
      shape: b.shape.key,
      skin: b.skin.key,
      palette: b.palette.key,
      radius: b.radius,
      density: b.density,
      font: b.font,
      styleSeed: b.styleSeed,
      fx: b.accentFx,
      dark: b.forceDark,
      layout: b.layout,
    },
  );
  assert.notEqual(a.imgSeed, b.imgSeed, "内容图片仍应按 slug 分散");
});

test("同子类变体先走遍准入套装再回头，且相邻不撞装", () => {
  const bySub = new Map();
  for (const meta of allTemplates()) {
    const skinKey = dnaFor(meta.slug, meta.industryKey, meta.variant).skin.key;
    if (!bySub.has(meta.subKey)) bySub.set(meta.subKey, { industryKey: meta.industryKey, skins: [] });
    bySub.get(meta.subKey).skins.push(skinKey);
  }

  for (const [subKey, row] of bySub) {
    const allowedCount = skinsFor(row.industryKey).length;
    assert.equal(
      new Set(row.skins.slice(0, Math.min(allowedCount, row.skins.length))).size,
      Math.min(allowedCount, row.skins.length),
      `${subKey} 没有先走遍准入套装`,
    );
    for (let index = 1; index < row.skins.length; index++) {
      assert.notEqual(row.skins[index], row.skins[index - 1], `${subKey} 相邻变体撞装`);
    }
  }
});

test("每个行业准入项都存在，且全量生成没有越界或饿死套装", () => {
  const known = new Set(SKINS.map((skin) => skin.key));
  const used = new Set();
  for (const industry of INDUSTRIES) {
    assert.ok(INDUSTRY_SKINS[industry.key]?.length >= 3, `${industry.key} 准入套装不足 3 套`);
    for (const skinKey of INDUSTRY_SKINS[industry.key]) assert.ok(known.has(skinKey), skinKey);
  }
  for (const meta of allTemplates()) {
    used.add(dnaFor(meta.slug, meta.industryKey, meta.variant).skin.key);
  }
  assert.deepEqual([...used].sort(), [...known].sort());
});
