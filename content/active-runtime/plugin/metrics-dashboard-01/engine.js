(function (root) {
  "use strict";

  var DEFAULT_LOWER = 0.80;
  var DEFAULT_UPPER = 0.95;
  var BANDS = {
    low: { id: "low", symbol: "▼", label: "低于参考区间", color: "#9f1239" },
    middle: { id: "middle", symbol: "■", label: "参考区间内", color: "#a16207" },
    high: { id: "high", symbol: "▲", label: "高于参考区间", color: "#166534" }
  };

  function finite(value) {
    if (typeof value === "number") return isFinite(value) ? value : null;
    var raw = String(value === undefined || value === null ? "" : value).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return null;
    var number = Number(raw);
    return isFinite(number) ? number : null;
  }

  function missing(reason) {
    return {
      kind: "missing",
      value: null,
      ratio: null,
      band: null,
      symbol: "",
      label: "无法得到指标",
      color: "",
      reason: reason
    };
  }

  function calculateMetric(actualValue, targetValue, lowerValue, upperValue) {
    var actual = finite(actualValue);
    var target = finite(targetValue);
    var lower = lowerValue === "" || lowerValue === undefined || lowerValue === null
      ? DEFAULT_LOWER : finite(lowerValue);
    var upper = upperValue === "" || upperValue === undefined || upperValue === null
      ? DEFAULT_UPPER : finite(upperValue);

    if (actual === null) return missing("实际值不是有限数");
    if (target === null) return missing("目标值不是有限数");
    if (target === 0) return missing("目标为零，不能计算达成率");
    if (lower === null || upper === null) return missing("分段边界不是有限数");
    if (lower > upper) return missing("低段边界不能大于高段边界");

    var ratio = actual / target;
    if (!isFinite(ratio)) return missing("相除结果不是有限数");
    var band = ratio < lower ? BANDS.low : ratio <= upper ? BANDS.middle : BANDS.high;
    return {
      kind: "value",
      value: ratio,
      ratio: ratio,
      band: band.id,
      symbol: band.symbol,
      label: band.label,
      color: band.color,
      reason: "",
      lower: lower,
      upper: upper
    };
  }

  function record(fields) {
    fields = fields || {};
    var actual = finite(fields.actual);
    var target = finite(fields.target);
    var lower = fields.lower === "" || fields.lower === undefined ? DEFAULT_LOWER : finite(fields.lower);
    var upper = fields.upper === "" || fields.upper === undefined ? DEFAULT_UPPER : finite(fields.upper);
    if (!String(fields.name || "").trim()) return { error: "指标名不能为空" };
    if (actual === null) return { error: "实际值必须是有限数" };
    if (target === null) return { error: "目标值必须是有限数" };
    if (lower === null || upper === null) return { error: "分段边界必须是有限数" };
    return {
      value: {
        period: String(fields.period || "未标时段").trim(),
        region: String(fields.region || "未标地区").trim(),
        name: String(fields.name).trim(),
        actual: actual,
        target: target,
        lower: lower,
        upper: upper
      }
    };
  }

  function parseDataset(raw) {
    var lines = String(raw || "").split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ""; });
    var records = [];
    var errors = [];
    for (var i = 0; i < lines.length; i++) {
      var cols = lines[i].split(/[,\t]/).map(function (cell) { return cell.trim(); });
      if (i === 0 && /^(时段|period)$/i.test(cols[0] || "")) continue;
      if (cols.length < 5) {
        errors.push("第 " + (i + 1) + " 行至少需要时段、地区、指标、实际、目标");
        continue;
      }
      var made = record({
        period: cols[0], region: cols[1], name: cols[2], actual: cols[3], target: cols[4],
        lower: cols.length > 5 ? cols[5] : "", upper: cols.length > 6 ? cols[6] : ""
      });
      if (made.error) errors.push("第 " + (i + 1) + " 行：" + made.error);
      else records.push(made.value);
    }
    if (lines.length === 0) errors.push("没有可载入的数据行");
    return { records: records, errors: errors };
  }

  function uniqueSorted(records, key) {
    var seen = {};
    var values = [];
    records.forEach(function (item) {
      var value = String(item[key]);
      if (!seen[value]) { seen[value] = true; values.push(value); }
    });
    return values.sort();
  }

  function filterRecords(records, filters) {
    filters = filters || {};
    return (records || []).filter(function (item) {
      return (!filters.period || item.period === filters.period) &&
        (!filters.region || item.region === filters.region);
    }).map(function (item) {
      return {
        period: item.period,
        region: item.region,
        name: item.name,
        actual: item.actual,
        target: item.target,
        lower: item.lower,
        upper: item.upper,
        result: calculateMetric(item.actual, item.target, item.lower, item.upper)
      };
    });
  }

  function formatNumber(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    var rounded = Math.round(value * 1000) / 1000;
    var parts = String(rounded).split(".");
    var sign = parts[0].charAt(0) === "-" ? "-" : "";
    var digits = sign ? parts[0].slice(1) : parts[0];
    var grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return sign + grouped + (parts.length > 1 ? "." + parts[1] : "");
  }

  function formatRate(result) {
    return result && result.kind === "value" ? (result.ratio * 100).toFixed(2) + " %" : "—";
  }

  var CASES = [
    { name: "64/100=0.64 为低段", run: function () { return calculateMetric(64, 100).band === "low"; } },
    { name: "0.80 边界进入中段", run: function () { return calculateMetric(80, 100).band === "middle"; } },
    { name: "0.95 边界仍在中段", run: function () { return calculateMetric(95, 100).band === "middle"; } },
    { name: "大于 0.95 进入高段", run: function () { return calculateMetric(96, 100).band === "high"; } },
    { name: "自定义 0.50/0.75 下 0.70 为中段", run: function () { return calculateMetric(70, 100, 0.50, 0.75).band === "middle"; } },
    { name: "实际零是可计算的真实零", run: function () { var r = calculateMetric(0, 100); return r.kind === "value" && r.ratio === 0; } },
    { name: "目标零返回缺失而不是零", run: function () { var r = calculateMetric(10, 0); return r.kind === "missing" && r.ratio === null; } },
    { name: "NaN 返回缺失而不是零", run: function () { var r = calculateMetric(Number.NaN, 100); return r.kind === "missing" && r.ratio === null; } },
    { name: "三段颜色、符号与文字均不同", run: function () {
      var values = [calculateMetric(70, 100), calculateMetric(90, 100), calculateMetric(110, 100)];
      return new Set(values.map(function (r) { return r.color; })).size === 3 &&
        new Set(values.map(function (r) { return r.symbol; })).size === 3 &&
        values.every(function (r) { return !!r.label; });
    } },
    { name: "同一输入两次输出逐位相同", run: function () {
      return JSON.stringify(calculateMetric(92, 100, 0.8, 0.95)) ===
        JSON.stringify(calculateMetric(92, 100, 0.8, 0.95));
    } }
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (test) {
      try { if (!test.run()) failures.push({ name: test.name, why: "断言返回 false" }); }
      catch (error) { failures.push({ name: test.name, why: error && error.message ? error.message : String(error) }); }
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    DEFAULT_LOWER: DEFAULT_LOWER,
    DEFAULT_UPPER: DEFAULT_UPPER,
    BANDS: BANDS,
    finite: finite,
    calculateMetric: calculateMetric,
    record: record,
    parseDataset: parseDataset,
    uniqueSorted: uniqueSorted,
    filterRecords: filterRecords,
    formatNumber: formatNumber,
    formatRate: formatRate,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DashboardEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
