import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/self-test-quiz-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const item of direct) if (existsSync(item)) return require(item);
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：界面自测无法运行（引擎自测不受影响）");
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
  pretendToBeVisual: true
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
function set(id, value, eventName = "input") {
  const target = doc.getElementById(id);
  target.value = value;
  target.dispatchEvent(new window.Event(eventName, { bubbles: true }));
}
function click(target) { target.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }

console.log("自测卷界面自测（jsdom，非浏览器）");

check("引擎与界面脚本成功装载", () => {
  assert.ok(window.SelfTestQuizEngine);
  assert.equal(text("#question-count"), "0 道题");
});

check("首屏严格零题，不塞示例题", () => {
  assert.equal(doc.querySelectorAll(".question").length, 0);
  assert.match(screen(), /还没有题目/);
  assert.match(screen(), /不会预塞示例题/);
  assert.equal(text("#add-question"), "出第一道题");
  assert.equal($("#submit-answers").disabled, true);
});

check("首屏判分设置可见且口径齐全", () => {
  const rules = text(".rules");
  assert.match(rules, /完全匹配/);
  assert.match(rules, /命中正确数/);
  assert.match(rules, /各空命中比例/);
  assert.match(rules, /相对答案的百分比容差/);
  assert.match(rules, /正确相邻对比例/);
  assert.match(rules, /正确配对比例/);
  assert.match(rules, /不倒扣/);
});

check("真的出第一道单选题：一道题即可开始作答", () => {
  set("prompt", "地球的天然卫星是？");
  set("options", "月球\n火星\n金星");
  set("correct-answer", "月球");
  set("points", "10");
  set("topic", "天文学");
  set("explanation", "月球是地球唯一的天然卫星。");
  click($("#add-question"));
  assert.equal(text("#editor-error"), "");
  assert.equal(text("#question-count"), "1 道题");
  assert.equal(text("#paper-points"), "10 分");
  assert.equal(doc.querySelectorAll(".question").length, 1);
  assert.match(text(".question"), /地球的天然卫星是/);
  assert.equal($("#submit-answers").disabled, false);
  assert.equal(text("#add-question"), "再出一道题");
});

check("真的选择月球并提交：屏上出现 10 / 10 与逐题得分理由", () => {
  const option = [...doc.querySelectorAll('input[name="answer-1"]')].find((input) => input.value === "月球");
  assert.ok(option, "找不到月球选项");
  click(option);
  $("#quiz-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(text("#score-value"), "10 / 10");
  assert.equal(doc.querySelectorAll("#score-rows tr").length, 1);
  assert.match(text("#score-rows"), /完全匹配/);
  assert.match(text("#score-rows"), /10 \/ 10/);
  assert.match(text("#score-rows"), /月球是地球唯一的天然卫星/);
});

check("切换数值题时，相对容差与单位字段可见", () => {
  set("question-type", "numeric", "change");
  assert.equal(doc.querySelector(".numeric-only").hidden, false);
  assert.match(text("#answer-help"), /容差按答案绝对值的百分比/);
  assert.match(screen(), /答案单位/);
});

check("缺单位的数值题会给出明确错误，不伪装成已添加", () => {
  set("prompt", "声音在空气中的速度约为？");
  set("correct-answer", "343");
  set("unit", "");
  click($("#add-question"));
  assert.match(text("#editor-error"), /必须填写答案单位/);
  assert.equal(text("#question-count"), "1 道题");
});

check("点运行自测，屏上出现全部通过", () => {
  click($("#run-test"));
  assert.match(text("#test-out"), /^(\d+) \/ \1 通过$/);
  assert.match(text("#test-detail"), /六种题型均含全对/);
});

function source(file) { return readFileSync(path.join(runtimeDir, file), "utf8"); }
function code(file) {
  return source(file)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

check("所有 src/href 都是存在的同目录相对文件", () => {
  for (const element of doc.querySelectorAll("[src], [href]")) {
    const attr = element.hasAttribute("src") ? "src" : "href";
    const value = element.getAttribute(attr);
    assert.ok(value && !value.startsWith("/") && !value.startsWith("//"), `不是相对路径：${value}`);
    assert.doesNotMatch(value, /^[a-z][a-z0-9+.-]*:/i, `出现协议：${value}`);
    const resolved = path.resolve(runtimeDir, value);
    assert.equal(path.dirname(resolved), runtimeDir, `不在同目录：${value}`);
    assert.ok(existsSync(resolved), `文件不存在：${value}`);
  }
});

check("不用 ES module，页面没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("运行时源码没有网络、存储或父窗口能力", () => {
  const forbidden = [
    "fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", "sendBeacon(", "importScripts(",
    "WebTransport(", "RTCPeerConnection(", "Worker(", "SharedWorker(", "serviceWorker.register(",
    "cookie", "localStorage", "sessionStorage", "indexedDB", "window.parent", "window.top", "document.domain"
  ];
  for (const file of ["index.html", "style.css", "engine.js", "ui.js"]) {
    for (const token of forbidden) assert.ok(!source(file).includes(token), `${file} 出现禁用串 ${token}`);
  }
});

check("界面装配不使用高风险 HTML 注入", () => {
  for (const file of ["index.html", "engine.js", "ui.js"]) {
    const value = code(file);
    assert.doesNotMatch(value, /\.(inner|outer)HTML\s*\+?=/);
    assert.doesNotMatch(value, /document\s*\.\s*write/);
    assert.doesNotMatch(value, /new\s+Function\s*\(/);
  }
});

console.log("\n自测卷界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
