// 模板基因（DNA）—— 第二批「定装」后的单一装配入口。
//
// 页面结构只来自 4 种 SHAPES，视觉只来自 10 套 SKINS。slug hash 不再参与结构、
// 配色、圆角、密度、字体、段落样式或装饰选择；它只保留给配图 seed，用来避免
// 同行业模板反复拿到同一张图。这样「换一个看看」只会落到批准过的整套结果。

import { hashStr } from "./hash";
import type { AccentFx } from "./template-effects";
import {
  SHAPES,
  SKINS,
  mainPageLabel,
  shape as shapeByKey,
  skin as skinByKey,
  skinsFor,
  type Shape,
  type ShapeKey,
  type Skin,
  type SkinKey,
} from "./template-skins";

// ————————————————————————————————————————————————————————————
// 配色。旧 key 继续保留给已生成内容和色系筛选；dnaFor 只会取当前 skin 批准的 key。
// ————————————————————————————————————————————————————————————

export interface PaletteV2 {
  key: string;
  family: "multi" | "red" | "orange" | "green" | "blue" | "purple" | "dark" | "light";
  label: string;
  primary: string;
  primaryDark: string;
  gradFrom: string;
  gradTo: string;
  soft: string;
  ink: string;
  sub: string;
  accent: string;
  heroDark: boolean;
  swatch: string;
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
  { key: "mocha", family: "orange", label: "摩卡棕", primary: "#92400e", primaryDark: "#78350f", gradFrom: "#3f2212", gradTo: "#b45309", soft: "#fef3e7", ink: "#241407", sub: "#6f5b48", accent: "#e7b98a", heroDark: true, swatch: "#a16207" },
  { key: "jade-gold", family: "green", label: "墨绿金", primary: "#065f46", primaryDark: "#064e3b", gradFrom: "#022c22", gradTo: "#0f766e", soft: "#ecfdf5", ink: "#062019", sub: "#4a635b", accent: "#fbbf24", heroDark: true, swatch: "#047857" },
  { key: "mauve", family: "purple", label: "藕荷", primary: "#9d5b8b", primaryDark: "#82486f", gradFrom: "#4a2545", gradTo: "#c084ac", soft: "#faf3f8", ink: "#2a1526", sub: "#6d5566", accent: "#e9c3dc", heroDark: true, swatch: "#b06fa0" },
  { key: "glacier", family: "light", label: "冰川灰蓝", primary: "#334155", primaryDark: "#1e293b", gradFrom: "#e0f2fe", gradTo: "#cbd5e1", soft: "#f0f9ff", ink: "#0f172a", sub: "#526074", accent: "#0369a1", heroDark: false, swatch: "#94a3b8" },
  { key: "neon-cyan", family: "dark", label: "霓虹青", primary: "#22d3ee", primaryDark: "#06b6d4", gradFrom: "#0e7490", gradTo: "#22d3ee", soft: "#0b1220", ink: "#e5f6ff", sub: "#7d9bb0", accent: "#67e8f9", heroDark: true, swatch: "#22d3ee" },
  { key: "neon-violet", family: "dark", label: "霓虹紫", primary: "#a855f7", primaryDark: "#9333ea", gradFrom: "#6d28d9", gradTo: "#c084fc", soft: "#120b1f", ink: "#f0e7ff", sub: "#9b86b5", accent: "#d8b4fe", heroDark: true, swatch: "#a855f7" },
  { key: "neon-magenta", family: "dark", label: "霓虹品红", primary: "#f472b6", primaryDark: "#ec4899", gradFrom: "#9d174d", gradTo: "#fb7185", soft: "#1a0b14", ink: "#ffe7f3", sub: "#b3859c", accent: "#f9a8d4", heroDark: true, swatch: "#f472b6" },
];

export const DARK_PALETTE_KEYS = new Set(["neon-cyan", "neon-violet", "neon-magenta"]);

/** 兼容已有筛选调用；新 DNA 不从这个池随机取色。 */
export const LIGHT_PALETTES_V2: PaletteV2[] = PALETTES_V2.filter(
  (palette) => !DARK_PALETTE_KEYS.has(palette.key),
);

export function paletteByKey(key: string): PaletteV2 {
  return PALETTES_V2.find((palette) => palette.key === key) ?? PALETTES_V2[0];
}

// ————————————————————————————————————————————————————————————
// 页面与板块
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
  | "sigEditorialHero"
  | "sigEditorialFeature"
  | "sigEditorialGallery"
  | "sigPullQuote"
  | "sigNeonHero"
  | "sigGlassGrid"
  | "sigNeonStats"
  | "sigCodeWindow"
  | "sigFsIntro"
  | "sigFsPanel"
  | "sigFsSplit"
  | "sigBentoHero"
  | "sigBentoFeatures"
  | "sigBrutalHero"
  | "sigBrutalCards"
  | "sigStickerCta";

export interface LayoutFamily {
  /** 兼容旧消费者的字段名；值现在就是 s3/s4/s5/s6。 */
  key: ShapeKey;
  label: string;
  pages: PageKey[];
  sections: Record<string, SectionKind[]>;
}

type MainPageKey = "services" | "products" | "menu" | "works";
type BlueprintSection = SectionKind | "main";

/**
 * 每种构成唯一的板块蓝图。「main」是主营内容占位，装配时和主营页一起替换成
 * services/products/menu/works。这样行业叫法不同，结构顺序仍只有 4 套。
 *
 * 来源：s3 继承 fullscreen-scroll；s4 继承 portfolio；s5 继承 agency（服务页映射
 * 主营、作品页映射案例）；s6 继承 corporate。这里不按行业、slug 或 skin 分叉。
 */
export const SHAPE_SECTION_BLUEPRINTS: Record<
  ShapeKey,
  Record<string, readonly BlueprintSection[]>
> = {
  s3: {
    home: ["sigFsIntro", "sigFsPanel", "sigFsSplit", "sigFsPanel", "cta"],
    about: ["pageHeader", "about", "gallery", "team", "cta"],
    contact: ["pageHeader", "contact"],
  },
  s4: {
    home: ["hero", "gallery", "about", "cta"],
    main: ["pageHeader", "main", "cases", "testimonials", "cta"],
    about: ["pageHeader", "about", "stats", "main", "cta"],
    contact: ["pageHeader", "contact"],
  },
  s5: {
    home: ["hero", "gallery", "main", "marquee", "testimonials", "cta"],
    main: ["pageHeader", "main", "process", "pricing", "cta"],
    cases: ["pageHeader", "gallery", "cases", "cta"],
    about: ["pageHeader", "about", "team", "logos", "cta"],
    contact: ["pageHeader", "contact"],
  },
  s6: {
    home: ["hero", "marquee", "about", "main", "stats", "cases", "cta"],
    main: ["pageHeader", "main", "process", "faq", "cta"],
    cases: ["pageHeader", "cases", "chart", "testimonials", "cta"],
    about: ["pageHeader", "about", "timeline", "team", "cta"],
    news: ["pageHeader", "news", "cta"],
    contact: ["pageHeader", "contact"],
  },
};

/** 主营页的业务叫法落到现有页面/章节渲染器。 */
export function mainPageKey(industryKey: string, subKey?: string): MainPageKey {
  const label = mainPageLabel(industryKey, subKey);
  if (label === "菜单") return "menu";
  if (label === "作品") return "works";
  if (["商品", "产品", "项目", "拍品", "房源", "车辆"].includes(label)) return "products";
  return "services";
}

/** 作品页沿用已有 gallery 板块；其余主营页的页面 key 与板块 kind 同名。 */
export function mainSectionKind(mainKey: MainPageKey): SectionKind {
  return mainKey === "works" ? "gallery" : mainKey;
}

function layoutForShape(shapeKey: ShapeKey, mainKey: MainPageKey): LayoutFamily {
  const shape = shapeByKey(shapeKey);
  const pages = shape.pages.map((page) => (page === "main" ? mainKey : page)) as PageKey[];
  const blueprint = SHAPE_SECTION_BLUEPRINTS[shapeKey];
  const mainKind = mainSectionKind(mainKey);
  const sections: Record<string, SectionKind[]> = {};

  for (const semanticPage of shape.pages) {
    const pageKey = semanticPage === "main" ? mainKey : semanticPage;
    const sequence = blueprint[semanticPage];
    sections[pageKey] = sequence.map((section) =>
      section === "main" ? mainKind : section,
    ) as SectionKind[];
  }

  return { key: shape.key, label: shape.label, pages, sections };
}

/** 兼容旧读者的名字；数组里现在只有 4 种构成，不再有骨架家族。 */
export const LAYOUT_FAMILIES: LayoutFamily[] = SHAPES.map((shape) =>
  layoutForShape(shape.key, "services"),
);

export function layoutByKey(key: string): LayoutFamily {
  return LAYOUT_FAMILIES.find((layout) => layout.key === key) ?? LAYOUT_FAMILIES[0];
}

// ————————————————————————————————————————————————————————————
// 套装令牌
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
  section: string;
  gap: string;
  h1: string;
  h2: string;
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
// DNA：构成按规模阶梯铺开，套装只在行业准入表中循环
// ————————————————————————————————————————————————————————————

export interface TemplateDNA {
  shape: Shape;
  skin: Skin;
  layout: LayoutFamily;
  palette: PaletteV2;
  radius: Radius;
  density: Density;
  font: FontKind;
  /** 由 skin 的固定序号决定；同一套装不会因 slug 改变段落样式。 */
  styleSeed: number;
  /** 图片属于内容，不属于装；它仍按 slug 分散，避免站内外反复用同一张图。 */
  imgSeed: number;
  accentFx: AccentFx;
  /** 兼容旧输出字段：五个历史特色名仍标为 signature。 */
  isSignature: boolean;
  forceDark: boolean;
}

function variantIndex(variant: number): number {
  return Math.max(0, Math.trunc(variant) - 1);
}

export function shapeForVariant(variant: number): Shape {
  return SHAPES[variantIndex(variant) % SHAPES.length];
}

/**
 * 步长 n-1 与 n 永远互质：同子类相邻变体会先走遍整个行业准入集合才回头。
 * 准入集合只有 3/4 套而子类有 4/5 个变体时，重复不可避免，但不会相邻撞装。
 */
export function skinForVariant(industryKey: string, variant: number): Skin {
  const allowed = skinsFor(industryKey);
  const stride = allowed.length > 1 ? allowed.length - 1 : 1;
  const key = allowed[(variantIndex(variant) * stride) % allowed.length];
  return skinByKey(key);
}

function paletteForSkin(skin: Skin, variant: number): PaletteV2 {
  const key = skin.palettes[variantIndex(variant) % skin.palettes.length];
  return paletteByKey(key);
}

const SIGNATURE_SKINS = new Set<SkinKey>([
  "editorial",
  "bento",
  "brutalist",
  "neon",
  "fullscreen",
]);

export function dnaFor(
  slug: string,
  industryKey: string,
  variant: number,
  _defaultPaletteFamily?: string,
): TemplateDNA {
  const subKey = slug.replace(/-\d+$/, "");
  const shape = shapeForVariant(variant);
  const skin = skinForVariant(industryKey, variant);
  const palette = paletteForSkin(skin, variant);
  const layout = layoutForShape(shape.key, mainPageKey(industryKey, subKey));
  const styleSeed = SKINS.findIndex((candidate) => candidate.key === skin.key);

  return {
    shape,
    skin,
    layout,
    palette,
    radius: skin.radius,
    density: skin.density,
    font: skin.font,
    styleSeed,
    imgSeed: 100 + (hashStr(slug + ":img") % 90000),
    accentFx: skin.fx,
    isSignature: SIGNATURE_SKINS.has(skin.key),
    forceDark: skin.dark,
  };
}
