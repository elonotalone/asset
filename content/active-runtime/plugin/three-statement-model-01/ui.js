/* 三表模型 · DOM 装配层。所有数字由 ThreeStatementEngine 计算。 */
(function () {
  "use strict";

  var E = window.ThreeStatementEngine;
  var els = {};
  var FIELDS = [
    ["revenue-growth", "revenueGrowth", 100],
    ["base-revenue", "baseRevenue", 1],
    ["gross-margin", "grossMargin", 100],
    ["operating-expense-pct", "operatingExpensePct", 100],
    ["tax-rate", "taxRate", 100],
    ["dso", "dso", 1],
    ["inventory-days", "inventoryDays", 1],
    ["payable-days", "payableDays", 1],
    ["capex-pct", "capexPct", 100],
    ["depreciation-years", "depreciationYears", 1],
    ["interest-rate", "interestRate", 100],
    ["minimum-cash", "minimumCash", 1]
  ];

  var INCOME_ROWS = [
    ["revenue", "营业收入", "formula", function (year) { return year.income.revenue; }],
    ["cogs", "销售成本", "formula", function (year) { return -year.income.cogs; }],
    ["grossProfit", "毛利", "formula total", function (year) { return year.income.grossProfit; }],
    ["operatingExpense", "运营费用", "formula", function (year) { return -year.income.operatingExpense; }],
    ["depreciation", "折旧", "formula", function (year) { return -year.income.depreciation; }],
    ["ebit", "EBIT", "formula total", function (year) { return year.income.ebit; }],
    ["interest", "利息费用", "cross", function (year) { return -year.income.interest; }],
    ["pretaxIncome", "税前利润", "formula", function (year) { return year.income.pretaxIncome; }],
    ["tax", "所得税", "formula", function (year) { return -year.income.tax; }],
    ["netIncome", "净利润", "formula total", function (year) { return year.income.netIncome; }]
  ];

  var CASH_ROWS = [
    ["netIncome", "净利润", "cross", function (year) { return year.cashFlow.netIncome; }],
    ["depreciationAddBack", "折旧加回", "cross", function (year) { return year.cashFlow.depreciationAddBack; }],
    ["receivablesChange", "应收增加（占用）", "cross", function (year) { return -year.cashFlow.receivablesChange; }],
    ["inventoryChange", "存货增加（占用）", "cross", function (year) { return -year.cashFlow.inventoryChange; }],
    ["payablesChange", "应付增加（释放）", "cross", function (year) { return year.cashFlow.payablesChange; }],
    ["operatingCashFlow", "经营现金流", "formula total", function (year) { return year.cashFlow.operatingCashFlow; }],
    ["capex", "资本开支", "cross", function (year) { return -year.cashFlow.capex; }],
    ["investingCashFlow", "投资现金流", "formula total", function (year) { return year.cashFlow.investingCashFlow; }],
    ["revolverChange", "循环贷变动", "cross", function (year) { return year.cashFlow.revolverChange; }],
    ["financingCashFlow", "筹资现金流", "formula total", function (year) { return year.cashFlow.financingCashFlow; }],
    ["endingCash", "期末现金", "formula total", function (year) { return year.cashFlow.endingCash; }]
  ];

  var BALANCE_ROWS = [
    ["cash", "现金", "cross", function (year) { return year.balance.cash; }],
    ["receivables", "应收", "formula", function (year) { return year.balance.receivables; }],
    ["inventory", "存货", "formula", function (year) { return year.balance.inventory; }],
    ["ppe", "固定资产净额", "formula", function (year) { return year.balance.ppe; }],
    ["assets", "资产合计", "formula total", function (year) { return year.balance.assets; }],
    ["payables", "应付", "formula", function (year) { return year.balance.payables; }],
    ["revolver", "循环贷", "cross", function (year) { return year.balance.revolver; }],
    ["shareCapital", "股本", "formula", function (year) { return year.balance.shareCapital; }],
    ["retainedEarnings", "未分配利润", "cross", function (year) { return year.balance.retainedEarnings; }],
    ["liabilitiesAndEquity", "负债 + 权益合计", "formula total", function (year) { return year.balance.liabilitiesAndEquity; }],
    ["difference", "差额", "formula total", function (year) { return year.balance.difference; }]
  ];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function readAssumptions() {
    var values = {};
    for (var key in E.DEFAULT) values[key] = E.DEFAULT[key];
    for (var i = 0; i < FIELDS.length; i++) {
      var field = FIELDS[i];
      var raw = document.getElementById(field[0]).value.trim();
      values[field[1]] = raw === "" ? NaN : Number(raw) / field[2];
    }
    return values;
  }

  function metric(label, value) {
    var box = el("div", "metric");
    box.appendChild(el("div", "label", label));
    box.appendChild(el("div", "value", value));
    els.headline.appendChild(box);
  }

  function moneyCell(value) {
    var td = el("td", value < 0 ? "negative" : null, E.money(value));
    return td;
  }

  function renderStatement(table, rows, years) {
    clear(table);
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    headRow.appendChild(el("th", null, "项目 / 金额单位 元"));
    years.forEach(function (year) { headRow.appendChild(el("th", null, year.label)); });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var roles = row[2].split(" ");
      tr.className = roles.join(" ");
      tr.setAttribute("data-key", row[0]);
      var th = document.createElement("th");
      th.appendChild(el("span", "role-mark", roles.indexOf("cross") >= 0 ? "↗" : "="));
      th.appendChild(document.createTextNode(row[1]));
      tr.appendChild(th);
      years.forEach(function (year) { tr.appendChild(moneyCell(row[3](year))); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function renderChecks(years) {
    clear(els.checkLine);
    years.forEach(function (year) {
      var item = el("span", "check-item", year.label + "  " + E.money(year.balance.difference) + "  ");
      item.setAttribute("data-year", year.label);
      item.appendChild(el("b", null, year.balance.difference === 0 ? "平衡" : "不平"));
      els.checkLine.appendChild(item);
    });
  }

  function tableHead(table, labels) {
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    labels.forEach(function (label) { tr.appendChild(el("th", null, label)); });
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  function renderComparison(result) {
    clear(els.comparisonTable);
    tableHead(els.comparisonTable, ["口径", "累计利息", "末年现金", "末年循环贷", "收敛"]);
    var tbody = document.createElement("tbody");
    [
      ["期初余额直接断环", result.comparison.opening],
      ["平均余额迭代", result.comparison.average]
    ].forEach(function (pair) {
      var tr = document.createElement("tr");
      tr.appendChild(el("th", null, pair[0]));
      tr.appendChild(moneyCell(pair[1].totalInterest));
      tr.appendChild(moneyCell(pair[1].final.balance.cash));
      tr.appendChild(moneyCell(pair[1].final.balance.revolver));
      tr.appendChild(el("td", null, pair[1].converged ? "是 · 最多 " + pair[1].maxIterations + " 次" : "否"));
      tbody.appendChild(tr);
    });
    els.comparisonTable.appendChild(tbody);
    els.comparisonNote.textContent = "期初余额口径一步完成、易解释但忽略期内还款；平均余额迭代精度更高。平均口径减期初口径：累计利息 " +
      E.money(result.comparison.interestDifference) + "，末年现金 " + E.money(result.comparison.cashDifference) +
      "，末年循环贷 " + E.money(result.comparison.revolverDifference) + "；两者均" +
      (result.comparison.bothConverged ? "已收敛。" : "未全部收敛。 ");
  }

  function renderSensitivity(result) {
    clear(els.sensitivityTable);
    tableHead(els.sensitivityTable, ["收入增速", "末年收入", "末年净利润", "末年现金", "末年循环贷"]);
    var tbody = document.createElement("tbody");
    result.sensitivity.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-growth", String(row.growth));
      tr.appendChild(el("th", null, E.percent(row.growth)));
      tr.appendChild(moneyCell(row.revenue));
      tr.appendChild(moneyCell(row.netIncome));
      tr.appendChild(moneyCell(row.cash));
      tr.appendChild(moneyCell(row.revolver));
      tbody.appendChild(tr);
    });
    els.sensitivityTable.appendChild(tbody);
  }

  function clearOutputs() {
    [els.headline, els.checkLine, els.incomeTable, els.cashflowTable, els.balanceTable, els.comparisonTable, els.sensitivityTable].forEach(clear);
    els.comparisonNote.textContent = "";
  }

  function render() {
    var raw = readAssumptions();
    var checked = E.assumptionsOf(raw);
    var mode = document.getElementById("loop-mode").value;
    els.modeExplanation.textContent = mode === "opening" ?
      "按期初循环贷直接断环：一步完成，易解释；利息不反映期内还款。" :
      "按期初与期末循环贷平均余额迭代不动点：精度更高；迭代次数与差异会显式列出。";
    if (!checked.ok) {
      clearOutputs();
      els.statusLine.textContent = "输入有误，模型未计算：" + checked.error;
      els.statusLine.className = "error";
      els.basisLine.textContent = "金额单位 元 · 费用与现金占用以负号显示 · 输入无效时不保留旧结果";
      return;
    }
    var result = E.model(checked.assumptions, mode);
    if (!result) {
      clearOutputs();
      els.statusLine.textContent = "模型无法完成勾稽，请检查输入。";
      els.statusLine.className = "error";
      return;
    }

    clear(els.headline);
    metric("2029E 营业收入", E.money(result.final.income.revenue));
    metric("2029E 净利润", E.money(result.final.income.netIncome));
    metric("2029E 期末现金", E.money(result.final.balance.cash));
    metric("2029E 循环贷", E.money(result.final.balance.revolver));
    els.basisLine.textContent = "金额单位 元 · 费用与现金占用以负号显示 · 期末现金 = 期初现金 + 经营 + 投资 + 筹资 · 当前口径：" +
      (mode === "opening" ? "期初余额直接断环" : "平均余额迭代");
    els.statusLine.textContent = "已按当前假设同一帧重算三张表、平衡检查、断环比较与敏感性。";
    els.statusLine.className = "";

    renderChecks(result.years);
    renderStatement(els.incomeTable, INCOME_ROWS, result.years);
    renderStatement(els.cashflowTable, CASH_ROWS, result.years);
    renderStatement(els.balanceTable, BALANCE_ROWS, result.years);
    renderComparison(result);
    renderSensitivity(result);
  }

  function runTest() {
    var result = E.runSelfTest();
    els.testOut.textContent = result.passed + " / " + result.total + " 通过";
    clear(els.testDetail);
    if (!result.failures.length) els.testDetail.appendChild(el("li", null, "三表勾稽、现金递推与两种断环口径均通过。"));
    result.failures.forEach(function (failure) { els.testDetail.appendChild(el("li", null, failure.name + " —— " + failure.why)); });
  }

  function mount() {
    els.headline = document.getElementById("headline");
    els.basisLine = document.getElementById("basis-line");
    els.statusLine = document.getElementById("status-line");
    els.checkLine = document.getElementById("check-line");
    els.incomeTable = document.getElementById("income-table");
    els.cashflowTable = document.getElementById("cashflow-table");
    els.balanceTable = document.getElementById("balance-table");
    els.comparisonNote = document.getElementById("comparison-note");
    els.comparisonTable = document.getElementById("comparison-table");
    els.sensitivityTable = document.getElementById("sensitivity-table");
    els.modeExplanation = document.getElementById("mode-explanation");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    FIELDS.forEach(function (field) { document.getElementById(field[0]).addEventListener("input", render); });
    document.getElementById("loop-mode").addEventListener("change", render);
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
