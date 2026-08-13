/*
 * 检索式构造 · 界面层（向导：一屏一问）
 *
 * 安全：全程 createElement + textContent，没有一处 innerHTML；
 * 不碰存储、不碰父窗口、不发请求。
 *
 * 复制那一条特别说明：沙箱里剪贴板 API 常常不可用，所以复制**永远只是加分项** ——
 * 查询串本身是可选中的文本，用户随时能自己选了拷走（指导「明令禁止」第 7 条）。
 */
(function () {
  "use strict";

  var E = window.QueryBuilderEngine;

  var state = {
    step: 1,
    question: "",
    blocks: [],
    dialect: "pubmed",
    draftLabel: "",
    draftTerm: "",
    draftField: "tiab",
    activeBlock: 0
  };

  var els = {};

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function btn(cls, label, onClick) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- 已答步骤摘要 ---------- */

  function renderDone() {
    clear(els.done);
    if (state.step > 1 && state.question) {
      addDone("要查什么", state.question, 1);
    }
    if (state.step > 2) {
      var summary = state.blocks.map(function (b) {
        return (b.label || "未命名") + "（" + b.terms.length + "）";
      }).join(" · ");
      addDone("概念块", summary || "还没有", 2);
    }
  }

  function addDone(k, v, goStep) {
    var row = el("button", "done-row");
    row.type = "button";
    row.appendChild(el("span", "k", k));
    row.appendChild(el("span", "v", v));
    row.addEventListener("click", function () { state.step = goStep; render(); });
    els.done.appendChild(row);
  }

  /* ---------- 三步 ---------- */

  function renderStage() {
    clear(els.stage);
    clear(els.q);
    clear(els.qhint);

    if (state.step === 1) return stepQuestion();
    if (state.step === 2) return stepBlocks();
    return stepDialect();
  }

  function stepQuestion() {
    els.q.textContent = "一句话说清你要查什么。";
    els.qhint.textContent = "用大白话写，后面再拆成概念块。这句话会跟着查询串一起留在记录里。";

    var input = el("input");
    input.type = "text";
    input.value = state.question;
    input.placeholder = "例如：运动干预能不能降低老年人跌倒的发生？";
    input.addEventListener("input", function () { state.question = input.value; renderProduct(); });
    els.stage.appendChild(input);

    var actions = el("div", "actions");
    actions.appendChild(btn("plain", "下一步：拆概念块", function () {
      state.step = 2;
      render();
    }));
    actions.appendChild(btn("plain", "载入一个示例问题", function () {
      state.question = E.DEMO.question;
      state.blocks = E.DEMO.blocks.map(function (b) {
        return { label: b.label, terms: b.terms.map(function (t) { return { text: t.text, field: t.field }; }) };
      });
      state.step = 2;
      render();
    }));
    els.stage.appendChild(actions);
  }

  function stepBlocks() {
    els.q.textContent = "这个问题里有哪几个概念？";
    els.qhint.textContent =
      "一个概念一块，同一块里放它的各种说法（同义词）。块内用 OR，块之间用 AND —— 这一步只管想，语法交给工具。";

    state.blocks.forEach(function (block, bi) {
      var wrap = el("div", "block");

      var head = el("div", "block-head");
      head.appendChild(el("span", "label", block.label || "未命名概念"));
      head.appendChild(el("span", "count", block.terms.length + " 个说法"));
      head.appendChild(btn("plain", "删掉这块", function () {
        state.blocks.splice(bi, 1);
        render();
      }));
      wrap.appendChild(head);

      var terms = el("div", "terms");
      block.terms.forEach(function (term, ti) {
        var row = el("div", "term");
        row.appendChild(el("span", "t", term.text));

        var sel = el("select");
        Object.keys(E.FIELD_LABELS).forEach(function (f) {
          var o = el("option", null, E.FIELD_LABELS[f]);
          o.value = f;
          if (f === (term.field || "tiab")) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () {
          term.field = sel.value;
          renderProduct();
        });
        row.appendChild(sel);

        row.appendChild(btn("plain", "移除", function () {
          block.terms.splice(ti, 1);
          render();
        }));
        terms.appendChild(row);
      });
      wrap.appendChild(terms);

      var add = el("div", "actions");
      var ti = el("input");
      ti.type = "text";
      ti.placeholder = "再加一个说法，回车加入（词组自动加引号，结尾 * 表示截词）";
      ti.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter") return;
        var v = ti.value.trim();
        if (!v) return;
        block.terms.push({ text: v, field: state.draftField });
        ti.value = "";
        render();
      });
      add.appendChild(ti);
      wrap.appendChild(add);

      els.stage.appendChild(wrap);
    });

    var newBlock = el("div", "block");
    var nb = el("input");
    nb.type = "text";
    nb.value = state.draftLabel;
    nb.placeholder = state.blocks.length ? "再加一个概念块（例如：结局）" : "第一个概念是什么？（例如：人群）";
    nb.addEventListener("input", function () { state.draftLabel = nb.value; });
    nb.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      var v = nb.value.trim();
      if (!v) return;
      state.blocks.push({ label: v, terms: [] });
      state.draftLabel = "";
      render();
    });
    newBlock.appendChild(nb);
    els.stage.appendChild(newBlock);

    var actions = el("div", "actions");
    actions.appendChild(btn("plain", "上一步", function () { state.step = 1; render(); }));
    actions.appendChild(btn("plain", "下一步：选数据库", function () { state.step = 3; render(); }));
    els.stage.appendChild(actions);
  }

  function stepDialect() {
    els.q.textContent = "拿去哪个库检索？";
    els.qhint.textContent = "同一份概念结构会重新编译，不需要你手工维护第二份字符串。";

    var row = el("div", "dialects");
    E.DIALECT_IDS.forEach(function (id) {
      var b = btn("", E.DIALECTS[id].label, function () {
        state.dialect = id;
        render();
      });
      b.setAttribute("aria-pressed", id === state.dialect ? "true" : "false");
      row.appendChild(b);
    });
    els.stage.appendChild(row);

    els.stage.appendChild(el("p", "q-hint", E.DIALECTS[state.dialect].hint));

    var actions = el("div", "actions");
    actions.appendChild(btn("plain", "上一步", function () { state.step = 2; render(); }));
    els.stage.appendChild(actions);
  }

  /* ---------- 产物预览：从第一步起就在 ---------- */

  function renderProduct() {
    var result = E.compile(state.blocks, state.dialect);

    els.cap.textContent = "产物 · " + result.dialectLabel;
    els.capMeta.textContent = result.blockCount
      ? result.blockCount + " 块 · " + result.termCount + " 词"
      : "";

    clear(els.query);
    if (!result.query) {
      els.query.appendChild(el("span", "empty",
        state.question
          ? "加上第一个概念词，这里立刻出现最小可用的查询串。"
          : "先写一句你要查什么，再加第一个概念词，这里就会长出查询串。"));
    } else {
      paintQuery(result.query);
    }

    els.copyArea.value = result.query;
    els.copyHint.textContent = result.query
      ? "这段文字可以直接选中复制。"
      : "";
    els.copyBtn.disabled = !result.query;

    clear(els.notes);
    result.notes.forEach(function (n) { els.notes.appendChild(el("li", null, n)); });

    return result;
  }

  /**
   * 括号、AND、OR 是**工具替用户加上的结构符号**，用强调色；
   * 用户自己打的词保持中性。指导要求这个区分不能只靠颜色，
   * 所以结构符号本身就是符号与关键字，位置上也和词分得开。
   */
  function paintQuery(query) {
    var re = /(\(|\)|\bAND\b|\bOR\b)/g;
    var last = 0;
    var m;
    while ((m = re.exec(query)) !== null) {
      if (m.index > last) {
        els.query.appendChild(document.createTextNode(query.slice(last, m.index)));
      }
      els.query.appendChild(el("span", "s", m[0]));
      last = m.index + m[0].length;
    }
    if (last < query.length) {
      els.query.appendChild(document.createTextNode(query.slice(last)));
    }
  }

  function copyOut() {
    els.copyArea.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    els.copyHint.textContent = ok
      ? "已复制。"
      : "这个环境不让脚本用剪贴板 —— 直接选中上面的文字自己复制就行。";
  }

  /* ---------- 自测 ---------- */

  function runTest() {
    var r = E.runSelfTest();
    els.testOut.textContent = r.passed + " / " + r.total + " 通过";
    clear(els.testDetail);
    r.failures.forEach(function (f) {
      els.testDetail.appendChild(el("li", null, f.name));
    });
    if (r.failures.length === 0) {
      els.testDetail.appendChild(el("li", null,
        "每条用例都逐字比对编译出来的查询串，改了编译行为就会红。"));
    }
  }

  /* ---------- 装配 ---------- */

  function render() {
    renderDone();
    renderStage();
    renderProduct();
  }

  function mount() {
    els.done = document.getElementById("done");
    els.q = document.getElementById("q");
    els.qhint = document.getElementById("q-hint");
    els.stage = document.getElementById("stage");
    els.cap = document.getElementById("cap");
    els.capMeta = document.getElementById("cap-meta");
    els.query = document.getElementById("query");
    els.notes = document.getElementById("notes");
    els.copyArea = document.getElementById("copy-area");
    els.copyBtn = document.getElementById("copy");
    els.copyHint = document.getElementById("copy-hint");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    els.copyBtn.addEventListener("click", copyOut);
    document.getElementById("run-test").addEventListener("click", runTest);

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
