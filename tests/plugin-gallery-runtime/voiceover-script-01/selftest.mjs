import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.resolve(
  here,
  "../../../content/active-runtime/plugin/voiceover-script-01/engine.js",
);
const E = require(enginePath);
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err?.message || String(err)));
  }
}

console.log("口播脚本自测 · 第一层：页面按钮共用的内核用例");
const embedded = E.runSelfTest();
check(embedded.total + " 条全过", () => {
  assert.equal(embedded.passed, embedded.total, JSON.stringify(embedded.failures));
});

console.log("\n口播脚本自测 · 第二层：规格口径独立断言");

check("90 秒 @ 216 字/分钟严格得到 324 字预算", () => {
  assert.equal(E.budgetFor(90, 216), 324);
});

check("停顿不随语速缩放，两个语速下都原样保留 1.25 秒", () => {
  const paragraph = { text: "一二三四五六", mode: "zh", pauseSeconds: 1.25 };
  const slow = E.paragraphDuration(paragraph, { chineseRate: 120, englishRate: 150 });
  const fast = E.paragraphDuration(paragraph, { chineseRate: 240, englishRate: 150 });
  assert.equal(slow.pauseSeconds, 1.25);
  assert.equal(fast.pauseSeconds, 1.25);
  assert.equal(slow.totalSeconds - slow.speakingSeconds, 1.25);
  assert.equal(fast.totalSeconds - fast.speakingSeconds, 1.25);
  assert.notEqual(slow.speakingSeconds, fast.speakingSeconds);
});

check("30.400 秒 @ 25 fps 对应第 760 帧", () => {
  assert.equal(E.secondsToFrame(30.400, 25), 760);
  assert.equal(E.formatFramecode(760, 25), "00:00:30:10");
});

check("改第 2 段后，第 3 段及以后起点等量平移", () => {
  const settings = { chineseRate: 120, englishRate: 150, fps: 25 };
  const paragraphs = [
    { text: "一二三四", mode: "zh", pauseSeconds: 0.5 },
    { text: "五六", mode: "zh", pauseSeconds: 0.5 },
    { text: "七八九", mode: "zh", pauseSeconds: 0.5 },
    { text: "甲乙", mode: "zh", pauseSeconds: 0.5 },
  ];
  const before = E.buildTimeline(paragraphs, settings);
  const changed = E.clone(paragraphs);
  changed[1].text += "十百千万";
  const after = E.buildTimeline(changed, settings);
  const shiftAtThird = after.rows[2].startFrame - before.rows[2].startFrame;
  const shiftAtFourth = after.rows[3].startFrame - before.rows[3].startFrame;
  assert.ok(shiftAtThird > 0);
  assert.equal(shiftAtThird, shiftAtFourth);
});

check("末段原始终点等于每段时长之和，末帧按累计秒数一次对齐", () => {
  const settings = { chineseRate: 216, englishRate: 150, fps: 25 };
  const timeline = E.buildTimeline(E.DEMO, settings);
  const sum = timeline.rows.reduce((total, row) => total + row.durationSeconds, 0);
  const last = timeline.rows.at(-1);
  assert.ok(Math.abs(last.endSeconds - sum) < 1e-9);
  assert.equal(last.endFrame, Math.round(sum * 25));
  assert.equal(timeline.totalFrames, last.endFrame);
});

check("中英混排明确分开统计，不把字与词伪装成同一单位", () => {
  const counts = E.measureText("复利 ROI grows fast", "mixed");
  assert.deepEqual(counts, { chinese: 2, english: 3, mode: "mixed" });
  const exported = E.exportScript(E.DEMO, { chineseRate: 216, englishRate: 150, fps: 25 }, 90);
  assert.match(exported, /中文按字、英文按词/);
  assert.match(exported, /两种单位不等价/);
});

console.log("\n口播脚本自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
