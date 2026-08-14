(function () {
  "use strict";

  var E = window.RelationshipGraphEngine;
  var NS = "http://www.w3.org/2000/svg";
  var NAME_SIZE = 18;
  var PLATE_HEIGHT = 44;
  var PLATE_PADDING = 17;

  var state = {
    nodes: [],
    edges: [],
    positions: null,
    ends: [],
    view: { w: 1200, h: 750 },
    lastAdded: null
  };
  var els = {};

  function svg(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* 牌面宽度按名字实际宽度算：名字是这张图上唯一不许被挤掉的东西。 */
  function textWidth(text, size) {
    var width = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      width += code > 0x2e80 ? size : size * 0.56;
    }
    return width;
  }

  function plateSizes() {
    var sizes = Object.create(null);
    state.nodes.forEach(function (node) {
      sizes[node.id] = {
        w: Math.round(textWidth(node.label, NAME_SIZE) + PLATE_PADDING * 2),
        h: PLATE_HEIGHT
      };
    });
    return sizes;
  }

  function measureViewport() {
    var rect = els.table.getBoundingClientRect();
    state.view.w = rect.width > 40 ? Math.round(rect.width) : 1200;
    state.view.h = rect.height > 40 ? Math.round(rect.height) : 750;
    els.web.setAttribute("viewBox", "0 0 " + state.view.w + " " + state.view.h);
  }

  function relayout(keepPlaces) {
    state.positions = E.layoutClusters(state.nodes, state.edges, {
      width: state.view.w,
      height: state.view.h - 120,
      sizes: plateSizes(),
      margin: 74,
      seed: keepPlaces ? state.positions : null
    }).positions;
    Object.keys(state.positions).forEach(function (id) {
      state.positions[id].y += 36;
    });
  }

  function nodeById(id) {
    return state.nodes.filter(function (node) { return node.id === id; })[0] || null;
  }

  function currentPath() {
    if (state.ends.length !== 2) return null;
    return E.shortestPath(state.nodes, state.edges, state.ends[0], state.ends[1]);
  }

  /* ---------- 画 ---------- */
  /* 线要停在牌的边上，不许钻到牌底下 —— 否则方向箭头会被牌面压住，用户读不出方向。 */
  function plateEdge(centre, size, towards) {
    var dx = towards.x - centre.x;
    var dy = towards.y - centre.y;
    if (!dx && !dy) return { x: centre.x, y: centre.y };
    var halfW = size.w / 2 + 5;
    var halfH = size.h / 2 + 5;
    var scale = Math.min(
      dx === 0 ? Infinity : Math.abs(halfW / dx),
      dy === 0 ? Infinity : Math.abs(halfH / dy)
    );
    if (!isFinite(scale)) scale = 1;
    return { x: centre.x + dx * scale, y: centre.y + dy * scale };
  }

  function curveOf(edge, mark, sizes) {
    var from = state.positions[edge.from];
    var to = state.positions[edge.to];
    var control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    if (mark.count >= 2) {
      // 同一对对象之间的多条关系向两侧弯开，各自承载自己的关系名。
      var dx = to.x - from.x;
      var dy = to.y - from.y;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var offset = (mark.index - (mark.count - 1) / 2) * 60;
      control = { x: control.x - dy / length * offset, y: control.y + dx / length * offset };
    }
    var a = plateEdge(from, sizes[edge.from], control);
    var b = plateEdge(to, sizes[edge.to], control);
    return { a: a, b: b, cx: control.x, cy: control.y };
  }

  function boxesOverlap(a, b) {
    return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  }

  /* 关系名不许被牌面压住，也不许两条关系名叠在一起（设计文档 §6）。
   * 先试曲线正中，压住了就沿线前后挪、再往两侧让开；一路让不开时取最后一个位置。 */
  function pointOnCurve(shape, t) {
    var u = 1 - t;
    return {
      x: u * u * shape.a.x + 2 * u * t * shape.cx + t * t * shape.b.x,
      y: u * u * shape.a.y + 2 * u * t * shape.cy + t * t * shape.b.y
    };
  }

  function overlapArea(a, b) {
    var wide = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    var high = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return wide > 0 && high > 0 ? wide * high : 0;
  }

  function captionSpot(shape, caption, taken) {
    var width = textWidth(caption, 15);
    var slides = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.14, 0.86];
    var lifts = [0, -24, 24, -44, 44, -66, 66];
    var sides = [0, -1, 1];
    var best = null;
    for (var s = 0; s < slides.length; s++) {
      for (var l = 0; l < lifts.length; l++) {
        for (var h = 0; h < sides.length; h++) {
          var at = pointOnCurve(shape, slides[s]);
          var cx = at.x + sides[h] * (width / 2 + 16);
          var cy = at.y + lifts[l];
          var candidate = {
            x: cx, y: cy, width: width,
            box: { x1: cx - width / 2 - 7, x2: cx + width / 2 + 7, y1: cy - 14, y2: cy + 9 }
          };
          var damage = 0;
          for (var t = 0; t < taken.length; t++) damage += overlapArea(taken[t], candidate.box);
          if (damage === 0) return candidate;
          if (!best || damage < best.damage) {
            candidate.damage = damage;
            best = candidate;
          }
        }
      }
    }
    return best;
  }

  function renderEdges(path) {
    clear(els.edges);
    clear(els.relations);
    var marks = E.parallelIndex(state.edges);
    var sizes = plateSizes();
    // 牌面先占位：关系名要绕开它们。
    var taken = state.nodes.map(function (node) {
      var at = state.positions[node.id];
      var size = sizes[node.id];
      return {
        x1: at.x - size.w / 2 - 4, x2: at.x + size.w / 2 + 4,
        y1: at.y - size.h / 2 - 4, y2: at.y + size.h / 2 + 4
      };
    });
    var lit = Object.create(null);
    if (path) {
      path.steps.forEach(function (step) {
        step.edges.forEach(function (edge) {
          lit[[edge.from, edge.label, edge.to, edge.date || ""].join("\u0000")] = true;
        });
      });
    }

    state.edges.forEach(function (edge, index) {
      var shape = curveOf(edge, marks[index], sizes);
      var isLit = lit[[edge.from, edge.label, edge.to, edge.date || ""].join("\u0000")] === true;
      var directed = !E.isSymmetric(edge.label);
      var attrs = {
        "class": isLit ? "relation-line relation-line-lit" : "relation-line",
        d: "M " + shape.a.x.toFixed(1) + " " + shape.a.y.toFixed(1) +
          " Q " + shape.cx.toFixed(1) + " " + shape.cy.toFixed(1) +
          " " + shape.b.x.toFixed(1) + " " + shape.b.y.toFixed(1)
      };
      if (directed) attrs["marker-end"] = isLit ? "url(#arrow-lit)" : "url(#arrow)";
      els.edges.appendChild(svg("path", attrs));

      var caption = edge.label + (edge.date ? "　" + edge.date : "");
      var spot = captionSpot(shape, caption, taken);
      taken.push(spot.box);
      els.relations.appendChild(svg("rect", {
        "class": "relation-plate",
        x: (spot.x - spot.width / 2 - 6).toFixed(1), y: (spot.y - 13).toFixed(1),
        width: (spot.width + 12).toFixed(1), height: 21, rx: 3
      }));
      els.relations.appendChild(svg("text", {
        "class": isLit ? "relation-name relation-name-lit" : "relation-name",
        x: spot.x.toFixed(1), y: (spot.y + 2).toFixed(1)
      }, caption));
    });
  }

  function renderNodes(path) {
    clear(els.nodes);
    var sizes = plateSizes();
    var role = Object.create(null);
    if (path) {
      path.ids.forEach(function (id, position) {
        role[id] = position === 0 || position === path.ids.length - 1 ? "end" : "via";
      });
    }
    state.ends.forEach(function (id) { if (!role[id]) role[id] = "end"; });

    state.nodes.forEach(function (node) {
      var at = state.positions[node.id];
      if (!at) return;
      var size = sizes[node.id];
      var group = svg("g", {
        "class": "object-group", "data-id": node.id, role: "button", tabindex: "0",
        "aria-label": node.label
      });
      var plateClass = "plate";
      if (node.type) plateClass += " plate-" + node.type;
      if (role[node.id] === "end") plateClass += " plate-end";
      else if (role[node.id] === "via") plateClass += " plate-via";
      group.appendChild(svg("rect", {
        "class": plateClass,
        x: (at.x - size.w / 2).toFixed(1), y: (at.y - size.h / 2).toFixed(1),
        width: size.w, height: size.h,
        rx: node.type === E.PERSON ? 20 : 3
      }));
      group.appendChild(svg("text", {
        "class": role[node.id] ? "object-name object-name-lit" : "object-name",
        x: at.x.toFixed(1), y: at.y.toFixed(1)
      }, node.label));
      group.addEventListener("click", function () { pick(node.id); });
      group.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(node.id); }
      });
      els.nodes.appendChild(group);
    });
  }

  /* 头号结论：起点、每一名中介、终点，以及沿途每一段关系，都是可以手动选中的字。 */
  function renderConclusion(path) {
    clear(els.conclusion);
    if (state.ends.length === 0) return;
    if (state.ends.length === 1) {
      var only = nodeById(state.ends[0]);
      if (!only) return;
      var head = document.createElement("strong");
      head.textContent = only.label;
      els.conclusion.appendChild(head);
      els.conclusion.appendChild(document.createTextNode(" 已经是这一头"));
      return;
    }
    var from = nodeById(state.ends[0]);
    var to = nodeById(state.ends[1]);
    if (!from || !to) return;
    if (!path) {
      var left = document.createElement("strong");
      left.textContent = from.label;
      els.conclusion.appendChild(left);
      els.conclusion.appendChild(document.createTextNode(" 和 "));
      var right = document.createElement("strong");
      right.textContent = to.label;
      els.conclusion.appendChild(right);
      els.conclusion.appendChild(document.createTextNode(" 之间，材料里没有连上的关系"));
      return;
    }
    path.ids.forEach(function (id, position) {
      var name = document.createElement("strong");
      name.textContent = nodeById(id).label;
      els.conclusion.appendChild(name);
      if (position >= path.steps.length) return;
      var relation = document.createElement("em");
      relation.textContent = " —" + path.steps[position].labels.join("／") + "→ ";
      els.conclusion.appendChild(relation);
    });
    var count = document.createElement("span");
    count.className = "count";
    count.textContent = "　" + path.length + " 段关系，" +
      (path.intermediaries ? path.intermediaries + " 名中介" : "没有中介");
    els.conclusion.appendChild(count);
  }

  function render() {
    var path = currentPath();
    renderEdges(path);
    renderNodes(path);
    renderConclusion(path);
  }

  function cue(text, undo) {
    clear(els.cue);
    els.cue.appendChild(document.createTextNode(text || ""));
    if (!undo) return;
    var button = document.createElement("button");
    button.type = "button";
    button.id = "undo";
    button.textContent = "撤回这一条";
    button.addEventListener("click", undoLast);
    els.cue.appendChild(button);
  }

  function pick(id) {
    if (state.ends.length === 2 || state.ends.indexOf(id) >= 0) state.ends = [];
    state.ends.push(id);
    render();
    if (state.ends.length === 1) cue("再点一个对象，看看两者通过谁连上");
    else cue("点别的对象换一头");
  }

  function undoLast() {
    if (!state.lastAdded) return;
    state.nodes = state.lastAdded.nodes;
    state.edges = state.lastAdded.edges;
    state.ends = state.ends.filter(function (id) { return nodeById(id); });
    state.lastAdded = null;
    relayout(true);
    render();
    cue(state.edges.length ? "已经撤回那一条" : "写下谁、什么关系、和谁");
  }

  function addRelation() {
    var result = E.addRelation(state.nodes, state.edges, {
      from: els.from.value,
      label: els.relation.value,
      to: els.to.value,
      date: els.date.value
    });
    if (result.error) {
      cue(result.error);
      return;
    }
    state.lastAdded = { nodes: state.nodes, edges: state.edges };
    state.nodes = result.nodes;
    state.edges = result.edges;
    // 第一条关系落下时，它的两端自动成为当前这一问的两头。
    if (state.edges.length === 1) state.ends = [result.edge.from, result.edge.to];
    relayout(true);
    render();
    var written = els.from.value.trim() + " " + els.relation.value.trim() + " " + els.to.value.trim();
    els.from.value = "";
    els.relation.value = "";
    els.to.value = "";
    els.date.value = "";
    els.from.focus();
    cue("已记下：" + written, true);
  }

  function mount() {
    els.table = document.getElementById("table");
    els.web = document.getElementById("web");
    els.edges = document.getElementById("edge-layer");
    els.relations = document.getElementById("relation-layer");
    els.nodes = document.getElementById("node-layer");
    els.conclusion = document.getElementById("conclusion");
    els.cue = document.getElementById("cue");
    els.from = document.getElementById("from");
    els.relation = document.getElementById("relation");
    els.to = document.getElementById("to");
    els.date = document.getElementById("date");

    measureViewport();
    relayout(false);
    render();

    document.getElementById("entry").addEventListener("submit", function (event) {
      event.preventDefault();
      addRelation();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      state.ends = [];
      render();
      cue(state.edges.length ? "写下下一条关系，或点两个对象看它们怎么连上" : "写下谁、什么关系、和谁");
    });
    window.addEventListener("resize", function () {
      measureViewport();
      relayout(true);
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
