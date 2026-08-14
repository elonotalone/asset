(function (root) {
  "use strict";

  var STORAGE_MM = 1;
  var SNAP_MM = 10;
  var WALL_THICKNESSES_MM = [100, 200, 240, 300];
  var DOOR_WIDTH_RANGE_MM = [700, 1000];

  function finite(value) {
    if (typeof value === "number") return isFinite(value) ? value : null;
    var raw = String(value === undefined || value === null ? "" : value).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return null;
    var number = Number(raw);
    return isFinite(number) ? number : null;
  }

  function metersToMillimeters(value) {
    var meters = finite(value);
    return meters === null ? null : Math.round(meters * 1000);
  }

  function millimetersToMeters(value) {
    var millimeters = finite(value);
    return millimeters === null ? null : millimeters / 1000;
  }

  function snapMeters(value) {
    var millimeters = metersToMillimeters(value);
    if (millimeters === null) return null;
    return Math.round(millimeters / SNAP_MM) * SNAP_MM / 1000;
  }

  function pointFromMeters(x, y) {
    var sx = snapMeters(x);
    var sy = snapMeters(y);
    if (sx === null || sy === null) return null;
    return { xMm: metersToMillimeters(sx), yMm: metersToMillimeters(sy) };
  }

  function samePoint(a, b) {
    return !!a && !!b && a.xMm === b.xMm && a.yMm === b.yMm;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return null;
    var dx = a.xMm - b.xMm;
    var dy = a.yMm - b.yMm;
    return Math.sqrt(dx * dx + dy * dy) / 1000;
  }

  function polygonAreaSqM(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    var twiceArea = 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      if (!a || !b || finite(a.xMm) === null || finite(a.yMm) === null ||
          finite(b.xMm) === null || finite(b.yMm) === null) return null;
      twiceArea += a.xMm * b.yMm - b.xMm * a.yMm;
    }
    return Math.abs(twiceArea) / 2 / 1000000;
  }

  function pointKey(point) {
    return point.xMm + "," + point.yMm;
  }

  function segmentKey(segment) {
    var a = pointKey(segment.start);
    var b = pointKey(segment.end);
    return a < b ? a + "|" + b : b + "|" + a;
  }

  function uniqueSegments(segments) {
    var seen = {};
    var output = [];
    (segments || []).forEach(function (segment) {
      if (!segment || !segment.start || !segment.end || samePoint(segment.start, segment.end)) return;
      var key = segmentKey(segment);
      if (seen[key]) return;
      seen[key] = true;
      output.push({
        start: { xMm: segment.start.xMm, yMm: segment.start.yMm },
        end: { xMm: segment.end.xMm, yMm: segment.end.yMm }
      });
    });
    return output;
  }

  function uniqueWallLengthMeters(segments) {
    return uniqueSegments(segments).reduce(function (sum, segment) {
      return sum + distanceMeters(segment.start, segment.end);
    }, 0);
  }

  function closedChainPoints(segments) {
    if (!Array.isArray(segments) || segments.length < 3) return null;
    var points = [segments[0].start];
    for (var i = 0; i < segments.length; i++) {
      if (i > 0 && !samePoint(segments[i - 1].end, segments[i].start)) return null;
      points.push(segments[i].end);
    }
    if (!samePoint(points[0], points[points.length - 1])) return null;
    return points.slice(0, -1);
  }

  function suiteAreaSqM(segments) {
    var points = closedChainPoints(segments);
    return points ? polygonAreaSqM(points) : null;
  }

  function buildingAreaSqM(suiteArea, allocationFactor) {
    var area = finite(suiteArea);
    var factor = finite(allocationFactor);
    if (area === null || factor === null || area < 0 || factor <= 0) return null;
    return Math.round(area * factor * 1000000) / 1000000;
  }

  function boundsOfSegments(segments) {
    var points = [];
    (segments || []).forEach(function (segment) { points.push(segment.start, segment.end); });
    if (!points.length) return null;
    var xs = points.map(function (point) { return point.xMm; });
    var ys = points.map(function (point) { return point.yMm; });
    return {
      widthM: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 1000,
      heightM: (Math.max.apply(null, ys) - Math.min.apply(null, ys)) / 1000
    };
  }

  function formatMeters(value) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(2) + " m" : "—";
  }

  function formatArea(value) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(2) + " m²" : "—";
  }

  var CASES = [
    { name: "4 m × 3 m 矩形面积为 12 m²", run: function () {
      return polygonAreaSqM([{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}]) === 12;
    } },
    { name: "L 形鞋带面积为 12 m²", run: function () {
      return polygonAreaSqM([{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:2000},{xMm:2000,yMm:2000},{xMm:2000,yMm:4000},{xMm:0,yMm:4000}]) === 12;
    } },
    { name: "共享墙正反输入只计一次", run: function () {
      var a={xMm:0,yMm:0}, b={xMm:3000,yMm:0};
      return uniqueSegments([{start:a,end:b},{start:b,end:a}]).length === 1 && uniqueWallLengthMeters([{start:a,end:b},{start:b,end:a}]) === 3;
    } },
    { name: "0.01 m 吸附后为 10 mm 整数倍", run: function () {
      var p = pointFromMeters(1.234, -2.676);
      return p.xMm === 1230 && p.yMm === -2680 && p.xMm % 10 === 0 && p.yMm % 10 === 0;
    } },
    { name: "毫米精度往返无漂移", run: function () {
      return metersToMillimeters(millimetersToMeters(1234)) === 1234;
    } },
    { name: "围合墙链能还原矩形面积", run: function () {
      var p=[{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}];
      return suiteAreaSqM([{start:p[0],end:p[1]},{start:p[1],end:p[2]},{start:p[2],end:p[3]},{start:p[3],end:p[0]}]) === 12;
    } },
    { name: "建筑面积等于套内面积乘分摊系数", run: function () {
      return buildingAreaSqM(12, 1.15) === 13.8;
    } },
    { name: "常见墙厚与门宽口径完整", run: function () {
      return WALL_THICKNESSES_MM.join(",") === "100,200,240,300" && DOOR_WIDTH_RANGE_MM[0] === 700 && DOOR_WIDTH_RANGE_MM[1] === 1000;
    } }
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (test) {
      try { if (!test.run()) failures.push({ name: test.name, why: "断言返回 false" }); }
      catch (error) { failures.push({ name: test.name, why: error && error.message ? error.message : String(error) }); }
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    STORAGE_MM: STORAGE_MM,
    SNAP_MM: SNAP_MM,
    WALL_THICKNESSES_MM: WALL_THICKNESSES_MM,
    DOOR_WIDTH_RANGE_MM: DOOR_WIDTH_RANGE_MM,
    finite: finite,
    metersToMillimeters: metersToMillimeters,
    millimetersToMeters: millimetersToMeters,
    snapMeters: snapMeters,
    pointFromMeters: pointFromMeters,
    samePoint: samePoint,
    distanceMeters: distanceMeters,
    polygonAreaSqM: polygonAreaSqM,
    uniqueSegments: uniqueSegments,
    uniqueWallLengthMeters: uniqueWallLengthMeters,
    closedChainPoints: closedChainPoints,
    suiteAreaSqM: suiteAreaSqM,
    buildingAreaSqM: buildingAreaSqM,
    boundsOfSegments: boundsOfSegments,
    formatMeters: formatMeters,
    formatArea: formatArea,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.FloorplanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
