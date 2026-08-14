(function () {
  "use strict";

  var engine = window.MedicalCalculatorEngine;
  if (!engine) return;

  var metrics = {
    bmi: {
      name: "体质指数 BMI",
      unit: "kg/m²",
      prompt: "先说身高和体重",
      inputGroup: "body",
      resultKey: "bmi",
      digits: 1
    },
    bsa: {
      name: "体表面积",
      unit: "m²",
      prompt: "先说身高和体重",
      inputGroup: "body",
      resultKey: "bsa",
      digits: 2
    },
    egfr: {
      name: "eGFR",
      unit: "mL/min/1.73 m²",
      prompt: "告诉我年龄、性别和肌酐",
      inputGroup: "egfr",
      resultKey: "egfr",
      digits: 0
    },
    calcium: {
      name: "校正钙",
      unit: "mg/dL",
      prompt: "告诉我测得钙和白蛋白",
      inputGroup: "calcium",
      resultKey: "correctedCalcium",
      digits: 1
    }
  };

  var currentMetric = "bmi";
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-metric]"));
  var inputGroups = Array.prototype.slice.call(document.querySelectorAll("[data-inputs]"));
  var numericInputs = Array.prototype.slice.call(document.querySelectorAll("input"));
  var controls = Array.prototype.slice.call(document.querySelectorAll("input, select"));

  var heroValue = document.getElementById("hero-value");
  var metricName = document.getElementById("metric-name");
  var heroUnit = document.getElementById("hero-unit");
  var prompt = document.getElementById("prompt");
  var inputMessage = document.getElementById("input-message");
  var scale = document.getElementById("egfr-scale");
  var scaleMarker = document.getElementById("scale-marker");
  var scaleStage = document.getElementById("scale-stage");

  function readPositive(id) {
    var input = document.getElementById(id);
    var raw = input.value.trim();
    if (!raw) return { value: null, invalid: false };
    var number = Number(raw);
    return {
      value: Number.isFinite(number) && number > 0 ? number : null,
      invalid: !Number.isFinite(number) || number <= 0
    };
  }

  function readState() {
    var height = readPositive("height");
    var weight = readPositive("weight");
    var age = readPositive("age");
    var creatinine = readPositive("creatinine");
    var calcium = readPositive("calcium");
    var albumin = readPositive("albumin");

    return {
      values: {
        heightCm: height.value,
        weightKg: weight.value,
        age: age.value,
        sex: document.getElementById("sex").value,
        creatinine: creatinine.value,
        creatinineUnit: document.getElementById("creatinine-unit").value,
        calcium: calcium.value,
        albumin: albumin.value
      },
      invalid: {
        height: height.invalid,
        weight: weight.invalid,
        age: age.invalid,
        creatinine: creatinine.invalid,
        calcium: calcium.invalid,
        albumin: albumin.invalid
      }
    };
  }

  function displayNumber(value, metricId) {
    if (metricId === "egfr" && value > 0 && value < 1) return value.toFixed(1);
    return value.toFixed(metrics[metricId].digits);
  }

  function currentInvalid(invalid) {
    var fieldsByGroup = {
      body: ["height", "weight"],
      egfr: ["age", "creatinine"],
      calcium: ["calcium", "albumin"]
    };
    var fields = fieldsByGroup[metrics[currentMetric].inputGroup];
    return fields.some(function (field) { return invalid[field]; });
  }

  function renderTabs(results) {
    tabs.forEach(function (tab) {
      var metricId = tab.getAttribute("data-metric");
      var selected = metricId === currentMetric;
      var output = document.getElementById(metricId + "-mini");
      var value = results[metrics[metricId].resultKey];

      tab.classList.toggle("is-current", selected);
      if (selected) tab.setAttribute("aria-current", "true");
      else tab.removeAttribute("aria-current");

      if (typeof value === "number" && Number.isFinite(value)) {
        output.textContent = displayNumber(value, metricId);
        output.hidden = false;
      } else {
        output.textContent = "";
        output.hidden = true;
      }
    });
  }

  function renderScale(value, stage) {
    var visible = currentMetric === "egfr" && typeof value === "number" && Number.isFinite(value);
    scale.hidden = !visible;
    if (!visible) return;

    var position = Math.max(0, Math.min(value, 120)) / 120 * 100;
    scaleMarker.style.left = position + "%";
    scaleMarker.classList.toggle("near-left", position < 12);
    scaleMarker.classList.toggle("near-right", position > 88);
    scaleStage.textContent = stage;
    scale.setAttribute("aria-label", "eGFR " + displayNumber(value, "egfr") + "，参考分段 " + stage);
  }

  function render() {
    var state = readState();
    var results = engine.calculate(state.values);
    var metric = metrics[currentMetric];
    var value = results[metric.resultKey];

    metricName.textContent = metric.name;
    heroUnit.textContent = metric.unit;
    prompt.textContent = metric.prompt;

    inputGroups.forEach(function (group) {
      group.hidden = group.getAttribute("data-inputs") !== metric.inputGroup;
    });

    numericInputs.forEach(function (input) {
      input.setAttribute("aria-invalid", state.invalid[input.id] ? "true" : "false");
    });

    if (typeof value === "number" && Number.isFinite(value)) {
      heroValue.textContent = displayNumber(value, currentMetric);
      heroValue.setAttribute("data-empty", "false");
      heroValue.setAttribute("aria-label", metric.name + " " + displayNumber(value, currentMetric) + " " + metric.unit);
    } else {
      heroValue.textContent = "";
      heroValue.setAttribute("data-empty", "true");
      heroValue.setAttribute("aria-label", metric.name + "，等待输入");
    }

    var hasInvalid = currentInvalid(state.invalid);
    inputMessage.textContent = hasInvalid ? "请输入大于 0 的数值" : "";
    inputMessage.hidden = !hasInvalid;

    renderTabs(results);
    renderScale(results.egfr, results.egfrStage);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      currentMetric = tab.getAttribute("data-metric");
      render();
    });
  });

  controls.forEach(function (control) {
    control.addEventListener("input", render);
    control.addEventListener("change", render);
  });

  render();
})();
