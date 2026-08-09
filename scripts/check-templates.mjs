#!/usr/bin/env node

// Full gate (heavy):
// bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm run check:templates

import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { CSS_ASSET_PATH, missingClasses } from "../lib/template-css.ts";
import { dnaFor } from "../lib/template-dna.ts";
import { emitStandaloneSite } from "../lib/template-emit-site.ts";
import { IMAGE_SLOT_POLICY } from "../lib/template-image-policy.ts";
import { KIND_ONLY_WORDS, KIND_ONLY_WORDS_EN } from "../lib/template-kind-lexicon.ts";
import {
  MIN_SKIN_DIFFERENCES,
  SHAPES,
  SKINS,
  skinDifferences,
  skinsFor,
} from "../lib/template-skins.ts";
import {
  INDUSTRIES,
  TARGET_TOTAL,
  countForSub,
  templatesForSub,
} from "../lib/template-taxonomy.ts";
import { buildWebsiteSourceBundle } from "../lib/template-website-source.ts";
import { SECTION_CONTENT_SCHEMA } from "../lib/template-website-source-map.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(PROJECT_ROOT, "out-sites");
const REPORT_PATH = join(OUTPUT_ROOT, "report.json");

export const SHARED_SENTENCE_MAX_SITES = 25;
export const CHINESE_TEXT_MIN_CHARACTERS = 8;
export const ENGLISH_TEXT_MIN_CHARACTERS = 24;

export const CHECKS = [
  ["externalRequest", "external request"],
  ["emptyPictureSlot", "empty picture slot"],
  ["photoDominance", "one photo doing the whole site"],
  ["sharedSentence", "shared sentence"],
  ["crossKindLeak", "cross-kind wording leak"],
  ["generationFailure", "generation failure"],
  ["shapeConvergence", "shape convergence"],
  ["skinConvergence", "skin convergence"],
  ["skinAdmission", "skin admission"],
  ["skinDistinguishability", "skin distinguishability"],
];

const CHECK_LABEL = Object.fromEntries(CHECKS);
const MAX_SITE_LINES = 120;
const MAX_DETAILS_PER_CHECK = 4;
const MAX_DETAIL_LENGTH = 260;

/**
 * True UI chrome only. Every entry carries its justification next to it so a
 * reviewer can audit the whole allowlist without looking elsewhere.
 */
const UI_CHROME_ALLOWLIST = new Map([
  // 与示例电话号码一样，这是提示站点所有者替换字段的编辑指令，不是展示给顾客的价格文案。
  ["zh:示例 ¥10000", "Editable sample-price chrome instructing the site owner to replace the value."],
]);

export function newSiteResult(slug) {
  return {
    slug,
    failures: Object.fromEntries(CHECKS.map(([key]) => [key, new Set()])),
  };
}

function newGlobalFailures() {
  return Object.fromEntries(CHECKS.map(([key]) => [key, new Set()]));
}

function addGlobalFailure(globalFailures, check, detail) {
  const clean = String(detail).replace(/\s+/g, " ").trim();
  globalFailures[check].add(clean || CHECK_LABEL[check]);
}

function addFailure(site, check, detail) {
  const clean = String(detail).replace(/\s+/g, " ").trim();
  site.failures[check].add(clean || CHECK_LABEL[check]);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function pagesFromDna(dna) {
  const pages = firstDefined(dna?.shape?.pages, dna?.layout?.pages);
  return Array.isArray(pages) ? pages.map((page) => String(page)) : [];
}

export function shapeForPages(pages, shapes = SHAPES) {
  if (!Array.isArray(pages)) return null;
  return shapes.find((candidate) => (
    candidate.pages.length === pages.length
    && candidate.pages.every((page, index) => page === pages[index])
  )) ?? null;
}

function inspectShapePages(site, pages, surface) {
  const matchedShape = shapeForPages(pages);
  if (!matchedShape) {
    addFailure(
      site,
      "shapeConvergence",
      `${surface} pages are outside SHAPES: [${pages.join(", ") || "<missing>"}]`,
    );
  }
  return matchedShape;
}

function inspectRenderedShapePages(site, pages, expectedPages, surface) {
  const matches = pages.length === expectedPages.length
    && expectedPages.every((page, index) => page === pages[index]);
  if (!matches) {
    addFailure(
      site,
      "shapeConvergence",
      `${surface} pages=[${pages.join(", ") || "<missing>"}], expected=[${expectedPages.join(", ") || "<missing>"}]`,
    );
  }
}

function pageKeysInHtml(html) {
  const keys = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/\bdata-page\s*=\s*["']([^"']+)["']/gi)) {
    const key = decodeHtml(match[1]).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function skinDimensionsFromDna(dna) {
  const nested = dna?.skin && typeof dna.skin === "object" ? dna.skin : {};
  return {
    palette: firstDefined(dna?.palette?.key, dna?.paletteKey, nested?.palette?.key, nested?.paletteKey),
    radius: firstDefined(dna?.radius, nested?.radius),
    density: firstDefined(dna?.density, nested?.density),
    font: firstDefined(dna?.font, nested?.font),
    fx: firstDefined(dna?.accentFx, dna?.fx, nested?.accentFx, nested?.fx),
    dark: firstDefined(dna?.forceDark, dna?.dark, nested?.forceDark, nested?.dark),
  };
}

export function skinDimensionMismatches(dna, candidate) {
  const actual = skinDimensionsFromDna(dna);
  const mismatches = [];
  if (!candidate.palettes.includes(actual.palette)) mismatches.push("配色");
  if (actual.radius !== candidate.radius) mismatches.push("圆角");
  if (actual.font !== candidate.font) mismatches.push("字体");
  if (actual.density !== candidate.density) mismatches.push("疏密");
  if (actual.fx !== candidate.fx) mismatches.push("装饰");
  if (actual.dark !== candidate.dark) mismatches.push("明暗");
  return mismatches;
}

export function matchingSkinsForDna(dna, skins = SKINS) {
  return skins.filter((candidate) => skinDimensionMismatches(dna, candidate).length === 0);
}

function declaredSkinKey(dna, meta) {
  return firstDefined(
    typeof dna?.skin === "string" ? dna.skin : dna?.skin?.key,
    dna?.skinKey,
    meta?.skinKey,
  );
}

function formatSkinDimensions(dna) {
  const actual = skinDimensionsFromDna(dna);
  return [
    `配色=${actual.palette ?? "<missing>"}`,
    `圆角=${actual.radius ?? "<missing>"}`,
    `字体=${actual.font ?? "<missing>"}`,
    `疏密=${actual.density ?? "<missing>"}`,
    `装饰=${actual.fx ?? "<missing>"}`,
    `明暗=${actual.dark ?? "<missing>"}`,
  ].join(", ");
}

export function inspectGate2Site(site, meta, dna, surface = "DNA") {
  const pages = pagesFromDna(dna);
  const matchedShape = inspectShapePages(site, pages, surface);

  const declaredKey = declaredSkinKey(dna, meta);
  const declaredSkin = declaredKey === undefined
    ? null
    : SKINS.find((candidate) => candidate.key === declaredKey) ?? null;
  const exactMatches = matchingSkinsForDna(dna);
  let selectedSkin = declaredSkin;

  if (declaredKey !== undefined && !declaredSkin) {
    addFailure(site, "skinConvergence", `${surface} declares unknown skin ${declaredKey}; ${formatSkinDimensions(dna)}`);
  } else if (declaredSkin) {
    const mismatches = skinDimensionMismatches(dna, declaredSkin);
    if (mismatches.length) {
      addFailure(
        site,
        "skinConvergence",
        `${surface} skin ${declaredSkin.key} drifts in ${mismatches.join("/")}; ${formatSkinDimensions(dna)}`,
      );
    }
  } else if (exactMatches.length === 0) {
    addFailure(site, "skinConvergence", `${surface} look matches no SKINS entry; ${formatSkinDimensions(dna)}`);
  } else {
    [selectedSkin] = exactMatches;
  }

  const allowed = skinsFor(meta.industryKey);
  if (!selectedSkin) {
    addFailure(
      site,
      "skinAdmission",
      `${surface} cannot resolve an admitted skin for industry ${meta.industryKey}; allowed=[${allowed.join(", ")}]`,
    );
  } else if (!allowed.includes(selectedSkin.key)) {
    addFailure(
      site,
      "skinAdmission",
      `${surface} skin ${selectedSkin.key} is not admitted for ${meta.industryKey}; allowed=[${allowed.join(", ")}]`,
    );
  }

  return {
    shapeKey: matchedShape?.key ?? null,
    skinKey: selectedSkin?.key ?? null,
  };
}

export function indistinguishableSkinPairs(
  skins = SKINS,
  minimumDifferences = MIN_SKIN_DIFFERENCES,
) {
  const failures = [];
  for (let left = 0; left < skins.length; left += 1) {
    for (let right = left + 1; right < skins.length; right += 1) {
      const differences = skinDifferences(skins[left], skins[right]);
      if (differences.length >= minimumDifferences) continue;
      failures.push({
        left: skins[left].key,
        right: skins[right].key,
        differences,
        detail: `${skins[left].key}/${skins[right].key} differ in ${differences.length}/${minimumDifferences} required dimensions (${differences.join(", ") || "none"})`,
      });
    }
  }
  return failures;
}

function inside(base, candidate) {
  const rel = relative(base, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function safeOutputPath(siteDir, emittedPath) {
  if (typeof emittedPath !== "string" || !emittedPath.trim()) {
    throw new Error("emitted file has an empty path");
  }
  const normalized = emittedPath.replaceAll("\\", "/");
  const target = resolve(siteDir, normalized);
  if (normalized.startsWith("/") || !inside(siteDir, target)) {
    throw new Error(`unsafe emitted path: ${emittedPath}`);
  }
  return target;
}

function safeSourcePath(sourcePath) {
  if (typeof sourcePath !== "string" || !sourcePath.trim()) {
    throw new Error("binary emitted file has no sourcePath");
  }
  const target = isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(PROJECT_ROOT, sourcePath);
  if (!inside(PROJECT_ROOT, target)) throw new Error(`sourcePath leaves repository: ${sourcePath}`);
  if (!existsSync(target)) throw new Error(`sourcePath is missing: ${sourcePath}`);
  return target;
}

function materializeSite(emitted, siteDir) {
  const paths = new Set();
  mkdirSync(siteDir, { recursive: true });
  for (const file of emitted.files) {
    const normalized = file.path.replaceAll("\\", "/");
    if (paths.has(normalized)) throw new Error(`duplicate emitted path: ${normalized}`);
    paths.add(normalized);
    const target = safeOutputPath(siteDir, normalized);
    mkdirSync(dirname(target), { recursive: true });
    if (typeof file.text === "string") {
      writeFileSync(target, file.text, "utf8");
    } else {
      copyFileSync(safeSourcePath(file.sourcePath), target);
    }
  }
  return paths;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function isInertSvgNamespace(text, index, url) {
  if (url !== "http://www.w3.org/2000/svg") return false;
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd0 = text.indexOf("\n", index);
  const lineEnd = lineEnd0 === -1 ? text.length : lineEnd0;
  const line = text.slice(lineStart, lineEnd);
  // Both forms are namespace identifiers, not fetch targets. The first is the
  // contract's literal exception; the second is createElementNS's equivalent.
  return /xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(line)
    || /\bSVG_NS\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(line);
}

function externalRequestsIn(text) {
  const found = [];
  const pattern = /https?:\/\/[^\s"'<>`\\)]+/gi;
  for (const match of text.matchAll(pattern)) {
    const url = match[0].replace(/[.,;:!?\]}]+$/g, "");
    if (isInertSvgNamespace(text, match.index, url)) continue;
    found.push({ url, line: lineNumberAt(text, match.index) });
  }
  return found;
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    middot: "·",
    nbsp: " ",
    quot: '"',
  };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole);
}

function visibleTextRuns(html) {
  const withoutCode = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  return withoutCode
    .split(/<[^>]*>/g)
    .map((part) => decodeHtml(part).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function sentenceRunsIn(html) {
  const out = new Map();
  for (const textRun of visibleTextRuns(html)) {
    const sentences = textRun.split(/(?:[。！？!?；;]+|[.!?]+\s+)/g);
    for (const raw of sentences) {
      const display = raw.replace(/^[\s·•|/—–,:，：、-]+|[\s·•|/—–,:，：、-]+$/g, "").trim();
      if (!display) continue;
      const compact = display.replace(/\s+/g, "");
      const hasHan = /\p{Script=Han}/u.test(display);
      const hasLatin = /[A-Za-z]/.test(display);
      if (hasHan && Array.from(compact).length >= CHINESE_TEXT_MIN_CHARACTERS) {
        out.set(`zh:${display}`, { lang: "zh", canonical: display, display });
      } else if (!hasHan && hasLatin && Array.from(display).length >= ENGLISH_TEXT_MIN_CHARACTERS) {
        const canonical = display.toLocaleLowerCase("en-US");
        out.set(`en:${canonical}`, { lang: "en", canonical, display });
      }
    }
  }
  return out;
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return { present: false, value: "" };
  return { present: true, value: decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim() };
}

function splitSrcset(srcset) {
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function localReference(ref, ownerPath) {
  let clean = decodeHtml(ref).trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  clean = clean.split("#", 1)[0].split("?", 1)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return { invalid: true, path: clean };
  }
  const fromRoot = clean.startsWith("/");
  const joined = fromRoot
    ? posix.normalize(clean.slice(1))
    : posix.normalize(posix.join(posix.dirname(ownerPath), clean));
  if (!joined || joined === "." || joined === ".." || joined.startsWith("../")) {
    return { invalid: true, path: joined || clean };
  }
  return { invalid: false, path: joined };
}

function looksLikeImagePath(ref) {
  const clean = ref.split(/[?#]/, 1)[0];
  return [".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extname(clean).toLowerCase());
}

function checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, ref, label) {
  const local = localReference(ref, ownerPath);
  if (!local) return;
  if (local.invalid || !declaredPaths.has(local.path) || !existsSync(join(siteDir, local.path))) {
    addFailure(site, "emptyPictureSlot", `${ownerPath}: ${label} references missing ${local.path}`);
  }
}

function inspectHtmlImages(site, siteDir, declaredPaths, ownerPath, html) {
  for (const tagMatch of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const src = attribute(tag, "src");
    const srcset = attribute(tag, "srcset");
    if ((src.present && !src.value) || (!src.present && !srcset.value)) {
      addFailure(site, "emptyPictureSlot", `${ownerPath}:${lineNumberAt(html, tagMatch.index)} <img> has an empty src`);
    }
    if (src.value) checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, src.value, "img src");
    for (const ref of splitSrcset(srcset.value)) {
      checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, ref, "img srcset");
    }
  }

  for (const tagMatch of html.matchAll(/<source\b[^>]*>/gi)) {
    const srcset = attribute(tagMatch[0], "srcset");
    for (const ref of splitSrcset(srcset.value)) {
      checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, ref, "source srcset");
    }
  }

  for (const urlMatch of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const ref = decodeHtml(urlMatch[1]).trim();
    if (looksLikeImagePath(ref)) {
      checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, ref, "CSS url()");
    }
  }
}

function inspectCssImages(site, siteDir, declaredPaths, ownerPath, css) {
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const ref = decodeHtml(match[1]).trim();
    if (looksLikeImagePath(ref)) {
      checkLocalImageReference(site, siteDir, declaredPaths, ownerPath, ref, "CSS url()");
    }
  }
}

function slotsAtPath(content, slotPath) {
  const [container, field] = slotPath.split(".");
  if (!field) return [{ label: slotPath, value: content?.[container] }];
  const items = content?.[container];
  if (!Array.isArray(items) || items.length === 0) {
    return [{ label: `${container}[]`, value: undefined }];
  }
  return items.map((item, index) => ({
    label: `${container}[${index}].${field}`,
    value: item?.[field],
  }));
}

function imageUrl(value) {
  return value && typeof value === "object" && typeof value.url === "string"
    ? value.url.trim()
    : "";
}

function canonicalPhoto(url) {
  return url.trim().replace(/[?#].*$/, "");
}

function inspectWebsiteImages(site, config) {
  const photos = [];
  for (const page of config.pages ?? []) {
    for (const section of page.sections ?? []) {
      const policy = IMAGE_SLOT_POLICY[section.type];
      const schema = SECTION_CONTENT_SCHEMA[section.type];
      if (!policy) {
        addFailure(site, "generationFailure", `${page.path}/${section.id}: no IMAGE_SLOT_POLICY for ${section.type}`);
        continue;
      }
      if (!schema) {
        addFailure(site, "generationFailure", `${page.path}/${section.id}: no image schema for ${section.type}`);
        continue;
      }
      for (const slotPath of schema.imageSlots) {
        for (const slot of slotsAtPath(section.content, slotPath)) {
          const url = imageUrl(slot.value);
          if (url) photos.push(canonicalPhoto(url));
          if (policy.rule === "required" && !url) {
            addFailure(site, "emptyPictureSlot", `${page.path}/${section.id}.${slot.label} is required but has no image URL`);
          }
        }
      }
    }
  }

  if (photos.length < 3) return null;
  const uses = new Map();
  for (const photo of photos) uses.set(photo, (uses.get(photo) ?? 0) + 1);
  const [url, count] = [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const ratio = count / photos.length;
  if (ratio > 0.5) {
    addFailure(site, "photoDominance", `${count}/${photos.length} images (${(ratio * 100).toFixed(1)}%) use ${url}`);
    return { url, count, total: photos.length, ratio };
  }
  return null;
}

function kindsFor(meta, industry) {
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant, industry.color);
  return new Set(Object.values(dna.layout.sections).flat());
}

function escapedRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function englishWordAppears(text, word) {
  return new RegExp(`(^|[^A-Za-z])${escapedRegExp(word)}(?=$|[^A-Za-z])`, "i").test(text);
}

function inspectCrossKind(site, html, presentKinds) {
  const visible = visibleTextRuns(html).join("\n");
  const lower = visible.toLocaleLowerCase("en-US");
  for (const [kind, words] of Object.entries(KIND_ONLY_WORDS)) {
    if (presentKinds.has(kind)) continue;
    for (const word of words) {
      if (visible.includes(word)) addFailure(site, "crossKindLeak", `${word} belongs to absent kind ${kind}`);
    }
  }
  for (const [kind, words] of Object.entries(KIND_ONLY_WORDS_EN)) {
    if (presentKinds.has(kind)) continue;
    for (const word of words) {
      if (englishWordAppears(lower, word.toLocaleLowerCase("en-US"))) {
        addFailure(site, "crossKindLeak", `${word} belongs to absent kind ${kind}`);
      }
    }
  }
}

function scanExternalFile(site, surface, file) {
  if (typeof file.text !== "string") return;
  for (const hit of externalRequestsIn(file.text)) {
    addFailure(site, "externalRequest", `${surface}/${file.path}:${hit.line} ${hit.url}`);
  }
}

function inspectStandalone(site, emitted, siteDir) {
  let declaredPaths;
  try {
    declaredPaths = materializeSite(emitted, siteDir);
  } catch (error) {
    addFailure(site, "generationFailure", `materialize: ${error instanceof Error ? error.message : String(error)}`);
    declaredPaths = new Set(emitted.files.map((file) => file.path.replaceAll("\\", "/")));
  }

  if (!declaredPaths.has(CSS_ASSET_PATH) || !existsSync(join(siteDir, CSS_ASSET_PATH))) {
    addFailure(site, "generationFailure", `standalone site is missing shipped stylesheet ${CSS_ASSET_PATH}`);
  }

  const htmlParts = [];
  for (const file of emitted.files) {
    scanExternalFile(site, "standalone", file);
    if (typeof file.text !== "string") continue;
    const suffix = extname(file.path).toLowerCase();
    if (suffix === ".html" || file.mediaType === "text/html") {
      htmlParts.push(file.text);
      try {
        const missing = missingClasses(file.text);
        if (missing.length) {
          addFailure(
            site,
            "generationFailure",
            `${file.path}: ${missing.length} CSS classes have no shipped rule (${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", …" : ""})`,
          );
        }
      } catch (error) {
        addFailure(site, "generationFailure", `${file.path}: missingClasses threw: ${error instanceof Error ? error.message : String(error)}`);
      }
      inspectHtmlImages(site, siteDir, declaredPaths, file.path, file.text);
    } else if (suffix === ".css" || file.mediaType === "text/css") {
      inspectCssImages(site, siteDir, declaredPaths, file.path, file.text);
    }
  }
  if (!htmlParts.length) addFailure(site, "generationFailure", "standalone emitter produced no HTML file");
  return htmlParts.join("\n");
}

function catalogEntries() {
  const entries = [];
  for (const industry of INDUSTRIES) {
    for (const sub of industry.subs) {
      const expected = countForSub(sub.key);
      for (const meta of templatesForSub(industry, sub, expected)) {
        entries.push({ meta, industry, sub });
      }
    }
  }
  return entries;
}

function finalizeSharedSentences(sites, runsBySite) {
  const appearances = new Map();
  for (const [slug, runs] of runsBySite) {
    for (const [key, run] of runs) {
      if (!appearances.has(key)) appearances.set(key, { ...run, slugs: new Set() });
      appearances.get(key).slugs.add(slug);
    }
  }

  const offenders = [...appearances.values()]
    .filter((entry) => entry.slugs.size > SHARED_SENTENCE_MAX_SITES && !UI_CHROME_ALLOWLIST.has(`${entry.lang}:${entry.canonical}`))
    .sort((a, b) => b.slugs.size - a.slugs.size || a.canonical.localeCompare(b.canonical));

  for (const entry of offenders) {
    const detail = `${entry.lang} text appears in ${entry.slugs.size}/500 sites: ${entry.display}`;
    for (const slug of entry.slugs) addFailure(sites.get(slug), "sharedSentence", detail);
  }
  return offenders.map((entry) => ({
    lang: entry.lang,
    text: entry.display,
    siteCount: entry.slugs.size,
    slugs: [...entry.slugs].sort(),
  }));
}

function summarize(sites, globalFailures) {
  return Object.fromEntries(CHECKS.map(([key, label]) => {
    const failed = [...sites.values()].filter((site) => site.failures[key].size > 0);
    const globalIssueCount = globalFailures[key].size;
    return [key, {
      label,
      siteCount: failed.length,
      issueCount: failed.reduce((total, site) => total + site.failures[key].size, 0) + globalIssueCount,
      globalIssueCount,
      slugs: failed.map((site) => site.slug),
    }];
  }));
}

function serializableSite(site) {
  return {
    slug: site.slug,
    clean: CHECKS.every(([key]) => site.failures[key].size === 0),
    failures: Object.fromEntries(CHECKS.map(([key]) => [key, [...site.failures[key]]])),
  };
}

function aggregateWorst(sites, photoOffenders, sharedOffenders, globalFailures) {
  const externalUrls = new Map();
  const emptyKinds = new Map();
  const leakedWords = new Map();
  const shapeFailures = new Map();
  const skinFailures = new Map();
  const admissionFailures = new Map();
  for (const site of sites.values()) {
    for (const detail of site.failures.externalRequest) {
      const url = detail.match(/https?:\/\/\S+/)?.[0] ?? detail;
      if (!externalUrls.has(url)) externalUrls.set(url, new Set());
      externalUrls.get(url).add(site.slug);
    }
    for (const detail of site.failures.emptyPictureSlot) {
      const sectionIds = [...detail.matchAll(/\/([a-z-]+)-\d+\./g)];
      const kind = sectionIds.at(-1)?.[1] ?? "emitted-file reference";
      if (!emptyKinds.has(kind)) emptyKinds.set(kind, new Set());
      emptyKinds.get(kind).add(site.slug);
    }
    for (const detail of site.failures.crossKindLeak) {
      const word = detail.split(" belongs to ", 1)[0];
      if (!leakedWords.has(word)) leakedWords.set(word, new Set());
      leakedWords.get(word).add(site.slug);
    }
    for (const [check, target] of [
      ["shapeConvergence", shapeFailures],
      ["skinConvergence", skinFailures],
      ["skinAdmission", admissionFailures],
    ]) {
      for (const detail of site.failures[check]) {
        if (!target.has(detail)) target.set(detail, new Set());
        target.get(detail).add(site.slug);
      }
    }
  }
  const top = (map, limit = 10) => [...map.entries()]
    .map(([value, slugs]) => ({ value, siteCount: slugs.size }))
    .sort((a, b) => b.siteCount - a.siteCount || a.value.localeCompare(b.value))
    .slice(0, limit);
  return {
    externalRequests: top(externalUrls),
    emptyPictureSlots: top(emptyKinds),
    photoDominance: photoOffenders.sort((a, b) => b.ratio - a.ratio || a.slug.localeCompare(b.slug)).slice(0, 10),
    sharedSentences: sharedOffenders.slice(0, 15).map(({ slugs: _slugs, ...entry }) => entry),
    crossKindLeaks: top(leakedWords),
    shapeConvergence: top(shapeFailures),
    skinConvergence: top(skinFailures),
    skinAdmission: top(admissionFailures),
    skinDistinguishability: [...globalFailures.skinDistinguishability].map((value) => ({ value, siteCount: 0 })),
  };
}

function slugSummary(count, full) {
  if (!count.slugs.length) return count.globalIssueCount ? " — global failure only" : "";
  const shown = full ? count.slugs : count.slugs.slice(0, 12);
  const remaining = count.slugs.length - shown.length;
  return ` — sites: ${shown.join(", ")}${remaining ? `, … (+${remaining})` : ""}`;
}

function printHumanReport(report, full) {
  console.log("\nTemplate gate summary");
  for (const [key, label] of CHECKS) {
    const count = report.summary[key];
    console.log(`- ${label}: ${count.siteCount} sites, ${count.issueCount} issues`);
  }

  console.log("\nWorst offenders");
  const groups = [
    ["external request", report.worst.externalRequests],
    ["empty picture slot", report.worst.emptyPictureSlots],
    ["one photo doing the whole site", report.worst.photoDominance.map((x) => ({ value: `${x.slug}: ${x.count}/${x.total} ${x.url}`, siteCount: 1 }))],
    ["shared sentence", report.worst.sharedSentences.map((x) => ({ value: `${x.lang}: ${x.text}`, siteCount: x.siteCount }))],
    ["cross-kind wording leak", report.worst.crossKindLeaks],
    ["shape convergence", report.worst.shapeConvergence],
    ["skin convergence", report.worst.skinConvergence],
    ["skin admission", report.worst.skinAdmission],
    ["skin distinguishability", report.worst.skinDistinguishability],
  ];
  for (const [label, entries] of groups) {
    console.log(`${label}:`);
    if (!entries.length) console.log("  (none)");
    for (const entry of entries) console.log(`  ${entry.siteCount} sites — ${String(entry.value).slice(0, MAX_DETAIL_LENGTH)}`);
  }

  const failingSites = report.sites.filter((site) => !site.clean);
  const shown = full ? failingSites : failingSites.slice(0, MAX_SITE_LINES);
  console.log(`\nPer-site failures (${shown.length}/${failingSites.length} shown; full details: out-sites/report.json)`);
  for (const site of shown) {
    const parts = [];
    for (const [key, label] of CHECKS) {
      const details = site.failures[key];
      if (!details.length) continue;
      const sample = details.slice(0, MAX_DETAILS_PER_CHECK).map((detail) => detail.slice(0, MAX_DETAIL_LENGTH)).join(" | ");
      parts.push(`${label} (${details.length}): ${sample}${details.length > MAX_DETAILS_PER_CHECK ? " | …" : ""}`);
    }
    console.log(`- ${site.slug}: ${parts.join(" || ")}`);
  }
  if (!full && failingSites.length > shown.length) {
    console.log(`... ${failingSites.length - shown.length} more failing sites are in out-sites/report.json (use --full to print all)`);
  }

  console.log("\nFinal gate counts");
  for (const [key, label] of CHECKS) {
    const count = report.summary[key];
    console.log(`- ${label}: ${count.siteCount} failing sites (${count.issueCount} issues)${slugSummary(count, full)}`);
  }
  console.log(`Report: out-sites/report.json`);
  console.log(`${report.cleanSites}/${report.totalSites} sites clean; exit code ${report.exitCode}; ${report.shippable ? "SHIPPABLE" : "NOT SHIPPABLE"}`);
}

function selfTest() {
  assert.deepEqual(externalRequestsIn('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), []);
  assert.deepEqual(externalRequestsIn('var SVG_NS = "http://www.w3.org/2000/svg";'), []);
  assert.equal(externalRequestsIn('<img src="https://cdn.example/x.webp">').length, 1);
  const runs = sentenceRunsIn("<p>这是一段足够长的中文句子。</p><p>A sufficiently long English sentence.</p><script>https://ignored.test</script>");
  assert.ok([...runs.values()].some((run) => run.lang === "zh"));
  assert.ok([...runs.values()].some((run) => run.lang === "en"));
  assert.deepEqual(localReference("../images/a.webp", "pages/index.html"), { invalid: false, path: "images/a.webp" });
  assert.equal(englishWordAppears("read our case study today", "case study"), true);
  assert.equal(englishWordAppears("menubar", "menu"), false);
  const fake = newSiteResult("self-test");
  const dominance = inspectWebsiteImages(fake, {
    pages: [{ path: "/", sections: [{
      id: "hero-1",
      type: "hero",
      content: { image: { url: "images/a.webp" } },
    }, {
      id: "about-1",
      type: "about",
      content: { image: { url: "images/a.webp" } },
    }, {
      id: "page-header-1",
      type: "page-header",
      content: { image: { url: "images/b.webp" } },
    }] }],
  });
  assert.equal(dominance?.count, 2);
  assert.equal(fake.failures.photoDominance.size, 1);
  console.log("check-templates self-test: core assertions passed");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const known = new Set(["--full", "--json", "--self-test"]);
  const unknown = [...args].filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`unknown arguments: ${unknown.join(", ")}`);
  if (args.has("--self-test")) {
    selfTest();
    return;
  }

  const entries = catalogEntries();
  if (entries.length !== TARGET_TOTAL || TARGET_TOTAL !== 500) {
    throw new Error(`catalog must contain exactly 500 sites; got ${entries.length}, TARGET_TOTAL=${TARGET_TOTAL}`);
  }

  rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const sites = new Map(entries.map(({ meta }) => [meta.slug, newSiteResult(meta.slug)]));
  const globalFailures = newGlobalFailures();
  const runsBySite = new Map();
  const photoOffenders = [];

  for (const pair of indistinguishableSkinPairs()) {
    addGlobalFailure(globalFailures, "skinDistinguishability", pair.detail);
  }

  for (const { meta, industry, sub } of entries) {
    const site = sites.get(meta.slug);
    const siteDir = join(OUTPUT_ROOT, meta.slug);
    let html = "";
    let templateDna = null;

    try {
      templateDna = dnaFor(meta.slug, meta.industryKey, meta.variant, industry.color);
      inspectGate2Site(site, meta, templateDna);
    } catch (error) {
      addFailure(site, "generationFailure", `shape/skin inspection: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const emitted = emitStandaloneSite(meta, industry, sub);
      if (!emitted || emitted.slug !== meta.slug || !Array.isArray(emitted.files)) {
        throw new Error("emitStandaloneSite returned an invalid EmittedSite");
      }
      html = inspectStandalone(site, emitted, siteDir);
      inspectRenderedShapePages(site, pageKeysInHtml(html), templateDna?.layout?.pages ?? [], "standalone");
    } catch (error) {
      addFailure(site, "generationFailure", `standalone generation: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }

    try {
      const bundle = buildWebsiteSourceBundle(meta, industry, sub);
      if (!bundle?.structure || !bundle?.config || !bundle?.configEn || !Array.isArray(bundle?.tree?.files)) {
        throw new Error("buildWebsiteSourceBundle returned an invalid bundle");
      }
      const sourceTheme = bundle.structure.theme ?? {};
      inspectGate2Site(site, meta, {
        shape: templateDna?.shape,
        layout: { pages: (bundle.structure.pages ?? []).map((page) => page.key) },
        skin: sourceTheme.skin,
        skinKey: sourceTheme.skinKey,
        palette: { key: sourceTheme.paletteKey },
        radius: sourceTheme.radius,
        density: sourceTheme.density,
        font: sourceTheme.font,
        accentFx: sourceTheme.accentFx,
        forceDark: sourceTheme.forceDark,
      }, "website-source");
      inspectRenderedShapePages(
        site,
        (bundle.structure.pages ?? []).map((page) => String(page.key)),
        templateDna?.layout?.pages ?? [],
        "website-source",
      );
      for (const file of bundle.tree.files) scanExternalFile(site, "website-source", file);
      const dominance = inspectWebsiteImages(site, bundle.config);
      if (dominance) photoOffenders.push({ slug: meta.slug, ...dominance });
    } catch (error) {
      addFailure(site, "generationFailure", `website-source generation: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }

    if (html) {
      runsBySite.set(meta.slug, sentenceRunsIn(html));
      try {
        inspectCrossKind(site, html, kindsFor(meta, industry));
      } catch (error) {
        addFailure(site, "generationFailure", `cross-kind inspection: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      runsBySite.set(meta.slug, new Map());
    }
  }

  const sharedOffenders = finalizeSharedSentences(sites, runsBySite);
  const summary = summarize(sites, globalFailures);
  const cleanSites = [...sites.values()].filter((site) => CHECKS.every(([key]) => site.failures[key].size === 0)).length;
  const globalIssueCount = Object.values(globalFailures).reduce((total, failures) => total + failures.size, 0);
  const shippable = cleanSites === TARGET_TOTAL && globalIssueCount === 0;
  const report = {
    schema: "template-static-gate@1",
    generatedAt: new Date().toISOString(),
    thresholds: {
      totalSites: 500,
      sharedSentenceMaxSites: SHARED_SENTENCE_MAX_SITES,
      chineseTextMinCharacters: CHINESE_TEXT_MIN_CHARACTERS,
      englishTextMinCharacters: ENGLISH_TEXT_MIN_CHARACTERS,
      photoDominanceMaxRatio: 0.5,
      photoDominanceMinImages: 3,
      minimumSkinDifferences: MIN_SKIN_DIFFERENCES,
    },
    approvedShapeKeys: SHAPES.map((entry) => entry.key),
    approvedSkinKeys: SKINS.map((entry) => entry.key),
    allowlist: [...UI_CHROME_ALLOWLIST].map(([text, justification]) => ({ text, justification })),
    totalSites: TARGET_TOTAL,
    cleanSites,
    shippable,
    exitCode: shippable ? 0 : 1,
    summary,
    globalFailures: Object.fromEntries(CHECKS.map(([key]) => [key, [...globalFailures[key]]])),
    worst: aggregateWorst(sites, photoOffenders, sharedOffenders, globalFailures),
    sharedSentenceOffenders: sharedOffenders,
    sites: [...sites.values()].map(serializableSite),
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (args.has("--json")) console.log(JSON.stringify(report));
  else printHumanReport(report, args.has("--full"));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
