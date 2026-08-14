(function () {
  "use strict";

  var E = window.LegalCalculatorEngine;

  function el(id) { return document.getElementById(id); }

  function money(value) {
    var parts = value.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  /** 空着返回 null，写坏了返回 NaN：两者在链上的表现不一样，一个是「还没填」，一个是「填的用不了」。 */
  function num(id) {
    var raw = el(id).value.trim().replace(/[,\s]/g, "");
    if (raw === "") return null;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return Number.NaN;
    var value = Number(raw);
    return isFinite(value) ? value : Number.NaN;
  }

  function state(node, value) { el(node).setAttribute("data-state", value); }

  function note(id, textValue) {
    var node = el(id);
    node.textContent = textValue || "";
    node.hidden = !textValue;
  }

  function value(id, textValue) { el(id).textContent = textValue; }

  /**
   * 事实节点按先后走：走过的落稳，第一个还没落下的在等，后面的隐在纸面里。
   * 返回 true 表示所有事实都齐了。
   */
  function walk(steps) {
    var waiting = false;
    for (var i = 0; i < steps.length; i++) {
      if (waiting) {
        state(steps[i].node, "asleep");
        continue;
      }
      if (steps[i].ok) {
        state(steps[i].node, "settled");
        continue;
      }
      state(steps[i].node, "waiting");
      waiting = true;
    }
    return !waiting;
  }

  function months(value) {
    return String(Math.round(value * 100) / 100);
  }

  /* ---------- 经济补偿估算 ---------- */

  function renderLabor() {
    var salary = num("labor-salary");
    var local = num("labor-local");
    var years = num("labor-years");
    var rest = num("labor-months");
    var days = num("labor-days");

    note("labor-salary-note", salary !== null && !(salary > 0) ? "月工资填一个大于 0 的数。" : "");
    note("labor-local-note", local !== null && !(local > 0) ? "当地月平均工资填一个大于 0 的数，公开数据里能查到。" : "");
    var serviceGiven = years !== null || rest !== null || days !== null;
    var serviceMonths = E.serviceMonths(years === null ? 0 : years, rest === null ? 0 : rest, days === null ? 0 : days);
    note("labor-service-note", serviceGiven && serviceMonths === null
      ? "工龄填整数：余下月数 0–11，余下天数 0–30。" : "");

    var factsReady = walk([
      { node: "labor-n1", ok: salary !== null && salary > 0 },
      { node: "labor-n2", ok: local !== null && local > 0 },
      { node: "labor-n3", ok: years !== null && serviceMonths !== null }
    ]);

    var out = factsReady ? E.laborCompensation(salary, local, years, rest === null ? 0 : rest, days === null ? 0 : days) : null;
    if (!out) {
      ["labor-n4", "labor-n5", "labor-n6"].forEach(function (node) { state(node, "asleep"); });
      value("labor-base", "");
      value("labor-months-value", "");
      value("labor-amount", "");
      note("labor-cap-mark", "");
      note("labor-months-mark", "");
      return;
    }

    ["labor-n4", "labor-n5", "labor-n6"].forEach(function (node) { state(node, "settled"); });
    value("labor-base", money(out.salaryBase));
    value("labor-months-value", months(out.appliedMonths));
    value("labor-amount", money(out.amount));

    note("labor-cap-mark", out.capTriggered
      ? "月工资高于当地月平均工资的 3 倍，基数改按这 3 倍计。"
      : "");
    if (out.monthsCapped) {
      note("labor-months-mark", "同一道门槛把补偿月数压到 12 个月：按工龄本应 " + months(out.rawMonths) + " 个月。");
    } else if (out.rawMonths !== Math.floor(out.rawMonths)) {
      note("labor-months-mark", "余段不满 6 个月，这一段计 0.5 个月。");
    } else if (rest !== null && rest >= 6) {
      note("labor-months-mark", "余段满 6 个月，这一段计 1 个月。");
    } else {
      note("labor-months-mark", "");
    }
  }

  /* ---------- 加班工资估算 ---------- */

  var MULTIPLES = [
    { id: "weekday", input: "overtime-weekday", mult: "overtime-weekday-mult", multiple: 1.5 },
    { id: "restDay", input: "overtime-rest", mult: "overtime-rest-mult", multiple: 2 },
    { id: "holiday", input: "overtime-holiday", mult: "overtime-holiday-mult", multiple: 3 }
  ];

  function renderOvertime() {
    var salary = num("overtime-salary");
    var hours = MULTIPLES.map(function (kind) { return num(kind.input); });

    note("overtime-salary-note", salary !== null && !(salary > 0) ? "月工资填一个大于 0 的数。" : "");
    var badHours = hours.some(function (value) { return value !== null && !(value >= 0); });
    note("overtime-hours-note", badHours ? "加班小时填 0 或更大的数，没有的那一类留空。" : "");

    var anyHours = hours.some(function (value) { return value !== null && value >= 0; });
    var factsReady = walk([
      { node: "overtime-n1", ok: salary !== null && salary > 0 },
      { node: "overtime-n2", ok: salary !== null && salary > 0 },
      { node: "overtime-n3", ok: anyHours && !badHours }
    ]);

    if (salary !== null && salary > 0) {
      var hourly = salary / 21.75 / 8;
      value("overtime-hourly", money(hourly));
      note("overtime-hourly-mark", "月工资 ÷ 21.75 天 ÷ 8 小时。");
    } else {
      value("overtime-hourly", "");
      note("overtime-hourly-mark", "");
    }

    MULTIPLES.forEach(function (kind, index) {
      var given = hours[index] !== null && hours[index] > 0;
      var node = el(kind.mult);
      node.hidden = !given;
      node.textContent = given ? "× " + kind.multiple : "";
    });

    var out = factsReady
      ? E.overtimePay(salary, hours[0] === null ? 0 : hours[0], hours[1] === null ? 0 : hours[1], hours[2] === null ? 0 : hours[2])
      : null;
    if (!out) {
      state("overtime-n4", "asleep");
      value("overtime-amount", "");
      return;
    }
    state("overtime-n4", "settled");
    value("overtime-amount", money(out.total));
  }

  /* ---------- 案件受理费 ---------- */

  function wan(amount) {
    if (amount >= 10000) return (amount / 10000) + " 万";
    return money(amount).replace(/\.00$/, "") + " 元";
  }

  function buildRuler() {
    var ruler = el("fee-ruler");
    E.PROPERTY_BANDS.forEach(function (band) {
      var seg = document.createElement("span");
      seg.className = "seg";
      var mark = document.createElement("span");
      mark.textContent = band.mark;
      seg.appendChild(mark);
      ruler.appendChild(seg);
    });
  }

  function bandSentence(out) {
    var band = out.band;
    if (out.bandIndex === 0) return "标的额不超过 1 万，这一段固定 50 元。";
    var head = "标的额落在 " + wan(band.from) + "–" + (band.to === Infinity ? "以上" : wan(band.to)) +
      " 这一段，这一段按 " + band.rateText + " 计";
    return head + "；前面每一段各按自己的费率累加，不是拿这一档乘全部标的额。";
  }

  function renderFee() {
    var claim = num("fee-claim");
    note("fee-claim-note", claim !== null && !(claim > 0) ? "诉讼请求金额填一个大于 0 的数。" : "");
    var factsReady = walk([{ node: "fee-n1", ok: claim !== null && claim > 0 }]);
    var out = factsReady ? E.propertyCaseFee(claim) : null;
    if (!out) {
      state("fee-n2", "asleep");
      state("fee-n3", "asleep");
      el("fee-ruler-ink").style.width = "0%";
      note("fee-band-mark", "");
      value("fee-amount", "");
      return;
    }
    state("fee-n2", "settled");
    state("fee-n3", "settled");
    var reached = (out.bandIndex + Math.min(1, Math.max(0, out.bandFraction))) / E.PROPERTY_BANDS.length;
    el("fee-ruler-ink").style.width = (reached * 100).toFixed(2) + "%";
    note("fee-band-mark", bandSentence(out));
    value("fee-amount", money(out.total));
  }

  /* ---------- 一次只展开一条链 ---------- */

  var CHAINS = {
    labor: { section: "chain-labor", render: renderLabor, first: "labor-salary" },
    overtime: { section: "chain-overtime", render: renderOvertime, first: "overtime-salary" },
    fee: { section: "chain-fee", render: renderFee, first: "fee-claim" }
  };

  function open(which) {
    Object.keys(CHAINS).forEach(function (key) {
      el(CHAINS[key].section).hidden = key !== which;
    });
    el("ask").hidden = true;
    el("again").hidden = false;
    CHAINS[which].render();
    var first = el(CHAINS[which].first);
    if (first && typeof first.focus === "function") first.focus();
  }

  function backToAsk() {
    Object.keys(CHAINS).forEach(function (key) { el(CHAINS[key].section).hidden = true; });
    el("ask").hidden = false;
    el("again").hidden = true;
  }

  function mount() {
    buildRuler();

    document.querySelectorAll(".picks button").forEach(function (button) {
      button.addEventListener("click", function () { open(button.getAttribute("data-chain")); });
    });
    el("again").addEventListener("click", backToAsk);

    [["labor-salary", renderLabor], ["labor-local", renderLabor], ["labor-years", renderLabor],
     ["labor-months", renderLabor], ["labor-days", renderLabor],
     ["overtime-salary", renderOvertime], ["overtime-weekday", renderOvertime],
     ["overtime-rest", renderOvertime], ["overtime-holiday", renderOvertime],
     ["fee-claim", renderFee]].forEach(function (pair) {
      el(pair[0]).addEventListener("input", pair[1]);
    });

    renderLabor();
    renderOvertime();
    renderFee();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
