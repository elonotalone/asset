/*
 * 概念图谱 · 界面自测
 *
 * jsdom 真装载 index.html，真输入、点按钮并读取屏幕与 SVG DOM。
 * 不启动浏览器、不截图、不联网。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/concept-knowledge-graph-01",
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
  throw new Error("找不到 jsdom：概念图谱界面自测无法运行");
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

function setValue(selector, value, eventName = "input") {
  const control = $(selector);
  assert.ok(control, "找不到控件 " + selector);
  control.value = value;
  control.dispatchEvent(new window.Event(eventName, { bubbles: true }));
}

function click(selector) {
  const control = $(selector);
  assert.ok(control, "找不到按钮 " + selector);
  control.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("概念图谱界面自测（jsdom，非浏览器）");

check("经典脚本加载成功，页面取得同一份概念图谱内核", () => {
  assert.ok(window.ConceptGraphEngine);
});

check("首屏带真实电磁感应样例与可复核结论", () => {
  assert.equal(text("#stat-nodes"), "7");
  assert.equal(text("#stat-layers"), "7");
  assert.equal(text("#stat-critical"), "350 分");
  assert.equal(doc.querySelectorAll("#detail-body tr").length, 7);
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 7);
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 8);
  assert.match(screen(), /有效掌握度 = 记录掌握度/);
  assert.match(screen(), /最多 120 个概念/);
});

check("默认最短必修路径以文本显示为 6 条边", () => {
  assert.match(text("#path-result"), /磁场 → 磁通量 → 法拉第电磁感应定律/);
  assert.match(text("#path-result"), /变压器原理；6 条必修边/);
});

check("真加一个节点：SVG、明细与大数从 7 同步变 8", () => {
  setValue("#concept-name", "感应电场");
  setValue("#concept-minutes", "35");
  setValue("#concept-mastery", "0.30");
  setValue("#concept-days", "0");
  click("#add-node");
  assert.equal(text("#stat-nodes"), "8");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 8);
  assert.equal(doc.querySelectorAll("#detail-body tr").length, 8);
  assert.match(text("#input-message"), /已加入“感应电场”/);
  assert.match(screen(), /感应电场/);
});

check("真连一条必修边：SVG 边数增加，最短路径文本随之出现", () => {
  setValue("#edge-from", "faraday-law", "change");
  setValue("#edge-kind", "required", "change");
  setValue("#edge-to", "concept-8", "change");
  click("#add-edge");
  assert.equal(doc.querySelectorAll("#graph .graph-edge").length, 9);
  assert.match(text("#path-result"), /法拉第电磁感应定律 → 感应电场；1 条必修边/);
  assert.match(text("#input-message"), /关系已加入/);
});

check("点击新增节点后，屏幕文本列出它的必修前驱与后继", () => {
  const node = doc.querySelector('#graph .graph-node[data-id="concept-8"]');
  assert.ok(node);
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.match(text("#selection-detail"), /感应电场｜必修前驱：法拉第电磁感应定律；必修后继：无/);
});

check("掌握阈值越界输入会夹到 0.95 并同帧重算", () => {
  setValue("#threshold", "1", "change");
  assert.equal($("#threshold").value, "0.95");
  assert.match(text("#input-message"), /掌握阈值已更新/);
});

check("清空入口能回到规格规定的从零提示", () => {
  click("#clear-graph");
  assert.equal(text("#stat-nodes"), "0");
  assert.equal(doc.querySelectorAll("#graph .graph-node").length, 0);
  assert.equal($("#graph-empty").hidden, false);
  assert.match(text("#graph-empty"), /先写下你要弄懂的第一个概念/);
  assert.match(text("#path-result"), /尚未分层/);
});

check("页面运行自测按钮显示全部通过", () => {
  click("#run-test");
  const out = text("#test-out");
  assert.match(out, /^(\d+) \/ \1 通过$/);
  assert.match(text("#test-detail"), /公式、分层、路径、循环与确定性布局均通过/);
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
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, file + " 命中 " + pattern);
    }
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
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, file + " 命中 " + pattern);
    }
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
  "\n概念图谱界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"),
);
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
