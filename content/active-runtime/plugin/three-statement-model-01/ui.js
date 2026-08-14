/* 三表模型 · 装配。改一个旋钮，光顺着通路往下推一遍，最后落在咬合上。 */
(function () {
  "use strict";

  var E = window.ThreeStatementEngine;
  var doc = document;

  /* 旋钮：屏幕上的值 → 引擎口径。rate 的屏幕单位是 %，引擎要的是小数。 */
  var KNOBS = {
    baseRevenue: { name: "基期收入", unit: "元", kind: "money", min: 0, open: true },
    revenueGrowth: { name: "收入增速", unit: "%", kind: "rate", min: -100, max: 200, open: true },
    grossMargin: { name: "毛利率", unit: "%", kind: "rate", min: 0, max: 100 },
    operatingExpensePct: { name: "运营费用率", unit: "%", kind: "rate", min: 0, max: 100 },
    taxRate: { name: "税率", unit: "%", kind: "rate", min: 0, max: 100 },
    capexPct: { name: "资本开支率", unit: "%", kind: "rate", min: 0, max: 100 },
    depreciationYears: { name: "折旧年限", unit: "年", kind: "whole", min: 1, max: 50 },
    dso: { name: "应收周转天数", unit: "天", kind: "days", min: 0, max: 365 },
    inventoryDays: { name: "存货天数", unit: "天", kind: "days", min: 0, max: 365 },
    payableDays: { name: "应付天数", unit: "天", kind: "days", min: 0, max: 365 },
    interestRate: { name: "循环贷利率", unit: "%", kind: "rate", min: 0, max: 100 },
    minimumCash: { name: "最低现金", unit: "元", kind: "money", min: 0 }
  };

  /* 每一行读引擎的哪个数。第二个字段是它属于哪一波传动。 */
  var ROWS = {
    revenue: [function (y) { return y.income.revenue; }, 0],
    depreciation: [function (y) { return y.income.depreciation; }, 0],
    ebit: [function (y) { return y.income.ebit; }, 0],
    cogs: [function (y) { return y.income.cogs; }, 0],
    grossProfit: [function (y) { return y.income.grossProfit; }, 0],
    operatingExpense: [function (y) { return y.income.operatingExpense; }, 0],
    netIncome: [function (y) { return y.income.netIncome; }, 0],
    interest: [function (y) { return y.income.interest; }, 0],
    pretaxIncome: [function (y) { return y.income.pretaxIncome; }, 0],
    tax: [function (y) { return y.income.tax; }, 0],
    receivables: [function (y) { return y.balance.receivables; }, 0],
    inventory: [function (y) { return y.balance.inventory; }, 0],
    payables: [function (y) { return y.balance.payables; }, 0],

    cfNetIncome: [function (y) { return y.cashFlow.netIncome; }, 1],
    cfDepreciation: [function (y) { return y.cashFlow.depreciationAddBack; }, 1],
    cfReceivables: [function (y) { return -y.cashFlow.receivablesChange; }, 1],
    cfInventory: [function (y) { return -y.cashFlow.inventoryChange; }, 1],
    cfPayables: [function (y) { return y.cashFlow.payablesChange; }, 1],
    operatingCashFlow: [function (y) { return y.cashFlow.operatingCashFlow; }, 1],
    openingCash: [function (y) { return y.cashFlow.openingCash; }, 1],
    capex: [function (y) { return -y.cashFlow.capex; }, 1],
    preFinanceCash: [function (y) { return y.preFinanceCash; }, 1],
    revolverChange: [function (y) { return y.cashFlow.revolverChange; }, 1],
    endingCash: [function (y) { return y.cashFlow.endingCash; }, 1],

    cash: [function (y) { return y.balance.cash; }, 2],
    ppe: [function (y) { return y.balance.ppe; }, 2],
    revolver: [function (y) { return y.balance.revolver; }, 2],
    retainedEarnings: [function (y) { return y.balance.retainedEarnings; }, 2],
    shareCapital: [function (y) { return y.balance.shareCapital; }, 2],

    assets: [function (y) { return y.balance.assets; }, 3],
    liabilitiesAndEquity: [function (y) { return y.balance.liabilitiesAndEquity; }, 3],
    difference: [function (y) { return y.balance.difference; }, 3]
  };

  /* 通路：连的是行与行，不是三个方框。lane 决定它走左侧哪一条道。 */
  var LINKS = [
    { from: "netIncome", to: "cfNetIncome", wave: 1, lane: 0 },
    { from: "depreciation", to: "cfDepreciation", wave: 1, lane: 1 },
    { from: "receivables", to: "cfReceivables", wave: 1, lane: 2 },
    { from: "endingCash", to: "cash", wave: 2, lane: 3 },
    { from: "depreciation", to: "ppe", wave: 2, lane: 4 },
    { from: "netIncome", to: "retainedEarnings", wave: 2, lane: 5 },
    { from: "revolver", to: "endingCash", wave: 2, lane: 6 }
  ];

  var stack = doc.getElementById("stack");
  var drive = doc.getElementById("drive");
  var verdictLine = doc.getElementById("verdict");
  var traceLine = doc.getElementById("trace");
  var inputs = {};
  var cells = {};
  var rowNodes = {};
  var paths = [];
  var timers = [];

  function ns(name) { return doc.createElementNS("http://www.w3.org/2000/svg", name); }

  Object.keys(KNOBS).forEach(function (key) {
    inputs[key] = doc.querySelector('[data-knob="' + key + '"]');
  });

  Array.prototype.forEach.call(doc.querySelectorAll("tr[data-row]"), function (row) {
    var key = row.getAttribute("data-row");
    rowNodes[key] = row;
    cells[key] = Array.prototype.slice.call(row.querySelectorAll("td[data-year]"));
  });

  function show(key, value) {
    var spec = KNOBS[key];
    var shown = spec.kind === "rate" ? value * 100 : value;
    var text = String(Math.round(shown * 1e6) / 1e6);
    return text;
  }

  function readKnob(key) {
    var raw = String(inputs[key].value || "").replace(/[\s,]/g, "").replace(/[−–—]/g, "-");
    var spec = KNOBS[key];
    if (raw === "" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
      return { bad: spec.name + "要填一个数字" };
    }
    var shown = Number(raw);
    if (spec.kind === "whole" && !Number.isInteger(shown)) {
      return { bad: spec.name + "要填 " + spec.min + " 到 " + spec.max + " 的整数" };
    }
    var lowOk = spec.open && spec.kind === "rate" ? shown > spec.min : shown >= spec.min;
    var highOk = spec.max === undefined ? true : shown <= spec.max;
    if (!lowOk || !highOk) {
      if (spec.max === undefined) return { bad: spec.name + "不能小于 " + spec.min + " " + spec.unit };
      return { bad: spec.name + "要在 " + spec.min + " 到 " + spec.max + " " + spec.unit + "之间" };
    }
    if (spec.kind === "money" && spec.open && !(shown > 0)) {
      return { bad: spec.name + "必须大于 0 元" };
    }
    return { value: spec.kind === "rate" ? shown / 100 : shown, shown: shown };
  }

  function clearWhy() {
    Array.prototype.forEach.call(doc.querySelectorAll(".why"), function (node) { node.remove(); });
    Object.keys(inputs).forEach(function (key) { inputs[key].classList.remove("bad"); });
  }

  function markBad(key, reason) {
    inputs[key].classList.add("bad");
    var note = doc.createElement("span");
    note.className = "why";
    note.textContent = reason;
    inputs[key].closest(".rowname").appendChild(note);
  }

  function amount(value) {
    return E.money(value);
  }

  function blank() {
    Object.keys(cells).forEach(function (key) {
      cells[key].forEach(function (cell) {
        cell.textContent = "";
        cell.removeAttribute("data-value");
        cell.classList.remove("moved");
      });
    });
    rowNodes.difference.hidden = true;
    stack.classList.remove("open");
    verdictLine.textContent = "";
    verdictLine.classList.remove("short");
    stack.classList.add("stalled");
  }

  function stopTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function writeRow(key, years, moved) {
    var pairs = cells[key];
    if (!pairs) return;
    for (var i = 0; i < pairs.length; i++) {
      var value = ROWS[key][0](years[i]);
      var text = amount(value);
      var cell = pairs[i];
      var current = cell.getAttribute("data-value");
      if (current === text) continue;
      cell.setAttribute("data-value", text);
      cell.textContent = "";
      var number = doc.createElement("span");
      number.className = "v";
      number.textContent = text;
      var mark = doc.createElement("b");
      mark.textContent = "元";
      cell.appendChild(number);
      cell.appendChild(mark);
      if (moved) cell.classList.add("moved");
    }
  }

  function lightWave(wave) {
    paths.forEach(function (entry) {
      if (entry.wave === wave) entry.node.classList.add("live");
    });
  }

  function darken() {
    paths.forEach(function (entry) { entry.node.classList.remove("live"); });
    Object.keys(cells).forEach(function (key) {
      cells[key].forEach(function (cell) { cell.classList.remove("moved"); });
    });
  }

  /* 咬合：合上时差额那一行连数字都不写，屏幕上只剩一条连续的接缝。 */
  function seam(years) {
    var open = years.some(function (year) { return year.balance.difference !== 0; });
    rowNodes.difference.hidden = !open;
    stack.classList.toggle("open", open);
    if (open) return true;
    cells.difference.forEach(function (cell) {
      cell.textContent = "";
      cell.removeAttribute("data-value");
    });
    return false;
  }

  function verdictOf(model, a) {
    var years = model.years;
    var floor = E.round2(a.minimumCash);
    var openingDebt = E.round2(a.openingRevolver);
    for (var i = 0; i < years.length; i++) {
      var year = years[i];
      var before = i === 0 ? openingDebt : years[i - 1].balance.revolver;
      if (year.cashFlow.revolverChange > 0) {
        return {
          short: true,
          text: "现金第一次不够是在 " + year.label + "：融资前现金 " + amount(year.preFinanceCash) +
            " 元，离最低现金 " + amount(floor) + " 元差 " + amount(E.round2(floor - year.preFinanceCash)) +
            " 元，循环贷要从 " + amount(before) + " 元加到 " + amount(year.balance.revolver) +
            " 元，多借 " + amount(year.cashFlow.revolverChange) + " 元。"
        };
      }
    }
    for (var j = 0; j < years.length; j++) {
      var pinned = years[j];
      if (pinned.balance.revolver > 0) {
        var repaid = E.round2(-pinned.cashFlow.revolverChange);
        var how = repaid > 0
          ? "循环贷这一年只还掉 " + amount(repaid) + " 元，还欠 " + amount(pinned.balance.revolver) + " 元。"
          : "循环贷一分没还，还欠 " + amount(pinned.balance.revolver) + " 元。";
        return {
          short: false,
          text: "现金撑得住，但 " + pinned.label + " 只是刚够：期末现金 " + amount(pinned.cashFlow.endingCash) +
            " 元压在最低现金 " + amount(floor) + " 元上，" + how
        };
      }
    }
    var last = years[years.length - 1];
    return {
      short: false,
      text: "三年现金都够：" + last.label + " 期末现金 " + amount(last.cashFlow.endingCash) +
        " 元，比最低现金 " + amount(floor) + " 元多 " + amount(E.round2(last.cashFlow.endingCash - floor)) +
        " 元，循环贷三年都不用再借。"
    };
  }

  function trace(shownNow) {
    traceLine.textContent = "";
    var stock = doc.createElement("span");
    stock.textContent = "出厂假设";
    traceLine.appendChild(stock);
    var changed = Object.keys(KNOBS).filter(function (key) {
      return String(shownNow[key]) !== String(show(key, E.DEFAULT[key]));
    });
    changed.forEach(function (key) {
      var spec = KNOBS[key];
      var chunk = doc.createElement("span");
      var was = doc.createElement("span");
      was.className = "was";
      was.textContent = show(key, E.DEFAULT[key]) + " " + spec.unit + " →";
      var now = doc.createElement("span");
      now.className = "now";
      now.textContent = " " + shownNow[key] + " " + spec.unit;
      chunk.appendChild(doc.createTextNode(" · " + spec.name + " "));
      chunk.appendChild(was);
      chunk.appendChild(now);
      traceLine.appendChild(chunk);
    });
  }

  function anchor(row) {
    var deck = row.closest(".deck");
    var box = stack.getBoundingClientRect();
    var rowBox = row.getBoundingClientRect();
    var deckBox = deck.getBoundingClientRect();
    return {
      x: deckBox.left - box.left,
      y: rowBox.top - box.top + rowBox.height / 2
    };
  }

  function drawDrive() {
    var box = stack.getBoundingClientRect();
    drive.setAttribute("viewBox", "0 0 " + Math.max(box.width, 1) + " " + Math.max(box.height, 1));
    while (drive.firstChild) drive.removeChild(drive.firstChild);
    paths = [];
    LINKS.forEach(function (link) {
      var from = rowNodes[link.from];
      var to = rowNodes[link.to];
      if (!from || !to || from.hidden || to.hidden) return;
      var a = anchor(from);
      var b = anchor(to);
      var lane = a.x - 12 - link.lane * 8;
      var node = ns("path");
      node.setAttribute("data-from", link.from);
      node.setAttribute("data-to", link.to);
      node.setAttribute("d",
        "M " + a.x + " " + a.y +
        " H " + lane +
        " V " + b.y +
        " H " + b.x +
        " m -6 -4 l 6 4 l -6 4");
      drive.appendChild(node);
      paths.push({ node: node, wave: link.wave });
    });
  }

  function recompute(animate) {
    stopTimers();
    clearWhy();

    var raw = {};
    var shownNow = {};
    var firstBad = null;
    Object.keys(KNOBS).forEach(function (key) {
      var read = readKnob(key);
      shownNow[key] = String(inputs[key].value || "").trim();
      if (read.bad) {
        if (!firstBad) firstBad = key;
        markBad(key, read.bad);
        return;
      }
      raw[key] = read.value;
    });

    trace(shownNow);

    if (firstBad) {
      blank();
      return;
    }

    var opening = {
      openingCash: E.DEFAULT.openingCash,
      openingReceivables: E.DEFAULT.openingReceivables,
      openingInventory: E.DEFAULT.openingInventory,
      openingPpe: E.DEFAULT.openingPpe,
      openingPayables: E.DEFAULT.openingPayables,
      openingRevolver: E.DEFAULT.openingRevolver,
      openingRetainedEarnings: E.DEFAULT.openingRetainedEarnings,
      shareCapital: E.DEFAULT.shareCapital
    };
    Object.keys(opening).forEach(function (key) { raw[key] = opening[key]; });

    var checked = E.assumptionsOf(raw);
    var model = checked.ok ? E.project(raw, "opening") : null;
    if (!model) {
      blank();
      markBad(firstBad || "baseRevenue", "这一组假设算不出三张表");
      return;
    }

    stack.classList.remove("stalled");
    var years = model.years;
    var said = verdictOf(model, checked.assumptions);

    var waves = [[], [], [], []];
    Object.keys(ROWS).forEach(function (key) { waves[ROWS[key][1]].push(key); });

    function play(wave) {
      waves[wave].forEach(function (key) {
        if (key === "difference") return;
        writeRow(key, years, animate);
      });
      if (wave === 3 && seam(years)) writeRow("difference", years, animate);
      if (animate && wave > 0) lightWave(wave);
    }

    play(0);
    if (!animate) {
      play(1); play(2); play(3);
      verdictLine.textContent = said.text;
      verdictLine.classList.toggle("short", said.short);
      return;
    }
    timers.push(setTimeout(function () { play(1); }, 120));
    timers.push(setTimeout(function () { play(2); }, 220));
    timers.push(setTimeout(function () {
      play(3);
      verdictLine.textContent = said.text;
      verdictLine.classList.toggle("short", said.short);
    }, 320));
    timers.push(setTimeout(darken, 820));
  }

  Object.keys(KNOBS).forEach(function (key) {
    inputs[key].value = show(key, E.DEFAULT[key]);
    inputs[key].addEventListener("input", function () { recompute(true); });
  });

  Array.prototype.forEach.call(doc.querySelectorAll("button.open"), function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-open");
      var opened = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", opened ? "false" : "true");
      Array.prototype.forEach.call(doc.querySelectorAll('tr[data-under="' + key + '"]'), function (row) {
        row.hidden = opened;
      });
      drawDrive();
    });
  });

  recompute(false);
  drawDrive();
  window.addEventListener("resize", drawDrive);
  window.ThreeStatementRig = { recompute: recompute, verdictOf: verdictOf };
})();
