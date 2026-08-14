(function () {
  "use strict";

  var E = window.LiteratureMatrixEngine;
  var state = { records: [], fields: E.DEFAULT_FIELDS.slice() };
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function renderMetrics(audit) {
    var cells = [
      ["已识别", audit.identified], ["重复", audit.duplicates], ["已筛", audit.screened],
      ["待取全文", audit.fulltextNeeded], ["已评估", audit.evaluated],
      ["全文排除", audit.fulltextExcluded], ["已纳入", audit.included]
    ];
    clear(els.metrics);
    cells.forEach(function (cell) {
      var wrap = el("div", "metric");
      wrap.appendChild(el("span", "k", cell[0]));
      wrap.appendChild(el("span", "v", cell[1]));
      els.metrics.appendChild(wrap);
    });
  }

  function renderRelations(audit) {
    clear(els.relations);
    audit.relations.forEach(function (relation) {
      var wrap = el("div", "relation" + (relation.ok ? "" : " bad"));
      wrap.appendChild(el("strong", null, relation.left + " = " + relation.right + (relation.ok ? " ✓" : " ≠")));
      wrap.appendChild(document.createTextNode(relation.label));
      els.relations.appendChild(wrap);
    });
  }

  function statusNode(record) {
    var visual = E.statusVisual(record.pipeline);
    var node = el("span", "status status-" + record.decision, visual.text);
    node.setAttribute("aria-label", visual.detail);
    return node;
  }

  function renderTable() {
    clear(els.head);
    clear(els.body);
    var trh = el("tr");
    state.fields.forEach(function (field) { trh.appendChild(el("th", null, field)); });
    trh.appendChild(el("th", null, "状态（颜色 + 形状）"));
    trh.appendChild(el("th", null, "偏倚观察"));
    els.head.appendChild(trh);

    if (!state.records.length) {
      var empty = el("tr", "empty");
      var td = el("td", null,
        "零条题录。表头已列出可比较信息；请从左侧粘贴题录，首屏不会替你虚构示例论文。");
      td.colSpan = state.fields.length + 2;
      empty.appendChild(td);
      els.body.appendChild(empty);
      return;
    }

    state.records.forEach(function (record) {
      var tr = el("tr");
      state.fields.forEach(function (_field, index) {
        var td = el("td", index === 3 ? "num" : "", record.values[index] || "—");
        tr.appendChild(td);
      });
      var status = el("td");
      status.appendChild(statusNode(record));
      tr.appendChild(status);
      tr.appendChild(el("td", "bias-cell", E.BIAS_DOMAINS.map(function (name, index) {
        return name + "：" + (record.bias[index] || "待观察");
      }).join(" · ")));
      els.body.appendChild(tr);
    });
  }

  function render() {
    var audit = E.audit(state.records);
    renderMetrics(audit);
    renderRelations(audit);
    renderTable();
  }

  function importRecords() {
    var parsed = E.parseBatch(els.recordInput.value);
    state.records = parsed;
    els.importNote.textContent = parsed.length
      ? "已导入 " + parsed.length + " 条；计数、五条关系与逐条矩阵已同步。"
      : "没有读到题录。请每行至少写一个字段和末尾状态。";
    render();
  }

  function applyFields() {
    state.fields = E.normalizeFields(els.fieldInput.value);
    els.fieldInput.value = state.fields.join("，");
    renderTable();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(el("li", null, failure.name));
    });
    if (!report.failures.length) {
      els.testDetail.appendChild(el("li", null, "40 条流程关系、故意不一致检测及颜色 + 形状状态均已复核。"));
    }
  }

  function mount() {
    els.metrics = document.getElementById("metrics");
    els.relations = document.getElementById("relations");
    els.head = document.getElementById("matrix-head");
    els.body = document.getElementById("matrix-body");
    els.recordInput = document.getElementById("record-input");
    els.importNote = document.getElementById("import-note");
    els.fieldInput = document.getElementById("field-input");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    els.fieldInput.value = state.fields.join("，");
    E.BIAS_DOMAINS.forEach(function (name) {
      document.getElementById("bias-basis").appendChild(el("li", null, name));
    });
    ["included", "excluded", "pending"].forEach(function (key) {
      var visual = E.statusVisual(key);
      document.getElementById("legend").appendChild(el("span", "status status-" + key, visual.shape + " " + visual.label));
    });

    document.getElementById("import-records").addEventListener("click", importRecords);
    document.getElementById("apply-fields").addEventListener("click", applyFields);
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
