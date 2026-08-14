/*
 * 封面数据：用 jsdom 真跑一遍新界面，把屏幕上真实出现的文字取出来。
 * 不造示意文案，_cover-draw.py 只照这份 JSON 排版。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/self-test-quiz-01");
const require = createRequire(import.meta.url);

function loadJsdom() {
  for (const item of ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"]) {
    if (existsSync(item)) return require(item);
  }
  for (const root of ["/root/projects/asset", "/root/projects/oceanleo-ui", "/root/projects/oceanleo"]) {
    const store = path.join(root, "node_modules", ".pnpm");
    if (!existsSync(store)) continue;
    for (const entry of readdirSync(store)) {
      const candidate = path.join(store, entry, "node_modules", "jsdom");
      if (entry.startsWith("jsdom@") && existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error("找不到 jsdom");
}

const { JSDOM } = loadJsdom();
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
const fill = (target, value) => {
  target.value = value;
  target.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const click = (target) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const kind = (name) => all("#kinds .kind").find((button) => button.textContent.trim() === name);
const press = (label) => click(all("button").find((button) => !button.closest("[hidden]") && button.textContent.includes(label)));

// 第一题：真实剂量换算，答案落在容差内。
fill($("#prompt"), "体重 68 kg 的患者按 0.5 mg/kg 单次给药，这一次该给多少毫克？");
click(kind("数值"));
const numericFields = all("#build input");
fill(numericFields[0], "34");
fill(numericFields[1], "mg");
fill(numericFields[2], "2");
fill($("#topic"), "剂量换算");
fill($("#explanation"), "0.5 mg/kg × 68 kg = 34 mg：先算总量，再核对单位是 mg 还是 g。");
press("开始答这道题");
fill($("#answer-value"), "33.4");
fill($("#answer-unit"), "mg");
press("看看我这题会不会");

// 第二题：真实选项文字，故意选错，让批改落在原答案旁。
press("再出一道题");
fill($("#prompt"), "华法林的抗凝作用被下面哪一种维生素直接拮抗？");
click(kind("单选"));
fill($("#build textarea"), "维生素 K\n维生素 C\n维生素 D");
const mark = all(".mark input")[0];
mark.checked = true;
mark.dispatchEvent(new window.Event("change", { bubbles: true }));
fill($("#topic"), "心血管药理");
fill($("#explanation"), "维生素 K 是华法林的直接拮抗剂，也是过量出血时的解救药。");
press("开始答这道题");
const picked = all(".choice input").find((input) => input.value === "维生素 C");
picked.checked = true;
press("看看我这题会不会");

const out = {
  wrapScore: clean($(".wrap-score").textContent),
  wrapNote: clean($(".wrap-note").textContent),
  edgeDir: clean($("#go-prev .edge-dir").textContent),
  edgeName: clean($("#prev-name").textContent),
  prompt: clean($(".prompt-read").textContent),
  topic: clean($(".topic-read").textContent),
  choices: all(".choice").map((row) => ({
    text: clean(row.querySelector(".choice-text").textContent),
    mine: row.classList.contains("chosen"),
    key: row.classList.contains("keyed"),
    tags: [...row.querySelectorAll(".tag")].map((tag) => clean(tag.textContent))
  })),
  verdictScore: clean($(".verdict-score").textContent),
  verdictReason: clean($(".verdict-reason").textContent),
  verdictMine: clean($(".verdict-mine").textContent),
  verdictNote: clean($(".verdict-note").textContent)
};
process.stdout.write(JSON.stringify(out, null, 1));
dom.window.close();
