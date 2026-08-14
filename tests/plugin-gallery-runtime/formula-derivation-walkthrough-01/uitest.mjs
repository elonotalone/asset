import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/formula-derivation-walkthrough-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const item of direct) if (existsSync(item)) return require(item);
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom：界面自测无法运行（引擎自测不受影响）");
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
const $ = (selector) => doc.querySelector(selector);
const all = (selector) => [...doc.querySelectorAll(selector)];
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const text = (selector) => ($(selector) ? clean($(selector).textContent) : "");
/** 屏幕上的间距来自 flex gap，取文字时按叶子节点补回空格。 */
const spaced = (selector) => {
  const host = $(selector);
  if (!host) return "";
  const parts = [];
  for (const item of host.querySelectorAll("*")) {
    if (item.children.length === 0 && item.textContent.trim()) parts.push(item.textContent.trim());
    if (item.value !== undefined && String(item.value).trim()) parts.push(String(item.value).trim());
  }
  return parts.join(" ");
};
const screen = () => clean(doc.querySelector("main").textContent);

/** 把 grid 里的四列还原成「左边 = 右边 （依据）」的逻辑行。 */
function rows() {
  const cells = [...$("#chain").children].filter((cell) => !cell.classList.contains("knowns"));
  const out = [];
  for (let i = 0; i < cells.length; i += 4) {
    out.push({
      lhs: clean(cells[i].textContent),
      eq: clean(cells[i + 1].textContent),
      rhs: clean(cells[i + 2].textContent),
      note: clean(cells[i + 3].textContent),
      relit: cells[i + 2].classList.contains("relit"),
      broken: !!cells[i + 2].querySelector(".broken"),
      tail: cells[i + 2].classList.contains("tail")
    });
  }
  return out;
}
function row(lhs) { return rows().find((item) => item.lhs === lhs); }
function click(target) { target.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
function type(value) {
  const input = $("#editing-now");
  assert.ok(input, "没有出现原位输入框");
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function closeEdit() {
  const live = $("#editing-now") || $("#editing-unit");
  if (live) live.dispatchEvent(new window.Event("blur", { bubbles: true }));
}
function editExpression(value) {
  closeEdit();
  const target = $(".touch-rhs");
  assert.ok(target, "原式右边不可点");
  click(target);
  type(value);
}
function openKnown(symbol) {
  closeEdit();
  const found = all(".known").find((item) => clean(item.textContent).includes(symbol));
  assert.ok(found, "找不到已知量 " + symbol);
  click(found.querySelector(".touch-value"));
}
const guideSegments = () => ($("#guide-path").getAttribute("d").match(/M/g) || []).length;

console.log("公式展开界面自测（jsdom，非浏览器）");

check("首屏就是一段完整的自由落体推导，明确标成示例", () => {
  assert.ok(window.FormulaWalkthroughEngine);
  assert.equal(text(".example-tag"), "示例 · 自由落体");
  const knowns = spaced(".knowns");
  assert.match(knowns, /求 位移 s/);
  assert.match(knowns, /重力加速度 g = 9\.80665 m\/s²/);
  assert.match(knowns, /时间 t = 2\.4 s/);
});

check("每一行都是完整等式，依据写的是人能核对的名字", () => {
  const chain = rows();
  assert.deepEqual(chain.map((item) => item.note), ["原式", "代入", "平方", "乘上 g", "乘上 0.5", "近似到 2 位小数"]);
  assert.equal(chain[0].rhs, "0.5 × g × t²");
  assert.equal(chain[1].rhs, "0.5 × 9.80665 m/s² × (2.4 s)²");
  assert.equal(chain.every((item) => item.eq === "=" || item.eq === "≈"), true);
});

check("逐步独立复算，数与单位各自完整", () => {
  assert.equal(row("t²").rhs, "5.76 s²");
  assert.equal(row("g × t²").rhs, "56.486304 m");
  assert.equal(row("0.5 × g × t²").rhs, "28.243152 m");
  const approx = rows()[5];
  assert.equal(approx.eq, "≈");
  assert.match(approx.rhs, /^28\.24 m/);
  assert.match(approx.rhs, /绝对误差 0\.003152 m/);
  assert.doesNotMatch(screen(), /23\.53596/, "又冒出旧规格那个错值");
});

check("链尾是头号结论，引导线连的是每一行等号的真实位置", () => {
  assert.equal(rows()[5].tail, true);
  assert.equal(guideSegments(), 5);
});

check("屏上没有符号表、步骤计数、语法说明、精度政策与自测入口", () => {
  assert.equal($("#run-test"), null);
  const shown = screen();
  for (const banned of ["符号表", "推导步骤", "加入符号", "写入这一步", "运行自测", "支持函数", "有效数字",
    "双精度", "不执行自由代码", "第 1 步", "当前结果", "个量"]) {
    assert.doesNotMatch(shown, new RegExp(banned), "屏上仍有：" + banned);
  }
  assert.equal(doc.querySelectorAll("table, form").length, 0);
});

check("点中时间 t，输入自己的数：不用提交，下游依次重算", () => {
  openKnown("时间");
  type("1.8");
  assert.equal(row("t²").rhs, "3.24 s²");
  assert.equal(row("g × t²").rhs, "31.773546 m");
  assert.equal(row("0.5 × g × t²").rhs, "15.886773 m");
  assert.match(rows()[5].rhs, /^15\.89 m/);
  assert.equal($(".example-tag"), null, "改了自己的数还挂着示例标签");
  assert.match(text("#affected"), /改了 时间 t/);
  assert.match(text("#affected"), /代入、平方、乘上 g、乘上 0\.5、近似到 2 位小数 依次重算/);
});

check("改重力加速度：t² 那一行不受影响，也没有跟着一起闪", () => {
  openKnown("重力加速度");
  type("9.8");
  assert.equal(row("t²").rhs, "3.24 s²");
  assert.equal(row("t²").relit, false, "改 g 时 t² 也闪了");
  assert.equal(row("g × t²").relit, true);
  assert.equal(row("0.5 × g × t²").rhs, "15.876 m");
  assert.match(text("#affected"), /t² 没有变/);
});

check("改单位就多出一行真实的单位换算，数字仍从基准单位算下去", () => {
  openKnown("时间");
  const unit = $("#editing-unit");
  unit.value = "min";
  unit.dispatchEvent(new window.Event("change", { bubbles: true }));
  const conversion = rows().find((item) => item.note === "单位换算");
  assert.ok(conversion, "换了单位却没有换算这一行");
  assert.equal(conversion.lhs, "t");
  assert.equal(conversion.rhs, "1.8 min = 108 s");
  assert.equal(row("t²").rhs, "11664 s²");
});

check("算不下去时错误停在出错那一行，后面的旧结果立刻消失", () => {
  const unit = $("#editing-unit");
  unit.value = "s";
  unit.dispatchEvent(new window.Event("change", { bubbles: true }));
  type("1e200");
  const chain = rows();
  const broken = chain.find((item) => item.broken);
  assert.ok(broken, "溢出没有被报告");
  assert.equal(broken.lhs, "t²");
  assert.match(broken.rhs, /数值溢出/);
  assert.equal(chain.indexOf(broken), chain.length - 1, "出错行后面还留着旧结果");
  assert.equal(guideSegments(), 1, "引导线没有在出错行断开");
});

check("从第一行原式直接替换示例：新的推导重新长出来", () => {
  type("2.4");
  closeEdit();
  editExpression("g*t^2");
  closeEdit();
  const chain = rows();
  assert.equal(chain[0].rhs, "g × t²");
  assert.deepEqual(chain.map((item) => item.note), ["原式", "代入", "平方", "乘上 g", "近似到 2 位小数"]);
  assert.equal(row("g × t²").rhs, "56.448 m");
  assert.equal(row("t²").rhs, "5.76 s²");
});

check("原式里出现新符号时，它以已知量的样子长在第一行等着被改", () => {
  editExpression("a*t");
  closeEdit();
  assert.match(spaced(".knowns"), /a = 1/);
  assert.match(spaced(".knowns"), /时间 t = 2\.4 s/);
  assert.equal(rows()[0].rhs, "a × t");
});

check("写坏了表达式，只在那一行说清楚，不弹面板也不汇总到页顶", () => {
  editExpression("a*");
  const broken = rows().find((item) => item.broken);
  assert.ok(broken, "语法错误没有被报告");
  assert.match(broken.rhs, /无法解析|这里不能使用/);
  assert.equal(doc.querySelectorAll("dialog, .modal").length, 0);
});

check("近似的小数位数也长在那一行，可以原位改", () => {
  editExpression("0.5*g*t^2");
  closeEdit();
  const note = all(".touch-note")[0];
  assert.ok(note, "近似那一行没有可改的位数");
  click(note);
  type("2");
  closeEdit();
  const approx = rows()[5];
  assert.equal(approx.note, "近似到 2 位小数");
  assert.match(approx.rhs, /^28\.22 m/);
  assert.match(approx.rhs, /误差 0\.004 m/);
});

function source(file) { return readFileSync(path.join(runtimeDir, file), "utf8"); }
function code(file) {
  return source(file)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

check("所有 src/href 都是存在的同目录相对文件", () => {
  for (const element of doc.querySelectorAll("[src], [href]")) {
    const attr = element.hasAttribute("src") ? "src" : "href";
    const value = element.getAttribute(attr);
    assert.ok(value && !value.startsWith("/") && !value.startsWith("//"), `不是相对路径：${value}`);
    assert.doesNotMatch(value, /^[a-z][a-z0-9+.-]*:/i, `出现协议：${value}`);
    const resolved = path.resolve(runtimeDir, value);
    assert.equal(path.dirname(resolved), runtimeDir, `不在同目录：${value}`);
    assert.ok(existsSync(resolved), `文件不存在：${value}`);
  }
});

check("不用 ES module，页面没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("运行时源码没有网络、存储或父窗口能力", () => {
  const forbidden = [
    "fetch(", "XMLHttpRequest", "WebSocket(", "EventSource(", "sendBeacon(", "importScripts(",
    "WebTransport(", "RTCPeerConnection(", "Worker(", "SharedWorker(", "serviceWorker.register(",
    "cookie", "localStorage", "sessionStorage", "indexedDB", "window.parent", "window.top", "document.domain"
  ];
  for (const file of ["index.html", "style.css", "engine.js", "ui.js"]) {
    for (const token of forbidden) assert.ok(!source(file).includes(token), `${file} 出现禁用串 ${token}`);
  }
});

check("界面装配不使用高风险 HTML 注入或自由代码执行", () => {
  for (const file of ["index.html", "engine.js", "ui.js"]) {
    const value = code(file);
    assert.doesNotMatch(value, /\.(inner|outer)HTML\s*\+?=/);
    assert.doesNotMatch(value, /document\s*\.\s*write/);
    assert.doesNotMatch(value, /new\s+Function\s*\(/);
    assert.doesNotMatch(value, /\bev\x61l\s*\(/);
  }
});

check("样式里没有写死的小字号", () => {
  assert.doesNotMatch(source("style.css"), /font-size:\s*(?:[0-9]|1[0-2])px/);
});

console.log("\n公式展开界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
