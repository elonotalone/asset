import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/contract-assembly-01");
const require = createRequire(import.meta.url);
const E = require(path.join(runtimeDir, "engine.js"));

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

console.log("合同装配自测 · 第一层：页面按钮共用的内核用例");
const report = E.runSelfTest();
for (const failure of report.failures) console.log("  FAIL " + failure.name);
if (!report.failures.length) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n合同装配自测 · 第二层：独立复核风险、关系与变量口径");

check("首屏零选择、零待填且风险尚未计算", () => {
  const summary = E.assemble(E.createState());
  assert.equal(summary.selectedCount, 0);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.risk.calculated, false);
  assert.equal(summary.risk.value, null);
  assert.equal(summary.text, "");
  assert.deepEqual(E.issues(E.createState()), []);
});

check("风险公式的高权重组合由 135 上夹为 100", () => {
  const state = {
    selected: ["scope", "payment", "ip-ownership", "confidentiality", "liability-cap", "litigation"],
  };
  const risk = E.calculateRisk(state);
  assert.equal(risk.weightSum, 135);
  assert.equal(risk.missingCount, 0);
  assert.equal(risk.conflictCount, 0);
  assert.equal(risk.raw, 135);
  assert.equal(risk.value, 100);
});

check("风险公式的低权重与三个缺失关键类目由 -105 下夹为 -100", () => {
  const risk = E.calculateRisk({ selected: ["unlimited-rework"] });
  assert.equal(risk.weightSum, -90);
  assert.equal(risk.missingCount, 3);
  assert.equal(risk.conflictCount, 0);
  assert.equal(risk.raw, -105);
  assert.equal(risk.value, -100);
});

check("所有 256 种条款组合的已计算风险都在 [-100, 100]", () => {
  const ids = E.CLAUSES.map((clause) => clause.id);
  for (let mask = 1; mask < (1 << ids.length); mask++) {
    const selected = ids.filter((_id, index) => mask & (1 << index));
    const risk = E.calculateRisk({ selected });
    assert.equal(risk.calculated, true);
    assert.ok(risk.value >= -100 && risk.value <= 100, `${selected.join(",")} => ${risk.value}`);
  }
});

check("选诉讼后仲裁被标为互斥并给出原因，强行组合也计一对冲突", () => {
  const availability = E.availability({ selected: ["litigation"] }, "arbitration");
  assert.equal(availability.mutuallyExclusive, true);
  assert.match(availability.reason, /诉讼与仲裁不能同时选择/);
  const attempt = E.selectClause({ selected: ["litigation"] }, "arbitration");
  assert.equal(attempt.blocked, true);
  assert.deepEqual(attempt.state.selected, ["litigation"]);
  assert.match(attempt.reasons[0].reason, /终局机制/);
  const conflicts = E.conflicts({ selected: ["litigation", "arbitration"] });
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].reason, /不能同时选择/);
});

check("选责任上限会连带加入费用与付款并解释原因", () => {
  const result = E.selectClause(E.createState(), "liability-cap");
  assert.equal(result.blocked, false);
  assert.ok(result.state.selected.includes("liability-cap"));
  assert.ok(result.state.selected.includes("payment"));
  assert.deepEqual(result.added, ["liability-cap", "payment"]);
  assert.equal(result.reasons.length, 1);
  assert.equal(result.reasons[0].clauseId, "payment");
  assert.match(result.reasons[0].reason, /合同金额与费用定义/);
});

check("七种变量类型齐全，金额与百分比固定两位小数", () => {
  assert.deepEqual(E.variableTypes(), ["amount", "boolean", "date", "number", "percentage", "single", "text"]);
  assert.equal(E.formatVariable("amount", 128000), "128000.00");
  assert.equal(E.formatVariable("amount", "99.5"), "99.50");
  assert.equal(E.formatVariable("percentage", 30), "30.00%");
  assert.equal(E.formatVariable("percentage", "7.125"), "7.13%");
  assert.equal(E.formatVariable("amount", "坏输入"), "");
});

check("真实条款正文替换已填变量，未填变量保留可见占位符", () => {
  const state = E.createState({
    transaction: "软件开发外包",
    selected: ["payment", "ip-ownership"],
    values: {
      contractAmount: 128000,
      depositRate: 30,
      paymentDate: "2026-09-15",
      ipOwner: "委托方",
      openSourceAllowed: false,
    },
  });
  const summary = E.assemble(state);
  assert.match(summary.text, /交易类型：软件开发外包/);
  assert.match(summary.text, /人民币128000\.00元/);
  assert.match(summary.text, /首付款比例为30\.00%/);
  assert.match(summary.text, /知识产权归委托方所有/);
  assert.match(summary.text, /允许披露开源组件：否/);
  assert.equal(summary.pendingCount, 0);

  const missing = E.assemble({ selected: ["scope"] });
  assert.match(missing.text, /〔待填：项目名称〕/);
  assert.match(missing.text, /〔待填：交付成果数量〕/);
  assert.equal(missing.pendingCount, 2);
});

console.log("\n合同装配自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
