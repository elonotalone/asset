/* 关系图 · 计算自测：直接加载页面使用的 engine.js，并独立核对规格口径。 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/relationship-graph-01",
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

console.log("关系图自测 · 第一层：内核自带用例表");
const report = engine.runSelfTest();
for (const item of report.failures) {
  console.log("  FAIL " + item.name + "\n       " + item.why);
}
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n关系图自测 · 第二层：规格口径独立断言");

check("默认样例为 7 节点、8 条有向关系且数据本身有效", () => {
  const graph = engine.defaultGraph();
  assert.equal(graph.nodes.length, 7);
  assert.equal(graph.edges.length, 8);
  assert.deepEqual(engine.validateGraph(graph.nodes, graph.edges), []);
});

check("有向密度与无向密度使用各自分母", () => {
  const graph = engine.defaultGraph();
  assert.ok(Math.abs(engine.directedDensity(graph.nodes, graph.edges) - 8 / (7 * 6)) < 1e-12);
  assert.ok(Math.abs(engine.undirectedDensity(graph.nodes, graph.edges) - 8 / 21) < 1e-12);
  assert.equal(engine.directedDensity([], []), 0);
  assert.equal(engine.undirectedDensity([{ id: "a" }], []), 0);
});

check("入度、出度与总度逐条按方向计，默认最大总度数为 4", () => {
  const graph = engine.defaultGraph();
  const degree = engine.degrees(graph.nodes, graph.edges);
  assert.deepEqual(degree.apollo11, { in: 1, out: 3, total: 4 });
  assert.deepEqual(degree.nasa, { in: 0, out: 1, total: 1 });
  assert.equal(engine.analyze(graph.nodes, graph.edges).maxDegree, 4);
});

check("弱连通分量忽略方向；两条互不相连支线得到 2 个分量", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id, label: id, type: engine.PERSON }));
  const edges = [
    { from: "b", to: "a", label: "认识", date: "2026-01-01" },
    { from: "c", to: "d", label: "认识", date: "2026-01-02" },
  ];
  assert.equal(engine.weakComponents(nodes, edges).length, 2);
});

check("独立环按去重无向节点对的圈秩计算，默认值为 2", () => {
  const graph = engine.defaultGraph();
  assert.equal(engine.cycleRank(graph.nodes, graph.edges), 2);
  const nodes = [
    { id: "a", label: "甲", type: engine.PERSON },
    { id: "b", label: "乙", type: engine.PERSON },
  ];
  const reversePair = [
    { from: "a", to: "b", label: "会见", date: "2026-01-01" },
    { from: "b", to: "a", label: "回访", date: "2026-01-02" },
  ];
  assert.equal(engine.undirectedPairs(nodes, reversePair).length, 1);
  assert.equal(engine.cycleRank(nodes, reversePair), 0);
});

check("最短路径忽略方向，柯林斯到尼克松为 3 条关系、2 个中介", () => {
  const graph = engine.defaultGraph();
  const result = engine.shortestPath(graph.nodes, graph.edges, "collins", "nixon");
  assert.equal(result.length, 3);
  assert.equal(result.intermediaries, 2);
  assert.deepEqual(result.labels, ["迈克尔·柯林斯", "阿波罗11号任务", "巴兹·奥尔德林", "理查德·尼克松"]);
  assert.equal(engine.shortestPath(graph.nodes, graph.edges, "collins", "missing"), null);
});

check("加入 NASA 设立中心：复用旧节点、新增一节点一边并重算密度", () => {
  const graph = engine.defaultGraph();
  const result = engine.addRelationLine(
    graph.nodes,
    graph.edges,
    "美国国家航空航天局（组织）｜设立｜载人航天中心（组织）｜1961-11-01",
  );
  assert.equal(result.error, undefined);
  assert.equal(result.nodes.length, 8);
  assert.equal(result.edges.length, 9);
  assert.equal(result.addedNodeIds.length, 1);
  const analysis = engine.analyze(result.nodes, result.edges);
  assert.equal(analysis.maxDegree, 4);
  assert.equal(analysis.componentCount, 1);
  assert.equal(analysis.cycleRank, 2);
  assert.ok(Math.abs(analysis.directedDensity - 9 / (8 * 7)) < 1e-12);
});

check("四段格式、关系名、真实日期和新节点类型均会校验", () => {
  assert.match(engine.addRelationLine([], [], "甲（人物）｜会见｜乙（人物）").error, /四段/);
  assert.match(engine.addRelationLine([], [], "甲（人物）｜｜乙（人物）｜2026-01-01").error, /关系不能为空/);
  assert.match(engine.addRelationLine([], [], "甲（人物）｜会见｜乙（人物）｜2025-02-30").error, /日期/);
  assert.match(engine.addRelationLine([], [], "甲｜会见｜乙｜2026-01-01").error, /须标明/);
});

check("重复边、自环与既有节点类型冲突被拒绝；反向边允许", () => {
  const graph = engine.defaultGraph();
  assert.match(
    engine.addRelationLine(graph.nodes, graph.edges, "美国国家航空航天局｜组织｜阿波罗11号任务｜1969-07-16").error,
    /已经存在/,
  );
  assert.match(
    engine.addRelationLine(graph.nodes, graph.edges, "理查德·尼克松｜会见｜理查德·尼克松｜1969-07-20").error,
    /同一个节点/,
  );
  assert.match(
    engine.addRelationLine(graph.nodes, graph.edges, "理查德·尼克松（组织）｜会见｜阿波罗11号任务｜1969-07-20").error,
    /类型与现有节点冲突/,
  );
  const reverse = engine.addRelationLine(
    graph.nodes,
    graph.edges,
    "阿波罗11号任务｜受组织于｜美国国家航空航天局｜1969-07-16",
  );
  assert.equal(reverse.error, undefined);
  assert.equal(reverse.edges.length, 9);
});

check("第 121 个节点被上限拦住", () => {
  const nodes = Array.from({ length: engine.MAX_NODES }, (_, index) => ({
    id: "n" + index,
    label: "节点" + index,
    type: engine.PERSON,
  }));
  const result = engine.addRelationLine(nodes, [], "节点0｜认识｜超额节点（人物）｜2026-01-01");
  assert.match(result.error, /120 个节点上限/);
});

check("布局无随机性，同输入逐坐标相同且同层节点至少相隔 88px", () => {
  const graph = engine.defaultGraph();
  const levels = engine.relationshipLevels(graph.nodes, graph.edges);
  const first = engine.layoutGraph(graph.nodes, graph.edges, levels, 900);
  const second = engine.layoutGraph(graph.nodes, graph.edges, levels, 900);
  assert.deepEqual(first, second);
  const sameLevel = graph.nodes
    .filter((node) => levels[node.id] === 1)
    .map((node) => first.positions[node.id].y)
    .sort((a, b) => a - b);
  for (let index = 1; index < sameLevel.length; index += 1) {
    assert.ok(sameLevel[index] - sameLevel[index - 1] >= 88);
  }
});

console.log(
  "\n关系图自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"),
);
process.exit(failed === 0 ? 0 : 1);
