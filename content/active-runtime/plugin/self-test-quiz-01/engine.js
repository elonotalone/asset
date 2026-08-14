(function (root) {
  "use strict";

  var TYPE_LABELS = {
    single: "单选",
    truefalse: "判断",
    multi: "多选",
    blanks: "填空",
    numeric: "数值",
    ordering: "排序",
    matching: "匹配"
  };

  function finite(n) { return typeof n === "number" && isFinite(n); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function clean(value) { return String(value === undefined || value === null ? "" : value).trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
  function same(a, b) { return clean(a) === clean(b); }
  function unique(values) {
    var out = [], seen = {};
    for (var i = 0; i < values.length; i++) {
      var key = clean(values[i]);
      if (key && !seen[key]) { seen[key] = true; out.push(String(values[i]).trim()); }
    }
    return out;
  }
  function splitLines(value) {
    if (Array.isArray(value)) return unique(value);
    return unique(String(value || "").split(/\r?\n|[,，;；]+/));
  }
  function splitSequence(value) {
    if (Array.isArray(value)) return unique(value);
    return unique(String(value || "").split(/\r?\n|[,，;；|]+|\s*(?:->|→)\s*/));
  }
  function splitBlanks(value) {
    if (Array.isArray(value)) return value.map(function (v) { return String(v).trim(); });
    return String(value || "").split(/[|｜]/).map(function (v) { return v.trim(); }).filter(Boolean);
  }
  function parsePairs(value) {
    if (value && !Array.isArray(value) && typeof value === "object") return value;
    var lines = Array.isArray(value) ? value : String(value || "").split(/\r?\n|[;；]+/);
    var out = {};
    for (var i = 0; i < lines.length; i++) {
      var parts = String(lines[i]).split(/\s*(?:=|＝|->|→)\s*/);
      if (parts.length >= 2 && clean(parts[0])) out[String(parts[0]).trim()] = parts.slice(1).join("=").trim();
    }
    return out;
  }

  function makeQuestion(raw) {
    raw = raw || {};
    var type = TYPE_LABELS[raw.type] ? raw.type : null;
    var prompt = String(raw.prompt || "").trim();
    var points = Number(raw.points);
    if (!type) return { error: "请选择受支持的题型。" };
    if (!prompt) return { error: "题干不能为空。" };
    if (!finite(points) || points <= 0) return { error: "分值必须是大于 0 的数。" };

    var q = {
      id: raw.id || 0,
      type: type,
      prompt: prompt,
      points: points,
      topic: String(raw.topic || "未分类").trim() || "未分类",
      explanation: String(raw.explanation || "未填写解析").trim() || "未填写解析"
    };
    var answer;

    if (type === "single" || type === "multi") {
      q.options = splitLines(raw.options);
      if (q.options.length < 2) return { error: "单选或多选至少需要两个选项。" };
      answer = type === "single" ? String(raw.answer || "").trim() : splitLines(raw.answer);
      if ((type === "single" && !answer) || (type === "multi" && answer.length === 0)) return { error: "请填写标准答案。" };
      var answers = type === "single" ? [answer] : answer;
      for (var i = 0; i < answers.length; i++) {
        if (!q.options.some(function (option) { return same(option, answers[i]); })) return { error: "标准答案必须出现在选项里。" };
      }
      q.answer = answer;
    } else if (type === "truefalse") {
      answer = String(raw.answer || "").trim();
      if (!same(answer, "正确") && !same(answer, "错误")) return { error: "判断题标准答案只能填“正确”或“错误”。" };
      q.options = ["正确", "错误"];
      q.answer = same(answer, "正确") ? "正确" : "错误";
    } else if (type === "blanks") {
      q.answer = splitBlanks(raw.answer);
      if (q.answer.length === 0) return { error: "填空题至少需要一个标准答案，用 | 分隔各空。" };
    } else if (type === "numeric") {
      answer = Number(String(raw.answer || "").trim());
      q.unit = String(raw.unit || "").trim();
      q.tolerancePct = Number(raw.tolerancePct);
      if (!finite(answer)) return { error: "数值题的标准答案必须是有限数。" };
      if (!q.unit) return { error: "数值题必须填写答案单位。" };
      if (!finite(q.tolerancePct) || q.tolerancePct < 0) return { error: "相对容差必须是大于等于 0 的百分比。" };
      q.answer = answer;
    } else if (type === "ordering") {
      q.answer = splitSequence(raw.answer);
      if (q.answer.length < 2) return { error: "排序题至少需要两个有序项目。" };
    } else if (type === "matching") {
      q.answer = parsePairs(raw.answer);
      if (Object.keys(q.answer).length < 1) return { error: "匹配题至少需要一组“左项=右项”。" };
    }
    return { question: q };
  }

  function finish(q, ratio, reason) {
    var safeRatio = clamp(finite(ratio) ? ratio : 0, 0, 1);
    return { ratio: safeRatio, earned: clamp(q.points * safeRatio, 0, q.points), reason: reason };
  }

  function scoreQuestion(q, response) {
    if (!q || !TYPE_LABELS[q.type] || !finite(q.points) || q.points < 0) return { ratio: 0, earned: 0, reason: "题目无效" };
    if (q.type === "single" || q.type === "truefalse") {
      var exact = same(response, q.answer);
      return finish(q, exact ? 1 : 0, exact ? "完全匹配" : "未完全匹配");
    }
    if (q.type === "multi") {
      var expected = unique(q.answer || []), picked = unique(response || []);
      var hit = 0, wrong = 0;
      for (var i = 0; i < picked.length; i++) {
        if (expected.some(function (v) { return same(v, picked[i]); })) hit++; else wrong++;
      }
      var multiRatio = expected.length ? (hit - wrong) / expected.length : 0;
      return finish(q, multiRatio, "命中 " + hit + " 项，错选 " + wrong + " 项；按 (命中−错选)/" + expected.length + " 计分");
    }
    if (q.type === "blanks") {
      var blankAnswer = q.answer || [], filled = Array.isArray(response) ? response : splitBlanks(response), blankHit = 0;
      for (var b = 0; b < blankAnswer.length; b++) if (same(filled[b], blankAnswer[b])) blankHit++;
      return finish(q, blankAnswer.length ? blankHit / blankAnswer.length : 0, "命中 " + blankHit + " / " + blankAnswer.length + " 个空");
    }
    if (q.type === "numeric") {
      var value = response && typeof response === "object" ? Number(response.value) : NaN;
      var unit = response && typeof response === "object" ? response.unit : "";
      if (!finite(value) || !same(unit, q.unit)) return finish(q, 0, !same(unit, q.unit) ? "单位不匹配" : "作答不是有限数");
      var difference = Math.abs(value - q.answer);
      var relative = q.answer === 0 ? (difference === 0 ? 0 : Infinity) : difference / Math.abs(q.answer) * 100;
      var within = relative <= q.tolerancePct + 1e-12;
      return finish(q, within ? 1 : 0, "相对误差 " + (finite(relative) ? relative.toFixed(4) + "%" : "无穷大") + "；容差 " + q.tolerancePct + "% · 单位 " + q.unit);
    }
    if (q.type === "ordering") {
      var ordered = Array.isArray(response) ? response : splitSequence(response);
      var totalPairs = Math.max(1, q.answer.length - 1), pairHit = 0;
      if (q.answer.length === 1) pairHit = same(ordered[0], q.answer[0]) ? 1 : 0;
      else {
        for (var p = 0; p < ordered.length - 1; p++) {
          for (var a = 0; a < q.answer.length - 1; a++) {
            if (same(ordered[p], q.answer[a]) && same(ordered[p + 1], q.answer[a + 1])) { pairHit++; break; }
          }
        }
      }
      return finish(q, pairHit / totalPairs, "命中 " + pairHit + " / " + totalPairs + " 个正确相邻对");
    }
    if (q.type === "matching") {
      var expectedPairs = q.answer || {}, givenPairs = parsePairs(response), keys = Object.keys(expectedPairs), matchHit = 0;
      for (var k = 0; k < keys.length; k++) if (same(givenPairs[keys[k]], expectedPairs[keys[k]])) matchHit++;
      return finish(q, keys.length ? matchHit / keys.length : 0, "命中 " + matchHit + " / " + keys.length + " 组正确配对");
    }
    return finish(q, 0, "不支持的题型");
  }

  function scoreQuiz(questions, responses) {
    var rows = [], earned = 0, total = 0;
    for (var i = 0; i < questions.length; i++) {
      var result = scoreQuestion(questions[i], responses[i]);
      rows.push(result);
      earned += result.earned;
      total += questions[i].points;
    }
    return { earned: earned, total: total, rows: rows };
  }

  function q(type, points, answer, extra) {
    var out = { type: type, points: points, answer: answer };
    extra = extra || {};
    Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  var CASES = [
    { name: "单选全对", got: function () { return scoreQuestion(q("single", 10, "月球"), "月球").earned; }, expect: 10 },
    { name: "单选部分输入仍按完全匹配为零", got: function () { return scoreQuestion(q("single", 10, "月球"), "月").earned; }, expect: 0 },
    { name: "单选全错", got: function () { return scoreQuestion(q("single", 10, "月球"), "火星").earned; }, expect: 0 },
    { name: "判断全对", got: function () { return scoreQuestion(q("truefalse", 6, "正确"), "正确").earned; }, expect: 6 },
    { name: "判断部分输入仍按完全匹配为零", got: function () { return scoreQuestion(q("truefalse", 6, "正确"), "正").earned; }, expect: 0 },
    { name: "判断全错", got: function () { return scoreQuestion(q("truefalse", 6, "正确"), "错误").earned; }, expect: 0 },
    { name: "多选全对", got: function () { return scoreQuestion(q("multi", 12, ["A", "B"]), ["A", "B"]).earned; }, expect: 12 },
    { name: "多选只命中一项得一半", got: function () { return scoreQuestion(q("multi", 12, ["A", "B"]), ["A"]).earned; }, expect: 6 },
    { name: "多选错选抵扣且不倒扣", got: function () { return scoreQuestion(q("multi", 12, ["A", "B"]), ["C", "D", "E"]).earned; }, expect: 0 },
    { name: "填空全对", got: function () { return scoreQuestion(q("blanks", 8, ["极限", "导数"]), ["极限", "导数"]).earned; }, expect: 8 },
    { name: "填空命中一半", got: function () { return scoreQuestion(q("blanks", 8, ["极限", "导数"]), ["极限", "积分"]).earned; }, expect: 4 },
    { name: "填空全错", got: function () { return scoreQuestion(q("blanks", 8, ["极限", "导数"]), ["函数", "积分"]).earned; }, expect: 0 },
    { name: "数值完全相等且单位相同", got: function () { return scoreQuestion(q("numeric", 10, 100, { unit: "km/h", tolerancePct: 2 }), { value: 100, unit: "km/h" }).earned; }, expect: 10 },
    { name: "数值有偏差但落在相对容差内", got: function () { return scoreQuestion(q("numeric", 10, 100, { unit: "km/h", tolerancePct: 2 }), { value: 101.5, unit: "km/h" }).earned; }, expect: 10 },
    { name: "数值超相对容差为零", got: function () { return scoreQuestion(q("numeric", 10, 100, { unit: "km/h", tolerancePct: 2 }), { value: 102.1, unit: "km/h" }).earned; }, expect: 0 },
    { name: "排序全对", got: function () { return scoreQuestion(q("ordering", 9, ["A", "B", "C", "D"]), ["A", "B", "C", "D"]).earned; }, expect: 9 },
    { name: "排序命中一个相邻对", got: function () { return scoreQuestion(q("ordering", 9, ["A", "B", "C", "D"]), ["A", "B", "D", "C"]).earned; }, expect: 3 },
    { name: "排序逆序全错", got: function () { return scoreQuestion(q("ordering", 9, ["A", "B", "C", "D"]), ["D", "C", "B", "A"]).earned; }, expect: 0 },
    { name: "匹配全对", got: function () { return scoreQuestion(q("matching", 8, { A: "1", B: "2" }), { A: "1", B: "2" }).earned; }, expect: 8 },
    { name: "匹配命中一半", got: function () { return scoreQuestion(q("matching", 8, { A: "1", B: "2" }), { A: "1", B: "9" }).earned; }, expect: 4 },
    { name: "匹配全错", got: function () { return scoreQuestion(q("matching", 8, { A: "1", B: "2" }), { A: "8", B: "9" }).earned; }, expect: 0 },
    { name: "单位不同则数值相同也不得分", got: function () { return scoreQuestion(q("numeric", 10, 100, { unit: "km", tolerancePct: 2 }), { value: 100, unit: "m" }).earned; }, expect: 0 }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var got;
      try { got = CASES[i].got(); }
      catch (err) { failures.push({ name: CASES[i].name, why: "抛异常：" + (err && err.message ? err.message : err) }); continue; }
      if (!finite(got) || Math.abs(got - CASES[i].expect) > 1e-9) failures.push({ name: CASES[i].name, why: "期望 " + CASES[i].expect + "，得到 " + got });
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    TYPE_LABELS: TYPE_LABELS,
    makeQuestion: makeQuestion,
    scoreQuestion: scoreQuestion,
    scoreQuiz: scoreQuiz,
    parsePairs: parsePairs,
    splitSequence: splitSequence,
    splitBlanks: splitBlanks,
    CASES: CASES,
    runSelfTest: runSelfTest
  };
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.SelfTestQuizEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
