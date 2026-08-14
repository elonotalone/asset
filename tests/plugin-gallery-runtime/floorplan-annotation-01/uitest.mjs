/*
 * 户型标注 · 界面自测（jsdom，非浏览器）
 *
 *   node tests/plugin-gallery-runtime/floorplan-annotation-01/uitest.mjs
 *
 * 这份测的是「站在空房里的人能不能读到他要的东西」：
 * 房间名、每面墙的长度、洞口宽度、套内面积，以及首屏没有代画墙。
 * 屏幕坐标不硬编码，全部从渲染出来的比例尺与端点记号里反读，
 * 所以它测的是真实画面，不是我假设的画面。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/floorplan-annotation-01");
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
const $$ = (selector) => Array.from(doc.querySelectorAll(selector));
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
const screenText = () => doc.body.textContent.replace(/\s+/g, " ");

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

const paper = $("#paper");
function fire(type, x, y) {
  paper.dispatchEvent(new window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
}
function drag(from, to) {
  fire("mousedown", from.x, from.y);
  fire("mousemove", (from.x + to.x) / 2, (from.y + to.y) / 2);
  fire("mousemove", to.x, to.y);
  fire("mouseup", to.x, to.y);
}
function tap(at) {
  fire("mousedown", at.x, at.y);
  fire("mouseup", at.x, at.y);
}
function type(input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

/* 从画出来的比例尺反读观察倍率：比例尺说「2 m」，那条线有多长就是多少 px/m。 */
function pxPerM() {
  const bar = $$("#mark-layer line.scale-bar")[0];
  const label = text("#mark-layer .scale-text");
  const metres = Number(label.replace(/[^\d.]/g, ""));
  const px = Math.abs(Number(bar.getAttribute("x2")) - Number(bar.getAttribute("x1")));
  return px / metres;
}
/* 端点记号画在墙链最后一个点上，它就是「接着往下画」的锚。 */
function lastEndpoint() {
  const dot = $("#mark-layer circle.snap-dot");
  return { x: Number(dot.getAttribute("cx")), y: Number(dot.getAttribute("cy")) };
}
function screenFrom(anchor, anchorMetric, target) {
  const scale = pxPerM();
  return {
    x: anchor.x + (target[0] - anchorMetric[0]) * scale,
    y: anchor.y - (target[1] - anchorMetric[1]) * scale,
  };
}

console.log("户型标注界面自测（jsdom，非浏览器）");

check("引擎脚本被页面真实装载", () => {
  assert.ok(window.FloorplanEngine, "window.FloorplanEngine 不在");
});

check("首屏是空图纸：没有代画墙、没有房间、套内面积不出数", () => {
  assert.equal($$("#wall-layer line").length, 0);
  assert.equal($$("#room-layer polygon").length, 0);
  assert.equal(text("#suite-area"), "");
  assert.equal(text("#cue"), "拖出第一面墙");
});

check("首屏纸上已经有网格、比例尺与北针", () => {
  assert.ok($$("#grid-layer line").length > 4, "网格线太少");
  assert.ok($$("#mark-layer line.scale-bar").length >= 3, "比例尺没画全");
  assert.match(text("#mark-layer .scale-text"), /^\d+(\.\d+)? m$/);
  assert.equal(text("#mark-layer .north-text"), "N");
});

check("第一面墙：拖 4 m 后墙体长出来，长度贴在墙边", () => {
  drag({ x: 600, y: 375 }, { x: 840, y: 375 });
  assert.equal($$("#wall-layer line").length, 1);
  const lengths = $$("#wall-layer text.wall-length").map((node) => node.textContent);
  assert.deepEqual(lengths, ["4.00 m"]);
  assert.match(text("#cue"), /从端点继续拖/);
});

check("撤销与墙长贴着当前那一笔出现，不是常驻按钮排", () => {
  assert.equal($("#tag").hidden, false);
  assert.ok($("#undo-wall"), "撤销不在当前笔旁边");
  assert.equal($("#wall-length").value, "4.00");
});

check("拖歪了会按横平竖直落墙，读数还能直接改准", () => {
  // 手拖出来的这一笔是 3.58 m 且带 1 cm 歪斜；轴对齐先扶正，再把激光读数写成 3.60。
  const scale = pxPerM();
  const anchor = lastEndpoint();
  drag(anchor, { x: anchor.x + 0.01 * scale, y: anchor.y - 3.58 * scale });
  assert.equal($$("#wall-layer line").length, 2);
  assert.deepEqual(
    $$("#wall-layer text.wall-length").map((node) => node.textContent).sort(),
    ["3.58 m", "4.00 m"],
    "轴对齐没生效，墙长被歪斜带偏",
  );
  type($("#wall-length"), "3.60");
  assert.deepEqual(
    $$("#wall-layer text.wall-length").map((node) => node.textContent).sort(),
    ["3.60 m", "4.00 m"],
  );
  $("#undo-wall").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal($$("#wall-layer line").length, 1, "撤销没有把这一笔收回去");
});

check("回到起点闭合，房间的面与面积就地出现", () => {
  let anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [4, 0], [4, 3]));
  anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [4, 3], [0, 3]));
  anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [0, 3], [0, 0]));

  assert.equal($$("#room-layer polygon.room-face").length, 1, "闭合后没有房间面");
  assert.equal($$("#wall-layer line").length, 4, "墙不是四面");
  assert.equal(text("#room-label-layer .room-area"), "12.00 m²");
});

check("头号结论是套内面积，且单位与数值在同一行读完", () => {
  assert.equal(text("#suite-area"), "套内面积12.00m²");
  assert.equal($("#suite-area strong").textContent, "12.00");
  assert.equal($("#suite-area em").textContent, "m²");
});

check("总尺寸是图上的尺寸线，不是表格", () => {
  const values = $$("#dimension-layer text.dim-value").map((node) => node.textContent).sort();
  assert.deepEqual(values, ["3.00 m", "4.00 m"]);
  assert.ok($$("#dimension-layer line.dim-ext").length >= 4, "没有延伸线");
  assert.ok($$("#dimension-layer line.dim-tick").length >= 4, "没有端部记号");
  assert.equal($$("table").length, 0, "屏幕上还有表格");
});

check("闭合后就地写房间名，图上立刻是「主卧」而不是编号", () => {
  const input = $("#room-name");
  assert.ok(input, "闭合后没有就地命名的入口");
  assert.equal(text("#cue"), "写下房间名");
  type(input, "主卧");
  assert.equal(text("#room-label-layer .room-name"), "主卧");
  assert.doesNotMatch(screenText(), /房间\s*[A-Z1-9]/);
});

check("四面墙的长度都读得到", () => {
  const lengths = $$("#wall-layer text.wall-length").map((node) => node.textContent).sort();
  assert.deepEqual(lengths, ["3.00 m", "3.00 m", "4.00 m", "4.00 m"]);
});

check("点一面墙，能改的值贴着那面墙出现", () => {
  const anchor = { x: Number($("#room-label-layer .room-name").getAttribute("x")), y: 0 };
  const scale = pxPerM();
  // 房间名画在重心 (2, 1.5)，由它反推 (2, 0) 这面墙的屏幕位置。
  const centroidY = Number($("#room-label-layer .room-name").getAttribute("y")) + 6;
  tap({ x: anchor.x, y: centroidY + 1.5 * scale });
  assert.ok($("#wall-thickness"), "墙厚不在墙旁边");
  assert.ok($("#add-door"), "开门不在墙旁边");
  assert.ok($("#add-window"), "开窗不在墙旁边");
  assert.match($("#tag").textContent, /墙长\s*4\.00 m/);
  assert.equal($$("#wall-layer text.wall-thickness").length, 1, "选中的墙没显示墙厚");
  assert.match($("#wall-layer text.wall-thickness").textContent, /^墙厚 200 mm$/);
});

check("在墙上开一个 900 mm 门洞，墙被真正切开成两段", () => {
  const before = $$("#wall-layer line").length;
  $("#add-door").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.match(text("#cue"), /放门/);
  const scale = pxPerM();
  const centroidY = Number($("#room-label-layer .room-name").getAttribute("y")) + 6;
  const wallX = Number($("#room-label-layer .room-name").getAttribute("x"));
  tap({ x: wallX, y: centroidY + 1.5 * scale });
  assert.equal($$("#wall-layer line").length, before + 1, "墙没有被洞口切开");
  assert.equal($$("#opening-layer path.door-arc").length, 1, "门没有开启弧");
  assert.equal($$("#opening-layer line.door-leaf").length, 1, "门没有门扇线");
  assert.ok($$("#opening-layer text.opening-width").some((node) => node.textContent === "900 mm"), "洞宽读不到");
});

check("门也能写下用途，图上出现「阳台门」", () => {
  const input = $("#opening-name");
  assert.ok(input, "洞口没有就地命名的入口");
  type(input, "阳台门");
  assert.equal(text("#opening-layer .opening-name"), "阳台门");
});

check("洞口宽度改成 1500 mm 后，墙上的洞与标注一起跟着变", () => {
  type($("#opening-width"), "1500");
  assert.ok($$("#opening-layer text.opening-width").some((node) => node.textContent === "1500 mm"));
  const spans = $$("#wall-layer line").length;
  assert.equal(spans, 5, "墙段数不对");
});

check("再画第二间房，套内面积逐间相加", () => {
  const scale = pxPerM();
  const wallX = Number($("#room-label-layer .room-name").getAttribute("x"));
  const centroidY = Number($("#room-label-layer .room-name").getAttribute("y")) + 6;
  const corner = { x: wallX + 2 * scale, y: centroidY - 1.5 * scale };
  drag(corner, screenFrom(corner, [4, 3], [7, 3]));
  type($("#wall-length"), "3.00");
  let anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [7, 3], [7, 0]));
  type($("#wall-length"), "3.00");
  anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [7, 0], [4, 0]));
  anchor = lastEndpoint();
  drag(anchor, screenFrom(anchor, [4, 0], [4, 3]));
  assert.equal($$("#room-layer polygon.room-face").length, 2, "第二间房没有闭合");
  assert.equal(text("#suite-area"), "套内面积21.00m²");
  type($("#room-name"), "厨房");
  const names = $$("#room-label-layer .room-name").map((node) => node.textContent).sort();
  assert.deepEqual(names, ["主卧", "厨房"]);
});

check("两间房共享的那面墙只画一次", () => {
  const keys = $$("#wall-layer line").map((node) => node.getAttribute("data-wall"));
  assert.equal(new Set(keys).size, 7, "墙的去重集合不是 7 面");
});

check("屏幕上不出现被否掉的那些东西", () => {
  assert.equal($$("#run-test").length, 0);
  const surface = screenText();
  for (const word of ["口径", "图例", "来源", "署名", "离线", "免责", "不构成", "快捷键", "分摊系数", "ISO", "吸附"]) {
    assert.doesNotMatch(surface, new RegExp(word), `首屏还在说「${word}」`);
  }
  assert.equal($$("header").length, 0, "还有页头");
  assert.equal($$("section").length, 0, "还有区块");
  assert.equal($$("h1, h2, h3").length, 0, "还有标题");
  assert.doesNotMatch(surface, /\(0, 0\) m/, "原点标签还在");
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("目录仍是四件套的封闭集合", () => {
  assert.deepEqual(
    readdirSync(runtimeDir).filter((name) => name !== "NOTICE").sort(),
    ["engine.js", "index.html", "style.css", "ui.js"],
  );
});

check("没有写死小字号，也没有反过来写字号下限", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-2])(?:\.\d+)?px/);
  assert.doesNotMatch(css + code("index.html"), /字号不得小于|不得小于\s*\d+\s*px|min-font/);
});

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
  assert.equal($$("iframe").length, 0);
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

console.log("\n户型标注界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
