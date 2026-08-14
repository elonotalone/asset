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
const all = (selector) => [...doc.querySelectorAll(selector)];
const text = (selector) => ($(selector) ? $(selector).textContent.replace(/\s+/g, " ").trim() : "");
const shown = () => {
  const parts = [];
  for (const node of all("main *")) {
    if (node.closest("[hidden]")) continue;
    if (node.children.length === 0 && node.textContent.trim()) parts.push(node.textContent.trim());
    if (node.placeholder) parts.push(node.placeholder);
  }
  return parts.join(" ⟂ ").replace(/\s+/g, " ");
};
function fill(target, value) {
  target.value = value;
  target.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function click(target) { target.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
function pressButton(label) {
  const found = all("button").find((button) => !button.closest("[hidden]") && button.textContent.includes(label));
  assert.ok(found, "屏上找不到按钮：" + label);
  click(found);
  return found;
}
const engine = window.SpacedRepetitionEngine;
const today = engine.todayISO();
const plus = (days) => engine.addDays(today, days);

console.log("间隔排程界面自测（jsdom，非浏览器）");

check("首屏只有一张空卡：光标在正面，不放示例卡也不先展开算法", () => {
  assert.ok(engine);
  assert.equal($("#front").value, "");
  assert.equal($("#front").placeholder, "你想让自己记住什么");
  assert.equal(doc.activeElement.id, "front");
  assert.equal($("#back-wrap").hidden, true, "还没写正面就已经露出背面");
  assert.equal($("#review").hidden, true);
  assert.equal($("#headline").hidden, true);
});

check("首屏没有开发者按钮、算法面板、统计排与未来日期表", () => {
  assert.equal($("#run-test"), null);
  const screen = shown();
  for (const banned of ["运行自测", "算法", "SM-2", "EF", "今日队列", "卡片登记", "未来日期", "口径", "UTC", "当场先学"]) {
    assert.doesNotMatch(screen, new RegExp(banned), "首屏仍有：" + banned);
  }
  assert.equal(doc.querySelectorAll("table").length, 0);
  assert.equal(doc.querySelectorAll('input[type="checkbox"]').length, 0);
});

check("写下正面，同一张卡上才请他补核对答案", () => {
  fill($("#front"), "华法林的抗凝作用被哪一种维生素直接拮抗？");
  assert.equal($("#back-wrap").hidden, false);
  assert.equal($("#new-act").hidden, false);
  assert.equal($("#back").placeholder, "再写下核对时要看到的答案");
});

check("存下这张卡：今天就到期，正面单独出现，背面没有跟着露出来", () => {
  fill($("#back"), "维生素 K：它把华法林压住的凝血因子合成重新推回去。");
  pressButton("开始记它");
  assert.equal(text("#new-warn"), "");
  assert.equal($("#new-card").hidden, true);
  assert.equal($("#review").hidden, false);
  assert.match(text(".face"), /华法林的抗凝作用/);
  assert.doesNotMatch(shown(), /维生素 K/, "没揭开就先给了答案");
  assert.equal(all(".face").length, 1);
});

check("主动揭开：正反面同属这一张卡，评分动作带真实含义", () => {
  pressButton("想好了，看答案");
  assert.equal(all(".face").length, 2);
  assert.match(text(".face-answer"), /维生素 K/);
  assert.equal(all(".rate-go").map((button) => button.textContent.trim()).join("／"), "忘记了／有点吃力／记住了／很轻松");
  assert.doesNotMatch(shown(), /\bq\b|评分 [0-9]|回忆质量/, "评分只剩数字");
});

check("评「很轻松」：下次日期就是头号结论，数字与「天」留在一起", () => {
  pressButton("很轻松");
  assert.equal(text(".next-word"), "下次见");
  assert.equal(text(".next-date"), plus(1));
  assert.equal(text(".next-gap"), "1 天后");
  assert.match(text(".faces").replace(/\s+/g, " "), /华法林的抗凝作用/, "卡片退场时把内容也带走了");
  assert.ok($(".faces").classList.contains("retreat-far"), "容易的卡没有被送向更远处");
});

check("这一张处理完，今天没有别的卡：一句话说完成，并点名最近回来的那张卡", () => {
  pressButton("今天到这里");
  assert.equal($("#headline").hidden, false);
  assert.equal(text(".headline-main"), "今天的卡都复习完了");
  assert.match(text(".headline-note"), /最近回来的是「华法林的抗凝作用被哪一种维生素直接拮抗？」/);
  assert.match(text(".headline-note"), new RegExp(plus(1)));
  assert.equal($("#review").hidden, true);
  assert.equal($("#new-card").hidden, false, "完成之后没法接着录下一张");
});

check("第二张卡评「忘记了」：不是惩罚，只是今天再来", () => {
  fill($("#front"), "地高辛中毒最典型的心电图表现是什么？");
  fill($("#back"), "室性早搏二联律，常伴房室传导阻滞。");
  pressButton("开始记它");
  assert.match(text(".face"), /地高辛中毒/);
  pressButton("想好了，看答案");
  pressButton("忘记了");
  assert.equal(text(".next-date"), today);
  assert.equal(text(".next-gap"), "今天再来");
  assert.ok($(".faces").classList.contains("retreat-close"), "困难的卡应当仍留在近处");
  assert.doesNotMatch(shown(), /错|失败|不及格|扣/, "把忘记做成了惩罚");
});

check("忘记的卡当天就回到中央，仍然先只给正面", () => {
  pressButton("下一张");
  assert.equal($("#review").hidden, false);
  assert.match(text(".face"), /地高辛中毒/);
  assert.equal(all(".face").length, 1);
  assert.equal($("#headline").hidden, true);
});

check("全程屏上只有一张卡，没有队列、总表与负载表", () => {
  assert.equal(all(".card:not([hidden])").length, 1);
  const screen = shown();
  assert.doesNotMatch(screen, /队列|登记|负载|复习次数|间隔|张卡片|共 [0-9]+ 张/);
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

check("样式里没有写死的小字号", () => {
  assert.doesNotMatch(source("style.css"), /font-size:\s*(?:[0-9]|1[0-2])px/);
});

console.log("\n间隔排程界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
