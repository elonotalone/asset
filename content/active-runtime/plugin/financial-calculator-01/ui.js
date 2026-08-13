/*
 * 金融计算器 · 界面层
 *
 * 安全：全程 createElement + textContent，没有一处 innerHTML；
 * 不碰存储、不碰父窗口、不发请求。理由见 docs/design-guides/plugin/_INDEX.md 末尾两条。
 */
(function () {
  "use strict";

  var E = window.FinancialEngine;

  var state = {
    principal: String(E.DEFAULT.principal),
    ratePct: String(E.DEFAULT.annualRatePct),
    periods: String(E.DEFAULT.periods),
    method: E.DEFAULT.method,
    flows: E.DEFAULT_FLOWS.join(", "),
    discountPct: "10"
  };

  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function num(raw) {
    var s = String(raw).trim().replace(/[,\s]/g, "");
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function parseFlows(raw) {
    var parts = String(raw).split(/[,;\n\r\t]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (s === "") continue;
      var n = num(s);
      if (n === null) return null;
      out.push(n);
    }
    return out;
  }

  /* ---------- 主测算 ---------- */

  function renderPlan() {
    var P = num(state.principal);
    var r = num(state.ratePct);
    var n = num(state.periods);

    clear(els.headline);
    clear(els.tbody);
    clear(els.tail);

    var plan = (P === null || r === null || n === null)
      ? null
      : E.amortize(P, r, n, { method: state.method });

    if (!plan) {
      els.headline.appendChild(el("div", "note", "本金、年利率、期数都填成正常的数，结论就出来了。"));
      els.basisLine.textContent = "";
      return;
    }

    var cells = [
      { k: plan.method === "annuity" ? "每期还款" : "首期还款", v: E.money(plan.method === "annuity" ? plan.payment : plan.firstPayment) },
      { k: "总利息", v: E.money(plan.totalInterest) },
      { k: "总还款", v: E.money(plan.totalPaid) }
    ];
    if (plan.method !== "annuity") cells.splice(1, 0, { k: "末期还款", v: E.money(plan.lastPayment) });

    cells.forEach(function (c) {
      var cell = el("div", "cell");
      cell.appendChild(el("div", "k", c.k));
      cell.appendChild(el("div", "v", c.v));
      els.headline.appendChild(cell);
    });

    els.basisLine.textContent =
      "金额单位 元 · " + plan.methodLabel + " · 期利率 = 年利率 ÷ " + plan.perYear +
      " = " + E.pct(plan.rate, 6) + " · 按期复利 · 分位四舍五入，尾差由末期吸收";

    // 明细：一次性建好再挂上去，避免 360 行逐个回流
    var frag = document.createDocumentFragment();
    plan.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      [String(row.period), E.money(row.payment), E.money(row.interest),
       E.money(row.principal), E.money(row.balance)].forEach(function (v) {
        tr.appendChild(el("td", null, v));
      });
      frag.appendChild(tr);
    });
    els.tbody.appendChild(frag);

    els.tail.appendChild(el("p", null,
      "共 " + plan.rows.length + " 期，全部摊开在上面，没有折叠也没有分页。"));
    els.tail.appendChild(el("p", null,
      "两个总利息口径本来就不相等，都给你：公式口径（未取整月供 × 期数 − 本金）" +
      E.money(plan.totalInterest) + " 元；账面口径（逐期四舍五入到分再相加）" +
      E.money(plan.roundedInterestTotal) + " 元；相差 " + E.money(plan.tailDiff) + " 元。"));
    els.tail.appendChild(el("p", null,
      "末期平衡已生效：本金分摊之和 " + E.money(plan.principalSum) +
      " 元，最终余额 " + E.money(plan.finalBalance) + " 元。"));
  }

  /* ---------- 第二组：现金流，不与主测算共用输入 ---------- */

  function renderCash() {
    clear(els.cashOut);
    var flows = parseFlows(state.flows);
    var d = num(state.discountPct);

    if (!flows || flows.length < 2 || d === null) {
      els.cashOut.appendChild(el("div", "note", "一行或一串数，用逗号或换行分开，第一个通常是负的投入。"));
      return;
    }

    function line(k, v, cls) {
      var row = el("div");
      row.appendChild(el("span", "k", k));
      row.appendChild(el("span", "v " + (cls || ""), v));
      els.cashOut.appendChild(row);
    }

    var value = E.npv(d / 100, flows);
    line("NPV @ " + d + "%", E.money(value), value > 0 ? "pos" : value < 0 ? "neg" : "");

    var r = E.irr(flows);
    if (r === null) {
      line("IRR", "无常规解");
      els.cashOut.appendChild(el("div", "note",
        "现金流全部同号时 IRR 没有常规意义 —— 这里不硬凑一个数给你。"));
    } else {
      line("IRR", E.pct(r, 4));
    }
    line("期数", flows.length - 1 + " 期 + 当期");
  }

  function render() { renderPlan(); renderCash(); }

  /* ---------- 自测 ---------- */

  function runTest() {
    var r = E.runSelfTest();
    els.testOut.textContent = r.passed + " / " + r.total + " 通过";
    clear(els.testDetail);
    r.failures.forEach(function (f) {
      els.testDetail.appendChild(el("li", null, f.name + " —— " + f.why));
    });
    if (r.failures.length === 0) {
      els.testDetail.appendChild(el("li", null,
        "期望值取自规格「已查证的知识」与「第一次打开」两节，含出厂读数 4 890.17 / 760 461.83。"));
    }
  }

  /* ---------- 装配 ---------- */

  function bind(id, key) {
    var node = document.getElementById(id);
    node.value = state[key];
    node.addEventListener("input", function () { state[key] = node.value; render(); });
    node.addEventListener("change", function () { state[key] = node.value; render(); });
    return node;
  }

  function mount() {
    els.headline = document.getElementById("headline");
    els.basisLine = document.getElementById("basis-line");
    els.tbody = document.getElementById("tbody");
    els.tail = document.getElementById("tail");
    els.cashOut = document.getElementById("cash-out");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    bind("principal", "principal");
    bind("rate", "ratePct");
    bind("periods", "periods");
    bind("method", "method");
    bind("flows", "flows");
    bind("discount", "discountPct");

    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
