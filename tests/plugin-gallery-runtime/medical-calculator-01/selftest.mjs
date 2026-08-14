import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(here, "../../../content/active-runtime/plugin/medical-calculator-01");
const require = createRequire(import.meta.url);
const engine = require(path.join(runtimeDir, "engine.js"));

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error && error.message ? error.message : String(error)));
  }
}

function near(actual, expected, tolerance = 1e-10) {
  assert.equal(typeof actual, "number", `得到 ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected}，得到 ${actual}`);
}

console.log("医疗计算器自测 · 第一层：页面按钮共用的内核用例");
const report = engine.runSelfTest();
for (const failure of report.failures) console.log("  FAIL " + failure.name + "\n       " + failure.why);
if (report.failures.length === 0) console.log("  ok   " + report.total + " 条全过");
failed += report.failures.length;

console.log("\n医疗计算器自测 · 第二层：独立复核规格公式与边界");

check("BMI = 体重 / 身高米数²", () => {
  near(engine.bmi(170, 65), 22.49134948096886, 1e-12);
});

check("Mosteller 体表面积", () => {
  near(engine.bodySurfaceArea(170, 65), 1.7519830034690533, 1e-12);
});

check("校正钙口径与白蛋白 4.0 边界", () => {
  near(engine.correctedCalcium(8.2, 3.0), 9.0, 1e-12);
  assert.equal(engine.correctedCalcium(8.2, 4.0), 8.2);
});

check("肌酐 µmol/L → mg/dL 使用 ÷88.4 近似换算", () => {
  near(engine.creatinineMgDl(88.4, "umoll"), 1, 1e-12);
  near(engine.egfr(55, "female", 106.08, "umoll"), 53.458108998805294, 1e-10);
});

check("CKD-EPI 2021 女性高段与女性系数", () => {
  near(engine.egfr(55, "female", 1.2, "mgdl"), 53.458108998805294, 1e-10);
});

check("CKD-EPI 2021 男性高段", () => {
  near(engine.egfr(55, "male", 1.1, "mgdl"), 79.27800559870123, 1e-10);
});

check("女性 κ=0.7 正好落在高低段跨越点且连续", () => {
  const expected = 142 * Math.pow(0.9938, 50) * 1.012;
  near(engine.egfr(50, "female", 0.7, "mgdl"), expected, 1e-12);
  const left = engine.egfr(50, "female", 0.7 - 1e-9, "mgdl");
  const right = engine.egfr(50, "female", 0.7 + 1e-9, "mgdl");
  assert.ok(Math.abs(left - right) < 1e-6, `跨点差 ${Math.abs(left - right)}`);
});

check("男性 κ=0.9 正好落在高低段跨越点且连续", () => {
  const expected = 142 * Math.pow(0.9938, 50);
  near(engine.egfr(50, "male", 0.9, "mgdl"), expected, 1e-12);
  const left = engine.egfr(50, "male", 0.9 - 1e-9, "mgdl");
  const right = engine.egfr(50, "male", 0.9 + 1e-9, "mgdl");
  assert.ok(Math.abs(left - right) < 1e-6, `跨点差 ${Math.abs(left - right)}`);
});

check("eGFR G1–G5 的每个分段端点", () => {
  const points = [
    [90, "G1"], [89.9, "G2"], [60, "G2"], [59.9, "G3a"], [45, "G3a"],
    [44.9, "G3b"], [30, "G3b"], [29.9, "G4"], [15, "G4"], [14.9, "G5"],
  ];
  for (const [value, stage] of points) assert.equal(engine.egfrStage(value), stage, `${value} 的分段`);
});

check("极端身高体重仍按公式计算", () => {
  near(engine.bmi(140, 40), 20.408163265306126, 1e-12);
  near(engine.bodySurfaceArea(210, 150), 2.958039891549808, 1e-12);
});

check("空、非数、零、负数和不支持的口径不抛错，返回 null", () => {
  assert.equal(engine.bmi(0, 65), null);
  assert.equal(engine.bmi(-170, 65), null);
  assert.equal(engine.bmi(Number.NaN, 65), null);
  assert.equal(engine.bodySurfaceArea(170, 0), null);
  assert.equal(engine.correctedCalcium(8.2, -1), null);
  assert.equal(engine.egfr(55, "", 1.2, "mgdl"), null);
  assert.equal(engine.egfr(55, "female", 1.2, "other"), null);
  assert.equal(engine.egfrStage(-1), null);
});

console.log("\n医疗计算器自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
