import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/floorplan-annotation-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const candidate of direct) if (existsSync(candidate)) return require(candidate);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of require("node:fs").readdirSync(store)) {
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
  else dom.window.addEventListener("load", resolve);
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const text = (selector) => ($(selector) ? $(selector).textContent.replace(/\s+/g, " ").trim() : "");
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();
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
function click(selector) {
  const item = $(selector);
  assert.ok(item, "找不到 " + selector);
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function drag(x1, y1, x2, y2) {
  const paper = $("#floorplan-paper");
  paper.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: x1, clientY: y1 }));
  paper.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true, button: 0, clientX: x2, clientY: y2 }));
  paper.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0, clientX: x2, clientY: y2 }));
}

console.log("户型标注界面自测（jsdom，非浏览器）");

check("引擎脚本已装载", () => assert.ok(window.FloorplanEngine));
check("首屏常驻第一笔指引", () => {
  assert.match(text("#draw-instruction"), /沿网格拖一条线，画出第一面墙/);
});
check("首屏米制网格、原点、比例尺和北针齐全", () => {
  assert.ok($("#grid-layer rect"));
  assert.ok($("#origin-marker circle"));
  assert.match(text("#origin-marker"), /\(0, 0\) m/);
  assert.ok($("#scale-bar line"));
  assert.match(text("#scale-bar"), /1 m/);
  assert.ok($("#north-arrow path"));
  assert.equal(text("#north-arrow"), "N");
});
check("首屏没有任何代画墙", () => {
  assert.equal(doc.querySelectorAll("#wall-layer [data-wall]").length, 0);
  assert.equal(text("#last-wall-length"), "待绘制");
  assert.equal(text("#suite-area"), "待闭合");
});
check("局部米制、存储与吸附口径都在屏上", () => {
  assert.match(screen(), /局部米制坐标，不是经纬度/);
  assert.match(screen(), /存储精度 0\.001 m/);
  assert.match(screen(), /吸附步长 0\.01 m/);
});
check("墙厚、门宽与正确标注规范齐全", () => {
  assert.deepEqual([...$("#wall-thickness").options].map((option) => option.value), ["100", "200", "240", "300"]);
  assert.match(screen(), /700–1000 mm/);
  assert.match(screen(), /ISO 129-1:2018/);
  assert.match(screen(), /ISO 3098-1/);
});

drag(180, 390, 380, 390);
check("第一笔松手后墙长以文本出现", () => {
  assert.equal(doc.querySelectorAll("#wall-layer [data-wall]").length, 1);
  assert.equal(text("#last-wall-length"), "4.00 m");
  assert.match(text("#draw-status"), /最近墙长 4\.00 m/);
  assert.match(text("#wall-rows"), /\(2\.00, 1\.00\)/);
  assert.match(text("#wall-rows"), /\(6\.00, 1\.00\)/);
});

drag(380, 390, 380, 240);
drag(380, 240, 180, 240);
drag(180, 240, 180, 390);
check("矩形闭合后套内面积以文本出现", () => {
  assert.equal(doc.querySelectorAll("#wall-layer [data-wall]").length, 4);
  assert.equal(text("#suite-area"), "12.00 m²");
  assert.match(text("#draw-status"), /轮廓已闭合/);
});
check("分摊系数改变时建筑面积同帧重算", () => {
  const input = $("#allocation-factor");
  input.value = "1.15";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(text("#suite-area"), "12.00 m²");
  assert.equal(text("#building-area"), "13.80 m²");
});
check("尺寸链同时给总尺寸、轴线和细部", () => {
  assert.equal(text("#dimension-total"), "4.00 × 3.00 m");
  assert.match(text("#dimension-axis"), /4 段中线 · 合计 14\.00 m/);
  assert.match(text("#dimension-detail"), /最近墙长 3\.00 m · 墙厚 200 mm/);
});
check("点运行自测后屏上给出全部通过", () => {
  click("#run-test");
  assert.equal(text("#test-out"), "8 / 8 通过");
});

const coverSnapshot = {
  title: text(".head h1"),
  subtitle: text(".head p"),
  instruction: text("#draw-instruction"),
  status: text("#draw-status"),
  thickness: text("#wall-thickness option:checked"),
  factor: $("#allocation-factor").value,
  lastWall: text("#last-wall-length"),
  suiteArea: text("#suite-area"),
  buildingArea: text("#building-area"),
  totalDimension: text("#dimension-total"),
  axisDimension: text("#dimension-axis"),
  detailDimension: text("#dimension-detail"),
  wallRows: [...doc.querySelectorAll("#wall-rows tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim())),
  standards: text(".standards"),
};

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("所有 src 和 href 都是同目录相对路径且文件存在", () => {
  for (const match of code("index.html").matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const value = match[1];
    assert.doesNotMatch(value, /^(?:[a-z]+:)?\/\//i);
    assert.equal(path.dirname(value), ".");
    assert.ok(existsSync(path.join(runtimeDir, value)), value + " 不存在");
  }
  assert.doesNotMatch(code("style.css"), /@import|url\s*\(/i);
});
check("不用 ES module", () => assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i));
check("页面没有 iframe", () => assert.equal(doc.querySelectorAll("iframe").length, 0));
check("运行时代码没有网络、存储或父窗口 API", () => {
  const source = ["index.html", "engine.js", "ui.js", "style.css"].map(code).join("\n");
  const banned = [
    /fetch\s*\(/, /XMLHttpRequest/, /WebSocket\s*\(/, /EventSource\s*\(/, /sendBeacon\s*\(/,
    /importScripts\s*\(/, /WebTransport\s*\(/, /RTCPeerConnection\s*\(/,
    /(?:^|[^\w])(?:Shared)?Worker\s*\(/, /serviceWorker\s*\.\s*register\s*\(/,
    /localStorage/, /sessionStorage/, /indexedDB/, /document\s*\.\s*cookie/,
    /window\s*\.\s*(?:parent|top)\b/, /document\s*\.\s*domain/,
  ];
  for (const pattern of banned) assert.doesNotMatch(source, pattern);
});

if (process.env.W05_COVER_DATA) {
  writeFileSync(process.env.W05_COVER_DATA, JSON.stringify(coverSnapshot, null, 2) + "\n");
}

console.log("\n户型标注界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
