import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/dialogue-branch-script-01");
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

function say(line, condition) {
  write("#line-input", line);
  if (condition !== undefined) write("#condition-input", condition);
  click("#commit-line");
}

function turnByLine(fragment) {
  return all("[data-turn]").find((node) => textFrom(node.querySelector(".turn-line")).includes(fragment));
}

console.log("话术分支界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.DialogueBranchEngine);
});

check("首屏是暗场里的一个问题，没有示例分支也没有告警", () => {
  assert.equal(text(".compose-ask"), "开场第一句你会怎么说");
  assert.equal(all("[data-turn]").length, 0);
  assert.equal(text("#headline"), "");
});

check("首屏没有自测按钮、规则表单、统计与导出框", () => {
  assert.equal($("#run-test"), null);
  assert.equal(doc.querySelectorAll("textarea").length, 0);
  assert.equal(doc.querySelectorAll("svg").length, 0);
  assert.equal(doc.querySelectorAll("select").length, 0);
  assert.doesNotMatch(screen(), /运行自测|优先级|兜底|载入可复核示例|覆盖|节点|最大深度|可带走/);
  assert.doesNotMatch(screen(), /话术分支/);
});

check("写下开场，台词就落进中央光区，当前动作跟到它下面", () => {
  say("您好，我是客服小林。看到您申请全额退款，我先把能做的方案说清楚。");
  const opening = turnByLine("我是客服小林");
  assert.ok(opening);
  assert.equal(opening.getAttribute("data-current"), "true");
  assert.match(text(".compose-ask"), /接下来可能怎么说/);
  assert.equal(text("#headline"), "", "只有一句时不先判失败");
});

check("说话人是认得的名字，可以就地改成客服小林与客户", () => {
  const speaker = $("[data-side-name='us']");
  assert.ok(speaker);
  speaker.textContent = "客服小林";
  speaker.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(screen(), /客服小林/);
  assert.doesNotMatch(screen(), /N1|节点 1/);
});

check("补出第一种回应后，两句台词形成一条明确走向", () => {
  say("这个方案我不能接受，我要全额退款。");
  const reply = turnByLine("我要全额退款");
  assert.ok(reply);
  assert.equal(reply.getAttribute("data-side"), "them");
  assert.equal(reply.getAttribute("data-current"), "true");
  assert.ok(turnByLine("我是客服小林"), "开场仍在上方可读");
});

check("回到开场再补一条，岔口才真的打开，条件旁白贴着分支", () => {
  click(`[data-turn="${turnByLine("我是客服小林").getAttribute("data-turn")}"] .turn-pick`);
  say("补偿方案我可以接受，怎么走流程？", "可以接受");
  click(`[data-turn="${turnByLine("我是客服小林").getAttribute("data-turn")}"] .turn-pick`);
  const branches = all('[data-role="branch"]');
  assert.equal(branches.length, 2);
  const cues = branches.map((node) => textFrom(node.querySelector(".turn-cue")));
  assert.ok(cues.some((cue) => cue.includes("提到「可以接受」")), cues.join(" / "));
  assert.ok(cues.some((cue) => cue === "其他情况"), cues.join(" / "));
});

check("死端不是一个计数，是那句原话本身被点名", () => {
  assert.match(text("#headline"), /说完就没有下文了/);
  assert.match(text("#headline"), /全额退款|可以接受/);
  const stranded = turnByLine("我要全额退款");
  assert.match(textFrom(stranded.querySelector(".turn-note")), /这条走不通/);
});

check("补上下一句，那条路就通了", () => {
  const stranded = turnByLine("我要全额退款");
  click(`[data-turn="${stranded.getAttribute("data-turn")}"] .turn-pick`);
  say("全额退款需要退回已使用的礼品卡，我帮您算一下差额。");
  assert.doesNotMatch(text("#headline"), /我要全额退款/);
});

check("先后次序靠分支的上下位置调整，不出现数字优先级表单", () => {
  const opening = turnByLine("我是客服小林");
  click(`[data-turn="${opening.getAttribute("data-turn")}"] .turn-pick`);
  const before = all('[data-role="branch"]').map((node) => textFrom(node.querySelector(".turn-line")));
  const mover = all('[data-role="branch"]')[1].querySelector("[data-move]");
  assert.ok(mover, "第二条分支上应有上移动作");
  mover.click();
  const after = all('[data-role="branch"]').map((node) => textFrom(node.querySelector(".turn-line")));
  assert.deepEqual(after, [before[1], before[0]]);
  assert.equal(doc.querySelectorAll('input[type="number"]').length, 0);
});

check("澄清后可以接回上文，回到的是熟悉的那句台词", () => {
  const reply = turnByLine("我要全额退款");
  click(`[data-turn="${reply.getAttribute("data-turn")}"] .turn-pick`);
  const answer = turnByLine("礼品卡");
  click(`[data-turn="${answer.getAttribute("data-turn")}"] .turn-pick`);
  click("#return-line");
  const targets = all("[data-return-to]").map((node) => textFrom(node));
  assert.ok(targets.some((label) => label.includes("我是客服小林")));
  $("[data-return-to]").click();
  assert.match(textFrom($('[data-role="return"]')), /回到主线/);
  assert.match(textFrom($('[data-role="return"] .turn-line')), /客服小林|全额退款/);
});

check("标成自然结束后，这一句不再算走不通", () => {
  const opening = turnByLine("我是客服小林");
  click(`[data-turn="${opening.getAttribute("data-turn")}"] .turn-pick`);
  const target = turnByLine("怎么走流程");
  assert.ok(target, "回到开场就应看见另一条岔路的原话");
  const end = target.querySelector("[data-end]");
  assert.ok(end, "死端旁应有「就到这里结束」");
  end.click();
  assert.match(textFrom(turnByLine("怎么走流程").querySelector(".turn-note")), /自然结束/);
  assert.match(text("#headline"), /每条路都走得通/);
});

check("台词是真正的文本，不是 SVG 方框，也没有被截成省略号", () => {
  assert.equal(doc.querySelectorAll("svg").length, 0);
  const lines = all(".turn-line").map((node) => textFrom(node));
  assert.ok(lines.some((line) => line.length > 20));
  assert.ok(lines.every((line) => !/^.{0,8}…$/.test(line)));
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

console.log("\n话术分支界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
