// website-source@1 发射器的判据测试。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-website-source.test.mjs
//
// 判据分三组：
//   A. 结构提取（不依赖 website）：页数 / 板块种类与顺序 / 槽位齐全 / 变体号与引擎同源
//   B. 接口 B 一致性：22 个类型的 content 字段名不越界、数组不空、图片槽在位
//   C. HTML 不回归：同一份 meta 渲出来的 HTML 仍含上游文案（引擎未被改动的旁证）

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { allTemplates, subByKey, TARGET_TOTAL } from "../lib/template-taxonomy.ts";
import { dnaFor } from "../lib/template-dna.ts";
import { hashStr } from "../lib/hash.ts";
import { buildTemplateStructure, ALL_SECTION_KINDS } from "../lib/template-website-source-ir.ts";
import {
  assertEmitterComplete,
  buildWebsiteSourceBundle,
  buildWebsiteSourceConfig,
  selectionKeysFor,
} from "../lib/template-website-source.ts";
import {
  SECTION_CONTENT_SCHEMA,
  SECTION_TYPE_MAP,
  WEBSITE_SECTION_TYPES,
} from "../lib/template-website-source-map.ts";
import { IMAGE_SLOT_POLICY } from "../lib/template-image-policy.ts";
import { renderTemplateBilingual } from "../lib/template-engine.ts";

const ALL = allTemplates();

/** 确定性抽样：收敛后差异全在构成×装上，逐个组合各取一站，不靠随机。 */
function sample() {
  const byCombo = new Map();
  for (const meta of ALL) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const key = `${dna.shape.key}|${dna.skin.key}`;
    if (!byCombo.has(key)) byCombo.set(key, meta);
  }
  return [...byCombo.values()];
}

function withTaxonomy(meta) {
  const hit = subByKey(meta.subKey);
  assert.ok(hit, `${meta.slug}: 找不到子类 ${meta.subKey}`);
  return { meta, industry: hit.ind, sub: hit.sub };
}

function imagesInSection(section) {
  const schema = SECTION_CONTENT_SCHEMA[section.type];
  return schema.imageSlots.flatMap((slotPath) => {
    const [head, tail] = slotPath.split(".");
    if (!tail) return [section.content[head]];
    const rows = section.content[head];
    return Array.isArray(rows) ? rows.map((row) => row?.[tail]) : [];
  });
}

function sectionsIn(config) {
  return config.pages.flatMap((page) => page.sections);
}

function filledImageUrls(config) {
  return sectionsIn(config)
    .flatMap(imagesInSection)
    .map((image) => image?.url)
    .filter(Boolean);
}

function assertRequiredImages(config, slug) {
  for (const section of sectionsIn(config)) {
    const images = imagesInSection(section);
    if (IMAGE_SLOT_POLICY[section.type].rule === "required") {
      assert.ok(images.length > 0, `${slug}/${section.type}: required 图片槽不存在`);
      for (const image of images) {
        assert.match(image?.url ?? "", /^images\/[^/]+\.webp$/, `${slug}/${section.type}: required 图片不是站内 webp`);
      }
    }
    for (const image of images) {
      if (image?.url) assert.ok(!/^https?:\/\//i.test(image.url), `${slug}/${section.type}: 图片仍是外链`);
    }
  }
}

test("A0 发射器完整：38 个 SectionKind 全有落点与组装器", () => {
  assertEmitterComplete();
  assert.equal(ALL_SECTION_KINDS.length, 38);
  assert.equal(WEBSITE_SECTION_TYPES.length, 22);
  for (const kind of ALL_SECTION_KINDS) {
    assert.ok(WEBSITE_SECTION_TYPES.includes(SECTION_TYPE_MAP[kind]), `${kind} 落到未知类型`);
  }
});

test("A0.1 图槽策略：只要求引擎真正画出的业务照片，人物与装饰位保持可选", () => {
  assert.deepEqual(Object.keys(IMAGE_SLOT_POLICY).sort(), [...WEBSITE_SECTION_TYPES].sort());
  const required = Object.entries(IMAGE_SLOT_POLICY)
    .filter(([, policy]) => policy.rule === "required")
    .map(([type]) => type);
  assert.deepEqual(required, ["hero", "about", "services", "products", "gallery", "cases", "news"]);
  for (const type of ["team", "testimonials", "faq", "pricing", "stats", "process", "timeline", "chart"]) {
    assert.equal(IMAGE_SLOT_POLICY[type].rule, "optional", `${type} 不应被图库照片强填`);
    assert.ok(IMAGE_SLOT_POLICY[type].why.length >= 8, `${type} 缺少人能复核的理由`);
  }
});

test("A1 结构提取：页数/板块顺序与 DNA 布局家族逐项一致", () => {
  for (const { meta, industry, sub } of sample().map(withTaxonomy)) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const st = buildTemplateStructure(meta, industry, sub);
    assert.deepEqual(
      st.pages.map((p) => p.key),
      dna.layout.pages,
      `${meta.slug}: 页序列不一致`,
    );
    assert.equal(st.pages[0].path, "/", `${meta.slug}: 首页 path 必须是 /`);
    for (const page of st.pages) {
      const expected = dna.layout.sections[page.key] ?? ["pageHeader", "cta"];
      assert.deepEqual(
        page.sections.map((s) => s.kind),
        expected,
        `${meta.slug}/${page.key}: 板块种类与顺序不一致`,
      );
      const ids = page.sections.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, `${meta.slug}/${page.key}: 章节 id 重复`);
    }
  }
});

test("A2 变体号与引擎同源（同一 hash 公式，非反推 HTML）", () => {
  for (const { meta, industry, sub } of sample().slice(0, 8).map(withTaxonomy)) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    const st = buildTemplateStructure(meta, industry, sub);
    for (const page of st.pages) {
      for (const sec of page.sections) {
        if (sec.variantCount <= 1) continue;
        const expected = (hashStr(`${meta.slug}:sec:${sec.kind}:${page.key}`) + dna.styleSeed) % sec.variantCount;
        assert.equal(sec.variant, expected, `${meta.slug}/${page.key}/${sec.kind}: 变体号与引擎不一致`);
      }
    }
  }
});

test("A3 槽位齐全：行业照片走站内路径，人物位保留可编辑空槽", () => {
  const kindsSeen = new Set();
  for (const { meta, industry, sub } of sample().map(withTaxonomy)) {
    const st = buildTemplateStructure(meta, industry, sub);
    for (const page of st.pages) {
      for (const sec of page.sections) {
        kindsSeen.add(sec.kind);
        const filled = sec.slots.filter((s) => (s.text && (s.text.zh || s.text.en)) || s.texts?.length || s.url || s.iconPath);
        const groupItems = sec.groups.reduce((n, g) => n + g.blocks.length, 0);
        assert.ok(filled.length || groupItems, `${meta.slug}/${page.key}/${sec.kind}: 一个槽位都没有`);
        for (const slot of sec.slots) {
          if (slot.kind !== "image") continue;
          if (slot.url) assert.match(slot.url, /^images\/[^/]+\.webp$/, `${meta.slug}/${sec.kind}: 图片不是站内路径`);
          else assert.equal(IMAGE_SLOT_POLICY[SECTION_TYPE_MAP[sec.kind]].rule, "optional", `${meta.slug}/${sec.kind}: required 图片槽为空`);
          assert.equal(slot.editable, true);
        }
        for (const group of sec.groups) {
          for (const block of group.blocks) {
            for (const slot of block.slots) {
              if (slot.kind !== "image") continue;
              if (slot.url) assert.match(slot.url, /^images\/[^/]+\.webp$/, `${meta.slug}/${sec.kind}: 列表图片不是站内路径`);
              else assert.equal(IMAGE_SLOT_POLICY[SECTION_TYPE_MAP[sec.kind]].rule, "optional", `${meta.slug}/${sec.kind}: required 列表图片为空`);
              assert.equal(slot.editable, true);
            }
          }
        }
        // 双语成对：中文有值的文本槽，英文也必须有值。
        for (const slot of sec.slots) {
          if (slot.kind === "image" || slot.kind === "icon" || !slot.text) continue;
          if (slot.text.zh) assert.ok(slot.text.en, `${meta.slug}/${sec.kind}/${slot.name}: 缺英文`);
        }
      }
    }
  }
  // 抽样应覆盖全部 38 种 kind（21 个布局家族 × 每族的页面序列足以铺满）。
  for (const kind of ALL_SECTION_KINDS) {
    assert.ok(kindsSeen.has(kind), `抽样没覆盖 ${kind}，判据不算齐`);
  }
});

test("B1 接口 B 一致性：content 字段名不越界、数组有数据、footer 每页补齐", () => {
  for (const { meta, industry, sub } of sample().map(withTaxonomy)) {
    const st = buildTemplateStructure(meta, industry, sub);
    for (const lang of ["zh", "en"]) {
      const cfg = buildWebsiteSourceConfig(st, lang);
      assert.equal(cfg.pages.length, st.pages.length);
      assert.deepEqual(cfg.sections, cfg.pages[0].sections, `${meta.slug}: sections 必须是 pages[0] 的别名`);
      for (const page of cfg.pages) {
        assert.equal(page.sections.at(-1).type, "footer", `${meta.slug}/${page.path}: 页尾缺 footer 节`);
        for (const sec of page.sections) {
          const schema = SECTION_CONTENT_SCHEMA[sec.type];
          assert.ok(schema, `${sec.type} 不在接口 B 词汇表里`);
          const allowed = new Set([...schema.fields, ...Object.keys(schema.arrays ?? {}), "image"]);
          for (const key of Object.keys(sec.content)) {
            assert.ok(allowed.has(key), `${meta.slug}/${sec.type}: content.${key} 不在接口 B schema 里（会被丢掉）`);
          }
          for (const [arrayKey, itemFields] of Object.entries(schema.arrays ?? {})) {
            const arr = sec.content[arrayKey];
            if (!Array.isArray(arr) || !arr.length) continue;
            assert.ok(arr.length <= 24, `${meta.slug}/${sec.type}.${arrayKey}: 超过 24 项上限`);
            for (const item of arr) {
              for (const key of Object.keys(item)) {
                assert.ok(
                  itemFields.includes(key) || key === "image",
                  `${meta.slug}/${sec.type}.${arrayKey}[].${key} 不在接口 B schema 里`,
                );
              }
            }
          }
          assert.ok(sec.style.paddingTop >= 0 && sec.style.paddingTop <= 240);
          assert.ok(sec.style.cornerRadius >= 0 && sec.style.cornerRadius <= 64);
          assert.match(sec.id, /^[A-Za-z0-9_.-]{1,32}$/, `${meta.slug}: 章节 id 不合法 ${sec.id}`);
        }
      }
      // 列表型板块必须真有数据（空数组会被 website 回填默认文案 ⇒ 500 个模板长一样）。
      for (const sec of cfg.pages.flatMap((p) => p.sections)) {
        const schema = SECTION_CONTENT_SCHEMA[sec.type];
        for (const arrayKey of Object.keys(schema.arrays ?? {})) {
          if (sec.type === "footer" && arrayKey === "links") continue;
          const arr = sec.content[arrayKey];
          if (Array.isArray(arr)) assert.ok(arr.length > 0, `${meta.slug}/${sec.type}.${arrayKey} 是空数组`);
        }
      }
    }
  }
});

test("B2 归并与降级按接口 B 记账：marquee → logos(display=marquee)，sig* 落共享类型", () => {
  const seen = new Map();
  for (const { meta, industry, sub } of sample().map(withTaxonomy)) {
    const st = buildTemplateStructure(meta, industry, sub);
    const cfg = buildWebsiteSourceConfig(st, "zh");
    const flatIr = st.pages.flatMap((p) => p.sections);
    for (const sec of flatIr) seen.set(sec.kind, SECTION_TYPE_MAP[sec.kind]);
    const logos = cfg.pages.flatMap((p) => p.sections).filter((s) => s.type === "logos");
    for (const l of logos) assert.ok(["strip", "marquee"].includes(l.content.display));
    if (flatIr.some((s) => s.kind === "marquee")) {
      assert.ok(logos.some((l) => l.content.display === "marquee"), `${meta.slug}: marquee 没有落成 display=marquee`);
    }
  }
  assert.equal(seen.get("marquee"), "logos");
  assert.equal(seen.get("sigNeonHero"), "hero");
  assert.equal(seen.get("sigStickerCta"), "cta");
});

test("B3 源码树：清单 entrypoint 指向 index.html，工程对象与运行时齐全", () => {
  const { meta, industry, sub } = withTaxonomy(sample()[0]);
  const bundle = buildWebsiteSourceBundle(meta, industry, sub, { byteLen: (t) => Buffer.byteLength(t, "utf8"), sha256: () => "0".repeat(64) });
  const paths = bundle.tree.files.map((f) => f.path);
  assert.equal(bundle.tree.entrypoint, "oceanleo.website-source.json");
  for (const need of ["index.html", "site.json", "site.en.json", "assets/styles.css", "assets/app.js", "README.md", "oceanleo.template-structure.json"]) {
    assert.ok(paths.includes(need), `源码树缺 ${need}`);
  }
  const manifest = JSON.parse(bundle.tree.files[0].text);
  assert.equal(manifest.schema, "website-source@1");
  assert.equal(manifest.entrypoint, "index.html");
  assert.equal(manifest.files.length, paths.length - 1);
  const pathSet = new Set(paths);
  for (const f of bundle.tree.files) {
    if (f.text !== undefined) {
      assert.ok(f.text.length > 0, `${f.path} 是空文件`);
      continue;
    }
    assert.match(f.path, /^images\/[^/]+\.webp$/, `${f.path} 不是站内图片成员`);
    assert.match(f.sourcePath ?? "", /^public\/template-photos\/[^/]+\.webp$/, `${f.path} 没有镜像 sourcePath`);
    assert.ok(existsSync(resolve(f.sourcePath)), `${f.path} 的镜像文件不存在`);
  }
  for (const entry of manifest.files) assert.ok(pathSet.has(entry.path), `清单登记了不存在的 ${entry.path}`);
  for (const url of filledImageUrls(bundle.config)) assert.ok(pathSet.has(url), `配置引用的 ${url} 没随源码树发运`);
  assertRequiredImages(bundle.config, meta.slug);
  assert.ok(paths.some((path) => path.startsWith("images/")), "源码树没有二进制图片成员");
  const keys = selectionKeysFor(bundle.structure);
  assert.ok(keys.industryKey && keys.subKey && keys.colorKey);
  assert.ok(keys.sections > 0 && keys.slots > 0);
});

test("B4 全量 500：required 空图为零、图片离线随件、站内不被一张图包办", () => {
  assert.equal(ALL.length, TARGET_TOTAL);
  let sections = 0;
  let slots = 0;
  let requiredImages = 0;
  for (const meta of ALL) {
    const hit = subByKey(meta.subKey);
    const { structure: st, config, configEn, tree } = buildWebsiteSourceBundle(meta, hit.ind, hit.sub);
    assert.ok(st.totals.pages >= 3, `${meta.slug}: 页数 ${st.totals.pages} < 3`);
    assert.ok(st.totals.sections >= st.totals.pages, `${meta.slug}: 板块数异常`);
    sections += st.totals.sections;
    slots += st.totals.slots;
    assert.equal(config.pages.length, st.totals.pages);
    assert.ok(config.themeColor.startsWith("#"));
    assertRequiredImages(config, meta.slug);
    assertRequiredImages(configEn, `${meta.slug}/en`);

    for (const section of sectionsIn(config)) {
      const images = imagesInSection(section);
      if (IMAGE_SLOT_POLICY[section.type].rule === "required") requiredImages += images.length;
      if (section.type === "team" || section.type === "testimonials") {
        for (const image of images) {
          assert.equal(image?.url, undefined, `${meta.slug}/${section.type}: 不得拿图库人物冒充真人`);
          assert.match(image?.alt ?? "", /^请上传真实/, `${meta.slug}/${section.type}: 空人物位没有换图提示`);
        }
      }
    }

    const urls = filledImageUrls(config);
    if (urls.length >= 3) {
      const counts = new Map();
      for (const url of urls) counts.set(url, (counts.get(url) ?? 0) + 1);
      const max = Math.max(...counts.values());
      assert.ok(max / urls.length <= 0.5, `${meta.slug}: 一张图占 ${max}/${urls.length}`);
    }

    const files = new Map(tree.files.map((file) => [file.path, file]));
    for (const url of urls) {
      const file = files.get(url);
      assert.ok(file, `${meta.slug}: ${url} 未随源码树发运`);
      assert.ok(file.sourcePath && existsSync(resolve(file.sourcePath)), `${meta.slug}: ${url} 镜像文件不存在`);
    }

    for (const page of st.pages) {
      for (const section of page.sections) {
        for (const image of section.slots.filter((slot) => slot.kind === "image")) {
          if (image.url) assert.match(image.url, /^images\/[^/]+\.webp$/, `${meta.slug}: IR 图片仍是外链`);
        }
        for (const group of section.groups) {
          for (const block of group.blocks) {
            for (const image of block.slots.filter((slot) => slot.kind === "image")) {
              if (image.url) assert.match(image.url, /^images\/[^/]+\.webp$/, `${meta.slug}: IR 列表图片仍是外链`);
            }
          }
        }
      }
    }
  }
  assert.ok(sections > 500 * 10, `板块总数 ${sections} 偏少`);
  assert.ok(slots > 500 * 50, `槽位总数 ${slots} 偏少`);
  assert.ok(requiredImages > 8_000, `required 图片总数 ${requiredImages} 偏少`);
});

test("C1 HTML 输出不回归：引擎照常渲染，且与工程对象同源文案", () => {
  for (const { meta, industry, sub } of sample().slice(0, 6).map(withTaxonomy)) {
    const { html, pages } = renderTemplateBilingual(meta, industry, sub);
    assert.match(html, /^<!DOCTYPE html>/);
    assert.ok(html.includes("<body"));
    const st = buildTemplateStructure(meta, industry, sub);
    assert.deepEqual(pages.map((p) => p.key), st.pages.map((p) => p.key));
    // 同一份上游文案：结构里的品牌与首页 hero 标题必须在 HTML 里出现。
    assert.ok(html.includes(st.brand.zh), `${meta.slug}: HTML 里没有品牌名`);
    const heroLike = st.pages[0].sections.find((s) => s.slots.some((x) => x.role === "heading"));
    const heading = heroLike.slots.find((x) => x.role === "heading").text.zh;
    assert.ok(html.includes(heading.replace(/&/g, "&amp;")), `${meta.slug}: HTML 里没有首屏标题`);
  }
});

// UC-4（docs/architecture/oceanleo-untrusted-content-isolation.md §8）：
// 交付给用户的 assets/app.js 是唯一的渲染面。模板可被 fork 成用户自己的站点，
// 那时 site.json 即用户内容，所以运行时必须结构性无 HTML sink，
// 不能靠"记得调 escape"。这条守住 scripts/oceanleo-untrusted-render-scan.py 的判定。
test("D1 UC-4 运行时无 HTML/JS 注入 sink：只走 createElement + textContent", () => {
  const { meta, industry, sub } = withTaxonomy(sample()[0]);
  const { tree } = buildWebsiteSourceBundle(meta, industry, sub, { byteLen: (t) => Buffer.byteLength(t, "utf8"), sha256: () => "0".repeat(64) });
  const runtime = tree.files.find((f) => f.path === "assets/app.js").text;
  const html = tree.files.find((f) => f.path === "index.html").text;
  for (const sink of [/\.(?:inner|outer)HTML\s*\+?=/, /document\s*\.\s*write(?:ln)?\s*\(/, /(?<![\w.$])eval\s*\(/, /new\s+Function\s*\(/, /["'`(=]\s*javascript:/]) {
    assert.ok(!sink.test(runtime), `assets/app.js 命中注入 sink ${sink}`);
    assert.ok(!sink.test(html), `index.html 命中注入 sink ${sink}`);
  }
  assert.ok(!/\son[a-z]+\s*=/.test(runtime), "运行时不应出现内联事件属性");
  assert.ok(runtime.includes("document.createElement"), "运行时应用 createElement 造节点");
  assert.ok(runtime.includes("textContent"), "运行时应用 textContent 落文案");
});
