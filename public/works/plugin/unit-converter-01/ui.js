/*
 * 换算器 · 界面层
 *
 * 安全（红线，改之前先读 docs/design-guides/plugin/_INDEX.md 末尾两条）：
 *   - 全程 createElement + textContent，**没有一处 innerHTML**。
 *     跨仓扫描器 UC-4-INNER-HTML-ASSIGN 会扫 asset/public/works/**，这里必须是干净的。
 *   - 不碰 localStorage / cookie / parent / top：插件跑在不透明源里，碰了当场抛 SecurityError。
 *   - 不发任何网络请求，不引用任何外部资源。
 */
(function () {
  "use strict";

  var E = window.UnitConverterEngine;

  var state = {
    cat: E.DEFAULT.cat,
    from: E.DEFAULT.from,
    raw: String(E.DEFAULT.value)
  };

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

  /* ---------- 类别 ---------- */

  function buildCategories() {
    clear(els.cats);
    E.CATEGORIES.forEach(function (cat) {
      var b = el("button", "cat", cat.label);
      b.type = "button";
      b.setAttribute("aria-pressed", cat.id === state.cat ? "true" : "false");
      b.addEventListener("click", function () {
        if (state.cat === cat.id) return;
        state.cat = cat.id;
        state.from = cat.units[0].id;
        buildCategories();
        buildUnitPicker();
        render();
      });
      els.cats.appendChild(b);
    });
  }

  function buildUnitPicker() {
    var cat = E.findCategory(state.cat);
    clear(els.from);
    cat.units.forEach(function (u) {
      var o = el("option", null, u.label + "（" + E.symbolOf(u.id) + "）");
      o.value = u.id;
      if (u.id === state.from) o.selected = true;
      els.from.appendChild(o);
    });
  }

  /* ---------- 结果 ---------- */

  function parseValue(raw) {
    var s = String(raw).trim().replace(/[,\s]/g, "");
    if (s === "" || s === "-" || s === "+" || s === ".") return null;
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function render() {
    var cat = E.findCategory(state.cat);
    var value = parseValue(state.raw);

    clear(els.rows);
    clear(els.badInput);

    if (value === null) {
      els.badInput.appendChild(
        document.createTextNode("等一个数。支持小数、负数与 1.5e3 这种写法。")
      );
      return;
    }

    var rows = E.convertAll(state.cat, state.from, value);
    rows.forEach(function (r) {
      var row = el("div", "row");

      row.appendChild(el("span", "name", r.label));
      row.appendChild(el("span", "num", E.format(r.value)));
      row.appendChild(el("span", "sym", r.symbol));

      var fine = el("div", "fine");
      fine.appendChild(
        document.createTextNode(
          "因子 " + E.format(r.factor) + (r.offset ? "，偏移 " + E.format(r.offset) : "") +
          " · 基准 " + r.baseUnit + " · "
        )
      );
      fine.appendChild(
        el("span", r.exact ? "mark-exact" : "mark-approx", r.exact ? "精确" : "近似")
      );
      if (r.note) fine.appendChild(document.createTextNode(" · " + r.note));
      if (r.isSource) {
        fine.appendChild(el("span", "self", " · 这一行就是你输入的量"));
      }
      row.appendChild(fine);

      els.rows.appendChild(row);
    });

    els.basis.textContent =
      "本类基准单位 " + cat.base + "。线性单位按 基准 = 数值 × 因子 换算；" +
      "温度这类仿射单位还要加偏移，反向为（基准 − 偏移）÷ 因子。";
  }

  /* ---------- 自测：跑的是内核自带那张用例表，和 node 自测同一张 ---------- */

  function runTest() {
    var r = E.runSelfTest();
    els.testOut.textContent = r.passed + " / " + r.total + " 通过";
    clear(els.testDetail);
    r.failures.forEach(function (f) {
      els.testDetail.appendChild(el("li", null, f.name + " —— " + f.why));
    });
    if (r.failures.length === 0) {
      els.testDetail.appendChild(
        el("li", null, "期望值全部抄自规格「已查证的知识」，不是回填的。")
      );
    }
  }

  /* ---------- 装配 ---------- */

  function mount() {
    els.cats = document.getElementById("cats");
    els.from = document.getElementById("from");
    els.value = document.getElementById("value");
    els.rows = document.getElementById("rows");
    els.badInput = document.getElementById("bad-input");
    els.basis = document.getElementById("basis");
    els.testOut = document.getElementById("test-out");
    els.testDetail = document.getElementById("test-detail");

    els.value.value = state.raw;

    els.value.addEventListener("input", function () {
      state.raw = els.value.value;
      render();
    });
    els.from.addEventListener("change", function () {
      state.from = els.from.value;
      render();
    });
    document.getElementById("run-test").addEventListener("click", runTest);

    buildCategories();
    buildUnitPicker();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
