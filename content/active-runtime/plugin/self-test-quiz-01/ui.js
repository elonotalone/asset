(function () {
  "use strict";

  var E = window.SelfTestQuizEngine;
  var POINTS = 10;
  var KINDS = [
    { id: "single", name: "单选" },
    { id: "truefalse", name: "判断" },
    { id: "multi", name: "多选" },
    { id: "blanks", name: "填空" },
    { id: "numeric", name: "数值" },
    { id: "ordering", name: "排序" },
    { id: "matching", name: "匹配" }
  ];

  var quiz = { questions: [], answers: [], results: [], index: -1 };
  var working = {};
  var draft = null;
  var els = {};

  function node(tag, cls, text) {
    var out = document.createElement(tag);
    if (cls) out.className = cls;
    if (text !== undefined && text !== null) out.textContent = String(text);
    return out;
  }
  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function lines(raw) {
    return String(raw || "").split(/\r?\n/).map(function (v) { return v.trim(); }).filter(Boolean);
  }
  function score(n) { return String(Math.round(Number(n) * 100) / 100); }
  function excerpt(text, limit) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? value.slice(0, limit) + "…" : value;
  }
  function hashOf(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100003;
    return h;
  }
  function reshuffle(items) {
    var out = items.slice().sort(function (a, b) {
      return hashOf(a) - hashOf(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
    var unchanged = items.length > 1 && out.every(function (v, i) { return v === items[i]; });
    if (unchanged) out.push(out.shift());
    return out;
  }
  function field(kind, placeholder, label) {
    var input = document.createElement(kind === "area" ? "textarea" : "input");
    if (kind !== "area") input.type = kind;
    if (kind === "area") input.rows = 2;
    input.className = "write-line";
    input.spellcheck = false;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", label || placeholder);
    return input;
  }

  function newDraft(kind) {
    return {
      kind: kind || "single",
      options: [],
      correct: [],
      blanks: [""],
      pairs: [{ left: "", right: "" }, { left: "", right: "" }],
      numeric: { value: "", unit: "", tolerance: "2" },
      sequence: ""
    };
  }

  /* ---------- 写题：题型、答案与解析都长在这张题页上 ---------- */

  function renderKinds() {
    clear(els.kinds);
    KINDS.forEach(function (kind) {
      var button = node("button", "kind", kind.name);
      button.type = "button";
      button.setAttribute("aria-pressed", draft.kind === kind.id ? "true" : "false");
      if (draft.kind === kind.id) button.classList.add("kind-on");
      button.addEventListener("click", function () {
        if (draft.kind === kind.id) return;
        draft = newDraft(kind.id);
        renderKinds();
        renderBuild();
      });
      els.kinds.appendChild(button);
    });
  }

  function markRows(container, options, multiple) {
    clear(container);
    options.forEach(function (option, index) {
      var row = node("label", "mark");
      var box = document.createElement("input");
      box.type = multiple ? "checkbox" : "radio";
      box.name = "correct-mark";
      box.value = option;
      box.checked = draft.correct.indexOf(option) >= 0;
      box.addEventListener("change", function () {
        if (multiple) {
          var at = draft.correct.indexOf(option);
          if (box.checked && at < 0) draft.correct.push(option);
          if (!box.checked && at >= 0) draft.correct.splice(at, 1);
        } else {
          draft.correct = box.checked ? [option] : [];
        }
      });
      row.appendChild(box);
      row.appendChild(node("span", "mark-text", option));
      row.dataset.index = String(index);
      container.appendChild(row);
    });
  }

  function buildChoice(box, multiple) {
    var options = field("area", "写下可选的答案，一行一个", "可选的答案");
    options.rows = 4;
    box.appendChild(options);
    box.appendChild(node("p", "build-lead", multiple ? "哪些是对的" : "哪一个是对的"));
    var marks = node("div", "marks");
    box.appendChild(marks);
    options.addEventListener("input", function () {
      draft.options = lines(options.value);
      draft.correct = draft.correct.filter(function (item) { return draft.options.indexOf(item) >= 0; });
      markRows(marks, draft.options, multiple);
    });
    markRows(marks, draft.options, multiple);
  }

  function buildTrueFalse(box) {
    box.appendChild(node("p", "build-lead", "这句话是对的还是错的"));
    var marks = node("div", "marks");
    box.appendChild(marks);
    draft.options = ["正确", "错误"];
    markRows(marks, draft.options, false);
  }

  function buildBlanks(box) {
    box.appendChild(node("p", "build-lead", "每一空该填什么"));
    var list = node("div", "blank-build");
    box.appendChild(list);
    function addRow(index) {
      var row = node("div", "blank-row");
      row.appendChild(node("span", "blank-tag", "第 " + (index + 1) + " 空"));
      var input = field("text", "这一空的答案", "第 " + (index + 1) + " 空的答案");
      input.value = draft.blanks[index] || "";
      input.addEventListener("input", function () {
        draft.blanks[index] = input.value;
        if (index === draft.blanks.length - 1 && input.value.trim()) {
          draft.blanks.push("");
          addRow(draft.blanks.length - 1);
        }
      });
      row.appendChild(input);
      list.appendChild(row);
    }
    draft.blanks.forEach(function (_, index) { addRow(index); });
  }

  function buildNumeric(box) {
    box.appendChild(node("p", "build-lead", "标准的数、它的单位，以及允许差多少"));
    var row = node("div", "numeric-build");
    var value = field("text", "标准答案的数", "标准答案的数");
    var unit = field("text", "单位，例如 mg", "答案单位");
    var tolerance = field("text", "2", "允许的相对误差百分比");
    tolerance.value = draft.numeric.tolerance;
    tolerance.classList.add("write-narrow");
    value.addEventListener("input", function () { draft.numeric.value = value.value; });
    unit.addEventListener("input", function () { draft.numeric.unit = unit.value; });
    tolerance.addEventListener("input", function () { draft.numeric.tolerance = tolerance.value; });
    row.appendChild(value);
    row.appendChild(unit);
    var tolerateWrap = node("span", "tolerance-wrap");
    tolerateWrap.appendChild(node("span", "blank-tag", "允许差"));
    tolerateWrap.appendChild(tolerance);
    tolerateWrap.appendChild(node("span", "blank-tag", "%"));
    row.appendChild(tolerateWrap);
    box.appendChild(row);
  }

  function buildOrdering(box) {
    box.appendChild(node("p", "build-lead", "一行写一项，从上往下就是正确顺序"));
    var area = field("area", "第一项\n第二项\n第三项", "正确顺序");
    area.rows = 4;
    area.addEventListener("input", function () { draft.sequence = area.value; });
    box.appendChild(area);
  }

  function buildMatching(box) {
    box.appendChild(node("p", "build-lead", "左边一项，右边它该配的那一项"));
    var list = node("div", "pair-build");
    box.appendChild(list);
    function addRow(index) {
      var pair = draft.pairs[index];
      var row = node("div", "pair-row");
      var left = field("text", "左边这一项", "第 " + (index + 1) + " 组左项");
      var right = field("text", "它该配的那一项", "第 " + (index + 1) + " 组右项");
      left.value = pair.left;
      right.value = pair.right;
      function touched() {
        pair.left = left.value;
        pair.right = right.value;
        if (index === draft.pairs.length - 1 && pair.left.trim() && pair.right.trim()) {
          draft.pairs.push({ left: "", right: "" });
          addRow(draft.pairs.length - 1);
        }
      }
      left.addEventListener("input", touched);
      right.addEventListener("input", touched);
      row.appendChild(left);
      row.appendChild(node("span", "pair-link", "配"));
      row.appendChild(right);
      list.appendChild(row);
    }
    draft.pairs.forEach(function (_, index) { addRow(index); });
  }

  function renderBuild() {
    clear(els.build);
    var box = node("div", "build-block");
    if (draft.kind === "single") buildChoice(box, false);
    else if (draft.kind === "multi") buildChoice(box, true);
    else if (draft.kind === "truefalse") buildTrueFalse(box);
    else if (draft.kind === "blanks") buildBlanks(box);
    else if (draft.kind === "numeric") buildNumeric(box);
    else if (draft.kind === "ordering") buildOrdering(box);
    else if (draft.kind === "matching") buildMatching(box);
    els.build.appendChild(box);
  }

  function draftAnswer() {
    if (draft.kind === "single" || draft.kind === "truefalse") return draft.correct[0] || "";
    if (draft.kind === "multi") return draft.correct;
    if (draft.kind === "blanks") return draft.blanks.filter(function (v) { return String(v).trim(); });
    if (draft.kind === "numeric") return draft.numeric.value;
    if (draft.kind === "ordering") return lines(draft.sequence);
    if (draft.kind === "matching") {
      var pairs = {};
      draft.pairs.forEach(function (pair) {
        if (String(pair.left).trim() && String(pair.right).trim()) pairs[pair.left.trim()] = pair.right.trim();
      });
      return pairs;
    }
    return "";
  }

  function saveQuestion() {
    var made = E.makeQuestion({
      id: quiz.questions.length + 1,
      type: draft.kind,
      prompt: els.prompt.value,
      options: draft.options,
      answer: draftAnswer(),
      unit: draft.numeric.unit,
      tolerancePct: draft.numeric.tolerance,
      points: POINTS,
      topic: els.topic.value,
      explanation: els.explanation.value
    });
    if (made.error) { els.warn.textContent = made.error; return; }
    els.warn.textContent = "";
    quiz.questions.push(made.question);
    quiz.answers.push(null);
    quiz.results.push(null);
    quiz.index = quiz.questions.length - 1;
    els.prompt.value = "";
    els.topic.value = "";
    els.explanation.value = "";
    draft = newDraft("single");
    renderKinds();
    renderBuild();
    show();
  }

  /* ---------- 作答与判分：都在同一张题页上 ---------- */

  function keyText(q) {
    if (q.type === "multi") return q.answer.join("、");
    if (q.type === "blanks") return q.answer.join(" | ");
    if (q.type === "numeric") return score(q.answer) + " " + q.unit;
    if (q.type === "ordering") return q.answer.join(" → ");
    if (q.type === "matching") {
      return Object.keys(q.answer).map(function (left) { return left + " 配 " + q.answer[left]; }).join("；");
    }
    return String(q.answer);
  }

  function choiceArea(q, graded, given) {
    var box = node("div", "answer-area");
    var multiple = q.type === "multi";
    var picked = multiple ? (given || []) : [given || ""];
    q.options.forEach(function (option) {
      var row = node("label", "choice");
      var input = document.createElement("input");
      input.type = multiple ? "checkbox" : "radio";
      input.name = "answer";
      input.value = option;
      if (graded) {
        input.disabled = true;
        input.checked = picked.indexOf(option) >= 0;
      }
      row.appendChild(input);
      row.appendChild(node("span", "choice-text", option));
      if (graded) {
        var isKey = multiple
          ? q.answer.some(function (v) { return v === option; })
          : String(q.answer) === option;
        var mine = picked.indexOf(option) >= 0;
        if (mine) { row.classList.add("chosen"); row.appendChild(node("span", "tag", "你选的")); }
        if (isKey) { row.classList.add("keyed"); row.appendChild(node("span", "tag tag-key", "标准答案")); }
        if (mine && !isKey) row.classList.add("wrong");
      }
      box.appendChild(row);
    });
    return box;
  }

  function blanksArea(q, graded, given) {
    var box = node("div", "answer-area");
    q.answer.forEach(function (expected, index) {
      var row = node("div", "blank-row");
      row.appendChild(node("span", "blank-tag", "第 " + (index + 1) + " 空"));
      if (graded) {
        var mine = String((given || [])[index] || "");
        row.appendChild(node("span", "given", mine || "没填"));
        row.appendChild(node("span", "tag tag-key", "标准答案 " + expected));
      } else {
        var input = field("text", "这一空", "第 " + (index + 1) + " 空");
        input.dataset.blank = String(index);
        row.appendChild(input);
      }
      box.appendChild(row);
    });
    return box;
  }

  function numericArea(q, graded, given) {
    var box = node("div", "answer-area");
    var row = node("div", "numeric-answer");
    if (graded) {
      var mine = given || {};
      row.appendChild(node("span", "given", (String(mine.value || "").trim() || "没填") + " " + (String(mine.unit || "").trim() || "没写单位")));
      box.appendChild(row);
      var key = node("p", "key-line");
      key.appendChild(node("span", "tag tag-key", "标准答案 " + score(q.answer) + " " + q.unit));
      key.appendChild(node("span", "tag", "允许差 " + q.tolerancePct + "%"));
      box.appendChild(key);
      return box;
    }
    var value = field("text", "你算出的数", "你算出的数");
    value.id = "answer-value";
    var unit = field("text", "单位", "你写的单位");
    unit.id = "answer-unit";
    unit.classList.add("write-narrow");
    row.appendChild(value);
    row.appendChild(unit);
    box.appendChild(row);
    return box;
  }

  function orderingArea(q, graded, given) {
    var box = node("div", "answer-area");
    if (graded) {
      var mine = node("div", "order-read");
      (given || []).forEach(function (item, index) {
        mine.appendChild(node("div", "order-line", (index + 1) + ". " + item));
      });
      box.appendChild(node("p", "build-lead", "你排的顺序"));
      box.appendChild(mine);
      var key = node("div", "order-read order-key");
      q.answer.forEach(function (item, index) {
        key.appendChild(node("div", "order-line", (index + 1) + ". " + item));
      });
      box.appendChild(node("p", "build-lead", "标准顺序"));
      box.appendChild(key);
      return box;
    }
    if (!working[q.id]) working[q.id] = reshuffle(q.answer);
    function draw(focusAt, focusDir) {
      clear(box);
      working[q.id].forEach(function (item, index) {
        var row = node("div", "order-row");
        row.appendChild(node("span", "order-num", index + 1));
        row.appendChild(node("span", "order-text", item));
        var up = node("button", "nudge", "上移");
        up.type = "button";
        up.disabled = index === 0;
        up.addEventListener("click", function () { move(index, -1); });
        var down = node("button", "nudge", "下移");
        down.type = "button";
        down.disabled = index === working[q.id].length - 1;
        down.addEventListener("click", function () { move(index, 1); });
        row.appendChild(up);
        row.appendChild(down);
        box.appendChild(row);
        if (index === focusAt) {
          var keep = focusDir < 0 ? up : down;
          if (!keep.disabled) keep.focus();
        }
      });
    }
    function move(index, step) {
      var list = working[q.id];
      list.splice(index + step, 0, list.splice(index, 1)[0]);
      draw(index + step, step);
    }
    draw(-1, 0);
    return box;
  }

  function matchingArea(q, graded, given) {
    var box = node("div", "answer-area");
    var lefts = Object.keys(q.answer);
    var rights = reshuffle(lefts.map(function (left) { return q.answer[left]; }));
    lefts.forEach(function (left, index) {
      var row = node("div", "pair-row");
      row.appendChild(node("span", "pair-left", left));
      row.appendChild(node("span", "pair-link", "配"));
      if (graded) {
        var mine = String((given || {})[left] || "");
        row.appendChild(node("span", "given", mine || "没配"));
        row.appendChild(node("span", "tag tag-key", "标准答案 " + q.answer[left]));
      } else {
        var select = document.createElement("select");
        select.className = "write-line";
        select.dataset.left = left;
        select.setAttribute("aria-label", left + " 该配哪一项");
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "还没配";
        select.appendChild(blank);
        rights.forEach(function (right) {
          var option = document.createElement("option");
          option.value = right;
          option.textContent = right;
          select.appendChild(option);
        });
        row.appendChild(select);
      }
      box.appendChild(row);
    });
    return box;
  }

  function answerArea(q, graded, given) {
    if (q.type === "single" || q.type === "truefalse" || q.type === "multi") return choiceArea(q, graded, given);
    if (q.type === "blanks") return blanksArea(q, graded, given);
    if (q.type === "numeric") return numericArea(q, graded, given);
    if (q.type === "ordering") return orderingArea(q, graded, given);
    return matchingArea(q, graded, given);
  }

  function readAnswer(q) {
    if (q.type === "single" || q.type === "truefalse") {
      var picked = els.live.querySelector('input[name="answer"]:checked');
      return picked ? picked.value : "";
    }
    if (q.type === "multi") {
      return Array.prototype.map.call(els.live.querySelectorAll('input[name="answer"]:checked'), function (input) {
        return input.value;
      });
    }
    if (q.type === "blanks") {
      return q.answer.map(function (_, index) {
        var input = els.live.querySelector('input[data-blank="' + index + '"]');
        return input ? input.value : "";
      });
    }
    if (q.type === "numeric") {
      return {
        value: document.getElementById("answer-value").value,
        unit: document.getElementById("answer-unit").value
      };
    }
    if (q.type === "ordering") return (working[q.id] || []).slice();
    var pairs = {};
    Array.prototype.forEach.call(els.live.querySelectorAll("select[data-left]"), function (select) {
      if (select.value) pairs[select.dataset.left] = select.value;
    });
    return pairs;
  }

  function verdictBlock(q, result, given) {
    var box = node("div", "verdict");
    var full = Math.abs(result.earned - q.points) < 1e-9;
    box.appendChild(node("p", "verdict-score" + (full ? " verdict-full" : ""), score(result.earned) + " / " + score(q.points) + " 分"));
    box.appendChild(node("p", "verdict-reason", result.reason));
    if (q.type === "single" || q.type === "truefalse" || q.type === "multi") {
      var mine = q.type === "multi" ? (given || []).join("、") : String(given || "");
      box.appendChild(node("p", "verdict-mine", "你选的是 " + (mine || "没选") + "；标准答案是 " + keyText(q)));
    }
    if (q.explanation && q.explanation !== "未填写解析") {
      box.appendChild(node("p", "verdict-note", q.explanation));
    }
    return box;
  }

  function weakest() {
    var buckets = {};
    quiz.questions.forEach(function (q, index) {
      var result = quiz.results[index];
      if (!result) return;
      var label = q.topic && q.topic !== "未分类" ? q.topic : excerpt(q.prompt, 18);
      if (!buckets[label]) buckets[label] = { earned: 0, total: 0 };
      buckets[label].earned += result.earned;
      buckets[label].total += q.points;
    });
    var worst = null;
    Object.keys(buckets).forEach(function (label) {
      var bucket = buckets[label];
      var ratio = bucket.total ? bucket.earned / bucket.total : 1;
      if (ratio >= 1 - 1e-9) return;
      if (!worst || ratio < worst.ratio) worst = { label: label, ratio: ratio, earned: bucket.earned, total: bucket.total };
    });
    return worst;
  }

  function renderWrapUp() {
    var report = E.scoreQuiz(quiz.questions, quiz.answers);
    clear(els.wrapup);
    els.wrapup.appendChild(node("p", "wrap-score", "这一卷 " + score(report.earned) + " / " + score(report.total) + " 分"));
    var worst = weakest();
    els.wrapup.appendChild(node("p", "wrap-note", worst
      ? "最该回头看的是「" + worst.label + "」，这里只拿了 " + score(worst.earned) + " / " + score(worst.total) + " 分。"
      : "每一题都拿了满分。"));
    els.wrapup.hidden = false;
  }

  function renderLive() {
    var q = quiz.questions[quiz.index];
    var result = quiz.results[quiz.index];
    var given = quiz.answers[quiz.index];
    var graded = !!result;
    clear(els.live);
    els.live.appendChild(node("p", "prompt-read", q.prompt));
    if (q.topic && q.topic !== "未分类") els.live.appendChild(node("p", "topic-read", q.topic));
    els.live.appendChild(answerArea(q, graded, given));

    if (graded) {
      els.live.appendChild(verdictBlock(q, result, given));
      var act = node("div", "act");
      var pending = -1;
      for (var i = 0; i < quiz.questions.length; i++) if (!quiz.results[i]) { pending = i; break; }
      if (pending >= 0) {
        var next = node("button", "go", "答下一题：" + excerpt(quiz.questions[pending].prompt, 14));
        next.type = "button";
        next.addEventListener("click", function () { quiz.index = pending; els.wrapup.hidden = true; show(); });
        act.appendChild(next);
      }
      var again = node("button", "go go-quiet", "再出一道题");
      again.type = "button";
      again.addEventListener("click", function () { quiz.index = -1; els.wrapup.hidden = true; show(); });
      act.appendChild(again);
      els.live.appendChild(act);
    } else {
      var act2 = node("div", "act");
      var submit = node("button", "go", "看看我这题会不会");
      submit.type = "button";
      submit.addEventListener("click", function () {
        quiz.answers[quiz.index] = readAnswer(q);
        quiz.results[quiz.index] = E.scoreQuestion(q, quiz.answers[quiz.index]);
        var done = quiz.results.every(function (item) { return !!item; });
        show();
        if (done) renderWrapUp();
      });
      act2.appendChild(submit);
      els.live.appendChild(act2);
    }
  }

  function renderEdge() {
    var composing = quiz.index < 0;
    var count = quiz.questions.length;
    if (count === 0) { els.edge.hidden = true; return; }
    var prev = composing ? count - 1 : quiz.index - 1;
    var next = composing ? -1 : quiz.index + 1;
    var hasNext = next >= 0 && next < count;
    els.edge.hidden = prev < 0 && !hasNext;
    els.prev.hidden = prev < 0;
    els.next.hidden = !hasNext;
    if (prev >= 0) {
      els.prev.querySelector(".edge-dir").textContent = composing ? "回到刚才那题" : "上一题";
      els.prevName.textContent = excerpt(quiz.questions[prev].prompt, 16);
      els.prev.onclick = function () { quiz.index = prev; els.wrapup.hidden = true; show(); };
    }
    if (hasNext) {
      els.nextName.textContent = excerpt(quiz.questions[next].prompt, 16);
      els.next.onclick = function () { quiz.index = next; els.wrapup.hidden = true; show(); };
    }
  }

  function show() {
    var composing = quiz.index < 0;
    els.compose.hidden = !composing;
    els.live.hidden = composing;
    if (composing) {
      var written = !!els.prompt.value.trim();
      els.how.hidden = !written;
      els.build.hidden = !written;
      els.extra.hidden = !written;
      els.composeAct.hidden = !written;
      els.prompt.focus();
    } else {
      renderLive();
    }
    renderEdge();
  }

  function mount() {
    els.prompt = document.getElementById("prompt");
    els.how = document.getElementById("how");
    els.kinds = document.getElementById("kinds");
    els.build = document.getElementById("build");
    els.extra = document.getElementById("extra");
    els.composeAct = document.getElementById("compose-act");
    els.warn = document.getElementById("compose-warn");
    els.topic = document.getElementById("topic");
    els.explanation = document.getElementById("explanation");
    els.compose = document.getElementById("compose");
    els.live = document.getElementById("live");
    els.wrapup = document.getElementById("wrapup");
    els.edge = document.getElementById("edge");
    els.prev = document.getElementById("go-prev");
    els.next = document.getElementById("go-next");
    els.prevName = document.getElementById("prev-name");
    els.nextName = document.getElementById("next-name");

    draft = newDraft("single");
    renderKinds();
    renderBuild();
    els.prompt.addEventListener("input", function () {
      if (quiz.index < 0) show();
    });
    document.getElementById("start-answer").addEventListener("click", saveQuestion);
    show();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
