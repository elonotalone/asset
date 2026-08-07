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

const SHELL = readFileSync(new URL("../components/SiteShell.tsx", import.meta.url), "utf8");
const ASSETS = readFileSync(new URL("../lib/assets.ts", import.meta.url), "utf8");

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
