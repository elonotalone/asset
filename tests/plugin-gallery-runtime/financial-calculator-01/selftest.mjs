/*
 * 金融计算器 · 自测
 *
 *   node tests/plugin-gallery-runtime/financial-calculator-01/selftest.mjs
 *
 * 两层：
 *   第一层 —— 内核自带的用例表（页面「自测」按钮跑同一张）。
 *   第二层 —— 本文件**另抄一遍规格原文**再问内核。第一层能靠改期望值刷绿，第二层不能。
 *              规格：docs/specs/oceanleo-plugins-v1/plugins/financial-calculator.md
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/financial-calculator-01",
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("金融计算器自测 · 第一层：内核自带用例表");
const report = E.runSelfTest();
for (const f of report.failures) console.log("  FAIL " + f.name + "\n       " + f.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n金融计算器自测 · 第二层：期望值另抄自规格原文");

/* 规格「第一次打开」：本金 1 000 000 元、年利率 4.20%、360 期、等额本息，
   对应月供约 4 890.17 元、总利息约 760 461.83 元。 */
check("规格出厂读数：月供 4 890.17 元", () => {
  const p = E.amortize(1000000, 4.2, 360);
  assert.ok(near(E.round2(p.payment), 4890.17, 0.005), `得到 ${p.payment}`);
});
check("规格出厂读数：总利息 760 461.83 元", () => {
  const p = E.amortize(1000000, 4.2, 360);
  assert.ok(near(E.round2(p.totalInterest), 760461.83, 0.005), `得到 ${p.totalInterest}`);
});

/* 规格：等额本息每期还款 P × i × (1+i)^n / ((1+i)^n − 1)；利率为零时自然退化为 P/n。 */
check("等额本息公式逐项复核（自己按公式再算一遍，不调 amortize）", () => {
  const P = 850000, i = 0.0375 / 12, n = 240;
  const g = Math.pow(1 + i, n);
  const expect = P * i * g / (g - 1);
  assert.ok(near(E.amortize(P, 3.75, 240).payment, expect, 1e-9));
});
check("利率为零退化为 P/n", () => {
  assert.equal(E.round2(E.amortize(1200, 0, 12).payment), 100);
  assert.equal(E.round2(E.amortize(999, 0, 3).payment), 333);
});

/* 规格：净现值 Σ CF_t/(1+r)^t；内部收益率是满足 NPV(r)=0 的 r；
   现金流全同号时 IRR 没有常规意义。 */
check("NPV 按定义逐项累加复核", () => {
  const flows = [-2000, 800, 900, 1000], r = 0.08;
  let expect = 0;
  for (let t = 0; t < flows.length; t++) expect += flows[t] / Math.pow(1 + r, t);
  assert.ok(near(E.npv(r, flows), expect, 1e-12));
});
check("IRR 代回去让 NPV 归零", () => {
  const flows = [-5000, 1200, 1500, 1800, 2200];
  const r = E.irr(flows);
  assert.ok(r !== null, "应当有解");
  assert.ok(Math.abs(E.npv(r, flows)) < 1e-6, `NPV(IRR) = ${E.npv(r, flows)}`);
});
check("全为正的现金流：IRR 返回 null，不硬凑一个数", () => {
  assert.equal(E.irr([100, 200, 300]), null);
});
check("全为负的现金流：同样返回 null", () => {
  assert.equal(E.irr([-100, -200, -300]), null);
});

/* 规格：WACC = (E/V) × Re + (D/V) × Rd × (1 − Tc)。 */
check("WACC 按定义复核", () => {
  assert.ok(near(E.wacc(600, 400, 0.12, 0.06, 0.25), 0.6 * 0.12 + 0.4 * 0.06 * 0.75, 1e-12));
});

/* 规格：费雪实际利率使用精确式 (1+名义)/(1+通胀) − 1；例如 1.06/1.025 − 1 ≈ 0.0341。 */
check("费雪实际利率 ≈ 0.0341，且不是「名义减通胀」那个近似", () => {
  const real = E.fisherReal(0.06, 0.025);
  assert.ok(near(real, 0.0341, 0.0001), `得到 ${real}`);
  assert.notEqual(E.round2(real * 100), E.round2((0.06 - 0.025) * 100));
});

/* 规格：金额逐期取整会产生尾差；末期平衡能让本金分摊之和回到原始本金，并让最终余额接近零。 */
check("末期平衡：本金分摊之和 = 原始本金，最终余额 = 0", () => {
  for (const [P, r, n] of [[1000000, 4.2, 360], [333333, 5.15, 84], [50000, 0, 7]]) {
    const p = E.amortize(P, r, n);
    assert.ok(near(p.principalSum, P, 0.005), `本金和 ${p.principalSum} ≠ ${P}`);
    assert.ok(near(p.finalBalance, 0, 0.005), `末期余额 ${p.finalBalance}`);
  }
});
check("尾差真实存在，并且两个总利息口径都给了出来", () => {
  const p = E.amortize(1000000, 4.2, 360);
  assert.ok(typeof p.roundedInterestTotal === "number", "缺逐期取整口径");
  assert.ok(typeof p.totalInterest === "number", "缺未取整口径");
  assert.notEqual(E.round2(p.roundedInterestTotal), E.round2(p.totalInterest));
  assert.ok(near(p.tailDiff, p.roundedInterestTotal - p.totalInterest, 0.02));
});
check("逐期明细自洽：每期 还款 = 利息 + 本金，余额逐期递减到零", () => {
  const p = E.amortize(600000, 3.9, 120);
  let bal = 600000;
  for (const r of p.rows) {
    assert.ok(near(r.payment, r.interest + r.principal, 0.011), `第 ${r.period} 期还款对不上`);
    bal = E.round2(bal - r.principal);
    assert.ok(near(r.balance, bal, 0.011), `第 ${r.period} 期余额对不上`);
  }
  assert.ok(near(p.rows[p.rows.length - 1].balance, 0, 0.005));
});

/* 规格「用户什么时候会想要它」：比较贷款 20 年和 30 年的月供与总利息。 */
check("20 年 vs 30 年：月供更高、总利息更低", () => {
  const y20 = E.amortize(1000000, 4.2, 240);
  const y30 = E.amortize(1000000, 4.2, 360);
  assert.ok(y20.payment > y30.payment);
  assert.ok(y20.totalInterest < y30.totalInterest);
});

check("坏输入返回 null，不返回空表冒充结果", () => {
  assert.equal(E.amortize(0, 4.2, 360), null);
  assert.equal(E.amortize(1000, 4.2, 0), null);
  assert.equal(E.amortize(1000, -1, 12), null);
});

console.log("\n金融计算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
