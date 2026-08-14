/* 关系图 · 纯数据内核。页面与 node 探针加载同一份字节。 */
(function (root) {
  "use strict";

  var PERSON = "person";
  var ORGANIZATION = "organization";
  var EVENT = "event";
  var MAX_NODES = 120;

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nodeMap(nodes) {
    var map = Object.create(null);
    (nodes || []).forEach(function (node) { map[node.id] = node; });
    return map;
  }

  function validDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function validateGraph(nodes, edges) {
    var errors = [];
    var ids = Object.create(null);
    var labels = Object.create(null);
    if ((nodes || []).length > MAX_NODES) errors.push("节点超过 " + MAX_NODES + " 个上限");
    (nodes || []).forEach(function (node, index) {
      var id = String((node && node.id) || "").trim();
      var label = String((node && node.label) || "").trim();
      if (!id) errors.push("第 " + (index + 1) + " 个节点缺少 id");
      else if (ids[id]) errors.push("节点 id 重复：" + id);
      else ids[id] = true;
      if (!label) errors.push("第 " + (index + 1) + " 个节点缺少名称");
      else if (labels[label]) errors.push("节点名称重复：" + label);
      else labels[label] = true;
      if (node && [PERSON, ORGANIZATION, EVENT].indexOf(node.type) < 0) {
        errors.push("节点类型无效：" + (id || index + 1));
      }
    });
    var edgeKeys = Object.create(null);
    (edges || []).forEach(function (edge, index) {
      if (!edge || !ids[edge.from] || !ids[edge.to]) errors.push("第 " + (index + 1) + " 条关系缺少有效端点");
      if (edge && edge.from === edge.to) errors.push("关系不能连接节点自身：" + edge.from);
      if (!String((edge && edge.label) || "").trim()) errors.push("第 " + (index + 1) + " 条关系缺少名称");
      if (!validDate(edge && edge.date)) errors.push("第 " + (index + 1) + " 条关系日期无效");
      if (edge) {
        var key = [edge.from, edge.label, edge.to, edge.date].join("\u0000");
        if (edgeKeys[key]) errors.push("关系重复：" + edge.from + " → " + edge.to);
        edgeKeys[key] = true;
      }
    });
    return errors;
  }

  function typeFromLabel(label) {
    return { "人物": PERSON, "组织": ORGANIZATION, "事件": EVENT }[label] || null;
  }

  function endpoint(text, nodes) {
    var value = String(text || "").trim();
    var match = value.match(/^(.+?)(?:[（(](人物|组织|事件)[）)])?$/);
    if (!match || !match[1].trim()) return { error: "关系端点不能为空。" };
    var label = match[1].trim();
    var requestedType = typeFromLabel(match[2]);
    var found = (nodes || []).filter(function (node) { return node.label === label; })[0];
    if (found) {
      if (requestedType && found.type !== requestedType) return { error: "“" + label + "”的类型与现有节点冲突。" };
      return { node: found, existing: true };
    }
    if (!requestedType) return { error: "新节点“" + label + "”须标明（人物）、（组织）或（事件）。" };
    return { node: { id: "", label: label, type: requestedType }, existing: false };
  }

  function nextNodeId(nodes) {
    var number = (nodes || []).length + 1;
    var id = "node-" + number;
    while ((nodes || []).some(function (node) { return node.id === id; })) {
      number++;
      id = "node-" + number;
    }
    return id;
  }

  function addRelationLine(nodes, edges, input) {
    var parts = String(input || "").split(/[｜|]/).map(function (part) { return part.trim(); });
    if (parts.length !== 4) return { error: "请按“谁｜关系｜谁｜YYYY-MM-DD”写成四段。" };
    if (!parts[1]) return { error: "具体关系不能为空。" };
    if (!validDate(parts[3])) return { error: "日期须为真实的 YYYY-MM-DD。" };

    var nextNodes = copy(nodes || []);
    var nextEdges = copy(edges || []);
    var fromResult = endpoint(parts[0], nextNodes);
    if (fromResult.error) return { error: fromResult.error };
    if (!fromResult.existing) {
      if (nextNodes.length >= MAX_NODES) return { error: "已到 " + MAX_NODES + " 个节点上限；请先精简关系图。" };
      fromResult.node.id = nextNodeId(nextNodes);
      nextNodes.push(fromResult.node);
    }
    var toResult = endpoint(parts[2], nextNodes);
    if (toResult.error) return { error: toResult.error };
    if (!toResult.existing) {
      if (nextNodes.length >= MAX_NODES) return { error: "已到 " + MAX_NODES + " 个节点上限；请先精简关系图。" };
      toResult.node.id = nextNodeId(nextNodes);
      nextNodes.push(toResult.node);
    }
    if (fromResult.node.id === toResult.node.id) return { error: "关系的两端不能是同一个节点。" };

    var edge = { from: fromResult.node.id, to: toResult.node.id, label: parts[1], date: parts[3] };
    if (nextEdges.some(function (item) {
      return item.from === edge.from && item.to === edge.to && item.label === edge.label && item.date === edge.date;
    })) return { error: "这条同方向、同关系、同日期的记录已经存在。" };
    nextEdges.push(edge);
    return {
      nodes: nextNodes,
      edges: nextEdges,
      edge: edge,
      addedNodeIds: [fromResult, toResult].filter(function (item) { return !item.existing; }).map(function (item) { return item.node.id; })
    };
  }

  function degrees(nodes, edges) {
    var result = Object.create(null);
    (nodes || []).forEach(function (node) { result[node.id] = { in: 0, out: 0, total: 0 }; });
    (edges || []).forEach(function (edge) {
      if (!result[edge.from] || !result[edge.to]) return;
      result[edge.from].out++;
      result[edge.to].in++;
      result[edge.from].total++;
      result[edge.to].total++;
    });
    return result;
  }

  function weakNeighbors(nodes, edges) {
    var next = Object.create(null);
    (nodes || []).forEach(function (node) { next[node.id] = []; });
    (edges || []).forEach(function (edge) {
      if (!next[edge.from] || !next[edge.to]) return;
      next[edge.from].push(edge.to);
      next[edge.to].push(edge.from);
    });
    Object.keys(next).forEach(function (id) {
      next[id] = next[id].filter(function (value, index, all) { return all.indexOf(value) === index; }).sort();
    });
    return next;
  }

  function weakComponents(nodes, edges) {
    var next = weakNeighbors(nodes, edges);
    var unseen = Object.create(null);
    (nodes || []).forEach(function (node) { unseen[node.id] = true; });
    var components = [];
    Object.keys(unseen).sort().forEach(function (start) {
      if (!unseen[start]) return;
      var queue = [start];
      var component = [];
      delete unseen[start];
      while (queue.length) {
        var id = queue.shift();
        component.push(id);
        next[id].forEach(function (to) {
          if (unseen[to]) { delete unseen[to]; queue.push(to); }
        });
      }
      components.push(component.sort());
    });
    return components;
  }

  function undirectedPairs(nodes, edges) {
    var map = nodeMap(nodes);
    var pairs = Object.create(null);
    (edges || []).forEach(function (edge) {
      if (!map[edge.from] || !map[edge.to] || edge.from === edge.to) return;
      var ids = [edge.from, edge.to].sort();
      pairs[ids[0] + "\u0000" + ids[1]] = true;
    });
    return Object.keys(pairs);
  }

  function directedDensity(nodes, edges) {
    var count = (nodes || []).length;
    return count < 2 ? 0 : (edges || []).length / (count * (count - 1));
  }

  function undirectedDensity(nodes, edges) {
    var count = (nodes || []).length;
    return count < 2 ? 0 : undirectedPairs(nodes, edges).length / (count * (count - 1) / 2);
  }

  function cycleRank(nodes, edges) {
    var count = (nodes || []).length;
    if (!count) return 0;
    return Math.max(0, undirectedPairs(nodes, edges).length - count + weakComponents(nodes, edges).length);
  }

  function shortestPath(nodes, edges, start, end) {
    var map = nodeMap(nodes);
    if (!map[start] || !map[end]) return null;
    var next = weakNeighbors(nodes, edges);
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
    return {
      length: ids.length - 1,
      intermediaries: Math.max(0, ids.length - 2),
      ids: ids,
      labels: ids.map(function (id) { return map[id].label; })
    };
  }

  function relationshipLevels(nodes, edges) {
    var next = weakNeighbors(nodes, edges);
    var degree = degrees(nodes, edges);
    var levels = Object.create(null);
    var offset = 0;
    weakComponents(nodes, edges).forEach(function (component) {
      var rootId = component.slice().sort(function (a, b) {
        return degree[b].total - degree[a].total || a.localeCompare(b);
      })[0];
      var queue = [rootId];
      var depth = Object.create(null);
      depth[rootId] = 0;
      var maxDepth = 0;
      while (queue.length) {
        var id = queue.shift();
        next[id].forEach(function (to) {
          if (!Object.prototype.hasOwnProperty.call(depth, to)) {
            depth[to] = depth[id] + 1;
            maxDepth = Math.max(maxDepth, depth[to]);
            queue.push(to);
          }
        });
      }
      component.forEach(function (id) { levels[id] = offset + depth[id]; });
      offset += maxDepth + 2;
    });
    return levels;
  }

  /* 与概念图谱复制同一份确定性分层坐标数学；闭包之间不跨目录引用。 */
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

  function analyze(nodes, edges) {
    var degree = degrees(nodes, edges);
    var maxDegree = 0;
    Object.keys(degree).forEach(function (id) { maxDegree = Math.max(maxDegree, degree[id].total); });
    var components = weakComponents(nodes, edges);
    var levels = relationshipLevels(nodes, edges);
    return {
      nodeCount: (nodes || []).length,
      edgeCount: (edges || []).length,
      degrees: degree,
      maxDegree: maxDegree,
      components: components,
      componentCount: components.length,
      cycleRank: cycleRank(nodes, edges),
      directedDensity: directedDensity(nodes, edges),
      undirectedDensity: undirectedDensity(nodes, edges),
      levels: levels,
      layout: layoutGraph(nodes, edges, levels, 900)
    };
  }

  var DEFAULT_NODES = [
    { id: "nasa", label: "美国国家航空航天局", type: ORGANIZATION },
    { id: "apollo11", label: "阿波罗11号任务", type: EVENT },
    { id: "armstrong", label: "尼尔·阿姆斯特朗", type: PERSON },
    { id: "aldrin", label: "巴兹·奥尔德林", type: PERSON },
    { id: "collins", label: "迈克尔·柯林斯", type: PERSON },
    { id: "landing", label: "人类首次登月", type: EVENT },
    { id: "nixon", label: "理查德·尼克松", type: PERSON }
  ];

  var DEFAULT_EDGES = [
    { from: "nasa", to: "apollo11", label: "组织", date: "1969-07-16" },
    { from: "apollo11", to: "armstrong", label: "任务指挥官", date: "1969-07-16" },
    { from: "apollo11", to: "aldrin", label: "登月舱驾驶员", date: "1969-07-16" },
    { from: "apollo11", to: "collins", label: "指令舱驾驶员", date: "1969-07-16" },
    { from: "armstrong", to: "landing", label: "参与", date: "1969-07-20" },
    { from: "aldrin", to: "landing", label: "参与", date: "1969-07-20" },
    { from: "nixon", to: "armstrong", label: "通话", date: "1969-07-20" },
    { from: "nixon", to: "aldrin", label: "通话", date: "1969-07-20" }
  ];

  function defaultGraph() {
    return { nodes: copy(DEFAULT_NODES), edges: copy(DEFAULT_EDGES) };
  }

  var CASES = [
    ["默认样例为 7 节点 8 关系", function () { var a = analyze(DEFAULT_NODES, DEFAULT_EDGES); return a.nodeCount === 7 && a.edgeCount === 8; }],
    ["有向密度为 8/(7×6)", function () { return Math.abs(directedDensity(DEFAULT_NODES, DEFAULT_EDGES) - 8 / 42) < 1e-12; }],
    ["默认最大度数 4、弱连通分量 1、独立环 2", function () { var a = analyze(DEFAULT_NODES, DEFAULT_EDGES); return a.maxDegree === 4 && a.componentCount === 1 && a.cycleRank === 2; }],
    ["柯林斯到尼克松为 3 条关系、2 个中介", function () { var p = shortestPath(DEFAULT_NODES, DEFAULT_EDGES, "collins", "nixon"); return p.length === 3 && p.intermediaries === 2; }],
    ["一行关系能复用 NASA 并新增一个组织节点", function () { var r = addRelationLine(DEFAULT_NODES, DEFAULT_EDGES, "美国国家航空航天局｜设立｜载人航天中心（组织）｜1961-11-01"); return !r.error && r.nodes.length === 8 && r.edges.length === 9 && r.addedNodeIds.length === 1; }],
    ["无效日期与缺类型的新节点被拒绝", function () { return !!addRelationLine([], [], "甲（人物）｜会见｜乙（人物）｜2025-02-30").error && !!addRelationLine([], [], "甲｜会见｜乙｜2025-02-20").error; }],
    ["同输入布局逐坐标完全相同", function () { var a = analyze(DEFAULT_NODES, DEFAULT_EDGES).layout; var b = analyze(DEFAULT_NODES, DEFAULT_EDGES).layout; return JSON.stringify(a) === JSON.stringify(b); }]
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
    PERSON: PERSON,
    ORGANIZATION: ORGANIZATION,
    EVENT: EVENT,
    MAX_NODES: MAX_NODES,
    DEFAULT_NODES: DEFAULT_NODES,
    DEFAULT_EDGES: DEFAULT_EDGES,
    CASES: CASES,
    copy: copy,
    defaultGraph: defaultGraph,
    validDate: validDate,
    validateGraph: validateGraph,
    addRelationLine: addRelationLine,
    degrees: degrees,
    weakComponents: weakComponents,
    undirectedPairs: undirectedPairs,
    directedDensity: directedDensity,
    undirectedDensity: undirectedDensity,
    cycleRank: cycleRank,
    shortestPath: shortestPath,
    relationshipLevels: relationshipLevels,
    layoutGraph: layoutGraph,
    analyze: analyze,
    runSelfTest: runSelfTest
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RelationshipGraphEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
