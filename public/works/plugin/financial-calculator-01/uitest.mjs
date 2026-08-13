/*
 * 金融计算器 · 界面自测（真的装起来、真的改假设、真的读屏上的数）
 *
 *   node public/works/plugin/financial-calculator-01/uitest.mjs
 *
 * jsdom，不是浏览器：JS 实现的 DOM，属静态/程序化检查。不启动浏览器、不截图、不连网。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadJsdom() {
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const d of direct) if (existsSync(d)) return require(d);
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const p = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("找不到 jsdom：界面自测无法运行（引擎自测 selftest.mjs 不受影响）");
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

const htmlPath = path.join(here, "index.html");
const dom = new JSDOM(readFileSync(htmlPath, "utf8"), {
  url: pathToFileURL(htmlPath).href,
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const text = (s) => ($(s) ? $(s).textContent.replace(/\s+/g, " ").trim() : "");
const screen = () => doc.body.textContent.replace(/\s+/g, " ");

function set(id, value) {
  const node = doc.getElementById(id);
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
  node.dispatchEvent(new window.Event("change", { bubbles: true }));
}
/** 结论区某一格显示的数。 */
function headline(label) {
  for (const cell of doc.querySelectorAll(".headline .cell")) {
    if (cell.querySelector(".k").textContent.trim() === label) {
      return cell.querySelector(".v").textContent.trim();
    }
  }
  return null;
}
function rowCells(n) {
  const tr = doc.querySelectorAll("#tbody tr")[n];
  return tr ? [...tr.children].map((td) => td.textContent.trim()) : null;
}

console.log("金融计算器界面自测（jsdom，非浏览器）");

check("引擎脚本被页面装上了", () => {
  assert.ok(window.FinancialEngine, "window.FinancialEngine 不存在");
});

/* ---------- 首屏：出厂档位，规格给的两个数必须原样出现在屏上 ---------- */

check("首屏是可改的出厂档位，不是空表", () => {
  assert.equal($("#principal").value, "1000000");
  assert.equal($("#rate").value, "4.2");
  assert.equal($("#periods").value, "360");
});

check("首屏结论区就写着月供 4 890.17", () => {
  assert.equal(headline("每期还款"), "4 890.17");
});

check("首屏结论区就写着总利息 760 461.83（规格原文那个数）", () => {
  assert.equal(headline("总利息"), "760 461.83");
});

check("口径与结论同屏，不在折叠块里", () => {
  const basis = text("#basis-line");
  assert.match(basis, /金额单位 元/);
  assert.match(basis, /等额本息/);
  assert.match(basis, /期利率/);
  assert.match(basis, /复利/);
  assert.match(basis, /四舍五入/);
  assert.equal(doc.querySelectorAll("details, summary").length, 0, "出现了折叠块");
});

/* ---------- 逐期明细：摊开，不折叠不分页 ---------- */

check("360 期明细全部摊开在页面上（没有分页、没有折叠）", () => {
  assert.equal(doc.querySelectorAll("#tbody tr").length, 360);
});

check("第 1 期明细自洽：还款 = 利息 + 本金", () => {
  const [, pay, int, pri] = rowCells(0);
  const n = (s) => Number(s.replace(/\s/g, ""));
  assert.ok(Math.abs(n(pay) - (n(int) + n(pri))) < 0.02, `${pay} ≠ ${int} + ${pri}`);
});

check("最后一期余额是 0.00（末期平衡真的落地了）", () => {
  assert.equal(rowCells(359)[4], "0.00");
});

check("两个总利息口径都摆在屏上，并写明相差多少", () => {
  const t = text("#tail");
  assert.match(t, /公式口径/);
  assert.match(t, /账面口径/);
  assert.match(t, /相差/);
});

/* ---------- 真的改假设 ---------- */

check("把 360 改成 240：月供变高、总利息变低（规格里用户要比的那件事）", () => {
  const pay30 = headline("每期还款"), int30 = headline("总利息");
  set("periods", "240");
  const pay20 = headline("每期还款"), int20 = headline("总利息");
  const n = (s) => Number(s.replace(/\s/g, ""));
  assert.ok(n(pay20) > n(pay30), `${pay20} 不高于 ${pay30}`);
  assert.ok(n(int20) < n(int30), `${int20} 不低于 ${int30}`);
  assert.equal(doc.querySelectorAll("#tbody tr").length, 240, "明细没跟着变成 240 行");
});

check("改还款方式为等额本金：首期与末期还款不同，且每期本金相同", () => {
  set("method", "equal-principal");
  assert.ok(headline("首期还款"), "结论区没换成首期还款");
  assert.ok(headline("末期还款"), "结论区缺末期还款");
  assert.equal(rowCells(0)[3], rowCells(1)[3], "等额本金的每期本金应当相同");
  assert.match(text("#basis-line"), /等额本金/);
  set("method", "annuity");
  set("periods", "360");
});

check("利率填 0：退化成 P/n，不出 NaN", () => {
  set("rate", "0");
  set("principal", "1200");
  set("periods", "12");
  assert.equal(headline("每期还款"), "100.00");
  assert.doesNotMatch(screen(), /NaN|Infinity/);
  set("principal", "1000000");
  set("rate", "4.2");
  set("periods", "360");
});

check("输入清空不崩，只是等着填", () => {
  set("principal", "");
  assert.match(screen(), /都填成正常的数/);
  assert.equal(doc.querySelectorAll("#tbody tr").length, 0);
  set("principal", "1000000");
  assert.equal(doc.querySelectorAll("#tbody tr").length, 360);
});

/* ---------- 第二组计算：现金流 ---------- */

check("首屏现金流已经给出 NPV 与 IRR", () => {
  const t = text("#cash-out");
  assert.match(t, /NPV @ 10%/);
  assert.match(t, /IRR/);
  assert.doesNotMatch(t, /无常规解/);
});

check("把现金流改成全正：IRR 明说无常规解，不硬凑数字", () => {
  set("flows", "100, 200, 300");
  assert.match(text("#cash-out"), /无常规解/);
  assert.match(screen(), /全部同号时 IRR 没有常规意义/);
  set("flows", "-100000, 30000, 35000, 40000, 45000");
});

check("现金流按定义算：[-1000,500,500,500] @10% → NPV 243.43", () => {
  set("flows", "-1000, 500, 500, 500");
  set("discount", "10");
  assert.match(text("#cash-out"), /243\.43/);
});

/* ---------- 页面自测按钮 ---------- */

check("点「运行自测」→ 屏上出现 15 / 15 通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const out = text("#test-out");
  assert.match(out, /^(\d+) \/ \1 通过$/, `自测输出是「${out}」`);
  assert.match(out, /^15 \/ 15 通过$/);
});

/* ---------- 沙箱适配 ---------- */

function code(file) {
  return readFileSync(path.join(here, file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

check("没有 innerHTML / eval / new Function / document.write", () => {
  for (const f of ["ui.js", "engine.js", "index.html"]) {
    const src = code(f);
    assert.doesNotMatch(src, /\.(inner|outer)HTML\s*\+?=/, `${f} 出现 innerHTML 赋值`);
    assert.doesNotMatch(src, /(?<![\w.$])eval\s*\(/, `${f} 出现 eval`);
    assert.doesNotMatch(src, /new\s+Function\s*\(/, `${f} 出现 new Function`);
    assert.doesNotMatch(src, /document\s*\.\s*write/, `${f} 出现 document.write`);
  }
});

check("不碰存储、不碰父窗口、不发请求", () => {
  for (const f of ["ui.js", "engine.js"]) {
    const src = code(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage|document\s*\.\s*cookie/, `${f} 碰了存储`);
    assert.doesNotMatch(src, /window\s*\.\s*(parent|top)\b|postMessage/, `${f} 碰了父窗口`);
    assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, `${f} 发了请求`);
  }
});

check("没有外部资源、不用 ES module、页面里没有 iframe", () => {
  const html = code("index.html");
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)) {
    assert.doesNotMatch(m[1], /^(https?:)?\/\//, `外部资源 ${m[1]}`);
    assert.doesNotMatch(m[1], /^data:|^javascript:/, `可疑 URL ${m[1]}`);
  }
  assert.doesNotMatch(html, /type\s*=\s*"module"/);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

console.log("\n金融计算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
