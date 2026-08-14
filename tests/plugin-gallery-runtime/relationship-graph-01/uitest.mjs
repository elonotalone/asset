/*
 * 关系图 · 界面自测（jsdom，非浏览器）
 *
 *   node tests/plugin-gallery-runtime/relationship-graph-01/uitest.mjs
 *
 * 这一版检查的是记者真会做的两件事：把材料里已经写明的关系一条条写进去，
 * 然后点两个人问「他们通过谁连上」。旧界面的统计卡、图例、样例、自测按钮
 * 都已删除（设计文档 §3），对应的断言换成对当下界面的断言。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/relationship-graph-01",
);
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
  throw new Error("找不到 jsdom：关系图界面自测无法运行");
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
  else dom.window.addEventListener("load", resolve, { once: true });
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const all = (selector) => [...doc.querySelectorAll(selector)];
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
const screen = () => doc.body.textContent.replace(/\s+/g, " ").trim();

/* jsdom 不排版，给观察台一个真实尺寸，让布局与避让走完整条路。 */
const VIEW_W = 1200;
const VIEW_H = 750;
$("#table").getBoundingClientRect = () => ({
  x: 0, y: 0, left: 0, top: 0, right: VIEW_W, bottom: VIEW_H, width: VIEW_W, height: VIEW_H,
});
window.dispatchEvent(new window.Event("resize"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed += 1;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

function type(selector, value) {
  const node = $(selector);
  node.value = value;
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function submit() {
  $("#entry").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}
function write(from, relation, to, date = "") {
  type("#from", from);
  type("#relation", relation);
  type("#to", to);
  type("#date", date);
  submit();
}
function click(target) {
  target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function press(key) {
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
}
function names() {
  return all("#node-layer .object-name").map((node) => node.textContent);
}
function tileOf(name) {
  return all("#node-layer .object-group").filter((group) => group.getAttribute("aria-label") === name)[0];
}
function centreOf(name) {
  const rect = tileOf(name).querySelector("rect");
  return {
    x: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) / 2,
    y: Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")) / 2,
    w: Number(rect.getAttribute("width")),
    h: Number(rect.getAttribute("height")),
  };
}

console.log("关系图界面自测（jsdom，非浏览器）");

check("引擎脚本被页面真实装载", () => {
  assert.ok(window.RelationshipGraphEngine);
});

check("首屏是空的关系网：没有样例、没有结论", () => {
  assert.equal(all("#node-layer .object-group").length, 0);
  assert.equal(all("#edge-layer path").length, 0);
  assert.equal(text("#conclusion"), "");
  assert.doesNotMatch(screen(), /阿波罗|尼克松|阿姆斯特朗/);
});

check("首屏那句话就是要填的那句话：谁、什么关系、和谁", () => {
  assert.equal($("#from").getAttribute("placeholder"), "谁");
  assert.equal($("#relation").getAttribute("placeholder"), "什么关系");
  assert.equal($("#to").getAttribute("placeholder"), "和谁");
  assert.match(text("#cue"), /写下谁、什么关系、和谁/);
  assert.match($("#date").getAttribute("placeholder"), /可不填/);
});

check("写完一句话按提交，两块牌与中间那条线立刻长出来", () => {
  write("周敏（人物）", "担任董事", "远岸控股（组织）", "2019-04-08");
  assert.deepEqual(names(), ["周敏", "远岸控股"]);
  assert.equal(all("#edge-layer path").length, 1);
  assert.match(text("#relation-layer"), /担任董事/);
  assert.equal($("#from").value, "", "写过的字段该清空，好接着写下一条");
});

check("第一条关系的两端自动成为当前这一问，结论就在台面上", () => {
  const conclusion = text("#conclusion");
  assert.match(conclusion, /周敏/);
  assert.match(conclusion, /远岸控股/);
  assert.match(conclusion, /担任董事/);
  assert.match(conclusion, /1 段关系/);
  assert.match(conclusion, /没有中介/);
});

check("材料里写的日期完整跟着那条关系，不折行不截断", () => {
  const captions = all("#relation-layer text").map((node) => node.textContent);
  assert.equal(captions.length, 1);
  assert.match(captions[0], /2019-04-08/);
  assert.equal(captions[0].split("\n").length, 1);
});

check("日期不填也能记下：材料没写就不写", () => {
  write("周敏", "与陈立言通话", "陈立言（人物）");
  assert.ok(names().includes("陈立言"));
  const captions = all("#relation-layer text").map((node) => node.textContent);
  assert.ok(captions.some((caption) => caption === "与陈立言通话"), "没写日期的那条不该凭空出现日期");
});

check("日期写错会被当场挡住，不落一条假关系", () => {
  const before = all("#edge-layer path").length;
  write("周敏", "会见", "李某", "2025-02-30");
  assert.equal(all("#edge-layer path").length, before);
  assert.match(text("#cue"), /真实的/);
  assert.ok(!names().includes("李某"));
});

check("撤回刚记下的那一条，图和结论一起退回去", () => {
  write("周敏", "出席", "市政听证会（事件）", "2022-09-06");
  assert.ok(names().includes("市政听证会"));
  click($("#undo"));
  assert.ok(!names().includes("市政听证会"), "撤回后那个对象不该还在");
  assert.match(text("#cue"), /已经撤回/);
});

check("继续补材料：一整张网长起来，名字一个不改", () => {
  write("远岸控股", "持有", "远岸科技（组织）", "2020-06-30");
  write("远岸控股", "设立", "岸山基金会（组织）", "2020-11-02");
  write("陈立言", "任理事", "岸山基金会", "2021-03-15");
  write("陈立言", "在听证会上作证", "市政听证会（事件）", "2022-09-06");
  assert.deepEqual(names().slice().sort(), [
    "周敏", "远岸控股", "陈立言", "远岸科技", "岸山基金会", "市政听证会",
  ].sort());
  assert.equal(all("#edge-layer path").length, 6);
});

check("点两个人，完整路径就地给出：起点、每名中介、终点、沿途关系", () => {
  press("Escape");
  click(tileOf("周敏"));
  assert.match(text("#cue"), /再点一个对象/);
  click(tileOf("市政听证会"));
  const conclusion = text("#conclusion");
  assert.match(conclusion, /周敏/);
  assert.match(conclusion, /陈立言/);
  assert.match(conclusion, /市政听证会/);
  assert.match(conclusion, /与陈立言通话/);
  assert.match(conclusion, /在听证会上作证/);
  assert.match(conclusion, /2 段关系/);
  assert.match(conclusion, /1 名中介/);
});

check("路径结论是可以手动选中的字，不押在剪贴板按钮上", () => {
  assert.equal($("#conclusion").tagName.toLowerCase(), "output");
  assert.equal(doc.querySelectorAll("#conclusion button").length, 0);
  assert.ok(text("#conclusion").length > 10);
});

check("亮起来的正是沿途那几条关系，一条中介都不跳过", () => {
  const lit = all("#edge-layer .relation-line-lit");
  assert.equal(lit.length, 2, "两段关系应当各自亮起");
  assert.equal(all("#node-layer .plate-end").length, 2);
  assert.equal(all("#node-layer .plate-via").length, 1, "中介牌应当被拎出来");
});

check("换一头：再点一个对象就换成新的一问", () => {
  click(tileOf("远岸科技"));
  assert.match(text("#conclusion"), /远岸科技/);
  assert.match(text("#cue"), /再点一个对象/);
  click(tileOf("周敏"));
  const conclusion = text("#conclusion");
  assert.match(conclusion, /远岸控股/);
  assert.match(conclusion, /2 段关系/);
});

check("材料里没连上的两个对象，直说没有关系，不画一条漂亮的线", () => {
  write("孤立证人（人物）", "拒绝作证", "另一个孤岛（组织）");
  press("Escape");
  click(tileOf("周敏"));
  click(tileOf("孤立证人"));
  assert.match(text("#conclusion"), /没有连上的关系/);
  assert.equal(all("#edge-layer .relation-line-lit").length, 0);
});

check("同一对对象之间的两条关系各走一条弯线，各自带自己的关系名", () => {
  press("Escape");
  write("远岸控股", "汇报给", "远岸科技", "2021-01-04");
  const between = all("#edge-layer path").filter((node) => /Q/.test(node.getAttribute("d")));
  assert.ok(between.length >= 2, "多重关系应当弯开成不同的曲线");
  const curves = between.map((node) => node.getAttribute("d"));
  assert.equal(new Set(curves).size, curves.length, "两条关系画成了同一根线");
  const captions = all("#relation-layer text").map((node) => node.textContent);
  assert.ok(captions.some((caption) => caption.startsWith("持有")));
  assert.ok(captions.some((caption) => caption.startsWith("汇报给")));
});

check("不对称关系有方向，对称关系不强加箭头", () => {
  const arrows = all("#edge-layer path").filter((node) => node.getAttribute("marker-end"));
  const plain = all("#edge-layer path").filter((node) => !node.getAttribute("marker-end"));
  assert.ok(arrows.length >= 5, "「持有」「设立」这类关系应当有方向");
  assert.equal(plain.length, 1, "「与陈立言通话」这类对称关系不该有箭头");
});

check("关系线停在牌的边上，箭头不会被牌面压住", () => {
  const tiles = names().map((name) => ({ name, box: centreOf(name) }));
  const inside = (point, box) =>
    Math.abs(point.x - box.x) < box.w / 2 && Math.abs(point.y - box.y) < box.h / 2;
  for (const line of all("#edge-layer path")) {
    const d = line.getAttribute("d");
    const numbers = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const start = { x: numbers[0], y: numbers[1] };
    const end = { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
    for (const tile of tiles) {
      assert.ok(!inside(start, tile.box), `线的起点钻进了「${tile.name}」`);
      assert.ok(!inside(end, tile.box), `线的终点钻进了「${tile.name}」，箭头会被压住`);
    }
  }
});

check("对象类型靠牌面自己认得出：人物圆角、事件的边是断的", () => {
  const person = tileOf("周敏").querySelector("rect");
  const organization = tileOf("远岸控股").querySelector("rect");
  const event = tileOf("市政听证会").querySelector("rect");
  assert.ok(Number(person.getAttribute("rx")) > Number(organization.getAttribute("rx")));
  assert.match(event.getAttribute("class"), /plate-event/);
  assert.match(person.getAttribute("class"), /plate-person/);
});

check("名字完整写在牌上，牌宽跟着名字长度走", () => {
  const short = centreOf("周敏");
  const long = centreOf("市政听证会");
  assert.ok(long.w > short.w, "长名字的牌应当更宽");
  assert.equal(tileOf("市政听证会").querySelector("text").textContent, "市政听证会");
});

check("牌与牌不互相压住：任意两块牌的方框都分开", () => {
  const list = names();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const one = centreOf(list[i]);
      const two = centreOf(list[j]);
      const apartX = Math.abs(one.x - two.x) >= (one.w + two.w) / 2;
      const apartY = Math.abs(one.y - two.y) >= (one.h + two.h) / 2;
      assert.ok(apartX || apartY, `${list[i]} 与 ${list[j]} 压在一起`);
    }
  }
});

check("关系名不被牌面压住，也不互相叠在一起", () => {
  const plates = names().map((name) => {
    const box = centreOf(name);
    return { x1: box.x - box.w / 2, x2: box.x + box.w / 2, y1: box.y - box.h / 2, y2: box.y + box.h / 2 };
  });
  const captions = all("#relation-layer rect").map((rect) => ({
    x1: Number(rect.getAttribute("x")),
    x2: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
    y1: Number(rect.getAttribute("y")),
    y2: Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")),
    s: null,
  }));
  const hit = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) *
    Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const areaOf = (box) => (box.x2 - box.x1) * (box.y2 - box.y1);
  captions.forEach((caption, index) => {
    for (const plate of plates) {
      assert.ok(hit(caption, plate) / areaOf(caption) < 0.2, `第 ${index + 1} 个关系名被牌面压住`);
    }
    captions.forEach((other, another) => {
      if (another <= index) return;
      assert.ok(hit(caption, other) / areaOf(caption) < 0.2, `第 ${index + 1} 与第 ${another + 1} 个关系名叠在一起`);
    });
  });
});

check("补一条关系不会把整张网重排：已有对象基本留在原位", () => {
  const before = names().map((name) => ({ name, at: centreOf(name) }));
  write("岸山基金会", "资助", "社区诊所（组织）", "2023-05-09");
  const drift = before.map((item) => {
    const now = centreOf(item.name);
    return Math.hypot(now.x - item.at.x, now.y - item.at.y);
  });
  const average = drift.reduce((sum, value) => sum + value, 0) / drift.length;
  assert.ok(average < 140, `已有对象平均挪了 ${average.toFixed(0)} px，等于整张重排`);
});

check("每个对象都能用键盘走到并按回车选中", () => {
  const group = tileOf("周敏");
  assert.equal(group.getAttribute("tabindex"), "0");
  assert.equal(group.getAttribute("role"), "button");
  assert.equal(group.getAttribute("aria-label"), "周敏");
  press("Escape");
  group.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.match(text("#conclusion"), /周敏/);
});

check("屏上没有被否掉的那些东西", () => {
  const body = screen();
  assert.doesNotMatch(body, /运行自测|自测|节点数|关系数|最大度数|连通分量|独立环|有向密度|无向密度/);
  assert.doesNotMatch(body, /图例|箭头表示|口径|上限|不上传|不保存|快捷键/);
  assert.doesNotMatch(body, /最短路径|逐条关系|关系产物预览|恢复.*样例/);
  assert.equal(doc.querySelectorAll("#run-test, #test-out, table").length, 0);
  assert.equal(doc.querySelectorAll("h1, h2, h3, section").length, 0);
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("目录仍是纯静态四件套", () => {
  assert.deepEqual(
    readdirSync(runtimeDir).filter((name) => name !== "NOTICE").sort(),
    ["engine.js", "index.html", "style.css", "ui.js"],
  );
});

check("没有写死小字号，也没有反过来写字号下限", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-2])(?:\.\d+)?px/);
  assert.doesNotMatch(css + code("index.html"), /字号不得小于|不得小于\s*\d+\s*px|min-font/);
});

check("没有外部资源：所有 src/href 都是同目录相对路径", () => {
  const html = code("index.html");
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    assert.match(match[1], /^(?:\.\/)?[^/:?#]+(?:\?[^#]*)?(?:#.*)?$/, `非同目录路径 ${match[1]}`);
    assert.ok(existsSync(path.join(runtimeDir, match[1].split(/[?#]/)[0])), `资源不存在 ${match[1]}`);
  }
  assert.doesNotMatch(code("style.css"), /@import|url\s*\(/i);
});

check("不用 ES module，页面也没有 iframe", () => {
  assert.doesNotMatch(code("index.html"), /type\s*=\s*["']module["']/i);
  assert.equal(doc.querySelectorAll("iframe").length, 0);
});

check("源码不发网络请求、不碰存储或父窗口 API", () => {
  const source = ["index.html", "style.css", "engine.js", "ui.js"].map(code).join("\n");
  for (const forbidden of [
    /fetch\s*\(/, /XMLHttpRequest/, /WebSocket\s*\(/, /EventSource\s*\(/,
    /sendBeacon\s*\(/, /importScripts\s*\(/, /WebTransport\s*\(/,
    /RTCPeerConnection\s*\(/, /(?:Shared)?Worker\s*\(/, /serviceWorker\s*\.\s*register\s*\(/,
    /document\s*\.\s*cookie/, /localStorage/, /sessionStorage/, /indexedDB/,
    /window\s*\.\s*(?:parent|top)\b/, /document\s*\.\s*domain/,
  ]) assert.doesNotMatch(source, forbidden);
});

console.log("\n关系图界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
