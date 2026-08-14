/*
 * 换算器 · 计算内核（`unit-converter`，规格 docs/specs/oceanleo-plugins-v1/plugins/unit-converter.md）
 *
 * 页面靠它算，自测也靠它算：asset 仓 package.json 没有 "type"，.js 按 CommonJS 解析，
 * 浏览器拿全局、node 拿 module.exports，两边加载的是同一份字节。
 *
 * 不碰 DOM、不碰存储、不发请求、不用 eval / new Function：
 * 它要在 sandbox="allow-scripts"（无 allow-same-origin）的不透明源里照常工作。
 */
(function (root) {
  "use strict";

  /* 定义值。凡是能从别的定义值推出来的一律推，不手抄小数 —— 手抄就会有错位。 */
  var INCH_M = 0.0254;                 // 1 in = 25.4 mm，定义
  var POUND_KG = 0.45359237;           // 1 lb = 0.453 592 37 kg，定义
  var LBF_N = 4.4482216152605;         // 磅力，由 lb × 标准重力定义
  var GALLON_L = 3.785411784;          // 1 US gal，定义

  /**
   * 每个单位记「到基准单位的仿射式」：base = value × factor + offset。
   * 反向：value = (base − offset) / factor。线性单位 offset 为 0。
   * exact=false 表示这个换算依赖被测物质，不是定义值；substance 写出那个物质的名字。
   * label 是用户认得的名字，symbol 是他在纸面上看到的写法，两者都要能上屏。
   */
  var CATEGORIES = [
    {
      id: "length", label: "长度", base: "m", pair: ["m", "cm"],
      units: [
        { id: "m",   label: "米",   symbol: "m",   factor: 1,              exact: true },
        { id: "cm",  label: "厘米", symbol: "cm",  factor: 0.01,           exact: true },
        { id: "mm",  label: "毫米", symbol: "mm",  factor: 0.001,          exact: true },
        { id: "km",  label: "千米", symbol: "km",  factor: 1000,           exact: true },
        { id: "in",  label: "英寸", symbol: "in",  factor: INCH_M,         exact: true },
        { id: "ft",  label: "英尺", symbol: "ft",  factor: INCH_M * 12,    exact: true },
        { id: "yd",  label: "码",   symbol: "yd",  factor: INCH_M * 36,    exact: true },
        { id: "mi",  label: "英里", symbol: "mi",  factor: INCH_M * 63360, exact: true },
        { id: "nmi", label: "海里", symbol: "nmi", factor: 1852,           exact: true }
      ]
    },
    {
      id: "mass", label: "质量", base: "kg", pair: ["kg", "g"],
      units: [
        { id: "kg", label: "千克",     symbol: "kg", factor: 1,             exact: true },
        { id: "g",  label: "克",       symbol: "g",  factor: 0.001,         exact: true },
        { id: "mg", label: "毫克",     symbol: "mg", factor: 1e-6,          exact: true },
        { id: "t",  label: "吨",       symbol: "t",  factor: 1000,          exact: true },
        { id: "lb", label: "磅",       symbol: "lb", factor: POUND_KG,      exact: true },
        /* 常衡盎司是重量，和体积那个「美国液量盎司」不是一回事，名字里就要分开。 */
        { id: "oz", label: "常衡盎司", symbol: "oz", factor: POUND_KG / 16, exact: true }
      ]
    },
    {
      id: "temperature", label: "温度", base: "K", pair: ["C", "F"],
      units: [
        { id: "K", label: "开尔文", symbol: "K",  factor: 1,     offset: 0,                   exact: true },
        { id: "C", label: "摄氏度", symbol: "°C", factor: 1,     offset: 273.15,              exact: true },
        { id: "F", label: "华氏度", symbol: "°F", factor: 5 / 9, offset: 273.15 - 32 * 5 / 9, exact: true },
        { id: "R", label: "兰氏度", symbol: "°R", factor: 5 / 9, offset: 0,                   exact: true }
      ]
    },
    {
      id: "pressure", label: "压强", base: "Pa", pair: ["MPa", "psi"],
      units: [
        { id: "Pa",   label: "帕斯卡",       symbol: "Pa",   factor: 1,               exact: true },
        { id: "kPa",  label: "千帕",         symbol: "kPa",  factor: 1000,            exact: true },
        { id: "MPa",  label: "兆帕",         symbol: "MPa",  factor: 1e6,             exact: true },
        { id: "bar",  label: "巴",           symbol: "bar",  factor: 100000,          exact: true },
        { id: "atm",  label: "标准大气压",   symbol: "atm",  factor: 101325,          exact: true },
        { id: "mmHg", label: "毫米汞柱",     symbol: "mmHg", factor: 133.322387415,   exact: true },
        /* psi 由磅力与英寸推出，不手抄 6 894.757…。 */
        { id: "psi",  label: "磅每平方英寸", symbol: "psi",  factor: LBF_N / (INCH_M * INCH_M), exact: true }
      ]
    },
    {
      id: "energy", label: "能量", base: "J", pair: ["kWh", "kJ"],
      units: [
        { id: "J",    label: "焦耳",       symbol: "J",    factor: 1,               exact: true },
        { id: "kJ",   label: "千焦",       symbol: "kJ",   factor: 1000,            exact: true },
        { id: "kWh",  label: "千瓦时",     symbol: "kWh",  factor: 3.6e6,           exact: true },
        { id: "cal",  label: "热化学卡",   symbol: "cal",  factor: 4.184,           exact: true },
        { id: "kcal", label: "千卡",       symbol: "kcal", factor: 4184,            exact: true },
        { id: "eV",   label: "电子伏",     symbol: "eV",   factor: 1.602176634e-19, exact: true }
      ]
    },
    {
      id: "data", label: "数据量", base: "B", pair: ["KiB", "kB"],
      units: [
        { id: "B",   label: "字节",           symbol: "B",   factor: 1,             exact: true },
        { id: "kB",  label: "十进制千字节",   symbol: "kB",  factor: 1000,          exact: true },
        { id: "MB",  label: "十进制兆字节",   symbol: "MB",  factor: 1e6,           exact: true },
        { id: "GB",  label: "十进制吉字节",   symbol: "GB",  factor: 1e9,           exact: true },
        { id: "TB",  label: "十进制太字节",   symbol: "TB",  factor: 1e12,          exact: true },
        { id: "KiB", label: "二进制千字节",   symbol: "KiB", factor: 1024,          exact: true },
        { id: "MiB", label: "二进制兆字节",   symbol: "MiB", factor: 1048576,       exact: true },
        { id: "GiB", label: "二进制吉字节",   symbol: "GiB", factor: 1073741824,    exact: true },
        { id: "TiB", label: "二进制太字节",   symbol: "TiB", factor: 1099511627776, exact: true }
      ]
    },
    {
      id: "volume", label: "体积", base: "L", pair: ["flozUS", "mL"],
      units: [
        { id: "L",      label: "升",             symbol: "L",        factor: 1,             exact: true },
        { id: "mL",     label: "毫升",           symbol: "mL",       factor: 0.001,         exact: true },
        { id: "m3",     label: "立方米",         symbol: "m³",       factor: 1000,          exact: true },
        { id: "galUS",  label: "美制加仑",       symbol: "US gal",   factor: GALLON_L,      exact: true },
        /* 写全「美国」：同名的英制液量盎司口径不同，含糊成 fl oz 会让人倒错量。 */
        { id: "flozUS", label: "美国液量盎司",   symbol: "US fl oz", factor: GALLON_L / 128, exact: true }
      ]
    },
    {
      id: "glucose", label: "血糖", base: "mmol/L", pair: ["mgdL", "mmolL"],
      units: [
        { id: "mmolL", label: "毫摩尔每升", symbol: "mmol/L", factor: 1,        exact: true },
        {
          id: "mgdL", label: "毫克每分升", symbol: "mg/dL", factor: 1 / 18.0,
          exact: false, substance: "葡萄糖"
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

  /** 单位 id 在全部量纲里唯一，所以选了单位就等于选了量纲：界面不需要另立类别栏。 */
  function categoryOfUnit(unitId) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (findUnit(CATEGORIES[i], unitId)) return CATEGORIES[i];
    }
    return null;
  }

  /** 同量纲里的默认搭档：换单位换到了别的量纲时，另一端落到这一对上。 */
  function partnerOf(unitId) {
    var cat = categoryOfUnit(unitId);
    if (!cat) return null;
    if (cat.pair[0] !== unitId) return cat.pair[0];
    return cat.pair[1];
  }

  /**
   * 换一个数。两端只要有一端不是定义值，整个关系就不是精确的，
   * 并把那个被测物质的名字一起带出来 —— 桥上要写「葡萄糖近似换算」，不是一个符号。
   */
  function convert(fromId, value, toId) {
    var cat = categoryOfUnit(fromId);
    var from = findUnit(cat, fromId);
    var to = findUnit(cat, toId);
    if (!cat || !from || !to || typeof value !== "number" || !isFinite(value)) return null;
    var base = value * from.factor + (from.offset || 0);
    var out = (base - (to.offset || 0)) / to.factor;
    var exact = from.exact !== false && to.exact !== false;
    return {
      value: out,
      base: base,
      baseUnit: cat.base,
      category: cat.id,
      exact: exact,
      substance: exact ? "" : (from.substance || to.substance || ""),
      from: from,
      to: to
    };
  }

  /** 桥上那一句：精确就说精确，近似就把物质名写出来。 */
  function relationOf(fromId, toId) {
    var probe = convert(fromId, 1, toId);
    if (!probe) return "";
    if (probe.exact) return "精确定义";
    return (probe.substance ? probe.substance : "") + "近似换算";
  }

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

  /** 10 位有效数字，去掉尾零；过大过小走科学计数。格式化只影响显示。 */
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

  /** 用户敲进来的一串字：允许千分位空格、负号与科学计数，半截输入返回 null。 */
  function parse(raw) {
    var text = String(raw === undefined || raw === null ? "" : raw).replace(/[\s,]/g, "");
    if (text === "") return null;
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
    var value = Number(text);
    return isFinite(value) ? value : null;
  }

  var api = {
    CATEGORIES: CATEGORIES,
    findCategory: findCategory,
    findUnit: findUnit,
    categoryOfUnit: categoryOfUnit,
    partnerOf: partnerOf,
    convert: convert,
    relationOf: relationOf,
    format: format,
    parse: parse,
    /** 出厂那一对：1 m = 100 cm，规格 §5。首屏是一组能直接改的定义值，不是空框。 */
    DEFAULT: { from: "m", value: 1, to: "cm" }
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.UnitConverterEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
