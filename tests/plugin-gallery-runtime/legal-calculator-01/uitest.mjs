/*
 * 法律计算器 · 界面自测（真的把 index.html 装起来、真的一步步填事实、真的读屏上的字）
 *
 *   node tests/plugin-gallery-runtime/legal-calculator-01/uitest.mjs
 *
 * engine 的自测只证明「算得对」，证明不了「打开它能用」。这份测的是
 * 首屏问哪句 → 选一件事 → 一步步填 → 链尾落下估算 的那条路，以及屏幕上到底留了什么。
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
  "../../../content/active-runtime/plugin/legal-calculator-01",
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
/** 只算真正看得见的字：隐掉的那几条链不算在屏上。 */
const screen = () => {
  const parts = [];
  for (const node of doc.querySelectorAll("body > main > *")) {
    if (node.hidden) continue;
    parts.push(node.textContent);
  }
  return parts.join(" ").replace(/\s+/g, " ");
};
const stateOf = (id) => doc.getElementById(id).getAttribute("data-state");

function type(id, value) {
  const input = doc.getElementById(id);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function pick(label) {
  const button = [...doc.querySelectorAll(".picks button")].find((b) => b.textContent.trim() === label);
  assert.ok(button, `找不到「${label}」`);
  button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function click(id) {
  doc.getElementById(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

console.log("法律计算器界面自测（jsdom，非浏览器）");

/* ---------- 首屏 ---------- */

check("引擎脚本被页面装上了", () => {
  assert.ok(window.LegalCalculatorEngine, "window.LegalCalculatorEngine 不存在，说明 <script src> 没跑起来");
});

check("首屏只问一句「你要估算哪件事」，三件事都写全名", () => {
  assert.equal(text(".ask-line"), "你要估算哪件事");
  assert.deepEqual(
    [...doc.querySelectorAll(".picks button")].map((b) => b.textContent.trim()),
    ["经济补偿估算", "加班工资估算", "案件受理费"],
  );
});

check("首屏没有法源清单、适用地区块、免责声明段、离线自述与自测按钮", () => {
  const words = [
    "法源", "生效日期", "适用地区", "免责声明", "离线", "不联网", "口径", "第 47", "第 87",
    "运行自测", "已知边界", "请以专业意见为准", "LPR", "违法解除"
  ];
  for (const word of words) {
    assert.equal(screen().includes(word), false, `首屏还写着「${word}」`);
  }
  assert.equal(doc.getElementById("run-test"), null);
  assert.equal(doc.querySelectorAll("h1, h2, h3").length, 0, "还有标题与副标题");
});

check("首屏其他事项完全离场，不在下方排队", () => {
  assert.equal($("#chain-labor").hidden, true);
  assert.equal($("#chain-overtime").hidden, true);
  assert.equal($("#chain-fee").hidden, true);
});

/* ---------- 工位上那三轮操作：填月工资 → 当地月平均工资 → 工龄 ---------- */

check("选「经济补偿估算」后，只剩这一条链，问句离场", () => {
  pick("经济补偿估算");
  assert.equal($("#ask").hidden, true);
  assert.equal($("#chain-labor").hidden, false);
  assert.equal($("#chain-overtime").hidden, true);
  assert.equal($("#chain-fee").hidden, true);
  assert.equal($("#again").hidden, false);
});

check("起点在等第一个事实，后面的节点隐在纸面里，不预先画满", () => {
  assert.equal(stateOf("labor-n1"), "waiting");
  assert.equal(stateOf("labor-n2"), "asleep");
  assert.equal(stateOf("labor-n6"), "asleep");
  assert.equal(text("#labor-amount"), "", "事实没齐就先给了金额");
});

check("填月工资后墨迹推进到当地月平均工资，事实留在链上", () => {
  type("labor-salary", "10000");
  assert.equal(stateOf("labor-n1"), "settled");
  assert.equal(stateOf("labor-n2"), "waiting");
  assert.equal(stateOf("labor-n3"), "asleep");
  assert.equal($("#labor-salary").value, "10000");
});

check("三个事实齐了：基数、补偿月数、经济补偿估算一起显影", () => {
  type("labor-local", "8000");
  type("labor-years", "1");
  type("labor-days", "1");
  assert.equal(stateOf("labor-n4"), "settled");
  assert.equal(text("#labor-base"), "10,000.00");
  assert.equal(text("#labor-months-value"), "1.5");
  assert.equal(text("#labor-amount"), "15,000.00");
});

check("单位就在数字旁边：元/月、年月天、元", () => {
  const chain = $("#chain-labor").textContent.replace(/\s+/g, " ");
  assert.match(chain, /元\/月/);
  assert.match(chain, /年/);
  assert.match(chain, /个月/);
  assert.ok(chain.includes("元"));
});

check("链尾只有「经济补偿估算」一个数，没有第二个金额冒充违法解除赔偿", () => {
  const values = [...doc.querySelectorAll("#chain-labor .value")].map((v) => v.textContent.trim()).filter(Boolean);
  assert.deepEqual(values, ["10,000.00", "1.5", "15,000.00"]);
  assert.equal($("#chain-labor").textContent.includes("30,000"), false);
});

check("余段不满 6 个月这道门槛写成能复述的话", () => {
  assert.equal($("#labor-months-mark").hidden, false);
  assert.match(text("#labor-months-mark"), /余段不满 6 个月，这一段计 0\.5 个月。/);
});

check("触发三倍封顶时，两道门槛都写出来，金额同步改", () => {
  type("labor-salary", "40000");
  type("labor-local", "10000");
  type("labor-years", "20");
  type("labor-days", "0");
  assert.equal(text("#labor-base"), "30,000.00");
  assert.equal(text("#labor-months-value"), "12");
  assert.equal(text("#labor-amount"), "360,000.00");
  assert.match(text("#labor-cap-mark"), /月工资高于当地月平均工资的 3 倍，基数改按这 3 倍计。/);
  assert.match(text("#labor-months-mark"), /把补偿月数压到 12 个月：按工龄本应 20 个月/);
});

check("恰为 3 倍时不触发封顶，印记也随之收回", () => {
  type("labor-salary", "30000");
  assert.equal($("#labor-cap-mark").hidden, true);
  assert.equal(text("#labor-amount"), "600,000.00");
});

check("工龄填出范围时就地说清要填什么，链尾不给数", () => {
  type("labor-months", "13");
  assert.match(text("#labor-service-note"), /余下月数 0–11，余下天数 0–30/);
  assert.equal(text("#labor-amount"), "");
  assert.equal(stateOf("labor-n6"), "asleep");
  type("labor-months", "");
  assert.equal(text("#labor-amount"), "600,000.00");
});

check("结论下面只有一行淡字，把口径的年份和「不构成法律意见」一起说了", () => {
  const edge = text("#chain-labor .edge");
  assert.match(edge, /2013 年修订的《劳动合同法》公开口径/);
  assert.match(edge, /不构成法律意见/);
  assert.match(edge, /结果会变/);
  assert.equal(doc.querySelectorAll("#chain-labor .edge").length, 1, "淡字不止一行");
});

/* ---------- 换一件事：加班工资 ---------- */

check("换一件事回到问句，链整条离场", () => {
  click("again");
  assert.equal($("#ask").hidden, false);
  assert.equal($("#chain-labor").hidden, true);
  assert.equal($("#again").hidden, true);
});

check("加班工资：填月工资就给小时工资，三类倍数各自贴着自己的小时", () => {
  pick("加班工资估算");
  type("overtime-salary", "21750");
  assert.equal(text("#overtime-hourly"), "125.00");
  assert.equal($("#overtime-weekday-mult").hidden, true, "还没填小时就先摆倍数");
  type("overtime-weekday", "1");
  type("overtime-rest", "1");
  type("overtime-holiday", "1");
  assert.equal(text("#overtime-weekday-mult"), "× 1.5");
  assert.equal(text("#overtime-rest-mult"), "× 2");
  assert.equal(text("#overtime-holiday-mult"), "× 3");
  assert.equal(text("#overtime-amount"), "812.50");
});

check("加班工资屏上没有各类金额摊成的明细", () => {
  const chain = $("#chain-overtime").textContent;
  assert.equal(chain.includes("187.50"), false);
  assert.equal(chain.includes("250.00"), false);
  assert.equal(chain.includes("375.00"), false);
});

/* ---------- 换一件事：案件受理费 ---------- */

check("案件受理费：标尺上能看见标的额穿过了哪些段，落在哪一段", () => {
  click("again");
  pick("案件受理费");
  assert.equal(stateOf("fee-n2"), "asleep");
  type("fee-claim", "300000");
  assert.equal(text("#fee-amount"), "5,800.00");
  assert.equal(doc.querySelectorAll("#fee-ruler .seg").length, 10);
  const width = Number(String($("#fee-ruler-ink").style.width).replace("%", ""));
  assert.ok(width > 33 && width < 34, `墨水填到了 ${width}%`);
  assert.match(text("#fee-band-mark"), /标的额落在 20 万–50 万 这一段，这一段按 1\.5% 计/);
  assert.match(text("#fee-band-mark"), /不是拿这一档乘全部标的额/);
});

check("标尺上的段界写着用户认得的数，不是色块或序号", () => {
  const marks = [...doc.querySelectorAll("#fee-ruler .seg span")].map((s) => s.textContent.trim());
  assert.deepEqual(marks.slice(0, 4), ["1 万", "10 万", "20 万", "50 万"]);
  assert.equal(marks[9], "2000 万以上");
});

check("受理费屏上没有逐段金额列表", () => {
  assert.equal(doc.querySelectorAll("#chain-fee ol.breakdown, #chain-fee ul").length, 0);
  const chain = $("#chain-fee").textContent;
  assert.equal(chain.includes("2,250.00"), false, "还在列每一段的金额");
  assert.equal(chain.includes("明细"), false);
});

check("金额不折行、也不被拆开显示", () => {
  type("fee-claim", "33000000");
  assert.equal(text("#fee-amount"), "206,800.00");
  assert.equal(text("#fee-amount").includes("\n"), false);
});

/* ---------- 屏幕上不许再有的东西 ---------- */

check("没有写死的小字号", () => {
  const css = readFileSync(path.join(runtimeDir, "style.css"), "utf8");
  assert.doesNotMatch(css, /font-size:\s*(?:9|10|11)(?:\.\d+)?px/);
});

check("整份页面里再没有民间借贷与违法解除赔偿这两项", () => {
  const html = readFileSync(htmlPath, "utf8");
  assert.equal(/LPR|民间借贷|违法解除/.test(html), false);
  const ui = readFileSync(path.join(runtimeDir, "ui.js"), "utf8");
  assert.equal(/LPR|lendingRateCap|illegalTermination/.test(ui), false);
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

console.log("\n法律计算器界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
