import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/legal-calculator-01");
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
  assert.equal(input.value, value, `${id} 未接受 ${value}`);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
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

console.log("法律计算器界面自测（jsdom，非浏览器）");

check("经典脚本已把计算内核装载到页面", () => {
  assert.ok(window.LegalCalculatorEngine);
});

check("首屏所有个案输入为空", () => {
  const inputs = [...doc.querySelectorAll(".calculator input")];
  assert.ok(inputs.length >= 12);
  for (const input of inputs) assert.equal(input.value, "", input.id);
});

check("未输入时没有个案结果数字，全部结果均为待输入", () => {
  const values = [...doc.querySelectorAll(".result-value")];
  assert.equal(values.length, 5);
  for (const value of values) {
    assert.equal(value.textContent.trim(), "待输入", value.id);
    assert.doesNotMatch(value.textContent, /\d/);
  }
  assert.match(text("#fee-breakdown"), /待输入/);
});

check("首屏同时可见地区、口径、法源、生效日期与免责声明", () => {
  assert.match(screen(), /适用地区：中国大陆/);
  assert.match(screen(), /不构成法律意见或裁判结论/);
  assert.match(screen(), /劳动合同法.*第 47、87 条/);
  assert.match(screen(), /劳动法.*第 44 条/);
  assert.match(screen(), /诉讼费用交纳办法.*第 13 条/);
  assert.match(screen(), /2007-04-01 施行/);
  assert.match(screen(), /150%.*200%.*300%/);
  assert.match(screen(), /21\.75 天/);
  assert.match(screen(), /一年期 LPR 的 4 倍/);
});

check("劳动补偿界面覆盖刚好六个月、刚好一年和一年零一天", () => {
  type("labor-salary", "10000");
  type("local-average", "8000");
  type("service-years", "0");
  type("service-months", "6");
  type("service-days", "0");
  assert.equal(text("#compensation-value"), "10,000.00");
  assert.equal(text("#illegal-value"), "20,000.00");

  type("service-years", "1");
  type("service-months", "0");
  assert.equal(text("#compensation-value"), "10,000.00");

  type("service-days", "1");
  assert.equal(text("#compensation-value"), "15,000.00");
  assert.equal(text("#illegal-value"), "30,000.00");
  assert.match(text("#compensation-status"), /补偿月数 1\.5/);
});

check("加班三档倍数与 21.75 天在界面算出分项和总额", () => {
  type("overtime-salary", "21750");
  type("weekday-hours", "1");
  type("rest-hours", "1");
  type("holiday-hours", "1");
  assert.equal(text("#overtime-value"), "812.50");
  assert.match(text("#overtime-status"), /187\.50.*250\.00.*375\.00/);
});

check("财产案件费分段明细求和回到总额", () => {
  type("claim-amount", "200000");
  assert.equal(text("#fee-value"), "4,300.00");
  assert.match(text("#fee-breakdown"), /固定 50\.00 元/);
  assert.match(text("#fee-breakdown"), /100,000–200,000 元部分/);
  assert.match(text("#fee-breakdown"), /明细合计 4,300\.00 元，与总额一致/);
});

check("填合同日期与该日 LPR 后才出现四倍年利率", () => {
  type("contract-date", "2024-01-01");
  assert.equal(text("#lpr-cap-value"), "待输入");
  type("lpr-rate", "3.45");
  assert.equal(text("#lpr-cap-value"), "13.80");
  assert.match(text("#lpr-cap-status"), /2024-01-01.*3\.45% × 4/);
});

check("坏输入撤掉个案结果，改回有效值可立即恢复", () => {
  type("service-months", "12");
  assert.equal(text("#compensation-value"), "待输入");
  assert.match(text("#labor-message"), /余下月数/);
  type("service-months", "0");
  assert.equal(text("#compensation-value"), "15,000.00");
});

check("点运行自测后屏上显示全部通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(text("#test-out"), "8 / 8 通过");
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

console.log("\n法律计算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
