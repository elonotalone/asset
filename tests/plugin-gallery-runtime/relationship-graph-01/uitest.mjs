/* 关系图 · 界面自测：jsdom 真装载、真输入、真点击，并读取 SVG 与屏幕文本。 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/relationship-graph-01",
);
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const candidate of direct) {
    if (existsSync(candidate)) return require(candidate);
  }
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：关系图界面自测无法运行");
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
  else dom.window.addEventListener("load", resolve, { once: true });
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const text = (selector) => {
  const node = $(selector);
  return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
};
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    console.log(
      "  FAIL " + name + "\n       " +
      (error && error.message ? error.message : String(error)),
    );
  }
}

function setValue(selector, value) {
  const control = $(selector);
  assert.ok(control, "找不到控件 " + selector);
  control.value = value;
  control.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function click(selector) {
  const control = $(selector);
  assert.ok(control, "找不到按钮 " + selector);
  control.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("关系图界面自测（jsdom，非浏览器）");

check("经典脚本加载成功，页面取得同一份关系图内核", () => {
  assert.ok(window.RelationshipGraphEngine);
});

check("首屏是空画布，中央直接问「谁 — 什么关系 — 和谁」", () => {
  assert.equal(text("#stat-nodes"), "0");
  assert.equal(text("#stat-edges"), "0");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 0);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 0);
  assert.equal($("#graph-empty").hidden, false);
  assert.equal($("#relation-line").hasAttribute("autofocus"), true);
  assert.match(text("#path-result"), /尚无路径/);
  assert.match(screen(), /最多 120 个节点/);
});

check("空画布上一次输入就得到两个节点与第一条边", () => {
  setValue("#relation-line", "张三（人物）｜代理｜李四（人物）｜2026-01-05");
  click("#add-relation");
  assert.equal(text("#stat-nodes"), "2");
  assert.equal(text("#stat-edges"), "1");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 2);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 1);
});

check("载入示例后才出现阿波罗 11 号样例与六项可复核统计", () => {
  click("#load-demo");
  assert.equal(text("#stat-nodes"), "7");
  assert.equal(text("#stat-edges"), "8");
  assert.equal(text("#stat-degree"), "4");
  assert.equal(text("#stat-components"), "1");
  assert.equal(text("#stat-cycles"), "2");
  assert.equal(text("#stat-density"), "0.1905");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 7);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 8);
  assert.equal(doc.querySelectorAll('#graph .graph-node[data-type="person"] ellipse').length, 4);
  assert.equal(doc.querySelectorAll('#graph .graph-node[data-type="organization"] rect').length, 1);
  assert.equal(doc.querySelectorAll('#graph .graph-node[data-type="event"] polygon').length, 2);
  assert.equal($("#relation-line").hasAttribute("autofocus"), true);
  assert.match(screen(), /最多 120 个节点/);
  assert.match(screen(), /有向密度 = E/);
});

check("默认最短路径以文本显示为 3 条关系、2 个中介", () => {
  assert.match(text("#path-result"), /迈克尔·柯林斯 → 阿波罗11号任务 → 巴兹·奥尔德林 → 理查德·尼克松/);
  assert.match(text("#path-result"), /3 条关系，2 个中介/);
});

check("逐条关系把方向、关系名与日期写进可选中的 pre", () => {
  assert.equal($("#relationship-text").tagName, "PRE");
  assert.equal(text("#relationship-text").split("｜").length - 1, 8);
  assert.match(text("#relationship-text"), /美国国家航空航天局 —组织→ 阿波罗11号任务｜1969-07-16/);
  assert.match(text("#relationship-text"), /理查德·尼克松 —通话→ 巴兹·奥尔德林｜1969-07-20/);
});

check("真加一个节点并真连一条边：SVG、文本与统计同步变化", () => {
  click("#add-relation");
  assert.equal(text("#stat-nodes"), "8");
  assert.equal(text("#stat-edges"), "9");
  assert.equal(text("#stat-density"), "0.1607");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 8);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 9);
  assert.match(text("#relationship-text"), /美国国家航空航天局 —设立→ 载人航天中心｜1961-11-01/);
  assert.match(text("#input-message"), /关系已加入：8 个节点、9 条关系/);
});

check("真点两个 SVG 节点，路径端点与文本结论随之更新", () => {
  click('#graph .graph-node[data-id="collins"]');
  assert.match(text("#path-prompt"), /选择路径终点/);
  click('#graph .graph-node[data-id="nixon"]');
  assert.match(text("#path-result"), /迈克尔·柯林斯 → 阿波罗11号任务/);
  assert.match(text("#path-result"), /3 条关系，2 个中介/);
  assert.match(text("#input-message"), /文本路径已重算/);
});

check("反向关系保留为两条方向相反的二次曲线", () => {
  setValue("#relation-line", "阿波罗11号任务｜受组织于｜美国国家航空航天局｜1969-07-16");
  click("#add-relation");
  const forward = $('#graph .graph-edge[data-from="nasa"][data-to="apollo11"]');
  const reverse = $('#graph .graph-edge[data-from="apollo11"][data-to="nasa"]');
  assert.ok(forward && reverse);
  assert.notEqual(forward.getAttribute("d"), reverse.getAttribute("d"));
});

check("坏输入在当前问句下给文本提示且不画脏数据", () => {
  const beforeNodes = doc.querySelectorAll("#graph .graph-node").length;
  const beforeEdges = doc.querySelectorAll("#graph .graph-edge").length;
  setValue("#relation-line", "甲｜会见｜乙｜2025-02-30");
  click("#add-relation");
  assert.match(text("#input-message"), /日期须为真实的 YYYY-MM-DD/);
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, beforeNodes);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, beforeEdges);
});

check("清空入口回到第一条关系提示，恢复入口重新载入样例", () => {
  click("#clear-graph");
  assert.equal(text("#stat-nodes"), "0");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 0);
  assert.equal($("#graph-empty").hidden, false);
  assert.match(text("#path-result"), /尚无路径/);
  click("#load-demo");
  assert.equal(text("#stat-nodes"), "7");
  assert.equal(text("#stat-edges"), "8");
});

check("页面运行自测按钮显示全部通过", () => {
  click("#run-test");
  const out = text("#test-out");
  assert.match(out, /^(\d+) \/ \1 通过$/);
  assert.match(text("#test-detail"), /密度、度数、连通分量、圈秩、路径与确定性布局均通过/);
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("所有 src/href 均为同目录相对路径且文件存在", () => {
  for (const element of doc.querySelectorAll("[src], [href]")) {
    const attribute = element.hasAttribute("src") ? "src" : "href";
    const value = element.getAttribute(attribute);
    assert.ok(value && path.basename(value) === value, "不是同目录相对路径：" + value);
    assert.doesNotMatch(value, /^(?:[a-z]+:|\/|\\)/i, "不是相对路径：" + value);
    assert.ok(existsSync(path.join(runtimeDir, value)), "资源不存在：" + value);
  }
});

check("没有 ES module、iframe、base 或 refresh 跳转", () => {
  assert.equal(doc.querySelectorAll('script[type="module"]').length, 0);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
  assert.equal(doc.querySelectorAll("base").length, 0);
  assert.equal(doc.querySelectorAll('meta[http-equiv="refresh" i]').length, 0);
});

check("源码没有发布器禁止的全部网络 API", () => {
  const forbidden = [
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket\s*\(/,
    /EventSource\s*\(/,
    /sendBeacon\s*\(/,
    /importScripts\s*\(/,
    /WebTransport\s*\(/,
    /RTCPeerConnection\s*\(/,
    /(?:Shared)?Worker\s*\(/,
    /serviceWorker\s*\.\s*register\s*\(/,
  ];
  for (const file of ["index.html", "engine.js", "ui.js", "style.css"]) {
    const source = code(file);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, file + " 命中 " + pattern);
  }
});

check("源码不碰不透明源禁用的存储、父窗口与 document.domain", () => {
  const forbidden = [
    /document\s*\.\s*cookie/,
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /window\s*\.\s*(?:parent|top)\b/,
    /document\s*\.\s*domain/,
  ];
  for (const file of ["index.html", "engine.js", "ui.js"]) {
    const source = code(file);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, file + " 命中 " + pattern);
  }
});

check("CSS 没有外部 url 或 @import", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /@import\b/i);
  assert.doesNotMatch(css, /url\s*\(/i);
});

check("页面代码不用 innerHTML、eval、new Function 或 document.write", () => {
  for (const file of ["index.html", "engine.js", "ui.js"]) {
    const source = code(file);
    assert.doesNotMatch(source, /\.(?:inner|outer)HTML\s*\+?=/);
    assert.doesNotMatch(source, /(?<![\w.$])eval\s*\(/);
    assert.doesNotMatch(source, /new\s+Function\s*\(/);
    assert.doesNotMatch(source, /document\s*\.\s*write/);
  }
});

console.log(
  "\n关系图界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"),
);
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
