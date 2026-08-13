/*
 * 检索式构造 · 界面自测（真的装起来、真的一步步答、真的读产物框里的字）
 *
 *   node public/works/plugin/search-query-builder-01/uitest.mjs
 *
 * jsdom，不是浏览器。不启动浏览器、不截图、不连网。
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
const query = () => text("#query");

function clickText(label) {
  const b = [...doc.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
  assert.ok(b, `找不到按钮「${label}」`);
  b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function typeInto(node, value) {
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function enterInto(node, value) {
  typeInto(node, value);
  node.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}
/** 当前这一屏的输入框（向导一屏一问，所以取 stage 里的第一个）。 */
const stageInputs = () => [...doc.querySelectorAll("#stage input[type=text]")];

console.log("检索式构造界面自测（jsdom，非浏览器）");

check("引擎脚本被页面装上了", () => {
  assert.ok(window.QueryBuilderEngine, "window.QueryBuilderEngine 不存在");
});

/* ---------- 首屏：一屏一问 ---------- */

check("首屏只有一个问句，且是整屏唯一的大字", () => {
  assert.equal(text("#q"), "一句话说清你要查什么。");
  assert.equal(doc.querySelectorAll(".q").length, 1);
  assert.equal(stageInputs().length, 1, "首屏不该并列多个输入");
});

check("首屏不预填任何概念块（规格：首次打开不预置内容）", () => {
  assert.equal(doc.querySelectorAll(".block .term").length, 0);
  assert.equal(text("#done"), "");
});

check("产物预览从第一步就在，只是还没有内容", () => {
  assert.ok($("#query"), "产物框不存在");
  assert.match(query(), /先写一句你要查什么/);
});

check("空白时不弹告警、不出数量警告（规格：空白不是错误）", () => {
  assert.doesNotMatch(screen(), /错误|警告|请先|必须填/);
});

/* ---------- 真的一步步答 ---------- */

check("第 1 步写下问题 → 摘要里出现它", () => {
  typeInto(stageInputs()[0], "运动能不能降低老年人跌倒？");
  clickText("下一步：拆概念块");
  const row = $(".done-row");
  assert.ok(row, "已答摘要没有出现");
  assert.equal(row.querySelector(".k").textContent.trim(), "要查什么");
  assert.equal(row.querySelector(".v").textContent.trim(), "运动能不能降低老年人跌倒？");
  assert.equal(text("#q"), "这个问题里有哪几个概念？");
});

check("加第一个概念块 + 第一个词 → 产物立刻长出最小查询串", () => {
  enterInto(stageInputs()[0], "人群");
  const termInput = stageInputs().find((i) => /再加一个说法/.test(i.placeholder));
  assert.ok(termInput, "概念块里没有加词的输入框");
  enterInto(termInput, "aged");
  assert.equal(query(), "(aged[Title/Abstract])");
});

check("同一块里加第二个词 → 块内用 OR", () => {
  const termInput = stageInputs().find((i) => /再加一个说法/.test(i.placeholder));
  enterInto(termInput, "elderly");
  assert.equal(query(), "(aged[Title/Abstract] OR elderly[Title/Abstract])");
});

check("词组自动加引号", () => {
  const termInput = stageInputs().find((i) => /再加一个说法/.test(i.placeholder));
  enterInto(termInput, "older adults");
  assert.match(query(), /"older adults"\[Title\/Abstract\]/);
});

check("加第二个概念块 → 块间用 AND，两块各自带括号", () => {
  const nb = stageInputs().find((i) => /再加一个概念块/.test(i.placeholder));
  enterInto(nb, "干预");
  const inputs = stageInputs().filter((i) => /再加一个说法/.test(i.placeholder));
  enterInto(inputs[inputs.length - 1], "exercise");
  assert.equal(
    query(),
    '(aged[Title/Abstract] OR elderly[Title/Abstract] OR "older adults"[Title/Abstract])'
    + " AND (exercise[Title/Abstract])"
  );
});

check("改一个词的字段为主题词 → 查询串跟着换标签", () => {
  const sel = doc.querySelector(".block .term select");
  sel.value = "mesh";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(query(), /aged\[MeSH Terms\]/);
  sel.value = "tiab";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(query(), /aged\[Title\/Abstract\]/);
});

/* ---------- 换方言：同一份结构重编译 ---------- */

check("走到第 3 步，切到 arXiv → 前缀语法，且屏上写明降级/去截词说明", () => {
  clickText("下一步：选数据库");
  assert.equal(text("#q"), "拿去哪个库检索？");
  clickText("arXiv");
  assert.match(query(), /abs:aged/);
  assert.doesNotMatch(query(), /\[Title\/Abstract\]/);
});

check("切到通用布尔 → 字段被丢掉，并说明丢了", () => {
  clickText("通用布尔");
  assert.doesNotMatch(query(), /abs:|\[/);
  assert.match(text("#notes"), /不带字段限定/);
});

check("切回 PubMed，产物与 arXiv 那一版不同", () => {
  clickText("arXiv");
  const arx = query();
  clickText("PubMed");
  assert.notEqual(query(), arx);
  assert.match(query(), /\[Title\/Abstract\]/);
});

/* ---------- 点回去改 ---------- */

check("点已答摘要能回到那一步改", () => {
  const row = doc.querySelector(".done-row");
  row.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(text("#q"), "一句话说清你要查什么。");
});

/* ---------- 示例：一键装一个真问题 ---------- */

check("载入示例 → 一条完整可用的 PubMed 查询串出现在产物框里", () => {
  clickText("载入一个示例问题");
  assert.equal(
    query(),
    '(aged[Title/Abstract] OR elderly[Title/Abstract] OR "older adults"[Title/Abstract])'
    + ' AND (exercise[Title/Abstract] OR "physical activity"[Title/Abstract])'
    + ' AND ("accidental falls"[MeSH Terms] OR fall*[Title/Abstract])'
  );
});

check("产物里的括号与 AND/OR 被标成「工具加的结构符号」", () => {
  const marked = [...doc.querySelectorAll("#query .s")].map((n) => n.textContent);
  assert.ok(marked.includes("("), "括号没被标出来");
  assert.ok(marked.includes("AND"), "AND 没被标出来");
  assert.ok(marked.includes("OR"), "OR 没被标出来");
});

check("产物是可选中的真文本，复制不是唯一出路", () => {
  const box = $("#query");
  assert.ok(box.textContent.length > 40);
  assert.equal($("#copy-area").value, box.textContent);
  assert.match(text(".copy-row"), /可以直接选中复制/);
});

check("删掉一整块 → 查询串跟着少一块，括号仍配平", () => {
  // 载入示例后向导已经停在第 2 步，块就摆在屏上，不必再点「下一步」
  assert.equal(text("#q"), "这个问题里有哪几个概念？");
  const before = (query().match(/\(/g) || []).length;
  assert.equal(before, 3, "示例应当有 3 块");
  clickText("删掉这块");
  const q = query();
  assert.equal((q.match(/\(/g) || []).length, before - 1);
  assert.equal((q.match(/\(/g) || []).length, (q.match(/\)/g) || []).length);
});

/* ---------- 页面自测按钮 ---------- */

check("点「运行自测」→ 屏上出现 18 / 18 通过", () => {
  $("#run-test").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const out = text("#test-out");
  assert.match(out, /^(\d+) \/ \1 通过$/, `自测输出是「${out}」`);
  assert.match(out, /^18 \/ 18 通过$/);
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

check("剪贴板不可用也不影响使用（execCommand 包在 try 里，失败给退路）", () => {
  const src = code("ui.js");
  assert.match(src, /try\s*\{[\s\S]*execCommand[\s\S]*\}\s*catch/, "复制没有包在 try/catch 里");
  assert.match(src, /自己复制/, "复制失败时没有给手动退路的提示");
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

console.log("\n检索式构造界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
