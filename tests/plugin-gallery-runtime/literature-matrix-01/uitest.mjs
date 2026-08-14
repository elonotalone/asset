import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/literature-matrix-01");
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
function headings() {
  return all("#head th").map((th) => {
    const box = th.querySelector("input");
    return box ? box.value : textFrom(th);
  });
}
function rows() {
  return all("#body tr:not(.bare)");
}
function cellsOf(tr) {
  return [...tr.children].map((td) => {
    const box = td.querySelector(".cell");
    if (!box) return "";
    if (box.tagName === "SELECT") return textFrom(box.options[box.selectedIndex]);
    return box.value;
  });
}
// 状态紧跟在钉住的第一列后面，所以第 i 个抽取字段的 DOM 列号是 i === 0 ? 0 : i + 1
function col(fieldIndex) {
  return fieldIndex === 0 ? 0 : fieldIndex + 1;
}
function paste(lines) {
  $("#paste").value = lines.join("\n");
  $("#paste-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

console.log("文献矩阵界面自测（jsdom，非浏览器）");

check("经典脚本已把同一份内核装到页面", () => {
  assert.ok(window.LiteratureMatrixEngine);
});

check("首屏是一张只有表头的空表，头号数字是 0，没有预置示例论文", () => {
  assert.equal(rows().length, 0);
  assert.equal(text("#tally"), "0");
  assert.equal($("#paste").value, "");
  assert.equal(text("#body"), "把题录整批粘进来");
  assert.doesNotMatch(screen(), /Chen 2024/);
});

check("空表的表头就在回答「这张表能帮我比什么」：11 个字段全在", () => {
  const head = headings();
  for (const field of window.LiteratureMatrixEngine.DEFAULT_FIELDS) {
    assert.ok(head.includes(field), `缺字段 ${field}`);
  }
  assert.ok(head.includes("状态"));
});

check("偏倚四个方面是列名，不是侧栏里另讲一遍的清单", () => {
  const bias = all("#head th.bias").map(textFrom);
  assert.deepEqual(bias, ["选择与分组", "测量与结局评估", "缺失数据", "报告与利益冲突"]);
});

check("屏幕上没有标题、副标题、状态图例、七格统计卡、五条关系式与自测按钮", () => {
  assert.equal($("#run-test"), null);
  assert.equal($("#legend"), null);
  assert.equal($("#metrics"), null);
  assert.equal($("#relations"), null);
  assert.equal(doc.querySelectorAll("h1, h2").length, 0);
  const body = screen();
  for (const banned of [
    "运行自测", "状态图例", "从识别到最终纳入", "已识别", "已筛", "待取全文", "已评估",
    "已筛 = 已识别", "颜色 + 形状", "不预置任何示例论文", "用中文逗号分隔", "每行用制表符",
  ]) {
    assert.doesNotMatch(body, new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), banned);
  }
});

check("没写死 9px／10px 这类小字，也没反过来写「字号不得小于」这种硬限制", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(css, /字号不得小于|不小于\s*\d+\s*px/);
});

const batch = [
  "作者年份\t研究设计\t研究对象\t样本量\t状态",
  "Chen 2024\t随机对照试验\t社区老年人\t286\t纳入",
  "Martínez 2022\t前瞻性队列研究\t城市成年人\t612\t纳入",
  "Okafor 2021\t横断面研究\t基层医护人员\t438.5\t纳入",
  "Singh 2020\t随机对照试验\t住院患者\t174\t重复",
  "Kim 2019\t病例对照研究\t青少年\t205\t题录排除",
  "Brown 2017\t混合方法研究\t照护者\t96\t未取到",
  "Wang 2016\t准实验研究\t大学生\t352\t全文排除",
];

check("整批粘贴 → 导入两步，表体一次性填满，头号数字从 0 变成最终纳入 3", () => {
  paste(batch);
  assert.equal(rows().length, 7);
  assert.equal(text("#tally"), "3");
  assert.equal($("#paste").value, "", "导入后输入框清空，回执是表本身填满，不是一句「已导入 N 条」");
});

check("用户提供的作者年份原样读得到，没被行号或「研究 17」取代", () => {
  const first = cellsOf(rows()[0]);
  assert.equal(first[col(0)], "Chen 2024");
  assert.equal(first[col(1)], "随机对照试验");
  assert.equal(first[col(2)], "社区老年人");
  assert.equal(first[col(3)], "286");
  assert.equal(cellsOf(rows()[1])[col(0)], "Martínez 2022");
});

check("状态紧跟在钉住的那一列后面，不用横滚就看得见哪几行进了", () => {
  const head = headings();
  assert.equal(head[0], "作者年份");
  assert.equal(head[1], "状态");
  assert.ok(rows()[0].children[1].className.includes("status"));
});

check("状态在格子里有形状也有名字，颜色之外还有第二重编码", () => {
  const marks = rows().map((tr) => tr.querySelector("td.status select"));
  assert.equal(marks.length, 7);
  assert.equal(textFrom(marks[0].options[marks[0].selectedIndex]), "● 纳入");
  assert.equal(textFrom(marks[3].options[marks[3].selectedIndex]), "× 排除·重复");
  assert.equal(marks[0].className.includes("be-included"), true);
  assert.equal(marks[3].className.includes("be-excluded"), true);
  const shapes = [...marks[0].options].map((option) => textFrom(option).charAt(0));
  assert.deepEqual(shapes, ["●", "×", "×", "×", "×", "◆"]);
});

check("偏倚未填一律「待观察」，落在单元格里当普通内容", () => {
  const cells = all("#body tr:not(.bare) td.bias .cell").map((box) => box.value);
  assert.equal(cells.length, 7 * 4);
  assert.ok(cells.every((value) => value === "待观察"));
});

check("补抽取内容就在这一行直接填，不另存一次详情", () => {
  const tr = rows()[0];
  const conclusion = tr.children[col(10)].querySelector(".cell");
  conclusion.value = "社区随访 24 个月后跌倒发生率下降，绝对差 6.1 个百分点";
  fire(conclusion, "input");
  assert.equal(cellsOf(rows()[0])[col(10)], "社区随访 24 个月后跌倒发生率下降，绝对差 6.1 个百分点");
  const bias = tr.querySelector("td.bias .cell");
  bias.value = "低风险";
  fire(bias, "input");
  assert.equal(tr.querySelector("td.bias .cell").value, "低风险");
});

check("状态就在这一行改，头号数字当场跟着动", () => {
  const mark = rows()[4].querySelector("td.status select");
  mark.value = "included";
  fire(mark, "change");
  assert.equal(text("#tally"), "4");
  mark.value = "citation-excluded";
  fire(mark, "change");
  assert.equal(text("#tally"), "3");
});

check("空格子是一枚统一的短横，不混用「无」「N/A」和真空白", () => {
  const holes = all("#body tr:not(.bare) .cell.hole");
  assert.ok(holes.length > 0);
  assert.ok(holes.every((box) => box.getAttribute("placeholder") === "—"));
  assert.doesNotMatch(screen(), /N\/A|未提取/);
});

check("数字列右对齐并按最长小数位补齐，小数点落在同一条竖线上", () => {
  const column = rows().map((tr) => tr.children[col(3)].querySelector(".cell"));
  assert.equal(column[0].value, "286");
  assert.equal(column[2].value, "438.5");
  assert.equal(column[0].style.paddingRight, "2ch", "整数要让出小数位的宽度");
  assert.equal(column[2].style.paddingRight, "0ch");
  assert.ok(all("#head th")[col(3)].className.includes("num"));
});

check("第一列与表头钉住，横向滚动后还知道在看哪一篇", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.match(css, /td\.name\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/);
  assert.match(css, /th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/);
  assert.ok(all("#body tr:not(.bare)")[0].children[0].className.includes("name"));
});

check("没有斑马纹；行的定位交给跟着光标走的那条尺子", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /nth-child\(\s*(?:even|odd|2n)/);
  assert.match(css, /tbody\s+tr:hover\s+td/);
});

check("列宽按内容定，不平均分", () => {
  const widths = all("#head th").slice(0, 11).map((th) => th.style.minWidth);
  assert.equal(new Set(widths).size > 5, true, `列宽全一样：${widths.join(",")}`);
});

check("列名改写立刻改表头，清空列名就删掉这一列", () => {
  const head = all("#head th input")[9];
  head.value = "国家";
  fire(head, "change");
  assert.ok(headings().includes("国家"));
  assert.ok(!headings().includes("地区"));
  const drop = all("#head th input")[9];
  drop.value = "";
  fire(drop, "change");
  assert.ok(!headings().includes("国家"));
  const add = $("#head th.add input");
  add.value = "地区";
  fire(add, "change");
  assert.ok(headings().includes("地区"));
});

check("认不出的状态不被丢弃也不猜成纳入：落到待定，并在头号数字旁边点名", () => {
  paste(["Rossi 2018\t队列研究\t退休人群\t721\t排除"]);
  assert.equal(rows().length, 8);
  assert.equal($("#unknown").hidden, false);
  assert.match(text("#unknown"), /1 条状态没认出来，按待定算/);
  const added = rows()[7];
  assert.equal(cellsOf(added)[0], "Rossi 2018");
  const mark = added.querySelector("td.status select");
  assert.equal(textFrom(mark.options[mark.selectedIndex]), "◆ 待定");
});

check("点那一声就把相关文献行筛出来，再点回到整张表", () => {
  $("#unknown").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(rows().length, 1);
  assert.equal(cellsOf(rows()[0])[0], "Rossi 2018");
  $("#unknown").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(rows().length, 8);
});

check("把认不出的那一条就地改成排除，那一声自己消失", () => {
  const mark = rows()[7].querySelector("td.status select");
  mark.value = "fulltext-excluded";
  fire(mark, "change");
  assert.equal($("#unknown").hidden, true);
});

check("粘进来几行、只读出几条，落空的行报出行号", () => {
  paste(["Ahmed 2015\t队列研究\t门诊患者\t410\t纳入", "Duarte 2014"]);
  assert.equal($("#unread").hidden, false);
  assert.match(text("#unread"), /粘进来 2 行，只读出 1 条/);
  assert.match(text("#unread"), /第 2 行没有末尾状态/);
  assert.equal(rows().length, 9);
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

console.log("\n文献矩阵界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
