/*
 * 世界地图自测
 * node tests/plugin-gallery-runtime/world-map-01/selftest.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/world-map-01",
);
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));
const uiSource = fs.readFileSync(path.join(runtimeDir, "ui.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(runtimeDir, "index.html"), "utf8");

let failed = 0;
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

function close(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: 得到 ${actual}，期望 ${expected} ± ${tolerance}`,
  );
}

console.log("世界地图自测 · 纯计算与运行时边界");

check("地球四分之一周长采用规格半径", () => {
  const distance = engine.distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 });
  close(distance, Math.PI * 6371.0088 / 2, 1e-9, "四分之一周长");
});

check("跨日期线走两度短弧，不绕地球一圈", () => {
  const distance = engine.distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
  close(distance, Math.PI * 6371.0088 / 90, 1e-9, "日期线短弧");
  assert.equal(engine.shortLongitudeDelta(179, -179), 2);
});

check("北京到赫尔辛基给出可信距离量级", () => {
  const distance = engine.distanceKm(
    { lat: 39.9042, lng: 116.4074 },
    { lat: 60.1699, lng: 24.9384 },
  );
  assert.ok(distance > 6300 && distance < 6400, `距离超出 6300–6400 km：${distance}`);
  assert.match(engine.formatDistance(distance), /^6[,.]?3\d{2} km$/);
});

check("同一点为零，坏点返回 null", () => {
  assert.equal(engine.distanceKm({ lat: 20, lng: 30 }, { lat: 20, lng: 30 }), 0);
  assert.equal(engine.distanceKm({ lat: 91, lng: 30 }, { lat: 20, lng: 30 }), null);
  assert.equal(engine.distanceKm(null, { lat: 20, lng: 30 }), null);
});

check("日期线两侧中心仍在日期线附近", () => {
  const center = engine.midpoint({ lat: 10, lng: 170 }, { lat: 20, lng: -170 });
  assert.equal(center.lat, 15);
  assert.equal(center.lng, -180);
});

check("视野缩放有上下界，重合城市不钻进街道", () => {
  assert.equal(
    engine.suggestedZoom({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }, 1000, 700, 72),
    12,
  );
  const worldZoom = engine.suggestedZoom(
    { lat: -70, lng: -170 },
    { lat: 70, lng: 170 },
    320,
    520,
    72,
  );
  assert.ok(worldZoom >= 1 && worldZoom <= 12);
});

check("Google key 直接内联，SDK 只在 ui.js 联网", () => {
  assert.match(uiSource, /AIzaSyCajy9E2uExVxnKABBXutnEmit0pWGRN9E/);
  assert.match(uiSource, /https:\/\/maps\.googleapis\.com\/maps\/api\/js/);
  assert.doesNotMatch(require("node:fs").readFileSync(path.join(runtimeDir, "engine.js"), "utf8"), /https?:\/\//);
});

check("加载失败给人话和原地重试，不暴露技术错误", () => {
  assert.match(htmlSource, /地图暂时没加载出来。可能是网络受限或服务繁忙，请检查网络后重试。/);
  assert.match(htmlSource, />重新加载地图</);
  assert.match(uiSource, /gm_authFailure\s*=\s*showFailure/);
  assert.match(uiSource, /setTimeout\(showFailure, LOAD_TIMEOUT_MS\)/);
});

check("页面不出现自测、口径栏、图例或额外来源面板", () => {
  assert.doesNotMatch(htmlSource, /运行自测|口径|图例|来源[:：]/);
});

check("高德走 JS API Key + 同主机封闭代理，安全密钥不得进包", () => {
  assert.match(uiSource, /618a2bbb935d8235b46916839fb985ee/);
  assert.match(uiSource, /https:\/\/webapi\.amap\.com\/maps\?v=2\.0/);
  assert.match(
    uiSource,
    /serviceHost:\s*AMAP_SERVICE_HOST|AMAP_SERVICE_HOST = "https:\/\/plugins\.oceanleo\.app\/_AMapService"/,
  );
  const runtimeSource = uiSource + "\n" + htmlSource;
  assert.doesNotMatch(runtimeSource, /securityJsCode/);
  assert.doesNotMatch(runtimeSource, /jscode\s*[:=]/);
  assert.doesNotMatch(runtimeSource, /53fd24d2269497b990fa72c1b69bc471/);
  assert.doesNotMatch(runtimeSource, /c6b466a0a6f10256167958583c0eacb5/);
});

/*
 * UC-3 — docs/architecture/oceanleo-untrusted-content-isolation.md §4：
 * 插件运行时不能因 plugins.oceanleo.app 主机名后缀而自行推断信任；信任只由宿主的
 * 插件 id 精确白名单建立。本插件代码不读取 location.host，也不实现后缀判断。
 */
check("UC-3：运行时不从插件主机名后缀推断信任", () => {
  assert.doesNotMatch(uiSource, /endsWith\s*\(\s*["'][^"']*plugins\.oceanleo\.app/);
  assert.doesNotMatch(uiSource, /location\.(host|hostname)/);
});

console.log(`\n世界地图自测：${passed} 项通过，${failed} 项未通过`);
process.exit(failed === 0 ? 0 : 1);
