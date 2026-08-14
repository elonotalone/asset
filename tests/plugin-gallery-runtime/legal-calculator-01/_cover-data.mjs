/*
 * 封面数据抽取器：把真实界面装进 jsdom，选「经济补偿估算」并把一组真实事实填进去，
 * 再把链上真正出现的字（节点名、事实、采用基数、补偿月数、估算金额、两枚门槛印记、
 * 结论下那行淡字）倒出来给 _cover-draw.py 排版。
 *
 *   node tests/plugin-gallery-runtime/legal-calculator-01/_cover-data.mjs > /tmp/legal-cover.json
 *
 * 画封面的脚本只许排版，不许自己编数：金额与月数都由插件自己算出来。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/legal-calculator-01");
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
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const type = (id, value) => {
  const input = doc.getElementById(id);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

/* 一组会同时踩到两道门槛的真实事实：月工资高于当地月平均工资 3 倍，余段又满 6 个月。 */
click([...doc.querySelectorAll(".picks button")].find((b) => b.textContent.trim() === "经济补偿估算"));
type("labor-salary", "25000");
type("labor-local", "8000");
type("labor-years", "6");
type("labor-months", "8");

const nodes = [...doc.querySelectorAll("#chain-labor .node")].map((node) => {
  const inputs = [...node.querySelectorAll(".entry input")];
  const units = [...node.querySelectorAll(".entry b")].filter((b) => !b.classList.contains("value"));
  const valueNode = node.querySelector(".value");
  const mark = node.querySelector(".mark");
  let read = "";
  if (valueNode) {
    read = clean(valueNode.textContent) + (units[0] ? " " + clean(units[0].textContent) : "");
  } else {
    read = inputs
      .map((input, index) => (input.value === "" ? "" : input.value + " " + clean(units[index] ? units[index].textContent : "")))
      .filter(Boolean)
      .join(" · ");
  }
  return {
    name: clean(node.querySelector(".name").textContent),
    read,
    big: Boolean(node.querySelector(".value.big")),
    state: node.getAttribute("data-state"),
    mark: mark && !mark.hidden ? clean(mark.textContent) : ""
  };
});

const out = {
  nodes,
  edge: clean(doc.querySelector("#chain-labor .edge").textContent),
  again: clean(doc.getElementById("again").textContent)
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
dom.window.close();
