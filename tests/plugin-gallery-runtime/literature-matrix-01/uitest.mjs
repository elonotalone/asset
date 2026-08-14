import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/literature-matrix-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const item of direct) if (existsSync(item)) return require(item);
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const item = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(item)) return require(item);
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
function metric(label) {
  const cell = [...doc.querySelectorAll(".metric")].find((node) => textFrom(node.querySelector(".k")) === label);
  return cell ? textFrom(cell.querySelector(".v")) : null;
}
function textFrom(node) { return node ? node.textContent.replace(/\s+/g, " ").trim() : ""; }
function click(selector) {
  $(selector).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("文献矩阵界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.LiteratureMatrixEngine);
});

check("首屏是零条题录，顶部所有计数均为 0", () => {
  assert.equal(doc.querySelectorAll("#matrix-body tr:not(.empty)").length, 0);
  for (const value of doc.querySelectorAll(".metric .v")) assert.equal(value.textContent.trim(), "0");
  assert.match(text("#import-note"), /不预置任何示例论文/);
  assert.equal($("#record-input").value, "");
});

check("零行抽取表仍写出 11 个可比较字段", () => {
  const headings = [...doc.querySelectorAll("#matrix-head th")].map(textFrom);
  for (const field of window.LiteratureMatrixEngine.DEFAULT_FIELDS) assert.ok(headings.includes(field), `缺字段 ${field}`);
  assert.match(text("#matrix-body"), /零条题录/);
});

check("偏倚观察覆盖四个指定方面", () => {
  for (const name of ["选择与分组", "测量与结局评估", "缺失数据", "报告与利益冲突"]) {
    assert.match(screen(), new RegExp(name));
  }
});

check("纳入、排除、待定同时用颜色类与 ●/×/◆ 形状", () => {
  assert.equal(doc.querySelectorAll("#legend .status").length, 3);
  assert.match(text("#legend"), /● 纳入/);
  assert.match(text("#legend"), /× 排除/);
  assert.match(text("#legend"), /◆ 待定/);
  assert.ok($("#legend .status-included"));
  assert.ok($("#legend .status-excluded"));
  assert.ok($("#legend .status-pending"));
});

const batch = [
  "Chen 2024 | 随机对照试验 | 社区老年人 | 286 | 纳入",
  "Martínez 2022 | 前瞻性队列研究 | 城市成年人 | 612 | 纳入",
  "Okafor 2021 | 横断面研究 | 基层医护人员 | 438 | 纳入",
  "Singh 2020 | 随机对照试验 | 住院患者 | 174 | 重复",
  "Kim 2019 | 病例对照研究 | 青少年 | 205 | 题录排除",
  "Rossi 2018 | 队列研究 | 退休人群 | 721 | 题录排除",
  "Brown 2017 | 混合方法研究 | 照护者 | 96 | 未取到",
  "Wang 2016 | 准实验研究 | 大学生 | 352 | 全文排除",
].join("\n");

check("粘贴 8 条题录并点击导入后，屏上真的出现 8 行", () => {
  $("#record-input").value = batch;
  click("#import-records");
  assert.equal(doc.querySelectorAll("#matrix-body tr:not(.empty)").length, 8);
  assert.match(text("#import-note"), /已导入 8 条/);
  assert.match(text("#matrix-body"), /Chen 2024/);
  assert.match(text("#matrix-body"), /Martínez 2022/);
});

check("导入后计数与 8 → 7 → 5 → 4 → 3 同步", () => {
  assert.equal(metric("已识别"), "8");
  assert.equal(metric("重复"), "1");
  assert.equal(metric("已筛"), "7");
  assert.equal(metric("待取全文"), "5");
  assert.equal(metric("已评估"), "4");
  assert.equal(metric("全文排除"), "1");
  assert.equal(metric("已纳入"), "3");
});

check("五条关系同屏更新且全部一致", () => {
  assert.equal(doc.querySelectorAll(".relation").length, 5);
  assert.equal(doc.querySelectorAll(".relation.bad").length, 0);
  assert.equal((text("#relations").match(/✓/g) || []).length, 5);
  assert.match(text("#relations"), /最终纳入 = 逐条状态计数/);
});

check("字段配置可以增删改写，并立即改表头", () => {
  $("#field-input").value = "作者年份，证据等级，主要结局";
  click("#apply-fields");
  const headings = [...doc.querySelectorAll("#matrix-head th")].map(textFrom);
  assert.ok(headings.includes("证据等级"));
  assert.ok(!headings.includes("研究设计"));
});

check("点击运行自测，屏上显示 11 / 11 通过", () => {
  click("#run-test");
  assert.equal(text("#test-out"), "11 / 11 通过");
});

function code(file) {
  return readFileSync(path.join(runtimeDir, file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

check("所有 src/href 都是同目录相对路径且文件存在", () => {
  const html = code("index.html");
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(refs.length >= 3);
  for (const ref of refs) {
    assert.doesNotMatch(ref, /^(?:[a-z]+:|\/|#)/i, `不是同目录相对路径：${ref}`);
    assert.equal(path.dirname(ref), ".", `跨出同目录：${ref}`);
    assert.ok(existsSync(path.join(runtimeDir, ref)), `文件不存在：${ref}`);
  }
});

check("页面不用 ES module", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
});

check("页面没有 iframe", () => {
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码没有网络、存储或父窗口 API", () => {
  const source = ["index.html", "engine.js", "ui.js", "style.css"].map(code).join("\n");
  const forbidden = [
    /fetch\s*\(/, /XMLHttpRequest/, /WebSocket\s*\(/, /EventSource\s*\(/, /sendBeacon\s*\(/,
    /importScripts\s*\(/, /WebTransport\s*\(/, /RTCPeerConnection\s*\(/,
    /(?:^|[^\w])Worker\s*\(/, /SharedWorker\s*\(/, /serviceWorker\s*\.\s*register\s*\(/,
    /localStorage/, /sessionStorage/, /indexedDB/, /document\s*\.\s*cookie/,
    /window\s*\.\s*(?:parent|top)\b/, /document\s*\.\s*domain/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern);
});

console.log("\n文献矩阵界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
