/* 台账 · 装配。敲完一行就落进流里，读数跟着这一笔动一下。 */
(function () {
  "use strict";

  var E = window.LedgerEngine;
  var doc = document;

  var METHODS = [
    { id: "straight-line", label: "直线" },
    { id: "double-declining", label: "双倍余额" },
    { id: "sum-of-years", label: "年数总和" }
  ];

  /* 四种用途换的是流本身和它顶上那个数的名字，不是多开一块区域。 */
  var USES = {
    ledger: {
      reading: "余额", unit: "元",
      cols: [
        { key: "date", name: "日期", kind: "date", entry: true },
        { key: "item", name: "项目", kind: "text", entry: true, hint: "这一笔是什么" },
        { key: "debit", name: "借方", kind: "money", entry: true },
        { key: "credit", name: "贷方", kind: "money", entry: true },
        { key: "balance", name: "余额", kind: "money" }
      ]
    },
    receivable: {
      reading: "未收", unit: "元", asOf: true,
      cols: [
        { key: "date", name: "开票日", kind: "date", entry: true },
        { key: "item", name: "客户", kind: "text", entry: true, hint: "这笔款是谁的" },
        { key: "dueDate", name: "到期日", kind: "date", entry: true },
        { key: "amount", name: "金额", kind: "money", entry: true },
        { key: "received", name: "已收", kind: "money", entry: true },
        { key: "outstanding", name: "未收", kind: "money" },
        { key: "age", name: "账龄", kind: "text" }
      ]
    },
    inventory: {
      reading: "结存", unit: "件", 
      cols: [
        { key: "date", name: "日期", kind: "date", entry: true },
        { key: "item", name: "货品", kind: "text", entry: true, hint: "进出的是什么" },
        { key: "opening", name: "期初", kind: "count", entry: true },
        { key: "inbound", name: "入库", kind: "count", entry: true },
        { key: "outbound", name: "出库", kind: "count", entry: true },
        { key: "ending", name: "结存", kind: "count" }
      ]
    },
    depreciation: {
      reading: "净值", unit: "元", asOf: true,
      cols: [
        { key: "date", name: "购入", kind: "date", entry: true },
        { key: "item", name: "资产", kind: "text", entry: true, hint: "这项资产是什么" },
        { key: "cost", name: "原值", kind: "money", entry: true },
        { key: "salvage", name: "残值", kind: "money", entry: true },
        { key: "life", name: "年限", kind: "whole", entry: true },
        { key: "method", name: "方法", kind: "pick", entry: true },
        { key: "bookValue", name: "净值", kind: "money" }
      ]
    }
  };

  var ORDER = ["ledger", "receivable", "inventory", "depreciation"];
  var books = { ledger: [], receivable: [], inventory: [], depreciation: [] };
  var current = "ledger";
  var asOf = todayIso();

  var head = doc.getElementById("roll-head");
  var body = doc.getElementById("roll-body");
  var entryRow = doc.getElementById("entry-row");
  var entryWhy = doc.getElementById("entry-why");
  var form = doc.getElementById("entry-form");
  var readingName = doc.getElementById("reading-name");
  var readingValue = doc.getElementById("reading-value");
  var readingUnit = doc.getElementById("reading-unit");
  var latest = doc.getElementById("latest");
  var reconcile = doc.getElementById("reconcile");
  var asOfBox = doc.getElementById("as-of");
  var asOfInput = doc.getElementById("as-of-date");
  var usesBox = doc.getElementById("uses");
  var takeawayOpen = doc.getElementById("takeaway-open");
  var takeaway = doc.getElementById("takeaway");
  var fields = {};

  function todayIso() {
    var now = new Date();
    return [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isText(col) { return col.kind === "text" || col.kind === "date" || col.kind === "pick" || col.key === "age"; }

  function number(raw, allowEmpty) {
    var text = String(raw === undefined || raw === null ? "" : raw).replace(/[\s,]/g, "").replace(/[−–—]/g, "-");
    if (text === "") return allowEmpty ? 0 : null;
    if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(text)) return null;
    var value = Number(text);
    return isFinite(value) ? value : null;
  }

  /* ---- 屏幕上的一行 ------------------------------------------------- */

  function computed() {
    var entries = books[current];
    if (current === "ledger") {
      var l = E.ledger(entries);
      return {
        /* 借贷是二选一：没走那一边就空着，不写一个 0.00 去挤占眼睛。 */
        rows: l.rows.map(function (row) {
          return {
            date: row.date, item: row.item,
            debit: row.debit ? E.money(row.debit) : "",
            credit: row.credit ? E.money(row.credit) : "",
            balance: E.money(row.balance)
          };
        }),
        reading: l.reportedClosing,
        adjustment: l.roundingAdjustment
      };
    }
    if (current === "receivable") {
      var r = E.ageReceivables(entries, asOf);
      return {
        rows: r.rows.map(function (row) {
          return {
            date: row.date, item: row.item, dueDate: row.dueDate,
            amount: E.money(row.amount), received: E.money(row.received),
            outstanding: E.money(row.outstanding),
            age: row.ageDays + " 天 · " + row.bucket
          };
        }),
        reading: r.outstandingTotal
      };
    }
    if (current === "inventory") {
      var i = E.inventory(entries);
      return {
        rows: i.rows.map(function (row) {
          return {
            date: row.date, item: row.item,
            opening: E.money(row.opening), inbound: E.money(row.inbound),
            outbound: E.money(row.outbound), ending: E.money(row.ending)
          };
        }),
        reading: i.endingTotal
      };
    }
    var d = E.depreciationLedger(entries, asOf);
    return {
      rows: d.rows.map(function (row) {
        return {
          date: row.date, item: row.item,
          cost: E.money(row.cost), salvage: E.money(row.salvage),
          life: String(row.life), method: label(row.method),
          bookValue: E.money(row.bookValue),
          schedule: row.schedule,
          elapsedYears: row.elapsedYears
        };
      }),
      reading: d.bookValueTotal
    };
  }

  function label(methodId) {
    for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === methodId) return METHODS[i].label;
    return methodId;
  }

  function rowNode(row, index) {
    var use = USES[current];
    var tr = el("tr", "line");
    tr.setAttribute("data-index", String(index));
    use.cols.forEach(function (col, position) {
      var cell = position === 1 ? el("th") : el("td");
      if (position === 1) cell.setAttribute("scope", "row");
      cell.className = isText(col) ? "text" : "num";
      if (col.key === "item") {
        cell.classList.add("name-cell");
        if (row.schedule) {
          var opener = el("button", "name", row.item);
          opener.type = "button";
          opener.setAttribute("aria-expanded", "false");
          opener.addEventListener("click", function () { toggleYears(tr, row, opener); });
          cell.appendChild(opener);
        } else {
          cell.appendChild(doc.createTextNode(row.item));
        }
        var drop = el("button", "drop", "删除");
        drop.type = "button";
        drop.setAttribute("aria-label", "删除 " + row.item);
        drop.addEventListener("click", function () { remove(index); });
        cell.appendChild(drop);
      } else {
        cell.textContent = row[col.key];
      }
      tr.appendChild(cell);
    });
    return tr;
  }

  /* 年表是那一行的内部构造：原地摊开，原地收回，不进弹窗也不进抽屉。 */
  function toggleYears(tr, row, opener) {
    var open = opener.getAttribute("aria-expanded") === "true";
    opener.setAttribute("aria-expanded", open ? "false" : "true");
    var next = tr.nextSibling;
    if (open) {
      if (next && next.classList && next.classList.contains("years")) next.remove();
      return;
    }
    var holder = el("tr", "years");
    var cell = el("td");
    cell.colSpan = USES[current].cols.length;
    row.schedule.rows.forEach(function (year) {
      var line = el("div", "year-line");
      line.appendChild(el("span", null, "第 " + year.year + " 年 · " + year.basis));
      line.appendChild(el("span", null, "年初 " + E.money(year.beginningBook) + " 元"));
      line.appendChild(el("span", null, "折旧 " + E.money(year.depreciation) + " 元"));
      line.appendChild(el("span", null, "年末 " + E.money(year.endingBook) + " 元"));
      cell.appendChild(line);
    });
    holder.appendChild(cell);
    tr.parentNode.insertBefore(holder, tr.nextSibling);
  }

  function ageRows() {
    var lines = body.querySelectorAll("tr.line");
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.remove("last", "near");
      if (i === lines.length - 1) lines[i].classList.add("last");
      else if (i === lines.length - 2) lines[i].classList.add("near");
    }
  }

  function readOut(state) {
    var use = USES[current];
    readingName.textContent = use.reading;
    readingUnit.textContent = use.unit;
    readingValue.textContent = E.money(state.reading);
    readingValue.classList.toggle("down", state.reading < 0);
    asOfBox.hidden = !use.asOf;

    var adjustment = state.adjustment;
    if (adjustment) {
      reconcile.hidden = false;
      reconcile.textContent = "其中舍入调整 " + E.money(adjustment) + " 元";
    } else {
      reconcile.hidden = true;
      reconcile.textContent = "";
    }

    var last = state.rows[state.rows.length - 1];
    if (!last) {
      latest.textContent = "";
      return;
    }
    var tail = use.cols[use.cols.length - 1];
    latest.textContent = "最新 " + last.date + " " + last.item + " " + last[tail.key] + " " + use.unit;
  }

  function paintAll() {
    var state = computed();
    body.textContent = "";
    state.rows.forEach(function (row, index) { body.appendChild(rowNode(row, index)); });
    ageRows();
    readOut(state);
    if (takeawayOpen.getAttribute("aria-expanded") === "true") fillTakeaway(state);
  }

  /* ---- 录入 --------------------------------------------------------- */

  function buildEntry() {
    var use = USES[current];
    head.textContent = "";
    entryRow.textContent = "";
    fields = {};
    use.cols.forEach(function (col) {
      var th = el("th", isText(col) ? "text" : "num", col.name);
      th.setAttribute("scope", "col");
      head.appendChild(th);

      var cell = el("td", isText(col) ? "text" : "num");
      if (col.entry) {
        var input;
        if (col.kind === "pick") {
          input = el("select");
          METHODS.forEach(function (method) {
            var option = el("option", null, method.label);
            option.value = method.id;
            input.appendChild(option);
          });
        } else {
          input = el("input");
          input.type = col.kind === "date" ? "date" : "text";
          if (col.kind !== "date") input.inputMode = col.kind === "whole" || col.kind === "count" ? "numeric" : "decimal";
          if (col.hint) input.placeholder = col.hint;
        }
        input.id = "entry-" + col.key;
        input.setAttribute("aria-label", col.name);
        if (col.kind === "date") input.value = col.key === "dueDate" ? "" : asOf;
        fields[col.key] = input;
        cell.appendChild(input);
      }
      entryRow.appendChild(cell);
    });
  }

  function refuse(reason) {
    entryWhy.hidden = false;
    entryWhy.textContent = reason;
    return null;
  }

  function accept() {
    entryWhy.hidden = true;
    entryWhy.textContent = "";
  }

  function draft() {
    var date = fields.date.value;
    if (!E.parseIsoDate(date)) return refuse("日期要填一个真有的日子，例如 " + asOf);
    var item = String(fields.item.value || "").trim();
    if (!item) return refuse(USES[current].cols[1].name + "要写清是什么，不然对不上票据");

    if (current === "ledger") {
      var debit = number(fields.debit.value, true);
      var credit = number(fields.credit.value, true);
      if (debit === null || credit === null) return refuse("借方和贷方只能填不带负号的金额");
      if (debit === 0 && credit === 0) return refuse("这一笔要填借方或贷方");
      return { date: date, item: item, debit: debit, credit: credit };
    }
    if (current === "receivable") {
      var due = fields.dueDate.value;
      if (!E.parseIsoDate(due)) return refuse("到期日要填一个真有的日子，缺了它算不出账龄");
      var amount = number(fields.amount.value, false);
      var received = number(fields.received.value, true);
      if (amount === null || !(amount > 0)) return refuse("金额要填一个大于 0 的数");
      if (received === null) return refuse("已收只能填不带负号的金额");
      if (received > amount) return refuse("已收不能大于金额");
      return { date: date, item: item, dueDate: due, amount: amount, received: received };
    }
    if (current === "inventory") {
      var opening = number(fields.opening.value, true);
      var inbound = number(fields.inbound.value, true);
      var outbound = number(fields.outbound.value, true);
      if (opening === null || inbound === null || outbound === null) return refuse("期初、入库、出库只能填不带负号的数量");
      if (opening === 0 && inbound === 0 && outbound === 0) return refuse("这一行要填期初、入库或出库");
      return { date: date, item: item, opening: opening, inbound: inbound, outbound: outbound };
    }
    var cost = number(fields.cost.value, false);
    var salvage = number(fields.salvage.value, true);
    var life = number(fields.life.value, false);
    if (cost === null || !(cost > 0)) return refuse("原值要填一个大于 0 的金额");
    if (salvage === null) return refuse("残值只能填不带负号的金额");
    if (salvage > cost) return refuse("残值不能高于原值");
    if (life === null || !Number.isInteger(life) || life < 1 || life > 100) return refuse("年限要填 1 到 100 的整数");
    return {
      date: date, item: item, cost: cost, salvage: salvage, life: life,
      method: fields.method.value
    };
  }

  function record() {
    var made = draft();
    if (!made) return;
    accept();
    books[current].push(made);
    var state = computed();
    var index = state.rows.length - 1;
    var node = rowNode(state.rows[index], index);
    node.classList.add("fresh");
    body.appendChild(node);
    ageRows();
    readOut(state);
    if (takeawayOpen.getAttribute("aria-expanded") === "true") fillTakeaway(state);
    setTimeout(function () { node.classList.add("settled"); }, 30);
    USES[current].cols.forEach(function (col) {
      if (!col.entry || col.kind === "date" || col.kind === "pick") return;
      fields[col.key].value = "";
    });
    fields.item.focus();
    keepInView();
  }

  /* 纸往上走一行：让手边这一端留在视野里。没有滚动能力的环境里什么也不做。 */
  function keepInView() {
    if (typeof window.scrollTo !== "function") return;
    try {
      window.scrollTo(0, doc.documentElement.scrollHeight);
    } catch (err) {
      /* jsdom 之类没有视口的环境，位置本来就无从谈起 */
    }
  }

  function remove(index) {
    books[current].splice(index, 1);
    paintAll();
  }

  /* ---- 带走 --------------------------------------------------------- */

  function fillTakeaway(state) {
    var use = USES[current];
    var lines = [use.cols.map(function (col) { return col.name; }).join("\t")];
    state.rows.forEach(function (row) {
      lines.push(use.cols.map(function (col) { return row[col.key]; }).join("\t"));
    });
    lines.push("");
    lines.push(use.reading + "\t" + E.money(state.reading) + " " + use.unit);
    takeaway.textContent = lines.join("\n");
  }

  takeawayOpen.addEventListener("click", function () {
    var open = takeawayOpen.getAttribute("aria-expanded") === "true";
    takeawayOpen.setAttribute("aria-expanded", open ? "false" : "true");
    takeaway.hidden = open;
    if (!open) {
      fillTakeaway(computed());
      var range = doc.createRange();
      range.selectNodeContents(takeaway);
      var selection = window.getSelection();
      if (selection) { selection.removeAllRanges(); selection.addRange(range); }
    }
  });

  /* ---- 用途长在那个数的名字上 --------------------------------------- */

  ORDER.forEach(function (id) {
    var button = el("button", null, USES[id].reading);
    button.type = "button";
    button.setAttribute("data-use", id);
    button.setAttribute("aria-pressed", String(id === current));
    button.addEventListener("click", function () {
      current = id;
      Array.prototype.forEach.call(usesBox.querySelectorAll("button"), function (node) {
        node.setAttribute("aria-pressed", String(node.getAttribute("data-use") === id));
      });
      usesBox.hidden = true;
      readingName.setAttribute("aria-expanded", "false");
      takeawayOpen.setAttribute("aria-expanded", "false");
      takeaway.hidden = true;
      accept();
      buildEntry();
      paintAll();
      fields.date.focus();
    });
    usesBox.appendChild(button);
  });

  readingName.addEventListener("click", function () {
    var open = readingName.getAttribute("aria-expanded") === "true";
    readingName.setAttribute("aria-expanded", open ? "false" : "true");
    usesBox.hidden = open;
  });

  asOfInput.value = asOf;
  asOfInput.addEventListener("input", function () {
    if (!E.parseIsoDate(asOfInput.value)) return;
    asOf = asOfInput.value;
    paintAll();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    record();
  });

  buildEntry();
  paintAll();
  fields.date.focus();

  window.LedgerRoll = {
    record: record,
    use: function (id) { usesBox.querySelector('[data-use="' + id + '"]').click(); },
    state: computed
  };
})();
