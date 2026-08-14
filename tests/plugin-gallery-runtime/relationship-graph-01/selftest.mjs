/*
 * 关系图 · 计算自测
 *
 *   node tests/plugin-gallery-runtime/relationship-graph-01/selftest.mjs
 *
 * 内核这一版改了三处算法，判据跟着改的原因写在这里，不是为了让测试变绿：
 *   1. 分层坐标删掉了 —— 设计文档 §3.5 明确「按层分列一定画不对」，
 *      §6 把「排成学习层级」列为做坏样子。所以旧的「同层至少相隔 88px」不再有对象，
 *      换成对簇团布局的断言：确定性、相连的近、补一条关系时旧对象不整张重排。
 *   2. 日期从必填退成可选 —— 设计文档 §0（压过其余各节）写的是「类型和日期只有材料
 *      需要时才就地补充」。所以判据变成「空日期可以，写了就必须是真日期」。
 *   3. 密度、圈秩、最大度数这些数不再上屏（§3 全部删除），内核也不再算，
 *      对应断言随之删除；仍然上屏的东西（路径、中介、簇团、方向）判据全部保留并加强。
 */
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
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

console.log("关系图自测 · 第一层：内核自带用例表");
const report = engine.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

/* 一份记者会写下的真材料：两个人通过一家公司和一个基金会绕到一起。 */
function material() {
  let nodes = [];
  let edges = [];
  const write = (from, label, to, date) => {
    const result = engine.addRelation(nodes, edges, { from, label, to, date });
    assert.equal(result.error, undefined, `写不进去：${from} ${label} ${to} —— ${result.error}`);
    nodes = result.nodes;
    edges = result.edges;
  };
  write("周敏（人物）", "担任董事", "远岸控股（组织）", "2019-04-08");
  write("远岸控股", "持有", "远岸科技（组织）", "2020-06-30");
  write("远岸控股", "设立", "岸山基金会（组织）", "2020-11-02");
  write("陈立言（人物）", "任理事", "岸山基金会", "2021-03-15");
  write("陈立言", "在听证会上作证", "市政听证会（事件）", "2022-09-06");
  write("周敏", "与陈立言通话", "陈立言", "2022-08-30");
  return { nodes, edges };
}

console.log("\n关系图自测 · 第二层：规格口径独立断言");

check("这份材料本身合法：6 个对象、6 条关系，校验无错", () => {
  const { nodes, edges } = material();
  assert.equal(nodes.length, 6);
  assert.equal(edges.length, 6);
  assert.deepEqual(engine.validateGraph(nodes, edges), []);
});

check("一句话进来就长出两端，名字原样保留", () => {
  const result = engine.addRelation([], [], { from: "周敏（人物）", label: "担任董事", to: "远岸控股（组织）" });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.nodes.map((node) => node.label), ["周敏", "远岸控股"]);
  assert.deepEqual(result.nodes.map((node) => node.type), ["person", "organization"]);
  assert.equal(result.edges[0].label, "担任董事");
});

check("类型是可选的：不写就不标，后来补写会落到同一个对象上", () => {
  const first = engine.addRelation([], [], { from: "周敏", label: "担任董事", to: "远岸控股" });
  assert.equal(first.nodes[0].type, null);
  const second = engine.addRelation(first.nodes, first.edges, { from: "周敏（人物）", label: "出席", to: "市政听证会（事件）" });
  assert.equal(second.error, undefined);
  assert.equal(second.nodes.length, 3, "补类型不该再造一个「周敏」");
  assert.equal(second.nodes[0].type, "person");
});

check("已经是另一种对象时明确拒绝，不悄悄改类型", () => {
  const { nodes, edges } = material();
  assert.match(
    engine.addRelation(nodes, edges, { from: "周敏（组织）", label: "持有", to: "远岸科技" }).error,
    /已经是另一种对象/,
  );
});

check("日期可以留空；写了就必须是真实的年-月-日", () => {
  const blank = engine.addRelation([], [], { from: "甲", label: "会见", to: "乙", date: "  " });
  assert.equal(blank.error, undefined);
  assert.equal(blank.edges[0].date, "");
  assert.match(engine.addRelation([], [], { from: "甲", label: "会见", to: "乙", date: "2025-02-30" }).error, /真实的/);
  assert.match(engine.addRelation([], [], { from: "甲", label: "会见", to: "乙", date: "2025/02/03" }).error, /真实的/);
  assert.equal(engine.validDate("2024-02-29"), true);
  assert.equal(engine.validDate("2025-02-29"), false);
});

check("两端不能空、关系原话不能空、不能连到自己", () => {
  assert.match(engine.addRelation([], [], { from: "", label: "会见", to: "乙" }).error, /两端/);
  assert.match(engine.addRelation([], [], { from: "甲", label: " ", to: "乙" }).error, /什么关系/);
  assert.match(engine.addRelation([], [], { from: "甲", label: "会见", to: "甲" }).error, /自己/);
});

check("四项全同才算重复；反向、改日期、改关系原话都不算", () => {
  const { nodes, edges } = material();
  const same = { from: "周敏", label: "担任董事", to: "远岸控股", date: "2019-04-08" };
  assert.match(engine.addRelation(nodes, edges, same).error, /已经在图上/);
  assert.equal(engine.addRelation(nodes, edges, { ...same, from: "远岸控股", to: "周敏" }).error, undefined);
  assert.equal(engine.addRelation(nodes, edges, { ...same, date: "2021-04-08" }).error, undefined);
  assert.equal(engine.addRelation(nodes, edges, { ...same, label: "辞任董事" }).error, undefined);
});

check("入度、出度、总度逐条按方向计", () => {
  const { nodes, edges } = material();
  const degree = engine.degrees(nodes, edges);
  const idOf = (label) => nodes.filter((node) => node.label === label)[0].id;
  assert.deepEqual(degree[idOf("远岸控股")], { in: 1, out: 2, total: 3 });
  assert.deepEqual(degree[idOf("市政听证会")], { in: 1, out: 0, total: 1 });
});

check("枢纽按总度数排出来，同分按名字定序（不许随机）", () => {
  const { nodes, edges } = material();
  const ranked = engine.hubs(nodes, edges);
  assert.equal(ranked[0].label, "远岸控股");
  assert.deepEqual(engine.hubs(nodes, edges).map((item) => item.label), ranked.map((item) => item.label));
});

check("弱连通分量忽略方向，互不相连的两团各算一个", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id, label: id, type: engine.PERSON }));
  const edges = [
    { from: "b", to: "a", label: "认识", date: "" },
    { from: "c", to: "d", label: "认识", date: "" },
  ];
  assert.equal(engine.weakComponents(nodes, edges).length, 2);
  assert.equal(engine.weakComponents(nodes, []).length, 4);
});

check("最短路径忽略方向，逐个中介都在，且带着沿途的关系原话", () => {
  const { nodes, edges } = material();
  const idOf = (label) => nodes.filter((node) => node.label === label)[0].id;
  const found = engine.shortestPath(nodes, edges, idOf("周敏"), idOf("市政听证会"));
  assert.deepEqual(found.labels, ["周敏", "陈立言", "市政听证会"]);
  assert.equal(found.length, 2);
  assert.equal(found.intermediaries, 1);
  assert.deepEqual(found.steps.map((step) => step.labels[0]), ["与陈立言通话", "在听证会上作证"]);
});

check("路径长度是边数，中介数是路径对象数减二", () => {
  const { nodes, edges } = material();
  const idOf = (label) => nodes.filter((node) => node.label === label)[0].id;
  const found = engine.shortestPath(nodes, edges, idOf("周敏"), idOf("远岸科技"));
  assert.equal(found.length, 2);
  assert.equal(found.intermediaries, found.ids.length - 2);
});

check("不连通就返回空，不伪造一条路径", () => {
  const { nodes, edges } = material();
  const lonely = nodes.concat([{ id: "solo", label: "孤立的人", type: engine.PERSON }]);
  const idOf = (label) => nodes.filter((node) => node.label === label)[0].id;
  assert.equal(engine.shortestPath(lonely, edges, idOf("周敏"), "solo"), null);
  assert.equal(engine.shortestPath(nodes, edges, idOf("周敏"), "不存在"), null);
  assert.equal(engine.shortestPath(nodes, edges, idOf("周敏"), idOf("周敏")), null);
});

check("同一对对象之间的多条关系各自编号，好各自弯开", () => {
  const edges = [
    { from: "a", to: "b", label: "持有", date: "" },
    { from: "b", to: "a", label: "汇报给", date: "" },
    { from: "a", to: "b", label: "共同投资", date: "" },
    { from: "a", to: "c", label: "设立", date: "" },
  ];
  const marks = engine.parallelIndex(edges);
  assert.deepEqual(marks.map((mark) => mark.count), [3, 3, 3, 1]);
  assert.deepEqual(marks.map((mark) => mark.index), [0, 1, 2, 0]);
});

check("对称关系不加箭头，不对称关系保留方向", () => {
  for (const symmetric of ["夫妻", "与陈立言通话", "同学", "共同投资", "多次会见"]) {
    assert.equal(engine.isSymmetric(symmetric), true, symmetric);
  }
  for (const directed of ["持有", "设立", "汇报给", "担任董事", "在听证会上作证"]) {
    assert.equal(engine.isSymmetric(directed), false, directed);
  }
});

check("第 121 个对象被上限拦住，旧数据不截断", () => {
  const nodes = Array.from({ length: engine.MAX_NODES }, (_, index) => ({
    id: "n" + index, label: "对象" + index, type: engine.PERSON,
  }));
  const result = engine.addRelation(nodes, [], { from: "对象0", label: "认识", to: "多出来的人" });
  assert.match(result.error, /120 个对象/);
  assert.equal(nodes.length, engine.MAX_NODES);
});

console.log("\n关系图自测 · 第三层：这一版换掉的布局（簇团，不是层级）");

check("布局是确定的：同一份材料重算，坐标逐项一致", () => {
  const { nodes, edges } = material();
  const first = engine.layoutClusters(nodes, edges, { width: 1000, height: 620 });
  const second = engine.layoutClusters(nodes, edges, { width: 1000, height: 620 });
  assert.deepEqual(first.positions, second.positions);
  assert.equal(Object.keys(first.positions).length, nodes.length);
});

check("相连的被拉近，无关的让开：不再是按层排队", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id, label: "对象" + id, type: engine.PERSON }));
  const edges = [
    { from: "a", to: "b", label: "夫妻", date: "" },
    { from: "c", to: "d", label: "夫妻", date: "" },
  ];
  const at = engine.layoutClusters(nodes, edges, { width: 1000, height: 620 }).positions;
  const span = (one, two) => Math.hypot(at[one].x - at[two].x, at[one].y - at[two].y);
  assert.ok(span("a", "b") < span("a", "c"), "相连的两个应比无关的两个更近");
  assert.ok(span("c", "d") < span("b", "d"), "另一团也要成团");
  // 两团之间要留下明显空隙：团心之间的距离大于团内距离
  const midOf = (one, two) => ({ x: (at[one].x + at[two].x) / 2, y: (at[one].y + at[two].y) / 2 });
  const left = midOf("a", "b");
  const right = midOf("c", "d");
  assert.ok(Math.hypot(left.x - right.x, left.y - right.y) > span("a", "b"), "两团没有分开");
});

check("链状材料不斜挤在一条窄带里：长轴转到画布的长边上", () => {
  const nodes = ["a", "b", "c", "d", "e"].map((id) => ({ id, label: "对象" + id, type: engine.PERSON }));
  const edges = [
    { from: "a", to: "b", label: "持有", date: "" },
    { from: "b", to: "c", label: "持有", date: "" },
    { from: "c", to: "d", label: "持有", date: "" },
    { from: "d", to: "e", label: "持有", date: "" },
  ];
  const wide = engine.layoutClusters(nodes, edges, { width: 1200, height: 700 }).positions;
  const spanOf = (at, axis) => {
    const values = Object.values(at).map((point) => point[axis]);
    return Math.max(...values) - Math.min(...values);
  };
  assert.ok(spanOf(wide, "x") > spanOf(wide, "y"), "宽画布上应当横着铺开");
  const tall = engine.layoutClusters(nodes, edges, { width: 700, height: 1200 }).positions;
  assert.ok(spanOf(tall, "y") > spanOf(tall, "x"), "窄高画布上应当竖着铺开");
});

check("整张网留在画布里，不跑到台面外面", () => {
  const { nodes, edges } = material();
  const sizes = {};
  for (const node of nodes) sizes[node.id] = { w: 40 + node.label.length * 18, h: 44 };
  const at = engine.layoutClusters(nodes, edges, { width: 1200, height: 640, sizes, margin: 74 }).positions;
  for (const node of nodes) {
    assert.ok(at[node.id].x - sizes[node.id].w / 2 > 0, `${node.label} 越过左边`);
    assert.ok(at[node.id].x + sizes[node.id].w / 2 < 1200, `${node.label} 越过右边`);
    assert.ok(at[node.id].y - sizes[node.id].h / 2 > 0, `${node.label} 越过上边`);
    assert.ok(at[node.id].y + sizes[node.id].h / 2 < 640, `${node.label} 越过下边`);
  }
});

check("枢纽在中间：连得最多的那一个离全图重心最近", () => {
  const { nodes, edges } = material();
  const at = engine.layoutClusters(nodes, edges, { width: 1000, height: 620 }).positions;
  const cx = Object.values(at).reduce((sum, point) => sum + point.x, 0) / nodes.length;
  const cy = Object.values(at).reduce((sum, point) => sum + point.y, 0) / nodes.length;
  const distance = (id) => Math.hypot(at[id].x - cx, at[id].y - cy);
  const ranked = engine.hubs(nodes, edges);
  const leaf = ranked[ranked.length - 1];
  assert.ok(distance(ranked[0].id) < distance(leaf.id), "枢纽应比末端更靠里");
});

check("牌面互不重叠：按各自名字宽度留出的方框两两分开", () => {
  const { nodes, edges } = material();
  const sizes = {};
  for (const node of nodes) sizes[node.id] = { w: 40 + node.label.length * 18, h: 44 };
  const at = engine.layoutClusters(nodes, edges, { width: 1100, height: 640, sizes }).positions;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const one = nodes[i];
      const two = nodes[j];
      const needX = (sizes[one.id].w + sizes[two.id].w) / 2;
      const needY = (sizes[one.id].h + sizes[two.id].h) / 2;
      const apartX = Math.abs(at[one.id].x - at[two.id].x);
      const apartY = Math.abs(at[one.id].y - at[two.id].y);
      assert.ok(apartX >= needX * 0.92 || apartY >= needY * 0.92,
        `${one.label} 与 ${two.label} 压在一起`);
    }
  }
});

check("补一条关系时，已经摆好的对象基本留在原位", () => {
  const { nodes, edges } = material();
  const before = engine.layoutClusters(nodes, edges, { width: 1000, height: 620 }).positions;
  const grown = engine.addRelation(nodes, edges, { from: "陈立言", label: "任监事", to: "远岸科技" });
  const seeded = engine.layoutClusters(grown.nodes, grown.edges, { width: 1000, height: 620, seed: before }).positions;
  const fresh = engine.layoutClusters(grown.nodes, grown.edges, { width: 1000, height: 620 }).positions;
  const drift = (after) => nodes.reduce(
    (sum, node) => sum + Math.hypot(after[node.id].x - before[node.id].x, after[node.id].y - before[node.id].y), 0,
  ) / nodes.length;
  assert.ok(drift(seeded) < drift(fresh), `沿用旧位反而更乱：${drift(seeded)} vs ${drift(fresh)}`);
});

check("零个对象、一个对象都不崩", () => {
  assert.deepEqual(engine.layoutClusters([], []).positions, Object.create(null));
  const one = engine.layoutClusters([{ id: "a", label: "甲", type: engine.PERSON }], []).positions;
  assert.ok(Number.isFinite(one.a.x) && Number.isFinite(one.a.y));
  assert.deepEqual(engine.hubs([], []), []);
  assert.equal(engine.analyze([], []).componentCount, 0);
});

check("这一版不再随包发分层坐标与密度口径", () => {
  assert.equal(engine.layoutGraph, undefined);
  assert.equal(engine.relationshipLevels, undefined);
  assert.equal(engine.directedDensity, undefined);
  assert.equal(engine.undirectedDensity, undefined);
  assert.equal(engine.cycleRank, undefined);
  assert.equal(engine.defaultGraph, undefined, "首屏不许有出厂样例");
});

console.log("\n关系图自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
