// 网站模板图表数据的单一事实源。
//
// 图表不是装饰占位：一级行业决定指标口径、量级与常见走势，子类决定具体业务
// 场景，同一子类的不同模板再代表不同规模、不同年份窗口的虚构商家。所有变化都
// 来自这些稳定业务键，预览 HTML 与 website-source 工程对象因此始终拿到同一条曲线。

import { hashStr } from "./hash";
import { chartTitle, subEn, type Lang } from "./template-i18n";

export interface ChartSeriesMeta {
  slug: string;
  industryKey: string;
  subKey: string;
  subLabel: string;
  variant: number;
}

export interface ChartSeries {
  labels: string[];
  values: number[];
  unit: string;
  title: string;
  insight: string;
}

interface BiMetric {
  zh: string;
  en: string;
}

interface ChartProfile {
  unit: BiMetric;
  measure: BiMetric;
  range: readonly [number, number];
  curves: readonly (readonly [number, number, number])[];
}

const bi = (zh: string, en: string): BiMetric => ({ zh, en });

// 年度变化率不是全行业共用的一条增长直线。每组都保留真实小生意常见的放缓、
// 提速或短暂回落；最终值仍保持在适合官网示例的正向、可信区间。
const INDUSTRY_PROFILES: Readonly<Record<string, ChartProfile>> = {
  media: {
    unit: bi("个项目", "projects"),
    measure: bi("项目交付量", "project deliveries"),
    range: [24, 72],
    curves: [[0.06, 0.14, 0.08], [0.16, 0.03, 0.10], [-0.05, 0.18, 0.11], [0.09, 0.07, 0.15]],
  },
  business: {
    unit: bi("位客户", "client accounts"),
    measure: bi("客户服务量", "client activity"),
    range: [80, 240],
    curves: [[0.05, 0.08, 0.06], [-0.03, 0.11, 0.08], [0.09, 0.04, 0.05], [0.03, 0.12, 0.04]],
  },
  fashion: {
    unit: bi("单", "orders"),
    measure: bi("成交量", "orders"),
    range: [320, 960],
    curves: [[0.08, 0.17, 0.06], [0.14, -0.04, 0.12], [0.04, 0.09, 0.16], [-0.07, 0.19, 0.10]],
  },
  org: {
    unit: bi("人次", "people served"),
    measure: bi("服务覆盖量", "service reach"),
    range: [800, 2600],
    curves: [[0.03, 0.06, 0.04], [0.07, 0.02, 0.05], [-0.02, 0.08, 0.04], [0.04, 0.09, 0.02]],
  },
  tech: {
    unit: bi("个项目", "projects"),
    measure: bi("方案交付量", "solution deliveries"),
    range: [36, 120],
    curves: [[0.13, 0.22, 0.16], [0.08, 0.28, 0.12], [-0.06, 0.25, 0.18], [0.18, 0.10, 0.21]],
  },
  life: {
    unit: bi("单", "bookings"),
    measure: bi("服务预订量", "service bookings"),
    range: [140, 460],
    curves: [[0.04, 0.12, 0.07], [0.10, -0.03, 0.14], [-0.06, 0.16, 0.09], [0.07, 0.08, 0.11]],
  },
  food: {
    unit: bi("单", "bookings"),
    measure: bi("接待与预订量", "visits and bookings"),
    range: [900, 2600],
    curves: [[0.05, 0.14, 0.06], [-0.09, 0.19, 0.10], [0.12, 0.03, 0.09], [0.03, 0.17, 0.05]],
  },
  industry: {
    unit: bi("批", "batches"),
    measure: bi("生产交付量", "production deliveries"),
    range: [180, 620],
    curves: [[0.04, 0.07, 0.05], [0.02, 0.11, 0.04], [-0.03, 0.09, 0.08], [0.08, 0.03, 0.06]],
  },
  home: {
    unit: bi("单", "orders"),
    measure: bi("产品成交量", "product orders"),
    range: [500, 1800],
    curves: [[0.06, 0.12, 0.07], [0.14, 0.02, 0.09], [-0.05, 0.15, 0.10], [0.05, 0.09, 0.13]],
  },
  grocery: {
    unit: bi("批", "batches"),
    measure: bi("产品供应量", "supply volume"),
    range: [240, 900],
    curves: [[0.03, 0.09, 0.05], [-0.07, 0.14, 0.08], [0.10, 0.01, 0.07], [0.04, 0.12, 0.03]],
  },
  hardware: {
    unit: bi("台", "units"),
    measure: bi("产品与设备交付量", "product and equipment deliveries"),
    range: [90, 360],
    curves: [[0.04, 0.08, 0.06], [0.10, 0.02, 0.07], [-0.04, 0.12, 0.08], [0.06, 0.05, 0.10]],
  },
  logistics: {
    unit: bi("票", "shipments"),
    measure: bi("履约业务量", "fulfillment volume"),
    range: [1200, 4800],
    curves: [[0.07, 0.10, 0.08], [0.04, 0.15, 0.06], [-0.04, 0.13, 0.11], [0.11, 0.05, 0.10]],
  },
  general: {
    unit: bi("项", "engagements"),
    measure: bi("业务完成量", "completed engagements"),
    range: [60, 220],
    curves: [[0.05, 0.10, 0.06], [0.12, 0.02, 0.08], [-0.04, 0.13, 0.09], [0.04, 0.07, 0.11]],
  },
};

// 同一一级行业里，只有业务口径确实不同的子类才覆盖。比如美容院看服务人次，
// 货运看运单，酒店看间夜；其余子类沿用一级行业的合理默认值。
const SUBCATEGORY_PROFILES: Readonly<Record<string, ChartProfile>> = {
  hairsalon: {
    unit: bi("人次", "visits"), measure: bi("到店服务人次", "salon visits"), range: [520, 1500],
    curves: [[0.04, 0.13, 0.07], [0.11, -0.06, 0.16], [-0.08, 0.18, 0.10], [0.06, 0.09, 0.12]],
  },
  nails: {
    unit: bi("人次", "visits"), measure: bi("到店服务人次", "studio visits"), range: [360, 1100],
    curves: [[0.06, 0.15, 0.05], [0.13, -0.04, 0.14], [-0.06, 0.17, 0.11], [0.05, 0.10, 0.13]],
  },
  slimming: {
    unit: bi("人次", "visits"), measure: bi("到店服务人次", "wellness visits"), range: [420, 1300],
    curves: [[0.03, 0.12, 0.08], [0.09, -0.03, 0.15], [-0.05, 0.16, 0.09], [0.07, 0.08, 0.11]],
  },
  "medical-beauty": {
    unit: bi("人次", "visits"), measure: bi("到诊服务人次", "clinic visits"), range: [600, 1800],
    curves: [[0.05, 0.11, 0.07], [0.08, 0.03, 0.10], [-0.03, 0.14, 0.08], [0.06, 0.07, 0.12]],
  },
  hotel: {
    unit: bi("间夜", "room nights"), measure: bi("入住间夜量", "occupied room nights"), range: [1200, 4200],
    curves: [[0.03, 0.16, 0.07], [-0.11, 0.23, 0.12], [0.14, 0.02, 0.09], [0.05, 0.12, 0.06]],
  },
  resort: {
    unit: bi("间夜", "room nights"), measure: bi("入住间夜量", "occupied room nights"), range: [800, 2800],
    curves: [[0.04, 0.18, 0.06], [-0.12, 0.25, 0.11], [0.13, 0.01, 0.10], [0.06, 0.11, 0.08]],
  },
  hospital: {
    unit: bi("人次", "patient visits"), measure: bi("接诊人次", "patient visits"), range: [1800, 6200],
    curves: [[0.03, 0.06, 0.04], [0.07, 0.01, 0.05], [-0.02, 0.08, 0.04], [0.04, 0.05, 0.06]],
  },
  dental: {
    unit: bi("人次", "patient visits"), measure: bi("接诊人次", "patient visits"), range: [700, 2400],
    curves: [[0.04, 0.08, 0.05], [0.09, 0.01, 0.07], [-0.03, 0.11, 0.06], [0.05, 0.06, 0.09]],
  },
  machinery: {
    unit: bi("台", "units"), measure: bi("设备交付量", "equipment deliveries"), range: [48, 180],
    curves: [[0.03, 0.09, 0.05], [0.11, 0.01, 0.06], [-0.05, 0.13, 0.08], [0.05, 0.04, 0.10]],
  },
  auto: {
    unit: bi("辆", "vehicles"), measure: bi("车辆交付量", "vehicle deliveries"), range: [70, 260],
    curves: [[0.05, 0.10, 0.06], [0.12, 0.02, 0.07], [-0.04, 0.14, 0.09], [0.06, 0.05, 0.11]],
  },
  freight: {
    unit: bi("票", "shipments"), measure: bi("货运履约票数", "freight shipments"), range: [2400, 7200],
    curves: [[0.08, 0.09, 0.07], [0.03, 0.16, 0.06], [-0.03, 0.12, 0.11], [0.10, 0.04, 0.09]],
  },
  express: {
    unit: bi("件", "parcels"), measure: bi("快件处理量", "parcels handled"), range: [6000, 18000],
    curves: [[0.10, 0.13, 0.09], [0.06, 0.18, 0.07], [-0.02, 0.15, 0.12], [0.13, 0.05, 0.11]],
  },
  "house-rent": {
    unit: bi("单", "leases"), measure: bi("租赁签约量", "leases signed"), range: [90, 320],
    curves: [[0.04, 0.08, 0.05], [0.09, 0.01, 0.07], [-0.04, 0.12, 0.08], [0.05, 0.06, 0.09]],
  },
  "car-rent": {
    unit: bi("单", "rentals"), measure: bi("车辆出租单量", "vehicle rentals"), range: [260, 900],
    curves: [[0.06, 0.11, 0.07], [0.12, -0.02, 0.10], [-0.05, 0.15, 0.09], [0.07, 0.05, 0.12]],
  },
};

const YEAR_STARTS = [2018, 2019, 2020, 2021, 2022, 2023] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundedBusinessValue(value: number): number {
  if (value >= 1000) return Math.round(value / 10) * 10;
  if (value >= 100) return Math.round(value / 5) * 5;
  return Math.round(value);
}

function profileFor(meta: ChartSeriesMeta): ChartProfile {
  return SUBCATEGORY_PROFILES[meta.subKey]
    ?? INDUSTRY_PROFILES[meta.industryKey]
    ?? INDUSTRY_PROFILES.general;
}

/** 为一个具体行业、子类与模板变体生成确定性的四年业务曲线。 */
export function chartSeriesFor(meta: ChartSeriesMeta, lang: Lang): ChartSeries {
  const profile = profileFor(meta);
  const subSeed = hashStr(`${meta.industryKey}:${meta.subKey}:chart-profile`);
  const variantSeed = hashStr(`${meta.slug}:chart-variant`);
  const yearStart = YEAR_STARTS[(subSeed + (meta.variant - 1) * 2) % YEAR_STARTS.length];
  const labels = Array.from(
    { length: 4 },
    (_, index) => lang === "en" ? `${yearStart + index}` : `${yearStart + index}年`,
  );

  const [minimum, maximum] = profile.range;
  const subScale = (subSeed % 1001) / 1000;
  const businessBase = minimum + (maximum - minimum) * subScale;
  const variantScale = 0.88 + (variantSeed % 25) / 100;
  const values = [roundedBusinessValue(businessBase * variantScale)];
  const curve = profile.curves[(subSeed + meta.variant - 1) % profile.curves.length];
  const subTilt = (((subSeed >>> 9) % 5) - 2) * 0.005;
  // 同一行业里的不同子类也有自己的长期增速档位；模板变体则代表不同经营阶段。
  // 两项都只做有限偏移，既拉开曲线，又不把小生意数据推成离谱的暴涨暴跌。
  const subGrowthBias = (((subSeed >>> 14) % 11) - 2) * 0.01;
  const variantGrowthBias = (meta.variant - 3) * 0.008;

  for (let index = 0; index < curve.length; index += 1) {
    const jitter = ((hashStr(`${meta.industryKey}:${meta.subKey}:${meta.variant}:year:${index}`) % 7) - 3) * 0.01;
    const rate = clamp(
      curve[index] + subTilt + subGrowthBias + variantGrowthBias + jitter,
      -0.14,
      0.34,
    );
    values.push(Math.max(1, roundedBusinessValue(values[index] * (1 + rate))));
  }
  if (values.at(-1)! <= values[0]) {
    values[values.length - 1] = roundedBusinessValue(values[0] * 1.03);
  }

  const growth = Math.round(((values.at(-1)! - values[0]) / values[0]) * 100);
  const dipped = values.some((value, index) => index > 0 && value < values[index - 1]);
  const accelerating = values[3] / values[2] > values[1] / values[0] + 0.035;
  const subject = lang === "en" ? subEn(meta.subKey, meta.industryKey) : meta.subLabel;
  const measure = lang === "en" ? profile.measure.en : profile.measure.zh;
  const trend = lang === "en"
    ? dipped ? "recovered after a temporary dip" : accelerating ? "picked up pace" : "grew steadily"
    : dipped ? "经历阶段波动后回升" : accelerating ? "增速逐步抬升" : "保持稳步增长";

  return {
    labels,
    values,
    unit: lang === "en" ? profile.unit.en : profile.unit.zh,
    title: chartTitle(meta.industryKey, meta.subLabel, meta.subKey, lang),
    insight: lang === "en"
      ? `${subject} ${measure} ${trend}, with net growth of about ${growth}% across this four-year span.`
      : `${subject}${measure}${trend}，四年间净增约 ${growth}%。`,
  };
}
