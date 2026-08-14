import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/literature-matrix-01");
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

console.log("文献矩阵自测 · 第一层：页面按钮共用的内核用例");
const report = E.runSelfTest();
for (const failure of report.failures) console.log("  FAIL " + failure.name);
if (!report.failures.length) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n文献矩阵自测 · 第二层：独立复核 40 条状态表");

const rows = [];
const distribution = [
  ["duplicate", 5],
  ["citation-excluded", 7],
  ["unavailable", 4],
  ["fulltext-excluded", 6],
  ["included", 18],
];
let serial = 1;
for (const [status, count] of distribution) {
  for (let i = 0; i < count; i++) {
    rows.push(E.record([
      `作者组 ${serial}（${2020 + (serial % 6)}）`,
      serial % 2 ? "随机对照试验" : "前瞻性队列研究",
      "社区成年人",
      String(90 + serial),
    ], status));
    serial++;
  }
}

const audit = E.audit(rows);
check("状态表恰好 40 条", () => assert.equal(audit.identified, 40));
check("关系 1：已筛 = 已识别 − 重复 = 40 − 5 = 35", () => {
  assert.equal(audit.screened, 35);
  assert.equal(audit.relations[0].ok, true);
});
check("关系 2：待取全文 = 已筛 − 题录排除 = 35 − 7 = 28", () => {
  assert.equal(audit.fulltextNeeded, 28);
  assert.equal(audit.relations[1].ok, true);
});
check("关系 3：已评估 = 待取全文 − 未取到 = 28 − 4 = 24", () => {
  assert.equal(audit.evaluated, 24);
  assert.equal(audit.relations[2].ok, true);
});
check("关系 4：已纳入 = 已评估 − 全文排除 = 24 − 6 = 18", () => {
  assert.equal(audit.included, 18);
  assert.equal(audit.relations[3].ok, true);
});
check("关系 5：最终纳入 18 = 逐条纳入状态计数 18", () => {
  assert.equal(audit.includedByStatus, 18);
  assert.equal(audit.relations[4].ok, true);
  assert.equal(audit.consistent, true);
});

check("故意把一条纳入记录的逐条决定改成排除，会检出关系 5 不一致", () => {
  const broken = rows.map((row) => ({
    values: row.values.slice(),
    pipeline: row.pipeline,
    decision: row.decision,
    bias: row.bias.slice(),
  }));
  const target = broken.find((row) => row.pipeline === "included");
  target.decision = "excluded";
  const result = E.audit(broken);
  assert.equal(result.included, 18);
  assert.equal(result.includedByStatus, 17);
  assert.equal(result.relations[4].ok, false);
  assert.equal(result.consistent, false);
});

check("纳入、排除、待定各有颜色且各有形状，不只靠颜色", () => {
  const states = ["included", "excluded", "pending"].map(E.statusVisual);
  for (const state of states) assert.match(state.color, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(states.map((state) => state.shape), ["●", "×", "◆"]);
  assert.equal(new Set(states.map((state) => state.color)).size, 3);
});

check("11 个默认抽取字段与 4 个偏倚观察域全部覆盖", () => {
  assert.deepEqual(E.DEFAULT_FIELDS, [
    "作者年份", "研究设计", "研究对象", "样本量", "干预或暴露", "对照",
    "主要结局", "效应量", "随访", "地区", "结论",
  ]);
  assert.deepEqual(E.BIAS_DOMAINS, [
    "选择与分组", "测量与结局评估", "缺失数据", "报告与利益冲突",
  ]);
});

check("字段可增删改写，重复名被去掉，空配置安全回退", () => {
  assert.deepEqual(E.normalizeFields("作者年份，证据等级，作者年份"), ["作者年份", "证据等级"]);
  assert.deepEqual(E.normalizeFields(""), E.DEFAULT_FIELDS);
});

check("坏输入不抛异常：空行跳过、未知状态转成待定", () => {
  assert.deepEqual(E.parseBatch("\n  \n"), []);
  const parsed = E.parseBatch("Li 2025 | 队列研究 | 成年人 | 318 | 尚未判断");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pipeline, "pending");
  assert.equal(parsed[0].decision, "pending");
});

console.log("\n文献矩阵自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
