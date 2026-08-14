(function (root) {
  "use strict";

  function finite(value) {
    return typeof value === "number" && isFinite(value);
  }

  function positive(value) {
    return finite(value) && value > 0;
  }

  function nonNegative(value) {
    return finite(value) && value >= 0;
  }

  function whole(value) {
    return nonNegative(value) && Math.floor(value) === value;
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function serviceMonths(fullYears, remainingMonths, remainingDays) {
    if (!whole(fullYears) || !whole(remainingMonths) || !whole(remainingDays)) return null;
    if (remainingMonths > 11 || remainingDays > 30) return null;
    var remainder = 0;
    if (remainingMonths >= 6) remainder = 1;
    else if (remainingMonths > 0 || remainingDays > 0) remainder = 0.5;
    return fullYears + remainder;
  }

  function laborCompensation(monthlySalary, localAverageSalary, fullYears, remainingMonths, remainingDays) {
    if (!positive(monthlySalary) || !positive(localAverageSalary)) return null;
    var rawMonths = serviceMonths(fullYears, remainingMonths, remainingDays);
    if (rawMonths === null) return null;
    var salaryCap = localAverageSalary * 3;
    var capTriggered = monthlySalary > salaryCap;
    var salaryBase = capTriggered ? salaryCap : monthlySalary;
    var appliedMonths = capTriggered ? Math.min(rawMonths, 12) : rawMonths;
    var amount = round2(salaryBase * appliedMonths);
    return {
      rawMonths: rawMonths,
      appliedMonths: appliedMonths,
      salaryBase: salaryBase,
      capTriggered: capTriggered,
      amount: amount,
      illegalTerminationAmount: round2(amount * 2)
    };
  }

  function overtimePay(monthlySalary, weekdayHours, restDayHours, holidayHours) {
    if (!positive(monthlySalary) || !nonNegative(weekdayHours) || !nonNegative(restDayHours) || !nonNegative(holidayHours)) return null;
    var hourlyWage = monthlySalary / 21.75 / 8;
    var weekday = round2(hourlyWage * weekdayHours * 1.5);
    var restDay = round2(hourlyWage * restDayHours * 2);
    var holiday = round2(hourlyWage * holidayHours * 3);
    return {
      hourlyWage: hourlyWage,
      weekday: weekday,
      restDay: restDay,
      holiday: holiday,
      total: round2(weekday + restDay + holiday)
    };
  }

  var PROPERTY_BANDS = [
    { label: "不超过 10,000 元", to: 10000, fixed: 50 },
    { label: "10,000–100,000 元部分", from: 10000, to: 100000, rate: 0.025 },
    { label: "100,000–200,000 元部分", from: 100000, to: 200000, rate: 0.02 },
    { label: "200,000–500,000 元部分", from: 200000, to: 500000, rate: 0.015 },
    { label: "500,000–1,000,000 元部分", from: 500000, to: 1000000, rate: 0.01 },
    { label: "1,000,000–2,000,000 元部分", from: 1000000, to: 2000000, rate: 0.009 },
    { label: "2,000,000–5,000,000 元部分", from: 2000000, to: 5000000, rate: 0.008 },
    { label: "5,000,000–10,000,000 元部分", from: 5000000, to: 10000000, rate: 0.007 },
    { label: "10,000,000–20,000,000 元部分", from: 10000000, to: 20000000, rate: 0.006 },
    { label: "超过 20,000,000 元部分", from: 20000000, to: Infinity, rate: 0.005 }
  ];

  function propertyCaseFee(claimAmount) {
    if (!positive(claimAmount)) return null;
    var details = [{
      label: PROPERTY_BANDS[0].label,
      base: Math.min(claimAmount, PROPERTY_BANDS[0].to),
      rate: null,
      fee: PROPERTY_BANDS[0].fixed
    }];
    for (var i = 1; i < PROPERTY_BANDS.length; i++) {
      var band = PROPERTY_BANDS[i];
      if (claimAmount <= band.from) break;
      var base = Math.min(claimAmount, band.to) - band.from;
      details.push({ label: band.label, base: base, rate: band.rate, fee: round2(base * band.rate) });
    }
    var total = 0;
    for (var j = 0; j < details.length; j++) total = round2(total + details[j].fee);
    return { claimAmount: claimAmount, details: details, total: total };
  }

  function lendingRateCap(oneYearLprPercent) {
    if (!positive(oneYearLprPercent)) return null;
    return round2(oneYearLprPercent * 4);
  }

  function close(actual, expected, tolerance) {
    return typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  }

  var CASES = [
    { name: "工龄六个月、一年和一年零一天边界", test: function () {
      return serviceMonths(0, 6, 0) === 1 && serviceMonths(1, 0, 0) === 1 && serviceMonths(1, 0, 1) === 1.5 && serviceMonths(0, 5, 30) === 0.5;
    } },
    { name: "经济补偿与违法解除二倍", test: function () {
      var out = laborCompensation(10000, 8000, 1, 0, 1);
      return out && out.amount === 15000 && out.illegalTerminationAmount === 30000;
    } },
    { name: "三倍工资与十二年上限", test: function () {
      var capped = laborCompensation(40000, 10000, 20, 0, 0);
      var boundary = laborCompensation(30000, 10000, 20, 0, 0);
      return capped && capped.capTriggered && capped.salaryBase === 30000 && capped.appliedMonths === 12 && capped.amount === 360000 && boundary && !boundary.capTriggered && boundary.amount === 600000;
    } },
    { name: "加班 150% / 200% / 300% 与 21.75 天", test: function () {
      var out = overtimePay(21750, 1, 1, 1);
      return out && close(out.hourlyWage, 125, 1e-12) && out.weekday === 187.5 && out.restDay === 250 && out.holiday === 375 && out.total === 812.5;
    } },
    { name: "财产案件费全部分段端点", test: function () {
      var points = [[10000, 50], [100000, 2300], [200000, 4300], [500000, 8800], [1000000, 13800], [2000000, 22800], [5000000, 46800], [10000000, 81800], [20000000, 141800]];
      for (var i = 0; i < points.length; i++) if (propertyCaseFee(points[i][0]).total !== points[i][1]) return false;
      return true;
    } },
    { name: "财产案件费明细之和回到总额", test: function () {
      var amounts = [1, 10000, 10000.01, 200000, 33000000];
      for (var i = 0; i < amounts.length; i++) {
        var out = propertyCaseFee(amounts[i]);
        var sum = 0;
        for (var j = 0; j < out.details.length; j++) sum = round2(sum + out.details[j].fee);
        if (sum !== out.total) return false;
      }
      return true;
    } },
    { name: "一年期 LPR 四倍", test: function () { return lendingRateCap(3.45) === 13.8; } },
    { name: "坏输入返回 null", test: function () {
      return serviceMonths(1, 12, 0) === null && serviceMonths(1, 0, -1) === null && laborCompensation(0, 8000, 1, 0, 0) === null && overtimePay(10000, -1, 0, 0) === null && propertyCaseFee(0) === null && lendingRateCap(NaN) === null;
    } }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var passed = false;
      try { passed = CASES[i].test() === true; } catch (error) { passed = false; }
      if (!passed) failures.push({ name: CASES[i].name, why: "实际结果与公开口径不一致" });
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    CASES: CASES,
    PROPERTY_BANDS: PROPERTY_BANDS,
    serviceMonths: serviceMonths,
    laborCompensation: laborCompensation,
    overtimePay: overtimePay,
    propertyCaseFee: propertyCaseFee,
    lendingRateCap: lendingRateCap,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.LegalCalculatorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
