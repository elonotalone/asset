(function () {
  "use strict";

  var E = window.InteractiveGlobeEngine;
  if (!E) throw new Error("地球仪引擎未能初始化");

  var SVG_NS = "http://www.w3.org/2000/svg";
  var VIEW_SIZE = 720;
  var CX = 360;
  var CY = 360;
  var RADIUS = 282;
  var TAU = Math.PI * 2;
  var state = {
    centerLongitude: 18,
    centerLatitude: 16,
    destinations: [],
    solar: E.solarPosition(new Date())
  };

  var svg = document.getElementById("world-globe");
  var landLayer = document.getElementById("land-layer");
  var borderLayer = document.getElementById("border-layer");
  var graticuleLayer = document.getElementById("graticule-layer");
  var routeLayer = document.getElementById("route-layer");
  var markerLayer = document.getElementById("marker-layer");
  var nightMaskShape = document.getElementById("night-mask-shape");
  var solarWash = document.getElementById("solar-wash");
  var globeAction = document.getElementById("globe-action");
  var timeToggle = document.getElementById("time-toggle");
  var timeEditor = document.getElementById("time-editor");
  var observationTime = document.getElementById("observation-time");
  var status = document.getElementById("globe-status");
  var scheduledFrame = null;

  function $(id) {
    return document.getElementById(id);
  }

  function svgNode(name, attributes) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function positiveAngle(value) {
    return ((value % TAU) + TAU) % TAU;
  }

  function pathData(points, closePath) {
    if (!points || points.length < 2) return "";
    var data = "M" + (CX + points[0][0]).toFixed(2) + " " + (CY + points[0][1]).toFixed(2);
    for (var index = 1; index < points.length; index++) {
      data += "L" + (CX + points[index][0]).toFixed(2) + " " + (CY + points[index][1]).toFixed(2);
    }
    return data + (closePath ? "Z" : "");
  }

  function fullGlobePath() {
    return "M" + (CX - RADIUS) + " " + CY +
      "A" + RADIUS + " " + RADIUS + " 0 1 0 " + (CX + RADIUS) + " " + CY +
      "A" + RADIUS + " " + RADIUS + " 0 1 0 " + (CX - RADIUS) + " " + CY + "Z";
  }

  function projectedSegments(points) {
    return E.visibleSegments(points, state.centerLongitude, state.centerLatitude, RADIUS);
  }

  function drawGraticule() {
    clear(graticuleLayer);
    E.graticuleLines().forEach(function (line) {
      projectedSegments(line).forEach(function (segment) {
        graticuleLayer.appendChild(svgNode("path", {
          "class": "graticule-line",
          d: pathData(segment, false)
        }));
      });
    });
  }

  function drawWorld() {
    var world = E.worldGeometry();
    clear(landLayer);
    clear(borderLayer);

    world.land.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        projectedSegments(ring).forEach(function (segment) {
          if (segment.length > 2) {
            landLayer.appendChild(svgNode("path", {
              "class": "land-shape",
              d: pathData(segment, true)
            }));
          }
        });
      });
    });

    world.countries.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        projectedSegments(ring).forEach(function (segment) {
          borderLayer.appendChild(svgNode("path", {
            "class": "border-line",
            d: pathData(segment, false)
          }));
        });
      });
    });
  }

  function terminatorCrossing(hiddenPoint, visiblePoint) {
    var denominator = visiblePoint.depth - hiddenPoint.depth;
    var amount = denominator ? -hiddenPoint.depth / denominator : 0.5;
    var x = hiddenPoint.x + (visiblePoint.x - hiddenPoint.x) * amount;
    var y = hiddenPoint.y + (visiblePoint.y - hiddenPoint.y) * amount;
    var length = Math.hypot(x, y) || 1;
    return [x * RADIUS / length, y * RADIUS / length];
  }

  function limbPoint(angle, inset) {
    var scale = inset === undefined ? 1 : inset;
    return [Math.cos(angle) * RADIUS * scale, Math.sin(angle) * RADIUS * scale];
  }

  function continuousNightRegion() {
    var sunProjection = E.projectOrthographic(
      [state.solar.subsolarLongitudeDeg, state.solar.declinationDeg],
      state.centerLongitude,
      state.centerLatitude,
      RADIUS
    );

    if (sunProjection.depth > 0.999999) return { kind: "day", points: [] };
    if (sunProjection.depth < -0.999999) return { kind: "night", points: [] };

    var samples = E.terminatorPoints(state.solar, 720).slice(0, -1).map(function (coordinate) {
      return E.projectOrthographic(
        coordinate,
        state.centerLongitude,
        state.centerLatitude,
        RADIUS
      );
    });
    var startIndex = -1;

    for (var index = 0; index < samples.length; index++) {
      var previous = samples[(index + samples.length - 1) % samples.length];
      if (samples[index].depth >= 0 && previous.depth < 0) {
        startIndex = index;
        break;
      }
    }

    if (startIndex < 0) {
      return { kind: sunProjection.depth < 0 ? "night" : "day", points: [] };
    }

    var beforeStart = samples[(startIndex + samples.length - 1) % samples.length];
    var visibleArc = [terminatorCrossing(beforeStart, samples[startIndex])];
    var cursor = startIndex;

    while (samples[cursor].depth >= 0) {
      visibleArc.push([samples[cursor].x, samples[cursor].y]);
      cursor = (cursor + 1) % samples.length;
      if (cursor === startIndex) break;
    }

    var lastVisible = samples[(cursor + samples.length - 1) % samples.length];
    visibleArc.push(terminatorCrossing(lastVisible, samples[cursor]));

    var first = visibleArc[0];
    var last = visibleArc[visibleArc.length - 1];
    var fromAngle = Math.atan2(last[1], last[0]);
    var toAngle = Math.atan2(first[1], first[0]);
    var clockwise = positiveAngle(toAngle - fromAngle);
    var candidates = [clockwise, clockwise - TAU];
    var nightDelta = null;

    candidates.some(function (delta) {
      var midpoint = limbPoint(fromAngle + delta / 2, 0.998);
      var coordinate = E.unprojectOrthographic(
        midpoint,
        state.centerLongitude,
        state.centerLatitude,
        RADIUS
      );
      if (coordinate && E.daylight(coordinate, state.solar) === false) {
        nightDelta = delta;
        return true;
      }
      return false;
    });

    if (nightDelta === null) {
      return { kind: sunProjection.depth < 0 ? "night" : "day", points: [] };
    }

    var steps = Math.max(32, Math.ceil(Math.abs(nightDelta) * RADIUS / 3));
    var points = visibleArc.slice();
    for (var step = 1; step <= steps; step++) {
      points.push(limbPoint(fromAngle + nightDelta * step / steps));
    }
    return { kind: "partial", points: points };
  }

  function drawLight() {
    var sunProjection = E.projectOrthographic(
      [state.solar.subsolarLongitudeDeg, state.solar.declinationDeg],
      state.centerLongitude,
      state.centerLatitude,
      RADIUS
    );
    var gradient = $("solar-wash");
    gradient.setAttribute("cx", (CX + sunProjection.x).toFixed(2));
    gradient.setAttribute("cy", (CY + sunProjection.y).toFixed(2));
    solarWash.style.opacity = String(clamp((sunProjection.depth + 1.2) / 1.8, 0.28, 1));

    var night = continuousNightRegion();
    if (night.kind === "day") nightMaskShape.setAttribute("d", "");
    else if (night.kind === "night") nightMaskShape.setAttribute("d", fullGlobePath());
    else nightMaskShape.setAttribute("d", pathData(night.points, true));
  }

  function drawRoute(route) {
    clear(routeLayer);
    clear(markerLayer);

    for (var index = 1; index < state.destinations.length; index++) {
      var arc = E.greatCirclePoints(
        state.destinations[index - 1],
        state.destinations[index],
        120
      );
      projectedSegments(arc).forEach(function (segment) {
        routeLayer.appendChild(svgNode("path", {
          "class": "route-line",
          d: pathData(segment, false)
        }));
      });
    }

    state.destinations.forEach(function (coordinate, destinationIndex) {
      var projected = E.projectOrthographic(
        coordinate,
        state.centerLongitude,
        state.centerLatitude,
        RADIUS
      );
      if (!projected || !projected.visible) return;

      var x = CX + projected.x;
      var y = CY + projected.y;
      markerLayer.appendChild(svgNode("circle", {
        "class": "marker-halo",
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: "10"
      }));
      markerLayer.appendChild(svgNode("circle", {
        "class": "marker-dot",
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: "5.6"
      }));

      var number = svgNode("text", {
        "class": "marker-index",
        x: x.toFixed(2),
        y: y.toFixed(2)
      });
      number.textContent = String(destinationIndex + 1);
      markerLayer.appendChild(number);

      if (destinationIndex > 0) {
        var labelOnLeft = projected.x > RADIUS * 0.54;
        var time = svgNode("text", {
          "class": "marker-time",
          x: (x + (labelOnLeft ? -13 : 13)).toFixed(2),
          y: (y - 10).toFixed(2),
          "text-anchor": labelOnLeft ? "end" : "start"
        });
        time.textContent = "太阳时 " + E.formatSolarDifference(route.rows[destinationIndex].solarDifferenceHours);
        markerLayer.appendChild(time);
      }
    });
  }

  function setDistance(totalMetres) {
    var formatted = E.formatDistance(totalMetres);
    var match = formatted.match(/^(.+)\s(m|km)$/);
    $("total-distance").querySelector(".metric-value").textContent = match ? match[1] : formatted;
    $("total-distance").querySelector(".metric-unit").textContent = match ? match[2] : "";
  }

  function renderMetrics(route) {
    setDistance(route.totalM);
    $("destination-count").querySelector(".metric-value").textContent = String(state.destinations.length);
  }

  function render() {
    scheduledFrame = null;
    drawGraticule();
    drawWorld();
    drawLight();
    var route = E.routeSegments(state.destinations);
    drawRoute(route);
    renderMetrics(route);
  }

  function scheduleRender() {
    if (scheduledFrame !== null) return;
    scheduledFrame = window.requestAnimationFrame(render);
  }

  function eventPoint(event) {
    var bounds = svg.getBoundingClientRect();
    return [
      (event.clientX - bounds.left) * VIEW_SIZE / bounds.width,
      (event.clientY - bounds.top) * VIEW_SIZE / bounds.height
    ];
  }

  function addAtPoint(point) {
    var coordinate = E.unprojectOrthographic(
      [point[0] - CX, point[1] - CY],
      state.centerLongitude,
      state.centerLatitude,
      RADIUS
    );
    if (!coordinate) {
      status.textContent = "请点在地球表面。";
      return;
    }

    state.destinations.push(coordinate);
    var route = E.routeSegments(state.destinations);
    var message = "已添加第 " + state.destinations.length + " 个目的地。";
    if (state.destinations.length > 1) {
      message += "相对首站太阳时 " +
        E.formatSolarDifference(route.rows[route.rows.length - 1].solarDifferenceHours) + "。";
    }
    status.textContent = message;
    render();
  }

  function utcInputValue(date) {
    function two(value) {
      return String(value).padStart(2, "0");
    }
    return date.getUTCFullYear() + "-" + two(date.getUTCMonth() + 1) + "-" + two(date.getUTCDate()) +
      "T" + two(date.getUTCHours()) + ":" + two(date.getUTCMinutes());
  }

  function setTimeEditing(editing) {
    timeEditor.hidden = !editing;
    globeAction.classList.toggle("editing", editing);
    timeToggle.setAttribute("aria-expanded", editing ? "true" : "false");
    if (editing) observationTime.focus();
  }

  observationTime.value = utcInputValue(new Date(state.solar.dateIso));
  timeToggle.addEventListener("click", function () {
    setTimeEditing(timeEditor.hidden);
  });
  observationTime.addEventListener("change", function () {
    var solar = E.solarPosition(observationTime.value + ":00Z");
    if (!solar) {
      status.textContent = "观察时刻无效。";
      return;
    }
    state.solar = solar;
    status.textContent = "昼夜已按新的 UTC 观察时刻更新。";
    setTimeEditing(false);
    render();
  });
  observationTime.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setTimeEditing(false);
      timeToggle.focus();
    }
  });

  var drag = null;
  svg.addEventListener("pointerdown", function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      longitude: state.centerLongitude,
      latitude: state.centerLatitude,
      moved: false
    };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("dragging");
  });

  svg.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    state.centerLongitude = E.normalize180(drag.longitude - dx * 0.34);
    state.centerLatitude = clamp(drag.latitude + dy * 0.28, -85, 85);
    scheduleRender();
  });

  svg.addEventListener("pointerup", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var shouldAdd = !drag.moved;
    drag = null;
    svg.classList.remove("dragging");
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (shouldAdd) addAtPoint(eventPoint(event));
  });

  svg.addEventListener("pointercancel", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    svg.classList.remove("dragging");
  });

  svg.addEventListener("keydown", function (event) {
    var handled = true;
    if (event.key === "ArrowLeft") state.centerLongitude = E.normalize180(state.centerLongitude - 5);
    else if (event.key === "ArrowRight") state.centerLongitude = E.normalize180(state.centerLongitude + 5);
    else if (event.key === "ArrowUp") state.centerLatitude = clamp(state.centerLatitude + 4, -85, 85);
    else if (event.key === "ArrowDown") state.centerLatitude = clamp(state.centerLatitude - 4, -85, 85);
    else if (event.key === "Enter" || event.key === " ") addAtPoint([CX, CY]);
    else handled = false;
    if (handled) {
      event.preventDefault();
      scheduleRender();
    }
  });

  window.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && state.destinations.length) {
      state.destinations.pop();
      status.textContent = "已撤回最后一个目的地。";
      event.preventDefault();
      render();
    }
  });

  render();
})();
