/* 台账 · 纯计算内核。金额逐笔取分，总额处显式对账。 */
(function (root) {
  "use strict";

  function round2(n) {
    if (typeof n !== "number" || !isFinite(n)) return NaN;
    return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  }

  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    var negative = n < 0;
    var parts = Math.abs(n).toFixed(2).split(".");
    var whole = "";
    for (var i = 0; i < parts[0].length; i++) {
      if (i && (parts[0].length - i) % 3 === 0) whole += " ";
      whole += parts[0].charAt(i);
    }
    return (negative ? "−" : "") + whole + "." + parts[1];
  }

  function finiteNonNegative(value) {
    return typeof value === "number" && isFinite(value) && value >= 0;
  }

  function parseIsoDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var stamp = Date.UTC(year, month - 1, day);
    var d = new Date(stamp);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return stamp;
  }

  function ledger(entries, openingBalance) {
    if (!Array.isArray(entries)) return null;
    var opening = openingBalance === undefined ? 0 : openingBalance;
    if (typeof opening !== "number" || !isFinite(opening)) return null;

    var roundedBalance = round2(opening);
    var rawClosing = opening;
    var debitTotal = 0;
    var creditTotal = 0;
    var rows = [];

    for (var i = 0; i < entries.length; i++) {
      var item = entries[i] || {};
      if (!parseIsoDate(item.date) || !String(item.item || "").trim()) return null;
      if (!finiteNonNegative(item.debit) || !finiteNonNegative(item.credit)) return null;
      var debit = round2(item.debit);
      var credit = round2(item.credit);
      debitTotal = round2(debitTotal + debit);
      creditTotal = round2(creditTotal + credit);
      roundedBalance = round2(roundedBalance + debit - credit);
      rawClosing += item.debit - item.credit;
      rows.push({
        date: item.date,
        item: String(item.item).trim(),
        debit: debit,
        credit: credit,
        balance: roundedBalance
      });
    }

    var rawClosingRounded = round2(rawClosing);
    var roundingAdjustment = round2(rawClosingRounded - roundedBalance);
    return {
      rows: rows,
      count: rows.length,
      openingBalance: round2(opening),
      debitTotal: debitTotal,
      creditTotal: creditTotal,
      roundedClosing: roundedBalance,
      rawClosing: rawClosing,
      rawClosingRounded: rawClosingRounded,
      roundingAdjustment: roundingAdjustment,
      reportedClosing: round2(roundedBalance + roundingAdjustment)
    };
  }

  var AGE_BUCKETS = ["0–30", "31–60", "61–90", "91–180", "181–365", ">365"];

  function agingBucket(days) {
    if (!(days >= 0) || !isFinite(days)) return null;
    if (days <= 30) return "0–30";
    if (days <= 60) return "31–60";
    if (days <= 90) return "61–90";
    if (days <= 180) return "91–180";
    if (days <= 365) return "181–365";
    return ">365";
  }

  function ageReceivables(entries, asOf) {
    if (!Array.isArray(entries)) return null;
    var asOfStamp = parseIsoDate(asOf);
    if (asOfStamp === null) return null;
    var buckets = {};
    for (var b = 0; b < AGE_BUCKETS.length; b++) buckets[AGE_BUCKETS[b]] = 0;
    var amountTotal = 0;
    var receivedTotal = 0;
    var outstandingTotal = 0;
    var rows = [];

    for (var i = 0; i < entries.length; i++) {
      var item = entries[i] || {};
      var dueStamp = parseIsoDate(item.dueDate);
      if (!parseIsoDate(item.date) || dueStamp === null || !String(item.item || "").trim()) return null;
      if (!finiteNonNegative(item.amount) || !finiteNonNegative(item.received)) return null;
      var amount = round2(item.amount);
      var received = round2(item.received);
      var outstanding = Math.max(round2(amount - received), 0);
      var ageDays = Math.max(0, Math.floor((asOfStamp - dueStamp) / 86400000));
      var bucket = agingBucket(ageDays);
      amountTotal = round2(amountTotal + amount);
      receivedTotal = round2(receivedTotal + received);
      outstandingTotal = round2(outstandingTotal + outstanding);
      buckets[bucket] = round2(buckets[bucket] + outstanding);
      rows.push({
        date: item.date,
        item: String(item.item).trim(),
        dueDate: item.dueDate,
        amount: amount,
        received: received,
        outstanding: outstanding,
        ageDays: ageDays,
        bucket: bucket
      });
    }

    var bucketTotal = 0;
    for (var j = 0; j < AGE_BUCKETS.length; j++) bucketTotal = round2(bucketTotal + buckets[AGE_BUCKETS[j]]);
    return {
      rows: rows,
      count: rows.length,
      asOf: asOf,
      amountTotal: amountTotal,
      receivedTotal: receivedTotal,
      outstandingTotal: outstandingTotal,
      buckets: buckets,
      bucketTotal: bucketTotal,
      ties: bucketTotal === outstandingTotal
    };
  }

  function inventory(entries) {
    if (!Array.isArray(entries)) return null;
    var rows = [];
    var openingTotal = 0;
    var inboundTotal = 0;
    var outboundTotal = 0;
    var endingTotal = 0;
    for (var i = 0; i < entries.length; i++) {
      var item = entries[i] || {};
      if (!parseIsoDate(item.date) || !String(item.item || "").trim()) return null;
      if (!finiteNonNegative(item.opening) || !finiteNonNegative(item.inbound) || !finiteNonNegative(item.outbound)) return null;
      var opening = round2(item.opening);
      var inbound = round2(item.inbound);
      var outbound = round2(item.outbound);
      var ending = round2(opening + inbound - outbound);
      openingTotal = round2(openingTotal + opening);
      inboundTotal = round2(inboundTotal + inbound);
      outboundTotal = round2(outboundTotal + outbound);
      endingTotal = round2(endingTotal + ending);
      rows.push({ date: item.date, item: String(item.item).trim(), opening: opening, inbound: inbound, outbound: outbound, ending: ending });
    }
    return {
      rows: rows,
      count: rows.length,
      openingTotal: openingTotal,
      inboundTotal: inboundTotal,
      outboundTotal: outboundTotal,
      endingTotal: endingTotal
    };
  }

  function depreciationSchedule(cost, salvage, life, method) {
    if (!finiteNonNegative(cost) || !finiteNonNegative(salvage) || salvage > cost) return null;
    if (!(Number.isInteger(life) && life > 0 && life <= 100)) return null;
    if (["straight-line", "double-declining", "sum-of-years"].indexOf(method) === -1) return null;

    var depreciable = round2(cost - salvage);
    var denominator = life * (life + 1) / 2;
    var book = round2(cost);
    var rows = [];
    var total = 0;
    for (var year = 1; year <= life; year++) {
      var beginning = book;
      var remaining = life - year + 1;
      var maximum = round2(book - salvage);
      var raw;
      var basis;
      if (method === "straight-line") {
        raw = depreciable / life;
        basis = "直线";
      } else if (method === "sum-of-years") {
        raw = depreciable * remaining / denominator;
        basis = "年数总和";
      } else {
        var declining = book * 2 / life;
        var straightRemaining = (book - salvage) / remaining;
        if (straightRemaining > declining) {
          raw = straightRemaining;
          basis = "转直线";
        } else {
          raw = declining;
          basis = "双倍余额";
        }
      }
      var depreciation = year === life ? maximum : round2(Math.min(raw, maximum));
      book = round2(Math.max(salvage, book - depreciation));
      depreciation = round2(beginning - book);
      total = round2(total + depreciation);
      rows.push({
        year: year,
        beginningBook: beginning,
        depreciation: depreciation,
        endingBook: book,
        basis: basis
      });
    }
    return {
      method: method,
      cost: round2(cost),
      salvage: round2(salvage),
      life: life,
      denominator: denominator,
      rows: rows,
      depreciationTotal: total,
      finalBook: book
    };
  }

  var CASES = [
    {
      name: "流水 1250.50 借方进入余额",
      run: function () {
        var r = ledger([{ date: "2026-08-14", item: "差旅预付款", debit: 1250.5, credit: 0 }]);
        return r.count === 1 && r.reportedClosing === 1250.5;
      }
    },
    {
      name: "账龄边界 30/31/60/61/90/91/180/181/365/366 分档",
      run: function () {
        var expected = ["0–30", "31–60", "31–60", "61–90", "61–90", "91–180", "91–180", "181–365", "181–365", ">365"];
        var days = [30, 31, 60, 61, 90, 91, 180, 181, 365, 366];
        for (var i = 0; i < days.length; i++) if (agingBucket(days[i]) !== expected[i]) return false;
        return true;
      }
    },
    {
      name: "库存 120 + 45 − 18 = 147",
      run: function () {
        var r = inventory([{ date: "2026-08-14", item: "成品 A", opening: 120, inbound: 45, outbound: 18 }]);
        return r.rows[0].ending === 147;
      }
    },
    {
      name: "直线折旧完整年限回到残值",
      run: function () {
        var r = depreciationSchedule(100000, 10000, 5, "straight-line");
        return r.rows.every(function (x) { return x.depreciation === 18000; }) && r.finalBook === 10000;
      }
    },
    {
      name: "双倍余额递减末期转直线",
      run: function () {
        var r = depreciationSchedule(100000, 0, 5, "double-declining");
        return r.rows[3].basis === "转直线" && r.rows[4].basis === "转直线" && r.finalBook === 0;
      }
    },
    {
      name: "年数总和分母与完整年表",
      run: function () {
        var r = depreciationSchedule(100000, 10000, 5, "sum-of-years");
        return r.denominator === 15 && r.rows.map(function (x) { return x.depreciation; }).join(",") === "30000,24000,18000,12000,6000";
      }
    }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      try {
        if (!CASES[i].run()) failures.push({ name: CASES[i].name, why: "结果不符合口径" });
      } catch (err) {
        failures.push({ name: CASES[i].name, why: err && err.message ? err.message : String(err) });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    round2: round2,
    money: money,
    parseIsoDate: parseIsoDate,
    ledger: ledger,
    AGE_BUCKETS: AGE_BUCKETS,
    agingBucket: agingBucket,
    ageReceivables: ageReceivables,
    inventory: inventory,
    depreciationSchedule: depreciationSchedule,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.LedgerEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
