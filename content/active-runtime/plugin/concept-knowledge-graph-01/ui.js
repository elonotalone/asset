(function () {
  "use strict";

  var E = globalThis.ConceptGraphEngine;
  var state = E.defaultGraph();
  state.nodes = [];
  state.edges = [];
  state.edgeFrom = "";
  state.edgeTo = "";
  state.pathFrom = "";
  state.pathTo = "";
  state.followupTarget = "";
  state.activePath = null;
  var els = {};
  var SVG_NS = "http://www.w3.org/2000/svg";

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function element(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function svgElement(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function statusLabel(status) {
    return {
      mastered: "已经掌握",
      learnable: "现在就能学",
      review: "该回头复习",
      locked: "还缺前置"
    }[status] || status;
  }

  function showMessage(text) {
    els.message.textContent = text || "";
  }

  function setDrawer(open) {
    els.drawer.hidden = !open;
    els.scrim.hidden = !open;
    els.openTools.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("drawer-open", open);
    if (open) els.closeTools.focus();
    else els.openTools.focus();
  }

  function focusPrerequisite() {
    if (!els.prerequisiteStep.hidden) els.prerequisiteName.focus();
  }

  function refreshSelect(select, preferred) {
    var keep = preferred || select.value;
    clear(select);
    state.nodes.forEach(function (node) {
      var option = document.createElement("option");
      option.value = node.id;
      option.textContent = node.label;
      select.appendChild(option);
    });
    if (state.nodes.some(function (node) { return node.id === keep; })) select.value = keep;
    return select.value || "";
  }

  function refreshSelectors() {
    state.edgeFrom = refreshSelect(els.edgeFrom, state.edgeFrom);
    state.edgeTo = refreshSelect(els.edgeTo, state.edgeTo);
    state.pathFrom = refreshSelect(els.pathFrom, state.pathFrom);
    state.pathTo = refreshSelect(els.pathTo, state.pathTo);
  }

  function drawArrow(group, x, y, angle) {
    var size = 6;
    var bx = x - Math.cos(angle) * size * 1.7;
    var by = y - Math.sin(angle) * size * 1.7;
    var px = Math.cos(angle + Math.PI / 2) * size;
    var py = Math.sin(angle + Math.PI / 2) * size;
    var points = [x + "," + y, (bx + px) + "," + (by + py), (bx - px) + "," + (by - py)].join(" ");
    group.appendChild(svgElement("polygon", { points: points, "class": "graph-arrow" }));
  }

  function pathContainsEdge(edge) {
    if (!state.activePath || edge.kind !== E.REQUIRED) return false;
    for (var index = 0; index < state.activePath.ids.length - 1; index++) {
      if (state.activePath.ids[index] === edge.from && state.activePath.ids[index + 1] === edge.to) return true;
    }
    return false;
  }

  function drawEdge(svg, edge, positions) {
    var a = positions[edge.from];
    var b = positions[edge.to];
    if (!a || !b) return;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / dist;
    var uy = dy / dist;
    var startX = a.x + ux * 70;
    var startY = a.y + uy * 31;
    var endX = b.x - ux * 70;
    var endY = b.y - uy * 31;
    var related = edge.kind === E.RELATED;
    var focusClass = state.activePath ? (pathContainsEdge(edge) ? " is-path" : " is-dimmed") : "";
    var group = svgElement("g", {
      "class": "graph-connection" + (related ? " related" : " required") + focusClass,
      "data-from": edge.from,
      "data-to": edge.to,
      "data-kind": edge.kind
    });
    group.appendChild(svgElement("line", {
      x1: startX, y1: startY, x2: endX, y2: endY,
      "class": "graph-edge"
    }));
    drawArrow(group, endX, endY, Math.atan2(dy, dx));
    var label = svgElement("text", {
      x: (startX + endX) / 2,
      y: (startY + endY) / 2 - 6,
      "class": "edge-label"
    });
    label.textContent = edge.label || (related ? "相关" : "必修先修");
    group.appendChild(label);
    svg.appendChild(group);
  }

  function selectNode(id, analysis) {
    var map = analysis.learning.nodeById;
    var incoming = state.edges.filter(function (edge) { return edge.kind === E.REQUIRED && edge.to === id; });
    var outgoing = state.edges.filter(function (edge) { return edge.kind === E.REQUIRED && edge.from === id; });
    function names(items, key) {
      return items.length ? items.map(function (edge) { return map[edge[key]].label; }).join("、") : "无";
    }
    els.selection.textContent = map[id].label + "｜必修前驱：" + names(incoming, "from") + "；必修后继：" + names(outgoing, "to") + "。";
    setDrawer(true);
  }

  function drawNode(svg, node, stateRow, pos, analysis) {
    var focusClass = state.activePath ? (state.activePath.ids.indexOf(node.id) !== -1 ? " is-path" : " is-dimmed") : "";
    var group = svgElement("g", {
      "class": "graph-node" + focusClass,
      "data-id": node.id,
      "data-status": stateRow.status,
      role: "button",
      tabindex: "0",
      transform: "translate(" + pos.x + " " + pos.y + ")"
    });
    group.appendChild(svgElement("ellipse", { cx: 0, cy: 0, rx: 83, ry: 43, "class": "node-aura" }));
    group.appendChild(svgElement("rect", { x: -70, y: -31, width: 140, height: 62, rx: 3, "class": "node-card" }));
    var label = svgElement("text", { x: 0, y: -4, "class": "node-name" });
    var short = node.label.length > 10 ? node.label.slice(0, 9) + "…" : node.label;
    label.textContent = short;
    group.appendChild(label);
    var status = svgElement("text", { x: 0, y: 16, "class": "node-status" });
    status.textContent = statusLabel(stateRow.status);
    group.appendChild(status);
    var title = svgElement("title");
    title.textContent = node.label + "，有效掌握度 " + stateRow.effectiveMastery.toFixed(3);
    group.appendChild(title);
    function activate() { selectNode(node.id, analysis); }
    group.addEventListener("click", activate);
    group.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
    svg.appendChild(group);
  }

  function renderGraph(analysis) {
    clear(els.graph);
    els.graph.classList.toggle("path-focus-active", Boolean(state.activePath));
    var layout = analysis.layout;
    els.graph.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
    els.graph.setAttribute("preserveAspectRatio", "xMidYMid meet");
    els.graphEmpty.hidden = state.nodes.length > 0;
    state.edges.forEach(function (edge) { drawEdge(els.graph, edge, layout.positions); });
    var stateMap = Object.create(null);
    analysis.learning.states.forEach(function (row) { stateMap[row.id] = row; });
    state.nodes.forEach(function (node) { drawNode(els.graph, node, stateMap[node.id], layout.positions[node.id], analysis); });
  }

  function renderTable(analysis) {
    clear(els.detailBody);
    var nodeById = analysis.learning.nodeById;
    var rows = analysis.learning.states.slice().sort(function (a, b) {
      var al = a.level === null ? 9999 : a.level;
      var bl = b.level === null ? 9999 : b.level;
      return al - bl || a.id.localeCompare(b.id);
    });
    rows.forEach(function (row) {
      var node = nodeById[row.id];
      var tr = document.createElement("tr");
      [
        row.level === null ? "循环" : String(row.level),
        node.label,
        node.minutes + " 分",
        Number(node.mastery).toFixed(2),
        row.effectiveMastery.toFixed(3),
        row.prerequisites.length ? row.prerequisites.map(function (id) { return nodeById[id].label; }).join("、") : "—",
        statusLabel(row.status)
      ].forEach(function (value, index) {
        var td = document.createElement("td");
        td.textContent = value;
        if (index === 6) td.className = "status-" + row.status;
        tr.appendChild(td);
      });
      els.detailBody.appendChild(tr);
    });
  }

  function syncFirstSteps() {
    var empty = state.nodes.length === 0;
    els.firstStep.hidden = !empty;
    els.prerequisiteStep.hidden = empty || !state.followupTarget;
    if (!els.prerequisiteStep.hidden) {
      var target = state.nodes.filter(function (node) { return node.id === state.followupTarget; })[0];
      els.prerequisiteQuestion.textContent = "“" + target.label + "”需要先会什么？";
    }
  }

  function renderPath() {
    els.pathMoment.hidden = !state.activePath;
    if (state.activePath) els.pathMomentText.textContent = state.activePath.labels.join(" → ");
    if (!state.nodes.length || !state.pathFrom || !state.pathTo) {
      els.pathResult.textContent = "尚未分层：先加入概念与必修关系。";
      return;
    }
    var path = E.shortestPath(state.nodes, E.requiredEdges(state.nodes, state.edges), state.pathFrom, state.pathTo);
    els.pathResult.textContent = path
      ? path.labels.join(" → ") + "；" + path.length + " 条必修边。"
      : "两者之间没有顺着必修方向可达的路径。";
  }

  function render() {
    refreshSelectors();
    var analysis = E.analyze(state.nodes, state.edges, state.threshold);
    els.statNodes.textContent = String(state.nodes.length);
    els.statLayers.textContent = analysis.learning.order.acyclic ? String(analysis.learning.order.layers.length) : "循环";
    els.statCritical.textContent = analysis.critical ? analysis.critical.minutes + " 分" : "—";
    els.statLearnable.textContent = String(analysis.learning.states.filter(function (row) { return row.status === "learnable"; }).length);
    els.orderStatus.textContent = analysis.learning.order.acyclic
      ? "Kahn 分层完成：必修关系形成可执行顺序；相关关系未进入层级。"
      : "循环先修，无可执行顺序：" + analysis.learning.order.cycleNodes.map(function (id) { return analysis.learning.nodeById[id].label; }).join("、") + "。";
    renderGraph(analysis);
    renderTable(analysis);
    renderPath();
    syncFirstSteps();
  }

  function nextId() {
    var number = state.nodes.length + 1;
    var id = "concept-" + number;
    while (state.nodes.some(function (node) { return node.id === id; })) { number++; id = "concept-" + number; }
    return id;
  }

  function createNode(label, minutes, mastery, days) {
    if (!label) return showMessage("概念名不能为空。");
    if (state.nodes.length >= 120) return showMessage("已到 120 个概念上限；请先精简图谱。");
    if (state.nodes.some(function (node) { return node.label === label; })) return showMessage("同名概念已经在图里。");
    if (!(minutes > 0) || !isFinite(mastery) || mastery < 0 || mastery > 1 || !isFinite(days) || days < 0) {
      return showMessage("分钟须为正数，掌握度须在 0–1，天数不能为负。");
    }
    var id = nextId();
    var node = { id: id, label: label, minutes: minutes, mastery: mastery, daysSinceReview: days };
    state.nodes.push(node);
    state.activePath = null;
    state.edgeTo = id;
    state.pathTo = id;
    return node;
  }

  function beginPrerequisiteStep(node) {
    state.followupTarget = node.id;
    setDrawer(false);
    render();
    focusPrerequisite();
  }

  function addNode() {
    var label = els.name.value.trim();
    var node = createNode(label, Number(els.minutes.value), Number(els.mastery.value), Number(els.days.value));
    if (!node) return;
    els.name.value = "";
    showMessage("已加入“" + label + "”；接下来写下它需要先会的概念。");
    beginPrerequisiteStep(node);
  }

  function addQuickNode() {
    var label = els.quickName.value.trim();
    var node = createNode(label, 35, 0.30, 0);
    if (!node) return;
    els.quickName.value = "";
    showMessage("已加入“" + label + "”；接下来写下它需要先会的概念。");
    beginPrerequisiteStep(node);
  }

  function addPrerequisite() {
    var label = els.prerequisiteName.value.trim();
    var targetId = state.followupTarget;
    if (!label) return showMessage("先写下一个必修前置概念。");
    var fromNode = state.nodes.filter(function (node) { return node.label === label; })[0];
    if (fromNode && fromNode.id === targetId) return showMessage("概念不能成为自己的前置。");
    if (!fromNode) fromNode = createNode(label, 35, 0.30, 0);
    if (!fromNode) return;
    if (!state.edges.some(function (edge) { return edge.from === fromNode.id && edge.to === targetId && edge.kind === E.REQUIRED; })) {
      state.edges.push({ from: fromNode.id, to: targetId, kind: E.REQUIRED, label: "必修先修" });
    }
    state.activePath = null;
    state.edgeFrom = fromNode.id;
    state.edgeTo = targetId;
    state.pathFrom = fromNode.id;
    state.pathTo = targetId;
    state.followupTarget = fromNode.id;
    els.prerequisiteName.value = "";
    showMessage("已把“" + fromNode.label + "”接到前面；继续往前写，或先停在这里。");
    render();
    focusPrerequisite();
  }

  function addEdge() {
    var from = els.edgeFrom.value;
    var to = els.edgeTo.value;
    var kind = els.edgeKind.value;
    if (!from || !to) return showMessage("先至少加入两个概念。");
    if (from === to) return showMessage("关系的两端不能是同一个概念。");
    if (state.edges.some(function (edge) { return edge.from === from && edge.to === to && edge.kind === kind; })) {
      return showMessage("这条同类型关系已经存在。");
    }
    state.edges.push({ from: from, to: to, kind: kind, label: kind === E.REQUIRED ? "必修先修" : "相关" });
    state.activePath = null;
    state.pathFrom = from;
    state.pathTo = to;
    showMessage("关系已加入；层级、路径与明细已重算。");
    render();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    if (!report.failures.length) els.testDetail.appendChild(element("li", "", "公式、分层、路径、循环与确定性布局均通过。"));
    report.failures.forEach(function (failure) { els.testDetail.appendChild(element("li", "", failure.name + "：" + failure.why)); });
  }

  function mount() {
    ["threshold", "concept-name", "concept-minutes", "concept-mastery", "concept-days", "edge-from", "edge-kind", "edge-to", "path-from", "path-to", "input-message", "stat-nodes", "stat-layers", "stat-critical", "stat-learnable", "order-status", "graph", "graph-empty", "path-result", "selection-detail", "detail-body", "test-out", "test-detail", "open-tools", "close-tools", "tool-drawer", "drawer-scrim", "first-step", "quick-concept-name", "prerequisite-step", "prerequisite-question", "prerequisite-name", "path-moment", "path-moment-text"].forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, char) { return char.toUpperCase(); });
      els[key] = document.getElementById(id);
    });
    els.name = els.conceptName;
    els.minutes = els.conceptMinutes;
    els.mastery = els.conceptMastery;
    els.days = els.conceptDays;
    els.message = els.inputMessage;
    els.selection = els.selectionDetail;
    els.drawer = els.toolDrawer;
    els.scrim = els.drawerScrim;
    els.quickName = els.quickConceptName;

    els.openTools.addEventListener("click", function () { setDrawer(true); });
    els.closeTools.addEventListener("click", function () { setDrawer(false); });
    els.scrim.addEventListener("click", function () { setDrawer(false); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !els.drawer.hidden) setDrawer(false);
    });
    document.getElementById("quick-concept-form").addEventListener("submit", function (event) {
      event.preventDefault();
      addQuickNode();
    });
    document.getElementById("prerequisite-form").addEventListener("submit", function (event) {
      event.preventDefault();
      addPrerequisite();
    });
    document.getElementById("no-prerequisite").addEventListener("click", function () {
      state.followupTarget = "";
      showMessage("已停在这里；需要补充概念或关系时，可打开口径与设置。");
      render();
    });
    document.getElementById("add-node").addEventListener("click", addNode);
    document.getElementById("add-edge").addEventListener("click", addEdge);
    document.getElementById("run-path").addEventListener("click", function () {
      state.pathFrom = els.pathFrom.value;
      state.pathTo = els.pathTo.value;
      state.activePath = E.shortestPath(state.nodes, E.requiredEdges(state.nodes, state.edges), state.pathFrom, state.pathTo);
      if (state.activePath) {
        state.followupTarget = "";
        showMessage("最短必修路径已点亮；路径之外的图已退暗。");
        setDrawer(false);
        render();
      } else {
        renderPath();
      }
    });
    els.edgeFrom.addEventListener("change", function () { state.edgeFrom = els.edgeFrom.value; });
    els.edgeTo.addEventListener("change", function () { state.edgeTo = els.edgeTo.value; });
    els.pathFrom.addEventListener("change", function () { state.pathFrom = els.pathFrom.value; state.activePath = null; render(); });
    els.pathTo.addEventListener("change", function () { state.pathTo = els.pathTo.value; state.activePath = null; render(); });
    els.threshold.addEventListener("change", function () {
      state.threshold = E.normalizeThreshold(els.threshold.value);
      els.threshold.value = state.threshold.toFixed(2);
      showMessage("掌握阈值已更新，状态同步重算。");
      render();
    });
    document.getElementById("clear-graph").addEventListener("click", function () {
      state.nodes = [];
      state.edges = [];
      state.edgeFrom = state.edgeTo = state.pathFrom = state.pathTo = "";
      state.followupTarget = "";
      state.activePath = null;
      els.selection.textContent = "点一个节点，可查看它的必修前驱与后继。";
      showMessage("图谱已清空：先写下你要弄懂的第一个概念。");
      setDrawer(false);
      render();
      els.quickName.focus();
    });
    document.getElementById("load-demo").addEventListener("click", function () {
      var demo = E.defaultGraph();
      state.nodes = demo.nodes;
      state.edges = demo.edges;
      state.threshold = demo.threshold;
      state.edgeFrom = "faraday-law";
      state.edgeTo = "lenz-law";
      state.pathFrom = "magnetic-field";
      state.pathTo = "transformer";
      state.followupTarget = "";
      state.activePath = null;
      els.threshold.value = "0.80";
      showMessage("已恢复电磁感应样例。");
      setDrawer(false);
      render();
    });
    document.getElementById("clear-path").addEventListener("click", function () {
      state.activePath = null;
      showMessage("路径聚焦已收起，整张图恢复显示。");
      render();
    });
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
    els.quickName.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
