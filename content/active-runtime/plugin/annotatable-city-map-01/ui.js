(function () {
  "use strict";

  var E = window.CityMapEngine;
  var NS = "http://www.w3.org/2000/svg";
  var state = { locations: [] };
  var els = {};

  function node(tag, cls, text) {
    var result = document.createElement(tag);
    if (cls) result.className = cls;
    if (text !== undefined) result.textContent = String(text);
    return result;
  }

  function svgNode(tag, attrs) {
    var result = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { result.setAttribute(key, String(attrs[key])); });
    return result;
  }

  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }

  function ringPath(ring) {
    var parts = [];
    for (var i = 0; i < ring.length; i++) {
      var p = E.projectEquirectangular(ring[i], 960, 480);
      parts.push((i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2));
    }
    return parts.join(" ") + " Z";
  }

  function polygonPath(polygon) {
    return polygon.map(ringPath).join(" ");
  }

  function buildBaseMap() {
    for (var lon = -150; lon <= 150; lon += 30) {
      var x = E.projectEquirectangular([lon, 0], 960, 480)[0];
      els.graticule.appendChild(svgNode("path", { "class": "graticule", d: "M" + x + " 0 V480" }));
    }
    for (var lat = -60; lat <= 60; lat += 30) {
      var y = E.projectEquirectangular([0, lat], 960, 480)[1];
      els.graticule.appendChild(svgNode("path", { "class": "graticule", d: "M0 " + y + " H960" }));
    }

    var world = E.worldGeometry();
    world.land.forEach(function (polygon) {
      els.land.appendChild(svgNode("path", { "class": "land-shape", d: polygonPath(polygon) }));
    });
    world.countries.forEach(function (polygon) {
      els.borders.appendChild(svgNode("path", { "class": "country-line", d: polygonPath(polygon) }));
    });
  }

  function formatCoordinate(value) { return "[" + value[0].toFixed(4) + ", " + value[1].toFixed(4) + "]"; }

  function setMetric(container, value, unit) {
    container.querySelector(".v").textContent = value;
    var unitNode = container.querySelector(".u");
    if (unitNode && unit !== undefined) unitNode.textContent = unit;
  }

  function render() {
    var points = state.locations.map(function (item) { return item.coordinate; });
    var route = E.routeSegments(points);
    var simplification = E.simplificationReport(points, 0.5);
    setMetric(els.locationCount, String(points.length), "个");

    if (route.totalM < 1000) setMetric(els.totalDistance, String(Math.round(route.totalM)), "m");
    else setMetric(els.totalDistance, (route.totalM / 1000).toFixed(1), "km");

    var area = E.polygonArea(points);
    setMetric(els.areaValue, area === null ? "尚未形成" : E.formatArea(area));

    clear(els.routeLayer);
    clear(els.markerLayer);
    if (points.length > 1) {
      var d = points.map(function (point, index) {
        var p = E.projectEquirectangular(point, 960, 480);
        return (index ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2);
      }).join(" ");
      els.routeLayer.appendChild(svgNode("path", { "class": "route-line", d: d }));
    }
    state.locations.forEach(function (item, index) {
      var p = E.projectEquirectangular(item.coordinate, 960, 480);
      els.markerLayer.appendChild(svgNode("circle", { "class": "pin-dot", cx: p[0], cy: p[1], r: 5.5 }));
      var label = svgNode("text", { "class": "pin-label", x: p[0] + 8, y: p[1] - 7 });
      label.textContent = String(index + 1) + " · " + item.name;
      els.markerLayer.appendChild(label);
    });

    clear(els.rows);
    route.rows.forEach(function (row, index) {
      var tr = document.createElement("tr");
      var values = [String(index + 1), state.locations[index].name, formatCoordinate(row.coordinate), index ? E.formatDistance(row.segmentM) : "起点", E.formatDistance(row.cumulativeM)];
      values.forEach(function (value) { tr.appendChild(node("td", null, value)); });
      els.rows.appendChild(tr);
    });
    els.empty.hidden = points.length > 0;
    els.instruction.textContent = points.length === 0 ? "在图上点一下，落下第一个地点" : "继续点图添加地点；蓝线按顺序连接";

    if (points.length === 0) {
      els.routeBasis.textContent = "零个用户地点；全球底图、国界与经纬网已离线装载。";
    } else if (points.length === 1) {
      els.routeBasis.textContent = "已有 1 个地点；再落一个点后显示 haversine 分段距离与总长。";
    } else {
      els.routeBasis.textContent = "分段按 haversine 计算；原路线 " + E.formatDistance(simplification.originalM) +
        "，抽稀后 " + simplification.simplified.length + " 点 / " + E.formatDistance(simplification.simplifiedM) +
        "，长度差 " + simplification.errorPercent.toFixed(3) + "%（上限 0.5%）。";
    }
  }

  function addLocation(name, value) {
    var checked = E.coordinate(value);
    if (!checked) {
      els.inputNote.textContent = "坐标无效：经度须在 -180 至 180，纬度须在 -90 至 90。";
      return false;
    }
    var safeName = String(name || "").trim() || "地点 " + (state.locations.length + 1);
    state.locations.push({ name: safeName, coordinate: checked });
    els.name.value = "地点 " + (state.locations.length + 1);
    els.longitude.value = checked[0].toFixed(4);
    els.latitude.value = checked[1].toFixed(4);
    els.inputNote.textContent = "已添加「" + safeName + "」 " + formatCoordinate(checked) + "。";
    render();
    return true;
  }

  function addFromFields() {
    addLocation(els.name.value, [Number(els.longitude.value), Number(els.latitude.value)]);
  }

  function addFromMap(event) {
    var rect = els.map.getBoundingClientRect();
    var width = rect.width || 960;
    var height = rect.height || 480;
    var x = (event.clientX - rect.left) / width * 960;
    var y = (event.clientY - rect.top) / height * 480;
    var value = E.unprojectEquirectangular([x, y], 960, 480);
    if (value) addLocation(els.name.value, value);
  }

  function runTest() {
    var report = E.runSelfTest();
    els.testOut.textContent = report.passed + " / " + report.total + " 通过";
    clear(els.testDetail);
    report.failures.forEach(function (failure) {
      els.testDetail.appendChild(node("li", null, failure.name + " —— " + failure.why));
    });
    if (!report.failures.length) els.testDetail.appendChild(node("li", null, "半径、CRS84、颜色、边界值、离线轮廓与抽稀误差均已核对。"));
  }

  function mount() {
    els.map = document.getElementById("world-map");
    els.graticule = document.getElementById("graticule-layer");
    els.land = document.getElementById("land-layer");
    els.borders = document.getElementById("border-layer");
    els.routeLayer = document.getElementById("route-layer");
    els.markerLayer = document.getElementById("marker-layer");
    els.locationCount = document.getElementById("location-count");
    els.totalDistance = document.getElementById("total-distance");
    els.areaValue = document.getElementById("area-value");
    els.rows = document.getElementById("route-rows");
    els.empty = document.getElementById("empty-row");
    els.routeBasis = document.getElementById("route-basis");
    els.instruction = document.getElementById("map-instruction");
    els.inputNote = document.getElementById("input-note");
    els.name = document.getElementById("place-name");
    els.longitude = document.getElementById("longitude");
    els.latitude = document.getElementById("latitude");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    buildBaseMap();
    els.map.addEventListener("click", addFromMap);
    document.getElementById("add-coordinate").addEventListener("click", addFromFields);
    document.getElementById("undo-point").addEventListener("click", function () {
      if (state.locations.length) state.locations.pop();
      els.name.value = "地点 " + (state.locations.length + 1);
      els.inputNote.textContent = state.locations.length ? "已撤回末点。" : "路线已回到零个地点。";
      render();
    });
    document.getElementById("clear-route").addEventListener("click", function () {
      state.locations = [];
      els.name.value = "地点 1";
      els.inputNote.textContent = "路线已清空；离线全球底图仍在。";
      render();
    });
    document.getElementById("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
