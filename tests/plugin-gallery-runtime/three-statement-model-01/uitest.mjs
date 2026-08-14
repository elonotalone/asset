/* 三表模型 · 界面自测：用 jsdom 真装载页面、改假设并读取三张表。 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/three-statement-model-01");
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
  throw new Error("找不到 jsdom：三表模型界面自测无法运行");
}

const { JSDOM } = loadJsdom();
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err && err.message ? err.message : String(err)));
  }
}

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
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();

function setValue(selector, value) {
  const control = $(selector);
  assert.ok(control, `找不到控件 ${selector}`);
  control.value = value;
  control.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function pickMode(mode) {
  const control = $("#loop-mode");
  control.value = mode;
  assert.equal(control.value, mode, `断环口径 ${mode} 不存在`);
  control.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function rowValues(tableId, key) {
  const row = doc.querySelector(`#${tableId} tr[data-key="${key}"]`);
  assert.ok(row, `${tableId} 找不到 ${key}`);
  return [...row.querySelectorAll("td")].map((node) => node.textContent.trim());
}

console.log("三表模型界面自测（jsdom，非浏览器）");

check("引擎与装配脚本都已运行", () => {
  assert.ok(window.ThreeStatementEngine, "window.ThreeStatementEngine 不存在");
  assert.equal(doc.querySelectorAll("#headline .metric").length, 4);
});

check("首屏带通用假设，不装真实公司数据", () => {
  assert.equal($("#revenue-growth").value, "12.00");
  assert.equal($("#base-revenue").value, "1000000.00");
  assert.equal($("#loop-mode").value, "opening");
  assert.match(screen(), /通用三年预测，不对应任何真实公司/);
});

check("首屏三张完整报表都已有 2027E–2029E 数字", () => {
  for (const tableId of ["income-table", "cashflow-table", "balance-table"]) {
    const table = document.getElementById(tableId);
    assert.deepEqual([...table.querySelectorAll("thead th")].slice(1).map((node) => node.textContent.trim()), ["2027E", "2028E", "2029E"]);
    assert.ok(table.querySelectorAll("tbody tr").length >= 10, `${tableId} 行数不足`);
    assert.ok([...table.querySelectorAll("tbody td")].every((node) => /\d/.test(node.textContent)), `${tableId} 有空数字格`);
  }
});

check("首屏逐年显式显示资产减负债权益差额 0.00 与平衡", () => {
  const checks = [...doc.querySelectorAll("#check-line .check-item")];
  assert.equal(checks.length, 3);
  assert.ok(checks.every((node) => /0\.00\s+平衡/.test(node.textContent.replace(/\s+/g, " "))));
  assert.deepEqual(rowValues("balance-table", "difference"), ["0.00", "0.00", "0.00"]);
});

check("修改第一个假设 12% → 15%，三张表至少各一处同步变化且仍平衡", () => {
  const before = {
    income: rowValues("income-table", "revenue")[2],
    cash: rowValues("cashflow-table", "endingCash")[2],
    balance: rowValues("balance-table", "receivables")[2],
  };
  setValue("#revenue-growth", "15.00");
  const after = {
    income: rowValues("income-table", "revenue")[2],
    cash: rowValues("cashflow-table", "endingCash")[2],
    balance: rowValues("balance-table", "receivables")[2],
  };
  assert.notEqual(after.income, before.income, "利润表未联动");
  assert.notEqual(after.cash, before.cash, "现金流量表未联动");
  assert.notEqual(after.balance, before.balance, "资产负债表未联动");
  assert.ok([...doc.querySelectorAll("#check-line .check-item")].every((node) => /0\.00\s+平衡/.test(node.textContent.replace(/\s+/g, " "))));
});

check("两种断环口径都可选，并同时解释精度与可解释性差异", () => {
  const directFirstYearInterest = rowValues("income-table", "interest")[0];
  pickMode("average");
  const averageFirstYearInterest = rowValues("income-table", "interest")[0];
  assert.notEqual(averageFirstYearInterest, directFirstYearInterest);
  assert.match($("#mode-explanation").textContent, /精度更高/);
  assert.match($("#comparison-note").textContent, /易解释/);
  assert.match($("#comparison-note").textContent, /精度更高/);
  assert.match($("#comparison-note").textContent, /两者均已收敛/);
  assert.match(screen(), /期初余额直接断环/);
  assert.match(screen(), /平均余额迭代/);
});

check("敏感性三档由当前假设重算，结果各不相同", () => {
  const rows = [...doc.querySelectorAll("#sensitivity-table tbody tr")];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.firstChild.textContent.trim()), ["13.00%", "15.00%", "17.00%"]);
  const revenues = rows.map((row) => row.querySelectorAll("td")[0].textContent.trim());
  assert.equal(new Set(revenues).size, 3);
});

check("输入、公式、跨表引用均同时有文字或形状，不只靠颜色", () => {
  assert.match(screen(), /■ 输入（蓝）/);
  assert.match(screen(), /= 本表公式（黑）/);
  assert.match(screen(), /↗ 跨表引用（绿）/);
  assert.ok(doc.querySelectorAll(".field b").length >= 12);
  const marks = [...doc.querySelectorAll(".role-mark")].map((node) => node.textContent);
  assert.ok(marks.includes("="));
  assert.ok(marks.includes("↗"));
});

check("点运行自测后，屏幕显示内置 8 / 8 通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal($("#test-out").textContent.trim(), "8 / 8 通过");
  assert.match(screen(), /三表勾稽、现金递推与两种断环口径均通过/);
});

check("坏输入明确拒绝并清空旧数字，不用零表冒充成功", () => {
  setValue("#revenue-growth", "-100");
  assert.match($("#status-line").textContent, /输入有误，模型未计算/);
  assert.equal(doc.querySelectorAll("#income-table tbody tr").length, 0);
  assert.equal(doc.querySelectorAll("#headline .metric").length, 0);
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("所有 src/href 都是同目录相对路径且目标存在", () => {
  for (const node of doc.querySelectorAll("[src], [href]")) {
    const value = node.getAttribute("src") || node.getAttribute("href");
    assert.ok(value && !path.isAbsolute(value), `不是相对路径：${value}`);
    assert.doesNotMatch(value, /^(?:[a-z]+:|\/\/|\.\.\/)/i, `不是同目录资源：${value}`);
    assert.equal(path.dirname(value), ".", `资源不在同目录：${value}`);
    assert.ok(existsSync(path.join(runtimeDir, value)), `资源不存在：${value}`);
  }
  const css = code("style.css");
  assert.doesNotMatch(css, /@import\b/i, "style.css 含 @import");
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const value = match[1].trim();
    if (/^data:/i.test(value)) continue;
    assert.equal(path.dirname(value), ".", `CSS 资源不在同目录：${value}`);
    assert.ok(existsSync(path.join(runtimeDir, value)), `CSS 资源不存在：${value}`);
  }
});

check("不用 ES module，页面里也没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码不碰网络、存储、父窗口或不透明源禁区", () => {
  const forbidden = [
    [/(?:^|[^\w])fetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/WebSocket\s*\(/, "WebSocket"],
    [/EventSource\s*\(/, "EventSource"],
    [/sendBeacon\s*\(/, "sendBeacon"],
    [/importScripts\s*\(/, "importScripts"],
    [/WebTransport\s*\(/, "WebTransport"],
    [/RTCPeerConnection\s*\(/, "RTCPeerConnection"],
    [/(?:Shared)?Worker\s*\(/, "Worker"],
    [/serviceWorker\s*\.\s*register\s*\(/, "serviceWorker.register"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "持久化存储"],
    [/document\s*\.\s*(?:cookie|domain)\b/, "document 安全边界"],
    [/window\s*\.\s*(?:parent|top)\b/, "父窗口"],
  ];
  for (const file of ["index.html", "engine.js", "ui.js", "style.css"]) {
    const source = code(file);
    for (const [pattern, label] of forbidden) assert.doesNotMatch(source, pattern, `${file} 命中 ${label}`);
  }
});

console.log("\n三表模型界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
