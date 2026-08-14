/* 三表模型 · 纯计算内核。金额按分取整，三表逐年勾稽。 */
(function (root) {
  "use strict";

  var YEARS = ["2027E", "2028E", "2029E"];
  var MODES = ["opening", "average"];
  var DEFAULT = {
    baseRevenue: 1000000,
    revenueGrowth: 0.12,
    grossMargin: 0.55,
    operatingExpensePct: 0.28,
    taxRate: 0.25,
    dso: 45,
    inventoryDays: 30,
    payableDays: 35,
    capexPct: 0.06,
    depreciationYears: 5,
    interestRate: 0.08,
    minimumCash: 100000,
    openingCash: 50000,
    openingReceivables: 123287.67,
    openingInventory: 36986.30,
    openingPpe: 300000,
    openingPayables: 43150.68,
    openingRevolver: 250000,
    openingRetainedEarnings: 50000,
    shareCapital: 167123.29
  };

  function round2(value) {
    if (typeof value !== "number" || !isFinite(value)) return NaN;
    return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  }

  function add() {
    var total = 0;
    for (var i = 0; i < arguments.length; i++) total += arguments[i];
    return round2(total);
  }

  function money(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    var negative = value < 0;
    var parts = Math.abs(round2(value)).toFixed(2).split(".");
    var whole = "";
    for (var i = 0; i < parts[0].length; i++) {
      if (i && (parts[0].length - i) % 3 === 0) whole += " ";
      whole += parts[0].charAt(i);
    }
    return (negative ? "−" : "") + whole + "." + parts[1];
  }

  function percent(value) {
    return (value * 100).toFixed(2) + "%";
  }

  function assumptionsOf(raw) {
    var source = raw || {};
    var result = {};
    for (var key in DEFAULT) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT, key)) continue;
      result[key] = source[key] === undefined ? DEFAULT[key] : Number(source[key]);
      if (!isFinite(result[key])) return { ok: false, error: key + " 必须是有限数字。" };
    }
    if (!(result.baseRevenue > 0)) return { ok: false, error: "基期收入必须大于 0。" };
    if (!(result.revenueGrowth > -1 && result.revenueGrowth <= 2)) return { ok: false, error: "收入增速必须大于 -100% 且不超过 200%。" };
    for (var i = 0; i < ["grossMargin", "operatingExpensePct", "taxRate", "capexPct", "interestRate"].length; i++) {
      var ratioKey = ["grossMargin", "operatingExpensePct", "taxRate", "capexPct", "interestRate"][i];
      if (result[ratioKey] < 0 || result[ratioKey] > 1) return { ok: false, error: ratioKey + " 必须在 0% 到 100% 之间。" };
    }
    for (var j = 0; j < ["dso", "inventoryDays", "payableDays"].length; j++) {
      var dayKey = ["dso", "inventoryDays", "payableDays"][j];
      if (result[dayKey] < 0 || result[dayKey] > 365) return { ok: false, error: dayKey + " 必须在 0 到 365 天之间。" };
    }
    if (!(Number.isInteger(result.depreciationYears) && result.depreciationYears > 0 && result.depreciationYears <= 50)) {
      return { ok: false, error: "折旧年限必须是 1 到 50 的整数。" };
    }
    for (var k = 0; k < ["minimumCash", "openingCash", "openingReceivables", "openingInventory", "openingPpe", "openingPayables", "openingRevolver", "openingRetainedEarnings", "shareCapital"].length; k++) {
      var balanceKey = ["minimumCash", "openingCash", "openingReceivables", "openingInventory", "openingPpe", "openingPayables", "openingRevolver", "openingRetainedEarnings", "shareCapital"][k];
      if (result[balanceKey] < 0) return { ok: false, error: balanceKey + " 不得为负。" };
    }
    return { ok: true, assumptions: result };
  }

  function openingBalance(a) {
    var assets = add(a.openingCash, a.openingReceivables, a.openingInventory, a.openingPpe);
    var liabilitiesAndEquity = add(a.openingPayables, a.openingRevolver, a.shareCapital, a.openingRetainedEarnings);
    return {
      cash: round2(a.openingCash),
      receivables: round2(a.openingReceivables),
      inventory: round2(a.openingInventory),
      ppe: round2(a.openingPpe),
      payables: round2(a.openingPayables),
      revolver: round2(a.openingRevolver),
      shareCapital: round2(a.shareCapital),
      retainedEarnings: round2(a.openingRetainedEarnings),
      assets: assets,
      liabilitiesAndEquity: liabilitiesAndEquity,
      difference: round2(assets - liabilitiesAndEquity)
    };
  }

  function driversForYear(a, previousRevenue, opening) {
    var revenue = round2(previousRevenue * (1 + a.revenueGrowth));
    var cogs = round2(revenue * (1 - a.grossMargin));
    var grossProfit = round2(revenue - cogs);
    var operatingExpense = round2(revenue * a.operatingExpensePct);
    var capex = round2(revenue * a.capexPct);
    var depreciation = round2((opening.ppe + capex / 2) / a.depreciationYears);
    depreciation = Math.min(depreciation, add(opening.ppe, capex));
    var receivables = round2(revenue * a.dso / 365);
    var inventory = round2(cogs * a.inventoryDays / 365);
    var payables = round2(cogs * a.payableDays / 365);
    return {
      revenue: revenue,
      cogs: cogs,
      grossProfit: grossProfit,
      operatingExpense: operatingExpense,
      capex: capex,
      depreciation: depreciation,
      receivables: receivables,
      inventory: inventory,
      payables: payables
    };
  }

  function yearWithInterest(a, label, opening, drivers, interest) {
    var ebit = round2(drivers.grossProfit - drivers.operatingExpense - drivers.depreciation);
    var pretaxIncome = round2(ebit - interest);
    var tax = round2(Math.max(pretaxIncome, 0) * a.taxRate);
    var netIncome = round2(pretaxIncome - tax);

    var receivablesChange = round2(drivers.receivables - opening.receivables);
    var inventoryChange = round2(drivers.inventory - opening.inventory);
    var payablesChange = round2(drivers.payables - opening.payables);
    var operatingCashFlow = round2(netIncome + drivers.depreciation - receivablesChange - inventoryChange + payablesChange);
    var investingCashFlow = round2(-drivers.capex);
    var preFinanceCash = round2(opening.cash + operatingCashFlow + investingCashFlow);
    var revolver = round2(Math.max(0, opening.revolver + a.minimumCash - preFinanceCash));
    var revolverChange = round2(revolver - opening.revolver);
    var financingCashFlow = revolverChange;
    var cash = round2(preFinanceCash + financingCashFlow);

    var ppe = round2(opening.ppe + drivers.capex - drivers.depreciation);
    var retainedEarnings = round2(opening.retainedEarnings + netIncome);
    var assets = add(cash, drivers.receivables, drivers.inventory, ppe);
    var liabilitiesAndEquity = add(drivers.payables, revolver, opening.shareCapital, retainedEarnings);
    var difference = round2(assets - liabilitiesAndEquity);

    return {
      label: label,
      income: {
        revenue: drivers.revenue,
        cogs: drivers.cogs,
        grossProfit: drivers.grossProfit,
        operatingExpense: drivers.operatingExpense,
        depreciation: drivers.depreciation,
        ebit: ebit,
        interest: round2(interest),
        pretaxIncome: pretaxIncome,
        tax: tax,
        netIncome: netIncome
      },
      cashFlow: {
        netIncome: netIncome,
        depreciationAddBack: drivers.depreciation,
        receivablesChange: receivablesChange,
        inventoryChange: inventoryChange,
        payablesChange: payablesChange,
        operatingCashFlow: operatingCashFlow,
        capex: drivers.capex,
        investingCashFlow: investingCashFlow,
        revolverChange: revolverChange,
        financingCashFlow: financingCashFlow,
        openingCash: opening.cash,
        endingCash: cash,
        cashEquationDifference: round2(cash - (opening.cash + operatingCashFlow + investingCashFlow + financingCashFlow))
      },
      balance: {
        cash: cash,
        receivables: drivers.receivables,
        inventory: drivers.inventory,
        ppe: ppe,
        assets: assets,
        payables: drivers.payables,
        revolver: revolver,
        shareCapital: opening.shareCapital,
        retainedEarnings: retainedEarnings,
        liabilitiesAndEquity: liabilitiesAndEquity,
        difference: difference
      },
      preFinanceCash: preFinanceCash,
      iterations: 1,
      converged: true,
      fixedPointGap: 0
    };
  }

  function solveYear(a, label, opening, previousRevenue, mode) {
    var drivers = driversForYear(a, previousRevenue, opening);
    if (mode === "opening") {
      var directInterest = round2(opening.revolver * a.interestRate);
      return yearWithInterest(a, label, opening, drivers, directInterest);
    }

    var guess = opening.revolver;
    var result = null;
    for (var iteration = 1; iteration <= 100; iteration++) {
      var interest = round2((opening.revolver + guess) / 2 * a.interestRate);
      result = yearWithInterest(a, label, opening, drivers, interest);
      var next = result.balance.revolver;
      if (Math.abs(next - guess) <= 0.01) {
        var finalInterest = round2((opening.revolver + next) / 2 * a.interestRate);
        result = yearWithInterest(a, label, opening, drivers, finalInterest);
        result.iterations = iteration;
        result.fixedPointGap = round2(result.balance.revolver - next);
        result.converged = Math.abs(result.fixedPointGap) <= 0.01;
        return result;
      }
      guess = next;
    }
    result.iterations = 100;
    result.converged = false;
    result.fixedPointGap = round2(result.balance.revolver - guess);
    return result;
  }

  function projectNormalized(a, mode) {
    var opening = openingBalance(a);
    if (opening.difference !== 0) return null;
    var current = opening;
    var previousRevenue = a.baseRevenue;
    var years = [];
    for (var i = 0; i < YEARS.length; i++) {
      var year = solveYear(a, YEARS[i], current, previousRevenue, mode);
      years.push(year);
      previousRevenue = year.income.revenue;
      current = {
        cash: year.balance.cash,
        receivables: year.balance.receivables,
        inventory: year.balance.inventory,
        ppe: year.balance.ppe,
        payables: year.balance.payables,
        revolver: year.balance.revolver,
        shareCapital: year.balance.shareCapital,
        retainedEarnings: year.balance.retainedEarnings
      };
    }
    var totalInterest = 0;
    var maxIterations = 0;
    var converged = true;
    for (var j = 0; j < years.length; j++) {
      totalInterest = round2(totalInterest + years[j].income.interest);
      maxIterations = Math.max(maxIterations, years[j].iterations);
      converged = converged && years[j].converged;
    }
    return {
      mode: mode,
      assumptions: a,
      openingBalance: opening,
      years: years,
      totalInterest: totalInterest,
      maxIterations: maxIterations,
      converged: converged,
      final: years[years.length - 1]
    };
  }

  function project(raw, mode) {
    if (MODES.indexOf(mode) === -1) return null;
    var checked = assumptionsOf(raw);
    return checked.ok ? projectNormalized(checked.assumptions, mode) : null;
  }

  function model(raw, mode) {
    if (MODES.indexOf(mode) === -1) return null;
    var checked = assumptionsOf(raw);
    if (!checked.ok) return null;
    var a = checked.assumptions;
    var opening = projectNormalized(a, "opening");
    var average = projectNormalized(a, "average");
    if (!opening || !average) return null;
    var selected = mode === "opening" ? opening : average;
    var sensitivity = [-0.02, 0, 0.02].map(function (delta) {
      var changed = {};
      for (var key in a) changed[key] = a[key];
      changed.revenueGrowth = round2((a.revenueGrowth + delta) * 100) / 100;
      var result = projectNormalized(changed, mode);
      return {
        delta: delta,
        growth: changed.revenueGrowth,
        revenue: result.final.income.revenue,
        netIncome: result.final.income.netIncome,
        cash: result.final.balance.cash,
        revolver: result.final.balance.revolver
      };
    });
    return {
      mode: mode,
      assumptions: a,
      openingBalance: selected.openingBalance,
      years: selected.years,
      final: selected.final,
      selected: selected,
      comparison: {
        opening: opening,
        average: average,
        bothConverged: opening.converged && average.converged,
        interestDifference: round2(average.totalInterest - opening.totalInterest),
        cashDifference: round2(average.final.balance.cash - opening.final.balance.cash),
        revolverDifference: round2(average.final.balance.revolver - opening.final.balance.revolver)
      },
      sensitivity: sensitivity
    };
  }

  var CASES = [
    {
      name: "默认期初资产负债表平衡",
      run: function () {
        var result = model(DEFAULT, "opening");
        return result && result.openingBalance.difference === 0;
      }
    },
    {
      name: "三年资产均等于负债加权益",
      run: function () {
        var result = model(DEFAULT, "average");
        return result.years.every(function (year) { return year.balance.difference === 0; });
      }
    },
    {
      name: "净利润进入经营现金流并累加到未分配利润",
      run: function () {
        var result = model(DEFAULT, "opening");
        return result.years[0].cashFlow.netIncome === result.years[0].income.netIncome &&
          result.years[0].balance.retainedEarnings === round2(DEFAULT.openingRetainedEarnings + result.years[0].income.netIncome);
      }
    },
    {
      name: "折旧在现金流加回并减少固定资产净额",
      run: function () {
        var year = model(DEFAULT, "opening").years[0];
        return year.cashFlow.depreciationAddBack === year.income.depreciation &&
          year.balance.ppe === round2(DEFAULT.openingPpe + year.cashFlow.capex - year.income.depreciation);
      }
    },
    {
      name: "期末现金严格等于期初加经营、投资与筹资现金流",
      run: function () {
        return model(DEFAULT, "average").years.every(function (year) { return year.cashFlow.cashEquationDifference === 0; });
      }
    },
    {
      name: "两种断环口径都收敛且结果差异显式非零",
      run: function () {
        var result = model(DEFAULT, "average");
        return result.comparison.bothConverged && result.comparison.interestDifference !== 0 &&
          (result.comparison.cashDifference !== 0 || result.comparison.revolverDifference !== 0);
      }
    },
    {
      name: "平均余额利息满足迭代后的不动点",
      run: function () {
        var result = model(DEFAULT, "average").comparison.average;
        var openingRevolver = DEFAULT.openingRevolver;
        return result.years.every(function (year) {
          var expected = round2((openingRevolver + year.balance.revolver) / 2 * DEFAULT.interestRate);
          openingRevolver = year.balance.revolver;
          return Math.abs(year.income.interest - expected) <= 0.01 && Math.abs(year.fixedPointGap) <= 0.01;
        });
      }
    },
    {
      name: "修改收入增速后仍平衡且三表结果联动",
      run: function () {
        var changed = {};
        for (var key in DEFAULT) changed[key] = DEFAULT[key];
        changed.revenueGrowth = 0.15;
        var before = model(DEFAULT, "opening");
        var after = model(changed, "opening");
        return after.years.every(function (year) { return year.balance.difference === 0; }) &&
          before.final.income.revenue !== after.final.income.revenue &&
          before.final.cashFlow.endingCash !== after.final.cashFlow.endingCash &&
          before.final.balance.receivables !== after.final.balance.receivables;
      }
    }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      try {
        if (!CASES[i].run()) failures.push({ name: CASES[i].name, why: "结果不符合三表勾稽口径" });
      } catch (err) {
        failures.push({ name: CASES[i].name, why: err && err.message ? err.message : String(err) });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    YEARS: YEARS,
    MODES: MODES,
    DEFAULT: DEFAULT,
    round2: round2,
    money: money,
    percent: percent,
    assumptionsOf: assumptionsOf,
    openingBalance: openingBalance,
    project: project,
    model: model,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.ThreeStatementEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
