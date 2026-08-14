(function () {
  "use strict";

  var E = globalThis.RelationshipGraphEngine;
  var demoLine = "美国国家航空航天局（组织）｜设立｜载人航天中心（组织）｜1961-11-01";
  var state = E.defaultGraph();
  state.nodes = [];
  state.edges = [];
  state.pathFrom = "";
  state.pathTo = "";
  state.pickNext = "from";
  var els = {};
  var SVG_NS = "http://www.w3.org/2000/svg";

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function svgElement(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function nodeMap() {
    var map = Object.create(null);
    state.nodes.forEach(function (node) { map[node.id] = node; });
    return map;
  }

  function typeLabel(type) {
    return type === E.PERSON ? "人物" : type === E.ORGANIZATION ? "组织" : "事件";
  }

  function shortLabel(label) {
    return label.length > 11 ? label.slice(0, 10) + "…" : label;
  }

  function edgePath(edge, positions) {
    var from = positions[edge.from];
    var to = positions[edge.to];
    if (!from || !to) return null;
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / distance;
    var uy = dy / distance;
    var start = { x: from.x + ux * 62, y: from.y + uy * 30 };
    var end = { x: to.x - ux * 62, y: to.y - uy * 30 };
    var reverse = state.edges.some(function (item) { return item.from === edge.to && item.to === edge.from; });
    var bend = reverse ? 34 : 0;
    var control = {
      x: (start.x + end.x) / 2 - uy * bend,
      y: (start.y + end.y) / 2 + ux * bend
    };
    return {
      d: "M " + start.x + " " + start.y + " Q " + control.x + " " + control.y + " " + end.x + " " + end.y,
      labelX: (start.x + 2 * control.x + end.x) / 4,
      labelY: (start.y + 2 * control.y + end.y) / 4 - 6
    };
  }

  function drawDefinitions(svg) {
    var defs = svgElement("defs");
    var marker = svgElement("marker", {
      id: "arrow-head",
      viewBox: "0 0 10 10",
      refX: "9",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse"
    });
    marker.appendChild(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#707b85" }));
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  function drawEdge(svg, edge, positions) {
    var curve = edgePath(edge, positions);
    if (!curve) return;
    var path = svgElement("path", {
      d: curve.d,
      "class": "graph-edge",
      "data-from": edge.from,
      "data-to": edge.to,
      "data-date": edge.date,
      "marker-end": "url(#arrow-head)"
    });
    svg.appendChild(path);
    var label = svgElement("text", { x: curve.labelX, y: curve.labelY, "class": "edge-label" });
    label.textContent = edge.label;
    svg.appendChild(label);
  }

  function selectPathNode(id) {
    var map = nodeMap();
    if (state.pickNext === "from") {
      state.pathFrom = id;
      state.pickNext = "to";
      els.message.textContent = "已选路径起点“" + map[id].label + "”；再点一个节点作为终点。";
    } else {
      state.pathTo = id;
      state.pickNext = "from";
      els.message.textContent = "已选路径终点“" + map[id].label + "”；文本路径已重算。";
    }
    renderProduct();
  }

  function drawNode(svg, node, position) {
    var group = svgElement("g", {
      "class": "graph-node",
      "data-id": node.id,
      "data-type": node.type,
      role: "button",
      tabindex: "0",
      transform: "translate(" + position.x + " " + position.y + ")"
    });
    if (node.type === E.PERSON) {
      group.appendChild(svgElement("ellipse", { cx: 0, cy: 0, rx: 61, ry: 29, "class": "shape" }));
    } else if (node.type === E.ORGANIZATION) {
      group.appendChild(svgElement("rect", { x: -64, y: -29, width: 128, height: 58, rx: 2, "class": "shape" }));
    } else {
      group.appendChild(svgElement("polygon", { points: "0,-34 69,0 0,34 -69,0", "class": "shape" }));
    }
    var label = svgElement("text", { x: 0, y: -2 });
    label.textContent = shortLabel(node.label);
    group.appendChild(label);
    var kind = svgElement("text", { x: 0, y: 15, "class": "type-label" });
    kind.textContent = typeLabel(node.type);
    group.appendChild(kind);
    var title = svgElement("title");
    title.textContent = node.label + "（" + typeLabel(node.type) + "）";
    group.appendChild(title);
    function activate() { selectPathNode(node.id); }
    group.addEventListener("click", activate);
    group.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
    svg.appendChild(group);
  }

  function renderGraph(analysis) {
    clear(els.graph);
    drawDefinitions(els.graph);
    els.graph.setAttribute("viewBox", "0 0 " + analysis.layout.width + " " + analysis.layout.height);
    els.graph.setAttribute("height", String(analysis.layout.height));
    els.graphEmpty.hidden = state.nodes.length > 0;
    state.edges.forEach(function (edge) { drawEdge(els.graph, edge, analysis.layout.positions); });
    state.nodes.forEach(function (node) { drawNode(els.graph, node, analysis.layout.positions[node.id]); });
  }

  function renderPath() {
    var map = nodeMap();
    if (!state.pathFrom || !state.pathTo || !map[state.pathFrom] || !map[state.pathTo]) {
      els.pathResult.textContent = "尚无路径：加入关系后，点两个节点选择起点与终点。";
    } else {
      var result = E.shortestPath(state.nodes, state.edges, state.pathFrom, state.pathTo);
      els.pathResult.textContent = result
        ? result.labels.join(" → ") + "；" + result.length + " 条关系，" + result.intermediaries + " 个中介。"
        : map[state.pathFrom].label + "与" + map[state.pathTo].label + "分属不同连通分量，没有路径。";
    }
    els.pathPrompt.textContent = state.pickNext === "from"
      ? "下一次点击选择路径起点。"
      : "下一次点击选择路径终点。";
  }

  function renderRelationshipText() {
    var map = nodeMap();
    els.relationshipText.textContent = state.edges.length
      ? state.edges.map(function (edge) {
        return map[edge.from].label + " —" + edge.label + "→ " + map[edge.to].label + "｜" + edge.date;
      }).join("\n")
      : "加入第一条关系后，这里会逐行列出方向、关系名与日期。";
  }

  function renderProduct() {
    var analysis = E.analyze(state.nodes, state.edges);
    els.statNodes.textContent = String(analysis.nodeCount);
    els.statEdges.textContent = String(analysis.edgeCount);
    els.statDegree.textContent = String(analysis.maxDegree);
    els.statComponents.textContent = String(analysis.componentCount);
    els.statCycles.textContent = String(analysis.cycleRank);
    els.statDensity.textContent = analysis.directedDensity.toFixed(4);
    els.productMeta.textContent = analysis.nodeCount
      ? analysis.nodeCount + " 节点 · " + analysis.edgeCount + " 关系 · 无向密度 " + analysis.undirectedDensity.toFixed(4)
      : "等待第一条关系";
    renderGraph(analysis);
    renderPath();
    renderRelationshipText();
  }

  function addRelation() {
    var result = E.addRelationLine(state.nodes, state.edges, els.relationLine.value);
    if (result.error) {
      els.message.textContent = result.error;
      return;
    }
    state.nodes = result.nodes;
    state.edges = result.edges;
    els.message.textContent = "关系已加入：" + state.nodes.length + " 个节点、" + state.edges.length + " 条关系同步重算。";
    els.relationLine.value = "";
    renderProduct();
  }

  function loadDemo() {
    var demo = E.defaultGraph();
    state.nodes = demo.nodes;
    state.edges = demo.edges;
    state.pathFrom = "collins";
    state.pathTo = "nixon";
    state.pickNext = "from";
    els.relationLine.value = demoLine;
    els.message.textContent = "已恢复阿波罗 11 号公开史实样例。";
    renderProduct();
  }

  function clearGraph() {
    state.nodes = [];
    state.edges = [];
    state.pathFrom = "";
    state.pathTo = "";
    state.pickNext = "from";
    els.relationLine.value = "";
    els.message.textContent = "关系图已清空：请写下第一条具体关系。";
    renderProduct();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    if (!report.failures.length) {
      var ok = document.createElement("li");
      ok.textContent = "密度、度数、连通分量、圈秩、路径与确定性布局均通过。";
      els.testDetail.appendChild(ok);
    }
    report.failures.forEach(function (failure) {
      var item = document.createElement("li");
      item.textContent = failure.name + "：" + failure.why;
      els.testDetail.appendChild(item);
    });
  }

  function mount() {
    [
      "relation-line", "input-message", "product-meta", "stat-nodes", "stat-edges", "stat-degree",
      "stat-components", "stat-cycles", "stat-density", "graph", "graph-empty", "path-result",
      "path-prompt", "relationship-text", "test-out", "test-detail"
    ].forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, character) { return character.toUpperCase(); });
      els[key] = document.getElementById(id);
    });
    els.message = els.inputMessage;

    document.getElementById("add-relation").addEventListener("click", addRelation);
    els.relationLine.addEventListener("keydown", function (event) {
      if (event.key === "Enter") addRelation();
    });
    document.getElementById("clear-graph").addEventListener("click", clearGraph);
    document.getElementById("load-demo").addEventListener("click", loadDemo);
    document.getElementById("scope-summary").addEventListener("click", function () { els.relationLine.focus(); });
    document.getElementById("path-summary").addEventListener("click", function () {
      state.pathFrom = "collins";
      state.pathTo = "nixon";
      state.pickNext = "from";
      els.message.textContent = "已恢复默认路径问题。";
      renderProduct();
    });
    document.getElementById("run-test").addEventListener("click", runTest);
    renderProduct();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
