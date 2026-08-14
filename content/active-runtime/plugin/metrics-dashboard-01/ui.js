(function () {
  "use strict";

  var E = window.DashboardEngine;
  var state = { records: [], period: "", region: "", source: "" };
  var els = {};
  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function svg(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function field(parent, id, label, inputMode) {
    var row = el("div", "editor-field");
    var lab = el("label", null, label);
    lab.htmlFor = id;
    var input = el("input");
    input.id = id;
    input.type = "text";
    input.autocomplete = "off";
    if (inputMode) input.inputMode = inputMode;
    row.appendChild(lab);
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  function chooseSource(mode) {
    state.source = mode;
    document.querySelectorAll("[data-source]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-source") === mode ? "true" : "false");
    });
    clear(els.sourceEditor);
    if (mode === "app") {
      els.sourceMessage.textContent = "当前离线沙箱没有收到宿主 app 数据；请改用粘贴或手工创建，未读取时不会伪造结果。";
      return;
    }
    if (mode === "paste") renderPasteEditor();
    if (mode === "manual") renderManualEditor();
  }

  function renderManualEditor() {
    els.sourceMessage.textContent = "填一条真实记录；分段留空时使用参考边界 0.80 与 0.95。";
    var box = el("div", "editor");
    field(box, "manual-period", "时段");
    field(box, "manual-region", "地区");
    field(box, "manual-name", "指标名");
    field(box, "manual-actual", "实际", "decimal");
    field(box, "manual-target", "目标", "decimal");
    field(box, "manual-lower", "低段边界", "decimal");
    field(box, "manual-upper", "高段边界", "decimal");
    var add = el("button", "action", "加入看板");
    add.type = "button";
    add.id = "add-metric";
    add.addEventListener("click", function () {
      var made = E.record({
        period: document.getElementById("manual-period").value,
        region: document.getElementById("manual-region").value,
        name: document.getElementById("manual-name").value,
        actual: document.getElementById("manual-actual").value,
        target: document.getElementById("manual-target").value,
        lower: document.getElementById("manual-lower").value,
        upper: document.getElementById("manual-upper").value
      });
      if (made.error) { els.sourceMessage.textContent = made.error; return; }
      state.records.push(made.value);
      els.sourceMessage.textContent = "已加入「" + made.value.name + "」；右侧已按同一输入重算。";
      rebuildFilters();
      render();
    });
    box.appendChild(add);
    els.sourceEditor.appendChild(box);
  }

  function renderPasteEditor() {
    els.sourceMessage.textContent = "每行依次为：时段, 地区, 指标, 实际, 目标, 低段边界, 高段边界。边界可留空。";
    var box = el("div", "editor");
    var area = el("textarea");
    area.id = "paste-data";
    area.spellcheck = false;
    area.setAttribute("aria-label", "要粘贴的指标数据");
    box.appendChild(area);
    var load = el("button", "action", "载入这些数据");
    load.type = "button";
    load.id = "load-data";
    load.addEventListener("click", function () {
      var parsed = E.parseDataset(area.value);
      if (parsed.errors.length) { els.sourceMessage.textContent = parsed.errors.join("；"); return; }
      state.records = parsed.records;
      state.period = "";
      state.region = "";
      els.sourceMessage.textContent = "已载入 " + parsed.records.length + " 条真实记录。";
      rebuildFilters();
      render();
    });
    box.appendChild(load);
    els.sourceEditor.appendChild(box);
  }

  function fillSelect(select, allLabel, values, selected) {
    clear(select);
    var all = el("option", null, allLabel);
    all.value = "";
    select.appendChild(all);
    values.forEach(function (value) {
      var option = el("option", null, value);
      option.value = value;
      if (value === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  function rebuildFilters() {
    fillSelect(els.periodFilter, "全部时段", E.uniqueSorted(state.records, "period"), state.period);
    fillSelect(els.regionFilter, "全部地区", E.uniqueSorted(state.records, "region"), state.region);
  }

  function renderHeadline(rows) {
    var actual = document.getElementById("actual-value");
    var target = document.getElementById("target-value");
    var rate = document.getElementById("rate-value");
    rate.className = "";
    if (!rows.length) {
      actual.textContent = "数据缺失";
      target.textContent = "数据缺失";
      rate.textContent = "数据缺失";
      els.currentMetric.textContent = state.records.length ? "当前筛选没有记录" : "尚未取数";
      els.metricReason.textContent = "达成率 = 实际 / 目标；每个指标可以有自己的目标与分段。";
      return;
    }
    var row = rows[0];
    actual.textContent = E.formatNumber(row.actual);
    target.textContent = E.formatNumber(row.target);
    els.currentMetric.textContent = row.name + (rows.length > 1 ? " · 当前显示第一条，共 " + rows.length + " 条" : "");
    if (row.result.kind === "missing") {
      rate.textContent = "无法得到指标";
      els.metricReason.textContent = row.result.reason + "；没有把坏输入显示成真实的零。";
    } else {
      rate.textContent = row.result.symbol + " " + E.formatRate(row.result);
      rate.className = "band-" + row.result.band;
      els.metricReason.textContent = "达成率 = 实际 / 目标；本条边界为 " +
        row.result.lower.toFixed(2) + " 与 " + row.result.upper.toFixed(2) + "；" + row.result.label + "。";
    }
  }

  function renderTable(rows) {
    clear(els.metricRows);
    els.detailEmpty.style.display = rows.length ? "none" : "block";
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var result = row.result;
      var values = [row.name, row.period, row.region, E.formatNumber(row.actual), E.formatNumber(row.target),
        E.formatRate(result), result.kind === "value" ? result.symbol + " " + result.label : result.label + " · " + result.reason];
      values.forEach(function (value, index) {
        var td = el("td", index === 6 && result.kind === "value" ? "band-" + result.band : "", value);
        tr.appendChild(td);
      });
      els.metricRows.appendChild(tr);
    });
  }

  function renderChart(rows) {
    clear(els.chart);
    var usable = rows.filter(function (row) { return row.result.kind === "value"; });
    els.chart.style.display = usable.length ? "block" : "none";
    els.chartEmpty.style.display = usable.length ? "none" : "block";
    if (!usable.length) {
      els.chartEmpty.textContent = rows.length ? "无法得到指标；请检查目标与输入。" : "数据缺失";
      return;
    }
    var max = Math.max.apply(null, usable.map(function (row) { return Math.max(0, row.result.ratio); }).concat([1]));
    var width = 680 / usable.length;
    els.chart.appendChild(svg("line", { x1: 20, y1: 190, x2: 710, y2: 190, "class": "axis" }));
    usable.forEach(function (row, index) {
      var height = Math.max(2, Math.max(0, row.result.ratio) / max * 135);
      var x = 28 + index * width;
      var barWidth = Math.max(16, Math.min(72, width - 20));
      var rect = svg("rect", { x: x, y: 190 - height, width: barWidth, height: height, fill: row.result.color });
      rect.setAttribute("data-band", row.result.band);
      els.chart.appendChild(rect);
      els.chart.appendChild(svg("text", { x: x, y: 210 }, row.name));
      els.chart.appendChild(svg("text", { x: x, y: 190 - height - 8, "class": "chart-value" }, row.result.symbol + " " + E.formatRate(row.result)));
    });
  }

  function render() {
    var rows = E.filterRecords(state.records, { period: state.period, region: state.region });
    renderHeadline(rows);
    renderTable(rows);
    renderChart(rows);
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(el("li", null, failure.name + " —— " + failure.why));
    });
    if (!report.failures.length) els.testDetail.appendChild(el("li", null, "公式、边界、坏输入、三段线索与确定性全部通过。"));
  }

  function mount() {
    els.sourceEditor = document.getElementById("source-editor");
    els.sourceMessage = document.getElementById("source-message");
    els.periodFilter = document.getElementById("period-filter");
    els.regionFilter = document.getElementById("region-filter");
    els.currentMetric = document.getElementById("current-metric");
    els.metricReason = document.getElementById("metric-reason");
    els.chart = document.getElementById("metric-chart");
    els.chartEmpty = document.getElementById("chart-empty");
    els.metricRows = document.getElementById("metric-rows");
    els.detailEmpty = document.getElementById("detail-empty");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    document.querySelectorAll("[data-source]").forEach(function (button) {
      button.addEventListener("click", function () { chooseSource(button.getAttribute("data-source")); });
    });
    els.periodFilter.addEventListener("change", function () { state.period = els.periodFilter.value; render(); });
    els.regionFilter.addEventListener("change", function () { state.region = els.regionFilter.value; render(); });
    document.getElementById("run-test").addEventListener("click", runTest);
    rebuildFilters();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
