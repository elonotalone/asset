import assert from "node:assert/strict";
import test from "node:test";

import { chartSeriesFor } from "../lib/template-chart-data.ts";
import { dnaFor } from "../lib/template-dna.ts";
import { hashStr } from "../lib/hash.ts";
import { allTemplates, subByKey } from "../lib/template-taxonomy.ts";

const ALL = allTemplates();

function chartSections(meta) {
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
  const sections = [];
  for (const pageKey of dna.layout.pages) {
    for (const kind of dna.layout.sections[pageKey] ?? []) {
      if (kind !== "chart") continue;
      sections.push({
        pageKey,
        variant: (hashStr(`${meta.slug}:sec:chart:${pageKey}`) + dna.styleSeed) % 3,
      });
    }
  }
  return sections;
}

test("图表序列由行业、子类与模板变体共同决定，且同一输入保持确定", () => {
  for (const meta of ALL) {
    const first = chartSeriesFor(meta, "zh");
    assert.deepEqual(chartSeriesFor(meta, "zh"), first, meta.slug);
    assert.equal(first.labels.length, 4, meta.slug);
    assert.equal(first.values.length, 4, meta.slug);
    assert.ok(first.values.every((value) => Number.isInteger(value) && value > 0), meta.slug);
    assert.ok(first.values.at(-1) > first.values[0], `${meta.slug}: 四年净值没有增长`);
    assert.ok(first.title.includes(meta.subLabel), `${meta.slug}: 标题没有子类语境`);
    assert.ok(first.insight.includes(meta.subLabel), `${meta.slug}: 解读没有子类语境`);
  }

  for (const subKey of new Set(ALL.map((meta) => meta.subKey))) {
    const variants = ALL.filter((meta) => meta.subKey === subKey);
    const signatures = variants.map((meta) => JSON.stringify(chartSeriesFor(meta, "zh")));
    assert.equal(new Set(signatures).size, variants.length, `${subKey}: 相邻模板仍共用同一条曲线`);
  }
});

test("物流、沙龙等业务使用各自可信的单位、量级与曲线", () => {
  const freightMeta = ALL.find((meta) => meta.subKey === "freight");
  const salonMeta = ALL.find((meta) => meta.subKey === "hairsalon");
  assert.ok(freightMeta && salonMeta);

  const freight = chartSeriesFor(freightMeta, "zh");
  const salon = chartSeriesFor(salonMeta, "zh");
  assert.equal(freight.unit, "票");
  assert.equal(salon.unit, "人次");
  assert.ok(freight.values[0] >= 2000, `货运起始量不可信：${freight.values[0]}`);
  assert.ok(salon.values[0] >= 400 && salon.values[0] <= 1700, `沙龙起始量不可信：${salon.values[0]}`);
  assert.notDeepEqual(freight.values, salon.values);
  assert.notEqual(freight.insight, salon.insight);

  const yearSpans = new Set(ALL.map((meta) => chartSeriesFor(meta, "zh").labels.join("–")));
  assert.equal(yearSpans.size, 3, "四年窗口没有覆盖三种已批准跨度");

  // 一张停在几年前的增长图，等于告诉访客这家店早就不做了。
  for (const meta of ALL) {
    const last = Number(chartSeriesFor(meta, "zh").labels.at(-1).replace(/\D/g, ""));
    assert.ok(last >= 2024, `${meta.slug} 的图表停在 ${last} 年`);
  }
});

test("环形图年份占比标签留有明显低于 25/500 的重复余量", () => {
  const appearances = new Map();
  let donutSites = 0;

  for (const meta of ALL) {
    if (!chartSections(meta).some((section) => section.variant === 2)) continue;
    donutSites += 1;
    const series = chartSeriesFor(meta, "zh");
    const total = series.values.reduce((sum, value) => sum + value, 0);
    const siteLabels = new Set(series.labels.map(
      (label, index) => `${label} · ${(((series.values[index] / total) * 100).toFixed(1))}%`,
    ));
    for (const label of siteLabels) {
      if (!appearances.has(label)) appearances.set(label, []);
      appearances.get(label).push(meta.slug);
    }
  }

  assert.ok(donutSites >= 40, `环形图样本不足：${donutSites}`);
  const worst = [...appearances]
    .map(([label, slugs]) => ({ label, slugs }))
    .sort((left, right) => right.slugs.length - left.slugs.length || left.label.localeCompare(right.label))[0];
  assert.ok(worst, "没有可检查的环形图标签");
  assert.ok(
    worst.slugs.length <= 15,
    `${worst.slugs.length} 站共用 ${worst.label}：${worst.slugs.join(", ")}`,
  );

  // 每个数据源都必须能回到真实分类，而不是靠与业务无关的独立随机数。
  for (const meta of ALL) assert.ok(subByKey(meta.subKey), meta.slug);
});
