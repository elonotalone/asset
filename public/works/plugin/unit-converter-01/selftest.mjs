/*
 * 换算器 · 自测
 *
 *   node public/works/plugin/unit-converter-01/selftest.mjs
 *
 * 两层，缺一层这份自测就没有意义：
 *
 *   第一层 —— 跑内核**自带**的用例表（页面上那枚「自测」按钮跑的是同一张表）。
 *   第二层 —— 本文件**另外抄一遍规格原文里的定义值**，直接对内核发问。
 *              第一层可以靠改期望值刷绿，第二层不能：它的期望值不在被测物里。
 *              规格：docs/specs/oceanleo-plugins-v1/plugins/unit-converter.md §已查证的知识
 *
 * 加载的是货架上那份 engine.js 本体（asset 仓无 package.json "type"，.js 即 CommonJS），
 * 不是副本，所以「自测过了」等于「用户点开的那个东西算对了」。
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const engine = require(path.join(here, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err && err.message ? err.message : String(err)));
  }
}

/* ---------- 第一层：内核自带用例表 ---------- */
console.log("换算器自测 · 第一层：内核自带用例表（页面「自测」按钮跑的同一张）");
const report = engine.runSelfTest();
for (const f of report.failures) console.log("  FAIL " + f.name + "\n       " + f.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

/* ---------- 第二层：期望值另抄自规格，不取自被测物 ---------- */
console.log("\n换算器自测 · 第二层：期望值另抄自规格原文");

const conv = (cat, from, v, to) => {
  const r = engine.convert(cat, from, v, to);
  assert.ok(r, `换算返回 null：${cat} ${from}→${to}`);
  return r;
};

check("1 in = 25.4 mm，逐位相等", () => {
  assert.equal(conv("length", "in", 1, "mm").value, 25.4);
});
check("1 lb = 0.453 592 37 kg，逐位相等", () => {
  assert.equal(conv("mass", "lb", 1, "kg").value, 0.45359237);
});
check("1 nmi = 1 852 m，逐位相等", () => {
  assert.equal(conv("length", "nmi", 1, "m").value, 1852);
});
check("1 atm = 101 325 Pa，逐位相等", () => {
  assert.equal(conv("pressure", "atm", 1, "Pa").value, 101325);
});
check("温度对照点 100 °C = 373.15 K = 212 °F", () => {
  assert.ok(Math.abs(conv("temperature", "C", 100, "K").value - 373.15) < 1e-9);
  assert.ok(Math.abs(conv("temperature", "C", 100, "F").value - 212) < 1e-9);
});
check("−40 °C = −40 °F", () => {
  assert.ok(Math.abs(conv("temperature", "C", -40, "F").value + 40) < 1e-9);
});
check("1 KiB = 1024 B 与 1 kB = 1000 B 是两个进制，不能混", () => {
  assert.equal(conv("data", "KiB", 1, "B").value, 1024);
  assert.equal(conv("data", "kB", 1, "B").value, 1000);
  assert.notEqual(conv("data", "KiB", 1, "B").value, conv("data", "kB", 1, "B").value);
});
check("血糖 mg/dL → mmol/L 用 ÷18.0，且**必须标成非定义值**", () => {
  const r = conv("glucose", "mgdL", 100, "mmolL");
  assert.ok(Math.abs(r.value - 100 / 18.0) < 1e-12);
  assert.equal(r.exact, false, "依赖被测物质的因子不许标成精确");
});
check("长度定义值换算必须标成精确", () => {
  assert.equal(conv("length", "in", 1, "mm").exact, true);
});

/* 仿射式的反向路径：规格写明反向是 (base − offset) / factor，往返必须回到原值。 */
check("仿射单位往返不漂移（°F → K → °F）", () => {
  const k = conv("temperature", "F", 98.6, "K").value;
  const back = engine.convert("temperature", "K", k, "F").value;
  assert.ok(Math.abs(back - 98.6) < 1e-9, `往返得到 ${back}`);
});

/* 规格要求「第一屏展示一组可直接修改的出厂换算，而不是空框」。 */
check("首屏出厂读数存在且能算出整列结果", () => {
  const d = engine.DEFAULT;
  const rows = engine.convertAll(d.cat, d.from, d.value);
  assert.ok(rows.length >= 5, `首屏只有 ${rows.length} 行`);
  const cm = rows.find((r) => r.unitId === "cm");
  assert.ok(cm && Math.abs(cm.value - 100) < 1e-12, "1 m 应显示 100 cm");
});

/* 规格要求结果旁边有因子与基准单位，不能只给一个数。 */
check("每行都带因子、基准单位与精确标记", () => {
  const rows = engine.convertAll("length", "m", 1);
  for (const r of rows) {
    assert.equal(typeof r.factor, "number", `${r.unitId} 缺因子`);
    assert.ok(r.baseUnit, `${r.unitId} 缺基准单位`);
    assert.equal(typeof r.exact, "boolean", `${r.unitId} 缺精确标记`);
  }
});

check("坏输入不抛异常，返回 null", () => {
  assert.equal(engine.convert("length", "m", Number.NaN, "cm"), null);
  assert.equal(engine.convert("nope", "m", 1, "cm"), null);
  assert.equal(engine.convert("length", "m", 1, "nope"), null);
});

check("数值格式化不吞掉负号与小数", () => {
  assert.equal(engine.format(-273.15), "-273.15");
  assert.equal(engine.format(0), "0");
  assert.equal(engine.format(1000), "1 000");
});

console.log(
  "\n换算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过")
);
process.exit(failed === 0 ? 0 : 1);
