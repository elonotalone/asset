/*
 * 换算器 · 计算内核（`unit-converter`，规格 docs/specs/oceanleo-plugins-v1/plugins/unit-converter.md）
 *
 * 这个文件是**唯一的真相来源**：页面靠它算，自测也靠它算。
 * asset 仓 package.json 没有 "type"，所以 .js 按 CommonJS 解析 ——
 * 浏览器拿全局、node 拿 module.exports，两边加载的是同一份字节，
 * 自测因此测的是货架上真正跑的那个内核，不是它的副本。
 *
 * 安全：本文件不碰 DOM、不碰存储、不发请求、不用 eval / new Function。
 * 它在 sandbox="allow-scripts"（无 allow-same-origin）的不透明源里必须照常工作。
 */
(function (root) {
  "use strict";

  /* 定义值。凡是能从别的定义值推出来的，一律推，不手抄小数 —— 手抄就会有错位。 */
  var INCH_M = 0.0254;                 // 1 in = 25.4 mm，定义
  var POUND_KG = 0.45359237;           // 1 lb = 0.453 592 37 kg，定义
  var LBF_N = 4.4482216152605;         // 磅力，由 lb × 标准重力定义
  var GALLON_L = 3.785411784;          // 1 US gal，定义

  /**
   * 每个单位记「到基准单位的仿射式」：base = value × factor + offset。
   * 反向：value = (base − offset) / factor。线性单位 offset 为 0。
   * exact=false 表示这个换算依赖物质或口径，不是定义值。
   */
  var CATEGORIES = [
    {
      id: "length", label: "长度", base: "m",
      units: [
        { id: "m",   label: "米",     factor: 1,             exact: true },
        { id: "cm",  label: "厘米",   factor: 0.01,          exact: true },
        { id: "mm",  label: "毫米",   factor: 0.001,         exact: true },
        { id: "km",  label: "千米",   factor: 1000,          exact: true },
        { id: "in",  label: "英寸",   factor: INCH_M,        exact: true, note: "1 in = 25.4 mm，定义值" },
        { id: "ft",  label: "英尺",   factor: INCH_M * 12,   exact: true, note: "1 ft = 12 in" },
        { id: "yd",  label: "码",     factor: INCH_M * 36,   exact: true, note: "1 yd = 36 in" },
        { id: "mi",  label: "英里",   factor: INCH_M * 63360, exact: true, note: "1 mi = 63 360 in" },
        { id: "nmi", label: "海里",   factor: 1852,          exact: true, note: "1 nmi = 1 852 m，定义值" }
      ]
    },
    {
      id: "mass", label: "质量", base: "kg",
      units: [
        { id: "kg", label: "千克", factor: 1,                 exact: true },
        { id: "g",  label: "克",   factor: 0.001,             exact: true },
        { id: "mg", label: "毫克", factor: 1e-6,              exact: true },
        { id: "t",  label: "吨",   factor: 1000,              exact: true },
        { id: "lb", label: "磅",   factor: POUND_KG,          exact: true, note: "1 lb = 0.453 592 37 kg，定义值" },
        { id: "oz", label: "盎司", factor: POUND_KG / 16,     exact: true, note: "1 lb = 16 oz" }
      ]
    },
    {
      id: "temperature", label: "温度", base: "K", affine: true,
      units: [
        { id: "K",  label: "开尔文",   factor: 1,     offset: 0,                          exact: true },
        { id: "C",  label: "摄氏度",   factor: 1,     offset: 273.15,                     exact: true, note: "K = °C + 273.15" },
        { id: "F",  label: "华氏度",   factor: 5 / 9, offset: 273.15 - 32 * 5 / 9,        exact: true, note: "K = (°F − 32) × 5/9 + 273.15" },
        { id: "R",  label: "兰氏度",   factor: 5 / 9, offset: 0,                          exact: true, note: "K = °R × 5/9" }
      ]
    },
    {
      id: "pressure", label: "压强", base: "Pa",
      units: [
        { id: "Pa",   label: "帕斯卡",   factor: 1,                          exact: true },
        { id: "kPa",  label: "千帕",     factor: 1000,                       exact: true },
        { id: "MPa",  label: "兆帕",     factor: 1e6,                        exact: true },
        { id: "bar",  label: "巴",       factor: 100000,                     exact: true },
        { id: "atm",  label: "标准大气压", factor: 101325,                    exact: true, note: "1 atm = 101 325 Pa，定义值" },
        { id: "mmHg", label: "毫米汞柱", factor: 133.322387415,              exact: true, note: "1 mmHg = 133.322 387 415 Pa，定义值" },
        { id: "psi",  label: "磅每平方英寸", factor: LBF_N / (INCH_M * INCH_M), exact: true, note: "由磅力与英寸推出，不手抄小数" }
      ]
    },
    {
      id: "energy", label: "能量", base: "J",
      units: [
        { id: "J",    label: "焦耳",     factor: 1,               exact: true },
        { id: "kJ",   label: "千焦",     factor: 1000,            exact: true },
        { id: "kWh",  label: "千瓦时",   factor: 3.6e6,           exact: true, note: "1 kWh = 3.6 MJ" },
        { id: "cal",  label: "卡（热化学）", factor: 4.184,        exact: true, note: "热化学卡，定义为 4.184 J" },
        { id: "kcal", label: "千卡",     factor: 4184,            exact: true },
        { id: "eV",   label: "电子伏",   factor: 1.602176634e-19, exact: true, note: "SI 2019 起为定义值" }
      ]
    },
    {
      id: "data", label: "数据量", base: "B",
      units: [
        { id: "B",   label: "字节",     factor: 1,                exact: true },
        { id: "kB",  label: "千字节",   factor: 1000,             exact: true, note: "十进制，1 kB = 1 000 B" },
        { id: "MB",  label: "兆字节",   factor: 1e6,              exact: true, note: "十进制" },
        { id: "GB",  label: "吉字节",   factor: 1e9,              exact: true, note: "十进制" },
        { id: "TB",  label: "太字节",   factor: 1e12,             exact: true, note: "十进制" },
        { id: "KiB", label: "二进制千字节", factor: 1024,          exact: true, note: "二进制，1 KiB = 1 024 B。与 kB 不是同一进制，符号不能混用" },
        { id: "MiB", label: "二进制兆字节", factor: 1048576,       exact: true, note: "二进制" },
        { id: "GiB", label: "二进制吉字节", factor: 1073741824,    exact: true, note: "二进制" },
        { id: "TiB", label: "二进制太字节", factor: 1099511627776, exact: true, note: "二进制" }
      ]
    },
    {
      id: "volume", label: "体积", base: "L",
      units: [
        { id: "L",    label: "升",       factor: 1,                 exact: true },
        { id: "mL",   label: "毫升",     factor: 0.001,             exact: true },
        { id: "m3",   label: "立方米",   factor: 1000,              exact: true },
        { id: "galUS", label: "加仑（美）", factor: GALLON_L,        exact: true, note: "1 US gal = 3.785 411 784 L，定义值" },
        { id: "flozUS", label: "液量盎司（美）", factor: GALLON_L / 128, exact: true, note: "1 US gal = 128 fl oz" }
      ]
    },
    {
      id: "glucose", label: "血糖", base: "mmol/L",
      units: [
        { id: "mmolL", label: "毫摩尔每升", factor: 1,        exact: true },
        {
          id: "mgdL", label: "毫克每分升", factor: 1 / 18.0, exact: false,
          note: "常见近似因子 ÷18.0。**依赖被测物质（葡萄糖）**，与长度那种定义值性质不同"
        }
      ]
    }
  ];

  function findCategory(catId) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === catId) return CATEGORIES[i];
    }
    return null;
  }

  function findUnit(cat, unitId) {
    if (!cat) return null;
    for (var i = 0; i < cat.units.length; i++) {
      if (cat.units[i].id === unitId) return cat.units[i];
    }
    return null;
  }

  /** 换一个数。返回 null 表示类别或单位不认识（调用方自己决定怎么显示）。 */
  function convert(catId, fromId, value, toId) {
    var cat = findCategory(catId);
    var from = findUnit(cat, fromId);
    var to = findUnit(cat, toId);
    if (!cat || !from || !to || typeof value !== "number" || !isFinite(value)) return null;
    var base = value * from.factor + (from.offset || 0);
    var out = (base - (to.offset || 0)) / to.factor;
    return {
      value: out,
      base: base,
      baseUnit: cat.base,
      exact: from.exact !== false && to.exact !== false,
      from: from,
      to: to
    };
  }

  /** 一个输入，一列结果 —— 面板要的就是这个形状。 */
  function convertAll(catId, fromId, value) {
    var cat = findCategory(catId);
    if (!cat) return [];
    var rows = [];
    for (var i = 0; i < cat.units.length; i++) {
      var u = cat.units[i];
      var r = convert(catId, fromId, value, u.id);
      if (!r) continue;
      rows.push({
        unitId: u.id,
        label: u.label,
        symbol: symbolOf(u.id),
        value: r.value,
        exact: r.exact,
        isSource: u.id === fromId,
        factor: u.factor,
        offset: u.offset || 0,
        baseUnit: cat.base,
        note: u.note || ""
      });
    }
    return rows;
  }

  /* 显示符号与内部 id 分开：id 要能安全进 DOM 属性，符号要好看。 */
  var SYMBOLS = {
    m: "m", cm: "cm", mm: "mm", km: "km", in: "in", ft: "ft", yd: "yd", mi: "mi", nmi: "nmi",
    kg: "kg", g: "g", mg: "mg", t: "t", lb: "lb", oz: "oz",
    K: "K", C: "°C", F: "°F", R: "°R",
    Pa: "Pa", kPa: "kPa", MPa: "MPa", bar: "bar", atm: "atm", mmHg: "mmHg", psi: "psi",
    J: "J", kJ: "kJ", kWh: "kWh", cal: "cal", kcal: "kcal", eV: "eV",
    B: "B", kB: "kB", MB: "MB", GB: "GB", TB: "TB",
    KiB: "KiB", MiB: "MiB", GiB: "GiB", TiB: "TiB",
    L: "L", mL: "mL", m3: "m³", galUS: "gal", flozUS: "fl oz",
    mmolL: "mmol/L", mgdL: "mg/dL"
  };

  function symbolOf(id) { return SYMBOLS[id] || id; }

  /** 千分位只加在整数部分；小数原样保留，免得看起来像被四舍五入过。 */
  function group(intPart) {
    var neg = intPart.charAt(0) === "-";
    var digits = neg ? intPart.slice(1) : intPart;
    var out = "";
    var count = 0;
    for (var i = digits.length - 1; i >= 0; i--) {
      out = digits.charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) out = " " + out;
    }
    return (neg ? "-" : "") + out;
  }

  /** 10 位有效数字，去掉尾零；过大过小走科学计数。 */
  function format(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    if (n === 0) return "0";
    var abs = Math.abs(n);
    if (abs >= 1e15 || abs < 1e-9) {
      return n.toExponential(6).replace(/e([+-])(\d)$/, "e$10$2");
    }
    var s = n.toPrecision(10);
    if (s.indexOf("e") >= 0) s = Number(s).toFixed(12);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    var parts = s.split(".");
    return group(parts[0]) + (parts.length > 1 ? "." + parts[1] : "");
  }

  /**
   * 自测用例。**期望值全部抄自规格「已查证的知识」那一节**，不是我算完再回填的。
   * tol=0 表示这是定义值，必须逐位相等。
   */
  var CASES = [
    { name: "1 in = 25.4 mm（定义值）", cat: "length", from: "in", value: 1, to: "mm", expect: 25.4, tol: 0, exact: true },
    { name: "1 lb = 0.453 592 37 kg（定义值）", cat: "mass", from: "lb", value: 1, to: "kg", expect: 0.45359237, tol: 0, exact: true },
    { name: "1 nmi = 1 852 m（定义值）", cat: "length", from: "nmi", value: 1, to: "m", expect: 1852, tol: 0, exact: true },
    { name: "1 atm = 101 325 Pa（定义值）", cat: "pressure", from: "atm", value: 1, to: "Pa", expect: 101325, tol: 0, exact: true },
    { name: "100 °C = 373.15 K", cat: "temperature", from: "C", value: 100, to: "K", expect: 373.15, tol: 1e-9, exact: true },
    { name: "100 °C = 212 °F", cat: "temperature", from: "C", value: 100, to: "F", expect: 212, tol: 1e-9, exact: true },
    { name: "−40 °C = −40 °F（两标相交那一点）", cat: "temperature", from: "C", value: -40, to: "F", expect: -40, tol: 1e-9, exact: true },
    { name: "0 K = −273.15 °C", cat: "temperature", from: "K", value: 0, to: "C", expect: -273.15, tol: 1e-9, exact: true },
    { name: "1 KiB = 1 024 B（二进制）", cat: "data", from: "KiB", value: 1, to: "B", expect: 1024, tol: 0, exact: true },
    { name: "1 kB = 1 000 B（十进制，与 KiB 不是一回事）", cat: "data", from: "kB", value: 1, to: "B", expect: 1000, tol: 0, exact: true },
    { name: "1 KiB = 1.024 kB（两种进制不能混用）", cat: "data", from: "KiB", value: 1, to: "kB", expect: 1.024, tol: 1e-12, exact: true },
    { name: "100 mg/dL 血糖 ≈ 5.5556 mmol/L（÷18.0）", cat: "glucose", from: "mgdL", value: 100, to: "mmolL", expect: 100 / 18.0, tol: 1e-12, exact: false },
    { name: "1 m = 100 cm", cat: "length", from: "m", value: 1, to: "cm", expect: 100, tol: 1e-12, exact: true },
    { name: "1 m = 39.370 078 74 in", cat: "length", from: "m", value: 1, to: "in", expect: 1 / 0.0254, tol: 1e-12, exact: true },
    { name: "1 ft = 12 in", cat: "length", from: "ft", value: 1, to: "in", expect: 12, tol: 1e-12, exact: true },
    { name: "1 kWh = 3 600 000 J", cat: "energy", from: "kWh", value: 1, to: "J", expect: 3.6e6, tol: 0, exact: true },
    { name: "1 US gal = 3.785 411 784 L（定义值）", cat: "volume", from: "galUS", value: 1, to: "L", expect: 3.785411784, tol: 0, exact: true },
    { name: "1 lb = 16 oz", cat: "mass", from: "lb", value: 1, to: "oz", expect: 16, tol: 1e-12, exact: true },
    { name: "0 °C 换 0 °C 不变（同单位恒等）", cat: "temperature", from: "C", value: 0, to: "C", expect: 0, tol: 1e-12, exact: true },
    { name: "1 psi ≈ 6 894.757 Pa（由磅力与英寸推出）", cat: "pressure", from: "psi", value: 1, to: "Pa", expect: 6894.757293168361, tol: 1e-9, exact: true }
  ];

  /** 跑一遍全部用例。返回结构给 node 自测与页面自测共用。 */
  function runSelfTest() {
    var failures = [];
    for (var i = 0; i < CASES.length; i++) {
      var c = CASES[i];
      var got = convert(c.cat, c.from, c.value, c.to);
      if (!got) {
        failures.push({ name: c.name, why: "换算返回 null（类别或单位不认识）" });
        continue;
      }
      var diff = Math.abs(got.value - c.expect);
      if (!(diff <= c.tol)) {
        failures.push({
          name: c.name,
          why: "期望 " + c.expect + "，得到 " + got.value + "，差 " + diff + " 超过容差 " + c.tol
        });
        continue;
      }
      if (typeof c.exact === "boolean" && got.exact !== c.exact) {
        failures.push({
          name: c.name,
          why: "精确标记应为 " + c.exact + "，得到 " + got.exact
        });
      }
    }
    return { total: CASES.length, passed: CASES.length - failures.length, failures: failures };
  }

  var api = {
    CATEGORIES: CATEGORIES,
    CASES: CASES,
    findCategory: findCategory,
    findUnit: findUnit,
    convert: convert,
    convertAll: convertAll,
    symbolOf: symbolOf,
    format: format,
    runSelfTest: runSelfTest,
    /** 首屏出厂读数：规格要求「第一屏展示一组可直接修改的出厂换算，而不是空框」。 */
    DEFAULT: { cat: "length", from: "m", value: 1 }
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.UnitConverterEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
