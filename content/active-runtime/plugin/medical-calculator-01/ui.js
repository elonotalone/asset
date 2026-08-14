(function () {
  "use strict";

  var E = window.MedicalCalculatorEngine;
  var ids = ["height", "weight", "age", "sex", "creatinine", "creatinine-unit", "calcium", "albumin"];

  function el(id) { return document.getElementById(id); }

  function numberFrom(id) {
    var raw = el(id).value.trim().replace(/[, \s]/g, "");
    if (raw === "") return null;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return NaN;
    var value = Number(raw);
    return isFinite(value) ? value : NaN;
  }

  function setResult(id, value, status) {
    var valueEl = el(id + "-value");
    valueEl.textContent = value === null ? "待输入" : value;
    valueEl.className = "result-value" + (value === null ? " waiting" : "");
    el(id + "-status").textContent = status;
  }

  function missing(values) {
    var labels = [];
    for (var i = 0; i < values.length; i++) if (values[i][0] === null) labels.push(values[i][1]);
    return labels.length ? "还需要" + labels.join("、") : "";
  }

  function render() {
    var values = {
      heightCm: numberFrom("height"),
      weightKg: numberFrom("weight"),
      age: numberFrom("age"),
      sex: el("sex").value,
      creatinine: numberFrom("creatinine"),
      creatinineUnit: el("creatinine-unit").value,
      calcium: numberFrom("calcium"),
      albumin: numberFrom("albumin")
    };

    var invalid = [];
    [[values.heightCm, "身高"], [values.weightKg, "体重"], [values.age, "年龄"], [values.creatinine, "肌酐"], [values.calcium, "测得钙"], [values.albumin, "白蛋白"]].forEach(function (pair) {
      if (typeof pair[0] === "number" && (!isFinite(pair[0]) || pair[0] <= 0)) invalid.push(pair[1]);
    });
    el("input-message").textContent = invalid.length ? invalid.join("、") + "需输入大于 0 的有限数值。" : "";

    var out = E.calculate(values);
    var bodyMissing = missing([[values.heightCm, "身高"], [values.weightKg, "体重"]]);
    setResult("bmi", out.bmi === null ? null : out.bmi.toFixed(2), out.bmi === null ? bodyMissing || "请检查身高、体重" : "已按 BMI 公式计算；不附加健康判断");
    setResult("bsa", out.bsa === null ? null : out.bsa.toFixed(3), out.bsa === null ? bodyMissing || "请检查身高、体重" : "已按 Mosteller 口径计算");

    var calciumMissing = missing([[values.calcium, "测得钙"], [values.albumin, "白蛋白"]]);
    setResult("calcium", out.correctedCalcium === null ? null : out.correctedCalcium.toFixed(2), out.correctedCalcium === null ? calciumMissing || "请检查测得钙、白蛋白" : "已按常见白蛋白校正口径计算");

    var sexValue = values.sex || null;
    var egfrMissing = missing([[values.creatinine, "肌酐"], [values.age, "年龄"], [sexValue, "性别参数"]]);
    setResult("egfr", out.egfr === null ? null : out.egfr.toFixed(1), out.egfr === null ? egfrMissing || "请检查肌酐、年龄、性别参数" : "参考分段 " + out.egfrStage + "；分段不是诊断结论");
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function runTest() {
    var result = E.runSelfTest();
    el("test-out").textContent = result.passed + " / " + result.total + " 通过";
    var detail = el("test-detail");
    clear(detail);
    if (result.failures.length === 0) {
      var ok = document.createElement("li");
      ok.textContent = "BMI、Mosteller、校正钙、CKD-EPI 分段与边界用例全部通过。";
      detail.appendChild(ok);
    } else {
      result.failures.forEach(function (failure) {
        var item = document.createElement("li");
        item.textContent = failure.name + " —— " + failure.why;
        detail.appendChild(item);
      });
    }
  }

  function mount() {
    ids.forEach(function (id) {
      el(id).addEventListener(id === "sex" || id === "creatinine-unit" ? "change" : "input", render);
    });
    el("run-test").addEventListener("click", runTest);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
