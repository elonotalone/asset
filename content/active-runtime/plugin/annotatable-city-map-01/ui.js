(function () {
  "use strict";

  var E = window.CityMapEngine;
  var NS = "http://www.w3.org/2000/svg";
  var MARGIN_PX = 130;
  var GRID_STEPS_M = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  var LABEL_SLOTS = [
    { dx: 20, dy: 6, anchor: "start" },
    { dx: 20, dy: -14, anchor: "start" },
    { dx: -20, dy: 6, anchor: "end" },
    { dx: -20, dy: -14, anchor: "end" },
    { dx: 0, dy: -26, anchor: "middle" },
    { dx: 0, dy: 32, anchor: "middle" },
    { dx: 20, dy: 26, anchor: "start" },
    { dx: -20, dy: 26, anchor: "end" }
  ];

  var state = {
    places: [],
    selected: -1,
    view: { w: 1200, h: 750, pxPerM: 0.3, center: null }
  };
  var els = {};

  function svg(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function coordinates() {
    return state.places.map(function (place) { return place.coordinate; });
  }

  function measureViewport() {
    var rect = els.city.getBoundingClientRect();
    state.view.w = rect.width > 40 ? Math.round(rect.width) : 1200;
    state.view.h = rect.height > 40 ? Math.round(rect.height) : 750;
    els.plane.setAttribute("viewBox", "0 0 " + state.view.w + " " + state.view.h);
  }

  function fitView() {
    var points = coordinates();
    var v = state.view;
    v.center = E.centerOf(points);
    if (!v.center) {
      v.pxPerM = 0.3;
      return;
    }
    var locals = points.map(function (point) { return E.projectLocal(point, v.center); });
    var east = locals.map(function (local) { return local.eastM; });
    var north = locals.map(function (local) { return local.northM; });
    var spanEast = Math.max.apply(null, east) - Math.min.apply(null, east);
    var spanNorth = Math.max.apply(null, north) - Math.min.apply(null, north);
    var usableW = Math.max(160, v.w - MARGIN_PX * 2);
    var usableH = Math.max(160, v.h - MARGIN_PX * 2 - 60);
    var scaleEast = spanEast > 0 ? usableW / spanEast : Infinity;
    var scaleNorth = spanNorth > 0 ? usableH / spanNorth : Infinity;
    var pxPerM = Math.min(scaleEast, scaleNorth);
    v.pxPerM = isFinite(pxPerM) ? Math.max(0.0004, Math.min(4, pxPerM)) : 0.3;
  }

  function toScreen(point) {
    var v = state.view;
    var local = E.projectLocal(point, v.center);
    if (!local) return null;
    return {
      x: v.w / 2 + local.eastM * v.pxPerM,
      y: v.h / 2 - local.northM * v.pxPerM
    };
  }

  function gridStepM() {
    var step = GRID_STEPS_M[0];
    for (var i = 0; i < GRID_STEPS_M.length; i++) {
      if (GRID_STEPS_M[i] * state.view.pxPerM <= 170) step = GRID_STEPS_M[i];
    }
    return step;
  }

  function renderGrid() {
    clear(els.grid);
    var v = state.view;
    var step = gridStepM();
    var pitch = step * v.pxPerM;
    if (pitch < 8) return;
    var index;
    for (index = 0; v.w / 2 + index * pitch <= v.w; index++) {
      [v.w / 2 + index * pitch, v.w / 2 - index * pitch].forEach(function (x) {
        if (x < 0 || x > v.w) return;
        els.grid.appendChild(svg("line", {
          "class": index % 5 === 0 ? "grid-major" : "grid-minor",
          x1: x.toFixed(1), y1: 0, x2: x.toFixed(1), y2: v.h
        }));
      });
    }
    for (index = 0; v.h / 2 + index * pitch <= v.h; index++) {
      [v.h / 2 + index * pitch, v.h / 2 - index * pitch].forEach(function (y) {
        if (y < 0 || y > v.h) return;
        els.grid.appendChild(svg("line", {
          "class": index % 5 === 0 ? "grid-major" : "grid-minor",
          x1: 0, y1: y.toFixed(1), x2: v.w, y2: y.toFixed(1)
        }));
      });
    }
  }

  function renderEnclosed() {
    clear(els.area);
    if (state.places.length < 3) return;
    // 路线自己打了结（8 字形）就围不出一块地，这时不报面积。
    if (!E.ringIsSimple(coordinates())) return;
    var screens = coordinates().map(toScreen);
    var area = E.polygonArea(coordinates());
    if (area === null) return;
    els.area.appendChild(svg("polygon", {
      "class": "enclosed",
      points: screens.map(function (point) { return point.x.toFixed(1) + "," + point.y.toFixed(1); }).join(" ")
    }));
    var cx = screens.reduce(function (sum, point) { return sum + point.x; }, 0) / screens.length;
    var cy = screens.reduce(function (sum, point) { return sum + point.y; }, 0) / screens.length;
    els.area.appendChild(svg("text", {
      "class": "enclosed-area", x: cx.toFixed(1), y: cy.toFixed(1)
    }, "围出 " + E.formatArea(area)));
  }

  function renderRoute() {
    clear(els.route);
    if (state.places.length < 2) return;
    var screens = coordinates().map(toScreen);
    els.route.appendChild(svg("polyline", {
      "class": "route",
      points: screens.map(function (point) { return point.x.toFixed(1) + "," + point.y.toFixed(1); }).join(" ")
    }));
    var route = E.routeSegments(coordinates());
    for (var i = 1; i < screens.length; i++) {
      var a = screens[i - 1];
      var b = screens[i];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var length = Math.sqrt(dx * dx + dy * dy);
      if (length < 46) continue;
      var angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      var mx = (a.x + b.x) / 2 - dy / length * 12;
      var my = (a.y + b.y) / 2 + dx / length * 12;
      els.route.appendChild(svg("text", {
        "class": "segment", x: mx.toFixed(1), y: my.toFixed(1), "dominant-baseline": "middle",
        transform: "rotate(" + angle.toFixed(2) + " " + mx.toFixed(1) + " " + my.toFixed(1) + ")"
      }, E.formatDistance(route.rows[i].segmentM)));
    }
  }

  /* 标签避让：文字可以挪，地点本身不许动。 */
  function textWidth(text, size) {
    var width = 0;
    for (var i = 0; i < text.length; i++) {
      width += text.charCodeAt(i) > 0x2e80 ? size : size * 0.56;
    }
    return width;
  }

  function overlaps(a, b) {
    return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  }

  function segmentsIntersect(p1, p2, q1, q2) {
    function side(a, b, c) {
      var value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
      return value > 0 ? 1 : value < 0 ? -1 : 0;
    }
    return side(p1, p2, q1) !== side(p1, p2, q2) && side(q1, q2, p1) !== side(q1, q2, p2);
  }

  /* 名字压在路线上就读不出来了，所以路线也算障碍物。 */
  function crossesBox(a, b, box) {
    if (a.x >= box.x1 && a.x <= box.x2 && a.y >= box.y1 && a.y <= box.y2) return true;
    if (b.x >= box.x1 && b.x <= box.x2 && b.y >= box.y1 && b.y <= box.y2) return true;
    var corners = [
      { x: box.x1, y: box.y1 }, { x: box.x2, y: box.y1 },
      { x: box.x2, y: box.y2 }, { x: box.x1, y: box.y2 }
    ];
    for (var i = 0; i < 4; i++) {
      if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
    }
    return false;
  }

  function renderPlaces() {
    clear(els.places);
    clear(els.labels);
    var taken = [];
    var screens = coordinates().map(toScreen);
    screens.forEach(function (point) {
      taken.push({ x1: point.x - 16, y1: point.y - 16, x2: point.x + 16, y2: point.y + 16 });
    });
    var legs = [];
    for (var leg = 1; leg < screens.length; leg++) legs.push([screens[leg - 1], screens[leg]]);

    state.places.forEach(function (place, index) {
      var point = screens[index];
      var selected = index === state.selected;
      var group = svg("g", {
        "class": "stop-group", "data-index": String(index), role: "button", tabindex: "0",
        "aria-label": place.name
      });
      group.appendChild(svg("circle", {
        "class": selected ? "stop stop-selected" : "stop",
        cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 14
      }));
      group.appendChild(svg("text", {
        "class": "stop-index", x: point.x.toFixed(1), y: point.y.toFixed(1)
      }, String(index + 1)));
      function activate() { select(index); }
      group.addEventListener("click", activate);
      group.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
      });
      els.places.appendChild(group);

      var size = 18;
      var width = textWidth(place.name, size);
      var slot = LABEL_SLOTS[0];
      var box = null;
      for (var i = 0; i < LABEL_SLOTS.length; i++) {
        var candidate = LABEL_SLOTS[i];
        var left = candidate.anchor === "start" ? point.x + candidate.dx
          : candidate.anchor === "end" ? point.x + candidate.dx - width
            : point.x - width / 2;
        var trial = {
          x1: left - 3, y1: point.y + candidate.dy - size,
          x2: left + width + 3, y2: point.y + candidate.dy + 5
        };
        if (trial.x1 < 6 || trial.x2 > state.view.w - 6 || trial.y1 < 6 || trial.y2 > state.view.h - 84) continue;
        if (taken.some(function (item) { return overlaps(item, trial); })) continue;
        if (legs.some(function (item) { return crossesBox(item[0], item[1], trial); })) continue;
        slot = candidate;
        box = trial;
        break;
      }
      if (!box) {
        var fallbackLeft = point.x + slot.dx;
        box = { x1: fallbackLeft - 3, y1: point.y + slot.dy - size, x2: fallbackLeft + width + 3, y2: point.y + slot.dy + 5 };
      }
      taken.push(box);
      els.labels.appendChild(svg("text", {
        "class": selected ? "stop-name stop-name-selected" : "stop-name",
        x: (point.x + slot.dx).toFixed(1),
        y: (point.y + slot.dy).toFixed(1),
        "text-anchor": slot.anchor,
        "data-index": String(index)
      }, place.name));
    });
  }

  function renderMarks() {
    clear(els.marks);
    var v = state.view;
    var step = gridStepM();
    var width = step * v.pxPerM;
    if (!(width > 12)) return;
    var x2 = v.w - 36;
    var x1 = x2 - width;
    var y = v.h - 34;
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x1.toFixed(1), y1: y, x2: x2, y2: y }));
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x1.toFixed(1), y1: y - 6, x2: x1.toFixed(1), y2: y + 6 }));
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x2, y1: y - 6, x2: x2, y2: y + 6 }));
    els.marks.appendChild(svg("text", {
      "class": "scale-text", x: ((x1 + x2) / 2).toFixed(1), y: y - 12, "text-anchor": "middle"
    }, step >= 1000 ? (step / 1000) + " km" : step + " m"));

    var nx = v.w - 48;
    els.marks.appendChild(svg("text", { "class": "north-text", x: nx, y: 34 }, "N"));
    els.marks.appendChild(svg("path", {
      "class": "north-mark",
      d: "M " + nx + " 44 L " + (nx - 9) + " 70 L " + nx + " 63 L " + (nx + 9) + " 70 Z"
    }));
    els.marks.appendChild(svg("line", { "class": "north-stem", x1: nx, y1: 63, x2: nx, y2: 86 }));
  }

  function renderHeadline() {
    clear(els.total);
    if (state.places.length < 2) return;
    var total = E.routeLength(coordinates());
    var shown = E.formatDistance(total).split(" ");
    var unit = shown.pop();
    els.total.appendChild(document.createTextNode("直线总长"));
    var value = document.createElement("strong");
    value.textContent = shown.join(" ");
    els.total.appendChild(value);
    var unitNode = document.createElement("em");
    unitNode.textContent = unit;
    els.total.appendChild(unitNode);
  }

  function renderAdvice() {
    clear(els.advice);
    els.advice.hidden = true;
    if (state.places.length < 3) return;
    var saving = E.orderSaving(coordinates());
    if (!saving || saving.savingM <= 0) return;
    var names = saving.order.map(function (index) { return state.places[index].name; });
    els.advice.hidden = false;
    els.advice.appendChild(document.createTextNode(
      "这个顺序多走 " + E.formatDistance(saving.savingM) + "；" + names.join(" → ") + " 更短"
    ));
    var button = document.createElement("button");
    button.type = "button";
    button.id = "apply-order";
    button.textContent = "换成这个顺序";
    button.addEventListener("click", function () {
      state.places = saving.order.map(function (index) { return state.places[index]; });
      state.selected = -1;
      hideTag();
      fitView();
      render();
      cue("顺序已经换成走得最短的那一个。");
    });
    els.advice.appendChild(button);
  }

  function render() {
    renderGrid();
    renderEnclosed();
    renderRoute();
    renderPlaces();
    renderMarks();
    renderHeadline();
    renderAdvice();
  }

  function cue(text) { els.cue.textContent = text || ""; }

  function hideTag() {
    els.tag.hidden = true;
    clear(els.tag);
  }

  function placeTag(point) {
    var v = state.view;
    els.tag.style.left = Math.max(12, Math.min(v.w - 330, point.x + 20)) + "px";
    els.tag.style.top = Math.max(12, Math.min(v.h - 130, point.y + 18)) + "px";
    els.tag.hidden = false;
  }

  function showTag(index) {
    var place = state.places[index];
    if (!place) return;
    clear(els.tag);
    var input = document.createElement("input");
    input.id = "stop-name";
    input.type = "text";
    input.value = place.name;
    input.setAttribute("aria-label", "这一站叫什么");
    input.addEventListener("input", function () {
      place.name = input.value.trim() || place.name;
      renderPlaces();
      renderAdvice();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { state.selected = -1; hideTag(); render(); els.paste.focus(); }
    });
    els.tag.appendChild(input);
    var drop = document.createElement("button");
    drop.type = "button";
    drop.id = "drop-stop";
    drop.textContent = "撤回「" + place.name + "」";
    drop.addEventListener("click", function () {
      state.places.splice(index, 1);
      state.selected = -1;
      hideTag();
      fitView();
      render();
      cue(state.places.length ? "已经撤回那一站。" : "");
      els.paste.focus();
    });
    els.tag.appendChild(drop);
    var point = toScreen(place.coordinate);
    placeTag(point || { x: state.view.w / 2, y: state.view.h / 2 });
    input.select();
  }

  function select(index) {
    state.selected = index;
    render();
    showTag(index);
  }

  function addPlace() {
    var parsed = E.parseLocationInput(els.paste.value);
    if (!parsed) {
      cue("这段文字里读不出坐标。地图链接整条粘进来就行。");
      els.paste.focus();
      return;
    }
    var name = els.place.value.trim();
    if (!name) {
      cue("还差一个名字：这一站你叫它什么？");
      els.place.focus();
      return;
    }
    state.places.push({ name: name, coordinate: parsed.coordinate });
    els.paste.value = "";
    els.place.value = "";
    state.selected = state.places.length - 1;
    fitView();
    render();
    showTag(state.selected);
    cue("从" + parsed.from + "读到了它的位置。");
    els.paste.focus();
  }

  function mount() {
    els.city = document.getElementById("city");
    els.plane = document.getElementById("plane");
    els.grid = document.getElementById("grid-layer");
    els.area = document.getElementById("area-layer");
    els.route = document.getElementById("route-layer");
    els.places = document.getElementById("place-layer");
    els.labels = document.getElementById("label-layer");
    els.marks = document.getElementById("mark-layer");
    els.total = document.getElementById("total");
    els.advice = document.getElementById("advice");
    els.tag = document.getElementById("tag");
    els.cue = document.getElementById("cue");
    els.paste = document.getElementById("paste");
    els.place = document.getElementById("place-name");

    measureViewport();
    fitView();
    render();

    document.getElementById("entry").addEventListener("submit", function (event) {
      event.preventDefault();
      addPlace();
    });
    els.labels.addEventListener("click", function (event) {
      var index = event.target.getAttribute && event.target.getAttribute("data-index");
      if (index !== null && index !== undefined) select(Number(index));
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      state.selected = -1;
      hideTag();
      render();
    });
    window.addEventListener("resize", function () {
      measureViewport();
      fitView();
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
