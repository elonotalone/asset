(function () {
  "use strict";

  var E = window.LegalCalculatorEngine;
  var numberIds = ["labor-salary", "local-average", "service-years", "service-months", "service-days", "overtime-salary", "weekday-hours", "rest-hours", "holiday-hours", "claim-amount", "lpr-rate"];

  function el(id) { return document.getElementById(id); }

  function numberFrom(id) {
    var raw = el(id).value.trim().replace(/[, \s]/g, "");
    if (raw === "") return null;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return NaN;
    var value = Number(raw);
    return isFinite(value) ? value : NaN;
  }

  function money(value) {
    var parts = value.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  function setResult(valueId, statusId, value, status, suffix) {
    var node = el(valueId);
    node.textContent = value === null ? "待输入" : value + (suffix || "");
    node.className = "result-value" + (value === null ? " waiting" : "");
    el(statusId).textContent = status;
  }

  function missing(values) {
    var labels = [];
    for (var i = 0; i < values.length; i++) if (values[i][0] === null) labels.push(values[i][1]);
    return labels;
  }

  function invalidNumbers(values, integerNames) {
    var labels = [];
    for (var i = 0; i < values.length; i++) {
      var value = values[i][0];
      var name = values[i][1];
      if (typeof value === "number" && (!isFinite(value) || value < 0 || (integerNames.indexOf(name) >= 0 && Math.floor(value) !== value))) labels.push(name);
    }
    return labels;
  }

  function renderLabor() {
    var salary = numberFrom("labor-salary");
    var localAverage = numberFrom("local-average");
    var years = numberFrom("service-years");
    var months = numberFrom("service-months");
    var days = numberFrom("service-days");
    var fields = [[salary, "月工资"], [localAverage, "当地月均工资"], [years, "完整年数"], [months, "余下月数"], [days, "余下天数"]];
    var lacks = missing(fields);
    var bad = invalidNumbers(fields, ["完整年数", "余下月数", "余下天数"]);
    if (typeof months === "number" && isFinite(months) && months > 11) bad.push("余下月数");
    if (typeof days === "number" && isFinite(days) && days > 30) bad.push("余下天数");
    if (salary === 0 || localAverage === 0) bad.push(salary === 0 ? "月工资" : "当地月均工资");
    el("labor-message").textContent = bad.length ? bad.join("、") + "的输入不符合口径。" : "";
    var out = E.laborCompensation(salary, localAverage, years, months, days);
    if (!out) {
      var prompt = lacks.length ? "还需要" + lacks.join("、") : "请检查全部输入";
      setResult("compensation-value", "compensation-status", null, prompt);
      setResult("illegal-value", "illegal-status", null, "经济补偿 × 2；是否违法解除需另行判断");
      return;
    }
    var capText = out.capTriggered ? "已触发三倍工资基数与十二年上限" : "未触发三倍工资上限";
    setResult("compensation-value", "compensation-status", money(out.amount), "工资基数 " + money(out.salaryBase) + " 元 · 补偿月数 " + out.appliedMonths + " · " + capText);
    setResult("illegal-value", "illegal-status", money(out.illegalTerminationAmount), "经济补偿 " + money(out.amount) + " 元 × 2；解除性质需另行判断");
  }

  function renderOvertime() {
    var salary = numberFrom("overtime-salary");
    var weekday = numberFrom("weekday-hours");
    var rest = numberFrom("rest-hours");
    var holiday = numberFrom("holiday-hours");
    var fields = [[salary, "月工资"], [weekday, "工作日延时"], [rest, "休息日"], [holiday, "法定节假日"]];
    var lacks = missing(fields);
    var bad = invalidNumbers(fields, []);
    if (salary === 0) bad.push("月工资");
    el("overtime-message").textContent = bad.length ? bad.join("、") + "需输入有效的非负数值，月工资须大于 0。" : "";
    var out = E.overtimePay(salary, weekday, rest, holiday);
    if (!out) {
      setResult("overtime-value", "overtime-status", null, lacks.length ? "还需要" + lacks.join("、") : "请检查全部输入");
      return;
    }
    setResult("overtime-value", "overtime-status", money(out.total), "工作日 " + money(out.weekday) + " + 休息日 " + money(out.restDay) + " + 法定节假日 " + money(out.holiday) + "；小时工资 " + money(out.hourlyWage) + " 元");
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderFee() {
    var amount = numberFrom("claim-amount");
    var list = el("fee-breakdown");
    clear(list);
    var out = E.propertyCaseFee(amount);
    if (!out) {
      el("fee-message").textContent = amount === null ? "" : "诉讼请求金额需输入大于 0 的有限数值。";
      setResult("fee-value", "fee-status", null, amount === null ? "输入标的额后逐段列出，明细之和必须回到总额" : "请检查诉讼请求金额");
      var waiting = document.createElement("li");
      waiting.textContent = "待输入：尚无个案分段金额。";
      list.appendChild(waiting);
      return;
    }
    el("fee-message").textContent = "";
    setResult("fee-value", "fee-status", money(out.total), "分段累加；以下明细合计与总额一致");
    var sum = 0;
    out.details.forEach(function (detail) {
      sum += detail.fee;
      var item = document.createElement("li");
      item.textContent = detail.rate === null ? detail.label + "：固定 50.00 元" : detail.label + "：" + money(detail.base) + " × " + (detail.rate * 100) + "% = " + money(detail.fee) + " 元";
      list.appendChild(item);
    });
    var total = document.createElement("li");
    total.textContent = "明细合计 " + money(Math.round((sum + Number.EPSILON) * 100) / 100) + " 元，与总额一致。";
    list.appendChild(total);
  }

  function renderLending() {
    var date = el("contract-date").value;
    var lpr = numberFrom("lpr-rate");
    var cap = E.lendingRateCap(lpr);
    if (!date || cap === null) {
      var needs = [];
      if (!date) needs.push("合同成立日");
      if (lpr === null) needs.push("该日一年期 LPR");
      el("lending-message").textContent = lpr !== null && cap === null ? "LPR 需输入大于 0 的有限数值。" : "";
      setResult("lpr-cap-value", "lpr-cap-status", null, needs.length ? "还需要" + needs.join("、") : "请检查 LPR");
      return;
    }
    el("lending-message").textContent = "";
    setResult("lpr-cap-value", "lpr-cap-status", cap.toFixed(2), date + " 对应的一年期 LPR " + lpr.toFixed(2) + "% × 4；请复核当日数值与适用文本");
  }

  function runTest() {
    var result = E.runSelfTest();
    el("test-out").textContent = result.passed + " / " + result.total + " 通过";
    var detail = el("test-detail");
    clear(detail);
    if (result.failures.length === 0) {
      var ok = document.createElement("li");
      ok.textContent = "劳动边界、加班倍数、受理费各段与 LPR 四倍用例全部通过。";
      detail.appendChild(ok);
    } else {
      result.failures.forEach(function (failure) {
        var item = document.createElement("li");
        item.textContent = failure.name + " —— " + failure.why;
        detail.appendChild(item);
      });
    }
  }

  function mount() {
    numberIds.forEach(function (id) {
      el(id).addEventListener("input", id.indexOf("labor-") === 0 || id.indexOf("service-") === 0 || id === "local-average" ? renderLabor : id.indexOf("overtime-") === 0 || id.indexOf("-hours") >= 0 ? renderOvertime : id === "claim-amount" ? renderFee : renderLending);
    });
    el("contract-date").addEventListener("input", renderLending);
    document.querySelectorAll(".category-nav button").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".category-nav button").forEach(function (item) { item.classList.remove("active"); });
        button.classList.add("active");
        var target = el(button.getAttribute("data-target"));
        if (target && typeof target.scrollIntoView === "function") target.scrollIntoView();
        if (target) target.focus();
      });
    });
    el("run-test").addEventListener("click", runTest);
    renderLabor();
    renderOvertime();
    renderFee();
    renderLending();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
