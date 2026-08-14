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
const textFrom = (node) => node ? node.textContent.replace(/\s+/g, " ").trim() : "";
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

function metric(label) {
  const cell = [...doc.querySelectorAll(".metric")].find((node) => textFrom(node.querySelector(".k")) === label);
  return cell ? textFrom(cell.querySelector(".v")) : null;
}

function choose(selector) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.click();
}

function enter(selector, value) {
  const node = $(selector);
  assert.ok(node, `找不到 ${selector}`);
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

console.log("合同装配界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.ContractAssemblyEngine);
});

check("首屏先问交易类型，六类条款库均折叠且没有预勾", () => {
  assert.match(screen(), /这是一笔什么交易/);
  assert.equal(doc.querySelectorAll("#transaction-options input[type=radio]").length, 4);
  assert.equal(doc.querySelectorAll("#transaction-options input:checked").length, 0);
  assert.equal(doc.querySelectorAll("#category-list details").length, 6);
  for (const details of doc.querySelectorAll("#category-list details")) assert.equal(details.open, false);
  assert.equal(doc.querySelectorAll("[data-clause-check]").length, 8);
  assert.equal(doc.querySelectorAll("[data-clause-check]:checked").length, 0);
});

check("首屏状态为已选 0、待填 0、风险尚未计算，右侧预览为空", () => {
  assert.equal(metric("已选"), "0 条");
  assert.equal(metric("待填"), "0 项");
  assert.equal(metric("风险分"), "尚未计算");
  assert.equal($("#contract-preview").value, "");
  assert.equal(text("#preview-label"), "空白预览页");
});

check("首屏没有红色告警，也不把空白判成问题列表", () => {
  assert.equal(doc.querySelectorAll("#issues li").length, 0);
  assert.equal(doc.querySelectorAll(".issue-danger").length, 0);
  assert.match(text("#issue-intro"), /空白不是失败/);
});

check("选择交易类型只写入预览标题，不会偷偷勾条款或计算风险", () => {
  choose('input[name="transaction"][value="软件开发外包"]');
  assert.match($("#contract-preview").value, /交易类型：软件开发外包/);
  assert.equal(metric("已选"), "0 条");
  assert.equal(metric("风险分"), "尚未计算");
  assert.equal(doc.querySelectorAll("[data-clause-check]:checked").length, 0);
});

check("真勾工作范围条款后，预览出现对应正文与两个待填占位符", () => {
  choose('[data-clause-check="scope"]');
  assert.equal(metric("已选"), "1 条");
  assert.equal(metric("待填"), "2 项");
  assert.notEqual(metric("风险分"), "尚未计算");
  assert.match($("#contract-preview").value, /工作范围与交付/);
  assert.match($("#contract-preview").value, /〔待填：项目名称〕/);
  assert.match($("#contract-preview").value, /〔待填：交付成果数量〕/);
});

check("真填写两个变量后，预览同帧替换占位符且待填归零", () => {
  enter('[data-variable="projectName"]', "海岸监测数据平台");
  enter('[data-variable="deliverableCount"]', "4");
  assert.match($("#contract-preview").value, /海岸监测数据平台/);
  assert.match($("#contract-preview").value, /共交付4项成果/);
  assert.doesNotMatch($("#contract-preview").value, /待填：项目名称/);
  assert.equal(metric("待填"), "0 项");
});

check("勾责任上限会连带勾费用与付款，并在屏上解释原因", () => {
  choose('[data-clause-check="liability-cap"]');
  assert.equal($('[data-clause-check="liability-cap"]').checked, true);
  assert.equal($('[data-clause-check="payment"]').checked, true);
  assert.match(text("#relationship-note"), /连带加入「费用与付款」/);
  assert.match(text("#relationship-note"), /合同金额与费用定义/);
  assert.match($("#contract-preview").value, /费用与付款/);
  assert.match($("#contract-preview").value, /责任上限/);
});

check("勾诉讼后仲裁禁用并在条款旁显示互斥原因", () => {
  choose('[data-clause-check="litigation"]');
  const arbitration = $('[data-clause-check="arbitration"]');
  assert.equal(arbitration.disabled, true);
  assert.equal(arbitration.checked, false);
  assert.match(text('[data-mutual-reason="arbitration"]'), /诉讼与仲裁不能同时选择/);
  assert.match(text('[data-mutual-reason="arbitration"]'), /终局机制/);
});

check("点击运行自测，屏上显示 8 / 8 通过", () => {
  choose("#run-test");
  assert.equal(text("#test-out"), "8 / 8 通过");
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

console.log("\n合同装配界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
