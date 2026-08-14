/* 三表模型 · 计算自测：直接加载页面使用的 engine.js。 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/three-statement-model-01");
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

console.log("三表模型自测 · 第一层：内核自带用例表");
const report = E.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (!report.failures.length) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n三表模型自测 · 第二层：规格口径独立复核");

const opening = E.model(E.DEFAULT, "opening");
const average = E.model(E.DEFAULT, "average");

check("默认期初与两种口径的每个预测年都严格平衡", () => {
  assert.equal(opening.openingBalance.difference, 0);
  for (const model of [opening, average]) {
    assert.equal(model.years.length, 3);
    for (const year of model.years) {
      assert.equal(year.balance.assets, year.balance.liabilitiesAndEquity, `${model.mode} ${year.label} 不平`);
      assert.equal(year.balance.difference, 0);
    }
  }
});

check("净利润是经营现金流起点，并逐年累加到未分配利润", () => {
  let retained = E.DEFAULT.openingRetainedEarnings;
  for (const year of opening.years) {
    assert.equal(year.cashFlow.netIncome, year.income.netIncome);
    retained = E.round2(retained + year.income.netIncome);
    assert.equal(year.balance.retainedEarnings, retained);
  }
});

check("折旧在现金流中加回，同时减少固定资产净额", () => {
  let ppe = E.DEFAULT.openingPpe;
  for (const year of opening.years) {
    assert.equal(year.cashFlow.depreciationAddBack, year.income.depreciation);
    ppe = E.round2(ppe + year.cashFlow.capex - year.income.depreciation);
    assert.equal(year.balance.ppe, ppe);
  }
});

check("应收与存货增加占用现金，应付增加释放现金", () => {
  const year = opening.years[0];
  assert.ok(year.cashFlow.receivablesChange > 0);
  assert.ok(year.cashFlow.inventoryChange > 0);
  assert.ok(year.cashFlow.payablesChange > 0);
  const independent = E.round2(
    year.income.netIncome + year.income.depreciation -
    year.cashFlow.receivablesChange - year.cashFlow.inventoryChange + year.cashFlow.payablesChange,
  );
  assert.equal(year.cashFlow.operatingCashFlow, independent);
});

check("期末现金 = 期初现金 + 经营 + 投资 + 筹资", () => {
  for (const model of [opening, average]) {
    for (const year of model.years) {
      const expected = E.round2(
        year.cashFlow.openingCash + year.cashFlow.operatingCashFlow +
        year.cashFlow.investingCashFlow + year.cashFlow.financingCashFlow,
      );
      assert.equal(year.cashFlow.endingCash, expected);
      assert.equal(year.cashFlow.cashEquationDifference, 0);
    }
  }
});

check("期初余额断环一步完成，平均余额口径迭代收敛", () => {
  assert.ok(opening.comparison.opening.years.every((year) => year.iterations === 1 && year.converged));
  assert.ok(average.comparison.average.years.every((year) => year.iterations <= 100 && year.converged));
  assert.equal(average.comparison.bothConverged, true);
});

check("平均余额利息与收敛后的期初/期末循环贷均值自洽", () => {
  let openingDebt = E.DEFAULT.openingRevolver;
  for (const year of average.comparison.average.years) {
    const expected = E.round2((openingDebt + year.balance.revolver) / 2 * E.DEFAULT.interestRate);
    assert.ok(Math.abs(year.income.interest - expected) <= 0.01, `${year.label} 利息差超 0.01`);
    assert.ok(Math.abs(year.fixedPointGap) <= 0.01, `${year.label} 不动点未收敛`);
    openingDebt = year.balance.revolver;
  }
});

check("两种断环结果有非零差异且比较字段完整", () => {
  assert.notEqual(average.comparison.interestDifference, 0);
  assert.ok(average.comparison.cashDifference !== 0 || average.comparison.revolverDifference !== 0);
  assert.ok(Number.isFinite(average.comparison.opening.totalInterest));
  assert.ok(Number.isFinite(average.comparison.average.totalInterest));
});

check("把收入增速改为 15% 后仍平衡，三张表至少各一处同步变化", () => {
  const changed = { ...E.DEFAULT, revenueGrowth: 0.15 };
  const after = E.model(changed, "opening");
  assert.ok(after.years.every((year) => year.balance.difference === 0));
  assert.notEqual(after.final.income.revenue, opening.final.income.revenue);
  assert.notEqual(after.final.cashFlow.endingCash, opening.final.cashFlow.endingCash);
  assert.notEqual(after.final.balance.receivables, opening.final.balance.receivables);
});

check("敏感性三档来自真实重算而非标签替换", () => {
  assert.deepEqual(opening.sensitivity.map((row) => row.growth), [0.10, 0.12, 0.14]);
  assert.equal(new Set(opening.sensitivity.map((row) => row.revenue)).size, 3);
  assert.equal(new Set(opening.sensitivity.map((row) => row.netIncome)).size, 3);
});

check("坏输入与未知断环口径明确拒绝", () => {
  assert.equal(E.model({ ...E.DEFAULT, baseRevenue: 0 }, "opening"), null);
  assert.equal(E.model({ ...E.DEFAULT, revenueGrowth: -1 }, "opening"), null);
  assert.equal(E.model({ ...E.DEFAULT, taxRate: 1.2 }, "opening"), null);
  assert.equal(E.model({ ...E.DEFAULT, dso: 366 }, "opening"), null);
  assert.equal(E.model({ ...E.DEFAULT, depreciationYears: 2.5 }, "opening"), null);
  assert.equal(E.model({ ...E.DEFAULT, minimumCash: -1 }, "opening"), null);
  assert.equal(E.model(E.DEFAULT, "猜一个口径"), null);
});

check("金额与百分比按约定格式化", () => {
  assert.equal(E.money(1000000), "1 000 000.00");
  assert.equal(E.money(-1250.5), "−1 250.50");
  assert.equal(E.percent(0.12), "12.00%");
});

console.log("\n三表模型自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
