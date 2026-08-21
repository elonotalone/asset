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
//
// 第二个模式 `--guard-drill`：反过来问「守卫自己拦得住回退吗」。它把 lib/tests 复制到
// /tmp 的临时副本（不动产品代码），在副本里逐个造出「某条轴塌成十装同值」这类回退，
// 再调 assertEmitterComplete()。守卫合格 ⇒ 抛错；静默通过 ⇒ 这一条反例算漏。
//   … node --import ./tests/register-tsx.mjs lib/template-skins.selfcheck.mjs --guard-drill
//
// 第三个模式 `--url-drill`（裁定 A-29）：同样的问法对着 safeUrl 的归一化口径问一遍。
// 它对 template-website-source.ts 的**文本**打七条回退补丁（不抽 tab、trim 换回来、
// 协议相对不判、首段只判字面冒号…），每条都必须让 URL 判据当场红。
//   … node --import ./tests/register-tsx.mjs lib/template-skins.selfcheck.mjs --url-drill

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
// 样式字节归属：哪几份文件随装变，哪几份按设计共享
// ————————————————————————————————————————————————————————————

/** djb2，只用来看"是不是同一份字节"，不做密码学用途。 */
function byteHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * `assets/styles.css` / `assets/app.js` 是 500 个模板共用的**一份**运行时字节（存储要求，
 * 见 `RUNTIME_JS` 头注释），所以它们跨装相同是设计，不是缺陷。装的差异必须落在
 * **随装变的那两份**上：`index.html` 的内联 `:root` 与每装一份的 `assets/skin.css`。
 * 这一节把两类文件分开量，免得"共享文件跨装相同"被读成"css 与皮无关"。
 */
function checkStyleOwnership(samples, failures) {
  const PER_SKIN = ["index.html", "assets/skin.css"];
  const SHARED = ["assets/styles.css", "assets/app.js"];
  const rows = samples.map(({ skinKey, tree }) => ({
    skinKey,
    perSkin: PER_SKIN.map((p) => ({ path: p, bytes: fileText(tree, p).length, hash: byteHash(fileText(tree, p)) })),
    shared: SHARED.map((p) => ({ path: p, bytes: fileText(tree, p).length, hash: byteHash(fileText(tree, p)) })),
  }));
  for (const [i, path] of PER_SKIN.entries()) {
    const distinct = new Set(rows.map((r) => r.perSkin[i].hash)).size;
    if (rows.some((r) => r.perSkin[i].bytes === 0)) failures.push(`产物里没有 \`${path}\`（随装文件缺失）`);
    else if (distinct < rows.length) {
      failures.push(`\`${path}\` 在 10 套装上只有 ${distinct} 份不同字节：随装样式没有做到一装一份`);
    }
  }
  for (const [i, path] of SHARED.entries()) {
    const distinct = new Set(rows.map((r) => r.shared[i].hash)).size;
    if (distinct !== 1) failures.push(`\`${path}\` 跨装出现了 ${distinct} 份字节：共享运行时被拆开了（存储要求）`);
  }
  return rows;
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
  // ── 裁定 A-29：V1 在 415e49d 上造的 18 条。前两条（斜杠间插 tab、前导 NUL）当时**真能跨源**，
  //    成因是判定顺序反了：拿原始串判协议相对，而浏览器会先抽掉串内 tab/CR/LF、剥掉首尾 C0，
  //    抽剥完才解析。其余各条当时是惰性泄漏（返回值走 setAttribute 不进 innerHTML），
  //    但「今天惰性」不是判据 —— 换一个消费者（写进 innerHTML、或先 decodeURIComponent）就活了。
  "/\t/evil.example.com/x",
  "\u0000//evil.example.com",
  "///evil.example.com/x",
  "\\/\\/evil.example.com",
  "data\u0000:text/html,x",
  "javascript&#58;alert(1)",
  "javascript&#x3a;alert(1)",
  "javascript&colon;alert(1)",
  "javascript%3aalert(1)",
  "javascript%3Aalert(1)",
  "javascript\uff1aalert(1)",
  "java\u200bscript:alert(1)",
  "java\ufeffscript:alert(1)",
  "javascript\u00a0:alert(1)",
  "\u2028javascript:alert(1)",
  "JAVASCRIPT:ALERT(1)",
  "\t\r\n javascript:alert(1)",
];

/** 归一化口径的整类判据用的底串：每一条都是「只差一步归一化就能跨源 / 换协议」的形状。 */
const URL_SWEEP_BASES = ["//evil.example.com/x", "javascript:alert(1)", "\\\\evil.example.com\\x"];
/** 产物站点的基址：判「safeUrl 放出去的串，浏览器解析完落在哪个源」用。 */
const URL_SWEEP_BASE_HREF = "https://tenant.oceanleo.app/site/index.html";

/**
 * 整类判据（不是列举）：把 C0 全域 `\u0000`–`\u001f` 加空格与 DEL 逐个插进底串的**每一个位置**，
 * 每条变体只有两种合格结局 —— 被打成 `#`，或者返回值用 WHATWG 解析器解出来仍然同源、仍是 http(s)。
 *
 * 这一条就是「不许只加两条黑名单」的可执行形式：黑名单实现只挡得住语料里点名的那两个
 * 控制字符，扫到第三个（`\u000b`、`\u001c`…）立刻现形；先归一化再判的实现整族都过。
 */
function sweepControlCharVariants(fn) {
  const origin = new URL(URL_SWEEP_BASE_HREF).origin;
  const chars = [];
  for (let c = 0x00; c <= 0x20; c += 1) chars.push(String.fromCharCode(c));
  chars.push("\u007f");
  const leaks = [];
  let total = 0;
  for (const base of URL_SWEEP_BASES) {
    for (let pos = 0; pos <= base.length; pos += 1) {
      for (const ch of chars) {
        const variant = base.slice(0, pos) + ch + base.slice(pos);
        total += 1;
        const got = fn(variant);
        if (got === "#") continue;
        let u = null;
        try {
          u = new URL(got, URL_SWEEP_BASE_HREF);
        } catch {
          leaks.push({ variant, got, why: "解析不出来" });
          continue;
        }
        if (u.origin !== origin) leaks.push({ variant, got, why: `跨源 → ${u.origin}` });
        else if (!/^https?:$/.test(u.protocol)) leaks.push({ variant, got, why: `危险协议 ${u.protocol}` });
      }
    }
  }
  return { total, leaks };
}

/** 把正反语料 + 控制字符全扫一次性判完，主模式与反例演练共用同一套判据。 */
function judgeSafeUrl(fn) {
  const failures = [];
  for (const u of URL_PASS) {
    if (fn(u) !== u.trim()) failures.push(`误杀站内/安全 URL：${JSON.stringify(u)} → ${JSON.stringify(fn(u))}`);
  }
  for (const u of URL_BLOCK) {
    if (fn(u) !== "#") failures.push(`放行危险 URL：${JSON.stringify(u)} → ${JSON.stringify(fn(u))}`);
  }
  const sweep = sweepControlCharVariants(fn);
  for (const l of sweep.leaks.slice(0, 6)) {
    failures.push(`控制字符变体逃逸：${JSON.stringify(l.variant)} → ${JSON.stringify(l.got)}（${l.why}）`);
  }
  if (sweep.leaks.length > 6) failures.push(`控制字符变体逃逸共 ${sweep.leaks.length} 条（上面只列前 6 条）`);
  return { failures, sweepTotal: sweep.total, sweepLeaks: sweep.leaks.length };
}

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

/** 判 URL 白名单：正反用例 + 控制字符全扫 + 产物里每一条 URL 都得活着走出 safeUrl()。 */
function checkUrls(sample, failures) {
  const verdict = judgeSafeUrl(runtimeSafeUrl);
  for (const f of verdict.failures) failures.push(`safeUrl ${f}`);
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
  return {
    urls: urls.length,
    imageUrls: imageUrls.length,
    dropped: dropped.length,
    sweepTotal: verdict.sweepTotal,
    sweepLeaks: verdict.sweepLeaks,
  };
}

// ————————————————————————————————————————————————————————————
// 守卫反例演练：assertEmitterComplete() 真拦得住回退吗
// ————————————————————————————————————————————————————————————

/**
 * 八条反例。每条都是一次**真实可能发生的回退**：有人把皮表里的一格改回默认、
 * 有人把暗色派生改回照发 `soft`、有人漏发一个令牌、有人让两套皮共用一个签名。
 * `to` 里写的都是皮表本来就有的合法取值，所以副本仍然能正常发射 —— 守卫
 * 不抛错就意味着这种产物会被照产出去。
 */
const GUARD_COUNTEREXAMPLES = [
  {
    id: "radius 十装同值",
    file: "lib/template-skins.ts",
    from: /radius: "[a-z]+"/g,
    to: 'radius: "soft"',
    least: 10,
  },
  {
    id: "density 十装同值",
    file: "lib/template-skins.ts",
    from: /density: "[a-z]+"/g,
    to: 'density: "regular"',
    least: 10,
  },
  {
    id: "font 十装同值",
    file: "lib/template-skins.ts",
    from: /font: "[a-z]+"/g,
    to: 'font: "sans"',
    least: 10,
  },
  {
    id: "fx 十装同值",
    file: "lib/template-skins.ts",
    from: /fx: "[a-z-]+"/g,
    to: 'fx: "none"',
    least: 10,
  },
  {
    id: "明暗声明十装同值",
    file: "lib/template-skins.ts",
    from: /dark: true/g,
    to: "dark: false",
    least: 2,
  },
  {
    id: "暗装退回照发 soft（声明暗色、产出浅底）",
    file: "lib/template-website-source.ts",
    from: /const pageBg = isDarkColor\(t\.soft\) \? t\.soft : mix\(t\.ink, "#000000", 0\.5\);/,
    to: 'const pageBg = t.soft;',
    least: 1,
  },
  {
    id: "漏发一个令牌（--radius-pill）",
    file: "lib/template-website-source.ts",
    from: /tokenDecl\("radius-pill", k\.radiusPill\),/,
    to: "",
    least: 1,
  },
  // 下面两条是**半退化**：皮表一个字没改（声明还是三档），是发射端的令牌表把两档压成一档。
  // 只判「十装同值」的守卫过得了这两条 —— 第 1 轮的 font 缺陷（geometric 被压成 sans）
  // 就是这个形状。
  {
    id: "font 半退化（geometric 压成 sans）",
    file: "lib/template-dna.ts",
    from: /geometric: "'Century Gothic',Futura,'PingFang SC','Microsoft YaHei',sans-serif",/,
    to: `geometric: "-apple-system,'PingFang SC','Microsoft YaHei',Inter,system-ui,sans-serif",`,
    least: 1,
  },
  {
    id: "radius 半退化（round 压成 soft）",
    file: "lib/template-dna.ts",
    from: /round: \{ card: "24px", btn: "9999px", img: "24px", pill: "9999px" \},/,
    to: 'round: { card: "16px", btn: "10px", img: "16px", pill: "9999px" },',
    least: 1,
  },
  {
    id: "十套装共用一个签名版块",
    file: "lib/template-dna.ts",
    from: /kind: "sig[A-Za-z]+",\n(\s*)display: "[a-z-]+",/g,
    to: 'kind: "sigPaperIndex",\n$1display: "paper-index",',
    least: 10,
  },
];

const GUARD_PROBE = `const root = process.env.DRILL_ROOT;
const src = await import(\`\${root}/lib/template-website-source.ts\`);
try {
  src.assertEmitterComplete();
  console.log("THROW=no");
} catch (e) {
  console.log("THROW=yes\\t" + String(e && e.message).replace(/\\s+/g, " ").slice(0, 150));
}
`;

function runGuardProbe(tmp) {
  try {
    return execFileSync(process.execPath, ["--import", "./tests/register-tsx.mjs", `${tmp}/drill-probe.mjs`], {
      cwd: tmp,
      env: { ...process.env, DRILL_ROOT: tmp },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

function readVerdict(out) {
  const line = out.split("\n").find((l) => l.startsWith("THROW="));
  if (!line) return { threw: null, msg: out.trim().split("\n").slice(-2).join(" ").slice(0, 150) };
  const [head, msg = ""] = line.split("\t");
  return { threw: head === "THROW=yes", msg };
}

function guardDrill() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "w01-guard-drill-"));
  try {
    for (const dir of ["lib", "tests"]) fs.cpSync(path.join(repo, dir), path.join(tmp, dir), { recursive: true });
    for (const f of ["package.json", "tsconfig.json"]) fs.copyFileSync(path.join(repo, f), path.join(tmp, f));
    fs.symlinkSync(path.join(repo, "node_modules"), path.join(tmp, "node_modules"));
    fs.writeFileSync(path.join(tmp, "drill-probe.mjs"), GUARD_PROBE);

    const pristine = new Map();
    for (const c of GUARD_COUNTEREXAMPLES) {
      if (!pristine.has(c.file)) pristine.set(c.file, fs.readFileSync(path.join(tmp, c.file), "utf8"));
    }

    console.log(`守卫反例演练（临时副本 ${tmp}，产品代码一个字节都没动）\n`);

    // 先证明副本本身是干净的：不打补丁时守卫必须放行。否则「八条全抛」说明不了任何事。
    const base = readVerdict(runGuardProbe(tmp));
    console.log(`基线[不打补丁]                                  THROW=${base.threw ? "yes" : "no"}  ${base.msg}`);
    if (base.threw !== false) {
      console.log("\n红 —— 干净副本上守卫就抛错了，这轮演练的读数不算数。");
      return 1;
    }

    let caught = 0;
    for (const c of GUARD_COUNTEREXAMPLES) {
      for (const [file, text] of pristine) fs.writeFileSync(path.join(tmp, file), text);
      const before = pristine.get(c.file);
      const after = before.replace(c.from, c.to);
      const hits = (before.match(c.from) ?? []).length;
      if (after === before || hits < c.least) {
        console.log(`反例[${pad(c.id, 40)}] 补丁没打上（命中 ${hits} 处，要 ≥${c.least}）—— 这条不算数`);
        continue;
      }
      fs.writeFileSync(path.join(tmp, c.file), after);
      const v = readVerdict(runGuardProbe(tmp));
      console.log(
        `反例[${pad(c.id, 40)}] 改 ${pad(c.file.replace("lib/", ""), 30)}${hits} 处  ` +
        `THROW=${v.threw === null ? "error" : v.threw ? "yes" : "no"}  ${v.msg}`,
      );
      if (v.threw === true) caught += 1;
    }

    const total = GUARD_COUNTEREXAMPLES.length;
    console.log(`\nGUARD-CATCHES=${caught}/${total}`);
    if (caught !== total) {
      console.log(`红 —— ${total - caught} 条回退能静默照产。`);
      return 1;
    }
    console.log(`绿 —— ${total} 条回退全部当场抛错，守卫拦得住。`);
    return 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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

// ————————————————————————————————————————————————————————————
// URL 归一化反例演练：safeUrl 的判据自己回退了，判据拦得住吗
// ————————————————————————————————————————————————————————————

/**
 * 七条反例，每条都是一次**真实可能发生的回退** —— 有人觉得归一化那两行啰嗦、
 * 有人把 `.trim()` 改回来、有人把首段那条编码入口检查放宽成「只判字面冒号」。
 * 裁定 A-29 命中的那两条（`/<tab>/host`、`<NUL>//host`）就是第 1、2 条的产物。
 *
 * 演练不动产品代码：读 `template-website-source.ts` 的**文本**打补丁，
 * 再从补丁后的文本里抠出 safeUrl 在 Node 里评估（`RUNTIME_JS` 是字面 JS，抠得出来）。
 */
const URL_COUNTEREXAMPLES = [
  {
    id: "不抽串内 tab/CR/LF",
    from: `.replace(/[\\t\\r\\n]/g, "")`,
    to: "",
  },
  {
    id: "剥首尾 C0 换回 .trim()",
    from: `.replace(/^[\\u0000-\\u0020]+|[\\u0000-\\u0020]+$/g, "")`,
    to: ".trim()",
  },
  {
    id: "整个归一化退回旧口径（只 trim）",
    from: `str(v).replace(/[\\t\\r\\n]/g, "").replace(/^[\\u0000-\\u0020]+|[\\u0000-\\u0020]+$/g, "")`,
    to: "str(v).trim()",
  },
  {
    id: "协议相对 //host 不判了",
    from: `if (s.slice(0, 2) === "//") return "#";`,
    to: "",
  },
  {
    id: "反斜杠不判了",
    from: `if (s.indexOf("\\\\") >= 0) return "#";`,
    to: "",
  },
  {
    id: "首段只判字面冒号（放过 %3a / &#58;）",
    from: "/[:%&]/.test(",
    to: "/[:]/.test(",
  },
  {
    id: "首段不做 NFKC 折叠（放过全角冒号）",
    from: `.normalize("NFKC")`,
    to: "",
  },
];

function safeUrlFromText(text) {
  return new Function(`${extractFn(text, "str")}\n${extractFn(text, "safeUrl")}\nreturn safeUrl;`)();
}

function urlDrill() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const file = path.join(repo, "lib", "template-website-source.ts");
  const pristine = fs.readFileSync(file, "utf8");

  console.log(`URL 归一化反例演练（只读 ${path.relative(repo, file)} 的文本打补丁，产品代码一个字节都没动）\n`);

  // 先证明干净文本是绿的：不打补丁时一条都不许逃。否则「七条全红」说明不了任何事。
  const base = judgeSafeUrl(safeUrlFromText(pristine));
  console.log(
    `基线[不打补丁]  正例 ${URL_PASS.length} / 反例 ${URL_BLOCK.length} / ` +
    `控制字符变体 ${base.sweepTotal} 条 ⇒ LEAKS=${base.failures.length}`,
  );
  if (base.failures.length) {
    console.log("\n红 —— 当前实现自己就有逃逸，这轮演练的读数不算数：");
    for (const f of base.failures) console.log(`  ✗ ${f}`);
    return 1;
  }

  let caught = 0;
  for (const c of URL_COUNTEREXAMPLES) {
    const hits = pristine.split(c.from).length - 1;
    if (hits < 1) {
      console.log(`反例[${pad(c.id, 34)}] 补丁没打上（命中 0 处）—— 这条不算数`);
      continue;
    }
    const patched = pristine.split(c.from).join(c.to);
    let v;
    try {
      v = judgeSafeUrl(safeUrlFromText(patched));
    } catch (e) {
      console.log(`反例[${pad(c.id, 34)}] 补丁后抠不出 safeUrl：${String(e && e.message).slice(0, 80)}`);
      continue;
    }
    const first = v.failures[0] ?? "";
    console.log(
      `反例[${pad(c.id, 34)}] ${hits} 处  LEAKS=${pad(String(v.failures.length), 4)}${first.slice(0, 96)}`,
    );
    if (v.failures.length) caught += 1;
  }

  const total = URL_COUNTEREXAMPLES.length;
  console.log(`\nURL-DRILL-CATCHES=${caught}/${total}`);
  if (caught !== total) {
    console.log(`红 —— ${total - caught} 条回退判据看不见，说明判据在拿列举当口径。`);
    return 1;
  }
  console.log(`绿 —— ${total} 条回退全部当场红，归一化口径不是摆设。`);
  return 0;
}

function main() {
  assertEmitterComplete();

  const meta = sampleMeta();
  const samples = SKINS.map((skin) => ({ skinKey: skin.key, ...emitFor(meta, skin.key) }));
  const rows = SKINS.map((skin, i) => {
    const sample = samples[i];
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

  const styleRows = checkStyleOwnership(samples, failures);
  console.log("\n样式字节归属（随装 vs 共享；字节数 + 内容哈希）：");
  console.log(`  ${pad("装", 12)}${pad("index.html", 22)}${pad("assets/skin.css", 22)}${pad("assets/styles.css", 22)}assets/app.js`);
  for (const r of styleRows) {
    const cells = [...r.perSkin, ...r.shared].map((c) => pad(`${c.bytes}B/${c.hash.slice(0, 6)}`, 22));
    console.log(`  ${pad(r.skinKey, 12)}${cells.slice(0, 3).join("")}${cells[3]}`);
  }
  const distinctOf = (pick) => new Set(styleRows.map(pick)).size;
  console.log(
    `  ⇒ 随装：index.html ${distinctOf((r) => r.perSkin[0].hash)}/10 份不同字节，` +
    `assets/skin.css ${distinctOf((r) => r.perSkin[1].hash)}/10 份不同字节；` +
    `共享（设计如此，500 模板一份）：styles.css ${distinctOf((r) => r.shared[0].hash)} 份，` +
    `app.js ${distinctOf((r) => r.shared[1].hash)} 份。`,
  );

  const urlRead = checkUrls(samples[0], failures);
  console.log(
    `\nURL 白名单：产物 ${urlRead.urls} 条 URL（其中图片 ${urlRead.imageUrls} 条），` +
    `被打成 "#" 的 ${urlRead.dropped} 条；正例 ${URL_PASS.length} 条 / 反例 ${URL_BLOCK.length} 条；` +
    `控制字符全扫 ${urlRead.sweepTotal} 条变体，逃逸 ${urlRead.sweepLeaks} 条。`,
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

if (process.argv.includes("--guard-drill")) process.exitCode = guardDrill();
else if (process.argv.includes("--url-drill")) process.exitCode = urlDrill();
else main();
