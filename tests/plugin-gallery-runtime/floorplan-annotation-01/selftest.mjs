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

const mmPoint = (x, y) => ({ xMm: x * 1000, yMm: y * 1000 });

console.log("户型标注自测 · 第一层：页面按钮共用的内核用例");
const builtIn = E.runSelfTest();
check("内核自带 " + builtIn.total + " 条全过", () => {
  assert.equal(builtIn.failures.length, 0, JSON.stringify(builtIn.failures));
  assert.equal(builtIn.passed, builtIn.total);
});

console.log("\n户型标注自测 · 第二层：规格口径独立断言");
check("已知 4 m × 3 m 矩形面积为 12 m²", () => {
  assert.equal(E.polygonAreaSqM([mmPoint(0,0), mmPoint(4,0), mmPoint(4,3), mmPoint(0,3)]), 12);
});
check("已知 L 形面积为 12 m²", () => {
  assert.equal(E.polygonAreaSqM([
    mmPoint(0,0), mmPoint(4,0), mmPoint(4,2), mmPoint(2,2), mmPoint(2,4), mmPoint(0,4)
  ]), 12);
});
check("共享墙正反重复时只计一次", () => {
  const a = mmPoint(0,0), b = mmPoint(4,0);
  const segments = [{ start: a, end: b }, { start: b, end: a }];
  assert.equal(E.uniqueSegments(segments).length, 1);
  assert.equal(E.uniqueWallLengthMeters(segments), 4);
});
check("吸附步长为 0.01 m", () => {
  const p = E.pointFromMeters(1.234, -2.676);
  assert.deepEqual(p, { xMm: 1230, yMm: -2680 });
  assert.equal(p.xMm % 10, 0);
  assert.equal(Math.abs(p.yMm % 10), 0);
});
check("毫米精度往返无漂移", () => {
  for (const mm of [-999999, -1, 0, 1, 1234, 999999]) {
    assert.equal(E.metersToMillimeters(E.millimetersToMeters(mm)), mm);
  }
});
check("连续墙链只在真正闭合后返回面积", () => {
  const p = [mmPoint(0,0), mmPoint(4,0), mmPoint(4,3), mmPoint(0,3)];
  const open = [{start:p[0],end:p[1]},{start:p[1],end:p[2]},{start:p[2],end:p[3]}];
  const closed = open.concat([{start:p[3],end:p[0]}]);
  assert.equal(E.suiteAreaSqM(open), null);
  assert.equal(E.suiteAreaSqM(closed), 12);
});
check("建筑面积 = 套内面积 × 分摊系数", () => {
  assert.equal(E.buildingAreaSqM(12, 1.15), 13.8);
  assert.equal(E.buildingAreaSqM(12, 0), null);
  assert.equal(E.buildingAreaSqM(12, Number.NaN), null);
});
check("墙厚与门宽口径与规格一致", () => {
  assert.deepEqual(E.WALL_THICKNESSES_MM, [100, 200, 240, 300]);
  assert.deepEqual(E.DOOR_WIDTH_RANGE_MM, [700, 1000]);
  assert.equal(E.STORAGE_MM, 1);
  assert.equal(E.SNAP_MM, 10);
});

console.log("\n户型标注自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
