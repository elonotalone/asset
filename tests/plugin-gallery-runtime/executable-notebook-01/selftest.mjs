/* 可执行笔记 · 计算内核与依赖图自测 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/executable-notebook-01");
const enginePath = path.join(runtimeDir, "engine.js");
const require = createRequire(import.meta.url);
const engine = require(enginePath);

let failed = 0;
function check(name, action) {
  try {
    action();
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

const parameters = {
  area: 620,
  rent: 32,
  people: 24,
  months: 36,
  moveCost: 180000,
  budget: 1100000,
};
const cells = [
  { name: "monthlyRent", type: "expression", content: "area*rent" },
  { name: "leaseCost", type: "expression", content: "monthlyRent*months" },
  { name: "movePerMonth", type: "expression", content: "moveCost/months" },
  { name: "totalCost", type: "expression", content: "leaseCost+moveCost" },
  { name: "costPerSeat", type: "expression", content: "monthlyRent/people" },
  { name: "budgetGap", type: "expression", content: "budget-totalCost" },
  { name: "withinBudget", type: "assertion", content: "totalCost<=budget" },
];
const notebook = { baselineDate: "2026-08-14", parameters, cells };

console.log("可执行笔记自测 · 第一层：页面内置用例");
const builtIn = engine.runSelfTest();
for (const failure of builtIn.failures) {
  console.log("  FAIL " + failure.name + "\n       " + failure.why);
}
failed += builtIn.failures.length;
if (!builtIn.failures.length) console.log("  ok   " + builtIn.total + " 条内置用例全过");

console.log("\n可执行笔记自测 · 第二层：规格判据");

check("tokenizer 与递归下降 parser 覆盖四则、幂、括号、一元负号、函数、命名引用和比较", () => {
  assert.equal(engine.evaluate("-(2+3)^2+abs(-4)+sqrt(9)", {}), -18);
  assert.equal(engine.evaluate("pow(2,3)+round(1.236,2)", {}), 9.24);
  assert.equal(engine.evaluate("total<=budget", { total: 894240, budget: 1100000 }), true);
});

let first;
check("7 格依赖图按稳定拓扑序自上游向下游计算", () => {
  first = engine.runNotebook(notebook);
  assert.deepEqual(first.order, [
    "monthlyRent",
    "leaseCost",
    "movePerMonth",
    "totalCost",
    "costPerSeat",
    "budgetGap",
    "withinBudget",
  ]);
  assert.equal(first.results.monthlyRent.value, 19840);
  assert.equal(first.results.leaseCost.value, 714240);
  assert.equal(first.results.movePerMonth.value, 5000);
  assert.equal(first.results.totalCost.value, 894240);
  assert.equal(first.results.budgetGap.value, 205760);
  assert.equal(first.results.withinBudget.passed, true);
});

check("修改 area 只重算传递下游，顺序仍是拓扑序", () => {
  const changed = {
    baselineDate: notebook.baselineDate,
    parameters: { ...parameters, area: 700 },
    cells,
  };
  const next = engine.runNotebook(changed, { previous: first, changed: ["area"] });
  assert.deepEqual(next.order, [
    "monthlyRent",
    "leaseCost",
    "totalCost",
    "costPerSeat",
    "budgetGap",
    "withinBudget",
  ]);
  assert.equal(next.order.includes("movePerMonth"), false);
  assert.equal(next.results.movePerMonth.value, 5000);
  const positions = Object.fromEntries(first.order.map((name, index) => [name, index]));
  for (const name of next.order) {
    for (const dep of next.dependencies[name]) {
      if (positions[dep] !== undefined) assert.ok(positions[dep] < positions[name], dep + " 应先于 " + name);
    }
  }
});

check("循环引用点名环上的 a、b，而不是只说出错", () => {
  assert.throws(
    () => engine.runNotebook({
      parameters: {},
      cells: [
        { name: "a", type: "expression", content: "b+1" },
        { name: "b", type: "expression", content: "a+1" },
      ],
    }),
    (error) => error?.code === "CIRCULAR_REFERENCE"
      && error.cycle.includes("a")
      && error.cycle.includes("b")
      && /a/.test(error.message)
      && /b/.test(error.message),
  );
});

check("未定义引用点名 missing 及使用它的 total", () => {
  assert.throws(
    () => engine.runNotebook({
      parameters: {},
      cells: [{ name: "total", type: "expression", content: "missing+1" }],
    }),
    (error) => error?.code === "UNDEFINED_REFERENCE"
      && error.references.includes("missing")
      && /missing/.test(error.message)
      && /total/.test(error.message),
  );
});

check("表达式、说明文字、断言三类格子各守边界", () => {
  const run = engine.runNotebook({
    baselineDate: "2026-08-14",
    parameters: { cost: 9, budget: 10 },
    cells: [
      { name: "result", type: "expression", content: "cost+1" },
      { name: "basis", type: "text", content: "金额单位：万元" },
      { name: "limit", type: "assertion", content: "result<=budget" },
    ],
  });
  assert.deepEqual(run.results.result, { type: "expression", value: 10 });
  assert.deepEqual(run.results.basis, { type: "text", text: "金额单位：万元" });
  assert.deepEqual(run.results.limit, { type: "assertion", value: true, passed: true });
  assert.deepEqual(run.dependencies.basis, []);
});

check("同参数与同基准日期两次求值逐字节相同", () => {
  const one = engine.runNotebook(notebook);
  const two = engine.runNotebook(notebook);
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  assert.equal(one.baselineDate, "2026-08-14");
});

check("源码没有自由代码执行入口，也不读取系统时间或隐式随机量", () => {
  const source = fs.readFileSync(enginePath, "utf8");
  for (const token of ["ev" + "al(", "new " + "Function", "Function" + "("]) {
    assert.equal(source.includes(token), false, "源码出现 " + token);
  }
  assert.doesNotMatch(source, /Math\s*\.\s*random|Date\s*\.\s*now|new\s+Date\b/);
});

console.log("\n可执行笔记自测汇总：" + (failed === 0 ? "0 项失败" : failed + " 项失败"));
console.log("可执行笔记自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
