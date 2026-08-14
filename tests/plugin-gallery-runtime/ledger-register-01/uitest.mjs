/* 台账 · 界面自测：用 jsdom 真装载页面、录入数据并读取屏幕结果。 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/ledger-register-01");
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
  throw new Error("找不到 jsdom：台账界面自测无法运行");
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

function click(selector) {
  const control = $(selector);
  assert.ok(control, `找不到按钮 ${selector}`);
  control.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function pickMode(mode) {
  const control = $("#mode");
  control.value = mode;
  assert.equal(control.value, mode, `用途 ${mode} 不在下拉框中`);
  control.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function metricValue(label) {
  for (const metric of doc.querySelectorAll(".metric")) {
    if (metric.querySelector(".label")?.textContent.trim() === label) {
      return metric.querySelector(".value")?.textContent.trim();
    }
  }
  return null;
}

console.log("台账界面自测（jsdom，非浏览器）");

check("引擎与装配脚本都已运行", () => {
  assert.ok(window.LedgerEngine, "window.LedgerEngine 不存在");
  assert.equal(metricValue("记录"), "0");
});

check("首屏是带列名的 0 条空表，所有合计如实为 0.00", () => {
  assert.deepEqual(
    [...doc.querySelectorAll("#table-head th")].map((node) => node.textContent.trim()),
    ["日期", "项目", "借方", "贷方", "余额", "操作"],
  );
  assert.equal(doc.querySelectorAll("#table-body .data-row").length, 0);
  assert.equal(metricValue("借方合计"), "0.00");
  assert.equal(metricValue("贷方合计"), "0.00");
  assert.equal(metricValue("期末余额"), "0.00");
  assert.match($("#reconcile-line").textContent, /舍入调整 0\.00/);
});

check("直接在第一行录一笔，记录数、借方合计与连续余额同步变化", () => {
  setValue("#draft-date", "2026-08-14");
  setValue("#draft-item", "差旅预付款");
  setValue("#draft-debit", "1250.50");
  setValue("#draft-credit", "0");
  click(".draft-row button");
  assert.equal(doc.querySelectorAll("#table-body .data-row").length, 1);
  assert.equal(metricValue("记录"), "1");
  assert.equal(metricValue("借方合计"), "1 250.50");
  assert.equal(metricValue("贷方合计"), "0.00");
  assert.equal(metricValue("期末余额"), "1 250.50");
  assert.match(screen(), /差旅预付款/);
});

check("生成 CSV 后文本可手动选择，且含真实录入行", () => {
  click("#make-csv");
  assert.match($("#csv-out").value, /^日期,项目,借方,贷方,余额\n/);
  assert.match($("#csv-out").value, /差旅预付款,1250\.50,0\.00,1250\.50/);
});

check("应收首行录入后，未收与六档合计在屏上严格回勾", () => {
  pickMode("receivable");
  assert.equal(doc.querySelectorAll("#table-body .data-row").length, 0, "不应混入流水记录");
  setValue("#draft-date", "2026-07-01");
  setValue("#draft-item", "门店货款");
  setValue("#draft-due", "2026-07-14");
  setValue("#draft-amount", "1500");
  setValue("#draft-received", "300");
  click(".draft-row button");
  assert.equal(metricValue("未收合计"), "1 200.00");
  assert.match($("#reconcile-line").textContent, /31–60 天 1 200\.00/);
  assert.match($("#reconcile-line").textContent, /六档合计 1 200\.00 = 未收 1 200\.00（已对上）/);
});

check("库存首行录入后显示 120 + 45 − 18 = 147", () => {
  pickMode("inventory");
  setValue("#draft-date", "2026-08-14");
  setValue("#draft-item", "成品 A");
  setValue("#draft-opening", "120");
  setValue("#draft-inbound", "45");
  setValue("#draft-outbound", "18");
  click(".draft-row button");
  assert.equal(metricValue("期末合计"), "147.00");
  assert.match($("#reconcile-line").textContent, /120\.00 \+ 45\.00 − 18\.00 = 147\.00/);
});

check("折旧首行可生成完整五年表，双倍余额末期转直线且不低于残值", () => {
  pickMode("depreciation");
  setValue("#draft-asset", "生产设备");
  setValue("#draft-cost", "100000");
  setValue("#draft-salvage", "10000");
  setValue("#draft-life", "5");
  setValue("#draft-method", "double-declining");
  click(".draft-row button");
  assert.equal(doc.querySelectorAll("#table-body .schedule-row").length, 5);
  assert.equal(metricValue("期末净值"), "10 000.00");
  assert.match(screen(), /转直线/);
});

check("点运行自测后，屏幕显示内置 6 / 6 通过", () => {
  click("#run-test");
  assert.equal($("#test-out").textContent.trim(), "6 / 6 通过");
  assert.match(screen(), /流水、账龄、库存与三种折旧口径均通过/);
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

console.log("\n台账界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
