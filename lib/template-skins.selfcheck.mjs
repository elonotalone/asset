// 十套装的「真皮」自检器。
//
// 问的是一个问题：**固定同一份内容、同一页面构成，只把装换掉，产出的源码真的不一样吗？**
// 所以它不读 SKINS 表里的声明值（声明谁都会写），只读 buildWebsiteSourceTree() 吐出来的
// 那几个文件的字节：index.html、site.json、assets/skin.css、结构 IR。
// 声明为 round 但产物里圆角还是 0，这里就必须是红的。
//
// 跑法（node 在 /host/usr/bin，不在 PATH 上）：
//   export PATH="/host/usr/bin:$PATH"
//   cd /root/projects/asset
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/register-tsx.mjs lib/template-skins.selfcheck.mjs
//
// 退出码：0 = 十套装两两可分；非 0 = 有轴退化成同值，或有两套装在 ≥4 条轴上无差异。

import { SKINS } from "./template-skins.ts";
import { dnaForSkin } from "./template-dna.ts";
import { buildTemplateStructure } from "./template-website-source-ir.ts";
import {
  RUNTIME_JS,
  assertEmitterComplete,
  buildWebsiteSourceConfig,
  buildWebsiteSourceTree,
} from "./template-website-source.ts";
import { allTemplates, industryByKey, subByKey } from "./template-taxonomy.ts";

/** 任意两套装最多允许在几条轴上无差异（第 4 条起就是「十套装其实长得差不多」）。 */
const MAX_SAME_AXES = 3;

const AXES = ["radius", "density", "font", "fx", "dark", "signature"];

// ————————————————————————————————————————————————————————————
// 取样：固定内容 + 固定构成，只换装
// ————————————————————————————————————————————————————————————

/** 六页官网（构成最全，能把最多板块过一遍）；行业下限 s6，与装无关。 */
function sampleMeta() {
  const meta = allTemplates().find((m) => m.industryKey === "business");
  if (!meta) throw new Error("取样失败：没有 business 行业的模板");
  return meta;
}

function emitFor(meta, skinKey) {
  const industry = industryByKey(meta.industryKey);
  const sub = subByKey(meta.subKey);
  const dna = dnaForSkin(meta.slug, meta.industryKey, meta.variant, skinKey);
  const structure = buildTemplateStructure(meta, industry, sub, dna);
  const config = buildWebsiteSourceConfig(structure, "zh");
  const tree = buildWebsiteSourceTree(structure, null);
  return { structure, config, tree };
}

function fileText(tree, path) {
  return tree.files.find((f) => f.path === path)?.text ?? "";
}

/** 产物里全部「样式字节」：内联 :root、每皮样式表、共享运行时样式表。 */
function styleBytes(tree) {
  return [
    fileText(tree, "index.html"),
    fileText(tree, "assets/skin.css"),
    fileText(tree, "assets/styles.css"),
  ].join("\n");
}

// ————————————————————————————————————————————————————————————
// 量：六条轴各自的产物指纹
// ————————————————————————————————————————————————————————————

function customProps(css, pattern) {
  const out = [];
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    if (pattern.test(m[1])) out.push(`${m[1]}=${m[2].trim()}`);
  }
  return [...new Set(out)].sort();
}

function sectionStyles(config) {
  return config.pages.flatMap((p) => p.sections).map((s) => s.style);
}

function uniqNums(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function luminance(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const CJK_FAMILY = /PingFang|Microsoft YaHei|Noto Sans SC|Noto Serif SC|Songti|Source Han|Hiragino|Heiti|HarmonyOS Sans|思源|黑体|宋体/i;

function measure(sample) {
  const { structure, config, tree } = sample;
  const css = styleBytes(tree);
  const html = fileText(tree, "index.html");
  const styles = sectionStyles(config);

  const radius = [
    ...customProps(css, /^radius/),
    `cornerRadius=${uniqNums(styles.map((s) => s.cornerRadius)).join("|")}`,
  ];

  const density = [
    ...customProps(css, /^(space|gap|h1|h2|line-height|measure)/),
    `pad=${uniqNums(styles.flatMap((s) => [s.paddingTop, s.paddingBottom])).join("|")}`,
    `lineHeight=${config.typography.lineHeight}`,
  ];

  const fontStacks = [
    ...customProps(css, /^(heading-font|body-font)/),
    `headingFont=${config.typography.headingFont}`,
    `bodyFont=${config.typography.bodyFont}`,
  ];

  const fxSelectors = [...new Set([
    ...[...css.matchAll(/\.(leo-[a-z0-9-]+)/gi)].map((m) => m[1]),
    ...[...css.matchAll(/@keyframes\s+([a-z0-9_-]+)/gi)].map((m) => `@${m[1]}`),
  ])].sort();
  const fx = [
    `data-fx=${/data-fx="([^"]*)"/.exec(html)?.[1] ?? ""}`,
    ...fxSelectors,
  ];

  const bg = config.backgroundColor;
  // 正文色取「最多节用的那个」——首节常是 hero 反白，代表不了整站读感。
  const inkTally = new Map();
  for (const s of styles) {
    if (s.textColor) inkTally.set(s.textColor, (inkTally.get(s.textColor) ?? 0) + 1);
  }
  const ink = [...inkTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const bgLum = luminance(bg);
  const inkLum = luminance(ink);
  const dark = [
    `bg=${bg}`,
    `ink=${ink}`,
    `mode=${bgLum === null ? "?" : bgLum < 0.4 ? "dark" : "light"}`,
  ];

  const homeKinds = (structure.pages.find((p) => p.key === "home")?.sections ?? []).map((s) => s.kind);
  const homeDisplays = (config.pages.find((p) => p.id === "home")?.sections ?? [])
    .map((s) => (typeof s.content?.display === "string" ? s.content.display : ""))
    .filter(Boolean);

  return {
    axisValues: { radius, density, font: fontStacks, fx, dark, signature: [...homeKinds, ...homeDisplays.map((d) => `@${d}`)] },
    homeKinds,
    homeDisplays,
    bgLum,
    inkLum,
    cjk: fontStacks.some((v) => CJK_FAMILY.test(v)),
  };
}

// ————————————————————————————————————————————————————————————
// URL 白名单：产物里的图片到底能不能被浏览器请求到
// ————————————————————————————————————————————————————————————

/** 从 `RUNTIME_JS` 的字节里抠出一个函数声明（花括号配平），不重抄一份实现。 */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`RUNTIME_JS 里找不到 ${name}()`);
  let depth = 0;
  for (let j = src.indexOf("{", start); j < src.length; j += 1) {
    if (src[j] === "{") depth += 1;
    else if (src[j] === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`RUNTIME_JS 里 ${name}() 的花括号不配平`);
}

const runtimeSafeUrl = new Function(
  `${extractFn(RUNTIME_JS, "str")}\n${extractFn(RUNTIME_JS, "safeUrl")}\nreturn safeUrl;`,
)();

/** 必须原样放行：站内路径与三种安全协议。 */
const URL_PASS = [
  "images/ind-finance--pixabay-1726618.webp",
  "assets/app.js",
  "index.html",
  "about/index.html?tab=1#top",
  "./a.html",
  "../a.html",
  "/a.html",
  "#services",
  "https://oceanleo.com/a",
  "http://oceanleo.com",
  "mailto:hi@oceanleo.com",
  "tel:+8610000000",
];

/** 必须降级成 `#`：脚本协议、数据协议、协议相对、反斜杠变体。 */
const URL_BLOCK = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "  javascript:alert(1)",
  "jav\tascript:alert(1)",
  "\u0001javascript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "data:image/svg+xml,<svg onload=alert(1)>",
  "vbscript:msgbox(1)",
  "//evil.com/x.js",
  "\\\\evil.com/x.js",
  "\\/evil.com/x.js",
  "",
  "   ",
];

function collectUrls(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collectUrls(v, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && (k === "url" || k === "href" || k === "src")) out.push(v);
      else collectUrls(v, out);
    }
  }
  return out;
}

/** 判 URL 白名单：正反用例 + 产物里每一条 URL 都得活着走出 safeUrl()。 */
function checkUrls(sample, failures) {
  for (const u of URL_PASS) {
    if (runtimeSafeUrl(u) !== u.trim()) {
      failures.push(`safeUrl 误杀站内/安全 URL：${JSON.stringify(u)} → ${JSON.stringify(runtimeSafeUrl(u))}`);
    }
  }
  for (const u of URL_BLOCK) {
    if (runtimeSafeUrl(u) !== "#") {
      failures.push(`safeUrl 放行危险 URL：${JSON.stringify(u)} → ${JSON.stringify(runtimeSafeUrl(u))}`);
    }
  }
  const urls = [...new Set(collectUrls(sample.config).filter(Boolean))];
  const dropped = urls.filter((u) => runtimeSafeUrl(u) === "#" && u.trim() !== "#");
  const imageUrls = urls.filter((u) => /\.(webp|png|jpe?g|svg|avif)$/i.test(u));
  if (!imageUrls.length) failures.push("取样产物里一张图片 URL 都没有，这条判据等于没判");
  if (dropped.length) {
    failures.push(
      `产物里 ${dropped.length}/${urls.length} 条 URL 被 safeUrl 打成 "#"（浏览器压根不会去请求）：` +
      dropped.slice(0, 5).map((u) => JSON.stringify(u)).join(" "),
    );
  }
  return { urls: urls.length, imageUrls: imageUrls.length, dropped: dropped.length };
}

// ————————————————————————————————————————————————————————————
// 判
// ————————————————————————————————————————————————————————————

function fingerprint(values) {
  let h = 5381;
  const joined = values.join("\u0001");
  for (let i = 0; i < joined.length; i += 1) h = ((h * 33) ^ joined.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

function short(values, width = 26) {
  const s = values.join(" ").replace(/\s+/g, " ").trim();
  return s.length <= width ? s.padEnd(width) : `${s.slice(0, width - 1)}…`;
}

function pad(s, n) {
  const w = [...s].reduce((acc, ch) => acc + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
  return s + " ".repeat(Math.max(0, n - w));
}

function main() {
  assertEmitterComplete();

  const meta = sampleMeta();
  const rows = SKINS.map((skin) => {
    const sample = emitFor(meta, skin.key);
    const m = measure(sample);
    return {
      skin,
      ...m,
      prints: Object.fromEntries(AXES.map((axis) => [axis, fingerprint(m.axisValues[axis])])),
    };
  });

  // 签名版块：某个 kind / display 只在这一套装的首页出现，才算它独有的。
  const kindOwners = new Map();
  for (const row of rows) {
    for (const kind of new Set([...row.homeKinds, ...row.homeDisplays])) {
      kindOwners.set(kind, (kindOwners.get(kind) ?? 0) + 1);
    }
  }
  for (const row of rows) {
    row.signatureKinds = [...new Set([...row.homeKinds, ...row.homeDisplays])]
      .filter((kind) => kindOwners.get(kind) === 1)
      .sort();
  }

  console.log(`取样模板：${meta.slug}（${meta.industryLabel} / ${meta.subLabel}，variant ${meta.variant}）`);
  console.log("固定内容 + 固定构成，只换装；下表全部读自产出的源码字节，不读 SKINS 声明值。\n");

  const header = `${pad("装", 12)}${AXES.map((a) => pad(a, 10)).join("")}签名版块`;
  console.log(header);
  console.log("-".repeat(header.length + 8));
  for (const row of rows) {
    const cells = AXES.map((axis) => pad(row.prints[axis], 10)).join("");
    console.log(`${pad(`${row.skin.key}/${row.skin.label}`, 12)}${cells}${row.signatureKinds.join(",") || "（无）"}`);
  }

  console.log("\n指纹展开：");
  for (const axis of AXES) {
    console.log(`  [${axis}]`);
    for (const row of rows) {
      console.log(`    ${pad(row.skin.key, 12)}${row.prints[axis]}  ${short(row.axisValues[axis], 88)}`);
    }
  }

  const failures = [];

  const urlRead = checkUrls(emitFor(meta, SKINS[0].key), failures);
  console.log(
    `\nURL 白名单：产物 ${urlRead.urls} 条 URL（其中图片 ${urlRead.imageUrls} 条），` +
    `被打成 "#" 的 ${urlRead.dropped} 条；正例 ${URL_PASS.length} 条 / 反例 ${URL_BLOCK.length} 条。`,
  );

  // 声明里有几档，产物里就至少要能分出几档。只查「不全同」挡不住
  // 「三档圆角在产物里塌成两档」这种半退化。
  const DECLARED = {
    radius: new Set(SKINS.map((s) => s.radius)),
    density: new Set(SKINS.map((s) => s.density)),
    font: new Set(SKINS.map((s) => s.font)),
    fx: new Set(SKINS.map((s) => s.fx)),
    dark: new Set(SKINS.map((s) => String(s.dark))),
    signature: new Set(SKINS.map((s) => s.key)),
  };
  for (const axis of AXES) {
    const distinct = new Set(rows.map((r) => r.prints[axis]));
    const want = DECLARED[axis].size;
    if (distinct.size === 1) {
      failures.push(`轴退化：所有 10 套装的 \`${axis}\` 在产物里是同一个值（指纹 ${[...distinct][0]}）`);
    } else if (distinct.size < want) {
      failures.push(
        `轴半退化：\`${axis}\` 声明了 ${want} 档（${[...DECLARED[axis]].join("/")}），` +
        `产物里只分得出 ${distinct.size} 档`,
      );
    }
  }

  for (const row of rows) {
    if (!row.cjk) {
      failures.push(`${row.skin.key}: 产物里的字体栈不含任何中文字族 → 中文必然回落系统默认`);
    }
    if (row.skin.dark && !(row.bgLum !== null && row.bgLum < 0.4)) {
      failures.push(`${row.skin.key}: 声明为暗色，产物底色 ${row.axisValues.dark[0]} 却不是暗底`);
    }
    if (row.skin.dark && !(row.inkLum !== null && row.inkLum > 0.5)) {
      failures.push(`${row.skin.key}: 声明为暗色，产物正文色 ${row.axisValues.dark[1]} 却不是浅字`);
    }
    if (!row.signatureKinds.length) {
      failures.push(`${row.skin.key}: 首页里没有任何这套装独有的版块（签名版块缺失）`);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const same = AXES.filter((axis) => rows[i].prints[axis] === rows[j].prints[axis]);
      if (same.length > MAX_SAME_AXES) {
        failures.push(
          `${rows[i].skin.key} 与 ${rows[j].skin.key} 在 ${same.length} 条轴上无差异（${same.join("/")}），` +
          `上限 ${MAX_SAME_AXES}`,
        );
      }
    }
  }

  if (failures.length) {
    console.log(`\n红 —— ${failures.length} 条：`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log("\n绿 —— 六条轴都随装变化，十套装两两在 ≥3 条轴上可分，暗色皮真的是暗底浅字。");
}

main();
