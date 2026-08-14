/* 可执行笔记 · 界面自测（jsdom 程序化装载，不启动浏览器） */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/executable-notebook-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const candidate of direct) if (existsSync(candidate)) return require(candidate);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：可执行笔记界面自测无法运行");
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
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();
let failed = 0;

function check(name, action) {
  try {
    action();
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

function submit(form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function change(element) {
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function addParameter(name, value) {
  $("#parameter-name").value = name;
  $("#parameter-value").value = String(value);
  submit($("#parameter-form"));
}

function addCell(type, name, content) {
  $("#cell-type").value = type;
  change($("#cell-type"));
  $("#cell-name").value = name;
  $("#cell-content").value = content;
  submit($("#cell-form"));
}

function editParameter(name, value) {
  const input = doc.querySelector(`[data-parameter="${name}"]`);
  input.value = String(value);
  change(input);
}

function editCell(name, content) {
  const input = doc.querySelector(`[data-cell-editor="${name}"]`);
  input.value = content;
  change(input);
}

function code(file) {
  return readFileSync(path.join(runtimeDir, file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

console.log("可执行笔记界面自测（jsdom，非浏览器）");

check("入口装载了同目录内核与界面脚本", () => {
  assert.ok(window.ExecutableNotebookEngine);
  assert.equal(typeof window.ExecutableNotebookEngine.runNotebook, "function");
});

check("首屏是真空笔记，参数、格子与依赖都从零开始", () => {
  assert.equal(text("#progress-summary"), "0 个参数 · 0 个格子 · 0 条依赖");
  assert.match(screen(), /先加一个可以改的量/);
  assert.match(screen(), /这是一份真正的空笔记/);
  assert.match(screen(), /可以先写说明文字/);
  assert.equal(doc.querySelectorAll(".parameter-row").length, 0);
  assert.equal(doc.querySelectorAll(".cell-row").length, 0);
  assert.equal($("#cell-content").disabled, false);
});

check("加入参数与表达式格后，三个进展数同步变化并显示结果", () => {
  addParameter("area", 620);
  assert.equal(text("#progress-summary"), "1 个参数 · 0 个格子 · 0 条依赖");
  addCell("expression", "monthlyRent", "area*32");
  assert.equal(text("#progress-summary"), "1 个参数 · 1 个格子 · 1 条依赖");
  assert.match(text("#cell-list"), /monthlyRent/);
  assert.match(text("#cell-list"), /19840/);
});

check("参数变化只沿当前依赖向下重算", () => {
  editParameter("area", 700);
  assert.match(text("#cell-list"), /22400/);
  assert.equal(text("#run-order"), "monthlyRent");
  editParameter("area", 620);
  assert.match(text("#cell-list"), /19840/);
});

check("真实办公室方案能装入表达式、说明文字与断言三类格子", () => {
  addParameter("rent", 32);
  addParameter("people", 24);
  addParameter("months", 36);
  addParameter("moveCost", 180000);
  addParameter("budget", 1100000);
  editCell("monthlyRent", "area*rent");
  addCell("expression", "leaseCost", "monthlyRent*months");
  addCell("expression", "movePerMonth", "moveCost/months");
  addCell("expression", "totalCost", "leaseCost+moveCost");
  addCell("expression", "costPerSeat", "monthlyRent/people");
  addCell("expression", "budgetGap", "budget-totalCost");
  addCell("assertion", "withinBudget", "totalCost<=budget");
  addCell("text", "basis", "金额单位为元；租期按整月计算，基准日期由作者显式给出。");
  $("#baseline-date").value = "2026-08-14";
  change($("#baseline-date"));

  assert.equal(text("#progress-summary"), "6 个参数 · 8 个格子 · 14 条依赖");
  assert.match(text("#cell-list"), /714240/);
  assert.match(text("#cell-list"), /894240/);
  assert.match(text("#cell-list"), /205760/);
  assert.match(text("#cell-list"), /withinBudget[\s\S]*通过/);
  assert.match(doc.querySelector('[data-cell-editor="basis"]').value, /金额单位为元/);
  assert.equal(
    text("#run-order"),
    "monthlyRent → leaseCost → movePerMonth → totalCost → costPerSeat → budgetGap → withinBudget",
  );
});

check("循环引用与未定义引用在界面上点名，不压成笼统错误", () => {
  editCell("monthlyRent", "missing+1");
  assert.match(text("#notebook-message"), /未定义引用：missing/);
  editCell("monthlyRent", "leaseCost+1");
  assert.match(text("#notebook-message"), /循环引用/);
  assert.match(text("#notebook-message"), /monthlyRent/);
  assert.match(text("#notebook-message"), /leaseCost/);
  editCell("monthlyRent", "area*rent");
  assert.match(text("#cell-list"), /19840/);
});

check("页面自带运行自测按钮并把通过数写到屏上", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(text("#test-out"), "4 / 4 通过");
});

check("所有 src/href 都是同目录相对路径，没有外部资源", () => {
  for (const match of code("index.html").matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    assert.doesNotMatch(match[1], /^(?:[a-z]+:|\/\/|\/|\.\.\/)/i, match[1]);
  }
  assert.doesNotMatch(code("style.css"), /@import|url\s*\(/i);
});

check("页面不用 ES module，也不嵌套 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码不碰网络、存储、父窗口或自由代码执行入口", () => {
  const source = ["index.html", "engine.js", "ui.js"].map(code).join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|importScripts\s*\(|WebTransport\s*\(|RTCPeerConnection\s*\(|(?:Shared)?Worker\s*\(|serviceWorker\s*\.\s*register\s*\(/);
  assert.doesNotMatch(source, /document\s*\.\s*cookie|localStorage|sessionStorage|indexedDB|document\s*\.\s*domain/);
  assert.doesNotMatch(source, /window\s*\.\s*(?:parent|top)\b/);
  assert.doesNotMatch(source, /(?<![\w.$])eval\s*\(|new\s+Function\b|Function\s*\(/);
});

if (process.env.W07_PREVIEW_DATA) {
  const preview = {
    eyebrow: text(".eyebrow"),
    title: text("h1"),
    lead: text(".lead"),
    policy: text(".policy"),
    parameterTitle: text("#parameter-title"),
    parameterCount: text("#parameter-count"),
    parameters: [...doc.querySelectorAll(".parameter-row")].map((row) => ({
      name: row.querySelector(".parameter-name")?.textContent.trim() || "",
      value: row.querySelector("input")?.value || "",
    })),
    baseline: $("#baseline-date").value,
    notebookTitle: text("#notebook-title"),
    cellCount: text("#cell-count"),
    cells: [...doc.querySelectorAll(".cell-row")].map((row) => ({
      type: row.querySelector(".cell-type")?.textContent.trim() || "",
      name: row.querySelector(".cell-name")?.textContent.trim() || "",
      dependencies: row.querySelector(".cell-deps")?.textContent.trim() || "",
      content: row.querySelector(".cell-editor")?.value || "",
      result: row.querySelector(".cell-result strong")?.textContent.trim() || "",
    })),
    runOrder: text("#run-order"),
    selftest: text("#test-out"),
    progress: text("#progress-summary"),
    footer: text("footer span"),
  };
  writeFileSync(process.env.W07_PREVIEW_DATA, JSON.stringify(preview, null, 2) + "\n");
}

console.log("\n可执行笔记界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
