import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/metrics-dashboard-01");
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error && error.message ? error.message : String(error)));
  }
}

console.log("看板自测 · 第一层：页面按钮共用的内核用例");
const report = engine.runSelfTest();
for (const failure of report.failures) console.log("  FAIL " + failure.name + "\n       " + failure.why);
if (!report.failures.length) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n看板自测 · 第二层：规格口径独立断言");

check("达成率严格等于实际 / 目标", () => {
  assert.equal(engine.calculateMetric(37, 50).ratio, 37 / 50);
});

check("参考三段的两个边界归属正确", () => {
  assert.equal(engine.calculateMetric(79.999, 100).band, "low");
  assert.equal(engine.calculateMetric(80, 100).band, "middle");
  assert.equal(engine.calculateMetric(95, 100).band, "middle");
  assert.equal(engine.calculateMetric(95.001, 100).band, "high");
});

check("每个指标可覆盖自己的目标与分段", () => {
  const custom = engine.calculateMetric(70, 100, 0.50, 0.75);
  assert.equal(custom.ratio, 0.7);
  assert.equal(custom.band, "middle");
  assert.equal(custom.lower, 0.5);
  assert.equal(custom.upper, 0.75);
});

check("三段分色且每段同时给符号与清晰文字", () => {
  const rows = [
    engine.calculateMetric(70, 100),
    engine.calculateMetric(90, 100),
    engine.calculateMetric(110, 100),
  ];
  assert.equal(new Set(rows.map((row) => row.color)).size, 3);
  assert.deepEqual(rows.map((row) => row.symbol), ["▼", "■", "▲"]);
  for (const row of rows) assert.ok(row.label.length >= 4);
});

check("除零返回无法得到指标，不是数值零", () => {
  const result = engine.calculateMetric(10, 0);
  assert.equal(result.kind, "missing");
  assert.equal(result.ratio, null);
  assert.notEqual(engine.formatRate(result), "0");
  assert.match(result.reason, /目标为零/);
});

check("NaN 与 Infinity 返回无法得到指标，不是数值零", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = engine.calculateMetric(value, 100);
    assert.equal(result.kind, "missing");
    assert.equal(result.ratio, null);
  }
});

check("真实的实际零保留为零", () => {
  const result = engine.calculateMetric(0, 100);
  assert.equal(result.kind, "value");
  assert.equal(result.ratio, 0);
  assert.equal(result.band, "low");
});

check("同一输入两次调用结果逐位相同", () => {
  const input = [92, 100, 0.8, 0.95];
  assert.deepEqual(engine.calculateMetric(...input), engine.calculateMetric(...input));
});

check("粘贴数据按时段与地区确定性筛选", () => {
  const parsed = engine.parseDataset(
    "时段,地区,指标,实际,目标,低段边界,高段边界\n" +
    "本周,华东,交付准时率,92,100,0.8,0.95\n" +
    "本周,华南,交付准时率,96,100,0.8,0.95",
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records.length, 2);
  const filtered = engine.filterRecords(parsed.records, { period: "本周", region: "华南" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].result.band, "high");
});

check("坏分段明确缺失，不偷偷交换边界", () => {
  const result = engine.calculateMetric(90, 100, 0.95, 0.80);
  assert.equal(result.kind, "missing");
  assert.match(result.reason, /不能大于/);
});

console.log("\n看板自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
