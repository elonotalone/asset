/*
 * 检索式构造 · 界面层
 *
 * 主体是那条正在长出来的检索式：横在画面中央，每答一句就当场重排，
 * 不等到流程末尾才当「产物」揭晓。
 *
 * 人写的词与工具加的结构分两种质地排（.w / .s），
 * 降级与去截词就地贴在被改写的那一个词下面，不汇成一份远处的说明列表。
 *
 * 全程 createElement + textContent，没有一处 innerHTML；
 * 不碰存储、不碰父窗口、不发请求。
 *
 * 复制永远只是加分项：沙箱里剪贴板常常不可用，查询串本身是可选中的文本。
 */
(function () {
  "use strict";

  var E = window.QueryBuilderEngine;

  var state = {
    question: "",
    blocks: [],
    dialect: "pubmed",
    focus: -1,
    asking: "question",
    picked: null
  };

  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function press(cls, label, onClick) {
    var node = el("button", cls, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  /* ---------- 主体：那条式子 ---------- */

  function word(piece) {
    var wrap = el("span", "term");
    var body = piece.body;
    var quoted = body.charAt(0) === '"';
    var starred = body.charAt(body.length - 1) === "*";

    if (piece.tag && piece.tagStyle === "prefix") wrap.appendChild(el("span", "s", piece.tag));
    if (quoted) wrap.appendChild(el("span", "s", '"'));

    var picked = state.picked && state.picked.block === piece.block && state.picked.term === piece.term;
    var hit = press(
      "w" + (piece.changes.length ? " loose" : "") + (picked ? " picked" : ""),
      piece.text,
      function () {
        state.picked = picked ? null : { block: piece.block, term: piece.term };
        render();
      }
    );
    hit.setAttribute("aria-label", piece.text + " · 落在" + piece.usedLabel);
    wrap.appendChild(hit);

    if (quoted) wrap.appendChild(el("span", "s", '"'));
    if (starred) wrap.appendChild(el("span", "s", "*"));
    if (piece.tag && piece.tagStyle === "suffix") wrap.appendChild(el("span", "s", piece.tag));
    return wrap;
  }

  /* 排字校样上的一条更正：原词、编译成什么、为什么，就贴在这一块下面 */
  function correction(piece) {
    var line = el("p", "fix");
    line.appendChild(el("span", "was", piece.raw));
    line.appendChild(el("span", "arrow", "→"));
    line.appendChild(el("span", "now", piece.rendered));
    piece.changes.forEach(function (change) {
      line.appendChild(el("span", "why", change.why));
    });
    return line;
  }

  /* 字段选择贴着它改变的那个词，不另占一片设置区 */
  function fieldPicker(piece) {
    var row = el("p", "picker");
    row.appendChild(el("span", "was", piece.text));
    Object.keys(E.FIELD_LABELS).forEach(function (field) {
      var on = field === piece.field;
      var node = press("field" + (on ? " on" : ""), E.FIELD_LABELS[field], function () {
        state.blocks[piece.block].terms[piece.term].field = field;
        render();
      });
      node.setAttribute("aria-pressed", on ? "true" : "false");
      row.appendChild(node);
    });
    row.appendChild(press("drop", "删掉", function () {
      state.blocks[piece.block].terms.splice(piece.term, 1);
      state.picked = null;
      render();
    }));
    return row;
  }

  function renderQuery(result) {
    clear(els.typeset);
    els.baseline.hidden = Boolean(result.query);
    if (!result.query) return;

    result.groups.forEach(function (group, index) {
      var wrap = el("div", "grp");
      var line = el("p", "line");

      var tag = press("tag", group.label || "第 " + (group.block + 1) + " 块", function () {
        state.focus = group.block;
        state.asking = "terms";
        state.picked = null;
        render();
      });
      tag.setAttribute("aria-label", "回到概念「" + (group.label || "第 " + (group.block + 1) + " 块") + "」");
      wrap.appendChild(tag);

      if (index > 0) line.appendChild(el("span", "s conj", "AND "));
      line.appendChild(el("span", "s", "("));
      group.pieces.forEach(function (piece, k) {
        if (k) line.appendChild(el("span", "s", " OR "));
        line.appendChild(word(piece));
      });
      line.appendChild(el("span", "s", ")"));
      wrap.appendChild(line);

      group.pieces.forEach(function (piece) {
        if (piece.changes.length) wrap.appendChild(correction(piece));
      });
      group.pieces.forEach(function (piece) {
        if (state.picked && state.picked.block === piece.block && state.picked.term === piece.term) {
          wrap.appendChild(fieldPicker(piece));
        }
      });

      els.typeset.appendChild(wrap);
    });
  }

  /* ---------- 头号结论：先说最影响检索含义的那件事 ---------- */

  function verdict(result) {
    var fields = result.changed.filter(function (p) {
      return p.changes.some(function (c) { return c.kind === "field"; });
    });
    if (fields.length) {
      return fields.length + " 个词在 " + result.dialectLabel +
        " 上换了字段，命中范围放宽了";
    }
    var cut = result.changed.filter(function (p) {
      return p.changes.some(function (c) { return c.kind === "truncation"; });
    });
    if (cut.length) {
      return cut.length + " 个词的截词符去掉了，命中范围比你写的窄";
    }
    if (result.query && E.DIALECTS[result.dialect].dropsFields) {
      var narrowed = result.pieces.some(function (p) { return p.field !== "all"; });
      if (narrowed) return "通用布尔式不带字段限定，命中范围比按字段检索宽";
    }
    if (result.empties.length) {
      var names = result.empties.map(function (item, i) {
        return "「" + (item.label || "第 " + (item.block + 1) + " 块") + "」";
      }).join("");
      return names + "还没有可用的词，没进这条式子";
    }
    if (result.query) return "这条式子可以带走";
    return "";
  }

  /* ---------- 目标数据库：它改的是整条式子 ---------- */

  function renderBanks(result) {
    clear(els.banks);
    if (!result.query) return;
    E.DIALECT_IDS.forEach(function (id) {
      var on = id === state.dialect;
      var node = press("bank" + (on ? " on" : ""), E.DIALECTS[id].label, function () {
        state.dialect = id;
        render();
      });
      node.setAttribute("aria-pressed", on ? "true" : "false");
      els.banks.appendChild(node);
    });
  }

  /* ---------- 一屏一问：后一步的语义要靠前一步 ---------- */

  function renderAsk() {
    var block = state.blocks[state.focus];
    if (state.asking === "question") {
      els.q.textContent = "一句话说清你要查什么";
      els.answer.value = state.question;
    } else if (state.asking === "concept") {
      els.q.textContent = state.blocks.length ? "还有哪个概念？" : "这个问题里有哪几个概念？先写第一个";
      els.answer.value = "";
    } else {
      els.q.textContent = "「" + (block ? block.label : "") + "」有哪些说法？";
      els.answer.value = "";
    }
    els.more.hidden = state.asking !== "terms";
    els.answer.focus();
  }

  function answer(event) {
    event.preventDefault();
    var value = els.answer.value.trim();
    if (!value) return;
    if (state.asking === "question") {
      state.question = value;
      state.asking = "concept";
    } else if (state.asking === "concept") {
      state.blocks.push({ label: value, terms: [] });
      state.focus = state.blocks.length - 1;
      state.asking = "terms";
    } else {
      if (!state.blocks[state.focus]) return;
      state.blocks[state.focus].terms.push({ text: value, field: "tiab" });
    }
    render();
  }

  /* ---------- 已答的人话退到上边缘，只留能解释这条式子来源的那一句 ---------- */

  function renderOrigin() {
    els.origin.hidden = !state.question || state.asking === "question";
    els.origin.textContent = state.question;
  }

  function render() {
    var result = E.compile(state.blocks, state.dialect);
    renderOrigin();
    renderQuery(result);
    renderBanks(result);
    els.carry.value = result.query;
    els.copy.hidden = !result.query;
    els.copy.textContent = "复制";
    els.verdict.textContent = verdict(result);
    renderAsk();
  }

  function carryOut() {
    els.carry.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    els.copy.textContent = ok ? "已复制" : "自己选中带走";
  }

  function mount() {
    els.typeset = document.getElementById("typeset");
    els.baseline = document.getElementById("baseline");
    els.banks = document.getElementById("banks");
    els.verdict = document.getElementById("verdict");
    els.carry = document.getElementById("carry");
    els.copy = document.getElementById("copy");
    els.origin = document.getElementById("origin");
    els.q = document.getElementById("q");
    els.answer = document.getElementById("answer");
    els.more = document.getElementById("more");

    document.getElementById("ask").addEventListener("submit", answer);
    els.copy.addEventListener("click", carryOut);
    els.more.addEventListener("click", function () {
      state.asking = "concept";
      state.picked = null;
      render();
    });
    els.origin.addEventListener("click", function () {
      state.asking = "question";
      render();
    });

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
