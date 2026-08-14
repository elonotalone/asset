(function () {
  "use strict";

  var E = window.DialogueBranchEngine;

  var graph = { startId: null, nodes: [], edges: [] };
  // 说话人默认就是两个认得的名字，随时可以在台词上改成「客服小林」「客户」。
  var sides = { us: "我方", them: "对方" };
  var currentId = null;
  var draft = { text: "", condition: "" };
  var pickingReturn = false;
  var seq = 0;
  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function other(side) {
    return side === "us" ? "them" : "us";
  }

  function node(id) {
    return E.findNode(graph, id);
  }

  function forwardChildren(id) {
    return E.outgoing(graph, id)
      .filter(function (edge) { return edge.kind !== "return"; })
      .sort(function (a, b) { return (a.priority || 0) - (b.priority || 0); });
  }

  function returnChildren(id) {
    return E.outgoing(graph, id).filter(function (edge) { return edge.kind === "return"; });
  }

  function excerpt(text) {
    var line = String(text || "").replace(/\s+/g, " ").trim();
    return line.length > 20 ? line.slice(0, 20) + "…" : line;
  }

  // 有条件的兄弟分支存在时，没写条件的那条就是「其他情况」。
  // 兜底不是用户勾的复选框，是这条路自己的位置决定的。
  function normalizeFallback(fromId) {
    var edges = forwardChildren(fromId);
    var conditioned = edges.some(function (edge) { return edge.condition && edge.condition.value; });
    edges.forEach(function (edge, index) {
      edge.priority = index + 1;
      edge.fallback = conditioned && !(edge.condition && edge.condition.value);
    });
  }

  function pathTo(id) {
    var parents = {};
    var seen = {};
    var queue = [graph.startId];
    seen[graph.startId] = true;
    while (queue.length) {
      var at = queue.shift();
      forwardChildren(at).forEach(function (edge) {
        if (!seen[edge.to]) {
          seen[edge.to] = true;
          parents[edge.to] = at;
          queue.push(edge.to);
        }
      });
    }
    var chain = [];
    var cursor = id;
    while (cursor) {
      chain.unshift(cursor);
      cursor = parents[cursor];
    }
    return chain;
  }

  function composeSide() {
    var here = node(currentId);
    return here ? other(here.side) : "us";
  }

  function commitDraft() {
    var text = draft.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    var side = els.composeSide ? els.composeSide.getAttribute("data-side") : composeSide();
    var id = "line-" + (++seq);
    graph.nodes.push({
      id: id,
      name: excerpt(text),
      side: side,
      speaker: sides[side],
      text: text,
      ending: false
    });
    if (!graph.startId) {
      graph.startId = id;
    } else {
      graph.edges.push({
        id: "edge-" + id,
        from: currentId,
        to: id,
        priority: forwardChildren(currentId).length + 1,
        condition: draft.condition.trim()
          ? { field: "reply", operator: "includes", value: draft.condition.trim() }
          : null,
        fallback: false,
        kind: "forward"
      });
      normalizeFallback(currentId);
    }
    currentId = id;
    draft.text = "";
    draft.condition = "";
    render();
    if (els.input) els.input.focus();
  }

  function cueFor(edge) {
    if (!edge) return "";
    if (edge.kind === "return") return "";
    if (edge.condition && edge.condition.value) return "当" + sides.them + "提到「" + edge.condition.value + "」";
    if (edge.fallback) return "其他情况";
    return "";
  }

  function noteFor(target, role) {
    if (target.ending) return "说到这里自然结束。";
    if (role !== "current" && !E.outgoing(graph, target.id).length) return "这条走不通：说完就没有下文了。";
    return "";
  }

  function speakerName(target) {
    var name = el("span", "turn-speaker", sides[target.side]);
    name.setAttribute("contenteditable", "true");
    name.setAttribute("role", "textbox");
    name.setAttribute("data-side-name", target.side);
    name.setAttribute("aria-label", "说话人名字");
    name.addEventListener("input", function () {
      var value = name.textContent.replace(/\s+/g, " ").trim();
      if (!value) return;
      sides[target.side] = value;
      graph.nodes.forEach(function (item) {
        if (item.side === target.side) item.speaker = value;
      });
      var others = document.querySelectorAll('[data-side-name="' + target.side + '"]');
      for (var i = 0; i < others.length; i++) {
        if (others[i] !== name) others[i].textContent = value;
      }
      if (els.composeSide && els.composeSide.getAttribute("data-side") === target.side) {
        els.composeSide.textContent = value;
      }
      updateHeadline();
    });
    return name;
  }

  function turnBlock(id, role, edge, depth) {
    var target = node(id);
    var block = el("article", "turn");
    block.setAttribute("data-turn", id);
    block.setAttribute("data-role", role);
    block.setAttribute("data-side", target.side);
    block.setAttribute("data-depth", String(depth));
    if (role === "current") block.setAttribute("data-current", "true");

    var cue = cueFor(edge);
    if (cue) block.appendChild(el("p", "turn-cue", cue));

    var head = el("p", "turn-head");
    head.appendChild(speakerName(target));
    block.appendChild(head);

    block.appendChild(el("p", "turn-line", target.text));

    var note = noteFor(target, role);
    if (note) block.appendChild(el("p", "turn-note", note));

    var onward = forwardChildren(id)[0];
    if (role === "branch" && onward) {
      var next = node(onward.to);
      block.appendChild(el("p", "turn-onward", "接着：" + sides[next.side] + "「" + excerpt(next.text) + "」"));
    }

    var acts = el("div", "turn-acts");
    if (role !== "current") {
      var pick = el("button", "turn-pick", "从这句接下去");
      pick.type = "button";
      pick.addEventListener("click", function () {
        currentId = id;
        pickingReturn = false;
        render();
      });
      acts.appendChild(pick);
    }
    if (role === "branch" && edge) {
      var siblings = forwardChildren(edge.from);
      var seat = siblings.indexOf(edge);
      if (siblings.length > 1 && seat > 0) acts.appendChild(moveAction(edge, -1, "先走这条"));
      if (siblings.length > 1 && seat < siblings.length - 1) acts.appendChild(moveAction(edge, 1, "放到后面"));
    }
    if (!target.ending && !E.outgoing(graph, id).length) {
      var end = el("button", "turn-end", "就到这里结束");
      end.type = "button";
      end.setAttribute("data-end", id);
      end.addEventListener("click", function () {
        target.ending = true;
        render();
      });
      acts.appendChild(end);
    }
    if (acts.childNodes.length) block.appendChild(acts);
    return block;
  }

  function moveAction(edge, delta, label) {
    var button = el("button", "turn-move", label);
    button.type = "button";
    button.setAttribute("data-move", edge.id);
    button.addEventListener("click", function () {
      var siblings = forwardChildren(edge.from);
      var seat = siblings.indexOf(edge);
      var swap = siblings[seat + delta];
      if (!swap) return;
      var keep = edge.priority;
      edge.priority = swap.priority;
      swap.priority = keep;
      normalizeFallback(edge.from);
      render();
    });
    return button;
  }

  function returnBlock(edge, depth) {
    var target = node(edge.to);
    var block = el("article", "turn turn-back");
    block.setAttribute("data-turn", edge.to);
    block.setAttribute("data-role", "return");
    block.setAttribute("data-side", target.side);
    block.setAttribute("data-depth", String(depth));
    block.appendChild(el("p", "turn-cue", "澄清完，回到主线"));
    var head = el("p", "turn-head");
    head.appendChild(speakerName(target));
    block.appendChild(head);
    block.appendChild(el("p", "turn-line", target.text));
    var acts = el("div", "turn-acts");
    var pick = el("button", "turn-pick", "从这句接下去");
    pick.type = "button";
    pick.addEventListener("click", function () {
      currentId = edge.to;
      render();
    });
    acts.appendChild(pick);
    block.appendChild(acts);
    return block;
  }

  function returnPicker(chain) {
    var wrap = el("p", "return-picker");
    wrap.appendChild(el("span", "return-ask", "接回上文的哪一句"));
    chain.slice(0, -1).forEach(function (id) {
      var target = node(id);
      var pick = el("button", "pick", sides[target.side] + "「" + excerpt(target.text) + "」");
      pick.type = "button";
      pick.setAttribute("data-return-to", id);
      pick.addEventListener("click", function () {
        graph.edges.push({
          id: "edge-back-" + currentId + "-" + id,
          from: currentId,
          to: id,
          priority: forwardChildren(currentId).length + 1,
          condition: null,
          fallback: false,
          kind: "return"
        });
        pickingReturn = false;
        render();
      });
      wrap.appendChild(pick);
    });
    return wrap;
  }

  function composeBlock() {
    clear(els.compose);
    var side = graph.startId ? composeSide() : "us";
    var here = node(currentId);
    var ask;
    if (!graph.startId) ask = "开场第一句你会怎么说";
    else if (side === "them") ask = sides.them + "接下来可能怎么说";
    else ask = "你会怎么接";

    els.compose.appendChild(el("p", "compose-ask", ask));

    var line = el("div", "compose-line");
    var speaker = el("button", "compose-speaker", sides[side]);
    speaker.type = "button";
    speaker.id = "compose-speaker";
    speaker.setAttribute("data-side", side);
    speaker.addEventListener("click", function () {
      var flipped = other(speaker.getAttribute("data-side"));
      speaker.setAttribute("data-side", flipped);
      speaker.textContent = sides[flipped];
      els.compose.querySelector(".compose-ask").textContent =
        flipped === "them" ? sides.them + "接下来可能怎么说" : "你会怎么接";
    });
    line.appendChild(speaker);

    var input = el("span", "compose-input");
    input.id = "line-input";
    input.setAttribute("contenteditable", "true");
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-label", ask);
    input.setAttribute("data-label", "写下这一句");
    input.textContent = draft.text;
    input.addEventListener("input", function () {
      draft.text = input.textContent;
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        commitDraft();
      }
    });
    line.appendChild(input);

    var commit = el("button", "compose-commit", "写进台本");
    commit.type = "button";
    commit.id = "commit-line";
    commit.addEventListener("click", commitDraft);
    line.appendChild(commit);
    els.compose.appendChild(line);

    if (here && forwardChildren(currentId).length) {
      var when = el("p", "compose-when");
      when.appendChild(document.createTextNode("当" + sides.them + "提到 "));
      var condition = el("span", "compose-condition");
      condition.id = "condition-input";
      condition.setAttribute("contenteditable", "true");
      condition.setAttribute("role", "textbox");
      condition.setAttribute("aria-label", "这条分支在什么话下进入");
      condition.setAttribute("data-label", "哪句话");
      condition.textContent = draft.condition;
      condition.addEventListener("input", function () {
        draft.condition = condition.textContent;
      });
      when.appendChild(condition);
      els.compose.appendChild(when);
    }

    if (here && pathTo(currentId).length > 1) {
      var back = el("button", "compose-back", "接回上文");
      back.type = "button";
      back.id = "return-line";
      back.addEventListener("click", function () {
        pickingReturn = !pickingReturn;
        render();
      });
      els.compose.appendChild(back);
    }
    els.composeSide = speaker;
    els.input = input;
  }

  function updateHeadline() {
    var analysis = E.analyzeGraph(graph);
    if (!analysis.coverageCalculated) {
      els.headline.textContent = "";
      return;
    }
    var stranded = analysis.deadEnds.filter(function (item) { return item.id !== currentId; });
    if (stranded.length) {
      els.headline.textContent = sides[stranded[0].side] + "「" + excerpt(stranded[0].text) + "」说完就没有下文了。";
      return;
    }
    if (analysis.unreachable.length) {
      els.headline.textContent = "「" + excerpt(analysis.unreachable[0].text) + "」从开场走不到。";
      return;
    }
    els.headline.textContent = graph.nodes.length > 1 ? "每条路都走得通。" : "";
  }

  function render() {
    clear(els.script);
    if (graph.startId) {
      var chain = pathTo(currentId);
      chain.forEach(function (id, index) {
        var role = index === chain.length - 1 ? "current" : "past";
        els.script.appendChild(turnBlock(id, role, index > 0 ? incoming(chain[index - 1], id) : null, index));
      });
      if (pickingReturn) els.script.appendChild(returnPicker(chain));
      forwardChildren(currentId).forEach(function (edge) {
        els.script.appendChild(turnBlock(edge.to, "branch", edge, chain.length));
      });
      returnChildren(currentId).forEach(function (edge) {
        els.script.appendChild(returnBlock(edge, chain.length));
      });
      E.analyzeGraph(graph).unreachable.forEach(function (item) {
        var stray = turnBlock(item.id, "stray", null, 0);
        stray.appendChild(el("p", "turn-note", "从开场走不到这一段。"));
        els.script.appendChild(stray);
      });
    }
    composeBlock();
    updateHeadline();
  }

  function incoming(fromId, toId) {
    return E.outgoing(graph, fromId).filter(function (edge) { return edge.to === toId; })[0] || null;
  }

  function mount() {
    els.script = document.getElementById("script");
    els.compose = document.getElementById("compose");
    els.headline = document.getElementById("headline");
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
