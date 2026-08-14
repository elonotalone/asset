import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/spaced-repetition-scheduler-01");
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

console.log("间隔排程自测 · 第一层：内核自带用例表");
const builtIn = E.runSelfTest();
for (const failure of builtIn.failures) console.log("  FAIL " + failure.name + "\n       " + failure.why);
if (builtIn.failures.length === 0) console.log("  ok   " + builtIn.total + " 条全过");
failed += builtIn.failures.length;

console.log("\n间隔排程自测 · 十次完整复习序列");

const made = E.createCard({
  id: 7,
  front: "线粒体的主要功能是什么？",
  back: "进行有氧呼吸并合成 ATP。",
  createdOn: "2026-08-14",
  startNow: true
});
assert.ok(made.card, made.error);

const expectedIntervals = [1, 6, 15, 38, 95, 238, 595, 1488, 3720, 9300];
let card = made.card;
let reviewDate = "2026-08-14";
for (let i = 0; i < expectedIntervals.length; i++) {
  const reviewed = E.reviewCard(card, 4, reviewDate);
  const step = i + 1;
  check(`第 ${step} 次：EF 保持 2.5`, () => assert.equal(reviewed.card.easeFactor, 2.5));
  check(`第 ${step} 次：间隔为 ${expectedIntervals[i]} 天`, () => assert.equal(reviewed.card.intervalDays, expectedIntervals[i]));
  check(`第 ${step} 次：复习次数为 ${step}`, () => assert.equal(reviewed.card.repetitions, step));
  card = reviewed.card;
  reviewDate = card.dueDate;
}

check("十次以后使用的是逐次取整链", () => {
  assert.equal(card.intervalDays, 9300);
  let floating = 6;
  for (let review = 3; review <= 10; review++) floating *= 2.5;
  const floatingAtTenth = Math.ceil(floating);
  assert.equal(floatingAtTenth, 9156);
  assert.notEqual(card.intervalDays, floatingAtTenth);
});

console.log("\n间隔排程自测 · EF 更新、失败与边界");

check("q=5：EF 2.5 → 2.6", () => assert.equal(E.adjustEase(2.5, 5), 2.6));
check("q=4：EF 2.5 保持不变", () => assert.equal(E.adjustEase(2.5, 4), 2.5));
check("q=3：EF 2.5 → 2.36", () => assert.equal(E.adjustEase(2.5, 3), 2.36));
check("EF 触底后停在 1.3", () => {
  let ease = 1.31;
  for (let i = 0; i < 20; i++) ease = E.adjustEase(ease, 3);
  assert.equal(ease, 1.3);
});

check("失败后次数与间隔归零，原 EF 不变", () => {
  const before = {
    id: 9,
    front: "失败卡",
    back: "答案",
    repetitions: 6,
    intervalDays: 238,
    easeFactor: 1.86,
    dueDate: "2026-08-20",
    lastReviewedOn: "2026-08-19",
    lastRating: 4
  };
  const reviewed = E.reviewCard(before, 2, "2026-08-20");
  assert.equal(reviewed.card.repetitions, 0);
  assert.equal(reviewed.card.intervalDays, 0);
  assert.equal(reviewed.card.easeFactor, 1.86);
  assert.equal(reviewed.card.dueDate, "2026-08-20");
  assert.match(reviewed.reason, /原 EF 1\.86 保留/);
});

check("失败后的下一次及格重新从 1 天开始", () => {
  const base = E.createCard({ front: "A", back: "B", createdOn: "2026-08-14" }).card;
  const learned = E.reviewCard(base, 5, "2026-08-14").card;
  const failedCard = E.reviewCard(learned, 1, "2026-08-15").card;
  const passedAgain = E.reviewCard(failedCard, 4, "2026-08-15").card;
  assert.equal(passedAgain.intervalDays, 1);
  assert.equal(passedAgain.dueDate, "2026-08-16");
});

check("日期按 UTC 日历日跨月与闰日", () => {
  assert.equal(E.addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(E.addDays("2028-02-28", 1), "2028-02-29");
});
check("评分只接受 0–5 的整数", () => {
  const base = E.createCard({ front: "A", back: "B", createdOn: "2026-08-14" }).card;
  assert.match(E.reviewCard(base, -1, "2026-08-14").error, /0 到 5/);
  assert.match(E.reviewCard(base, 5.5, "2026-08-14").error, /0 到 5/);
  assert.match(E.reviewCard(base, 6, "2026-08-14").error, /0 到 5/);
});
check("坏卡与坏日期不会伪装成有效排程", () => {
  assert.match(E.createCard({ front: "", back: "答案", createdOn: "2026-08-14" }).error, /正面/);
  assert.match(E.createCard({ front: "问题", back: "", createdOn: "2026-08-14" }).error, /背面/);
  assert.match(E.createCard({ front: "问题", back: "答案", createdOn: "2026-02-30" }).error, /日期/);
});

console.log("\n间隔排程自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
