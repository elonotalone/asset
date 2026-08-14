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

  function blank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  /* 指标名可以自带单位：「到店客流（人次）」读成名字「到店客流」加单位「人次」。
     名字是用户在屏幕上要认的东西，不能连着括号一起当成一整串。 */
  function splitUnit(name) {
    var raw = String(blank(name) ? "" : name).trim();
    var found = /^(.+?)\s*[（(]\s*([^（）()]{1,12}?)\s*[）)]$/.exec(raw);
    if (!found || !found[1].trim()) return { name: raw, unit: "" };
    return { name: found[1].trim(), unit: found[2].trim() };
  }

  function reasonFor(what, raw) {
    if (blank(raw)) return "这一时段没有" + what;
    return what + "「" + String(raw).trim() + "」不是有限数";
  }

  function record(fields) {
    fields = fields || {};
    if (!String(fields.name || "").trim()) return { error: "指标名不能为空" };
    var split = splitUnit(fields.name);
    var lower = blank(fields.lower) ? DEFAULT_LOWER : finite(fields.lower);
    var upper = blank(fields.upper) ? DEFAULT_UPPER : finite(fields.upper);
    if (lower === null || upper === null) return { error: "分段边界必须是有限数" };
    var actual = blank(fields.actual) ? null : finite(fields.actual);
    var target = blank(fields.target) ? null : finite(fields.target);
    var why = "";
    if (actual === null) why = reasonFor("实际值", fields.actual);
    else if (target === null) why = reasonFor("目标值", fields.target);
    return {
      value: {
        period: blank(fields.period) ? "未标时段" : String(fields.period).trim(),
        region: blank(fields.region) ? "未标地区" : String(fields.region).trim(),
        name: split.name,
        unit: blank(fields.unit) ? split.unit : String(fields.unit).trim(),
        actual: actual,
        target: target,
        lower: lower,
        upper: upper,
        missingReason: why
      }
    };
  }

  var HEADINGS = {
    period: /^(时段|日期|period|date)$/i,
    region: /^(地区|区域|门店|region|store)$/i,
    name: /^(指标|指标名|metric|name)$/i,
    actual: /^(实际|实际值|actual)$/i,
    target: /^(目标|目标值|target)$/i,
    unit: /^(单位|unit)$/i,
    lower: /^(低段边界|低段|lower)$/i,
    upper: /^(高段边界|高段|upper)$/i
  };
  var POSITIONS = ["period", "region", "name", "actual", "target", "lower", "upper"];

  function headerMap(cols) {
    var map = {};
    var hit = 0;
    for (var i = 0; i < cols.length; i++) {
      for (var key in HEADINGS) {
        if (map[key] === undefined && HEADINGS[key].test(cols[i])) { map[key] = i; hit++; break; }
      }
    }
    if (map.period === undefined || map.name === undefined) return null;
    return hit >= 3 ? map : null;
  }

  function parseDataset(raw) {
    var lines = String(raw || "").split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ""; });
    var records = [];
    var errors = [];
    var map = null;
    for (var i = 0; i < lines.length; i++) {
      var cols = lines[i].split(/[,\t]/).map(function (cell) { return cell.trim(); });
      if (i === 0) {
        map = headerMap(cols);
        if (map) continue;
      }
      if (cols.length < 5) {
        errors.push("第 " + (i + 1) + " 行至少需要时段、地区、指标、实际、目标");
        continue;
      }
      var fields = {};
      POSITIONS.concat(["unit"]).forEach(function (key) {
        var at = map ? map[key] : POSITIONS.indexOf(key);
        fields[key] = at === undefined || at < 0 || at >= cols.length ? "" : cols[at];
      });
      var made = record(fields);
      if (made.error) errors.push("第 " + (i + 1) + " 行：" + made.error);
      else records.push(made.value);
    }
    if (lines.length === 0) errors.push("没有可载入的数据行");
    if (lines.length && !records.length && !errors.length) errors.push("只有表头，没有数据行");
    return { records: records, errors: errors };
  }

  /* 地区与指标按用户数据里出现的先后排，他找的是自己表里的顺序。 */
  function firstSeen(records, key) {
    var seen = {};
    var values = [];
    (records || []).forEach(function (item) {
      var value = String(item[key]);
      if (!seen[value]) { seen[value] = true; values.push(value); }
    });
    return values;
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
        unit: item.unit || "",
        actual: item.actual,
        target: item.target,
        lower: item.lower,
        upper: item.upper,
        result: item.actual === null || item.target === null
          ? missing(item.missingReason || "读数缺失")
          : calculateMetric(item.actual, item.target, item.lower, item.upper)
      };
    });
  }

  function round3(value) {
    if (typeof value !== "number" || !isFinite(value)) return NaN;
    return Math.round(value * 1000) / 1000;
  }

  /* 实际离目标差多少：方向由文字说出来，不靠颜色。 */
  function gapOf(actual, target) {
    var gap = round3(actual - target);
    if (!isFinite(gap)) return null;
    return {
      gap: gap,
      distance: Math.abs(gap),
      direction: gap > 0 ? "over" : gap < 0 ? "under" : "level",
      word: gap > 0 ? "比目标多" : gap < 0 ? "比目标少" : "正好踩在目标上"
    };
  }

  function clampInt(value, low, high, fallback) {
    if (typeof value !== "number" || !isFinite(value)) return fallback;
    return Math.min(high, Math.max(low, Math.round(value)));
  }

  /* 一个指标在一个时段上的读数。没有记录、有多条记录、算不出来，
     都是断口，各自带自己的原因；实际的 0 是能算的读数，不是断口。 */
  function pointAt(matches, period) {
    if (!matches.length) return { kind: "missing", why: "这一时段没有数据" };
    if (matches.length > 1) {
      return { kind: "missing", why: "这一时段有 " + matches.length + " 条记录，读数不唯一" };
    }
    var item = matches[0];
    if (item.actual === null || item.target === null) {
      return { kind: "missing", why: item.missingReason || "读数缺失" };
    }
    var result = calculateMetric(item.actual, item.target, item.lower, item.upper);
    if (result.kind !== "value") return { kind: "missing", why: result.reason };
    return {
      kind: "value",
      actual: item.actual,
      target: item.target,
      result: result,
      gap: gapOf(item.actual, item.target)
    };
  }

  /* 一整块看板：一个地区、一条共用时间轴、每个指标一条轨道。
     时间范围决定纵向尺度和当前读数，所以筛选是重算，不是把行藏起来。 */
  function board(records, view) {
    view = view || {};
    var all = Array.isArray(records) ? records : [];
    var regions = firstSeen(all, "region");
    var region = regions.indexOf(view.region) >= 0 ? view.region : (regions[0] || "");
    var scoped = all.filter(function (item) { return item.region === region; });
    var periods = uniqueSorted(scoped, "period");
    var names = [];
    var units = {};
    scoped.forEach(function (item) {
      if (names.indexOf(item.name) < 0) names.push(item.name);
      if (!units[item.name] && item.unit) units[item.name] = item.unit;
    });
    var last = Math.max(0, periods.length - 1);
    var from = clampInt(view.from, 0, last, 0);
    var to = clampInt(view.to, 0, last, last);
    if (from > to) { var swap = from; from = to; to = swap; }

    var tracks = names.map(function (name) {
      var points = periods.map(function (period, index) {
        var matches = scoped.filter(function (item) {
          return item.name === name && item.period === period;
        });
        var point = pointAt(matches, period);
        point.period = period;
        point.index = index;
        point.inWindow = index >= from && index <= to;
        return point;
      });
      var live = points.filter(function (point) { return point.inWindow && point.kind === "value"; });
      /* 纵向尺度只包住这段时间里真的出现过的数：把 0 硬塞进来会把起落压平，
         上升、停滞和回落就看不出发生在哪一段。真实的 0 自己就是下界，落在基线上。 */
      var span = null;
      if (live.length) {
        var low = live[0].actual;
        var high = live[0].actual;
        live.forEach(function (point) {
          low = Math.min(low, point.actual, point.target);
          high = Math.max(high, point.actual, point.target);
        });
        if (high === low) high = low + 1;
        span = { low: low, high: high };
      }
      var reading = live.length ? live[live.length - 1] : null;
      return {
        name: name,
        unit: units[name] || "",
        points: points,
        span: span,
        reading: reading,
        breaks: points.filter(function (point) { return point.inWindow && point.kind === "missing"; })
      };
    });

    var current = names.indexOf(view.current) >= 0 ? view.current : (names[0] || "");
    var chosen = null;
    tracks.forEach(function (track) { if (track.name === current) chosen = track; });
    var headline = null;
    if (chosen) {
      headline = chosen.reading
        ? {
          name: chosen.name,
          unit: chosen.unit,
          period: chosen.reading.period,
          word: chosen.reading.gap.word,
          distance: chosen.reading.gap.distance,
          direction: chosen.reading.gap.direction,
          label: chosen.reading.result.label,
          symbol: chosen.reading.result.symbol,
          rate: formatRate(chosen.reading.result),
          why: ""
        }
        : {
          name: chosen.name,
          unit: chosen.unit,
          why: chosen.breaks.length ? chosen.breaks[chosen.breaks.length - 1].why : "这段时间里没有读数"
        };
    }
    return {
      regions: regions,
      region: region,
      periods: periods,
      from: from,
      to: to,
      window: periods.length ? { from: periods[from], to: periods[to] } : null,
      tracks: tracks,
      current: current,
      headline: headline
    };
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
    } },
    { name: "指标名自带的单位读成单位，名字留给用户认", run: function () {
      var split = splitUnit("平均等位时长（分钟）");
      return split.name === "平均等位时长" && split.unit === "分钟";
    } },
    { name: "缺实际值的时段是断口，实际的零不是断口", run: function () {
      var parsed = parseDataset("时段,地区,指标,实际,目标\n01,东,客流,,100\n02,东,客流,0,100");
      var one = board(parsed.records, {}).tracks[0];
      return one.points[0].kind === "missing" && one.points[1].kind === "value" &&
        one.points[1].actual === 0 && one.breaks.length === 1;
    } },
    { name: "缩小时间范围会重算纵向尺度与当前读数", run: function () {
      var parsed = parseDataset("时段,地区,指标,实际,目标\n01,东,客流,900,100\n02,东,客流,120,100");
      var wide = board(parsed.records, {}).tracks[0];
      var narrow = board(parsed.records, { from: 1, to: 1 }).tracks[0];
      return wide.span.high === 900 && narrow.span.high === 120 &&
        wide.reading.actual === 120 && narrow.reading.actual === 120;
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
    splitUnit: splitUnit,
    record: record,
    parseDataset: parseDataset,
    uniqueSorted: uniqueSorted,
    firstSeen: firstSeen,
    filterRecords: filterRecords,
    gapOf: gapOf,
    board: board,
    formatNumber: formatNumber,
    formatRate: formatRate,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DashboardEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
