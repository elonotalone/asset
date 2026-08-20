// 接口 B —— asset `SectionKind` → website `VirtualSectionType` 映射与槽位 schema。
//
// 唯一事实源：`docs/work-logs/2026-07/oceanleo-material-supply-and-card-fixes/W5-section-map.md`
// （owner W5，本轮词汇表从 5 种扩到 22 种）。本文件是它在 asset 侧的**可执行副本**：
// 发射器按这里的字段名落 content，测试按这里的表查「槽位齐全」。
//
// 纪律：字段名有缺口时不改 `website/front`（那是 W5 的边界），在 marker 的仲裁段提出。

import type { SectionKind } from "./template-dna";

/** website 侧的 22 个 VirtualSectionType（接口 B §1）。 */
export const WEBSITE_SECTION_TYPES = [
  "hero",
  "stats",
  "feature-grid",
  "pricing",
  "footer",
  "about",
  "services",
  "products",
  "menu",
  "gallery",
  "cases",
  "team",
  "process",
  "testimonials",
  "faq",
  "logos",
  "news",
  "chart",
  "timeline",
  "cta",
  "contact",
  "page-header",
] as const;

export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];

/**
 * 38 个 asset SectionKind 的落点（接口 B §2 主映射表 + §3 sig* 降级表）。
 *
 * 唯一归并：`marquee` → `logos`（数据同源 `ext.logos`，用 `content.display` 区分皮肤）。
 * sig* 16 个降级到共享类型；降级丢的是家族级视觉（辉光/玻璃/硬阴影/全屏滚动/便当比例），
 * **结构与文案不丢**。
 */
export const SECTION_TYPE_MAP: Record<SectionKind, WebsiteSectionType> = {
  hero: "hero",
  stats: "stats",
  about: "about",
  features: "feature-grid",
  services: "services",
  products: "products",
  menu: "menu",
  gallery: "gallery",
  cases: "cases",
  team: "team",
  pricing: "pricing",
  process: "process",
  testimonials: "testimonials",
  faq: "faq",
  logos: "logos",
  news: "news",
  chart: "chart",
  timeline: "timeline",
  marquee: "logos",
  cta: "cta",
  contact: "contact",
  pageHeader: "page-header",
  // sig*（接口 B §3）
  sigEditorialHero: "hero",
  sigEditorialFeature: "feature-grid",
  sigEditorialGallery: "services",
  sigPullQuote: "testimonials",
  sigNeonHero: "hero",
  sigGlassGrid: "services",
  sigNeonStats: "stats",
  sigCodeWindow: "cta",
  sigFsIntro: "hero",
  sigFsPanel: "about",
  sigFsSplit: "about",
  sigBentoHero: "hero",
  sigBentoFeatures: "feature-grid",
  sigBrutalHero: "hero",
  sigBrutalCards: "services",
  sigStickerCta: "cta",
  sigPaperIndex: "services",
  sigNatureRibbon: "about",
  sigSandStamp: "stats",
  sigNavyLedger: "timeline",
};

/** 哪些 kind 是「降级发射」（marker / 报告里要如实记账）。 */
export const DEGRADED_KINDS: SectionKind[] = (Object.keys(SECTION_TYPE_MAP) as SectionKind[]).filter((k) =>
  k.startsWith("sig"),
);

/** 每个 website 类型的 content schema（接口 B §5）。数组字段名 → 该数组项的字段名。 */
export interface ContentSchema {
  /** 节级字段。 */
  fields: string[];
  /** 数组字段（键名 → 项字段名；`groups` 再带一层 `items`）。 */
  arrays?: Record<string, string[]>;
  /** 图片槽位路径（`image` = 节级；`items.image` = 每项）。 */
  imageSlots: string[];
}

export const SECTION_CONTENT_SCHEMA: Record<WebsiteSectionType, ContentSchema> = {
  hero: {
    fields: ["eyebrow", "title", "subtitle", "primaryCtaLabel", "primaryCtaHref", "secondaryCtaLabel", "secondaryCtaHref"],
    imageSlots: ["image"],
  },
  stats: { fields: ["title", "subtitle"], arrays: { items: ["label", "value", "description"] }, imageSlots: ["image"] },
  "feature-grid": {
    fields: ["title", "subtitle"],
    arrays: { features: ["icon", "title", "description"] },
    imageSlots: ["image"],
  },
  pricing: {
    fields: ["title", "subtitle"],
    arrays: { plans: ["name", "price", "description", "ctaLabel", "highlights", "featured"] },
    imageSlots: ["image"],
  },
  footer: { fields: ["title", "description", "ctaLabel", "ctaHref"], arrays: { links: ["label", "href"] }, imageSlots: ["image"] },
  about: { fields: ["eyebrow", "title", "body", "bullets"], imageSlots: ["image"] },
  services: { fields: ["title", "subtitle"], arrays: { items: ["name", "description", "icon", "image"] }, imageSlots: ["items.image"] },
  products: {
    fields: ["title", "subtitle", "ctaLabel"],
    arrays: { items: ["name", "price", "note", "image"] },
    imageSlots: ["items.image"],
  },
  menu: { fields: ["title", "subtitle"], arrays: { groups: ["name", "items"] }, imageSlots: ["image"] },
  gallery: { fields: ["title", "subtitle"], arrays: { items: ["caption", "image"] }, imageSlots: ["items.image"] },
  cases: {
    fields: ["title", "subtitle"],
    arrays: { items: ["tag", "title", "description", "linkLabel", "href", "image"] },
    imageSlots: ["items.image"],
  },
  team: { fields: ["title", "subtitle"], arrays: { members: ["name", "role", "bio", "image"] }, imageSlots: ["members.image"] },
  process: { fields: ["title", "subtitle"], arrays: { steps: ["step", "title", "description"] }, imageSlots: ["image"] },
  testimonials: {
    fields: ["title", "subtitle"],
    arrays: { items: ["quote", "name", "role", "image"] },
    imageSlots: ["items.image"],
  },
  faq: {
    fields: ["title", "subtitle", "footnote", "contactLabel", "contactHref"],
    arrays: { items: ["question", "answer"] },
    imageSlots: ["image"],
  },
  logos: { fields: ["title", "display"], arrays: { items: ["label", "image"] }, imageSlots: ["items.image"] },
  news: {
    fields: ["title", "subtitle"],
    arrays: { items: ["date", "category", "title", "excerpt", "href", "image"] },
    imageSlots: ["items.image"],
  },
  chart: {
    fields: ["title", "subtitle", "chartType", "unit", "insight", "footnote"],
    arrays: { series: ["label", "value"] },
    imageSlots: ["image"],
  },
  timeline: { fields: ["title", "subtitle"], arrays: { items: ["label", "title", "description"] }, imageSlots: ["image"] },
  cta: {
    fields: ["eyebrow", "title", "subtitle", "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref", "note"],
    imageSlots: ["image"],
  },
  contact: {
    fields: [
      "title",
      "subtitle",
      "phone",
      "email",
      "address",
      "formTitle",
      "nameLabel",
      "phoneLabel",
      "emailLabel",
      "messageLabel",
      "submitLabel",
    ],
    imageSlots: ["image"],
  },
  "page-header": { fields: ["eyebrow", "title", "subtitle"], imageSlots: ["image"] },
};

/** 归一化边界（接口 B §5「归一化边界」）——发射端自觉遵守，别让 normalizer 静默截断。 */
export const LIMITS = {
  /** items / features / plans / links / steps / members / series 上限。 */
  arrayMax: 24,
  /** menu.groups 上限。 */
  groupsMax: 12,
  /** menu.groups[].items 上限。 */
  groupItemsMax: 24,
  /** about.body / about.bullets 上限。 */
  aboutListMax: 12,
  /** style.paddingTop / paddingBottom 取值区间。 */
  paddingMax: 240,
  /** style.cornerRadius 取值区间。 */
  cornerRadiusMax: 64,
  /** chart.series[].value 上限。 */
  chartValueMax: 1_000_000_000,
  /** pages 上限。 */
  pagesMax: 50,
  /** 章节 id 长度上限（website 侧清洗成 `[A-Za-z0-9_.-]{1,32}`）。 */
  sectionIdMax: 32,
} as const;

/** 接口 B 版本指纹（改了这份映射就改它，materialize 脚本会把它写进 provenance）。 */
export const INTERFACE_B_VERSION = "W5-section-map@2026-07-27";
