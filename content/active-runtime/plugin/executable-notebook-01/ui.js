(function () {
  "use strict";

  var engine = globalThis.ExecutableNotebookEngine;
  var parameters = Object.create(null);
  var cells = [];
  var lastRun = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function setMessage(message, isError) {
    var target = byId("notebook-message");
    target.textContent = message || "";
    target.classList.toggle("is-error", Boolean(isError));
  }

  function validName(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  }

  function nameExists(name) {
    return Object.prototype.hasOwnProperty.call(parameters, name)
      || cells.some(function (cell) { return cell.name === name; });
  }

  function typeText(type) {
    if (type === "text") return "说明文字";
    if (type === "assertion") return "断言";
    return "表达式";
  }

  function currentSpec() {
    return {
      baselineDate: byId("baseline-date").value.trim(),
      parameters: parameters,
      cells: cells
    };
  }

  function safeDependencies(cell) {
    if (cell.type === "text") return [];
    try { return engine.referencesOf(cell.content); } catch (_error) { return []; }
  }

  function dependencyCount() {
    if (lastRun) return lastRun.dependencyCount;
    return cells.reduce(function (total, cell) {
      return total + safeDependencies(cell).length;
    }, 0);
  }

  function resultText(cell) {
    if (!lastRun || !lastRun.results[cell.name]) return "等待修复";
    var result = lastRun.results[cell.name];
    if (result.type === "text") return "说明文字";
    if (result.type === "assertion") return result.passed ? "通过" : "未通过";
    return engine.formatValue(result.value);
  }

  function renderParameters() {
    var list = byId("parameter-list");
    list.replaceChildren();
    var names = Object.keys(parameters);
    names.forEach(function (name) {
      var row = node("div", "parameter-row");
      var label = node("span", "parameter-name", name);
      var input = node("input", "parameter-editor");
      input.value = String(parameters[name]);
      input.setAttribute("inputmode", "decimal");
      input.setAttribute("aria-label", "修改参数 " + name);
      input.setAttribute("data-parameter", name);
      input.addEventListener("change", function () {
        var value = Number(input.value);
        if (!Number.isFinite(value)) {
          byId("parameter-message").textContent = "参数“" + name + "”必须是有限数字。";
          byId("parameter-message").classList.add("is-error");
          input.value = String(parameters[name]);
          return;
        }
        parameters[name] = value;
        byId("parameter-message").textContent = "已更新 “" + name + "”。";
        byId("parameter-message").classList.remove("is-error");
        runAndRender([name]);
      });
      row.append(label, input);
      list.appendChild(row);
    });
    byId("parameter-count").textContent = names.length + " 个参数";
    byId("parameter-empty").hidden = names.length > 0;
  }

  function renderCells() {
    var list = byId("cell-list");
    list.replaceChildren();
    cells.forEach(function (cell) {
      var deps = lastRun && lastRun.dependencies[cell.name]
        ? lastRun.dependencies[cell.name]
        : safeDependencies(cell);
      var row = node("article", "cell-row");
      var main = node("div", "cell-main");
      var meta = node("div", "cell-meta");
      meta.append(
        node("span", "cell-type", typeText(cell.type)),
        node("strong", "cell-name", cell.name),
        node("span", "cell-deps", deps.length ? "引用 " + deps.join("、") : "无依赖")
      );
      var editor = node("textarea", "cell-editor");
      editor.rows = cell.type === "text" ? 2 : 1;
      editor.value = cell.content;
      editor.setAttribute("aria-label", "编辑格子 " + cell.name);
      editor.setAttribute("data-cell-editor", cell.name);
      editor.addEventListener("change", function () {
        cell.content = editor.value.trim();
        runAndRender();
      });
      main.append(meta, editor);

      var result = node("div", "cell-result");
      result.append(node("span", "", cell.type === "text" ? "用途" : "结果"));
      var value = node("strong", "", resultText(cell));
      if (cell.type === "assertion" && lastRun && lastRun.results[cell.name]
          && !lastRun.results[cell.name].passed) value.className = "failed";
      result.appendChild(value);
      row.append(main, result);
      list.appendChild(row);
    });
    byId("cell-count").textContent = cells.length + " 个格子";
    byId("cell-empty").hidden = cells.length > 0;
  }

  function renderProgress() {
    byId("progress-summary").textContent =
      Object.keys(parameters).length + " 个参数 · " + cells.length + " 个格子 · "
      + dependencyCount() + " 条依赖";
  }

  function renderAll() {
    renderParameters();
    renderCells();
    renderProgress();
  }

  function runAndRender(changed) {
    try {
      var options = lastRun && changed && changed.length
        ? { previous: lastRun, changed: changed }
        : undefined;
      lastRun = engine.runNotebook(currentSpec(), options);
      byId("run-order").textContent = lastRun.order.length
        ? lastRun.order.join(" → ")
        : cells.length ? "没有需要计算的格子" : "尚无格子";
      setMessage(lastRun.order.length ? "重算完成。" : "笔记已同步。", false);
    } catch (error) {
      lastRun = null;
      byId("run-order").textContent = "重算已停止";
      setMessage(error && error.message ? error.message : String(error), true);
    }
    renderAll();
  }

  byId("parameter-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var name = byId("parameter-name").value.trim();
    var value = Number(byId("parameter-value").value);
    var message = byId("parameter-message");
    if (!validName(name)) {
      message.textContent = "名称须以英文字母或下划线开头。";
      message.classList.add("is-error");
      return;
    }
    if (nameExists(name)) {
      message.textContent = "名称“" + name + "”已经存在。";
      message.classList.add("is-error");
      return;
    }
    if (!Number.isFinite(value)) {
      message.textContent = "数值必须是有限数字。";
      message.classList.add("is-error");
      return;
    }
    parameters[name] = value;
    message.textContent = "已加入 “" + name + "”。";
    message.classList.remove("is-error");
    byId("parameter-name").value = "";
    byId("parameter-value").value = "";
    runAndRender();
  });

  byId("cell-type").addEventListener("change", function () {
    var placeholders = {
      expression: "例如 area*rent",
      text: "例如 金额单位为元，租期按整月计算",
      assertion: "例如 totalCost<=budget"
    };
    byId("cell-content").placeholder = placeholders[byId("cell-type").value];
  });

  byId("cell-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var type = byId("cell-type").value;
    var name = byId("cell-name").value.trim();
    var content = byId("cell-content").value.trim();
    if (!validName(name)) {
      setMessage("格子名须以英文字母或下划线开头。", true);
      return;
    }
    if (nameExists(name)) {
      setMessage("名称“" + name + "”已经存在。", true);
      return;
    }
    if (!content) {
      setMessage("格子内容不能为空。", true);
      return;
    }
    cells.push({ name: name, type: type, content: content });
    byId("cell-name").value = "";
    byId("cell-content").value = "";
    runAndRender();
  });

  byId("baseline-date").addEventListener("change", function () {
    runAndRender();
  });

  byId("run-test").addEventListener("click", function () {
    var result = engine.runSelfTest();
    byId("test-out").textContent = result.passed + " / " + result.total + " 通过";
  });

  renderAll();
})();
