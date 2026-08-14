(function () {
  "use strict";

  var E = window.InteractiveGlobeEngine;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var VIEW_W = 620;
  var VIEW_H = 560;
  var CX = 310;
  var CY = 280;
  var RADIUS = 245;
  var state = {
    centerLongitude: 20,
    centerLatitude: 15,
    destinations: [],
    solar: null
  };

  var svg = document.getElementById("world-globe");
  var landLayer = document.getElementById("land-layer");
  var borderLayer = document.getElementById("border-layer");
  var graticuleLayer = document.getElementById("graticule-layer");
  var nightLayer = document.getElementById("night-layer");
  var terminatorLayer = document.getElementById("terminator-layer");
  var routeLayer = document.getElementById("route-layer");
  var markerLayer = document.getElementById("marker-layer");
  var detailsPanel = document.getElementById("details-panel");
  var detailsToggle = document.getElementById("details-toggle");

  function $(id) { return document.getElementById(id); }
  function svgNode(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function signed(value, digits) {
    var n = Number(value);
    if (!isFinite(n)) return "—";
    if (Math.abs(n) < Math.pow(10, -(digits || 1)) / 2) n = 0;
    return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits === undefined ? 1 : digits) + "°";
  }
  function coordinateText(value) { return "[" + value[0].toFixed(4) + "°, " + value[1].toFixed(4) + "°]"; }

  function parseObservation() {
    var value = $("observation-time").value;
    if (!value) return null;
    var iso = value.length === 16 ? value + ":00Z" : value + "Z";
    return E.solarPosition(iso);
  }

  function setDateNote(message, error) {
    $("date-note").textContent = message;
    $("date-note").classList.toggle("error", Boolean(error));
  }

  function setInputNote(message, error) {
    $("input-note").textContent = message;
    $("input-note").classList.toggle("error", Boolean(error));
  }

  function setDetailsOpen(open) {
    detailsPanel.hidden = !open;
    detailsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) $("close-details").focus();
    else detailsToggle.focus();
  }

  function pathData(points, closePath) {
    if (!points || points.length < 2) return "";
    var d = "M" + (CX + points[0][0]).toFixed(2) + " " + (CY + points[0][1]).toFixed(2);
    for (var i = 1; i < points.length; i++) {
      d += "L" + (CX + points[i][0]).toFixed(2) + " " + (CY + points[i][1]).toFixed(2);
    }
    return d + (closePath ? "Z" : "");
  }

  function projectedSegments(points) {
    return E.visibleSegments(points, state.centerLongitude, state.centerLatitude, RADIUS);
  }

  function drawGraticule() {
    clear(graticuleLayer);
    E.graticuleLines().forEach(function (line) {
      projectedSegments(line).forEach(function (segment) {
        graticuleLayer.appendChild(svgNode("path", { "class": "graticule-line", d: pathData(segment, false) }));
      });
    });
  }

  function drawWorldGeometry() {
    var world = E.worldGeometry();
    clear(landLayer);
    clear(borderLayer);

    world.land.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        projectedSegments(ring).forEach(function (segment) {
          if (segment.length > 2) landLayer.appendChild(svgNode("path", { "class": "land-shape", d: pathData(segment, true) }));
        });
      });
    });

    world.countries.forEach(function (polygon) {
      polygon.forEach(function (ring) {
        projectedSegments(ring).forEach(function (segment) {
          borderLayer.appendChild(svgNode("path", { "class": "border-line", d: pathData(segment, false) }));
        });
      });
    });
  }

  function drawNight() {
    clear(nightLayer);
    clear(terminatorLayer);
    var bands = E.nightBands(state.centerLongitude, state.centerLatitude, state.solar, 58, 144) || [];
    bands.forEach(function (band) {
      nightLayer.appendChild(svgNode("rect", {
        "class": "night-band",
        x: (CX + band.x0 * RADIUS).toFixed(2),
        y: (CY + band.y0 * RADIUS).toFixed(2),
        width: Math.max(.4, (band.x1 - band.x0) * RADIUS).toFixed(2),
        height: Math.max(.4, (band.y1 - band.y0) * RADIUS + .6).toFixed(2)
      }));
    });

    var points = E.terminatorPoints(state.solar, 240) || [];
    projectedSegments(points).forEach(function (segment) {
      terminatorLayer.appendChild(svgNode("path", { "class": "terminator-line", d: pathData(segment, false) }));
    });
  }

  function drawRoute() {
    clear(routeLayer);
    clear(markerLayer);

    for (var i = 1; i < state.destinations.length; i++) {
      var points = E.greatCirclePoints(state.destinations[i - 1].coordinate, state.destinations[i].coordinate, 90);
      projectedSegments(points).forEach(function (segment) {
        routeLayer.appendChild(svgNode("path", { "class": "route-line", d: pathData(segment, false) }));
      });
    }

    state.destinations.forEach(function (destination, index) {
      var projected = E.projectOrthographic(destination.coordinate, state.centerLongitude, state.centerLatitude, RADIUS);
      if (!projected || !projected.visible) return;
      var x = CX + projected.x;
      var y = CY + projected.y;
      markerLayer.appendChild(svgNode("circle", {
        "class": "marker-dot",
        cx: x.toFixed(2), cy: y.toFixed(2), r: "5.5",
        "data-destination": String(index + 1)
      }));
      var label = svgNode("text", {
        "class": "marker-label",
        x: (x + 9).toFixed(2), y: (y - 8).toFixed(2)
      });
      label.textContent = String(index + 1) + " · " + destination.name;
      markerLayer.appendChild(label);
    });
  }

  function setDistanceMetric(total) {
    var formatted = E.formatDistance(total);
    var match = formatted.match(/^(.*) (m|km)$/);
    $("total-distance").querySelector(".v").textContent = match ? match[1] : formatted;
    $("total-distance").querySelector(".u").textContent = match ? match[2] : "";
  }

  function renderTable(route) {
    var tbody = $("route-rows");
    clear(tbody);
    state.destinations.forEach(function (destination, index) {
      var data = route.rows[index];
      var tr = document.createElement("tr");
      var values = [
        String(index + 1), destination.name, coordinateText(destination.coordinate),
        E.daylight(destination.coordinate, state.solar) ? "白天" : "黑夜",
        index ? E.formatDistance(data.segmentM) : "起点",
        E.formatDistance(data.cumulativeM), E.formatSolarDifference(data.solarDifferenceHours)
      ];
      values.forEach(function (value) {
        var td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    $("empty-row").hidden = state.destinations.length > 0;
  }

  function renderReadouts() {
    var route = E.routeSegments(state.destinations.map(function (item) { return item.coordinate; }));
    $("destination-count").querySelector(".v").textContent = String(state.destinations.length);
    setDistanceMetric(route.totalM);
    $("solar-declination").querySelector(".v").textContent = signed(state.solar.declinationDeg, 2);
    $("center-readout").textContent = "[" + state.centerLongitude.toFixed(1) + "°, " + state.centerLatitude.toFixed(1) + "°]";
    $("subsolar-readout").textContent = coordinateText([state.solar.subsolarLongitudeDeg, state.solar.declinationDeg]);
    $("terminator-readout").textContent = "赤纬 " + signed(state.solar.declinationDeg, 2) + " · 太阳对跖大圆";
    renderTable(route);

    if (!state.destinations.length) {
      $("route-basis").textContent = "零个用户目的地；离线陆地、国界、经纬网与当日昼夜分界已装载。";
    } else if (state.destinations.length === 1) {
      $("route-basis").textContent = "已加入第一个目的地；再加一站后显示 haversine 分段、大圆路线与太阳时差。";
    } else {
      $("route-basis").textContent = state.destinations.length + " 个目的地；总长 " + E.formatDistance(route.totalM) +
        "，逐段使用 haversine；太阳时差按相对起点经差 ÷ 15° 估算，不等于行政时区。";
    }
  }

  function render() {
    drawGraticule();
    drawWorldGeometry();
    drawNight();
    drawRoute();
    renderReadouts();
  }

  function nextName() {
    $("destination-name").value = "目的地 " + (state.destinations.length + 1);
  }

  function addDestination(name, coordinate, source) {
    var checked = E.coordinate(coordinate);
    if (!checked) {
      setInputNote("坐标无效：经度须在 −180..180，纬度须在 −90..90。", true);
      return false;
    }
    state.destinations.push({
      name: String(name || "").trim() || "目的地 " + (state.destinations.length + 1),
      coordinate: checked
    });
    setInputNote((source === "globe" ? "已从球面加入 " : "已按坐标加入 ") + coordinateText(checked) + "。", false);
    nextName();
    render();
    return true;
  }

  function eventPoint(event) {
    var rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return [(event.clientX - rect.left) * VIEW_W / rect.width, (event.clientY - rect.top) * VIEW_H / rect.height];
    }
    return [event.clientX, event.clientY];
  }

  function addFromGlobe(event) {
    var point = eventPoint(event);
    var coordinate = E.unprojectOrthographic([point[0] - CX, point[1] - CY], state.centerLongitude, state.centerLatitude, RADIUS);
    if (!coordinate) {
      setInputNote("请点在地球圆面内；圆外没有可加入的坐标。", true);
      return;
    }
    addDestination($("destination-name").value, coordinate, "globe");
  }

  $("add-coordinate").addEventListener("click", function () {
    addDestination($("destination-name").value, [$("longitude").value, $("latitude").value], "coordinate");
  });

  $("undo-destination").addEventListener("click", function () {
    if (state.destinations.length) state.destinations.pop();
    nextName();
    setInputNote(state.destinations.length ? "已撤回末站。" : "行程已回到零个目的地。", false);
    render();
  });

  $("clear-route").addEventListener("click", function () {
    state.destinations = [];
    nextName();
    setInputNote("行程已清空；离线地球与昼夜分界仍在。", false);
    render();
  });

  $("reset-view").addEventListener("click", function () {
    state.centerLongitude = 20;
    state.centerLatitude = 15;
    render();
  });

  detailsToggle.addEventListener("click", function () {
    setDetailsOpen(detailsPanel.hidden);
  });

  $("close-details").addEventListener("click", function () {
    setDetailsOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !detailsPanel.hidden) setDetailsOpen(false);
  });

  $("observation-time").addEventListener("change", function () {
    var solar = parseObservation();
    if (!solar) {
      setDateNote("日期无效：请提供一个可解析的 UTC 日期与时间。", true);
      return;
    }
    state.solar = solar;
    setDateNote("已按 " + solar.dateIso.replace(".000Z", "Z") + " 更新昼夜分界。", false);
    render();
  });

  var drag = null;
  var skipClick = false;
  svg.addEventListener("mousedown", function (event) {
    drag = { x: event.clientX, y: event.clientY, lon: state.centerLongitude, lat: state.centerLatitude, moved: false };
    svg.classList.add("dragging");
  });
  window.addEventListener("mousemove", function (event) {
    if (!drag) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    state.centerLongitude = E.normalize180(drag.lon - dx * .45);
    state.centerLatitude = Math.max(-85, Math.min(85, drag.lat + dy * .35));
    render();
  });
  window.addEventListener("mouseup", function () {
    if (!drag) return;
    skipClick = drag.moved;
    drag = null;
    svg.classList.remove("dragging");
  });
  svg.addEventListener("click", function (event) {
    if (skipClick) { skipClick = false; return; }
    addFromGlobe(event);
  });

  $("run-test").addEventListener("click", function () {
    var report = E.runSelfTest();
    $("test-out").textContent = report.passed + " / " + report.total + " 通过";
    var list = $("test-detail");
    clear(list);
    report.failures.forEach(function (failure) {
      var item = document.createElement("li");
      item.textContent = failure.name + "：" + failure.why;
      list.appendChild(item);
    });
  });

  state.solar = parseObservation();
  if (!E || !state.solar) throw new Error("地球仪引擎或默认日期未能初始化");
  render();
})();
