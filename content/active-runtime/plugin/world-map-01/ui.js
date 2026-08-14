/* 世界地图 · Google SDK、地理编码和 DOM 界面层。 */
(function () {
  "use strict";

  var GOOGLE_MAPS_KEY = "AIzaSyCajy9E2uExVxnKABBXutnEmit0pWGRN9E";
  var LOAD_TIMEOUT_MS = 12000;
  var E = window.WorldMapEngine;
  var map = null;
  var geocoder = null;
  var markers = [];
  var labels = [];
  var route = null;
  var loadTimer = null;
  var loadingScript = null;
  var places = {
    from: { name: "北京市，中国", lat: 39.9042, lng: 116.4074 },
    to: { name: "Helsinki, Finland", lat: 60.1699, lng: 24.9384 }
  };

  var els = {};

  function setText(node, text) {
    node.textContent = text || "";
  }

  function showFailure() {
    clearTimeout(loadTimer);
    els.loadFailure.hidden = false;
    els.map.classList.add("is-unavailable");
    setText(els.summary, "地图现在不可用");
    setInputsDisabled(true);
  }

  function setInputsDisabled(disabled) {
    els.from.disabled = disabled;
    els.to.disabled = disabled;
    els.submit.disabled = disabled;
  }

  function removeSdkScript() {
    if (loadingScript && loadingScript.parentNode) loadingScript.parentNode.removeChild(loadingScript);
    loadingScript = null;
  }

  function loadGoogleMaps() {
    clearTimeout(loadTimer);
    removeSdkScript();
    els.loadFailure.hidden = true;
    els.map.classList.remove("is-unavailable");
    setText(els.summary, "正在打开地图…");

    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    window.__worldMapReady = initializeMap;
    window.gm_authFailure = showFailure;
    loadingScript = document.createElement("script");
    loadingScript.async = true;
    loadingScript.defer = true;
    loadingScript.src = "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(GOOGLE_MAPS_KEY) + "&callback=__worldMapReady&v=weekly&language=zh-CN";
    loadingScript.onerror = showFailure;
    document.head.appendChild(loadingScript);
    loadTimer = window.setTimeout(showFailure, LOAD_TIMEOUT_MS);
  }

  function initializeMap() {
    clearTimeout(loadTimer);
    if (!window.google || !window.google.maps) {
      showFailure();
      return;
    }
    els.loadFailure.hidden = true;
    els.map.classList.remove("is-unavailable");
    setInputsDisabled(false);
    map = new google.maps.Map(els.map, {
      center: { lat: 50, lng: 70 },
      zoom: 3,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy"
    });
    geocoder = new google.maps.Geocoder();
    renderJourney();
  }

  function clearMapObjects() {
    markers.forEach(function (marker) { marker.setMap(null); });
    labels.forEach(function (label) { label.close(); });
    markers = [];
    labels = [];
    if (route) route.setMap(null);
    route = null;
  }

  function addPlace(place) {
    var marker = new google.maps.Marker({
      map: map,
      position: { lat: place.lat, lng: place.lng },
      title: place.name
    });
    var label = new google.maps.InfoWindow({
      content: document.createTextNode(place.name),
      disableAutoPan: true,
      headerDisabled: true
    });
    label.open({ map: map, anchor: marker, shouldFocus: false });
    markers.push(marker);
    labels.push(label);
  }

  function renderJourney() {
    if (!map) return;
    clearMapObjects();
    addPlace(places.from);
    addPlace(places.to);
    route = new google.maps.Polyline({
      map: map,
      path: [places.from, places.to],
      geodesic: true,
      strokeColor: "#1769aa",
      strokeOpacity: 0.9,
      strokeWeight: 4
    });
    var center = E.midpoint(places.from, places.to);
    var zoom = E.suggestedZoom(
      places.from,
      places.to,
      els.map.clientWidth,
      els.map.clientHeight,
      72
    );
    map.setCenter(center);
    map.setZoom(zoom);
    setText(
      els.summary,
      places.from.name + " ↔ " + places.to.name + " · " +
      E.formatDistance(E.distanceKm(places.from, places.to))
    );
  }

  function geocodeCity(raw, messageNode) {
    var query = String(raw || "").trim();
    setText(messageNode, "");
    if (Array.from(query).length < 2) {
      setText(messageNode, "请写至少两个字的城市名");
      return Promise.reject(new Error("short-query"));
    }
    return new Promise(function (resolve, reject) {
      geocoder.geocode({ address: query }, function (results, status) {
        var result = results && results.find(function (item) {
          return item.geometry && item.geometry.location;
        });
        if (status !== "OK" || !result) {
          setText(messageNode, "没找到这个地方，请换成城市全名再试");
          reject(new Error("place-not-found"));
          return;
        }
        resolve({
          name: result.formatted_address,
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng()
        });
      });
    });
  }

  function submitJourney(event) {
    event.preventDefault();
    if (!geocoder) return;
    setInputsDisabled(true);
    Promise.all([
      geocodeCity(els.from.value, els.fromMessage),
      geocodeCity(els.to.value, els.toMessage)
    ]).then(function (found) {
      places.from = found[0];
      places.to = found[1];
      els.from.value = places.from.name;
      els.to.value = places.to.name;
      renderJourney();
    }).catch(function () {
      /* 对应输入旁已经给出可执行的人话；保留上一次有效地图。 */
    }).finally(function () {
      setInputsDisabled(false);
    });
  }

  function mount() {
    els.map = document.getElementById("map");
    els.form = document.getElementById("journey-form");
    els.from = document.getElementById("from-place");
    els.to = document.getElementById("to-place");
    els.fromMessage = document.getElementById("from-message");
    els.toMessage = document.getElementById("to-message");
    els.summary = document.getElementById("summary");
    els.loadFailure = document.getElementById("load-failure");
    els.retry = document.getElementById("retry-map");
    els.submit = els.form.querySelector("button[type=submit]");
    els.form.addEventListener("submit", submitJourney);
    els.retry.addEventListener("click", loadGoogleMaps);
    setInputsDisabled(true);
    loadGoogleMaps();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
