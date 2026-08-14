(function () {
  "use strict";

  var E = window.FinancialEngine;

  function el(id) { return document.getElementById(id); }

  var plot = el("plot");
  var shade = el("shade");
  var nowPath = el("now");
  var pastPath = el("past");
  var zero = el("zero");
  var marker = el("marker");
  var verdict = el("verdict");
  var pastName = el("past-name");
  var readout = el("readout");
  var axis = el("axis");

  /* 画布用固定视框、横竖各自拉满，所以线画在 SVG 里，字一律放 HTML 层，免得被拉变形。 */
  var VIEW = { w: 1000, h: 500, top: 30, bottom: 462, left: 6, right: 994 };

  var state = {
    principal: E.DEFAULT.principal,
    rate: E.DEFAULT.annualRatePct,
    months: E.DEFAULT.periods,
    method: E.DEFAULT.method,
    /** 对比方案只在期限被改动后才存在：它是「同一笔钱，另一个期限」。 */
    compareMonths: null,
    question: "loan",
    flows: E.DEFAULT_FLOWS.slice(),
    discount: 10
  };

  function num(raw) {
    var text = String(raw === undefined || raw === null ? "" : raw).replace(/[\s,，]/g, "");
    if (text === "" || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
    var value = Number(text);
    return isFinite(value) ? value : null;
  }

  function flowsFrom(raw) {
    var parts = String(raw || "").split(/[,，;；\s]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "") continue;
      var value = num(parts[i]);
      if (value === null) return null;
      out.push(value);
    }
    return out;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** 结论里的金额用等宽字排，长金额不折行；说明用普通字，两者在同一句话里。 */
  function say(node, parts) {
    clear(node);
    parts.forEach(function (part) {
      if (typeof part === "string") {
        node.appendChild(document.createTextNode(part));
        return;
      }
      var span = document.createElement(part.strong ? "b" : "span");
      span.textContent = part.text;
      node.appendChild(span);
    });
  }

  function termName(months) {
    var years = Math.floor(months / 12);
    var rest = months % 12;
    if (years === 0) return months + " 个月方案";
    if (rest === 0) return years + " 年方案";
    return years + " 年 " + rest + " 个月方案";
  }

  function place(node, xFraction, yFraction) {
    node.style.left = (plot.offsetLeft + xFraction * plot.offsetWidth) + "px";
    node.style.top = (plot.offsetTop + yFraction * plot.offsetHeight) + "px";
  }

  /** 一条真实点位连成的路径：每个采样点都是摊销结果里的当期余额，不是起点终点拉直线。 */
  function pathOf(points, xMax, yMin, yMax) {
    var spanX = VIEW.right - VIEW.left;
    var spanY = VIEW.bottom - VIEW.top;
    var range = yMax - yMin || 1;
    var out = "";
    for (var i = 0; i < points.length; i++) {
      var x = VIEW.left + (points[i][0] / (xMax || 1)) * spanX;
      var y = VIEW.bottom - ((points[i][1] - yMin) / range) * spanY;
      out += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    }
    return out;
  }

  function yPixel(value, yMin, yMax) {
    var range = yMax - yMin || 1;
    return VIEW.bottom - ((value - yMin) / range) * (VIEW.bottom - VIEW.top);
  }

  /* HTML 层的字要贴在 SVG 里的点上，所以两边共用同一套折算。 */
  function xFraction(value, xMax) {
    return (VIEW.left + (value / (xMax || 1)) * (VIEW.right - VIEW.left)) / VIEW.w;
  }

  function yFraction(value, yMin, yMax) {
    return yPixel(value, yMin, yMax) / VIEW.h;
  }

  function drawAxis(labels) {
    clear(axis);
    labels.forEach(function (item) {
      var span = document.createElement("span");
      span.textContent = item.text;
      span.style.left = (item.at * 100).toFixed(3) + "%";
      axis.appendChild(span);
    });
  }

  /* ---------- 贷款：一条从本金走到清零的轨迹 ---------- */

  var view = { kind: "loan", xMax: 1, yMin: 0, yMax: 1, plan: null, past: null, flows: null };

  function loanPoints(plan) {
    var points = [[0, plan.principal]];
    for (var i = 0; i < plan.rows.length; i++) points.push([plan.rows[i].period, plan.rows[i].balance]);
    return points;
  }

  function monthlyOf(plan) {
    return plan.method === "annuity" ? plan.payment : plan.firstPayment;
  }

  function renderLoan() {
    var plan = E.amortize(state.principal, state.rate, state.months, { method: state.method });
    if (!plan) {
      nowPath.setAttribute("d", "");
      pastPath.setAttribute("d", "");
      shade.setAttribute("d", "");
      pastName.hidden = true;
      drawAxis([]);
      say(verdict, ["本金和年利率要填成大于 0 的数，这条轨迹才走得出来。"]);
      return;
    }
    var past = state.compareMonths && state.compareMonths !== state.months
      ? E.amortize(state.principal, state.rate, state.compareMonths, { method: state.method })
      : null;

    var xMax = Math.max(plan.periods, past ? past.periods : 0);
    var yMax = plan.principal;
    view = { kind: "loan", xMax: xMax, yMin: 0, yMax: yMax, plan: plan, past: past, flows: null };

    var d = pathOf(loanPoints(plan), xMax, 0, yMax);
    nowPath.setAttribute("d", d);
    shade.setAttribute("d", d + "L" + (xFraction(plan.periods, xMax) * VIEW.w).toFixed(2) +
      " " + VIEW.bottom + "L" + VIEW.left + " " + VIEW.bottom + "Z");
    pastPath.setAttribute("d", past ? pathOf(loanPoints(past), xMax, 0, yMax) : "");
    zero.setAttribute("y1", VIEW.bottom);
    zero.setAttribute("y2", VIEW.bottom);

    if (past) {
      pastName.hidden = false;
      pastName.textContent = termName(past.periods);
      place(pastName, xFraction(past.periods, xMax), VIEW.bottom / VIEW.h);
    } else {
      pastName.hidden = true;
    }

    var years = Math.ceil(xMax / 12);
    var step = years <= 12 ? 5 : 10;
    var labels = [];
    for (var year = step; year < years; year += step) {
      /* 终点自己带年份，刻度落在它身上会叠字。 */
      if (Math.abs(year * 12 - plan.periods) < 6) continue;
      labels.push({ text: year + " 年", at: xFraction(year * 12, xMax) });
    }
    labels.push({ text: Math.round(plan.periods / 12) + " 年清零", at: xFraction(plan.periods, xMax) });
    drawAxis(labels);

    var monthWord = plan.method === "annuity" ? "每月还" : "首期还";
    if (!past) {
      say(verdict, [
        termName(plan.periods) + "（" + plan.methodLabel + "）：" + monthWord + " ",
        { text: E.money(monthlyOf(plan)), strong: true }, " 元，总利息 ",
        { text: E.money(plan.totalInterest), strong: true }, " 元。"
      ]);
      return;
    }
    var dMonthly = monthlyOf(plan) - monthlyOf(past);
    var dInterest = plan.totalInterest - past.totalInterest;
    say(verdict, [
      termName(plan.periods) + "比 " + termName(past.periods) +
        (plan.method === "annuity" ? "每月" : "首期") + (dMonthly >= 0 ? "多付 " : "少付 "),
      { text: E.money(Math.abs(dMonthly)), strong: true }, " 元，总利息" + (dInterest <= 0 ? "少付 " : "多付 "),
      { text: E.money(Math.abs(dInterest)), strong: true }, " 元。"
    ]);
  }

  /* ---------- 现金流：折现后累计值上下转折的一条轨迹 ---------- */

  function renderCash() {
    var flows = state.flows;
    var rate = state.discount / 100;
    if (!flows || flows.length === 0 || !isFinite(rate) || rate <= -1) {
      nowPath.setAttribute("d", "");
      shade.setAttribute("d", "");
      pastPath.setAttribute("d", "");
      pastName.hidden = true;
      drawAxis([]);
      say(verdict, ["每期现金流用逗号隔开，收入写正数、支出写负数，折现率要大于 −100%。"]);
      return;
    }
    var points = [];
    var running = 0;
    var yMin = 0;
    var yMax = 0;
    for (var t = 0; t < flows.length; t++) {
      running += flows[t] / Math.pow(1 + rate, t);
      points.push([t, running]);
      yMin = Math.min(yMin, running);
      yMax = Math.max(yMax, running);
    }
    var xMax = flows.length - 1 || 1;
    var pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad;
    yMax += pad;
    view = { kind: "cash", xMax: xMax, yMin: yMin, yMax: yMax, plan: null, past: null, flows: flows };

    var d = pathOf(points, xMax, yMin, yMax);
    nowPath.setAttribute("d", d);
    var zeroY = yPixel(0, yMin, yMax);
    shade.setAttribute("d", d + "L" + (xFraction(points[points.length - 1][0], xMax) * VIEW.w).toFixed(2) +
      " " + zeroY.toFixed(2) + "L" + VIEW.left + " " + zeroY.toFixed(2) + "Z");
    pastPath.setAttribute("d", "");
    pastName.hidden = true;
    zero.setAttribute("y1", zeroY.toFixed(2));
    zero.setAttribute("y2", zeroY.toFixed(2));

    var labels = [];
    var stride = Math.max(1, Math.ceil(flows.length / 6));
    for (var k = 0; k < flows.length; k += stride) labels.push({ text: "第 " + k + " 期", at: xFraction(k, xMax) });
    drawAxis(labels);

    var value = E.npv(rate, flows);
    var irr = E.irr(flows);
    say(verdict, [
      "按 " + state.discount + "% 折现，这组现金流现在值 ",
      { text: E.money(value), strong: true }, " 元；",
      irr === null ? "这组现金流没有常规内部收益率。" : "内部收益率 ",
      irr === null ? "" : { text: (irr * 100).toFixed(2) + "%", strong: true },
      irr === null ? "" : "。"
    ]);
  }

  function render() {
    if (state.question === "loan") renderLoan();
    else renderCash();
  }

  /* ---------- 游标：只在当前点就地报数，不摊开整张账册 ---------- */

  function hideReadout() {
    readout.hidden = true;
    marker.setAttribute("visibility", "hidden");
  }

  function showReadout(event) {
    var rect = plot.getBoundingClientRect();
    if (!rect.width) return;
    var fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    if (view.kind === "loan") {
      if (!view.plan) return;
      var period = Math.min(view.plan.rows.length, Math.max(1, Math.round(fraction * view.xMax)));
      var row = view.plan.rows[period - 1];
      marker.setAttribute("cx", (xFraction(row.period, view.xMax) * VIEW.w).toFixed(2));
      marker.setAttribute("cy", yPixel(row.balance, view.yMin, view.yMax).toFixed(2));
      marker.setAttribute("visibility", "visible");
      say(readout, [
        { text: "第 " + row.period + " 期" },
        { text: "（第 " + (Math.floor((row.period - 1) / 12) + 1) + " 年）" },
        "　余额 ", { text: E.money(row.balance), strong: true }, " 元",
        { text: "　还款 " }, { text: E.money(row.payment), strong: true },
        { text: " 元 = 利息 " }, { text: E.money(row.interest), strong: true },
        { text: " 元 + 本金 " }, { text: E.money(row.principal), strong: true }, { text: " 元" }
      ]);
      readout.hidden = false;
      place(readout, xFraction(row.period, view.xMax), yFraction(row.balance, view.yMin, view.yMax));
      return;
    }
    if (!view.flows) return;
    var index = Math.min(view.flows.length - 1, Math.max(0, Math.round(fraction * view.xMax)));
    var running = 0;
    for (var t = 0; t <= index; t++) running += view.flows[t] / Math.pow(1 + state.discount / 100, t);
    marker.setAttribute("cx", (xFraction(index, view.xMax) * VIEW.w).toFixed(2));
    marker.setAttribute("cy", yPixel(running, view.yMin, view.yMax).toFixed(2));
    marker.setAttribute("visibility", "visible");
    say(readout, [
      { text: "第 " + index + " 期" },
      "　本期 ", { text: E.money(view.flows[index]), strong: true }, " 元",
      { text: "　折现后累计 " }, { text: E.money(running), strong: true }, { text: " 元" }
    ]);
    readout.hidden = false;
    place(readout, xFraction(index, view.xMax), yFraction(running, view.yMin, view.yMax));
  }

  /* ---------- 操作带 ---------- */

  function readTerm() {
    var years = Number(el("term").value);
    var months = Math.round(years * 12);
    el("term-read").textContent = years + " 年 · " + months + " 期";
    return months;
  }

  function switchQuestion(which) {
    state.question = which;
    el("knobs-loan").hidden = which !== "loan";
    el("knobs-cash").hidden = which === "loan";
    el("ask-loan").classList.toggle("on", which === "loan");
    el("ask-cash").classList.toggle("on", which !== "loan");
    hideReadout();
    render();
  }

  function mount() {
    el("principal").value = E.money(state.principal);
    el("rate").value = state.rate.toFixed(2);
    el("method").value = state.method;
    el("term").value = String(state.months / 12);
    el("discount").value = String(state.discount);
    el("flows").value = state.flows.join(", ");
    readTerm();

    el("principal").addEventListener("input", function () {
      var value = num(this.value);
      state.principal = value === null ? 0 : value;
      render();
    });
    el("rate").addEventListener("input", function () {
      var value = num(this.value);
      state.rate = value === null ? -1 : value;
      render();
    });
    el("method").addEventListener("change", function () {
      state.method = this.value;
      render();
    });
    el("term").addEventListener("input", function () {
      var next = readTerm();
      /* 手一落在期限上，原来那条轨迹就留在纸上当对比方案。 */
      if (state.compareMonths === null) state.compareMonths = state.months;
      state.months = next;
      hideReadout();
      render();
    });
    el("discount").addEventListener("input", function () {
      var value = num(this.value);
      state.discount = value === null ? Number.NaN : value;
      render();
    });
    el("flows").addEventListener("input", function () {
      state.flows = flowsFrom(this.value);
      render();
    });
    el("ask-loan").addEventListener("click", function () { switchQuestion("loan"); });
    el("ask-cash").addEventListener("click", function () { switchQuestion("cash"); });

    plot.addEventListener("pointermove", showReadout);
    plot.addEventListener("pointerleave", hideReadout);
    plot.addEventListener("mousemove", showReadout);
    plot.addEventListener("mouseleave", hideReadout);

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
