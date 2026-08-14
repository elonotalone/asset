import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/voiceover-script-01",
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

function change(selector, value) {
  const node = $(selector);
  node.value = value;
  node.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function click(target) {
  const node = typeof target === "string" ? $(target) : target;
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

console.log("口播脚本界面自测（jsdom，非浏览器）");

check("经典脚本成功装配同一份计算内核", () => {
  assert.ok(window.VoiceoverScriptEngine);
});

check("首屏先问目标时长，以 216 字/分钟起步且段落区为空", () => {
  assert.equal($("#target-seconds").value, "");
  assert.equal($("#chinese-rate").value, "216");
  assert.match(text("#time-range"), /待填写/);
  assert.equal(doc.querySelectorAll("#timeline-body tr").length, 0);
  assert.equal($("#empty-state").hidden, false);
  assert.match(text(".basis"), /中文按字、英文按词/);
  assert.match(text(".basis"), /两种计数单位不等价/);
});

check("真填 90 秒后屏上出现 0:00 到 1:30 与约 324 字，段落仍为空", () => {
  input("#target-seconds", "90");
  assert.equal(text("#time-range"), "0:00 → 1:30");
  assert.equal(text("#budget"), "约 324 字");
  assert.equal(text("#remaining"), "1:30");
  assert.equal(doc.querySelectorAll("#timeline-body tr").length, 0);
  assert.equal($("#empty-state").hidden, false);
  assert.equal($("#add-segment").disabled, false);
});

check("真添加一段后，时间明细与可带走脚本同步出现", () => {
  click("#add-segment");
  input("#segment-title", "开场提问");
  change("#language-mode", "zh");
  input("#segment-text", "如果每天少买一杯咖啡，十年后会发生什么？");
  input("#pause-seconds", "0.8");
  input("#subtitle", "每天省下一杯咖啡，十年后会怎样？");
  click("#save-segment");
  assert.equal(doc.querySelectorAll("#timeline-body tr").length, 1);
  assert.match(text("#timeline-body"), /开场提问/);
  assert.match(text("#timeline-body"), /中文·按字/);
  assert.match($("#export-output").value, /00:00:00:00 -->/);
  assert.match($("#export-output").value, /每天省下一杯咖啡/);
});

check("编辑第 2 段会把第 3 段起点与字幕时间码一起后移", () => {
  click("#load-demo");
  const before = Number(doc.querySelectorAll("#timeline-body tr")[2].dataset.startFrame);
  click(doc.querySelectorAll(".edit-segment")[1]);
  input("#segment-text", $("#segment-text").value + "这段修改会平移后续字幕时间码。");
  click("#save-segment");
  const third = doc.querySelectorAll("#timeline-body tr")[2];
  const after = Number(third.dataset.startFrame);
  assert.ok(after > before);
  assert.match(third.textContent, /行动收束/);
  assert.match($("#export-output").value, new RegExp(third.querySelector(".start-code").textContent));
});

check("导出是可手动选中的可见 textarea，不依赖剪贴板", () => {
  const output = $("#export-output");
  assert.equal(output.tagName, "TEXTAREA");
  assert.equal(output.readOnly, true);
  assert.ok(output.value.length > 160);
  output.select();
  assert.equal(output.selectionStart, 0);
  assert.equal(output.selectionEnd, output.value.length);
});

check("点运行自测后，页面显示全部通过", () => {
  click("#run-test");
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
    sub: text(".head p"),
    assumptions: [
      ["目标时长", $("#target-seconds").value + " 秒"],
      ["中文语速", $("#chinese-rate").value + " 字/分钟"],
      ["英文语速", $("#english-rate").value + " 词/分钟"],
      ["视频帧率", $("#fps").value + " fps"],
    ],
    headline: [...doc.querySelectorAll(".headline > div")].map((node) => [
      node.querySelector("span").textContent.trim(),
      node.querySelector("strong").textContent.trim(),
    ]),
    basis: text("#calculation-basis"),
    rows: [...doc.querySelectorAll("#timeline-body tr")].map((row) => ({
      cells: [...row.querySelectorAll("td")].slice(0, 6).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
      startFrame: Number(row.dataset.startFrame),
      endFrame: Number(row.dataset.endFrame),
    })),
    exportLines: $("#export-output").value.split("\n").slice(0, 11),
    selftest: text("#test-out"),
  };
  console.log("COVER_JSON " + JSON.stringify(cover));
}

console.log("\n口播脚本界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
