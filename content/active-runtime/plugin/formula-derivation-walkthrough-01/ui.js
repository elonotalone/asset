(function () {
  "use strict";

  var engine = globalThis.FormulaWalkthroughEngine;
  var symbols = Object.create(null);
  var steps = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function unitText(unit) {
    return unit === "1" ? "无量纲" : unit;
  }

  function setMessage(target, message, isError) {
    target.textContent = message || "";
    target.classList.toggle("is-error", Boolean(isError));
  }

  function renderSymbols() {
    var list = byId("symbol-list");
    list.replaceChildren();
    var names = Object.keys(symbols);
    names.forEach(function (name) {
      var symbol = symbols[name];
      var row = node("div", "symbol-row");
      row.append(
        node("span", "symbol-name", name),
        node("span", "symbol-value", engine.formatNumber(symbol.value, 8)),
        node("span", "symbol-unit", unitText(symbol.unit))
      );
      list.appendChild(row);
    });
    byId("symbol-count").textContent = names.length + " 个量";
    byId("symbol-empty").hidden = names.length > 0;
    byId("step-form").hidden = names.length === 0;
  }

  function renderSteps() {
    var list = byId("step-list");
    list.replaceChildren();
    steps.forEach(function (step, index) {
      var row = node("li", "step-row");
      var main = node("div", "step-main");
      main.append(
        node("code", "", step.expression),
        node("p", "", step.basis + " · " + step.explanation)
      );
      row.append(
        node("span", "step-index", "第 " + (index + 1) + " 步"),
        main,
        node(
          "strong",
          "step-number",
          engine.formatNumber(step.value) + " " + unitText(step.outputUnit)
        )
      );
      list.appendChild(row);
    });

    byId("step-count").textContent = steps.length + " 步";
    byId("step-empty").hidden = steps.length > 0;
    byId("current-result").hidden = steps.length === 0;
    if (steps.length) {
      var current = steps[steps.length - 1];
      byId("current-value").textContent =
        engine.formatNumber(current.value) + " " + unitText(current.outputUnit);
      byId("current-basis").textContent = current.basis + " · " + current.explanation;
    }
  }

  byId("symbol-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var name = byId("symbol-name").value.trim();
    var value = Number(byId("symbol-value").value);
    var unit = byId("symbol-unit").value;
    var message = byId("symbol-message");

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setMessage(message, "符号须以英文字母或下划线开头。", true);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(symbols, name)) {
      setMessage(message, "符号“" + name + "”已经存在。", true);
      return;
    }
    if (!Number.isFinite(value)) {
      setMessage(message, "数值必须是有限数字。", true);
      return;
    }

    symbols[name] = { value: value, unit: unit };
    renderSymbols();
    setMessage(message, "已加入 “" + name + "”，现在可以写第一步。", false);
    byId("symbol-name").value = "";
    byId("symbol-value").value = "";
    byId("symbol-unit").value = "1";
    byId("step-expression").focus();
  });

  byId("step-basis").addEventListener("change", function () {
    byId("precision-field").hidden = byId("step-basis").value !== "近似";
  });

  byId("step-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var basis = byId("step-basis").value;
    var outputUnit = byId("step-unit").value;
    var spec = {
      basis: basis,
      expression: byId("step-expression").value.trim(),
      variables: symbols,
      outputUnit: outputUnit
    };
    if (basis === "单位换算") {
      if (!steps.length) {
        setMessage(byId("step-message"), "单位换算前必须先有一步可追溯的结果。", true);
        return;
      }
      spec.previousUnit = steps[steps.length - 1].outputUnit;
    }
    if (basis === "近似") spec.precision = Number(byId("step-precision").value);

    try {
      var step = engine.createStep(spec);
      steps.push(step);
      renderSteps();
      setMessage(byId("step-message"), "第 " + steps.length + " 步已写入。", false);
      byId("step-expression").value = "";
    } catch (error) {
      setMessage(byId("step-message"), error && error.message ? error.message : String(error), true);
    }
  });

  byId("run-test").addEventListener("click", function () {
    var result = engine.runSelfTest();
    byId("test-out").textContent = result.passed + " / " + result.total + " 通过";
  });

  renderSymbols();
  renderSteps();
})();
