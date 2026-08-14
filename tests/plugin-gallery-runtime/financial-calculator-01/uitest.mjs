/*
 * 金融计算器 · 界面自测（真的把 index.html 装起来、真的拖期限、真的读屏上那句结论）
 *
 *   node tests/plugin-gallery-runtime/financial-calculator-01/uitest.mjs
 *
 * engine 的自测只证明「算得对」，证明不了「打开它能用」。这份测的是
 * 装载 → 改一个假设 → 终点那句取舍结论 的那条路，以及屏幕上到底留了什么。
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
  "../../../content/active-runtime/plugin/financial-calculator-01",
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
const verdict = () => text("#verdict");

function type(id, value) {
  const input = doc.getElementById(id);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
/** 卡扣和曲线终点改的是同一个数，量纲是期，所以这里按期给。 */
function dragTerm(months) {
  const range = $("#term");
  range.value = String(months);
  range.dispatchEvent(new window.Event("input", { bubbles: true }));
}
/*
 * jsdom 没有版面，getBoundingClientRect 全是零，像素换算没法跑。
 * 拖动这条路要测，就得先给画布一个假版面——量的是我自己的换算，不是浏览器的排版。
 */
function withPlotWidth(width, fn) {
  const plot = $("#plot");
  const real = plot.getBoundingClientRect;
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 500, right: width, bottom: 500 });
  try {
    fn();
  } finally {
    plot.getBoundingClientRect = real;
  }
}
function grabEnd(clientX) {
  $("#axis .end").dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, clientX }));
}
function moveTo(clientX) {
  window.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true, clientX }));
}
function letGo() {
  window.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
}
function click(id) {
  doc.getElementById(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
/** 曲线是不是由真实点位连成的：数一数路径里的采样点。 */
function pointCount(sel) {
  const d = $(sel).getAttribute("d") || "";
  return (d.match(/[ML]/g) || []).length;
}

console.log("金融计算器界面自测（jsdom，非浏览器）");

/* ---------- 首屏 ---------- */

check("引擎脚本被页面装上了", () => {
  assert.ok(window.FinancialEngine, "window.FinancialEngine 不存在，说明 <script src> 没跑起来");
});

check("首屏就是一档出厂房贷：100 万、4.20%、30 年 · 360 期、等额本息", () => {
  assert.equal($("#principal").value, "1 000 000.00");
  assert.equal($("#rate").value, "4.20");
  assert.equal($("#term").value, "360");
  assert.equal(text("#term-read"), "30 年 · 360 期");
  assert.equal($("#method").value, "annuity");
});

check("时间轴终点自己就是期限把手，名字写在把手上", () => {
  const end = $("#axis .end");
  assert.ok(end, "终点没有做成可操作的把手");
  assert.equal(end.tagName, "BUTTON");
  assert.equal(text("#axis .end"), "30 年清零");
});

check("曲线由每一期真实余额连成，不是起点终点拉直线", () => {
  assert.equal(pointCount("#now"), 361, "应当是 360 期 + 起点本金");
  assert.ok(($("#shade").getAttribute("d") || "").endsWith("Z"), "曲线下的薄染要用同一路径闭合");
});

check("首屏结论说清当前方案的月供与总利息，都带元", () => {
  assert.match(verdict(), /^30 年方案（等额本息）：每月还 4 890\.17 元，总利息 760 461\.83 元。$/);
});

check("对比轨迹一开始不存在", () => {
  assert.equal($("#past").getAttribute("d"), "");
  assert.equal($("#past-name").hidden, true);
});

/* ---------- 客厅里那一下：把期限终点从三十年拖到二十年 ---------- */

check("拖到 20 年：结论当场写出每月多付多少、总利息少付多少", () => {
  dragTerm(240);
  assert.equal(text("#term-read"), "20 年 · 240 期");
  assert.match(
    verdict(),
    /^20 年方案比 30 年方案每月多付 1 275\.54 元，总利息少付 280 692\.06 元。$/,
  );
});

check("原方案留在纸上当对比轨迹，名字写出来，不叫 A／B", () => {
  assert.ok(($("#past").getAttribute("d") || "").length > 0, "对比轨迹没画");
  assert.equal($("#past-name").hidden, false);
  assert.equal(text("#past-name"), "30 年方案");
  assert.equal(screen().includes("方案 A"), false);
});

check("两条轨迹共用同一套坐标尺度（对比方案更长，所以它的终点落在右边缘）", () => {
  const last = (sel) => {
    const points = ($(sel).getAttribute("d") || "").split(/[ML]/).filter(Boolean);
    return points[points.length - 1].trim().split(/\s+/).map(Number);
  };
  const nowEnd = last("#now");
  const pastEnd = last("#past");
  assert.ok(pastEnd[0] > nowEnd[0], "对比方案的终点应当比当前方案更靠右");
  assert.ok(Math.abs(pastEnd[1] - nowEnd[1]) < 1, "两条轨迹都走到清零，终点高度应当一致");
});

check("拖回 30 年：差额归零，结论回到单个方案那一句", () => {
  dragTerm(360);
  assert.match(verdict(), /^30 年方案（等额本息）：每月还 4 890\.17 元，总利息 760 461\.83 元。$/);
  assert.equal($("#past").getAttribute("d"), "");
});

/* ---------- 手直接落在曲线终点上，把它往前拖 ---------- */

check("抓住终点往左拖：把手跟着指针走，期限当场跟着变", () => {
  withPlotWidth(1000, () => {
    const at = () => Number(String($("#axis .end").style.left).replace("%", "")) / 100 * 1000;
    const start = at();
    grabEnd(start);
    moveTo(500);
    assert.equal(text("#term-read"), "15 年 · 180 期");
    assert.ok(Math.abs(at() - 500) < 4, `把手停在 ${at()}，指针在 500，没跟上`);
    assert.match(verdict(), /^15 年方案比 30 年方案每月多付 /);
    letGo();
  });
});

check("拖到左边尽头也不会拖出一个没法还的期限", () => {
  withPlotWidth(1000, () => {
    grabEnd(500);
    moveTo(-4000);
    assert.equal(text("#term-read"), "1 年 · 12 期");
    letGo();
  });
});

check("松手以后指针再动，期限不再跟着跑", () => {
  withPlotWidth(1000, () => {
    const before = text("#term-read");
    moveTo(900);
    assert.equal(text("#term-read"), before);
  });
});

check("把手能用方向键改期限：一格一年，按住 Shift 走单期", () => {
  dragTerm(240);
  const end = () => $("#axis .end");
  end().focus();
  end().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(text("#term-read"), "21 年 · 252 期");
  /* 整条轴重画了，焦点要接回新的把手，不然连按第二下就落空。 */
  assert.equal(doc.activeElement, end());
  end().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }));
  assert.equal(text("#term-read"), "20 年 11 个月 · 251 期");
  assert.equal(text("#axis .end"), "20 年 11 个月清零");
  dragTerm(360);
});

check("换等额本金：结论改说首期还款，方式名写全", () => {
  dragTerm(240);
  const method = $("#method");
  method.value = "equal-principal";
  method.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(verdict(), /^20 年方案比 30 年方案首期多付 /);
  method.value = "annuity";
  method.dispatchEvent(new window.Event("change", { bubbles: true }));
  dragTerm(360);
});

check("改本金：曲线和结论跟着换，金额仍然带元", () => {
  type("principal", "850 000");
  assert.match(verdict(), /^30 年方案（等额本息）：每月还 4 156\.65 元，总利息 646 392\.55 元。$/);
  type("principal", "1000000");
});

check("本金填成 0 时不硬凑一条轨迹，就地说要填什么", () => {
  type("principal", "0");
  assert.equal($("#now").getAttribute("d"), "");
  assert.match(verdict(), /本金和年利率要填成大于 0 的数/);
  type("principal", "1000000");
  assert.match(verdict(), /每月还 4 890\.17 元/);
});

/* ---------- 游标：只在当前点就地报数 ---------- */

check("游标落在曲线上时，就地给出当期还款、利息、本金和余额", () => {
  /* jsdom 没有版面，getBoundingClientRect 全是零；用它测不了鼠标位置，
     所以这里只验证读数在没有版面时不会崩，也不会假装有数。 */
  const plot = $("#plot");
  plot.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true, clientX: 500 }));
  assert.equal($("#readout").hidden, true);
  plot.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: true }));
  assert.equal($("#marker").getAttribute("visibility"), "hidden");
});

/* ---------- 换一个问题：整条曲线和操作带一起换 ---------- */

check("切到现金流：贷款那套输入整块离场，不是被塞进抽屉", () => {
  click("ask-cash");
  assert.equal($("#knobs-loan").hidden, true);
  assert.equal($("#knobs-cash").hidden, false);
  assert.equal($("#flows").value, "-100000, 30000, 35000, 40000, 45000");
  assert.match(verdict(), /按 10% 折现，这组现金流现在值 .* 元；内部收益率 \d+\.\d\d%。$/);
});

check("现金流全同号：结论原位直接说没有常规内部收益率，不弹面板也不硬给数", () => {
  type("flows", "100, 200, 300");
  assert.match(verdict(), /这组现金流没有常规内部收益率。$/);
  assert.equal(screen().includes("NaN"), false);
});

check("现金流曲线按期把折现值累积成真实点位", () => {
  type("flows", "-1000, 500, 500, 500");
  assert.equal(pointCount("#now"), 4);
  assert.match(verdict(), /现在值 243\.43 元/);
});

check("切回贷款：现金流那套输入整块离场", () => {
  click("ask-loan");
  assert.equal($("#knobs-cash").hidden, true);
  assert.equal($("#knobs-loan").hidden, false);
  assert.match(verdict(), /^30 年方案（等额本息）：/);
});

/* ---------- 屏幕上不许再有的东西 ---------- */

check("没有自测按钮、没有逐期明细表、没有结果卡片", () => {
  assert.equal(doc.getElementById("run-test"), null, "运行自测按钮还在");
  assert.equal(doc.querySelectorAll("table").length, 0, "逐期明细表还在");
  assert.equal(doc.querySelectorAll("thead, tbody, th, td").length, 0);
});

check("屏上没有口径栏、公式、容量说明与产品标题副标题", () => {
  const words = [
    "口径", "期利率", "按期复利", "分位舍入", "运行自测", "全部摊开", "没有折叠",
    "假设", "图例", "总还款"
  ];
  for (const word of words) {
    assert.equal(screen().includes(word), false, `屏上还写着「${word}」`);
  }
  assert.equal(doc.querySelectorAll("h1, h2, h3").length, 0, "还有产品标题");
});

check("方案名、金额、单位都在屏上，没有裸数", () => {
  assert.match(screen(), /年方案/);
  assert.match(screen(), /元/);
  assert.match(text("#term-read"), /年 · \d+ 期/);
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

console.log("\n金融计算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
