(function (root) {
  "use strict";

  var EARTH_RADIUS_M = 6371008.8;
  var COLORS = {
    land: "#F2EDE3",
    water: "#A8C8DC",
    coast: "#3F6478",
    pin: "#AE3A0B",
    route: "#1D4ED8"
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

  function coordinate(value) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    var lon = Number(value[0]);
    var lat = Number(value[1]);
    if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
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
    h = Math.min(1, Math.max(0, h));
    return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function routeSegments(points) {
    if (!Array.isArray(points)) return null;
    var checked = [];
    for (var i = 0; i < points.length; i++) {
      var c = coordinate(points[i]);
      if (!c) return null;
      checked.push(c);
    }
    var rows = [];
    var total = 0;
    for (var j = 0; j < checked.length; j++) {
      var segment = j === 0 ? 0 : haversine(checked[j - 1], checked[j]);
      total += segment;
      rows.push({ index: j, coordinate: checked[j], segmentM: segment, cumulativeM: total });
    }
    return { rows: rows, totalM: total };
  }

  function routeLength(points) {
    var result = routeSegments(points);
    return result ? result.totalM : null;
  }

  function simplifyRoute(points, maxErrorPercent) {
    var checked = routeSegments(points);
    if (!checked) return null;
    var route = points.map(function (p) { return [Number(p[0]), Number(p[1])]; });
    if (route.length <= 2 || checked.totalM === 0) return route;
    var limit = maxErrorPercent === undefined ? 0.5 : Number(maxErrorPercent);
    if (!isFinite(limit) || limit < 0) return null;
    var original = checked.totalM;

    while (route.length > 2) {
      var best = null;
      for (var i = 1; i < route.length - 1; i++) {
        var candidate = route.slice(0, i).concat(route.slice(i + 1));
        var candidateLength = routeLength(candidate);
        var error = Math.abs(candidateLength - original) / original * 100;
        if (!best || error < best.error) best = { route: candidate, error: error };
      }
      if (!best || best.error > limit + 1e-12) break;
      route = best.route;
    }
    return route;
  }

  function simplificationReport(points, maxErrorPercent) {
    var originalM = routeLength(points);
    var simplified = simplifyRoute(points, maxErrorPercent);
    if (originalM === null || !simplified) return null;
    var simplifiedM = routeLength(simplified);
    var errorPercent = originalM === 0 ? 0 : Math.abs(simplifiedM - originalM) / originalM * 100;
    return { original: points, simplified: simplified, originalM: originalM, simplifiedM: simplifiedM, errorPercent: errorPercent };
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    var checked = [];
    for (var i = 0; i < points.length; i++) {
      var c = coordinate(points[i]);
      if (!c) return null;
      checked.push(c);
    }
    var sum = 0;
    for (var j = 0; j < checked.length; j++) {
      var p1 = checked[j];
      var p2 = checked[(j + 1) % checked.length];
      var dLon = radians(p2[0] - p1[0]);
      if (dLon > Math.PI) dLon -= 2 * Math.PI;
      if (dLon < -Math.PI) dLon += 2 * Math.PI;
      sum += dLon * (2 + Math.sin(radians(p1[1])) + Math.sin(radians(p2[1])));
    }
    var area = Math.abs(sum) * EARTH_RADIUS_M * EARTH_RADIUS_M / 2;
    var sphere = 4 * Math.PI * EARTH_RADIUS_M * EARTH_RADIUS_M;
    return area > sphere / 2 ? sphere - area : area;
  }

  function groupInteger(text) {
    var out = "";
    var count = 0;
    for (var i = text.length - 1; i >= 0; i--) {
      out = text.charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) out = " " + out;
    }
    return out;
  }

  function formatArea(squareMetres) {
    if (typeof squareMetres !== "number" || !isFinite(squareMetres) || squareMetres < 0) return "—";
    if (squareMetres < 1000) return groupInteger(String(Math.round(squareMetres))) + " m²";
    var km = squareMetres / 1000000;
    var digits = km < 0.01 ? 3 : km < 100 ? 2 : 1;
    return Number(km.toFixed(digits)).toLocaleString("en-US").replace(/,/g, " ") + " km²";
  }

  function formatDistance(metres) {
    if (typeof metres !== "number" || !isFinite(metres) || metres < 0) return "—";
    if (metres < 1000) return groupInteger(String(Math.round(metres))) + " m";
    var km = metres / 1000;
    var digits = km < 100 ? 2 : 1;
    return Number(km.toFixed(digits)).toLocaleString("en-US").replace(/,/g, " ") + " km";
  }

  function projectEquirectangular(value, width, height) {
    var c = coordinate(value);
    if (!c || !(width > 0) || !(height > 0)) return null;
    return [(c[0] + 180) / 360 * width, (90 - c[1]) / 180 * height];
  }

  function unprojectEquirectangular(point, width, height) {
    if (!Array.isArray(point) || point.length !== 2 || !(width > 0) || !(height > 0)) return null;
    var x = Number(point[0]);
    var y = Number(point[1]);
    if (!isFinite(x) || !isFinite(y) || x < 0 || x > width || y < 0 || y > height) return null;
    return [x / width * 360 - 180, 90 - y / height * 180];
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
    if (geometry.type === "Polygon") {
      return [geometry.arcs.map(decodeRing)];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.arcs.map(function (polygon) { return polygon.map(decodeRing); });
    }
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
    if (!geometryCache) {
      geometryCache = { land: objectPolygons("land"), countries: objectPolygons("countries") };
    }
    return geometryCache;
  }

  var CASES = [
    { name: "赤道经差 1° 使用指定半径", run: function () { return haversine([0, 0], [1, 0]); }, expect: 111195.0802335329, tol: 1e-6 },
    { name: "北京到上海大圆距离", run: function () { return haversine([116.4074, 39.9042], [121.4737, 31.2304]); }, expect: 1067311.645158726, tol: 1e-6 },
    { name: "同一点距离为零", run: function () { return haversine([24.9384, 60.1699], [24.9384, 60.1699]); }, expect: 0, tol: 0 },
    { name: "坏坐标明确拒绝", run: function () { return haversine([181, 0], [0, 0]) === null && haversine([0, 91], [0, 0]) === null ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "分段之和等于总长", run: function () { var r = routeSegments([[0,0],[1,0],[2,0]]); return Math.abs(r.totalM - r.rows[2].cumulativeM); }, expect: 0, tol: 1e-9 },
    { name: "抽稀长度差不超过 0.5%", run: function () { return simplificationReport([[0,0],[.5,.0001],[1,0],[1.5,-.0001],[2,0]], .5).errorPercent <= .5 ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "面积 999 m² 仍用 m²", run: function () { return formatArea(999) === "999 m²" ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "面积 1000 m² 改用 km²", run: function () { return formatArea(1000) === "0.001 km²" ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "CRS84 投影保持经度在前", run: function () { var p = projectEquirectangular([180, 90], 960, 480); return p[0] === 960 && p[1] === 0 ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "投影与反投影往返", run: function () { var p = projectEquirectangular([116.4074,39.9042],960,480); var c = unprojectEquirectangular(p,960,480); return Math.max(Math.abs(c[0]-116.4074),Math.abs(c[1]-39.9042)); }, expect: 0, tol: 1e-10 },
    { name: "五个辨识色逐项符合规格", run: function () { return COLORS.land === "#F2EDE3" && COLORS.water === "#A8C8DC" && COLORS.coast === "#3F6478" && COLORS.pin === "#AE3A0B" && COLORS.route === "#1D4ED8" ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "离线陆地轮廓已解码", run: function () { return worldGeometry().land.length > 0 ? 1 : 0; }, expect: 1, tol: 0 },
    { name: "离线国家边界已解码", run: function () { return worldGeometry().countries.length > 0 ? 1 : 0; }, expect: 1, tol: 0 }
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
    haversine: haversine,
    routeSegments: routeSegments,
    routeLength: routeLength,
    simplifyRoute: simplifyRoute,
    simplificationReport: simplificationReport,
    polygonArea: polygonArea,
    formatArea: formatArea,
    formatDistance: formatDistance,
    projectEquirectangular: projectEquirectangular,
    unprojectEquirectangular: unprojectEquirectangular,
    worldGeometry: worldGeometry,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.CityMapEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
