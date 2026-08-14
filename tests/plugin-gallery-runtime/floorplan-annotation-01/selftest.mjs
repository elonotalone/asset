/*
 * 户型标注 · 计算自测
 *
 *   node tests/plugin-gallery-runtime/floorplan-annotation-01/selftest.mjs
 *
 * 期望值独立抄自 docs/specs/oceanleo-plugins-v1/plugins/floorplan.md §5，
 * 不从 engine.js 反推。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const enginePath = path.resolve(here, "../../../content/active-runtime/plugin/floorplan-annotation-01/engine.js");
const E = require(enginePath);

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

const mm = (x, y) => ({ xMm: x * 1000, yMm: y * 1000 });
const ring = (points) => points.map((point, index) => ({
  start: point,
  end: points[(index + 1) % points.length],
}));

console.log("户型标注自测 · 第一层：内核自带用例表");
const builtIn = E.runSelfTest();
check("内核自带 " + builtIn.total + " 条全过", () => {
  assert.equal(builtIn.failures.length, 0, JSON.stringify(builtIn.failures));
  assert.equal(builtIn.passed, builtIn.total);
});

console.log("\n户型标注自测 · 第二层：规格口径独立断言");
check("已知 4 m × 3 m 矩形面积为 12 m²", () => {
  assert.equal(E.polygonAreaSqM([mm(0, 0), mm(4, 0), mm(4, 3), mm(0, 3)]), 12);
});
check("已知 L 形面积为 12 m²", () => {
  assert.equal(E.polygonAreaSqM([
    mm(0, 0), mm(4, 0), mm(4, 2), mm(2, 2), mm(2, 4), mm(0, 4),
  ]), 12);
});
check("共享墙正反重复时只计一次", () => {
  const a = mm(0, 0), b = mm(4, 0);
  const segments = [{ start: a, end: b }, { start: b, end: a }];
  assert.equal(E.uniqueSegments(segments).length, 1);
  assert.equal(E.uniqueWallLengthMeters(segments), 4);
});
check("吸附步长为 0.01 m", () => {
  const point = E.pointFromMeters(1.234, -2.676);
  assert.deepEqual(point, { xMm: 1230, yMm: -2680 });
  assert.equal(point.xMm % 10, 0);
  assert.equal(Math.abs(point.yMm % 10), 0);
});
check("毫米精度往返无漂移", () => {
  for (const value of [-999999, -1, 0, 1, 1234, 999999]) {
    assert.equal(E.metersToMillimeters(E.millimetersToMeters(value)), value);
  }
});
check("连续墙链只在真正闭合后返回面积", () => {
  const p = [mm(0, 0), mm(4, 0), mm(4, 3), mm(0, 3)];
  const open = [{ start: p[0], end: p[1] }, { start: p[1], end: p[2] }, { start: p[2], end: p[3] }];
  const closed = open.concat([{ start: p[3], end: p[0] }]);
  assert.equal(E.suiteAreaSqM(open), null);
  assert.equal(E.suiteAreaSqM(closed), 12);
});

console.log("\n户型标注自测 · 第三层：这一轮新算的东西（多房间、门窗、命名）");
const bedroom = [mm(0, 0), mm(4, 0), mm(4, 3), mm(0, 3)];
const kitchen = [mm(4, 0), mm(7, 0), mm(7, 3), mm(4, 3)];

check("两间房的套内面积是逐间相加，未闭合的墙链不出数", () => {
  assert.equal(E.totalSuiteAreaSqM([{ name: "主卧", points: bedroom }]), 12);
  assert.equal(E.totalSuiteAreaSqM([
    { name: "主卧", points: bedroom },
    { name: "厨房", points: kitchen },
  ]), 21);
  assert.equal(E.totalSuiteAreaSqM([]), null);
  assert.equal(E.totalSuiteAreaSqM([{ name: "还没闭合", points: [mm(0, 0), mm(4, 0)] }]), null);
});

check("两间房之间的共享墙只出现一次，墙集合为 7 面", () => {
  const walls = E.roomsWallSegments([{ points: bedroom }, { points: kitchen }], []);
  assert.equal(walls.length, 7);
  const keys = walls.map((wall) => E.segmentKey(wall));
  assert.equal(new Set(keys).size, 7);
  assert.ok(keys.includes(E.segmentKey({ start: mm(4, 0), end: mm(4, 3) })), "共享墙不在墙集合里");
});

check("还没闭合的那一笔也算进墙集合，但不产生房间", () => {
  const walls = E.roomsWallSegments([{ points: bedroom }], [mm(0, 3), mm(0, 5), mm(2, 5)]);
  assert.equal(walls.length, 6);
  assert.equal(E.totalSuiteAreaSqM([{ points: bedroom }]), 12);
});

check("房间名与面积落在房间内部（面积加权重心）", () => {
  assert.deepEqual(E.polygonCentroid(bedroom), { xMm: 2000, yMm: 1500 });
  const lShape = [mm(0, 0), mm(4, 0), mm(4, 2), mm(2, 2), mm(2, 4), mm(0, 4)];
  const centroid = E.polygonCentroid(lShape);
  // L 形的重心必须仍落在 L 形内部：外接矩形中心 (2, 2) 恰好在缺口边界上，不能拿来用。
  assert.ok(centroid.xMm < 2000 || centroid.yMm < 2000, `重心 ${JSON.stringify(centroid)} 落到了缺口里`);
  assert.equal(E.polygonCentroid([mm(0, 0), mm(1, 0)]), null);
});

check("900 mm 门洞把 4 m 墙切成两段，两段加洞宽等于墙长", () => {
  const wall = { start: mm(0, 0), end: mm(4, 0) };
  const door = { id: "d1", wallKey: E.segmentKey(wall), kind: "door", widthMm: 900, centerMm: 2000 };
  const spans = E.wallSolidSpansMm(wall, [door]);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans[0], { fromMm: 0, toMm: 1550 });
  assert.deepEqual(spans[1], { fromMm: 2450, toMm: 4000 });
  const solid = spans.reduce((sum, span) => sum + (span.toMm - span.fromMm), 0);
  assert.equal(solid + door.widthMm, 4000);
});

check("没有洞口时墙是完整一段；洞口贴到墙端只剩一段", () => {
  const wall = { start: mm(0, 0), end: mm(3, 0) };
  assert.deepEqual(E.wallSolidSpansMm(wall, []), [{ fromMm: 0, toMm: 3000 }]);
  const edge = { wallKey: E.segmentKey(wall), kind: "window", widthMm: 1000, centerMm: 500 };
  assert.deepEqual(E.wallSolidSpansMm(wall, [edge]), [{ fromMm: 1000, toMm: 3000 }]);
});

check("洞口必须整段落在墙上，装不下就明确拒绝", () => {
  assert.equal(E.clampOpeningCenterMm(800, 900, 400), null);
  assert.equal(E.clampOpeningCenterMm(900, 900, 450), null);
  assert.equal(E.clampOpeningCenterMm(4000, 900, 100), 450);
  assert.equal(E.clampOpeningCenterMm(4000, 900, 3990), 3550);
  assert.equal(E.clampOpeningCenterMm(4000, 900, 2000), 2000);
});

check("同一面墙上的洞口不许互相重叠", () => {
  const wall = { start: mm(0, 0), end: mm(4, 0) };
  const key = E.segmentKey(wall);
  const existing = [{ id: "d1", wallKey: key, kind: "door", widthMm: 900, centerMm: 1000 }];
  assert.equal(E.openingOverlaps(existing, wall, { id: "d2", wallKey: key, widthMm: 900, centerMm: 1400 }), true);
  assert.equal(E.openingOverlaps(existing, wall, { id: "d2", wallKey: key, widthMm: 900, centerMm: 2600 }), false);
  const otherWall = { start: mm(0, 0), end: mm(0, 3) };
  assert.equal(E.openingOverlaps(existing, otherWall, {
    id: "d3", wallKey: E.segmentKey(otherWall), widthMm: 900, centerMm: 1000,
  }), false);
});

check("洞口只认自己那面墙", () => {
  const wall = { start: mm(0, 0), end: mm(4, 0) };
  const other = { start: mm(4, 0), end: mm(4, 3) };
  const openings = [
    { id: "d1", wallKey: E.segmentKey(wall), kind: "door", widthMm: 900, centerMm: 2000 },
    { id: "w1", wallKey: E.segmentKey(other), kind: "window", widthMm: 1200, centerMm: 1500 },
  ];
  assert.equal(E.openingsOfWall(openings, wall).length, 1);
  assert.equal(E.openingsOfWall(openings, wall)[0].id, "d1");
  assert.deepEqual(E.openingSpanMm(openings[1]), { fromMm: 900, toMm: 2100 });
});

check("点到墙的投影给出沿墙偏移与垂距，越界被夹回墙内", () => {
  const wall = { start: mm(0, 0), end: mm(4, 0) };
  const inside = E.projectOntoSegment(wall, { xMm: 1500, yMm: 120 });
  assert.equal(inside.offsetMm, 1500);
  assert.equal(inside.distanceMm, 120);
  assert.equal(inside.lengthMm, 4000);
  assert.equal(inside.inside, true);
  const beyond = E.projectOntoSegment(wall, { xMm: 5000, yMm: 0 });
  assert.equal(beyond.offsetMm, 4000);
  assert.equal(beyond.inside, false);
  assert.equal(E.projectOntoSegment({ start: mm(1, 1), end: mm(1, 1) }, mm(0, 0)), null);
});

check("最近的那面墙才被选中，超出容差时谁都不选", () => {
  const walls = E.roomsWallSegments([{ points: bedroom }], []);
  const hit = E.nearestWall(walls, { xMm: 2000, yMm: 80 }, 300);
  assert.equal(E.segmentKey(hit.wall), E.segmentKey({ start: mm(0, 0), end: mm(4, 0) }));
  assert.equal(hit.offsetMm, 2000);
  assert.equal(E.nearestWall(walls, { xMm: 2000, yMm: 1500 }, 300), null);
});

check("外轮廓总尺寸与墙集合一致", () => {
  const bounds = E.boundsOfSegments(E.roomsWallSegments([{ points: bedroom }, { points: kitchen }], []));
  assert.equal(bounds.widthM, 7);
  assert.equal(bounds.heightM, 3);
  assert.equal(bounds.minXMm, 0);
  assert.equal(bounds.maxXMm, 7000);
});

check("建筑面积只在给了分摊系数时才算", () => {
  assert.equal(E.buildingAreaSqM(12, 1.15), 13.8);
  assert.equal(E.buildingAreaSqM(12, 0), null);
  assert.equal(E.buildingAreaSqM(12, Number.NaN), null);
});

check("墙厚、门宽与存储精度口径与规格一致", () => {
  assert.deepEqual(E.WALL_THICKNESSES_MM, [100, 200, 240, 300]);
  assert.deepEqual(E.DOOR_WIDTH_RANGE_MM, [700, 1000]);
  assert.equal(E.STORAGE_MM, 1);
  assert.equal(E.SNAP_MM, 10);
  assert.ok(E.DEFAULT_DOOR_MM >= E.DOOR_WIDTH_RANGE_MM[0] && E.DEFAULT_DOOR_MM <= E.DOOR_WIDTH_RANGE_MM[1]);
  assert.ok(E.WALL_THICKNESSES_MM.includes(E.DEFAULT_WALL_MM));
});

console.log("\n户型标注自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
