(function (root) {
  "use strict";

  var EARTH_RADIUS_M = 6371008.8;
  var COLORS = {
    ocean: "#0B3D5C",
    land: "#E8DCC8",
    border: "#4A5568",
    graticule: "#94A3B8",
    night: "rgba(5, 12, 24, 0.48)"
  };
  var WORLD_DATA_META = {
    source: "Natural Earth 4.1.0",
    sourceLicense: "public domain",
    package: "world-atlas 2.0.2",
    packageLicense: "ISC",
    scale: "1:110m"
  };
  var WORLD_TOPOLOGY = /*__WORLD_DATA__*/ null;
  var geometryCache = null;

  function radians(degrees) { return degrees * Math.PI / 180; }
  function degrees(value) { return value * 180 / Math.PI; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function normalize360(value) { return ((value % 360) + 360) % 360; }
  function normalize180(value) {
    var result = normalize360(value + 180) - 180;
    return result === -180 && value > 0 ? 180 : result;
  }

  function coordinate(value) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    var lon = Number(value[0]);
    var lat = Number(value[1]);
    if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
  }

  function vector(value) {
    var checked = coordinate(value);
    if (!checked) return null;
    var lon = radians(checked[0]);
    var lat = radians(checked[1]);
    var cosLat = Math.cos(lat);
    return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
  }

  function vectorCoordinate(value) {
    var length = Math.hypot(value[0], value[1], value[2]);
    if (!length) return null;
    var x = value[0] / length;
    var y = value[1] / length;
    var z = value[2] / length;
    return [normalize180(degrees(Math.atan2(y, x))), degrees(Math.asin(clamp(z, -1, 1)))];
  }

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function unit(value) {
    var length = Math.hypot(value[0], value[1], value[2]);
    return length ? [value[0] / length, value[1] / length, value[2] / length] : null;
  }

  function haversine(from, to) {
    var a = coordinate(from);
    var b = coordinate(to);
    if (!a || !b) return null;
    var phi1 = radians(a[1]);
    var phi2 = radians(b[1]);
    var dPhi = phi2 - phi1;
    var dLambda = radians(b[0] - a[0]);
    var h = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    h = clamp(h, 0, 1);
    return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function solarTimeDifference(fromLongitude, toLongitude) {
    var from = Number(fromLongitude);
    var to = Number(toLongitude);
    if (!isFinite(from) || !isFinite(to) || from < -180 || from > 180 || to < -180 || to > 180) return null;
    return normalize180(to - from) / 15;
  }

  function validDate(value) {
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return isFinite(date.getTime()) ? date : null;
  }

  function solarPosition(value) {
    var date = validDate(value);
    if (!date) return null;
    var julianDay = date.getTime() / 86400000 + 2440587.5;
    var n = julianDay - 2451545.0;
    var meanLongitude = normalize360(280.460 + 0.9856474 * n);
    var meanAnomaly = radians(normalize360(357.528 + 0.9856003 * n));
    var eclipticLongitude = radians(normalize360(meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)));
    var obliquity = radians(23.439 - 0.0000004 * n);
    var declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    var rightAscension = normalize360(degrees(Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude))));
    var centuries = n / 36525;
    var sidereal = normalize360(280.46061837 + 360.98564736629 * n + 0.000387933 * centuries * centuries - centuries * centuries * centuries / 38710000);
    return {
      dateIso: date.toISOString(),
      declinationDeg: degrees(declination),
      subsolarLongitudeDeg: normalize180(rightAscension - sidereal)
    };
  }

  function solarVector(solar) {
    if (!solar || !isFinite(solar.declinationDeg) || !isFinite(solar.subsolarLongitudeDeg)) return null;
    return vector([solar.subsolarLongitudeDeg, solar.declinationDeg]);
  }

  function daylight(value, solar) {
    var point = vector(value);
    var sun = solarVector(solar);
    if (!point || !sun) return null;
    return dot(point, sun) >= 0;
  }

  function terminatorPoints(solar, count) {
    var sun = solarVector(solar);
    if (!sun) return null;
    var total = Math.max(24, Math.floor(Number(count) || 181));
    var reference = Math.abs(sun[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    var u = unit(cross(sun, reference));
    var v = unit(cross(sun, u));
    var points = [];
    for (var i = 0; i <= total; i++) {
      var angle = i / total * Math.PI * 2;
      points.push(vectorCoordinate([
        u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
        u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
        u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
      ]));
    }
    return points;
  }

  function routeSegments(points) {
    if (!Array.isArray(points)) return null;
    var checked = [];
    for (var i = 0; i < points.length; i++) {
      var item = coordinate(points[i]);
      if (!item) return null;
      checked.push(item);
    }
    var rows = [];
    var total = 0;
    for (var j = 0; j < checked.length; j++) {
      var segment = j ? haversine(checked[j - 1], checked[j]) : 0;
      total += segment;
      rows.push({
        coordinate: checked[j],
        segmentM: segment,
        cumulativeM: total,
        solarDifferenceHours: j ? solarTimeDifference(checked[0][0], checked[j][0]) : 0
      });
    }
    return { rows: rows, totalM: total };
  }

  function greatCirclePoints(from, to, count) {
    var a = vector(from);
    var b = vector(to);
    if (!a || !b) return null;
    var total = Math.max(2, Math.floor(Number(count) || 65));
    var omega = Math.acos(clamp(dot(a, b), -1, 1));
    var sinOmega = Math.sin(omega);
    var points = [];
    for (var i = 0; i < total; i++) {
      var t = i / (total - 1);
      var p;
      if (omega < 1e-12) p = a;
      else if (Math.abs(sinOmega) < 1e-9) {
        p = unit([a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t]);
        if (!p) p = a;
      } else {
        var wa = Math.sin((1 - t) * omega) / sinOmega;
        var wb = Math.sin(t * omega) / sinOmega;
        p = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
      }
      points.push(vectorCoordinate(p));
    }
    return points;
  }

  function viewBasis(centerLongitude, centerLatitude) {
    var center = coordinate([centerLongitude, centerLatitude]);
    if (!center) return null;
    var lon = radians(center[0]);
    var lat = radians(center[1]);
    var forward = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    var right = [-Math.sin(lon), Math.cos(lon), 0];
    var up = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
    return { forward: forward, right: right, up: up };
  }

  function projectOrthographic(value, centerLongitude, centerLatitude, radius) {
    var point = vector(value);
    var basis = viewBasis(centerLongitude, centerLatitude);
    var r = Number(radius);
    if (!point || !basis || !(r > 0)) return null;
    var depth = dot(point, basis.forward);
    return {
      x: dot(point, basis.right) * r,
      y: -dot(point, basis.up) * r,
      depth: depth,
      visible: depth >= -1e-10
    };
  }

  function unprojectOrthographic(point, centerLongitude, centerLatitude, radius) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    var basis = viewBasis(centerLongitude, centerLatitude);
    var r = Number(radius);
    var x = Number(point[0]) / r;
    var screenY = Number(point[1]) / r;
    if (!basis || !(r > 0) || !isFinite(x) || !isFinite(screenY) || x * x + screenY * screenY > 1 + 1e-10) return null;
    var y = -screenY;
    var z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    return vectorCoordinate([
      basis.right[0] * x + basis.up[0] * y + basis.forward[0] * z,
      basis.right[1] * x + basis.up[1] * y + basis.forward[1] * z,
      basis.right[2] * x + basis.up[2] * y + basis.forward[2] * z
    ]);
  }

  function visibleSegments(points, centerLongitude, centerLatitude, radius) {
    if (!Array.isArray(points)) return [];
    var segments = [];
    var current = [];
    for (var i = 0; i < points.length; i++) {
      var projected = projectOrthographic(points[i], centerLongitude, centerLatitude, radius);
      if (projected && projected.visible) current.push([projected.x, projected.y]);
      else if (current.length) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }

  function graticuleLines() {
    var lines = [];
    var lon;
    var lat;
    var points;
    for (lon = -180; lon < 180; lon += 30) {
      points = [];
      for (lat = -90; lat <= 90; lat += 3) points.push([lon, lat]);
      lines.push(points);
    }
    for (lat = -60; lat <= 60; lat += 30) {
      points = [];
      for (lon = -180; lon <= 180; lon += 3) points.push([lon, lat]);
      lines.push(points);
    }
    return lines;
  }

  function nightBands(centerLongitude, centerLatitude, solar, rows, columns) {
    var basis = viewBasis(centerLongitude, centerLatitude);
    var sun = solarVector(solar);
    if (!basis || !sun) return null;
    var rowCount = Math.max(24, Math.floor(Number(rows) || 64));
    var columnCount = Math.max(48, Math.floor(Number(columns) || 160));
    var result = [];
    var dy = 2 / rowCount;
    for (var row = 0; row < rowCount; row++) {
      var screenY = -1 + (row + 0.5) * dy;
      var edge = Math.sqrt(Math.max(0, 1 - screenY * screenY));
      var dx = edge * 2 / columnCount;
      var open = null;
      for (var col = 0; col < columnCount; col++) {
        var x = -edge + (col + 0.5) * dx;
        var y = -screenY;
        var z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        var world = [
          basis.right[0] * x + basis.up[0] * y + basis.forward[0] * z,
          basis.right[1] * x + basis.up[1] * y + basis.forward[1] * z,
          basis.right[2] * x + basis.up[2] * y + basis.forward[2] * z
        ];
        var isNight = dot(world, sun) < 0;
        if (isNight && open === null) open = -edge + col * dx;
        if ((!isNight || col === columnCount - 1) && open !== null) {
          var end = !isNight ? -edge + col * dx : -edge + (col + 1) * dx;
          result.push({ x0: open, x1: end, y0: screenY - dy / 2, y1: screenY + dy / 2 });
          open = null;
        }
      }
    }
    return result;
  }

  function decodeArc(reference) {
    var index = reference < 0 ? ~reference : reference;
    var source = WORLD_TOPOLOGY.arcs[index];
    var transform = WORLD_TOPOLOGY.transform;
    var x = 0;
    var y = 0;
    var result = [];
    for (var i = 0; i < source.length; i++) {
      x += source[i][0];
      y += source[i][1];
      result.push([x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]]);
    }
    if (reference < 0) result.reverse();
    return result;
  }

  function decodeRing(references) {
    var ring = [];
    for (var i = 0; i < references.length; i++) {
      var arc = decodeArc(references[i]);
      if (ring.length && arc.length) arc = arc.slice(1);
      ring = ring.concat(arc);
    }
    return ring;
  }

  function geometryPolygons(geometry) {
    if (geometry.type === "Polygon") return [geometry.arcs.map(decodeRing)];
    if (geometry.type === "MultiPolygon") return geometry.arcs.map(function (polygon) { return polygon.map(decodeRing); });
    return [];
  }

  function objectPolygons(name) {
    var object = WORLD_TOPOLOGY.objects[name];
    var geometries = object.type === "GeometryCollection" ? object.geometries : [object];
    var polygons = [];
    for (var i = 0; i < geometries.length; i++) polygons = polygons.concat(geometryPolygons(geometries[i]));
    return polygons;
  }

  function worldGeometry() {
    if (!geometryCache) geometryCache = { land: objectPolygons("land"), countries: objectPolygons("countries") };
    return geometryCache;
  }

  function formatDistance(metres) {
    if (typeof metres !== "number" || !isFinite(metres) || metres < 0) return "—";
    if (metres < 1000) return String(Math.round(metres)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " m";
    var kilometres = metres / 1000;
    return Number(kilometres.toFixed(kilometres < 100 ? 2 : 1)).toLocaleString("en-US").replace(/,/g, " ") + " km";
  }

  function formatSolarDifference(hours) {
    if (typeof hours !== "number" || !isFinite(hours)) return "—";
    if (Math.abs(hours) < 0.005) return "0.00 h";
    return (hours > 0 ? "+" : "−") + Math.abs(hours).toFixed(2) + " h";
  }

  var CASES = [
    { name: "赤道经差 1° 使用指定半径", run: function () { return haversine([0, 0], [1, 0]); }, expect: 111195.0802335329, tol: 1e-6 },
    { name: "北京到上海大圆距离", run: function () { return haversine([116.4074, 39.9042], [121.4737, 31.2304]); }, expect: 1067311.645158726, tol: 1e-6 },
    { name: "经差 15° 是 1 小时太阳时差", run: function () { return solarTimeDifference(0, 15); }, expect: 1, tol: 0 },
    { name: "2026 夏至太阳赤纬约 +23.44°", run: function () { return solarPosition("2026-06-21T12:00:00Z").declinationDeg; }, expect: 23.44, tol: 0.12 },
    { name: "2026 冬至太阳赤纬约 -23.44°", run: function () { return solarPosition("2026-12-21T12:00:00Z").declinationDeg; }, expect: -23.44, tol: 0.12 },
    { name: "昼夜分界与太阳向量正交", run: function () { var s = solarPosition("2026-08-14T12:00:00Z"); var p = terminatorPoints(s, 90)[17]; return Math.abs(dot(vector(p), solarVector(s))); }, expect: 0, tol: 1e-12 },
    { name: "正交投影与反投影往返", run: function () { var p = projectOrthographic([20, 15], 20, 15, 220); var c = unprojectOrthographic([p.x, p.y], 20, 15, 220); return Math.max(Math.abs(c[0] - 20), Math.abs(c[1] - 15)); }, expect: 0, tol: 1e-10 },
    { name: "五类昼夜配色逐项符合规格", run: function () { return COLORS.ocean === "#0B3D5C" && COLORS.land === "#E8DCC8" && COLORS.border === "#4A5568" && COLORS.graticule === "#94A3B8" && /0\.48/.test(COLORS.night) ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "离线陆地与国界已解码", run: function () { var w = worldGeometry(); return w.land.length > 0 && w.countries.length > 0 ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "坏日期与坏坐标明确拒绝", run: function () { return solarPosition("not-a-date") === null && haversine([181, 0], [0, 0]) === null ? 1 : 0; }, expect: 1, tol: 0 }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var item = CASES[i];
      try {
        var got = item.run();
        if (typeof got !== "number" || !isFinite(got) || Math.abs(got - item.expect) > item.tol) {
          failures.push({ name: item.name, why: "期望 " + item.expect + "，得到 " + got });
        }
      } catch (error) {
        failures.push({ name: item.name, why: "抛异常：" + (error && error.message ? error.message : String(error)) });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    EARTH_RADIUS_M: EARTH_RADIUS_M,
    COLORS: COLORS,
    WORLD_DATA_META: WORLD_DATA_META,
    coordinate: coordinate,
    vector: vector,
    dot: dot,
    normalize180: normalize180,
    haversine: haversine,
    solarTimeDifference: solarTimeDifference,
    solarPosition: solarPosition,
    solarVector: solarVector,
    daylight: daylight,
    terminatorPoints: terminatorPoints,
    routeSegments: routeSegments,
    greatCirclePoints: greatCirclePoints,
    projectOrthographic: projectOrthographic,
    unprojectOrthographic: unprojectOrthographic,
    visibleSegments: visibleSegments,
    graticuleLines: graticuleLines,
    nightBands: nightBands,
    worldGeometry: worldGeometry,
    formatDistance: formatDistance,
    formatSolarDifference: formatSolarDifference,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.InteractiveGlobeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
