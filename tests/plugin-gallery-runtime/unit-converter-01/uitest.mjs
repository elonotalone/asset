/*
 * 换算器 · 界面自测（真的把 index.html 装起来、真的往数字上打字、真的读屏上的字）
 *
 *   node tests/plugin-gallery-runtime/unit-converter-01/uitest.mjs
 *
 * engine 的自测只证明「算得对」，证明不了「打开它能用」。这份测的是
 * 装载 → 改一端 → 另一端跟着变 的那条路，以及屏幕上到底留了什么。
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
const left = () => $("#value-left").value;
const right = () => $("#value-right").value;

function type(side, value) {
  const input = $("#value-" + side);
  input.dispatchEvent(new window.FocusEvent("focus", { bubbles: true }));
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function pickUnit(side, unitId) {
  const select = $("#unit-" + side);
  select.value = unitId;
  assert.equal(select.value, unitId, `${unitId} 不在 ${side} 端的单位表里`);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}
/** 下拉里当前选中项显示的那串字（用户看到的单位名）。 */
function unitLabel(side) {
  const select = $("#unit-" + side);
  return select.options[select.selectedIndex].textContent.trim();
}

console.log("换算器界面自测（jsdom，非浏览器）");

/* ---------- 首屏 ---------- */

check("引擎脚本被页面装上了", () => {
  assert.ok(window.UnitConverterEngine, "window.UnitConverterEngine 不存在，说明 <script src> 没跑起来");
});

check("首屏不是空框：一对数已经严丝合缝地对上（1 m = 100 cm）", () => {
  assert.equal(left(), "1");
  assert.equal(right(), "100");
  assert.match(unitLabel("left"), /^米（m）$/);
  assert.match(unitLabel("right"), /^厘米（cm）$/);
});

check("桥上写着这一对是精确定义", () => {
  assert.equal(text("#relation"), "精确定义");
  assert.equal($("#bridge").getAttribute("data-exact"), "true");
});

check("哪端是原数、哪端是结果，用字写出来，不只靠色面", () => {
  assert.equal(text("#role-left"), "原数");
  assert.equal(text("#role-right"), "结果");
});

/* ---------- 厨房里那三步：选美国液量盎司 → 输入 12 → 右端读毫升 ---------- */

check("点左端单位选「美国液量盎司」，右端自动落到毫升，仍然只有一对数", () => {
  pickUnit("left", "flozUS");
  assert.match(unitLabel("left"), /^美国液量盎司（US fl oz）$/);
  assert.match(unitLabel("right"), /^毫升（mL）$/);
  assert.equal(doc.querySelectorAll(".num").length, 2, "屏上不许出现第三个读数");
});

check("输入 12 → 右端就地给出 354.882…，数字与单位紧挨在一起", () => {
  type("left", "12");
  assert.ok(right().startsWith("354.882"), `右端显示的是 ${right()}`);
  const side = $("#side-right");
  assert.ok(side.contains($("#value-right")) && side.contains($("#unit-right")));
});

check("改右端也能算回左端（毫升 → 美国液量盎司）", () => {
  type("right", "500");
  assert.equal(text("#role-right"), "原数");
  assert.equal(text("#role-left"), "结果");
  assert.ok(left().startsWith("16.907"), `左端显示的是 ${left()}`);
});

/* ---------- 换单位就是换量纲 ---------- */

check("切到温度：100 °C 给出 212 °F", () => {
  pickUnit("left", "C");
  assert.match(unitLabel("right"), /华氏度/);
  type("left", "100");
  assert.equal(right(), "212");
});

check("−40 °C 与 −40 °F 相交那一点", () => {
  type("left", "-40");
  assert.equal(right(), "-40");
});

check("切到血糖：桥上直接写出物质名「葡萄糖近似换算」", () => {
  pickUnit("left", "mgdL");
  type("left", "100");
  assert.match(unitLabel("left"), /毫克每分升/);
  assert.match(unitLabel("right"), /毫摩尔每升/);
  assert.ok(right().startsWith("5.5555"), `右端显示的是 ${right()}`);
  assert.equal(text("#relation"), "葡萄糖近似换算");
  assert.equal($("#bridge").getAttribute("data-exact"), "false");
});

check("切到数据量：KiB 与 kB 不是一个进制，名字上就分得开", () => {
  pickUnit("left", "KiB");
  type("left", "1");
  assert.match(unitLabel("left"), /二进制千字节（KiB）/);
  pickUnit("right", "kB");
  assert.match(unitLabel("right"), /十进制千字节（kB）/);
  assert.equal(right(), "1.024");
  pickUnit("right", "B");
  assert.equal(right(), "1 024");
});

check("输入只打了个减号时不报错，另一端说在等一个数", () => {
  type("left", "-");
  assert.equal(right(), "等一个数");
  assert.ok($("#value-right").classList.contains("waiting"));
});

check("长数不折行：极小值走科学计数，仍然是一行", () => {
  pickUnit("left", "eV");
  pickUnit("right", "J");
  type("left", "1");
  assert.match(right(), /^1\.602177e-19$/);
  assert.equal(right().includes("\n"), false);
});

/* ---------- 屏幕上不许再有的东西 ---------- */

check("没有自测按钮、没有类别按钮排、没有整列结果", () => {
  assert.equal($("#run-test"), null, "运行自测按钮还在");
  assert.equal(doc.querySelectorAll(".cat").length, 0, "类别按钮排还在");
  assert.equal(doc.querySelectorAll(".row").length, 0, "整列结果还在");
  assert.equal(doc.querySelectorAll("table").length, 0);
});

check("屏上没有因子、偏移、基准单位、参数说明与产品副标题", () => {
  const words = ["因子", "偏移", "基准", "支持小数", "科学计数写法", "运行自测", "口径", "图例"];
  for (const word of words) {
    assert.equal(screen().includes(word), false, `屏上还写着「${word}」`);
  }
  assert.equal(doc.querySelectorAll("h1, h2, h3").length, 0, "还有产品标题");
});

check("没有写死的小字号", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(?:9|10|11)(?:\.\d+)?px/);
});

/* ---------- 沙箱适配：这些一旦破了，嵌进 iframe 就废 ---------- */

/*
 * 扫描的是**代码**，不是注释：注释里为了讲清楚为什么不用某个东西，
 * 免不了要写出它的名字（「不碰 localStorage」），不先剥注释就会自己命中自己。
 */
function code(file) {
  let src = readFileSync(path.join(runtimeDir, file), "utf8");
  src = src.replace(/<!--[\s\S]*?-->/g, " ");
  src = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  src = src.replace(/^[ \t]*\/\/.*$/gm, " ");
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
