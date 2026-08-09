#!/usr/bin/env node
// 重建命令（必须走重任务守门）：
// bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- \
//   node --import ./tests/register-tsx.mjs scripts/build-template-css.mjs

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { renderTemplateBilingual } from "../lib/template-engine.ts";
import { allTemplates, subByKey } from "../lib/template-taxonomy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const GENERATED_PATH = join(ROOT, "lib/generated/tailwind-utilities.ts");
const SCRATCH_ROOT = join(ROOT, "scratch");
const TAILWIND_PACKAGE = createRequire(import.meta.url).resolve(
  "tailwindcss3/package.json",
);
const TAILWIND_REQUIRE = createRequire(TAILWIND_PACKAGE);
const POSTCSS = TAILWIND_REQUIRE("postcss");
const SELECTOR_PARSER = TAILWIND_REQUIRE("postcss-selector-parser");
const TAILWIND_CLI = join(dirname(TAILWIND_PACKAGE), "lib/cli.js");

// Tailwind 的 group/peer 是变体锚点，本身故意没有独立声明。只有实际出现在 HTML
// 且编译器未生成规则的锚点才可列在这里；其它漏项一律让构建失败。
const MARKER_CLASSES = ["group", "peer"];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function makeTempDir() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  return mkdtempSync(join(SCRATCH_ROOT, "template-css-"));
}

function runTailwind({ inputCss, content, tempDir, name }) {
  const inputPath = join(tempDir, `${name}.input.css`);
  const outputPath = join(tempDir, `${name}.output.css`);
  writeFileSync(inputPath, inputCss, "utf8");
  const result = spawnSync(
    process.execPath,
    [TAILWIND_CLI, "-i", inputPath, "-o", outputPath, "--content", content, "--minify"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `Tailwind v3 生成失败 (${name})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return readFileSync(outputPath, "utf8");
}

function cleanCss(css) {
  const root = POSTCSS.parse(css);
  root.walkComments((comment) => comment.remove());
  return root.toString().trim();
}

function classesInSelector(selector) {
  const out = new Set();
  SELECTOR_PARSER((selectors) => {
    selectors.walkClasses((node) => out.add(node.value));
  }).processSync(selector);
  return [...out].sort();
}

function classesInHtml(html) {
  const out = new Set();
  for (const match of html.matchAll(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    for (const className of (match[1] ?? match[2] ?? "").split(/\s+/)) {
      if (className) out.add(className);
    }
  }
  return out;
}

function inlineClassesInHtml(html) {
  const out = new Set();
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = style[1].replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
      out.add(match[1]);
    }
  }
  return out;
}

function wrappedRule(rule) {
  let css = rule.toString();
  let parent = rule.parent;
  while (parent && parent.type !== "root") {
    if (parent.type !== "atrule") {
      throw new Error(`不能序列化 Tailwind 嵌套节点 ${parent.type}`);
    }
    const params = parent.params ? ` ${parent.params}` : "";
    css = `@${parent.name}${params}{${css}}`;
    parent = parent.parent;
  }
  return css;
}

function splitCss(css) {
  const root = POSTCSS.parse(cleanCss(css));
  const keyframeClasses = new Map();
  for (const node of root.nodes) {
    if (node.type !== "atrule" || !node.name.endsWith("keyframes")) continue;
    const consumers = new Set();
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
      const classNames = classesInSelector(rule.selector);
      if (!classNames.length) return;
      rule.walkDecls(/^animation(?:-name)?$/, (decl) => {
        if (new RegExp(`(?:^|[\\s,])${node.params}(?:[\\s,]|$)`).test(decl.value)) {
          for (const className of classNames) consumers.add(className);
        }
      });
    });
    if (consumers.size) keyframeClasses.set(node, [...consumers].sort());
  }
  const topLevelHasClass = (node) => {
    if (keyframeClasses.has(node)) return true;
    let found = false;
    if (node.type === "rule" && classesInSelector(node.selector).length) return true;
    if (typeof node.walkRules === "function") {
      node.walkRules((rule) => {
        if (classesInSelector(rule.selector).length) found = true;
      });
    }
    return found;
  };
  const firstUtility = root.nodes.findIndex(topLevelHasClass);
  if (firstUtility < 0) throw new Error("Tailwind 输出里没有 utility 规则");

  const unexpected = root.nodes
    .slice(firstUtility)
    .filter((node) => !topLevelHasClass(node));
  if (unexpected.length) {
    throw new Error(
      `utility 之后出现无法按类归属的 CSS：${unexpected
        .map((node) => node.toString().slice(0, 240))
        .join("\n")}`,
    );
  }

  const preflight = root.nodes
    .slice(0, firstUtility)
    .map((node) => node.toString())
    .join("")
    .trim();
  const rules = [];
  for (const node of root.nodes.slice(firstUtility)) {
    if (keyframeClasses.has(node)) {
      rules.push([keyframeClasses.get(node), node.toString()]);
      continue;
    }
    if (node.type === "rule") {
      rules.push([classesInSelector(node.selector), node.toString()]);
      continue;
    }
    node.walkRules((rule) => {
      const classNames = classesInSelector(rule.selector);
      if (classNames.length) rules.push([classNames, wrappedRule(rule)]);
    });
  }
  if (rules.some(([classNames]) => !classNames.length)) {
    throw new Error("生成表含有无法归属到类名的规则");
  }
  return { preflight, rules };
}

function sourceProbeHash(tempDir) {
  const css = runTailwind({
    inputCss: "@tailwind utilities;\n",
    content: join(ROOT, "lib/template-engine.ts"),
    tempDir,
    name: "source-probe",
  });
  return sha256(cleanCss(css));
}

export function buildSourceProbeHash() {
  const tempDir = makeTempDir();
  try {
    return sourceProbeHash(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function renderAll(tempDir) {
  const rendered = [];
  for (const meta of [...allTemplates()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const found = subByKey(meta.subKey);
    if (!found) throw new Error(`${meta.slug}: 找不到子类 ${meta.subKey}`);
    for (const lang of ["en", "zh"]) {
      const { html } = renderTemplateBilingual(meta, found.ind, found.sub, lang);
      const filename = `${meta.slug}.${lang}.html`;
      writeFileSync(join(tempDir, filename), html, "utf8");
      rendered.push({ slug: meta.slug, lang, html });
    }
  }
  return rendered;
}

function artifactSource({ preflight, rules, classNames, sourceHash }) {
  const fullCssExpression =
    'TAILWIND_PREFLIGHT + (TAILWIND_RULES.length ? "\\n" + TAILWIND_RULES.map(([, css]) => css).join("\\n") : "")';
  return `// 此文件由 scripts/build-template-css.mjs 生成；请勿手改。\n` +
    `// Tailwind v3.4.17，覆盖 500 个模板的中英文输出。\n\n` +
    `export const TAILWIND_PREFLIGHT = ${JSON.stringify(preflight)};\n\n` +
    `export const TAILWIND_RULES = ${JSON.stringify(rules, null, 2)} as const;\n\n` +
    `export const TAILWIND_CLASS_NAMES = ${JSON.stringify(classNames, null, 2)} as const;\n\n` +
    `export const TAILWIND_MARKER_CLASSES = ${JSON.stringify(MARKER_CLASSES)} as const;\n\n` +
    `export const TAILWIND_SOURCE_PROBE_SHA256 = ${JSON.stringify(sourceHash)};\n\n` +
    `export const TAILWIND_FULL_CSS = ${fullCssExpression};\n`;
}

export function buildArtifact() {
  const tempDir = makeTempDir();
  try {
    const rendered = renderAll(tempDir);
    const rawCss = runTailwind({
      inputCss: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
      content: join(tempDir, "*.html"),
      tempDir,
      name: "all-templates",
    });
    const { preflight, rules } = splitCss(rawCss);
    const compiledClasses = new Set(rules.flatMap(([classNames]) => classNames));
    const usedClasses = new Set(rendered.flatMap(({ html }) => [...classesInHtml(html)]));
    const markerClasses = new Set(MARKER_CLASSES);

    const missing = [];
    for (const { slug, lang, html } of rendered) {
      const inline = inlineClassesInHtml(html);
      for (const className of classesInHtml(html)) {
        if (
          !compiledClasses.has(className) &&
          !markerClasses.has(className) &&
          !inline.has(className)
        ) {
          missing.push(`${slug}.${lang}:${className}`);
        }
      }
    }
    if (missing.length) {
      throw new Error(`仍有 ${missing.length} 个类没有 CSS：\n${missing.slice(0, 40).join("\n")}`);
    }

    const sourceHash = sourceProbeHash(tempDir);
    const classNames = [...compiledClasses].sort();
    const artifact = artifactSource({ preflight, rules, classNames, sourceHash });
    const fullCss = preflight + (rules.length ? `\n${rules.map(([, css]) => css).join("\n")}` : "");
    return {
      artifact,
      stats: {
        rendered: rendered.length,
        sites: new Set(rendered.map(({ slug }) => slug)).size,
        usedClasses: usedClasses.size,
        compiledClasses: classNames.length,
        preflightBytes: Buffer.byteLength(preflight),
        fullCssBytes: Buffer.byteLength(fullCss),
      },
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const check = process.argv.includes("--check");
  const sourceOnly = process.argv.includes("--source-probe");
  if (sourceOnly) {
    process.stdout.write(`${buildSourceProbeHash()}\n`);
    return;
  }
  const { artifact, stats } = buildArtifact();
  if (check) {
    const current = existsSync(GENERATED_PATH) ? readFileSync(GENERATED_PATH, "utf8") : "";
    if (current !== artifact) {
      throw new Error(
        `${relative(ROOT, GENERATED_PATH)} 已过期；请按文件头命令重建并提交`,
      );
    }
  } else {
    mkdirSync(dirname(GENERATED_PATH), { recursive: true });
    writeFileSync(GENERATED_PATH, artifact, "utf8");
  }
  const action = check ? "同步" : "写入";
  process.stdout.write(
    `${action} ${relative(ROOT, GENERATED_PATH)}：` +
      `${stats.sites} 站 / ${stats.rendered} 份 HTML，` +
      `${stats.usedClasses} 个实用类，完整 CSS ${stats.fullCssBytes} B ` +
      `(preflight ${stats.preflightBytes} B)\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
