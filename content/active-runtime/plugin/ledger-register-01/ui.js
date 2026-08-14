/* 台账 · DOM 装配层。所有计算来自 LedgerEngine。 */
(function () {
  "use strict";

  var E = window.LedgerEngine;
  var state = {
    mode: "ledger",
    asOf: "2026-08-14",
    message: "",
    error: false,
    entries: { ledger: [], receivable: [], inventory: [], depreciation: [] }
  };
  var els = {};

  var META = {
    ledger: {
      note: "余额 = 上一笔余额 + 借方 − 贷方；逐笔取分，总额处列示舍入调整。",
      guide: ["点明细第一行的日期。", "填项目与借方或贷方。", "点“记入台账”，合计和连续余额同步更新。"],
      heads: ["日期", "项目", "借方", "贷方", "余额", "操作"]
    },
    receivable: {
      note: "未收 = 金额 − 已收；按到期日至基准日的自然日数进入六档账龄。",
      guide: ["确认账龄基准日。", "填发生日、事项、到期日、金额与已收。", "六档金额自动回勾未收合计。"],
      heads: ["日期", "客户或事项", "到期日", "金额", "已收", "未收", "账龄", "分档", "操作"]
    },
    inventory: {
      note: "数量口径：期末 = 期初 + 入库 − 出库；每一行与合计都可复核。",
      guide: ["填日期和品项。", "填期初、入库、出库数量。", "记入后立即得到逐项期末与合计。"],
      heads: ["日期", "品项", "期初", "入库", "出库", "期末", "操作"]
    },
    depreciation: {
      note: "直线、双倍余额递减（末期转直线）与年数总和法均摊开完整年限。",
      guide: ["填资产、原值、残值与年限。", "选择折旧方法。", "记入后逐年净值完整摊开，绝不低于残值。"],
      heads: ["资产", "方法", "年", "年初净值", "本年折旧", "年末净值", "计算口径"]
    }
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function amount(raw, blankAsZero) {
    var value = String(raw === undefined ? "" : raw).trim().replace(/[,\s]/g, "");
    if (value === "" && blankAsZero) return 0;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(value)) return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }
  function cell(text, cls) { return el("td", cls || null, text); }

  function metric(label, value) {
    var box = el("div", "metric");
    box.appendChild(el("div", "label", label));
    box.appendChild(el("div", "value", value));
    els.headline.appendChild(box);
  }

  function inputCell(row, id, type, label, placeholder) {
    var td = document.createElement("td");
    var input = document.createElement("input");
    input.id = id;
    input.type = type || "text";
    input.setAttribute("aria-label", label);
    input.placeholder = placeholder || "";
    input.autocomplete = "off";
    td.appendChild(input);
    row.appendChild(td);
    return input;
  }

  function actionCell(row, label, handler) {
    var td = el("td", "add-cell");
    var button = el("button", null, label);
    button.type = "button";
    button.addEventListener("click", handler);
    td.appendChild(button);
    row.appendChild(td);
  }

  function removeButton(index, mode) {
    var button = el("button", null, "删除");
    button.type = "button";
    button.setAttribute("aria-label", "删除第 " + (index + 1) + " 条记录");
    button.addEventListener("click", function () {
      state.entries[mode].splice(index, 1);
      state.message = "已删除第 " + (index + 1) + " 条。";
      state.error = false;
      render();
    });
    return button;
  }

  function setStatus(message, isError) {
    state.message = message;
    state.error = !!isError;
    render();
  }

  function addLedger() {
    var entry = {
      date: document.getElementById("draft-date").value,
      item: document.getElementById("draft-item").value.trim(),
      debit: amount(document.getElementById("draft-debit").value, true),
      credit: amount(document.getElementById("draft-credit").value, true)
    };
    if (!entry.date || !entry.item || entry.debit === null || entry.credit === null || (entry.debit === 0 && entry.credit === 0)) {
      setStatus("请填有效日期、项目，并至少填一个非零借方或贷方金额。", true);
      return;
    }
    var candidate = state.entries.ledger.concat([entry]);
    if (!E.ledger(candidate)) { setStatus("这一行含无效日期或金额，尚未记入。", true); return; }
    state.entries.ledger = candidate;
    setStatus("已记入第 " + candidate.length + " 条流水。", false);
  }

  function addReceivable() {
    var entry = {
      date: document.getElementById("draft-date").value,
      item: document.getElementById("draft-item").value.trim(),
      dueDate: document.getElementById("draft-due").value,
      amount: amount(document.getElementById("draft-amount").value, false),
      received: amount(document.getElementById("draft-received").value, true)
    };
    if (!entry.date || !entry.item || !entry.dueDate || entry.amount === null || entry.amount <= 0 || entry.received === null) {
      setStatus("请填有效日期、事项、到期日和正数金额；已收可留空为 0。", true);
      return;
    }
    var candidate = state.entries.receivable.concat([entry]);
    if (!E.ageReceivables(candidate, state.asOf)) { setStatus("这一行或账龄基准日无效，尚未记入。", true); return; }
    state.entries.receivable = candidate;
    setStatus("已记入第 " + candidate.length + " 笔应收。", false);
  }

  function addInventory() {
    var entry = {
      date: document.getElementById("draft-date").value,
      item: document.getElementById("draft-item").value.trim(),
      opening: amount(document.getElementById("draft-opening").value, false),
      inbound: amount(document.getElementById("draft-inbound").value, true),
      outbound: amount(document.getElementById("draft-outbound").value, true)
    };
    if (!entry.date || !entry.item || entry.opening === null || entry.inbound === null || entry.outbound === null) {
      setStatus("请填有效日期、品项与非负数量；入库、出库可留空为 0。", true);
      return;
    }
    var candidate = state.entries.inventory.concat([entry]);
    if (!E.inventory(candidate)) { setStatus("这一行含无效日期或数量，尚未记入。", true); return; }
    state.entries.inventory = candidate;
    setStatus("已记入第 " + candidate.length + " 个库存品项。", false);
  }

  function addDepreciation() {
    var entry = {
      item: document.getElementById("draft-asset").value.trim(),
      cost: amount(document.getElementById("draft-cost").value, false),
      salvage: amount(document.getElementById("draft-salvage").value, true),
      life: Number(document.getElementById("draft-life").value),
      method: document.getElementById("draft-method").value
    };
    var schedule = E.depreciationSchedule(entry.cost, entry.salvage, entry.life, entry.method);
    if (!entry.item || !schedule) {
      setStatus("请填资产、非负原值/残值和正整数年限；残值不得高于原值。", true);
      return;
    }
    state.entries.depreciation.push(entry);
    setStatus("已生成“" + entry.item + "”的完整折旧年表。", false);
  }

  function renderHead() {
    clear(els.tableHead);
    var tr = document.createElement("tr");
    META[state.mode].heads.forEach(function (label) { tr.appendChild(el("th", null, label)); });
    els.tableHead.appendChild(tr);
  }

  function renderDraft() {
    var tr = el("tr", "draft-row");
    if (state.mode === "ledger") {
      inputCell(tr, "draft-date", "date", "日期");
      inputCell(tr, "draft-item", "text", "项目", "例如：差旅预付款");
      inputCell(tr, "draft-debit", "text", "借方", "0.00");
      inputCell(tr, "draft-credit", "text", "贷方", "0.00");
      tr.appendChild(cell("0.00", "amount"));
      actionCell(tr, "记入台账", addLedger);
    } else if (state.mode === "receivable") {
      inputCell(tr, "draft-date", "date", "日期");
      inputCell(tr, "draft-item", "text", "客户或事项", "客户或事项");
      inputCell(tr, "draft-due", "date", "到期日");
      inputCell(tr, "draft-amount", "text", "金额", "0.00");
      inputCell(tr, "draft-received", "text", "已收", "0.00");
      tr.appendChild(cell("—"));
      tr.appendChild(cell("—"));
      tr.appendChild(cell("—"));
      actionCell(tr, "记入台账", addReceivable);
    } else if (state.mode === "inventory") {
      inputCell(tr, "draft-date", "date", "日期");
      inputCell(tr, "draft-item", "text", "品项", "品项名称");
      inputCell(tr, "draft-opening", "text", "期初", "0.00");
      inputCell(tr, "draft-inbound", "text", "入库", "0.00");
      inputCell(tr, "draft-outbound", "text", "出库", "0.00");
      tr.appendChild(cell("—"));
      actionCell(tr, "记入台账", addInventory);
    } else {
      var td = document.createElement("td");
      td.colSpan = 7;
      var editor = el("div", "depr-editor");
      var fields = [
        ["资产", "draft-asset", "text", "例如：生产设备"],
        ["原值", "draft-cost", "text", "100000.00"],
        ["残值", "draft-salvage", "text", "10000.00"],
        ["年限", "draft-life", "number", "5"]
      ];
      fields.forEach(function (field) {
        var label = el("label", null, field[0]);
        var input = document.createElement("input");
        input.id = field[1]; input.type = field[2]; input.placeholder = field[3]; input.setAttribute("aria-label", field[0]);
        label.appendChild(input); editor.appendChild(label);
      });
      var methodLabel = el("label", null, "方法");
      var select = document.createElement("select");
      select.id = "draft-method";
      [["straight-line", "直线"], ["double-declining", "双倍余额递减"], ["sum-of-years", "年数总和"]].forEach(function (pair) {
        var option = el("option", null, pair[1]); option.value = pair[0]; select.appendChild(option);
      });
      methodLabel.appendChild(select); editor.appendChild(methodLabel);
      var button = el("button", null, "生成年表"); button.type = "button"; button.addEventListener("click", addDepreciation); editor.appendChild(button);
      td.appendChild(editor); tr.appendChild(td);
    }
    els.tableBody.appendChild(tr);
  }

  function renderLedger() {
    var result = E.ledger(state.entries.ledger);
    metric("记录", String(result.count));
    metric("借方合计", E.money(result.debitTotal));
    metric("贷方合计", E.money(result.creditTotal));
    metric("期末余额", E.money(result.reportedClosing));
    els.basisLine.textContent = "金额单位 元 · 每笔四舍五入到分 · 余额 = 上笔余额 + 借方 − 贷方";
    els.reconcileLine.textContent = "分位余额 " + E.money(result.roundedClosing) + " + 舍入调整 " + E.money(result.roundingAdjustment) + " = 报告期末 " + E.money(result.reportedClosing) + "（未逐笔舍入总额 " + E.money(result.rawClosingRounded) + "）";
    renderDraft();
    result.rows.forEach(function (row, index) {
      var tr = el("tr", "data-row");
      [row.date, row.item, E.money(row.debit), E.money(row.credit), E.money(row.balance)].forEach(function (value, col) { tr.appendChild(cell(value, col > 1 ? "amount" : null)); });
      var action = document.createElement("td"); action.appendChild(removeButton(index, "ledger")); tr.appendChild(action);
      els.tableBody.appendChild(tr);
    });
    els.emptyNote.textContent = result.count ? "共 " + result.count + " 条，全部摊开；表区可独立滚动。" : "0 条记录。上面空白首行就是入口，没有示例记录，也无需先新建文件。";
  }

  function renderReceivable() {
    var result = E.ageReceivables(state.entries.receivable, state.asOf);
    metric("记录", String(result.count));
    metric("金额合计", E.money(result.amountTotal));
    metric("已收合计", E.money(result.receivedTotal));
    metric("未收合计", E.money(result.outstandingTotal));
    els.basisLine.textContent = "金额单位 元 · 未收 = max(金额 − 已收, 0) · 账龄基准日 " + state.asOf;
    els.reconcileLine.textContent = E.AGE_BUCKETS.map(function (bucket) { return bucket + " 天 " + E.money(result.buckets[bucket]); }).join(" · ") + " · 六档合计 " + E.money(result.bucketTotal) + " = 未收 " + E.money(result.outstandingTotal) + "（" + (result.ties ? "已对上" : "未对上") + "）";
    renderDraft();
    result.rows.forEach(function (row, index) {
      var tr = el("tr", "data-row");
      [row.date, row.item, row.dueDate, E.money(row.amount), E.money(row.received), E.money(row.outstanding), row.ageDays + " 天", row.bucket].forEach(function (value, col) { tr.appendChild(cell(value, col >= 3 && col <= 5 ? "amount" : null)); });
      var action = document.createElement("td"); action.appendChild(removeButton(index, "receivable")); tr.appendChild(action);
      els.tableBody.appendChild(tr);
    });
    els.emptyNote.textContent = result.count ? "六档账龄逐笔可追溯，且始终回勾未收合计。" : "0 条应收。空白首行等待第一笔，不预装客户数据。";
  }

  function renderInventory() {
    var result = E.inventory(state.entries.inventory);
    metric("记录", String(result.count));
    metric("期初合计", E.money(result.openingTotal));
    metric("入库合计", E.money(result.inboundTotal));
    metric("出库合计", E.money(result.outboundTotal));
    metric("期末合计", E.money(result.endingTotal));
    els.basisLine.textContent = "数量单位按用户当前品项口径 · 期末 = 期初 + 入库 − 出库 · 逐项取两位";
    els.reconcileLine.textContent = E.money(result.openingTotal) + " + " + E.money(result.inboundTotal) + " − " + E.money(result.outboundTotal) + " = " + E.money(result.endingTotal);
    renderDraft();
    result.rows.forEach(function (row, index) {
      var tr = el("tr", "data-row");
      [row.date, row.item, E.money(row.opening), E.money(row.inbound), E.money(row.outbound), E.money(row.ending)].forEach(function (value, col) { tr.appendChild(cell(value, col >= 2 ? "amount" : null)); });
      var action = document.createElement("td"); action.appendChild(removeButton(index, "inventory")); tr.appendChild(action);
      els.tableBody.appendChild(tr);
    });
    els.emptyNote.textContent = result.count ? "每一行都把期初、变动与期末摊开。" : "0 条库存。空白首行等待第一个品项。";
  }

  function methodName(method) {
    return method === "straight-line" ? "直线" : method === "double-declining" ? "双倍余额递减" : "年数总和";
  }

  function renderDepreciation() {
    var schedules = state.entries.depreciation.map(function (entry) { return E.depreciationSchedule(entry.cost, entry.salvage, entry.life, entry.method); });
    var costTotal = 0, depreciationTotal = 0, finalTotal = 0;
    schedules.forEach(function (schedule) {
      costTotal = E.round2(costTotal + schedule.cost);
      depreciationTotal = E.round2(depreciationTotal + schedule.depreciationTotal);
      finalTotal = E.round2(finalTotal + schedule.finalBook);
    });
    metric("资产", String(schedules.length));
    metric("原值合计", E.money(costTotal));
    metric("累计折旧", E.money(depreciationTotal));
    metric("期末净值", E.money(finalTotal));
    els.basisLine.textContent = "金额单位 元 · 直线：(原值−残值)/年限 · 双倍余额递减末期转直线 · 年数总和分母 n×(n+1)/2";
    els.reconcileLine.textContent = "原值 " + E.money(costTotal) + " − 累计折旧 " + E.money(depreciationTotal) + " = 期末净值 " + E.money(finalTotal) + "；每项净值均封底于残值。";
    renderDraft();
    schedules.forEach(function (schedule, assetIndex) {
      var entry = state.entries.depreciation[assetIndex];
      schedule.rows.forEach(function (row, rowIndex) {
        var tr = el("tr", "schedule-row data-row");
        var nameCell = cell(rowIndex === 0 ? entry.item : "");
        if (rowIndex === 0) nameCell.appendChild(removeButton(assetIndex, "depreciation"));
        tr.appendChild(nameCell);
        [methodName(entry.method), String(row.year), E.money(row.beginningBook), E.money(row.depreciation), E.money(row.endingBook), row.basis].forEach(function (value, col) { tr.appendChild(cell(value, col >= 2 && col <= 4 ? "amount" : null)); });
        els.tableBody.appendChild(tr);
      });
    });
    els.emptyNote.textContent = schedules.length ? "完整年限全部摊开，不折叠、不分页。" : "0 项资产。上面空白输入行等待第一项，不预装示例资产。";
  }

  function csvEscape(value) {
    var text = String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function csvLine(values) { return values.map(csvEscape).join(","); }
  function csvForCurrentMode() {
    var lines = [];
    if (state.mode === "ledger") {
      lines.push(csvLine(["日期", "项目", "借方", "贷方", "余额"]));
      E.ledger(state.entries.ledger).rows.forEach(function (row) { lines.push(csvLine([row.date, row.item, row.debit.toFixed(2), row.credit.toFixed(2), row.balance.toFixed(2)])); });
    } else if (state.mode === "receivable") {
      lines.push(csvLine(["日期", "客户或事项", "到期日", "金额", "已收", "未收", "账龄天数", "分档"]));
      E.ageReceivables(state.entries.receivable, state.asOf).rows.forEach(function (row) { lines.push(csvLine([row.date, row.item, row.dueDate, row.amount.toFixed(2), row.received.toFixed(2), row.outstanding.toFixed(2), row.ageDays, row.bucket])); });
    } else if (state.mode === "inventory") {
      lines.push(csvLine(["日期", "品项", "期初", "入库", "出库", "期末"]));
      E.inventory(state.entries.inventory).rows.forEach(function (row) { lines.push(csvLine([row.date, row.item, row.opening.toFixed(2), row.inbound.toFixed(2), row.outbound.toFixed(2), row.ending.toFixed(2)])); });
    } else {
      lines.push(csvLine(["资产", "方法", "年", "年初净值", "本年折旧", "年末净值", "计算口径"]));
      state.entries.depreciation.forEach(function (entry) {
        E.depreciationSchedule(entry.cost, entry.salvage, entry.life, entry.method).rows.forEach(function (row) { lines.push(csvLine([entry.item, methodName(entry.method), row.year, row.beginningBook.toFixed(2), row.depreciation.toFixed(2), row.endingBook.toFixed(2), row.basis])); });
      });
    }
    return lines.join("\n");
  }

  function renderGuide() {
    els.modeNote.textContent = META[state.mode].note;
    clear(els.guideList);
    META[state.mode].guide.forEach(function (text) { els.guideList.appendChild(el("li", null, text)); });
    els.asOfField.classList.toggle("on", state.mode === "receivable");
  }

  function render() {
    clear(els.headline);
    clear(els.tableBody);
    els.status.textContent = state.message;
    els.status.className = "status" + (state.error ? " negative" : state.message ? " positive" : "");
    renderGuide();
    renderHead();
    if (state.mode === "ledger") renderLedger();
    else if (state.mode === "receivable") renderReceivable();
    else if (state.mode === "inventory") renderInventory();
    else renderDepreciation();
  }

  function runTest() {
    var result = E.runSelfTest();
    els.testOut.textContent = result.passed + " / " + result.total + " 通过";
    clear(els.testDetail);
    if (!result.failures.length) els.testDetail.appendChild(el("li", null, "流水、账龄、库存与三种折旧口径均通过。"));
    result.failures.forEach(function (failure) { els.testDetail.appendChild(el("li", null, failure.name + " —— " + failure.why)); });
  }

  function mount() {
    els.headline = document.getElementById("headline");
    els.tableHead = document.getElementById("table-head");
    els.tableBody = document.getElementById("table-body");
    els.basisLine = document.getElementById("basis-line");
    els.reconcileLine = document.getElementById("reconcile-line");
    els.emptyNote = document.getElementById("empty-note");
    els.status = document.getElementById("entry-status");
    els.modeNote = document.getElementById("mode-note");
    els.guideList = document.getElementById("guide-list");
    els.asOfField = document.querySelector(".as-of-field");
    els.csvOut = document.getElementById("csv-out");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    document.getElementById("mode").addEventListener("change", function (event) {
      state.mode = event.target.value;
      state.message = "";
      state.error = false;
      els.csvOut.value = "";
      render();
    });
    document.getElementById("as-of").addEventListener("change", function (event) {
      if (E.parseIsoDate(event.target.value) === null) { setStatus("账龄基准日无效。", true); return; }
      state.asOf = event.target.value;
      render();
    });
    document.getElementById("make-csv").addEventListener("click", function () {
      els.csvOut.value = csvForCurrentMode();
      els.csvOut.focus();
      els.csvOut.select();
    });
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
