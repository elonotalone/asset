/* 概念图谱 · 纯数据内核。页面与 node 探针加载同一份字节。 */
(function (root) {
  "use strict";

  var REQUIRED = "required";
  var RELATED = "related";
  var THRESHOLD_MIN = 0.50;
  var THRESHOLD_MAX = 0.95;
  var HALF_LIFE_DAYS = 21;

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeThreshold(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0.80;
    return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, n));
  }

  function decayedMastery(mastery, days, halfLife) {
    var m = Math.max(0, Math.min(1, Number(mastery) || 0));
    var d = Math.max(0, Number(days) || 0);
    var h = Number(halfLife) > 0 ? Number(halfLife) : HALF_LIFE_DAYS;
    return m * Math.pow(0.5, d / h);
  }

  function dailyDecayRate(halfLife) {
    var h = Number(halfLife) > 0 ? Number(halfLife) : HALF_LIFE_DAYS;
    return 1 - Math.pow(0.5, 1 / h);
  }

  function nodeMap(nodes) {
    var map = Object.create(null);
    (nodes || []).forEach(function (node) { map[node.id] = node; });
    return map;
  }

  function requiredEdges(nodes, edges) {
    var map = nodeMap(nodes);
    return (edges || []).filter(function (edge) {
      return edge.kind === REQUIRED && map[edge.from] && map[edge.to];
    });
  }

  function validateGraph(nodes, edges) {
    var errors = [];
    var ids = Object.create(null);
    (nodes || []).forEach(function (node, index) {
      if (!node || !String(node.id || "").trim()) errors.push("第 " + (index + 1) + " 个概念缺少 id");
      else if (ids[node.id]) errors.push("概念 id 重复：" + node.id);
      else ids[node.id] = true;
      if (!String((node && node.label) || "").trim()) errors.push("第 " + (index + 1) + " 个概念缺少名称");
      if (!(Number(node && node.minutes) > 0)) errors.push("概念学习分钟必须为正数：" + ((node && node.id) || index + 1));
      if (!isFinite(Number(node && node.mastery))) errors.push("概念掌握度不是数字：" + ((node && node.id) || index + 1));
    });
    var edgeKeys = Object.create(null);
    (edges || []).forEach(function (edge, index) {
      if (!edge || !ids[edge.from] || !ids[edge.to]) errors.push("第 " + (index + 1) + " 条关系缺少有效端点");
      if (edge && edge.kind !== REQUIRED && edge.kind !== RELATED) errors.push("第 " + (index + 1) + " 条关系类型无效");
      if (edge) {
        var key = edge.from + "\u0000" + edge.kind + "\u0000" + edge.to;
        if (edgeKeys[key]) errors.push("关系重复：" + edge.from + " → " + edge.to);
        edgeKeys[key] = true;
      }
    });
    return errors;
  }

  /** Kahn 分层：每轮全部零入度节点构成一层。只让必修边进入学习顺序。 */
  function kahnLayers(nodes, edges) {
    var sorted = (nodes || []).slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    var indegree = Object.create(null);
    var next = Object.create(null);
    sorted.forEach(function (node) { indegree[node.id] = 0; next[node.id] = []; });
    requiredEdges(sorted, edges).forEach(function (edge) {
      indegree[edge.to]++;
      next[edge.from].push(edge.to);
    });
    Object.keys(next).forEach(function (id) { next[id].sort(); });

    var remaining = Object.create(null);
    sorted.forEach(function (node) { remaining[node.id] = true; });
    var layers = [];
    var levelById = Object.create(null);
    while (true) {
      var layer = Object.keys(remaining).filter(function (id) { return indegree[id] === 0; }).sort();
      if (!layer.length) break;
      var level = layers.length;
      layers.push(layer);
      layer.forEach(function (id) {
        levelById[id] = level;
        delete remaining[id];
        next[id].forEach(function (to) { indegree[to]--; });
      });
    }
    var cycleNodes = Object.keys(remaining).sort();
    return {
      layers: layers,
      levelById: levelById,
      cycleNodes: cycleNodes,
      acyclic: cycleNodes.length === 0
    };
  }

  function learningAnalysis(nodes, edges, threshold) {
    var t = normalizeThreshold(threshold);
    var order = kahnLayers(nodes, edges);
    var incoming = Object.create(null);
    (nodes || []).forEach(function (node) { incoming[node.id] = []; });
    requiredEdges(nodes, edges).forEach(function (edge) { incoming[edge.to].push(edge.from); });
    Object.keys(incoming).forEach(function (id) { incoming[id].sort(); });
    var map = nodeMap(nodes);
    var effective = Object.create(null);
    (nodes || []).forEach(function (node) {
      effective[node.id] = decayedMastery(node.mastery, node.daysSinceReview, HALF_LIFE_DAYS);
    });

    var states = (nodes || []).map(function (node) {
      var prerequisites = incoming[node.id] || [];
      var prerequisitesReady = prerequisites.every(function (id) { return effective[id] >= t; });
      var wasMastered = Number(node.mastery) >= t;
      var status;
      if (wasMastered && (effective[node.id] < t || !prerequisitesReady)) status = "review";
      else if (effective[node.id] >= t && prerequisitesReady) status = "mastered";
      else if (prerequisitesReady) status = "learnable";
      else status = "locked";
      return {
        id: node.id,
        label: node.label,
        level: Object.prototype.hasOwnProperty.call(order.levelById, node.id) ? order.levelById[node.id] : null,
        effectiveMastery: effective[node.id],
        prerequisites: prerequisites,
        prerequisitesReady: prerequisitesReady,
        status: status,
        minutes: Number(node.minutes)
      };
    });
    return { threshold: t, order: order, states: states, nodeById: map };
  }

  function criticalPath(nodes, edges) {
    var order = kahnLayers(nodes, edges);
    if (!order.acyclic || !nodes || nodes.length === 0) return null;
    var map = nodeMap(nodes);
    var next = Object.create(null);
    nodes.forEach(function (node) { next[node.id] = []; });
    requiredEdges(nodes, edges).forEach(function (edge) { next[edge.from].push(edge.to); });
    Object.keys(next).forEach(function (id) { next[id].sort(); });
    var best = Object.create(null);
    var prev = Object.create(null);
    nodes.forEach(function (node) { best[node.id] = Number(node.minutes); prev[node.id] = null; });
    order.layers.forEach(function (layer) {
      layer.forEach(function (id) {
        next[id].forEach(function (to) {
          var candidate = best[id] + Number(map[to].minutes);
          if (candidate > best[to] || (candidate === best[to] && String(id) < String(prev[to] || "~"))) {
            best[to] = candidate;
            prev[to] = id;
          }
        });
      });
    });
    var end = nodes.map(function (n) { return n.id; }).sort()[0];
    nodes.forEach(function (node) {
      if (best[node.id] > best[end] || (best[node.id] === best[end] && node.id < end)) end = node.id;
    });
    var ids = [];
    for (var at = end; at !== null; at = prev[at]) ids.unshift(at);
    return { minutes: best[end], ids: ids, labels: ids.map(function (id) { return map[id].label; }) };
  }

  /** 最短路径默认尊重边的方向；关系图内核复制同一套 BFS 与布局数学。 */
  function shortestPath(nodes, edges, start, end, undirected) {
    var map = nodeMap(nodes);
    if (!map[start] || !map[end]) return null;
    var next = Object.create(null);
    nodes.forEach(function (node) { next[node.id] = []; });
    (edges || []).forEach(function (edge) {
      if (!map[edge.from] || !map[edge.to]) return;
      next[edge.from].push(edge.to);
      if (undirected) next[edge.to].push(edge.from);
    });
    Object.keys(next).forEach(function (id) {
      next[id] = next[id].filter(function (value, index, all) { return all.indexOf(value) === index; }).sort();
    });
    var queue = [start];
    var seen = Object.create(null);
    var prev = Object.create(null);
    seen[start] = true;
    prev[start] = null;
    while (queue.length) {
      var id = queue.shift();
      if (id === end) break;
      next[id].forEach(function (to) {
        if (!seen[to]) { seen[to] = true; prev[to] = id; queue.push(to); }
      });
    }
    if (!seen[end]) return null;
    var ids = [];
    for (var at = end; at !== null; at = prev[at]) ids.unshift(at);
    return { length: ids.length - 1, ids: ids, labels: ids.map(function (id) { return map[id].label; }) };
  }

  function degrees(nodes, edges) {
    var out = Object.create(null);
    (nodes || []).forEach(function (node) { out[node.id] = { in: 0, out: 0, total: 0 }; });
    (edges || []).forEach(function (edge) {
      if (!out[edge.from] || !out[edge.to]) return;
      out[edge.from].out++;
      out[edge.to].in++;
      out[edge.from].total++;
      out[edge.to].total++;
    });
    return out;
  }

  /**
   * 确定性分层坐标：横轴是层，层内按 id 排序后等距排布。
   * 没有随机初值；高度随最拥挤层增长，固定 88px 间距避免节点重叠。
   */
  function layoutGraph(nodes, edges, levelById, width) {
    var w = Number(width) || 900;
    var levels = Object.create(null);
    var known = [];
    (nodes || []).forEach(function (node) {
      var level = levelById && Object.prototype.hasOwnProperty.call(levelById, node.id)
        ? Number(levelById[node.id]) : 0;
      if (!isFinite(level) || level < 0) level = 0;
      if (!levels[level]) { levels[level] = []; known.push(level); }
      levels[level].push(node.id);
    });
    known.sort(function (a, b) { return a - b; });
    var maxLevel = known.length ? known[known.length - 1] : 0;
    var maxCount = 1;
    known.forEach(function (level) {
      levels[level].sort();
      maxCount = Math.max(maxCount, levels[level].length);
    });
    var height = Math.max(360, maxCount * 88 + 72);
    var marginX = 78;
    var positions = Object.create(null);
    known.forEach(function (level) {
      var group = levels[level];
      var x = maxLevel === 0 ? w / 2 : marginX + level * ((w - marginX * 2) / maxLevel);
      group.forEach(function (id, index) {
        positions[id] = { x: x, y: (index + 1) * height / (group.length + 1), level: level };
      });
    });
    return { width: w, height: height, positions: positions };
  }

  function analyze(nodes, edges, threshold) {
    var learning = learningAnalysis(nodes, edges, threshold);
    var fallbackLevel = learning.order.layers.length;
    var levels = Object.create(null);
    Object.keys(learning.order.levelById).forEach(function (id) { levels[id] = learning.order.levelById[id]; });
    learning.order.cycleNodes.forEach(function (id) { levels[id] = fallbackLevel; });
    return {
      learning: learning,
      critical: criticalPath(nodes, edges),
      degrees: degrees(nodes, edges),
      layout: layoutGraph(nodes, edges, levels, 900)
    };
  }

  var DEFAULT_NODES = [
    { id: "magnetic-field", label: "磁场", minutes: 30, mastery: 0.96, daysSinceReview: 1 },
    { id: "magnetic-flux", label: "磁通量", minutes: 45, mastery: 0.94, daysSinceReview: 2 },
    { id: "faraday-law", label: "法拉第电磁感应定律", minutes: 55, mastery: 0.62, daysSinceReview: 1 },
    { id: "lenz-law", label: "楞次定律", minutes: 40, mastery: 0.85, daysSinceReview: 30 },
    { id: "self-induction", label: "自感", minutes: 60, mastery: 0.86, daysSinceReview: 1 },
    { id: "mutual-induction", label: "相互感应", minutes: 50, mastery: 0.40, daysSinceReview: 2 },
    { id: "transformer", label: "变压器原理", minutes: 70, mastery: 0.20, daysSinceReview: 0 }
  ];

  var DEFAULT_EDGES = [
    { from: "magnetic-field", to: "magnetic-flux", kind: REQUIRED, label: "必修先修" },
    { from: "magnetic-flux", to: "faraday-law", kind: REQUIRED, label: "必修先修" },
    { from: "faraday-law", to: "lenz-law", kind: REQUIRED, label: "必修先修" },
    { from: "lenz-law", to: "self-induction", kind: REQUIRED, label: "必修先修" },
    { from: "self-induction", to: "mutual-induction", kind: REQUIRED, label: "必修先修" },
    { from: "mutual-induction", to: "transformer", kind: REQUIRED, label: "必修先修" },
    { from: "magnetic-field", to: "self-induction", kind: RELATED, label: "相关" },
    { from: "faraday-law", to: "transformer", kind: RELATED, label: "相关" }
  ];

  function defaultGraph() {
    return { nodes: copy(DEFAULT_NODES), edges: copy(DEFAULT_EDGES), threshold: 0.80 };
  }

  var CASES = [
    ["21 天后掌握度恰好减半", function () { return Math.abs(decayedMastery(0.8, 21) - 0.4) < 1e-12; }],
    ["日衰减率约 0.0325", function () { return Math.abs(dailyDecayRate(21) - 0.032468) < 0.00001; }],
    ["默认必修链分成 7 层", function () { return kahnLayers(DEFAULT_NODES, DEFAULT_EDGES).layers.length === 7; }],
    ["相关边不改变 7 层学习顺序", function () { return kahnLayers(DEFAULT_NODES, DEFAULT_EDGES.concat([{ from: "transformer", to: "magnetic-field", kind: RELATED }])).layers.length === 7; }],
    ["循环先修被识别", function () { return !kahnLayers([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b", kind: REQUIRED }, { from: "b", to: "a", kind: REQUIRED }]).acyclic; }],
    ["默认关键路径为 350 分钟", function () { return criticalPath(DEFAULT_NODES, DEFAULT_EDGES).minutes === 350; }],
    ["磁场到变压器原理最短有向路径为 3 条边（含相关边）", function () { return shortestPath(DEFAULT_NODES, DEFAULT_EDGES, "magnetic-field", "transformer").length === 3; }],
    ["只看必修链时路径为 6 条边", function () { return shortestPath(DEFAULT_NODES, requiredEdges(DEFAULT_NODES, DEFAULT_EDGES), "magnetic-field", "transformer").length === 6; }],
    ["法拉第定律前驱已达阈值，因此当前可学", function () { return learningAnalysis(DEFAULT_NODES, DEFAULT_EDGES, 0.8).states.filter(function (s) { return s.id === "faraday-law"; })[0].status === "learnable"; }],
    ["自感因前驱回落标成待复习", function () { return learningAnalysis(DEFAULT_NODES, DEFAULT_EDGES, 0.8).states.filter(function (s) { return s.id === "self-induction"; })[0].status === "review"; }],
    ["同输入布局逐坐标完全相同", function () { var a = analyze(DEFAULT_NODES, DEFAULT_EDGES, 0.8).layout; var b = analyze(DEFAULT_NODES, DEFAULT_EDGES, 0.8).layout; return JSON.stringify(a) === JSON.stringify(b); }],
    ["坏图会报告重复 id 与缺端点边", function () { return validateGraph([{ id: "a", label: "A", minutes: 1, mastery: 0 }, { id: "a", label: "B", minutes: 1, mastery: 0 }], [{ from: "a", to: "missing", kind: REQUIRED }]).length >= 2; }]
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (item) {
      try { if (!item[1]()) failures.push({ name: item[0], why: "返回 false" }); }
      catch (error) { failures.push({ name: item[0], why: String(error && error.message || error) }); }
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    REQUIRED: REQUIRED,
    RELATED: RELATED,
    THRESHOLD_MIN: THRESHOLD_MIN,
    THRESHOLD_MAX: THRESHOLD_MAX,
    HALF_LIFE_DAYS: HALF_LIFE_DAYS,
    DEFAULT_NODES: DEFAULT_NODES,
    DEFAULT_EDGES: DEFAULT_EDGES,
    CASES: CASES,
    copy: copy,
    defaultGraph: defaultGraph,
    normalizeThreshold: normalizeThreshold,
    decayedMastery: decayedMastery,
    dailyDecayRate: dailyDecayRate,
    validateGraph: validateGraph,
    requiredEdges: requiredEdges,
    kahnLayers: kahnLayers,
    learningAnalysis: learningAnalysis,
    criticalPath: criticalPath,
    shortestPath: shortestPath,
    degrees: degrees,
    layoutGraph: layoutGraph,
    analyze: analyze,
    runSelfTest: runSelfTest
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ConceptGraphEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
