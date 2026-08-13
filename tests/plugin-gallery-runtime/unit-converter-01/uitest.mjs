/*
 * 换算器 · 界面自测（真的把 index.html 装起来、真的往输入框里打字、真的读屏上的字）
 *
 *   node tests/plugin-gallery-runtime/unit-converter-01/uitest.mjs
 *
 * 为什么还要这一份：engine 的自测只证明「算得对」，证明不了「打开它能用」。
 * 判「做完了」的标准是**打开它，输入东西，它给出正确结果**，所以这份测的是
 * 装载 → 输入 → 屏幕上出现的那串字。
 *
 * 用 jsdom，不是浏览器：这是一个 JS 实现的 DOM，属静态/程序化检查。
 * 全程不启动浏览器、不截图、不连网。
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/unit-converter-01",
);
const require = createRequire(import.meta.url);

/* jsdom 在 asset 仓是 pnpm 的间接依赖，没有提升到 node_modules/ 顶层，所以逐个探。 */
function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const d of direct) if (existsSync(d)) return require(d);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of require("node:fs").readdirSync(store)) {
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
const $ = (sel) => doc.querySelector(sel);
const text = (sel) => ($(sel) ? $(sel).textContent.replace(/\s+/g, " ").trim() : "");
const screen = () => doc.body.textContent.replace(/\s+/g, " ");

function type(value) {
  const input = $("#value");
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function pickCategory(label) {
  const btn = [...doc.querySelectorAll(".cat")].find((b) => b.textContent.trim() === label);
  assert.ok(btn, `找不到类别按钮「${label}」`);
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function pickUnit(unitId) {
  const sel = $("#from");
  sel.value = unitId;
  assert.equal(sel.value, unitId, `源单位 ${unitId} 不在下拉里`);
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
}
/** 找到某个单位那一行，返回它显示的数字串。 */
function rowValue(symbol) {
  for (const row of doc.querySelectorAll(".row")) {
    const sym = row.querySelector(".sym");
    if (sym && sym.textContent.trim() === symbol) {
      return row.querySelector(".num").textContent.trim();
    }
  }
  return null;
}

console.log("换算器界面自测（jsdom，非浏览器）");

/* ---------- 首屏 ---------- */

check("引擎脚本被页面装上了", () => {
  assert.ok(window.UnitConverterEngine, "window.UnitConverterEngine 不存在，说明 <script src> 没跑起来");
});

check("首屏不是空框：进来就有出厂读数 1 m", () => {
  assert.equal($("#value").value, "1");
  assert.ok(doc.querySelectorAll(".row").length >= 5, "结果行少于 5 行");
});

check("首屏 1 m 就已经算出 100 cm", () => {
  assert.equal(rowValue("cm"), "100");
});

check("首屏 1 m 同时给出英寸", () => {
  const v = rowValue("in");
  assert.ok(v && v.startsWith("39.370078"), `英寸行显示的是 ${v}`);
});

check("每行都把因子、基准单位、精确/近似摆在结果旁边", () => {
  const fine = $(".row .fine").textContent;
  assert.match(fine, /因子/);
  assert.match(fine, /基准/);
  assert.match(fine, /精确|近似/);
});

/* ---------- 真的输入东西 ---------- */

check("输入 3.25 → 米制整列跟着变（325 cm / 3 250 mm）", () => {
  type("3.25");
  assert.equal(rowValue("cm"), "325");
  assert.equal(rowValue("mm"), "3 250");
});

check("输入负数与科学计数法都收（-1.5e3 m = -1.5 km）", () => {
  type("-1.5e3");
  assert.equal(rowValue("km"), "-1.5");
});

check("输入一半（只打了个减号）不报错，只是等着", () => {
  type("-");
  assert.match(screen(), /等一个数/);
  assert.equal(doc.querySelectorAll(".row").length, 0);
});

/* ---------- 换类别、换单位 ---------- */

check("切到温度：100 °C 给出 373.15 K 与 212 °F", () => {
  pickCategory("温度");
  pickUnit("C");
  type("100");
  assert.equal(rowValue("K"), "373.15");
  assert.equal(rowValue("°F"), "212");
});

check("−40 °C 与 −40 °F 相交那一点", () => {
  type("-40");
  assert.equal(rowValue("°F"), "-40");
});

check("切到血糖：100 mg/dL 给出 5.555…，且屏上写着「近似」", () => {
  pickCategory("血糖");
  pickUnit("mgdL");
  type("100");
  const v = rowValue("mmol/L");
  assert.ok(v && v.startsWith("5.5555"), `mmol/L 行显示的是 ${v}`);
  assert.match(screen(), /近似/);
  assert.match(screen(), /依赖被测物质/);
});

check("切到数据量：1 KiB = 1 024 B，1 kB = 1 000 B，两个进制都在屏上", () => {
  pickCategory("数据量");
  pickUnit("KiB");
  type("1");
  assert.equal(rowValue("B"), "1 024");
  pickUnit("kB");
  assert.equal(rowValue("B"), "1 000");
});

check("换类别时页面不残留上一类的单位行", () => {
  pickCategory("长度");
  assert.equal(rowValue("mmol/L"), null, "血糖的行还留在屏上");
  assert.ok(rowValue("m") !== null, "长度的行没出来");
});

/* ---------- 页面上的自测按钮 ---------- */

check("点「运行自测」→ 屏上出现 20 / 20 通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const out = text("#test-out");
  assert.match(out, /^(\d+) \/ \1 通过$/, `自测输出是「${out}」`);
  assert.match(out, /^20 \/ 20 通过$/);
});

/* ---------- 沙箱适配：这些一旦破了，嵌进 iframe 就废 ---------- */

/*
 * 扫描的是**代码**，不是注释。注释里为了讲清楚为什么不用某个东西，
 * 免不了要写出它的名字（「不碰 localStorage」），不先剥注释就会自己命中自己。
 */
function code(file) {
  let src = readFileSync(path.join(runtimeDir, file), "utf8");
  src = src.replace(/<!--[\s\S]*?-->/g, " ");     // HTML 注释
  src = src.replace(/\/\*[\s\S]*?\*\//g, " ");    // JS 块注释
  src = src.replace(/^[ \t]*\/\/.*$/gm, " ");     // 行首行注释（不碰字符串里的 https://）
  return src;
}

check("页面代码里没有 innerHTML / eval / new Function / document.write", () => {
  for (const f of ["ui.js", "engine.js", "index.html"]) {
    const src = code(f);
    assert.doesNotMatch(src, /\.(inner|outer)HTML\s*\+?=/, `${f} 出现 innerHTML 赋值`);
    assert.doesNotMatch(src, /(?<![\w.$])eval\s*\(/, `${f} 出现 eval`);
    assert.doesNotMatch(src, /new\s+Function\s*\(/, `${f} 出现 new Function`);
    assert.doesNotMatch(src, /document\s*\.\s*write/, `${f} 出现 document.write`);
  }
});

check("不碰存储、不碰父窗口、不发请求（不透明源里碰了就抛）", () => {
  for (const f of ["ui.js", "engine.js"]) {
    const src = code(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage|document\s*\.\s*cookie/, `${f} 碰了存储`);
    assert.doesNotMatch(src, /window\s*\.\s*(parent|top)\b|postMessage/, `${f} 碰了父窗口`);
    assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, `${f} 发了请求`);
  }
});

check("没有外部资源：所有 src/href 都是同目录相对路径", () => {
  for (const m of code("index.html").matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)) {
    assert.doesNotMatch(m[1], /^(https?:)?\/\//, `外部资源 ${m[1]}`);
    assert.doesNotMatch(m[1], /^data:|^javascript:/, `可疑 URL ${m[1]}`);
  }
});

check("不用 ES module（不透明源下模块脚本会因 CORS 取不回来）", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*"module"/);
});

check("页面里没有 iframe（插件自己不再嵌套不可信内容）", () => {
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

console.log("\n换算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
