/*
 * 封面数据抽取器：把真实界面装进 jsdom，走一遍厨房那三步，
 * 把屏上真正出现的字倒出来给 _cover-draw.py 排版。
 *
 *   node tests/plugin-gallery-runtime/unit-converter-01/_cover-data.mjs > /tmp/unit-converter-cover.json
 *
 * 画封面的脚本只许排版，不许自己编数：封面上的每个数都由插件自己算出来。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/unit-converter-01");
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

/* 厨房那三步：左端选美国液量盎司 → 输入 12 → 右端就是量杯上的毫升刻度。 */
const unitLeft = $("#unit-left");
unitLeft.value = "flozUS";
unitLeft.dispatchEvent(new window.Event("change", { bubbles: true }));
const valueLeft = $("#value-left");
valueLeft.dispatchEvent(new window.FocusEvent("focus", { bubbles: true }));
valueLeft.value = "12";
valueLeft.dispatchEvent(new window.Event("input", { bubbles: true }));

const selected = (select) => clean(select.options[select.selectedIndex].textContent);

const out = {
  leftRole: clean($("#role-left").textContent),
  leftValue: $("#value-left").value,
  leftUnit: selected($("#unit-left")),
  rightRole: clean($("#role-right").textContent),
  rightValue: $("#value-right").value,
  rightUnit: selected($("#unit-right")),
  relation: clean($("#relation").textContent),
  exact: $("#bridge").getAttribute("data-exact") === "true"
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
dom.window.close();
