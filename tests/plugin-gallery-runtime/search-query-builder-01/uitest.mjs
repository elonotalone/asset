import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/search-query-builder-01");
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
const all = (selector) => [...doc.querySelectorAll(selector)];
const textFrom = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
const text = (selector) => textFrom($(selector));
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
function click(node) {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function say(value) {
  $("#answer").value = value;
  $("#ask").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}
// 屏上那条式子：只取查询文本，不含概念名、更正与字段选择（它们都 user-select: none）
function onScreenQuery() {
  return all("#typeset .line").map((line) => textFrom(line)).join(" ");
}
function wordNode(label) {
  return all("#typeset .w").find((node) => textFrom(node) === label);
}

console.log("检索式构造界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.QueryBuilderEngine);
});

check("首屏没有示例词，查询式为空，但它的位置从一开始就在", () => {
  assert.equal(onScreenQuery(), "");
  assert.equal($("#baseline").hidden, false, "排字基线要在，不显示空框告警");
  assert.equal($("#answer").value, "");
  assert.equal(text("#q"), "一句话说清你要查什么");
  assert.doesNotMatch(screen(), /老年人|跌倒|aged/);
});

check("屏幕上没有标题、副标题、流程说明、载入示例与运行自测", () => {
  assert.equal($("#run-test"), null);
  assert.equal(doc.querySelectorAll("h1, h2").length, 0);
  for (const banned of [
    "运行自测", "把研究问题拆成概念块", "用大白话写", "语法交给工具",
    "载入一个示例", "产物 ·", "这段文字可以直接选中复制", "剪贴板",
  ]) {
    assert.doesNotMatch(screen(), new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), banned);
  }
});

check("写下研究问题，它退到上边缘当来源注记，不带「要查什么」标签", () => {
  say("运动干预能不能降低老年人跌倒的发生？");
  assert.equal(text("#origin"), "运动干预能不能降低老年人跌倒的发生？");
  assert.doesNotMatch(screen(), /要查什么/);
  assert.equal(text("#q"), "这个问题里有哪几个概念？先写第一个");
});

check("补进第一个词，中央立刻出现最小的、带字段的查询式", () => {
  say("人群");
  assert.equal(text("#q"), "「人群」有哪些说法？");
  assert.equal(onScreenQuery(), "", "还没有词，式子仍然是空的");
  say("aged");
  assert.equal(onScreenQuery(), "(aged[Title/Abstract])");
  assert.equal($("#baseline").hidden, true);
});

check("概念名和它的同义词原文都在屏上，不是「概念 1」也不是色块", () => {
  say("elderly");
  say("older adults");
  click($("#more"));
  say("干预");
  say("exercise");
  say("physical activity");
  click($("#more"));
  say("结局");
  say("accidental falls");
  say("fall*");
  const tags = all("#typeset .tag").map(textFrom);
  assert.deepEqual(tags, ["人群", "干预", "结局"]);
  const words = all("#typeset .w").map(textFrom);
  assert.deepEqual(words, [
    "aged", "elderly", "older adults", "exercise", "physical activity", "accidental falls", "fall",
  ]);
});

check("屏上那条式子逐字等于内核编出来的查询串", () => {
  const compiled = window.QueryBuilderEngine.compile([
    { label: "人群", terms: [{ text: "aged", field: "tiab" }, { text: "elderly", field: "tiab" }, { text: "older adults", field: "tiab" }] },
    { label: "干预", terms: [{ text: "exercise", field: "tiab" }, { text: "physical activity", field: "tiab" }] },
    { label: "结局", terms: [{ text: "accidental falls", field: "tiab" }, { text: "fall*", field: "tiab" }] },
  ], "pubmed").query;
  assert.equal(onScreenQuery(), compiled);
  assert.equal($("#carry").value, compiled);
});

check("人写的词和工具加的结构分成两种质地，不排成同一团", () => {
  const structure = all("#typeset .s").map(textFrom);
  assert.ok(structure.includes("("));
  assert.ok(structure.includes(")"));
  assert.ok(structure.some((token) => token === "OR"));
  assert.ok(structure.some((token) => token === "AND"));
  assert.ok(structure.includes("[Title/Abstract]"));
  assert.ok(structure.includes('"'), "词组的引号也是工具加的结构");
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.match(css, /\.s\s*\{[^}]*font-family:\s*var\(--mono\)/);
  assert.match(css, /\.tag\s*\{[^}]*user-select:\s*none/s, "概念名不参与选择，整条式子选下来才是干净文本");
});

check("字段选择贴着它改变的那个词，不另占一片设置区", () => {
  click(wordNode("accidental falls"));
  const picker = $("#typeset .picker");
  assert.ok(picker, "点开词之后没出现字段选择");
  assert.equal(textFrom(picker.querySelector(".was")), "accidental falls");
  const fields = [...picker.querySelectorAll(".field")].map(textFrom);
  assert.deepEqual(fields, ["标题与摘要", "标题", "主题词", "全字段"]);
  const mesh = [...picker.querySelectorAll(".field")].find((node) => textFrom(node) === "主题词");
  click(mesh);
  assert.match(onScreenQuery(), /"accidental falls"\[MeSH Terms\]/);
});

check("换一个数据库，同一份概念结构就地重编译，不必维护第二份字符串", () => {
  const banks = all(".bank").map(textFrom);
  assert.deepEqual(banks, ["PubMed", "arXiv", "通用布尔"]);
  const arxiv = all(".bank").find((node) => textFrom(node) === "arXiv");
  click(arxiv);
  assert.match(onScreenQuery(), /abs:aged/);
  assert.match(onScreenQuery(), /all:"accidental falls"/);
});

check("降级与去截词就地贴在被改写的那一个词上：原词、库名、字段真名都在", () => {
  const fixes = all("#typeset .fix");
  assert.equal(fixes.length, 2, "两处改写各一条更正");
  const downgrade = fixes.find((node) => textFrom(node).includes("accidental falls"));
  assert.match(textFrom(downgrade), /accidental falls/);
  assert.match(textFrom(downgrade), /arXiv/);
  assert.match(textFrom(downgrade), /主题词/);
  assert.match(textFrom(downgrade), /全字段/);
  assert.match(textFrom(downgrade), /all:"accidental falls"/);
  const cut = fixes.find((node) => textFrom(node).includes("fall*"));
  assert.match(textFrom(cut), /截词/);
  assert.match(textFrom(cut), /arXiv/);
  assert.ok(wordNode("fall").className.includes("loose"), "被改写的那个词本身要略微松开");
});

check("头号结论先说最影响检索含义的那件事", () => {
  assert.match(text("#verdict"), /换了字段/);
  assert.match(text("#verdict"), /放宽/);
  const pubmed = all(".bank").find((node) => textFrom(node) === "PubMed");
  click(pubmed);
  assert.equal(text("#verdict"), "这条式子可以带走");
});

check("空概念块不产生空括号，头号结论点名是哪一块", () => {
  click($("#more"));
  say("对照");
  assert.doesNotMatch(onScreenQuery(), /\(\)/);
  assert.match(text("#verdict"), /「对照」还没有可用的词/);
  assert.equal(all("#typeset .tag").length, 3, "空块不进式子");
});

check("复制只是贴在末端的快捷动作，查询文本本身仍在屏上可选中", () => {
  assert.equal($("#copy").hidden, false);
  assert.equal(text("#copy"), "复制");
  assert.ok($("#carry").value.length > 40);
  assert.equal(onScreenQuery().length > 40, true);
});

check("点概念名回到那一块继续加说法", () => {
  const tag = all("#typeset .tag").find((node) => textFrom(node) === "干预");
  click(tag);
  assert.equal(text("#q"), "「干预」有哪些说法？");
  say("resistance training");
  assert.match(onScreenQuery(), /"resistance training"\[Title\/Abstract\]/);
});

check("删掉一个词，式子当场重排", () => {
  click(wordNode("resistance training"));
  click($("#typeset .picker .drop"));
  assert.doesNotMatch(onScreenQuery(), /resistance training/);
});

check("没写死 9px／10px 这类小字", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(css, /字号不得小于|不小于\s*\d+\s*px/);
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

console.log("\n检索式构造界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
