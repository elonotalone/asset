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
function kind(name) { return all("#kinds .kind").find((button) => button.textContent.trim() === name); }
function pressButton(label) {
  const found = all("button").find((button) => !button.closest("[hidden]") && button.textContent.includes(label));
  assert.ok(found, "屏上找不到按钮：" + label);
  click(found);
  return found;
}

console.log("自测卷界面自测（jsdom，非浏览器）");

check("首屏只有一张空题页：光标在题干，没有示例题也没有零分", () => {
  assert.ok(window.SelfTestQuizEngine);
  assert.equal($("#prompt").value, "");
  assert.equal($("#prompt").placeholder, "你想检验自己是否真的会了什么");
  assert.equal(doc.activeElement.id, "prompt");
  assert.equal($("#how").hidden, true, "还没写题干就已经摊开题型");
  assert.equal($("#build").hidden, true);
  assert.equal($("#live").hidden, true);
  assert.equal($("#wrapup").hidden, true);
  assert.equal($("#edge").hidden, true);
  assert.doesNotMatch(shown(), /0 分|0 \/ 0|道题/);
});

check("首屏没有开发者按钮、口径栏、图例与自述", () => {
  assert.equal($("#run-test"), null);
  const screen = shown();
  for (const banned of ["运行自测", "判分设置", "出题区", "答题区", "逐题得分理由", "口径", "离线", "题量", "卷面", "总分"]) {
    assert.doesNotMatch(screen, new RegExp(banned), "首屏仍有：" + banned);
  }
});

check("写下题干，题页才顺着题型长出答案位置", () => {
  fill($("#prompt"), "体重 68 kg 的患者按 0.5 mg/kg 给药，单次该给多少毫克？");
  assert.equal($("#how").hidden, false);
  assert.equal($("#build").hidden, false);
  assert.equal(all("#kinds .kind").map((button) => button.textContent.trim()).join(""), "单选判断多选填空数值排序匹配");
  assert.equal(kind("单选").getAttribute("aria-pressed"), "true");
});

check("选数值题，标准数、单位与允许误差都长在这张题页上", () => {
  click(kind("数值"));
  assert.equal(kind("数值").getAttribute("aria-pressed"), "true");
  const inputs = all("#build input");
  assert.equal(inputs.length, 3);
  fill(inputs[0], "34");
  fill(inputs[1], "mg");
  fill(inputs[2], "2");
  assert.match(shown(), /允许差/);
});

check("保存后立刻变成正式题面：标准答案、单位与容差全部退场", () => {
  fill($("#explanation"), "0.5 mg/kg × 68 kg = 34 mg，先算总量再看单位。");
  pressButton("开始答这道题");
  assert.equal(text("#compose-warn"), "");
  assert.equal($("#compose").hidden, true);
  assert.equal($("#live").hidden, false);
  assert.match(text(".prompt-read"), /单次该给多少毫克/);
  const screen = shown();
  assert.doesNotMatch(screen, /34/, "作答前就泄露了标准答案");
  assert.doesNotMatch(screen, /允许差|容差/, "作答前就看见容差");
  assert.doesNotMatch(screen, /0\.5 mg\/kg × 68 kg/, "作答前就看见解析");
});

check("单位写错但数对：得 0 分，理由直接说单位不匹配", () => {
  fill($("#answer-value"), "34");
  fill($("#answer-unit"), "g");
  pressButton("看看我这题会不会");
  assert.equal(text(".verdict-score"), "0 / 10 分");
  assert.match(text(".verdict-reason"), /单位不匹配/);
  assert.match(shown(), /标准答案 34 mg/);
  assert.match(shown(), /允许差 2%/);
  assert.match(text(".verdict-note"), /先算总量再看单位/);
  assert.match(shown(), /34 g/, "没有把用户自己填的答案贴回来");
});

check("整卷答完，总分与最该回头看的知识点作为卷首评语出现", () => {
  assert.equal($("#wrapup").hidden, false);
  assert.equal(text(".wrap-score"), "这一卷 0 / 10 分");
  assert.match(text(".wrap-note"), /最该回头看的是/);
});

check("再出一道题：回到空题页，卷首评语与总分不常驻", () => {
  pressButton("再出一道题");
  assert.equal($("#wrapup").hidden, true);
  assert.equal($("#compose").hidden, false);
  assert.equal($("#prompt").value, "");
  assert.equal($("#edge").hidden, false, "前一题应当在边缘留下去向");
  assert.match(text("#prev-name"), /体重 68 kg/);
});

check("单选题：选项真实文字可读，标准答案由题页上勾选决定", () => {
  fill($("#prompt"), "华法林的抗凝作用被下面哪一种维生素直接拮抗？");
  click(kind("单选"));
  fill($("#build textarea"), "维生素 K\n维生素 C\n维生素 D");
  const marks = all(".mark");
  assert.equal(marks.length, 3);
  assert.equal(marks.map((row) => row.querySelector(".mark-text").textContent).join("／"), "维生素 K／维生素 C／维生素 D");
  const box = marks[0].querySelector("input");
  box.checked = true;
  box.dispatchEvent(new window.Event("change", { bubbles: true }));
  fill($("#topic"), "心血管药理");
  pressButton("开始答这道题");
  assert.equal(text("#compose-warn"), "");
  assert.match(text(".topic-read"), /心血管药理/);
  assert.equal(all(".choice-text").map((node) => node.textContent).join("／"), "维生素 K／维生素 C／维生素 D");
  assert.doesNotMatch(shown(), /标准答案/, "作答前泄题");
});

check("答对：批改落在原答案旁，满分与理由贴着刚才的选择", () => {
  const option = all('.choice input').find((input) => input.value === "维生素 K");
  option.checked = true;
  pressButton("看看我这题会不会");
  assert.equal(text(".verdict-score"), "10 / 10 分");
  assert.match(text(".verdict-reason"), /完全匹配/);
  const row = all(".choice").find((item) => item.textContent.includes("维生素 K"));
  assert.match(row.textContent, /你选的/);
  assert.match(row.textContent, /标准答案/);
  assert.ok(row.classList.contains("chosen") && row.classList.contains("keyed"));
  assert.equal(all(".choice.wrong").length, 0);
});

check("两题都答完：卷首评语点名真实知识点，不是编号", () => {
  assert.equal(text(".wrap-score"), "这一卷 10 / 20 分");
  assert.match(text(".wrap-note"), /体重 68 kg/);
});

check("边缘只留去向，不摊开另一题的题面", () => {
  assert.equal($("#edge").hidden, false);
  assert.match(text("#prev-name"), /体重 68 kg/);
  assert.equal(all(".prompt-read").length, 1);
});

check("屏上从头到尾没有统计排、明细表与题型规则清单", () => {
  const screen = shown();
  assert.doesNotMatch(screen, /题量|卷面|判分|口径|运行自测/);
  assert.equal(doc.querySelectorAll("table").length, 0);
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
  const css = source("style.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-2])px/);
});

console.log("\n自测卷界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
