/*
 * 封面数据抽取器：把真实界面装进 jsdom，走一遍客厅里那一下（把期限从 30 年拖到 20 年），
 * 把屏上真正出现的字、以及真实轨迹的路径点倒出来给 _cover-draw.py 排版。
 *
 *   node tests/plugin-gallery-runtime/financial-calculator-01/_cover-data.mjs > /tmp/financial-cover.json
 *
 * 画封面的脚本只许排版，不许自己编数：曲线上的每个点都是插件自己算出来的当期余额。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/financial-calculator-01");
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
  resources: "usable"
});
await new Promise((resolve) =>
  dom.window.document.readyState === "complete" ? resolve() : dom.window.addEventListener("load", resolve)
);

const { window } = dom;
const doc = window.document;
const $ = (selector) => doc.querySelector(selector);
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

/* 客厅里那一下：手落在期限上，把三十年拖到二十年。 */
const term = $("#term");
term.value = "20";
term.dispatchEvent(new window.Event("input", { bubbles: true }));

const knobs = [...doc.querySelectorAll("#knobs-loan .knob")].map((knob) => {
  const name = clean(knob.querySelector("span").textContent);
  const unit = knob.querySelector("b");
  const input = knob.querySelector("input");
  const select = knob.querySelector("select");
  if (select) return { name, value: clean(select.options[select.selectedIndex].textContent), unit: "" };
  if (input && input.type === "range") return { name, value: clean(unit.textContent), unit: "", slider: Number(input.value) / Number(input.max) };
  return { name, value: input.value, unit: clean(unit.textContent) };
});

const out = {
  verdict: clean($("#verdict").textContent),
  pastName: $("#past-name").hidden ? "" : clean($("#past-name").textContent),
  now: $("#now").getAttribute("d"),
  past: $("#past").getAttribute("d"),
  shade: $("#shade").getAttribute("d"),
  axis: [...doc.querySelectorAll(".axis span")].map((span) => ({
    text: clean(span.textContent),
    at: Number(String(span.style.left).replace("%", "")) / 100
  })),
  knobs,
  questions: [...doc.querySelectorAll(".question button")].map((button) => ({
    text: clean(button.textContent),
    on: button.classList.contains("on")
  }))
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
dom.window.close();
