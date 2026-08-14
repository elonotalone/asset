/* 台账 · 计算自测：直接加载与页面相同的 engine.js。 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/ledger-register-01");
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
const near = (a, b, tolerance = 0.005) => Math.abs(a - b) <= tolerance;

console.log("台账自测 · 第一层：内核自带用例表");
const report = E.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (!report.failures.length) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n台账自测 · 第二层：规格口径独立复核");

check("通用流水：借方 / 贷方 / 连续余额逐行自洽", () => {
  const entries = [
    { date: "2026-08-12", item: "期初注资", debit: 5000, credit: 0 },
    { date: "2026-08-13", item: "设备押金", debit: 0, credit: 1250.5 },
    { date: "2026-08-14", item: "客户回款", debit: 860.335, credit: 0 },
  ];
  const result = E.ledger(entries);
  assert.deepEqual(result.rows.map((row) => row.balance), [5000, 3749.5, 4609.84]);
  assert.equal(result.debitTotal, 5860.34);
  assert.equal(result.creditTotal, 1250.5);
  assert.equal(result.reportedClosing, E.round2(5000 - 1250.5 + 860.335));
});

check("200 行随机金额：逐行取分，尾差在总额处显式对账", () => {
  let seed = 246813579;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const entries = [];
  let manualRoundedBalance = 0;
  let rawClosing = 0;
  for (let i = 0; i < 200; i++) {
    const debit = Math.floor(random() * 900000) / 1000;
    const credit = Math.floor(random() * 700000) / 1000;
    entries.push({ date: "2026-08-14", item: "批次 " + (i + 1), debit, credit });
    manualRoundedBalance = E.round2(manualRoundedBalance + E.round2(debit) - E.round2(credit));
    rawClosing += debit - credit;
  }
  const result = E.ledger(entries);
  assert.equal(result.rows.length, 200);
  assert.equal(result.roundedClosing, manualRoundedBalance, "逐行余额与独立重算不一致");
  assert.equal(result.reportedClosing, E.round2(rawClosing), "总额对账后没有回到未逐笔舍入净额");
  assert.equal(result.roundingAdjustment, E.round2(E.round2(rawClosing) - manualRoundedBalance));
  assert.ok(Math.abs(result.roundingAdjustment) <= 2.000001, `调整 ${result.roundingAdjustment} 超过 400 个金额各 0.005 的上界`);
  assert.notEqual(result.roundingAdjustment, 0, "固定序列应真实暴露一个非零尾差");
});

check("账龄边界严格落入 0–30 / 31–60 / 61–90 / 91–180 / 181–365 / >365", () => {
  const days = [0, 30, 31, 60, 61, 90, 91, 180, 181, 365, 366];
  const expected = ["0–30", "0–30", "31–60", "31–60", "61–90", "61–90", "91–180", "91–180", "181–365", "181–365", ">365"];
  assert.deepEqual(days.map(E.agingBucket), expected);
});

check("应收账龄六档之和严格回到未收合计", () => {
  const asOf = Date.UTC(2026, 7, 14);
  const isoBefore = (days) => new Date(asOf - days * 86400000).toISOString().slice(0, 10);
  const days = [0, 31, 61, 91, 181, 366];
  const entries = days.map((age, index) => ({
    date: "2025-01-01",
    item: "应收 " + (index + 1),
    dueDate: isoBefore(age),
    amount: 1000 + index * 100,
    received: index * 75,
  }));
  const result = E.ageReceivables(entries, "2026-08-14");
  const independent = E.AGE_BUCKETS.reduce((sum, bucket) => E.round2(sum + result.buckets[bucket]), 0);
  assert.equal(independent, result.outstandingTotal);
  assert.equal(result.bucketTotal, result.outstandingTotal);
  assert.equal(result.ties, true);
  assert.deepEqual(result.rows.map((row) => row.bucket), E.AGE_BUCKETS);
});

check("应收部分收款按金额减已收，超额收款不会制造负未收", () => {
  const result = E.ageReceivables([
    { date: "2026-01-01", item: "分期回款", dueDate: "2026-07-31", amount: 1800, received: 625.25 },
    { date: "2026-01-02", item: "已结清", dueDate: "2025-01-01", amount: 500, received: 550 },
  ], "2026-08-14");
  assert.equal(result.rows[0].outstanding, 1174.75);
  assert.equal(result.rows[1].outstanding, 0);
  assert.equal(result.outstandingTotal, 1174.75);
});

check("库存：期末 = 期初 + 入库 − 出库", () => {
  const result = E.inventory([
    { date: "2026-08-14", item: "成品 A", opening: 120, inbound: 45, outbound: 18 },
    { date: "2026-08-14", item: "耗材 B", opening: 12.25, inbound: 3.125, outbound: 1.015 },
  ]);
  assert.equal(result.rows[0].ending, 147);
  assert.equal(result.rows[1].ending, 14.36);
  assert.equal(result.endingTotal, 161.36);
});

check("直线折旧：(原值 − 残值) / 年限，完整 5 年回到残值", () => {
  const result = E.depreciationSchedule(100000, 10000, 5, "straight-line");
  assert.deepEqual(result.rows.map((row) => row.depreciation), [18000, 18000, 18000, 18000, 18000]);
  assert.deepEqual(result.rows.map((row) => row.endingBook), [82000, 64000, 46000, 28000, 10000]);
  assert.equal(result.depreciationTotal, 90000);
  assert.equal(result.finalBook, 10000);
});

check("双倍余额递减：完整年表末期转直线", () => {
  const result = E.depreciationSchedule(100000, 0, 5, "double-declining");
  assert.deepEqual(result.rows.map((row) => row.depreciation), [40000, 24000, 14400, 10800, 10800]);
  assert.deepEqual(result.rows.map((row) => row.basis), ["双倍余额", "双倍余额", "双倍余额", "转直线", "转直线"]);
  assert.equal(result.finalBook, 0);
});

check("双倍余额递减：有残值时每一年净值均不低于残值", () => {
  const result = E.depreciationSchedule(100000, 10000, 5, "double-declining");
  assert.ok(result.rows.every((row) => row.endingBook >= 10000));
  assert.equal(result.finalBook, 10000);
  assert.equal(result.depreciationTotal, 90000);
});

check("年数总和：分母 n(n+1)/2，完整年表回到残值", () => {
  const result = E.depreciationSchedule(100000, 10000, 5, "sum-of-years");
  assert.equal(result.denominator, 15);
  assert.deepEqual(result.rows.map((row) => row.depreciation), [30000, 24000, 18000, 12000, 6000]);
  assert.equal(result.finalBook, 10000);
});

check("整年数按 365 天取整，不满一年是 0", () => {
  assert.equal(E.elapsedYears("2026-08-14", "2026-08-14"), 0);
  assert.equal(E.elapsedYears("2026-08-14", "2027-08-13"), 0, "第 364 天还不算走满一年");
  assert.equal(E.elapsedYears("2026-08-14", "2027-08-14"), 1);
  assert.equal(E.elapsedYears("2024-08-14", "2026-08-14"), 2, "跨过闰年的 731 天仍是 2 年");
  assert.equal(E.elapsedYears("2026-08-14", "2020-01-01"), 0, "基准日早于购入日不出负数");
  assert.equal(E.elapsedYears("2026-02-30", "2026-08-14"), null);
});

check("基准日的净值就是年表上走满那一年的年末净值", () => {
  const asset = { date: "2024-08-14", item: "备份硬盘", cost: 100000, salvage: 10000, life: 5, method: "straight-line" };
  const at = E.bookValueAt(asset, "2026-08-14");
  assert.equal(at.elapsedYears, 2);
  assert.equal(at.bookValue, at.schedule.rows[1].endingBook);
  assert.equal(at.bookValue, E.round2(100000 - 2 * 18000));
  assert.equal(at.accumulated, 36000);
  assert.equal(E.round2(at.bookValue + at.accumulated), 100000);
});

check("不满一年不提折旧；走过年限后封在残值", () => {
  const asset = { date: "2026-03-01", item: "灯架", cost: 8000, salvage: 800, life: 4, method: "sum-of-years" };
  const young = E.bookValueAt(asset, "2026-08-14");
  assert.equal(young.elapsedYears, 0);
  assert.equal(young.bookValue, 8000);
  assert.equal(young.accumulated, 0);
  const done = E.bookValueAt({ ...asset, date: "2015-01-01" }, "2026-08-14");
  assert.equal(done.bookValue, 800);
  assert.equal(done.accumulated, 7200);
});

check("三种方法在同一个基准日各自给出自己的净值", () => {
  const base = { date: "2024-08-14", item: "机身", cost: 100000, salvage: 0, life: 5 };
  const values = ["straight-line", "double-declining", "sum-of-years"].map(
    (method) => E.bookValueAt({ ...base, method }, "2026-08-14").bookValue,
  );
  // 直线 100000−2×20000；双倍余额 100000−40000−24000；
  // 年数总和分母 15，前两年 33 333.33 + 26 666.67 = 60 000。
  assert.deepEqual(values, [60000, 36000, 40000]);
  assert.equal(new Set(values).size, 3, "三种方法给出了同一个净值，口径没有真的分开");
});

check("净值合计是逐项净值之和，累计折旧与原值合计对得上", () => {
  const assets = [
    { date: "2024-08-14", item: "备份硬盘", cost: 100000, salvage: 10000, life: 5, method: "straight-line" },
    { date: "2023-01-01", item: "长焦镜头", cost: 42000, salvage: 2000, life: 8, method: "sum-of-years" },
    { date: "2026-03-01", item: "灯架", cost: 8000, salvage: 800, life: 4, method: "double-declining" },
  ];
  const book = E.depreciationLedger(assets, "2026-08-14");
  const independent = assets.reduce((sum, asset) => E.round2(sum + E.bookValueAt(asset, "2026-08-14").bookValue), 0);
  assert.equal(book.count, 3);
  assert.equal(book.bookValueTotal, independent);
  assert.equal(E.round2(book.bookValueTotal + book.accumulatedTotal), book.costTotal);
  assert.deepEqual(book.rows.map((row) => row.elapsedYears), [2, 3, 0]);
  assert.deepEqual(book.rows.map((row) => row.item), ["备份硬盘", "长焦镜头", "灯架"]);
});

check("坏输入明确拒绝，不返回看似成功的空结果", () => {
  assert.equal(E.ledger([{ date: "坏日期", item: "事项", debit: 1, credit: 0 }]), null);
  assert.equal(E.ledger([{ date: "2026-08-14", item: "事项", debit: -1, credit: 0 }]), null);
  assert.equal(E.ageReceivables([{ date: "2026-01-01", item: "应收", dueDate: "2026-01-31", amount: 1, received: -1 }], "2026-08-14"), null);
  assert.equal(E.inventory([{ date: "2026-08-14", item: "库存", opening: 1, inbound: -1, outbound: 0 }]), null);
  assert.equal(E.depreciationSchedule(1000, 1200, 5, "straight-line"), null);
  assert.equal(E.depreciationSchedule(1000, 0, 0, "straight-line"), null);
  assert.equal(E.depreciationSchedule(1000, 0, 5.5, "straight-line"), null);
  assert.equal(E.depreciationLedger([{ date: "2026-08-14", item: "", cost: 1000, salvage: 0, life: 5, method: "straight-line" }], "2026-08-14"), null);
  assert.equal(E.depreciationLedger([{ date: "坏日期", item: "资产", cost: 1000, salvage: 0, life: 5, method: "straight-line" }], "2026-08-14"), null);
  assert.equal(E.depreciationLedger([{ date: "2026-08-14", item: "资产", cost: 1000, salvage: 0, life: 5, method: "猜一个" }], "2026-08-14"), null);
  assert.equal(E.depreciationLedger([], "坏基准日"), null);
});

check("金额始终格式化为两位小数", () => {
  assert.equal(E.money(0), "0.00");
  assert.equal(E.money(1250.5), "1 250.50");
  assert.equal(E.money(-42.1), "−42.10");
});

console.log("\n台账自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
