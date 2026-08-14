(function () {
  "use strict";

  var E = window.DialogueBranchEngine;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var state = {
    graph: { startId: null, nodes: [], edges: [] },
    selectedId: null,
    mode: "opening",
    sequence: 1
  };
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function selectedNode() {
    return E.findNode(state.graph, state.selectedId);
  }

  function startOpening(raw) {
    var text = String(raw || "").trim();
    var start = E.findNode(state.graph, state.graph.startId);
    if (!start && text) {
      start = { id: "opening", name: "开场", speaker: "我方", text: text, ending: false };
      state.graph.startId = start.id;
      state.graph.nodes.push(start);
      state.selectedId = start.id;
    } else if (start) {
      start.text = text;
      if (!text && state.graph.nodes.length === 1) {
        state.graph = { startId: null, nodes: [], edges: [] };
        state.selectedId = null;
      }
    }
    els.openingActions.hidden = !text;
    renderDone();
    renderProduct();
  }

  function renderDone() {
    clear(els.done);
    var start = E.findNode(state.graph, state.graph.startId);
    if (!start) return;
    var opening = el("button", "done-row");
    opening.type = "button";
    opening.appendChild(el("span", "key", "开场白"));
    opening.appendChild(el("span", "value", start.text || "待补"));
    opening.addEventListener("click", function () {
      state.mode = "opening";
      renderStage();
    });
    els.done.appendChild(opening);

    var chosen = selectedNode();
    if (state.mode === "branch" && chosen) {
      var current = el("button", "done-row");
      current.type = "button";
      current.appendChild(el("span", "key", "当前节点"));
      current.appendChild(el("span", "value", chosen.name + " · " + chosen.text));
      current.addEventListener("click", function () { renderStage(); });
      els.done.appendChild(current);
    }
  }

  function renderStage() {
    var start = E.findNode(state.graph, state.graph.startId);
    if (!start || state.mode === "opening") {
      els.question.textContent = "开场第一句你会怎么说";
      els.questionHint.textContent = "空白不是错误。先写一句，分支图才开始生长。";
      els.primaryLabel.hidden = false;
      els.opening.hidden = false;
      els.opening.value = start ? start.text : "";
      els.openingActions.hidden = !String(els.opening.value).trim();
      els.branchEditor.hidden = true;
      return;
    }

    var chosen = selectedNode() || start;
    state.selectedId = chosen.id;
    els.question.textContent = "“" + chosen.name + "”之后，下一步可能是什么？";
    els.questionHint.textContent = "一次只加一步。要从别处继续，直接点分支图里的那个节点。";
    els.primaryLabel.hidden = true;
    els.opening.hidden = true;
    els.openingActions.hidden = true;
    els.branchEditor.hidden = false;
    els.toggleEnding.textContent = chosen.ending ? "取消当前节点的结束标记" : "把当前节点标成结束";
    renderReturnOptions();
  }

  function renderReturnOptions() {
    clear(els.returnTarget);
    state.graph.nodes.forEach(function (node) {
      if (node.id === state.selectedId) return;
      var option = el("option", null, node.name + " · " + node.text);
      option.value = node.id;
      els.returnTarget.appendChild(option);
    });
    els.addReturn.disabled = els.returnTarget.options.length === 0;
  }

  function addNext() {
    var text = els.nextText.value.trim();
    var from = selectedNode();
    if (!text || !from) return;
    state.sequence += 1;
    var id = "node-" + state.sequence;
    var speaker = els.nextSpeaker.value;
    var node = {
      id: id,
      name: speaker + "步骤 " + state.sequence,
      speaker: speaker,
      text: text,
      ending: els.ending.checked
    };
    var fallback = els.fallback.checked;
    var conditionText = els.conditionValue.value.trim();
    state.graph.nodes.push(node);
    state.graph.edges.push({
      id: "edge-" + state.sequence,
      from: from.id,
      to: id,
      priority: Math.max(1, Number(els.priority.value) || 1),
      condition: (!fallback && conditionText) ? {
        field: "reply", operator: "includes", value: conditionText
      } : null,
      fallback: fallback,
      kind: "forward"
    });
    state.selectedId = id;
    els.nextText.value = "";
    els.conditionValue.value = "";
    els.priority.value = "1";
    els.fallback.checked = false;
    els.ending.checked = false;
    render();
  }

  function toggleEnding() {
    var node = selectedNode();
    if (!node) return;
    node.ending = !node.ending;
    render();
  }

  function addReturn() {
    var from = selectedNode();
    var to = els.returnTarget.value;
    if (!from || !to || from.id === to) return;
    var duplicate = state.graph.edges.some(function (edge) {
      return edge.from === from.id && edge.to === to && edge.kind === "return";
    });
    if (!duplicate) {
      state.sequence += 1;
      state.graph.edges.push({
        id: "return-" + state.sequence,
        from: from.id,
        to: to,
        priority: 1,
        condition: null,
        fallback: false,
        kind: "return"
      });
    }
    render();
  }

  function loadDemo() {
    state.graph = E.clone(E.DEMO);
    state.selectedId = "need";
    state.sequence = 20;
    state.mode = "branch";
    render();
  }

  function graphDepths() {
    var depths = {};
    if (!state.graph.startId) return depths;
    depths[state.graph.startId] = 0;
    var queue = [state.graph.startId];
    while (queue.length) {
      var id = queue.shift();
      E.outgoing(state.graph, id).forEach(function (edge) {
        if (edge.kind === "return" || depths[edge.to] !== undefined) return;
        depths[edge.to] = depths[id] + 1;
        queue.push(edge.to);
      });
    }
    var max = 0;
    Object.keys(depths).forEach(function (id) { max = Math.max(max, depths[id]); });
    state.graph.nodes.forEach(function (node) {
      if (depths[node.id] === undefined) depths[node.id] = max + 1;
    });
    return depths;
  }

  function positionsFor(depths) {
    var groups = {};
    state.graph.nodes.forEach(function (node) {
      var depth = depths[node.id] || 0;
      if (!groups[depth]) groups[depth] = [];
      groups[depth].push(node);
    });
    var positions = {};
    Object.keys(groups).forEach(function (depthKey) {
      var depth = Number(depthKey);
      var group = groups[depth];
      var step = 760 / Math.max(1, group.length);
      group.forEach(function (node, index) {
        positions[node.id] = { x: 60 + step * index + step / 2, y: 52 + depth * 126 };
      });
    });
    return positions;
  }

  function renderGraph() {
    clear(els.graph);
    if (!state.graph.startId) {
      els.graph.setAttribute("viewBox", "0 0 880 280");
      var empty = svgEl("text", { x: "440", y: "140", "text-anchor": "middle", class: "empty-svg" });
      empty.textContent = "开场第一句你会怎么说";
      els.graph.appendChild(empty);
      return;
    }

    var depths = graphDepths();
    var positions = positionsFor(depths);
    var maxDepth = 0;
    Object.keys(depths).forEach(function (id) { maxDepth = Math.max(maxDepth, depths[id]); });
    var height = Math.max(280, 130 + maxDepth * 126);
    els.graph.setAttribute("viewBox", "0 0 880 " + height);

    state.graph.edges.forEach(function (edge) {
      var a = positions[edge.from];
      var b = positions[edge.to];
      if (!a || !b) return;
      var path;
      if (edge.kind === "return") {
        path = "M " + a.x + " " + (a.y - 30) + " C " + (a.x + 90) + " " + (a.y - 80) + ", " +
          (b.x + 90) + " " + (b.y + 80) + ", " + b.x + " " + (b.y + 30);
      } else {
        path = "M " + a.x + " " + (a.y + 30) + " C " + a.x + " " + (a.y + 72) + ", " +
          b.x + " " + (b.y - 72) + ", " + b.x + " " + (b.y - 30);
      }
      els.graph.appendChild(svgEl("path", { d: path, class: "edge " + (edge.kind === "return" ? "return" : "forward") }));
      var label = svgEl("text", {
        x: String((a.x + b.x) / 2 + 6),
        y: String((a.y + b.y) / 2),
        class: "edge-label"
      });
      label.textContent = edge.kind === "return" ? "回主线" : (edge.fallback ? "兜底" : "优先 " + (edge.priority || 1));
      els.graph.appendChild(label);
    });

    state.graph.nodes.forEach(function (node) {
      var p = positions[node.id];
      var group = svgEl("g", {
        class: "node" + (node.id === state.selectedId ? " selected" : ""),
        "data-id": node.id,
        tabindex: "0",
        role: "button",
        "aria-label": "选择节点 " + node.name
      });
      group.appendChild(svgEl("rect", { x: String(p.x - 76), y: String(p.y - 31), width: "152", height: "62", rx: "2" }));
      var name = svgEl("text", { x: String(p.x), y: String(p.y - 8), "text-anchor": "middle", class: "meta" });
      name.textContent = node.name + (node.ending ? " · 结束" : "");
      group.appendChild(name);
      var line = svgEl("text", { x: String(p.x), y: String(p.y + 14), "text-anchor": "middle" });
      line.textContent = node.text.length > 14 ? node.text.slice(0, 14) + "…" : node.text;
      group.appendChild(line);
      var choose = function () {
        state.selectedId = node.id;
        state.mode = "branch";
        render();
      };
      group.addEventListener("click", choose);
      group.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") choose();
      });
      els.graph.appendChild(group);
    });
  }

  function renderDiagnostics(analysis) {
    clear(els.diagnostics);
    if (!analysis.coverageCalculated) return;
    if (!analysis.warnings.length) {
      els.diagnostics.appendChild(el("p", "ok", "没有死端或不可达节点"));
      return;
    }
    analysis.warnings.forEach(function (warning) {
      els.diagnostics.appendChild(el("p", "warning", warning));
    });
  }

  function renderProduct() {
    var analysis = E.analyzeGraph(state.graph);
    renderGraph();
    renderDiagnostics(analysis);
    if (!analysis.coverageCalculated) {
      els.coverageState.textContent = "覆盖尚未计算 · 0 个节点";
    } else {
      els.coverageState.textContent = "最大深度 " + analysis.maxDepth + " 层 · " + state.graph.nodes.length + " 个节点 · 约 3.6 字/秒";
    }
    els.exportOutput.value = E.exportScript(state.graph);
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(el("li", null, failure.name + " —— " + failure.why));
    });
    if (!report.failures.length) {
      els.testDetail.appendChild(el("li", null, "死端、不可达、回边深度、优先级、兜底与 3.6 字/秒均已核对。"));
    }
  }

  function render() {
    renderDone();
    renderStage();
    renderProduct();
  }

  function mount() {
    els.done = document.getElementById("done");
    els.question = document.getElementById("question");
    els.questionHint = document.getElementById("question-hint");
    els.primaryLabel = document.getElementById("primary-label");
    els.opening = document.getElementById("opening-input");
    els.openingActions = document.getElementById("opening-actions");
    els.branchEditor = document.getElementById("branch-editor");
    els.nextText = document.getElementById("next-text");
    els.nextSpeaker = document.getElementById("next-speaker");
    els.conditionValue = document.getElementById("condition-value");
    els.priority = document.getElementById("priority");
    els.fallback = document.getElementById("fallback");
    els.ending = document.getElementById("ending");
    els.toggleEnding = document.getElementById("toggle-ending");
    els.returnTarget = document.getElementById("return-target");
    els.addReturn = document.getElementById("add-return");
    els.graph = document.getElementById("graph");
    els.diagnostics = document.getElementById("diagnostics");
    els.coverageState = document.getElementById("coverage-state");
    els.exportOutput = document.getElementById("export-output");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    els.opening.addEventListener("input", function () { startOpening(els.opening.value); });
    document.getElementById("continue-branch").addEventListener("click", function () {
      if (!state.graph.startId) return;
      state.mode = "branch";
      render();
    });
    document.getElementById("add-next").addEventListener("click", addNext);
    els.toggleEnding.addEventListener("click", toggleEnding);
    els.addReturn.addEventListener("click", addReturn);
    document.getElementById("load-demo").addEventListener("click", loadDemo);
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
