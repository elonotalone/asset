// 十套装渲染判据：不用浏览器，以发出的 HTML / 单站 CSS 为事实源。

import assert from "node:assert/strict";
import test from "node:test";

import { dnaFor } from "../lib/template-dna.ts";
import { missingClasses } from "../lib/template-css.ts";
import { emitStandaloneSite } from "../lib/template-emit-site.ts";
import { skinForDna } from "../lib/template-engine.ts";
import { SKINS } from "../lib/template-skins.ts";
import { allTemplates, subByKey } from "../lib/template-taxonomy.ts";

function samplesBySkin() {
  const samples = new Map();
  for (const meta of allTemplates()) {
    const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
    if (!samples.has(dna.skin.key)) samples.set(dna.skin.key, { meta, dna });
  }
  assert.deepEqual(
    new Set(samples.keys()),
    new Set(SKINS.map((item) => item.key)),
    "500 件货没有覆盖十套装",
  );
  return samples;
}

function emit(sample) {
  const found = subByKey(sample.meta.subKey);
  assert.ok(found, `${sample.meta.slug}: 找不到子类`);
  const site = emitStandaloneSite(sample.meta, found.ind, found.sub);
  const html = site.files.find((file) => file.path === "index.html")?.text ?? "";
  const css = site.files.find((file) => file.path === "assets/site.css")?.text ?? "";
  assert.ok(html && css, `${sample.meta.slug}: 发射产物不完整`);
  return { html, css, site };
}

test("每件站只发自己的一套装与一个特效，不夹带另外九套结构规则", () => {
  for (const [skinKey, sample] of samplesBySkin()) {
    const { html, css, site } = emit(sample);
    assert.match(html, new RegExp(`<html[^>]+data-skin="${skinKey}"`));
    assert.match(html, /data-section-kind="[^"]+" data-skin-block="[^"]+"/);
    assert.deepEqual(missingClasses(html), [], `${sample.meta.slug}: 拆分样式后仍有漏类`);
    assert.deepEqual(
      [...css.matchAll(/\/\* skin:([a-z]+) \*\//g)].map((match) => match[1]),
      [skinKey],
      `${sample.meta.slug}: 样式表混入别的装`,
    );

    const textual = site.files
      .filter((file) => file.text)
      .map((file) => file.text)
      .join("\n")
      .replace(/xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g, "");
    assert.doesNotMatch(textual, /https?:\/\//i, `${sample.meta.slug}: 出现外部请求`);
  }

  const paperCss = emit(samplesBySkin().get("paper")).css;
  for (const unused of ["leo-neon-grid", "leo-aurora", "leo-blob", "leo-stripes"]) {
    assert.ok(!paperCss.includes(`.${unused}{`), `素白站不应携带 ${unused} 的实现`);
  }
});

test("十套装各自带有配色之外的结构证据", () => {
  const evidence = {
    paper: /--skin-content-width:68rem/,
    editorial: /--skin-reading-width:58rem/,
    bento: /--skin-tile-radius:32px/,
    brutalist: /--skin-rule:3px solid/,
    neon: /\.leo-neon-grid\{/,
    fullscreen: /scroll-snap-type:y mandatory/,
    nature: /--skin-organic-radius:clamp\(/,
    sand: /--skin-craft-width:70rem/,
    navy: /border-left:4px solid/,
    glass: /backdrop-filter:blur\(18px\)/,
  };
  const homeBlocks = {
    editorial: "sigEditorialHero",
    bento: "sigBentoHero",
    brutalist: "sigBrutalHero",
    neon: "sigNeonHero",
    fullscreen: "sigFsIntro",
  };

  for (const [skinKey, sample] of samplesBySkin()) {
    const { html, css } = emit(sample);
    assert.match(css, evidence[skinKey], `${skinKey}: 缺少结构级差异`);
    if (homeBlocks[skinKey]) {
      assert.match(
        html,
        new RegExp(`data-skin-block="${homeBlocks[skinKey]}"`),
        `${skinKey}: 首页没有使用自己的招牌结构`,
      );
    }
  }
});

test("霓虹与全屏叙事是整站深底，且正文令牌保持可读", () => {
  const samples = samplesBySkin();
  const neon = emit(samples.get("neon"));
  const fullscreen = emit(samples.get("fullscreen"));

  assert.match(neon.css, /html\[data-skin="neon"\] body\{background:#05070c!important\}/);
  assert.match(fullscreen.css, /html\[data-skin="fullscreen"\] body\{background:#0b111b!important\}/);
  assert.match(fullscreen.css, /body\{font-family:[^}]+color:#f8fafc;background:#0b111b\}/);
  assert.match(fullscreen.html + fullscreen.css, /color:#cbd5e1/);
});

test("渲染器逐维认装，残留一个随机维度也不能冒充合法套装", () => {
  for (const sample of samplesBySkin().values()) {
    assert.equal(skinForDna(sample.dna).key, sample.dna.skin.key);
  }
  const paper = samplesBySkin().get("paper").dna;
  assert.throws(
    () => skinForDna({ ...paper, density: paper.density === "airy" ? "compact" : "airy" }),
    /没有完整落在已批准套装/,
  );
});
