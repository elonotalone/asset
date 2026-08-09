// W3a：多页扩展文案的静态判据。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/template-copy-ext.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { INDUSTRY_COPY_POOLS } from "../lib/content-pools/industry-copy.ts";
import { buildExt } from "../lib/template-content-ext.ts";
import { dnaFor } from "../lib/template-dna.ts";
import { KIND_ONLY_WORDS } from "../lib/template-kind-lexicon.ts";
import { INDUSTRIES, allTemplates, templatesForSub } from "../lib/template-taxonomy.ts";

const HAN = /[\u3400-\u9fff]/g;
const MAX_SHARED_SITES = 25;

function stringsIn(value, out = []) {
  if (typeof value === "string") {
    out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringsIn(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringsIn(item, out);
  }
  return out;
}

function hanLength(value) {
  return value.match(HAN)?.length ?? 0;
}

function sectionKinds(meta) {
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
  return new Set(Object.values(dna.layout.sections).flat());
}

function visibleExt(ext, kinds) {
  return {
    cases: kinds.has("cases") ? ext.cases : [],
    news: kinds.has("news") ? ext.news : [],
    team: kinds.has("team") ? ext.team : [],
    products: kinds.has("products") ? ext.products : [],
    menu: kinds.has("menu") ? ext.menu : [],
    faq: kinds.has("faq") ? ext.faq : [],
    pricing: kinds.has("pricing") ? ext.pricing : [],
    process: kinds.has("process") || kinds.has("timeline") ? ext.process : [],
    logos: kinds.has("logos") || kinds.has("marquee") ? ext.logos : [],
  };
}

test("13 个行业都有完整、可轮换的语义池", () => {
  const expected = INDUSTRIES.map((industry) => industry.key).sort();
  assert.deepEqual(Object.keys(INDUSTRY_COPY_POOLS).sort(), expected);

  for (const [industryKey, pool] of Object.entries(INDUSTRY_COPY_POOLS)) {
    assert.equal(pool.themes.length, 6, `${industryKey}.themes`);
    assert.equal(pool.actions.length, 6, `${industryKey}.actions`);
    assert.equal(pool.evidence.length, 6, `${industryKey}.evidence`);
    assert.equal(pool.angles.length, 6, `${industryKey}.angles`);
    assert.equal(pool.roles.length, 4, `${industryKey}.roles`);
    assert.equal(pool.offerings.length, 8, `${industryKey}.offerings`);
    assert.equal(pool.stages.length, 4, `${industryKey}.stages`);
    for (const value of stringsIn(pool)) {
      assert.ok(value.length > 0, `${industryKey} 含空文案`);
    }
  }
});

test("buildExt 保持固定形状、同 slug 确定、相邻变体不再是同一份文案", () => {
  for (const industry of INDUSTRIES) {
    for (const sub of industry.subs) {
      const metas = templatesForSub(industry, sub);
      const signatures = new Set();
      for (const meta of metas) {
        const first = buildExt(meta.slug, meta.industryKey, meta.subLabel);
        const second = buildExt(meta.slug, meta.industryKey, meta.subLabel);
        assert.deepEqual(second, first, `${meta.slug} 两次生成不一致`);
        assert.deepEqual(
          {
            cases: first.cases.length,
            news: first.news.length,
            team: first.team.length,
            products: first.products.length,
            menu: first.menu.map((group) => group.items.length),
            faq: first.faq.length,
            pricing: first.pricing.length,
            process: first.process.length,
            logos: first.logos.length,
          },
          {
            cases: 6,
            news: 6,
            team: 4,
            products: 8,
            menu: [4, 4],
            faq: 5,
            pricing: 3,
            process: 4,
            logos: 8,
          },
          `${meta.slug} 返回形状变化`,
        );
        signatures.add(JSON.stringify(first));
      }
      assert.equal(signatures.size, metas.length, `${sub.key} 的相邻变体仍返回同一份扩展文案`);
    }
  }
});

test("长文案带着自己的子类语境，500 站最坏重复不超过 25 站", () => {
  const occurrences = new Map();
  const missingContext = [];

  for (const meta of allTemplates()) {
    const ext = buildExt(meta.slug, meta.industryKey, meta.subLabel);
    const siteStrings = new Set(stringsIn(ext).filter((value) => hanLength(value) >= 8));
    for (const value of siteStrings) {
      if (!value.includes(meta.subLabel)) missingContext.push(`${meta.slug}: ${value}`);
      if (!occurrences.has(value)) occurrences.set(value, []);
      occurrences.get(value).push(meta.slug);
    }
  }

  assert.deepEqual(
    missingContext,
    [],
    `这些长文案没有带上所在子类，容易退回跨行业填充：\n${missingContext.slice(0, 20).join("\n")}`,
  );

  const offenders = [...occurrences]
    .filter(([, slugs]) => slugs.length > MAX_SHARED_SITES)
    .sort((a, b) => b[1].length - a[1].length);
  assert.deepEqual(
    offenders,
    [],
    offenders
      .slice(0, 20)
      .map(([value, slugs]) => `${slugs.length} 站：${value}`)
      .join("\n"),
  );
});

test("扩展层不把专属板块词带进缺少该板块的站", () => {
  const leaks = [];
  for (const meta of allTemplates()) {
    const kinds = sectionKinds(meta);
    const ext = buildExt(meta.slug, meta.industryKey, meta.subLabel);
    const visibleText = stringsIn(visibleExt(ext, kinds)).join("\n");
    for (const [kind, words] of Object.entries(KIND_ONLY_WORDS)) {
      if (kinds.has(kind)) continue;
      for (const word of words) {
        if (visibleText.includes(word)) leaks.push(`${meta.slug}: ${word} -> ${kind}`);
      }
    }
  }
  assert.deepEqual(leaks, [], leaks.slice(0, 30).join("\n"));
});

test("人物、协作方与金额都明确是待替换的演示内容", () => {
  for (const meta of allTemplates()) {
    const ext = buildExt(meta.slug, meta.industryKey, meta.subLabel);
    assert.ok(ext.team.every((member) => member.name.startsWith("待替换成员·")), meta.slug);
    assert.ok(ext.logos.every((logo) => logo.includes("演示协作方")), meta.slug);
    assert.ok(ext.products.every((product) => product.price.startsWith("示例 ¥")), meta.slug);
    assert.ok(
      ext.menu.every((group) => group.items.every((item) => item.price.startsWith("示例 ¥"))),
      meta.slug,
    );
    assert.ok(
      ext.pricing.every((plan) => !/\d/.test(plan.price) || plan.price.startsWith("示例 ¥")),
      meta.slug,
    );
  }
});

test("同一个子类标签换行业后会换成对应行业的说法", () => {
  const media = buildExt("fictional-1", "media", "演示服务");
  const tech = buildExt("fictional-1", "tech", "演示服务");
  const logistics = buildExt("fictional-1", "logistics", "演示服务");
  assert.notEqual(media.cases[0].desc, tech.cases[0].desc);
  assert.notEqual(tech.cases[0].desc, logistics.cases[0].desc);
  assert.match(media.cases.map((item) => item.desc).join(""), /受众|创意|传播|内容|渠道|素材/);
  assert.match(tech.cases.map((item) => item.desc).join(""), /功能|数据|系统|接口|运行|迭代/);
  assert.match(logistics.cases.map((item) => item.desc).join(""), /货物|线路|时效|仓储|异常|签收/);
});
