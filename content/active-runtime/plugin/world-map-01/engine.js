/*
 * 世界地图 · 纯计算内核
 * 不依赖 DOM、网络或 Google Maps SDK；浏览器和 node 加载同一份文件。
 */
(function (root) {
  "use strict";

  var EARTH_RADIUS_KM = 6371.0088;

  function finiteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function validPoint(point) {
    return Boolean(
      point && finiteNumber(point.lat) && finiteNumber(point.lng) &&
      point.lat >= -90 && point.lat <= 90
    );
  }

  function normalizeLongitude(lng) {
    if (!finiteNumber(lng)) return null;
    var normalized = ((lng + 180) % 360 + 360) % 360 - 180;
    return Object.is(normalized, -0) ? 0 : normalized;
  }

  function shortLongitudeDelta(fromLng, toLng) {
    var from = normalizeLongitude(fromLng);
    var to = normalizeLongitude(toLng);
    if (from === null || to === null) return null;
    var delta = normalizeLongitude(to - from);
    return delta === -180 ? 180 : delta;
  }

  function toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function distanceKm(a, b) {
    if (!validPoint(a) || !validPoint(b)) return null;
    var deltaLng = shortLongitudeDelta(a.lng, b.lng);
    if (deltaLng === null) return null;
    var lat1 = toRadians(a.lat);
    var lat2 = toRadians(b.lat);
    var deltaLat = lat2 - lat1;
    var deltaLon = toRadians(deltaLng);
    var sinLat = Math.sin(deltaLat / 2);
    var sinLon = Math.sin(deltaLon / 2);
    var h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    h = Math.min(1, Math.max(0, h));
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function midpoint(a, b) {
    if (!validPoint(a) || !validPoint(b)) return null;
    var delta = shortLongitudeDelta(a.lng, b.lng);
    return {
      lat: (a.lat + b.lat) / 2,
      lng: normalizeLongitude(a.lng + delta / 2)
    };
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  /* 近似 Web Mercator 视野，只用于给两点留出稳定边距，不参与距离计算。 */
  function suggestedZoom(a, b, viewportWidth, viewportHeight, padding) {
    if (!validPoint(a) || !validPoint(b)) return null;
    var width = finiteNumber(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024;
    var height = finiteNumber(viewportHeight) && viewportHeight > 0 ? viewportHeight : 640;
    var inset = finiteNumber(padding) && padding >= 0 ? padding : 72;
    var usableWidth = Math.max(128, width - inset * 2);
    var usableHeight = Math.max(128, height - inset * 2);
    var lngSpan = Math.max(0.01, Math.abs(shortLongitudeDelta(a.lng, b.lng)));
    var latSpan = Math.max(0.01, Math.abs(a.lat - b.lat));
    var zoomX = Math.log(usableWidth * 360 / (256 * lngSpan)) / Math.LN2;
    var zoomY = Math.log(usableHeight * 170 / (256 * latSpan)) / Math.LN2;
    return clamp(Math.floor(Math.min(zoomX, zoomY)), 1, 12);
  }

  function formatDistance(km) {
    if (!finiteNumber(km) || km < 0) return "—";
    return Math.round(km).toLocaleString("zh-CN") + " km";
  }

  var api = {
    EARTH_RADIUS_KM: EARTH_RADIUS_KM,
    validPoint: validPoint,
    normalizeLongitude: normalizeLongitude,
    shortLongitudeDelta: shortLongitudeDelta,
    distanceKm: distanceKm,
    midpoint: midpoint,
    suggestedZoom: suggestedZoom,
    formatDistance: formatDistance
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WorldMapEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
