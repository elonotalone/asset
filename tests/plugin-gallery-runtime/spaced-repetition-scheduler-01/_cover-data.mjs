/*
 * 封面数据：用 jsdom 真跑一遍新界面，取「已揭开答案、正要评价这次回忆」那一刻
 * 屏幕上真实出现的文字。不造示意文案，_cover-draw.py 只照这份 JSON 排版。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/spaced-repetition-scheduler-01");
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
const press = (label) => click(all("button").find((button) => !button.closest("[hidden]") && button.textContent.includes(label)));

fill($("#front"), "华法林的抗凝作用被哪一种维生素直接拮抗？");
fill($("#back"), "维生素 K。它让被华法林压住的凝血因子重新合成，所以也是过量出血时的解救药。");
press("开始记它");
press("想好了，看答案");

const out = {
  front: clean($(".face").textContent),
  back: clean($(".face-answer").textContent),
  ratings: all(".rate-go").map((button) => clean(button.textContent))
};
process.stdout.write(JSON.stringify(out, null, 1));
dom.window.close();
