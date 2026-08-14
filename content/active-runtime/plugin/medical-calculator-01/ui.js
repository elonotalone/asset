(function () {
  "use strict";

  var E = window.MedicalCalculatorEngine;
  var activeMetric = "bmi";
  var inputIds = ["height", "weight", "age", "sex", "creatinine", "creatinine-unit", "calcium", "albumin"];
  var metrics = {
    bmi: {
      name: "体质指数 BMI",
      unit: "kg/m²",
      prompt: "先说身高和体重",
      inputs: "body",
      formula: "体重 ÷ 身高米数²",
      scope: "使用身高与体重估算；本工具不附加 BMI 人群判读分段。"
    },
    bsa: {
      name: "体表面积",
      unit: "m²",
      prompt: "身高和体重，足够算出体表面积",
      inputs: "body",
      formula: "√(身高_cm × 体重_kg ÷ 3600)",
      scope: "Mosteller 常用估算口径；具体用途需核对所采用的体表面积公式。"
    },
    egfr: {
      name: "eGFR",
      unit: "mL/min/1.73 m²",
      prompt: "告诉我年龄、性别和肌酐",
      inputs: "egfr",
      formula: "142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^年龄 ×（女性 1.012）；女性 κ=0.7、α=−0.241，男性 κ=0.9、α=−0.302",
      scope: "成人肌酐估算；κ 与 α 按性别取值，结果需结合适用人群解读。"
    },
    calcium: {
      name: "校正钙",
      unit: "mg/dL",
      prompt: "填入测得钙和白蛋白",
      inputs: "calcium",
      formula: "测得钙 + 0.8 × (4.0 − 白蛋白)",
      scope: "常见校正口径；不同检验室与人群可采用不同口径。"
    }
  };

  function el(id) {
    return document.getElementById(id);
  }

  function numberFrom(id) {
    var raw = el(id).value.trim().replace(/[, \s]/g, "");
    if (raw === "") return null;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)) return NaN;
    var value = Number(raw);
    return isFinite(value) ? value : NaN;
  }

  function valuesFromPage() {
    return {
      heightCm: numberFrom("height"),
      weightKg: numberFrom("weight"),
      age: numberFrom("age"),
      sex: el("sex").value,
      creatinine: numberFrom("creatinine"),
      creatinineUnit: el("creatinine-unit").value,
      calcium: numberFrom("calcium"),
      albumin: numberFrom("albumin")
    };
  }

  function displayResults(out) {
    return {
      bmi: out.bmi === null ? null : out.bmi.toFixed(2),
      bsa: out.bsa === null ? null : out.bsa.toFixed(3),
      egfr: out.egfr === null ? null : out.egfr.toFixed(1),
      calcium: out.correctedCalcium === null ? null : out.correctedCalcium.toFixed(2)
    };
  }

  function invalidFields(values) {
    var fields = {
      body: [[values.heightCm, "身高"], [values.weightKg, "体重"]],
      egfr: [[values.age, "年龄"], [values.creatinine, "肌酐"]],
      calcium: [[values.calcium, "测得钙"], [values.albumin, "白蛋白"]]
    };
    var invalid = [];
    fields[metrics[activeMetric].inputs].forEach(function (pair) {
      if (typeof pair[0] === "number" && (!isFinite(pair[0]) || pair[0] <= 0)) invalid.push(pair[1]);
    });
    return invalid;
  }

  function renderDetails(metric) {
    el("details-title").textContent = metric.name + " · 口径";
    el("details-formula").textContent = metric.formula;
    el("details-unit").textContent = metric.unit;
    el("details-scope").textContent = metric.scope;
    el("egfr-details").hidden = activeMetric !== "egfr";
  }

  function render() {
    var values = valuesFromPage();
    var results = displayResults(E.calculate(values));
    var metric = metrics[activeMetric];
    var activeValue = results[activeMetric];

    el("prompt").textContent = metric.prompt;
    el("hero-name").textContent = metric.name;
    el("hero-unit").textContent = metric.unit;
    el("hero-value").textContent = activeValue === null ? "—" : activeValue;
    el("hero-value").className = "hero-value" + (activeValue === null ? " is-empty" : "");
    el("hero-value").setAttribute("aria-label", activeValue === null ? "尚未计算" : metric.name + " " + activeValue + " " + metric.unit);
    renderDetails(metric);

    Object.keys(metrics).forEach(function (id) {
      el(id + "-mini").textContent = results[id] === null ? "—" : results[id];
    });

    document.querySelectorAll("[data-inputs]").forEach(function (set) {
      set.hidden = set.getAttribute("data-inputs") !== metric.inputs;
    });

    document.querySelectorAll("[data-metric]").forEach(function (tab) {
      var current = tab.getAttribute("data-metric") === activeMetric;
      tab.classList.toggle("is-current", current);
      if (current) tab.setAttribute("aria-current", "true");
      else tab.removeAttribute("aria-current");
    });

    var invalid = invalidFields(values);
    el("input-message").textContent = invalid.length ? invalid.join("、") + "需输入大于 0 的有限数值。" : "";
  }

  function mount() {
    inputIds.forEach(function (id) {
      el(id).addEventListener(id === "sex" || id === "creatinine-unit" ? "change" : "input", render);
    });
    document.querySelectorAll("[data-metric]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        activeMetric = tab.getAttribute("data-metric");
        render();
      });
    });
    el("details-toggle").addEventListener("click", function () {
      var expanded = el("details-toggle").getAttribute("aria-expanded") === "true";
      el("details-toggle").setAttribute("aria-expanded", String(!expanded));
      el("metric-details").hidden = expanded;
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
