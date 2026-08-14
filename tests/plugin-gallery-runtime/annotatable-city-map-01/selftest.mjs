/*
 * 地图 · 计算自测
 *
 *   node tests/plugin-gallery-runtime/annotatable-city-map-01/selftest.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/annotatable-city-map-01",
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

console.log("地图自测 · 第一层：页面「运行自测」使用的内核用例表");
const report = engine.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n地图自测 · 第二层：期望值独立抄自规格");

check("平均地球半径固定为 6 371 008.8 m", () => {
  assert.equal(engine.EARTH_RADIUS_M, 6371008.8);
});

check("坐标顺序是 CRS84 [经度, 纬度]", () => {
  const projected = engine.projectEquirectangular([180, 90], 960, 480);
  assert.deepEqual(projected, [960, 0]);
  assert.deepEqual(engine.unprojectEquirectangular(projected, 960, 480), [180, 90]);
});

check("haversine：赤道经差 1° = 111 195.0802335 m", () => {
  const got = engine.haversine([0, 0], [1, 0]);
  assert.ok(Math.abs(got - 111195.0802335329) < 1e-6, `得到 ${got}`);
});

check("haversine：北京→上海 = 1 067 311.6451587 m", () => {
  const got = engine.haversine([116.4074, 39.9042], [121.4737, 31.2304]);
  assert.ok(Math.abs(got - 1067311.645158726) < 1e-6, `得到 ${got}`);
});

check("分段距离与累计、总长一致", () => {
  const route = engine.routeSegments([[0, 0], [1, 0], [2, 0]]);
  assert.equal(route.rows.length, 3);
  assert.ok(Math.abs(route.rows[1].segmentM - 111195.0802335329) < 1e-6);
  assert.equal(route.rows[2].cumulativeM, route.totalM);
});

check("路线抽稀后的长度差不超过 0.5%", () => {
  const source = [[0, 0], [0.5, 0.0001], [1, 0], [1.5, -0.0001], [2, 0]];
  const result = engine.simplificationReport(source, 0.5);
  assert.ok(result.simplified.length < source.length, "用例应能移除近共线中间点");
  assert.ok(result.errorPercent <= 0.5, `长度差为 ${result.errorPercent}%`);
});

check("面积小于 1 000 m² 用 m²，边界起用 km²", () => {
  assert.equal(engine.formatArea(999), "999 m²");
  assert.equal(engine.formatArea(1000), "0.001 km²");
});

check("五个辨识色逐项符合规格", () => {
  assert.deepEqual(engine.COLORS, {
    land: "#F2EDE3",
    water: "#A8C8DC",
    coast: "#3F6478",
    pin: "#AE3A0B",
    route: "#1D4ED8",
  });
});

check("坏坐标和坏路线明确拒绝", () => {
  assert.equal(engine.coordinate([181, 0]), null);
  assert.equal(engine.coordinate([0, 91]), null);
  assert.equal(engine.coordinate([Number.NaN, 0]), null);
  assert.equal(engine.routeSegments([[0, 0], [181, 0]]), null);
});

check("首屏离线轮廓真实可解码", () => {
  const world = engine.worldGeometry();
  assert.ok(world.land.length > 0, "没有陆地路径");
  assert.ok(world.countries.length > 0, "没有国家边界路径");
  assert.ok(world.land.some((polygon) => polygon.some((ring) => ring.length > 20)));
});

check("数据来源与许可分开标记", () => {
  assert.equal(engine.WORLD_DATA_META.source, "Natural Earth 4.1.0");
  assert.equal(engine.WORLD_DATA_META.sourceLicense, "public domain");
  assert.equal(engine.WORLD_DATA_META.package, "world-atlas 2.0.2");
  assert.equal(engine.WORLD_DATA_META.packageLicense, "ISC");
});

console.log("\n地图自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
