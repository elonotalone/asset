(function () {
  "use strict";

  var E = window.ContractAssemblyEngine;

  var NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  var DEED_TITLES = {
    "软件开发外包": "软件开发外包合同",
    "市场顾问服务": "市场顾问服务合同",
    "设备采购": "设备采购合同",
    "其他": "合作协议"
  };

  // 双方主体名与签署日期不在条款库里，但用户必须能在正文里读到它们，
  // 所以放进抬头段，值同样存在 state.values（内核忽略它不认识的键）。
  var PARTY_FIELDS = [
    { key: "partyA", label: "委托方全称", type: "text" },
    { key: "partyB", label: "服务方全称", type: "text" },
    { key: "signDate", label: "签署日期", type: "text" }
  ];

  var state = E.createState();
  var dependencyNotes = {};
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

  function raw(key) {
    var value = state.values[key];
    return value === undefined || value === null ? "" : String(value);
  }

  function filled(key) {
    return E.hasValue(state.values, key);
  }

  function selectedClauses() {
    return E.CLAUSES.filter(function (clause) { return state.selected.indexOf(clause.id) >= 0; });
  }

  function shown(variable) {
    var value = raw(variable.key);
    if (!value) return "";
    if (variable.type === "amount" || variable.type === "percentage" || variable.type === "number") {
      return E.formatVariable(variable.type, value) || value;
    }
    return value;
  }

  function unreadableNumber(variable) {
    if (variable.type !== "amount" && variable.type !== "percentage" && variable.type !== "number") return false;
    return filled(variable.key) && E.formatVariable(variable.type, raw(variable.key)) === "";
  }

  function write(key, value) {
    state = E.setVariable(state, key, value);
    syncEchoes();
    updateHeadline();
  }

  function syncEchoes() {
    var echoes = document.querySelectorAll("[data-echo]");
    for (var i = 0; i < echoes.length; i++) {
      var key = echoes[i].getAttribute("data-echo");
      echoes[i].textContent = raw(key);
    }
  }

  function blank(variable) {
    if (variable.type === "single" || variable.type === "boolean") {
      var select = el("select", "fill fill-choice");
      var head = el("option", null, variable.label);
      head.value = "";
      select.appendChild(head);
      var options = variable.type === "boolean" ? ["是", "否"] : (variable.options || []);
      options.forEach(function (name) {
        var option = el("option", null, name);
        option.value = variable.type === "boolean" ? (name === "是" ? "true" : "false") : name;
        select.appendChild(option);
      });
      select.value = raw(variable.key);
      select.setAttribute("data-variable", variable.key);
      select.setAttribute("aria-label", variable.label);
      select.addEventListener("change", function () {
        select.classList.toggle("is-empty", !select.value);
        write(variable.key, select.value);
      });
      if (!filled(variable.key)) select.classList.add("is-empty");
      return select;
    }

    var span = el("span", "fill");
    span.setAttribute("contenteditable", "true");
    span.setAttribute("role", "textbox");
    span.setAttribute("data-variable", variable.key);
    span.setAttribute("data-label", variable.label);
    span.setAttribute("aria-label", variable.label);
    span.textContent = shown(variable);
    span.classList.toggle("is-unreadable", unreadableNumber(variable));
    span.addEventListener("input", function () {
      write(variable.key, span.textContent.replace(/\s+/g, " ").trim());
      span.classList.toggle("is-unreadable", unreadableNumber(variable));
    });
    // 金额与百分比在离开这个空位时才补成两位小数，写的时候不跟用户的光标抢字。
    span.addEventListener("blur", function () {
      var text = shown(variable);
      if (span.textContent.trim() !== text) span.textContent = text;
      updateHeadline();
    });
    return span;
  }

  function sentence(clause) {
    var body = el("p", "clause-body");
    var variables = {};
    (clause.variables || []).forEach(function (variable) { variables[variable.key] = variable; });
    var pattern = /\{\{([^}]+)\}\}/g;
    var cursor = 0;
    var match = pattern.exec(clause.text);
    while (match) {
      if (match.index > cursor) body.appendChild(document.createTextNode(clause.text.slice(cursor, match.index)));
      var variable = variables[match[1]];
      body.appendChild(variable ? blank(variable) : document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
      match = pattern.exec(clause.text);
    }
    if (cursor < clause.text.length) body.appendChild(document.createTextNode(clause.text.slice(cursor)));
    return body;
  }

  function marginNotes(clause) {
    var notes = [];
    if (dependencyNotes[clause.id]) notes.push(dependencyNotes[clause.id]);
    (clause.depends || []).forEach(function (dependency) {
      if (state.selected.indexOf(dependency.id) < 0) {
        var base = E.clauseById(dependency.id);
        notes.push("正文里现在没有「" + (base ? base.title : dependency.id) + "」：" + dependency.reason);
      }
    });
    (clause.excludes || []).forEach(function (exclusion) {
      if (state.selected.indexOf(exclusion.id) < 0) {
        var other = E.clauseById(exclusion.id);
        notes.push("已排除「" + (other ? other.title : exclusion.id) + "」：" + exclusion.reason);
      }
    });
    if (clause.riskWeight < 0) notes.push("条款库把这一条标为对己方不利。");
    return notes;
  }

  function clauseBlock(clause, index) {
    var section = el("section", "clause");
    section.setAttribute("data-clause", clause.id);

    var title = el("h2", "clause-title", NUMERALS[index] + "、" + clause.title);
    section.appendChild(title);
    section.appendChild(sentence(clause));

    var aside = el("div", "clause-aside");
    var drop = el("button", "quiet", "取下这一条");
    drop.type = "button";
    drop.setAttribute("data-drop", clause.id);
    drop.addEventListener("click", function () {
      state = E.deselectClause(state, clause.id);
      delete dependencyNotes[clause.id];
      render();
    });
    aside.appendChild(drop);
    marginNotes(clause).forEach(function (note) {
      aside.appendChild(el("p", "margin-note", note));
    });
    section.appendChild(aside);
    return section;
  }

  function deedBlock() {
    var section = el("section", "clause deed-block");
    var title = el("h1", "deed", DEED_TITLES[state.transaction] || state.transaction);
    section.appendChild(title);

    var lead = el("p", "clause-body preamble");
    lead.appendChild(document.createTextNode("本合同由 "));
    lead.appendChild(blank(PARTY_FIELDS[0]));
    lead.appendChild(document.createTextNode("（以下称委托方）与 "));
    lead.appendChild(blank(PARTY_FIELDS[1]));
    lead.appendChild(document.createTextNode("（以下称服务方）于 "));
    lead.appendChild(blank(PARTY_FIELDS[2]));
    lead.appendChild(document.createTextNode(" 订立，双方就下列事项达成一致："));
    section.appendChild(lead);

    var aside = el("div", "clause-aside");
    var change = el("button", "quiet", "换一种交易");
    change.type = "button";
    change.id = "change-transaction";
    change.addEventListener("click", function () {
      state.transaction = "";
      render();
    });
    aside.appendChild(change);
    section.appendChild(aside);
    return section;
  }

  function candidates() {
    var missing = {};
    E.missingCriticalCategories(state).forEach(function (category) { missing[category.id] = true; });
    var open = [];
    var blocked = [];
    E.CLAUSES.forEach(function (clause) {
      if (state.selected.indexOf(clause.id) >= 0) return;
      var available = E.availability(state, clause.id);
      if (available.mutuallyExclusive) blocked.push({ clause: clause, reason: available.reason });
      else open.push(clause);
    });
    open.sort(function (a, b) {
      var weight = (missing[b.category] ? 1 : 0) - (missing[a.category] ? 1 : 0);
      if (weight) return weight;
      return E.CLAUSES.indexOf(a) - E.CLAUSES.indexOf(b);
    });
    return { open: open, blocked: blocked };
  }

  function nextSlot() {
    var list = candidates();
    var slot = el("section", "clause next-slot");
    if (!list.open.length && !list.blocked.length) return slot;

    var ask = el("p", "ask");
    ask.appendChild(el("span", "ask-q", state.selected.length ? "接下来把哪一条写进合同" : "第一条写进合同的是"));
    var picks = el("span", "picks");
    list.open.forEach(function (clause) {
      var pick = el("button", "pick", clause.title);
      pick.type = "button";
      pick.setAttribute("data-add", clause.id);
      pick.addEventListener("click", function () {
        var result = E.selectClause(state, clause.id);
        state = result.state;
        result.reasons.forEach(function (reason) {
          if (reason.type === "dependency") {
            var source = E.clauseById(clause.id);
            dependencyNotes[reason.clauseId] = "随「" + (source ? source.title : clause.id) + "」一起落进正文：" + reason.reason;
          }
        });
        render();
      });
      picks.appendChild(pick);
    });
    ask.appendChild(picks);
    slot.appendChild(ask);

    if (list.blocked.length) {
      var aside = el("div", "clause-aside");
      list.blocked.forEach(function (item) {
        aside.appendChild(el("p", "margin-note", "「" + item.clause.title + "」现在不能加：" + item.reason));
      });
      slot.appendChild(aside);
    }
    return slot;
  }

  function signature() {
    var block = el("section", "clause sign-block");
    var body = el("div", "sign");
    [
      { label: "委托方（盖章）", key: "partyA" },
      { label: "服务方（盖章）", key: "partyB" },
      { label: "签署日期", key: "signDate" }
    ].forEach(function (row) {
      var line = el("p", "sign-line");
      line.appendChild(el("span", "sign-key", row.label));
      var echo = el("span", "sign-value", raw(row.key));
      echo.setAttribute("data-echo", row.key);
      line.appendChild(echo);
      body.appendChild(line);
    });
    block.appendChild(body);
    return block;
  }

  function opening() {
    var ask = el("p", "ask ask-open");
    ask.appendChild(el("span", "ask-q", "这是一笔什么交易"));
    var picks = el("span", "picks");
    E.TRANSACTIONS.forEach(function (name) {
      var pick = el("button", "pick", name);
      pick.type = "button";
      pick.setAttribute("data-transaction", name);
      pick.addEventListener("click", function () {
        state.transaction = name;
        render();
      });
      picks.appendChild(pick);
    });
    ask.appendChild(picks);
    return ask;
  }

  function pendingBlanks() {
    var seen = {};
    var out = [];
    PARTY_FIELDS.forEach(function (field) {
      if (!filled(field.key)) {
        seen[field.key] = true;
        out.push(field);
      }
    });
    selectedClauses().forEach(function (clause) {
      (clause.variables || []).forEach(function (variable) {
        if (!seen[variable.key] && !filled(variable.key)) {
          seen[variable.key] = true;
          out.push(variable);
        }
      });
    });
    return out;
  }

  function unreadableBlanks() {
    var out = [];
    selectedClauses().forEach(function (clause) {
      (clause.variables || []).forEach(function (variable) {
        if (unreadableNumber(variable)) out.push(variable);
      });
    });
    return out;
  }

  function brokenDependency() {
    var found = null;
    selectedClauses().forEach(function (clause) {
      (clause.depends || []).forEach(function (dependency) {
        if (!found && state.selected.indexOf(dependency.id) < 0) {
          var base = E.clauseById(dependency.id);
          found = "「" + clause.title + "」少了它依赖的「" + (base ? base.title : dependency.id) + "」。";
        }
      });
    });
    return found;
  }

  function headlineText() {
    if (!state.transaction) return "";
    var unreadable = unreadableBlanks();
    if (unreadable.length) return "「" + unreadable[0].label + "」现在不是一个数字。";
    var pending = pendingBlanks();
    if (pending.length) {
      return "「" + pending[0].label + "」还是空的" +
        (pending.length > 1 ? "，后面还有 " + (pending.length - 1) + " 处空位。" : "。");
    }
    if (!state.selected.length) return "";
    var broken = brokenDependency();
    if (broken) return broken;
    var missing = E.missingCriticalCategories(state);
    if (missing.length) {
      return "还没有" + missing.map(function (category) { return category.label; }).join("、") + "条款。";
    }
    if (E.conflicts(state).length) return E.conflicts(state)[0].reason;
    return "这份合同可以从头通读，再交给对方。";
  }

  function updateHeadline() {
    els.headline.textContent = headlineText();
  }

  function render() {
    clear(els.sheet);
    if (!state.transaction) {
      els.sheet.appendChild(opening());
      updateHeadline();
      return;
    }
    els.sheet.appendChild(deedBlock());
    selectedClauses().forEach(function (clause, index) {
      els.sheet.appendChild(clauseBlock(clause, index));
    });
    els.sheet.appendChild(nextSlot());
    if (state.selected.length) els.sheet.appendChild(signature());
    updateHeadline();
  }

  function mount() {
    els.sheet = document.getElementById("sheet");
    els.headline = document.getElementById("headline");
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
