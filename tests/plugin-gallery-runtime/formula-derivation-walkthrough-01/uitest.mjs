/* 公式展开 · 界面自测（jsdom 程序化装载，不启动浏览器） */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/formula-derivation-walkthrough-01",
);
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
  throw new Error("找不到 jsdom：公式展开界面自测无法运行");
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

function addSymbol(name, value, unit) {
  $("#symbol-name").value = name;
  $("#symbol-value").value = value;
  $("#symbol-unit").value = unit;
  submit($("#symbol-form"));
}

function addStep(basis, expression, unit, precision = "2") {
  $("#step-basis").value = basis;
  $("#step-basis").dispatchEvent(new window.Event("change", { bubbles: true }));
  $("#step-expression").value = expression;
  $("#step-unit").value = unit;
  $("#step-precision").value = precision;
  submit($("#step-form"));
}

function code(file) {
  return readFileSync(path.join(runtimeDir, file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

console.log("公式展开界面自测（jsdom，非浏览器）");

check("入口装载了同目录引擎与界面脚本", () => {
  assert.ok(window.FormulaWalkthroughEngine);
  assert.equal(typeof window.FormulaWalkthroughEngine.evaluate, "function");
});

check("首屏是空符号表与空推导，不伪造示例", () => {
  assert.equal(text("#symbol-count"), "0 个量");
  assert.match(screen(), /先把这个公式里出现的量列出来/);
  assert.match(screen(), /还没有推导步骤/);
  assert.equal($("#step-form").hidden, true);
  assert.equal(doc.querySelectorAll(".symbol-row").length, 0);
  assert.equal(doc.querySelectorAll(".step-row").length, 0);
});

check("加入第一个量后即可写第一步", () => {
  addSymbol("g", "9.80665", "m/s²");
  assert.equal(text("#symbol-count"), "1 个量");
  assert.equal($("#step-form").hidden, false);
  assert.equal(text(".symbol-row .symbol-name"), "g");
  assert.equal(text(".symbol-row .symbol-value"), "9.80665");
  assert.equal(text(".symbol-row .symbol-unit"), "m/s²");
  addStep("定义", "g", "m/s²");
  assert.equal(doc.querySelectorAll(".step-row").length, 1);
  assert.match(text("#step-list"), /定义/);
  assert.match(text("#current-value"), /9\.80665 m\/s²/);
});

check("真实输入 t 后，代入与近似结果、误差同步出现在屏上", () => {
  addSymbol("t", "2.4", "s");
  addStep("定义", "t", "s");
  addStep("代入", "0.5*g*t^2", "m");
  assert.equal(text("#current-value"), "28.2432 m");
  addStep("近似", "0.5*g*t^2", "m", "2");
  assert.equal(text("#current-value"), "28.24 m");
  assert.match(text("#current-basis"), /绝对误差 0\.003152 m/);
  assert.equal(text("#step-count"), "4 步");
});

check("三类错误在界面上保留各自说明，不被压成笼统错误", () => {
  addStep("代入", "1/1e-13", "1");
  assert.match(text("#step-message"), /除数接近零/);
  addStep("代入", "exp(1000)", "1");
  assert.match(text("#step-message"), /数值溢出/);
  addStep("代入", "g+t", "1");
  assert.match(text("#step-message"), /量纲不一致/);
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
    symbolTitle: text("#symbol-title"),
    symbolCount: text("#symbol-count"),
    symbolFields: [...doc.querySelectorAll("#symbol-form label > span")].map((item) => item.textContent.trim()),
    symbols: [...doc.querySelectorAll(".symbol-row")].map((row) =>
      [...row.children].map((item) => item.textContent.trim())),
    stepTitle: text("#step-title"),
    stepCount: text("#step-count"),
    stepFields: [...doc.querySelectorAll("#step-form label > span")].map((item) => item.textContent.trim()),
    current: text("#current-value"),
    basis: text("#current-basis"),
    steps: [...doc.querySelectorAll(".step-row")].map((row) => ({
      index: row.querySelector(".step-index")?.textContent.trim() || "",
      expression: row.querySelector("code")?.textContent.trim() || "",
      note: row.querySelector("p")?.textContent.trim() || "",
      value: row.querySelector(".step-number")?.textContent.trim() || "",
    })),
    selftest: text("#test-out"),
    footer: text("footer"),
  };
  writeFileSync(process.env.W07_PREVIEW_DATA, JSON.stringify(preview, null, 2) + "\n");
}

console.log("\n公式展开界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
