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

  // 「两种单位不等价」以前只是导出文本里的一句话。导出框删掉、exportScript 也删掉之后，
  // 这句话必须由时长本身证明：2 个汉字走 216 字/分钟、3 个英文词走 150 词/分钟，
  // 各自计时再相加，而不是把 5 个单位丢给同一个语速。
  const settings = { chineseRate: 216, englishRate: 150 };
  const sentence = "复利 ROI grows fast";
  const mixed = E.paragraphDuration({ text: sentence, mode: "mixed", pauseSeconds: 0 }, settings);
  assert.equal(mixed.chineseSeconds, 2 / (216 / 60));
  assert.equal(mixed.englishSeconds, 3 / (150 / 60));
  assert.equal(mixed.speakingSeconds, mixed.chineseSeconds + mixed.englishSeconds);
  assert.notEqual(mixed.speakingSeconds, 5 / (216 / 60));
  assert.notEqual(mixed.speakingSeconds, 5 / (150 / 60));

  // 模式不是装饰：按 zh 计会漏掉英文词，按 en 计会漏掉汉字，两者相加才等于混排。
  const asChinese = E.paragraphDuration({ text: sentence, mode: "zh", pauseSeconds: 0 }, settings);
  const asEnglish = E.paragraphDuration({ text: sentence, mode: "en", pauseSeconds: 0 }, settings);
  assert.equal(asChinese.englishSeconds, 0);
  assert.equal(asEnglish.chineseSeconds, 0);
  assert.ok(Math.abs(asChinese.speakingSeconds + asEnglish.speakingSeconds - mixed.speakingSeconds) < 1e-12);
});

check("内核不再留第二份导出序列化，可带走的就是屏幕上那份稿子", () => {
  // 删掉的是 exportScript() 与只给它用的 languageLabel()／countLabel()。
  // 它们连同那行「计数口径：……」是页面底部只读导出框的遗留物，界面早已不调用；
  // 留着就等于把口径写两遍，迟早和真界面各说各话。
  assert.equal(typeof E.exportScript, "undefined");
  assert.equal(typeof E.languageLabel, "undefined");
  assert.equal(typeof E.countLabel, "undefined");
  assert.equal(typeof E.buildTimeline, "function");
  assert.equal(typeof E.formatFramecode, "function");
});

console.log("\n口播脚本自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
