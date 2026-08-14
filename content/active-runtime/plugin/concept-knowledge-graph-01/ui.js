(function () {
  "use strict";

  var Engine = globalThis.ConceptGraphEngine;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var MAX_CONCEPTS = 120;
  var graph = { nodes: [], edges: [], threshold: 0.80 };
  var activeTargetId = null;
  var pathTargetId = null;
  var nextConceptNumber = 1;
  var resizeFrame = 0;

  var stage = document.querySelector(".graph-stage");
  var viewport = document.getElementById("graph-viewport");
  var canvas = document.getElementById("graph-canvas");
  var gridField = canvas.querySelector(".grid-field");
  var edgeLayer = document.getElementById("graph-edges");
  var nodeLayer = document.getElementById("graph-nodes");
  var summary = document.getElementById("learnable-summary");
  var entryForm = document.getElementById("concept-entry");
  var entryQuestion = document.getElementById("entry-question");
  var entryInput = document.getElementById("concept-input");
  var entrySubmit = document.getElementById("entry-submit");
  var sampleTrigger = document.getElementById("sample-trigger");
  var feedback = document.getElementById("entry-feedback");

  function svgElement(name, attributes) {
    var element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, String(attributes[key]));
    });
    return element;
  }

  function clearLayer(layer) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function nodeById(id) {
    return graph.nodes.filter(function (node) { return node.id === id; })[0] || null;
  }

  function stateById(analysis, id) {
    return analysis.learning.states.filter(function (state) { return state.id === id; })[0];
  }

  function stateName(status) {
    if (status === "learnable") return "现在可以学";
    if (status === "locked") return "还被先修知识锁住";
    if (status === "review") return "该复习";
    return "已经掌握";
  }

  function setFeedback(message) {
    feedback.textContent = message || "";
  }

  function splitLabel(label) {
    var characters = Array.from(String(label));
    if (characters.length <= 11) return [characters.join("")];
    if (characters.length <= 22) {
      var middle = Math.ceil(characters.length / 2);
      return [characters.slice(0, middle).join(""), characters.slice(middle).join("")];
    }
    return [characters.slice(0, 11).join(""), characters.slice(11, 21).join("") + "…"];
  }

  function nodeSize(node) {
    var lines = splitLabel(node.label);
    var longest = lines.reduce(function (length, line) {
      return Math.max(length, Array.from(line).length);
    }, 0);
    return {
      width: Math.max(132, Math.min(224, longest * 15 + 54)),
      height: lines.length === 1 ? 62 : 80,
      lines: lines
    };
  }

  function learningLevels(analysis) {
    var levels = Object.create(null);
    Object.keys(analysis.learning.order.levelById).forEach(function (id) {
      levels[id] = analysis.learning.order.levelById[id];
    });
    var fallback = analysis.learning.order.layers.length;
    analysis.learning.order.cycleNodes.forEach(function (id) { levels[id] = fallback; });
    return levels;
  }

  function buildLayout(analysis) {
    var levels = learningLevels(analysis);
    var maxLevel = Object.keys(levels).reduce(function (maximum, id) {
      return Math.max(maximum, Number(levels[id]) || 0);
    }, 0);
    var viewportWidth = Math.max(viewport.clientWidth || 0, 320);
    var viewportHeight = Math.max(viewport.clientHeight || 0, 520);
    var graphWidth = Math.max(viewportWidth, maxLevel * 232 + 300);
    var raw = Engine.layoutGraph(graph.nodes, graph.edges, levels, graphWidth);
    var graphHeight = Math.max(viewportHeight, raw.height + 170);
    var verticalOffset = Math.max(0, (graphHeight - raw.height) / 2 - 12);
    var positions = Object.create(null);

    graph.nodes.forEach(function (node) {
      var point = raw.positions[node.id];
      positions[node.id] = {
        x: point.x,
        y: point.y + verticalOffset,
        level: point.level
      };
    });

    return { width: graphWidth, height: graphHeight, positions: positions };
  }

  function shortestRequiredPath(targetId) {
    if (!targetId || graph.nodes.length < 2) return [];
    var required = Engine.requiredEdges(graph.nodes, graph.edges);
    var hasIncoming = Object.create(null);
    required.forEach(function (edge) { hasIncoming[edge.to] = true; });
    var roots = graph.nodes.filter(function (node) { return !hasIncoming[node.id]; });
    var best = null;

    roots.forEach(function (root) {
      var candidate = Engine.shortestPath(graph.nodes, required, root.id, targetId);
      if (!candidate) return;
      if (!best || candidate.length < best.length ||
          (candidate.length === best.length && candidate.ids.join("\u0000") < best.ids.join("\u0000"))) {
        best = candidate;
      }
    });

    return best && best.length > 0 ? best.ids : [];
  }

  function edgeKey(from, to) {
    return from + "\u0000" + to;
  }

  function edgeCurve(edge, layout, sizes) {
    var from = layout.positions[edge.from];
    var to = layout.positions[edge.to];
    var fromSize = sizes[edge.from];
    var toSize = sizes[edge.to];
    var direction = to.x >= from.x ? 1 : -1;
    var startX = from.x + direction * fromSize.width / 2;
    var endX = to.x - direction * (toSize.width / 2 + 11);
    var distance = Math.abs(endX - startX);

    if (distance > 42) {
      var bend = Math.max(54, distance * 0.44);
      return "M " + startX + " " + from.y +
        " C " + (startX + direction * bend) + " " + from.y +
        ", " + (endX - direction * bend) + " " + to.y +
        ", " + endX + " " + to.y;
    }

    var lift = Math.max(80, Math.abs(to.y - from.y) + 50);
    return "M " + startX + " " + from.y +
      " C " + (startX + 76) + " " + (from.y - lift) +
      ", " + (endX - 76) + " " + (to.y - lift) +
      ", " + endX + " " + to.y;
  }

  function drawEdges(layout, sizes, pathIds) {
    var pathEdges = Object.create(null);
    for (var index = 0; index < pathIds.length - 1; index += 1) {
      pathEdges[edgeKey(pathIds[index], pathIds[index + 1])] = true;
    }

    graph.edges.forEach(function (edge) {
      if (!layout.positions[edge.from] || !layout.positions[edge.to]) return;
      var path = svgElement("path", { d: edgeCurve(edge, layout, sizes) });
      path.classList.add("edge");
      path.classList.add(edge.kind === Engine.REQUIRED ? "edge-required" : "edge-related");
      if (edge.kind === Engine.REQUIRED && pathEdges[edgeKey(edge.from, edge.to)]) {
        path.classList.add("is-on-path");
      }
      edgeLayer.appendChild(path);
    });
  }

  function drawSignal(group, status, size) {
    var circle = svgElement("circle", {
      cx: -size.width / 2 + 18,
      cy: 0,
      r: status === "learnable" ? 6 : 5,
      class: "node-signal"
    });
    group.appendChild(circle);

    if (status === "mastered") {
      var check = svgElement("path", {
        d: "M " + (-size.width / 2 + 21) + " -2 l 3 3 l 6 -7",
        fill: "none",
        stroke: "#29444e",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: "node-signal"
      });
      group.appendChild(check);
    }
  }

  function drawNode(node, nodeState, layout, size, pathIds) {
    var point = layout.positions[node.id];
    var group = svgElement("g", {
      transform: "translate(" + point.x + " " + point.y + ")",
      tabindex: "0",
      role: "button",
      "aria-label": node.label + "，" + stateName(nodeState.status)
    });
    group.classList.add("node", "node-" + nodeState.status);
    if (pathIds.indexOf(node.id) !== -1) group.classList.add("is-on-path");
    if (node.id === activeTargetId) group.classList.add("is-active");

    var card = svgElement("rect", {
      x: -size.width / 2,
      y: -size.height / 2,
      width: size.width,
      height: size.height,
      rx: size.height / 2,
      class: "node-card"
    });
    group.appendChild(card);
    drawSignal(group, nodeState.status, size);

    var text = svgElement("text", { class: "node-label" });
    size.lines.forEach(function (line, lineIndex) {
      var tspan = svgElement("tspan", {
        x: size.lines.length === 1 ? 8 : 9,
        dy: lineIndex === 0 ? (size.lines.length === 1 ? 5 : -2) : 20
      });
      tspan.textContent = line;
      text.appendChild(tspan);
    });
    group.appendChild(text);

    function activateNode() {
      activeTargetId = node.id;
      pathTargetId = pathTargetId === node.id ? null : node.id;
      setFeedback("");
      render();
      entryInput.focus();
    }

    group.addEventListener("click", activateNode);
    group.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateNode();
      }
    });
    nodeLayer.appendChild(group);
  }

  function updateEntry() {
    var hasConcepts = graph.nodes.length > 0;
    stage.classList.toggle("has-concepts", hasConcepts);
    sampleTrigger.hidden = hasConcepts;

    if (!hasConcepts) {
      entryQuestion.textContent = "先写下你要弄懂的第一个概念";
      entrySubmit.textContent = "写进图里";
      entryInput.placeholder = "";
      entrySubmit.disabled = false;
      return;
    }

    var target = nodeById(activeTargetId) || graph.nodes[0];
    activeTargetId = target.id;
    entryQuestion.textContent = "“" + target.label + "”需要先会什么？";
    entrySubmit.textContent = "接到它前面";
    entryInput.placeholder = "写下一个先修概念";
    entrySubmit.disabled = false;
  }

  function render() {
    var analysis = Engine.analyze(graph.nodes, graph.edges, graph.threshold);
    var learnableCount = analysis.learning.states.filter(function (state) {
      return state.status === "learnable";
    }).length;
    var layout = buildLayout(analysis);
    var pathIds = shortestRequiredPath(pathTargetId);
    var sizes = Object.create(null);

    graph.nodes.forEach(function (node) { sizes[node.id] = nodeSize(node); });
    summary.textContent = "现在可以学 " + learnableCount + " 个概念";
    canvas.classList.toggle("is-path-mode", pathIds.length > 1);
    canvas.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
    canvas.style.width = layout.width + "px";
    canvas.style.height = layout.height + "px";
    gridField.setAttribute("width", layout.width);
    gridField.setAttribute("height", layout.height);

    clearLayer(edgeLayer);
    clearLayer(nodeLayer);
    drawEdges(layout, sizes, pathIds);
    graph.nodes.forEach(function (node) {
      drawNode(node, stateById(analysis, node.id), layout, sizes[node.id], pathIds);
    });
    updateEntry();
  }

  function freshId() {
    var id;
    do {
      id = "concept-" + nextConceptNumber;
      nextConceptNumber += 1;
    } while (nodeById(id));
    return id;
  }

  function makeConcept(label) {
    return {
      id: freshId(),
      label: label,
      minutes: 30,
      mastery: 0,
      daysSinceReview: 0
    };
  }

  function findConceptByLabel(label) {
    var normalized = label.toLocaleLowerCase("zh-CN");
    return graph.nodes.filter(function (node) {
      return node.label.toLocaleLowerCase("zh-CN") === normalized;
    })[0] || null;
  }

  function addFirstConcept(label) {
    var concept = makeConcept(label);
    graph.nodes.push(concept);
    activeTargetId = concept.id;
    pathTargetId = null;
  }

  function addPrerequisite(label) {
    var target = nodeById(activeTargetId) || graph.nodes[0];
    var prerequisite = findConceptByLabel(label);
    var isNew = !prerequisite;

    if (isNew) {
      if (graph.nodes.length >= MAX_CONCEPTS) {
        setFeedback("这张图已经放不下更多概念了。");
        return false;
      }
      prerequisite = makeConcept(label);
    }

    if (prerequisite.id === target.id) {
      setFeedback("一个概念不能把自己当作先修。");
      return false;
    }

    var duplicate = graph.edges.some(function (edge) {
      return edge.from === prerequisite.id && edge.to === target.id && edge.kind === Engine.REQUIRED;
    });
    if (duplicate) {
      setFeedback("这条先修关系已经在图里了。");
      return false;
    }

    var candidateNodes = isNew ? graph.nodes.concat(prerequisite) : graph.nodes.slice();
    var candidateEdge = {
      from: prerequisite.id,
      to: target.id,
      kind: Engine.REQUIRED,
      label: "必修先修"
    };
    var candidateEdges = graph.edges.concat(candidateEdge);
    var order = Engine.kahnLayers(candidateNodes, candidateEdges);

    if (!order.acyclic) {
      var cycleLabels = order.cycleNodes.map(function (id) {
        var node = candidateNodes.filter(function (item) { return item.id === id; })[0];
        return node ? node.label : id;
      });
      setFeedback("这会形成循环先修：" + cycleLabels.join("、") + " 无法排出先后。");
      return false;
    }

    if (isNew) graph.nodes.push(prerequisite);
    graph.edges.push(candidateEdge);
    activeTargetId = prerequisite.id;
    pathTargetId = null;
    return true;
  }

  function submitEntry(event) {
    event.preventDefault();
    var label = entryInput.value.trim();
    setFeedback("");

    if (!label) {
      setFeedback(graph.nodes.length ? "先写下一个先修概念。" : "先写下第一个概念。");
      entryInput.focus();
      return;
    }

    var changed;
    if (graph.nodes.length === 0) {
      addFirstConcept(label);
      changed = true;
    } else {
      changed = addPrerequisite(label);
    }

    if (changed) {
      entryInput.value = "";
      render();
    }
    entryInput.focus();
  }

  function loadSample() {
    graph = Engine.defaultGraph();
    activeTargetId = graph.nodes[0].id;
    pathTargetId = null;
    nextConceptNumber = 1;
    setFeedback("");
    entryInput.value = "";
    render();
    entryInput.focus();
  }

  if (!Engine) {
    setFeedback("概念图暂时无法打开。");
    entryInput.disabled = true;
    entrySubmit.disabled = true;
    sampleTrigger.disabled = true;
    return;
  }

  entryForm.addEventListener("submit", submitEntry);
  sampleTrigger.addEventListener("click", loadSample);
  window.addEventListener("resize", function () {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      render();
    });
  });

  render();
  entryInput.focus();
})();
