// `website-source@1` 发射器 —— 让同一套 taxonomy × DNA × 内容包**多输出一种格式**。
//
// 输入：`template-website-source-ir.ts` 的结构 IR（上游读出来的，**不解析 HTML**）。
// 输出：
//   1. `buildWebsiteSourceConfig()` —— 一份 `VirtualSiteConfig`（website 编辑器的工程对象），
//      板块类型与槽位按接口 B（`template-website-source-map.ts`）落字段；
//   2. `buildWebsiteSourceTree()` —— 一棵**可直接部署 / 可打 zip** 的源码树，
//      形状与 `scripts/oceanleo-template-material-gen.mjs` 的 `websiteSourceTree()` 一致
//      （清单 `oceanleo.website-source.json` 作 entrypoint，真入口是 `index.html`）。
//
// 两条输出彼此独立：asset 站 `/templates/[slug]` 那条 HTML 预览由 `template-engine.ts`
// 继续单独负责，本文件不 import 它、不改它，HTML 输出逐字节不变。

import type { Lang } from "./template-i18n";
import type { Industry, SubCategory, TemplateMeta } from "./template-taxonomy";
import { hashStr } from "./hash";
import { MIRROR_PUBLIC_DIR, SITE_IMAGE_DIR, sitePhotoPath } from "./template-photo-local";
import { poolFallbackPhoto, poolPhoto } from "./template-photo-pool";
import {
  ALL_SECTION_KINDS,
  buildTemplateStructure,
  type BiText,
  type BlockIR,
  type PageIR,
  type SectionIR,
  type SlotIR,
  type TemplateStructureIR,
} from "./template-website-source-ir";
import {
  INTERFACE_B_VERSION,
  LIMITS,
  SECTION_CONTENT_SCHEMA,
  SECTION_TYPE_MAP,
  type WebsiteSectionType,
} from "./template-website-source-map";

export const WEBSITE_SOURCE_SCHEMA = "website-source@1";
/** 源码树里那份工程对象的默认文件名（zh 默认语言）。 */
export const SITE_CONFIG_PATH = "site.json";
export const SITE_CONFIG_EN_PATH = "site.en.json";
export const STRUCTURE_PATH = "oceanleo.template-structure.json";
export const MANIFEST_PATH = "oceanleo.website-source.json";
export const ENTRY_HTML = "index.html";

// ————————————————————————————————————————————————————————————
// website 侧类型（本地镜像，避免跨仓 import；字段与 `website/front/types/virtual-site.ts` 一致）
// ————————————————————————————————————————————————————————————

export interface VirtualImage {
  keyword: string;
  alt: string;
  url?: string;
}

export interface VirtualSectionStyleOut {
  backgroundColor?: string;
  textColor?: string;
  paddingTop: number;
  paddingBottom: number;
  contentWidth: "narrow" | "normal" | "wide" | "full";
  alignment: "left" | "center";
  layout: "default" | "reverse" | "stacked";
  cornerRadius: number;
  borderWidth: number;
}

export interface VirtualSectionOut {
  id: string;
  type: WebsiteSectionType;
  content: Record<string, unknown>;
  style: VirtualSectionStyleOut;
}

export interface VirtualPageOut {
  id: string;
  name: string;
  path: string;
  title: string;
  description: string;
  sections: VirtualSectionOut[];
}

export interface VirtualSiteConfigOut {
  siteName: string;
  themeColor: string;
  backgroundColor: string;
  typography: {
    bodyFont: "sans" | "serif" | "mono";
    headingFont: "sans" | "serif" | "mono";
    baseSize: number;
    lineHeight: number;
    headingWeight: number;
  };
  navigation: { label: string; href: string }[];
  sections: VirtualSectionOut[];
  pages: VirtualPageOut[];
}

// ————————————————————————————————————————————————————————————
// 槽位读取小工具
// ————————————————————————————————————————————————————————————

function pick(v: BiText | undefined, lang: Lang): string {
  if (!v) return "";
  return lang === "en" ? v.en : v.zh;
}
function findSlot(slots: SlotIR[], name: string): SlotIR | undefined {
  return slots.find((s) => s.name === name);
}
function txt(slots: SlotIR[], name: string, lang: Lang, fallback = ""): string {
  const s = findSlot(slots, name);
  return s?.text ? pick(s.text, lang) : fallback;
}
function href(slots: SlotIR[], name: string, fallback = "#"): string {
  return findSlot(slots, name)?.href || fallback;
}
function listOf(slots: SlotIR[], name: string, lang: Lang): string[] {
  const s = findSlot(slots, name);
  return (s?.texts ?? []).map((t) => pick(t, lang));
}
function iconOf(slots: SlotIR[], name = "icon"): string {
  return findSlot(slots, name)?.iconPath ?? "";
}
function blocksOf(section: SectionIR, name: string): BlockIR[] {
  return (section.groups.find((g) => g.name === name)?.blocks ?? []).slice(0, LIMITS.arrayMax);
}
function imageOf(ctx: EmitCtx, alt: string): VirtualImage {
  // 接口 B 按 section type 渲染，不保留 asset 的「同类无图变体」分支；凡是策略判定为
  // 真正照片位的 builder 都从行业子类池取图。起点随 slug 固定，随后顺序轮换，既稳定
  // 又保证一个站里前三张不会撞成同一张。
  const seed = hashStr(`${ctx.structure.slug}:website-source-photo`) + ctx.photoCursor;
  ctx.photoCursor += 1;
  const url = poolPhoto(ctx.structure.sub.key, seed) || poolFallbackPhoto(seed);
  if (!url) return { keyword: "", alt: "" };
  return { keyword: ctx.keyword, alt, url: sitePhotoPath(url) };
}
/** 无图槽的节：槽位仍然在位（可编辑），但不凭空发明图片（url 为空即不渲染）。 */
const NO_IMAGE: VirtualImage = { keyword: "", alt: "" };

/** 人物照片必须由站点所有者提供；keyword/alt 是编辑器与空态共同显示的换图提示。 */
function ownerPortrait(lang: Lang, kind: "team" | "testimonial"): VirtualImage {
  const label = lang === "en"
    ? kind === "team" ? "Upload a real team photo" : "Upload a real customer photo"
    : kind === "team" ? "请上传真实团队照片" : "请上传真实客户照片";
  return { keyword: label, alt: label };
}

// ————————————————————————————————————————————————————————————
// 每个 website 类型的 content 组装（接口 B §5 的字段名逐个对齐）
// ————————————————————————————————————————————————————————————

interface EmitCtx {
  structure: TemplateStructureIR;
  lang: Lang;
  /** 图片 keyword（拿不到 url 时 website 侧的第一方图床兜底关键词）。 */
  keyword: string;
  /** 当前配置内的图片序号；zh/en 分别从 0 开始，因而两份配置引用同一组文件。 */
  photoCursor: number;
}

type ContentBuilder = (section: SectionIR, ctx: EmitCtx) => Record<string, unknown>;

function headTitle(section: SectionIR, ctx: EmitCtx): string {
  return txt(section.slots, "title", ctx.lang);
}
function headSub(section: SectionIR, ctx: EmitCtx): string {
  return txt(section.slots, "subtitle", ctx.lang);
}

/**
 * 资历角标（asset 侧是浮在配图右下角那张卡：大号 `12年` ＋ 小号 `行业深耕`，
 * 见 `template-engine.ts` renderAbout）。接口 B 的 `about` 只有
 * eyebrow / title / body / bullets / image 五个字段，**没有承接浮标的位置**，
 * 而 `bullets` 的来源槽位本来就叫 `highlights` —— 资历本身就是一条 highlight，
 * 所以并进 bullets、排在服务名之前，值与标签逐字保留。
 *
 * 为什么不另起一节 stats 承接（`sigBentoHero` 那条先例）：角标取的就是内容包的
 * `stats[0]`，实测 200 个模板里带角标的 143 节，其中 110 节所在站点**已经有** stats 节，
 * 补节会变成同一个数字在站上出现两次。
 */
/**
 * `sigFsPanel` 降级成 `about` 时，它的整屏副标题（一整句介绍）原先无处可去 ——
 * 该节没有 `body` 槽位，发射出来的 `about.body` 是**空数组**，副标题就此消失。
 * 空的时候拿副标题当正文第一段接住；`about` 自己有 `body` 时按原样走，不受影响。
 */
function aboutBody(section: SectionIR, ctx: EmitCtx): string[] {
  const body = listOf(section.slots, "body", ctx.lang).slice(0, LIMITS.aboutListMax);
  if (body.length) return body;
  const subtitle = headSub(section, ctx);
  return subtitle ? [subtitle] : body;
}

function aboutBullets(section: SectionIR, ctx: EmitCtx): string[] {
  const list = listOf(section.slots, "highlights", ctx.lang);
  const value = txt(section.slots, "badgeValue", ctx.lang);
  const label = txt(section.slots, "badgeLabel", ctx.lang);
  const badge = [value, label].filter(Boolean).join(" · ");
  return (badge ? [badge, ...list] : list).slice(0, LIMITS.aboutListMax);
}

const BUILDERS: Record<WebsiteSectionType, ContentBuilder> = {
  hero: (s, ctx) => ({
    eyebrow: txt(s.slots, "eyebrow", ctx.lang),
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    primaryCtaLabel: txt(s.slots, "primaryCta", ctx.lang),
    primaryCtaHref: href(s.slots, "primaryCta", "/contact"),
    secondaryCtaLabel: txt(s.slots, "secondaryCta", ctx.lang),
    secondaryCtaHref: href(s.slots, "secondaryCta", "/services"),
    image: imageOf(ctx, headTitle(s, ctx)),
  }),

  stats: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      label: txt(b.slots, "label", ctx.lang),
      value: txt(b.slots, "value", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
    })),
    image: NO_IMAGE,
  }),

  "feature-grid": (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    features: blocksOf(s, "features").map((b) => ({
      icon: iconOf(b.slots),
      title: txt(b.slots, "title", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
    })),
    image: NO_IMAGE,
  }),

  pricing: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    plans: blocksOf(s, "plans").map((b) => ({
      name: txt(b.slots, "title", ctx.lang),
      price: `${txt(b.slots, "price", ctx.lang)}${txt(b.slots, "unit", ctx.lang)}`,
      description: listOf(b.slots, "highlights", ctx.lang)[0] ?? "",
      ctaLabel: txt(b.slots, "ctaLabel", ctx.lang),
      highlights: listOf(b.slots, "highlights", ctx.lang),
      featured: txt(b.slots, "featured", ctx.lang) === "1",
    })),
    image: NO_IMAGE,
  }),

  footer: (s, ctx) => ({
    title: txt(s.slots, "title", ctx.lang),
    description: txt(s.slots, "description", ctx.lang),
    ctaLabel: txt(s.slots, "ctaLabel", ctx.lang),
    ctaHref: href(s.slots, "ctaLabel", "/contact"),
    links: blocksOf(s, "links").map((b) => ({
      label: txt(b.slots, "label", ctx.lang),
      href: href(b.slots, "label", "/"),
    })),
    image: NO_IMAGE,
  }),

  about: (s, ctx) => ({
    eyebrow: txt(s.slots, "eyebrow", ctx.lang),
    title: headTitle(s, ctx),
    body: aboutBody(s, ctx),
    bullets: aboutBullets(s, ctx),
    image: imageOf(ctx, headTitle(s, ctx)),
  }),

  services: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      name: txt(b.slots, "title", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
      icon: iconOf(b.slots),
      image: imageOf(ctx, txt(b.slots, "title", ctx.lang)),
    })),
  }),

  products: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    ctaLabel: ctx.lang === "en" ? "Add to Cart" : "加入购物车",
    items: blocksOf(s, "items").map((b) => ({
      name: txt(b.slots, "title", ctx.lang),
      price: txt(b.slots, "price", ctx.lang),
      note: txt(b.slots, "badge", ctx.lang),
      image: imageOf(ctx, txt(b.slots, "title", ctx.lang)),
    })),
  }),

  menu: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    groups: blocksOf(s, "groups")
      .slice(0, LIMITS.groupsMax)
      .map((g) => ({
        name: txt(g.slots, "title", ctx.lang),
        items: (g.groups?.[0]?.blocks ?? []).slice(0, LIMITS.groupItemsMax).map((it) => ({
          name: txt(it.slots, "title", ctx.lang),
          price: txt(it.slots, "price", ctx.lang),
          description: "",
        })),
      })),
    image: NO_IMAGE,
  }),

  gallery: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b, i) => ({
      caption: `${headTitle(s, ctx)} ${i + 1}`,
      image: imageOf(ctx, headTitle(s, ctx)),
    })),
  }),

  cases: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      tag: txt(b.slots, "tag", ctx.lang),
      title: txt(b.slots, "title", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
      linkLabel: txt(b.slots, "linkLabel", ctx.lang),
      href: findSlot(b.slots, "linkLabel") ? href(b.slots, "linkLabel", "/cases") : "",
      image: imageOf(ctx, txt(b.slots, "title", ctx.lang)),
    })),
  }),

  team: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    members: blocksOf(s, "items").map((b) => ({
      name: txt(b.slots, "title", ctx.lang),
      role: txt(b.slots, "role", ctx.lang),
      bio: txt(b.slots, "description", ctx.lang),
      image: ownerPortrait(ctx.lang, "team"),
    })),
  }),

  process: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    steps: blocksOf(s, "steps").map((b) => ({
      step: txt(b.slots, "step", ctx.lang),
      title: txt(b.slots, "title", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
    })),
    image: NO_IMAGE,
  }),

  testimonials: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      quote: txt(b.slots, "quote", ctx.lang),
      name: txt(b.slots, "title", ctx.lang),
      role: txt(b.slots, "role", ctx.lang),
      image: ownerPortrait(ctx.lang, "testimonial"),
    })),
  }),

  faq: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    footnote: ctx.lang === "en" ? "More questions?" : "还有其他疑问？",
    contactLabel: ctx.lang === "en" ? "Contact Us" : "联系我们",
    contactHref: "/contact",
    items: blocksOf(s, "items").map((b) => ({
      question: txt(b.slots, "question", ctx.lang),
      answer: txt(b.slots, "answer", ctx.lang),
    })),
    image: NO_IMAGE,
  }),

  logos: (s, ctx) => ({
    title: txt(s.slots, "title", ctx.lang),
    // 归并的唯一一处（接口 B §1）：marquee 与 logos 同源，用 display 无损保留版式。
    display: s.kind === "marquee" ? "marquee" : "strip",
    items: blocksOf(s, "items").map((b) => ({
      label: txt(b.slots, "title", ctx.lang),
      image: NO_IMAGE,
    })),
  }),

  news: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      date: txt(b.slots, "date", ctx.lang),
      category: txt(b.slots, "category", ctx.lang),
      title: txt(b.slots, "title", ctx.lang),
      excerpt: txt(b.slots, "excerpt", ctx.lang),
      href: "/news",
      image: imageOf(ctx, txt(b.slots, "title", ctx.lang)),
    })),
  }),

  chart: (s, ctx) => {
    const style = txt(s.slots, "chartStyle", ctx.lang);
    return {
      title: headTitle(s, ctx),
      subtitle: headSub(s, ctx),
      // IR 的 area 是 asset 折线+渐变面积那一版；website 词汇表里对应 line。
      chartType: style === "bar" ? "bar" : style === "donut" ? "donut" : "line",
      unit: txt(s.slots, "unit", ctx.lang),
      insight: txt(s.slots, "insight", ctx.lang),
      footnote: txt(s.slots, "footnote", ctx.lang),
      series: blocksOf(s, "items").map((b) => ({
        label: txt(b.slots, "label", ctx.lang),
        value: Math.max(0, Math.min(LIMITS.chartValueMax, Number(txt(b.slots, "value", ctx.lang)) || 0)),
      })),
      image: NO_IMAGE,
    };
  },

  timeline: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    items: blocksOf(s, "items").map((b) => ({
      label: txt(b.slots, "step", ctx.lang),
      title: txt(b.slots, "title", ctx.lang),
      description: txt(b.slots, "description", ctx.lang),
    })),
    image: NO_IMAGE,
  }),

  cta: (s, ctx) => ({
    eyebrow: txt(s.slots, "eyebrow", ctx.lang),
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    primaryLabel: txt(s.slots, "ctaLabel", ctx.lang),
    primaryHref: href(s.slots, "ctaLabel", "/contact"),
    secondaryLabel: txt(s.slots, "secondaryCta", ctx.lang),
    secondaryHref: findSlot(s.slots, "secondaryCta") ? href(s.slots, "secondaryCta", "/contact") : "",
    // `sigCodeWindow` 降级成 `cta` 时代码窗标题栏上那行品牌名原先无处可去；
    // 该节没有 `phone` 槽位，`note` 发射出来是空串，正好原样接住它。
    note: txt(s.slots, "phone", ctx.lang) || txt(s.slots, "codeBrand", ctx.lang),
    image: NO_IMAGE,
  }),

  contact: (s, ctx) => ({
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    phone: txt(s.slots, "phone", ctx.lang),
    email: txt(s.slots, "email", ctx.lang),
    address: txt(s.slots, "address", ctx.lang),
    formTitle: txt(s.slots, "title", ctx.lang),
    nameLabel: txt(blocksOf(s, "fields")[0]?.slots ?? [], "label", ctx.lang),
    phoneLabel: txt(blocksOf(s, "fields")[1]?.slots ?? [], "label", ctx.lang),
    emailLabel: txt(blocksOf(s, "fields")[2]?.slots ?? [], "label", ctx.lang),
    messageLabel: txt(blocksOf(s, "fields")[3]?.slots ?? [], "label", ctx.lang),
    submitLabel: txt(s.slots, "ctaLabel", ctx.lang),
    image: NO_IMAGE,
  }),

  "page-header": (s, ctx) => ({
    eyebrow: txt(s.slots, "breadcrumb", ctx.lang),
    title: headTitle(s, ctx),
    subtitle: headSub(s, ctx),
    image: NO_IMAGE,
  }),
};

// ————————————————————————————————————————————————————————————
// style：DNA 的密度 / 圆角 / 底色意图 → section.style（接口 B §7）
// ————————————————————————————————————————————————————————————

function px(v: string): number {
  return Math.max(0, Math.min(LIMITS.paddingMax, Number.parseInt(v, 10) || 0));
}

function surfaceColors(section: SectionIR, structure: TemplateStructureIR): { backgroundColor: string; textColor: string } {
  const t = structure.theme;
  const white = t.forceDark ? t.soft : "#ffffff";
  switch (section.intent.surface) {
    case "soft":
    case "card":
      return { backgroundColor: t.soft, textColor: t.ink };
    case "gradient":
      return { backgroundColor: t.gradFrom, textColor: section.intent.onDark ? "#ffffff" : t.ink };
    case "dark":
      return { backgroundColor: t.forceDark ? t.soft : t.ink, textColor: t.forceDark ? t.ink : "#ffffff" };
    case "image":
      return { backgroundColor: t.ink, textColor: "#ffffff" };
    case "primary":
      return { backgroundColor: t.primary, textColor: "#ffffff" };
    default:
      return { backgroundColor: white, textColor: t.ink };
  }
}

/** 紧凑节（asset 里是 py-8 / py-12 的条带，不吃整节密度）。 */
const BAND_KINDS = new Set(["stats", "logos", "marquee", "sigNeonStats"]);

function styleFor(section: SectionIR, structure: TemplateStructureIR): VirtualSectionStyleOut {
  const t = structure.theme;
  const pad = BAND_KINDS.has(section.kind) ? 48 : px(t.densityTokens.section);
  const colors = surfaceColors(section, structure);
  const cols = section.intent.columns;
  const contentWidth: VirtualSectionStyleOut["contentWidth"] =
    section.intent.surface === "image" ? "full" : cols >= 3 ? "wide" : cols === 2 ? "normal" : "narrow";
  // 图文换位（asset 里 about v1 是「图左文右」、sigFsPanel 奇数屏靠右）显式记成 reverse。
  const reverse =
    (section.kind === "about" && section.variant === 1) ||
    (section.kind === "sigFsPanel" && section.variant % 2 === 1);
  const stacked = cols === 0 && section.intent.surface !== "image" && section.intent.hasMedia;
  return {
    backgroundColor: colors.backgroundColor,
    textColor: colors.textColor,
    paddingTop: pad,
    paddingBottom: pad,
    contentWidth,
    alignment: section.intent.align,
    layout: reverse ? "reverse" : stacked ? "stacked" : "default",
    cornerRadius: Math.max(0, Math.min(LIMITS.cornerRadiusMax, px(t.radiusTokens.card))),
    borderWidth: 0,
  };
}

// ————————————————————————————————————————————————————————————
// 页面 / 整站装配
// ————————————————————————————————————————————————————————————

/**
 * 接口 B §3 提示：`sigBentoHero` 降级成 hero 时便当格里的两条 stats 会丢，
 * 建议紧跟一节 `stats` 补回。这里显式做这件事（结构不丢的唯一办法）。
 */
function expand(section: SectionIR): { type: WebsiteSectionType; from: SectionIR }[] {
  const primary = { type: SECTION_TYPE_MAP[section.kind], from: section };
  if (section.kind === "sigBentoHero" && section.groups.some((g) => g.name === "items" && g.blocks.length)) {
    return [primary, { type: "stats", from: section }];
  }
  return [primary];
}

function footerSection(structure: TemplateStructureIR, lang: Lang, id: string): VirtualSectionOut {
  const t = structure.theme;
  return {
    id,
    type: "footer",
    content: {
      title: pick(structure.brand, lang),
      description: pick(structure.footerSlogan, lang),
      ctaLabel: lang === "en" ? "Contact Us" : "联系我们",
      ctaHref: "/contact",
      links: structure.nav.map((n) => ({ label: pick(n.label, lang), href: n.path })),
      image: NO_IMAGE,
    },
    style: {
      backgroundColor: "#0f172a",
      textColor: "#e2e8f0",
      paddingTop: 56,
      paddingBottom: 40,
      contentWidth: "wide",
      alignment: "left",
      layout: "default",
      cornerRadius: 0,
      borderWidth: 0,
    },
  };
}

function emitPage(page: PageIR, structure: TemplateStructureIR, ctx: EmitCtx): VirtualPageOut {
  const perType = new Map<WebsiteSectionType, number>();
  const nextId = (type: WebsiteSectionType): string => {
    const n = (perType.get(type) ?? 0) + 1;
    perType.set(type, n);
    return `${type}-${n}`.slice(0, LIMITS.sectionIdMax);
  };
  const sections: VirtualSectionOut[] = [];
  for (const sec of page.sections) {
    for (const { type, from } of expand(sec)) {
      sections.push({
        id: nextId(type),
        type,
        content: BUILDERS[type](from, ctx),
        style: styleFor(from, structure),
      });
    }
  }
  // asset 的页脚是整页固定尾部（不在 SectionKind 里），接口 B §2 要求每页补一节 footer。
  sections.push(footerSection(structure, ctx.lang, nextId("footer")));
  return {
    id: page.key,
    name: pick(page.label, ctx.lang),
    path: page.path,
    title: pick(page.title, ctx.lang),
    description: pick(structure.description, ctx.lang),
    sections,
  };
}

function fontFor(font: string): "sans" | "serif" | "mono" {
  return font === "serif" ? "serif" : "sans";
}

/** 结构 IR → 一份 `VirtualSiteConfig`（单语言；双语走两份文件）。 */
export function buildWebsiteSourceConfig(structure: TemplateStructureIR, lang: Lang = "zh"): VirtualSiteConfigOut {
  const t = structure.theme;
  const ctx: EmitCtx = {
    structure,
    lang,
    keyword: lang === "en" ? structure.sub.labelEn : structure.sub.label,
    photoCursor: 0,
  };
  const pages = structure.pages.slice(0, LIMITS.pagesMax).map((p) => emitPage(p, structure, ctx));
  return {
    siteName: pick(structure.brand, lang),
    themeColor: t.primary,
    backgroundColor: t.forceDark ? t.soft : "#ffffff",
    typography: {
      bodyFont: "sans",
      headingFont: fontFor(t.font),
      baseSize: 16,
      lineHeight: t.density === "compact" ? 1.55 : t.density === "airy" ? 1.75 : 1.65,
      headingWeight: 800,
    },
    navigation: structure.nav.map((n) => ({ label: pick(n.label, lang), href: n.path })),
    // `sections` 是 home 的兼容别名（接口 B §6）：两处写同一份数组。
    sections: pages[0]?.sections ?? [],
    pages,
  };
}

// ————————————————————————————————————————————————————————————
// 源码树（可部署 / 可打 zip / 可被平台内联成单页预览）
// ————————————————————————————————————————————————————————————

export interface SourceFile {
  path: string;
  mediaType: string;
  /** 文本成员直接带内容；二进制图片不给 text。 */
  text?: string;
  /** 二进制成员在仓库里的镜像源，物化调用方按字节复制。 */
  sourcePath?: string;
}

export interface SourceTree {
  entrypoint: string;
  files: SourceFile[];
}

/**
 * 渲染器（`assets/app.js`）—— 500 个模板共用**同一份**字节：
 * 所有差异都在 `site.json` 里，所以 artifact_blobs 里这份 JS/CSS 只存一次。
 */
export const RUNTIME_JS = String.raw`// OceanLeo website-source@1 runtime —— 按 site.json 渲染整站（22 个板块类型）。
//
// UC-4（docs/architecture/oceanleo-untrusted-content-isolation.md §8）：本运行时**没有任何
// innerHTML / outerHTML / document.write，也不拼 HTML 字符串**。所有节点都用
// createElement + textContent 造，于是文案里出现 <script> 只会作为字面文本显示，
// 不可能变成标记；href / src 过 safeUrl() 白名单（javascript: 一律降级成 "#"），
// 内联样式只接受受限的颜色 / 像素值。模板素材可以被 fork 成用户自己的站点，
// 那时 site.json 就是用户内容 —— 所以渲染面必须结构性免疫，而不是靠转义函数记得调。
(function () {
  "use strict";
  var LANGS = { zh: "site.json", en: "site.en.json" };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var state = { lang: document.documentElement.getAttribute("data-lang") === "en" ? "en" : "zh", cfg: null, page: 0 };

  function str(v) { return v == null ? "" : String(v); }

  /** 只放行锚点 / 站内相对路径 / http(s) / mailto / tel，其余（javascript: data: …）降级。 */
  function safeUrl(v) {
    var s = str(v).trim();
    if (!s) return "#";
    if (s.charAt(0) === "#" || s.charAt(0) === "/" || s.indexOf("./") === 0 || s.indexOf("../") === 0) return s;
    if (/^(?:https?:|mailto:|tel:)/i.test(s)) return s;
    return "#";
  }
  /** 颜色只收 #hex / rgb(a) / hsl(a) / 关键字；url(...) 之类进不来。 */
  function cssColor(v) {
    var s = str(v).trim();
    return /^(?:#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\)|[a-zA-Z]+)$/.test(s) ? s : "";
  }
  function px(v, max) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(Math.min(n, max || 400));
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

  function add(node, kids) {
    if (kids == null || kids === false || kids === "") return node;
    if (Object.prototype.toString.call(kids) === "[object Array]") {
      for (var i = 0; i < kids.length; i += 1) add(node, kids[i]);
      return node;
    }
    node.appendChild(kids.nodeType ? kids : document.createTextNode(str(kids)));
    return node;
  }

  /** 唯一的建节点入口：attrs.text 走 textContent，href/src 过白名单。 */
  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false || v === "") continue;
        if (k === "text") node.textContent = str(v);
        else if (k === "class") node.className = str(v);
        else if (k === "href" || k === "src") node.setAttribute(k, safeUrl(v));
        else node.setAttribute(k, str(v));
      }
    }
    return add(node, kids);
  }
  function t(tag, cls, value) { return value == null || value === "" ? null : h(tag, { class: cls, text: value }); }

  function img(desc, cls) {
    if (!desc || !desc.url) return null;
    return h("img", { src: desc.url, alt: str(desc.alt), loading: "lazy", class: cls || "" });
  }
  function portrait(desc) {
    if (desc && desc.url) return img(desc, "cover");
    return h("div", { class: "photo-slot", text: str(desc && (desc.alt || desc.keyword)) || "Upload photo" });
  }
  function icon(pathData) {
    if (!pathData) return null;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", str(pathData));
    svg.appendChild(p);
    return svg;
  }
  function heading(c) {
    if (!c.eyebrow && !c.title && !c.subtitle) return null;
    return h("header", { class: "sec-head" }, [
      t("p", "eyebrow", c.eyebrow),
      t("h2", null, c.title),
      t("p", "sub", c.subtitle),
    ]);
  }
  function btn(label, href, kind) {
    if (!label) return null;
    return h("a", { class: "btn " + (kind || "primary"), href: href || "#", text: label });
  }
  function cards(items, build, cls) {
    return h("div", { class: cls || "grid" }, (items || []).map(build));
  }
  function lines(values, tag, cls) {
    return (values || []).map(function (v) { return t(tag, cls, v); });
  }

  var R = {
    hero: function (c) {
      return h("div", { class: "hero-body" }, [
        h("div", { class: "hero-copy" }, [
          t("p", "eyebrow", c.eyebrow),
          t("h1", null, c.title),
          t("p", "lead", c.subtitle),
          h("div", { class: "cta-row" }, [
            btn(c.primaryCtaLabel, c.primaryCtaHref),
            btn(c.secondaryCtaLabel, c.secondaryCtaHref, "ghost"),
          ]),
        ]),
        c.image && c.image.url ? h("div", { class: "hero-media" }, img(c.image, "cover")) : null,
      ]);
    },
    stats: function (c) {
      return [heading(c), cards(c.items, function (it) {
        return h("div", { class: "stat" }, [
          t("div", "stat-value", it.value),
          t("div", "stat-label", it.label),
          t("p", "sub", it.description),
        ]);
      }, "grid grid-4")];
    },
    "feature-grid": function (c) {
      return [heading(c), cards(c.features, function (f) {
        return h("div", { class: "card" }, [
          h("span", { class: "icon" }, icon(f.icon)),
          t("h3", null, f.title),
          t("p", null, f.description),
        ]);
      }, "grid grid-3")];
    },
    about: function (c) {
      return h("div", { class: "split" }, [
        h("div", null, [
          t("p", "eyebrow", c.eyebrow),
          t("h2", null, c.title),
          lines(c.body, "p", null),
          (c.bullets || []).length ? h("ul", { class: "bullets" }, lines(c.bullets, "li", null)) : null,
        ]),
        c.image && c.image.url ? h("div", { class: "media" }, img(c.image, "cover")) : null,
      ]);
    },
    services: function (c) {
      return [heading(c), cards(c.items, function (it) {
        return h("div", { class: "card" }, [
          it.image && it.image.url
            ? h("div", { class: "thumb" }, img(it.image, "cover"))
            : h("span", { class: "icon" }, icon(it.icon)),
          t("h3", null, it.name),
          t("p", null, it.description),
        ]);
      }, "grid grid-4")];
    },
    products: function (c) {
      return [heading(c), cards(c.items, function (it) {
        return h("div", { class: "card product" }, [
          it.image && it.image.url ? h("div", { class: "thumb square" }, img(it.image, "cover")) : null,
          h("div", { class: "pad" }, [
            t("h3", null, it.name),
            t("span", "badge", it.note),
            t("div", "price", it.price),
            btn(c.ctaLabel, "/contact"),
          ]),
        ]);
      }, "grid grid-4")];
    },
    menu: function (c) {
      return [heading(c), h("div", { class: "grid grid-2" }, (c.groups || []).map(function (g) {
        return h("div", { class: "menu-group" }, [
          t("h3", null, g.name),
          (g.items || []).map(function (it) {
            return h("div", { class: "menu-row" }, [
              h("span", { text: it.name }),
              h("i", null, null),
              h("b", { text: it.price }),
            ]);
          }),
        ]);
      }))];
    },
    gallery: function (c) {
      return [heading(c), cards(c.items, function (it) {
        return h("figure", { class: "shot" }, [img(it.image, "cover"), t("figcaption", null, it.caption)]);
      }, "grid grid-3")];
    },
    cases: function (c) {
      return [heading(c), cards(c.items, function (it) {
        return h("article", { class: "card" }, [
          it.image && it.image.url ? h("div", { class: "thumb" }, img(it.image, "cover")) : null,
          h("div", { class: "pad" }, [
            t("span", "badge", it.tag),
            t("h3", null, it.title),
            t("p", null, it.description),
            it.linkLabel ? h("a", { class: "link", href: it.href || "#", text: str(it.linkLabel) + " →" }) : null,
          ]),
        ]);
      }, "grid grid-3")];
    },
    team: function (c) {
      return [heading(c), cards(c.members, function (m) {
        return h("div", { class: "member" }, [
          h("div", { class: "avatar" }, portrait(m.image)),
          t("h3", null, m.name),
          t("p", "role", m.role),
          t("p", "sub", m.bio),
        ]);
      }, "grid grid-4")];
    },
    process: function (c) {
      return [heading(c), cards(c.steps, function (s, i) {
        return h("div", { class: "step" }, [
          t("span", "step-no", s.step || i + 1),
          t("h3", null, s.title),
          t("p", null, s.description),
        ]);
      }, "grid grid-4")];
    },
    testimonials: function (c) {
      return [heading(c), cards(c.items, function (q) {
        return h("blockquote", { class: "card" }, [
          h("p", { text: "“" + str(q.quote) + "”" }),
          h("footer", { class: "quote-author" }, [
            h("span", { class: "avatar avatar-sm" }, portrait(q.image)),
            h("span", null, [h("b", { text: q.name }), " · " + str(q.role)]),
          ]),
        ]);
      }, "grid grid-3")];
    },
    faq: function (c) {
      return [
        heading(c),
        h("div", { class: "faq-list" }, (c.items || []).map(function (f) {
          return h("details", null, [t("summary", null, f.question), t("p", null, f.answer)]);
        })),
        c.footnote ? h("p", { class: "sub center" }, [str(c.footnote) + " ", btn(c.contactLabel, c.contactHref, "link")]) : null,
      ];
    },
    logos: function (c) {
      var build = function (l) {
        return h("span", { class: "logo" }, l.image && l.image.url ? img(l.image, "logo-img") : str(l.label));
      };
      var items = c.items || [];
      if (c.display === "marquee") {
        return [
          t("p", "eyebrow center", c.title),
          h("div", { class: "marquee" }, h("div", { class: "track" }, items.map(build).concat(items.map(build)))),
        ];
      }
      return [t("p", "eyebrow center", c.title), h("div", { class: "logo-strip" }, items.map(build))];
    },
    news: function (c) {
      return [heading(c), cards(c.items, function (n) {
        return h("article", { class: "card" }, [
          n.image && n.image.url ? h("div", { class: "thumb" }, img(n.image, "cover")) : null,
          h("div", { class: "pad" }, [
            t("p", "meta", str(n.category) + " · " + str(n.date)),
            t("h3", null, n.title),
            t("p", null, n.excerpt),
          ]),
        ]);
      }, "grid grid-3")];
    },
    chart: function (c) {
      var series = c.series || [];
      var max = series.reduce(function (m, s) { return Math.max(m, Number(s.value) || 0); }, 0) || 1;
      return [heading(c), h("div", { class: "split" }, [
        h("div", { class: "chart" }, series.map(function (s) {
          var pct = Math.max(0, Math.min(100, Math.round((Number(s.value) || 0) / max * 100)));
          return h("div", { class: "bar-wrap" }, [
            h("div", { class: "bar", style: "height:" + pct + "%" }, h("span", { text: s.value })),
            t("div", "bar-label", s.label),
          ]);
        })),
        h("div", null, [t("p", "insight", c.insight), t("p", "sub", c.footnote)]),
      ])];
    },
    timeline: function (c) {
      return [heading(c), h("ol", { class: "timeline" }, (c.items || []).map(function (it) {
        return h("li", null, [t("span", "year", it.label), t("h3", null, it.title), t("p", null, it.description)]);
      }))];
    },
    pricing: function (c) {
      return [heading(c), cards(c.plans, function (p) {
        return h("div", { class: "card plan" + (p.featured ? " featured" : "") }, [
          t("h3", null, p.name),
          t("div", "price", p.price),
          (p.highlights || []).length ? h("ul", null, lines(p.highlights, "li", null)) : null,
          btn(p.ctaLabel, "/contact"),
        ]);
      }, "grid grid-3")];
    },
    cta: function (c) {
      return h("div", { class: "cta-band" }, [
        h("div", null, [t("p", "eyebrow", c.eyebrow), t("h2", null, c.title), t("p", "lead", c.subtitle)]),
        h("div", { class: "cta-row" }, [btn(c.primaryLabel, c.primaryHref), btn(c.secondaryLabel, c.secondaryHref, "ghost")]),
        t("p", "sub", c.note),
      ]);
    },
    contact: function (c) {
      var form = h("form", { class: "form" }, [t("h3", null, c.formTitle)]);
      form.addEventListener("submit", function (ev) { ev.preventDefault(); });
      // 输入类型跟着字段走：电话给 tel（手机上弹数字键盘）、邮箱给 email（弹 @ 键盘并带浏览器校验）。
      // 结构 IR 的 contact.fields[].inputType 实测 160/160 件都是 [text,tel,email,textarea]，
      // 而这四格在接口 B 里是**定名字段**（nameLabel/phoneLabel/emailLabel/messageLabel），
      // 类型由字段身份唯一确定，所以按字段写死即可，不需要往 content 里加新键。
      [["nameLabel", "text"], ["phoneLabel", "tel"], ["emailLabel", "email"]].forEach(function (pair) {
        add(form, h("label", null, [str(c[pair[0]]), h("input", { type: pair[1] }, null)]));
      });
      add(form, h("label", null, [str(c.messageLabel), h("textarea", { rows: "4" }, null)]));
      add(form, h("button", { class: "btn primary", type: "submit", text: c.submitLabel }));
      return h("div", { class: "split" }, [
        h("div", null, [
          heading(c),
          h("ul", { class: "contact-list" }, [t("li", null, c.phone), t("li", null, c.email), t("li", null, c.address)]),
        ]),
        form,
      ]);
    },
    "page-header": function (c) {
      return h("div", { class: "page-header" }, [
        t("p", "eyebrow", c.eyebrow),
        t("h1", null, c.title),
        t("p", "sub", c.subtitle),
      ]);
    },
    footer: function (c) {
      return h("div", { class: "footer-grid" }, [
        h("div", null, [
          h("strong", { text: c.title }),
          t("p", null, c.description),
          btn(c.ctaLabel, c.ctaHref),
        ]),
        h("nav", null, (c.links || []).map(function (l) {
          return h("a", { href: l.href, text: l.label });
        })),
      ]);
    },
  };

  function sectionStyle(s) {
    var st = s.style || {};
    var css = "padding-top:" + px(st.paddingTop, 240) + "px;padding-bottom:" + px(st.paddingBottom, 240) + "px";
    var bg = cssColor(st.backgroundColor);
    var fg = cssColor(st.textColor);
    if (bg) css += ";background:" + bg;
    if (fg) css += ";color:" + fg;
    if (st.alignment === "center") css += ";text-align:center";
    return css;
  }

  function renderPage(idx) {
    var cfg = state.cfg;
    var page = cfg.pages[idx] || cfg.pages[0];
    state.page = idx;
    document.title = page.title || cfg.siteName;
    var host = clear(document.getElementById("site-main"));
    (page.sections || []).forEach(function (s) {
      var render = R[s.type];
      if (!render) return;
      var st = s.style || {};
      var sec = h("section", {
        id: s.id,
        class: "sec sec-" + str(s.type) + " w-" + str(st.contentWidth || "wide") + " flow-" + str(st.layout || "default"),
        style: sectionStyle(s),
      }, h("div", { class: "inner" }, render(s.content || {})));
      host.appendChild(sec);
    });
    var links = document.querySelectorAll("#site-nav a[data-page]");
    for (var i = 0; i < links.length; i += 1) links[i].classList.toggle("active", Number(links[i].getAttribute("data-page")) === idx);
    window.scrollTo(0, 0);
  }

  function renderChrome() {
    var cfg = state.cfg;
    var root = document.documentElement;
    root.style.setProperty("--primary", cssColor(cfg.themeColor) || "#2563eb");
    root.style.setProperty("--page-bg", cssColor(cfg.backgroundColor) || "#ffffff");
    root.style.setProperty("--heading-font", cfg.typography && cfg.typography.headingFont === "serif"
      ? "Georgia,'Noto Serif SC',serif"
      : "system-ui,-apple-system,'PingFang SC',sans-serif");
    var lh = Number(cfg.typography && cfg.typography.lineHeight);
    root.style.setProperty("--line-height", String(isFinite(lh) && lh > 0 ? Math.min(lh, 3) : 1.65));
    var nav = clear(document.getElementById("site-nav"));
    add(nav, h("a", { class: "brand", href: "#", text: cfg.siteName }));
    add(nav, h("nav", null, (cfg.pages || []).map(function (p, i) {
      return h("a", { href: "#", "data-page": String(i), text: p.name });
    })));
    add(nav, h("button", { id: "lang-toggle", type: "button", text: state.lang === "en" ? "中" : "EN" }));
    nav.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("a[data-page]") : null;
      if (a) { ev.preventDefault(); renderPage(Number(a.getAttribute("data-page"))); return; }
      if (ev.target.id === "lang-toggle") { ev.preventDefault(); load(state.lang === "en" ? "zh" : "en"); }
    });
  }

  function fail(message) {
    var host = clear(document.getElementById("site-main"));
    add(host, h("pre", { class: "load-error", text: "site.json load failed: " + str(message) }));
  }

  function load(lang) {
    state.lang = lang;
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "zh-CN");
    document.documentElement.setAttribute("data-lang", lang);
    return fetch(LANGS[lang]).then(function (r) { return r.json(); }).then(function (cfg) {
      state.cfg = cfg;
      renderChrome();
      renderPage(0);
    }).catch(function (err) {
      fail(err && err.message);
    });
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="/"]') : null;
    if (!a) return;
    var path = a.getAttribute("href");
    var idx = (state.cfg && state.cfg.pages || []).findIndex(function (p) { return p.path === path; });
    if (idx >= 0) { ev.preventDefault(); renderPage(idx); }
  });

  load(state.lang);
})();
`;

/** 样式表 —— 同样 500 个模板共用一份；配色/字体/圆角由 site.json 注入 CSS 变量。 */
export const RUNTIME_CSS = String.raw`:root{--primary:#2563eb;--page-bg:#fff;--ink:#0f172a;--sub:#475569;--heading-font:system-ui,-apple-system,'PingFang SC',sans-serif;--line-height:1.65;--radius:16px}
*{box-sizing:border-box}
body{margin:0;background:var(--page-bg);color:var(--ink);font:16px/var(--line-height) system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
h1,h2,h3,.brand{font-family:var(--heading-font);line-height:1.15;margin:0}
h1{font-size:clamp(2.1rem,5vw,3.4rem);font-weight:800}
h2{font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800}
h3{font-size:1.05rem;font-weight:700}
p{margin:.55em 0}
a{color:inherit;text-decoration:none}
#site-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:1.5rem;padding:.85rem 1.5rem;background:#ffffffef;backdrop-filter:blur(8px);border-bottom:1px solid #0000000f}
#site-nav .brand{font-weight:800;font-size:1.05rem}
#site-nav nav{display:flex;gap:1.1rem;margin-left:auto;font-size:.9rem}
#site-nav nav a.active{color:var(--primary);font-weight:600}
#lang-toggle{border:1px solid var(--primary);color:var(--primary);background:transparent;border-radius:999px;padding:.25rem .6rem;font-size:.75rem;cursor:pointer}
.sec{width:100%}
.sec .inner{margin:0 auto;padding:0 1.5rem}
.w-narrow .inner{max-width:48rem}.w-normal .inner{max-width:64rem}.w-wide .inner{max-width:72rem}.w-full .inner{max-width:none}
.sec-head{max-width:42rem;margin-bottom:2.25rem}
.sec[style*="text-align:center"] .sec-head{margin-left:auto;margin-right:auto}
.eyebrow{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin:0 0 .5rem}
.lead{font-size:1.06rem;opacity:.9}
.sub{opacity:.75;font-size:.94rem}
.center{text-align:center}
.grid{display:grid;gap:1.25rem}
.grid-2{grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))}
.grid-3{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))}
.grid-4{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
.split{display:grid;gap:2.5rem;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));align-items:center}
.flow-reverse .split>*:first-child{order:2}
.card{background:#ffffff14;border:1px solid #8888881f;border-radius:var(--radius);overflow:hidden;padding:1.35rem}
.card .pad,.product .pad{padding:0}
.card .thumb,.hero-media,.media,.avatar,.shot{border-radius:var(--radius);overflow:hidden}
.card .thumb{margin:-1.35rem -1.35rem 1rem}
.thumb.square img{aspect-ratio:1/1}
img.cover,.logo-img{display:block;width:100%;height:100%;object-fit:cover}
.hero-body{display:grid;gap:2.5rem;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));align-items:center}
.hero-media img{height:22rem}
.cta-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
.btn{display:inline-block;padding:.7rem 1.6rem;border-radius:999px;font-weight:600;background:var(--primary);color:#fff}
.btn.ghost{background:transparent;border:1.5px solid currentColor;color:inherit}
.btn.link{background:none;padding:0;color:var(--primary)}
.icon{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;border-radius:12px;background:#8888881f;color:var(--primary);margin-bottom:.85rem}
.stat{text-align:center}
.stat-value{font-size:2.1rem;font-weight:800;color:var(--primary)}
.stat-label{font-size:.88rem;opacity:.75}
.badge{display:inline-block;padding:.15rem .55rem;border-radius:999px;background:var(--primary);color:#fff;font-size:.72rem;margin:.4rem 0}
.price{font-size:1.35rem;font-weight:800;color:var(--primary);margin:.4rem 0}
.plan.featured{outline:2px solid var(--primary)}
.plan ul,.bullets{list-style:none;padding:0;margin:.9rem 0;display:grid;gap:.45rem;font-size:.92rem}
.plan li::before,.bullets li::before{content:"✓";color:var(--primary);margin-right:.45rem}
.menu-row{display:flex;align-items:baseline;gap:.6rem;padding:.35rem 0}
.menu-row i{flex:1;border-bottom:1px dotted #88888855}
.menu-row b{color:var(--primary)}
.member{text-align:center}
.member .avatar{width:9rem;height:9rem;margin:0 auto 1rem}
.avatar .photo-slot{width:100%;height:100%}
.avatar-sm{display:inline-flex;width:3.25rem!important;height:3.25rem!important;flex:0 0 auto;margin:0!important}
.photo-slot{display:flex;align-items:center;justify-content:center;padding:.65rem;border:1px dashed #88888866;border-radius:var(--radius);background:#88888812;color:inherit;font-size:.72rem;line-height:1.25;text-align:center}
.role{color:var(--primary);font-size:.9rem;margin:.2rem 0}
.step-no{display:inline-block;font-size:1.6rem;font-weight:800;color:var(--primary);opacity:.35}
blockquote{margin:0}
blockquote footer{margin-top:.9rem;font-size:.85rem;opacity:.75}
.quote-author{display:flex;align-items:center;gap:.7rem;text-align:left}
.faq-list{display:grid;gap:.7rem}
details{border:1px solid #8888881f;border-radius:var(--radius);padding:1rem 1.15rem}
summary{cursor:pointer;font-weight:600}
.logo-strip,.marquee .track{display:flex;gap:2rem;align-items:center;flex-wrap:wrap;justify-content:center;opacity:.7;font-weight:700}
.marquee{overflow:hidden}
.marquee .track{flex-wrap:nowrap;width:max-content;animation:mq 26s linear infinite}
@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.chart{display:flex;align-items:flex-end;gap:1.1rem;height:14rem}
.bar-wrap{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center}
.bar{background:var(--primary);border-radius:8px 8px 0 0;position:relative;min-height:8px}
.bar span{position:absolute;top:-1.5rem;left:0;right:0;font-size:.8rem;font-weight:700}
.bar-label{font-size:.8rem;opacity:.7;margin-top:.4rem}
.insight{font-weight:600;font-size:1.05rem}
.timeline{list-style:none;padding:0;display:grid;gap:1.6rem}
.timeline .year{font-size:.8rem;font-weight:700;color:var(--primary);letter-spacing:.1em}
.timeline li{border-left:2px solid #88888833;padding-left:1.2rem}
.page-header h1{font-size:clamp(1.6rem,3.4vw,2.4rem)}
.cta-band{display:grid;gap:1.25rem}
.contact-list{list-style:none;padding:0;display:grid;gap:.6rem;font-size:.95rem}
.form{display:grid;gap:.75rem;padding:1.5rem;border:1px solid #8888881f;border-radius:var(--radius)}
.form label{display:grid;gap:.35rem;font-size:.85rem}
.form input,.form textarea{border:1px solid #88888833;border-radius:10px;padding:.6rem .75rem;font:inherit;background:transparent;color:inherit}
.footer-grid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}
.footer-grid nav{display:grid;gap:.5rem;font-size:.9rem;opacity:.85}
.load-error{padding:2rem;color:#b91c1c}
@media (max-width:640px){#site-nav nav{display:none}}
`;

function manifestFor(files: SourceFile[], sha256: (text: string) => string, byteLen: (text: string) => number) {
  return {
    schema: WEBSITE_SOURCE_SCHEMA,
    entrypoint: ENTRY_HTML,
    files: files.map((f) => ({
      path: f.path,
      dependencyPath: f.path,
      // lib 保持 fs-free：文本可在这里计算摘要；图片的真实字节由 sourcePath 交给
      // 物化调用方复制，不能拿路径字符串伪造 sha/byteSize，所以二进制项如实省略。
      ...(f.text !== undefined ? { sha256: sha256(f.text), byteSize: byteLen(f.text) } : {}),
      mediaType: f.mediaType,
      fileMode: 0o100644,
    })),
  };
}

/** 从工程对象与结构证据里找出全部站内图片引用；只认本地 images/ 前缀。 */
function referencedImagePaths(...roots: unknown[]): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith(`${SITE_IMAGE_DIR}/`)) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item);
    }
  };
  for (const root of roots) visit(root);
  return [...found].sort();
}

function imageSourceFiles(...roots: unknown[]): SourceFile[] {
  return referencedImagePaths(...roots).map((path) => {
    const fileName = path.slice(`${SITE_IMAGE_DIR}/`.length);
    return {
      path,
      mediaType: "image/webp",
      sourcePath: `${MIRROR_PUBLIC_DIR}/${fileName}`,
    };
  });
}

function indexHtml(structure: TemplateStructureIR, lang: Lang): string {
  const t = structure.theme;
  const title = lang === "en" ? structure.siteTitle.en : structure.siteTitle.zh;
  const desc = lang === "en" ? structure.description.en : structure.description.zh;
  return `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "zh-CN"}" data-lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}"/>
<meta name="generator" content="OceanLeo ${WEBSITE_SOURCE_SCHEMA} · ${structure.slug}"/>
<link rel="stylesheet" href="assets/styles.css"/>
<style>:root{--radius:${cssToken(t.radiusTokens.card)};--ink:${cssToken(t.ink)};--sub:${cssToken(t.subInk)}}</style>
</head>
<body>
<header id="site-nav"></header>
<main id="site-main"></main>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/** CSS 变量值只放行颜色 / 长度字面量：`}`、`url(`、`<` 之类进不了生成的 <style> 块。 */
function cssToken(s: string): string {
  const v = String(s).trim();
  return /^(?:#[0-9a-fA-F]{3,8}|-?[\d.]+(?:px|rem|em|%)?|rgba?\([\d.,\s%]+\)|[a-zA-Z-]+)$/.test(v) ? v : "";
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function readme(structure: TemplateStructureIR): string {
  const t = structure.theme;
  const pages = structure.pages.map((p) => `\`${p.path}\`（${p.label.zh}，${p.sections.length} 节）`).join(" · ");
  return `# ${structure.brand.zh} · ${structure.sub.label}官网模板

由 OceanLeo 模板专区（asset）的 taxonomy × DNA × 内容包确定性生成，格式 \`${WEBSITE_SOURCE_SCHEMA}\`。
**内容为官方虚构样例**，不含任何真实企业、人物或联系方式。

- 模板 slug：\`${structure.slug}\`
- 布局家族：${t.layoutLabel}（\`${t.layoutKey}\`）
- 配色：${t.paletteLabel}（\`${t.paletteKey}\`，主色 ${t.primary}）
- 版式基因：圆角 ${t.radius} / 密度 ${t.density} / 标题字族 ${t.font}
- 页面：${pages}
- 双语：\`${SITE_CONFIG_PATH}\`（中文）与 \`${SITE_CONFIG_EN_PATH}\`（English），页面右上角切换

## 文件

| 文件 | 作用 |
|---|---|
| \`${SITE_CONFIG_PATH}\` | 工程对象（页面 → 板块 → 槽位）。改文案、换图、删加板块都在这里 |
| \`${SITE_CONFIG_EN_PATH}\` | 英文版工程对象，结构与中文版逐节一致 |
| \`${ENTRY_HTML}\` | 页面骨架，只有导航容器与主体容器 |
| \`assets/styles.css\` | 全部样式；主色/圆角/字体走 CSS 变量 |
| \`assets/app.js\` | 按工程对象渲染 22 类板块 |
| \`${STRUCTURE_PATH}\` | 结构中间表示（含每节变体号与槽位角色），供校验与二次生成 |

## 本地预览

\`\`\`bash
python3 -m http.server 8080
\`\`\`

页面用 \`fetch\` 读工程对象，需启动上面的本地服务后打开 \`localhost:8080\`
（直接双击 \`${ENTRY_HTML}\` 不会渲染）。

> \`${MANIFEST_PATH}\` 是平台侧文件清单（校验用），不参与渲染，删掉不影响部署。
`;
}

export interface BuildTreeOptions {
  /** 首屏语言（默认 zh；双语两份工程对象都会写进树）。 */
  defaultLang?: Lang;
  /** 是否把结构 IR 也放进源码树（默认放，是保真度证据）。 */
  includeStructure?: boolean;
  /** sha256 与字节数计算（node 侧传 crypto 实现；浏览器侧不需要清单可不传）。 */
  sha256?: (text: string) => string;
  byteLen?: (text: string) => number;
}

export interface WebsiteSourceBundle {
  structure: TemplateStructureIR;
  config: VirtualSiteConfigOut;
  configEn: VirtualSiteConfigOut;
  tree: SourceTree;
}

/**
 * 一步产出整份可物化的素材：结构 IR + 双语工程对象 + 源码树。
 *
 * 源码树形状与 `websiteSourceTree()` 对齐：entrypoint 是清单，清单的 `entrypoint`
 * 字段指向真 HTML。平台的 `buildInlinedPreviewHtml()` 会把 css/js 内联、给 json 打
 * fetch 垫片，于是**同一棵树既能下载成 zip 部署，又能在沙箱 iframe 里单页预览**。
 */
export function buildWebsiteSourceBundle(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  opts: BuildTreeOptions = {},
): WebsiteSourceBundle {
  const lang: Lang = opts.defaultLang ?? "zh";
  const structure = buildTemplateStructure(meta, industry, sub);
  const config = buildWebsiteSourceConfig(structure, "zh");
  const configEn = buildWebsiteSourceConfig(structure, "en");
  const siteFiles: SourceFile[] = [
    { path: ENTRY_HTML, mediaType: "text/html", text: indexHtml(structure, lang) },
    { path: SITE_CONFIG_PATH, mediaType: "application/json", text: `${JSON.stringify(config, null, 2)}\n` },
    { path: SITE_CONFIG_EN_PATH, mediaType: "application/json", text: `${JSON.stringify(configEn, null, 2)}\n` },
    { path: "assets/styles.css", mediaType: "text/css", text: RUNTIME_CSS },
    { path: "assets/app.js", mediaType: "text/javascript", text: RUNTIME_JS },
    { path: "README.md", mediaType: "text/markdown", text: readme(structure) },
  ];
  if (opts.includeStructure !== false) {
    siteFiles.push({
      path: STRUCTURE_PATH,
      mediaType: "application/json",
      text: `${JSON.stringify(structure, null, 2)}\n`,
    });
  }
  // 工程对象与结构证据里引用到的每张图都随站点发运；去重后用 sourcePath 交给
  // node 调用方复制真实字节，lib 本身不碰 fs。
  siteFiles.push(...imageSourceFiles(structure, config, configEn));
  const sha = opts.sha256;
  const len = opts.byteLen ?? ((t: string) => new TextEncoder().encode(t).length);
  const manifest = manifestFor(siteFiles, sha ?? (() => ""), len);
  const tree: SourceTree = {
    entrypoint: MANIFEST_PATH,
    files: [
      { path: MANIFEST_PATH, mediaType: "application/json", text: `${JSON.stringify(manifest, null, 2)}\n` },
      ...siteFiles,
    ],
  };
  return { structure, config, configEn, tree };
}

/** 素材选材键（website / make 两站按行业 / 子类 / 色系挑模板时用这几维）。 */
export function selectionKeysFor(structure: TemplateStructureIR) {
  return {
    slug: structure.slug,
    industryKey: structure.industry.key,
    industryLabel: structure.industry.label,
    subKey: structure.sub.key,
    subLabel: structure.sub.label,
    colorKey: structure.colorKey,
    paletteKey: structure.theme.paletteKey,
    paletteFamily: structure.theme.paletteFamily,
    layoutKey: structure.theme.layoutKey,
    layoutLabel: structure.theme.layoutLabel,
    isSignature: structure.theme.isSignature,
    pages: structure.totals.pages,
    sections: structure.totals.sections,
    slots: structure.totals.slots,
    images: structure.totals.images,
    interfaceB: INTERFACE_B_VERSION,
  };
}

/** 发射自检：22 个目标类型的 content 组装器齐全、38 个 kind 全有落点。 */
export function assertEmitterComplete(): void {
  for (const kind of ALL_SECTION_KINDS) {
    const type = SECTION_TYPE_MAP[kind];
    if (!type) throw new Error(`接口 B 缺 ${kind} 的落点`);
    if (!BUILDERS[type]) throw new Error(`缺 ${type} 的 content 组装器（kind=${kind}）`);
    if (!SECTION_CONTENT_SCHEMA[type]) throw new Error(`缺 ${type} 的 content schema`);
  }
}
