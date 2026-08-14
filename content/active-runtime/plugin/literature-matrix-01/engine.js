/*
 * 文献矩阵 · 计算内核
 * 规格：docs/specs/oceanleo-plugins-v1/plugins/literature-matrix.md
 *
 * 口径都写在这里，不上屏（规格 §3）：
 *
 *   筛选流程五条关系
 *     已筛     = 已识别 − 重复
 *     待取全文 = 已筛 − 题录排除
 *     已评估   = 待取全文 − 未取到
 *     已纳入   = 已评估 − 全文排除
 *     最终纳入 = 逐条状态里判定为「纳入」的条数
 *   「已识别」= 成功解析出来的题录总条数。
 *
 *   这五条在本内核里是**恒等式**：screened 等一律由 identified 减出来，
 *   所以对界面粘进来的数据永远成立。它们仍然算、仍然被自测独立复核，
 *   但界面上真正会对不上的是另外两件事，见 parseReport()：
 *     - 粘进来的行没读进来（缺末尾状态）；
 *     - 状态写法认不出来，按「待定」安全落地。
 *   这两件事用户改得动，也必须让他看见，否则就是静默改了他的判定。
 *
 *   状态别名：纳入/included、重复/duplicate、题录排除/citation-excluded、
 *   未取到/unavailable、全文排除/fulltext-excluded、待定/pending。
 *   认不出来的一律落到「待定」，既不丢弃也不猜成纳入或排除。
 *
 *   STATUS 里那三个十六进制值是状态判定自带的取值，不是本产品的配色方案；
 *   界面的颜色照规格 §2 自己定，形状（● × ◆）是无障碍要求，硬的。
 */
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
    var raw = String(statusRaw === undefined || statusRaw === null ? "" : statusRaw).trim();
    var key = ALIASES[raw.toLowerCase()];
    var status = STATUS[key] || STATUS.pending;
    return {
      values: (values || []).map(function (v) { return String(v || "").trim(); }),
      pipeline: status.key,
      decision: status.decision,
      statusRaw: raw,
      statusKnown: Boolean(key),
      bias: Array.isArray(bias) && bias.length ? bias.slice(0, 4) : BIAS_DOMAINS.map(function () { return "待观察"; })
    };
  }

  /*
   * 解析一批粘贴文本，连同「哪几行没读进来」一起报回去。
   * 跳过表头行不算落空 —— 用户粘的表头本来就不是题录。
   */
  function parseReport(text) {
    var rows = [];
    var skipped = [];
    var headerRows = 0;
    String(text || "").split(/\r?\n/).forEach(function (line, index) {
      if (!line.trim()) return;
      var parts = line.indexOf("\t") >= 0 ? line.split("\t") : line.split("|");
      parts = parts.map(function (part) { return part.trim(); });
      if (parts.length < 2) {
        skipped.push({ line: index + 1, text: line.trim(), why: "缺末尾状态" });
        return;
      }
      var statusRaw = parts.pop();
      if (statusRaw === "状态") {
        headerRows++;
        return;
      }
      var values;
      if (parts.length <= 4) {
        values = [parts[0] || "", parts[1] || "", parts[2] || "", parts[3] || ""];
      } else {
        values = parts.slice(0, DEFAULT_FIELDS.length);
      }
      while (values.length < DEFAULT_FIELDS.length) values.push("");
      rows.push(record(values, statusRaw));
    });
    return {
      rows: rows,
      pastedRows: rows.length + skipped.length,
      headerRows: headerRows,
      skipped: skipped,
      unknownStatus: rows.filter(function (r) { return !r.statusKnown; })
    };
  }

  function parseBatch(text) {
    return parseReport(text).rows;
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
    var pending = count(records, "pending");
    var screened = identified - duplicates;
    var fulltextNeeded = screened - citationExcluded;
    var evaluated = fulltextNeeded - unavailable;
    /*
     * 待定的条目**还没走完最后一步**，所以必须从「已纳入」里减掉。
     * 规格 §5 的算式写的是「已纳入 = 已评估 − 全文排除」，它的复算例子里
     * 待定为零，两种写法一样；但一份正在做的综述里手上留几条待定是常态，
     * 不减这一项，第五条关系会对着一份完全正常的表喊「对不上」——
     * 那是狼来了，用户下次就不看它了。
     */
    var included = evaluated - fulltextExcluded - pending;
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
      { label: "已纳入 = 已评估 − 全文排除 − 待定", left: included, right: evaluated - fulltextExcluded - pending },
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
      pending: pending,
      evaluated: evaluated,
      fulltextExcluded: fulltextExcluded,
      included: included,
      includedByStatus: includedByStatus,
      unknownStatus: records.filter(function (r) { return r.statusKnown === false; }).length,
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

    var report = parseReport([
      "作者年份|研究设计|研究对象|样本量|状态",
      "Chen 2024|随机对照试验|社区老年人|286|纳入",
      "Li 2025|队列研究|成年人|318|尚未判断",
      "只有一列没有状态"
    ].join("\n"));
    expect("表头行不算题录", report.headerRows === 1 && report.rows.length === 2);
    expect("缺末尾状态的行报出行号", report.skipped.length === 1 && report.skipped[0].line === 4);
    var withPending = forty.slice(0, 39).concat([record(["待判断的一篇", "队列研究", "成年人", "120"], "待定")]);
    var p = audit(withPending);
    expect("留着一条待定的表不算对不上", p.consistent && p.included === p.includedByStatus);
    expect("认不出的状态被点出来而不是静默改掉",
      report.unknownStatus.length === 1 && report.unknownStatus[0].statusRaw === "尚未判断" &&
      report.unknownStatus[0].pipeline === "pending" &&
      audit(report.rows).unknownStatus === 1);

    return { total: 15, passed: 15 - failures.length, failures: failures };
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
    parseReport: parseReport,
    audit: audit,
    makeForty: makeForty,
    runSelfTest: runSelfTest
  };
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.LiteratureMatrixEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
