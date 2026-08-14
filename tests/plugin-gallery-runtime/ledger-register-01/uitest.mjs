/* 台账 · 界面自测：jsdom 真装载页面，逐笔敲进去，读那条流和它的读数。 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/ledger-register-01");
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
  throw new Error("找不到 jsdom：台账界面自测无法运行");
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
const lines = () => [...doc.querySelectorAll("#roll-body tr.line")];
const cellsOf = (tr) => [...tr.querySelectorAll("th, td")].map((cell) => cell.textContent.replace("删除", "").trim());
const columns = () => [...doc.querySelectorAll("#roll-head th")].map((node) => node.textContent.trim());

function fill(pairs) {
  for (const [key, value] of Object.entries(pairs)) {
    const field = $("#entry-" + key);
    assert.ok(field, `录入行没有 ${key}`);
    field.value = value;
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
}

function enter() {
  $("#entry-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

console.log("台账界面自测（jsdom，非浏览器）");

check("首屏一条记录都没有，读数是 0.00 元，光标已经在录入行的日期上", () => {
  assert.equal(lines().length, 0);
  assert.equal($("#reading-value").textContent, "0.00");
  assert.equal($("#reading-unit").textContent, "元");
  assert.equal($("#reading-name").textContent, "余额");
  assert.equal(doc.activeElement.id, "entry-date");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test($("#entry-date").value), "日期没有预填");
});

check("敲一笔就落进流里：项目名读得到，读数被这一笔推着动", () => {
  fill({ date: "2026-07-31", item: "林野杂志尾款", debit: "8600" });
  enter();
  assert.equal(lines().length, 1);
  assert.deepEqual(cellsOf(lines()[0]), ["2026-07-31", "林野杂志尾款", "8 600.00", "", "8 600.00"]);
  assert.equal($("#reading-value").textContent, "8 600.00");
  assert.equal(lines()[0].classList.contains("fresh"), true, "新落下的一行没有亮一下");
});

check("第二笔落下，余额是被推着动的，不是重算出来的合计", () => {
  fill({ date: "2026-08-02", item: "东岸摄影棚", debit: "", credit: "1800" });
  enter();
  assert.equal(lines().length, 2);
  assert.deepEqual(cellsOf(lines()[1]), ["2026-08-02", "东岸摄影棚", "", "1 800.00", "6 800.00"]);
  assert.deepEqual(cellsOf(lines()[0]).slice(0, 2), ["2026-07-31", "林野杂志尾款"], "前面的账被动过");
  assert.equal($("#reading-value").textContent, "6 800.00");
});

check("最新一笔跟读数一起留在视野里，历史退后但读得清", () => {
  fill({ date: "2026-08-05", item: "打车 · 外拍往返", credit: "126.5" });
  enter();
  assert.match($("#latest").textContent, /最新 2026-08-05 打车 · 外拍往返 6 673\.50 元/);
  assert.equal(lines()[2].classList.contains("last"), true);
  assert.equal(lines()[1].classList.contains("near"), true);
  assert.equal(lines()[0].classList.contains("last"), false);
});

check("一笔录完不用再点记入，也没有重新计算按钮", () => {
  assert.equal(doc.querySelector("#run-test"), null);
  assert.doesNotMatch(screen(), /记入台账|重新计算|运行自测|未运行/);
  assert.equal([...doc.querySelectorAll("button")].filter((node) => /记入|计算|提交/.test(node.textContent)).length, 0);
});

check("无效的一行不记入，已经记下的账一个字都不动", () => {
  const before = lines().length;
  const balance = $("#reading-value").textContent;
  fill({ date: "2026-02-30", item: "错日子", debit: "100" });
  enter();
  assert.equal(lines().length, before);
  assert.equal($("#reading-value").textContent, balance);
  assert.equal($("#entry-why").hidden, false);
  assert.match($("#entry-why").textContent, /日期要填一个真有的日子/);
  fill({ date: "2026-08-09", item: "备份硬盘", debit: "", credit: "1049" });
  enter();
  assert.equal($("#entry-why").hidden, true);
  assert.equal(lines().length, before + 1);
});

check("借贷都空的一笔被拒绝，理由就在录入行下面", () => {
  fill({ date: "2026-08-10", item: "什么都没填", debit: "", credit: "" });
  enter();
  assert.match($("#entry-why").textContent, /这一笔要填借方或贷方/);
  assert.equal($("#entry-why").closest("form").id, "entry-form");
});

check("尾差为 0.00 时屏幕上没有一行对账式子", () => {
  assert.equal($("#reconcile").hidden, true);
  assert.doesNotMatch(screen(), /舍入调整|分位余额|报告期末/);
});

check("真有尾差时，余额旁边才出现那一句短注", () => {
  window.LedgerRoll.use("ledger");
  for (const cents of ["0.005", "0.005", "0.005"]) {
    fill({ date: "2026-08-12", item: "尾差测试 " + cents, debit: cents, credit: "" });
    enter();
  }
  assert.equal($("#reconcile").hidden, false);
  assert.match($("#reconcile").textContent, /舍入调整 −0\.01 元/);
  assert.equal($("#reading-value").textContent, "5 624.52");
});

check("删除只在指到那一行时露出来，删完余额跟着回去", () => {
  const before = lines().length;
  const drops = [...doc.querySelectorAll(".drop")];
  assert.equal(drops.length, before, "删除按钮不是每行一个");
  assert.equal(columns().includes("操作"), false, "还留着一列操作");
  drops[drops.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(lines().length, before - 1);
  assert.equal($("#reading-value").textContent, "5 624.51");
});

check("用途长在那个数的名字上，点一下就换，不是一个带标题的设置区", () => {
  assert.equal($("#uses").hidden, true);
  $("#reading-name").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal($("#uses").hidden, false);
  assert.deepEqual([...doc.querySelectorAll("#uses button")].map((node) => node.textContent.trim()),
    ["余额", "未收", "结存", "净值"]);
  assert.doesNotMatch(screen(), /用途与口径|通用流水/);
});

check("换成未收：流本身换了，基准日贴在那个数旁边", () => {
  window.LedgerRoll.use("receivable");
  assert.equal($("#reading-name").textContent, "未收");
  assert.equal($("#as-of").hidden, false);
  assert.deepEqual(columns(), ["开票日", "客户", "到期日", "金额", "已收", "未收", "账龄"]);
  fill({ date: "2026-05-01", item: "南山民宿画册", dueDate: "2026-06-01", amount: "12000", received: "4000" });
  enter();
  $("#as-of-date").value = "2026-08-14";
  $("#as-of-date").dispatchEvent(new window.Event("input", { bubbles: true }));
  const row = cellsOf(lines()[0]);
  assert.deepEqual(row.slice(0, 6), ["2026-05-01", "南山民宿画册", "2026-06-01", "12 000.00", "4 000.00", "8 000.00"]);
  assert.equal(row[6], "74 天 · 61–90");
  assert.equal($("#reading-value").textContent, "8 000.00");
});

check("六档账龄不上屏，但每一笔自己的档位读得到", () => {
  assert.doesNotMatch(screen(), /0–30|181–365|>365/);
  assert.match(screen(), /74 天 · 61–90/);
});

check("换成结存：数量口径逐行摊开，读数换成结存", () => {
  window.LedgerRoll.use("inventory");
  assert.equal($("#reading-name").textContent, "结存");
  assert.equal($("#reading-unit").textContent, "件");
  assert.equal($("#as-of").hidden, true);
  fill({ date: "2026-08-14", item: "相纸 · A2", opening: "120", inbound: "45", outbound: "18" });
  enter();
  assert.deepEqual(cellsOf(lines()[0]), ["2026-08-14", "相纸 · A2", "120.00", "45.00", "18.00", "147.00"]);
  assert.equal($("#reading-value").textContent, "147.00");
});

check("换成净值：一项资产在流上只落一行，年表原地摊开原地收回", () => {
  window.LedgerRoll.use("depreciation");
  assert.equal($("#reading-name").textContent, "净值");
  fill({ date: "2024-08-14", item: "备份硬盘", cost: "100000", salvage: "10000", life: "5", method: "straight-line" });
  enter();
  assert.equal(lines().length, 1);
  assert.deepEqual(cellsOf(lines()[0]),
    ["2024-08-14", "备份硬盘", "100 000.00", "10 000.00", "5", "直线", "64 000.00"]);
  assert.equal($("#reading-value").textContent, "64 000.00");

  assert.equal(doc.querySelectorAll("tr.years").length, 0, "年表默认就摊开了");
  const opener = lines()[0].querySelector("button.name");
  assert.equal(opener.textContent.trim(), "备份硬盘");
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const schedule = doc.querySelector("tr.years");
  assert.ok(schedule, "年表没有原地摊开");
  assert.equal(schedule.previousSibling, lines()[0], "年表没有贴着那一行");
  assert.equal(schedule.querySelectorAll(".year-line").length, 5);
  assert.deepEqual([...schedule.querySelectorAll(".year-line")[0].children].map((node) => node.textContent),
    ["第 1 年 · 直线", "年初 100 000.00 元", "折旧 18 000.00 元", "年末 82 000.00 元"]);
  assert.deepEqual([...schedule.querySelectorAll(".year-line")[4].children].map((node) => node.textContent),
    ["第 5 年 · 直线", "年初 28 000.00 元", "折旧 18 000.00 元", "年末 10 000.00 元"]);
  opener.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(doc.querySelectorAll("tr.years").length, 0, "年表收不回去");
});

check("带走的文本含日期、项目名、金额与读数，并且能手动选中", () => {
  window.LedgerRoll.use("ledger");
  fill({ date: "2026-08-13", item: "器材保险年费", credit: "980" });
  enter();
  const open = $("#takeaway-open");
  assert.equal($("#takeaway").hidden, true);
  open.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const text = $("#takeaway").textContent;
  assert.equal($("#takeaway").hidden, false);
  assert.match(text, /日期\t项目\t借方\t贷方\t余额/);
  assert.match(text, /2026-07-31\t林野杂志尾款\t8 600\.00/);
  assert.match(text, /2026-08-13\t器材保险年费\t\t980\.00/);
  assert.match(text, /余额\t/);
  assert.equal(window.getComputedStyle($("#takeaway")).userSelect, "text");
});

check("刷新会丢就写在带走入口旁边", () => {
  assert.match($("#volatile").textContent, /刷新/);
  assert.equal($("#volatile").previousElementSibling.id, "takeaway-open");
});

check("屏幕上没有口径栏、三步教程、容量说明与统计卡片", () => {
  const text = screen();
  for (const banned of ["计算口径", "金额单位", "怎么开始", "全部摊开", "不折叠", "逐笔可追溯",
    "借方合计", "贷方合计", "期末余额", "生成可选 CSV", "不依赖系统剪贴板", "没有示例记录", "运行自测"]) {
    assert.doesNotMatch(text, new RegExp(banned), `屏幕上还有「${banned}」`);
  }
  assert.equal(doc.querySelectorAll("h1, h2, h3").length, 0, "还有区块标题");
  assert.doesNotMatch(text, /逐笔登记，余额、账龄/, "还留着产品副标题");
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("流里的行不用表格线、斑马纹或卡片边框框起来", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /nth-child\(\s*(?:odd|even|2n)/i, "有斑马纹");
  for (const [, selector, decls] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/\btbody\b/.test(selector)) continue;
    for (const decl of decls.match(/border[a-z-]*\s*:[^;]+/gi) || []) {
      assert.match(decl, /:\s*(?:0|none|transparent)\b/, `${selector.trim()} 给流里的行加了线：${decl.trim()}`);
    }
  }
});

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
  assert.doesNotMatch(code("style.css"), /font-size\s*:\s*(?:[0-9]|1[01])px/i, "写死了小字号");
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

console.log("\n台账界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
