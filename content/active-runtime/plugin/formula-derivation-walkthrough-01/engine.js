/*
 * 公式展开 · 纯计算内核
 *
 * 浏览器读取全局 FormulaWalkthroughEngine，node 自测读取 module.exports。
 * 这里只解析封闭数学表达式，不接触 DOM、存储、父窗口或网络，也不执行自由代码。
 */
(function (root) {
  "use strict";

  var NEAR_ZERO = 1e-12;
  var OVERFLOW_LIMIT = 1e308;
  var EVIDENCE_TYPES = ["定义", "代入", "代数变形", "恒等式", "取极限", "单位换算", "近似"];
  var ERROR_MESSAGES = {
    DIVISION_NEAR_ZERO: "除数接近零：本步的分母绝对值不大于 1e-12，结果会对微小扰动极其敏感。",
    OVERFLOW: "数值溢出：本步结果超出可可靠表示的数值范围，请缩放输入或拆分计算。",
    DIMENSION_MISMATCH: "量纲不一致：加减项或相邻推导步骤的物理维度不同，不能直接合并。",
    SYNTAX: "表达式无法解析",
    UNDEFINED_NAME: "未定义的符号"
  };

  function FormulaError(code, detail) {
    this.name = "FormulaError";
    this.code = code;
    this.message = (ERROR_MESSAGES[code] || code) + (detail ? " " + detail : "");
    if (Error.captureStackTrace) Error.captureStackTrace(this, FormulaError);
  }
  FormulaError.prototype = Object.create(Error.prototype);
  FormulaError.prototype.constructor = FormulaError;

  function cleanDimension(dimension) {
    var source = dimension || {};
    var out = {};
    Object.keys(source).sort().forEach(function (key) {
      var value = source[key];
      if (Math.abs(value) > 1e-12) out[key] = value;
    });
    return out;
  }

  function sameDimension(left, right) {
    var a = cleanDimension(left);
    var b = cleanDimension(right);
    var keys = {};
    Object.keys(a).forEach(function (key) { keys[key] = true; });
    Object.keys(b).forEach(function (key) { keys[key] = true; });
    return Object.keys(keys).every(function (key) {
      return Math.abs((a[key] || 0) - (b[key] || 0)) <= 1e-12;
    });
  }

  function combineDimension(left, right, sign) {
    var out = {};
    Object.keys(left || {}).forEach(function (key) { out[key] = left[key]; });
    Object.keys(right || {}).forEach(function (key) {
      out[key] = (out[key] || 0) + sign * right[key];
    });
    return cleanDimension(out);
  }

  function scaleDimension(dimension, exponent) {
    var out = {};
    Object.keys(dimension || {}).forEach(function (key) {
      out[key] = dimension[key] * exponent;
    });
    return cleanDimension(out);
  }

  var UNITS = {
    "1": { label: "无量纲", factor: 1, dimension: {} },
    "m": { label: "m", factor: 1, dimension: { L: 1 } },
    "cm": { label: "cm", factor: 0.01, dimension: { L: 1 } },
    "km": { label: "km", factor: 1000, dimension: { L: 1 } },
    "s": { label: "s", factor: 1, dimension: { T: 1 } },
    "min": { label: "min", factor: 60, dimension: { T: 1 } },
    "h": { label: "h", factor: 3600, dimension: { T: 1 } },
    "kg": { label: "kg", factor: 1, dimension: { M: 1 } },
    "g": { label: "g", factor: 0.001, dimension: { M: 1 } },
    "m/s": { label: "m/s", factor: 1, dimension: { L: 1, T: -1 } },
    "m/s²": { label: "m/s²", factor: 1, dimension: { L: 1, T: -2 } },
    "m/s^2": { label: "m/s²", factor: 1, dimension: { L: 1, T: -2 } },
    "m²": { label: "m²", factor: 1, dimension: { L: 2 } },
    "m^2": { label: "m²", factor: 1, dimension: { L: 2 } }
  };

  function unitDefinition(unit) {
    var found = UNITS[unit];
    if (!found) throw new FormulaError("SYNTAX", "不认识单位“" + unit + "”。");
    return found;
  }

  function checked(value, dimension) {
    if (!isFinite(value) || Math.abs(value) > OVERFLOW_LIMIT) {
      throw new FormulaError("OVERFLOW");
    }
    return { value: value, dimension: cleanDimension(dimension) };
  }

  function quantityFrom(value) {
    if (typeof value === "number") return checked(value, {});
    if (!value || typeof value.value !== "number") {
      throw new FormulaError("SYNTAX", "符号值必须是有限数字。");
    }
    if (value.unit) {
      var unit = unitDefinition(value.unit);
      return checked(value.value * unit.factor, unit.dimension);
    }
    return checked(value.value, value.dimension || {});
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
      if ("+-*/^(),".indexOf(char) >= 0) {
        tokens.push({ type: char, value: char });
        index++;
        continue;
      }
      throw new FormulaError("SYNTAX", "第 " + (index + 1) + " 个字符“" + char + "”不受支持。");
    }
    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  function add(left, right, sign) {
    if (!sameDimension(left.dimension, right.dimension)) {
      throw new FormulaError("DIMENSION_MISMATCH");
    }
    return checked(left.value + sign * right.value, left.dimension);
  }

  function multiply(left, right) {
    return checked(left.value * right.value, combineDimension(left.dimension, right.dimension, 1));
  }

  function divide(left, right) {
    if (Math.abs(right.value) <= NEAR_ZERO) throw new FormulaError("DIVISION_NEAR_ZERO");
    return checked(left.value / right.value, combineDimension(left.dimension, right.dimension, -1));
  }

  function power(base, exponent) {
    if (!sameDimension(exponent.dimension, {})) {
      throw new FormulaError("DIMENSION_MISMATCH", "幂指数必须无量纲。");
    }
    if (!sameDimension(base.dimension, {}) &&
        Math.abs(exponent.value - Math.round(exponent.value)) > 1e-12) {
      throw new FormulaError("DIMENSION_MISMATCH", "带量纲的量只接受整数次幂。");
    }
    return checked(Math.pow(base.value, exponent.value), scaleDimension(base.dimension, exponent.value));
  }

  function requireCount(name, args, minimum, maximum) {
    if (args.length < minimum || args.length > maximum) {
      throw new FormulaError("SYNTAX", name + " 的参数个数应为 " +
        (minimum === maximum ? String(minimum) : minimum + "–" + maximum) + "。");
    }
  }

  function requireDimensionless(name, arg) {
    if (!sameDimension(arg.dimension, {})) {
      throw new FormulaError("DIMENSION_MISMATCH", name + " 的参数必须无量纲。");
    }
  }

  function callBuiltin(name, args) {
    var i;
    if (name === "abs") {
      requireCount(name, args, 1, 1);
      return checked(Math.abs(args[0].value), args[0].dimension);
    }
    if (name === "sqrt") {
      requireCount(name, args, 1, 1);
      if (args[0].value < 0) throw new FormulaError("SYNTAX", "sqrt 的参数不能为负。");
      var dim = scaleDimension(args[0].dimension, 0.5);
      var valid = Object.keys(dim).every(function (key) {
        return Math.abs(dim[key] - Math.round(dim[key])) <= 1e-12;
      });
      if (!valid) throw new FormulaError("DIMENSION_MISMATCH", "sqrt 后会产生不受支持的分数量纲。");
      return checked(Math.sqrt(args[0].value), dim);
    }
    if (name === "sin" || name === "cos" || name === "tan" ||
        name === "ln" || name === "log" || name === "exp") {
      requireCount(name, args, 1, 1);
      requireDimensionless(name, args[0]);
      var operation = name === "ln" ? Math.log :
        name === "log" ? Math.log10 :
        name === "exp" ? Math.exp : Math[name];
      return checked(operation(args[0].value), {});
    }
    if (name === "min" || name === "max") {
      requireCount(name, args, 1, 64);
      for (i = 1; i < args.length; i++) {
        if (!sameDimension(args[0].dimension, args[i].dimension)) {
          throw new FormulaError("DIMENSION_MISMATCH", name + " 的各参数量纲必须一致。");
        }
      }
      return checked(Math[name].apply(Math, args.map(function (arg) { return arg.value; })), args[0].dimension);
    }
    if (name === "pow") {
      requireCount(name, args, 2, 2);
      return power(args[0], args[1]);
    }
    if (name === "round") {
      requireCount(name, args, 1, 2);
      var digits = args.length === 2 ? args[1] : { value: 0, dimension: {} };
      requireDimensionless(name, digits);
      if (Math.round(digits.value) !== digits.value || digits.value < 0 || digits.value > 12) {
        throw new FormulaError("SYNTAX", "round 的位数必须是 0–12 的整数。");
      }
      var factor = Math.pow(10, digits.value);
      return checked(Math.round(args[0].value * factor) / factor, args[0].dimension);
    }
    throw new FormulaError("UNDEFINED_NAME", "内置函数“" + name + "”不存在。");
  }

  function evaluate(source, variables) {
    var tokens = tokenize(source);
    var position = 0;
    var values = variables || {};

    function current() { return tokens[position]; }
    function take(type) {
      if (current().type !== type) {
        throw new FormulaError("SYNTAX", "这里应为“" + type + "”，实际为“" + current().value + "”。");
      }
      return tokens[position++];
    }

    function parsePrimary() {
      var token = current();
      if (token.type === "number") {
        position++;
        return checked(token.value, {});
      }
      if (token.type === "name") {
        position++;
        var name = token.value;
        if (current().type === "(") {
          position++;
          var args = [];
          if (current().type !== ")") {
            while (true) {
              args.push(parseAdditive());
              if (current().type !== ",") break;
              position++;
            }
          }
          take(")");
          return callBuiltin(name, args);
        }
        if (!Object.prototype.hasOwnProperty.call(values, name)) {
          throw new FormulaError("UNDEFINED_NAME", "符号“" + name + "”尚未定义。");
        }
        return quantityFrom(values[name]);
      }
      if (token.type === "(") {
        position++;
        var nested = parseAdditive();
        take(")");
        return nested;
      }
      throw new FormulaError("SYNTAX", "这里不能使用“" + token.value + "”。");
    }

    function parsePower() {
      var left = parsePrimary();
      if (current().type === "^") {
        position++;
        left = power(left, parseUnary());
      }
      return left;
    }

    function parseUnary() {
      if (current().type === "+") {
        position++;
        return parseUnary();
      }
      if (current().type === "-") {
        position++;
        var arg = parseUnary();
        return checked(-arg.value, arg.dimension);
      }
      return parsePower();
    }

    function parseMultiplicative() {
      var left = parseUnary();
      while (current().type === "*" || current().type === "/") {
        var operator = current().type;
        position++;
        var right = parseUnary();
        left = operator === "*" ? multiply(left, right) : divide(left, right);
      }
      return left;
    }

    function parseAdditive() {
      var left = parseMultiplicative();
      while (current().type === "+" || current().type === "-") {
        var operator = current().type;
        position++;
        left = add(left, parseMultiplicative(), operator === "+" ? 1 : -1);
      }
      return left;
    }

    var result = parseAdditive();
    if (current().type !== "eof") {
      throw new FormulaError("SYNTAX", "末尾还有未解析内容“" + current().value + "”。");
    }
    return checked(result.value, result.dimension);
  }

  function convertUnit(value, fromUnit, toUnit) {
    var from = unitDefinition(fromUnit);
    var to = unitDefinition(toUnit);
    if (!sameDimension(from.dimension, to.dimension)) {
      throw new FormulaError("DIMENSION_MISMATCH", "“" + fromUnit + "”与“" + toUnit + "”不能换算。");
    }
    if (fromUnit === toUnit) {
      throw new FormulaError("DIMENSION_MISMATCH", "单位换算前后单位必须真的改变。");
    }
    var base = checked(value * from.factor, from.dimension);
    return {
      value: checked(base.value / to.factor, to.dimension).value,
      baseValue: base.value,
      dimension: cleanDimension(to.dimension),
      fromUnit: fromUnit,
      toUnit: toUnit,
      unitChanged: true
    };
  }

  function valueInUnit(quantity, unitName) {
    var unit = unitDefinition(unitName || "1");
    if (!sameDimension(quantity.dimension, unit.dimension)) {
      throw new FormulaError("DIMENSION_MISMATCH", "结果不能用“" + unitName + "”展示。");
    }
    return quantity.value / unit.factor;
  }

  function roundTo(value, digits) {
    var factor = Math.pow(10, digits);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function createStep(spec) {
    var input = spec || {};
    if (EVIDENCE_TYPES.indexOf(input.basis) < 0) {
      throw new FormulaError("SYNTAX", "推导依据必须是七类之一。");
    }
    var result = evaluate(input.expression, input.variables || {});
    var expected = input.expectedDimension;
    if (expected && !sameDimension(result.dimension, expected)) {
      throw new FormulaError("DIMENSION_MISMATCH", "本步与上一步的量纲不同。");
    }

    var outputUnit = input.outputUnit || "1";
    var displayValue = valueInUnit(result, outputUnit);
    var step = {
      basis: input.basis,
      expression: input.expression,
      rawValue: result.value,
      value: displayValue,
      dimension: cleanDimension(result.dimension),
      outputUnit: outputUnit,
      unitChanged: false,
      error: null,
      explanation: "量纲与本步输入保持一致。"
    };

    if (input.basis === "单位换算") {
      if (!input.previousUnit || input.previousUnit === outputUnit) {
        throw new FormulaError("DIMENSION_MISMATCH", "单位换算必须给出不同的前后单位。");
      }
      var before = unitDefinition(input.previousUnit);
      var after = unitDefinition(outputUnit);
      if (!sameDimension(before.dimension, after.dimension) ||
          !sameDimension(after.dimension, result.dimension)) {
        throw new FormulaError("DIMENSION_MISMATCH", "单位换算前后的物理维度必须一致。");
      }
      step.unitChanged = true;
      step.explanation = "物理量纲保持一致，显示单位由 " + input.previousUnit + " 改为 " + outputUnit + "。";
    } else if (input.previousUnit && input.previousUnit !== outputUnit) {
      throw new FormulaError("DIMENSION_MISMATCH", "只有“单位换算”依据可以显式改变显示单位。");
    }

    if (input.basis === "近似") {
      var digits = input.precision;
      if (Math.round(digits) !== digits || digits < 0 || digits > 12) {
        throw new FormulaError("SYNTAX", "近似步骤必须给出 0–12 的小数位数。");
      }
      var rounded = roundTo(displayValue, digits);
      step.value = rounded;
      step.error = Math.abs(displayValue - rounded);
      step.explanation = "近似到 " + digits + " 位小数；绝对误差 " + formatNumber(step.error, 8) + " " + outputUnit + "。";
    }
    return step;
  }

  function formatNumber(value, significant) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    if (value === 0) return "0";
    var digits = significant || 6;
    var text = value.toPrecision(digits);
    if (text.indexOf("e") >= 0) return text.replace("e+", "e");
    return text.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  function runSelfTest() {
    var failures = [];
    function expect(name, fn) {
      try {
        fn();
      } catch (error) {
        failures.push({ name: name, why: error && error.message ? error.message : String(error) });
      }
    }
    var variables = {
      g: { value: 9.80665, unit: "m/s²" },
      t: { value: 2.4, unit: "s" },
      x: 0,
      length: { value: 1, unit: "m" }
    };
    expect("自由落体代入", function () {
      var result = evaluate("0.5*g*t^2", variables);
      if (Math.abs(result.value - 28.243152) > 1e-12) throw new Error("自由落体结果不符");
      if (!sameDimension(result.dimension, { L: 1 })) throw new Error("自由落体量纲不符");
    });
    expect("单位换算", function () {
      var result = convertUnit(1, "m", "cm");
      if (result.value !== 100 || !result.unitChanged) throw new Error("1 m 应为 100 cm");
    });
    expect("近似误差", function () {
      var step = createStep({
        basis: "近似",
        expression: "0.5*g*t^2",
        variables: variables,
        outputUnit: "m",
        precision: 2,
        expectedDimension: { L: 1 }
      });
      if (step.value !== 28.24 || Math.abs(step.error - 0.003152) > 1e-12) {
        throw new Error("近似值或误差不符");
      }
    });
    expect("三类错误各自独立", function () {
      var codes = [];
      [["1/0", {}], ["exp(1000)", {}], ["length+t", variables]].forEach(function (test) {
        try { evaluate(test[0], test[1]); } catch (error) { codes.push(error.code); }
      });
      if (codes.join("|") !== "DIVISION_NEAR_ZERO|OVERFLOW|DIMENSION_MISMATCH") {
        throw new Error("错误分类不符：" + codes.join("|"));
      }
    });
    return { total: 4, passed: 4 - failures.length, failures: failures };
  }

  var api = {
    NEAR_ZERO: NEAR_ZERO,
    OVERFLOW_LIMIT: OVERFLOW_LIMIT,
    EVIDENCE_TYPES: EVIDENCE_TYPES,
    ERROR_MESSAGES: ERROR_MESSAGES,
    UNITS: UNITS,
    FormulaError: FormulaError,
    tokenize: tokenize,
    evaluate: evaluate,
    sameDimension: sameDimension,
    cleanDimension: cleanDimension,
    convertUnit: convertUnit,
    valueInUnit: valueInUnit,
    createStep: createStep,
    formatNumber: formatNumber,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.FormulaWalkthroughEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
