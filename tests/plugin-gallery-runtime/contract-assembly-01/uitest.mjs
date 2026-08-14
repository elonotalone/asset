import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/contract-assembly-01");
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
const textFrom = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
const text = (selector) => textFrom($(selector));
const screen = () => textFrom(doc.body);
const sheet = () => textFrom($("#sheet"));
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

function writeBlank(selector, value) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.textContent = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function leave(selector) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.dispatchEvent(new window.Event("blur", { bubbles: false }));
}

console.log("合同装配界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.ContractAssemblyEngine);
});

check("首屏是一张空白纸，只问这是一笔什么交易", () => {
  assert.match(sheet(), /这是一笔什么交易/);
  assert.equal(doc.querySelectorAll("[data-transaction]").length, 4);
  assert.equal(doc.querySelectorAll(".clause-body").length, 0);
  assert.equal(text("#headline"), "");
});

check("首屏没有开发者按钮、统计排、风险口径与独立检查表", () => {
  assert.equal($("#run-test"), null);
  assert.equal(doc.querySelectorAll(".metric").length, 0);
  assert.equal(doc.querySelectorAll("textarea").length, 0);
  assert.doesNotMatch(screen(), /运行自测|自测|风险分|计算口径|导出前检查|变量类型|已选|待填/);
});

check("屏幕上没有产品标题与副标题，只有合同自己和一行免责", () => {
  assert.doesNotMatch(sheet(), /合同装配/);
  assert.doesNotMatch(screen(), /离线/);
  assert.match(screen(), /不替代律师意见/);
});

check("选定交易类型后纸上出现抬头与双方主体空位，仍未预勾条款", () => {
  click('[data-transaction="软件开发外包"]');
  assert.match(text(".deed"), /软件开发外包合同/);
  assert.ok($('[data-variable="partyA"]'));
  assert.ok($('[data-variable="partyB"]'));
  assert.equal(doc.querySelectorAll(".clause[data-clause]").length, 0);
  assert.match(text("#headline"), /「委托方全称」还是空的/);
});

check("双方主体名是用户认得的全称，正文里读得到", () => {
  writeBlank('[data-variable="partyA"]', "青屿数据科技（上海）有限公司");
  writeBlank('[data-variable="partyB"]', "灯塔前端工作室");
  writeBlank('[data-variable="signDate"]', "2026年9月1日");
  assert.match(sheet(), /青屿数据科技（上海）有限公司/);
  assert.match(sheet(), /灯塔前端工作室/);
  assert.match(sheet(), /2026年9月1日/);
});

check("下一条候选贴在成文位置，缺失的关键类目排在前面", () => {
  const picks = [...doc.querySelectorAll(".next-slot [data-add]")].map((node) => textFrom(node));
  assert.ok(picks.length >= 6);
  assert.equal(picks[0], "工作范围与交付");
  assert.ok(picks.includes("保密义务"));
  assert.ok(picks.every((title) => /[\u3400-\u9fff]/.test(title)), "候选必须写条款真实名字");
  const soft = ["保密义务", "责任上限"];
  const lastCritical = Math.max(...picks.map((title, index) => (soft.includes(title) ? -1 : index)));
  assert.ok(
    soft.every((title) => picks.indexOf(title) > lastCritical),
    "非关键类目必须排在缺失的关键类目之后",
  );
});

check("落下工作范围条款，正文按合同顺序排出并在句中留下空位", () => {
  click('[data-add="scope"]');
  assert.match(text('[data-clause="scope"] .clause-title'), /一、工作范围与交付/);
  assert.match(text('[data-clause="scope"] .clause-body'), /服务方应围绕/);
  assert.ok($('[data-variable="projectName"]'));
  assert.ok($('[data-variable="deliverableCount"]'));
  assert.match(text("#headline"), /「项目名称」还是空的/);
});

check("填进句子里的字直接留在正文，头号结论跟着往下走", () => {
  writeBlank('[data-variable="projectName"]', "海岸监测数据平台");
  writeBlank('[data-variable="deliverableCount"]', "4");
  assert.match(text('[data-clause="scope"] .clause-body'), /服务方应围绕海岸监测数据平台完成约定工作/);
  assert.match(text('[data-clause="scope"] .clause-body'), /共交付4项成果/);
  assert.match(text("#headline"), /还没有费用与付款、知识产权、争议解决条款/);
});

check("落下责任上限会连带落下费用与付款，并在页边说清原因", () => {
  click('[data-add="liability-cap"]');
  assert.ok($('[data-clause="liability-cap"]'));
  assert.ok($('[data-clause="payment"]'));
  assert.match(textFrom($('[data-clause="payment"] .clause-aside')), /随「责任上限」一起落进正文/);
  assert.match(textFrom($('[data-clause="payment"] .clause-aside')), /合同金额与费用定义/);
});

check("金额与百分比在离开空位时补成两位小数", () => {
  writeBlank('[data-variable="contractAmount"]', "128000");
  leave('[data-variable="contractAmount"]');
  writeBlank('[data-variable="depositRate"]', "30");
  leave('[data-variable="depositRate"]');
  assert.match(text('[data-clause="payment"] .clause-body'), /人民币128000\.00元/);
  assert.match(text('[data-clause="payment"] .clause-body'), /首付款比例为30\.00%/);
});

check("金额填成非数字时，头号结论直接点名那一处", () => {
  writeBlank('[data-variable="contractAmount"]', "面议");
  assert.match(text("#headline"), /「合同金额」现在不是一个数字/);
  writeBlank('[data-variable="contractAmount"]', "128000");
  leave('[data-variable="contractAmount"]');
  assert.doesNotMatch(text("#headline"), /不是一个数字/);
});

check("选诉讼之后，仲裁不再是候选，互斥原因写在页边", () => {
  click('[data-add="litigation"]');
  assert.equal($('[data-add="arbitration"]'), null);
  assert.match(textFrom($('[data-clause="litigation"] .clause-aside')), /已排除「仲裁」/);
  assert.match(textFrom($('[data-clause="litigation"] .clause-aside')), /只能保留一种终局机制/);
  assert.match(screen(), /「仲裁」现在不能加/);
});

check("条款库标为不利的条款，用一句话说出来，不用数字代替", () => {
  click('[data-add="unlimited-rework"]');
  assert.match(textFrom($('[data-clause="unlimited-rework"] .clause-aside')), /标为对己方不利/);
  assert.doesNotMatch(screen(), /-90|\+18|\+24/);
  click('[data-drop="unlimited-rework"]');
  assert.equal($('[data-clause="unlimited-rework"]'), null);
});

check("补齐剩余空位后，纸上出现签署位置与可通读结论", () => {
  writeBlank('[data-variable="liabilityCapRate"]', "20");
  leave('[data-variable="liabilityCapRate"]');
  writeBlank('[data-variable="paymentDate"]', "2026-09-15");
  writeBlank('[data-variable="jurisdiction"]', "上海市浦东新区");
  assert.match(text("#headline"), /还没有知识产权条款/);
  click('[data-add="ip-ownership"]');
  const ipOwner = $('[data-variable="ipOwner"]');
  ipOwner.value = "委托方";
  ipOwner.dispatchEvent(new window.Event("change", { bubbles: true }));
  const openSource = $('[data-variable="openSourceAllowed"]');
  openSource.value = "false";
  openSource.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(text("#headline"), /可以从头通读/);
  assert.match(textFrom($(".sign")), /委托方（盖章）/);
  assert.match(textFrom($(".sign")), /青屿数据科技（上海）有限公司/);
});

check("成稿是连续正文，不是只读文本框，也不是卡片网格", () => {
  assert.equal(doc.querySelectorAll("textarea").length, 0);
  assert.equal(doc.querySelectorAll("details").length, 0);
  const bodies = [...doc.querySelectorAll(".clause-body")].map((node) => textFrom(node));
  assert.ok(bodies.length >= 5);
  assert.ok(bodies.every((line) => line.length > 0));
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

console.log("\n合同装配界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
