(function () {
  "use strict";

  var E = window.FloorplanEngine;
  var NS = "http://www.w3.org/2000/svg";
  var MAGNET_MM = 220;
  var MARGIN_PX = 136;
  var SCALE_STEPS_M = [0.5, 1, 2, 5, 10, 20, 50];

  var state = {
    rooms: [],
    chain: [],
    openings: [],
    thickness: {},
    drag: null,
    hover: null,
    selected: null,
    pending: null,
    openingSeq: 0,
    view: { w: 1200, h: 750, pxPerM: 60, cx: 0, cy: 0 }
  };
  var els = {};

  function svg(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- 视图：米 ↔ 纸面像素。缩放只改观察倍率，不改实际尺寸。 ---------- */
  function toScreen(point) {
    var v = state.view;
    return {
      x: v.w / 2 + (point.xMm / 1000 - v.cx) * v.pxPerM,
      y: v.h / 2 - (point.yMm / 1000 - v.cy) * v.pxPerM
    };
  }
  function toMetric(x, y) {
    var v = state.view;
    return E.pointFromMeters(
      (x - v.w / 2) / v.pxPerM + v.cx,
      (v.h / 2 - y) / v.pxPerM + v.cy
    );
  }

  function allWalls() { return E.roomsWallSegments(state.rooms, state.chain); }

  function thicknessOf(wall) {
    var value = state.thickness[E.segmentKey(wall)];
    return value === undefined ? E.DEFAULT_WALL_MM : value;
  }

  function measureViewport() {
    var rect = els.sheet.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    state.view.w = w > 40 ? w : 1200;
    state.view.h = h > 40 ? h : 750;
    els.paper.setAttribute("viewBox", "0 0 " + state.view.w + " " + state.view.h);
  }

  function fitView() {
    var bounds = E.boundsOfSegments(allWalls());
    var v = state.view;
    if (!bounds) {
      v.cx = 0;
      v.cy = 0;
      v.pxPerM = 60;
      return;
    }
    v.cx = (bounds.minXMm + bounds.maxXMm) / 2000;
    v.cy = (bounds.minYMm + bounds.maxYMm) / 2000;
    var usableW = Math.max(120, v.w - MARGIN_PX * 2);
    var usableH = Math.max(120, v.h - MARGIN_PX * 2);
    var scaleX = bounds.widthM > 0 ? usableW / bounds.widthM : Infinity;
    var scaleY = bounds.heightM > 0 ? usableH / bounds.heightM : Infinity;
    var pxPerM = Math.min(scaleX, scaleY);
    if (!isFinite(pxPerM)) pxPerM = 60;
    v.pxPerM = Math.max(6, Math.min(150, pxPerM));
  }

  /* ---------- 网格：纸下的方格垫板 ---------- */
  function renderGrid() {
    clear(els.grid);
    var v = state.view;
    var minor = v.pxPerM >= 26;
    var stepM = minor ? 1 : 5;
    var left = v.cx - v.w / 2 / v.pxPerM;
    var right = v.cx + v.w / 2 / v.pxPerM;
    var bottom = v.cy - v.h / 2 / v.pxPerM;
    var top = v.cy + v.h / 2 / v.pxPerM;
    var x, y;
    for (x = Math.ceil(left / stepM) * stepM; x <= right; x += stepM) {
      var sx = toScreen({ xMm: x * 1000, yMm: 0 }).x;
      var majorX = Math.abs(x / 5 - Math.round(x / 5)) < 1e-9;
      els.grid.appendChild(svg("line", {
        "class": majorX ? "grid-major" : "grid-minor",
        x1: sx.toFixed(1), y1: 0, x2: sx.toFixed(1), y2: v.h
      }));
    }
    for (y = Math.ceil(bottom / stepM) * stepM; y <= top; y += stepM) {
      var sy = toScreen({ xMm: 0, yMm: y * 1000 }).y;
      var majorY = Math.abs(y / 5 - Math.round(y / 5)) < 1e-9;
      els.grid.appendChild(svg("line", {
        "class": majorY ? "grid-major" : "grid-minor",
        x1: 0, y1: sy.toFixed(1), x2: v.w, y2: sy.toFixed(1)
      }));
    }
  }

  /* ---------- 墙体：由中线与墙厚生成，门窗真正切开它 ---------- */
  function wallGeometry(wall) {
    var a = toScreen(wall.start);
    var b = toScreen(wall.end);
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    return { a: a, b: b, ux: dx / length, uy: dy / length, nx: -dy / length, ny: dx / length, length: length };
  }
  function alongWall(geometry, offsetMm) {
    var px = offsetMm / 1000 * state.view.pxPerM;
    return { x: geometry.a.x + geometry.ux * px, y: geometry.a.y + geometry.uy * px };
  }

  function renderWalls() {
    clear(els.walls);
    var walls = allWalls();
    var chainKeys = {};
    E.segmentsOfChain(state.chain).forEach(function (segment) { chainKeys[E.segmentKey(segment)] = true; });
    var selectedKey = state.selected && state.selected.kind === "wall"
      ? E.segmentKey(state.selected.wall) : null;

    walls.forEach(function (wall) {
      var key = E.segmentKey(wall);
      var geometry = wallGeometry(wall);
      var thicknessMm = thicknessOf(wall);
      var thicknessPx = Math.max(2.5, thicknessMm / 1000 * state.view.pxPerM);
      var lengthMm = E.distanceMm(wall.start, wall.end);
      var half = thicknessPx / 2;
      var classes = ["wall"];
      if (chainKeys[key]) classes.push("wall-open");
      if (key === selectedKey) classes.push("wall-selected");

      E.wallSolidSpansMm(wall, state.openings).forEach(function (span) {
        var from = alongWall(geometry, span.fromMm);
        var to = alongWall(geometry, span.toMm);
        // 真正的墙端按半墙厚外伸，转角才咬得住；洞口那一侧是平头，不许侵占洞宽。
        var startExt = span.fromMm === 0 ? half : 0;
        var endExt = span.toMm >= lengthMm - 0.001 ? half : 0;
        els.walls.appendChild(svg("line", {
          "class": classes.join(" "),
          "stroke-width": thicknessPx.toFixed(2),
          "data-wall": key,
          x1: (from.x - geometry.ux * startExt).toFixed(2),
          y1: (from.y - geometry.uy * startExt).toFixed(2),
          x2: (to.x + geometry.ux * endExt).toFixed(2),
          y2: (to.y + geometry.uy * endExt).toFixed(2)
        }));
      });

      appendWallLength(wall, geometry, thicknessPx, key === selectedKey, thicknessMm, lengthMm);
    });
  }

  function outwardNormal(wall, geometry) {
    var middle = { xMm: (wall.start.xMm + wall.end.xMm) / 2, yMm: (wall.start.yMm + wall.end.yMm) / 2 };
    var room = state.rooms.filter(function (item) {
      return E.segmentsOfRing(item.points).some(function (segment) {
        return E.segmentKey(segment) === E.segmentKey(wall);
      });
    })[0];
    if (!room) return { nx: geometry.nx, ny: geometry.ny };
    var centroid = E.polygonCentroid(room.points);
    if (!centroid) return { nx: geometry.nx, ny: geometry.ny };
    var mid = toScreen(middle);
    var toCentroid = toScreen(centroid);
    var dot = geometry.nx * (toCentroid.x - mid.x) + geometry.ny * (toCentroid.y - mid.y);
    return dot > 0 ? { nx: -geometry.nx, ny: -geometry.ny } : { nx: geometry.nx, ny: geometry.ny };
  }

  function textAngle(geometry) {
    var angle = Math.atan2(geometry.b.y - geometry.a.y, geometry.b.x - geometry.a.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return angle;
  }

  /* 墙长写在最长那段实墙的中点上：门窗占住的那一段本来就有自己的洞宽标注，
     两个数字挤在一起谁都读不清。 */
  function longestSolidCenterMm(wall, lengthMm) {
    var spans = E.wallSolidSpansMm(wall, state.openings);
    var best = null;
    spans.forEach(function (span) {
      var size = span.toMm - span.fromMm;
      if (!best || size > best.size) best = { size: size, center: (span.fromMm + span.toMm) / 2 };
    });
    return best ? best.center : lengthMm / 2;
  }

  function appendWallLength(wall, geometry, thicknessPx, selected, thicknessMm, lengthMm) {
    var lengthM = E.distanceMeters(wall.start, wall.end);
    if (geometry.length < 34) return;
    var normal = outwardNormal(wall, geometry);
    var gap = thicknessPx / 2 + 14;
    var mid = alongWall(geometry, longestSolidCenterMm(wall, lengthMm));
    var at = { x: mid.x + normal.nx * gap, y: mid.y + normal.ny * gap };
    var angle = textAngle(geometry);
    var label = svg("text", {
      "class": "wall-length",
      x: at.x.toFixed(2),
      y: at.y.toFixed(2),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      transform: "rotate(" + angle.toFixed(2) + " " + at.x.toFixed(2) + " " + at.y.toFixed(2) + ")"
    }, lengthM.toFixed(2) + " m");
    els.walls.appendChild(label);
    if (!selected) return;
    var inner = { x: mid.x - normal.nx * (thicknessPx / 2 + 15), y: mid.y - normal.ny * (thicknessPx / 2 + 15) };
    els.walls.appendChild(svg("text", {
      "class": "wall-thickness",
      x: inner.x.toFixed(2),
      y: inner.y.toFixed(2),
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      transform: "rotate(" + angle.toFixed(2) + " " + inner.x.toFixed(2) + " " + inner.y.toFixed(2) + ")"
    }, "墙厚 " + E.formatMillimeters(thicknessMm)));
  }

  /* ---------- 门窗：门有开启弧，窗是双线，各自带名字与洞宽 ---------- */
  function renderOpenings() {
    clear(els.openings);
    var walls = allWalls();
    state.openings.forEach(function (opening) {
      var wall = walls.filter(function (item) { return E.segmentKey(item) === opening.wallKey; })[0];
      if (!wall) return;
      var geometry = wallGeometry(wall);
      var thicknessPx = Math.max(2.5, thicknessOf(wall) / 1000 * state.view.pxPerM);
      var span = E.openingSpanMm(opening);
      var from = alongWall(geometry, span.fromMm);
      var to = alongWall(geometry, span.toMm);
      var normal = outwardNormal(wall, geometry);
      var widthPx = opening.widthMm / 1000 * state.view.pxPerM;

      if (opening.kind === "door") {
        els.openings.appendChild(svg("line", {
          "class": "door-leaf",
          x1: from.x.toFixed(2), y1: from.y.toFixed(2),
          x2: (from.x - normal.nx * widthPx).toFixed(2),
          y2: (from.y - normal.ny * widthPx).toFixed(2)
        }));
        els.openings.appendChild(svg("path", {
          "class": "door-arc",
          d: "M " + (from.x - normal.nx * widthPx).toFixed(2) + " " + (from.y - normal.ny * widthPx).toFixed(2) +
            " A " + widthPx.toFixed(2) + " " + widthPx.toFixed(2) + " 0 0 " +
            (normal.nx * geometry.uy - normal.ny * geometry.ux > 0 ? "1" : "0") + " " +
            to.x.toFixed(2) + " " + to.y.toFixed(2)
        }));
      } else {
        [-thicknessPx / 4, thicknessPx / 4].forEach(function (offset) {
          els.openings.appendChild(svg("line", {
            "class": "window-line",
            x1: (from.x + normal.nx * offset).toFixed(2), y1: (from.y + normal.ny * offset).toFixed(2),
            x2: (to.x + normal.nx * offset).toFixed(2), y2: (to.y + normal.ny * offset).toFixed(2)
          }));
        });
      }

      var mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      var angle = textAngle(geometry);
      var nameAt = { x: mid.x + normal.nx * (thicknessPx / 2 + 56), y: mid.y + normal.ny * (thicknessPx / 2 + 56) };
      if (opening.name) {
        els.openings.appendChild(svg("text", {
          "class": "opening-name",
          x: nameAt.x.toFixed(2), y: nameAt.y.toFixed(2),
          "text-anchor": "middle", "dominant-baseline": "middle",
          transform: "rotate(" + angle.toFixed(2) + " " + nameAt.x.toFixed(2) + " " + nameAt.y.toFixed(2) + ")",
          "data-opening": opening.id
        }, opening.name));
      }
      appendOpeningWidth(opening, geometry, normal, thicknessPx, from, to, angle);
    });
  }

  function appendOpeningWidth(opening, geometry, normal, thicknessPx, from, to, angle) {
    var out = thicknessPx / 2 + 17;
    var a = { x: from.x + normal.nx * out, y: from.y + normal.ny * out };
    var b = { x: to.x + normal.nx * out, y: to.y + normal.ny * out };
    els.openings.appendChild(svg("line", {
      "class": "dim-line", x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2)
    }));
    [a, b].forEach(function (point) {
      els.openings.appendChild(svg("line", {
        "class": "dim-tick",
        x1: (point.x - (geometry.ux + normal.nx) * 4).toFixed(2),
        y1: (point.y - (geometry.uy + normal.ny) * 4).toFixed(2),
        x2: (point.x + (geometry.ux + normal.nx) * 4).toFixed(2),
        y2: (point.y + (geometry.uy + normal.ny) * 4).toFixed(2)
      }));
    });
    var mid = { x: (a.x + b.x) / 2 + normal.nx * 14, y: (a.y + b.y) / 2 + normal.ny * 14 };
    els.openings.appendChild(svg("text", {
      "class": "opening-width",
      x: mid.x.toFixed(2), y: mid.y.toFixed(2),
      "text-anchor": "middle", "dominant-baseline": "middle",
      transform: "rotate(" + angle.toFixed(2) + " " + mid.x.toFixed(2) + " " + mid.y.toFixed(2) + ")"
    }, E.formatMillimeters(opening.widthMm)));
  }

  /* ---------- 房间：闭合后才有面，面积落在面内 ---------- */
  function renderRooms() {
    clear(els.rooms);
    clear(els.roomLabels);
    state.rooms.forEach(function (room, index) {
      var points = room.points.map(toScreen).map(function (point) {
        return point.x.toFixed(2) + "," + point.y.toFixed(2);
      }).join(" ");
      els.rooms.appendChild(svg("polygon", { "class": "room-face", points: points, "data-room": index }));

      var centroid = E.polygonCentroid(room.points);
      if (!centroid) return;
      var at = toScreen(centroid);
      var area = E.polygonAreaSqM(room.points);
      var hasName = !!room.name;
      if (hasName) {
        els.roomLabels.appendChild(svg("text", {
          "class": "room-name", x: at.x.toFixed(2), y: (at.y - 6).toFixed(2), "data-room": index
        }, room.name));
      }
      els.roomLabels.appendChild(svg("text", {
        "class": "room-area", x: at.x.toFixed(2), y: (hasName ? at.y + 20 : at.y + 6).toFixed(2)
      }, E.formatArea(area)));
    });
  }

  /* ---------- 总尺寸：延伸线、尺寸线、端部记号、数值 ---------- */
  function renderDimensions() {
    clear(els.dimensions);
    var walls = allWalls();
    var bounds = E.boundsOfSegments(walls);
    if (!bounds || walls.length < 2) return;
    var topLeft = toScreen({ xMm: bounds.minXMm, yMm: bounds.maxYMm });
    var bottomRight = toScreen({ xMm: bounds.maxXMm, yMm: bounds.minYMm });
    if (bounds.widthM > 0) {
      dimension(
        { x: topLeft.x, y: bottomRight.y }, { x: bottomRight.x, y: bottomRight.y },
        { x: 0, y: 1 }, 68, bounds.widthM.toFixed(2) + " m", 0
      );
    }
    if (bounds.heightM > 0) {
      dimension(
        { x: topLeft.x, y: bottomRight.y }, { x: topLeft.x, y: topLeft.y },
        { x: -1, y: 0 }, 68, bounds.heightM.toFixed(2) + " m", -90
      );
    }
  }

  function dimension(a, b, direction, offset, value, angle) {
    var ax = a.x + direction.x * offset;
    var ay = a.y + direction.y * offset;
    var bx = b.x + direction.x * offset;
    var by = b.y + direction.y * offset;
    els.dimensions.appendChild(svg("line", {
      "class": "dim-ext", x1: a.x.toFixed(2), y1: a.y.toFixed(2),
      x2: (ax + direction.x * 8).toFixed(2), y2: (ay + direction.y * 8).toFixed(2)
    }));
    els.dimensions.appendChild(svg("line", {
      "class": "dim-ext", x1: b.x.toFixed(2), y1: b.y.toFixed(2),
      x2: (bx + direction.x * 8).toFixed(2), y2: (by + direction.y * 8).toFixed(2)
    }));
    els.dimensions.appendChild(svg("line", {
      "class": "dim-line", x1: ax.toFixed(2), y1: ay.toFixed(2), x2: bx.toFixed(2), y2: by.toFixed(2)
    }));
    [[ax, ay], [bx, by]].forEach(function (point) {
      els.dimensions.appendChild(svg("line", {
        "class": "dim-tick",
        x1: (point[0] - 5).toFixed(2), y1: (point[1] + 5).toFixed(2),
        x2: (point[0] + 5).toFixed(2), y2: (point[1] - 5).toFixed(2)
      }));
    });
    var mx = (ax + bx) / 2 + direction.x * 15;
    var my = (ay + by) / 2 + direction.y * 15;
    els.dimensions.appendChild(svg("text", {
      "class": "dim-value", x: mx.toFixed(2), y: my.toFixed(2), "dominant-baseline": "middle",
      transform: "rotate(" + angle + " " + mx.toFixed(2) + " " + my.toFixed(2) + ")"
    }, value));
  }

  /* ---------- 正在拖的那一笔 ---------- */
  function renderDraft() {
    clear(els.draft);
    if (!state.drag) return;
    var a = toScreen(state.drag.start);
    var b = toScreen(state.drag.end);
    els.draft.appendChild(svg("line", {
      "class": "draft-wall", x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2)
    }));
    var lengthM = E.distanceMeters(state.drag.start, state.drag.end);
    if (!lengthM) return;
    els.draft.appendChild(svg("text", {
      "class": "draft-length", x: ((a.x + b.x) / 2 + 12).toFixed(2), y: ((a.y + b.y) / 2 - 12).toFixed(2)
    }, lengthM.toFixed(2) + " m"));
  }

  /* ---------- 比例尺与北针 ---------- */
  function renderMarks() {
    clear(els.marks);
    var v = state.view;
    var step = SCALE_STEPS_M[0];
    SCALE_STEPS_M.forEach(function (candidate) {
      if (candidate * v.pxPerM <= 168) step = candidate;
    });
    var width = step * v.pxPerM;
    var x2 = v.w - 34;
    var x1 = x2 - width;
    var y = v.h - 32;
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x1, y1: y, x2: x2, y2: y }));
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x1, y1: y - 6, x2: x1, y2: y + 6 }));
    els.marks.appendChild(svg("line", { "class": "scale-bar", x1: x2, y1: y - 6, x2: x2, y2: y + 6 }));
    els.marks.appendChild(svg("text", {
      "class": "scale-text", x: (x1 + width / 2).toFixed(1), y: y - 12, "text-anchor": "middle"
    }, (step < 1 ? step.toFixed(1) : String(step)) + " m"));

    var nx = v.w - 46;
    els.marks.appendChild(svg("text", { "class": "north-text", x: nx, y: 32 }, "N"));
    els.marks.appendChild(svg("path", {
      "class": "north-mark",
      d: "M " + nx + " 42 L " + (nx - 9) + " 68 L " + nx + " 61 L " + (nx + 9) + " 68 Z"
    }));
    els.marks.appendChild(svg("line", { "class": "north-stem", x1: nx, y1: 61, x2: nx, y2: 84 }));

    if (state.chain.length && !state.drag) {
      var last = toScreen(state.chain[state.chain.length - 1]);
      els.marks.appendChild(svg("circle", { "class": "snap-dot", cx: last.x.toFixed(2), cy: last.y.toFixed(2), r: 4 }));
      if (state.chain.length >= 3) {
        var first = toScreen(state.chain[0]);
        els.marks.appendChild(svg("circle", {
          "class": "close-hint", cx: first.x.toFixed(2), cy: first.y.toFixed(2), r: 10
        }));
      }
    }
  }

  /* ---------- 头号结论与当前动作 ---------- */
  function renderHeadline() {
    var area = E.totalSuiteAreaSqM(state.rooms);
    if (area === null) {
      els.headline.textContent = "";
      return;
    }
    els.headline.textContent = "";
    els.headline.appendChild(document.createTextNode("套内面积"));
    var value = document.createElement("strong");
    value.textContent = area.toFixed(2);
    els.headline.appendChild(value);
    var unit = document.createElement("em");
    unit.textContent = "m²";
    els.headline.appendChild(unit);
  }

  function cueText() {
    if (state.pending) return "在这面墙上点一下，放" + (state.pending === "door" ? "门" : "窗");
    if (state.drag) return E.distanceMeters(state.drag.start, state.drag.end).toFixed(2) + " m，松手落墙";
    if (state.selected && state.selected.kind === "room" && !state.rooms[state.selected.index].name) return "写下房间名";
    if (state.chain.length >= 3) return "从端点继续拖，或拖回起点闭合这间房";
    if (state.chain.length) return "从端点继续拖下一面墙";
    if (state.rooms.length) return "点一面墙可以开门开窗，或拖出下一间房的第一面墙";
    return "拖出第一面墙";
  }

  function renderCue() {
    els.cue.textContent = cueText();
    if (!state.hover) return;
    els.cue.style.left = state.hover.x + "px";
    els.cue.style.top = state.hover.y + "px";
  }

  function render() {
    renderGrid();
    renderRooms();
    renderWalls();
    renderOpenings();
    renderDimensions();
    renderDraft();
    renderMarks();
    renderHeadline();
    renderCue();
  }

  /* ---------- 贴着对象的小签 ---------- */
  function hideTag() {
    els.tag.hidden = true;
    clear(els.tag);
  }

  function placeTag(point) {
    var v = state.view;
    var x = Math.max(12, Math.min(v.w - 250, point.x + 16));
    var y = Math.max(12, Math.min(v.h - 60, point.y + 14));
    els.tag.style.left = x + "px";
    els.tag.style.top = y + "px";
    els.tag.hidden = false;
  }

  function tagSpan(text) {
    var span = document.createElement("span");
    span.textContent = text;
    return span;
  }
  function tagButton(id, text, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function showRoomTag(index) {
    var room = state.rooms[index];
    clear(els.tag);
    var input = document.createElement("input");
    input.id = "room-name";
    input.type = "text";
    input.value = room.name;
    input.placeholder = "房间名，例如 主卧";
    input.setAttribute("aria-label", "房间名");
    input.addEventListener("input", function () {
      room.name = input.value.trim();
      renderRooms();
      renderCue();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { state.selected = null; hideTag(); render(); }
    });
    els.tag.appendChild(input);
    els.tag.appendChild(tagButton("drop-room", "删掉这间", function () {
      state.rooms.splice(index, 1);
      state.selected = null;
      hideTag();
      fitView();
      render();
    }));
    var centroid = E.polygonCentroid(room.points);
    placeTag(centroid ? toScreen(centroid) : { x: state.view.w / 2, y: state.view.h / 2 });
    input.focus();
  }

  function showWallTag(wall) {
    var key = E.segmentKey(wall);
    clear(els.tag);
    var length = document.createElement("em");
    length.textContent = E.formatMeters(E.distanceMeters(wall.start, wall.end));
    els.tag.appendChild(tagSpan("墙长"));
    els.tag.appendChild(length);
    els.tag.appendChild(tagSpan("墙厚"));
    var input = document.createElement("input");
    input.id = "wall-thickness";
    input.className = "mm";
    input.type = "text";
    input.inputMode = "numeric";
    input.value = String(thicknessOf(wall));
    input.setAttribute("aria-label", "墙厚，毫米");
    input.addEventListener("input", function () {
      var mm = E.finite(input.value);
      if (mm !== null && mm >= 20 && mm <= 800) {
        state.thickness[key] = Math.round(mm);
        renderWalls();
        renderOpenings();
      }
    });
    els.tag.appendChild(input);
    els.tag.appendChild(tagSpan("mm"));
    els.tag.appendChild(tagButton("add-door", "开门", function () { state.pending = "door"; renderCue(); }));
    els.tag.appendChild(tagButton("add-window", "开窗", function () { state.pending = "window"; renderCue(); }));
    var geometry = wallGeometry(wall);
    placeTag({ x: (geometry.a.x + geometry.b.x) / 2, y: (geometry.a.y + geometry.b.y) / 2 });
    input.blur();
  }

  function showOpeningTag(id) {
    var opening = state.openings.filter(function (item) { return item.id === id; })[0];
    if (!opening) return;
    clear(els.tag);
    var name = document.createElement("input");
    name.id = "opening-name";
    name.type = "text";
    name.value = opening.name;
    name.placeholder = opening.kind === "door" ? "门的用途，例如 阳台门" : "窗的用途，例如 厨房窗";
    name.setAttribute("aria-label", opening.kind === "door" ? "门的用途" : "窗的用途");
    name.addEventListener("input", function () {
      opening.name = name.value.trim();
      renderOpenings();
    });
    els.tag.appendChild(name);
    var width = document.createElement("input");
    width.id = "opening-width";
    width.className = "mm";
    width.type = "text";
    width.inputMode = "numeric";
    width.value = String(opening.widthMm);
    width.setAttribute("aria-label", "洞口宽度，毫米");
    width.addEventListener("input", function () {
      var mm = E.finite(width.value);
      var wall = allWalls().filter(function (item) { return E.segmentKey(item) === opening.wallKey; })[0];
      if (mm === null || !wall) return;
      var lengthMm = E.distanceMm(wall.start, wall.end);
      var center = E.clampOpeningCenterMm(lengthMm, mm, opening.centerMm);
      if (center === null) return;
      opening.widthMm = Math.round(mm);
      opening.centerMm = center;
      renderWalls();
      renderOpenings();
    });
    els.tag.appendChild(width);
    els.tag.appendChild(tagSpan("mm"));
    els.tag.appendChild(tagButton("drop-opening", "填回去", function () {
      state.openings = state.openings.filter(function (item) { return item.id !== id; });
      state.selected = null;
      hideTag();
      render();
    }));
    var wall = allWalls().filter(function (item) { return E.segmentKey(item) === opening.wallKey; })[0];
    if (wall) placeTag(alongWall(wallGeometry(wall), opening.centerMm));
    name.focus();
  }

  /* 手里有激光测距仪的人，拖个大概再把读数写准，比用手拖到 0.01 m 靠得住。 */
  function retargetLastWall(lengthM) {
    var last = state.chain.length - 1;
    var from = state.chain[last - 1];
    var oldPoint = state.chain[last];
    var currentMm = E.distanceMm(from, oldPoint);
    var wantMm = lengthM * 1000;
    if (!currentMm || wantMm < 50 || wantMm > 60000) return false;
    var ratio = wantMm / currentMm;
    var moved = E.pointFromMeters(
      (from.xMm + (oldPoint.xMm - from.xMm) * ratio) / 1000,
      (from.yMm + (oldPoint.yMm - from.yMm) * ratio) / 1000
    );
    if (!moved || E.samePoint(moved, oldPoint)) return false;
    var oldKey = E.segmentKey({ start: from, end: oldPoint });
    var newKey = E.segmentKey({ start: from, end: moved });
    state.chain[last] = moved;
    if (state.thickness[oldKey] !== undefined) {
      state.thickness[newKey] = state.thickness[oldKey];
      delete state.thickness[oldKey];
    }
    var newLengthMm = E.distanceMm(from, moved);
    state.openings.forEach(function (opening) {
      if (opening.wallKey !== oldKey) return;
      opening.wallKey = newKey;
      var center = E.clampOpeningCenterMm(newLengthMm, opening.widthMm, opening.centerMm);
      opening.centerMm = center === null ? newLengthMm / 2 : center;
    });
    return true;
  }

  function showUndoTag() {
    clear(els.tag);
    var input = document.createElement("input");
    input.id = "wall-length";
    input.className = "mm";
    input.type = "text";
    input.inputMode = "decimal";
    input.value = E.distanceMeters(state.chain[state.chain.length - 2], state.chain[state.chain.length - 1]).toFixed(2);
    input.setAttribute("aria-label", "这面墙的长度，米");
    input.addEventListener("input", function () {
      var value = E.finite(input.value);
      if (value === null) return;
      if (!retargetLastWall(value)) return;
      fitView();
      render();
      placeTag(toScreen(state.chain[state.chain.length - 1]));
    });
    els.tag.appendChild(input);
    els.tag.appendChild(tagSpan("m"));
    els.tag.appendChild(tagButton("undo-wall", "撤销这面墙", function () {
      state.chain.pop();
      if (state.chain.length < 2) state.chain = [];
      hideTag();
      fitView();
      render();
      if (state.chain.length >= 2) showUndoTag();
    }));
    placeTag(toScreen(state.chain[state.chain.length - 1]));
    input.select();
  }

  /* ---------- 落笔 ---------- */
  function magnetHit(point) {
    if (!point) return null;
    var best = null;
    var bestDistance = Infinity;
    var candidates = [];
    state.rooms.forEach(function (room) {
      room.points.forEach(function (item) { candidates.push(item); });
    });
    state.chain.forEach(function (item) { candidates.push(item); });
    candidates.forEach(function (candidate) {
      var distance = E.distanceMm(point, candidate);
      if (distance <= MAGNET_MM && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best ? { xMm: best.xMm, yMm: best.yMm } : null;
  }

  function magnetize(point) {
    return magnetHit(point) || point;
  }

  /* 拖得接近横平竖直，就当成横平竖直：实测墙不会差 3°，差的是手。 */
  function axisAlign(start, point) {
    if (!start || !point) return point;
    var dx = Math.abs(point.xMm - start.xMm);
    var dy = Math.abs(point.yMm - start.yMm);
    if (!dx || !dy) return point;
    var ratio = Math.min(dx, dy) / Math.max(dx, dy);
    if (ratio > 0.09) return point;
    return dx > dy
      ? { xMm: point.xMm, yMm: start.yMm }
      : { xMm: start.xMm, yMm: point.yMm };
  }

  function resolveDragEnd(start, raw) {
    return magnetHit(raw) || axisAlign(start, raw);
  }

  function eventPoint(event) {
    var rect = els.paper.getBoundingClientRect();
    var x = event.clientX;
    var y = event.clientY;
    if (rect.width > 40 && rect.height > 40) {
      x = (event.clientX - rect.left) * state.view.w / rect.width;
      y = (event.clientY - rect.top) * state.view.h / rect.height;
    }
    var raw = toMetric(x, y);
    return { screen: { x: x, y: y }, raw: raw, metric: magnetize(raw) };
  }

  function closeChainIfPossible() {
    if (state.chain.length < 4) return false;
    if (!E.samePoint(state.chain[0], state.chain[state.chain.length - 1])) return false;
    var points = state.chain.slice(0, -1);
    if (E.polygonAreaSqM(points) === null) return false;
    state.rooms.push({ name: "", points: points });
    state.chain = [];
    state.selected = { kind: "room", index: state.rooms.length - 1 };
    return true;
  }

  function commitWall(start, end) {
    if (E.samePoint(start, end)) return;
    if (!state.chain.length) {
      state.chain = [start, end];
    } else {
      var last = state.chain[state.chain.length - 1];
      if (!E.samePoint(last, start)) {
        els.cue.textContent = "从上一面墙的端点继续拖";
        return;
      }
      state.chain.push(end);
    }
    var closed = closeChainIfPossible();
    fitView();
    render();
    if (closed) showRoomTag(state.rooms.length - 1);
    else showUndoTag();
  }

  function placeOpening(hit) {
    var wall = hit.wall;
    var widthMm = state.pending === "door" ? E.DEFAULT_DOOR_MM : E.DEFAULT_WINDOW_MM;
    var center = E.clampOpeningCenterMm(hit.lengthMm, widthMm, hit.offsetMm);
    if (center === null) {
      els.cue.textContent = "这面墙只有 " + (hit.lengthMm / 1000).toFixed(2) + " m，放不下 " +
        E.formatMillimeters(widthMm);
      return;
    }
    var candidate = {
      id: "opening-" + (++state.openingSeq),
      wallKey: E.segmentKey(wall),
      kind: state.pending,
      name: "",
      widthMm: widthMm,
      centerMm: center
    };
    if (E.openingOverlaps(state.openings, wall, candidate)) {
      els.cue.textContent = "这里已经有一个洞口了，往边上挪一点";
      return;
    }
    state.openings.push(candidate);
    state.pending = null;
    state.selected = { kind: "opening", id: candidate.id };
    render();
    showOpeningTag(candidate.id);
  }

  function selectAt(point, screen) {
    var walls = allWalls();
    var tolerance = 260 / Math.max(1, state.view.pxPerM / 60);
    var openingHit = null;
    walls.forEach(function (wall) {
      var hit = E.projectOntoSegment(wall, point);
      if (!hit || hit.distanceMm > tolerance) return;
      E.openingsOfWall(state.openings, wall).forEach(function (opening) {
        var span = E.openingSpanMm(opening);
        if (hit.offsetMm >= span.fromMm && hit.offsetMm <= span.toMm) openingHit = opening;
      });
    });
    if (openingHit) {
      state.selected = { kind: "opening", id: openingHit.id };
      render();
      showOpeningTag(openingHit.id);
      return;
    }
    var wallHit = E.nearestWall(walls, point, tolerance);
    if (wallHit) {
      state.selected = { kind: "wall", wall: wallHit.wall };
      render();
      showWallTag(wallHit.wall);
      return;
    }
    var roomIndex = -1;
    state.rooms.forEach(function (room, index) {
      var centroid = E.polygonCentroid(room.points);
      if (!centroid) return;
      var at = toScreen(centroid);
      if (Math.abs(at.x - screen.x) < 90 && Math.abs(at.y - screen.y) < 40) roomIndex = index;
    });
    if (roomIndex >= 0) {
      state.selected = { kind: "room", index: roomIndex };
      render();
      showRoomTag(roomIndex);
      return;
    }
    state.selected = null;
    hideTag();
    render();
  }

  function onDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    var point = eventPoint(event);
    if (!point.metric) return;
    state.pressed = { start: point.metric, screen: point.screen, moved: false };
    if (event.preventDefault) event.preventDefault();
  }

  function onMove(event) {
    var point = eventPoint(event);
    if (!point.metric) return;
    state.hover = point.screen;
    if (state.pressed) {
      var end = resolveDragEnd(state.pressed.start, point.raw);
      if (!E.samePoint(state.pressed.start, end)) {
        state.pressed.moved = true;
        state.drag = { start: state.pressed.start, end: end };
        hideTag();
        renderDraft();
      }
    }
    renderCue();
  }

  function onUp(event) {
    if (!state.pressed) return;
    var point = eventPoint(event);
    if (!point.metric) return;
    var pressed = state.pressed;
    var end = resolveDragEnd(pressed.start, point.raw);
    state.pressed = null;
    state.drag = null;
    if (!pressed.moved && E.samePoint(pressed.start, end)) {
      if (state.pending) {
        var hit = E.nearestWall(allWalls(), point.metric, 400);
        if (hit) placeOpening(hit);
        else { state.pending = null; renderCue(); }
        return;
      }
      selectAt(point.metric, point.screen);
      return;
    }
    state.selected = null;
    commitWall(pressed.start, end);
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    state.pending = null;
    state.selected = null;
    hideTag();
    render();
  }

  function mount() {
    els.sheet = document.getElementById("sheet");
    els.paper = document.getElementById("paper");
    els.grid = document.getElementById("grid-layer");
    els.rooms = document.getElementById("room-layer");
    els.walls = document.getElementById("wall-layer");
    els.openings = document.getElementById("opening-layer");
    els.dimensions = document.getElementById("dimension-layer");
    els.roomLabels = document.getElementById("room-label-layer");
    els.draft = document.getElementById("draft-layer");
    els.marks = document.getElementById("mark-layer");
    els.headline = document.getElementById("suite-area");
    els.cue = document.getElementById("cue");
    els.tag = document.getElementById("tag");

    measureViewport();
    fitView();
    render();

    els.paper.addEventListener("mousedown", onDown);
    els.paper.addEventListener("mousemove", onMove);
    els.paper.addEventListener("mouseup", onUp);
    els.paper.addEventListener("mouseleave", function () { state.pressed = null; state.drag = null; render(); });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", function () {
      measureViewport();
      fitView();
      render();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
