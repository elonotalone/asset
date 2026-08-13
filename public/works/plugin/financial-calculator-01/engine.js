/*
 * 金融计算器 · 计算内核
 * 规格：docs/specs/oceanleo-plugins-v1/plugins/financial-calculator.md
 *
 * 唯一真相来源：页面与自测加载的是同一份字节（asset 仓无 package.json "type"，.js 即 CommonJS）。
 * 不碰 DOM、不碰存储、不发请求、不用 eval / new Function。
 *
 * 这个内核只算数与说明口径，**不给投资建议**（规格原话）。
 */
(function (root) {
  "use strict";

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /** 期利率 = 年利率 ÷ 每年期数。口径要摆给用户看，所以单独成函数。 */
  function periodRate(annualRatePct, perYear) {
    return annualRatePct / 100 / (perYear || 12);
  }

  /**
   * 等额本息每期还款：P × i × (1+i)^n / ((1+i)^n − 1)。
   * 规格点名：利率为零时自然退化为 P/n —— 这里显式退化，不让 0/0 冒出 NaN。
   */
  function annuityPayment(principal, i, n) {
    if (!(n > 0)) return 0;
    if (i === 0) return principal / n;
    var g = Math.pow(1 + i, n);
    return principal * i * g / (g - 1);
  }

  /**
   * 还款计划。
   *
   * 两个总利息口径，**都要给**，因为它们本来就不相等（规格：金额逐期取整会产生尾差）：
   *   - totalInterest：未取整月供 × 期数 − 本金。这是「公式口径」，
   *     规格里那个可对照的出厂读数 760 461.83 就是这个口径算出来的。
   *   - roundedInterestTotal：逐期四舍五入到分之后的利息之和。这是「账面口径」，
   *     用户拿计算器一期一期加出来的是它。
   * 两者之差 tailDiff 明写出来，免得用户以为哪个算错了。
   */
  function amortize(principal, annualRatePct, periods, opts) {
    opts = opts || {};
    var perYear = opts.perYear || 12;
    var method = opts.method === "equal-principal" ? "equal-principal" : "annuity";
    var i = periodRate(annualRatePct, perYear);
    var n = Math.round(periods);

    if (!(principal > 0) || !(n > 0) || !isFinite(i) || i < 0) return null;

    var payment = method === "annuity" ? annuityPayment(principal, i, n) : null;
    var rows = [];
    var bal = principal;
    var sumInterest = 0;
    var sumPrincipal = 0;
    var flatPrincipal = principal / n;

    for (var k = 1; k <= n; k++) {
      var interest = round2(bal * i);
      var pay, pri;
      if (method === "annuity") {
        pay = round2(payment);
        pri = round2(pay - interest);
      } else {
        pri = round2(flatPrincipal);
        pay = round2(pri + interest);
      }
      // 末期平衡：把逐期取整攒下的尾差一次性收在最后一期，
      // 让本金分摊之和回到原始本金、最终余额落到零（规格明写的要求）。
      if (k === n) {
        pri = round2(bal);
        pay = round2(pri + interest);
      }
      bal = round2(bal - pri);
      sumInterest = round2(sumInterest + interest);
      sumPrincipal = round2(sumPrincipal + pri);
      rows.push({ period: k, payment: pay, interest: interest, principal: pri, balance: bal });
    }

    var exactTotalPaid = method === "annuity" ? payment * n : sumPrincipal + sumInterest;
    var exactTotalInterest = exactTotalPaid - principal;

    return {
      method: method,
      methodLabel: method === "annuity" ? "等额本息" : "等额本金",
      rate: i,
      perYear: perYear,
      periods: n,
      principal: principal,
      payment: method === "annuity" ? payment : null,
      firstPayment: rows.length ? rows[0].payment : 0,
      lastPayment: rows.length ? rows[rows.length - 1].payment : 0,
      totalPaid: exactTotalPaid,
      totalInterest: exactTotalInterest,
      roundedInterestTotal: sumInterest,
      principalSum: sumPrincipal,
      finalBalance: bal,
      tailDiff: round2(sumInterest - exactTotalInterest),
      rows: rows
    };
  }

  /** 净现值：Σ CF_t / (1+r)^t，t 从 0 起（flows[0] 就是当期）。 */
  function npv(rate, flows) {
    if (!Array.isArray(flows) || flows.length === 0) return 0;
    var sum = 0;
    for (var t = 0; t < flows.length; t++) {
      sum += flows[t] / Math.pow(1 + rate, t);
    }
    return sum;
  }

  /**
   * 内部收益率：满足 NPV(r) = 0 的 r，二分求解。
   * 规格点名：**现金流全同号时 IRR 没有常规意义** —— 这种情况返回 null，不硬凑一个数。
   */
  function irr(flows) {
    if (!Array.isArray(flows) || flows.length < 2) return null;
    var hasPos = false, hasNeg = false;
    for (var k = 0; k < flows.length; k++) {
      if (flows[k] > 0) hasPos = true;
      if (flows[k] < 0) hasNeg = true;
    }
    if (!hasPos || !hasNeg) return null;

    var lo = -0.9999, hi = 10;
    var fLo = npv(lo, flows), fHi = npv(hi, flows);
    if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null;
    for (var it = 0; it < 200; it++) {
      var mid = (lo + hi) / 2;
      var fMid = npv(mid, flows);
      if (fMid === 0) return mid;
      if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  /** 加权平均资本成本：(E/V) × Re + (D/V) × Rd × (1 − Tc)。 */
  function wacc(equity, debt, costEquity, costDebt, taxRate) {
    var v = equity + debt;
    if (!(v > 0)) return null;
    return (equity / v) * costEquity + (debt / v) * costDebt * (1 - taxRate);
  }

  /** 费雪实际利率，用精确式 (1+名义)/(1+通胀) − 1，不用「名义减通胀」那个近似。 */
  function fisherReal(nominalRate, inflationRate) {
    if (inflationRate <= -1) return null;
    return (1 + nominalRate) / (1 + inflationRate) - 1;
  }

  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2);
    var parts = s.split(".");
    var out = "";
    var count = 0;
    for (var i = parts[0].length - 1; i >= 0; i--) {
      out = parts[0].charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) out = " " + out;
    }
    return (neg ? "-" : "") + out + "." + parts[1];
  }

  function pct(n, digits) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    return (n * 100).toFixed(digits === undefined ? 4 : digits) + " %";
  }

  var DEFAULT = { principal: 1000000, annualRatePct: 4.2, periods: 360, method: "annuity" };
  /** 一组有符号变化的现金流，否则 IRR 无解 —— 首屏不该摆一个算不出的例子。 */
  var DEFAULT_FLOWS = [-100000, 30000, 35000, 40000, 45000];

  /**
   * 自测用例。期望值来自规格「已查证的知识」与「第一次打开」两节。
   * 出厂档位那两个数（4 890.17 / 760 461.83）是规格原文给的，不是我算完回填的。
   */
  var CASES = [
    {
      name: "出厂档位 100 万 / 4.20% / 360 期 → 月供 4 890.17（规格原文）",
      run: function () { return round2(amortize(1000000, 4.2, 360).payment); },
      expect: 4890.17, tol: 0.005
    },
    {
      name: "同一档位 → 总利息 760 461.83（规格原文，未取整口径）",
      run: function () { return round2(amortize(1000000, 4.2, 360).totalInterest); },
      expect: 760461.83, tol: 0.005
    },
    {
      name: "利率为零时退化为 P/n（1 200 / 0% / 12 期 → 100）",
      run: function () { return round2(amortize(1200, 0, 12).payment); },
      expect: 100, tol: 0
    },
    {
      name: "末期平衡：本金分摊之和回到原始本金",
      run: function () { return amortize(1000000, 4.2, 360).principalSum; },
      expect: 1000000, tol: 0.005
    },
    {
      name: "末期平衡：最终余额落到零",
      run: function () { return amortize(1000000, 4.2, 360).finalBalance; },
      expect: 0, tol: 0.005
    },
    {
      name: "逐期取整会产生尾差，且尾差被明确报出（非零）",
      run: function () { return Math.abs(amortize(1000000, 4.2, 360).tailDiff) > 0 ? 1 : 0; },
      expect: 1, tol: 0
    },
    {
      name: "NPV：Σ CF_t/(1+r)^t，[-1000,500,500,500] @10% → 243.43",
      run: function () { return round2(npv(0.1, [-1000, 500, 500, 500])); },
      expect: 243.43, tol: 0.005
    },
    {
      name: "IRR 满足 NPV(IRR) = 0",
      run: function () { return Math.abs(npv(irr(DEFAULT_FLOWS), DEFAULT_FLOWS)) < 1e-6 ? 1 : 0; },
      expect: 1, tol: 0
    },
    {
      name: "现金流全同号时 IRR 没有常规意义 → 不硬给数（规格原文）",
      run: function () { return irr([100, 200, 300]) === null ? 1 : 0; },
      expect: 1, tol: 0
    },
    {
      name: "WACC：E=600 D=400 Re=12% Rd=6% Tc=25% → 9%",
      run: function () { return wacc(600, 400, 0.12, 0.06, 0.25); },
      expect: 0.09, tol: 1e-12
    },
    {
      name: "费雪精确式 1.06 / 1.025 − 1 ≈ 0.0341（规格原文）",
      run: function () { return fisherReal(0.06, 0.025); },
      expect: 0.034146341463414887, tol: 1e-12
    },
    {
      name: "等额本金：每期本金相同，首期还款高于末期",
      run: function () {
        var p = amortize(1000000, 4.2, 360, { method: "equal-principal" });
        return p.firstPayment > p.lastPayment && p.rows[0].principal === p.rows[1].principal ? 1 : 0;
      },
      expect: 1, tol: 0
    },
    {
      name: "等额本金总利息低于等额本息（同本金同利率同期数）",
      run: function () {
        var a = amortize(1000000, 4.2, 360);
        var b = amortize(1000000, 4.2, 360, { method: "equal-principal" });
        return b.roundedInterestTotal < a.roundedInterestTotal ? 1 : 0;
      },
      expect: 1, tol: 0
    },
    {
      name: "20 年比 30 年月供高、总利息低（规格里用户真正要比的那件事）",
      run: function () {
        var y30 = amortize(1000000, 4.2, 360);
        var y20 = amortize(1000000, 4.2, 240);
        return y20.payment > y30.payment && y20.totalInterest < y30.totalInterest ? 1 : 0;
      },
      expect: 1, tol: 0
    },
    {
      name: "期数为零或本金为零时返回 null，不返回一张空表冒充结果",
      run: function () { return amortize(0, 4.2, 360) === null && amortize(1000, 4.2, 0) === null ? 1 : 0; },
      expect: 1, tol: 0
    }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var c = CASES[i];
      var got;
      try {
        got = c.run();
      } catch (err) {
        failures.push({ name: c.name, why: "抛异常：" + (err && err.message ? err.message : err) });
        continue;
      }
      if (typeof got !== "number" || !isFinite(got)) {
        failures.push({ name: c.name, why: "得到的不是有限数：" + got });
        continue;
      }
      var diff = Math.abs(got - c.expect);
      if (!(diff <= c.tol)) {
        failures.push({ name: c.name, why: "期望 " + c.expect + "，得到 " + got + "，差 " + diff });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    round2: round2,
    periodRate: periodRate,
    annuityPayment: annuityPayment,
    amortize: amortize,
    npv: npv,
    irr: irr,
    wacc: wacc,
    fisherReal: fisherReal,
    money: money,
    pct: pct,
    CASES: CASES,
    runSelfTest: runSelfTest,
    DEFAULT: DEFAULT,
    DEFAULT_FLOWS: DEFAULT_FLOWS
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.FinancialEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
