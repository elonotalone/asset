/* 三表模型 · 界面自测：jsdom 真装载页面，改一个旋钮，读三层装置。 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/three-statement-model-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const candidate of direct) if (existsSync(candidate)) return require(candidate);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：三表模型界面自测无法运行");
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
  pretendToBeVisual: true,
});

await new Promise((resolve) => {
  if (dom.window.document.readyState === "complete") resolve();
  else dom.window.addEventListener("load", resolve, { once: true });
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();
const row = (key) => {
  const node = doc.querySelector(`tr[data-row="${key}"]`);
  assert.ok(node, `找不到行 ${key}`);
  return node;
};
const values = (key) => [...row(key).querySelectorAll("td .v")].map((node) => node.textContent.trim());
const rowName = (key) => row(key).querySelector(".rowname").textContent.replace(/\s+/g, " ").trim();

function turn(key, value) {
  const knob = $(`[data-knob="${key}"]`);
  assert.ok(knob, `找不到旋钮 ${key}`);
  knob.value = value;
  knob.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.ThreeStatementRig.recompute(false);
}

console.log("三表模型界面自测（jsdom，非浏览器）");

check("首屏就是算完的：三层装置各自带名字，出厂假设已填好", () => {
  assert.ok(window.ThreeStatementEngine, "引擎没装载");
  const plates = [...doc.querySelectorAll(".plate")].map((node) => node.textContent.trim());
  assert.deepEqual(plates, ["利润表", "现金流量表", "资产负债表"]);
  assert.equal($('[data-knob="dso"]').value, "45");
  assert.equal($('[data-knob="revenueGrowth"]').value, "12");
  assert.match($("#trace").textContent, /出厂假设/);
});

check("首屏三层都已有 2027E–2029E 的数，单位贴着数字", () => {
  for (const key of ["revenue", "netIncome", "operatingCashFlow", "endingCash", "receivables", "revolver", "assets"]) {
    const cells = [...row(key).querySelectorAll("td")];
    assert.equal(cells.length, 3, `${key} 不是三年`);
    for (const cell of cells) {
      assert.match(cell.querySelector(".v").textContent, /\d/, `${key} 有空数字`);
      assert.equal(cell.querySelector("b").textContent, "元", `${key} 缺单位`);
    }
  }
  const heads = [...doc.querySelectorAll('.deck[data-deck="income"] thead th')].map((n) => n.textContent.trim());
  assert.deepEqual(heads, ["2027E", "2028E", "2029E"]);
});

check("出厂那一档结论说清 2027E 现金只是刚够，并给出年份与金额", () => {
  const said = $("#verdict").textContent;
  assert.match(said, /2027E/);
  assert.match(said, /100 000\.00 元/);
  assert.match(said, /152 774\.79 元/);
  assert.match(said, /刚够/);
});

check("每个旋钮都带自己的名字、当前值和单位，不是编号", () => {
  const named = ["基期收入", "收入增速", "毛利率", "运营费用率", "税率", "资本开支率",
    "折旧年限", "应收周转天数", "存货天数", "应付天数", "循环贷利率", "最低现金"];
  for (const name of named) assert.match(screen(), new RegExp(name), `旋钮 ${name} 的名字不在屏幕上`);
  for (const [key, name, unit, value] of [
    ["dso", "应收周转天数", "天", "45"],
    ["revenueGrowth", "收入增速", "%", "12"],
    ["depreciationYears", "折旧年限", "年", "5"],
    ["minimumCash", "最低现金", "元", "100000"],
  ]) {
    const knob = $(`[data-knob="${key}"]`).closest(".knob");
    assert.equal(knob.querySelector("label").textContent.trim(), name);
    assert.equal(knob.querySelector("input").value, value);
    assert.equal(knob.querySelector("b").textContent.trim(), unit);
    assert.equal(knob.querySelector("label").getAttribute("for"), `k-${key}`);
  }
  assert.match(rowName("receivables"), /^应收 /);
});

check("旋钮长在它驱动的那一行上，不是一列表单墙", () => {
  const attached = {
    dso: "receivables", inventoryDays: "inventory", payableDays: "payables",
    interestRate: "revolver", minimumCash: "endingCash", revenueGrowth: "revenue",
    taxRate: "netIncome", depreciationYears: "depreciation",
  };
  for (const [knob, key] of Object.entries(attached)) {
    assert.equal($(`[data-knob="${knob}"]`).closest("tr").getAttribute("data-row"), key,
      `${knob} 没长在 ${key} 上`);
  }
});

check("把应收周转天数从 45 改成 75：三层各自跟着动，结论换成一句新的", () => {
  const before = {
    receivables: values("receivables")[0],
    operating: values("operatingCashFlow")[0],
    revolver: values("revolver")[0],
    said: $("#verdict").textContent,
  };
  turn("dso", "75");
  assert.equal(values("receivables")[0], "230 136.99");
  assert.notEqual(values("operatingCashFlow")[0], before.operating);
  assert.notEqual(values("revolver")[0], before.revolver);
  assert.notEqual(values("receivables")[0], before.receivables);
  assert.notEqual($("#verdict").textContent, before.said);
});

check("改过的假设读得到名字、原值、新值和单位", () => {
  assert.match($("#trace").textContent.replace(/\s+/g, " "), /应收周转天数 45 天 → 75 天/);
});

check("通路连的是行与行，不是三个方框之间画三根箭头", () => {
  const paths = [...doc.querySelectorAll("#drive path")];
  const linked = paths.map((node) => `${node.getAttribute("data-from")}→${node.getAttribute("data-to")}`);
  assert.deepEqual(linked.sort(), [
    "depreciation→cfDepreciation",
    "depreciation→ppe",
    "endingCash→cash",
    "netIncome→cfNetIncome",
    "netIncome→retainedEarnings",
    "receivables→cfReceivables",
    "revolver→endingCash",
  ]);
  for (const node of paths) assert.match(node.getAttribute("d"), /^M .* H .* V .* H /);
  for (const node of paths) {
    for (const end of [node.getAttribute("data-from"), node.getAttribute("data-to")]) {
      assert.ok(row(end).querySelector(".term").textContent.trim().length > 0, `${end} 的行名读不到`);
    }
  }
});

check("咬合合上时不写一个字，差额行不出现", () => {
  assert.deepEqual(values("difference"), []);
  assert.equal(row("difference").hidden, true);
  assert.equal(row("difference").textContent.replace(/\s+/g, ""), "差额");
  assert.equal([...doc.querySelectorAll("tr.jaw")].length, 2);
  assert.deepEqual(values("assets"), values("liabilitiesAndEquity"));
  assert.doesNotMatch(screen(), /平衡|不平|检查/);
});

check("逐行明细在那一行原地摊开，没有标题也没有关闭按钮", () => {
  const opener = doc.querySelector('button[data-open="netIncome"]');
  assert.equal(opener.textContent.trim(), "净利润");
  assert.equal(row("tax").hidden, true);
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(row("tax").hidden, false);
  assert.equal(row("interest").closest(".deck").getAttribute("data-deck"), "income");
  assert.match(values("tax")[0], /\d/);
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(row("tax").hidden, true);
});

check("越界的假设就地说明原因，并且不留旧数字冒充答案", () => {
  turn("dso", "400");
  const why = $(".why");
  assert.ok(why, "没有就地给出原因");
  assert.match(why.textContent, /应收周转天数要在 0 到 365 天之间/);
  assert.equal(why.closest("tr").getAttribute("data-row"), "receivables");
  assert.equal($('[data-knob="dso"]').classList.contains("bad"), true);
  assert.deepEqual(values("revenue"), []);
  assert.deepEqual(values("assets"), []);
  assert.equal($("#verdict").textContent, "");
  turn("dso", "45");
  assert.equal(doc.querySelector(".why"), null);
  assert.equal(values("receivables")[0], "138 082.19");
});

check("现金真的不够时，结论说出年份、缺口与要多借多少", () => {
  turn("revenueGrowth", "40");
  turn("dso", "120");
  const said = $("#verdict").textContent;
  assert.match(said, /2027E/);
  assert.match(said, /182 920\.54 元/);
  assert.match(said, /多借/);
  assert.match(said, /离最低现金 100 000\.00 元差/);
  turn("dso", "45");
  turn("revenueGrowth", "12");
});

check("屏幕上没有图例、口径栏、模型边界、敏感性、断环选择器与运行自测", () => {
  const text = screen();
  for (const banned of ["输入（蓝）", "跨表引用", "计算口径", "金额单位", "模型边界",
    "敏感性", "断环", "循环口径", "运行自测", "未运行", "本工具", "离线"]) {
    assert.doesNotMatch(text, new RegExp(banned), `屏幕上还有「${banned}」`);
  }
  assert.equal(doc.querySelector("#run-test"), null);
  assert.equal(doc.querySelector("select"), null);
  assert.equal(doc.querySelectorAll("h1, h2, h3").length, 0, "还有区块标题");
});

check("引擎里的敏感性与两种断环口径仍算得出，只是不上屏", () => {
  const model = window.ThreeStatementEngine.model(window.ThreeStatementEngine.DEFAULT, "average");
  assert.equal(model.sensitivity.length, 3);
  assert.equal(model.comparison.bothConverged, true);
  assert.notEqual(model.comparison.interestDifference, 0);
});

/* 传动是分波推的，不是同一帧全屏刷新：这里等真实计时器走完再读。 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
{
  const knob = $('[data-knob="dso"]');
  knob.value = "75";
  knob.dispatchEvent(new window.Event("input", { bubbles: true }));
  const early = values("cash")[0];
  await sleep(90);
  const midway = { receivables: values("receivables")[0], cash: values("cash")[0] };
  await sleep(900);
  check("传动分波推进：改动处先动，最底下那一层最后落定", () => {
    assert.equal(midway.receivables, "230 136.99", "被改的那一层没有先动");
    assert.equal(midway.cash, early, "最底下那一层抢在前面动了");
    assert.equal(values("cash")[0], "100 000.00");
    assert.deepEqual(values("assets"), values("liabilitiesAndEquity"));
    assert.equal(doc.querySelectorAll("td.moved").length, 0, "传动的亮光没有熄");
  });
  knob.value = "45";
  knob.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(500);
}

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("所有 src/href 都是同目录相对路径且目标存在", () => {
  for (const node of doc.querySelectorAll("[src], [href]")) {
    const value = node.getAttribute("src") || node.getAttribute("href");
    assert.ok(value && !path.isAbsolute(value), `不是相对路径：${value}`);
    assert.doesNotMatch(value, /^(?:[a-z]+:|\/\/|\.\.\/)/i, `不是同目录资源：${value}`);
    assert.equal(path.dirname(value), ".", `资源不在同目录：${value}`);
    assert.ok(existsSync(path.join(runtimeDir, value)), `资源不存在：${value}`);
  }
  const css = code("style.css");
  assert.doesNotMatch(css, /@import\b/i, "style.css 含 @import");
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const value = match[1].trim();
    if (/^data:/i.test(value)) continue;
    assert.equal(path.dirname(value), ".", `CSS 资源不在同目录：${value}`);
    assert.ok(existsSync(path.join(runtimeDir, value)), `CSS 资源不存在：${value}`);
  }
});

check("不用 ES module，页面里也没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("没有写死的小字号，也没有反过来写字号下限", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /font-size\s*:\s*(?:[0-9]|1[01])px/i, "写死了小字号");
  assert.doesNotMatch(screen(), /字号/);
});

check("源码不碰网络、存储、父窗口或不透明源禁区", () => {
  const forbidden = [
    [/(?:^|[^\w])fetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/WebSocket\s*\(/, "WebSocket"],
    [/EventSource\s*\(/, "EventSource"],
    [/sendBeacon\s*\(/, "sendBeacon"],
    [/importScripts\s*\(/, "importScripts"],
    [/WebTransport\s*\(/, "WebTransport"],
    [/RTCPeerConnection\s*\(/, "RTCPeerConnection"],
    [/(?:Shared)?Worker\s*\(/, "Worker"],
    [/serviceWorker\s*\.\s*register\s*\(/, "serviceWorker.register"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "持久化存储"],
    [/document\s*\.\s*(?:cookie|domain)\b/, "document 安全边界"],
    [/window\s*\.\s*(?:parent|top)\b/, "父窗口"],
  ];
  for (const file of ["index.html", "engine.js", "ui.js", "style.css"]) {
    const source = code(file);
    for (const [pattern, label] of forbidden) assert.doesNotMatch(source, pattern, `${file} 命中 ${label}`);
  }
});

console.log("\n三表模型界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
