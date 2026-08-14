/*
 * 法律计算器 · 计算内核（规格 docs/specs/oceanleo-plugins-v1/plugins/legal-calculator.md）
 *
 * 这里只做一件事：把用户自己填的事实按公开算术走一遍，并把「哪一道门槛改变了结果」交出去。
 *
 * 本轮**缩小了承诺**（理由见交付说明 verdicts/W1-delivery.md）：
 *   - 去掉民间借贷保护上限：工具只做一次乘法，而那个倍数本身就是最会变的规则，
 *     算出来的数却长得像对合同效力的判断。
 *   - 去掉违法解除赔偿金 × 2：它预设了「解除被认定违法」这个本工具明说自己做不了的认定。
 * 留下的三项都是对用户自己的事实做公开算术：折算工龄、按倍数摊加班、按分段累加受理费。
 *
 * 不碰 DOM、不碰存储、不发请求、不用 eval / new Function。
 */
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

  /**
   * 工龄折算：满 6 个月的余段计 1 个月工资，不足 6 个月但有余段计 0.5 个月。
   * 余下月数 0–11、余下天数 0–30，且必须是非负整数，否则不折。
   */
  function serviceMonths(fullYears, remainingMonths, remainingDays) {
    if (!whole(fullYears) || !whole(remainingMonths) || !whole(remainingDays)) return null;
    if (remainingMonths > 11 || remainingDays > 30) return null;
    var remainder = 0;
    if (remainingMonths >= 6) remainder = 1;
    else if (remainingMonths > 0 || remainingDays > 0) remainder = 0.5;
    return fullYears + remainder;
  }

  /**
   * 经济补偿估算：工资基数 × 适用补偿月数。
   * 月工资严格高于当地月平均工资 3 倍时，基数改取 3 倍，且补偿月数最多 12 —— 这两道门槛
   * 同时生效，界面要把它们说成用户能复述的话。
   */
  function laborCompensation(monthlySalary, localAverageSalary, fullYears, remainingMonths, remainingDays) {
    if (!positive(monthlySalary) || !positive(localAverageSalary)) return null;
    var rawMonths = serviceMonths(fullYears, remainingMonths, remainingDays);
    if (rawMonths === null) return null;
    var salaryCap = localAverageSalary * 3;
    var capTriggered = monthlySalary > salaryCap;
    var salaryBase = capTriggered ? salaryCap : monthlySalary;
    var appliedMonths = capTriggered ? Math.min(rawMonths, 12) : rawMonths;
    return {
      rawMonths: rawMonths,
      appliedMonths: appliedMonths,
      salaryBase: salaryBase,
      salaryCap: salaryCap,
      capTriggered: capTriggered,
      monthsCapped: capTriggered && rawMonths > 12,
      amount: round2(salaryBase * appliedMonths)
    };
  }

  var OVERTIME_KINDS = [
    { id: "weekday", label: "工作日延时", multiple: 1.5 },
    { id: "restDay", label: "休息日", multiple: 2 },
    { id: "holiday", label: "法定节假日", multiple: 3 }
  ];

  /** 小时工资 = 月工资 ÷ 21.75 ÷ 8；三类加班分别乘 1.5、2、3，各自取整到分再相加。 */
  function overtimePay(monthlySalary, weekdayHours, restDayHours, holidayHours) {
    if (!positive(monthlySalary) || !nonNegative(weekdayHours) || !nonNegative(restDayHours) || !nonNegative(holidayHours)) return null;
    var hourlyWage = monthlySalary / 21.75 / 8;
    var hours = { weekday: weekdayHours, restDay: restDayHours, holiday: holidayHours };
    var parts = {};
    var total = 0;
    for (var i = 0; i < OVERTIME_KINDS.length; i++) {
      var kind = OVERTIME_KINDS[i];
      var amount = round2(hourlyWage * hours[kind.id] * kind.multiple);
      parts[kind.id] = amount;
      total = round2(total + amount);
    }
    return {
      hourlyWage: hourlyWage,
      hours: hours,
      weekday: parts.weekday,
      restDay: parts.restDay,
      holiday: parts.holiday,
      total: total
    };
  }

  /**
   * 财产案件受理费的分段标尺。mark 是这一段的上界，rateText 是这一段的费率，
   * 界面用它们画标尺 —— 画标尺不是列一张逐段金额表。
   */
  var PROPERTY_BANDS = [
    { from: 0, to: 10000, fixed: 50, mark: "1 万", rateText: "固定 50 元" },
    { from: 10000, to: 100000, rate: 0.025, mark: "10 万", rateText: "2.5%" },
    { from: 100000, to: 200000, rate: 0.02, mark: "20 万", rateText: "2%" },
    { from: 200000, to: 500000, rate: 0.015, mark: "50 万", rateText: "1.5%" },
    { from: 500000, to: 1000000, rate: 0.01, mark: "100 万", rateText: "1%" },
    { from: 1000000, to: 2000000, rate: 0.009, mark: "200 万", rateText: "0.9%" },
    { from: 2000000, to: 5000000, rate: 0.008, mark: "500 万", rateText: "0.8%" },
    { from: 5000000, to: 10000000, rate: 0.007, mark: "1000 万", rateText: "0.7%" },
    { from: 10000000, to: 20000000, rate: 0.006, mark: "2000 万", rateText: "0.6%" },
    { from: 20000000, to: Infinity, rate: 0.005, mark: "2000 万以上", rateText: "0.5%" }
  ];

  /** 分段累加，不是用最高档费率乘全部标的额。 */
  function propertyCaseFee(claimAmount) {
    if (!positive(claimAmount)) return null;
    var details = [{ band: 0, base: Math.min(claimAmount, PROPERTY_BANDS[0].to), rate: null, fee: PROPERTY_BANDS[0].fixed }];
    var index = 0;
    for (var i = 1; i < PROPERTY_BANDS.length; i++) {
      var band = PROPERTY_BANDS[i];
      if (claimAmount <= band.from) break;
      var base = Math.min(claimAmount, band.to) - band.from;
      details.push({ band: i, base: base, rate: band.rate, fee: round2(base * band.rate) });
      index = i;
    }
    var total = 0;
    for (var j = 0; j < details.length; j++) total = round2(total + details[j].fee);
    var current = PROPERTY_BANDS[index];
    var span = current.to === Infinity ? current.from : current.to - current.from;
    return {
      claimAmount: claimAmount,
      details: details,
      total: total,
      bandIndex: index,
      band: current,
      /** 标的额在当前这一段里走了多远：界面拿它把墨水填过已经经过的区间。 */
      bandFraction: current.to === Infinity
        ? Math.min(1, (claimAmount - current.from) / span)
        : (claimAmount - current.from) / span
    };
  }

  var api = {
    PROPERTY_BANDS: PROPERTY_BANDS,
    OVERTIME_KINDS: OVERTIME_KINDS,
    round2: round2,
    serviceMonths: serviceMonths,
    laborCompensation: laborCompensation,
    overtimePay: overtimePay,
    propertyCaseFee: propertyCaseFee
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.LegalCalculatorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
