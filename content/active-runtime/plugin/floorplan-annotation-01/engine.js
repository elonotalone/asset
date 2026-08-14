/*
 * 户型标注 · 计算内核
 *
 * 局部米制坐标，毫米整数存储，0.01 m 吸附。
 * 尺寸标注惯例对应 ISO 129-1:2018，字形对应 ISO 3098-1；这些编号只留在这里，不上屏。
 * 墙厚 100/200/240/300 mm、门宽 700–1000 mm 是可选参考值，不是对实际建筑的断言。
 */
(function (root) {
  "use strict";

  var STORAGE_MM = 1;
  var SNAP_MM = 10;
  var WALL_THICKNESSES_MM = [100, 200, 240, 300];
  var DOOR_WIDTH_RANGE_MM = [700, 1000];
  var DEFAULT_WALL_MM = 200;
  var DEFAULT_DOOR_MM = 900;
  var DEFAULT_WINDOW_MM = 1200;

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

  function distanceMm(a, b) {
    if (!a || !b) return null;
    var dx = a.xMm - b.xMm;
    var dy = a.yMm - b.yMm;
    return Math.sqrt(dx * dx + dy * dy);
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

  /* 面积加权重心：房间名与面积落在房间内部，不落在外接矩形中心。 */
  function polygonCentroid(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    var twiceArea = 0;
    var cx = 0;
    var cy = 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      var cross = a.xMm * b.yMm - b.xMm * a.yMm;
      twiceArea += cross;
      cx += (a.xMm + b.xMm) * cross;
      cy += (a.yMm + b.yMm) * cross;
    }
    if (twiceArea === 0) return null;
    return { xMm: cx / (3 * twiceArea), yMm: cy / (3 * twiceArea) };
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

  /* 一套空间可以有多间房。共享墙只画一次，面积按房逐间相加。 */
  function segmentsOfRing(points) {
    var output = [];
    if (!Array.isArray(points) || points.length < 2) return output;
    for (var i = 0; i < points.length; i++) {
      output.push({ start: points[i], end: points[(i + 1) % points.length] });
    }
    return output;
  }

  function segmentsOfChain(points) {
    var output = [];
    if (!Array.isArray(points)) return output;
    for (var i = 0; i + 1 < points.length; i++) {
      output.push({ start: points[i], end: points[i + 1] });
    }
    return output;
  }

  function roomsWallSegments(rooms, openChain) {
    var all = [];
    (rooms || []).forEach(function (room) {
      segmentsOfRing(room && room.points).forEach(function (segment) { all.push(segment); });
    });
    segmentsOfChain(openChain).forEach(function (segment) { all.push(segment); });
    return uniqueSegments(all);
  }

  function totalSuiteAreaSqM(rooms) {
    var list = (rooms || []).filter(function (room) {
      return room && Array.isArray(room.points) && room.points.length >= 3;
    });
    if (!list.length) return null;
    return list.reduce(function (sum, room) {
      var area = polygonAreaSqM(room.points);
      return area === null ? sum : sum + area;
    }, 0);
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
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    return {
      minXMm: minX, maxXMm: maxX, minYMm: minY, maxYMm: maxY,
      widthM: (maxX - minX) / 1000,
      heightM: (maxY - minY) / 1000
    };
  }

  /* 点到墙的投影：命中判定与门窗定位都用它，所以放在内核里可测。 */
  function projectOntoSegment(segment, point) {
    if (!segment || !point) return null;
    var ax = segment.start.xMm;
    var ay = segment.start.yMm;
    var bx = segment.end.xMm;
    var by = segment.end.yMm;
    var dx = bx - ax;
    var dy = by - ay;
    var lengthMm = Math.sqrt(dx * dx + dy * dy);
    if (lengthMm === 0) return null;
    var t = ((point.xMm - ax) * dx + (point.yMm - ay) * dy) / (lengthMm * lengthMm);
    var clamped = Math.max(0, Math.min(1, t));
    var foot = { xMm: ax + dx * clamped, yMm: ay + dy * clamped };
    return {
      offsetMm: clamped * lengthMm,
      lengthMm: lengthMm,
      distanceMm: distanceMm(point, foot),
      foot: foot,
      inside: t >= 0 && t <= 1
    };
  }

  function nearestWall(walls, point, toleranceMm) {
    var limit = finite(toleranceMm);
    if (limit === null) limit = 300;
    var best = null;
    (walls || []).forEach(function (wall, index) {
      var hit = projectOntoSegment(wall, point);
      if (!hit || hit.distanceMm > limit) return;
      if (!best || hit.distanceMm < best.distanceMm) {
        best = { index: index, wall: wall, offsetMm: hit.offsetMm, lengthMm: hit.lengthMm, distanceMm: hit.distanceMm };
      }
    });
    return best;
  }

  /* 门窗必须整段落在墙上，并把中心夹进墙内，不许骑出墙外或彼此重叠。 */
  function clampOpeningCenterMm(wallLengthMm, widthMm, centerMm) {
    var half = widthMm / 2;
    if (wallLengthMm <= widthMm) return null;
    return Math.max(half, Math.min(wallLengthMm - half, centerMm));
  }

  function openingsOfWall(openings, wall) {
    var key = segmentKey(wall);
    return (openings || []).filter(function (opening) {
      return opening && opening.wallKey === key;
    });
  }

  function openingSpanMm(opening) {
    if (!opening) return null;
    var half = opening.widthMm / 2;
    return { fromMm: opening.centerMm - half, toMm: opening.centerMm + half };
  }

  function openingOverlaps(openings, wall, candidate) {
    var span = openingSpanMm(candidate);
    return openingsOfWall(openings, wall).some(function (other) {
      if (other === candidate || other.id === candidate.id) return false;
      var existing = openingSpanMm(other);
      return span.fromMm < existing.toMm && existing.fromMm < span.toMm;
    });
  }

  /* 墙被门窗切成几段实墙。返回的是沿墙中线的偏移区间，UI 照它画墙体。 */
  function wallSolidSpansMm(wall, openings) {
    var lengthMm = distanceMm(wall.start, wall.end);
    var holes = openingsOfWall(openings, wall).map(openingSpanMm).sort(function (a, b) {
      return a.fromMm - b.fromMm;
    });
    var spans = [];
    var cursor = 0;
    holes.forEach(function (hole) {
      var from = Math.max(0, hole.fromMm);
      var to = Math.min(lengthMm, hole.toMm);
      if (from > cursor) spans.push({ fromMm: cursor, toMm: from });
      cursor = Math.max(cursor, to);
    });
    if (cursor < lengthMm) spans.push({ fromMm: cursor, toMm: lengthMm });
    return spans;
  }

  function formatMeters(value) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(2) + " m" : "—";
  }

  function formatArea(value) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(2) + " m²" : "—";
  }

  function formatMillimeters(value) {
    return typeof value === "number" && isFinite(value) ? String(Math.round(value)) + " mm" : "—";
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
    { name: "两间房的套内面积逐间相加", run: function () {
      var one = [{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}];
      var two = [{xMm:4000,yMm:0},{xMm:7000,yMm:0},{xMm:7000,yMm:3000},{xMm:4000,yMm:3000}];
      return totalSuiteAreaSqM([{name:"主卧",points:one},{name:"厨房",points:two}]) === 21;
    } },
    { name: "两间房共享的那面墙只出现一次", run: function () {
      var one = [{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}];
      var two = [{xMm:4000,yMm:0},{xMm:7000,yMm:0},{xMm:7000,yMm:3000},{xMm:4000,yMm:3000}];
      return roomsWallSegments([{points:one},{points:two}], []).length === 7;
    } },
    { name: "房间重心落在房间内部", run: function () {
      var c = polygonCentroid([{xMm:0,yMm:0},{xMm:4000,yMm:0},{xMm:4000,yMm:3000},{xMm:0,yMm:3000}]);
      return c.xMm === 2000 && c.yMm === 1500;
    } },
    { name: "开一个 900 mm 门洞后墙被切成两段", run: function () {
      var wall = { start: {xMm:0,yMm:0}, end: {xMm:4000,yMm:0} };
      var opening = { wallKey: segmentKey(wall), kind: "door", widthMm: 900, centerMm: 2000 };
      var spans = wallSolidSpansMm(wall, [opening]);
      return spans.length === 2 && spans[0].toMm === 1550 && spans[1].fromMm === 2450 &&
        (spans[0].toMm - spans[0].fromMm) + (spans[1].toMm - spans[1].fromMm) + 900 === 4000;
    } },
    { name: "门洞放不进短墙时明确拒绝", run: function () {
      return clampOpeningCenterMm(800, 900, 400) === null && clampOpeningCenterMm(4000, 900, 100) === 450;
    } },
    { name: "点到墙的投影给出沿墙偏移", run: function () {
      var hit = projectOntoSegment({ start:{xMm:0,yMm:0}, end:{xMm:4000,yMm:0} }, {xMm:1500,yMm:120});
      return hit.offsetMm === 1500 && hit.distanceMm === 120 && hit.lengthMm === 4000;
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
    DEFAULT_WALL_MM: DEFAULT_WALL_MM,
    DEFAULT_DOOR_MM: DEFAULT_DOOR_MM,
    DEFAULT_WINDOW_MM: DEFAULT_WINDOW_MM,
    finite: finite,
    metersToMillimeters: metersToMillimeters,
    millimetersToMeters: millimetersToMeters,
    snapMeters: snapMeters,
    pointFromMeters: pointFromMeters,
    samePoint: samePoint,
    distanceMeters: distanceMeters,
    distanceMm: distanceMm,
    polygonAreaSqM: polygonAreaSqM,
    polygonCentroid: polygonCentroid,
    pointKey: pointKey,
    segmentKey: segmentKey,
    uniqueSegments: uniqueSegments,
    uniqueWallLengthMeters: uniqueWallLengthMeters,
    closedChainPoints: closedChainPoints,
    suiteAreaSqM: suiteAreaSqM,
    segmentsOfRing: segmentsOfRing,
    segmentsOfChain: segmentsOfChain,
    roomsWallSegments: roomsWallSegments,
    totalSuiteAreaSqM: totalSuiteAreaSqM,
    buildingAreaSqM: buildingAreaSqM,
    boundsOfSegments: boundsOfSegments,
    projectOntoSegment: projectOntoSegment,
    nearestWall: nearestWall,
    clampOpeningCenterMm: clampOpeningCenterMm,
    openingsOfWall: openingsOfWall,
    openingSpanMm: openingSpanMm,
    openingOverlaps: openingOverlaps,
    wallSolidSpansMm: wallSolidSpansMm,
    formatMeters: formatMeters,
    formatArea: formatArea,
    formatMillimeters: formatMillimeters,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.FloorplanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
