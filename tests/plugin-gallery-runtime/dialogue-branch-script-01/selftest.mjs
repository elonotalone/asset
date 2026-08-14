import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/dialogue-branch-script-01",
);
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err?.message || String(err)));
  }
}

console.log("话术分支自测 · 第一层：页面按钮共用的内核用例");
const report = engine.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n话术分支自测 · 第二层：规格口径独立断言");

const graph = {
  startId: "start",
  nodes: [
    { id: "start", name: "开场", text: "我们先确认目标。", ending: false },
    { id: "main", name: "主线回应", text: "我最在意交付时间。", ending: false },
    { id: "clarify", name: "澄清日期", text: "最迟哪天需要？", ending: false },
    { id: "dead", name: "等待确认", text: "我明天等你答复。", ending: false },
    { id: "finish", name: "约定行动", text: "周五一起复盘。", ending: true },
    { id: "orphan", name: "孤立备忘", text: "这段没接进主线。", ending: true },
  ],
  edges: [
    { from: "start", to: "main", priority: 1, kind: "forward" },
    { from: "main", to: "clarify", priority: 1, condition: { field: "reply", operator: "includes", value: "时间" }, kind: "forward" },
    { from: "clarify", to: "main", priority: 1, kind: "return" },
    { from: "main", to: "dead", priority: 2, condition: { field: "reply", operator: "includes", value: "以后" }, kind: "forward" },
    { from: "main", to: "finish", priority: 9, fallback: true, kind: "forward" },
  ],
};

check("含 1 个死端时必须点名“等待确认”，不是只报计数", () => {
  const result = engine.analyzeGraph(graph);
  assert.deepEqual(result.deadEnds.map((node) => node.name), ["等待确认"]);
  assert.ok(result.warnings.includes("死端：等待确认"));
});

check("含 1 个不可达节点时必须点名“孤立备忘”", () => {
  const result = engine.analyzeGraph(graph);
  assert.deepEqual(result.unreachable.map((node) => node.name), ["孤立备忘"]);
  assert.ok(result.warnings.includes("不可达：孤立备忘"));
});

check("加上或删掉澄清回边，最大深度保持相同", () => {
  const withoutReturn = engine.clone(graph);
  withoutReturn.edges = withoutReturn.edges.filter((edge) => edge.kind !== "return");
  assert.equal(engine.analyzeGraph(graph).maxDepth, engine.analyzeGraph(withoutReturn).maxDepth);
  assert.equal(engine.analyzeGraph(graph).maxDepth, 3);
});

check("条件都不命中时明确选择兜底路径", () => {
  const edge = engine.selectNext(graph, "main", { reply: "让我再想想" });
  assert.ok(edge);
  assert.equal(edge.to, "finish");
  assert.equal(edge.fallback, true);
});

check("已知 18 字的路径时长 = 18 ÷ 3.6 = 5 秒", () => {
  const known = {
    startId: "a",
    nodes: [
      { id: "a", text: "一二三四五六七八九" },
      { id: "b", text: "甲乙丙丁戊己庚辛壬" },
    ],
    edges: [{ from: "a", to: "b" }],
  };
  const estimate = engine.estimatePath(known, ["a", "b"]);
  assert.equal(estimate.characters, 18);
  assert.equal(estimate.seconds, 5);
});

check("首屏空图不计算覆盖，也不产生一条告警", () => {
  const result = engine.analyzeGraph({ startId: null, nodes: [], edges: [] });
  assert.equal(result.coverageCalculated, false);
  assert.deepEqual(result.warnings, []);
});

check("导出文本点名节点、关系与 3.6 字/秒口径", () => {
  const output = engine.exportScript(graph);
  assert.match(output, /等待确认/);
  assert.match(output, /孤立备忘/);
  assert.match(output, /澄清回边/);
  assert.match(output, /3\.6/);
});

console.log("\n话术分支自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
