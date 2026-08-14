import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/metrics-dashboard-01");
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
  const node = $(selector);
  assert.ok(node, "找不到 " + selector);
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function type(selector, value) {
  const node = $(selector);
  assert.ok(node, "找不到 " + selector);
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

console.log("看板界面自测（jsdom，非浏览器）");

check("引擎脚本已装载", () => assert.ok(window.DashboardEngine));
check("首屏解释筛选区、指标区和图形区", () => {
  assert.match(screen(), /筛选区/);
  assert.match(screen(), /指标区/);
  assert.match(screen(), /图形区/);
});
check("首屏显眼询问从哪儿取数并给三种入口", () => {
  assert.match(screen(), /从哪儿取数/);
  assert.equal(doc.querySelectorAll("[data-source]").length, 3);
  assert.match(screen(), /带入 app 已有数据/);
  assert.match(screen(), /粘贴自己的数据/);
  assert.match(screen(), /手工创建第一个指标/);
});
check("首屏指标和图形都是真实缺失态", () => {
  assert.equal(text("#actual-value"), "数据缺失");
  assert.equal(text("#target-value"), "数据缺失");
  assert.equal(text("#rate-value"), "数据缺失");
  assert.equal(text("#chart-empty"), "数据缺失");
  assert.equal(doc.querySelectorAll("#metric-rows tr").length, 0);
});
check("首屏可见文字没有任何伪造数字", () => {
  assert.doesNotMatch(screen(), /\d/, "空看板首屏出现了数字");
});

check("宿主数据不可用时如实说明，不伪装读取成功", () => {
  click('[data-source="app"]');
  assert.match(text("#source-message"), /没有收到宿主 app 数据/);
  assert.equal(text("#rate-value"), "数据缺失");
});

click('[data-source="manual"]');
type("#manual-period", "本周");
type("#manual-region", "华东");
type("#manual-name", "交付准时率");
type("#manual-actual", "92");
type("#manual-target", "100");
click("#add-metric");

check("手工加入后实际、目标与达成率同屏出现", () => {
  assert.equal(text("#actual-value"), "92");
  assert.equal(text("#target-value"), "100");
  assert.equal(text("#rate-value"), "■ 92.00 %");
  assert.match(text("#metric-reason"), /参考区间内/);
});
check("明细保留指标、时段、地区、实际、目标、达成率和状态", () => {
  const cells = [...doc.querySelectorAll("#metric-rows td")].map((cell) => cell.textContent.trim());
  assert.deepEqual(cells, ["交付准时率", "本周", "华东", "92", "100", "92.00 %", "■ 参考区间内"]);
});
check("SVG 是附加图形且同时带颜色、符号和文字", () => {
  const bar = $("#metric-chart rect");
  assert.ok(bar);
  assert.equal(bar.getAttribute("data-band"), "middle");
  assert.match(text("#metric-chart"), /■ 92.00 %/);
  assert.match(text("#metric-chart"), /交付准时率/);
});
check("筛选项来自真实记录", () => {
  assert.ok([...$("#period-filter").options].some((option) => option.textContent === "本周"));
  assert.ok([...$("#region-filter").options].some((option) => option.textContent === "华东"));
});

const coverSnapshot = {
  title: text(".head h1"),
  subtitle: text(".head p"),
  source: text("#source-message"),
  filters: [text("#period-filter option:checked"), text("#region-filter option:checked")],
  metric: text("#current-metric"),
  headline: [text("#actual-value"), text("#target-value"), text("#rate-value")],
  basis: text("#metric-reason"),
  row: [...doc.querySelectorAll("#metric-rows td")].map((cell) => cell.textContent.trim()),
  chart: text("#metric-chart"),
};

check("粘贴多行后低段与高段都带形状和文字", () => {
  click('[data-source="paste"]');
  type("#paste-data", "时段,地区,指标,实际,目标,低段边界,高段边界\n本周,华东,回访完成率,64,100,0.8,0.95\n本周,华南,回访完成率,96,100,0.8,0.95");
  click("#load-data");
  assert.equal(doc.querySelectorAll("#metric-rows tr").length, 2);
  assert.match(text("#metric-rows"), /▼ 低于参考区间/);
  assert.match(text("#metric-rows"), /▲ 高于参考区间/);
  assert.equal(doc.querySelectorAll("#metric-chart rect").length, 2);
});
check("地区筛选真的改变屏上结果", () => {
  $("#region-filter").value = "华南";
  $("#region-filter").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(doc.querySelectorAll("#metric-rows tr").length, 1);
  assert.match(text("#metric-rows"), /▲ 高于参考区间/);
  assert.doesNotMatch(text("#metric-rows"), /华东/);
});

check("目标为零时达成率显示原因而不是零", () => {
  click('[data-source="paste"]');
  type("#paste-data", "本周,华东,待复核指标,10,0,0.8,0.95");
  click("#load-data");
  assert.equal(text("#rate-value"), "无法得到指标");
  assert.match(text("#metric-reason"), /目标为零/);
  assert.doesNotMatch(text("#metric-rows td:nth-child(6)"), /^0(?:\.0+)?\s*%?$/);
});

check("点运行自测后屏上给出全部通过", () => {
  click("#run-test");
  assert.equal(text("#test-out"), "10 / 10 通过");
});

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

console.log("\n看板界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
