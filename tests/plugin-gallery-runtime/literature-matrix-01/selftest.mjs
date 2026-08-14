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
check("关系 4：已纳入 = 已评估 − 全文排除 − 待定 = 24 − 6 − 0 = 18", () => {
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

console.log("\n文献矩阵自测 · 第三层：粘进来几行、读出几条，落空的必须点名");

// 这一层测界面上唯一真会「对不上」的两件事：行没读进来、状态没认出来。
// 五条关系在内核里是恒等式（screened 等都是减出来的），对界面数据永远成立，
// 所以屏幕上那一声必须由下面这两件事触发，否则就是静默改了用户的判定。
const pasted = [
  "作者年份\t研究设计\t研究对象\t样本量\t状态",
  "Chen 2024\t随机对照试验\t社区老年人\t286\t纳入",
  "Martínez 2022\t前瞻性队列研究\t城市成年人\t612\t纳入",
  "Okafor 2021",
  "",
  "Singh 2020\t随机对照试验\t住院患者\t174\t排除",
].join("\n");

const pasteReport = E.parseReport(pasted);

check("粘进来 4 条题录，只读出 3 条，落空的那一行报出行号与原文", () => {
  assert.equal(pasteReport.pastedRows, 4);
  assert.equal(pasteReport.rows.length, 3);
  assert.equal(pasteReport.skipped.length, 1);
  assert.equal(pasteReport.skipped[0].line, 4);
  assert.equal(pasteReport.skipped[0].text, "Okafor 2021");
});

check("末列写「状态」的表头行不算落空", () => {
  assert.equal(pasteReport.headerRows, 1);
  assert.ok(pasteReport.skipped.every((item) => item.line !== 1));
});

check("「排除」不在别名表里：落到待定，且被点名而不是静默改掉", () => {
  assert.equal(pasteReport.unknownStatus.length, 1);
  assert.equal(pasteReport.unknownStatus[0].statusRaw, "排除");
  assert.equal(pasteReport.unknownStatus[0].pipeline, "pending");
  assert.equal(pasteReport.unknownStatus[0].decision, "pending");
  assert.equal(E.audit(pasteReport.rows).unknownStatus, 1);
  assert.equal(E.audit(pasteReport.rows).includedByStatus, 2);
});

check("六种认得的写法都不算没认出来，中英两种写法都认", () => {
  const known = E.parseReport([
    "A 2024|设计|对象|10|纳入",
    "B 2024|设计|对象|11|duplicate",
    "C 2024|设计|对象|12|题录排除",
    "D 2024|设计|对象|13|unavailable",
    "E 2024|设计|对象|14|全文排除",
    "F 2024|设计|对象|15|pending",
  ].join("\n"));
  assert.equal(known.rows.length, 6);
  assert.equal(known.unknownStatus.length, 0);
  assert.equal(known.skipped.length, 0);
  assert.deepEqual(known.rows.map((row) => row.pipeline), [
    "included", "duplicate", "citation-excluded", "unavailable", "fulltext-excluded", "pending",
  ]);
});

check("解析出来的条数就是「已识别」，第一条关系仍然接得上", () => {
  const a = E.audit(pasteReport.rows);
  assert.equal(a.identified, pasteReport.rows.length);
  assert.equal(a.screened, a.identified - a.duplicates);
  assert.equal(a.consistent, true);
});

console.log("\n文献矩阵自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
