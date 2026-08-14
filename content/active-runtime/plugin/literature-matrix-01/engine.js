(function (root) {
  "use strict";

  var DEFAULT_FIELDS = [
    "作者年份", "研究设计", "研究对象", "样本量", "干预或暴露", "对照",
    "主要结局", "效应量", "随访", "地区", "结论"
  ];
  var BIAS_DOMAINS = [
    "选择与分组", "测量与结局评估", "缺失数据", "报告与利益冲突"
  ];
  var STATUS = {
    included: { key: "included", label: "纳入", decision: "included", color: "#166534", shape: "●" },
    duplicate: { key: "duplicate", label: "排除·重复", decision: "excluded", color: "#9f1239", shape: "×" },
    "citation-excluded": { key: "citation-excluded", label: "排除·题录", decision: "excluded", color: "#9f1239", shape: "×" },
    unavailable: { key: "unavailable", label: "排除·未取到", decision: "excluded", color: "#9f1239", shape: "×" },
    "fulltext-excluded": { key: "fulltext-excluded", label: "排除·全文", decision: "excluded", color: "#9f1239", shape: "×" },
    pending: { key: "pending", label: "待定", decision: "pending", color: "#a16207", shape: "◆" }
  };
  var ALIASES = {
    "纳入": "included", "included": "included",
    "重复": "duplicate", "duplicate": "duplicate",
    "题录排除": "citation-excluded", "citation-excluded": "citation-excluded",
    "未取到": "unavailable", "unavailable": "unavailable",
    "全文排除": "fulltext-excluded", "fulltext-excluded": "fulltext-excluded",
    "待定": "pending", "pending": "pending"
  };

  function normalizeStatus(raw) {
    var key = ALIASES[String(raw || "").trim().toLowerCase()] || "pending";
    return STATUS[key];
  }

  function statusVisual(raw) {
    var item;
    if (raw === "excluded") item = STATUS.duplicate;
    else if (raw === "included" || raw === "pending") item = STATUS[raw];
    else item = normalizeStatus(raw);
    return {
      decision: item.decision,
      label: item.decision === "excluded" ? "排除" : item.label,
      detail: item.label,
      color: item.color,
      shape: item.shape,
      text: item.shape + " " + item.label
    };
  }

  function normalizeFields(input) {
    var list = Array.isArray(input) ? input : String(input || "").split(/[，,]/);
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var name = String(list[i] || "").trim();
      if (!name || seen[name]) continue;
      seen[name] = true;
      out.push(name);
    }
    return out.length ? out : DEFAULT_FIELDS.slice();
  }

  function record(values, statusRaw, bias) {
    var status = normalizeStatus(statusRaw);
    return {
      values: (values || []).map(function (v) { return String(v || "").trim(); }),
      pipeline: status.key,
      decision: status.decision,
      bias: Array.isArray(bias) && bias.length ? bias.slice(0, 4) : BIAS_DOMAINS.map(function () { return "待观察"; })
    };
  }

  function parseBatch(text) {
    var rows = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var parts = line.indexOf("\t") >= 0 ? line.split("\t") : line.split("|");
      parts = parts.map(function (part) { return part.trim(); });
      if (parts.length < 2) return;
      var statusRaw = parts.pop();
      if (statusRaw === "状态") return;
      var values;
      if (parts.length <= 4) {
        values = [parts[0] || "", parts[1] || "", parts[2] || "", parts[3] || ""];
      } else {
        values = parts.slice(0, DEFAULT_FIELDS.length);
      }
      while (values.length < DEFAULT_FIELDS.length) values.push("");
      rows.push(record(values, statusRaw));
    });
    return rows;
  }

  function count(records, key) {
    var total = 0;
    for (var i = 0; i < records.length; i++) if (records[i].pipeline === key) total++;
    return total;
  }

  function audit(records) {
    records = Array.isArray(records) ? records : [];
    var identified = records.length;
    var duplicates = count(records, "duplicate");
    var citationExcluded = count(records, "citation-excluded");
    var unavailable = count(records, "unavailable");
    var fulltextExcluded = count(records, "fulltext-excluded");
    var screened = identified - duplicates;
    var fulltextNeeded = screened - citationExcluded;
    var evaluated = fulltextNeeded - unavailable;
    var included = evaluated - fulltextExcluded;
    var includedByStatus = records.filter(function (r) { return r.decision === "included"; }).length;
    var decisionCounts = { included: 0, excluded: 0, pending: 0 };
    records.forEach(function (r) {
      var key = decisionCounts[r.decision] === undefined ? "pending" : r.decision;
      decisionCounts[key]++;
    });
    var relations = [
      { label: "已筛 = 已识别 − 重复", left: screened, right: identified - duplicates },
      { label: "待取全文 = 已筛 − 题录排除", left: fulltextNeeded, right: screened - citationExcluded },
      { label: "已评估 = 待取全文 − 未取到", left: evaluated, right: fulltextNeeded - unavailable },
      { label: "已纳入 = 已评估 − 全文排除", left: included, right: evaluated - fulltextExcluded },
      { label: "最终纳入 = 逐条状态计数", left: included, right: includedByStatus }
    ];
    relations.forEach(function (r) { r.ok = r.left === r.right; });
    return {
      identified: identified,
      duplicates: duplicates,
      screened: screened,
      citationExcluded: citationExcluded,
      fulltextNeeded: fulltextNeeded,
      unavailable: unavailable,
      evaluated: evaluated,
      fulltextExcluded: fulltextExcluded,
      included: included,
      includedByStatus: includedByStatus,
      decisionCounts: decisionCounts,
      relations: relations,
      consistent: relations.every(function (r) { return r.ok; })
    };
  }

  function makeForty() {
    var plan = [
      ["duplicate", 5], ["citation-excluded", 7], ["unavailable", 4],
      ["fulltext-excluded", 6], ["included", 18]
    ];
    var rows = [];
    var n = 1;
    plan.forEach(function (item) {
      for (var i = 0; i < item[1]; i++) {
        rows.push(record(["研究 " + n + "（2020—2025）", "队列研究", "成年人", String(80 + n)], item[0]));
        n++;
      }
    });
    return rows;
  }

  function runSelfTest() {
    var failures = [];
    function expect(name, ok) { if (!ok) failures.push({ name: name }); }
    var forty = makeForty();
    var a = audit(forty);
    expect("40 条题录", a.identified === 40);
    expect("已筛 40 − 5 = 35", a.screened === 35);
    expect("待取全文 35 − 7 = 28", a.fulltextNeeded === 28);
    expect("已评估 28 − 4 = 24", a.evaluated === 24);
    expect("已纳入 24 − 6 = 18", a.included === 18);
    expect("最终纳入与逐条状态一致", a.consistent && a.includedByStatus === 18);
    var broken = forty.map(function (r) {
      return { values: r.values.slice(), pipeline: r.pipeline, decision: r.decision, bias: r.bias.slice() };
    });
    broken[broken.length - 1].decision = "excluded";
    expect("故意状态不一致会被检出", audit(broken).relations[4].ok === false);
    var visuals = [statusVisual("included"), statusVisual("excluded"), statusVisual("pending")];
    expect("三种状态都有颜色", visuals.every(function (v) { return /^#[0-9a-f]{6}$/i.test(v.color); }));
    expect("三种状态都有不同形状", visuals.map(function (v) { return v.shape; }).join("") === "●×◆");
    expect("未知状态安全落到待定", normalizeStatus("尚未判断").key === "pending");
    expect("空行被跳过", parseBatch("\n\n").length === 0);
    return { total: 11, passed: 11 - failures.length, failures: failures };
  }

  var api = {
    DEFAULT_FIELDS: DEFAULT_FIELDS,
    BIAS_DOMAINS: BIAS_DOMAINS,
    STATUS: STATUS,
    normalizeStatus: normalizeStatus,
    statusVisual: statusVisual,
    normalizeFields: normalizeFields,
    record: record,
    parseBatch: parseBatch,
    audit: audit,
    makeForty: makeForty,
    runSelfTest: runSelfTest
  };
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.LiteratureMatrixEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
