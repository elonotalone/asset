/*
 * 地图 · 界面自测（jsdom，非浏览器）
 *
 *   node tests/plugin-gallery-runtime/annotatable-city-map-01/uitest.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/annotatable-city-map-01",
);
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const entry of direct) if (existsSync(entry)) return require(entry);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：界面自测无法运行");
}

const { JSDOM } = loadJsdom();
const htmlPath = path.join(runtimeDir, "index.html");
const dom = new JSDOM(readFileSync(htmlPath, "utf8"), {
  url: pathToFileURL(htmlPath).href,
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
});

await new Promise((resolve) => {
  if (dom.window.document.readyState === "complete") resolve();
  else dom.window.addEventListener("load", resolve, { once: true });
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
const screen = () => doc.body.textContent.replace(/\s+/g, " ");

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

function click(target, options = {}) {
  target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, ...options }));
}

function setCoordinate(name, longitude, latitude) {
  $("#place-name").value = name;
  $("#longitude").value = String(longitude);
  $("#latitude").value = String(latitude);
  click($("#add-coordinate"));
}

console.log("地图界面自测（jsdom，非浏览器）");

check("引擎脚本被页面真实装载", () => {
  assert.ok(window.CityMapEngine);
});

check("首屏已经有全球陆地、国界与经纬网路径", () => {
  assert.ok(doc.querySelectorAll("#land-layer path").length > 0, "陆地路径数为 0");
  assert.ok(doc.querySelectorAll("#border-layer path").length > 0, "国界路径数为 0");
  assert.ok(doc.querySelectorAll("#graticule-layer path").length > 0, "经纬网路径数为 0");
});

check("首屏是零个用户地点，且提示点图落下第一点", () => {
  assert.equal(text("#location-count"), "地点0个");
  assert.equal(text("#map-instruction"), "在图上点一下，落下第一个地点");
  assert.match(screen(), /Natural Earth 4\.1\.0/);
  assert.match(screen(), /公共领域/);
  assert.match(screen(), /world-atlas 2\.0\.2/);
  assert.match(screen(), /ISC/);
});

check("真点一下地图，DOM 出现第一个地点与红色图钉", () => {
  click($("#world-map"), { clientX: 790, clientY: 134 });
  assert.equal(text("#location-count"), "地点1个");
  assert.equal(doc.querySelectorAll("#marker-layer .pin-dot").length, 1);
  assert.match(text("#route-rows"), /地点 1/);
});

check("坏坐标在界面上明确拒绝，不产生虚假点", () => {
  const before = doc.querySelectorAll("#route-rows tr").length;
  setCoordinate("越界点", 181, 0);
  assert.equal(doc.querySelectorAll("#route-rows tr").length, before);
  assert.match(text("#input-note"), /坐标无效/);
});

check("输入北京与上海后，屏上的 haversine 距离误差 < 0.5%", () => {
  click($("#clear-route"));
  setCoordinate("北京", 116.4074, 39.9042);
  setCoordinate("上海", 121.4737, 31.2304);
  assert.equal(doc.querySelectorAll("#route-rows tr").length, 2);
  assert.equal(doc.querySelectorAll("#marker-layer .pin-dot").length, 2);
  assert.equal(doc.querySelectorAll("#route-layer .route-line").length, 1);
  const shownKm = Number($("#total-distance .v").textContent.replace(/\s/g, ""));
  const expectedKm = 1067.311645158726;
  assert.ok(Math.abs(shownKm - expectedKm) / expectedKm < 0.005, `屏上显示 ${shownKm} km`);
  assert.match(text("#route-rows"), /1 067\.3 km/);
  assert.match(text("#route-basis"), /haversine/);
});

check("图例、比例、CRS84 与全部规范色首屏常驻", () => {
  assert.match(screen(), /2 000 km/);
  assert.match(screen(), /OGC:CRS84/);
  for (const color of ["#F2EDE3", "#A8C8DC", "#3F6478", "#AE3A0B", "#1D4ED8"]) {
    assert.match(screen(), new RegExp(color, "i"));
  }
});

check("点「运行自测」后屏上显示全部通过", () => {
  click($("#run-test"));
  const output = text("#test-out");
  assert.match(output, /^(\d+) \/ \1 通过$/);
  assert.equal(output, "13 / 13 通过");
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("没有外部资源：所有 src/href 都是同目录相对路径", () => {
  const html = code("index.html");
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    assert.match(match[1], /^(?:\.\/)?[^/:?#]+(?:\?[^#]*)?(?:#.*)?$/, `非同目录路径 ${match[1]}`);
    assert.ok(existsSync(path.join(runtimeDir, match[1].split(/[?#]/)[0])), `资源不存在 ${match[1]}`);
  }
  assert.doesNotMatch(code("style.css"), /@import|url\s*\(/i);
});

check("不用 ES module，页面也没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码不发网络请求、不碰存储或父窗口 API", () => {
  const source = ["index.html", "style.css", "engine.js", "ui.js"].map(code).join("\n");
  for (const forbidden of [
    /fetch\s*\(/, /XMLHttpRequest/, /WebSocket\s*\(/, /EventSource\s*\(/,
    /sendBeacon\s*\(/, /importScripts\s*\(/, /WebTransport\s*\(/,
    /RTCPeerConnection\s*\(/, /(?:Shared)?Worker\s*\(/, /serviceWorker\s*\.\s*register\s*\(/,
    /document\s*\.\s*cookie/, /localStorage/, /sessionStorage/, /indexedDB/,
    /window\s*\.\s*(?:parent|top)\b/, /document\s*\.\s*domain/,
  ]) assert.doesNotMatch(source, forbidden);
});

console.log("\n地图界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
