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
// 配色（v2.2 扩展到 16 个：8 基础 + 中性/暗色/糖果色 + 摩卡棕/墨绿金/藕荷/冰川，
// 拉开观感差异；family 仍归入列表页的 8 个色系筛选）
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
  // v2.2 新增 4 个个性配色
  { key: "mocha", family: "orange", label: "摩卡棕", primary: "#92400e", primaryDark: "#78350f", gradFrom: "#3f2212", gradTo: "#b45309", soft: "#fef3e7", ink: "#241407", sub: "#6f5b48", accent: "#e7b98a", heroDark: true, swatch: "#a16207" },
  { key: "jade-gold", family: "green", label: "墨绿金", primary: "#065f46", primaryDark: "#064e3b", gradFrom: "#022c22", gradTo: "#0f766e", soft: "#ecfdf5", ink: "#062019", sub: "#4a635b", accent: "#fbbf24", heroDark: true, swatch: "#047857" },
  { key: "mauve", family: "purple", label: "藕荷", primary: "#9d5b8b", primaryDark: "#82486f", gradFrom: "#4a2545", gradTo: "#c084ac", soft: "#faf3f8", ink: "#2a1526", sub: "#6d5566", accent: "#e9c3dc", heroDark: true, swatch: "#b06fa0" },
  { key: "glacier", family: "light", label: "冰川灰蓝", primary: "#334155", primaryDark: "#1e293b", gradFrom: "#e0f2fe", gradTo: "#cbd5e1", soft: "#f0f9ff", ink: "#0f172a", sub: "#526074", accent: "#0369a1", heroDark: false, swatch: "#94a3b8" },
  // v3 新增：整站深色霓虹配色（专供 neon-tech 特色家族；family 仍归 dark 以便色系筛选）。
  { key: "neon-cyan", family: "dark", label: "霓虹青", primary: "#22d3ee", primaryDark: "#06b6d4", gradFrom: "#0e7490", gradTo: "#22d3ee", soft: "#0b1220", ink: "#e5f6ff", sub: "#7d9bb0", accent: "#67e8f9", heroDark: true, swatch: "#22d3ee" },
  { key: "neon-violet", family: "dark", label: "霓虹紫", primary: "#a855f7", primaryDark: "#9333ea", gradFrom: "#6d28d9", gradTo: "#c084fc", soft: "#120b1f", ink: "#f0e7ff", sub: "#9b86b5", accent: "#d8b4fe", heroDark: true, swatch: "#a855f7" },
  { key: "neon-magenta", family: "dark", label: "霓虹品红", primary: "#f472b6", primaryDark: "#ec4899", gradFrom: "#9d174d", gradTo: "#fb7185", soft: "#1a0b14", ink: "#ffe7f3", sub: "#b3859c", accent: "#f9a8d4", heroDark: true, swatch: "#f472b6" },
];

/** v3：整站深色底的配色 key（signature 家族与引擎据此切换背景/文字策略）。 */
export const DARK_PALETTE_KEYS = new Set(["neon-cyan", "neon-violet", "neon-magenta"]);

/**
 * 非特色家族可用的配色池（= 全部配色，剔除整站深色霓虹三色）。
 *
 * 为什么剔除：深色霓虹配色（forceDark）的 `ink/sub` 是**近白**文字、`soft` 是
 * **近黑**底，只有配合 neon-tech 家族那套「深色感知」的 `sig*` 渲染器才成立。
 * 普通家族的通用渲染器写死了 `bg-white / #fff` 浅底，一旦随机轮换抽到深色配色，
 * 近白文字压在白底上 = 直接不可读（asset.oceanleo.com/templates 上大量模板正文/
 * 标题「看不清」的根因，2026-07-04 修）。因此深色霓虹三色**只**由 neon-tech 家族
 * 通过 `signature.palettePool` 显式选用，绝不进入普通家族的随机色池。
 */
export const LIGHT_PALETTES_V2: PaletteV2[] = PALETTES_V2.filter(
  (p) => !DARK_PALETTE_KEYS.has(p.key),
);

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
  | "gallery"
  | "timeline"
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
  gallery: "图库展示",
  timeline: "发展历程",
  contact: "联系我们",
};

// 章节种类（每页是若干 section 的有序拼装）。
// v2.2 新增：chart（数据图表）/ timeline（里程碑时间线）/ marquee（滚动徽标带）。
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
  | "chart"
  | "timeline"
  | "marquee"
  | "cta"
  | "contact"
  | "pageHeader"
  // ————— v3 特色家族专属章节（sig 命名空间，不复用共享视觉语汇） —————
  // editorial 杂志编辑风
  | "sigEditorialHero"
  | "sigEditorialFeature"
  | "sigEditorialGallery"
  | "sigPullQuote"
  // neon-tech 深色霓虹科技风
  | "sigNeonHero"
  | "sigGlassGrid"
  | "sigNeonStats"
  | "sigCodeWindow"
  // fullscreen-scroll 全屏叙事风
  | "sigFsIntro"
  | "sigFsPanel"
  | "sigFsSplit"
  // bento 便当格栅风
  | "sigBentoHero"
  | "sigBentoFeatures"
  // brutalist 粗野主义风
  | "sigBrutalHero"
  | "sigBrutalCards"
  | "sigStickerCta";

export interface LayoutFamily {
  key: string;
  label: string;
  /** 页面集合（导航顺序）。第一个必须是 home。 */
  pages: PageKey[];
  /** 每页的章节序列（home 页内容最丰富）。 */
  sections: Record<string, SectionKind[]>;
  /** 这个家族适配哪些一级行业（用于把家族分配给子类）。空 = 通用。 */
  industries?: string[];
  /**
   * v3 特色家族：钉死主题维度，覆盖 slug 随机 DNA，形成「一眼可辨」的统一强风格。
   * 只有特色家族设它；普通家族不设，仍走全维度随机 DNA。未指定的维度仍随机，
   * 保留家族内部微多样。
   */
  signature?: {
    /** 只在这些配色 key 里选（如 neon 只用深色霓虹三色）。 */
    palettePool?: string[];
    radius?: Radius;
    density?: Density;
    font?: FontKind;
    fx?: AccentFx;
    /** 整站深色底（引擎据此切换 body 背景 / 章节底色策略）。 */
    forceDark?: boolean;
  };
}

// 16 个布局家族（v2.2：8 经典 + 8 行业气质款）。多样性三原则：
//  1. 家族之间首页开场就不同（hero 开场 / gallery 开场 / pageHeader 克制开场…），
//     中段信息架构（章节序列）互不雷同；
//  2. 同一家族内不同页面的中段序列不得相同（除 pageHeader 开头、cta/contact 结尾）；
//  3. 页数 3–6 页不等，拉开「站型体量感」。
export const LAYOUT_FAMILIES: LayoutFamily[] = [
  // —— 经典 8 款（key 兼容 v2.1，内部编排全部重排拉开差异） ——
  {
    key: "corporate",
    label: "企业官网",
    industries: ["business", "media", "industry", "hardware", "logistics", "general", "tech", "org", "home"],
    pages: ["home", "about", "services", "cases", "news", "contact"],
    sections: {
      home: ["hero", "marquee", "about", "services", "stats", "cases", "cta"],
      about: ["pageHeader", "about", "timeline", "team", "cta"],
      services: ["pageHeader", "services", "process", "faq", "cta"],
      cases: ["pageHeader", "cases", "chart", "testimonials", "cta"],
      news: ["pageHeader", "news", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "agency",
    label: "创意机构",
    industries: ["media", "tech", "general", "business", "life"],
    pages: ["home", "works", "services", "about", "contact"],
    sections: {
      home: ["hero", "gallery", "services", "marquee", "testimonials", "cta"],
      works: ["pageHeader", "gallery", "cases", "cta"],
      services: ["pageHeader", "services", "process", "pricing", "cta"],
      about: ["pageHeader", "about", "team", "logos", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "commerce",
    label: "品牌商城",
    industries: ["fashion", "home", "grocery", "general", "hardware", "food"],
    pages: ["home", "products", "about", "news", "contact"],
    sections: {
      home: ["hero", "marquee", "products", "features", "stats", "news", "cta"],
      products: ["pageHeader", "products", "gallery", "cta"],
      about: ["pageHeader", "about", "timeline", "logos", "cta"],
      news: ["pageHeader", "news", "testimonials", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "restaurant",
    label: "餐饮美食",
    industries: ["food"],
    pages: ["home", "menu", "about", "contact"],
    sections: {
      home: ["hero", "menu", "about", "gallery", "testimonials", "cta"],
      menu: ["pageHeader", "menu", "pricing", "faq", "cta"],
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
      home: ["hero", "gallery", "about", "cta"],
      works: ["pageHeader", "gallery", "cases", "testimonials", "cta"],
      about: ["pageHeader", "about", "stats", "services", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "clinic",
    label: "医疗健康",
    industries: ["grocery", "fashion", "life", "org"],
    pages: ["home", "services", "team", "news", "contact"],
    sections: {
      home: ["hero", "features", "services", "team", "faq", "cta"],
      services: ["pageHeader", "services", "process", "pricing", "cta"],
      team: ["pageHeader", "team", "stats", "testimonials", "cta"],
      news: ["pageHeader", "news", "faq", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "education",
    label: "教育培训",
    industries: ["org", "general", "business", "tech"],
    pages: ["home", "services", "team", "cases", "contact"],
    sections: {
      home: ["hero", "about", "services", "stats", "cases", "cta"],
      services: ["pageHeader", "services", "pricing", "faq", "cta"],
      team: ["pageHeader", "team", "process", "cta"],
      cases: ["pageHeader", "cases", "testimonials", "gallery", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    key: "minimal",
    label: "极简单品",
    industries: ["tech", "general", "business", "media", "org", "logistics", "hardware", "industry", "home"],
    pages: ["home", "pricing", "contact"],
    sections: {
      home: ["hero", "features", "process", "testimonials", "cta"],
      pricing: ["pageHeader", "pricing", "faq", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },

  // —— 行业气质 8 款（v2.2 新增） ——
  {
    // 文旅酒店：满屏图感 + 客房设施 + 口碑与常见问题，带独立图库页。
    key: "hotel-resort",
    label: "文旅酒店",
    industries: ["food"],
    pages: ["home", "gallery", "services", "about", "contact"],
    sections: {
      home: ["hero", "gallery", "features", "testimonials", "faq", "cta"],
      gallery: ["pageHeader", "gallery", "stats", "cta"],
      services: ["pageHeader", "services", "pricing", "process", "cta"],
      about: ["pageHeader", "about", "timeline", "team", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 法律/专业服务：克制，无大图 hero，首页用 pageHeader 式开场，重案例/团队/FAQ。
    key: "legal-pro",
    label: "专业事务所",
    industries: ["business", "org"],
    pages: ["home", "cases", "team", "about", "contact"],
    sections: {
      home: ["pageHeader", "about", "cases", "team", "faq", "cta"],
      cases: ["pageHeader", "cases", "stats", "testimonials", "cta"],
      team: ["pageHeader", "team", "faq", "cta"],
      about: ["pageHeader", "about", "timeline", "logos", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 制造工业：数字与产线说话（stats/process/chart），带独立发展历程页。
    key: "factory",
    label: "制造工业",
    industries: ["industry", "hardware", "home"],
    pages: ["home", "products", "about", "timeline", "cases", "contact"],
    sections: {
      home: ["hero", "stats", "products", "process", "logos", "cta"],
      products: ["pageHeader", "products", "features", "chart", "cta"],
      about: ["pageHeader", "about", "stats", "team", "cta"],
      timeline: ["pageHeader", "timeline", "marquee", "cta"],
      cases: ["pageHeader", "cases", "logos", "testimonials", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 农业环保：土地故事优先（about/process/gallery），带独立图库页。
    key: "agri-eco",
    label: "农业环保",
    industries: ["industry", "food", "grocery"],
    pages: ["home", "about", "products", "gallery", "contact"],
    sections: {
      home: ["hero", "about", "process", "gallery", "stats", "cta"],
      about: ["pageHeader", "about", "timeline", "testimonials", "cta"],
      products: ["pageHeader", "products", "features", "faq", "cta"],
      gallery: ["pageHeader", "gallery", "marquee", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 汽车服务：项目 + 工序 + 价格 + 常见问题的「到店决策」链路。
    key: "auto-service",
    label: "汽车服务",
    industries: ["hardware", "life", "logistics"],
    pages: ["home", "services", "pricing", "about", "contact"],
    sections: {
      home: ["hero", "services", "process", "pricing", "faq", "cta"],
      services: ["pageHeader", "services", "features", "faq", "cta"],
      pricing: ["pageHeader", "pricing", "testimonials", "cta"],
      about: ["pageHeader", "about", "stats", "gallery", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 婚庆摄影：作品画廊主导，首页直接大画廊开场（hero 退居第二位）。
    key: "wedding-photo",
    label: "婚庆摄影",
    industries: ["life", "fashion", "media"],
    pages: ["home", "works", "services", "about", "contact"],
    sections: {
      home: ["gallery", "hero", "services", "testimonials", "cta"],
      works: ["pageHeader", "gallery", "cases", "cta"],
      services: ["pageHeader", "services", "pricing", "process", "cta"],
      about: ["pageHeader", "about", "team", "marquee", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 物流网络：网络规模数据（stats/chart）+ 履约流程 + 合作伙伴。
    key: "logistics-net",
    label: "物流网络",
    industries: ["logistics", "tech"],
    pages: ["home", "services", "cases", "news", "contact"],
    sections: {
      home: ["hero", "stats", "process", "chart", "logos", "cta"],
      services: ["pageHeader", "services", "features", "stats", "cta"],
      cases: ["pageHeader", "cases", "chart", "testimonials", "cta"],
      news: ["pageHeader", "news", "faq", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },
  {
    // 医药健康：产品/研发（features/chart）+ 专家团队 + 资讯与合规问答。
    key: "pharma-care",
    label: "医药健康",
    industries: ["grocery", "org"],
    pages: ["home", "products", "team", "news", "about", "contact"],
    sections: {
      home: ["hero", "features", "products", "team", "news", "cta"],
      products: ["pageHeader", "products", "chart", "faq", "cta"],
      team: ["pageHeader", "team", "stats", "cta"],
      news: ["pageHeader", "news", "faq", "cta"],
      about: ["pageHeader", "about", "timeline", "marquee", "cta"],
      contact: ["pageHeader", "contact"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // v3 特色家族（signature）—— 每个自带专属渲染器 + 钉死主题，一眼可辨。
  // 详见 docs/architecture/oceanleo-template-gallery-v3-signature-families.md
  // ═══════════════════════════════════════════════════════════════════
  {
    // F1 杂志编辑风：衬线大标题、非对称栅格、去卡片化、极多留白。
    key: "editorial",
    label: "杂志编辑",
    industries: ["fashion", "media", "life", "grocery"],
    pages: ["home", "works", "about", "contact"],
    sections: {
      home: ["sigEditorialHero", "sigEditorialFeature", "sigEditorialGallery", "sigPullQuote", "cta"],
      works: ["pageHeader", "sigEditorialGallery", "cases", "cta"],
      about: ["pageHeader", "about", "sigPullQuote", "team", "cta"],
      contact: ["pageHeader", "contact"],
    },
    signature: { font: "serif", radius: "sharp", density: "airy", fx: "dots" },
  },
  {
    // F2 深色霓虹科技风：整站深黑底 + 荧光辉光 + 玻璃拟态 + 网格。
    key: "neon-tech",
    label: "霓虹科技",
    industries: ["tech", "logistics"],
    pages: ["home", "services", "cases", "contact"],
    sections: {
      home: ["sigNeonHero", "sigNeonStats", "sigGlassGrid", "sigCodeWindow", "cta"],
      services: ["pageHeader", "sigGlassGrid", "process", "faq", "cta"],
      cases: ["pageHeader", "cases", "sigNeonStats", "testimonials", "cta"],
      contact: ["pageHeader", "contact"],
    },
    signature: {
      palettePool: ["neon-cyan", "neon-violet", "neon-magenta"],
      radius: "soft",
      density: "regular",
      font: "geometric",
      fx: "neon-grid",
      forceDark: true,
    },
  },
  {
    // F3 全屏叙事风：每屏 100vh 满屏大图 + 翻页式滚动 + 右侧圆点导航。
    key: "fullscreen-scroll",
    label: "全屏叙事",
    industries: ["food", "life", "industry"],
    pages: ["home", "about", "contact"],
    sections: {
      home: ["sigFsIntro", "sigFsPanel", "sigFsSplit", "sigFsPanel", "cta"],
      about: ["pageHeader", "about", "gallery", "team", "cta"],
      contact: ["pageHeader", "contact"],
    },
    signature: { density: "airy", radius: "soft", fx: "spotlight" },
  },
  {
    // F4 便当格栅风：不规则大小圆角块拼成「面板墙」（Apple/Notion 那种）。
    key: "bento",
    label: "便当格栅",
    industries: ["tech", "general", "home", "media"],
    pages: ["home", "services", "about", "contact"],
    sections: {
      home: ["sigBentoHero", "sigBentoFeatures", "stats", "cases", "cta"],
      services: ["pageHeader", "sigBentoFeatures", "services", "faq", "cta"],
      about: ["pageHeader", "about", "team", "marquee", "cta"],
      contact: ["pageHeader", "contact"],
    },
    signature: { radius: "round", density: "regular", fx: "orbs" },
  },
  {
    // F5 粗野主义风：粗黑描边 + 硬阴影 + 高对比撞色 + 直角。
    key: "brutalist",
    label: "粗野主义",
    industries: ["media", "general", "fashion"],
    pages: ["home", "works", "services", "contact"],
    sections: {
      home: ["sigBrutalHero", "sigBrutalCards", "gallery", "sigStickerCta"],
      works: ["pageHeader", "gallery", "cases", "sigStickerCta"],
      services: ["pageHeader", "sigBrutalCards", "process", "sigStickerCta"],
      contact: ["pageHeader", "contact"],
    },
    signature: { radius: "sharp", font: "geometric", density: "regular", fx: "noise" },
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
  /** v3：是否特色家族（引擎据此走专属渲染分支）。 */
  isSignature: boolean;
  /** v3：整站深色底（signature.forceDark 或深色配色时为真）。 */
  forceDark: boolean;
}

// 用不同盐值从 slug 派生互相独立的 hash，保证各维度不耦合。
function pick<T>(arr: T[], slug: string, salt: string): T {
  return arr[hashStr(slug + ":" + salt) % arr.length];
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
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
  // 同子类的多个变体必须铺开到不同布局家族：以「子类 key」（slug 去掉尾部
  // -<变体号>）为哈希基准取起点，再用与家族数互质的确定性步长按 variant 递进 ——
  // 互质保证相邻变体走遍全部家族才回头（家族数 >= 变体数时同子类内零重复）。
  const base = slug.replace(/-\d+$/, "");
  const n = families.length;
  const strides = [1, 2, 3, 5, 7, 11, 13].filter((s) => s < n && gcd(s, n) === 1);
  const stride = strides.length ? strides[hashStr(base + ":stride") % strides.length] : 1;
  const layout = families[(hashStr(base + ":layout") + variant * stride) % n];

  const sig = layout.signature;

  // 第 1 个变体倾向行业默认色系，其余在全色里确定性轮换。
  // 特色家族：若声明了 palettePool，则只在池内确定性选取（钉死风格）。
  // 普通家族一律从 LIGHT_PALETTES_V2 里选（剔除深色霓虹三色，见其定义处注释）——
  // 深色配色只有 neon-tech 家族的深色感知渲染器 hold 得住，普通家族抽到会「看不清」。
  let palette: PaletteV2;
  if (sig?.palettePool && sig.palettePool.length) {
    const pool = PALETTES_V2.filter((p) => sig.palettePool!.includes(p.key));
    const usePool = pool.length ? pool : PALETTES_V2;
    palette = usePool[(hashStr(slug + ":pal") + variant) % usePool.length];
  } else if (variant === 1 && defaultPaletteFamily) {
    const inFamily = LIGHT_PALETTES_V2.filter((p) => p.family === defaultPaletteFamily);
    palette = inFamily.length
      ? inFamily[hashStr(slug + ":pal") % inFamily.length]
      : pick(LIGHT_PALETTES_V2, slug, "pal");
  } else {
    palette =
      LIGHT_PALETTES_V2[
        (hashStr(slug + ":pal") + variant * 5) % LIGHT_PALETTES_V2.length
      ];
  }

  const radius = sig?.radius ?? pick(RADII, slug, "radius");
  const density = sig?.density ?? pick(DENSITIES, slug, "density");
  const font = sig?.font ?? pick(FONTS, slug, "font");
  const accentFx = sig?.fx ?? accentFxFor(slug, layout.key);
  const forceDark = sig?.forceDark ?? DARK_PALETTE_KEYS.has(palette.key);

  return {
    layout,
    palette,
    radius,
    density,
    font,
    styleSeed: hashStr(slug + ":style"),
    imgSeed: 100 + (hashStr(slug + ":img") % 90000),
    accentFx,
    isSignature: !!sig,
    forceDark,
  };
}
