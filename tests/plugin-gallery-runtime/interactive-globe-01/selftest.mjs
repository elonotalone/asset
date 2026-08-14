/*
 * 地球仪 · 计算自测
 *
 *   node tests/plugin-gallery-runtime/interactive-globe-01/selftest.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/interactive-globe-01",
);
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

console.log("地球仪自测 · 第一层：页面「运行自测」使用的内核用例表");
const report = engine.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n地球仪自测 · 第二层：期望值独立抄自规格");

check("平均地球半径固定为 6 371 008.8 m", () => {
  assert.equal(engine.EARTH_RADIUS_M, 6371008.8);
});

check("haversine：赤道经差 1° = 111 195.0802335 m", () => {
  const got = engine.haversine([0, 0], [1, 0]);
  assert.ok(Math.abs(got - 111195.0802335329) < 1e-6, `得到 ${got}`);
});

check("haversine：北京→上海 = 1 067 311.6451587 m", () => {
  const got = engine.haversine([116.4074, 39.9042], [121.4737, 31.2304]);
  assert.ok(Math.abs(got - 1067311.645158726) < 1e-6, `得到 ${got}`);
});

check("逐站分段、累计与总长一致", () => {
  const route = engine.routeSegments([[0, 0], [1, 0], [2, 0]]);
  assert.equal(route.rows.length, 3);
  assert.ok(Math.abs(route.rows[1].segmentM - 111195.0802335329) < 1e-6);
  assert.equal(route.rows[2].cumulativeM, route.totalM);
});

check("太阳赤纬全年在 ±23.44° 内，夏至与冬至符号正确", () => {
  const summer = engine.solarPosition("2026-06-21T12:00:00Z").declinationDeg;
  const winter = engine.solarPosition("2026-12-21T12:00:00Z").declinationDeg;
  assert.ok(summer > 23.3 && summer <= 23.44 + 0.02, `夏至 ${summer}`);
  assert.ok(winter < -23.3 && winter >= -23.44 - 0.02, `冬至 ${winter}`);
  for (let month = 0; month < 12; month++) {
    const value = engine.solarPosition(new Date(Date.UTC(2026, month, 14, 12))).declinationDeg;
    assert.ok(Math.abs(value) <= 23.44 + 0.02, `${month + 1} 月为 ${value}`);
  }
});

check("昼夜分界由太阳位置推得且与太阳向量正交", () => {
  const solar = engine.solarPosition("2026-08-14T12:00:00Z");
  const sun = engine.solarVector(solar);
  const points = engine.terminatorPoints(solar, 180);
  assert.ok(points.length >= 181);
  for (const point of points.filter((_, index) => index % 30 === 0)) {
    assert.ok(Math.abs(engine.dot(engine.vector(point), sun)) < 1e-12);
  }
  assert.equal(engine.daylight([solar.subsolarLongitudeDeg, solar.declinationDeg], solar), true);
  assert.equal(engine.daylight([engine.normalize180(solar.subsolarLongitudeDeg + 180), -solar.declinationDeg], solar), false);
});

check("经度每 15° 是 1 小时太阳时差", () => {
  assert.equal(engine.solarTimeDifference(0, 15), 1);
  assert.equal(engine.solarTimeDifference(15, 0), -1);
  assert.equal(engine.formatSolarDifference(1), "+1.00 h");
});

check("正交投影隐藏后半球并能反投影前半球", () => {
  const front = engine.projectOrthographic([20, 15], 20, 15, 245);
  assert.equal(front.visible, true);
  const roundTrip = engine.unprojectOrthographic([front.x, front.y], 20, 15, 245);
  assert.ok(Math.abs(roundTrip[0] - 20) < 1e-10);
  assert.ok(Math.abs(roundTrip[1] - 15) < 1e-10);
  assert.equal(engine.projectOrthographic([-160, -15], 20, 15, 245).visible, false);
});

check("五类规范配色逐项固定", () => {
  assert.deepEqual(engine.COLORS, {
    ocean: "#0B3D5C",
    land: "#E8DCC8",
    border: "#4A5568",
    graticule: "#94A3B8",
    night: "rgba(5, 12, 24, 0.48)",
  });
});

check("坏日期、坏坐标和坏经度明确拒绝", () => {
  assert.equal(engine.solarPosition("not-a-date"), null);
  assert.equal(engine.haversine([181, 0], [0, 0]), null);
  assert.equal(engine.routeSegments([[0, 0], [0, 91]]), null);
  assert.equal(engine.solarTimeDifference(0, 181), null);
});

check("离线陆地和国界真实可解码", () => {
  const world = engine.worldGeometry();
  assert.ok(world.land.length > 0, "没有陆地路径");
  assert.ok(world.countries.length > 0, "没有国界路径");
  assert.ok(world.land.some((polygon) => polygon.some((ring) => ring.length > 20)));
});

check("Natural Earth 数据与 world-atlas 再分发许可分开标记", () => {
  assert.equal(engine.WORLD_DATA_META.source, "Natural Earth 4.1.0");
  assert.equal(engine.WORLD_DATA_META.sourceLicense, "public domain");
  assert.equal(engine.WORLD_DATA_META.package, "world-atlas 2.0.2");
  assert.equal(engine.WORLD_DATA_META.packageLicense, "ISC");
});

console.log("\n地球仪自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
