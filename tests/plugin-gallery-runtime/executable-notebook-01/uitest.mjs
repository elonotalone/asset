import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/executable-notebook-01");
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
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();
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
function fire(node, type) {
  node.dispatchEvent(new window.Event(type, { bubbles: true }));
}
function click(node) {
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function write(name, body) {
  $("#new-name").value = name;
  $("#new-body").value = body;
  $("#tail").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}
function rows() {
  return all("#doc .row");
}
function rowNamed(label) {
  return rows().find((row) => textFrom(row.querySelector(".who")).includes(label));
}
function answerOf(label) {
  const row = rowNamed(label);
  const knob = row.querySelector(".knob");
  return knob ? knob.value : textFrom(row.querySelector(".printed"));
}
function unitOf(label) {
  return rowNamed(label).querySelector(".unit").value;
}
function tune(label, value) {
  const knob = rowNamed(label).querySelector(".knob");
  knob.value = value;
  fire(knob, "change");
}

console.log("可执行笔记界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.ExecutableNotebookEngine);
});

check("首屏是一张真正的空稿纸，不给出厂示例笔记", () => {
  assert.equal(rows().length, 0);
  assert.equal(text("#headline"), "先写下一个你会反复改的量");
  assert.equal($("#new-name").value, "");
  assert.equal($("#new-body").value, "");
  // 提示词自己就把写法说完了：全名 + 短名字，值 + 单位
  assert.match($("#new-name").getAttribute("placeholder"), /^\S+\s+[A-Za-z_]\w*$/);
  assert.match($("#new-body").getAttribute("placeholder"), /^\d/);
  assert.doesNotMatch(screen(), /换办公室|620/);
});

check("屏幕上没有眉标、政策自述、编号眉标、计数徽章、语法说明与运行自测", () => {
  assert.equal($("#run-test"), null);
  assert.equal(doc.querySelectorAll("h1, h2").length, 0);
  for (const banned of [
    "EXECUTABLE LEDGER", "把口径、计算与边界写在一起", "封闭数学表达式", "不执行自由代码",
    "PARAMETERS", "NOTEBOOK", "个参数", "个格子", "条依赖", "运行自测", "复核表达式",
    "本次重算", "重算完成", "笔记已同步", "表达式支持四则", "留空也不会读取系统时间",
    "说明文字解释口径", "无依赖", "引用 ",
  ]) {
    assert.doesNotMatch(screen(), new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), banned);
  }
});

check("写办公面积 → 写单位租金 → 写引用两者的式子，三次录入就有第一个答数", () => {
  write("办公面积 area", "620 m²");
  assert.equal(rows().length, 1);
  assert.equal(answerOf("办公面积"), "620", "第一行就有回报：右边立刻出现它自己的值");
  assert.equal(unitOf("办公面积"), "m²", "单位跟着数字一起落到它旁边");

  write("租金 rent", "32 元/m²/月");
  assert.equal(answerOf("租金"), "32");
  assert.equal(unitOf("租金"), "元/m²/月");

  write("月租 monthly", "area*rent");
  assert.equal(answerOf("月租"), "19840");
  assert.equal(rows().length, 3);
});

check("量的完整名字与短变量名同时在，没有只剩 A1 或行号", () => {
  const who = textFrom(rowNamed("办公面积").querySelector(".who"));
  assert.match(who, /办公面积/);
  assert.match(who, /area/);
  assert.doesNotMatch(screen(), /\bA1\b/);
});

check("式子原文与它引用的量名都留在同一行，右边是机器的答数", () => {
  const row = rowNamed("月租");
  assert.equal(row.querySelector(".hand.body").value, "area*rent");
  assert.equal(textFrom(row.querySelector(".printed")), "19840");
});

check("每一行上没有常驻的类型徽章和「引用 …」小标签", () => {
  assert.equal(doc.querySelectorAll(".cell-type, .cell-deps").length, 0);
  assert.doesNotMatch(screen(), /表达式|说明文字|断言/);
});

check("把人数从 20 改成 30，只有被它影响的行跟着变，别的行纹丝不动", () => {
  write("人数 heads", "20");
  write("工位成本 desks", "heads*4200");
  write("年租 annual", "monthly*12");
  write("三年总成本 total", "annual*3+desks");
  assert.equal(answerOf("三年总成本"), "798240");

  tune("人数", "30");
  assert.equal(answerOf("工位成本"), "126000", "被影响的行跟着变了");
  assert.equal(answerOf("三年总成本"), "840240");
  assert.equal(answerOf("月租"), "19840", "没被影响的行纹丝不动");
  assert.equal(answerOf("年租"), "238080");
});

check("拧一个量之后，被影响的那几行按上游到下游的次序依次亮一下，亮过退回原样", () => {
  const queue = [];
  const realTimeout = window.setTimeout;
  // 定时器交给测试逐个跑掉，就能看清点亮的次序
  window.setTimeout = (fn) => { queue.push(fn); return 0; };
  tune("人数", "40");
  const lit = [];
  let guard = 0;
  while (queue.length && guard++ < 200) {
    queue.shift()();
    for (const row of rows()) {
      if (!row.className.includes("lit")) continue;
      const name = textFrom(row.querySelector(".who"));
      if (!lit.includes(name)) lit.push(name);
    }
  }
  window.setTimeout = realTimeout;

  assert.deepEqual(
    lit.map((name) => name.replace(/[A-Za-z_]\w*$/, "").trim()),
    ["工位成本", "三年总成本"],
    "亮起来的就是真正重算过的那两行，上游先亮",
  );
  assert.equal(all("#doc .row.lit").length, 0, "亮过之后纸面回到原样，不留高亮");
  assert.equal(answerOf("工位成本"), "168000");
  assert.equal(answerOf("三年总成本"), "882240");
});

check("钉住哪一格，头号结论就是它的全名、完整金额与单位", () => {
  rowNamed("三年总成本").querySelector(".unit").value = "元";
  fire(rowNamed("三年总成本").querySelector(".unit"), "change");
  click(rowNamed("三年总成本").querySelector(".pin"));
  const head = text("#headline");
  assert.match(head, /三年总成本/);
  assert.match(head, /882240/);
  assert.match(head, /元/);
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.match(css, /\.big[^-][^}]*white-space:\s*nowrap/s, "金额不许在千位处折行");
});

check("断言未通过是那声提醒，不做成和语法错一样的红", () => {
  write("预算 budget", "800000");
  write("不超预算 withinBudget", "total<=budget");
  assert.equal(answerOf("不超预算"), "未通过");
  const printed = rowNamed("不超预算").querySelector(".printed");
  assert.ok(printed.className.includes("over"));
  assert.ok(!rowNamed("不超预算").className.includes("wrong"));
  assert.match(text("#headline"), /不超预算 越界了/);
  tune("人数", "10");
  assert.equal(answerOf("不超预算"), "通过");
  assert.doesNotMatch(text("#headline"), /越界/);
});

check("说明文字就是文稿里的一行，右边没有答数位", () => {
  write("", "金额单位为元，租期按整月计算");
  const note = rows().find((row) => row.className.includes("note"));
  assert.ok(note);
  assert.equal(note.querySelector(".hand.note").value, "金额单位为元，租期按整月计算");
  assert.equal(note.querySelector(".printed"), null);
});

check("未定义引用点名：哪一格用了哪个不存在的名字，其余行照旧显示上一次的值", () => {
  write("搬迁 moving", "movingCost+1");
  assert.match(text("#doc .said"), /moving/);
  assert.match(text("#doc .said"), /movingCost/);
  assert.ok(rowNamed("搬迁").className.includes("wrong"));
  assert.equal(answerOf("月租"), "19840", "别的行不整片变灰");
  const box = rowNamed("搬迁").querySelector(".hand.body");
  box.value = "";
  fire(box, "change");
  assert.equal($("#doc .said"), null);
});

check("循环引用把整条环写出来，不静默排一个假顺序", () => {
  write("甲 alpha", "beta+1");
  assert.match(text("#doc .said"), /alpha/);
  const box = rowNamed("甲").querySelector(".hand.body");
  box.value = "alpha+1";
  fire(box, "change");
  assert.match(text("#doc .said"), /循环引用/);
  assert.match(text("#doc .said"), /alpha → alpha|alpha → beta → alpha/);
  box.value = "";
  fire(box, "change");
});

check("语法错就地长在那一行上，点名是哪一格", () => {
  write("错的 wrongOne", "area*#");
  assert.match(text("#doc .said"), /wrongOne/);
  assert.ok(rowNamed("错的").className.includes("wrong"));
  const box = rowNamed("错的").querySelector(".hand.body");
  box.value = "";
  fire(box, "change");
  assert.equal($("#doc .said"), null);
});

check("同一列的数字右对齐，小数点对到一条竖线上", () => {
  write("折扣 discount", "0.85");
  write("折后年租 annualNet", "annual*discount");
  assert.equal(answerOf("折后年租"), "202368");
  const knob = rowNamed("折扣").querySelector(".knob");
  assert.equal(knob.style.paddingRight, "0ch");
  assert.equal(rowNamed("月租").querySelector(".printed").style.paddingRight, "3ch");
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.match(css, /\.printed,\s*\.knob\s*\{[^}]*text-align:\s*right/s);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});

check("人写的与机器算的靠质地分开，不靠框线，也不只靠色相", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.match(css, /\.hand\s*\{[^}]*border:\s*0/s);
  assert.match(css, /\.printed,\s*\.knob\s*\{[^}]*font-family:\s*var\(--mono\)/s);
  assert.doesNotMatch(css, /box-shadow:\s*0\s+\d+px\s+\d+px/, "不要卡片阴影");
  assert.doesNotMatch(css, /border-radius:\s*[1-9]/, "不要把每一行套成一张圆角白卡");
});

check("没写死 9px／10px 这类小字", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(css, /字号不得小于|不小于\s*\d+\s*px/);
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

check("源码没有网络、存储、父窗口 API，也没有自由代码执行入口", () => {
  const source = ["index.html", "engine.js", "ui.js", "style.css"].map(code).join("\n");
  const forbidden = [
    /fetch\s*\(/, /XMLHttpRequest/, /WebSocket\s*\(/, /EventSource\s*\(/, /sendBeacon\s*\(/,
    /importScripts\s*\(/, /WebTransport\s*\(/, /RTCPeerConnection\s*\(/,
    /(?:^|[^\w])Worker\s*\(/, /SharedWorker\s*\(/, /serviceWorker\s*\.\s*register\s*\(/,
    /localStorage/, /sessionStorage/, /indexedDB/, /document\s*\.\s*cookie/,
    /window\s*\.\s*(?:parent|top)\b/, /document\s*\.\s*domain/,
    /(?:^|[^\w.])eval\s*\(/, /new\s+Function\s*\(/, /new\s+Date/, /Date\.now/, /Math\.random/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern);
});

console.log("\n可执行笔记界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
