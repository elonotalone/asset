import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/spaced-repetition-scheduler-01");
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
function set(id, value) {
  const target = doc.getElementById(id);
  target.value = value;
  target.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function click(target) { target.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }

const today = window.SpacedRepetitionEngine.todayISO();
const tomorrow = window.SpacedRepetitionEngine.addDays(today, 1);

console.log("间隔排程界面自测（jsdom，非浏览器）");

check("引擎与界面脚本成功装载", () => {
  assert.ok(window.SpacedRepetitionEngine);
  assert.equal(text("#card-count"), "0 张");
});

check("首屏严格零卡，今日队列为空", () => {
  assert.equal(doc.querySelectorAll("#card-rows tr").length, 0);
  assert.match(screen(), /今天没有要复习的卡片/);
  assert.match(screen(), /不会预塞示例卡/);
  assert.equal(text("#add-card"), "加第一张卡");
  assert.equal(text("#due-count"), "0 张");
});

check("首屏算法摘要与未来日期轴已可见", () => {
  const rules = text(".rules");
  assert.match(rules, /2\.5 \/ 1\.3/);
  assert.match(rules, /1 天 \/ 6 天/);
  assert.match(rules, /上一已取整间隔/);
  assert.match(rules, /原 EF 完全保留/);
  assert.equal(doc.querySelectorAll("#timeline-rows tr").length, 7);
  assert.match(text("#timeline-rows tr"), new RegExp(today));
});

check("真的加第一张卡：卡片与下次复习日期以文本出现", () => {
  set("front", "线粒体的主要功能是什么？");
  set("back", "进行有氧呼吸并合成 ATP。");
  assert.equal($("#start-now").checked, true);
  click($("#add-card"));
  assert.equal(text("#editor-error"), "");
  assert.equal(text("#card-count"), "1 张");
  assert.equal(text("#due-count"), "1 张");
  assert.equal(text("#next-due"), today);
  assert.match(text("#queue-list"), /线粒体的主要功能/);
  assert.match(text("#queue-list"), new RegExp("下次复习：" + today));
  assert.match(text("#action-note"), new RegExp("下次复习：" + today));
  assert.equal(doc.querySelectorAll("#card-rows tr").length, 1);
  assert.equal(text("#add-card"), "再加一张卡");
});

check("真的翻面并评 5 分：间隔、EF 与明日日期同屏更新", () => {
  click($(".reveal"));
  assert.equal($(".card-back").hidden, false);
  assert.match(text(".card-back"), /合成 ATP/);
  assert.equal(doc.querySelectorAll(".rating button").length, 6);
  click(doc.querySelector('button[aria-label="评分 5"]'));
  assert.equal(text("#due-count"), "0 张");
  assert.equal(text("#next-due"), tomorrow);
  assert.match(text("#card-rows"), /1 天/);
  assert.match(text("#card-rows"), /2\.60/);
  assert.match(text("#card-rows"), new RegExp(tomorrow));
  assert.match(text("#action-note"), /按原 EF 2\.50 得间隔 1 天/);
  assert.match(text("#action-note"), new RegExp("下次复习：" + tomorrow));
  const tomorrowRow = [...doc.querySelectorAll("#timeline-rows tr")].find((row) => row.textContent.includes(tomorrow));
  assert.ok(tomorrowRow);
  assert.match(tomorrowRow.textContent, /1 张/);
});

check("点运行自测，屏上出现全部通过", () => {
  click($("#run-test"));
  assert.match(text("#test-out"), /^(\d+) \/ \1 通过$/);
  assert.match(text("#test-detail"), /失败保 EF/);
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

console.log("\n间隔排程界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
