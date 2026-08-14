/*
 * 地图 · 计算自测
 *
 *   node tests/plugin-gallery-runtime/annotatable-city-map-01/selftest.mjs
 *
 * 期望值独立抄自 docs/specs/oceanleo-plugins-v1/plugins/city-map.md §5，不从 engine.js 反推。
 * 这一版删掉了随包的全球轮廓（world-atlas），所以「首屏离线轮廓可解码」那一条
 * 不再存在；换上的是它真正在算的东西：地址怎么进来、按真实比例摆开、以及顺序。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/annotatable-city-map-01");
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

console.log("地图自测 · 第一层：内核自带用例表");
const report = engine.runSelfTest();
for (const item of report.failures) console.log("  FAIL " + item.name + "\n       " + item.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n地图自测 · 第二层：规格口径独立断言");

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

check("分段距离与累计、总长一致，首个地点分段为 0", () => {
  const route = engine.routeSegments([[0, 0], [1, 0], [2, 0]]);
  assert.equal(route.rows.length, 3);
  assert.equal(route.rows[0].segmentM, 0);
  assert.ok(Math.abs(route.rows[1].segmentM - 111195.0802335329) < 1e-6);
  assert.equal(route.rows[2].cumulativeM, route.totalM);
});

check("坏坐标与坏路线明确拒绝", () => {
  assert.equal(engine.coordinate([181, 0]), null);
  assert.equal(engine.coordinate([0, 91]), null);
  assert.equal(engine.coordinate([Number.NaN, 0]), null);
  assert.equal(engine.coordinate([0]), null);
  assert.equal(engine.routeSegments([[0, 0], [181, 0]]), null);
});

check("围合面积用球面求和，少于 3 个点不出数", () => {
  assert.equal(engine.polygonArea([[0, 0], [1, 0]]), null);
  // 赤道上 1° × 1° 的方块：球面公式给出的量级必须落在 12 300 km² 上下 1%。
  const area = engine.polygonArea([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const expected = 12308.0e6;
  assert.ok(Math.abs(area - expected) / expected < 0.01, `得到 ${area}`);
});

check("自交的环不算围合：面积只在一条不打结的圈上才成立", () => {
  assert.equal(engine.ringIsSimple([[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]]), true);
  assert.equal(engine.ringIsSimple([[0, 0], [0.01, 0.01], [0.01, 0], [0, 0.01]]), false, "8 字形应被判为打结");
  assert.equal(engine.ringIsSimple([[0, 0], [0.01, 0]]), false, "两个点围不出东西");
  // 一条真实的折返顺序（先东进城再折回西北）在图上就是打结的
  const zigzag = [[-9.1364, 38.7075], [-9.1335, 38.7139], [-9.1396, 38.7118], [-9.1303, 38.7119]];
  assert.equal(engine.ringIsSimple(zigzag), false);
  assert.equal(engine.ringIsSimple(engine.bestOrder(zigzag).order.map((index) => zigzag[index])), true);
});

check("面积小于 1 000 m² 用 m²，边界起用 km²", () => {
  assert.equal(engine.formatArea(999), "999 m²");
  assert.equal(engine.formatArea(1000), "0.001 km²");
  assert.equal(engine.formatArea(150e6), "150 km²");
});

check("距离小于 1 000 m 取整米，其后 km 两位、百公里起一位", () => {
  assert.equal(engine.formatDistance(999.4), "999 m");
  assert.equal(engine.formatDistance(1234), "1.23 km");
  assert.equal(engine.formatDistance(1234567), "1 234.6 km");
});

console.log("\n地图自测 · 第三层：这一版新算的东西（地址入口、局部投影、顺序）");

check("谷歌地图链接：@纬度,经度 与 !3d!4d 两种写法都读得出", () => {
  const at = engine.parseLocationInput("https://www.google.com/maps/place/x/@38.7069,-9.1466,17z/data=!4m2");
  assert.deepEqual(at.coordinate, [-9.1466, 38.7069]);
  const bang = engine.parseLocationInput("https://www.google.com/maps/place/x/data=!3d38.7139!4d-9.1226");
  assert.deepEqual(bang.coordinate, [-9.1226, 38.7139]);
  assert.match(at.from, /谷歌/);
});

check("高德链接的 position 是「经度,纬度」，不许读反", () => {
  const got = engine.parseLocationInput("https://uri.amap.com/marker?position=116.481,39.990&name=x");
  assert.deepEqual(got.coordinate, [116.481, 39.99]);
  assert.match(got.from, /高德/);
});

check("人手写的一对数按「纬度,经度」读", () => {
  assert.deepEqual(engine.parseLocationInput("38.7069, -9.1466").coordinate, [-9.1466, 38.7069]);
  assert.deepEqual(engine.parseLocationInput("  38.7069 -9.1466 ").coordinate, [-9.1466, 38.7069]);
  assert.deepEqual(engine.parseLocationInput("38.7069，-9.1466").coordinate, [-9.1466, 38.7069]);
});

check("读不出坐标或越界时返回空，不猜", () => {
  assert.equal(engine.parseLocationInput(""), null);
  assert.equal(engine.parseLocationInput("里斯本 Cais do Sodré"), null);
  assert.equal(engine.parseLocationInput("https://example.com/x?q=abc,def"), null);
  assert.equal(engine.parseLocationInput("95.5, 200.1"), null);
  assert.equal(engine.parseLocationInput("?q=91.0,0.0"), null);
});

check("局部投影是等比例的：图上量的距离与 haversine 差 < 0.1%", () => {
  const places = [
    [-9.1466, 38.7069],
    [-9.1226, 38.7139],
    [-9.1487, 38.7093],
    [-9.1421, 38.7101],
  ];
  const center = engine.centerOf(places);
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = engine.projectLocal(places[i], center);
      const b = engine.projectLocal(places[j], center);
      const flat = Math.hypot(b.eastM - a.eastM, b.northM - a.northM);
      const great = engine.haversine(places[i], places[j]);
      assert.ok(Math.abs(flat - great) / great < 0.001, `${i}-${j} 差 ${(flat - great).toFixed(2)} m`);
    }
  }
});

check("投影中心是这几个地点自己的均值，往返无漂移", () => {
  assert.deepEqual(engine.centerOf([[0, 0], [2, 4]]), [1, 2]);
  assert.equal(engine.centerOf([]), null);
  const center = [-9.14, 38.71];
  const back = engine.unprojectLocal(engine.projectLocal([-9.1466, 38.7069], center), center);
  assert.ok(Math.abs(back[0] + 9.1466) < 1e-9 && Math.abs(back[1] - 38.7069) < 1e-9);
});

check("折返的顺序被算出来，且给的是真正最短的那一个", () => {
  const points = [[0, 0], [0.02, 0], [0.01, 0], [0.03, 0]];
  const saving = engine.orderSaving(points);
  assert.deepEqual(saving.order, [0, 2, 1, 3]);
  assert.ok(saving.savingM > 0);
  assert.ok(Math.abs(saving.bestM - engine.haversine([0, 0], [0.03, 0])) < 1e-6, "最短顺序应就是一条直线走完");
  assert.equal(saving.exact, true);
});

check("已经最短时不劝改", () => {
  const saving = engine.orderSaving([[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]);
  assert.equal(saving.savingM, 0);
  assert.ok(Math.abs(saving.currentM - saving.bestM) < 1e-6);
});

check("同一组地点重算，顺序逐项一致（不许翻面、不许乱跳）", () => {
  const points = [
    [-9.1466, 38.7069], [-9.1226, 38.7139], [-9.1487, 38.7093],
    [-9.1421, 38.7101], [-9.1333, 38.7223],
  ];
  const first = engine.bestOrder(points);
  for (let round = 0; round < 5; round++) {
    assert.deepEqual(engine.bestOrder(points).order, first.order);
  }
});

check("精确解只用到 12 个地点，超过就走确定性启发式且仍是合法排列", () => {
  assert.equal(engine.EXACT_ORDER_LIMIT, 12);
  const many = [];
  for (let i = 0; i < 15; i++) many.push([i * 0.004, (i % 4) * 0.003]);
  const result = engine.bestOrder(many);
  assert.equal(result.exact, false);
  assert.deepEqual([...result.order].sort((a, b) => a - b), many.map((_, index) => index));
  assert.deepEqual(engine.bestOrder(many).order, result.order);
});

check("一个地点、零个地点都不崩", () => {
  assert.deepEqual(engine.bestOrder([]).order, []);
  assert.deepEqual(engine.bestOrder([[0, 0]]).order, [0]);
  assert.equal(engine.routeLength([]), 0);
  assert.equal(engine.orderSaving([[0, 0]]).savingM, 0);
});

check("这一版不再随包发全球轮廓，也不再声称抽稀", () => {
  assert.equal(engine.worldGeometry, undefined);
  assert.equal(engine.WORLD_DATA_META, undefined);
  assert.equal(engine.simplifyRoute, undefined);
  assert.equal(engine.COLORS, undefined);
});

console.log("\n地图自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
