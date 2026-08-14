(function () {
  "use strict";

  var E = window.VoiceoverScriptEngine;
  var state = { paragraphs: [], editingIndex: null, sequence: 0 };
  var els = {};

  function el(tag, cls, value) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function numericValue(node, fallback) {
    var n = Number(node.value);
    return isFinite(n) ? n : fallback;
  }

  function settings() {
    return {
      chineseRate: Math.max(1, numericValue(els.chineseRate, E.DEFAULTS.chineseRate)),
      englishRate: Math.max(1, numericValue(els.englishRate, E.DEFAULTS.englishRate)),
      fps: Math.max(1, numericValue(els.fps, E.DEFAULTS.fps))
    };
  }

  function targetSeconds() {
    if (!String(els.targetSeconds.value).trim()) return 0;
    return Math.max(0, numericValue(els.targetSeconds, 0));
  }

  function showEditor(index) {
    state.editingIndex = typeof index === "number" ? index : null;
    var paragraph = state.editingIndex === null ? null : state.paragraphs[state.editingIndex];
    els.editor.hidden = false;
    els.editorTitle.textContent = paragraph ? "编辑第 " + (state.editingIndex + 1) + " 段" : "添加段落";
    els.segmentTitle.value = paragraph ? paragraph.title : "";
    els.languageMode.value = paragraph ? paragraph.mode : "zh";
    els.segmentText.value = paragraph ? paragraph.text : "";
    els.pauseSeconds.value = paragraph ? String(paragraph.pauseSeconds) : "0.5";
    els.subtitle.value = paragraph ? paragraph.subtitle : "";
    els.visualNote.value = paragraph ? paragraph.visualNote : "";
    els.segmentText.focus();
  }

  function hideEditor() {
    state.editingIndex = null;
    els.editor.hidden = true;
  }

  function saveSegment() {
    var spoken = els.segmentText.value.trim();
    if (!spoken) return;
    var paragraph = {
      id: state.editingIndex === null ? "segment-" + (++state.sequence) : state.paragraphs[state.editingIndex].id,
      title: els.segmentTitle.value.trim() || "未命名段落",
      mode: els.languageMode.value,
      text: spoken,
      pauseSeconds: Math.max(0, numericValue(els.pauseSeconds, 0)),
      subtitle: els.subtitle.value.trim(),
      visualNote: els.visualNote.value.trim()
    };
    if (state.editingIndex === null) state.paragraphs.push(paragraph);
    else state.paragraphs[state.editingIndex] = paragraph;
    hideEditor();
    render();
  }

  function deleteSegment(index) {
    state.paragraphs.splice(index, 1);
    hideEditor();
    render();
  }

  function loadDemo() {
    els.targetSeconds.value = "90";
    els.chineseRate.value = "216";
    els.englishRate.value = "150";
    els.fps.value = "25";
    state.paragraphs = E.clone(E.DEMO);
    state.sequence = state.paragraphs.length;
    hideEditor();
    render();
  }

  function renderConclusions(timeline) {
    var target = targetSeconds();
    var set = settings();
    if (!target) {
      els.timeRange.textContent = "待填写";
      els.budget.textContent = "待填写";
      els.remaining.textContent = "待填写";
      els.remaining.className = "";
    } else {
      els.timeRange.textContent = "0:00 → " + E.formatClock(target);
      els.budget.textContent = "约 " + E.budgetFor(target, set.chineseRate) + " 字";
      var remaining = target - timeline.totalSeconds;
      els.remaining.textContent = (remaining < 0 ? "超出 " : "") + E.formatClock(Math.abs(remaining));
      els.remaining.className = remaining < 0 ? "negative" : "";
    }
    els.used.textContent = E.formatClock(timeline.totalSeconds);
    els.calculationBasis.textContent = "中文预算 = 目标秒数 × " + set.chineseRate + " ÷ 60；段落停顿固定；累计时间码按 " + set.fps + " fps 对齐到整帧。";
  }

  function appendAction(cell, label, handler, className) {
    var button = el("button", className || null, label);
    button.type = "button";
    button.addEventListener("click", handler);
    cell.appendChild(button);
  }

  function renderTable(timeline) {
    clear(els.timelineBody);
    timeline.rows.forEach(function (row, index) {
      var tr = el("tr");
      tr.setAttribute("data-index", String(index));
      tr.setAttribute("data-start-frame", String(row.startFrame));
      tr.setAttribute("data-end-frame", String(row.endFrame));

      var title = el("td");
      title.appendChild(el("span", "row-title", (index + 1) + ". " + (row.paragraph.title || "未命名段落")));
      title.appendChild(el("span", "row-sub", row.paragraph.subtitle || "无单独字幕"));
      tr.appendChild(title);

      var count = el("td");
      count.appendChild(el("span", "row-title", E.languageLabel(row.paragraph.mode)));
      count.appendChild(el("span", "row-sub", E.countLabel(row)));
      tr.appendChild(count);
      tr.appendChild(el("td", "numeric start-code", row.startCode));
      tr.appendChild(el("td", "numeric end-code", row.endCode));
      tr.appendChild(el("td", "numeric", row.speakingSeconds.toFixed(2) + " s"));
      tr.appendChild(el("td", "numeric", row.pauseSeconds.toFixed(1) + " s"));

      var actions = el("td", "row-actions");
      appendAction(actions, "编辑", function () { showEditor(index); }, "edit-segment");
      appendAction(actions, "删除", function () { deleteSegment(index); }, "delete-segment");
      tr.appendChild(actions);
      els.timelineBody.appendChild(tr);
    });
    els.emptyState.hidden = timeline.rows.length > 0;
    els.rowCount.textContent = timeline.rows.length + " 段";
  }

  function render() {
    var set = settings();
    var timeline = E.buildTimeline(state.paragraphs, set);
    renderConclusions(timeline);
    renderTable(timeline);
    els.addSegment.disabled = !targetSeconds();
    els.addSegment.textContent = state.paragraphs.length ? "添加下一段" : "添加第一段";
    els.exportOutput.value = E.exportScript(state.paragraphs, set, targetSeconds());
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(el("li", null, failure.name + " —— " + failure.why));
    });
    if (!report.failures.length) {
      els.testDetail.appendChild(el("li", null, "预算、固定停顿、帧对齐、后续平移与中英计数均已核对。"));
    }
  }

  function mount() {
    els.targetSeconds = document.getElementById("target-seconds");
    els.chineseRate = document.getElementById("chinese-rate");
    els.englishRate = document.getElementById("english-rate");
    els.fps = document.getElementById("fps");
    els.addSegment = document.getElementById("add-segment");
    els.editor = document.getElementById("editor");
    els.editorTitle = document.getElementById("editor-title");
    els.segmentTitle = document.getElementById("segment-title");
    els.languageMode = document.getElementById("language-mode");
    els.segmentText = document.getElementById("segment-text");
    els.pauseSeconds = document.getElementById("pause-seconds");
    els.subtitle = document.getElementById("subtitle");
    els.visualNote = document.getElementById("visual-note");
    els.timeRange = document.getElementById("time-range");
    els.budget = document.getElementById("budget");
    els.used = document.getElementById("used");
    els.remaining = document.getElementById("remaining");
    els.calculationBasis = document.getElementById("calculation-basis");
    els.timelineBody = document.getElementById("timeline-body");
    els.emptyState = document.getElementById("empty-state");
    els.rowCount = document.getElementById("row-count");
    els.exportOutput = document.getElementById("export-output");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    [els.targetSeconds, els.chineseRate, els.englishRate, els.fps].forEach(function (node) {
      node.addEventListener("input", render);
    });
    els.addSegment.addEventListener("click", function () { showEditor(null); });
    document.getElementById("save-segment").addEventListener("click", saveSegment);
    document.getElementById("cancel-edit").addEventListener("click", hideEditor);
    document.getElementById("load-demo").addEventListener("click", loadDemo);
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
