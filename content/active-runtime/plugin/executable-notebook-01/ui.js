/*
 * 可执行笔记 · 界面层
 *
 * 一份从上往下读的文稿：每一行左边是人写的，右边是机器此刻算出来的。
 * 主角不是「参数」也不是「结果」，而是这两者贴在同一行上的那种对应关系，
 * 所以没有「参数区」与「文稿区」——可以拧的量就是文稿里的几行。
 *
 * 拧一个量之后**只重画被影响的那几行**，并让它们按上游到下游的顺序依次亮一下：
 * 那一下就是「已经重算了」的回执。没被影响的行连一次重绘的抖动都没有，
 * 屏幕上安静得能听见哪几行在动。
 *
 * 全程 createElement + textContent，没有一处 innerHTML；
 * 不碰存储、不碰父窗口、不发请求。
 */
(function () {
  "use strict";

  var E = window.ExecutableNotebookEngine;

  /* 数值 + 单位：「620 m²」「32 元/m²/月」都要认；「620*2」是式子不是量。 */
  var NUMBER = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/;
  var IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

  var state = { rows: [], pinned: "", error: null };
  var lastRun = null;
  var els = {};
  var timers = [];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function field(cls, value, label) {
    var box = el("input", cls);
    box.value = value === undefined || value === null ? "" : String(value);
    box.setAttribute("aria-label", label);
    box.autocomplete = "off";
    box.spellcheck = false;
    return box;
  }

  /* ---------- 人写下的那一行是什么，由它自己的样子看出来 ---------- */

  function asQuantity(body) {
    var m = NUMBER.exec(body);
    if (!m) return null;
    var rest = m[2].trim();
    if (rest && /^[+\-*/^(),<>=]/.test(rest)) return null;
    return { value: Number(m[1]), raw: m[1], unit: rest };
  }

  function readName(text) {
    var parts = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { label: "", id: "" };
    var last = parts[parts.length - 1];
    if (IDENT.test(last)) {
      return { label: parts.slice(0, -1).join(" "), id: last };
    }
    return { label: parts.join(" "), id: "" };
  }

  function note(words) {
    var text = words.join(" ").replace(/\s+/g, " ").trim();
    return text ? { kind: "note", label: "", id: "", body: text, unit: "" } : null;
  }

  /*
   * 没有短名字（或者写的是中文句子）的那一行，就是一句说明；
   * 只有拿得到短名字的行才能被别的行引用，所以才需要右边那一格。
   */
  function makeRow(nameText, bodyText) {
    var name = readName(nameText);
    var body = String(bodyText || "").trim();
    if (!name.id) return note([name.label, body]);

    var quantity = asQuantity(body);
    if (quantity) {
      return {
        kind: "quantity", label: name.label, id: name.id,
        body: quantity.raw, value: quantity.value, unit: quantity.unit
      };
    }
    if (!body) return null;
    if (/[^\x00-\x7F]/.test(body)) return note([name.label, name.id, body]);
    return {
      kind: /(<=|>=|==|!=|<|>)/.test(body) ? "assertion" : "expression",
      label: name.label, id: name.id, body: body, unit: ""
    };
  }

  /* ---------- 交给内核算 ---------- */

  function spec() {
    var parameters = Object.create(null);
    var cells = [];
    state.rows.forEach(function (row) {
      if (row.kind === "quantity") parameters[row.id] = row.value;
      else if (row.kind === "expression") cells.push({ name: row.id, type: "expression", content: row.body });
      else if (row.kind === "assertion") cells.push({ name: row.id, type: "assertion", content: row.body });
    });
    return { parameters: parameters, cells: cells, baselineDate: "" };
  }

  function rowOf(id) {
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) return state.rows[i];
    return null;
  }

  function resultText(row) {
    if (row.kind === "note") return "";
    if (row.kind === "quantity") return row.body;
    if (!lastRun || !lastRun.results[row.id]) return "";
    var found = lastRun.results[row.id];
    if (found.type === "assertion") return found.passed ? "通过" : "未通过";
    return E.formatValue(found.value);
  }

  /* ---------- 文稿 ---------- */

  function nameCell(row) {
    var wrap = el("div", "who");
    if (row.kind === "note") {
      var textBox = field("hand note", row.body, "说明文字");
      textBox.addEventListener("change", function () {
        row.body = textBox.value.trim();
        if (!row.body) drop(row);
        else recompute(null);
      });
      wrap.appendChild(textBox);
      return wrap;
    }
    var pin = el("button", "pin" + (state.pinned === row.id ? " on" : ""));
    pin.type = "button";
    pin.setAttribute("aria-pressed", state.pinned === row.id ? "true" : "false");
    if (row.label) pin.appendChild(el("span", "full", row.label));
    pin.appendChild(el("span", "id", row.id));
    pin.setAttribute("aria-label", "钉住 " + (row.label || row.id));
    pin.addEventListener("click", function () {
      state.pinned = state.pinned === row.id ? "" : row.id;
      renderDoc();
      renderHeadline();
    });
    wrap.appendChild(pin);
    return wrap;
  }

  function bodyCell(row) {
    var wrap = el("div", "what");
    if (row.kind === "note" || row.kind === "quantity") return wrap;
    var box = field("hand body", row.body, "式子");
    box.addEventListener("change", function () {
      row.body = box.value.trim();
      if (!row.body) drop(row);
      else recompute(null);
    });
    wrap.appendChild(box);
    return wrap;
  }

  function answerCell(row) {
    var wrap = el("div", "answer");
    if (row.kind === "note") return wrap;

    if (row.kind === "quantity") {
      var knob = field("knob", row.body, (row.label || row.id) + " 的值");
      knob.addEventListener("change", function () {
        var read = asQuantity(knob.value);
        if (!read) {
          knob.value = row.body;
          return;
        }
        row.body = read.raw;
        row.value = read.value;
        if (read.unit) row.unit = read.unit;
        knob.value = read.raw;
        row.unitBox.value = row.unit;
        recompute(row.id);
      });
      wrap.appendChild(knob);
      row.knob = knob;
    } else {
      var printed = el("span", "printed", resultText(row));
      if (row.kind === "assertion") {
        printed.className = "printed " + (resultText(row) === "未通过" ? "over" : "held");
      }
      wrap.appendChild(printed);
      row.printed = printed;
    }

    var unit = field("unit", row.unit, (row.label || row.id) + " 的单位");
    unit.addEventListener("change", function () {
      row.unit = unit.value.trim();
      renderHeadline();
    });
    if (row.kind === "assertion") unit.hidden = true;
    wrap.appendChild(unit);
    row.unitBox = unit;
    return wrap;
  }

  function renderDoc() {
    clear(els.doc);
    var told = false;
    state.rows.forEach(function (row) {
      var line = el("div", "row " + row.kind);
      line.appendChild(nameCell(row));
      if (row.kind !== "note") {
        line.appendChild(bodyCell(row));
        line.appendChild(answerCell(row));
      }
      els.doc.appendChild(line);
      row.node = line;
      if (state.error && row.id && state.error.rows.indexOf(row.id) >= 0) {
        line.classList.add("wrong");
        if (state.error.rows[0] === row.id) {
          els.doc.appendChild(el("p", "said", state.error.message));
          told = true;
        }
      }
    });
    /* 说的是还没落到纸上的那一行（比如名字撞了），就把话搁在文稿末尾 */
    if (state.error && !told) els.doc.appendChild(el("p", "said", state.error.message));
    alignDecimals();
  }

  /*
   * 同一列的小数点对到一条竖线上：右对齐只能让末位对齐，
   * 所以按同列最长的小数位给每格补一段右侧留白（等宽字体下 1ch = 一个数位）。
   */
  function alignDecimals() {
    var boxes = [];
    var widest = 0;
    state.rows.forEach(function (row) {
      var box = row.kind === "quantity" ? row.knob : row.printed;
      if (!box || row.kind === "assertion") return;
      var text = row.kind === "quantity" ? row.body : resultText(row);
      var plain = /^-?\d+(?:\.\d+)?$/.test(text);
      var frac = plain && text.indexOf(".") >= 0 ? text.length - text.indexOf(".") : 0;
      if (frac > widest) widest = frac;
      boxes.push({ box: box, frac: frac, plain: plain });
    });
    boxes.forEach(function (item) {
      item.box.style.paddingRight = item.plain ? (widest - item.frac) + "ch" : "0";
    });
  }

  /* ---------- 改动会走：按上游到下游的顺序依次亮一下，亮过退回原样 ---------- */

  function lightUp(order) {
    timers.forEach(clearTimeout);
    timers = [];
    order.forEach(function (name, index) {
      var row = rowOf(name);
      if (!row || !row.node) return;
      timers.push(setTimeout(function () {
        row.node.classList.add("lit");
        timers.push(setTimeout(function () { row.node.classList.remove("lit"); }, 620));
      }, index * 90));
    });
  }

  function paintResults(names) {
    names.forEach(function (name) {
      var row = rowOf(name);
      if (!row || !row.printed) return;
      var text = resultText(row);
      row.printed.textContent = text;
      if (row.kind === "assertion") {
        row.printed.className = "printed " + (text === "未通过" ? "over" : "held");
      }
    });
    alignDecimals();
  }

  /* changed 有值就是用户拧了那一个量：只沿它的下游重算，其余沿用上一次的结果 */
  function recompute(changed) {
    var options = lastRun && changed ? { previous: lastRun, changed: [changed] } : undefined;
    var before = state.error;
    try {
      lastRun = E.runNotebook(spec(), options);
      state.error = null;
    } catch (error) {
      /* lastRun 故意不动：算不下去的时候，其余的行照旧显示上一次算出来的值 */
      state.error = {
        message: error && error.message ? error.message : String(error),
        rows: error && error.cycle && error.cycle.length
          ? error.cycle.slice()
          : (error && error.cell ? [error.cell] : [])
      };
      if (before || !changed) renderDoc();
      else markWrong();
      renderHeadline();
      return;
    }
    if (before) {
      renderDoc();
    } else if (changed) {
      paintResults(lastRun.order);
      lightUp(lastRun.order);
    } else {
      renderDoc();
    }
    renderHeadline();
  }

  /* 出错时其余的行照旧显示上一次的值，不整片变灰 */
  function markWrong() {
    state.rows.forEach(function (row) {
      if (row.node) row.node.classList.toggle("wrong", state.error.rows.indexOf(row.id) >= 0);
    });
    var first = rowOf(state.error.rows[0]);
    var said = els.doc.querySelector(".said");
    if (said) said.parentNode.removeChild(said);
    said = el("p", "said", state.error.message);
    if (first && first.node && first.node.nextSibling) els.doc.insertBefore(said, first.node.nextSibling);
    else els.doc.appendChild(said);
  }

  /* ---------- 头号结论：作者钉住的那一格，以及有断言越界时的那一声 ---------- */

  function pinnedRow() {
    var chosen = state.pinned ? rowOf(state.pinned) : null;
    if (chosen) return chosen;
    for (var i = state.rows.length - 1; i >= 0; i--) {
      if (state.rows[i].kind === "expression") return state.rows[i];
    }
    return null;
  }

  function renderHeadline() {
    clear(els.headline);
    if (!state.rows.length) {
      els.headline.appendChild(el("span", "nudge", "先写下一个你会反复改的量"));
      return;
    }
    var row = pinnedRow();
    if (row) {
      var value = resultText(row);
      els.headline.appendChild(el("span", "big", value || "—"));
      if (row.unit) els.headline.appendChild(el("span", "big-unit", row.unit));
      els.headline.appendChild(el("span", "big-what", row.label || row.id));
    }
    var over = [];
    if (lastRun) {
      state.rows.forEach(function (item) {
        if (item.kind !== "assertion") return;
        var found = lastRun.results[item.id];
        if (found && found.passed === false) over.push(item.label || item.id);
      });
    }
    if (over.length) {
      els.headline.appendChild(el("span", "over", over.join("、") + " 越界了"));
    }
  }

  /* ---------- 文稿末尾的延续 ---------- */

  function drop(row) {
    var at = state.rows.indexOf(row);
    if (at >= 0) state.rows.splice(at, 1);
    if (state.pinned === row.id) state.pinned = "";
    recompute(null);
  }

  function write(event) {
    event.preventDefault();
    var row = makeRow(els.newName.value, els.newBody.value);
    if (!row) return;
    if (row.id && rowOf(row.id)) {
      state.error = { message: "名称“" + row.id + "”已经存在。", rows: [row.id] };
      renderDoc();
      renderHeadline();
      return;
    }
    state.rows.push(row);
    els.newName.value = "";
    els.newBody.value = "";
    recompute(null);
    els.newName.focus();
    els.scroll.scrollTop = els.scroll.scrollHeight;
  }

  function mount() {
    els.headline = document.getElementById("headline");
    els.doc = document.getElementById("doc");
    els.scroll = document.getElementById("scroll");
    els.newName = document.getElementById("new-name");
    els.newBody = document.getElementById("new-body");

    document.getElementById("tail").addEventListener("submit", write);
    renderDoc();
    renderHeadline();
    els.newName.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
