/*
 * 检索式构造 · 自测
 *
 *   node tests/plugin-gallery-runtime/search-query-builder-01/selftest.mjs
 *
 * 第一层跑内核自带用例表（逐字比对查询串）；
 * 第二层把规格「已查证的知识」那四条**当性质来验**，而不是再抄一遍期望串 ——
 * 性质验证抓得住「用例表被改绿」这种作弊。
 * 规格：docs/specs/oceanleo-plugins-v1/plugins/search-query-builder.md
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/search-query-builder-01",
);
const require = createRequire(import.meta.url);
const E = require(path.join(runtimeDir, "engine.js"));

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

console.log("检索式构造自测 · 第一层：内核自带用例表（逐字比对查询串）");
const report = E.runSelfTest();
for (const f of report.failures) console.log("  FAIL " + f.name + "\n       " + f.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n检索式构造自测 · 第二层：规格四条知识当性质验");

/* 规格：同一概念块中的同义词通常用 OR，概念块之间再用 AND。 */
check("性质一：块内只出现 OR，块间只出现 AND", () => {
  const blocks = [
    { label: "P", terms: [{ text: "alpha" }, { text: "beta" }, { text: "gamma" }] },
    { label: "I", terms: [{ text: "delta" }, { text: "epsilon" }] }
  ];
  const q = E.compile(blocks, "generic").query;
  const groups = q.split(" AND ");
  assert.equal(groups.length, 2, `块间应当有 1 个 AND，得到 ${q}`);
  assert.equal(groups[0].split(" OR ").length, 3);
  assert.equal(groups[1].split(" OR ").length, 2);
  for (const g of groups) assert.doesNotMatch(g, /\bAND\b/, "块内不该出现 AND");
});

/* 规格：显式括号能避免 A OR B AND C 在不同数据库中按不同优先级解释。 */
check("性质二：任意块数下括号都配平，且每一块都被括起来", () => {
  for (let n = 1; n <= 6; n++) {
    const blocks = [];
    for (let i = 0; i < n; i++) blocks.push({ terms: [{ text: "t" + i }, { text: "u" + i }] });
    for (const d of E.DIALECT_IDS) {
      const q = E.compile(blocks, d).query;
      const open = (q.match(/\(/g) || []).length;
      const close = (q.match(/\)/g) || []).length;
      assert.equal(open, close, `${d} ${n} 块括号不配平：${q}`);
      assert.equal(open, n, `${d} ${n} 块应当有 ${n} 对括号：${q}`);
      // 裸的 "A OR B AND C" 不许出现：AND 两侧必须紧挨括号
      if (n > 1) assert.match(q, /\) AND \(/, `AND 没有夹在括号之间：${q}`);
    }
  }
});

/* 规格：数据库对标题、摘要、主题词、邻近与截词的语法支持不同；
   不支持的字段需要向用户说明如何降级。 */
check("性质三：凡是不支持的字段，必然降级并且必然留说明", () => {
  for (const d of E.DIALECT_IDS) {
    const dialect = E.DIALECTS[d];
    for (const field of Object.keys(E.FIELD_LABELS)) {
      const r = E.compile([{ terms: [{ text: "sample", field }] }], d);
      assert.ok(r.query.length > 0, `${d}/${field} 编译出了空串`);
      if (dialect.supports.indexOf(field) < 0) {
        const explained = r.notes.some((n) => n.includes("降级"));
        assert.ok(explained, `${d} 不支持 ${field}，却没有降级说明：${JSON.stringify(r.notes)}`);
      }
    }
  }
});

check("性质三补：不支持截词的方言必然说明截词被去掉", () => {
  const r = E.compile([{ terms: [{ text: "quantum*" }] }], "arxiv");
  assert.doesNotMatch(r.query, /\*/, "arXiv 不支持截词，星号不该留在查询串里");
  assert.ok(r.notes.some((n) => n.includes("截词")), "去了截词却没说明");
});

/* 规格：这件工具编译查询，不必替用户执行检索；
   可复制的查询串与检索日期本身就足以形成可追溯记录。 */
check("性质四：不执行检索 —— 内核里没有任何网络出口", () => {
  const src = readEngine();
  assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|https?:\/\//,
    "内核里出现了网络调用或外部地址");
});
check("性质四补：可追溯记录同时带查询串与检索日期", () => {
  const r = E.compile(E.DEMO.blocks, "pubmed");
  const line = E.provenance(r, "2026-08-13");
  assert.match(line, /2026-08-13/);
  assert.ok(line.includes(r.query), "记录里没有查询串本身");
});
check("内核不读时钟（同样输入永远同样输出）", () => {
  const a = E.compile(E.DEMO.blocks, "pubmed");
  const b = E.compile(E.DEMO.blocks, "pubmed");
  assert.deepEqual(a, b);
  const src = readEngine();
  assert.doesNotMatch(src, /new\s+Date|Date\.now/, "内核读了时钟，输出就不可复算了");
});

/* 结构安全：用户的字不许跑进结构位。 */
check("用户输入里的括号/引号被剔掉，编译结果仍然配平", () => {
  const q = E.compile([{ terms: [{ text: 'a) OR (b' }, { text: 'c" OR "d' }] }], "generic").query;
  assert.equal((q.match(/\(/g) || []).length, (q.match(/\)/g) || []).length);
  assert.equal((q.match(/"/g) || []).length % 2, 0, "引号不成对");
});

check("空输入不产生空括号，也不产生 undefined", () => {
  assert.equal(E.compile([], "pubmed").query, "");
  assert.equal(E.compile([{ terms: [] }], "pubmed").query, "");
  assert.equal(E.compile([{ terms: [{ text: "   " }] }], "pubmed").query, "");
  assert.equal(E.compile(null, "pubmed").query, "");
});

check("同一份概念结构能编出三种方言，三串互不相同", () => {
  const all = E.compileAll(E.DEMO.blocks);
  const qs = E.DIALECT_IDS.map((d) => all[d].query);
  assert.equal(new Set(qs).size, 3, "三种方言编出了重复的串");
  for (const q of qs) assert.ok(q.length > 40, "查询串短得不像话：" + q);
});

function readEngine() {
  return require("node:fs").readFileSync(path.join(runtimeDir, "engine.js"), "utf8");
}

console.log("\n检索式构造自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
