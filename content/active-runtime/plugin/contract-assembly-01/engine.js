(function (root) {
  "use strict";

  var TRANSACTIONS = ["软件开发外包", "市场顾问服务", "设备采购", "其他"];
  var CATEGORIES = [
    { id: "foundation", label: "交易基础", critical: true },
    { id: "payment", label: "费用与付款", critical: true },
    { id: "ip", label: "知识产权", critical: true },
    { id: "confidentiality", label: "保密", critical: false },
    { id: "liability", label: "责任限制", critical: false },
    { id: "dispute", label: "争议解决", critical: true }
  ];
  var CONFLICT_REASON = "诉讼与仲裁不能同时选择；同一争议解决条款只能保留一种终局机制。";
  var DEPENDENCY_REASON = "责任上限需以合同金额与费用定义为计算基础。";
  var CLAUSES = [
    {
      id: "scope", category: "foundation", title: "工作范围与交付", riskWeight: 18,
      text: "服务方应围绕{{projectName}}完成约定工作，共交付{{deliverableCount}}项成果；验收以双方书面确认的范围为准。",
      variables: [
        { key: "projectName", label: "项目名称", type: "text" },
        { key: "deliverableCount", label: "交付成果数量", type: "number" }
      ]
    },
    {
      id: "unlimited-rework", category: "foundation", title: "无限次返工承诺", riskWeight: -90,
      text: "服务方应按委托方要求不限次数修改成果，直至委托方书面认可。",
      variables: []
    },
    {
      id: "payment", category: "payment", title: "费用与付款", riskWeight: 24,
      text: "合同总价为人民币{{contractAmount}}元，首付款比例为{{depositRate}}，首付款应于{{paymentDate}}前支付。",
      variables: [
        { key: "contractAmount", label: "合同金额", type: "amount" },
        { key: "depositRate", label: "首付款比例", type: "percentage" },
        { key: "paymentDate", label: "首付款日期", type: "date" }
      ]
    },
    {
      id: "ip-ownership", category: "ip", title: "知识产权归属", riskWeight: 35,
      text: "交付成果的知识产权归{{ipOwner}}所有；是否允许披露开源组件：{{openSourceAllowed}}。",
      variables: [
        { key: "ipOwner", label: "知识产权权利人", type: "single", options: ["委托方", "服务方", "双方共有"] },
        { key: "openSourceAllowed", label: "允许披露开源组件", type: "boolean" }
      ]
    },
    {
      id: "confidentiality", category: "confidentiality", title: "保密义务", riskWeight: 12,
      text: "双方对履约中知悉的非公开信息承担保密义务，保密期至{{confidentialityEnd}}。",
      variables: [
        { key: "confidentialityEnd", label: "保密截止日期", type: "date" }
      ]
    },
    {
      id: "liability-cap", category: "liability", title: "责任上限", riskWeight: 28,
      text: "除故意或重大过失外，任一方累计赔偿责任不超过合同总价的{{liabilityCapRate}}。",
      variables: [
        { key: "liabilityCapRate", label: "责任上限比例", type: "percentage" }
      ],
      depends: [{ id: "payment", reason: DEPENDENCY_REASON }]
    },
    {
      id: "litigation", category: "dispute", title: "诉讼", riskWeight: 18,
      text: "因本合同产生的争议由{{jurisdiction}}有管辖权的人民法院诉讼解决。",
      variables: [{ key: "jurisdiction", label: "管辖地", type: "text" }],
      excludes: [{ id: "arbitration", reason: CONFLICT_REASON }]
    },
    {
      id: "arbitration", category: "dispute", title: "仲裁", riskWeight: 16,
      text: "因本合同产生的争议提交{{arbitrationCommission}}仲裁，裁决为终局。",
      variables: [{ key: "arbitrationCommission", label: "仲裁委员会", type: "text" }],
      excludes: [{ id: "litigation", reason: CONFLICT_REASON }]
    }
  ];

  function clauseById(id) {
    for (var i = 0; i < CLAUSES.length; i++) if (CLAUSES[i].id === id) return CLAUSES[i];
    return null;
  }

  function categoryById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  function createState(input) {
    input = input || {};
    var selected = [];
    (Array.isArray(input.selected) ? input.selected : []).forEach(function (id) {
      if (clauseById(id) && selected.indexOf(id) < 0) selected.push(id);
    });
    return {
      transaction: TRANSACTIONS.indexOf(input.transaction) >= 0 ? input.transaction : "",
      selected: selected,
      values: Object.assign({}, input.values || {})
    };
  }

  function hasValue(values, key) {
    if (!Object.prototype.hasOwnProperty.call(values || {}, key)) return false;
    var value = values[key];
    if (typeof value === "boolean") return true;
    return String(value === undefined || value === null ? "" : value).trim() !== "";
  }

  function formatVariable(type, value) {
    if (type === "amount" || type === "percentage") {
      var n = Number(value);
      if (!Number.isFinite(n)) return "";
      return n.toFixed(2) + (type === "percentage" ? "%" : "");
    }
    if (type === "number") {
      var count = Number(value);
      return Number.isFinite(count) ? String(count) : "";
    }
    if (type === "boolean") {
      if (value === true || value === "true" || value === "是") return "是";
      if (value === false || value === "false" || value === "否") return "否";
      return "";
    }
    return String(value === undefined || value === null ? "" : value).trim();
  }

  function variableTypes() {
    var found = {};
    CLAUSES.forEach(function (clause) {
      (clause.variables || []).forEach(function (variable) { found[variable.type] = true; });
    });
    return Object.keys(found).sort();
  }

  function pendingVariables(input) {
    var state = createState(input);
    var seen = {};
    var pending = [];
    state.selected.forEach(function (id) {
      var clause = clauseById(id);
      (clause.variables || []).forEach(function (variable) {
        if (!seen[variable.key] && !hasValue(state.values, variable.key)) {
          seen[variable.key] = true;
          pending.push(variable);
        }
      });
    });
    return pending;
  }

  function conflictReason(a, b) {
    var first = clauseById(a);
    var second = clauseById(b);
    var links = [];
    if (first) links = links.concat(first.excludes || []);
    if (second) links = links.concat(second.excludes || []);
    for (var i = 0; i < links.length; i++) {
      if (links[i].id === a || links[i].id === b) return links[i].reason;
    }
    return "";
  }

  function conflicts(input) {
    var state = createState(input);
    var out = [];
    for (var i = 0; i < state.selected.length; i++) {
      for (var j = i + 1; j < state.selected.length; j++) {
        var reason = conflictReason(state.selected[i], state.selected[j]);
        if (reason) out.push({ ids: [state.selected[i], state.selected[j]], reason: reason });
      }
    }
    return out;
  }

  function missingCriticalCategories(input) {
    var state = createState(input);
    var present = {};
    state.selected.forEach(function (id) {
      var clause = clauseById(id);
      if (clause) present[clause.category] = true;
    });
    return CATEGORIES.filter(function (category) { return category.critical && !present[category.id]; });
  }

  function clampRisk(value) {
    return Math.max(-100, Math.min(100, Number(value) || 0));
  }

  function calculateRisk(input) {
    var state = createState(input);
    if (!state.selected.length) {
      return { calculated: false, value: null, raw: null, weightSum: 0, missingCount: 0, conflictCount: 0 };
    }
    var weightSum = state.selected.reduce(function (sum, id) {
      var clause = clauseById(id);
      return sum + (clause ? clause.riskWeight : 0);
    }, 0);
    var missingCount = missingCriticalCategories(state).length;
    var conflictCount = conflicts(state).length;
    var raw = weightSum - 5 * missingCount - 2 * conflictCount;
    return {
      calculated: true,
      value: clampRisk(raw),
      raw: raw,
      weightSum: weightSum,
      missingCount: missingCount,
      conflictCount: conflictCount
    };
  }

  function availability(input, id) {
    var state = createState(input);
    if (state.selected.indexOf(id) >= 0) return { mutuallyExclusive: false, reason: "" };
    for (var i = 0; i < state.selected.length; i++) {
      var reason = conflictReason(state.selected[i], id);
      if (reason) return { mutuallyExclusive: true, reason: reason, withId: state.selected[i] };
    }
    return { mutuallyExclusive: false, reason: "" };
  }

  function selectClause(input, id) {
    var state = createState(input);
    var clause = clauseById(id);
    if (!clause) return { state: state, added: [], reasons: [], blocked: true };
    if (state.selected.indexOf(id) >= 0) return { state: state, added: [], reasons: [], blocked: false };
    var available = availability(state, id);
    if (available.mutuallyExclusive) {
      return {
        state: state,
        added: [],
        reasons: [{ type: "conflict", clauseId: id, reason: available.reason }],
        blocked: true
      };
    }
    state.selected.push(id);
    var added = [id];
    var reasons = [];
    (clause.depends || []).forEach(function (dependency) {
      if (state.selected.indexOf(dependency.id) < 0) {
        state.selected.push(dependency.id);
        added.push(dependency.id);
        reasons.push({ type: "dependency", clauseId: dependency.id, reason: dependency.reason });
      }
    });
    return { state: state, added: added, reasons: reasons, blocked: false };
  }

  function deselectClause(input, id) {
    var state = createState(input);
    state.selected = state.selected.filter(function (selectedId) { return selectedId !== id; });
    return state;
  }

  function setVariable(input, key, value) {
    var state = createState(input);
    state.values[key] = value;
    return state;
  }

  function renderClauseText(clause, values) {
    var variables = {};
    (clause.variables || []).forEach(function (variable) { variables[variable.key] = variable; });
    return clause.text.replace(/\{\{([^}]+)\}\}/g, function (_match, key) {
      var variable = variables[key];
      if (!variable || !hasValue(values, key)) return "〔待填：" + (variable ? variable.label : key) + "〕";
      return formatVariable(variable.type, values[key]) || "〔待填：" + variable.label + "〕";
    });
  }

  function assemble(input) {
    var state = createState(input);
    var selected = CLAUSES.filter(function (clause) { return state.selected.indexOf(clause.id) >= 0; });
    var lines = [];
    if (state.transaction) lines.push("交易类型：" + state.transaction);
    selected.forEach(function (clause, index) {
      if (lines.length) lines.push("");
      lines.push((index + 1) + ". " + clause.title);
      lines.push(renderClauseText(clause, state.values));
    });
    return {
      text: lines.join("\n"),
      selectedCount: selected.length,
      pendingCount: pendingVariables(state).length,
      risk: calculateRisk(state)
    };
  }

  function issues(input) {
    var state = createState(input);
    if (!state.selected.length) return [];
    var out = [];
    missingCriticalCategories(state).forEach(function (category) {
      out.push({ type: "missing-category", text: "缺失关键类目：" + category.label });
    });
    pendingVariables(state).forEach(function (variable) {
      out.push({ type: "placeholder", text: "未填占位符：" + variable.label });
    });
    conflicts(state).forEach(function (conflict) {
      out.push({ type: "conflict", text: "条款冲突：" + conflict.reason });
    });
    return out;
  }

  function runSelfTest() {
    var failures = [];
    function expect(name, ok) { if (!ok) failures.push({ name: name }); }
    var empty = assemble(createState());
    expect("首屏零选择且风险不计算", empty.selectedCount === 0 && empty.pendingCount === 0 && !empty.risk.calculated);
    var highIds = ["scope", "payment", "ip-ownership", "confidentiality", "liability-cap", "litigation"];
    expect("高权重组合上夹到 100", calculateRisk({ selected: highIds }).value === 100);
    expect("低权重与缺类目组合下夹到 -100", calculateRisk({ selected: ["unlimited-rework"] }).value === -100);
    var exclusion = availability({ selected: ["litigation"] }, "arbitration");
    expect("诉讼与仲裁互斥且有原因", exclusion.mutuallyExclusive && exclusion.reason.indexOf("不能同时选择") >= 0);
    var dependent = selectClause(createState(), "liability-cap");
    expect("责任上限连带加入费用条款且有原因", dependent.state.selected.indexOf("payment") >= 0 && dependent.reasons.length === 1 && !!dependent.reasons[0].reason);
    expect("金额保留两位小数", formatVariable("amount", 128000) === "128000.00");
    expect("百分比保留两位小数", formatVariable("percentage", 30) === "30.00%");
    expect("七种变量类型均覆盖", variableTypes().join(",") === ["amount", "boolean", "date", "number", "percentage", "single", "text"].join(","));
    return { total: 8, passed: 8 - failures.length, failures: failures };
  }

  var api = {
    TRANSACTIONS: TRANSACTIONS,
    CATEGORIES: CATEGORIES,
    CLAUSES: CLAUSES,
    CONFLICT_REASON: CONFLICT_REASON,
    DEPENDENCY_REASON: DEPENDENCY_REASON,
    clauseById: clauseById,
    categoryById: categoryById,
    createState: createState,
    hasValue: hasValue,
    formatVariable: formatVariable,
    variableTypes: variableTypes,
    pendingVariables: pendingVariables,
    conflicts: conflicts,
    missingCriticalCategories: missingCriticalCategories,
    clampRisk: clampRisk,
    calculateRisk: calculateRisk,
    availability: availability,
    selectClause: selectClause,
    deselectClause: deselectClause,
    setVariable: setVariable,
    renderClauseText: renderClauseText,
    assemble: assemble,
    issues: issues,
    runSelfTest: runSelfTest
  };
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.ContractAssemblyEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
