import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/voiceover-script-01");
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
const E = require(path.join(runtimeDir, "engine.js"));
const $ = (selector) => doc.querySelector(selector);
const all = (selector) => [...doc.querySelectorAll(selector)];
const textFrom = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
const text = (selector) => textFrom($(selector));
const screen = () => textFrom(doc.body);
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

function click(selector) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.click();
}

function write(selector, value) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.textContent = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function segment(title, body, pause, subtitle, visual) {
  write("#draft-title", title);
  write("#draft-text", body);
  write("#draft-pause", pause);
  write("#draft-subtitle", subtitle);
  write("#draft-visual", visual);
  click("#draft-commit");
}

console.log("口播脚本界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.VoiceoverScriptEngine);
});

check("首屏只问这段话要在多久内说完，没有示例脚本", () => {
  assert.match(text(".compose-ask"), /这段话要在多久内说完/);
  assert.ok($("#target-seconds"));
  assert.equal(all("[data-segment]").length, 0);
  assert.equal(text("#headline"), "");
});

check("首屏没有语速、帧率、口径、明细表、导出框与自测按钮", () => {
  assert.equal($("#run-test"), null);
  assert.equal(doc.querySelectorAll("textarea").length, 0);
  assert.equal(doc.querySelectorAll("table").length, 0);
  assert.equal(doc.querySelectorAll("select").length, 0);
  assert.doesNotMatch(screen(), /运行自测|语速|帧率|fps|口径|预算 =|逐段|可带走|载入可复核示例/);
  assert.doesNotMatch(screen(), /口播脚本/);
});

check("填入目标时长，先给一句可用写作预算", () => {
  write("#target-seconds", "60");
  click("#target-commit");
  assert.equal(text("#headline"), "60 秒大约能念 " + E.budgetFor(60, 216) + " 个字。");
  assert.match(text(".compose-ask"), /开场第一句怎么说/);
});

check("写下第一段，侧边就出现起止时间码，剩余时间跟着变", () => {
  segment(
    "开场痛点",
    "每天早上第一杯咖啡，你是不是也在等水烧开、等粉磨完，然后迟到？",
    "0.8",
    "早上等咖啡，就是在等迟到",
    "手持镜头扫过厨房台面与手表",
  );
  const first = $("[data-segment]");
  assert.ok(first);
  assert.match(textFrom(first.querySelector(".seg-code")), /00:00:00:00/);
  assert.match(textFrom(first.querySelector(".seg-code")), /00:00:\d\d:\d\d/);
  assert.match(text("#headline"), /还剩 \d+\.\d 秒。/);
});

check("段落名与真正要念的原话都在正文里，不用片段 1 代替", () => {
  const first = $("[data-segment]");
  assert.match(textFrom(first.querySelector(".seg-name")), /开场痛点/);
  assert.match(textFrom(first.querySelector(".seg-text")), /等水烧开、等粉磨完/);
  assert.doesNotMatch(screen(), /片段 ?1/);
});

check("字幕贴着口播，画面备注向外让开，两者与原话分得开", () => {
  const first = $("[data-segment]");
  assert.match(textFrom(first.querySelector(".seg-subtitle")), /早上等咖啡/);
  assert.match(textFrom(first.querySelector(".seg-visual")), /手持镜头/);
  assert.equal(first.querySelector(".seg-subtitle").getAttribute("data-kind"), "字幕");
  assert.equal(first.querySelector(".seg-visual").getAttribute("data-kind"), "画面");
});

check("呼吸就是句末的停顿，改秒数不需要打开任何面板", () => {
  const pause = $("[data-segment] .seg-pause");
  assert.equal(textFrom(pause), "0.8");
  const before = text("#headline");
  pause.textContent = "1.5";
  pause.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.notEqual(text("#headline"), before);
  pause.textContent = "0.8";
  pause.dispatchEvent(new window.Event("input", { bubbles: true }));
});

check("改中间一段，后面所有段落的时间码一起平移", () => {
  segment("演示冲泡", "按下这一个键，四十五秒，一杯浓缩就落进杯子里，不用磨、不用称。", "0.6", "一键，四十五秒", "特写落杯");
  segment("结尾行动", "如果你也想把早上那十分钟还给自己，链接就在下面。", "1", "把十分钟还给自己", "回到人物正面");
  const startsBefore = all("[data-segment] .code-start").map((node) => textFrom(node));
  const second = all("[data-segment] .seg-text")[1];
  second.textContent = "按下这一个键，四十五秒，一杯浓缩就落进杯子里，不用磨、不用称，也不用等。";
  second.dispatchEvent(new window.Event("input", { bubbles: true }));
  const startsAfter = all("[data-segment] .code-start").map((node) => textFrom(node));
  assert.equal(startsAfter[0], startsBefore[0]);
  assert.notEqual(startsAfter[2], startsBefore[2]);
  assert.equal(startsAfter[1], startsBefore[1]);
});

check("末段终点等于内核按同一批段落算出的末帧", () => {
  const paragraphs = all("[data-segment]").map((node) => {
    const body = textFrom(node.querySelector(".seg-text"));
    return {
      text: body,
      mode: /[\u3400-\u9fff]/.test(body) && /[A-Za-z0-9]/.test(body) ? "mixed" : "zh",
      pauseSeconds: Number(textFrom(node.querySelector(".seg-pause"))),
    };
  });
  const line = E.buildTimeline(paragraphs, { chineseRate: 216, englishRate: 150, fps: 25 });
  const last = all("[data-segment] .code-end").at(-1);
  assert.equal(textFrom(last), line.rows.at(-1).endCode);
});

check("超出目标时长时，结尾直接说还得删掉多少", () => {
  const target = $("#target-seconds");
  target.textContent = "12";
  target.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(text("#headline"), /超出 \d+\.\d 秒，得删掉这么多。/);
  target.textContent = "60";
  target.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(text("#headline"), /还剩 \d+\.\d 秒。/);
});

check("中英混排由这一段自己的字判定，不要求先选计数模式", () => {
  const drafts = $("#draft-text");
  drafts.textContent = "这一版把 ROI 讲清楚。";
  drafts.dispatchEvent(new window.Event("input", { bubbles: true }));
  const aside = all(".seg-aside").at(-1);
  assert.match(textFrom(aside), /英文与数字按词另算/);
  drafts.textContent = "";
  drafts.dispatchEvent(new window.Event("input", { bubbles: true }));
});

check("正文是可手动选择的连续文本，不是只读导出框", () => {
  assert.equal(doc.querySelectorAll("textarea").length, 0);
  const bodies = all("[data-segment] .seg-text");
  assert.equal(bodies.length, 3);
  assert.ok(bodies.every((node) => node.getAttribute("contenteditable") === "true"));
  assert.ok(bodies.every((node) => textFrom(node).length > 15));
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

check("样式里没有写死的极小字号", () => {
  assert.doesNotMatch(code("style.css"), /:\s*(?:9|10|11)px/);
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

console.log("\n口播脚本界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
