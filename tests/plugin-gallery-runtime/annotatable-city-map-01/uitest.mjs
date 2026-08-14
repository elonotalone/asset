/*
 * 地图 · 界面自测（jsdom，非浏览器）
 *
 *   node tests/plugin-gallery-runtime/annotatable-city-map-01/uitest.mjs
 *
 * 这一版检查的是「人在屏幕上真能做完的一件事」：把朋友发来的几条链接粘进来，
 * 地点按真实比例摆开，走一趟多远直接看见，顺序绕远了会被指出来。
 * 旧的检查点（世界地图轮廓、图例、色板、自测按钮、数据来源声明）在这一版里
 * 已经不存在，因此换成对当下界面的断言，而不是放宽标准。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/annotatable-city-map-01",
);
const require = createRequire(import.meta.url);

function loadJsdom() {
  const roots = ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"];
  const direct = ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"];
  for (const entry of direct) if (existsSync(entry)) return require(entry);
  for (const root of roots) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith("jsdom@")) continue;
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (existsSync(candidate)) return require(candidate);
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
  else dom.window.addEventListener("load", resolve, { once: true });
});

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const all = (selector) => [...doc.querySelectorAll(selector)];
const text = (selector) => $(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
const screen = () => doc.body.textContent.replace(/\s+/g, " ");

/* jsdom 不排版，给画布一个真实尺寸，好让摆图与避让逻辑走完整条路。 */
const VIEW_W = 1200;
const VIEW_H = 760;
$("#city").getBoundingClientRect = () => ({
  x: 0, y: 0, left: 0, top: 0, right: VIEW_W, bottom: VIEW_H, width: VIEW_W, height: VIEW_H,
});
window.dispatchEvent(new window.Event("resize"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
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
function drop(paste, name) {
  type("#paste", paste);
  type("#place-name", name);
  submit();
}
function press(key) {
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
}
function click(target) {
  target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
function names() {
  return all("#label-layer .stop-name").map((node) => node.textContent);
}
function screenOf(index) {
  const circle = all("#place-layer .stop")[index];
  return { x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) };
}

console.log("地图界面自测（jsdom，非浏览器）");

check("引擎脚本被页面真实装载", () => {
  assert.ok(window.CityMapEngine);
});

check("首屏是一张空的纸：没有地点、没有数字、没有劝告", () => {
  assert.equal(all("#place-layer .stop").length, 0);
  assert.equal(text("#total"), "");
  assert.equal($("#advice").hidden, true);
  assert.equal($("#tag").hidden, true);
});

check("首屏就摆着入口，粘贴框自己说清要粘什么", () => {
  assert.match($("#paste").getAttribute("placeholder"), /地图链接|坐标/);
  assert.match($("#place-name").getAttribute("placeholder"), /叫什么/);
  assert.ok($("#add-place"));
});

check("粘一条谷歌链接、写个名字，地点就落在图上", () => {
  drop("https://www.google.com/maps/place/x/@38.7069,-9.1466,17z/data=!4m2", "住的地方");
  assert.equal(all("#place-layer .stop").length, 1);
  assert.deepEqual(names(), ["住的地方"]);
  assert.match(text("#cue"), /谷歌/);
  assert.equal($("#paste").value, "", "粘贴框应清空，好接着粘下一条");
});

check("落下后名字就在手边可改，改完屏上跟着变", () => {
  assert.equal($("#tag").hidden, false);
  type("#stop-name", "住的公寓");
  assert.deepEqual(names(), ["住的公寓"]);
  press("Escape");
  assert.equal($("#tag").hidden, true);
});

check("只有一个地点时不硬凑距离", () => {
  assert.equal(text("#total"), "");
  assert.equal(all("#route-layer .route").length, 0);
});

check("读不出坐标就直说，不落一个假点", () => {
  drop("里斯本老城区那家蛋挞店", "蛋挞");
  assert.equal(all("#place-layer .stop").length, 1);
  assert.match(text("#cue"), /读不出坐标/);
});

check("有坐标但没名字，先要名字，也不落点", () => {
  type("#paste", "38.7139, -9.1226");
  type("#place-name", "");
  submit();
  assert.equal(all("#place-layer .stop").length, 1);
  assert.match(text("#cue"), /名字/);
  assert.equal($("#paste").value, "38.7139, -9.1226", "已经粘好的链接不许被吞掉");
});

check("第二个地点落下后，两点之间的直线距离直接显示（误差 < 0.5%）", () => {
  type("#place-name", "圣乔治城堡");
  submit();
  assert.equal(all("#place-layer .stop").length, 2);
  assert.equal(all("#route-layer .route").length, 1);
  press("Escape");
  const shown = text("#total");
  assert.match(shown, /直线总长/);
  const km = Number(shown.replace(/[^\d.]/g, ""));
  const expected = window.CityMapEngine.haversine([-9.1466, 38.7069], [-9.1226, 38.7139]) / 1000;
  assert.ok(Math.abs(km - expected) / expected < 0.005, `屏上 ${km} km，应约 ${expected.toFixed(2)} km`);
  assert.match(shown, /km/);
});

check("每一段的长度写在那一段线上", () => {
  const segments = all("#route-layer .segment").map((node) => node.textContent);
  assert.equal(segments.length, 1);
  assert.match(segments[0], /\d/);
  assert.match(segments[0], /km|m/);
});

check("图上比例是真的：任意两点在屏上的距离共用同一把尺子", () => {
  drop("https://uri.amap.com/marker?position=-9.1333,38.7223", "海边");
  press("Escape");
  const world = [[-9.1466, 38.7069], [-9.1226, 38.7139], [-9.1333, 38.7223]];
  const shown = world.map((_, index) => screenOf(index));
  const scales = [];
  for (let i = 0; i < world.length; i++) {
    for (let j = i + 1; j < world.length; j++) {
      const px = Math.hypot(shown[j].x - shown[i].x, shown[j].y - shown[i].y);
      scales.push(px / window.CityMapEngine.haversine(world[i], world[j]));
    }
  }
  const min = Math.min(...scales);
  const max = Math.max(...scales);
  assert.ok((max - min) / min < 0.02, `同一张图上出现两把尺子：${min} vs ${max}`);
  const spread = Math.max(...shown.map((point) => point.x)) - Math.min(...shown.map((point) => point.x));
  assert.ok(spread > 200, `所有地点挤在 ${spread.toFixed(0)} px 里，没有铺开`);
});

check("三个地点围出的范围与面积直接给出", () => {
  assert.equal(all("#area-layer .enclosed").length, 1);
  assert.match(text("#area-layer"), /围出/);
  assert.match(text("#area-layer"), /km²|m²/);
});

check("北偏与比例尺常驻，不用猜方向和远近", () => {
  assert.equal(all("#mark-layer .north-mark").length, 1);
  assert.equal(all("#mark-layer .scale-bar").length, 3);
  assert.match(text("#mark-layer"), /\d+(?:\.\d+)?\s*(?:km|m)/);
  assert.match(text("#mark-layer"), /N/);
});

check("顺序绕远了会被指出来，说清多走多少、该怎么走", () => {
  // 现在屏上是 住的公寓 → 圣乔治城堡 → 海边，这是一条折返：
  // 先往东进城，再折回西北的海边。换成先海边再城堡会更短。
  assert.equal($("#advice").hidden, false, "明显绕远时应当出声");
  assert.match(text("#advice"), /多走/);
  assert.match(text("#advice"), /海边/);
  assert.match(text("#advice"), /→/);
  assert.ok($("#apply-order"), "指出绕远却没有一键改顺序的入口");
});

check("一按就换成最短那一个，换完不再重复劝告，总长真的变短", () => {
  const beforeKm = Number(text("#total").replace(/[^\d.]/g, ""));
  click($("#apply-order"));
  assert.equal($("#advice").hidden, true, "已经最短还继续劝");
  const afterKm = Number(text("#total").replace(/[^\d.]/g, ""));
  assert.ok(afterKm < beforeKm, `换顺序后应更短：${beforeKm} → ${afterKm}`);
  assert.match(text("#cue"), /最短/);
});

check("换顺序只动序号，不动地点：名字一个不少，编号从 1 连排", () => {
  const labels = names().slice().sort();
  assert.equal(labels.length, all("#place-layer .stop").length);
  const indices = all("#place-layer .stop-index").map((node) => Number(node.textContent));
  assert.deepEqual(indices, indices.map((_, i) => i + 1));
});

check("点名字就能选中它，选中的那一个在屏上看得出来", () => {
  const label = all("#label-layer .stop-name")[0];
  click(label);
  assert.equal(all("#place-layer .stop-selected").length, 1);
  assert.equal(all("#label-layer .stop-name-selected").length, 1);
  assert.equal($("#tag").hidden, false);
});

check("撤回一站，屏上立刻少一个，总长跟着改", () => {
  const before = all("#place-layer .stop").length;
  const beforeTotal = text("#total");
  click($("#drop-stop"));
  assert.equal(all("#place-layer .stop").length, before - 1);
  assert.notEqual(text("#total"), beforeTotal);
  assert.equal($("#tag").hidden, true);
});

check("每个地点可用键盘走到并按回车选中", () => {
  const group = all("#place-layer .stop-group")[0];
  assert.equal(group.getAttribute("tabindex"), "0");
  assert.equal(group.getAttribute("role"), "button");
  assert.ok(group.getAttribute("aria-label"));
  group.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.equal($("#tag").hidden, false);
  press("Escape");
});

check("路线自己打了结时不报围合面积，理顺之后才报", () => {
  // 先把图清空：一站一站撤回，这也是界面上唯一的清空方式。
  while (all("#place-layer .stop-name, #label-layer .stop-name").length) {
    click(all("#label-layer .stop-name")[0]);
    click($("#drop-stop"));
  }
  assert.equal(all("#place-layer .stop").length, 0);

  // 按人真实的收集顺序粘四条链接：先住处，再城堡，再升降机，最后观景台。
  drop("38.7075, -9.1364", "住的旅馆");
  drop("38.7139, -9.1335", "圣乔治城堡");
  drop("38.7118, -9.1396", "圣胡斯塔升降机");
  drop("38.7119, -9.1303", "太阳门观景台");
  press("Escape");
  assert.equal(all("#place-layer .stop").length, 4);
  assert.equal(all("#area-layer .enclosed").length, 0, "打了结的路线不该报出围合面积");
  assert.doesNotMatch(text("#area-layer"), /围出/);

  click($("#apply-order"));
  assert.equal(all("#area-layer .enclosed").length, 1, "理顺之后应当报出围合的那块地");
  assert.match(text("#area-layer"), /围出/);
});

check("名字不会互相压在一起（同一位置的重叠框为 0）", () => {
  const boxes = all("#label-layer .stop-name").map((node) => ({
    x: Number(node.getAttribute("x")), y: Number(node.getAttribute("y")),
  }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const near = Math.abs(boxes[i].x - boxes[j].x) < 4 && Math.abs(boxes[i].y - boxes[j].y) < 4;
      assert.ok(!near, `第 ${i + 1} 与第 ${j + 1} 个名字落在同一处`);
    }
  }
});

check("屏上没有开发者痕迹：没有自测按钮、没有色号、没有免责声明", () => {
  const body = screen();
  assert.doesNotMatch(body, /自测|通过\s*\/|CRS84|EPSG|#[0-9A-Fa-f]{6}/);
  assert.doesNotMatch(body, /仅供参考|不构成|免责|导航依据/);
  assert.doesNotMatch(body, /haversine|球面|投影中心/i);
  assert.equal(doc.querySelectorAll("#run-test, #test-out").length, 0);
});

function code(file) {
  let source = readFileSync(path.join(runtimeDir, file), "utf8");
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  source = source.replace(/^[ \t]*\/\/.*$/gm, " ");
  return source;
}

check("没有写死小字号，也没有反过来写字号下限", () => {
  const css = code("style.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-2])(?:\.\d+)?px/);
  assert.doesNotMatch(css + code("index.html"), /字号不得小于|不得小于\s*\d+\s*px|min-font/);
});

check("目录仍是纯静态四件套", () => {
  assert.deepEqual(
    readdirSync(runtimeDir).filter((name) => name !== "NOTICE").sort(),
    ["engine.js", "index.html", "style.css", "ui.js"],
  );
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

console.log("\n地图界面自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
dom.window.close();
process.exit(failed === 0 ? 0 : 1);
