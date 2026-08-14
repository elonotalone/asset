/*
 * 封面数据：用 jsdom 真跑一遍新界面，取首屏那条从原式长到结论的推导链上
 * 真实出现的文字。不造示意文案，_cover-draw.py 只照这份 JSON 排版。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/formula-derivation-walkthrough-01");
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

const cells = [...$("#chain").children];
const rows = [];
for (let i = 0; i < cells.length; i += 4) {
  if (cells[i].classList.contains("knowns")) { i -= 3; continue; }
  const [lhs, eq, rhs, note] = cells.slice(i, i + 4);
  rows.push({
    lhs: clean(lhs.textContent),
    eq: clean(eq.textContent),
    rhs: clean(rhs.querySelector(".slip") ? [...rhs.childNodes].filter((n) => n !== rhs.querySelector(".slip")).map((n) => n.textContent).join("") : rhs.textContent),
    slip: rhs.querySelector(".slip") ? clean(rhs.querySelector(".slip").textContent) : "",
    note: clean(note.textContent),
    tail: rhs.classList.contains("tail")
  });
}

const out = {
  tag: clean($(".example-tag").textContent),
  ask: [...$(".known-ask").children].map((part) => clean(part.textContent)).join(" "),
  knownWord: clean(all(".knowns > .known-word")[0].textContent),
  knowns: all(".knowns .known").map((item) => ({
    name: clean(item.querySelector(".known-name") ? item.querySelector(".known-name").textContent : ""),
    symbol: clean(item.querySelector(".known-symbol").textContent),
    value: clean(item.querySelector(".touch-value").textContent)
  })),
  rows
};
process.stdout.write(JSON.stringify(out, null, 1));
dom.window.close();
