(function (root) {
  "use strict";

  var CHARACTERS_PER_SECOND = 3.6;

  function nodeList(graph) {
    return graph && Array.isArray(graph.nodes) ? graph.nodes : [];
  }

  function edgeList(graph) {
    return graph && Array.isArray(graph.edges) ? graph.edges : [];
  }

  function findNode(graph, id) {
    var nodes = nodeList(graph);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  function outgoing(graph, id) {
    return edgeList(graph).filter(function (edge) {
      return edge && edge.from === id && findNode(graph, edge.to);
    });
  }

  function reachableIds(graph) {
    if (!graph || !findNode(graph, graph.startId)) return [];
    var seen = {};
    var queue = [graph.startId];
    seen[graph.startId] = true;
    while (queue.length) {
      var id = queue.shift();
      outgoing(graph, id).forEach(function (edge) {
        if (!seen[edge.to]) {
          seen[edge.to] = true;
          queue.push(edge.to);
        }
      });
    }
    return Object.keys(seen);
  }

  function depthFrom(graph, id, path) {
    path = path || {};
    if (path[id]) return 0;
    var nextPath = {};
    Object.keys(path).forEach(function (key) { nextPath[key] = true; });
    nextPath[id] = true;
    var best = 1;
    outgoing(graph, id).forEach(function (edge) {
      if (edge.kind === "return" || nextPath[edge.to]) return;
      best = Math.max(best, 1 + depthFrom(graph, edge.to, nextPath));
    });
    return best;
  }

  function analyzeGraph(graph) {
    var nodes = nodeList(graph);
    var start = graph && findNode(graph, graph.startId);
    if (!start) {
      return {
        coverageCalculated: false,
        deadEnds: [],
        unreachable: [],
        reachable: [],
        maxDepth: 0,
        warnings: []
      };
    }

    var reachable = reachableIds(graph);
    var reachableSet = {};
    reachable.forEach(function (id) { reachableSet[id] = true; });
    var deadEnds = nodes.filter(function (node) {
      return node && !node.ending && outgoing(graph, node.id).length === 0;
    });
    var unreachable = nodes.filter(function (node) {
      return node && !reachableSet[node.id];
    });
    var warnings = [];
    deadEnds.forEach(function (node) { warnings.push("死端：" + node.name); });
    unreachable.forEach(function (node) { warnings.push("不可达：" + node.name); });

    return {
      coverageCalculated: true,
      deadEnds: deadEnds,
      unreachable: unreachable,
      reachable: reachable.map(function (id) { return findNode(graph, id); }),
      maxDepth: depthFrom(graph, graph.startId, {}),
      warnings: warnings
    };
  }

  function contextValue(context, field) {
    if (!context || !field) return undefined;
    var parts = String(field).split(".");
    var value = context;
    for (var i = 0; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  function matchesCondition(condition, context) {
    if (!condition || !condition.field) return true;
    var actual = contextValue(context, condition.field);
    var expected = condition.value;
    var op = condition.operator || "equals";
    if (op === "exists") return actual !== undefined && actual !== null && String(actual) !== "";
    if (op === "notEquals") return String(actual) !== String(expected);
    if (op === "includes") return String(actual || "").indexOf(String(expected || "")) >= 0;
    if (op === "startsWith") return String(actual || "").indexOf(String(expected || "")) === 0;
    return String(actual) === String(expected);
  }

  function priorityOf(edge) {
    var n = Number(edge && edge.priority);
    return isFinite(n) && n > 0 ? n : 999999;
  }

  function selectNext(graph, fromId, context) {
    var edges = outgoing(graph, fromId).filter(function (edge) { return edge.kind !== "return"; });
    edges.sort(function (a, b) { return priorityOf(a) - priorityOf(b); });
    for (var i = 0; i < edges.length; i++) {
      if (!edges[i].fallback && matchesCondition(edges[i].condition, context || {})) return edges[i];
    }
    for (var j = 0; j < edges.length; j++) {
      if (edges[j].fallback) return edges[j];
    }
    return null;
  }

  function countSpokenCharacters(text) {
    var matches = String(text || "").match(/[\u3400-\u9fffA-Za-z0-9]/g);
    return matches ? matches.length : 0;
  }

  function estimatePath(graph, ids) {
    var characters = 0;
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      var node = findNode(graph, id);
      if (node) characters += countSpokenCharacters(node.text);
    });
    return { characters: characters, seconds: characters / CHARACTERS_PER_SECOND };
  }

  function edgeRule(edge) {
    if (edge.kind === "return") return "澄清回边（不增加最大深度）";
    if (edge.fallback) return "兜底";
    if (edge.condition && edge.condition.value) {
      return "回应包含“" + edge.condition.value + "” · 优先级 " + priorityOf(edge);
    }
    return "直接进入 · 优先级 " + priorityOf(edge);
  }

  function exportScript(graph) {
    var start = graph && findNode(graph, graph.startId);
    if (!start) return "先写下开场白，这里会同步长出可手动选中的话术文本。";
    var analysis = analyzeGraph(graph);
    var lines = ["话术分支", "开场：" + start.text, ""];
    lines.push("节点");
    nodeList(graph).forEach(function (node) {
      lines.push("- [" + node.name + "] " + node.text + (node.ending ? "（结束）" : ""));
    });
    if (edgeList(graph).length) {
      lines.push("", "关系");
      edgeList(graph).forEach(function (edge) {
        var from = findNode(graph, edge.from);
        var to = findNode(graph, edge.to);
        if (from && to) lines.push("- " + from.name + " → " + to.name + "｜" + edgeRule(edge));
      });
    }
    lines.push("", "覆盖检查");
    lines.push("- 最大对话深度：" + analysis.maxDepth + " 层（澄清回边不增层）");
    if (analysis.warnings.length) {
      analysis.warnings.forEach(function (warning) { lines.push("- " + warning); });
    } else {
      lines.push("- 没有死端或不可达节点");
    }
    var path = estimatePath(graph, analysis.reachable.map(function (node) { return node.id; }));
    lines.push("- 可达节点口播估时：" + path.characters + " 字 ÷ 3.6 ≈ " + path.seconds.toFixed(1) + " 秒");
    return lines.join("\n");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  var DEMO = {
    startId: "opening",
    nodes: [
      { id: "opening", name: "开场", speaker: "我方", text: "我们先把你最担心的结果说清楚。", ending: false },
      { id: "need", name: "确认顾虑", speaker: "对方", text: "我担心换方案以后团队来不及适应。", ending: false },
      { id: "clarify", name: "澄清期限", speaker: "我方", text: "你希望团队最晚在哪一天稳定下来？", ending: false },
      { id: "wait", name: "等待确认", speaker: "我方", text: "我整理两个节奏，明天下午等你确认。", ending: false },
      { id: "close", name: "约定下一步", speaker: "我方", text: "那就先按两周试运行，周五一起复盘。", ending: true },
      { id: "orphan", name: "孤立备忘", speaker: "我方", text: "这段还没有接进主线。", ending: true }
    ],
    edges: [
      { id: "e1", from: "opening", to: "need", priority: 1, condition: null, fallback: false, kind: "forward" },
      { id: "e2", from: "need", to: "clarify", priority: 1, condition: { field: "reply", operator: "includes", value: "来不及" }, fallback: false, kind: "forward" },
      { id: "e3", from: "clarify", to: "need", priority: 1, condition: null, fallback: false, kind: "return" },
      { id: "e4", from: "need", to: "wait", priority: 2, condition: { field: "reply", operator: "includes", value: "以后" }, fallback: false, kind: "forward" },
      { id: "e5", from: "need", to: "close", priority: 9, condition: null, fallback: true, kind: "forward" }
    ]
  };

  var CASES = [
    {
      name: "诊断逐名报出死端与不可达节点",
      run: function () {
        var a = analyzeGraph(DEMO);
        return a.deadEnds.some(function (n) { return n.name === "等待确认"; }) &&
          a.unreachable.some(function (n) { return n.name === "孤立备忘"; }) ? "ok" : a.warnings.join(" | ");
      },
      expect: "ok"
    },
    {
      name: "澄清回边不增加最大对话深度",
      run: function () {
        var withReturn = analyzeGraph(DEMO).maxDepth;
        var without = clone(DEMO);
        without.edges = without.edges.filter(function (edge) { return edge.kind !== "return"; });
        return withReturn + "/" + analyzeGraph(without).maxDepth;
      },
      expect: "3/3"
    },
    {
      name: "条件都不命中时选择兜底路径",
      run: function () { return selectNext(DEMO, "need", { reply: "让我再想想" }).to; },
      expect: "close"
    },
    {
      name: "条件同时命中时优先级数值小的先走",
      run: function () { return selectNext(DEMO, "need", { reply: "以后怕来不及" }).to; },
      expect: "clarify"
    },
    {
      name: "18 个已知字符按 3.6 字每秒估为 5 秒",
      run: function () {
        var g = { startId: "a", nodes: [
          { id: "a", text: "一二三四五六七八九" },
          { id: "b", text: "甲乙丙丁戊己庚辛壬" }
        ], edges: [{ from: "a", to: "b" }] };
        return estimatePath(g, ["a", "b"]).seconds;
      },
      expect: 5
    },
    {
      name: "没有开场时覆盖尚未计算且零告警",
      run: function () {
        var a = analyzeGraph({ startId: null, nodes: [], edges: [] });
        return (!a.coverageCalculated && a.warnings.length === 0) ? "ok" : "bad";
      },
      expect: "ok"
    }
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (test) {
      var got;
      try {
        got = test.run();
      } catch (err) {
        failures.push({ name: test.name, why: "抛异常：" + (err && err.message ? err.message : err) });
        return;
      }
      if (got !== test.expect) failures.push({ name: test.name, why: "期望 " + test.expect + "，得到 " + got });
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    CHARACTERS_PER_SECOND: CHARACTERS_PER_SECOND,
    analyzeGraph: analyzeGraph,
    reachableIds: reachableIds,
    matchesCondition: matchesCondition,
    selectNext: selectNext,
    countSpokenCharacters: countSpokenCharacters,
    estimatePath: estimatePath,
    exportScript: exportScript,
    findNode: findNode,
    outgoing: outgoing,
    clone: clone,
    DEMO: DEMO,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DialogueBranchEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
