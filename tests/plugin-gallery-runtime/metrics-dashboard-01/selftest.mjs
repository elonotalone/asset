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

console.log("看板自测 · 第一层：内核自带用例");
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

console.log("\n看板自测 · 第三层：共用时间轴上的轨道");

const paste = [
  "时段,地区,指标,实际,目标,单位",
  "08-04,静安店,到店客流,412,460,人次",
  "08-05,静安店,到店客流,455,460,人次",
  "08-06,静安店,到店客流,,460,人次",
  "08-07,静安店,到店客流,341,460,人次",
  "08-04,静安店,成交率,31.4,34,%",
  "08-05,静安店,成交率,33.1,34,%",
  "08-06,静安店,成交率,29.8,34,%",
  "08-07,静安店,成交率,26.9,34,%",
  "08-04,徐汇店,到店客流,508,460,人次",
  "08-05,徐汇店,到店客流,496,460,人次",
  "08-06,徐汇店,到店客流,470,460,人次",
  "08-07,徐汇店,到店客流,455,460,人次",
].join("\n");

check("表头能带单位，缺实际值的行照收，不把整批数据挡在外面", () => {
  const parsed = engine.parseDataset(paste);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records.length, 12);
  const hole = parsed.records.find((row) => row.name === "到店客流" && row.period === "08-06" && row.region === "静安店");
  assert.equal(hole.actual, null);
  assert.equal(hole.unit, "人次");
  assert.match(hole.missingReason, /这一时段没有实际值/);
});

check("名字里的括号单位读成单位，屏上仍是用户写的那个名字", () => {
  assert.deepEqual(engine.splitUnit("平均等位时长（分钟）"), { name: "平均等位时长", unit: "分钟" });
  assert.deepEqual(engine.splitUnit("成交率(%)"), { name: "成交率", unit: "%" });
  assert.deepEqual(engine.splitUnit("到店客流"), { name: "到店客流", unit: "" });
  const made = engine.record({ period: "08-04", region: "静安店", name: "平均等位时长（分钟）", actual: 11.5, target: 9 });
  assert.equal(made.value.name, "平均等位时长");
  assert.equal(made.value.unit, "分钟");
});

check("默认落在数据里第一个出现的地区，并把地区与时间范围都说出来", () => {
  const board = engine.board(engine.parseDataset(paste).records, {});
  assert.deepEqual(board.regions, ["静安店", "徐汇店"]);
  assert.equal(board.region, "静安店");
  assert.deepEqual(board.periods, ["08-04", "08-05", "08-06", "08-07"]);
  assert.deepEqual(board.window, { from: "08-04", to: "08-07" });
  assert.equal(board.current, "到店客流");
});

check("换地区只换出那个地区的记录，读数跟着换", () => {
  const records = engine.parseDataset(paste).records;
  const jing = engine.board(records, { region: "静安店" });
  assert.equal(jing.tracks.length, 2);
  assert.deepEqual(jing.tracks.map((track) => track.name), ["到店客流", "成交率"]);
  assert.equal(jing.tracks[0].reading.actual, 341);
  const xu = engine.board(records, { region: "徐汇店" });
  assert.equal(xu.tracks.length, 1);
  assert.equal(xu.tracks[0].reading.actual, 455);
});

check("断口带自己的原因，路径不在缺失处落到基线", () => {
  const board = engine.board(engine.parseDataset(paste).records, { region: "静安店" });
  const flow = board.tracks[0];
  assert.equal(flow.points[2].kind, "missing");
  assert.equal(flow.points[2].actual, undefined);
  assert.match(flow.points[2].why, /这一时段没有实际值/);
  assert.equal(flow.breaks.length, 1);
  assert.equal(flow.points.filter((point) => point.kind === "value").length, 3);
});

check("实际的零是能算的读数，落在含零的尺度里", () => {
  const board = engine.board(engine.parseDataset("时段,地区,指标,实际,目标\n08-04,东,退单,0,5\n08-05,东,退单,2,5").records, {});
  const track = board.tracks[0];
  assert.equal(track.points[0].kind, "value");
  assert.equal(track.points[0].actual, 0);
  assert.equal(track.points[0].result.ratio, 0);
  assert.equal(track.span.low, 0);
});

check("头号结论说的是当前指标离目标差多少，带单位带方向", () => {
  const board = engine.board(engine.parseDataset(paste).records, { region: "静安店" });
  assert.equal(board.headline.name, "到店客流");
  assert.equal(board.headline.unit, "人次");
  assert.equal(board.headline.word, "比目标少");
  assert.equal(board.headline.distance, 119);
  assert.equal(board.headline.period, "08-07");
  assert.equal(board.headline.rate, "74.13 %");
  assert.equal(board.headline.label, "低于参考区间");
});

check("点另一条轨道就换头号结论，不改数据", () => {
  const records = engine.parseDataset(paste).records;
  const board = engine.board(records, { region: "静安店", current: "成交率" });
  assert.equal(board.headline.name, "成交率");
  assert.equal(board.headline.unit, "%");
  assert.equal(board.headline.distance, 7.1);
  assert.equal(engine.board(records, { region: "静安店" }).headline.name, "到店客流");
});

check("缩窄时间范围是重算尺度与读数，不是把点藏起来", () => {
  const records = engine.parseDataset(paste).records;
  const wide = engine.board(records, { region: "静安店" }).tracks[0];
  const narrow = engine.board(records, { region: "静安店", from: 0, to: 1 }).tracks[0];
  assert.equal(wide.span.high, 460);
  assert.equal(narrow.span.high, 460);
  assert.equal(wide.reading.period, "08-07");
  assert.equal(narrow.reading.period, "08-05");
  assert.equal(narrow.breaks.length, 0);
  assert.equal(narrow.points.length, 4);
  assert.deepEqual(narrow.points.map((point) => point.inWindow), [true, true, false, false]);
  const tight = engine.board(records, { region: "静安店", from: 3, to: 3 }).tracks[1];
  assert.equal(tight.span.high, 34);
  assert.equal(tight.reading.actual, 26.9);
});

check("范围端点写反了自己扶正，越界自己收回", () => {
  const records = engine.parseDataset(paste).records;
  const flipped = engine.board(records, { region: "静安店", from: 3, to: 1 });
  assert.equal(flipped.from, 1);
  assert.equal(flipped.to, 3);
  const wild = engine.board(records, { region: "静安店", from: -9, to: 99 });
  assert.equal(wild.from, 0);
  assert.equal(wild.to, 3);
});

check("同一时段多条记录时说读数不唯一，不偷偷挑一条", () => {
  const board = engine.board(engine.parseDataset(
    "时段,地区,指标,实际,目标\n08-04,东,客流,100,120\n08-04,东,客流,180,120",
  ).records, {});
  assert.equal(board.tracks[0].points[0].kind, "missing");
  assert.match(board.tracks[0].points[0].why, /有 2 条记录/);
});

check("目标为零的时段是断口，原因贴在那个时段上", () => {
  const board = engine.board(engine.parseDataset(
    "时段,地区,指标,实际,目标\n08-04,东,客流,100,0\n08-05,东,客流,110,120",
  ).records, {});
  assert.equal(board.tracks[0].points[0].kind, "missing");
  assert.match(board.tracks[0].points[0].why, /目标为零/);
  assert.equal(board.tracks[0].reading.period, "08-05");
});

check("同一批数据两次算出逐位相同的看板", () => {
  const records = engine.parseDataset(paste).records;
  const once = engine.board(records, { region: "静安店", from: 1, to: 3, current: "成交率" });
  const twice = engine.board(records, { region: "静安店", from: 1, to: 3, current: "成交率" });
  assert.equal(JSON.stringify(once), JSON.stringify(twice));
});

check("没有数据时不编出一块看板", () => {
  const board = engine.board([], {});
  assert.deepEqual(board.periods, []);
  assert.deepEqual(board.tracks, []);
  assert.equal(board.region, "");
  assert.equal(board.window, null);
  assert.equal(board.headline, null);
});

check("不足五列的行报错，只有表头也报错", () => {
  assert.match(engine.parseDataset("08-04,东,客流,100").errors[0], /至少需要/);
  assert.match(engine.parseDataset("时段,地区,指标,实际,目标").errors[0], /只有表头/);
});

console.log("\n看板自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
