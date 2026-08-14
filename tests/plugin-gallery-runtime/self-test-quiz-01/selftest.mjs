import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/self-test-quiz-01");
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
function q(type, points, answer, extra = {}) { return { type, points, answer, ...extra }; }
function earned(question, response) { return E.scoreQuestion(question, response).earned; }

console.log("自测卷自测 · 第一层：内核自带用例表");
const builtIn = E.runSelfTest();
for (const failure of builtIn.failures) console.log("  FAIL " + failure.name + "\n       " + failure.why);
if (builtIn.failures.length === 0) console.log("  ok   " + builtIn.total + " 条全过");
failed += builtIn.failures.length;

console.log("\n自测卷自测 · 第二层：六种题型口径独立复核");

const matrices = [
  {
    label: "单选",
    question: q("single", 10, "月球"),
    cases: [["全对", "月球", 10], ["部分输入（完全匹配仍为零）", "月", 0], ["全错", "火星", 0]]
  },
  {
    label: "判断",
    question: q("truefalse", 7, "正确"),
    cases: [["全对", "正确", 7], ["部分输入（完全匹配仍为零）", "正", 0], ["全错", "错误", 0]]
  },
  {
    label: "多选",
    question: q("multi", 12, ["A", "B"]),
    cases: [["全对", ["A", "B"], 12], ["部分对", ["A"], 6], ["全错且不倒扣", ["C", "D", "E"], 0]]
  },
  {
    label: "填空",
    question: q("blanks", 8, ["极限", "导数"]),
    cases: [["全对", ["极限", "导数"], 8], ["部分对", ["极限", "积分"], 4], ["全错", ["函数", "积分"], 0]]
  },
  {
    label: "数值",
    question: q("numeric", 10, 100, { unit: "km/h", tolerancePct: 2 }),
    cases: [["全对", { value: 100, unit: "km/h" }, 10], ["有偏差但仍在容差内", { value: 101.5, unit: "km/h" }, 10], ["全错", { value: 103, unit: "km/h" }, 0]]
  },
  {
    label: "排序",
    question: q("ordering", 9, ["A", "B", "C", "D"]),
    cases: [["全对", ["A", "B", "C", "D"], 9], ["部分对", ["A", "B", "D", "C"], 3], ["全错", ["D", "C", "B", "A"], 0]]
  },
  {
    label: "匹配",
    question: q("matching", 8, { 法国: "巴黎", 日本: "东京" }),
    cases: [["全对", { 法国: "巴黎", 日本: "东京" }, 8], ["部分对", { 法国: "巴黎", 日本: "大阪" }, 4], ["全错", { 法国: "里昂", 日本: "大阪" }, 0]]
  }
];

for (const matrix of matrices) {
  for (const [kind, response, expected] of matrix.cases) {
    check(matrix.label + " · " + kind + " → " + expected + " 分", () => {
      assert.equal(earned(matrix.question, response), expected);
    });
  }
  check(matrix.label + " · 每个用例得分都夹在 [0, 满分]", () => {
    for (const [, response] of matrix.cases) {
      const score = earned(matrix.question, response);
      assert.ok(score >= 0 && score <= matrix.question.points, `得到 ${score}`);
    }
  });
}

check("多选公式：命中 2、错选 1、正确答案 3 项 → 1/3 满分", () => {
  assert.equal(earned(q("multi", 15, ["A", "B", "C"]), ["A", "B", "X"]), 5);
});

check("排序按正确相邻对而非位置数计分", () => {
  const result = E.scoreQuestion(q("ordering", 12, ["A", "B", "C", "D"]), ["A", "B", "D", "C"]);
  assert.equal(result.earned, 4);
  assert.match(result.reason, /1 \/ 3 个正确相邻对/);
});

check("匹配按正确配对比例计分", () => {
  const result = E.scoreQuestion(q("matching", 9, { A: "1", B: "2", C: "3" }), { A: "1", B: "9", C: "3" });
  assert.equal(result.earned, 6);
});

console.log("\n自测卷自测 · 数值题相对容差与单位");

check("相同 1.5% 相对误差：大数 100 → 101.5 判对", () => {
  assert.equal(earned(q("numeric", 10, 100, { unit: "kg", tolerancePct: 2 }), { value: 101.5, unit: "kg" }), 10);
});
check("相同 1.5% 相对误差：小数 0.5 → 0.5075 判对", () => {
  assert.equal(earned(q("numeric", 10, 0.5, { unit: "kg", tolerancePct: 2 }), { value: 0.5075, unit: "kg" }), 10);
});
check("相同 2.1% 相对误差：大数 100 → 102.1 判错", () => {
  assert.equal(earned(q("numeric", 10, 100, { unit: "kg", tolerancePct: 2 }), { value: 102.1, unit: "kg" }), 0);
});
check("相同 2.1% 相对误差：小数 0.5 → 0.5105 判错", () => {
  assert.equal(earned(q("numeric", 10, 0.5, { unit: "kg", tolerancePct: 2 }), { value: 0.5105, unit: "kg" }), 0);
});
check("数值相同但量纲不同不得分", () => {
  assert.equal(earned(q("numeric", 10, 60, { unit: "km/h", tolerancePct: 2 }), { value: 60, unit: "m/s" }), 0);
});
check("答案为零时只接受绝对差为零", () => {
  const zero = q("numeric", 10, 0, { unit: "°C", tolerancePct: 2 });
  assert.equal(earned(zero, { value: 0, unit: "°C" }), 10);
  assert.equal(earned(zero, { value: 0.001, unit: "°C" }), 0);
});

check("整卷总分不会被负分拖到零以下", () => {
  const questions = [q("multi", 10, ["A"]), q("single", 5, "是")];
  const report = E.scoreQuiz(questions, [["X", "Y", "Z"], "否"]);
  assert.equal(report.earned, 0);
  assert.equal(report.total, 15);
});

check("坏输入不伪装成题目", () => {
  assert.match(E.makeQuestion({ type: "single", prompt: "", points: 10 }).error, /题干/);
  assert.match(E.makeQuestion({ type: "numeric", prompt: "速度", points: 10, answer: "60", unit: "" }).error, /单位/);
  assert.match(E.makeQuestion({ type: "single", prompt: "卫星", points: 10, options: ["月球", "火星"], answer: "金星" }).error, /选项/);
});

console.log("\n自测卷自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
