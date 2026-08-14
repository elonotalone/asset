(function () {
  "use strict";

  var E = window.VoiceoverScriptEngine;

  // 语速与帧率用默认值，不上屏、也不让人先配置：默认值应该先让第一句话写得出来。
  var settings = {
    chineseRate: E.DEFAULTS.chineseRate,
    englishRate: E.DEFAULTS.englishRate,
    fps: E.DEFAULTS.fps
  };

  var state = {
    target: "",
    started: false,
    segments: [],
    draft: blankDraft()
  };

  var seq = 0;
  var els = {};
  var codeSlots = {};

  function blankDraft() {
    return { title: "", text: "", pause: "0.6", subtitle: "", visual: "" };
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function targetSeconds() {
    var value = Number(String(state.target).replace(/[^\d.]/g, ""));
    return isFinite(value) && value > 0 ? value : 0;
  }

  // 中英混排不是用户要选的口径，从这一段自己的字里看得出来。
  function detectMode(text) {
    var chinese = /[\u3400-\u9fff]/.test(text);
    var latin = /[A-Za-z0-9]/.test(text);
    if (chinese && latin) return "mixed";
    if (latin) return "en";
    return "zh";
  }

  function paragraphOf(segment) {
    return {
      title: segment.title,
      text: segment.text,
      mode: detectMode(segment.text),
      pauseSeconds: Number(segment.pause),
      subtitle: segment.subtitle,
      visualNote: segment.visual
    };
  }

  function draftInPlay() {
    return state.draft.text.trim() !== "" || state.draft.title.trim() !== "";
  }

  function timeline() {
    var list = state.segments.map(paragraphOf);
    if (draftInPlay()) list.push(paragraphOf(state.draft));
    return E.buildTimeline(list, settings);
  }

  function editable(cls, value, label, onInput) {
    var node = el("p", cls, value);
    node.setAttribute("contenteditable", "true");
    node.setAttribute("role", "textbox");
    node.setAttribute("data-label", label);
    node.setAttribute("aria-label", label);
    node.addEventListener("input", function () {
      onInput(node.textContent.replace(/\s+/g, " ").trim());
      refresh();
    });
    return node;
  }

  function codeRail(key) {
    var rail = el("p", "seg-code");
    var start = el("span", "code-start", "");
    var end = el("span", "code-end", "");
    rail.appendChild(start);
    rail.appendChild(end);
    codeSlots[key] = { start: start, end: end, rail: rail };
    return rail;
  }

  function breathLine(segment, key) {
    var line = el("p", "seg-breath");
    line.appendChild(document.createTextNode("句末停 "));
    var value = el("span", "seg-pause", segment.pause);
    value.setAttribute("contenteditable", "true");
    value.setAttribute("role", "textbox");
    value.setAttribute("inputmode", "decimal");
    value.setAttribute("aria-label", "段后停顿秒数");
    value.addEventListener("input", function () {
      segment.pause = value.textContent.replace(/[^\d.]/g, "");
      refresh();
    });
    line.appendChild(value);
    line.appendChild(document.createTextNode(" 秒"));
    codeSlots[key].breath = line;
    return line;
  }

  function segmentBlock(segment, index) {
    var key = segment.id;
    var block = el("article", "seg");
    block.setAttribute("data-segment", key);

    block.appendChild(codeRail(key));

    var head = el("h2", "seg-title");
    head.appendChild(el("span", "seg-order", String(index + 1)));
    var name = el("span", "seg-name", segment.title);
    name.setAttribute("contenteditable", "true");
    name.setAttribute("role", "textbox");
    name.setAttribute("data-label", "这一段叫什么");
    name.setAttribute("aria-label", "段落名称");
    name.addEventListener("input", function () {
      segment.title = name.textContent.replace(/\s+/g, " ").trim();
    });
    head.appendChild(name);
    block.appendChild(head);

    block.appendChild(editable("seg-text", segment.text, "这一段要念的话", function (value) {
      segment.text = value;
    }));

    block.appendChild(breathLine(segment, key));

    var subtitle = editable("seg-subtitle", segment.subtitle, "这一段的字幕", function (value) {
      segment.subtitle = value;
    });
    subtitle.setAttribute("data-kind", "字幕");
    block.appendChild(subtitle);

    var visual = editable("seg-visual", segment.visual, "给剪辑的画面备注", function (value) {
      segment.visual = value;
    });
    visual.setAttribute("data-kind", "画面");
    block.appendChild(visual);

    var aside = el("p", "seg-aside", "");
    codeSlots[key].aside = aside;
    block.appendChild(aside);

    var drop = el("button", "quiet", "删掉这一段");
    drop.type = "button";
    drop.setAttribute("data-drop", key);
    drop.addEventListener("click", function () {
      state.segments = state.segments.filter(function (item) { return item.id !== key; });
      render();
    });
    block.appendChild(drop);
    return block;
  }

  function draftBlock() {
    var block = el("article", "seg seg-draft");
    block.appendChild(codeRail("draft"));

    var ask = el("p", "compose-ask", state.segments.length ? "接下来这一段说什么" : "开场第一句怎么说");
    block.appendChild(ask);

    var head = el("h2", "seg-title");
    head.appendChild(el("span", "seg-order", String(state.segments.length + 1)));
    var name = el("span", "seg-name", state.draft.title);
    name.id = "draft-title";
    name.setAttribute("contenteditable", "true");
    name.setAttribute("role", "textbox");
    name.setAttribute("data-label", "这一段叫什么");
    name.setAttribute("aria-label", "段落名称");
    name.addEventListener("input", function () {
      state.draft.title = name.textContent.replace(/\s+/g, " ").trim();
      refresh();
    });
    head.appendChild(name);
    block.appendChild(head);

    var text = editable("seg-text", state.draft.text, "这一段要念的话", function (value) {
      state.draft.text = value;
    });
    text.id = "draft-text";
    block.appendChild(text);

    var breath = breathLine(state.draft, "draft");
    breath.querySelector(".seg-pause").id = "draft-pause";
    block.appendChild(breath);

    var subtitle = editable("seg-subtitle", state.draft.subtitle, "这一段的字幕", function (value) {
      state.draft.subtitle = value;
    });
    subtitle.id = "draft-subtitle";
    subtitle.setAttribute("data-kind", "字幕");
    block.appendChild(subtitle);

    var visual = editable("seg-visual", state.draft.visual, "给剪辑的画面备注", function (value) {
      state.draft.visual = value;
    });
    visual.id = "draft-visual";
    visual.setAttribute("data-kind", "画面");
    block.appendChild(visual);

    var aside = el("p", "seg-aside", "");
    codeSlots.draft.aside = aside;
    block.appendChild(aside);

    var commit = el("button", "seg-commit", "写进脚本");
    commit.type = "button";
    commit.id = "draft-commit";
    commit.addEventListener("click", commitDraft);
    block.appendChild(commit);
    return block;
  }

  function commitDraft() {
    if (!state.draft.text.trim() && !state.draft.title.trim()) return;
    state.segments.push({
      id: "seg-" + (++seq),
      title: state.draft.title,
      text: state.draft.text,
      pause: state.draft.pause,
      subtitle: state.draft.subtitle,
      visual: state.draft.visual
    });
    state.draft = blankDraft();
    render();
    var next = document.getElementById("draft-text");
    if (next) next.focus();
  }

  function openingBlock() {
    var ask = el("p", "target-ask");
    ask.appendChild(el("span", "compose-ask", "这段话要在多久内说完"));
    var line = el("span", "target-line");
    var value = el("span", "target-value", state.target);
    value.id = "target-seconds";
    value.setAttribute("contenteditable", "true");
    value.setAttribute("role", "textbox");
    value.setAttribute("inputmode", "numeric");
    value.setAttribute("data-label", "60");
    value.setAttribute("aria-label", "目标时长秒数");
    value.addEventListener("input", function () {
      state.target = value.textContent.replace(/[^\d.]/g, "");
      updateHeadline();
    });
    value.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        startWriting();
      }
    });
    line.appendChild(value);
    line.appendChild(document.createTextNode(" 秒"));
    ask.appendChild(line);

    var go = el("button", "seg-commit", "开始写");
    go.type = "button";
    go.id = "target-commit";
    go.addEventListener("click", startWriting);
    ask.appendChild(go);
    return ask;
  }

  function startWriting() {
    if (!targetSeconds()) return;
    state.started = true;
    render();
    var text = document.getElementById("draft-text");
    if (text) text.focus();
  }

  function targetFoot() {
    var foot = el("p", "target-foot");
    foot.appendChild(document.createTextNode("目标 "));
    var value = el("span", "target-value", state.target);
    value.id = "target-seconds";
    value.setAttribute("contenteditable", "true");
    value.setAttribute("role", "textbox");
    value.setAttribute("inputmode", "numeric");
    value.setAttribute("aria-label", "目标时长秒数");
    value.addEventListener("input", function () {
      state.target = value.textContent.replace(/[^\d.]/g, "");
      refresh();
    });
    foot.appendChild(value);
    foot.appendChild(document.createTextNode(" 秒"));
    return foot;
  }

  function refresh() {
    var line = timeline();
    var keys = state.segments.map(function (segment) { return segment.id; });
    if (draftInPlay()) keys.push("draft");
    keys.forEach(function (key, index) {
      var slot = codeSlots[key];
      var row = line.rows[index];
      if (!slot || !row) return;
      slot.start.textContent = row.startCode;
      slot.end.textContent = row.endCode;
      if (slot.breath) slot.breath.style.setProperty("--breath", String(row.pauseSeconds));
      if (slot.aside) {
        var mode = row.counts.mode;
        slot.aside.textContent = mode === "zh" ? "" : "这段里的英文与数字按词另算。";
      }
    });
    if (!draftInPlay() && codeSlots.draft) {
      codeSlots.draft.start.textContent = line.totalSeconds ? E.formatFramecode(line.totalFrames, settings.fps) : "";
      codeSlots.draft.end.textContent = "";
      if (codeSlots.draft.aside) codeSlots.draft.aside.textContent = "";
    }
    updateHeadline(line);
  }

  function updateHeadline(line) {
    if (!state.started) {
      els.headline.textContent = "";
      return;
    }
    line = line || timeline();
    var target = targetSeconds();
    if (!line.rows.length) {
      els.headline.textContent = target + " 秒大约能念 " + E.budgetFor(target, settings.chineseRate) + " 个字。";
      return;
    }
    var remaining = target - line.totalSeconds;
    els.headline.textContent = remaining >= 0
      ? "还剩 " + remaining.toFixed(1) + " 秒。"
      : "超出 " + Math.abs(remaining).toFixed(1) + " 秒，得删掉这么多。";
  }

  function render() {
    clear(els.script);
    codeSlots = {};
    if (!state.started) {
      els.script.appendChild(openingBlock());
      updateHeadline();
      return;
    }
    state.segments.forEach(function (segment, index) {
      els.script.appendChild(segmentBlock(segment, index));
    });
    els.script.appendChild(draftBlock());
    els.script.appendChild(targetFoot());
    refresh();
  }

  function mount() {
    els.script = document.getElementById("script");
    els.headline = document.getElementById("headline");
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
