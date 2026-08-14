(function () {
  "use strict";

  var E = window.ContractAssemblyEngine;
  var state = E.createState();
  var notices = [];
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function variableControl(variable) {
    var control;
    if (variable.type === "single" || variable.type === "boolean") {
      control = el("select");
      var emptyOption = el("option", null, "请选择");
      emptyOption.value = "";
      control.appendChild(emptyOption);
      var options = variable.type === "boolean" ? ["是", "否"] : (variable.options || []);
      options.forEach(function (option) {
        var item = el("option", null, option);
        item.value = variable.type === "boolean" ? (option === "是" ? "true" : "false") : option;
        control.appendChild(item);
      });
    } else {
      control = el("input");
      control.type = variable.type === "date" ? "date" :
        (variable.type === "number" || variable.type === "amount" || variable.type === "percentage" ? "number" : "text");
      if (variable.type === "amount" || variable.type === "percentage") control.step = "0.01";
      if (variable.type === "number") control.step = "1";
    }
    control.setAttribute("data-variable", variable.key);
    control.setAttribute("aria-label", variable.label);
    if (Object.prototype.hasOwnProperty.call(state.values, variable.key)) control.value = String(state.values[variable.key]);
    control.addEventListener("input", function () {
      state = E.setVariable(state, variable.key, control.value);
      updateOutputs();
    });
    return control;
  }

  function renderTransactions() {
    clear(els.transactions);
    E.TRANSACTIONS.forEach(function (name) {
      var label = el("label", "transaction-option");
      var input = el("input");
      input.type = "radio";
      input.name = "transaction";
      input.value = name;
      input.checked = state.transaction === name;
      input.addEventListener("change", function () {
        if (!input.checked) return;
        state.transaction = name;
        updateOutputs();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(name));
      els.transactions.appendChild(label);
    });
  }

  function renderLibrary() {
    clear(els.categories);
    E.CATEGORIES.forEach(function (category) {
      var clauses = E.CLAUSES.filter(function (clause) { return clause.category === category.id; });
      var selectedCount = clauses.filter(function (clause) { return state.selected.indexOf(clause.id) >= 0; }).length;
      var details = el("details");
      details.setAttribute("data-category", category.id);
      if (selectedCount) details.open = true;
      var summary = el("summary");
      summary.appendChild(el("span", null, category.label + (category.critical ? " · 关键" : "")));
      summary.appendChild(el("span", "category-count", selectedCount + " / " + clauses.length));
      details.appendChild(summary);

      clauses.forEach(function (clause) {
        var selected = state.selected.indexOf(clause.id) >= 0;
        var available = E.availability(state, clause.id);
        var row = el("div", "clause-row");
        row.setAttribute("data-clause", clause.id);
        var main = el("label", "clause-main");
        var checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected;
        checkbox.disabled = !selected && available.mutuallyExclusive;
        checkbox.setAttribute("data-clause-check", clause.id);
        checkbox.addEventListener("change", function () {
          if (checkbox.checked) {
            var result = E.selectClause(state, clause.id);
            state = result.state;
            notices = result.reasons;
          } else {
            state = E.deselectClause(state, clause.id);
            notices = [];
          }
          renderAll();
        });
        main.appendChild(checkbox);
        main.appendChild(el("span", "clause-title", clause.title));
        main.appendChild(el("span", "weight", (clause.riskWeight >= 0 ? "+" : "") + clause.riskWeight));
        row.appendChild(main);

        if (available.mutuallyExclusive) {
          var mutual = el("p", "clause-note mutual-reason", "互斥：" + available.reason);
          mutual.setAttribute("data-mutual-reason", clause.id);
          row.appendChild(mutual);
        } else if (clause.depends && clause.depends.length) {
          row.appendChild(el("p", "clause-note", "依赖：" + clause.depends[0].reason));
        }

        if (selected && clause.variables && clause.variables.length) {
          var variableList = el("div", "variable-list");
          clause.variables.forEach(function (variable) {
            var variableRow = el("div", "variable-row");
            var label = el("label", null, variable.label);
            label.appendChild(el("small", null, "变量类型：" + ({
              text: "文本", number: "数字", amount: "金额", date: "日期",
              single: "单选", boolean: "布尔", percentage: "百分比"
            }[variable.type] || variable.type)));
            variableRow.appendChild(label);
            variableRow.appendChild(variableControl(variable));
            variableList.appendChild(variableRow);
          });
          row.appendChild(variableList);
        }
        details.appendChild(row);
      });
      els.categories.appendChild(details);
    });
  }

  function renderNotices() {
    clear(els.relationshipNote);
    notices.forEach(function (notice) {
      var clause = E.clauseById(notice.clauseId);
      var prefix = notice.type === "dependency" ? "连带加入" : "不能选择";
      els.relationshipNote.appendChild(el("p", null, prefix + (clause ? "「" + clause.title + "」" : "") + "：" + notice.reason));
    });
  }

  function renderMetrics(summary) {
    clear(els.metrics);
    var cells = [
      ["已选", summary.selectedCount + " 条", false],
      ["待填", summary.pendingCount + " 项", false],
      ["风险分", summary.risk.calculated ? String(summary.risk.value) : "尚未计算", !summary.risk.calculated]
    ];
    cells.forEach(function (cell) {
      var wrap = el("div", "metric");
      wrap.appendChild(el("span", "k", cell[0]));
      wrap.appendChild(el("span", "v" + (cell[2] ? " words" : ""), cell[1]));
      els.metrics.appendChild(wrap);
    });
  }

  function renderIssues() {
    clear(els.issues);
    var list = E.issues(state);
    if (!state.selected.length) {
      els.issueIntro.textContent = "选择条款后，这里会列出未填占位符、冲突与缺失关键类目；空白不是失败。";
      return;
    }
    els.issueIntro.textContent = list.length ? "以下问题应在导出前处理：" : "当前未发现待处理问题。";
    list.forEach(function (issue) {
      var item = el("li", issue.type === "conflict" ? "issue-danger" : "issue", issue.text);
      item.setAttribute("data-issue-type", issue.type);
      els.issues.appendChild(item);
    });
  }

  function updateOutputs() {
    var summary = E.assemble(state);
    renderMetrics(summary);
    if (summary.risk.calculated) {
      els.riskBasis.textContent = "风险分 = 权重 " + summary.risk.weightSum + " − 5 × 缺失关键类目 " +
        summary.risk.missingCount + " − 2 × 冲突 " + summary.risk.conflictCount + " = " +
        summary.risk.raw + "；夹在 −100..100 后为 " + summary.risk.value + "。";
    } else {
      els.riskBasis.textContent = "风险分尚未计算；选择首条条款后显示权重、缺失类目与冲突扣分。";
    }
    els.preview.value = summary.text;
    els.previewLabel.textContent = summary.text ? "实时合同正文" : "空白预览页";
    renderIssues();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(el("li", null, failure.name));
    });
    if (!report.failures.length) {
      els.testDetail.appendChild(el("li", null, "风险夹取、依赖、互斥与七类变量格式均已复核。"));
    }
  }

  function renderAll() {
    renderTransactions();
    renderLibrary();
    renderNotices();
    updateOutputs();
  }

  function mount() {
    els.transactions = document.getElementById("transaction-options");
    els.categories = document.getElementById("category-list");
    els.relationshipNote = document.getElementById("relationship-note");
    els.metrics = document.getElementById("metrics");
    els.riskBasis = document.getElementById("risk-basis");
    els.preview = document.getElementById("contract-preview");
    els.previewLabel = document.getElementById("preview-label");
    els.issueIntro = document.getElementById("issue-intro");
    els.issues = document.getElementById("issues");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");
    document.getElementById("run-test").addEventListener("click", runTest);
    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
