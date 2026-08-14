import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/dialogue-branch-script-01",
);
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const directPath of direct) if (existsSync(directPath)) return require(directPath);
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
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();
const text = (selector) => ($(selector)?.textContent || "").replace(/\s+/g, " ").trim();
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err?.message || String(err)));
  }
}

function input(selector, value) {
  const node = $(selector);
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function click(selector) {
  $(selector).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

console.log("话术分支界面自测（jsdom，非浏览器）");

check("经典脚本成功装配同一份计算内核", () => {
  assert.ok(window.DialogueBranchEngine);
});

check("首屏是空画布、中央提示指定问句、零节点", () => {
  assert.match(text("#question"), /开场第一句你会怎么说/);
  assert.match(text("#graph"), /开场第一句你会怎么说/);
  assert.equal(doc.querySelectorAll("#graph .node").length, 0);
});

check("覆盖尚未计算，首屏没有先铺一片告警", () => {
  assert.match(text("#coverage-state"), /尚未计算/);
  assert.equal(doc.querySelectorAll("#diagnostics .warning").length, 0);
  assert.doesNotMatch(text("#diagnostics"), /死端|不可达/);
});

check("真写开场白后，SVG 立即出现第一个节点", () => {
  input("#opening-input", "我们先把你最担心的结果说清楚。");
  assert.equal(doc.querySelectorAll("#graph .node").length, 1);
  assert.match(text("#graph"), /开场/);
  assert.match($("#export-output").value, /我们先把你最担心的结果说清楚/);
});

check("继续后真加一个带条件的下一步，图与导出同步增长", () => {
  click("#continue-branch");
  input("#next-text", "我担心换方案以后团队来不及适应。");
  input("#condition-value", "来不及");
  click("#add-next");
  assert.equal(doc.querySelectorAll("#graph .node").length, 2);
  assert.match($("#export-output").value, /回应包含“来不及”/);
  assert.match(text("#coverage-state"), /2 个节点/);
});

check("载入可复核示例后，死端与不可达都按节点名显示", () => {
  click("#load-demo");
  assert.match(text("#diagnostics"), /死端：等待确认/);
  assert.match(text("#diagnostics"), /不可达：孤立备忘/);
  assert.match($("#export-output").value, /澄清回边（不增加最大深度）/);
});

check("导出文本是可手动选中的可见 textarea，不依赖剪贴板", () => {
  const output = $("#export-output");
  assert.equal(output.tagName, "TEXTAREA");
  assert.equal(output.readOnly, true);
  assert.ok(output.value.length > 80);
  output.select();
  assert.equal(output.selectionStart, 0);
  assert.equal(output.selectionEnd, output.value.length);
});

check("点运行自测后，页面显示全部通过", () => {
  click("#run-test");
  assert.match(text("#test-out"), /^(\d+) \/ \1 通过$/);
  assert.equal(text("#test-out"), "6 / 6 通过");
});

check("页面代码没有危险的动态 HTML 或执行入口", () => {
  for (const file of ["index.html", "engine.js", "ui.js"]) {
    const source = code(file);
    assert.doesNotMatch(source, /\.(?:inner|outer)HTML\s*\+?=/, file + " 出现动态 HTML 赋值");
    assert.doesNotMatch(source, /(?<![\w.$])eval\s*\(/, file + " 出现 eval");
    assert.doesNotMatch(source, /new\s+Function\s*\(/, file + " 出现 new Function");
    assert.doesNotMatch(source, /document\s*\.\s*write/, file + " 出现 document.write");
  }
});

check("所有 src/href 都是存在的同目录相对资源", () => {
  for (const node of doc.querySelectorAll("[src], [href]")) {
    const value = node.getAttribute("src") || node.getAttribute("href");
    assert.doesNotMatch(value, /^(?:[a-z]+:|\/|\\)/i, "不是同目录相对路径：" + value);
    assert.ok(existsSync(path.join(runtimeDir, value)), "资源不存在：" + value);
  }
});

check("不用 ES module", () => {
  assert.equal(doc.querySelectorAll('script[type="module"]').length, 0);
});

check("页面里没有 iframe", () => {
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码没有网络 API、存储 API 或父窗口访问", () => {
  const source = ["index.html", "style.css", "engine.js", "ui.js"].map(code).join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|importScripts\s*\(|WebTransport\s*\(|RTCPeerConnection\s*\(|(?:Shared)?Worker\s*\(|serviceWorker\s*\.\s*register\s*\(/);
  assert.doesNotMatch(source, /\b(?:cookie|localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(source, /window\s*\.\s*(?:parent|top)\b|document\s*\.\s*domain/);
});

if (process.argv.includes("--cover-data")) {
  const cover = {
    title: text(".head h1"),
    sub: text(".head .sub"),
    question: text("#question"),
    coverage: text("#coverage-state"),
    nodes: [...doc.querySelectorAll("#graph .node")].map((node) =>
      [...node.querySelectorAll("text")].map((part) => part.textContent.trim()).join("｜"),
    ),
    diagnostics: [...doc.querySelectorAll("#diagnostics p")].map((node) => node.textContent.trim()),
    exportLines: $("#export-output").value.split("\n").slice(0, 12),
    selftest: text("#test-out"),
  };
  console.log("COVER_JSON " + JSON.stringify(cover));
}

console.log("\n话术分支界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
