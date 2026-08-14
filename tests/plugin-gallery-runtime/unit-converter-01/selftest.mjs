/*
 * 换算器 · 自测
 *
 *   node tests/plugin-gallery-runtime/unit-converter-01/selftest.mjs
 *
 * 期望值全部另抄自规格原文（docs/specs/oceanleo-plugins-v1/plugins/unit-converter.md §5），
 * 不取自被测物：内核里已经不再自带用例表，所以「改期望值刷绿」这条路在这里不存在。
 *
 * 加载的是 active-runtime 闭包里的 engine.js 本体（asset 仓无 package.json "type"，.js 即 CommonJS），
 * 不是副本，所以「自测过了」等于「用户点开的那个东西算对了」。
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/unit-converter-01",
);
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

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

const conv = (from, value, to) => {
  const r = engine.convert(from, value, to);
  assert.ok(r, `换算返回 null：${from}→${to}`);
  return r;
};

console.log("换算器自测 · 期望值抄自规格 §5");

/* ---------- 定义值：必须逐位相等 ---------- */

check("1 in = 25.4 mm", () => {
  assert.equal(conv("in", 1, "mm").value, 25.4);
});
/* 英制之间要过一次米，浮点会掉在末位（11.999 999 999 999 998），显示层的 10 位有效数字把它收回 12。 */
check("1 ft = 12 in，1 yd = 36 in，1 mi = 63 360 in", () => {
  assert.ok(Math.abs(conv("ft", 1, "in").value - 12) < 1e-12);
  assert.ok(Math.abs(conv("yd", 1, "in").value - 36) < 1e-12);
  assert.ok(Math.abs(conv("mi", 1, "in").value - 63360) < 1e-9);
  assert.equal(engine.format(conv("ft", 1, "in").value), "12");
});
check("1 nmi = 1 852 m", () => {
  assert.equal(conv("nmi", 1, "m").value, 1852);
});
check("1 lb = 0.453 592 37 kg，1 lb = 16 常衡盎司", () => {
  assert.equal(conv("lb", 1, "kg").value, 0.45359237);
  assert.ok(Math.abs(conv("lb", 1, "oz").value - 16) < 1e-12);
});
check("1 atm = 101 325 Pa，1 mmHg = 133.322 387 415 Pa", () => {
  assert.equal(conv("atm", 1, "Pa").value, 101325);
  assert.equal(conv("mmHg", 1, "Pa").value, 133.322387415);
});
check("1 psi = 4.448 221 615 260 5 N ÷ 0.0254² = 6 894.757 293 168 361 Pa", () => {
  assert.ok(Math.abs(conv("psi", 1, "Pa").value - 6894.757293168361) < 1e-9);
});
check("1 kWh = 3 600 000 J，1 cal = 4.184 J，1 eV = 1.602 176 634e−19 J", () => {
  assert.equal(conv("kWh", 1, "J").value, 3.6e6);
  assert.equal(conv("cal", 1, "J").value, 4.184);
  assert.equal(conv("eV", 1, "J").value, 1.602176634e-19);
});
check("1 US gal = 3.785 411 784 L，1 美国液量盎司 = 1 US gal ÷ 128", () => {
  assert.equal(conv("galUS", 1, "L").value, 3.785411784);
  assert.ok(Math.abs(conv("flozUS", 1, "L").value - 0.0295735295625) < 1e-18);
});

/* ---------- 仿射换算：温度 ---------- */

check("100 °C = 373.15 K = 212 °F", () => {
  assert.ok(Math.abs(conv("C", 100, "K").value - 373.15) < 1e-9);
  assert.ok(Math.abs(conv("C", 100, "F").value - 212) < 1e-9);
});
check("−40 °C = −40 °F（两标相交那一点）", () => {
  assert.ok(Math.abs(conv("C", -40, "F").value + 40) < 1e-9);
});
check("0 K = −273.15 °C，1 °R = 5/9 K", () => {
  assert.ok(Math.abs(conv("K", 0, "C").value + 273.15) < 1e-9);
  assert.ok(Math.abs(conv("R", 1, "K").value - 5 / 9) < 1e-12);
});
check("仿射单位往返不漂移（°F → K → °F）", () => {
  const k = conv("F", 98.6, "K").value;
  assert.ok(Math.abs(engine.convert("K", k, "F").value - 98.6) < 1e-9);
});

/* ---------- 两种进制不许混 ---------- */

check("1 KiB = 1 024 B、1 kB = 1 000 B、1 KiB = 1.024 kB", () => {
  assert.equal(conv("KiB", 1, "B").value, 1024);
  assert.equal(conv("kB", 1, "B").value, 1000);
  assert.ok(Math.abs(conv("KiB", 1, "kB").value - 1.024) < 1e-12);
});
check("十进制与二进制的名字在界面上就分得开", () => {
  const data = engine.findCategory("data");
  assert.match(engine.findUnit(data, "kB").label, /十进制/);
  assert.match(engine.findUnit(data, "KiB").label, /二进制/);
});

/* ---------- 近似换算必须写出物质名 ---------- */

check("100 mg/dL 葡萄糖 = 5.555 555 555 555 555 mmol/L，且标成非定义值", () => {
  const r = conv("mgdL", 100, "mmolL");
  assert.ok(Math.abs(r.value - 100 / 18.0) < 1e-12);
  assert.equal(r.exact, false, "依赖被测物质的因子不许标成精确");
  assert.equal(r.substance, "葡萄糖");
});
check("桥上那一句：定义值说「精确定义」，血糖说「葡萄糖近似换算」", () => {
  assert.equal(engine.relationOf("in", "mm"), "精确定义");
  assert.equal(engine.relationOf("mgdL", "mmolL"), "葡萄糖近似换算");
  assert.equal(engine.relationOf("mmolL", "mgdL"), "葡萄糖近似换算");
});

/* ---------- 用户认得的名字（规格 §6 第一条与第三条） ---------- */

check("美国液量盎司写全，不含糊成 fl oz；和常衡盎司分得开", () => {
  const volume = engine.findCategory("volume");
  const floz = engine.findUnit(volume, "flozUS");
  assert.equal(floz.label, "美国液量盎司");
  assert.equal(floz.symbol, "US fl oz");
  const mass = engine.findCategory("mass");
  assert.equal(engine.findUnit(mass, "oz").label, "常衡盎司");
});
check("每个单位都有能读的名字和写法，没有编号或图标占位", () => {
  for (const cat of engine.CATEGORIES) {
    for (const unit of cat.units) {
      assert.ok(unit.label && /[\u4e00-\u9fa5]/.test(unit.label), `${unit.id} 缺中文名`);
      assert.ok(unit.symbol && unit.symbol.length > 0, `${unit.id} 缺符号`);
    }
  }
});

/* ---------- 一对数怎么起手、怎么换量纲 ---------- */

check("出厂那一对就是 1 m = 100 cm，不是空框", () => {
  const d = engine.DEFAULT;
  assert.equal(d.from, "m");
  assert.equal(d.to, "cm");
  assert.equal(conv(d.from, d.value, d.to).value, 100);
});
check("单位 id 在全部量纲里唯一，选了单位就等于选了量纲", () => {
  const seen = new Set();
  for (const cat of engine.CATEGORIES) {
    for (const unit of cat.units) {
      assert.equal(seen.has(unit.id), false, `${unit.id} 在两个量纲里重复`);
      seen.add(unit.id);
      assert.equal(engine.categoryOfUnit(unit.id).id, cat.id);
    }
  }
});
check("换到别的量纲时，另一端有一个同量纲的默认搭档，且不与自己重合", () => {
  for (const cat of engine.CATEGORIES) {
    for (const unit of cat.units) {
      const partner = engine.partnerOf(unit.id);
      assert.notEqual(partner, unit.id, `${unit.id} 的搭档是自己`);
      assert.equal(engine.categoryOfUnit(partner).id, cat.id, `${unit.id} 的搭档跨了量纲`);
    }
  }
  assert.equal(engine.partnerOf("flozUS"), "mL", "厨房那一步：选美国液量盎司，另一端该落在毫升");
});

/* ---------- 坏输入与显示 ---------- */

check("坏输入不抛异常，返回 null", () => {
  assert.equal(engine.convert("m", Number.NaN, "cm"), null);
  assert.equal(engine.convert("nope", 1, "cm"), null);
  assert.equal(engine.convert("m", 1, "nope"), null);
  assert.equal(engine.convert("m", 1, "kg"), null, "跨量纲不许换");
});
check("半截输入按「还没给数」处理，不当成 0", () => {
  assert.equal(engine.parse(""), null);
  assert.equal(engine.parse("-"), null);
  assert.equal(engine.parse("1.2.3"), null);
  assert.equal(engine.parse("12"), 12);
  assert.equal(engine.parse("-1.5e3"), -1500);
  assert.equal(engine.parse("1 234.5"), 1234.5);
});
check("显示保留 10 位有效数字、去尾零，极端值走科学计数", () => {
  assert.equal(engine.format(-273.15), "-273.15");
  assert.equal(engine.format(0), "0");
  assert.equal(engine.format(1000), "1 000");
  assert.equal(engine.format(100), "100");
  assert.equal(engine.format(1.602176634e-19), "1.602177e-19");
  assert.equal(engine.format(2e15), "2.000000e+15");
});

console.log("\n换算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
