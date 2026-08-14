/*
 * 法律计算器 · 自测
 *
 *   node tests/plugin-gallery-runtime/legal-calculator-01/selftest.mjs
 *
 * 期望值全部另抄自规格原文（docs/specs/oceanleo-plugins-v1/plugins/legal-calculator.md §5），
 * 不取自被测物：内核里已经不再自带用例表，所以「改期望值刷绿」这条路在这里不存在。
 *
 * 本轮内核**缩小了承诺**：民间借贷保护上限与违法解除赔偿金 × 2 都已删除
 * （理由见 docs/work-logs/2026-08/plugin-total-rebuild/verdicts/W1-delivery.md）。
 * 下面有专门的断言盯着它们别悄悄回来。
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/legal-calculator-01",
);
const require = createRequire(import.meta.url);
const E = require(path.join(runtimeDir, "engine.js"));

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

console.log("法律计算器自测 · 期望值抄自规格 §5");

/* ---------- 工龄折算 ---------- */

check("工龄折算的四个边界：6 个月、1 年、1 年另 1 天、5 个月另 30 天", () => {
  assert.equal(E.serviceMonths(0, 6, 0), 1);
  assert.equal(E.serviceMonths(1, 0, 0), 1);
  assert.equal(E.serviceMonths(1, 0, 1), 1.5);
  assert.equal(E.serviceMonths(0, 5, 30), 0.5);
  assert.equal(E.serviceMonths(0, 0, 0), 0);
});
check("工龄必须是范围内的非负整数，否则不折", () => {
  assert.equal(E.serviceMonths(1, 12, 0), null);
  assert.equal(E.serviceMonths(1, 0, 31), null);
  assert.equal(E.serviceMonths(1, 0, -1), null);
  assert.equal(E.serviceMonths(1.5, 0, 0), null);
});

/* ---------- 经济补偿：两道门槛 ---------- */

check("月工资 10 000、当地 8 000、1 年另 1 天 → 15 000 元", () => {
  const out = E.laborCompensation(10000, 8000, 1, 0, 1);
  assert.equal(out.amount, 15000);
  assert.equal(out.salaryBase, 10000);
  assert.equal(out.appliedMonths, 1.5);
  assert.equal(out.capTriggered, false);
});
check("月工资 40 000、当地 10 000、20 年 → 基数 30 000、月数 12、360 000 元", () => {
  const out = E.laborCompensation(40000, 10000, 20, 0, 0);
  assert.equal(out.capTriggered, true);
  assert.equal(out.salaryBase, 30000);
  assert.equal(out.appliedMonths, 12);
  assert.equal(out.monthsCapped, true);
  assert.equal(out.rawMonths, 20);
  assert.equal(out.amount, 360000);
});
check("月工资恰为 3 倍（30 000 / 10 000）不触发「严格高于」，20 年 → 600 000 元", () => {
  const out = E.laborCompensation(30000, 10000, 20, 0, 0);
  assert.equal(out.capTriggered, false);
  assert.equal(out.appliedMonths, 20);
  assert.equal(out.amount, 600000);
});
check("触发封顶但工龄不足 12 年时，月数按实际工龄，不被拉到 12", () => {
  const out = E.laborCompensation(40000, 10000, 5, 0, 0);
  assert.equal(out.capTriggered, true);
  assert.equal(out.appliedMonths, 5);
  assert.equal(out.monthsCapped, false);
  assert.equal(out.amount, 150000);
});

/* ---------- 加班工资 ---------- */

check("月工资 21 750、三类各 1 小时 → 小时工资 125，合计 812.50 元", () => {
  const out = E.overtimePay(21750, 1, 1, 1);
  assert.ok(Math.abs(out.hourlyWage - 125) < 1e-12, `小时工资 ${out.hourlyWage}`);
  assert.equal(out.weekday, 187.5);
  assert.equal(out.restDay, 250);
  assert.equal(out.holiday, 375);
  assert.equal(out.total, 812.5);
});
check("三类倍数就是 1.5 / 2 / 3，界面上写的和算的是同一份数据", () => {
  assert.deepEqual(E.OVERTIME_KINDS.map((kind) => kind.multiple), [1.5, 2, 3]);
  assert.deepEqual(E.OVERTIME_KINDS.map((kind) => kind.label), ["工作日延时", "休息日", "法定节假日"]);
});
check("某一类没有加班时只算其余两类", () => {
  const out = E.overtimePay(21750, 2, 0, 0);
  assert.equal(out.weekday, 375);
  assert.equal(out.total, 375);
});

/* ---------- 财产案件受理费：分段累加 ---------- */

check("规格给的每个端点总额都对上", () => {
  const points = [
    [10000, 50], [100000, 2300], [200000, 4300], [500000, 8800], [1000000, 13800],
    [2000000, 22800], [5000000, 46800], [10000000, 81800], [20000000, 141800], [33000000, 206800]
  ];
  for (const [amount, expect] of points) {
    assert.equal(E.propertyCaseFee(amount).total, expect, `${amount} 元应当收 ${expect} 元`);
  }
});
check("不是拿最高档费率乘全部标的额", () => {
  assert.notEqual(E.propertyCaseFee(33000000).total, 33000000 * 0.005);
});
check("分段明细之和回到总额", () => {
  for (const amount of [1, 10000, 10000.01, 200000, 33000000]) {
    const out = E.propertyCaseFee(amount);
    let sum = 0;
    for (const detail of out.details) sum = E.round2(sum + detail.fee);
    assert.equal(sum, out.total, `${amount} 元的明细之和对不上`);
  }
});
check("标尺落点：标的额在哪一段、在这一段里走了多远", () => {
  const first = E.propertyCaseFee(5000);
  assert.equal(first.bandIndex, 0);
  assert.ok(Math.abs(first.bandFraction - 0.5) < 1e-12);
  const middle = E.propertyCaseFee(300000);
  assert.equal(middle.bandIndex, 3);
  assert.equal(middle.band.rateText, "1.5%");
  assert.ok(Math.abs(middle.bandFraction - 1 / 3) < 1e-12);
  const top = E.propertyCaseFee(33000000);
  assert.equal(top.bandIndex, E.PROPERTY_BANDS.length - 1);
  assert.ok(top.bandFraction > 0 && top.bandFraction <= 1);
});
check("标尺的每一段都有能读的上界和费率，不是色块", () => {
  for (const band of E.PROPERTY_BANDS) {
    assert.ok(band.mark && band.mark.length > 0);
    assert.ok(band.rateText && band.rateText.length > 0);
  }
  assert.equal(E.PROPERTY_BANDS[0].rateText, "固定 50 元");
});

/* ---------- 坏输入 ---------- */

check("事实不齐或不合口径时返回 null，不给一个能拿去谈判的数", () => {
  assert.equal(E.laborCompensation(0, 8000, 1, 0, 0), null);
  assert.equal(E.laborCompensation(10000, 0, 1, 0, 0), null);
  assert.equal(E.laborCompensation(10000, 8000, 1, 12, 0), null);
  assert.equal(E.laborCompensation(null, 8000, 1, 0, 0), null);
  assert.equal(E.overtimePay(10000, -1, 0, 0), null);
  assert.equal(E.overtimePay(0, 1, 1, 1), null);
  assert.equal(E.propertyCaseFee(0), null);
  assert.equal(E.propertyCaseFee(Number.NaN), null);
});

/* ---------- 缩小后的承诺不许悄悄长回来 ---------- */

check("民间借贷保护上限已经不在内核里", () => {
  assert.equal(typeof E.lendingRateCap, "undefined");
  const source = require("node:fs").readFileSync(path.join(runtimeDir, "engine.js"), "utf8");
  assert.equal(/LPR/.test(source.replace(/\/\*[\s\S]*?\*\//g, "")), false, "engine 代码里还有 LPR");
});
check("违法解除赔偿金 × 2 已经不再算、也不再返回", () => {
  const out = E.laborCompensation(10000, 8000, 1, 0, 1);
  assert.equal("illegalTerminationAmount" in out, false);
  for (const key of Object.keys(out)) assert.notEqual(out[key], 30000, `${key} 还在给 2 倍的数`);
});
check("内核不带页面自测表：自测的期望值只在这份文件里", () => {
  assert.equal(typeof E.runSelfTest, "undefined");
  assert.equal(typeof E.CASES, "undefined");
});

console.log("\n法律计算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
