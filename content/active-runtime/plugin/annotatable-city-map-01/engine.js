/*
 * 地图 · 计算内核
 *
 * 坐标顺序统一 [经度, 纬度]，参考系 OGC:CRS84；平均地球半径 R = 6 371 008.8 m。
 * 距离是 haversine 大圆距离，面积是球面经纬度求和 —— 都是直线量算，
 * 任何时候都不代表道路里程或导航路径。
 *
 * 这一版**不再随包发全球轮廓**：上一版把 world-atlas 2.0.2（Natural Earth 4.1.0
 * 再分发）的国界塞进这个文件，放大到街区尺度什么都看不见，正是设计文档 §6 点名的
 * 做坏样子。街道底图需要在线瓦片凭据，凭据到位之前宁可留空，也不画一张假街区。
 */
(function (root) {
  "use strict";

  var EARTH_RADIUS_M = 6371008.8;
  var EXACT_ORDER_LIMIT = 12;

  function radians(degrees) { return degrees * Math.PI / 180; }
  function degrees(radian) { return radian * 180 / Math.PI; }

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

  /* 自交的环围不出一块地：8 字形的两片会互相抵消，报出来的面积只会骗人。
   * 所以先问「这一圈是不是一条不打结的线」，答案是否就不给面积。 */
  function orientation(a, b, c) {
    var value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : -1;
  }

  function onSegment(a, b, point) {
    return Math.min(a[0], b[0]) - 1e-9 <= point[0] && point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
      Math.min(a[1], b[1]) - 1e-9 <= point[1] && point[1] <= Math.max(a[1], b[1]) + 1e-9;
  }

  function segmentsCross(p1, p2, q1, q2) {
    var o1 = orientation(p1, p2, q1);
    var o2 = orientation(p1, p2, q2);
    var o3 = orientation(q1, q2, p1);
    var o4 = orientation(q1, q2, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, p2, q2)) return true;
    if (o3 === 0 && onSegment(q1, q2, p1)) return true;
    if (o4 === 0 && onSegment(q1, q2, p2)) return true;
    return false;
  }

  function ringIsSimple(points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    var center = centerOf(points);
    if (!center) return false;
    var flat = [];
    for (var i = 0; i < points.length; i++) {
      var local = projectLocal(points[i], center);
      if (!local) return false;
      flat.push([local.eastM, local.northM]);
    }
    var size = flat.length;
    for (var a = 0; a < size; a++) {
      for (var b = a + 1; b < size; b++) {
        // 相邻两段共用一个端点，本来就该碰上，不算打结。
        if (b === a + 1 || (a === 0 && b === size - 1)) continue;
        if (segmentsCross(flat[a], flat[(a + 1) % size], flat[b], flat[(b + 1) % size])) return false;
      }
    }
    return true;
  }

  /* ---------- 地址怎么进来 ----------
   * 用户手里没有经纬度，他有的是朋友发来的地图链接。所以入口是「粘贴 → 命名」，
   * 不是「填经度、填纬度」。以下全是纯字符串解析，不发任何请求。
   */
  function inRange(lon, lat) {
    return isFinite(lon) && isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
  }

  var NUMBER = "(-?\\d{1,3}(?:\\.\\d+)?)";
  var LINK_PATTERNS = [
    // 谷歌地图：链接里的 @纬度,经度,缩放 与 !3d纬度!4d经度
    { rx: new RegExp("@" + NUMBER + "," + NUMBER), order: "latlon", from: "谷歌地图" },
    { rx: new RegExp("!3d" + NUMBER + "!4d" + NUMBER), order: "latlon", from: "谷歌地图" },
    { rx: new RegExp("[?&](?:q|query|ll|daddr|center)=(?:loc:)?" + NUMBER + "," + NUMBER), order: "latlon", from: "地图链接" },
    // 高德：position 与 location 都是 经度,纬度
    { rx: new RegExp("[?&](?:position|location)=" + NUMBER + "," + NUMBER), order: "lonlat", from: "高德地图" },
    // 人直接粘一对数：按通行写法读作 纬度,经度
    { rx: new RegExp("^\\s*" + NUMBER + "\\s*[,，]\\s*" + NUMBER + "\\s*$"), order: "latlon", from: "你粘的这对坐标" },
    { rx: new RegExp("^\\s*" + NUMBER + "\\s+" + NUMBER + "\\s*$"), order: "latlon", from: "你粘的这对坐标" }
  ];

  function parseLocationInput(text) {
    var raw = String(text === undefined || text === null ? "" : text).trim();
    if (!raw) return null;
    for (var i = 0; i < LINK_PATTERNS.length; i++) {
      var match = raw.match(LINK_PATTERNS[i].rx);
      if (!match) continue;
      var first = Number(match[1]);
      var second = Number(match[2]);
      var lat = LINK_PATTERNS[i].order === "latlon" ? first : second;
      var lon = LINK_PATTERNS[i].order === "latlon" ? second : first;
      if (!inRange(lon, lat)) continue;
      return { coordinate: [lon, lat], from: LINK_PATTERNS[i].from };
    }
    return null;
  }

  /* ---------- 摆开：以这几个地点自己的中心做等比例局部投影 ----------
   * 街区尺度上，纬度方向 1 m 就是 1 m，经度方向按 cos(中心纬度) 收缩。
   * 所以图上量出来的距离和 haversine 算出来的距离一致（自测里核到 0.1% 以内）。
   */
  function centerOf(points) {
    if (!Array.isArray(points) || !points.length) return null;
    var lon = 0;
    var lat = 0;
    for (var i = 0; i < points.length; i++) {
      var c = coordinate(points[i]);
      if (!c) return null;
      lon += c[0];
      lat += c[1];
    }
    return [lon / points.length, lat / points.length];
  }

  function projectLocal(value, center) {
    var c = coordinate(value);
    var origin = coordinate(center);
    if (!c || !origin) return null;
    var dLon = c[0] - origin[0];
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    return {
      eastM: radians(dLon) * Math.cos(radians(origin[1])) * EARTH_RADIUS_M,
      northM: radians(c[1] - origin[1]) * EARTH_RADIUS_M
    };
  }

  function unprojectLocal(local, center) {
    var origin = coordinate(center);
    if (!origin || !local) return null;
    var eastM = Number(local.eastM);
    var northM = Number(local.northM);
    if (!isFinite(eastM) || !isFinite(northM)) return null;
    var lat = origin[1] + degrees(northM / EARTH_RADIUS_M);
    var lon = origin[0] + degrees(eastM / (EARTH_RADIUS_M * Math.cos(radians(origin[1]))));
    return coordinate([lon, lat]);
  }

  /* ---------- 顺序：他真正要决定的事 ----------
   * 「先去哪一处才不会来回折返」是这件工具唯一值得算的结论。
   * 12 个地点以内用位段动态规划求精确最短开放路径；更多时用最近邻起手 + 2-opt，
   * 两条路径都不含随机数，同一组地点重算结果逐项一致。
   */
  function distanceMatrix(points) {
    var size = points.length;
    var matrix = [];
    for (var i = 0; i < size; i++) {
      matrix.push([]);
      for (var j = 0; j < size; j++) {
        matrix[i].push(i === j ? 0 : haversine(points[i], points[j]));
      }
    }
    return matrix;
  }

  function orderLength(matrix, order) {
    var total = 0;
    for (var i = 1; i < order.length; i++) total += matrix[order[i - 1]][order[i]];
    return total;
  }

  function exactOrder(matrix, size) {
    var full = (1 << size) - 1;
    var best = { length: Infinity, order: null };
    var cost = [];
    var parent = [];
    var mask, node;
    for (mask = 0; mask <= full; mask++) {
      cost.push([]);
      parent.push([]);
      for (node = 0; node < size; node++) {
        cost[mask].push(Infinity);
        parent[mask].push(-1);
      }
    }
    for (node = 0; node < size; node++) cost[1 << node][node] = 0;
    for (mask = 1; mask <= full; mask++) {
      for (node = 0; node < size; node++) {
        if (!(mask & (1 << node)) || cost[mask][node] === Infinity) continue;
        for (var next = 0; next < size; next++) {
          if (mask & (1 << next)) continue;
          var nextMask = mask | (1 << next);
          var candidate = cost[mask][node] + matrix[node][next];
          if (candidate < cost[nextMask][next] - 1e-9) {
            cost[nextMask][next] = candidate;
            parent[nextMask][next] = node;
          }
        }
      }
    }
    for (node = 0; node < size; node++) {
      if (cost[full][node] < best.length - 1e-9) best = { length: cost[full][node], order: node };
    }
    var order = [];
    var mask2 = full;
    var at = best.order;
    while (at >= 0) {
      order.unshift(at);
      var previous = parent[mask2][at];
      mask2 ^= (1 << at);
      at = previous;
    }
    return { order: order, totalM: best.length };
  }

  function heuristicOrder(matrix, size) {
    var visited = [];
    var order = [0];
    var i;
    for (i = 0; i < size; i++) visited.push(false);
    visited[0] = true;
    while (order.length < size) {
      var last = order[order.length - 1];
      var pick = -1;
      for (i = 0; i < size; i++) {
        if (visited[i]) continue;
        if (pick < 0 || matrix[last][i] < matrix[last][pick] - 1e-9) pick = i;
      }
      visited[pick] = true;
      order.push(pick);
    }
    var improved = true;
    while (improved) {
      improved = false;
      for (i = 1; i < size - 1; i++) {
        for (var j = i + 1; j < size; j++) {
          var candidate = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          if (orderLength(matrix, candidate) < orderLength(matrix, order) - 1e-9) {
            order = candidate;
            improved = true;
          }
        }
      }
    }
    return { order: order, totalM: orderLength(matrix, order) };
  }

  function bestOrder(points) {
    if (!Array.isArray(points)) return null;
    var checked = [];
    for (var i = 0; i < points.length; i++) {
      var c = coordinate(points[i]);
      if (!c) return null;
      checked.push(c);
    }
    var size = checked.length;
    if (size < 2) return { order: size ? [0] : [], totalM: 0, exact: true };
    var matrix = distanceMatrix(checked);
    var result = size <= EXACT_ORDER_LIMIT ? exactOrder(matrix, size) : heuristicOrder(matrix, size);
    // 正反两个方向长度相同；固定成「第一个地点下标较小的那一头在前」，重算才不会翻面。
    var reversed = result.order.slice().reverse();
    if (reversed[0] < result.order[0]) result.order = reversed;
    result.exact = size <= EXACT_ORDER_LIMIT;
    return result;
  }

  function orderSaving(points) {
    var current = routeLength(points);
    var best = bestOrder(points);
    if (current === null || !best) return null;
    var savingM = current - best.totalM;
    return {
      currentM: current,
      bestM: best.totalM,
      order: best.order,
      savingM: savingM > 0.5 ? savingM : 0,
      exact: best.exact
    };
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

  var CASES = [
    ["平均地球半径固定 6 371 008.8 m", function () { return EARTH_RADIUS_M === 6371008.8; }],
    ["赤道经差 1° 的 haversine 距离", function () {
      return Math.abs(haversine([0, 0], [1, 0]) - 111195.0802335329) < 1e-6;
    }],
    ["坏坐标一律拒绝", function () {
      return coordinate([181, 0]) === null && coordinate([0, 91]) === null &&
        coordinate([Number.NaN, 0]) === null && routeSegments([[0, 0], [181, 0]]) === null;
    }],
    ["分段与累计一致，首段为 0", function () {
      var route = routeSegments([[0, 0], [1, 0], [2, 0]]);
      return route.rows[0].segmentM === 0 && Math.abs(route.rows[2].cumulativeM - route.totalM) < 1e-9;
    }],
    ["谷歌链接读成 [经度, 纬度]", function () {
      var got = parseLocationInput("https://www.google.com/maps/@38.7069,-9.1466,17z");
      return got && Math.abs(got.coordinate[0] + 9.1466) < 1e-9 && Math.abs(got.coordinate[1] - 38.7069) < 1e-9;
    }],
    ["高德链接的 position 是经度在前", function () {
      var got = parseLocationInput("https://uri.amap.com/marker?position=116.481,39.990");
      return got && Math.abs(got.coordinate[0] - 116.481) < 1e-9 && Math.abs(got.coordinate[1] - 39.99) < 1e-9;
    }],
    ["直接粘一对数按 纬度,经度 读", function () {
      var got = parseLocationInput("38.7069, -9.1466");
      return got && Math.abs(got.coordinate[1] - 38.7069) < 1e-9;
    }],
    ["局部投影与 haversine 在街区尺度一致", function () {
      var a = [-9.1466, 38.7069];
      var b = [-9.1226, 38.7139];
      var center = centerOf([a, b]);
      var pa = projectLocal(a, center);
      var pb = projectLocal(b, center);
      var flat = Math.sqrt(Math.pow(pb.eastM - pa.eastM, 2) + Math.pow(pb.northM - pa.northM, 2));
      var great = haversine(a, b);
      return Math.abs(flat - great) / great < 0.001;
    }],
    ["投影往返回到原坐标", function () {
      var center = [-9.14, 38.71];
      var back = unprojectLocal(projectLocal([-9.1466, 38.7069], center), center);
      return Math.abs(back[0] + 9.1466) < 1e-9 && Math.abs(back[1] - 38.7069) < 1e-9;
    }],
    ["折返的顺序能被算短", function () {
      var points = [[0, 0], [0.02, 0], [0.01, 0], [0.03, 0]];
      var saving = orderSaving(points);
      return saving.savingM > 0 && saving.order.join(",") === "0,2,1,3";
    }],
    ["已经是最短顺序时不劝改", function () {
      var points = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]];
      return orderSaving(points).savingM === 0;
    }],
    ["同一组地点重算顺序逐项一致", function () {
      var points = [[0, 0], [0.02, 0.01], [0.01, 0], [0.03, 0.02], [0.005, 0.015]];
      return bestOrder(points).order.join(",") === bestOrder(points).order.join(",");
    }],
    ["面积小于 1 000 m² 用 m²，边界起用 km²", function () {
      return formatArea(999) === "999 m²" && formatArea(1000) === "0.001 km²";
    }],
    ["距离小于 1 000 m 取整米", function () {
      return formatDistance(999.4) === "999 m" && formatDistance(1234) === "1.23 km";
    }],
    ["少于 3 点不出面积", function () {
      return polygonArea([[0, 0], [1, 0]]) === null && polygonArea([[0, 0], [1, 0], [1, 1]]) > 0;
    }],
    ["自交的环认得出来，不当成围合", function () {
      var square = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]];
      var bowtie = [[0, 0], [0.01, 0.01], [0.01, 0], [0, 0.01]];
      return ringIsSimple(square) === true && ringIsSimple(bowtie) === false;
    }]
  ];

  function runSelfTest() {
    var failures = [];
    CASES.forEach(function (item) {
      try { if (!item[1]()) failures.push({ name: item[0], why: "断言返回 false" }); }
      catch (error) { failures.push({ name: item[0], why: String(error && error.message || error) }); }
    });
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    EARTH_RADIUS_M: EARTH_RADIUS_M,
    EXACT_ORDER_LIMIT: EXACT_ORDER_LIMIT,
    coordinate: coordinate,
    haversine: haversine,
    routeSegments: routeSegments,
    routeLength: routeLength,
    polygonArea: polygonArea,
    ringIsSimple: ringIsSimple,
    parseLocationInput: parseLocationInput,
    centerOf: centerOf,
    projectLocal: projectLocal,
    unprojectLocal: unprojectLocal,
    bestOrder: bestOrder,
    orderSaving: orderSaving,
    groupInteger: groupInteger,
    formatArea: formatArea,
    formatDistance: formatDistance,
    CASES: CASES,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.CityMapEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
