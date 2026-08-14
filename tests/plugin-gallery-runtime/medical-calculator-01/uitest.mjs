import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/medical-calculator-01");
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
  else dom.window.addEventListener("load", resolve);
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() ?? "";
const screen = () => doc.body.textContent.replace(/\s+/g, " ");

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

function type(id, value) {
  const input = $("#" + id);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function choose(id, value) {
  const select = $("#" + id);
  select.value = value;
  assert.equal(select.value, value, `${id} 不包含 ${value}`);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function source(file) {
  return readFileSync(path.join(runtimeDir, file), "utf8");
}

function code(file) {
  return source(file)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

console.log("医疗计算器界面自测（jsdom，非浏览器）");

check("经典脚本已把计算内核装载到页面", () => {
  assert.ok(window.MedicalCalculatorEngine);
});

check("首屏所有个体输入为空，性别也未预选", () => {
  for (const input of doc.querySelectorAll(".input-grid input")) assert.equal(input.value, "", input.id);
  assert.equal($("#sex").value, "");
});

check("未输入时没有个体结果数字，四项都是待输入", () => {
  const values = [...doc.querySelectorAll(".result-value")];
  assert.equal(values.length, 4);
  for (const value of values) {
    assert.equal(value.textContent.trim(), "待输入");
    assert.doesNotMatch(value.textContent, /\d/);
  }
});

check("首屏同时可见口径、单位、分段、来源、适用范围与免责", () => {
  assert.match(screen(), /不用于诊断或处方/);
  assert.match(screen(), /CKD-EPI 2021 去种族版/);
  assert.match(screen(), /Mosteller/);
  assert.match(screen(), /mL\/min\/1\.73 m²/);
  assert.match(screen(), /G1\s*≥90/);
  assert.match(screen(), /G5\s*<15/);
  assert.match(screen(), /分段与公式会随指南与适用人群变化/);
  assert.match(screen(), /口径来源/);
});

check("只填身高 170 与体重 65，只出 BMI 与体表面积", () => {
  type("height", "170");
  type("weight", "65");
  assert.equal(text("#bmi-value"), "22.49");
  assert.equal(text("#bsa-value"), "1.752");
  assert.equal(text("#calcium-value"), "待输入");
  assert.equal(text("#egfr-value"), "待输入");
});

check("填测得钙 8.2 与白蛋白 3.0 后出校正钙 9.00", () => {
  type("calcium", "8.2");
  type("albumin", "3.0");
  assert.equal(text("#calcium-value"), "9.00");
});

check("填年龄、性别与肌酐后出 eGFR 与 G3a 分段", () => {
  type("age", "55");
  choose("sex", "female");
  type("creatinine", "1.2");
  assert.equal(text("#egfr-value"), "53.5");
  assert.match(text("#egfr-status"), /参考分段 G3a/);
});

check("换成 106.08 µmol/L 后复现同一 eGFR", () => {
  choose("creatinine-unit", "umoll");
  type("creatinine", "106.08");
  assert.equal(text("#egfr-value"), "53.5");
  assert.match(screen(), /÷88\.4 近似换成 mg\/dL/);
});

check("坏输入不给数，改回正数可立即恢复", () => {
  type("height", "0");
  assert.equal(text("#bmi-value"), "待输入");
  assert.match(text("#input-message"), /身高需输入大于 0/);
  type("height", "170");
  assert.equal(text("#bmi-value"), "22.49");
});

check("点运行自测后屏上显示全部通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(text("#test-out"), "10 / 10 通过");
});

check("没有外部资源：所有 src/href 都是同目录相对路径", () => {
  for (const match of code("index.html").matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    assert.doesNotMatch(match[1], /^(?:[a-z]+:|\/\/|\/)/i, `非相对路径 ${match[1]}`);
    assert.equal(path.posix.dirname(match[1]), ".", `不在同目录 ${match[1]}`);
    assert.ok(existsSync(path.join(runtimeDir, match[1])), `缺文件 ${match[1]}`);
  }
  assert.doesNotMatch(code("style.css"), /@import|url\s*\(/i);
});

check("不用 ES module，页面也没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码不使用网络 API", () => {
  const forbidden = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|WebTransport|RTCPeerConnection|Worker|SharedWorker)\s*\(|serviceWorker\s*\.\s*register\s*\(/;
  for (const file of ["index.html", "engine.js", "ui.js", "style.css"]) assert.doesNotMatch(code(file), forbidden, file);
});

check("源码不碰存储、父窗口与 document.domain", () => {
  const forbidden = /\b(?:localStorage|sessionStorage|indexedDB)\b|document\s*\.\s*(?:cookie|domain)\b|window\s*\.\s*(?:parent|top)\b/;
  for (const file of ["index.html", "engine.js", "ui.js"]) assert.doesNotMatch(code(file), forbidden, file);
});

console.log("\n医疗计算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
