(function (root) {
  "use strict";

  var DAY_MS = 24 * 60 * 60 * 1000;

  function finite(value) { return typeof value === "number" && isFinite(value); }
  function validRating(q) { return Number.isInteger(q) && q >= 0 && q <= 5; }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    var date = new Date(value + "T00:00:00Z");
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function todayISO(now) {
    var date = now instanceof Date ? now : new Date();
    if (isNaN(date.getTime())) throw new RangeError("当前日期无效。");
    return date.toISOString().slice(0, 10);
  }
  function addDays(iso, days) {
    if (!validDate(iso) || !Number.isInteger(days)) throw new RangeError("日期或天数无效。");
    return new Date(Date.parse(iso + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
  }
  function roundEase(value) { return Math.round(value * 100) / 100; }

  function adjustEase(easeFactor, q) {
    if (!finite(easeFactor) || easeFactor < 1.3 || !validRating(q)) throw new RangeError("EF 或评分无效。");
    if (q < 3) return roundEase(easeFactor);
    var miss = 5 - q;
    var next = easeFactor + (0.1 - miss * (0.08 + miss * 0.02));
    return roundEase(Math.max(1.3, next));
  }

  function nextInterval(repetitions, intervalDays, easeFactor) {
    if (!Number.isInteger(repetitions) || repetitions < 0 || !Number.isInteger(intervalDays) || intervalDays < 0 || !finite(easeFactor) || easeFactor < 1.3) {
      throw new RangeError("复习状态无效。");
    }
    if (repetitions === 0) return 1;
    if (repetitions === 1) return 6;
    if (intervalDays < 1) throw new RangeError("第三次及以后必须有上一轮已取整间隔。");
    return Math.ceil(intervalDays * easeFactor);
  }

  function createCard(raw) {
    raw = raw || {};
    var front = String(raw.front || "").trim();
    var back = String(raw.back || "").trim();
    var createdOn = String(raw.createdOn || "");
    if (!front) return { error: "卡片正面不能为空。" };
    if (!back) return { error: "卡片背面不能为空。" };
    if (!validDate(createdOn)) return { error: "建卡日期无效。" };
    var startNow = raw.startNow !== false;
    return {
      card: {
        id: raw.id || 0,
        front: front,
        back: back,
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueDate: startNow ? createdOn : addDays(createdOn, 1),
        lastReviewedOn: "",
        lastRating: null
      }
    };
  }

  function validCard(card) {
    return card && String(card.front || "").trim() && String(card.back || "").trim()
      && Number.isInteger(card.repetitions) && card.repetitions >= 0
      && Number.isInteger(card.intervalDays) && card.intervalDays >= 0
      && finite(card.easeFactor) && card.easeFactor >= 1.3
      && validDate(card.dueDate);
  }

  function reviewCard(card, q, reviewedOn) {
    if (!validCard(card)) return { error: "卡片复习状态无效。" };
    if (!validRating(q)) return { error: "评分必须是 0 到 5 的整数。" };
    if (!validDate(reviewedOn)) return { error: "复习日期无效。" };
    var next = {};
    Object.keys(card).forEach(function (key) { next[key] = card[key]; });
    next.lastReviewedOn = reviewedOn;
    next.lastRating = q;

    if (q < 3) {
      next.repetitions = 0;
      next.intervalDays = 0;
      next.dueDate = reviewedOn;
      return { card: next, reason: "未及格：次数与间隔归零，原 EF " + next.easeFactor.toFixed(2) + " 保留，今天重新到期。" };
    }

    next.intervalDays = nextInterval(card.repetitions, card.intervalDays, card.easeFactor);
    next.repetitions = card.repetitions + 1;
    next.easeFactor = adjustEase(card.easeFactor, q);
    next.dueDate = addDays(reviewedOn, next.intervalDays);
    return {
      card: next,
      reason: "评分 " + q + "：按原 EF " + card.easeFactor.toFixed(2) + " 得间隔 " + next.intervalDays + " 天；更新后 EF " + next.easeFactor.toFixed(2) + "。"
    };
  }

  function dueCards(cards, onDate) {
    if (!validDate(onDate)) throw new RangeError("查询日期无效。");
    return (cards || []).filter(function (card) { return validCard(card) && card.dueDate <= onDate; }).sort(function (a, b) {
      return a.dueDate === b.dueDate ? a.id - b.id : a.dueDate.localeCompare(b.dueDate);
    });
  }

  function nextDueDate(cards) {
    var dates = (cards || []).filter(validCard).map(function (card) { return card.dueDate; }).sort();
    return dates.length ? dates[0] : "";
  }

  function buildTimeline(cards, startDate, length) {
    if (!validDate(startDate) || !Number.isInteger(length) || length < 1) throw new RangeError("日期轴参数无效。");
    var rows = [];
    for (var i = 0; i < length; i++) {
      var date = addDays(startDate, i);
      var count = (cards || []).filter(function (card) { return validCard(card) && card.dueDate === date; }).length;
      rows.push({ date: date, offset: i, count: count });
    }
    return rows;
  }

  function runSelfTest() {
    var failures = [];
    function equal(name, got, expected) {
      if (got !== expected) failures.push({ name: name, why: "期望 " + expected + "，得到 " + got });
    }
    function truth(name, value) { if (!value) failures.push({ name: name, why: "条件未成立" }); }

    var made = createCard({ id: 1, front: "线粒体的主要功能是什么？", back: "进行有氧呼吸并合成 ATP。", createdOn: "2026-08-14", startNow: true });
    truth("新卡可创建", made.card);
    if (made.card) {
      equal("新卡 EF", made.card.easeFactor, 2.5);
      equal("新卡立即到期", made.card.dueDate, "2026-08-14");
      var first = reviewCard(made.card, 5, "2026-08-14");
      equal("第一次间隔", first.card.intervalDays, 1);
      equal("q=5 后 EF", first.card.easeFactor, 2.6);
      equal("第一次下次日期", first.card.dueDate, "2026-08-15");
      var second = reviewCard(first.card, 4, "2026-08-15");
      equal("第二次间隔", second.card.intervalDays, 6);
      equal("q=4 后 EF 不变", second.card.easeFactor, 2.6);
      var failed = reviewCard(second.card, 2, "2026-08-16");
      equal("失败次数归零", failed.card.repetitions, 0);
      equal("失败间隔归零", failed.card.intervalDays, 0);
      equal("失败保留原 EF", failed.card.easeFactor, 2.6);
    }
    equal("q=3 公式", adjustEase(2.5, 3), 2.36);
    equal("EF 下限", adjustEase(1.31, 3), 1.3);
    equal("EF 已触底保持", adjustEase(1.3, 3), 1.3);
    equal("第三次用已取整上一间隔", nextInterval(2, 6, 2.5), 15);
    equal("跨月日期", addDays("2026-08-31", 1), "2026-09-01");
    equal("未来轴长度", buildTimeline([], "2026-08-14", 7).length, 7);
    truth("坏评分被拒绝", !!reviewCard(made.card, 6, "2026-08-14").error);
    truth("空正面被拒绝", !!createCard({ front: "", back: "答案", createdOn: "2026-08-14" }).error);
    return { total: 19, passed: 19 - failures.length, failures: failures };
  }

  var api = {
    todayISO: todayISO,
    addDays: addDays,
    adjustEase: adjustEase,
    nextInterval: nextInterval,
    createCard: createCard,
    reviewCard: reviewCard,
    dueCards: dueCards,
    nextDueDate: nextDueDate,
    buildTimeline: buildTimeline,
    runSelfTest: runSelfTest
  };
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.SpacedRepetitionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
