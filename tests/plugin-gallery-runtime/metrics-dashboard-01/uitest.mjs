/* 看板界面自测：在 jsdom 里真装载页面，检查屏上出现的和该删掉的。 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/metrics-dashboard-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const candidate of direct) if (existsSync(candidate)) return require(candidate);
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
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

async function boot() {
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
  return dom;
}

const dom = await boot();
const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const all = (selector) => [...doc.querySelectorAll(selector)];
const text = (selector) => ($(selector) ? $(selector).textContent.replace(/\s+/g, " ").trim() : "");
const clean = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
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
function fire(node, type) {
  assert.ok(node, "找不到要操作的元素");
  node.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));
}
function key(node, name) {
  assert.ok(node, "找不到要按键的元素");
  node.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}
function tracks() {
  return all("#tracks .track").map((node) => ({
    node,
    name: clean(node.querySelector(".name")),
    current: node.classList.contains("current"),
    pressed: node.getAttribute("aria-pressed"),
    reading: clean(node.querySelector(".reading")),
    at: clean(node.querySelector(".at")),
    target: clean(node.querySelector(".target-read")),
    actual: JSON.parse(node.getAttribute("data-actual")),
    goal: JSON.parse(node.getAttribute("data-target")),
    breaks: JSON.parse(node.getAttribute("data-breaks")),
    reasons: JSON.parse(node.getAttribute("data-reasons")),
    zero: node.getAttribute("data-zero"),
  }));
}
function ticks() {
  return all("#axis .tick").map((node) => ({
    label: clean(node),
    lit: node.getAttribute("aria-pressed") === "true",
    node,
  }));
}
function load(lines) {
  const paste = $("#paste");
  paste.value = lines.join("\n");
  paste.dispatchEvent(new window.Event("input", { bubbles: true }));
  fire($("#load"), "click");
}

const DATA = [
  "时段,地区,指标,实际,目标,单位",
  "08-04,静安店,到店客流,412,460,人次",
  "08-05,静安店,到店客流,455,460,人次",
  "08-06,静安店,到店客流,,460,人次",
  "08-07,静安店,到店客流,341,460,人次",
  "08-04,静安店,成交率,31.4,34,%",
  "08-05,静安店,成交率,33.1,34,%",
  "08-06,静安店,成交率,29.8,34,%",
  "08-07,静安店,成交率,26.9,34,%",
  "08-04,静安店,平均等位时长（分钟）,11.5,9",
  "08-05,静安店,平均等位时长（分钟）,12.8,9",
  "08-06,静安店,平均等位时长（分钟）,14.2,9",
  "08-07,静安店,平均等位时长（分钟）,17.4,9",
  "08-04,徐汇店,到店客流,508,460,人次",
  "08-05,徐汇店,到店客流,496,460,人次",
  "08-06,徐汇店,到店客流,470,460,人次",
  "08-07,徐汇店,到店客流,455,460,人次",
];

console.log("看板界面自测（jsdom，非浏览器）");

check("引擎脚本已装载", () => assert.ok(window.DashboardEngine));

check("首屏只有一条等着数据的时间基线和一个动作：粘贴", () => {
  assert.equal(all("#tracks .waiting").length, 1);
  assert.equal(all("#tracks .waiting .base").length, 1);
  assert.equal(text(".do"), "粘贴你的指标数据");
  assert.ok($("#paste"));
  assert.equal($("#paste").value, "");
  assert.equal($("#axis").children.length, 0);
});

check("首屏不摆示例数字，也不把缺失写成零", () => {
  assert.doesNotMatch(screen(), /\d/);
  assert.doesNotMatch(screen(), /数据缺失/);
});

check("页头标题、副标题、取数入口、筛选区、图形区、明细表、自测按钮都不在了", () => {
  for (const gone of [
    "筛选区", "指标区", "图形区", "逐行明细", "从哪儿取数", "带入 app 已有数据",
    "手工创建第一个指标", "运行自测", "未运行", "达成率 = 实际 / 目标",
    "柱形是明细表的附加视图", "低于参考区间", "尚未取数",
  ]) assert.doesNotMatch(screen(), new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), gone + " 还在屏上");
  assert.equal(all("h1, h2, .head, aside, select, [data-source], #run-test, table").length, 0);
});

load(DATA);

check("载入后输入区从页面上删掉，当前动作换成拖时间范围", () => {
  assert.equal($("#intake"), null);
  assert.equal($("#paste"), null);
  assert.equal(text("#action"), "拖动时间范围");
});

check("每条轨道写着用户自己的指标名，不是颜色或编号", () => {
  const names = tracks().map((track) => track.name);
  assert.deepEqual(names, ["到店客流", "成交率", "平均等位时长"]);
});

check("轨道末端是当前读数，数字和单位在同一行", () => {
  const [flow, rate, wait] = tracks();
  assert.equal(flow.reading, "341人次");
  assert.equal(flow.at, "08-07");
  assert.equal(flow.target, "目标 460人次");
  assert.equal(rate.reading, "26.9%");
  assert.equal(wait.reading, "17.4分钟");
  for (const track of tracks()) {
    for (const line of track.node.querySelectorAll(".end p")) {
      assert.equal(line.querySelectorAll("br").length, 0);
    }
  }
});

check("头号结论落在当前轨道末端，说的是离目标差多少", () => {
  assert.equal(text("#verdict"), "比目标少 119人次");
  assert.equal(text("#verdict-why"), "低于参考区间 · 达成率 74.13 %");
  const inside = $("#verdict").closest(".track");
  assert.equal(clean(inside.querySelector(".name")), "到店客流");
  assert.equal(all("#verdict").length, 1);
});

check("时间轴上是真实时段，共用一套刻度", () => {
  assert.deepEqual(ticks().map((tick) => tick.label), ["08-04", "08-05", "08-06", "08-07"]);
  assert.deepEqual(ticks().map((tick) => tick.lit), [true, true, true, true]);
  const xs = tracks().map((track) => track.actual.flat().map((spot) => spot[0]));
  assert.deepEqual(xs[1], xs[2]);
});

check("地区名贴在时间轴上，当前范围也写出来", () => {
  assert.equal(text("#region"), "静安店");
  assert.equal(text(".range"), "08-04 到 08-07");
});

check("缺实际值的时段真的断开，断口旁写着原因", () => {
  fire($('[data-name="到店客流"]'), "click");
  const flow = tracks()[0];
  assert.equal(flow.breaks.length, 1);
  assert.match(flow.reasons[0], /这一时段没有实际值/);
  assert.equal(flow.actual.length, 2, "断口应该把路径切成两段");
  assert.equal(flow.actual[0].length, 2);
  assert.equal(flow.actual[1].length, 1);
  assert.equal(flow.node.querySelectorAll(".cut").length, 1);
  assert.match(clean(flow.node.querySelector(".cut-why")), /这一时段没有实际值/);
});

check("尺度只包住这段时间里真出现过的数，不硬塞一条零基线", () => {
  for (const track of tracks()) {
    assert.equal(track.zero, "", track.name + " 的尺度被拉到了零");
    assert.equal(track.node.querySelectorAll(".base").length, 0);
  }
  const highs = tracks()[1].actual.flat().map((spot) => spot[1]);
  assert.ok(Math.max(...highs) - Math.min(...highs) > 40, "起落被压平了");
});

check("点另一条轨道，头号结论跟着换，其他轨道退回读数", () => {
  fire($('[data-name="平均等位时长"]'), "click");
  const list = tracks();
  assert.deepEqual(list.map((track) => track.pressed), ["false", "false", "true"]);
  assert.equal(text("#verdict"), "比目标多 8.4分钟");
  assert.equal(text("#verdict-why"), "高于参考区间 · 达成率 193.33 %");
  assert.equal(list[2].node.querySelectorAll(".cut-why").length, 0);
  assert.equal(list[0].node.querySelectorAll(".cut-why").length, 0);
});

check("在时间轴上拖出一段：范围、尺度和读数一起重算", () => {
  const before = tracks()[2].actual.flat().map((spot) => spot[1]);
  const row = ticks();
  fire(row[0].node, "mousedown");
  fire(row[1].node, "mouseover");
  fire(doc.body, "mouseup");
  assert.deepEqual(ticks().map((tick) => tick.lit), [true, true, false, false]);
  assert.equal(text(".range"), "08-04 到 08-05");
  const after = tracks()[2];
  assert.equal(after.at, "08-05");
  assert.equal(after.reading, "12.8分钟");
  assert.equal(text("#verdict"), "比目标多 3.8分钟");
  assert.equal(after.actual.length, 1);
  assert.equal(after.actual[0].length, 2);
  assert.notDeepEqual(after.actual.flat().map((spot) => spot[1]), before.slice(0, 2));
});

check("罩外的走势还画着，只是退后，不是被删掉", () => {
  const faded = tracks()[2].node.querySelectorAll(".real.faded");
  assert.ok(faded.length >= 1);
  const dim = [...faded].map((node) => node.getAttribute("d")).join(" ");
  assert.ok(dim.split("L").length - 1 >= 3, "退后的那条应当把四个时段都画完");
});

check("键盘也能挪范围端点，端点说得出自己停在哪一天", () => {
  const grip = $(".grip.to");
  assert.equal(grip.getAttribute("aria-valuetext"), "08-05");
  key(grip, "ArrowRight");
  assert.equal(text(".range"), "08-04 到 08-06");
  key($(".grip.to"), "End");
  assert.equal(text(".range"), "08-04 到 08-07");
  key($(".grip.from"), "ArrowRight");
  assert.equal(text(".range"), "08-05 到 08-07");
  key($(".grip.from"), "Home");
  assert.equal(text(".range"), "08-04 到 08-07");
});

check("换地区是在原地换一次，换完屏上写的是新地区的读数", () => {
  fire($("#region"), "click");
  assert.deepEqual(all(".others .region").map((node) => clean(node)), ["徐汇店"]);
  fire(all(".others .region")[0], "click");
  assert.equal(text("#region"), "徐汇店");
  assert.equal(text(".range"), "08-04 到 08-07");
  assert.deepEqual(tracks().map((track) => track.name), ["到店客流"]);
  assert.equal(tracks()[0].reading, "455人次");
  assert.equal(text("#verdict"), "比目标少 5人次");
  fire($("#region"), "click");
  fire(all(".others .region")[0], "click");
  assert.equal(text("#region"), "静安店");
  assert.equal(tracks().length, 3);
  assert.equal(tracks()[0].reading, "341人次");
});

const zero = await boot();
{
  const zdoc = zero.window.document;
  const paste = zdoc.querySelector("#paste");
  paste.value = [
    "时段,地区,指标,实际,目标,单位",
    "08-04,东,退单,3,5,单",
    "08-05,东,退单,0,5,单",
    "08-06,东,退单,,5,单",
    "08-07,东,退单,10,0,单",
  ].join("\n");
  paste.dispatchEvent(new zero.window.Event("input", { bubbles: true }));
  zdoc.querySelector("#load").dispatchEvent(new zero.window.MouseEvent("click", { bubbles: true }));
  const track = zdoc.querySelector(".track");
  const points = JSON.parse(track.getAttribute("data-actual"));
  const baseline = track.getAttribute("data-zero");
  const reasons = JSON.parse(track.getAttribute("data-reasons"));

  check("真实的零落在基线上，路径前后仍连着", () => {
    assert.equal(points[0].length, 2);
    assert.equal(String(points[0][1][1]), baseline);
    assert.equal(zdoc.querySelectorAll(".track .base").length, 1);
  });
  check("缺数据和目标为零是两种断口，各带自己的原因", () => {
    assert.equal(reasons.length, 2);
    assert.match(reasons[0], /这一时段没有实际值/);
    assert.match(reasons[1], /目标为零/);
    assert.equal(zdoc.querySelectorAll(".track .cut").length, 2);
  });
  check("算不出来的时段不写成零，也不占读数", () => {
    assert.equal(clean(zdoc.querySelector(".reading")), "0单");
    assert.equal(clean(zdoc.querySelector(".at")), "08-05");
    assert.equal(clean(zdoc.querySelector("#verdict")), "比目标少 5单");
  });
  zero.window.close();
}

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("标签没有写死的小字号", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /font-size\s*:\s*(?:9|10|11)px/);
  for (const match of css.matchAll(/font-size\s*:\s*([\d.]+)rem/g)) {
    assert.ok(Number(match[1]) >= 0.85, "字号 " + match[1] + "rem 太小");
  }
});

check("状态不是只靠颜色：方向词、位置和文字都在", () => {
  assert.match(text("#verdict"), /比目标[多少]|正好踩在目标上/);
  assert.match(text("#verdict-why"), /参考区间/);
  assert.equal(all(".legend, .bands").length, 0);
});

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
check("目录里只有静态页面该有的文件", () => {
  const allowed = ["index.html", "ui.js", "engine.js", "style.css", "NOTICE"];
  for (const entry of require("node:fs").readdirSync(runtimeDir)) {
    assert.ok(allowed.includes(entry), "多出文件 " + entry);
  }
});

console.log("\n看板界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
