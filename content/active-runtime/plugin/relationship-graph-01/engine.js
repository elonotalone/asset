/*
 * 关系图 · 计算内核
 *
 * 这件工具只回答一个问题：材料里已经写明的关系摊开之后，两个人之间到底通过谁连上。
 * 所以内核只算三件事 —— 关系怎么进来、这张网长成什么形状、两点之间的路径是哪一条。
 *
 * 这一版**删掉了分层坐标**。上一版把概念图谱那套「按层从左到右排队」的坐标搬了过来，
 * 那正是设计文档 §6 点名的做坏样子：把「谁和谁有关」画成了「先学什么再学什么」。
 * 换上的是确定性簇团布局：相连的对象互相吸引，无关的互相让开，不含随机数，
 * 同一组关系重开时坐标逐项一致。
 *
 * 同时**日期从必填退成可选**（设计文档 §0：类型与日期只在材料需要时才就地补充）。
 * 写了就必须是真实的 YYYY-MM-DD，没写就当材料里没写，不逼记者编一个。
 */
(function (root) {
  "use strict";

  var PERSON = "person";
  var ORGANIZATION = "organization";
  var EVENT = "event";
  var TYPES = [PERSON, ORGANIZATION, EVENT];
  var MAX_NODES = 120;

  /* 对称关系不该被强加箭头（设计文档 §3.5）：「夫妻」「通话」两头一样，
   * 「设立」「持有」「汇报给」有明确的一头。判据是关系原话里的对称词，写死在这里。 */
  var SYMMETRIC_WORDS = [
    "夫妻", "配偶", "妻子", "丈夫", "兄弟", "姐妹", "兄妹", "姐弟", "同胞",
    "同学", "同事", "同乡", "同门", "朋友", "友人", "熟识", "认识", "相识",
    "合作", "伙伴", "搭档", "并列", "互", "双方", "往来", "通话", "会见",
    "会面", "见面", "碰面", "共同", "一起", "结识", "联姻", "亲戚", "邻居"
  ];

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function nodeMap(nodes) {
    var map = Object.create(null);
    (nodes || []).forEach(function (node) { map[node.id] = node; });
    return map;
  }

  function validDate(value) {
    var match = String(value === undefined || value === null ? "" : value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function dateOrEmpty(value) {
    var text = String(value === undefined || value === null ? "" : value).trim();
    if (!text) return "";
    return validDate(text) ? text : null;
  }

  function isSymmetric(label) {
    var text = String(label || "");
    for (var i = 0; i < SYMMETRIC_WORDS.length; i++) {
      if (text.indexOf(SYMMETRIC_WORDS[i]) >= 0) return true;
    }
    return false;
  }

  function validateGraph(nodes, edges) {
    var errors = [];
    var ids = Object.create(null);
    var labels = Object.create(null);
    if ((nodes || []).length > MAX_NODES) errors.push("对象超过 " + MAX_NODES + " 个上限");
    (nodes || []).forEach(function (node, index) {
      var id = String((node && node.id) || "").trim();
      var label = String((node && node.label) || "").trim();
      if (!id) errors.push("第 " + (index + 1) + " 个对象缺少 id");
      else if (ids[id]) errors.push("对象 id 重复：" + id);
      else ids[id] = true;
      if (!label) errors.push("第 " + (index + 1) + " 个对象缺少名字");
      else if (labels[label]) errors.push("对象名字重复：" + label);
      else labels[label] = true;
      // 类型是可选的：材料没写就不写，写了就必须是这三种之一。
      if (node && node.type !== null && node.type !== undefined && node.type !== "" &&
        TYPES.indexOf(node.type) < 0) {
        errors.push("对象类型无效：" + (id || index + 1));
      }
    });
    var edgeKeys = Object.create(null);
    (edges || []).forEach(function (edge, index) {
      if (!edge || !ids[edge.from] || !ids[edge.to]) errors.push("第 " + (index + 1) + " 条关系缺少有效两端");
      if (edge && edge.from === edge.to) errors.push("关系不能连到对象自己：" + edge.from);
      if (!String((edge && edge.label) || "").trim()) errors.push("第 " + (index + 1) + " 条关系缺少关系原话");
      if (edge && dateOrEmpty(edge.date) === null) errors.push("第 " + (index + 1) + " 条关系的日期不是真实日期");
      if (edge) {
        var key = [edge.from, edge.label, edge.to, edge.date || ""].join("\u0000");
        if (edgeKeys[key]) errors.push("关系重复：" + edge.from + " → " + edge.to);
        edgeKeys[key] = true;
      }
    });
    return errors;
  }

  /* ---------- 关系怎么进来 ----------
   * 记者写下的是一句话：谁 — 什么关系 — 和谁。类型与日期是这句话的可选补充。
   * 名字后面可以跟（人物）／（组织）／（事件）标出类型，不写就不标。
   */
  function typeFromLabel(label) {
    return { "人物": PERSON, "组织": ORGANIZATION, "事件": EVENT }[label] || null;
  }

  function readEndpoint(text, nodes) {
    var value = String(text === undefined || text === null ? "" : text).trim();
    var match = value.match(/^(.+?)(?:[（(](人物|组织|事件)[）)])?$/);
    if (!match || !match[1].trim()) return { error: "关系的两端都得有名字。" };
    var label = match[1].trim();
    var wanted = typeFromLabel(match[2]);
    var found = (nodes || []).filter(function (node) { return node.label === label; })[0];
    if (found) {
      if (wanted && found.type && found.type !== wanted) {
        return { error: "图上的「" + label + "」已经是另一种对象。" };
      }
      if (wanted && !found.type) found.type = wanted;
      return { node: found, existing: true };
    }
    return { node: { id: "", label: label, type: wanted }, existing: false };
  }

  function nextNodeId(nodes) {
    var number = (nodes || []).length + 1;
    var id = "node-" + number;
    while ((nodes || []).some(function (node) { return node.id === id; })) {
      number++;
      id = "node-" + number;
    }
    return id;
  }

  function addRelation(nodes, edges, input) {
    var fromText = String((input && input.from) || "").trim();
    var label = String((input && input.label) || "").trim();
    var toText = String((input && input.to) || "").trim();
    var date = dateOrEmpty(input && input.date);
    if (!fromText || !toText) return { error: "关系的两端都得有名字。" };
    if (!label) return { error: "这两个对象之间是什么关系？" };
    if (date === null) return { error: "日期得是真实的年-月-日，例如 2019-04-08；材料里没写就留空。" };

    var nextNodes = copy(nodes || []);
    var nextEdges = copy(edges || []);
    var from = readEndpoint(fromText, nextNodes);
    if (from.error) return { error: from.error };
    if (!from.existing) {
      if (nextNodes.length >= MAX_NODES) return { error: "图上已经有 " + MAX_NODES + " 个对象了。" };
      from.node.id = nextNodeId(nextNodes);
      nextNodes.push(from.node);
    }
    var to = readEndpoint(toText, nextNodes);
    if (to.error) return { error: to.error };
    if (!to.existing) {
      if (nextNodes.length >= MAX_NODES) return { error: "图上已经有 " + MAX_NODES + " 个对象了。" };
      to.node.id = nextNodeId(nextNodes);
      nextNodes.push(to.node);
    }
    if (from.node.id === to.node.id) return { error: "一条关系连不到对象自己身上。" };

    var edge = { from: from.node.id, to: to.node.id, label: label, date: date };
    if (nextEdges.some(function (item) {
      return item.from === edge.from && item.to === edge.to &&
        item.label === edge.label && (item.date || "") === (edge.date || "");
    })) return { error: "这一条已经在图上了。" };
    nextEdges.push(edge);
    return {
      nodes: nextNodes,
      edges: nextEdges,
      edge: edge,
      addedNodeIds: [from, to].filter(function (item) { return !item.existing; })
        .map(function (item) { return item.node.id; })
    };
  }

  /* ---------- 这张网的形状 ---------- */
  function degrees(nodes, edges) {
    var result = Object.create(null);
    (nodes || []).forEach(function (node) { result[node.id] = { in: 0, out: 0, total: 0 }; });
    (edges || []).forEach(function (edge) {
      if (!result[edge.from] || !result[edge.to]) return;
      result[edge.from].out++;
      result[edge.to].in++;
      result[edge.from].total++;
      result[edge.to].total++;
    });
    return result;
  }

  function weakNeighbors(nodes, edges) {
    var next = Object.create(null);
    (nodes || []).forEach(function (node) { next[node.id] = []; });
    (edges || []).forEach(function (edge) {
      if (!next[edge.from] || !next[edge.to]) return;
      next[edge.from].push(edge.to);
      next[edge.to].push(edge.from);
    });
    Object.keys(next).forEach(function (id) {
      next[id] = next[id].filter(function (value, index, all) { return all.indexOf(value) === index; }).sort();
    });
    return next;
  }

  function weakComponents(nodes, edges) {
    var next = weakNeighbors(nodes, edges);
    var order = (nodes || []).map(function (node) { return node.id; });
    var seen = Object.create(null);
    var components = [];
    order.forEach(function (start) {
      if (seen[start]) return;
      var queue = [start];
      var component = [];
      seen[start] = true;
      while (queue.length) {
        var id = queue.shift();
        component.push(id);
        next[id].forEach(function (to) {
          if (!seen[to]) { seen[to] = true; queue.push(to); }
        });
      }
      components.push(component);
    });
    return components;
  }

  /* 同一对对象之间的多条关系要各自弯开，否则用户以为只有一条（设计文档 §3.5）。
   * 这里给每条边算出它在这一对里的第几条、共几条，弯多少由界面决定。 */
  function parallelIndex(edges) {
    var counters = Object.create(null);
    var totals = Object.create(null);
    (edges || []).forEach(function (edge) {
      var key = [edge.from, edge.to].sort().join("\u0000");
      totals[key] = (totals[key] || 0) + 1;
    });
    return (edges || []).map(function (edge) {
      var key = [edge.from, edge.to].sort().join("\u0000");
      counters[key] = (counters[key] || 0) + 1;
      return { index: counters[key] - 1, count: totals[key] };
    });
  }

  function shortestPath(nodes, edges, start, end) {
    var map = nodeMap(nodes);
    if (!map[start] || !map[end]) return null;
    if (start === end) return null;
    var next = weakNeighbors(nodes, edges);
    var queue = [start];
    var seen = Object.create(null);
    var prev = Object.create(null);
    seen[start] = true;
    prev[start] = null;
    while (queue.length) {
      var id = queue.shift();
      if (id === end) break;
      next[id].forEach(function (to) {
        if (!seen[to]) { seen[to] = true; prev[to] = id; queue.push(to); }
      });
    }
    if (!seen[end]) return null;
    var ids = [];
    for (var at = end; at !== null; at = prev[at]) ids.unshift(at);
    var steps = [];
    for (var i = 1; i < ids.length; i++) {
      var a = ids[i - 1];
      var b = ids[i];
      var along = (edges || []).filter(function (edge) {
        return (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a);
      });
      steps.push({
        from: a,
        to: b,
        labels: along.map(function (edge) { return edge.label; }),
        edges: along
      });
    }
    return {
      length: ids.length - 1,
      intermediaries: Math.max(0, ids.length - 2),
      ids: ids,
      labels: ids.map(function (id) { return map[id].label; }),
      steps: steps
    };
  }

  /* ---------- 簇团布局：确定性，无随机数 ----------
   * 弹簧—斥力迭代。初始位置按下标铺在黄金角螺线上（同一组输入必然同一组初值），
   * 迭代步长单调冷却，最后按各自的牌面尺寸把重叠推开、整体缩放到画布内。
   * 相同输入重复计算，坐标逐项一致 —— 记者重开材料时空间记忆不会丢。
   */
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  function layoutClusters(nodes, edges, options) {
    var list = (nodes || []).map(function (node) { return node.id; });
    var count = list.length;
    var settings = options || {};
    var width = Number(settings.width) || 1000;
    var height = Number(settings.height) || 640;
    var sizes = settings.sizes || {};
    var margin = Number(settings.margin) || 90;
    var positions = Object.create(null);
    if (!count) return { width: width, height: height, positions: positions };

    var index = Object.create(null);
    var x = [];
    var y = [];
    var spread = Math.min(width, height) / 2.4;
    list.forEach(function (id, i) { index[id] = i; });

    /* 已经摆好的对象保持原位（settings.seed），新对象从它相关的对象旁边长出来 ——
     * 记者补一条关系时，整张网不该重排一遍（设计文档 §4）。 */
    var seed = settings.seed || null;
    var neighbours = weakNeighbors(nodes, edges);
    list.forEach(function (id, i) {
      var known = seed && seed[id];
      if (known && isFinite(known.x) && isFinite(known.y)) {
        x.push(known.x - width / 2);
        y.push(known.y - height / 2);
        return;
      }
      var anchors = (neighbours[id] || []).filter(function (other) {
        return seed && seed[other] && isFinite(seed[other].x);
      });
      if (anchors.length) {
        var sumX = 0;
        var sumY = 0;
        anchors.forEach(function (other) {
          sumX += seed[other].x - width / 2;
          sumY += seed[other].y - height / 2;
        });
        var angle = GOLDEN_ANGLE * i;
        x.push(sumX / anchors.length + Math.cos(angle) * 60);
        y.push(sumY / anchors.length + Math.sin(angle) * 60);
        return;
      }
      var radius = spread * Math.sqrt((i + 0.5) / count);
      var spiral = GOLDEN_ANGLE * i;
      x.push(Math.cos(spiral) * radius);
      y.push(Math.sin(spiral) * radius);
    });

    var links = [];
    (edges || []).forEach(function (edge) {
      if (index[edge.from] === undefined || index[edge.to] === undefined) return;
      if (edge.from === edge.to) return;
      links.push([index[edge.from], index[edge.to]]);
    });

    var ideal = Math.max(120, Math.sqrt(width * height / Math.max(1, count)) * 0.9);
    var rounds = Number(settings.rounds) || (seed ? 90 : 320);
    for (var round = 0; round < rounds; round++) {
      var cooling = 1 - round / rounds;
      var fx = new Array(count);
      var fy = new Array(count);
      var i;
      for (i = 0; i < count; i++) { fx[i] = 0; fy[i] = 0; }
      for (i = 0; i < count; i++) {
        for (var j = i + 1; j < count; j++) {
          var dx = x[i] - x[j];
          var dy = y[i] - y[j];
          var distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var push = ideal * ideal / distance;
          fx[i] += dx / distance * push;
          fy[i] += dy / distance * push;
          fx[j] -= dx / distance * push;
          fy[j] -= dy / distance * push;
        }
      }
      links.forEach(function (link) {
        var a = link[0];
        var b = link[1];
        var dx = x[a] - x[b];
        var dy = y[a] - y[b];
        var distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var pull = distance * distance / ideal;
        fx[a] -= dx / distance * pull;
        fy[a] -= dy / distance * pull;
        fx[b] += dx / distance * pull;
        fy[b] += dy / distance * pull;
      });
      // 轻微向心力：不相连的群落不会一路飘走，群落之间的空隙仍然留得住。
      for (i = 0; i < count; i++) {
        fx[i] -= x[i] * 0.06;
        fy[i] -= y[i] * 0.06;
        var step = Math.min(ideal * 0.22 * cooling + 0.5, Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]));
        var norm = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) || 1;
        x[i] += fx[i] / norm * step;
        y[i] += fy[i] / norm * step;
      }
    }

    /* 把这张网自己的长轴转到画布的长边上：链状材料不该斜挤在一条窄带里，
     * 半个台面空着。转多少由坐标的主轴（协方差矩阵的主特征向量）定，
     * 方向的正负按固定约定取，所以同一份材料转出来的角度也是同一个。 */
    if (count > 2) {
      var meanX = 0;
      var meanY = 0;
      var m;
      for (m = 0; m < count; m++) { meanX += x[m]; meanY += y[m]; }
      meanX /= count;
      meanY /= count;
      var sxx = 0;
      var syy = 0;
      var sxy = 0;
      for (m = 0; m < count; m++) {
        var ox = x[m] - meanX;
        var oy = y[m] - meanY;
        sxx += ox * ox;
        syy += oy * oy;
        sxy += ox * oy;
      }
      var axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      var wide = width >= height;
      var turn = wide ? -axis : -axis + Math.PI / 2;
      if (Math.abs(turn) > 1e-9) {
        var cos = Math.cos(turn);
        var sin = Math.sin(turn);
        for (m = 0; m < count; m++) {
          var rx = x[m] - meanX;
          var ry = y[m] - meanY;
          x[m] = rx * cos - ry * sin;
          y[m] = rx * sin + ry * cos;
        }
      }
    }

    /* 缩放与「推开重叠」必须按同一把尺子做，而且缩放要先做：
     * 先缩再推，牌之间的空隙才是屏幕上真实的像素空隙。反过来会把刚推开的牌又压回去。 */
    var boxOf = function (i) {
      var size = sizes[list[i]] || {};
      return { w: (Number(size.w) || 150) + 22, h: (Number(size.h) || 44) + 20 };
    };
    var i2;
    var span = function () {
      var box0 = boxOf(0);
      var bounds = { x1: x[0] - box0.w / 2, x2: x[0] + box0.w / 2, y1: y[0] - box0.h / 2, y2: y[0] + box0.h / 2 };
      for (var k = 1; k < count; k++) {
        var box = boxOf(k);
        bounds.x1 = Math.min(bounds.x1, x[k] - box.w / 2);
        bounds.x2 = Math.max(bounds.x2, x[k] + box.w / 2);
        bounds.y1 = Math.min(bounds.y1, y[k] - box.h / 2);
        bounds.y2 = Math.max(bounds.y2, y[k] + box.h / 2);
      }
      return bounds;
    };
    var separate = function () {
      for (var pass = 0; pass < 300; pass++) {
        var moved = false;
        for (var a2 = 0; a2 < count; a2++) {
          for (var b2 = a2 + 1; b2 < count; b2++) {
            var boxA = boxOf(a2);
            var boxB = boxOf(b2);
            var needX = (boxA.w + boxB.w) / 2;
            var needY = (boxA.h + boxB.h) / 2;
            var gapX = x[a2] - x[b2];
            var gapY = y[a2] - y[b2];
            if (Math.abs(gapX) >= needX || Math.abs(gapY) >= needY) continue;
            var overlapX = needX - Math.abs(gapX);
            var overlapY = needY - Math.abs(gapY);
            moved = true;
            if (overlapX / needX < overlapY / needY) {
              var shiftX = (gapX >= 0 ? 1 : -1) * overlapX / 2;
              x[a2] += shiftX;
              x[b2] -= shiftX;
            } else {
              var shiftY = (gapY >= 0 ? 1 : -1) * overlapY / 2;
              y[a2] += shiftY;
              y[b2] -= shiftY;
            }
          }
        }
        if (!moved) return true;
      }
      return false;
    };

    var usableW = Math.max(120, width - margin * 2);
    var usableH = Math.max(120, height - margin * 2);
    // 沿用旧位置时只许缩小、不许放大：否则补一条关系就把整张网重新铺一遍，
    // 记者刚建立的空间记忆当场丢掉（设计文档 §4）。
    var cap = seed ? 1 : 1.8;
    var scale = 1;
    for (var round2 = 0; round2 < 6; round2++) {
      var bounds = span();
      var fit = Math.min(
        usableW / Math.max(1, bounds.x2 - bounds.x1),
        usableH / Math.max(1, bounds.y2 - bounds.y1)
      );
      if (!isFinite(fit) || fit <= 0) fit = 1;
      var step = Math.min(fit, cap);
      if (!(step < 0.999 || (round2 === 0 && step > 1.001))) break;
      for (i2 = 0; i2 < count; i2++) {
        x[i2] *= step;
        y[i2] *= step;
      }
      scale *= step;
      separate();
    }

    var last = span();
    var centreX = (last.x1 + last.x2) / 2;
    var centreY = (last.y1 + last.y2) / 2;
    list.forEach(function (id, i) {
      positions[id] = {
        x: Math.round((width / 2 + x[i] - centreX) * 100) / 100,
        y: Math.round((height / 2 + y[i] - centreY) * 100) / 100
      };
    });
    return { width: width, height: height, positions: positions, scale: scale };
  }

  function hubs(nodes, edges) {
    var degree = degrees(nodes, edges);
    return (nodes || []).map(function (node) {
      return { id: node.id, label: node.label, total: degree[node.id].total };
    }).sort(function (a, b) {
      return b.total - a.total || a.label.localeCompare(b.label);
    });
  }

  function analyze(nodes, edges) {
    var degree = degrees(nodes, edges);
    var maxDegree = 0;
    Object.keys(degree).forEach(function (id) { maxDegree = Math.max(maxDegree, degree[id].total); });
    var components = weakComponents(nodes, edges);
    return {
      nodeCount: (nodes || []).length,
      edgeCount: (edges || []).length,
      degrees: degree,
      maxDegree: maxDegree,
      components: components,
      componentCount: components.length,
      hubs: hubs(nodes, edges)
    };
  }

  var FIXTURE_NODES = [
    { id: "n1", label: "周敏", type: PERSON },
    { id: "n2", label: "远岸控股", type: ORGANIZATION },
    { id: "n3", label: "陈立言", type: PERSON },
    { id: "n4", label: "岸山基金会", type: ORGANIZATION }
  ];
  var FIXTURE_EDGES = [
    { from: "n1", to: "n2", label: "担任董事", date: "2019-04-08" },
    { from: "n2", to: "n4", label: "设立", date: "2020-11-02" },
    { from: "n3", to: "n4", label: "任理事", date: "2021-03-15" }
  ];

  var CASES = [
    ["一句话就能落一条关系，两个新对象一起长出来", function () {
      var r = addRelation([], [], { from: "周敏（人物）", label: "担任董事", to: "远岸控股（组织）" });
      return !r.error && r.nodes.length === 2 && r.edges.length === 1 && r.addedNodeIds.length === 2;
    }],
    ["不写类型也能落，类型是可选的补充", function () {
      var r = addRelation([], [], { from: "周敏", label: "担任董事", to: "远岸控股" });
      return !r.error && r.nodes.length === 2 && r.nodes[0].type === null;
    }],
    ["日期可以不写，写了就必须是真日期", function () {
      var blank = addRelation([], [], { from: "甲", label: "会见", to: "乙", date: "" });
      var bad = addRelation([], [], { from: "甲", label: "会见", to: "乙", date: "2025-02-30" });
      return !blank.error && blank.edges[0].date === "" && !!bad.error;
    }],
    ["四项全同才算重复，反向不算重复", function () {
      var once = addRelation(FIXTURE_NODES, FIXTURE_EDGES, { from: "周敏", label: "担任董事", to: "远岸控股", date: "2019-04-08" });
      var back = addRelation(FIXTURE_NODES, FIXTURE_EDGES, { from: "远岸控股", label: "担任董事", to: "周敏", date: "2019-04-08" });
      return !!once.error && !back.error;
    }],
    ["同一对对象之间的多条关系各自编号", function () {
      var edges = [
        { from: "a", to: "b", label: "持有", date: "" },
        { from: "b", to: "a", label: "汇报给", date: "" },
        { from: "a", to: "c", label: "设立", date: "" }
      ];
      var marks = parallelIndex(edges);
      return marks[0].count === 2 && marks[1].index === 1 && marks[2].count === 1;
    }],
    ["对称关系不加箭头，不对称关系有方向", function () {
      return isSymmetric("夫妻") && isSymmetric("与陈立言通话") && !isSymmetric("持有") && !isSymmetric("汇报给");
    }],
    ["两点路径经过每一名中介，并带上沿途关系", function () {
      var path = shortestPath(FIXTURE_NODES, FIXTURE_EDGES, "n1", "n3");
      return path.length === 3 && path.intermediaries === 2 &&
        path.labels.join("→") === "周敏→远岸控股→岸山基金会→陈立言" &&
        path.steps[0].labels[0] === "担任董事";
    }],
    ["不连通就说没有路径，不编一条出来", function () {
      var nodes = FIXTURE_NODES.concat([{ id: "n9", label: "孤立的人", type: PERSON }]);
      return shortestPath(nodes, FIXTURE_EDGES, "n1", "n9") === null;
    }],
    ["同一组关系重算，坐标逐项一致", function () {
      var a = layoutClusters(FIXTURE_NODES, FIXTURE_EDGES, { width: 1000, height: 600 });
      var b = layoutClusters(FIXTURE_NODES, FIXTURE_EDGES, { width: 1000, height: 600 });
      return JSON.stringify(a.positions) === JSON.stringify(b.positions);
    }],
    ["布局不是按层排队：相连的近，无关的远", function () {
      var nodes = [
        { id: "a", label: "甲", type: PERSON }, { id: "b", label: "乙", type: PERSON },
        { id: "c", label: "丙", type: PERSON }, { id: "d", label: "丁", type: PERSON }
      ];
      var edges = [{ from: "a", to: "b", label: "夫妻", date: "" }, { from: "c", to: "d", label: "夫妻", date: "" }];
      var got = layoutClusters(nodes, edges, { width: 1000, height: 600 }).positions;
      var near = Math.hypot(got.a.x - got.b.x, got.a.y - got.b.y);
      var far = Math.hypot(got.a.x - got.c.x, got.a.y - got.c.y);
      return near < far;
    }],
    // 这四个对象是一条链，位置本来就没有余地（挨着最小间距排开），
    // 所以判据是「沿用旧位不会更乱」；有余地时更严的判据在 selftest 第三层。
    ["补一条关系时沿用旧位置不会更乱", function () {
      var nodes = FIXTURE_NODES.concat([{ id: "n5", label: "新证人", type: PERSON }]);
      var edges = FIXTURE_EDGES.concat([{ from: "n3", to: "n5", label: "作证", date: "" }]);
      var before = layoutClusters(FIXTURE_NODES, FIXTURE_EDGES, { width: 1000, height: 600 }).positions;
      var seeded = layoutClusters(nodes, edges, { width: 1000, height: 600, seed: before }).positions;
      var fresh = layoutClusters(nodes, edges, { width: 1000, height: 600 }).positions;
      var drift = function (after) {
        var sum = 0;
        FIXTURE_NODES.forEach(function (node) {
          sum += Math.sqrt(Math.pow(after[node.id].x - before[node.id].x, 2) +
            Math.pow(after[node.id].y - before[node.id].y, 2));
        });
        return sum / FIXTURE_NODES.length;
      };
      return drift(seeded) <= drift(fresh) + 0.5;
    }],
    ["不再随包发分层坐标", function () {
      return api.layoutGraph === undefined && api.relationshipLevels === undefined;
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
    PERSON: PERSON,
    ORGANIZATION: ORGANIZATION,
    EVENT: EVENT,
    TYPES: TYPES,
    MAX_NODES: MAX_NODES,
    SYMMETRIC_WORDS: SYMMETRIC_WORDS,
    FIXTURE_NODES: FIXTURE_NODES,
    FIXTURE_EDGES: FIXTURE_EDGES,
    CASES: CASES,
    copy: copy,
    validDate: validDate,
    validateGraph: validateGraph,
    isSymmetric: isSymmetric,
    addRelation: addRelation,
    degrees: degrees,
    weakComponents: weakComponents,
    parallelIndex: parallelIndex,
    shortestPath: shortestPath,
    layoutClusters: layoutClusters,
    hubs: hubs,
    analyze: analyze,
    runSelfTest: runSelfTest
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RelationshipGraphEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
