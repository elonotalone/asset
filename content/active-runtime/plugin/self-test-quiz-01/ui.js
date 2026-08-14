(function () {
  "use strict";

  var E = window.SelfTestQuizEngine;
  var questions = [];
  var els = {};

  function node(tag, cls, value) {
    var out = document.createElement(tag);
    if (cls) out.className = cls;
    if (value !== undefined && value !== null) out.textContent = String(value);
    return out;
  }
  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function value(id) { return document.getElementById(id).value; }
  function lines(raw) { return String(raw || "").split(/\r?\n/).map(function (v) { return v.trim(); }).filter(Boolean); }
  function points(n) { return Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 1); }

  var HELP = {
    single: { options: true, label: "标准答案", help: "填写选项中的一个完整答案。" },
    truefalse: { options: false, label: "标准答案", help: "只填“正确”或“错误”。" },
    multi: { options: true, label: "标准答案", help: "每行一个正确选项；错选会抵扣，但不会倒扣。" },
    blanks: { options: false, label: "各空标准答案", help: "用 | 分隔各空，例如：极限 | 导数。" },
    numeric: { options: false, label: "标准数值", help: "容差按答案绝对值的百分比计算，单位另填且必须匹配。" },
    ordering: { options: false, label: "正确顺序", help: "每行一个项目；按正确相邻对比例给部分分。" },
    matching: { options: false, label: "正确配对", help: "每行一组，例如：法国=巴黎。" }
  };

  function syncEditor() {
    var type = value("question-type"), help = HELP[type];
    els.optionsField.hidden = !help.options;
    els.answerLabel.textContent = help.label;
    els.answerHelp.textContent = help.help;
    Array.prototype.forEach.call(document.querySelectorAll(".numeric-only"), function (item) { item.hidden = type !== "numeric"; });
  }

  function readQuestion() {
    return E.makeQuestion({
      id: questions.length + 1,
      type: value("question-type"),
      prompt: value("prompt"),
      options: lines(value("options")),
      answer: value("correct-answer"),
      unit: value("unit"),
      tolerancePct: value("tolerance"),
      points: value("points"),
      topic: value("topic"),
      explanation: value("explanation")
    });
  }

  function resetEditor() {
    ["prompt", "options", "correct-answer", "unit", "topic", "explanation"].forEach(function (id) { document.getElementById(id).value = ""; });
  }

  function addChoice(container, q, inputType, option, index) {
    var label = node("label");
    var input = document.createElement("input");
    input.type = inputType;
    input.name = "answer-" + q.id;
    input.value = option;
    input.id = "answer-" + q.id + "-" + index;
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + option));
    container.appendChild(label);
  }

  function textAreaControl(q, hint) {
    var wrap = node("div", "answer-control");
    var input = document.createElement("textarea");
    input.rows = 3;
    input.id = "answer-" + q.id;
    input.spellcheck = false;
    wrap.appendChild(input);
    wrap.appendChild(node("small", null, hint));
    return wrap;
  }

  function renderQuestion(q) {
    var section = node("section", "question");
    section.dataset.questionId = String(q.id);
    var head = node("div", "question-head");
    head.appendChild(node("strong", null, q.id + ". " + q.prompt));
    head.appendChild(node("span", "question-meta", E.TYPE_LABELS[q.type] + " · " + points(q.points) + " 分 · " + q.topic));
    section.appendChild(head);
    var control = node("div", "answer-control");

    if (q.type === "single" || q.type === "truefalse" || q.type === "multi") {
      for (var i = 0; i < q.options.length; i++) addChoice(control, q, q.type === "multi" ? "checkbox" : "radio", q.options[i], i);
      section.appendChild(control);
    } else if (q.type === "blanks") {
      for (var b = 0; b < q.answer.length; b++) {
        var blank = document.createElement("input");
        blank.type = "text";
        blank.id = "answer-" + q.id + "-blank-" + b;
        blank.placeholder = "第 " + (b + 1) + " 空";
        blank.spellcheck = false;
        control.appendChild(blank);
      }
      section.appendChild(control);
    } else if (q.type === "numeric") {
      var group = node("div", "numeric-answer");
      var numeric = document.createElement("input");
      numeric.type = "number";
      numeric.step = "any";
      numeric.id = "answer-" + q.id + "-value";
      numeric.placeholder = "数值";
      var unit = document.createElement("input");
      unit.type = "text";
      unit.id = "answer-" + q.id + "-unit";
      unit.placeholder = "单位";
      group.appendChild(numeric);
      group.appendChild(unit);
      control.appendChild(group);
      control.appendChild(node("small", null, "相对容差 " + q.tolerancePct + "%；数值与单位同时参与判分。"));
      section.appendChild(control);
    } else if (q.type === "ordering") {
      section.appendChild(textAreaControl(q, "每行一个项目，按你认为正确的顺序填写。"));
    } else if (q.type === "matching") {
      section.appendChild(textAreaControl(q, "每行填写一组“左项=右项”。"));
    }
    return section;
  }

  function updateSummary() {
    var total = questions.reduce(function (sum, q) { return sum + q.points; }, 0);
    els.questionCount.textContent = questions.length + " 道题";
    els.paperPoints.textContent = points(total) + " 分";
    els.scoreValue.textContent = "0 / " + points(total);
    els.basisLine.textContent = questions.length
      ? "共 " + questions.length + " 道题；一道题也可提交。所有单题得分均夹在 0 与该题分值之间。"
      : "当前零道题；判分口径已列在左侧。一道题也能开始作答。";
    els.emptyState.hidden = questions.length > 0;
    els.submit.disabled = questions.length === 0;
    els.add.textContent = questions.length === 0 ? "出第一道题" : "再出一道题";
  }

  function addQuestion() {
    var made = readQuestion();
    if (made.error) { els.error.textContent = made.error; return; }
    els.error.textContent = "";
    questions.push(made.question);
    els.questionList.appendChild(renderQuestion(made.question));
    resetEditor();
    updateSummary();
  }

  function readResponse(q) {
    if (q.type === "single" || q.type === "truefalse") {
      var chosen = document.querySelector('input[name="answer-' + q.id + '"]:checked');
      return chosen ? chosen.value : "";
    }
    if (q.type === "multi") {
      return Array.prototype.map.call(document.querySelectorAll('input[name="answer-' + q.id + '"]:checked'), function (input) { return input.value; });
    }
    if (q.type === "blanks") {
      return q.answer.map(function (_, i) { return value("answer-" + q.id + "-blank-" + i); });
    }
    if (q.type === "numeric") return { value: value("answer-" + q.id + "-value"), unit: value("answer-" + q.id + "-unit") };
    if (q.type === "ordering") return E.splitSequence(value("answer-" + q.id));
    if (q.type === "matching") return E.parsePairs(value("answer-" + q.id));
    return "";
  }

  function submitQuiz(event) {
    event.preventDefault();
    var responses = questions.map(readResponse);
    var report = E.scoreQuiz(questions, responses);
    els.scoreValue.textContent = points(report.earned) + " / " + points(report.total);
    clear(els.scoreRows);
    els.breakdownEmpty.hidden = true;
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i], result = report.rows[i], tr = document.createElement("tr");
      tr.appendChild(node("td", null, String(q.id)));
      tr.appendChild(node("td", null, E.TYPE_LABELS[q.type]));
      tr.appendChild(node("td", null, q.topic));
      tr.appendChild(node("td", null, points(result.earned) + " / " + points(q.points)));
      var detail = node("td", "reason", result.reason);
      detail.appendChild(node("span", "explanation", "解析：" + q.explanation));
      tr.appendChild(detail);
      els.scoreRows.appendChild(tr);
    }
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) { els.testDetail.appendChild(node("li", null, failure.name + " —— " + failure.why)); });
    if (report.failures.length === 0) els.testDetail.appendChild(node("li", null, "六种题型均含全对、部分输入和全错用例；所有分数都经过上下界夹取。"));
  }

  function mount() {
    els.optionsField = document.getElementById("options-field");
    els.answerLabel = document.getElementById("answer-label");
    els.answerHelp = document.getElementById("answer-help");
    els.error = document.getElementById("editor-error");
    els.add = document.getElementById("add-question");
    els.questionCount = document.getElementById("question-count");
    els.paperPoints = document.getElementById("paper-points");
    els.scoreValue = document.getElementById("score-value");
    els.basisLine = document.getElementById("basis-line");
    els.emptyState = document.getElementById("empty-state");
    els.questionList = document.getElementById("question-list");
    els.submit = document.getElementById("submit-answers");
    els.scoreRows = document.getElementById("score-rows");
    els.breakdownEmpty = document.getElementById("breakdown-empty");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    document.getElementById("question-type").addEventListener("change", syncEditor);
    els.add.addEventListener("click", addQuestion);
    document.getElementById("quiz-form").addEventListener("submit", submitQuiz);
    document.getElementById("run-test").addEventListener("click", runTest);
    syncEditor();
    updateSummary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
