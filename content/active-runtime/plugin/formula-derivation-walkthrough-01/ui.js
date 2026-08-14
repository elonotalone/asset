(function () {
  "use strict";

  var E = globalThis.FormulaWalkthroughEngine;
  var BUILTINS = ["sqrt", "abs", "sin", "cos", "tan", "ln", "log", "exp", "min", "max", "pow", "round"];
  var UNIT_CHOICES = ["1", "m", "cm", "km", "s", "min", "h", "kg", "g", "m/s", "m/s²", "m²"];
  var READ_DIGITS = 8;

  /* 出厂示例：自由落体，取值与逐步复算写在设计文档 §5。 */
  var state = {
    example: true,
    result: "s",
    resultName: "位移",
    expression: "0.5*g*t^2",
    known: {
      g: { raw: "9.80665", value: 9.80665, unit: "m/s²", name: "重力加速度" },
      t: { raw: "2.4", value: 2.4, unit: "s", name: "时间" }
    },
    precision: 2,
    editing: null,
    caret: null,
    changed: null
  };

  var els = {};

  function node(tag, cls, text) {
    var out = document.createElement(tag);
    if (cls) out.className = cls;
    if (text !== undefined && text !== null) out.textContent = String(text);
    return out;
  }
  function clear(target) { while (target.firstChild) target.removeChild(target.firstChild); }
  function unitText(unit) { return unit === "1" ? "" : E.UNITS[unit].label; }
  function reading(value) { return E.formatNumber(value, READ_DIGITS); }

  function tokensOf(expr) {
    var tokens = E.tokenize(expr);
    return tokens.slice(0, tokens.length - 1);
  }
  function serialize(tokens) {
    return tokens.map(function (token) {
      if (token.type === "number") return token.raw;
      if (token.type === "name") return token.value;
      return token.type;
    }).join("");
  }
  function valueToken(token) {
    return token && (token.type === "number" || token.type === "name" || token.type === ")");
  }
  function symbolsIn(expr) {
    var tokens;
    try { tokens = tokensOf(expr); } catch (error) { return []; }
    var out = [], seen = {};
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.type !== "name") continue;
      if (tokens[i + 1] && tokens[i + 1].type === "(") continue;
      if (BUILTINS.indexOf(token.value) >= 0) continue;
      if (!seen[token.value]) { seen[token.value] = true; out.push(token.value); }
    }
    return out;
  }
  function syncKnown() {
    symbolsIn(state.expression).forEach(function (name) {
      if (!state.known[name]) state.known[name] = { raw: "1", value: 1, unit: "1", name: "" };
    });
  }
  function variables() {
    var out = {};
    symbolsIn(state.expression).forEach(function (name) {
      var known = state.known[name];
      if (known) out[name] = { value: known.value, unit: known.unit === "1" ? "" : known.unit };
    });
    return out;
  }

  /* ---------- 把表达式写成可读的公式文字 ---------- */

  function displayText(expr, withValues) {
    var tokens;
    try { tokens = tokensOf(expr); } catch (error) { return String(expr); }
    var out = "";
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var next = tokens[i + 1];
      if (token.type === "number") { out += token.raw; continue; }
      if (token.type === "name") {
        var known = withValues ? state.known[token.value] : null;
        if (known && symbolsIn(state.expression).indexOf(token.value) >= 0) {
          var shown = reading(known.value) + (unitText(known.unit) ? " " + unitText(known.unit) : "");
          out += next && next.type === "^" ? "(" + shown + ")" : shown;
        } else {
          out += token.value;
        }
        continue;
      }
      if (token.type === "^") {
        if (next && next.type === "number" && (next.raw === "2" || next.raw === "3")) {
          out += E.exponentLabel(Number(next.raw));
          i++;
        } else {
          out += "^";
        }
        continue;
      }
      if (token.type === "*") { out += " × "; continue; }
      if (token.type === "/") { out += " ÷ "; continue; }
      if (token.type === "+") { out += " + "; continue; }
      if (token.type === "-") { out += valueToken(tokens[i - 1]) ? " − " : "−"; continue; }
      out += token.type;
    }
    return out;
  }

  function paint(target, text) {
    String(text).split(/([×÷+−^(),])/).forEach(function (chunk) {
      if (!chunk) return;
      target.appendChild(node("span", /^[×÷+−^(),]$/.test(chunk) ? "op" : "term", chunk));
    });
  }

  /* ---------- 把原式拆成一条从上往下生长的推导 ---------- */

  function splitTop(tokens, operators) {
    var parts = [], depth = 0, start = 0, op = null;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.type === "(") { depth++; continue; }
      if (token.type === ")") { depth--; continue; }
      if (depth !== 0 || operators.indexOf(token.type) < 0) continue;
      if (!valueToken(tokens[i - 1])) continue;
      parts.push({ op: op, tokens: tokens.slice(start, i) });
      op = token.type;
      start = i + 1;
    }
    if (!parts.length) return null;
    parts.push({ op: op, tokens: tokens.slice(start) });
    return parts;
  }
  function isAtomic(tokens) {
    return tokens.length === 1 && (tokens[0].type === "number" || tokens[0].type === "name");
  }
  function joinParts(parts) {
    return parts.map(function (part, index) {
      return (index === 0 ? "" : part.op) + serialize(part.tokens);
    }).join("");
  }
  function pieceNote(tokens) {
    if (tokens.length === 3 && tokens[1].type === "^" && tokens[2].type === "number") {
      if (tokens[2].raw === "2") return "平方";
      if (tokens[2].raw === "3") return "立方";
      return "取 " + tokens[2].raw + " 次幂";
    }
    if (tokens[0] && tokens[0].type === "name" && tokens[1] && tokens[1].type === "(") {
      return "先算 " + tokens[0].value + " 这一项";
    }
    return "先算这一项";
  }
  function stepNote(op, partText) {
    if (op === "/") return "除以 " + partText;
    if (op === "+") return "加上 " + partText;
    if (op === "-") return "减去 " + partText;
    return "乘上 " + partText;
  }

  function buildRows() {
    syncKnown();
    var vars = variables();
    var symbols = symbolsIn(state.expression);
    var rows = [{ kind: "knowns" }];

    rows.push({
      kind: "origin",
      lhs: state.result,
      rhs: displayText(state.expression, false),
      note: "原式",
      deps: []
    });

    var tokens = null;
    try {
      tokens = tokensOf(state.expression);
    } catch (error) {
      rows.push({ kind: "broken", lhs: state.result, error: error.message, deps: symbols });
      return rows;
    }

    symbols.forEach(function (name) {
      var known = state.known[name];
      var unit = known && known.unit !== "1" ? E.UNITS[known.unit] : null;
      if (!unit || unit.factor === 1) return;
      var baseName = E.unitNameFor(unit.dimension);
      if (!baseName) return;
      try {
        var converted = E.convertUnit(known.value, known.unit, baseName);
        rows.push({
          kind: "line",
          lhs: name,
          rhs: reading(known.value) + " " + unit.label + " = " + reading(converted.value) + " " + E.UNITS[baseName].label,
          note: "单位换算",
          deps: [name]
        });
      } catch (error) {
        rows.push({ kind: "broken", lhs: name, error: error.message, deps: [name] });
      }
    });

    rows.push({
      kind: "line",
      lhs: state.result,
      rhs: displayText(state.expression, true),
      note: "代入",
      deps: symbols
    });

    var parts = splitTop(tokens, ["+", "-"]) || splitTop(tokens, ["*", "/"]);
    var seen = {};
    function addValueRow(expr, note) {
      if (seen[expr]) return;
      seen[expr] = true;
      rows.push({
        kind: "value",
        expr: expr,
        lhs: displayText(expr, false),
        note: note,
        deps: symbolsIn(expr)
      });
    }

    if (parts) {
      parts.forEach(function (part) {
        if (isAtomic(part.tokens)) return;
        var expr = serialize(part.tokens);
        addValueRow(expr, pieceNote(part.tokens));
      });
      var pureProduct = parts.slice(1).every(function (part) { return part.op === "*"; });
      if (pureProduct) {
        for (var i = parts.length - 2; i >= 0; i--) {
          addValueRow(joinParts(parts.slice(i)), stepNote("*", displayText(serialize(parts[i].tokens), false)));
        }
      } else {
        for (var j = 1; j < parts.length; j++) {
          addValueRow(joinParts(parts.slice(0, j + 1)), stepNote(parts[j].op, displayText(serialize(parts[j].tokens), false)));
        }
      }
    }
    addValueRow(state.expression, "算出结果");

    var failure = null;
    rows.forEach(function (row) {
      if (!row.expr || failure) return;
      try {
        var got = E.evaluate(row.expr, vars);
        row.value = got.value;
        row.dimension = got.dimension;
        row.unit = E.unitLabel(got.dimension);
      } catch (error) {
        row.error = error.message;
        failure = row;
      }
    });
    if (failure) return rows.slice(0, rows.indexOf(failure) + 1);

    var tail = rows[rows.length - 1];
    var unitName = E.unitNameFor(tail.dimension);
    if (unitName) {
      try {
        var step = E.createStep({
          basis: "近似",
          expression: state.expression,
          variables: vars,
          outputUnit: unitName,
          precision: state.precision,
          expectedDimension: tail.dimension
        });
        rows.push({
          kind: "value",
          approx: true,
          lhs: state.result,
          value: step.value,
          unit: E.unitLabel(tail.dimension),
          slip: step.error,
          note: "近似到 " + state.precision + " 位小数",
          deps: symbolsIn(state.expression)
        });
      } catch (error) { /* 近似不成立时就让链尾停在精确值 */ }
    }
    return rows;
  }

  /* ---------- 原位编辑：控件隐在公式里 ---------- */

  function beginEdit(kind, symbol, caret) {
    state.editing = { kind: kind, symbol: symbol };
    state.caret = caret === undefined ? null : caret;
    render();
  }
  function endEdit() {
    state.editing = null;
    state.caret = null;
    render();
  }
  function editKeys(input) {
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        endEdit();
      }
    });
    input.addEventListener("blur", function () {
      if (state.editing) endEdit();
    });
  }
  function editInput(value, size, label) {
    var input = document.createElement("input");
    input.type = "text";
    input.className = "inline-input";
    input.value = value;
    input.size = size;
    input.spellcheck = false;
    input.setAttribute("aria-label", label);
    input.id = "editing-now";
    editKeys(input);
    return input;
  }
  function touchable(text, cls, onOpen, label) {
    var button = node("button", "touch " + cls);
    button.type = "button";
    button.setAttribute("aria-label", label);
    paint(button, text);
    button.addEventListener("click", onOpen);
    return button;
  }

  function unitSelect(known, symbol) {
    var select = document.createElement("select");
    select.className = "inline-input inline-unit";
    select.setAttribute("aria-label", symbol + " 的单位");
    select.id = "editing-unit";
    UNIT_CHOICES.forEach(function (unit) {
      var option = document.createElement("option");
      option.value = unit;
      option.textContent = unit === "1" ? "无量纲" : E.UNITS[unit].label;
      if (unit === known.unit) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      known.unit = select.value;
      state.example = false;
      state.changed = symbol;
      state.editing = { kind: "unit", symbol: symbol };
      render();
    });
    editKeys(select);
    return select;
  }

  function renderKnowns(cell) {
    var symbols = symbolsIn(state.expression);
    if (state.example) cell.appendChild(node("span", "example-tag", "示例 · 自由落体"));
    var ask = node("span", "known-ask");
    ask.appendChild(node("span", "known-word", "求"));
    if (state.resultName) ask.appendChild(node("span", "known-name", state.resultName));
    ask.appendChild(node("span", "known-symbol", state.result));
    cell.appendChild(ask);
    if (!symbols.length) return;
    cell.appendChild(node("span", "known-word", "已知"));
    symbols.forEach(function (symbol) {
      var known = state.known[symbol];
      var item = node("span", "known");
      if (known.name) item.appendChild(node("span", "known-name", known.name));
      item.appendChild(node("span", "known-symbol", symbol));
      item.appendChild(node("span", "op", "="));
      var editing = state.editing && state.editing.symbol === symbol;
      if (editing) {
        var input = editInput(known.raw, Math.max(4, String(known.raw).length + 1), symbol + " 的值");
        input.addEventListener("input", function () {
          known.raw = input.value;
          known.value = Number(input.value);
          state.example = false;
          state.changed = symbol;
          state.caret = input.selectionStart;
          state.editing = { kind: "value", symbol: symbol };
          render();
        });
        item.appendChild(input);
        item.appendChild(unitSelect(known, symbol));
      } else {
        item.appendChild(touchable(
          reading(known.value) + (unitText(known.unit) ? " " + unitText(known.unit) : ""),
          "touch-value",
          function () { beginEdit("value", symbol, String(known.raw).length); },
          "改 " + symbol + " 的数与单位"
        ));
      }
      cell.appendChild(item);
    });
  }

  function renderOrigin(row, cells) {
    if (state.editing && state.editing.kind === "result") {
      var name = editInput(state.result, 4, "要求的量");
      name.addEventListener("input", function () {
        state.result = name.value.trim() || "结果";
        state.resultName = "";
        state.example = false;
        state.caret = name.selectionStart;
        render();
      });
      cells.lhs.appendChild(name);
    } else {
      cells.lhs.appendChild(touchable(row.lhs, "touch-lhs", function () {
        beginEdit("result", null, String(state.result).length);
      }, "改要求的量"));
    }
    if (state.editing && state.editing.kind === "expression") {
      var expr = editInput(state.expression, Math.max(18, state.expression.length + 2), "原式右边");
      expr.addEventListener("input", function () {
        state.expression = expr.value;
        state.example = false;
        state.changed = null;
        state.caret = expr.selectionStart;
        render();
      });
      cells.rhs.appendChild(expr);
    } else {
      cells.rhs.appendChild(touchable(row.rhs, "touch-rhs", function () {
        beginEdit("expression", null, state.expression.length);
      }, "改原式"));
    }
  }

  function renderPrecision(cell, row) {
    if (state.editing && state.editing.kind === "precision") {
      var input = editInput(String(state.precision), 3, "近似到几位小数");
      input.addEventListener("input", function () {
        var digits = Math.round(Number(input.value));
        if (isFinite(digits) && digits >= 0 && digits <= 12) state.precision = digits;
        state.caret = input.selectionStart;
        state.editing = { kind: "precision" };
        render();
      });
      cell.appendChild(node("span", "note-word", "近似到"));
      cell.appendChild(input);
      cell.appendChild(node("span", "note-word", "位小数"));
      return;
    }
    cell.appendChild(touchable(row.note, "touch-note", function () {
      beginEdit("precision", null, String(state.precision).length);
    }, "改近似的小数位数"));
  }

  function render() {
    var rows = buildRows();
    clear(els.chain);
    var order = 0;
    rows.forEach(function (row) {
      if (row.kind === "knowns") {
        var wide = node("div", "knowns");
        renderKnowns(wide);
        els.chain.appendChild(wide);
        return;
      }
      var relit = state.changed && row.deps && row.deps.indexOf(state.changed) >= 0;
      var cells = {
        lhs: node("div", "lhs"),
        eq: node("div", "eq", row.approx ? "≈" : "="),
        rhs: node("div", "rhs"),
        note: node("div", "note")
      };
      if (row.error) cells.eq.dataset.broken = "yes";
      if (row.kind === "value" && rows.indexOf(row) === rows.length - 1) cells.rhs.classList.add("tail");

      if (row.kind === "origin") {
        renderOrigin(row, cells);
        cells.note.appendChild(node("span", "note-word", row.note));
      } else {
        paint(cells.lhs, row.lhs);
        if (row.error) {
          cells.rhs.appendChild(node("span", "broken", row.error));
        } else if (row.rhs !== undefined) {
          paint(cells.rhs, row.rhs);
        } else {
          paint(cells.rhs, reading(row.value) + (row.unit ? " " + row.unit : ""));
          if (row.slip !== undefined && row.slip !== null) {
            cells.rhs.appendChild(node("span", "slip", "绝对误差 " + reading(row.slip) + (row.unit ? " " + row.unit : "")));
          }
        }
        if (row.approx) renderPrecision(cells.note, row);
        else if (row.note) cells.note.appendChild(node("span", "note-word", row.note));
      }

      ["lhs", "eq", "rhs", "note"].forEach(function (key) {
        if (relit) {
          cells[key].classList.add("relit");
          cells[key].style.animationDelay = (order * 90) + "ms";
        }
        els.chain.appendChild(cells[key]);
      });
      if (relit) order++;
    });

    renderAffected(rows);
    if (state.editing) {
      var live = document.getElementById(state.editing.kind === "unit" ? "editing-unit" : "editing-now");
      if (live) {
        live.focus();
        if (state.caret !== null && live.setSelectionRange) {
          try { live.setSelectionRange(state.caret, state.caret); } catch (error) { /* select 不支持光标 */ }
        }
      }
    }
    drawGuide();
  }

  function renderAffected(rows) {
    if (!state.changed) { els.affected.hidden = true; clear(els.affected); return; }
    var known = state.known[state.changed];
    var label = (known && known.name ? known.name + " " : "") + state.changed;
    var touched = [], untouched = [];
    rows.forEach(function (row) {
      if (row.kind !== "line" && row.kind !== "value" && row.kind !== "broken") return;
      var name = row.note || row.lhs;
      if (row.deps && row.deps.indexOf(state.changed) >= 0) touched.push(name);
      else untouched.push(row.lhs);
    });
    clear(els.affected);
    var sentence = "改了 " + label + "：" + touched.join("、") + " 依次重算";
    sentence += untouched.length ? "；" + untouched.join("、") + " 没有变。" : "。";
    els.affected.appendChild(node("span", null, sentence));
    els.affected.hidden = false;
  }

  /* 引导线连各行等号的真实位置，长式换行后重新测量，出错的一行就此断开。 */
  function drawGuide() {
    var base = els.wrap.getBoundingClientRect();
    var marks = Array.prototype.slice.call(els.chain.querySelectorAll(".eq"));
    var path = "";
    for (var i = 0; i < marks.length - 1; i++) {
      if (marks[i].dataset.broken || marks[i + 1].dataset.broken) continue;
      var from = marks[i].getBoundingClientRect();
      var to = marks[i + 1].getBoundingClientRect();
      path += "M" + Math.round(from.left - base.left + from.width / 2) + " " + Math.round(from.bottom - base.top + 2);
      path += "L" + Math.round(to.left - base.left + to.width / 2) + " " + Math.round(to.top - base.top - 2) + " ";
    }
    els.guide.setAttribute("width", Math.round(base.width));
    els.guide.setAttribute("height", Math.round(base.height));
    els.guide.setAttribute("viewBox", "0 0 " + Math.round(base.width) + " " + Math.round(base.height));
    els.guidePath.setAttribute("d", path.trim());
  }

  function mount() {
    els.chain = document.getElementById("chain");
    els.wrap = document.getElementById("chain-wrap");
    els.guide = document.getElementById("guide");
    els.guidePath = document.getElementById("guide-path");
    els.affected = document.getElementById("affected");
    window.addEventListener("resize", drawGuide);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
