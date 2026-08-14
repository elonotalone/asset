/*
 * 概念图谱 · 计算自测
 *
 * 直接加载 active-runtime 的 engine.js 本体。第一层运行页面按钮共用的
 * 内置用例；第二层把规格期望值独立写在这里，避免只靠内核自证。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/concept-knowledge-graph-01",
);
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    console.log(
      "  FAIL " + name + "\n       " +
      (error && error.message ? error.message : String(error)),
    );
  }
}

console.log("概念图谱自测 · 第一层：内核自带用例表");
const report = engine.runSelfTest();
for (const item of report.failures) {
  console.log("  FAIL " + item.name + "\n       " + item.why);
}
if (report.failures.length === 0) {
  console.log("  ok   " + report.total + " 条全过");
}
failed += report.failures.length;

console.log("\n概念图谱自测 · 第二层：规格口径独立断言");

check("默认阈值 0.80，可调值夹在 0.50–0.95", () => {
  assert.equal(engine.normalizeThreshold(Number.NaN), 0.8);
  assert.equal(engine.normalizeThreshold(0.2), 0.5);
  assert.equal(engine.normalizeThreshold(0.73), 0.73);
  assert.equal(engine.normalizeThreshold(1), 0.95);
});

check("21 天半衰：0.80 在 21 天后恰为 0.40", () => {
  assert.ok(Math.abs(engine.decayedMastery(0.8, 21) - 0.4) < 1e-12);
  assert.ok(Math.abs(engine.dailyDecayRate(21) - 0.032468221476108394) < 1e-12);
});

check("默认电磁感应样例是 7 个概念、6 条必修边、2 条相关边", () => {
  const graph = engine.defaultGraph();
  assert.equal(graph.nodes.length, 7);
  assert.equal(graph.edges.filter((edge) => edge.kind === engine.REQUIRED).length, 6);
  assert.equal(graph.edges.filter((edge) => edge.kind === engine.RELATED).length, 2);
});

check("Kahn 只按必修边分出 7 层，相关边不会锁住课程", () => {
  const graph = engine.defaultGraph();
  const base = engine.kahnLayers(graph.nodes, graph.edges);
  assert.equal(base.acyclic, true);
  assert.deepEqual(base.layers.map((layer) => layer.length), [1, 1, 1, 1, 1, 1, 1]);
  const withBackSuggestion = graph.edges.concat({
    from: "transformer",
    to: "magnetic-field",
    kind: engine.RELATED,
    label: "相关",
  });
  assert.equal(engine.kahnLayers(graph.nodes, withBackSuggestion).layers.length, 7);
});

check("A→B→A 必修循环会报告无可执行顺序", () => {
  const nodes = [
    { id: "a", label: "A", minutes: 10, mastery: 0, daysSinceReview: 0 },
    { id: "b", label: "B", minutes: 20, mastery: 0, daysSinceReview: 0 },
  ];
  const edges = [
    { from: "a", to: "b", kind: engine.REQUIRED },
    { from: "b", to: "a", kind: engine.REQUIRED },
  ];
  const order = engine.kahnLayers(nodes, edges);
  assert.equal(order.acyclic, false);
  assert.deepEqual(order.cycleNodes, ["a", "b"]);
  assert.equal(engine.criticalPath(nodes, edges), null);
});

check("关键路径按节点预计分钟累加，默认链为 350 分钟", () => {
  const graph = engine.defaultGraph();
  const critical = engine.criticalPath(graph.nodes, graph.edges);
  assert.equal(critical.minutes, 30 + 45 + 55 + 40 + 60 + 50 + 70);
  assert.deepEqual(critical.labels, [
    "磁场",
    "磁通量",
    "法拉第电磁感应定律",
    "楞次定律",
    "自感",
    "相互感应",
    "变压器原理",
  ]);
});

check("最短路径按边数：必修链磁场到变压器原理为 6，不可达返回空", () => {
  const graph = engine.defaultGraph();
  const required = engine.requiredEdges(graph.nodes, graph.edges);
  const pathResult = engine.shortestPath(
    graph.nodes,
    required,
    "magnetic-field",
    "transformer",
  );
  assert.equal(pathResult.length, 6);
  assert.equal(
    engine.shortestPath(graph.nodes, required, "transformer", "magnetic-field"),
    null,
  );
});

check("入度、出度按有向边逐条计数", () => {
  const graph = engine.defaultGraph();
  const degree = engine.degrees(graph.nodes, graph.edges);
  assert.deepEqual(degree["magnetic-field"], { in: 0, out: 2, total: 2 });
  assert.deepEqual(degree.transformer, { in: 2, out: 0, total: 2 });
});

check("必修前驱达到阈值才可学；相关边不参与", () => {
  const nodes = [
    { id: "a", label: "前驱", minutes: 10, mastery: 0.9, daysSinceReview: 0 },
    { id: "b", label: "后继", minutes: 10, mastery: 0.2, daysSinceReview: 0 },
    { id: "c", label: "建议", minutes: 10, mastery: 0.1, daysSinceReview: 0 },
  ];
  const edges = [
    { from: "a", to: "b", kind: engine.REQUIRED },
    { from: "c", to: "b", kind: engine.RELATED },
  ];
  const row = engine.learningAnalysis(nodes, edges, 0.8).states.find((item) => item.id === "b");
  assert.equal(row.status, "learnable");
  assert.deepEqual(row.prerequisites, ["a"]);
});

check("既有掌握回落或前驱回落时标待复习，不清零后继掌握度", () => {
  const graph = engine.defaultGraph();
  const rows = engine.learningAnalysis(graph.nodes, graph.edges, 0.8).states;
  const selfInduction = rows.find((item) => item.id === "self-induction");
  assert.equal(selfInduction.status, "review");
  assert.ok(selfInduction.effectiveMastery > 0.8);
});

check("分层布局无随机性，同输入逐坐标相同且同层节点不重叠", () => {
  const nodes = [
    { id: "a", label: "A", minutes: 10, mastery: 0, daysSinceReview: 0 },
    { id: "b", label: "B", minutes: 10, mastery: 0, daysSinceReview: 0 },
    { id: "c", label: "C", minutes: 10, mastery: 0, daysSinceReview: 0 },
  ];
  const levels = { a: 0, b: 1, c: 1 };
  const first = engine.layoutGraph(nodes, [], levels, 900);
  const second = engine.layoutGraph(nodes, [], levels, 900);
  assert.deepEqual(first, second);
  assert.ok(Math.abs(first.positions.b.y - first.positions.c.y) >= 88);
});

check("空名、非正分钟、非数掌握度、重复 id、缺端点边都会拒绝", () => {
  const nodes = [
    { id: "dup", label: "", minutes: 0, mastery: Number.NaN, daysSinceReview: 0 },
    { id: "dup", label: "重复", minutes: 10, mastery: 0.5, daysSinceReview: 0 },
  ];
  const errors = engine.validateGraph(nodes, [
    { from: "dup", to: "missing", kind: engine.REQUIRED },
  ]);
  assert.ok(errors.some((message) => message.includes("缺少名称")));
  assert.ok(errors.some((message) => message.includes("分钟必须为正数")));
  assert.ok(errors.some((message) => message.includes("掌握度不是数字")));
  assert.ok(errors.some((message) => message.includes("id 重复")));
  assert.ok(errors.some((message) => message.includes("有效端点")));
});

console.log(
  "\n概念图谱自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"),
);
process.exit(failed === 0 ? 0 : 1);
