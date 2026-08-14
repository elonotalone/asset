(function () {
  "use strict";

  var E = window.LiteratureMatrixEngine;

  /* 一列一个抽取维度，宽度按内容定 —— 平均分会把结论压成一条缝。 */
  var WIDE = { "研究对象": 1, "干预或暴露": 1, "对照": 1, "主要结局": 1, "结论": 1 };
  var NUMERIC = { "样本量": 1, "效应量": 1, "随访": 1 };
  var WIDTH = {
    "作者年份": 210, "研究设计": 150, "研究对象": 210, "样本量": 96,
    "干预或暴露": 200, "对照": 170, "主要结局": 260, "效应量": 120,
    "随访": 110, "地区": 120, "结论": 300
  };
  var STATUS_ORDER = [
    "included", "duplicate", "citation-excluded", "unavailable", "fulltext-excluded", "pending"
  ];

  var state = { records: [], fields: E.DEFAULT_FIELDS.slice(), onlyUnknown: false, unread: "" };
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* 长内容折到有限行数就收住，收住的部分仍在框里，可以滚动选中取回。 */
  function fit(box) {
    box.style.height = "auto";
    var h = box.scrollHeight;
    if (h) box.style.height = Math.min(h, 78) + "px";
  }

  function markHole(box) {
    box.classList.toggle("hole", !String(box.value).trim());
  }

  function writer(box, apply) {
    box.addEventListener("input", function () {
      apply(box.value);
      markHole(box);
      if (box.tagName === "TEXTAREA") fit(box);
    });
  }

  /* ---------- 表头：列名本身就是可以改写的地方，不另开字段面板 ---------- */

  function fieldHead(name, index) {
    var th = el("th", (index === 0 ? "name " : "") + (WIDE[name] ? "wide" : "") + (NUMERIC[name] ? " num" : ""));
    if (WIDTH[name]) th.style.minWidth = WIDTH[name] + "px";
    var box = el("input", "colname");
    box.value = name;
    box.setAttribute("aria-label", "列名 " + name);
    box.addEventListener("change", function () {
      var next = box.value.trim();
      if (!next) {
        state.fields.splice(index, 1);
        state.records.forEach(function (r) { r.values.splice(index, 1); });
        state.fields = E.normalizeFields(state.fields);
        render();
        return;
      }
      state.fields = E.normalizeFields(state.fields.map(function (f, i) { return i === index ? next : f; }));
      render();
    });
    th.appendChild(box);
    return th;
  }

  /*
   * 列的次序。状态紧跟在钉住的那一列后面，因为「哪几行进了、哪几行出局」
   * 是用户扫得最多的一列 —— 排到十一个抽取字段后面，它就得横滚才看得见。
   */
  function plan() {
    var cols = [];
    state.fields.forEach(function (field, index) {
      cols.push({ kind: "field", field: field, index: index });
      if (index === 0) cols.push({ kind: "status" });
    });
    if (!state.fields.length) cols.push({ kind: "status" });
    E.BIAS_DOMAINS.forEach(function (domain, index) {
      cols.push({ kind: "bias", field: domain, index: index });
    });
    cols.push({ kind: "add" });
    return cols;
  }

  function renderHead() {
    clear(els.head);
    var tr = el("tr");
    plan().forEach(function (col) {
      if (col.kind === "field") tr.appendChild(fieldHead(col.field, col.index));
      else if (col.kind === "status") tr.appendChild(el("th", "status", "状态"));
      else if (col.kind === "bias") tr.appendChild(el("th", "bias", col.field));
    });

    var add = el("th", "add");
    var box = el("input", "colname");
    box.placeholder = "加一列";
    box.setAttribute("aria-label", "加一列");
    box.addEventListener("change", function () {
      var next = box.value.trim();
      box.value = "";
      if (!next) return;
      state.fields = E.normalizeFields(state.fields.concat([next]));
      render();
    });
    add.appendChild(box);
    tr.appendChild(add);
    els.head.appendChild(tr);
  }

  /* ---------- 表体：抽取内容就在这一行直接填，状态就在这一行直接设 ---------- */

  function valueCell(record, index, field) {
    var wide = Boolean(WIDE[field]);
    var td = el("td", (index === 0 ? "name " : "") + (wide ? "wide" : "") + (NUMERIC[field] ? " num" : ""));
    var box = el(wide ? "textarea" : "input", "cell");
    if (wide) box.rows = 1;
    box.value = record.values[index] || "";
    box.placeholder = "—";
    box.setAttribute("aria-label", field);
    writer(box, function (v) { record.values[index] = v; });
    /* 填完离开这一格，整列的小数点轴重新对齐 —— 边打字边挪会顶着光标走 */
    if (NUMERIC[field]) box.addEventListener("change", alignDecimals);
    markHole(box);
    td.appendChild(box);
    return td;
  }

  function statusCell(record) {
    var td = el("td", "status");
    var pick = el("select", "cell mark");
    STATUS_ORDER.forEach(function (key) {
      var item = E.STATUS[key];
      var option = el("option", null, item.shape + " " + item.label);
      option.value = key;
      if (key === record.pipeline) option.selected = true;
      pick.appendChild(option);
    });
    pick.setAttribute("aria-label", "状态");
    function paint() {
      pick.className = "cell mark be-" + E.STATUS[record.pipeline].decision;
    }
    pick.addEventListener("change", function () {
      var next = E.STATUS[pick.value] || E.STATUS.pending;
      record.pipeline = next.key;
      record.decision = next.decision;
      record.statusKnown = true;
      record.statusRaw = next.label;
      paint();
      renderTally();
    });
    paint();
    td.appendChild(pick);
    return td;
  }

  function biasCell(record, index, domain) {
    var td = el("td", "bias");
    var box = el("input", "cell");
    box.value = record.bias[index] || "待观察";
    box.placeholder = "待观察";
    box.setAttribute("aria-label", domain);
    writer(box, function (v) { record.bias[index] = v.trim() || "待观察"; });
    td.appendChild(box);
    return td;
  }

  function visibleRecords() {
    if (!state.onlyUnknown) return state.records;
    return state.records.filter(function (r) { return r.statusKnown === false; });
  }

  function renderBody() {
    clear(els.body);
    var cols = plan();
    var span = cols.length;

    if (!state.records.length) {
      var blank = el("tr", "bare");
      var cell = el("td", null, "把题录整批粘进来");
      cell.colSpan = span;
      blank.appendChild(cell);
      els.body.appendChild(blank);
      return;
    }

    visibleRecords().forEach(function (record) {
      var tr = el("tr");
      cols.forEach(function (col) {
        if (col.kind === "field") tr.appendChild(valueCell(record, col.index, col.field));
        else if (col.kind === "status") tr.appendChild(statusCell(record));
        else if (col.kind === "bias") tr.appendChild(biasCell(record, col.index, col.field));
        else tr.appendChild(el("td", "add"));
      });
      els.body.appendChild(tr);
    });

    alignDecimals();
    [].forEach.call(els.body.querySelectorAll("textarea"), fit);
  }

  /*
   * 小数点对到同一条竖线上：数字列右对齐只能让末位对齐，
   * 所以按同列最长的小数位给每格补一段右侧留白（等宽字体下 1ch = 一个数位）。
   * 这是「同一列上下扫」能成立的原因，不是排版讲究。
   */
  function alignDecimals() {
    plan().forEach(function (col, position) {
      if (col.kind !== "field" || !NUMERIC[col.field]) return;
      var boxes = [];
      var widest = 0;
      [].forEach.call(els.body.querySelectorAll("tr"), function (tr) {
        var td = tr.children[position];
        var box = td && td.querySelector(".cell");
        if (!box) return;
        var text = String(box.value).trim();
        var frac = /^-?\d+(\.\d+)$/.test(text) ? text.length - text.indexOf(".") : 0;
        if (frac > widest) widest = frac;
        boxes.push({ box: box, frac: frac, plain: /^-?\d+(\.\d+)?$/.test(text) });
      });
      boxes.forEach(function (item) {
        item.box.style.paddingRight = item.plain ? (widest - item.frac) + "ch" : "0";
      });
    });
  }

  /* ---------- 头号结论：一个数，对不上的那一声就长在它旁边 ---------- */

  function renderTally() {
    var audit = E.audit(state.records);
    els.tally.textContent = String(audit.includedByStatus);

    /* 五条关系全部成立时屏幕上什么都不出现；对不上就说清是哪两个数、差多少 */
    var note = audit.consistent
      ? state.unread
      : "对不上：已纳入 " + audit.included + "，逐条状态只数出 " + audit.includedByStatus;
    els.unread.hidden = !note;
    els.unread.textContent = note;

    var unknown = audit.unknownStatus;
    els.unknown.hidden = unknown === 0;
    els.unknown.textContent = unknown
      ? "对不上：" + unknown + " 条状态没认出来，按待定算"
      : "";
    els.unknown.setAttribute("aria-pressed", state.onlyUnknown ? "true" : "false");
    els.unknown.classList.toggle("on", state.onlyUnknown);
    if (!unknown && state.onlyUnknown) {
      state.onlyUnknown = false;
      renderBody();
    }
  }

  function reportUnread(report) {
    if (!report.skipped.length) {
      state.unread = "";
      return;
    }
    var lines = report.skipped.map(function (item) { return item.line; }).join("、");
    state.unread = "对不上：粘进来 " + report.pastedRows + " 行，只读出 " +
      report.rows.length + " 条 —— 第 " + lines + " 行没有末尾状态";
  }

  function render() {
    renderHead();
    renderBody();
    renderTally();
  }

  function importRecords(event) {
    event.preventDefault();
    var report = E.parseReport(els.paste.value);
    reportUnread(report);
    if (!report.rows.length) {
      renderTally();
      return;
    }
    state.records = state.records.concat(report.rows);
    els.paste.value = "";
    render();
    els.scroll.scrollTop = els.scroll.scrollHeight;
  }

  function mount() {
    els.head = document.getElementById("head");
    els.body = document.getElementById("body");
    els.tally = document.getElementById("tally");
    els.unread = document.getElementById("unread");
    els.unknown = document.getElementById("unknown");
    els.paste = document.getElementById("paste");
    els.scroll = document.getElementById("scroll");

    document.getElementById("paste-form").addEventListener("submit", importRecords);
    els.unknown.addEventListener("click", function () {
      state.onlyUnknown = !state.onlyUnknown;
      renderBody();
      renderTally();
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
