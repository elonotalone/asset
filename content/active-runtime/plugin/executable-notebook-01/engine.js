/*
 * 可执行笔记 · 纯计算与依赖图内核
 *
 * 只解析封闭数学表达式；浏览器读取 ExecutableNotebookEngine，node 自测读取同一份字节。
 */
(function (root) {
  "use strict";

  var CELL_TYPES = ["expression", "text", "assertion"];
  var BUILTINS = ["sqrt", "abs", "sin", "cos", "tan", "ln", "log", "exp", "min", "max", "pow", "round"];
  var OVERFLOW_LIMIT = 1e308;

  function NotebookError(code, message, detail) {
    this.name = "NotebookError";
    this.code = code;
    this.message = message;
    if (detail) Object.keys(detail).forEach(function (key) { this[key] = detail[key]; }, this);
    if (Error.captureStackTrace) Error.captureStackTrace(this, NotebookError);
  }
  NotebookError.prototype = Object.create(Error.prototype);
  NotebookError.prototype.constructor = NotebookError;

  function checkedNumber(value, context) {
    if (typeof value !== "number" || !isFinite(value) || Math.abs(value) > OVERFLOW_LIMIT) {
      throw new NotebookError("OVERFLOW", "数值溢出：" + (context || "结果") + "超出可可靠表示的范围。");
    }
    return value;
  }

  function tokenize(source) {
    var text = String(source || "");
    var tokens = [];
    var index = 0;
    while (index < text.length) {
      var char = text.charAt(index);
      if (/\s/.test(char)) {
        index++;
        continue;
      }
      var number = text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) {
        tokens.push({ type: "number", value: Number(number[0]), raw: number[0] });
        index += number[0].length;
        continue;
      }
      var name = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (name) {
        tokens.push({ type: "name", value: name[0] });
        index += name[0].length;
        continue;
      }
      var pair = text.slice(index, index + 2);
      if (["<=", ">=", "==", "!="].indexOf(pair) >= 0) {
        tokens.push({ type: "compare", value: pair });
        index += 2;
        continue;
      }
      if (char === "<" || char === ">") {
        tokens.push({ type: "compare", value: char });
        index++;
        continue;
      }
      if ("+-*/^(),".indexOf(char) >= 0) {
        tokens.push({ type: char, value: char });
        index++;
        continue;
      }
      throw new NotebookError("SYNTAX", "表达式无法解析：第 " + (index + 1) + " 个字符“" + char + "”不受支持。");
    }
    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  function requireNumber(value, label) {
    if (typeof value !== "number") {
      throw new NotebookError("TYPE", (label || "运算") + "只接受数值。");
    }
    return checkedNumber(value, label);
  }

  function requireCount(name, args, minimum, maximum) {
    if (args.length < minimum || args.length > maximum) {
      throw new NotebookError(
        "SYNTAX",
        name + " 的参数个数应为 " + (minimum === maximum ? minimum : minimum + "–" + maximum) + "。"
      );
    }
  }

  function callBuiltin(name, args) {
    var numbers = args.map(function (value) { return requireNumber(value, name); });
    var value;
    if (name === "abs") {
      requireCount(name, numbers, 1, 1);
      value = Math.abs(numbers[0]);
    } else if (name === "sqrt") {
      requireCount(name, numbers, 1, 1);
      if (numbers[0] < 0) throw new NotebookError("DOMAIN", "sqrt 的参数不能为负数。");
      value = Math.sqrt(numbers[0]);
    } else if (name === "sin" || name === "cos" || name === "tan") {
      requireCount(name, numbers, 1, 1);
      value = Math[name](numbers[0]);
    } else if (name === "ln" || name === "log" || name === "exp") {
      requireCount(name, numbers, 1, 1);
      value = name === "ln" ? Math.log(numbers[0]) : name === "log" ? Math.log10(numbers[0]) : Math.exp(numbers[0]);
    } else if (name === "min" || name === "max") {
      requireCount(name, numbers, 1, 64);
      value = Math[name].apply(Math, numbers);
    } else if (name === "pow") {
      requireCount(name, numbers, 2, 2);
      value = Math.pow(numbers[0], numbers[1]);
    } else if (name === "round") {
      requireCount(name, numbers, 1, 2);
      var digits = numbers.length === 2 ? numbers[1] : 0;
      if (Math.round(digits) !== digits || digits < 0 || digits > 12) {
        throw new NotebookError("SYNTAX", "round 的位数必须是 0–12 的整数。");
      }
      var factor = Math.pow(10, digits);
      value = Math.round((numbers[0] + Number.EPSILON) * factor) / factor;
    } else {
      throw new NotebookError("UNDEFINED_BUILTIN", "未定义的内置函数：" + name + "。");
    }
    return checkedNumber(value, name);
  }

  function evaluate(source, variables) {
    var tokens = tokenize(source);
    var position = 0;
    var values = variables || {};

    function current() { return tokens[position]; }
    function take(type) {
      if (current().type !== type) {
        throw new NotebookError("SYNTAX", "表达式无法解析：这里应为“" + type + "”，实际为“" + current().value + "”。");
      }
      return tokens[position++];
    }

    function parsePrimary() {
      var token = current();
      if (token.type === "number") {
        position++;
        return checkedNumber(token.value, "数字");
      }
      if (token.type === "name") {
        position++;
        var name = token.value;
        if (current().type === "(") {
          position++;
          var args = [];
          if (current().type !== ")") {
            while (true) {
              args.push(parseComparison());
              if (current().type !== ",") break;
              position++;
            }
          }
          take(")");
          return callBuiltin(name, args);
        }
        if (!Object.prototype.hasOwnProperty.call(values, name)) {
          throw new NotebookError("UNDEFINED_REFERENCE", "未定义引用：" + name + "。", { references: [name] });
        }
        return values[name];
      }
      if (token.type === "(") {
        position++;
        var nested = parseComparison();
        take(")");
        return nested;
      }
      throw new NotebookError("SYNTAX", "表达式无法解析：这里不能使用“" + token.value + "”。");
    }

    function parsePower() {
      var left = parsePrimary();
      if (current().type === "^") {
        position++;
        left = checkedNumber(Math.pow(requireNumber(left, "幂"), requireNumber(parseUnary(), "幂指数")), "幂");
      }
      return left;
    }

    function parseUnary() {
      if (current().type === "+") {
        position++;
        return requireNumber(parseUnary(), "一元正号");
      }
      if (current().type === "-") {
        position++;
        return checkedNumber(-requireNumber(parseUnary(), "一元负号"), "一元负号");
      }
      return parsePower();
    }

    function parseMultiplicative() {
      var left = parseUnary();
      while (current().type === "*" || current().type === "/") {
        var operator = current().type;
        position++;
        var right = requireNumber(parseUnary(), operator);
        left = requireNumber(left, operator);
        if (operator === "/" && Math.abs(right) <= 1e-12) {
          throw new NotebookError("DIVISION_NEAR_ZERO", "除数接近零：分母绝对值不大于 1e-12。");
        }
        left = checkedNumber(operator === "*" ? left * right : left / right, operator);
      }
      return left;
    }

    function parseAdditive() {
      var left = parseMultiplicative();
      while (current().type === "+" || current().type === "-") {
        var operator = current().type;
        position++;
        var right = requireNumber(parseMultiplicative(), operator);
        left = requireNumber(left, operator);
        left = checkedNumber(operator === "+" ? left + right : left - right, operator);
      }
      return left;
    }

    function parseComparison() {
      var left = parseAdditive();
      if (current().type !== "compare") return left;
      var operator = current().value;
      position++;
      var right = parseAdditive();
      if (operator === "<=") return left <= right;
      if (operator === ">=") return left >= right;
      if (operator === "<") return left < right;
      if (operator === ">") return left > right;
      if (operator === "==") return left === right;
      return left !== right;
    }

    var result = parseComparison();
    if (current().type !== "eof") {
      throw new NotebookError("SYNTAX", "表达式无法解析：末尾还有“" + current().value + "”。");
    }
    return result;
  }

  function referencesOf(source) {
    var tokens = tokenize(source);
    var seen = Object.create(null);
    var references = [];
    tokens.forEach(function (token, index) {
      if (token.type !== "name") return;
      if (tokens[index + 1] && tokens[index + 1].type === "(") return;
      if (!seen[token.value]) {
        seen[token.value] = true;
        references.push(token.value);
      }
    });
    return references;
  }

  function validateName(name, label) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new NotebookError("INVALID_NAME", (label || "名称") + "“" + name + "”不合法。");
    }
  }

  function analyzeNotebook(parameters, cells) {
    var params = parameters || {};
    var rows = Array.isArray(cells) ? cells : [];
    var names = Object.create(null);
    var cellByName = Object.create(null);
    var dependencies = Object.create(null);

    Object.keys(params).forEach(function (name) {
      validateName(name, "参数名");
      checkedNumber(params[name], "参数“" + name + "”");
      names[name] = "parameter";
    });

    rows.forEach(function (cell) {
      var name = String(cell && cell.name || "").trim();
      validateName(name, "格子名");
      if (names[name]) throw new NotebookError("DUPLICATE_NAME", "名称“" + name + "”已经存在。");
      if (CELL_TYPES.indexOf(cell.type) < 0) {
        throw new NotebookError("INVALID_TYPE", "格子“" + name + "”的类型无效。");
      }
      names[name] = "cell";
      cellByName[name] = cell;
    });

    var missing = [];
    rows.forEach(function (cell) {
      var deps = cell.type === "text" ? [] : referencesOf(cell.content);
      dependencies[cell.name] = deps;
      deps.forEach(function (dep) {
        if (!names[dep]) missing.push({ cell: cell.name, reference: dep });
        else if (names[dep] === "cell" && cellByName[dep].type === "text") {
          throw new NotebookError("INVALID_REFERENCE", "格子“" + cell.name + "”不能把说明文字“" + dep + "”当作数值引用。");
        }
      });
    });
    if (missing.length) {
      var missingNames = [];
      missing.forEach(function (item) {
        if (missingNames.indexOf(item.reference) < 0) missingNames.push(item.reference);
      });
      throw new NotebookError(
        "UNDEFINED_REFERENCE",
        "未定义引用：" + missing.map(function (item) { return item.reference + "（被 " + item.cell + " 使用）"; }).join("、") + "。",
        { references: missingNames, details: missing }
      );
    }

    var computable = rows.filter(function (cell) { return cell.type !== "text"; });
    var visitState = Object.create(null);
    var stack = [];
    var cycle = null;

    function visit(name) {
      if (cycle || visitState[name] === 2) return;
      if (visitState[name] === 1) {
        var start = stack.indexOf(name);
        cycle = stack.slice(start).concat(name);
        return;
      }
      visitState[name] = 1;
      stack.push(name);
      (dependencies[name] || []).forEach(function (dep) {
        if (cellByName[dep] && cellByName[dep].type !== "text") visit(dep);
      });
      stack.pop();
      visitState[name] = 2;
    }
    computable.forEach(function (cell) { visit(cell.name); });
    if (cycle) {
      throw new NotebookError(
        "CIRCULAR_REFERENCE",
        "循环引用：" + cycle.join(" → ") + "。",
        { cycle: cycle.slice(0, -1) }
      );
    }

    var indegree = Object.create(null);
    var reverse = Object.create(null);
    var sourceIndex = Object.create(null);
    Object.keys(names).forEach(function (name) { reverse[name] = []; });
    computable.forEach(function (cell, index) {
      sourceIndex[cell.name] = index;
      indegree[cell.name] = 0;
      dependencies[cell.name].forEach(function (dep) {
        reverse[dep].push(cell.name);
        if (cellByName[dep] && cellByName[dep].type !== "text") indegree[cell.name]++;
      });
    });
    var queue = computable.filter(function (cell) { return indegree[cell.name] === 0; }).map(function (cell) { return cell.name; });
    var order = [];
    while (queue.length) {
      var next = queue.shift();
      order.push(next);
      reverse[next].forEach(function (dependent) {
        indegree[dependent]--;
        if (indegree[dependent] === 0) {
          queue.push(dependent);
          queue.sort(function (left, right) { return sourceIndex[left] - sourceIndex[right]; });
        }
      });
    }

    return {
      rows: rows,
      cellByName: cellByName,
      dependencies: dependencies,
      reverse: reverse,
      order: order,
      dependencyCount: Object.keys(dependencies).reduce(function (sum, name) {
        return sum + dependencies[name].length;
      }, 0)
    };
  }

  function affectedNames(changed, reverse) {
    var seen = Object.create(null);
    var queue = (changed || []).slice();
    queue.forEach(function (name) { seen[name] = true; });
    while (queue.length) {
      var name = queue.shift();
      (reverse[name] || []).forEach(function (dependent) {
        if (!seen[dependent]) {
          seen[dependent] = true;
          queue.push(dependent);
        }
      });
    }
    return seen;
  }

  function runNotebook(spec, options) {
    var input = spec || {};
    var params = input.parameters || {};
    var cells = input.cells || [];
    var baselineDate = String(input.baselineDate || "");
    var analysis = analyzeNotebook(params, cells);
    var settings = options || {};
    var previous = settings.previous && settings.previous.results ? settings.previous.results : null;
    var partial = previous && Array.isArray(settings.changed) && settings.changed.length > 0;
    var targets = partial ? affectedNames(settings.changed, analysis.reverse) : null;

    if (partial) {
      var allAvailable = analysis.order.every(function (name) {
        return targets[name] || Object.prototype.hasOwnProperty.call(previous, name);
      });
      if (!allAvailable) partial = false;
    }

    var values = Object.create(null);
    Object.keys(params).forEach(function (name) { values[name] = checkedNumber(params[name], "参数“" + name + "”"); });
    var results = Object.create(null);

    analysis.rows.forEach(function (cell) {
      if (cell.type === "text") results[cell.name] = { type: "text", text: String(cell.content || "") };
    });
    if (partial) {
      analysis.order.forEach(function (name) {
        if (!targets[name]) {
          results[name] = previous[name];
          values[name] = previous[name].value;
        }
      });
    }

    var order = [];
    analysis.order.forEach(function (name) {
      if (partial && !targets[name]) return;
      var cell = analysis.cellByName[name];
      var value = evaluate(cell.content, values);
      if (cell.type === "assertion" && typeof value !== "boolean") {
        throw new NotebookError("ASSERTION_TYPE", "断言格“" + name + "”必须得到真或假。");
      }
      results[name] = cell.type === "assertion"
        ? { type: "assertion", value: value, passed: value }
        : { type: "expression", value: requireNumber(value, "表达式格“" + name + "”") };
      values[name] = value;
      order.push(name);
    });

    return {
      baselineDate: baselineDate,
      parameterCount: Object.keys(params).length,
      cellCount: cells.length,
      dependencyCount: analysis.dependencyCount,
      dependencies: analysis.dependencies,
      order: order,
      results: results
    };
  }

  function formatValue(value) {
    if (typeof value === "boolean") return value ? "通过" : "未通过";
    if (typeof value !== "number" || !isFinite(value)) return "—";
    if (value === 0) return "0";
    var out = value.toPrecision(8);
    if (out.indexOf("e") >= 0) return out.replace("e+", "e");
    return out.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  function runSelfTest() {
    var failures = [];
    function expect(name, action) {
      try { action(); } catch (error) { failures.push({ name: name, why: error.message || String(error) }); }
    }
    expect("表达式", function () {
      if (evaluate("-(2+3)^2+sqrt(9)", {}) !== -22) throw new Error("四则或函数结果不符");
    });
    expect("比较断言", function () {
      if (evaluate("cost<=budget", { cost: 9, budget: 10 }) !== true) throw new Error("比较结果不符");
    });
    expect("依赖重算", function () {
      var spec = {
        baselineDate: "2026-08-14",
        parameters: { area: 620, rent: 32 },
        cells: [
          { name: "monthly", type: "expression", content: "area*rent" },
          { name: "annual", type: "expression", content: "monthly*12" }
        ]
      };
      var first = runNotebook(spec);
      spec.parameters.area = 700;
      var second = runNotebook(spec, { previous: first, changed: ["area"] });
      if (second.order.join("|") !== "monthly|annual" || second.results.annual.value !== 268800) {
        throw new Error("依赖顺序或结果不符");
      }
    });
    expect("错误点名", function () {
      try {
        runNotebook({ parameters: {}, cells: [{ name: "total", type: "expression", content: "missing+1" }] });
      } catch (error) {
        if (error.code === "UNDEFINED_REFERENCE" && error.message.indexOf("missing") >= 0) return;
        throw error;
      }
      throw new Error("未定义引用没有报错");
    });
    return { total: 4, passed: 4 - failures.length, failures: failures };
  }

  var api = {
    CELL_TYPES: CELL_TYPES,
    BUILTINS: BUILTINS,
    NotebookError: NotebookError,
    tokenize: tokenize,
    evaluate: evaluate,
    referencesOf: referencesOf,
    analyzeNotebook: analyzeNotebook,
    runNotebook: runNotebook,
    formatValue: formatValue,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.ExecutableNotebookEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
