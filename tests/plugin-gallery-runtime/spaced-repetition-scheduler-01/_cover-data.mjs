import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/spaced-repetition-scheduler-01");
const require = createRequire(import.meta.url);
function loadJsdom() {
  for (const item of ["/root/projects/med/node_modules/jsdom", "/root/projects/notebook/node_modules/jsdom"]) if (existsSync(item)) return require(item);
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
await new Promise((resolve) => dom.window.document.readyState === "complete" ? resolve() : dom.window.addEventListener("load", resolve));

const { document } = dom.window;
const $ = (selector) => document.querySelector(selector);
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const set = (id, value) => { document.getElementById(id).value = value; };
const click = (target) => target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

set("front", "线粒体的主要功能是什么？");
set("back", "进行有氧呼吸并合成 ATP。");
click($("#add-card"));
click($(".reveal"));
click($('button[aria-label="评分 5"]'));
click($("#run-test"));
set("front", "线粒体的主要功能是什么？");
set("back", "进行有氧呼吸并合成 ATP。");

const rowsOf = (selector) => [...document.querySelectorAll(selector)].map((row) => [...row.cells].map((cell) => clean(cell.textContent)));
const out = {
  title: clean($("h1").textContent),
  sub: clean($(".head span").textContent),
  editorTitle: clean($("#editor-title").textContent),
  frontLabel: clean($('label[for="front"]').textContent),
  front: $("#front").value,
  backLabel: clean($('label[for="back"]').textContent),
  back: $("#back").value,
  startNow: clean($('.check-line').textContent),
  addButton: clean($("#add-card").textContent),
  rulesTitle: clean($("#rules-title").textContent),
  rules: [...document.querySelectorAll(".rules dl div")].map((item) => [clean(item.querySelector("dt").textContent), clean(item.querySelector("dd").textContent)]),
  ruleNotes: [...document.querySelectorAll(".rules p")].map((item) => clean(item.textContent)),
  headline: [...document.querySelectorAll(".headline div")].map((item) => ({ k: clean(item.querySelector("span").textContent), v: clean(item.querySelector("strong").textContent) })),
  basis: clean($("#basis-line").textContent),
  queueTitle: clean($("#queue-title").textContent),
  queueEmpty: clean($("#queue-empty strong").textContent),
  actionNote: clean($("#action-note").textContent),
  registryTitle: clean($("#registry-title").textContent),
  registryHead: [...document.querySelectorAll(".registry th")].map((cell) => clean(cell.textContent)),
  registryRows: rowsOf("#card-rows tr"),
  timelineTitle: clean($("#timeline-title").textContent),
  timelineHead: [...document.querySelectorAll(".timeline th")].map((cell) => clean(cell.textContent)),
  timelineRows: rowsOf("#timeline-rows tr"),
  selftestButton: clean($("#run-test").textContent),
  selftest: clean($("#test-out").textContent)
};
process.stdout.write(JSON.stringify(out));
dom.window.close();
