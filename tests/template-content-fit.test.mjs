// C3：「主营」页必须展示它名下的真实业务对象，四种构成不得靠裁切内容过门。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-content-fit.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import {
  MENU_GROUPS_BY_SUB,
  PRODUCT_NOUNS_BY_SUB,
  WORK_TITLES_BY_SUB,
} from "../lib/content-pools/main-offerings.ts";
import {
  SHAPES,
  mainPageLabel,
  shapeFloor,
} from "../lib/template-skins.ts";
import {
  dnaFor,
  mainPageKey,
  mainSectionKind,
} from "../lib/template-dna.ts";
import {
  buildTemplateStructure,
} from "../lib/template-website-source-ir.ts";
import {
  buildWebsiteSourceConfig,
} from "../lib/template-website-source.ts";
import {
  INDUSTRIES,
  allTemplates,
  subByKey,
} from "../lib/template-taxonomy.ts";

const ALL = allTemplates();
const SHAPE_ORDER = SHAPES.map((shape) => shape.key);

function taxonomyFor(meta) {
  const found = subByKey(meta.subKey);
  assert.ok(found, `${meta.slug}: taxonomy 缺少 ${meta.subKey}`);
  return found;
}

function textAt(slots, name, lang = "zh") {
  return slots.find((slot) => slot.name === name)?.text?.[lang] ?? "";
}

function groupAt(section, name) {
  return section.groups.find((group) => group.name === name);
}

function assertPortraitPrompts(config, lang, slug) {
  const prompts = {
    team: lang === "en" ? "Upload a real team photo" : "请上传真实团队照片",
    testimonials: lang === "en" ? "Upload a real customer photo" : "请上传真实客户照片",
  };
  for (const page of config.pages) {
    for (const section of page.sections) {
      const people = section.type === "team"
        ? section.content.members
        : section.type === "testimonials" ? section.content.items : [];
      if (!Array.isArray(people)) continue;
      for (const person of people) {
        assert.equal(person.image?.url, undefined, `${slug}/${page.path}: 库存人物图混入 ${section.type}`);
        assert.equal(person.image?.keyword, prompts[section.type], `${slug}/${page.path}: 人物空态提示`);
        assert.equal(person.image?.alt, prompts[section.type], `${slug}/${page.path}: 人物 alt 提示`);
      }
    }
  }
}

test("商品、菜单、作品目录完整覆盖对应子类", () => {
  const expected = { products: [], menu: [], works: [] };
  for (const industry of INDUSTRIES) {
    for (const sub of industry.subs) {
      const key = mainPageKey(industry.key, sub.key);
      if (expected[key]) expected[key].push(sub.key);
    }
  }

  assert.deepEqual(Object.keys(PRODUCT_NOUNS_BY_SUB).sort(), expected.products.sort());
  assert.deepEqual(Object.keys(MENU_GROUPS_BY_SUB).sort(), expected.menu.sort());
  assert.deepEqual(Object.keys(WORK_TITLES_BY_SUB).sort(), expected.works.sort());

  for (const [subKey, nouns] of Object.entries(PRODUCT_NOUNS_BY_SUB)) {
    assert.equal(nouns.length, 4, `${subKey}: 商品核心对象数`);
    assert.equal(new Set(nouns).size, nouns.length, `${subKey}: 商品对象重复`);
  }
  for (const [subKey, groups] of Object.entries(MENU_GROUPS_BY_SUB)) {
    assert.deepEqual(groups.map((group) => group.items.length), [4, 4], `${subKey}: 菜单不是 2×4`);
    assert.equal(new Set(groups.flatMap((group) => group.items.map((entry) => entry.zh))).size, 8, `${subKey}: 菜品重复`);
  }
  for (const [subKey, works] of Object.entries(WORK_TITLES_BY_SUB)) {
    assert.equal(works.length, 6, `${subKey}: 作品数`);
    assert.equal(new Set(works).size, works.length, `${subKey}: 作品重复`);
  }
});

test("500 站不低于构成下限，主营页名、section 与内容逐项相符", (t) => {
  const distribution = Object.fromEntries(SHAPES.map((shape) => [shape.key, 0]));
  let mainPages = 0;
  let compactSites = 0;

  for (const meta of ALL) {
    const { ind, sub } = taxonomyFor(meta);
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const floor = shapeFloor(meta.industryKey, meta.subKey);
    distribution[dna.shape.key] += 1;
    assert.ok(
      SHAPE_ORDER.indexOf(dna.shape.key) >= SHAPE_ORDER.indexOf(floor),
      `${meta.slug}: 下限 ${floor}，实际 ${dna.shape.key}`,
    );

    const structure = buildTemplateStructure(meta, ind, sub, dna);
    assert.equal(structure.pages.length, dna.shape.pages.length, `${meta.slug}: 页面数被裁切`);
    assert.deepEqual(
      structure.pages.map((page) => page.key),
      dna.layout.pages,
      `${meta.slug}: 页面顺序与构成不符`,
    );

    const label = mainPageLabel(meta.industryKey, meta.subKey);
    const pageKey = mainPageKey(meta.industryKey, meta.subKey);
    const sectionKind = mainSectionKind(pageKey);
    const mainPage = structure.pages.find((page) => page.key === pageKey);
    if (!mainPage) {
      compactSites += 1;
      assert.equal(dna.shape.key, "s3", `${meta.slug}: 非三页站缺主营页`);
      assert.equal(floor, "s3", `${meta.slug}: 非三页业务被压进三页`);
      continue;
    }
    mainPages += 1;

    assert.equal(mainPage.label.zh, label, `${meta.slug}: 主营页名`);
    const mainSection = mainPage.sections.find((section) => section.kind === sectionKind);
    assert.ok(mainSection, `${meta.slug}: ${label}页缺少 ${sectionKind}`);
    assert.equal(textAt(mainSection.slots, "title"), label, `${meta.slug}: 主营 section 标题`);

    const configZh = buildWebsiteSourceConfig(structure, "zh");
    const configEn = buildWebsiteSourceConfig(structure, "en");
    const configPage = configZh.pages.find((page) => page.id === pageKey);
    assert.ok(configPage, `${meta.slug}: website-source 缺主营页`);
    assert.equal(configPage.name, label, `${meta.slug}: website-source 主营页名`);
    assert.equal(
      configZh.navigation.find((entry) => entry.href === mainPage.path)?.label,
      label,
      `${meta.slug}: website-source 导航名`,
    );

    const sourceSection = configPage.sections.find((section) => section.type === sectionKind);
    assert.ok(sourceSection, `${meta.slug}: website-source 缺 ${sectionKind}`);
    assert.equal(sourceSection.content.title, label, `${meta.slug}: website-source 主营标题`);

    if (pageKey === "products") {
      const nouns = PRODUCT_NOUNS_BY_SUB[meta.subKey];
      const names = sourceSection.content.items.map((entry) => entry.name);
      assert.equal(names.length, 8, `${meta.slug}: 商品槽被裁切`);
      assert.ok(
        names.every((name) => nouns.some((noun) => name.includes(noun))),
        `${meta.slug}: 商品页仍在展示业务动作：${names.join(" / ")}`,
      );
      if (["项目", "拍品", "房源", "车辆"].includes(label)) {
        assert.equal(sourceSection.content.ctaLabel, "咨询详情", `${meta.slug}: 非零售对象仍要求加购`);
      }
    } else if (pageKey === "menu") {
      const dishes = MENU_GROUPS_BY_SUB[meta.subKey].flatMap((group) => group.items.map((entry) => entry.zh));
      const names = sourceSection.content.groups.flatMap((group) => group.items.map((entry) => entry.name));
      assert.equal(names.length, 8, `${meta.slug}: 菜品槽被裁切`);
      assert.ok(
        names.every((name) => dishes.some((dish) => name.includes(dish))),
        `${meta.slug}: 菜单里不是具体菜品：${names.join(" / ")}`,
      );
    } else if (pageKey === "works") {
      const works = WORK_TITLES_BY_SUB[meta.subKey];
      const captions = sourceSection.content.items.map((entry) => entry.caption);
      assert.ok(captions.length >= 5, `${meta.slug}: 作品槽被裁切`);
      assert.ok(
        captions.every((caption) => works.some((work) => caption.includes(work))),
        `${meta.slug}: 作品页仍只有无名图片：${captions.join(" / ")}`,
      );
    } else {
      const names = sourceSection.content.items.map((entry) => entry.name);
      assert.equal(names.length, 4, `${meta.slug}: 服务/课程/客房/线路槽被裁切`);
      if (label === "课程") {
        assert.ok(
          names.every((name) => !/团队|校园生活|升学指导|服务方案/.test(name)),
          `${meta.slug}: 课程页混入师资或服务条目`,
        );
      }
      if (label === "客房") assert.ok(names.every((name) => /房|院/.test(name)), `${meta.slug}: 客房页混入非房型条目`);
      if (label === "线路") assert.ok(names.every((name) => name.includes("线")), `${meta.slug}: 线路页混入非线路条目`);
    }

    assertPortraitPrompts(configZh, "zh", meta.slug);
    assertPortraitPrompts(configEn, "en", meta.slug);
  }

  t.diagnostic(`sites=${ALL.length} main_pages=${mainPages} compact_s3=${compactSites}`);
  assert.deepEqual(distribution, { s3: 6, s4: 101, s5: 173, s6: 220 });
  assert.equal(mainPages, 494);
  assert.equal(compactSites, 6);
});
