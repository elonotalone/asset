/*
 * 地球仪 · 界面自测（jsdom，非浏览器）
 *
 *   node tests/plugin-gallery-runtime/interactive-globe-01/uitest.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/interactive-globe-01",
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
  $("#destination-name").value = name;
  $("#longitude").value = String(longitude);
  $("#latitude").value = String(latitude);
  click($("#add-coordinate"));
}

console.log("地球仪界面自测（jsdom，非浏览器）");

check("引擎脚本被页面真实装载", () => {
  assert.ok(window.InteractiveGlobeEngine);
});

check("首屏已有离线陆地、国界、经纬网与昼夜分界", () => {
  assert.ok(doc.querySelectorAll("#land-layer path").length > 0, "陆地路径数为 0");
  assert.ok(doc.querySelectorAll("#border-layer path").length > 0, "国界路径数为 0");
  assert.ok(doc.querySelectorAll("#graticule-layer path").length > 0, "经纬网路径数为 0");
  assert.ok(doc.querySelectorAll("#night-layer rect").length > 0, "夜半球遮罩数为 0");
  assert.ok(doc.querySelectorAll("#terminator-layer path").length > 0, "昼夜分界路径数为 0");
});

check("首屏为零个目的地，提示可拖动并点国家", () => {
  assert.equal(text("#destination-count"), "目的地0个");
  assert.equal(text("#globe-instruction"), "拖动地球；点一个国家，把它加进这次行程");
  assert.match(screen(), /Natural Earth 4\.1\.0/);
  assert.match(screen(), /公共领域/);
  assert.match(screen(), /world-atlas 2\.0\.2/);
  assert.match(screen(), /ISC/);
});

check("真点一下地球，DOM 出现第一个目的地与图钉", () => {
  click($("#world-globe"), { clientX: 350, clientY: 260 });
  assert.equal(text("#destination-count"), "目的地1个");
  assert.equal(doc.querySelectorAll("#marker-layer .marker-dot").length, 1);
  assert.match(text("#route-rows"), /目的地 1/);
});

check("坏坐标在界面上明确拒绝，不产生虚假目的地", () => {
  const before = doc.querySelectorAll("#route-rows tr").length;
  setCoordinate("越界点", 181, 0);
  assert.equal(doc.querySelectorAll("#route-rows tr").length, before);
  assert.match(text("#input-note"), /坐标无效/);
});

check("输入北京与上海后，屏上 haversine 距离误差 < 0.5%", () => {
  click($("#clear-route"));
  setCoordinate("北京", 116.4074, 39.9042);
  setCoordinate("上海", 121.4737, 31.2304);
  assert.equal(doc.querySelectorAll("#route-rows tr").length, 2);
  assert.ok(doc.querySelectorAll("#route-layer .route-line").length > 0);
  const shownKm = Number($("#total-distance .v").textContent.replace(/\s/g, ""));
  const expectedKm = 1067.311645158726;
  assert.ok(Math.abs(shownKm - expectedKm) / expectedKm < 0.005, `屏上显示 ${shownKm} km`);
  assert.match(text("#route-rows"), /1 067\.3 km/);
  assert.match(text("#route-basis"), /haversine/);
});

check("拖动地球会更新中心视角并重投影轮廓", () => {
  const globe = $("#world-globe");
  const beforeCenter = text("#center-readout");
  const beforePath = $("#land-layer path").getAttribute("d");
  globe.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 280 }));
  window.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true, clientX: 350, clientY: 300 }));
  window.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, clientX: 350, clientY: 300 }));
  assert.notEqual(text("#center-readout"), beforeCenter);
  assert.notEqual($("#land-layer path").getAttribute("d"), beforePath);
});

check("日期变化会重算太阳赤纬与昼夜分界", () => {
  $("#observation-time").value = "2026-06-21T12:00";
  $("#observation-time").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(text("#solar-declination"), /\+23\.[34]/);
  assert.match(text("#date-note"), /2026-06-21T12:00:00Z/);
  assert.match(text("#terminator-readout"), /太阳对跖大圆/);
});

check("界面明确区分太阳时差与行政时区", () => {
  assert.match(screen(), /经差 15° ≈ 1 小时/);
  assert.match(screen(), /不等于行政时区/);
  assert.match(screen(), /国界、政策与夏令时/);
});

check("图例、CRS84 与全部规范色首屏常驻", () => {
  assert.match(screen(), /OGC:CRS84/);
  for (const color of ["#0B3D5C", "#E8DCC8", "#4A5568", "#94A3B8"]) {
    assert.match(screen(), new RegExp(color, "i"));
  }
  assert.match(screen(), /半透明夜半球/);
});

check("点「运行自测」后屏上显示全部通过", () => {
  click($("#run-test"));
  const output = text("#test-out");
  assert.match(output, /^(\d+) \/ \1 通过$/);
  assert.equal(output, "10 / 10 通过");
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

console.log("\n地球仪界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
