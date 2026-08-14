(function (root) {
  "use strict";

  function positive(value) {
    return typeof value === "number" && isFinite(value) && value > 0;
  }

  function bmi(heightCm, weightKg) {
    if (!positive(heightCm) || !positive(weightKg)) return null;
    var heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
  }

  function bodySurfaceArea(heightCm, weightKg) {
    if (!positive(heightCm) || !positive(weightKg)) return null;
    return Math.sqrt(heightCm * weightKg / 3600);
  }

  function correctedCalcium(measuredCalcium, albumin) {
    if (!positive(measuredCalcium) || !positive(albumin)) return null;
    return measuredCalcium + 0.8 * (4.0 - albumin);
  }

  function creatinineMgDl(value, unit) {
    if (!positive(value)) return null;
    if (unit === "mgdl") return value;
    if (unit === "umoll") return value / 88.4;
    return null;
  }

  function egfr(age, sex, creatinine, unit) {
    if (!positive(age) || (sex !== "female" && sex !== "male")) return null;
    var scr = creatinineMgDl(creatinine, unit);
    if (!scr) return null;
    var female = sex === "female";
    var kappa = female ? 0.7 : 0.9;
    var alpha = female ? -0.241 : -0.302;
    var ratio = scr / kappa;
    return 142 *
      Math.pow(Math.min(ratio, 1), alpha) *
      Math.pow(Math.max(ratio, 1), -1.2) *
      Math.pow(0.9938, age) *
      (female ? 1.012 : 1);
  }

  function egfrStage(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0) return null;
    if (value >= 90) return "G1";
    if (value >= 60) return "G2";
    if (value >= 45) return "G3a";
    if (value >= 30) return "G3b";
    if (value >= 15) return "G4";
    return "G5";
  }

  function calculate(values) {
    values = values || {};
    var filtration = egfr(values.age, values.sex, values.creatinine, values.creatinineUnit);
    return {
      bmi: bmi(values.heightCm, values.weightKg),
      bsa: bodySurfaceArea(values.heightCm, values.weightKg),
      correctedCalcium: correctedCalcium(values.calcium, values.albumin),
      egfr: filtration,
      egfrStage: filtration === null ? null : egfrStage(filtration)
    };
  }

  function close(actual, expected, tolerance) {
    return typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  }

  var CASES = [
    { name: "BMI 170 cm / 65 kg", test: function () { return close(bmi(170, 65), 22.49134948096886, 1e-12); } },
    { name: "Mosteller 体表面积 170 cm / 65 kg", test: function () { return close(bodySurfaceArea(170, 65), 1.7519830034690533, 1e-12); } },
    { name: "校正钙 8.2 / 3.0 = 9.0", test: function () { return close(correctedCalcium(8.2, 3.0), 9.0, 1e-12); } },
    { name: "白蛋白 4.0 时校正钙等于测得钙", test: function () { return correctedCalcium(8.2, 4.0) === 8.2; } },
    { name: "肌酐 µmol/L 以 88.4 近似换算", test: function () { return close(creatinineMgDl(88.4, "umoll"), 1, 1e-12); } },
    { name: "女性 κ=0.7 跨越点", test: function () {
      var at = egfr(50, "female", 0.7, "mgdl");
      var expected = 142 * Math.pow(0.9938, 50) * 1.012;
      return close(at, expected, 1e-12) && Math.abs(egfr(50, "female", 0.7 - 1e-9, "mgdl") - egfr(50, "female", 0.7 + 1e-9, "mgdl")) < 1e-6;
    } },
    { name: "男性 κ=0.9 跨越点", test: function () {
      var at = egfr(50, "male", 0.9, "mgdl");
      var expected = 142 * Math.pow(0.9938, 50);
      return close(at, expected, 1e-12) && Math.abs(egfr(50, "male", 0.9 - 1e-9, "mgdl") - egfr(50, "male", 0.9 + 1e-9, "mgdl")) < 1e-6;
    } },
    { name: "eGFR 分段全部端点", test: function () {
      var points = [[90, "G1"], [89.9, "G2"], [60, "G2"], [59.9, "G3a"], [45, "G3a"], [44.9, "G3b"], [30, "G3b"], [29.9, "G4"], [15, "G4"], [14.9, "G5"]];
      for (var i = 0; i < points.length; i++) if (egfrStage(points[i][0]) !== points[i][1]) return false;
      return true;
    } },
    { name: "极端身高体重仍可计算", test: function () {
      return close(bmi(140, 40), 20.408163265306126, 1e-12) && close(bodySurfaceArea(210, 150), 2.958039891549808, 1e-12);
    } },
    { name: "空值、非数、零与负数返回 null", test: function () {
      return bmi(0, 65) === null && bmi(-170, 65) === null && bmi(NaN, 65) === null && bodySurfaceArea(170, -1) === null && correctedCalcium(0, 4) === null && egfr(50, "", 1, "mgdl") === null;
    } }
  ];

  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var passed = false;
      try { passed = CASES[i].test() === true; } catch (error) { passed = false; }
      if (!passed) failures.push({ name: CASES[i].name, why: "实际结果与规格口径不一致" });
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    CASES: CASES,
    bmi: bmi,
    bodySurfaceArea: bodySurfaceArea,
    correctedCalcium: correctedCalcium,
    creatinineMgDl: creatinineMgDl,
    egfr: egfr,
    egfrStage: egfrStage,
    calculate: calculate,
    runSelfTest: runSelfTest
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.MedicalCalculatorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
