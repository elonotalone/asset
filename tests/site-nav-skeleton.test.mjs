// 左栏骨架的判据测试 —— 守操作员那一条唯一判准：
//
//   左栏严格「一个名称 = 一个素材类型」。网站是一类，海报是另一类。
//
// 所以左栏不许再出现「专区 / 总览 / 精选」这种按**数据来源**分的伪类型。
// 六个旧入口（素材总览 / 开源专区 / 成套素材 / 模板专区 / 风格元素 / 设计模板）
// 一个都不许回来 —— 尤其不许把后三个合并成一个入口（操作员已明确否决）。
//
// 跑法（asset 仓根）：
//   node --import ./tests/register-tsx.mjs --test tests/site-nav-skeleton.test.mjs
//
// 为什么读源码而不是渲染：lib/assets.ts 是 "use client" 且经由 @oceanleo/ui 的
// 目录导入，node 里 import 不动（实测 ERR_UNSUPPORTED_DIR_IMPORT）。左栏是写死的
// 常量表，源码级断言足以守住它。

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { DESIGN_TYPE_LABELS, DESIGN_TYPE_ORDER } from "../lib/design-taxonomy.ts";
import {
  LIVE_SEARCH_TYPES,
  SERIES_ZONE,
  TYPE_ZONES,
  ZONE_LABELS,
  ZONE_ORIGIN,
  defaultZone,
  fallbackTypeFor,
  hasSeriesFilter,
  normSeriesFlag,
  parseZone,
  seriesZoneOf,
  typeLandingHref,
  typePageHref,
  zoneIsUsable,
  zoneOrigin,
} from "../lib/type-page-views.ts";

const SHELL = readFileSync(new URL("../components/SiteShell.tsx", import.meta.url), "utf8");
const ASSETS = readFileSync(new URL("../lib/assets.ts", import.meta.url), "utf8");
const CHROME = readFileSync(new URL("../components/TypePageChrome.tsx", import.meta.url), "utf8");
const LIBRARY = readFileSync(new URL("../components/AssetLibrary.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const OPEN_ROUTE = readFileSync(new URL("../app/open/page.tsx", import.meta.url), "utf8");
const SERIES_ROUTE = readFileSync(new URL("../app/series/page.tsx", import.meta.url), "utf8");

/**
 * 左栏真正渲染出来的名称。三个 ShellNavItem 数组（libraryTypes / designTypes /
 * codeTypes）都在 navGroups 之前拼好，所以从第一个数组起扫到底。
 */
function navLabels(src) {
  const start = src.indexOf("const libraryTypes");
  assert.ok(start > 0, "找不到 libraryTypes");
  return [...src.slice(start).matchAll(/label:\s*tt\("([^"]+)"\)/g)].map((m) => m[1]);
}

/** 从源码里数出一个常量数组有几项（assets.ts 在 node 里 import 不动）。 */
function arrayLength(src, name) {
  const m = new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(src);
  assert.ok(m, `找不到 ${name}`);
  return m[1].split(",").filter((s) => s.trim()).length;
}

const RETIRED = ["素材总览", "开源专区", "成套素材", "模板专区", "风格元素", "设计模板"];

test("六个旧入口一个都没回来", () => {
  const labels = navLabels(SHELL);
  for (const gone of RETIRED) {
    assert.ok(!labels.includes(gone), `「${gone}」又出现在左栏了`);
  }
});

test("左栏没有任何按数据来源分的伪类型（专区 / 总览 / 精选）", () => {
  for (const label of navLabels(SHELL)) {
    assert.doesNotMatch(label, /专区|总览|精选/, `「${label}」不是一个素材类型`);
  }
});

test("类型轴共 22 格 = 库内 10 + 平面设计 10 + 代码常量 2", () => {
  const libraryTypes = arrayLength(ASSETS, "TYPE_ORDER");
  assert.equal(libraryTypes, 10);
  assert.equal(DESIGN_TYPE_ORDER.length, 10);

  // 「网站」「网页动效」是写死在 SiteShell 里的两格（上游是代码常量不是 DB 表）。
  const codeTypes = navLabels(SHELL).filter((l) => l === "网站" || l === "网页动效");
  assert.deepEqual(codeTypes, ["网站", "网页动效"]);

  assert.equal(libraryTypes + DESIGN_TYPE_ORDER.length + codeTypes.length, 22);
});

test("十个平面设计类型各自出格，且走 /design/<类型> 而不是旧的 /design", () => {
  assert.match(SHELL, /href:\s*`\/design\/\$\{t\}`/, "设计类型没有按类型出路由");
  assert.ok(!/href:\s*"\/design"/.test(SHELL), "旧的 /design 单一入口还在");
  for (const type of DESIGN_TYPE_ORDER) {
    assert.ok(DESIGN_TYPE_LABELS[type], `${type} 没有左栏名称`);
  }
});

test("第二组是两个工具入口，与类型轴分开成组", () => {
  const labels = navLabels(SHELL);
  assert.ok(labels.includes("我的素材库"), "我的素材库不在左栏");
  assert.ok(labels.includes("授权说明"), "授权说明不在左栏");
  // 只有一个分组带 heading，就是类型轴那组；工具组不挂 heading，靠分隔线隔开。
  const headings = [...SHELL.matchAll(/heading:\s*tt\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(headings, ["素材类型"]);
});

// —— 类型页右侧的三分区（W8）————————————————————————————————
//
// 操作员的要求：每一类右侧从两块改成三块 —— OceanLeo 自有 / 开源专区（已入库）/
// 搜索（实时）。守两条纪律：
//   ① 名字要对上内容（旧的「本站素材」装的是已入库的开源件，名实不符）；
//   ② **三格一个都不许藏**，没货画空态 —— 藏掉就让用户分不清没货还是没做。

test("三个分区一个不少，且名字讲的是「来源 × 在不在库里」", () => {
  assert.deepEqual(TYPE_ZONES, ["owned", "stocked", "live"]);
  assert.equal(ZONE_LABELS.owned, "OceanLeo 自有");
  assert.equal(ZONE_LABELS.stocked, "开源专区（已入库）");
  assert.equal(ZONE_LABELS.live, "实时搜索");
  // 名实不符的旧名字不许再出现在任何一格上。
  for (const label of Object.values(ZONE_LABELS)) {
    assert.notEqual(label, "本站素材", "「本站素材」这个名字又回来了");
  }
  assert.ok(!/tt\("本站素材"\)/.test(CHROME), "TypePageChrome 里还写着「本站素材」");
  // ①② 直接对上 platform_assets.origin 的两个值。
  assert.equal(ZONE_ORIGIN.owned, "first-party");
  assert.equal(ZONE_ORIGIN.stocked, "external");
  assert.equal(zoneOrigin("live"), null, "实时搜索不入库，不该有 origin");
});

test("判据是两种，不是一张白名单：①② 与数据无关，③ 看上游能力", () => {
  // ①② 是同一张货架的两个来源切片。今天没货的类型明天可能有（W7 归拢），
  // 所以判据里不许出现「这一类有没有货」。
  for (const t of ["image", "vector", "sticker", "font", "chart", "prompt", "ppt", "video", "audio", "3d"]) {
    assert.ok(zoneIsUsable(t, "owned"), `${t} 的「OceanLeo 自有」不该被判为不可用`);
    assert.ok(zoneIsUsable(t, "stocked"), `${t} 的「开源专区（已入库）」不该被判为不可用`);
  }
  // ③ 是外部上游的能力表：上游不供这一类，点下去永远搜不到东西。
  assert.deepEqual([...LIVE_SEARCH_TYPES].sort(), ["3d", "audio", "image", "vector", "video"]);
  // music 是上游 OPEN_SOURCE_TYPES 的第 6 类，但左栏没格子，进不到类型页。
  assert.ok(!LIVE_SEARCH_TYPES.includes("music"), "music 没有左栏格子");
  assert.match(ASSETS, /OPEN_SOURCE_TYPES/, "上游类型表不在 assets.ts 里了");
  assert.equal(arrayLength(ASSETS, "OPEN_SOURCE_TYPES"), 6);
  for (const t of ["sticker", "font", "chart", "prompt", "ppt"]) {
    assert.ok(!zoneIsUsable(t, "live"), `${t} 没有实时上游，③ 不该可用`);
  }
});

test("三格永远画出来：不可用的那格是点不动，不是不画", () => {
  // 遍历 TYPE_ZONES 渲染 = 三格恒画；不可用时走 aria-disabled 分支而不是返回 null。
  assert.match(CHROME, /TYPE_ZONES\.map\(/, "页签不是遍历三个分区画出来的");
  assert.match(CHROME, /aria-disabled/, "不可用的分区没有画成点不动，可能是被藏了");
  assert.match(CHROME, /ZONE_LIVE_UNAVAILABLE_NOTE/, "没有写明这一格为什么不可用");
  assert.ok(
    !/tabs\.length === 1/.test(CHROME),
    "还留着「只有一格就整排不画」的旧逻辑",
  );
});

test("没货的分区画空态，且空态要说清是「没货」不是「没做」", () => {
  assert.match(LIBRARY, /ZoneEmptyState/, "分区没有空态组件");
  assert.match(LIBRARY, /这一格不是没做/, "空态没有把「没货」和「没做」分开说");
});

test("成套不是第四个分区，是所属来源分区里的一个筛选", () => {
  // 成套讲的是形态（单件还是整套），三分区讲的是来源，两者不是同一条轴。
  assert.deepEqual(SERIES_ZONE, { ppt: "owned", image: "owned", vector: "stocked" });
  assert.equal(seriesZoneOf("ppt"), "owned", "PPT 的 243 套是自有件，该落 ①");
  assert.equal(seriesZoneOf("vector"), "stocked", "矢量图的 20 套是已入库开源件，该落 ②");
  assert.equal(seriesZoneOf("audio"), null, "音频没有成套数据");
  assert.ok(hasSeriesFilter("ppt", "owned"));
  assert.ok(!hasSeriesFilter("ppt", "stocked"), "成套筛选不该出现在没有它的那一区");
  assert.ok(!TYPE_ZONES.includes("series"), "成套又变回一个分区了");
});

test("类型页地址：分区永远写进 view=，左栏落地地址才不写", () => {
  assert.equal(typePageHref("image", "owned"), "/?view=owned");
  assert.equal(typePageHref("ppt", "owned"), "/?type=ppt&view=owned");
  assert.equal(typePageHref("vector", "stocked"), "/?type=vector&view=stocked");
  assert.equal(typePageHref("image", "live"), "/?view=live");
  // 左栏点进来不指定分区，落地时按真实件数决定落哪一区。
  assert.equal(typeLandingHref("image"), "/");
  assert.equal(typeLandingHref("ppt"), "/?type=ppt");
  // ?cat= 只属于库内分区，切到实时搜索就不该带过去。
  assert.equal(
    typePageHref("vector", "stocked", { cat: "icon" }),
    "/?type=vector&view=stocked&cat=icon",
  );
  assert.equal(typePageHref("vector", "live", { cat: "icon" }), "/?type=vector&view=live");
  // 成套只在它所属的那一区能挂上。
  assert.equal(typePageHref("ppt", "owned", { series: true }), "/?type=ppt&view=owned&series=1");
  assert.equal(typePageHref("ppt", "stocked", { series: true }), "/?type=ppt&view=stocked");
});

test("老地址键还认：library / open / series 都有落点", () => {
  assert.equal(parseZone("library", "image"), null, "未知键交给 defaultZone 决定");
  assert.equal(parseZone("owned", "image"), "owned");
  assert.equal(parseZone("stocked", "vector"), "stocked");
  // 旧的「开源搜索」= 现搜全网，落 ③；这一类没上游就退回 ①。
  assert.equal(parseZone("open", "image"), "live");
  assert.equal(parseZone("open", "font"), "owned");
  // 旧的「成套」落到该类型成套所属的那一区。
  assert.equal(parseZone("series", "ppt"), "owned");
  assert.equal(parseZone("series", "vector"), "stocked");
  assert.equal(parseZone(null, "image"), null, "没写 view 要交给 defaultZone");
  // 落进新分区之后成套筛选要跟着打开。
  assert.ok(normSeriesFlag("series", null, "ppt", "owned"));
  assert.ok(normSeriesFlag(null, "1", "vector", "stocked"));
  assert.ok(!normSeriesFlag("series", null, "audio", "owned"), "音频没有成套，不该打开");
});

test("落地不落在空区上，但空区的页签仍然在", () => {
  // 「矢量图」0 件自有、40,607 件已入库开源 → 落地落 ②，而 ① 那格照画着 0。
  assert.equal(defaultZone("vector", { owned: 0, stocked: 40607 }), "stocked");
  assert.equal(defaultZone("ppt", { owned: 243, stocked: 0 }), "owned");
  assert.equal(defaultZone("image", { owned: 170, stocked: 3 }), "owned");
  // 两区都空、但有实时上游 → 落 ③（video 今天就是这样：库里 0 件）。
  assert.equal(defaultZone("video", { owned: 0, stocked: 0 }), "live");
  // 两区都空且没有上游 → 停在 ①，让空态把话说清楚。
  assert.equal(defaultZone("font", { owned: 0, stocked: 0 }), "owned");
  // 三格恒画与落地选区是两回事：落地挑了 stocked，不代表 owned 被判为不可用。
  assert.ok(zoneIsUsable("vector", "owned"));
});

test("旧的 /open 与 /series 只剩重定向，不再是独立入口", () => {
  for (const [name, src] of [
    ["/open", OPEN_ROUTE],
    ["/series", SERIES_ROUTE],
  ]) {
    assert.match(src, /redirect\(/, `${name} 还不是重定向`);
    assert.ok(!/SiteShell/.test(src), `${name} 还在自己渲染一个整页`);
  }
  // 老链接带过来的 ?type= 要保住；落不住才退到该入口里样本最多的那一类。
  assert.equal(fallbackTypeFor("open", "audio"), "audio");
  assert.equal(fallbackTypeFor("open", "font"), "image");
  assert.equal(fallbackTypeFor("open", undefined), "image");
  assert.equal(fallbackTypeFor("series", "vector"), "vector");
  assert.equal(fallbackTypeFor("series", "audio"), "ppt");
});

test("按来源取数：服务端筛选已开，但逐件硬过滤仍然必须在", () => {
  // W7 的 origin 参数已落地（本机新码实测 image 173 = 170 + 3），所以开关是 true。
  assert.match(
    ASSETS,
    /export const ORIGIN_FILTER_IS_SERVER_SIDE = true/,
    "服务端 origin 筛选已就绪，这个开关该是 true",
  );
  assert.match(
    ASSETS,
    /libParams\.origin = params\.origin/,
    "开关打开后没有真的把 origin 传给网关",
  );
  // 兜底：无论服务端支不支持，返回前都按 origin 逐件过滤。
  assert.match(
    ASSETS,
    /raw\.filter\(\(a\) => a\.origin === params\.origin\)/,
    "少了逐件硬过滤，分区可能混进另一种来源的件",
  );
  // 目录归属是读服务端的 origin，不是前端猜的。
  assert.match(ASSETS, /r\.items\.map\(\(a\) => a\.origin\)/, "目录归属不是从服务端读的");
  // 混了两种来源的目录不分给任何一区。
  assert.match(ASSETS, /mixedCategories/, "没有处理「一个目录混两种来源」的情况");
});

test("分区件数取自服务端报的 total，不是前端数出来的", () => {
  // 首选：服务端按 origin 直接报的准数（一区一发查询）。
  assert.match(ASSETS, /async function fetchTotalsByOrigin/, "没有直接问服务端要分区件数");
  assert.match(ASSETS, /totalByOrigin: serverTotals \?\? summed/, "件数没有优先用服务端的准数");
  // 兜底：服务端筛不了时，仍然按服务端每个目录报的 total 累加，不是前端数行数。
  assert.match(ASSETS, /summed\[c\.origin\] \+= c\.total/, "兜底件数不是按服务端 total 累加的");
  assert.match(ASSETS, /export function zoneTotal/, "没有对外给出分区件数");
  assert.match(CHROME, /zoneTotal\(index, "first-party"\)/, "页签上的件数不是从索引来的");
});

test("件数是准数时不再打「≥」，偏小时必须打", () => {
  // incomplete 的意思是「件数可能偏小」。服务端报准数时，采样掉一个目录只少一块
  // 目录砖、件数仍然是准的，所以那种情况不该再吓唬用户说「至少」。
  assert.match(
    ASSETS,
    /incomplete: dropped > 0 && serverTotals === null/,
    "服务端报了准数还在说件数偏小",
  );
  assert.match(CHROME, /counts\?\.incomplete \? "≥" : ""/, "页签没有在件数偏小时标出来");
});

test("开关是包在 AssetLibrary 外面的一层壳，没有改 AssetLibrary", () => {
  assert.match(HOME, /<TypePageChrome>[\s\S]*<AssetLibrary \/>[\s\S]*<\/TypePageChrome>/);
  // 壳自己不碰素材库：既不 import 它也不渲染它，只把 children 原样透传，
  // 切到开源 / 成套时才改渲染另外两个组件。（注释里提到它不算引用。）
  assert.ok(!/^import .*AssetLibrary/m.test(CHROME), "TypePageChrome 不该 import AssetLibrary");
  assert.ok(!/<AssetLibrary/.test(CHROME), "TypePageChrome 不该自己渲染 AssetLibrary");
  assert.match(CHROME, /\{children\}/, "壳没有把 children 透传出去");
  assert.match(CHROME, /lockType=\{type\}/, "内嵌时没有把类型锁给下层");
});
