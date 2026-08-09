// 离线模板样式判据。
// 跑法（asset 仓根）：
// bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//   node --import ./tests/register-tsx.mjs --test tests/template-css.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { renderTemplateBilingual } from "../lib/template-engine.ts";
import { allTemplates, subByKey } from "../lib/template-taxonomy.ts";
import {
  classNamesIn,
  missingClasses,
  utilitiesFor,
} from "../lib/template-css.ts";
import {
  TAILWIND_FULL_CSS,
  TAILWIND_SOURCE_PROBE_SHA256,
} from "../lib/generated/tailwind-utilities.ts";
import { buildSourceProbeHash } from "../scripts/build-template-css.mjs";

function samplesAcrossLooks() {
  const selected = new Map();
  for (const meta of allTemplates()) {
    if (!selected.has(`layout:${meta.layoutKey}`)) {
      selected.set(`layout:${meta.layoutKey}`, meta);
    }
    if (!selected.has(`palette:${meta.paletteKey}`)) {
      selected.set(`palette:${meta.paletteKey}`, meta);
    }
  }
  return [...new Map([...selected.values()].map((meta) => [meta.slug, meta])).values()];
}

function render(meta, lang = "zh") {
  const found = subByKey(meta.subKey);
  assert.ok(found, `${meta.slug}: 找不到子类`);
  return renderTemplateBilingual(meta, found.ind, found.sub, lang).html;
}

test("classNamesIn 保留响应式、状态和任意值类", () => {
  const names = classNamesIn(
    `<div class="md:grid-cols-2 hover:scale-[1.02]"></div><p class='sm:block'></p>`,
  );
  assert.deepEqual(
    [...names].sort(),
    ["hover:scale-[1.02]", "md:grid-cols-2", "sm:block"],
  );
});

test("各布局家族与配色样本的全部类都有样式", () => {
  const samples = samplesAcrossLooks();
  const all = allTemplates();
  assert.deepEqual(
    new Set(samples.map((meta) => meta.layoutKey)),
    new Set(all.map((meta) => meta.layoutKey)),
  );
  assert.deepEqual(
    new Set(samples.map((meta) => meta.paletteKey)),
    new Set(all.map((meta) => meta.paletteKey)),
  );
  for (const meta of samples) {
    for (const lang of ["zh", "en"]) {
      const missing = missingClasses(render(meta, lang));
      assert.deepEqual(missing, [], `${meta.slug}.${lang}: ${missing.join(", ")}`);
    }
  }
});

test("内联自定义样式拆到 site.css 后仍不会误报缺类", () => {
  const html = render(allTemplates()[0]);
  const detachedHtml = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  assert.deepEqual(missingClasses(detachedHtml), []);
});

test("单站样式离线且明显小于全量生成表", () => {
  const html = render(allTemplates()[0]);
  const css = utilitiesFor(html);
  assert.ok(css.includes("box-sizing:border-box"), "应包含 Tailwind preflight");
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(TAILWIND_FULL_CSS, /https?:\/\//);
  assert.ok(
    css.length < TAILWIND_FULL_CSS.length * 0.75,
    `单站 ${css.length} B，没有比全量 ${TAILWIND_FULL_CSS.length} B 小至少 25%`,
  );
});

test("生成物与模板里的 Tailwind 类候选同步", () => {
  assert.equal(
    buildSourceProbeHash(),
    TAILWIND_SOURCE_PROBE_SHA256,
    "模板新增了 utility 类；请重跑 scripts/build-template-css.mjs 并提交生成物",
  );
});
