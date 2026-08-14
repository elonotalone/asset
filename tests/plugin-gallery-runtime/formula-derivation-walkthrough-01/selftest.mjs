/*
 * 公式展开 · 计算内核自测
 * 直接加载 active-runtime 中交给浏览器的 engine.js 本体。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(
  here,
  "../../../content/active-runtime/plugin/formula-derivation-walkthrough-01",
);
const enginePath = path.join(runtimeDir, "engine.js");
const require = createRequire(import.meta.url);
const engine = require(enginePath);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (error) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (error?.message || String(error)));
  }
}

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    "期望 " + expected + "，得到 " + actual,
  );
}

function catchesCode(source, variables, code) {
  assert.throws(
    () => engine.evaluate(source, variables),
    (error) => error?.code === code,
    source + " 应报 " + code,
  );
}

console.log("公式展开自测 · 第一层：页面内置用例");
const builtIn = engine.runSelfTest();
for (const failure of builtIn.failures) {
  console.log("  FAIL " + failure.name + "\n       " + failure.why);
}
failed += builtIn.failures.length;
if (builtIn.failures.length === 0) {
  console.log("  ok   " + builtIn.total + " 条内置用例全过");
}

console.log("\n公式展开自测 · 第二层：规格判据");
const variables = {
  g: { value: 9.80665, unit: "m/s²" },
  t: { value: 2.4, unit: "s" },
  x: 0,
  length: { value: 1, unit: "m" },
};

check("tokenizer、递归下降 parser 覆盖四则、幂、括号、一元负号与内置函数", () => {
  close(engine.evaluate("-(2 + 3)^2 + abs(-4) + sqrt(9)", {}).value, -18);
  close(engine.evaluate("min(8, 3, 5) + max(1, 7)", {}).value, 10);
  close(engine.evaluate("pow(2, 3) + round(1.236, 2)", {}).value, 9.24);
});

check("自由落体中间值不截断，最终可独立格式化到 6 位有效数字", () => {
  const result = engine.evaluate("0.5*g*t^2", variables);
  close(result.value, 28.243152);
  assert.deepEqual(result.dimension, { L: 1 });
  assert.equal(engine.formatNumber(result.value), "28.2432");
});

const evidenceCases = [
  {
    basis: "定义",
    expression: "g",
    expectedDimension: { L: 1, T: -2 },
    outputUnit: "m/s²",
  },
  {
    basis: "代入",
    expression: "0.5*g*t^2",
    expectedDimension: { L: 1 },
    outputUnit: "m",
  },
  {
    basis: "代数变形",
    expression: "g*t^2/2",
    expectedDimension: { L: 1 },
    outputUnit: "m",
  },
  {
    basis: "恒等式",
    expression: "sqrt(t^2)",
    expectedDimension: { T: 1 },
    outputUnit: "s",
  },
  {
    basis: "取极限",
    expression: "1/(1+x)",
    expectedDimension: {},
    outputUnit: "1",
  },
  {
    basis: "单位换算",
    expression: "length",
    expectedDimension: { L: 1 },
    previousUnit: "m",
    outputUnit: "cm",
  },
  {
    basis: "近似",
    expression: "0.5*g*t^2",
    expectedDimension: { L: 1 },
    outputUnit: "m",
    precision: 2,
  },
];

check("七类推导依据各有一条，并且只允许单位换算改变显示单位", () => {
  assert.deepEqual(
    evidenceCases.map((item) => item.basis),
    engine.EVIDENCE_TYPES,
  );
  for (const spec of evidenceCases) {
    const step = engine.createStep({ ...spec, variables });
    assert.ok(
      engine.sameDimension(step.dimension, spec.expectedDimension),
      spec.basis + " 的量纲没有保持",
    );
    if (spec.basis === "单位换算") {
      assert.equal(step.unitChanged, true);
      assert.notEqual(spec.previousUnit, step.outputUnit);
      assert.equal(step.value, 100);
    } else {
      assert.equal(step.unitChanged, false, spec.basis + " 不该改变单位");
    }
  }
});

check("非单位换算依据试图改单位会被拒绝", () => {
  assert.throws(
    () => engine.createStep({
      basis: "代入",
      expression: "length",
      variables,
      expectedDimension: { L: 1 },
      previousUnit: "m",
      outputUnit: "cm",
    }),
    (error) => error?.code === "DIMENSION_MISMATCH",
  );
});

check("单位换算真的把 1 m 改为 100 cm，物理维度不变", () => {
  const converted = engine.convertUnit(1, "m", "cm");
  assert.equal(converted.value, 100);
  assert.equal(converted.fromUnit, "m");
  assert.equal(converted.toUnit, "cm");
  assert.equal(converted.unitChanged, true);
  assert.ok(engine.sameDimension(converted.dimension, { L: 1 }));
});

check("近似同时带出数值与误差，且误差未被提前截断", () => {
  const step = engine.createStep({
    basis: "近似",
    expression: "0.5*g*t^2",
    variables,
    expectedDimension: { L: 1 },
    outputUnit: "m",
    precision: 2,
  });
  assert.equal(step.value, 28.24);
  close(step.error, 0.003152);
  assert.match(step.explanation, /绝对误差 0\.003152 m/);
});

check("除数接近零、数值溢出、量纲不一致是三种代码与三条不同文案", () => {
  catchesCode("1/1e-13", {}, "DIVISION_NEAR_ZERO");
  catchesCode("exp(1000)", {}, "OVERFLOW");
  catchesCode("length+t", variables, "DIMENSION_MISMATCH");
  const messages = [
    engine.ERROR_MESSAGES.DIVISION_NEAR_ZERO,
    engine.ERROR_MESSAGES.OVERFLOW,
    engine.ERROR_MESSAGES.DIMENSION_MISMATCH,
  ];
  assert.equal(new Set(messages).size, 3);
  assert.match(messages[0], /除数接近零/);
  assert.match(messages[1], /数值溢出/);
  assert.match(messages[2], /量纲不一致/);
});

check("未定义符号被点名，坏字符被定位", () => {
  assert.throws(
    () => engine.evaluate("missing+1", {}),
    (error) => error?.code === "UNDEFINED_NAME" && /missing/.test(error.message),
  );
  assert.throws(
    () => engine.evaluate("2@3", {}),
    (error) => error?.code === "SYNTAX" && /@/.test(error.message),
  );
});

check("源码不含自由代码执行入口", () => {
  const source = fs.readFileSync(enginePath, "utf8");
  const forbidden = ["ev" + "al(", "new " + "Function", "Function" + "("];
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, "源码出现 " + token);
  }
});

console.log("\n公式展开自测汇总：" + (failed === 0 ? "0 项失败" : failed + " 项失败"));
console.log("公式展开自测：" + (failed === 0 ? "全部通过" : failed + " 项未通过"));
process.exit(failed === 0 ? 0 : 1);
