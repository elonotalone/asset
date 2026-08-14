/* 看板 · 一组共用时间轴的指标轨道。
 *
 * 时间从左向右流过整屏，每个指标是一条横向走势：实际值沿轨道前进，目标贴着同一条轨道作参照。
 * 轨道末端是当前读数；当前指标的末端再多一句结论，说它离目标差多少。
 * 时段和地区长在时间轴上，不另开筛选区；缩窄范围是重算尺度与读数，不是把行藏起来。
 */
(function () {
  "use strict";

  var E = window.DashboardEngine;
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* 轨道的画法坐标：所有轨道共用同一套横向刻度，所以时间是对齐的。 */
  var W = 1000;
  var H = 120;
  var X0 = 16;
  var X1 = 984;
  var PAD = 16;

  var state = {
    records: [], region: "", current: "", from: null, to: null,
    focus: "", drag: "", anchor: 0, open: false
  };
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
    return node;
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function drop(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
  function round1(value) { return Math.round(value * 10) / 10; }
  function pct(x) { return Math.round(x / W * 1000) / 10 + "%"; }

  function xAt(index, count) {
    if (count <= 1) return (X0 + X1) / 2;
    return X0 + (X1 - X0) * index / (count - 1);
  }
  function yAt(value, span) {
    var reach = span.high - span.low;
    var share = reach === 0 ? 0 : (value - span.low) / reach;
    return round1(H - PAD - share * (H - 2 * PAD));
  }

  function withUnit(parent, value, unit) {
    parent.appendChild(el("span", "v", value));
    if (unit) parent.appendChild(el("b", null, unit));
    return parent;
  }

  /* 一条轨道上的连续段：断口真的把路径断开，不落到基线上。 */
  function segmentsOf(track, count, pick, onlyWindow) {
    var out = [];
    var run = [];
    track.points.forEach(function (point) {
      var usable = track.span && point.kind === "value" && (!onlyWindow || point.inWindow);
      if (!usable) {
        if (run.length) out.push(run);
        run = [];
        return;
      }
      run.push([round1(xAt(point.index, count)), yAt(pick(point), track.span)]);
    });
    if (run.length) out.push(run);
    return out;
  }

  function pathOf(segment) {
    return segment.map(function (spot, index) {
      return (index === 0 ? "M" : "L") + spot[0] + " " + spot[1];
    }).join(" ");
  }

  function drawSegments(canvas, segments, cls) {
    segments.forEach(function (segment) {
      if (segment.length === 1) {
        canvas.appendChild(svg("line", {
          x1: segment[0][0], y1: segment[0][1] - 6, x2: segment[0][0], y2: segment[0][1] + 6,
          "class": cls + " lone"
        }));
        return;
      }
      canvas.appendChild(svg("path", { d: pathOf(segment), "class": cls }));
    });
  }

  function drawTrack(track, count, current) {
    var canvas = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      preserveAspectRatio: "none",
      "class": "draw",
      "aria-hidden": "true"
    });
    var zero = "";
    if (track.span && track.span.low <= 0 && track.span.high >= 0) {
      zero = yAt(0, track.span);
      canvas.appendChild(svg("line", { x1: X0, y1: zero, x2: X1, y2: zero, "class": "base" }));
    }
    drawSegments(canvas, segmentsOf(track, count, function (p) { return p.target; }, false), "goal faded");
    drawSegments(canvas, segmentsOf(track, count, function (p) { return p.actual; }, false), "real faded");
    var goal = segmentsOf(track, count, function (p) { return p.target; }, true);
    var real = segmentsOf(track, count, function (p) { return p.actual; }, true);
    drawSegments(canvas, goal, "goal");
    drawSegments(canvas, real, "real");
    track.breaks.forEach(function (point) {
      var x = round1(xAt(point.index, count));
      canvas.appendChild(svg("line", { x1: x, y1: PAD - 8, x2: x, y2: H - PAD + 8, "class": "cut" }));
    });
    if (track.reading) {
      var x = round1(xAt(track.reading.index, count));
      var y = yAt(track.reading.actual, track.span);
      canvas.appendChild(svg("line", { x1: x, y1: y - 12, x2: x, y2: y + 12, "class": "stamp" }));
      canvas.appendChild(svg("line", { x1: x - 12, y1: y, x2: x + 12, y2: y, "class": "stamp" }));
    }
    return { canvas: canvas, real: real, goal: goal, zero: zero };
  }

  function trackNode(track, board) {
    var count = board.periods.length;
    var current = track.name === board.current;
    var node = el("div", "track" + (current ? " current" : ""));
    node.setAttribute("data-name", track.name);
    node.setAttribute("data-focus", "track:" + track.name);
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-pressed", current ? "true" : "false");

    var lane = el("div", "lane");
    lane.appendChild(el("span", "name", track.name));
    var drawn = drawTrack(track, count, current);
    lane.appendChild(drawn.canvas);

    var breaks = [];
    var reasons = [];
    track.breaks.forEach(function (point) {
      var x = round1(xAt(point.index, count));
      breaks.push(x);
      reasons.push(point.why);
      if (!current) return;
      var why = el("span", "cut-why", point.why);
      why.style.left = pct(x);
      lane.appendChild(why);
    });
    node.appendChild(lane);

    var end = el("div", "end");
    if (track.reading) {
      end.appendChild(withUnit(el("p", "reading"), E.formatNumber(track.reading.actual), track.unit));
      end.appendChild(el("p", "at", track.reading.period));
      end.appendChild(withUnit(el("p", "target-read"), "目标 " + E.formatNumber(track.reading.target), track.unit));
    }
    if (current && board.headline) {
      var verdict = el("p", "verdict");
      verdict.id = "verdict";
      if (board.headline.why) verdict.textContent = board.headline.why;
      else if (board.headline.direction === "level") verdict.textContent = board.headline.word;
      else withUnit(verdict, board.headline.word + " " + E.formatNumber(board.headline.distance), board.headline.unit);
      end.appendChild(verdict);
      if (!board.headline.why) {
        var why = el("p", "verdict-why", board.headline.label + " · 达成率 " + board.headline.rate);
        why.id = "verdict-why";
        end.appendChild(why);
      }
    }
    node.appendChild(end);

    node.setAttribute("data-actual", JSON.stringify(drawn.real));
    node.setAttribute("data-target", JSON.stringify(drawn.goal));
    node.setAttribute("data-breaks", JSON.stringify(breaks));
    node.setAttribute("data-reasons", JSON.stringify(reasons));
    node.setAttribute("data-zero", drawn.zero === "" ? "" : String(drawn.zero));

    node.addEventListener("click", function () { pick(track.name); });
    node.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      pick(track.name);
    });
    return node;
  }

  function pick(name) {
    state.current = name;
    state.focus = "track:" + name;
    render();
  }

  function moveEdge(which, index) {
    var board = current();
    var last = Math.max(0, board.periods.length - 1);
    var at = Math.min(last, Math.max(0, index));
    if (which === "span") {
      var anchor = Math.min(last, Math.max(0, state.anchor));
      state.from = Math.min(anchor, at);
      state.to = Math.max(anchor, at);
      state.focus = "tick:" + board.periods[at];
    } else if (which === "from") {
      state.from = Math.min(at, board.to);
      state.focus = "grip:from";
    } else {
      state.to = Math.max(at, board.from);
      state.focus = "grip:to";
    }
    render();
  }

  function gripNode(which, board, label) {
    var grip = el("button", "grip " + which);
    grip.type = "button";
    grip.setAttribute("data-focus", "grip:" + which);
    grip.setAttribute("role", "slider");
    grip.setAttribute("aria-label", which === "from" ? "时间范围的起点" : "时间范围的终点");
    grip.setAttribute("aria-valuemin", "0");
    grip.setAttribute("aria-valuemax", String(Math.max(0, board.periods.length - 1)));
    grip.setAttribute("aria-valuenow", String(which === "from" ? board.from : board.to));
    grip.setAttribute("aria-valuetext", label);
    grip.addEventListener("mousedown", function (event) {
      event.preventDefault();
      state.drag = which;
      grip.focus();
    });
    grip.addEventListener("keydown", function (event) {
      var at = which === "from" ? board.from : board.to;
      var step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (event.key === "Home") { event.preventDefault(); moveEdge(which, 0); return; }
      if (event.key === "End") { event.preventDefault(); moveEdge(which, board.periods.length - 1); return; }
      if (!step) return;
      event.preventDefault();
      moveEdge(which, at + step);
    });
    return grip;
  }

  function regionNode(board) {
    var box = el("div", "scope");
    box.id = "scope";
    var name = el("button", "region", board.region);
    name.type = "button";
    name.id = "region";
    name.setAttribute("data-focus", "region");
    name.setAttribute("aria-expanded", state.open ? "true" : "false");
    if (board.regions.length > 1) {
      name.addEventListener("click", function () {
        state.open = !state.open;
        state.focus = "region";
        render();
      });
    } else {
      name.disabled = true;
    }
    box.appendChild(name);
    if (board.window) {
      box.appendChild(el("span", "range", board.window.from + " 到 " + board.window.to));
    }
    if (state.open) {
      var others = el("div", "others");
      board.regions.forEach(function (region) {
        if (region === board.region) return;
        var pickIt = el("button", "region other", region);
        pickIt.type = "button";
        pickIt.addEventListener("click", function () {
          state.region = region;
          state.open = false;
          state.from = null;
          state.to = null;
          state.focus = "region";
          render();
        });
        others.appendChild(pickIt);
      });
      box.appendChild(others);
    }
    return box;
  }

  function renderAxis(board) {
    clear(els.axis);
    if (!board.periods.length) return;
    var count = board.periods.length;
    var lane = el("div", "axis-lane");
    var rail = el("div", "rail");
    lane.appendChild(rail);
    var step = Math.ceil(count / 12);
    var beam = el("div", "beam");
    var left = xAt(board.from, count);
    var right = xAt(board.to, count);
    beam.style.left = pct(left);
    beam.style.width = pct(Math.max(right - left, 4));
    beam.appendChild(gripNode("from", board, board.periods[board.from]));
    beam.appendChild(gripNode("to", board, board.periods[board.to]));
    rail.appendChild(beam);

    board.periods.forEach(function (period, index) {
      var tick = el("button", "tick" + (index >= board.from && index <= board.to ? " lit" : ""));
      tick.type = "button";
      tick.style.left = pct(xAt(index, count));
      tick.setAttribute("aria-pressed", index >= board.from && index <= board.to ? "true" : "false");
      tick.setAttribute("data-focus", "tick:" + period);
      var show = index === 0 || index === count - 1 || index % step === 0;
      if (show) tick.textContent = period;
      else tick.setAttribute("aria-label", period);
      /* 在时间轴上按下就是这一段的起点，拖到哪天哪天就是终点。 */
      tick.addEventListener("mousedown", function (event) {
        event.preventDefault();
        state.drag = "span";
        state.anchor = index;
        moveEdge("span", index);
      });
      tick.addEventListener("mouseover", function () {
        if (state.drag) moveEdge(state.drag, index);
      });
      tick.addEventListener("click", function (event) { event.preventDefault(); });
      rail.appendChild(tick);
    });
    var scope = regionNode(board);
    if (left / W > 0.55) scope.style.right = pct(W - right);
    else scope.style.left = pct(left);
    rail.appendChild(scope);
    els.axis.appendChild(lane);
  }

  function renderWaiting() {
    clear(els.tracks);
    var wait = el("div", "waiting");
    var canvas = svg("svg", {
      viewBox: "0 0 " + W + " 40", preserveAspectRatio: "none", "class": "draw", "aria-hidden": "true"
    });
    canvas.appendChild(svg("line", { x1: X0, y1: 20, x2: X1, y2: 20, "class": "base" }));
    wait.appendChild(canvas);
    els.tracks.appendChild(wait);
  }

  function current() {
    return E.board(state.records, {
      region: state.region,
      current: state.current,
      from: state.from,
      to: state.to
    });
  }

  function render() {
    if (!state.records.length) {
      renderWaiting();
      clear(els.axis);
      return;
    }
    var board = current();
    state.region = board.region;
    state.current = board.current;
    state.from = board.from;
    state.to = board.to;
    clear(els.tracks);
    board.tracks.forEach(function (track) { els.tracks.appendChild(trackNode(track, board)); });
    renderAxis(board);
    if (els.action) {
      els.action.textContent = "拖动时间范围";
      els.action.hidden = false;
    }
    if (state.focus) {
      var keep = document.querySelector('[data-focus="' + state.focus + '"]');
      if (keep && keep.focus) keep.focus();
    }
  }

  function load() {
    var parsed = E.parseDataset(els.paste.value);
    if (parsed.errors.length) {
      els.why.textContent = parsed.errors.join("；");
      els.why.hidden = false;
      return;
    }
    state.records = parsed.records;
    state.region = "";
    state.current = "";
    state.from = null;
    state.to = null;
    state.focus = "";
    drop(els.intake);
    els.intake = null;
    els.paste = null;
    els.why = null;
    render();
  }

  function mount() {
    els.tracks = document.getElementById("tracks");
    els.axis = document.getElementById("axis");
    els.intake = document.getElementById("intake");
    els.paste = document.getElementById("paste");
    els.why = document.getElementById("intake-why");
    els.action = document.getElementById("action");
    document.getElementById("load").addEventListener("click", load);
    els.paste.addEventListener("input", function () {
      if (!els.why) return;
      els.why.hidden = true;
      els.why.textContent = "";
    });
    document.addEventListener("mouseup", function () { state.drag = ""; });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
