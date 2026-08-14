(function () {
  "use strict";

  var E = window.FloorplanEngine;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var VIEW_W = 900;
  var VIEW_H = 520;
  var ORIGIN_X = 80;
  var ORIGIN_Y = 440;
  var PX_PER_M = 50;
  var MAGNET_MM = 150;
  var state = { walls: [], drawing: null };
  var els = {};

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function node(tag, cls, value) {
    var item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = String(value);
    return item;
  }
  function svgNode(tag, attrs, value) {
    var item = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { item.setAttribute(key, attrs[key]); });
    if (value !== undefined) item.textContent = String(value);
    return item;
  }
  function screenPoint(point) {
    return { x: ORIGIN_X + point.xMm / 1000 * PX_PER_M, y: ORIGIN_Y - point.yMm / 1000 * PX_PER_M };
  }
  function coordinateText(point) {
    return "(" + E.millimetersToMeters(point.xMm).toFixed(2) + ", " +
      E.millimetersToMeters(point.yMm).toFixed(2) + ")";
  }
  function allEndpoints() {
    var points = [];
    state.walls.forEach(function (wall) { points.push(wall.start, wall.end); });
    return points;
  }
  function magnetize(point) {
    var best = null;
    var bestDistance = Infinity;
    allEndpoints().forEach(function (candidate) {
      var dx = point.xMm - candidate.xMm;
      var dy = point.yMm - candidate.yMm;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= MAGNET_MM && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best ? { xMm: best.xMm, yMm: best.yMm } : point;
  }
  function eventPoint(event) {
    var rect = els.paper.getBoundingClientRect();
    var x = event.clientX;
    var y = event.clientY;
    if (rect.width > 0 && rect.height > 0) {
      x = (event.clientX - rect.left) * VIEW_W / rect.width;
      y = (event.clientY - rect.top) * VIEW_H / rect.height;
    }
    return magnetize(E.pointFromMeters((x - ORIGIN_X) / PX_PER_M, (ORIGIN_Y - y) / PX_PER_M));
  }

  function showPreview(start, end) {
    var a = screenPoint(start);
    var b = screenPoint(end);
    els.preview.setAttribute("x1", a.x);
    els.preview.setAttribute("y1", a.y);
    els.preview.setAttribute("x2", b.x);
    els.preview.setAttribute("y2", b.y);
    els.preview.style.display = E.samePoint(start, end) ? "none" : "block";
  }

  function beginDraw(event) {
    if (event.button !== 0) return;
    var point = eventPoint(event);
    state.drawing = { start: point, end: point };
    showPreview(point, point);
    els.pointer.textContent = coordinateText(point) + " m";
    event.preventDefault();
  }
  function moveDraw(event) {
    var point = eventPoint(event);
    els.pointer.textContent = coordinateText(point) + " m";
    if (!state.drawing) return;
    state.drawing.end = point;
    showPreview(state.drawing.start, point);
  }
  function endDraw(event) {
    if (!state.drawing) return;
    var start = state.drawing.start;
    var end = eventPoint(event);
    state.drawing = null;
    els.preview.style.display = "none";
    if (E.samePoint(start, end)) {
      els.drawStatus.textContent = "起点与终点相同，未生成墙线。";
      return;
    }
    var before = state.walls.length;
    state.walls = E.uniqueSegments(state.walls.concat([{ start: start, end: end }]));
    if (state.walls.length === before) {
      els.drawStatus.textContent = "这面共享墙已存在，未重复计数。";
      render();
      return;
    }
    render();
  }

  function renderWalls() {
    clear(els.wallLayer);
    clear(els.labelLayer);
    var thicknessPx = Math.max(3, Number(els.thickness.value) / 1000 * PX_PER_M);
    state.walls.forEach(function (wall, index) {
      var a = screenPoint(wall.start);
      var b = screenPoint(wall.end);
      var length = E.distanceMeters(wall.start, wall.end);
      els.wallLayer.appendChild(svgNode("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        "stroke-width": thicknessPx,
        "data-wall": String(index + 1)
      }));
      els.labelLayer.appendChild(svgNode("text", {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2 - 10,
        "text-anchor": "middle"
      }, E.formatMeters(length)));
    });
  }

  function renderTable() {
    clear(els.wallRows);
    els.wallEmpty.style.display = state.walls.length ? "none" : "block";
    state.walls.forEach(function (wall, index) {
      var tr = document.createElement("tr");
      ["W" + (index + 1), coordinateText(wall.start), coordinateText(wall.end),
        E.distanceMeters(wall.start, wall.end).toFixed(2)].forEach(function (value) {
        tr.appendChild(node("td", null, value));
      });
      els.wallRows.appendChild(tr);
    });
  }

  function renderSummary() {
    if (!state.walls.length) {
      els.lastLength.textContent = "待绘制";
      els.suiteArea.textContent = "待闭合";
      els.buildingArea.textContent = "待闭合";
      els.totalDimension.textContent = "待绘制";
      els.axisDimension.textContent = "待绘制";
      els.detailDimension.textContent = "待绘制";
      els.drawStatus.textContent = "松手后会显示墙长；回到首点闭合后显示房间面积。";
      return;
    }
    var last = state.walls[state.walls.length - 1];
    var lastLength = E.distanceMeters(last.start, last.end);
    var bounds = E.boundsOfSegments(state.walls);
    var suiteArea = E.suiteAreaSqM(state.walls);
    var buildingArea = E.buildingAreaSqM(suiteArea, els.factor.value);
    els.lastLength.textContent = E.formatMeters(lastLength);
    els.totalDimension.textContent = bounds.widthM.toFixed(2) + " × " + bounds.heightM.toFixed(2) + " m";
    els.axisDimension.textContent = state.walls.length + " 段中线 · 合计 " + E.uniqueWallLengthMeters(state.walls).toFixed(2) + " m";
    els.detailDimension.textContent = "最近墙长 " + lastLength.toFixed(2) + " m · 墙厚 " + els.thickness.value + " mm";
    if (suiteArea === null) {
      els.suiteArea.textContent = "待闭合";
      els.buildingArea.textContent = "待闭合";
      els.drawStatus.textContent = "已画第 " + state.walls.length + " 面墙，最近墙长 " + lastLength.toFixed(2) + " m；从末端继续画并回到首点。";
    } else {
      els.suiteArea.textContent = E.formatArea(suiteArea);
      els.buildingArea.textContent = buildingArea === null ? "分摊系数无效" : E.formatArea(buildingArea);
      els.drawStatus.textContent = "轮廓已闭合；套内面积按内墙中线鞋带公式得到。";
    }
  }

  function render() {
    renderWalls();
    renderTable();
    renderSummary();
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(node("li", null, failure.name + " —— " + failure.why));
    });
    if (!report.failures.length) {
      els.testDetail.appendChild(node("li", null, "矩形、L 形、共享墙、吸附、毫米往返与分摊面积全部通过。"));
    }
  }

  function mount() {
    els.paper = document.getElementById("floorplan-paper");
    els.preview = document.getElementById("preview-wall");
    els.wallLayer = document.getElementById("wall-layer");
    els.labelLayer = document.getElementById("wall-label-layer");
    els.pointer = document.getElementById("pointer-coordinate");
    els.drawStatus = document.getElementById("draw-status");
    els.thickness = document.getElementById("wall-thickness");
    els.factor = document.getElementById("allocation-factor");
    els.lastLength = document.getElementById("last-wall-length");
    els.suiteArea = document.getElementById("suite-area");
    els.buildingArea = document.getElementById("building-area");
    els.wallRows = document.getElementById("wall-rows");
    els.wallEmpty = document.getElementById("wall-empty");
    els.totalDimension = document.getElementById("dimension-total");
    els.axisDimension = document.getElementById("dimension-axis");
    els.detailDimension = document.getElementById("dimension-detail");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    els.paper.addEventListener("mousedown", beginDraw);
    els.paper.addEventListener("mousemove", moveDraw);
    els.paper.addEventListener("mouseup", endDraw);
    els.thickness.addEventListener("change", render);
    els.factor.addEventListener("input", renderSummary);
    document.getElementById("undo-wall").addEventListener("click", function () { state.walls.pop(); render(); });
    document.getElementById("clear-walls").addEventListener("click", function () { state.walls = []; render(); });
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
