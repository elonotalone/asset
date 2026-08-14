import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/legal-calculator-01");
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error && error.message ? error.message : String(error)));
  }
}

function near(actual, expected, tolerance = 1e-10) {
  assert.equal(typeof actual, "number", `得到 ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected}，得到 ${actual}`);
}

console.log("法律计算器自测 · 第一层：页面按钮共用的内核用例");
const report = engine.runSelfTest();
for (const failure of report.failures) console.log("  FAIL " + failure.name + "\n       " + failure.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n法律计算器自测 · 第二层：独立复核公开口径与边界");

check("不满六个月、刚好六个月、刚好一年、刚好满一年零一天", () => {
  assert.equal(engine.serviceMonths(0, 0, 1), 0.5);
  assert.equal(engine.serviceMonths(0, 5, 30), 0.5);
  assert.equal(engine.serviceMonths(0, 6, 0), 1);
  assert.equal(engine.serviceMonths(1, 0, 0), 1);
  assert.equal(engine.serviceMonths(1, 0, 1), 1.5);
});

check("经济补偿与违法解除赔偿金二倍", () => {
  const out = engine.laborCompensation(10000, 8000, 1, 0, 1);
  assert.equal(out.amount, 15000);
  assert.equal(out.illegalTerminationAmount, 30000);
  assert.equal(out.rawMonths, 1.5);
});

check("月工资高于当地月均三倍才触发基数和十二年上限", () => {
  const capped = engine.laborCompensation(40000, 10000, 20, 0, 0);
  assert.equal(capped.capTriggered, true);
  assert.equal(capped.salaryBase, 30000);
  assert.equal(capped.appliedMonths, 12);
  assert.equal(capped.amount, 360000);
  const exactlyThree = engine.laborCompensation(30000, 10000, 20, 0, 0);
  assert.equal(exactlyThree.capTriggered, false);
  assert.equal(exactlyThree.appliedMonths, 20);
  assert.equal(exactlyThree.amount, 600000);
});

check("工作日 150%、休息日 200%、法定节假日 300%，月计薪 21.75 天", () => {
  const out = engine.overtimePay(21750, 1, 1, 1);
  near(out.hourlyWage, 125, 1e-12);
  assert.equal(out.weekday, 187.5);
  assert.equal(out.restDay, 250);
  assert.equal(out.holiday, 375);
  assert.equal(out.total, 812.5);
});

check("财产案件受理费每一个分段端点", () => {
  const points = [
    [10000, 50],
    [100000, 2300],
    [200000, 4300],
    [500000, 8800],
    [1000000, 13800],
    [2000000, 22800],
    [5000000, 46800],
    [10000000, 81800],
    [20000000, 141800],
  ];
  for (const [amount, expected] of points) assert.equal(engine.propertyCaseFee(amount).total, expected, `${amount} 元端点`);
});

check("受理费按段累加，任何样本的分段明细之和等于总额", () => {
  for (const amount of [1, 10000, 10000.01, 88888.88, 200000, 33000000]) {
    const out = engine.propertyCaseFee(amount);
    const sum = out.details.reduce((total, detail) => Math.round((total + detail.fee + Number.EPSILON) * 100) / 100, 0);
    assert.equal(sum, out.total, `${amount} 元的明细和`);
    if (amount > 10000) assert.ok(out.details.length > 1, `${amount} 元没有分段`);
  }
});

check("民间借贷历史口径为合同成立时一年期 LPR 四倍", () => {
  assert.equal(engine.lendingRateCap(3.45), 13.8);
});

check("空值、非数、负数、余月越界等坏输入返回 null", () => {
  assert.equal(engine.serviceMonths(1, 12, 0), null);
  assert.equal(engine.serviceMonths(1, 0, 31), null);
  assert.equal(engine.serviceMonths(1.5, 0, 0), null);
  assert.equal(engine.laborCompensation(0, 8000, 1, 0, 0), null);
  assert.equal(engine.overtimePay(10000, -1, 0, 0), null);
  assert.equal(engine.propertyCaseFee(Number.NaN), null);
  assert.equal(engine.lendingRateCap(-1), null);
});

console.log("\n法律计算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
