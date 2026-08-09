// W3b site-copy gate: the 500 templates must not share long filler or carry
// vocabulary for a section their selected layout does not contain.

import assert from "node:assert/strict";
import test from "node:test";

import { buildBiContent } from "../lib/template-content-bi.ts";
import { dnaFor } from "../lib/template-dna.ts";
import {
  UI,
  copyForSectionKinds,
  secTitle,
} from "../lib/template-i18n.ts";
import {
  KIND_ONLY_WORDS,
  KIND_ONLY_WORDS_EN,
} from "../lib/template-kind-lexicon.ts";
import {
  TARGET_TOTAL,
  allTemplates,
  subByKey,
} from "../lib/template-taxonomy.ts";

const ALL = allTemplates();
const SECTION_TITLE_KINDS = ["cases", "team", "process", "products", "gallery", "news"];

function taxonomyFor(meta) {
  const hit = subByKey(meta.subKey);
  assert.ok(hit, `${meta.slug}: missing taxonomy entry for ${meta.subKey}`);
  return hit;
}

function sectionKindsFor(meta) {
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
  return new Set(Object.values(dna.layout.sections).flat());
}

// BiContent keeps visible prose in { zh, en } pairs. Standalone strings are
// phone/email values, stat numbers or SVG paths, none of which are sentences.
function visibleStrings(value, lang, out = [], field = "") {
  if (typeof value === "string") {
    if (field !== "icon") out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) visibleStrings(item, lang, out, field);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (typeof value.zh === "string" && typeof value.en === "string") {
    out.push(value[lang].trim());
    return out;
  }
  for (const [key, item] of Object.entries(value)) visibleStrings(item, lang, out, key);
  return out;
}

function isCountedSentence(text) {
  const compact = text.replace(/\s+/g, "");
  const hasHan = /\p{Script=Han}/u.test(text);
  if (hasHan && [...compact].length >= 8) return true;
  return !hasHan && /[A-Za-z]/.test(text) && [...text].length >= 24;
}

function ownSiteStrings(meta, content, kinds) {
  const strings = [
    ...visibleStrings(content, "zh"),
    ...visibleStrings(content, "en"),
  ];
  for (const kind of SECTION_TITLE_KINDS) {
    if (!kinds.has(kind)) continue;
    for (const lang of ["zh", "en"]) {
      const heading = secTitle(kind, meta.industryKey, lang);
      strings.push(heading.title);
      if (heading.sub) strings.push(heading.sub);
    }
  }
  // These are global UI phrases, so count each conservatively as though every
  // site used it. Any long phrase here would immediately break the 25-site cap.
  for (const pair of Object.values(UI)) strings.push(pair.zh, pair.en);
  return strings;
}

test("all 500 site-copy bundles are deterministic and use fictional contacts", () => {
  assert.equal(ALL.length, TARGET_TOTAL);
  for (const meta of ALL) {
    const { ind, sub } = taxonomyFor(meta);
    const first = buildBiContent(meta, ind, sub);
    const second = buildBiContent(meta, ind, sub);
    assert.deepEqual(second, first, `${meta.slug}: same slug changed its copy`);
    assert.equal(first.contactPhone, `示例号码 · ${meta.slug}`, `${meta.slug}: phone is not an obvious sample`);
    assert.match(first.contactEmail, /^[a-z0-9-]+@[a-z0-9-]+\.example\.com$/i, `${meta.slug}: email is not on example.com`);
    assert.match(first.contactAddress.zh, /^示例地址 · /, `${meta.slug}: zh address looks real`);
    assert.match(first.contactAddress.en, /^Sample address · /, `${meta.slug}: en address looks real`);
  }
});

test("no long sentence from W3b appears in more than 25 sites", (t) => {
  const sitesBySentence = new Map();
  for (const meta of ALL) {
    const { ind, sub } = taxonomyFor(meta);
    const content = buildBiContent(meta, ind, sub);
    const kinds = sectionKindsFor(meta);
    const sentences = new Set(ownSiteStrings(meta, content, kinds).filter(isCountedSentence));
    for (const sentence of sentences) {
      const slugs = sitesBySentence.get(sentence) ?? [];
      slugs.push(meta.slug);
      sitesBySentence.set(sentence, slugs);
    }
  }

  const failures = [...sitesBySentence]
    .filter(([, slugs]) => slugs.length > 25)
    .sort((a, b) => b[1].length - a[1].length);
  const worst = [...sitesBySentence.values()].reduce((max, slugs) => Math.max(max, slugs.length), 0);
  t.diagnostic(`sites=${ALL.length} repeated_over_25=${failures.length} worst=${worst}`);
  assert.deepEqual(
    failures.map(([sentence, slugs]) => ({ sentence, count: slugs.length, sample: slugs.slice(0, 3) })),
    [],
  );
  assert.equal(
    isCountedSentence(`${UI.chartUnit.zh}：万元 · ${UI.chartNote.zh}`),
    false,
    "chart unit + note recombine into a counted zh sentence",
  );
  assert.equal(
    isCountedSentence(`${UI.chartUnit.en}: revenue · ${UI.chartNote.en}`),
    false,
    "chart unit + note recombine into a counted en sentence",
  );
});

test("every kind-only word has a neutral deterministic replacement", () => {
  const noSections = new Set();
  assert.equal(
    copyForSectionKinds("绿植订阅与订阅制", noSections, "zh"),
    "绿植定期配送与长期服务",
  );
  for (const [lang, lexicon] of [["zh", KIND_ONLY_WORDS], ["en", KIND_ONLY_WORDS_EN]]) {
    const input = Object.values(lexicon).flat().join(" / ");
    const output = copyForSectionKinds(input, noSections, lang);
    const haystack = lang === "en" ? output.toLowerCase() : output;
    for (const word of Object.values(lexicon).flat()) {
      assert.ok(
        !haystack.includes(lang === "en" ? word.toLowerCase() : word),
        `${lang}: missing neutral replacement for ${word}: ${output}`,
      );
    }
    assert.equal(copyForSectionKinds(input, noSections, lang), output, `${lang}: replacement is not deterministic`);
  }
});

test("site copy has zero words for sections absent from its selected layout", (t) => {
  const leaks = [];
  for (const meta of ALL) {
    const { ind, sub } = taxonomyFor(meta);
    const content = buildBiContent(meta, ind, sub);
    const kinds = sectionKindsFor(meta);
    for (const [lang, lexicon] of [["zh", KIND_ONLY_WORDS], ["en", KIND_ONLY_WORDS_EN]]) {
      const strings = visibleStrings(content, lang);
      for (const kind of SECTION_TITLE_KINDS) {
        if (!kinds.has(kind)) continue;
        const heading = secTitle(kind, meta.industryKey, lang);
        strings.push(heading.title);
        if (heading.sub) strings.push(heading.sub);
      }
      const text = strings.join("\n");
      const haystack = lang === "en" ? text.toLowerCase() : text;
      for (const [kind, words] of Object.entries(lexicon)) {
        if (kinds.has(kind)) continue;
        for (const word of words) {
          if (haystack.includes(lang === "en" ? word.toLowerCase() : word)) {
            leaks.push({ slug: meta.slug, lang, kind, word });
          }
        }
      }
    }
  }
  t.diagnostic(`sites=${ALL.length} cross_kind_leaks=${leaks.length}`);
  assert.deepEqual(leaks, []);
});
