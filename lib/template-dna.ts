// 模板基因（DNA）—— 模板专区 v2 的多样性核心。
//
// v1 的病：525 个模板只换「配色 + 配图 seed」，骨架就 4 个、且都是单页，肉眼看
// 「完完全全都是一样的」。v2 用一组确定性「基因」把每个模板的版式 DNA 全维度
// 打散：布局家族（决定有哪些页/每页哪些章节）、每类章节的样式变体、配色、圆角、
// 密度、标题字族、配图 seed —— 每个维度由 slug 的不同 hash 独立选取，
// 服务端每次渲染一致，同子类下的多个模板彼此真正不同。
//
// 设计文档：docs/architecture/oceanleo-template-gallery-v2-multipage.md（oceandino repo）。

import { hashStr } from "./hash";
import { accentFxFor, type AccentFx } from "./template-effects";

// ————————————————————————————————————————————————————————————
// 配色（在 v1 的 8 色基础上扩展到 12 个，含中性/暗色/糖果色，拉开观感差异）
// ————————————————————————————————————————————————————————————

export interface PaletteV2 {
  key: string;
  /** wezhan 风格的色系归类（用于列表页色系筛选）。 */
  family: "multi" | "red" | "orange" | "green" | "blue" | "purple" | "dark" | "light";
  label: string;
  primary: string;
  primaryDark: string;
  gradFrom: string;
  gradTo: string;
  soft: string; // 浅色强调底
  ink: string; // 文字主色
  sub: string; // 文字次色
  accent: string; // hero 上高亮词
  heroDark: boolean; // hero 是否深底（决定 hero 文字颜色）
  swatch: string; // 列表色点
}

export const PALETTES_V2: PaletteV2[] = [
  { key: "ocean", family: "blue", label: "深海蓝", primary: "#2563eb", primaryDark: "#1d4ed8", gradFrom: "#1e3a8a", gradTo: "#3b82f6", soft: "#eff6ff", ink: "#0f172a", sub: "#475569", accent: "#93c5fd", heroDark: true, swatch: "#3b82f6" },
  { key: "teal", family: "blue", label: "青碧", primary: "#0d9488", primaryDark: "#0f766e", gradFrom: "#134e4a", gradTo: "#2dd4bf", soft: "#f0fdfa", ink: "#0b1f1d", sub: "#48635f", accent: "#5eead4", heroDark: true, swatch: "#14b8a6" },
  { key: "crimson", family: "red", label: "绯红", primary: "#e11d48", primaryDark: "#be123c", gradFrom: "#881337", gradTo: "#f43f5e", soft: "#fff1f2", ink: "#1c0a0f", sub: "#6b5158", accent: "#fda4af", heroDark: true, swatch: "#ef4444" },
  { key: "rose", family: "red", label: "玫瑰", primary: "#db2777", primaryDark: "#be185d", gradFrom: "#831843", gradTo: "#f472b6", soft: "#fdf2f8", ink: "#1f0a16", sub: "#6b4a5c", accent: "#f9a8d4", heroDark: true, swatch: "#ec4899" },
  { key: "amber", family: "orange", label: "琥珀", primary: "#ea580c", primaryDark: "#c2410c", gradFrom: "#7c2d12", gradTo: "#fb923c", soft: "#fff7ed", ink: "#1f1206", sub: "#6b5645", accent: "#fdba74", heroDark: true, swatch: "#f97316" },
  { key: "gold", family: "orange", label: "鎏金", primary: "#b45309", primaryDark: "#92400e", gradFrom: "#451a03", gradTo: "#f59e0b", soft: "#fffbeb", ink: "#1c1403", sub: "#6b5e3f", accent: "#fcd34d", heroDark: true, swatch: "#d97706" },
  { key: "forest", family: "green", label: "森绿", primary: "#16a34a", primaryDark: "#15803d", gradFrom: "#14532d", gradTo: "#22c55e", soft: "#f0fdf4", ink: "#0a1f12", sub: "#4b6354", accent: "#86efac", heroDark: true, swatch: "#22c55e" },
  { key: "lime", family: "green", label: "嫩绿", primary: "#65a30d", primaryDark: "#4d7c0f", gradFrom: "#365314", gradTo: "#a3e635", soft: "#f7fee7", ink: "#15200a", sub: "#566346", accent: "#bef264", heroDark: true, swatch: "#84cc16" },
  { key: "violet", family: "purple", label: "幻紫", primary: "#7c3aed", primaryDark: "#6d28d9", gradFrom: "#4c1d95", gradTo: "#a78bfa", soft: "#f5f3ff", ink: "#160a23", sub: "#564b63", accent: "#c4b5fd", heroDark: true, swatch: "#8b5cf6" },
  { key: "indigo", family: "purple", label: "靛蓝", primary: "#4f46e5", primaryDark: "#4338ca", gradFrom: "#312e81", gradTo: "#818cf8", soft: "#eef2ff", ink: "#0d0b23", sub: "#4c4b63", accent: "#a5b4fc", heroDark: true, swatch: "#6366f1" },
  { key: "graphite", family: "dark", label: "石墨黑", primary: "#0ea5e9", primaryDark: "#0284c7", gradFrom: "#0f172a", gradTo: "#1e293b", soft: "#f1f5f9", ink: "#0f172a", sub: "#475569", accent: "#38bdf8", heroDark: true, swatch: "#27272a" },
  { key: "paper", family: "light", label: "米白", primary: "#0f172a", primaryDark: "#020617", gradFrom: "#f8fafc", gradTo: "#e2e8f0", soft: "#f8fafc", ink: "#0f172a", sub: "#475569", accent: "#0f172a", heroDark: false, swatch: "#e5e7eb" },
];

export function paletteByKey(key: string): PaletteV2 {
  return PALETTES_V2.find((p) => p.key === key) ?? PALETTES_V2[0];
}

// ————————————————————————————————————————————————————————————
// 布局家族 —— 决定「有哪些页、每页用哪些章节、章节顺序」
// ————————————————————————————————————————————————————————————

export type PageKey =
  | "home"
  | "about"
  | "services"
  | "products"
  | "menu"
  | "works"
  | "cases"
  | "team"
  | "news"
  | "pricing"
  | "contact";

export const PAGE_LABEL: Record<PageKey, string> = {
  home: "首页",
  about: "关于我们",
  services: "服务项目",
  products: "产品中心",
  menu: "菜单",
  works: "作品案例",
  cases: "成功案例",
  team: "团队",
  news: "新闻资讯",
  pricing: "价格方案",
  contact: "联系我们",
};

// 章节种类（每页是若干 section 的有序拼装）。
export type SectionKind =
  | "hero"
  | "stats"
  | "about"
  | "features"
  | "services"
  | "products"
  | "menu"
  | "gallery"
  | "cases"
  | "team"
  | "pricing"
  | "process"
  | "testimonials"
  | "faq"
  | "logos"
  | "news"
  | "cta"
  | "contact"
  | "pageHeader";

export interface LayoutFamily {
  key: string;
  label: string;
  /** 页面集合（导航顺序）。第一个必须是 home。 */
  pages: PageKey[];
  /** 每页的章节序列（home 页内容最丰富）。 */
  sections: Record<string, SectionKind[]>;
  /** 这个家族适配哪些一级行业（用于把家族分配给子类）。空 = 通用。 */
  industries?: string[];
}

// 8 个布局家族，覆盖企业/机构/电商/餐饮/作品集/医疗/教育/极简等典型站型。
export const LAYOUT_FAMILIES: LayoutFamily[] = [
  {
    key: "corporate",
    label: "企业官网",
    industries: ["business", "media", "industry", "hardware", "logistics", "general", "tech", "org", "home", "grocery"],
    pages: ["home", "about", "services", "cases", "news", "contact"],
    sections: {
      home: ["hero", "logos", "stats", "about", "features", "services", "cases", "testimonials", "cta"],
      about: ["pageHeader", "about", "stats", "process", "team", "cta"],
      services: ["pageHeader", "services", "features", "pricing", "faq", "cta"],
      cases: ["pageHeader", "gallery", "cases", "testimonials", "cta"],
      news: ["pageHeader", "news", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "agency",
    label: "创意机构",
    industries: ["media", "tech", "general", "business", "life"],
    pages: ["home", "about", "services", "works", "contact"],
    sections: {
      home: ["hero", "logos", "features", "services", "gallery", "process", "testimonials", "stats", "cta"],
      about: ["pageHeader", "about", "team", "process", "cta"],
      services: ["pageHeader", "services", "features", "faq", "cta"],
      works: ["pageHeader", "gallery", "cases", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "commerce",
    label: "品牌商城",
    industries: ["fashion", "home", "grocery", "general", "hardware", "life"],
    pages: ["home", "products", "about", "news", "contact"],
    sections: {
      home: ["hero", "logos", "products", "features", "gallery", "testimonials", "news", "cta"],
      products: ["pageHeader", "products", "products", "cta"],
      about: ["pageHeader", "about", "stats", "process", "cta"],
      news: ["pageHeader", "news", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "restaurant",
    label: "餐饮美食",
    industries: ["food"],
    pages: ["home", "menu", "about", "contact"],
    sections: {
      home: ["hero", "stats", "about", "menu", "features", "gallery", "testimonials", "cta"],
      menu: ["pageHeader", "menu", "menu", "cta"],
      about: ["pageHeader", "about", "gallery", "team", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "portfolio",
    label: "作品工作室",
    industries: ["life", "media", "fashion"],
    pages: ["home", "works", "about", "contact"],
    sections: {
      home: ["hero", "gallery", "services", "process", "testimonials", "cta"],
      works: ["pageHeader", "gallery", "gallery", "cta"],
      about: ["pageHeader", "about", "team", "stats", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "clinic",
    label: "医疗健康",
    industries: ["grocery", "fashion", "life", "org"],
    pages: ["home", "services", "team", "news", "contact"],
    sections: {
      home: ["hero", "stats", "features", "services", "team", "testimonials", "faq", "cta"],
      services: ["pageHeader", "services", "features", "pricing", "cta"],
      team: ["pageHeader", "team", "stats", "cta"],
      news: ["pageHeader", "news", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "education",
    label: "教育培训",
    industries: ["org", "general", "business", "tech"],
    pages: ["home", "services", "team", "cases", "contact"],
    sections: {
      home: ["hero", "stats", "features", "services", "team", "cases", "testimonials", "cta"],
      services: ["pageHeader", "services", "pricing", "faq", "cta"],
      team: ["pageHeader", "team", "process", "cta"],
      cases: ["pageHeader", "gallery", "cases", "testimonials", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "minimal",
    label: "极简单品",
    industries: ["tech", "general", "business", "media", "org", "logistics", "hardware", "industry"],
    pages: ["home", "about", "pricing", "contact"],
    sections: {
      home: ["hero", "logos", "features", "process", "pricing", "faq", "testimonials", "cta"],
      about: ["pageHeader", "about", "stats", "team", "cta"],
      pricing: ["pageHeader", "pricing", "faq", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
];

export function layoutByKey(key: string): LayoutFamily {
  return LAYOUT_FAMILIES.find((f) => f.key === key) ?? LAYOUT_FAMILIES[0];
}

/** 给定行业，候选布局家族（适配该行业的优先，否则全集）。 */
export function familiesForIndustry(industryKey: string): LayoutFamily[] {
  const match = LAYOUT_FAMILIES.filter((f) => f.industries?.includes(industryKey));
  return match.length ? match : LAYOUT_FAMILIES;
}

// ————————————————————————————————————————————————————————————
// 其它风格基因
// ————————————————————————————————————————————————————————————

export type Radius = "sharp" | "soft" | "round";
export type Density = "compact" | "regular" | "airy";
export type FontKind = "sans" | "serif" | "geometric";

export interface RadiusTokens {
  card: string;
  btn: string;
  img: string;
  pill: string;
}
export const RADIUS_TOKENS: Record<Radius, RadiusTokens> = {
  sharp: { card: "0px", btn: "4px", img: "4px", pill: "4px" },
  soft: { card: "16px", btn: "10px", img: "16px", pill: "9999px" },
  round: { card: "24px", btn: "9999px", img: "24px", pill: "9999px" },
};

export interface DensityTokens {
  section: string; // section 上下内边距
  gap: string; // 栅格间距
  h1: string; // hero 标题字号
  h2: string; // 章节标题字号
}
export const DENSITY_TOKENS: Record<Density, DensityTokens> = {
  compact: { section: "48px", gap: "16px", h1: "2.25rem", h2: "1.6rem" },
  regular: { section: "72px", gap: "24px", h1: "3rem", h2: "2rem" },
  airy: { section: "104px", gap: "32px", h1: "3.75rem", h2: "2.4rem" },
};

export const FONT_STACK: Record<FontKind, string> = {
  sans: "-apple-system,'PingFang SC','Microsoft YaHei',Inter,system-ui,sans-serif",
  serif: "'Noto Serif SC','Songti SC',Georgia,'Times New Roman',serif",
  geometric: "'Century Gothic',Futura,'PingFang SC','Microsoft YaHei',sans-serif",
};

// ————————————————————————————————————————————————————————————
// DNA：把一个 slug 确定性映射成一整组基因
// ————————————————————————————————————————————————————————————

export interface TemplateDNA {
  layout: LayoutFamily;
  palette: PaletteV2;
  radius: Radius;
  density: Density;
  font: FontKind;
  /** 每类章节选用第几个样式变体（0-based，引擎里 % 变体数）。 */
  styleSeed: number;
  /** 配图基准 seed。 */
  imgSeed: number;
  /** 装饰/动效风格（渐变光斑 / 网格 / 光束…）。 */
  accentFx: AccentFx;
}

// 用不同盐值从 slug 派生互相独立的 hash，保证各维度不耦合。
function pick<T>(arr: T[], slug: string, salt: string): T {
  return arr[hashStr(slug + ":" + salt) % arr.length];
}

const RADII: Radius[] = ["sharp", "soft", "round"];
const DENSITIES: Density[] = ["compact", "regular", "airy"];
const FONTS: FontKind[] = ["sans", "serif", "geometric"];

export function dnaFor(
  slug: string,
  industryKey: string,
  variant: number,
  defaultPaletteFamily?: string,
): TemplateDNA {
  const families = familiesForIndustry(industryKey);
  // 同子类的多个变体尽量铺开不同布局家族 + 不同基因。variant*7 打散奇偶耦合，
  // 让相邻变体更可能落到不同家族。
  const layout =
    families[(hashStr(slug + ":layout") + variant * 7) % families.length];

  // 第 1 个变体倾向行业默认色系，其余在全 12 色里确定性轮换。
  let palette: PaletteV2;
  if (variant === 1 && defaultPaletteFamily) {
    const inFamily = PALETTES_V2.filter((p) => p.family === defaultPaletteFamily);
    palette = inFamily.length
      ? inFamily[hashStr(slug + ":pal") % inFamily.length]
      : pick(PALETTES_V2, slug, "pal");
  } else {
    palette = PALETTES_V2[(hashStr(slug + ":pal") + variant * 5) % PALETTES_V2.length];
  }

  return {
    layout,
    palette,
    radius: pick(RADII, slug, "radius"),
    density: pick(DENSITIES, slug, "density"),
    font: pick(FONTS, slug, "font"),
    styleSeed: hashStr(slug + ":style"),
    imgSeed: 100 + (hashStr(slug + ":img") % 90000),
    accentFx: accentFxFor(slug, layout.key),
  };
}
