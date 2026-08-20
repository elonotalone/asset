// 模板结构中间表示（IR）—— 把「请求时现算的 HTML」里隐含的工程结构显式化。
//
// 为什么需要这一层：`template-engine.ts` 的 renderHero / renderAbout / renderServices …
// 每个渲染器都同时做两件事——① 决定这一节有哪些槽位（哪个是标题、哪个是正文、哪个是
// 图、哪个是主色）；② 把槽位拍平成带内联样式的 HTML 字符串。HTML 是**有损输出**：
// 渲染那一刻「哪些节 / 什么顺序 / 哪个槽位是文案哪个是图」全丢了，所以拿 HTML 反推
// 结构是脆路。结构在上游本来就在（taxonomy × DNA × 内容包），这里只是把它**读出来**，
// 不解析任何 HTML。
//
// 边界：本文件**只读**上游模块（taxonomy / dna / 内容包 / 图片池 / i18n），不 import
// `template-engine.ts`。需要与 HTML 预览一致的数据（例如图表曲线）下沉到共享纯函数，
// 两端分别读取，不从已经渲染的 HTML 反推。
//
// 变体号与引擎同源：`variantOf(kind,count) = (hashStr(slug+":sec:"+kind+":"+pageKey)
// + dna.styleSeed) % count`，与 `makeCtx()` 里那行一致；每个 SectionIR 都带
// `variant/variantCount`，可与 HTML 侧交叉核对（见 tests/template-website-source.test.mjs）。
//
// 下游：`template-website-source.ts` 把 IR 按接口 B 映射成 `website-source@1` /
// VirtualSiteConfig 工程对象。

import { hashStr } from "./hash";
import {
  DENSITY_TOKENS,
  FONT_STACK,
  PAGE_LABEL,
  RADIUS_TOKENS,
  dnaFor,
  mainPageKey,
  type PageKey,
  type SectionKind,
  type TemplateDNA,
} from "./template-dna";
import { mainPageLabel, type ShapeKey, type SkinKey } from "./template-skins";
import { poolFallbackPhoto, poolPhoto } from "./template-photo-pool";
import { sitePhotoPath } from "./template-photo-local";
import {
  buildBiContent,
  buildBiExt,
  flattenContent,
  flattenExt,
  type BiContent,
  type BiExt,
} from "./template-content-bi";
import type { SiteContent } from "./template-content";
import type { ExtContent } from "./template-content-ext";
import type { Industry, SubCategory, TemplateMeta } from "./template-taxonomy";
import { UI, secTitle, subEn, ui } from "./template-i18n";
import { chartSeriesFor } from "./template-chart-data";

// ————————————————————————————————————————————————————————————
// IR 类型
// ————————————————————————————————————————————————————————————

/** 一对中英文本（IR 全程保留双语，落地时再按目标语言取值）。 */
export interface BiText {
  zh: string;
  en: string;
}

/** 槽位的数据类型。 */
export type SlotKind = "text" | "richtext" | "list" | "image" | "icon" | "link" | "price";

/** 槽位在版式里的角色（编辑器据此决定用什么控件、以及可省略性）。 */
export type SlotRole =
  | "eyebrow"
  | "heading"
  | "subheading"
  | "body"
  | "label"
  | "value"
  | "meta"
  | "cta"
  | "media"
  | "decor";

export interface SlotIR {
  /** 槽位名。与目标工程对象的 content 键同名（发射器据此直接落键，不做二次翻译）。 */
  name: string;
  kind: SlotKind;
  role: SlotRole;
  /** 单值文本槽。 */
  text?: BiText;
  /** 多值文本槽（kind="list"）。 */
  texts?: BiText[];
  /** 图片槽在下载站点内的相对路径；空值表示等待所有者提供真实图片。 */
  url?: string;
  /** 图片槽在模板内的图序号（引擎 `img(ctx, i, …)` 的 i；用于交叉核对）。 */
  imageIndex?: number;
  /** icon 槽的单条 svg path。 */
  iconPath?: string;
  /** link / cta 槽的目标。 */
  href?: string;
  /** 文案与图片槽一律可编辑（website 编辑器的硬要求）。 */
  editable: boolean;
}

/** 重复组里的一条（可再嵌套子组，例如菜单的「分组 → 菜品」）。 */
export interface BlockIR {
  key: string;
  slots: SlotIR[];
  groups?: RepeatGroupIR[];
}

/** 列表型内容（服务卡、案例、团队、价目…）。 */
export interface RepeatGroupIR {
  /** 组名。与目标 content 键同名。 */
  name: string;
  label?: BiText;
  blocks: BlockIR[];
}

/** 这一节的视觉意图（HTML 里被内联样式拍平的那部分，显式化）。 */
export interface SectionIntentIR {
  /** 整幅底色语义。 */
  surface: "page" | "soft" | "card" | "gradient" | "dark" | "image" | "primary";
  align: "left" | "center";
  /** 主色（品牌色）——HTML 里散落在 20 处内联样式的那个值。 */
  primaryColor: string;
  textColor: string;
  subTextColor: string;
  /** 文字是否压在深底上。 */
  onDark: boolean;
  /** 这一节是否用配图（同一 kind 的不同变体可能有图也可能无图）。 */
  hasMedia: boolean;
  /** 栅格列数意图（0 = 非栅格）。 */
  columns: number;
}

export interface SectionIR {
  /** 页内稳定 id（`<kind>-<页内同类序号>`，kebab-case）。 */
  id: string;
  kind: SectionKind;
  /** 页内顺序（0-based）。 */
  order: number;
  /** 引擎选中的样式变体序号 / 变体总数（与 HTML 同源）。 */
  variant: number;
  variantCount: number;
  intent: SectionIntentIR;
  /** 固定槽位。 */
  slots: SlotIR[];
  /** 重复组。 */
  groups: RepeatGroupIR[];
}

export interface PageIR {
  key: PageKey;
  /** 站内路径（home → "/"）。 */
  path: string;
  label: BiText;
  title: BiText;
  sections: SectionIR[];
}

export interface ThemeIR {
  shapeKey: ShapeKey;
  layoutKey: string;
  layoutLabel: string;
  skinKey: SkinKey;
  skinLabel: string;
  paletteKey: string;
  paletteLabel: string;
  paletteFamily: string;
  primary: string;
  primaryDark: string;
  gradFrom: string;
  gradTo: string;
  soft: string;
  ink: string;
  subInk: string;
  accent: string;
  heroDark: boolean;
  forceDark: boolean;
  radius: string;
  radiusTokens: { card: string; btn: string; img: string; pill: string };
  density: string;
  densityTokens: { section: string; gap: string; h1: string; h2: string };
  font: string;
  fontStack: string;
  accentFx: string;
  isSignature: boolean;
}

export interface TemplateStructureIR {
  schema: "oceanleo.template-structure@1";
  slug: string;
  title: string;
  variant: number;
  industry: { key: string; label: string };
  sub: { key: string; label: string; labelEn: string };
  colorKey: string;
  brand: BiText;
  siteTitle: BiText;
  description: BiText;
  contact: { phone: string; email: string; address: BiText };
  footerSlogan: BiText;
  /** 主营占位解析后的真实 website page key；即使当前 s3 没有主营页也保留。 */
  mainPage: { key: PageKey; label: BiText };
  theme: ThemeIR;
  nav: { key: PageKey; path: string; label: BiText }[];
  pages: PageIR[];
  totals: { pages: number; sections: number; slots: number; images: number; kinds: string[] };
}

// ————————————————————————————————————————————————————————————
// 提取上下文
// ————————————————————————————————————————————————————————————

interface IrCtx {
  meta: TemplateMeta;
  dna: TemplateDNA;
  zh: { c: SiteContent; ext: ExtContent };
  en: { c: SiteContent; ext: ExtContent };
  pageKey: PageKey;
  pageLabel: BiText;
  mainPageKey: PageKey;
  variantOf: (kind: SectionKind, count: number) => number;
  /** 行业化 section 标题（双语成对）。 */
  st: (kind: "cases" | "team" | "process" | "products" | "gallery" | "news") => {
    title: BiText;
    sub?: BiText;
  };
  /** UI 词条（双语成对）。 */
  u: (key: keyof typeof UI) => BiText;
  /** 子类显示名（双语）。 */
  subName: BiText;
}

function bi(zh: string, en: string): BiText {
  return { zh, en };
}

const MAIN_PAGE_LABEL_EN: Readonly<Record<string, string>> = {
  作品: "Work",
  服务: "Services",
  商品: "Goods",
  课程: "Courses",
  菜单: "Menu",
  产品: "Products",
  项目: "Projects",
  拍品: "Auction Lots",
  客房: "Rooms",
  线路: "Tours",
  房源: "Listings",
  车辆: "Vehicles",
};

function mainLabel(meta: TemplateMeta): BiText {
  const zh = mainPageLabel(meta.industryKey, meta.subKey);
  return bi(zh, MAIN_PAGE_LABEL_EN[zh] ?? "Offerings");
}

function onMainPage(ctx: IrCtx): boolean {
  return ctx.pageKey === ctx.mainPageKey;
}

function mainSubtitle(ctx: IrCtx): BiText {
  const subjectZh = ctx.subName.zh;
  const subjectEn = ctx.subName.en;
  const byLabel: Readonly<Record<string, BiText>> = {
    作品: bi(`${subjectZh}的代表作品与创作成果`, `Selected ${subjectEn} work and creative outcomes`),
    服务: bi(`${subjectZh}可提供的核心服务`, `Core ${subjectEn} services`),
    商品: bi(`${subjectZh}的示例商品与参考价格`, `Sample ${subjectEn} goods and reference prices`),
    课程: bi(`${subjectZh}的课程方向与学习内容`, `${subjectEn} courses and learning topics`),
    菜单: bi(`${subjectZh}的具体菜品与示例价格`, `${subjectEn} dishes and sample prices`),
    产品: bi(`${subjectZh}的核心产品与规格示例`, `Core ${subjectEn} products and sample specifications`),
    项目: bi(`${subjectZh}的代表项目`, `Representative ${subjectEn} projects`),
    拍品: bi(`${subjectZh}的示例拍品`, `Sample ${subjectEn} auction lots`),
    客房: bi(`${subjectZh}的房型与适住选择`, `${subjectEn} room types and stay options`),
    线路: bi(`${subjectZh}的目的地与行程选择`, `${subjectEn} destinations and itineraries`),
    房源: bi(`${subjectZh}的可租房源示例`, `Sample ${subjectEn} rental listings`),
    车辆: bi(`${subjectZh}的可租车型示例`, `Sample ${subjectEn} rental vehicles`),
  };
  return byLabel[ctx.pageLabel.zh]
    ?? bi(`${subjectZh}的主营内容`, `Core ${subjectEn} offerings`);
}

/** 与引擎 `img()` 完全一致的图片解析（同一 seed 公式、同一图池、同一兜底）。 */
function photoFor(ctx: IrCtx, i: number): string {
  const seed = ctx.dna.imgSeed + i * 13;
  return poolPhoto(ctx.meta.subKey, seed) || poolFallbackPhoto(seed);
}

const KEBAB: Partial<Record<SectionKind, string>> = {
  pageHeader: "page-header",
  sigEditorialHero: "editorial-hero",
  sigEditorialFeature: "editorial-feature",
  sigEditorialGallery: "editorial-gallery",
  sigPullQuote: "pull-quote",
  sigNeonHero: "neon-hero",
  sigGlassGrid: "glass-grid",
  sigNeonStats: "neon-stats",
  sigCodeWindow: "code-window",
  sigFsIntro: "fs-intro",
  sigFsPanel: "fs-panel",
  sigFsSplit: "fs-split",
  sigBentoHero: "bento-hero",
  sigBentoFeatures: "bento-features",
  sigBrutalHero: "brutal-hero",
  sigBrutalCards: "brutal-cards",
  sigStickerCta: "sticker-cta",
};

/** 章节 id 的稳定前缀。website 侧 `normalizeSection` 只接受 `[A-Za-z0-9_.-]`。 */
export function sectionIdPrefix(kind: SectionKind): string {
  return KEBAB[kind] ?? kind;
}

// ————————————————————————————————————————————————————————————
// 槽位构造小工具
// ————————————————————————————————————————————————————————————

function text(name: string, role: SlotRole, v: BiText): SlotIR {
  return { name, kind: "text", role, text: v, editable: true };
}
function rich(name: string, role: SlotRole, v: BiText): SlotIR {
  return { name, kind: "richtext", role, text: v, editable: true };
}
function listSlot(name: string, role: SlotRole, zh: string[], en: string[]): SlotIR {
  return {
    name,
    kind: "list",
    role,
    texts: zh.map((z, i) => bi(z, en[i] ?? z)),
    editable: true,
  };
}
function image(ctx: IrCtx, name: string, i: number): SlotIR {
  return { name, kind: "image", role: "media", url: sitePhotoPath(photoFor(ctx, i)), imageIndex: i, editable: true };
}
/** 人物等不能由图库代填的可编辑图片位：保留槽位，不编造 URL。 */
function emptyImage(name = "image"): SlotIR {
  return { name, kind: "image", role: "media", editable: true };
}
function icon(name: string, path: string): SlotIR {
  return { name, kind: "icon", role: "decor", iconPath: path, editable: true };
}
function cta(name: string, v: BiText, href: string): SlotIR {
  return { name, kind: "link", role: "cta", text: v, href, editable: true };
}
function price(name: string, v: BiText): SlotIR {
  return { name, kind: "price", role: "value", text: v, editable: true };
}

/** 双语并行取列表（zh / en 两侧由同一份 Bi 内容包摊平，长度天然一致）。 */
function pairs<Z, E>(zh: Z[], en: E[], n?: number): [Z, E][] {
  const len = typeof n === "number" ? Math.min(n, zh.length) : zh.length;
  const out: [Z, E][] = [];
  for (let i = 0; i < len; i += 1) out.push([zh[i], en[i] ?? (zh[i] as unknown as E)]);
  return out;
}

function intent(ctx: IrCtx, over: Partial<SectionIntentIR> = {}): SectionIntentIR {
  const p = ctx.dna.palette;
  return {
    surface: "page",
    align: "center",
    primaryColor: p.primary,
    textColor: p.ink,
    subTextColor: p.sub,
    onDark: ctx.dna.forceDark,
    hasMedia: false,
    columns: 0,
    ...over,
  };
}

const FEATURE_ICONS = [
  "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z",
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "M13 2L3 14h7l-1 8 10-12h-7z",
  "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20",
  "M16 14a4 4 0 10-8 0M12 7a3 3 0 100 6 3 3 0 000-6z",
  "M4 20V10M10 20V4M16 20v-8M22 20H2",
];

const GLYPHS = [
  "M13 2L3 14h7l-1 8 10-12h-7z",
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20",
  "M4 20V10M10 20V4M16 20v-8M22 20H2",
  "M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h3M18 12h3M12 3v3M12 18v3",
  "M20 6L9 17l-5-5",
];

// ————————————————————————————————————————————————————————————
// 分节结构提取器：一个 renderXxx 对应一个 irXxx
// ————————————————————————————————————————————————————————————

type Extractor = (ctx: IrCtx) => { variant: number; variantCount: number; intent: SectionIntentIR; slots: SlotIR[]; groups: RepeatGroupIR[] };

function irHero(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const v = ctx.variantOf("hero", 6);
  // 变体 → 底色/对齐/是否有大图（对应 renderHero 的 v0…v5 分支）。
  const surface: SectionIntentIR["surface"] =
    v === 1 || v === 5 ? "image" : v === 2 ? "page" : v === 3 ? "soft" : "gradient";
  const align: SectionIntentIR["align"] = v === 1 || v === 2 || v === 4 ? "center" : "left";
  const onDark = v === 1 || v === 5 ? true : v === 0 || v === 4 ? ctx.dna.palette.heroDark : ctx.dna.forceDark;
  const slots: SlotIR[] = [
    text("eyebrow", "eyebrow", bi(`${ctx.subName.zh} · ${ctx.u("proSolution").zh}`, `${ctx.subName.en} · ${ctx.u("proSolution").en}`)),
    text("title", "heading", bi(zh.c.heroTitle, en.c.heroTitle)),
    rich("subtitle", "subheading", bi(zh.c.heroSubtitle, en.c.heroSubtitle)),
    cta("primaryCta", bi(zh.c.heroCta, en.c.heroCta), "/contact"),
    cta("secondaryCta", bi(zh.c.heroCtaAlt, en.c.heroCtaAlt), "/services"),
  ];
  // v4（居中纯渐变）是 renderHero 唯一不配图的变体，别凭空发明一张图。
  const hasMedia = v !== 4;
  if (hasMedia) slots.push(image(ctx, "image", 0));
  return { variant: v, variantCount: 6, intent: intent(ctx, { surface, align, onDark, hasMedia }), slots, groups: [] };
}

function irStats(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("stats", 3);
  const blocks = pairs(ctx.zh.c.stats, ctx.en.c.stats).map(([z, e], i) => ({
    key: `stat-${i + 1}`,
    slots: [price("value", bi(z.value, e.value)), text("label", "label", bi(z.label, e.label))],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 2 ? "gradient" : v === 0 ? "page" : "card", onDark: v === 2 || ctx.dna.forceDark, columns: 4 }),
    slots: [],
    groups: [{ name: "items", blocks }],
  };
}

function irAbout(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const v = ctx.variantOf("about", 3);
  const slots: SlotIR[] = [
    text("eyebrow", "eyebrow", bi(zh.c.aboutTitle, en.c.aboutTitle)),
    text("title", "heading", bi(zh.c.heroTitle, en.c.heroTitle)),
    listSlot("body", "body", zh.c.aboutBody, en.c.aboutBody),
    listSlot(
      "highlights",
      "label",
      zh.c.services.slice(0, 3).map((s) => s.name),
      en.c.services.slice(0, 3).map((s) => s.name),
    ),
  ];
  // v2 是纯文字双栏（无图）；v0/v1 有配图 + 数字浮标（图序号 7，见 renderAbout）。
  if (v !== 2) {
    slots.push(image(ctx, "image", 7));
    const s0z = zh.c.stats[0];
    const s0e = en.c.stats[0];
    if (s0z) {
      slots.push(price("badgeValue", bi(s0z.value, s0e?.value ?? s0z.value)));
      slots.push(text("badgeLabel", "label", bi(s0z.label, s0e?.label ?? s0z.label)));
    }
  }
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: "page", align: "left", hasMedia: v !== 2, columns: 2 }),
    slots,
    groups: [],
  };
}

function irFeatures(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const v = ctx.variantOf("features", 4);
  const blocks = pairs(zh.c.features, en.c.features, 6).map(([z, e], i) => ({
    key: `feature-${i + 1}`,
    slots: [
      icon("icon", z.icon || FEATURE_ICONS[i % FEATURE_ICONS.length]),
      text("title", "heading", bi(z.title, e.title)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: v,
    variantCount: 4,
    intent: intent(ctx, { surface: v === 3 ? "dark" : "soft", onDark: v === 3 || ctx.dna.forceDark, columns: 3 }),
    slots: [
      text("title", "heading", bi(zh.c.featuresTitle, en.c.featuresTitle)),
      rich("subtitle", "subheading", bi(zh.c.featuresSubtitle, en.c.featuresSubtitle)),
    ],
    groups: [{ name: "features", blocks }],
  };
}

function irServices(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const v = ctx.variantOf("services", 4);
  const withImage = v === 0 || v === 1; // v2 编号列表、v3 图标卡都不用配图
  const main = onMainPage(ctx);
  const blocks = pairs(zh.c.services, en.c.services).map(([z, e], i) => {
    const slots: SlotIR[] = [
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
    ];
    if (withImage) slots.push(image(ctx, "image", 20 + i));
    if (v === 3) slots.push(icon("icon", FEATURE_ICONS[i % FEATURE_ICONS.length]));
    if (v === 2) slots.push(text("index", "meta", bi(String(i + 1).padStart(2, "0"), String(i + 1).padStart(2, "0"))));
    return { key: `service-${i + 1}`, slots };
  });
  return {
    variant: v,
    variantCount: 4,
    intent: intent(ctx, {
      surface: v === 2 || v === 3 ? "soft" : "page",
      align: v === 2 ? "left" : "center",
      hasMedia: withImage,
      columns: v === 2 ? 1 : 4,
    }),
    slots: [
      text("title", "heading", main ? ctx.pageLabel : bi(zh.c.servicesTitle, en.c.servicesTitle)),
      rich(
        "subtitle",
        "subheading",
        main ? mainSubtitle(ctx) : bi(zh.c.servicesSubtitle, en.c.servicesSubtitle),
      ),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irProducts(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("products", 3);
  const st = ctx.st("products");
  const main = onMainPage(ctx);
  const blocks = pairs(ctx.zh.ext.products, ctx.en.ext.products).map(([z, e], i) => ({
    key: `product-${i + 1}`,
    slots: [
      text("title", "heading", bi(z.name, e.name)),
      price("price", bi(z.price, e.price)),
      text("badge", "meta", bi(z.note, e.note)),
      image(ctx, "image", 40 + i),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "soft" : "page", align: v === 2 ? "left" : "center", hasMedia: true, columns: 4 }),
    slots: [
      text("title", "heading", main ? ctx.pageLabel : st.title),
      ...(main
        ? [rich("subtitle", "subheading", mainSubtitle(ctx))]
        : st.sub ? [rich("subtitle", "subheading", st.sub)] : []),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irMenu(ctx: IrCtx): ReturnType<Extractor> {
  const main = onMainPage(ctx);
  const blocks = pairs(ctx.zh.ext.menu, ctx.en.ext.menu).map(([z, e], gi) => ({
    key: `menu-group-${gi + 1}`,
    slots: [text("title", "heading", bi(z.group, e.group))],
    groups: [
      {
        name: "items",
        blocks: pairs(z.items, e.items).map(([iz, ie], ii) => ({
          key: `dish-${ii + 1}`,
          slots: [text("title", "label", bi(iz.name, ie.name)), price("price", bi(iz.price, ie.price))],
        })),
      },
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", columns: 2 }),
    slots: [
      text("title", "heading", main ? ctx.pageLabel : ctx.u("secMenu")),
      rich("subtitle", "subheading", main ? mainSubtitle(ctx) : ctx.u("secMenuSub")),
    ],
    groups: [{ name: "groups", blocks }],
  };
}

function irGallery(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("gallery", 3);
  const st = ctx.st("gallery");
  const main = onMainPage(ctx);
  // 图数与 renderGallery 各变体一致：v0 = 6 张、v1 = 1 大 + 4、v2 = 8 张横滚。
  const count = v === 1 ? 5 : v === 2 ? 8 : 6;
  const blocks = Array.from({ length: count }, (_, i) => {
    const z = ctx.zh.ext.cases[i % ctx.zh.ext.cases.length];
    const e = ctx.en.ext.cases[i % ctx.en.ext.cases.length] ?? z;
    return {
      key: `shot-${i + 1}`,
      slots: [
        text("title", "heading", bi(z.title, e.title)),
        rich("description", "body", bi(z.desc, e.desc)),
        image(ctx, "image", 60 + i),
      ],
    };
  });
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 2 ? "soft" : "page", align: v === 2 ? "left" : "center", hasMedia: true, columns: v === 2 ? 0 : 3 }),
    slots: [
      text("title", "heading", main ? ctx.pageLabel : st.title),
      ...(main
        ? [rich("subtitle", "subheading", mainSubtitle(ctx))]
        : st.sub ? [rich("subtitle", "subheading", st.sub)] : []),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irCases(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("cases", 3);
  const st = ctx.st("cases");
  const count = v === 1 ? 3 : v === 2 ? 4 : ctx.zh.ext.cases.length;
  const blocks = pairs(ctx.zh.ext.cases, ctx.en.ext.cases, count).map(([z, e], i) => ({
    key: `case-${i + 1}`,
    slots: [
      text("tag", "meta", bi(z.tag, e.tag)),
      text("title", "heading", bi(z.title, e.title)),
      rich("description", "body", bi(z.desc, e.desc)),
      image(ctx, "image", 80 + i),
      ...(v === 1 ? [cta("linkLabel", ctx.u("viewDetail"), "/cases")] : []),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "page" : "soft", hasMedia: true, columns: v === 0 ? 3 : 2 }),
    slots: [text("title", "heading", st.title), ...(st.sub ? [rich("subtitle", "subheading", st.sub)] : [])],
    groups: [{ name: "items", blocks }],
  };
}

function irTeam(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("team", 3);
  const st = ctx.st("team");
  const blocks = pairs(ctx.zh.ext.team, ctx.en.ext.team).map(([z, e], i) => ({
    key: `member-${i + 1}`,
    slots: [
      text("title", "heading", bi(z.name, e.name)),
      text("role", "label", bi(z.role, e.role)),
      // 图库人物不能冒充站点所有者的真实员工；给编辑器留空头像位。
      emptyImage(),
      ...(v === 2
        ? [
            rich(
              "description",
              "body",
              bi(`深耕${ctx.meta.subLabel}多年，实战经验丰富。`, `Years of hands-on ${ctx.meta.subLabel} experience.`),
            ),
          ]
        : []),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "soft" : "page", hasMedia: true, columns: v === 2 ? 2 : 4 }),
    slots: [text("title", "heading", st.title), ...(st.sub ? [rich("subtitle", "subheading", st.sub)] : [])],
    groups: [{ name: "items", blocks }],
  };
}

function irPricing(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("pricing", 3);
  const count = v === 2 ? 2 : ctx.zh.ext.pricing.length;
  const blocks = pairs(ctx.zh.ext.pricing, ctx.en.ext.pricing, count).map(([z, e], i) => ({
    key: `plan-${i + 1}`,
    slots: [
      text("title", "heading", bi(z.name, e.name)),
      price("price", bi(z.price, e.price)),
      text("unit", "meta", bi(z.unit, e.unit)),
      listSlot("highlights", "label", z.features, e.features),
      cta("ctaLabel", ctx.u("consultNow"), "/contact"),
      text("featured", "meta", bi(z.featured ? "1" : "", z.featured ? "1" : "")),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 0 ? "soft" : "page", columns: v === 2 ? 2 : 3 }),
    slots: [text("title", "heading", ctx.u("secPricing")), rich("subtitle", "subheading", ctx.u("secPricingSub"))],
    groups: [{ name: "plans", blocks }],
  };
}

function irProcess(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("process", 3);
  const st = ctx.st("process");
  const blocks = pairs(ctx.zh.ext.process, ctx.en.ext.process).map(([z, e], i) => ({
    key: `step-${i + 1}`,
    slots: [
      text("step", "meta", bi(z.step, e.step)),
      text("title", "heading", bi(z.title, e.title)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "soft" : "page", columns: v === 0 ? 4 : v === 1 ? 4 : 1 }),
    slots: [text("title", "heading", st.title), ...(st.sub ? [rich("subtitle", "subheading", st.sub)] : [])],
    groups: [{ name: "steps", blocks }],
  };
}

function irTestimonials(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("testimonials", 3);
  const blocks = pairs(ctx.zh.c.testimonials, ctx.en.c.testimonials).map(([z, e], i) => ({
    key: `quote-${i + 1}`,
    slots: [
      rich("quote", "body", bi(z.text, e.text)),
      text("title", "label", bi(z.name, e.name)),
      text("role", "meta", bi(z.role, e.role)),
      // 客户头像同样必须由所有者提供，不能用 stock face 编造背书。
      emptyImage(),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 2 ? "page" : "soft", align: v === 1 ? "left" : "center", columns: 3 }),
    slots: [text("title", "heading", bi(ctx.zh.c.testimonialsTitle, ctx.en.c.testimonialsTitle))],
    groups: [{ name: "items", blocks }],
  };
}

function irFaq(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("faq", 3);
  const blocks = pairs(ctx.zh.ext.faq, ctx.en.ext.faq).map(([z, e], i) => ({
    key: `faq-${i + 1}`,
    slots: [text("question", "heading", bi(z.q, e.q)), rich("answer", "body", bi(z.a, e.a))],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "soft" : "page", align: v === 1 ? "left" : "center", columns: v === 2 ? 2 : 1 }),
    slots: [text("title", "heading", ctx.u("secFaq")), rich("subtitle", "subheading", ctx.u("secFaqSub"))],
    groups: [{ name: "items", blocks }],
  };
}

function irLogos(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.ext.logos, ctx.en.ext.logos).map(([z, e], i) => ({
    key: `logo-${i + 1}`,
    slots: [text("title", "label", bi(z, e))],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page" }),
    slots: [text("title", "eyebrow", ctx.u("trustedBy"))],
    groups: [{ name: "items", blocks }],
  };
}

function irNews(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("news", 3);
  const st = ctx.st("news");
  const blocks = pairs(ctx.zh.ext.news, ctx.en.ext.news).map(([z, e], i) => ({
    key: `post-${i + 1}`,
    slots: [
      text("date", "meta", bi(z.date, e.date)),
      text("category", "meta", bi(z.cat, e.cat)),
      text("title", "heading", bi(z.title, e.title)),
      rich("excerpt", "body", bi(z.excerpt, e.excerpt)),
      // v1 是「左日期块右文」的无图列表；其余变体每条都有封面（图序号 120+i）。
      ...(v === 1 ? [] : [image(ctx, "image", 120 + i)]),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 0 || v === 2 ? "soft" : "page", hasMedia: v !== 1, columns: v === 0 ? 3 : v === 2 ? 2 : 1 }),
    slots: [text("title", "heading", st.title), ...(st.sub ? [rich("subtitle", "subheading", st.sub)] : [])],
    groups: [{ name: "items", blocks }],
  };
}

function irChart(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("chart", 3);
  const dz = chartSeriesFor(ctx.meta, "zh");
  const de = chartSeriesFor(ctx.meta, "en");
  const blocks = dz.labels.map((lb, i) => ({
    key: `point-${i + 1}`,
    slots: [
      text("label", "label", bi(lb, de.labels[i] ?? lb)),
      price("value", bi(String(dz.values[i]), String(de.values[i] ?? dz.values[i]))),
    ],
  }));
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: "page", columns: 3 }),
    slots: [
      text("title", "heading", bi(dz.title, de.title)),
      text("unit", "meta", bi(dz.unit, de.unit)),
      rich("subtitle", "subheading", bi(`${ctx.u("chartUnit").zh}：${dz.unit} · ${ctx.u("chartNote").zh}`, `${ctx.u("chartUnit").en}: ${de.unit} · ${ctx.u("chartNote").en}`)),
      rich("insight", "body", bi(dz.insight, de.insight)),
      rich("footnote", "meta", ctx.u("chartFootnote")),
      text("chartStyle", "meta", bi(v === 0 ? "bar" : v === 1 ? "area" : "donut", v === 0 ? "bar" : v === 1 ? "area" : "donut")),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irTimeline(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("timeline", 2);
  const year = 2020 + (hashStr(ctx.meta.slug + ":tl") % 3);
  const poolZh: [string, string][] = [
    ["品牌创立", "团队组建，深耕行业首个标杆项目落地。"],
    ["体系成型", "服务流程标准化，通过行业资质认证。"],
    ["规模扩张", "服务网络覆盖全省，客户数突破千家。"],
    ["数字升级", "上线数字化服务平台，体验全面提速。"],
    ["迈向全国", "跨区域布局，携手伙伴共建行业生态。"],
  ];
  const poolEn: [string, string][] = [
    ["Founded", "Team formed; first benchmark project delivered."],
    ["System Built", "Standardized processes; industry certifications earned."],
    ["Scaling Up", "Network across the region; over a thousand clients."],
    ["Going Digital", "Launched a digital platform; faster experience."],
    ["Nationwide", "Cross-region expansion; building an ecosystem with partners."],
  ];
  const useProcess = ctx.zh.ext.process.length >= 4;
  const rows = useProcess
    ? pairs(ctx.zh.ext.process, ctx.en.ext.process, 5).map(([z, e], i) => ({
        year: `${year + i}`,
        title: bi(z.title, e.title),
        desc: bi(z.desc, e.desc),
      }))
    : poolZh.map((z, i) => ({ year: `${year + i}`, title: bi(z[0], poolEn[i][0]), desc: bi(z[1], poolEn[i][1]) }));
  const blocks = rows.map((r, i) => ({
    key: `milestone-${i + 1}`,
    slots: [text("step", "meta", bi(r.year, r.year)), text("title", "heading", r.title), rich("description", "body", r.desc)],
  }));
  // v0 用「发展历程」标题、v1 用「发展里程碑」（与 renderTimeline 两个分支一致）。
  const titleKey = v === 0 ? "secTimeline" : "secMilestone";
  const subKey = v === 0 ? "secTimelineSub" : "secMilestoneSub";
  return {
    variant: v,
    variantCount: 2,
    intent: intent(ctx, { surface: v === 0 ? "soft" : "page", align: v === 0 ? "center" : "left", columns: v === 0 ? 1 : 5 }),
    slots: [text("title", "heading", ctx.u(titleKey)), rich("subtitle", "subheading", ctx.u(subKey))],
    groups: [{ name: "items", blocks }],
  };
}

function irMarquee(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.ext.logos, ctx.en.ext.logos).map(([z, e], i) => ({
    key: `logo-${i + 1}`,
    slots: [text("title", "label", bi(z, e))],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft" }),
    slots: [
      text(
        "title",
        "eyebrow",
        bi(`${ctx.u("chosenBy").zh} ${ctx.zh.c.brand}`, `${ctx.u("chosenBy").en} ${ctx.en.c.brand}`),
      ),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irCta(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const v = ctx.variantOf("cta", 3);
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 2 ? "page" : "gradient", align: v === 1 ? "left" : "center", onDark: v !== 2 }),
    slots: [
      text("title", "heading", bi(zh.c.ctaTitle, en.c.ctaTitle)),
      rich("subtitle", "subheading", bi(zh.c.ctaSubtitle, en.c.ctaSubtitle)),
      cta("ctaLabel", bi(zh.c.ctaButton, en.c.ctaButton), `tel:${zh.c.contactPhone}`),
      ...(v === 1 ? [cta("secondaryCta", ctx.u("onlineConsult"), "/contact")] : []),
      text("phone", "meta", bi(zh.c.contactPhone, en.c.contactPhone)),
    ],
    groups: [],
  };
}

function irContact(ctx: IrCtx): ReturnType<Extractor> {
  const { zh, en } = ctx;
  const fields: [keyof typeof UI, string][] = [
    ["yourName", "text"],
    ["yourPhone", "tel"],
    ["yourEmail", "email"],
    ["yourNeed", "textarea"],
  ];
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", columns: 2 }),
    slots: [
      text("title", "heading", ctx.u("contactUs")),
      rich("subtitle", "subheading", ctx.u("contactLead")),
      text("phone", "value", bi(zh.c.contactPhone, en.c.contactPhone)),
      text("email", "value", bi(zh.c.contactEmail, en.c.contactEmail)),
      text("address", "value", bi(zh.c.contactAddress, en.c.contactAddress)),
      cta("ctaLabel", ctx.u("submit"), "/contact"),
    ],
    groups: [
      {
        name: "fields",
        blocks: fields.map(([key, type], i) => ({
          key: `field-${i + 1}`,
          slots: [text("label", "label", ctx.u(key)), text("inputType", "meta", bi(type, type))],
        })),
      },
    ],
  };
}

function irPageHeader(ctx: IrCtx): ReturnType<Extractor> {
  const v = ctx.variantOf("pageHeader", 3);
  return {
    variant: v,
    variantCount: 3,
    intent: intent(ctx, { surface: v === 1 ? "soft" : v === 2 ? "page" : "gradient", align: v === 2 ? "center" : "left", onDark: v === 0 }),
    slots: [
      text("title", "heading", ctx.pageLabel),
      text(
        "subtitle",
        "subheading",
        bi(`${ctx.zh.c.brand} · ${ctx.pageLabel.zh}`, `${ctx.en.c.brand} · ${ctx.pageLabel.en}`),
      ),
      text("breadcrumb", "meta", bi(`${ctx.zh.c.brand} / ${ctx.pageLabel.zh}`, `${ctx.en.c.brand} / ${ctx.pageLabel.en}`)),
    ],
    groups: [],
  };
}

// ——— v3 特色家族（sig*）：视觉语汇独立，但槽位语义与共享节同源 ———

function kickerOf(ctx: IrCtx): BiText {
  return bi(`${ctx.subName.zh} · ${ctx.zh.c.brand}`, `${ctx.subName.en} · ${ctx.en.c.brand}`);
}

function irSigEditorialHero(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", hasMedia: true, columns: 12 }),
    slots: [
      text("eyebrow", "eyebrow", kickerOf(ctx)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle)),
      cta("primaryCta", bi(ctx.zh.c.heroCta, ctx.en.c.heroCta), "/contact"),
      image(ctx, "image", 0),
    ],
    groups: [],
  };
}

function irSigEditorialFeature(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.features, ctx.en.c.features, 3).map(([z, e], i) => ({
    key: `feature-${i + 1}`,
    slots: [
      text("index", "meta", bi(`0${i + 1}`, `0${i + 1}`)),
      text("title", "heading", bi(z.title, e.title)),
      rich("description", "body", bi(z.desc, e.desc)),
      icon("icon", z.icon || FEATURE_ICONS[i % FEATURE_ICONS.length]),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", columns: 3 }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.featuresTitle, ctx.en.c.featuresTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.featuresSubtitle, ctx.en.c.featuresSubtitle)),
    ],
    groups: [{ name: "features", blocks }],
  };
}

function irSigEditorialGallery(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.services, ctx.en.c.services, 4).map(([z, e], i) => ({
    key: `row-${i + 1}`,
    slots: [
      text("index", "meta", bi(`— 0${i + 1}`, `— 0${i + 1}`)),
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
      image(ctx, "image", 20 + i),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", hasMedia: true, columns: 2 }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.servicesTitle, ctx.en.c.servicesTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.servicesSubtitle, ctx.en.c.servicesSubtitle)),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigPullQuote(ctx: IrCtx): ReturnType<Extractor> {
  const tz = ctx.zh.c.testimonials[0];
  const te = ctx.en.c.testimonials[0];
  const quote = tz ? bi(tz.text, te?.text ?? tz.text) : bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle);
  const who = tz
    ? bi(`${tz.name} · ${tz.role}`, `${te?.name ?? tz.name} · ${te?.role ?? tz.role}`)
    : bi(ctx.zh.c.brand, ctx.en.c.brand);
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "center" }),
    slots: [rich("quote", "heading", quote), text("attribution", "meta", who)],
    groups: [{ name: "items", blocks: [{ key: "quote-1", slots: [rich("quote", "body", quote), text("title", "label", who)] }] }],
  };
}

function irSigNeonHero(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "dark", align: "center", onDark: true }),
    slots: [
      text("eyebrow", "eyebrow", kickerOf(ctx)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle)),
      cta("primaryCta", bi(ctx.zh.c.heroCta, ctx.en.c.heroCta), "/contact"),
      cta("secondaryCta", bi(ctx.zh.c.heroCtaAlt, ctx.en.c.heroCtaAlt), "/services"),
    ],
    groups: [],
  };
}

function irSigGlassGrid(ctx: IrCtx): ReturnType<Extractor> {
  const zsrc = ctx.zh.c.services.length ? ctx.zh.c.services : ctx.zh.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const esrc = ctx.en.c.services.length ? ctx.en.c.services : ctx.en.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const blocks = pairs(zsrc, esrc, 6).map(([z, e], i) => ({
    key: `card-${i + 1}`,
    slots: [
      icon("icon", GLYPHS[i % GLYPHS.length]),
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "dark", onDark: true, columns: 3 }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.servicesTitle, ctx.en.c.servicesTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.servicesSubtitle, ctx.en.c.servicesSubtitle)),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigNeonStats(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.stats, ctx.en.c.stats).map(([z, e], i) => ({
    key: `stat-${i + 1}`,
    slots: [price("value", bi(z.value, e.value)), text("label", "label", bi(z.label, e.label))],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "dark", onDark: true, columns: 4 }),
    slots: [],
    groups: [{ name: "items", blocks }],
  };
}

function irSigCodeWindow(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "dark", align: "left", onDark: true, columns: 2 }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.ctaTitle, ctx.en.c.ctaTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.ctaSubtitle, ctx.en.c.ctaSubtitle)),
      cta("ctaLabel", bi(ctx.zh.c.ctaButton, ctx.en.c.ctaButton), "/contact"),
      text("codeBrand", "meta", bi(ctx.zh.c.brand, ctx.en.c.brand)),
    ],
    groups: [],
  };
}

function irSigFsIntro(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "image", align: "center", onDark: true, hasMedia: true }),
    slots: [
      text("eyebrow", "eyebrow", kickerOf(ctx)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle)),
      cta("primaryCta", bi(ctx.zh.c.heroCta, ctx.en.c.heroCta), "/contact"),
      image(ctx, "image", 0),
    ],
    groups: [],
  };
}

function irSigFsPanel(ctx: IrCtx): ReturnType<Extractor> {
  const zpool = ctx.zh.c.services.length ? ctx.zh.c.services : ctx.zh.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const epool = ctx.en.c.services.length ? ctx.en.c.services : ctx.en.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const idx = ctx.variantOf("sigFsPanel", zpool.length || 1);
  const z = zpool[idx] ?? { name: ctx.zh.c.aboutTitle, desc: ctx.zh.c.aboutBody[0] || ctx.zh.c.heroSubtitle };
  const e = epool[idx] ?? { name: ctx.en.c.aboutTitle, desc: ctx.en.c.aboutBody[0] || ctx.en.c.heroSubtitle };
  return {
    variant: idx,
    variantCount: zpool.length || 1,
    intent: intent(ctx, { surface: "image", align: idx % 2 === 1 ? "left" : "left", onDark: true, hasMedia: true }),
    slots: [
      text("eyebrow", "eyebrow", ctx.pageLabel),
      text("title", "heading", bi(z.name, e.name)),
      rich("subtitle", "subheading", bi(z.desc, e.desc)),
      image(ctx, "image", 10 + idx),
    ],
    groups: [],
  };
}

function irSigFsSplit(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", align: "left", hasMedia: true, columns: 2 }),
    slots: [
      text("eyebrow", "eyebrow", bi(ctx.zh.c.aboutTitle, ctx.en.c.aboutTitle)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      listSlot("body", "body", ctx.zh.c.aboutBody, ctx.en.c.aboutBody),
      cta("primaryCta", bi(ctx.zh.c.heroCta, ctx.en.c.heroCta), "/contact"),
      image(ctx, "image", 30),
    ],
    groups: [],
  };
}

function irSigBentoHero(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.stats, ctx.en.c.stats, 2).map(([z, e], i) => ({
    key: `stat-${i + 1}`,
    slots: [price("value", bi(z.value, e.value)), text("label", "label", bi(z.label, e.label))],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", align: "left", hasMedia: true, columns: 4 }),
    slots: [
      text("eyebrow", "eyebrow", kickerOf(ctx)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle)),
      image(ctx, "image", 0),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigBentoFeatures(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.features, ctx.en.c.features, 5).map(([z, e], i) => ({
    key: `feature-${i + 1}`,
    slots: [
      icon("icon", z.icon || GLYPHS[i % GLYPHS.length]),
      text("title", "heading", bi(z.title, e.title)),
      rich("description", "body", bi(z.desc, e.desc)),
      // 第一格是跨行大块（bento 的招牌），显式记下来，别让下游猜。
      text("emphasis", "meta", bi(i === 0 ? "feature" : "", i === 0 ? "feature" : "")),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", columns: 3 }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.featuresTitle, ctx.en.c.featuresTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.featuresSubtitle, ctx.en.c.featuresSubtitle)),
    ],
    groups: [{ name: "features", blocks }],
  };
}

function irSigBrutalHero(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "primary", align: "left", hasMedia: true }),
    slots: [
      text("eyebrow", "eyebrow", kickerOf(ctx)),
      text("title", "heading", bi(ctx.zh.c.heroTitle, ctx.en.c.heroTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.heroSubtitle, ctx.en.c.heroSubtitle)),
      cta("primaryCta", bi(ctx.zh.c.heroCta, ctx.en.c.heroCta), "/contact"),
      image(ctx, "image", 0),
    ],
    groups: [],
  };
}

function irSigBrutalCards(ctx: IrCtx): ReturnType<Extractor> {
  const zsrc = ctx.zh.c.services.length ? ctx.zh.c.services : ctx.zh.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const esrc = ctx.en.c.services.length ? ctx.en.c.services : ctx.en.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const blocks = pairs(zsrc, esrc, 6).map(([z, e], i) => ({
    key: `card-${i + 1}`,
    slots: [
      text("index", "meta", bi(`0${i + 1}`, `0${i + 1}`)),
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", align: "left", columns: 3 }),
    slots: [text("title", "heading", bi(ctx.zh.c.servicesTitle, ctx.en.c.servicesTitle))],
    groups: [{ name: "items", blocks }],
  };
}

function irSigStickerCta(ctx: IrCtx): ReturnType<Extractor> {
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "primary", align: "center", onDark: true }),
    slots: [
      text("title", "heading", bi(ctx.zh.c.ctaTitle, ctx.en.c.ctaTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.ctaSubtitle, ctx.en.c.ctaSubtitle)),
      cta("ctaLabel", bi(ctx.zh.c.ctaButton, ctx.en.c.ctaButton), `tel:${ctx.zh.c.contactPhone}`),
      text("phone", "meta", bi(ctx.zh.c.contactPhone, ctx.en.c.contactPhone)),
    ],
    groups: [],
  };
}

// —— 素白 / 自然 / 暖砂 / 深蓝的签名版块 ————————————————————
//
// 这四套装原先没有自己的签名节。它们各自的结构主张不同，所以槽位形状也各不相同：
// 素白是一张编号索引表（无图、无卡片、只有细线），自然是一条上下交错的图文缎带，
// 暖砂是一排手作印章（数字 + 印记文字），深蓝是一张年份账目表。

function irSigPaperIndex(ctx: IrCtx): ReturnType<Extractor> {
  const zsrc = ctx.zh.c.services.length ? ctx.zh.c.services : ctx.zh.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const esrc = ctx.en.c.services.length ? ctx.en.c.services : ctx.en.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const blocks = pairs(zsrc, esrc, 8).map(([z, e], i) => ({
    key: `row-${i + 1}`,
    slots: [
      text("index", "meta", bi(String(i + 1).padStart(2, "0"), String(i + 1).padStart(2, "0"))),
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", columns: 1, hasMedia: false }),
    slots: [
      text("eyebrow", "eyebrow", bi("索引", "Index")),
      text("title", "heading", bi(ctx.zh.c.servicesTitle, ctx.en.c.servicesTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.servicesSubtitle, ctx.en.c.servicesSubtitle)),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigNatureRibbon(ctx: IrCtx): ReturnType<Extractor> {
  const zBody = ctx.zh.c.aboutBody;
  const eBody = ctx.en.c.aboutBody;
  const blocks = pairs(zBody, eBody, 3).map(([z, e], i) => ({
    key: `band-${i + 1}`,
    slots: [
      text("title", "heading", bi(ctx.zh.c.features[i]?.title ?? ctx.zh.c.aboutTitle, ctx.en.c.features[i]?.title ?? ctx.en.c.aboutTitle)),
      rich("description", "body", bi(z, e)),
      image(ctx, "image", 40 + i),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "soft", align: "left", columns: 2, hasMedia: true }),
    slots: [
      text("eyebrow", "eyebrow", bi("一路生长", "How we grow")),
      text("title", "heading", bi(ctx.zh.c.aboutTitle, ctx.en.c.aboutTitle)),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigSandStamp(ctx: IrCtx): ReturnType<Extractor> {
  const blocks = pairs(ctx.zh.c.stats, ctx.en.c.stats, 4).map(([z, e], i) => ({
    key: `stamp-${i + 1}`,
    slots: [
      price("value", bi(z.value, e.value)),
      text("label", "label", bi(z.label, e.label)),
      icon("icon", GLYPHS[(i + 3) % GLYPHS.length]),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "card", align: "center", columns: 4 }),
    slots: [
      text("title", "heading", bi("手作留痕", "Made by hand")),
      rich("subtitle", "subheading", bi(ctx.zh.c.aboutBody[0] ?? "", ctx.en.c.aboutBody[0] ?? "")),
    ],
    groups: [{ name: "items", blocks }],
  };
}

function irSigNavyLedger(ctx: IrCtx): ReturnType<Extractor> {
  const zsrc = ctx.zh.c.services.length ? ctx.zh.c.services : ctx.zh.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const esrc = ctx.en.c.services.length ? ctx.en.c.services : ctx.en.c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const blocks = pairs(zsrc, esrc, 6).map(([z, e], i) => ({
    key: `line-${i + 1}`,
    slots: [
      text("year", "meta", bi(`No.${String(i + 1).padStart(2, "0")}`, `No.${String(i + 1).padStart(2, "0")}`)),
      text("title", "heading", bi(z.name, e.name)),
      rich("description", "body", bi(z.desc, e.desc)),
    ],
  }));
  return {
    variant: 0,
    variantCount: 1,
    intent: intent(ctx, { surface: "page", align: "left", columns: 1 }),
    slots: [
      text("eyebrow", "eyebrow", bi("业务清单", "Ledger")),
      text("title", "heading", bi(ctx.zh.c.servicesTitle, ctx.en.c.servicesTitle)),
      rich("subtitle", "subheading", bi(ctx.zh.c.servicesSubtitle, ctx.en.c.servicesSubtitle)),
    ],
    groups: [{ name: "items", blocks }],
  };
}

const EXTRACTORS: Record<SectionKind, Extractor> = {
  hero: irHero,
  stats: irStats,
  about: irAbout,
  features: irFeatures,
  services: irServices,
  products: irProducts,
  menu: irMenu,
  gallery: irGallery,
  cases: irCases,
  team: irTeam,
  pricing: irPricing,
  process: irProcess,
  testimonials: irTestimonials,
  faq: irFaq,
  logos: irLogos,
  news: irNews,
  chart: irChart,
  timeline: irTimeline,
  marquee: irMarquee,
  cta: irCta,
  contact: irContact,
  pageHeader: irPageHeader,
  sigEditorialHero: irSigEditorialHero,
  sigEditorialFeature: irSigEditorialFeature,
  sigEditorialGallery: irSigEditorialGallery,
  sigPullQuote: irSigPullQuote,
  sigNeonHero: irSigNeonHero,
  sigGlassGrid: irSigGlassGrid,
  sigNeonStats: irSigNeonStats,
  sigCodeWindow: irSigCodeWindow,
  sigFsIntro: irSigFsIntro,
  sigFsPanel: irSigFsPanel,
  sigFsSplit: irSigFsSplit,
  sigBentoHero: irSigBentoHero,
  sigBentoFeatures: irSigBentoFeatures,
  sigBrutalHero: irSigBrutalHero,
  sigBrutalCards: irSigBrutalCards,
  sigStickerCta: irSigStickerCta,
  sigPaperIndex: irSigPaperIndex,
  sigNatureRibbon: irSigNatureRibbon,
  sigSandStamp: irSigSandStamp,
  sigNavyLedger: irSigNavyLedger,
};

/** 所有 asset 章节种类（发射器/接口 B 的完整性由测试对着这张表查）。 */
export const ALL_SECTION_KINDS = Object.keys(EXTRACTORS) as SectionKind[];

// ————————————————————————————————————————————————————————————
// 入口
// ————————————————————————————————————————————————————————————

function pagePath(pk: PageKey): string {
  return pk === "home" ? "/" : `/${pk}`;
}

function countSlots(sections: SectionIR[]): { slots: number; images: number } {
  let slots = 0;
  let images = 0;
  const walkBlocks = (groups: RepeatGroupIR[]) => {
    for (const g of groups) {
      for (const b of g.blocks) {
        slots += b.slots.length;
        images += b.slots.filter((s) => s.kind === "image").length;
        if (b.groups) walkBlocks(b.groups);
      }
    }
  };
  for (const s of sections) {
    slots += s.slots.length;
    images += s.slots.filter((x) => x.kind === "image").length;
    walkBlocks(s.groups);
  }
  return { slots, images };
}

/**
 * 从 (meta × industry × sub) 提取整站结构 IR。
 *
 * 与引擎共享同一份 DNA 与内容包，所以「有哪些页 / 每页哪些节 / 每节哪个变体 / 每个
 * 槽位是什么」与 HTML 侧逐项对得上，但**不经过 HTML**。
 */
export function buildTemplateStructure(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  dnaOverride?: TemplateDNA,
): TemplateStructureIR {
  const dna = dnaOverride ?? dnaFor(meta.slug, meta.industryKey, meta.variant);
  const biContent: BiContent = buildBiContent(meta, industry, sub);
  const biExt: BiExt = buildBiExt(meta, meta.industryKey, meta.subLabel, meta.subKey);
  const zh = { c: flattenContent(biContent, "zh"), ext: flattenExt(biExt, "zh") };
  const en = { c: flattenContent(biContent, "en"), ext: flattenExt(biExt, "en") };
  const subLabelEn = subEn(meta.subKey, meta.industryKey);
  const siteMainPageKey = mainPageKey(meta.industryKey, meta.subKey);
  const siteMainLabel = mainLabel(meta);

  const ctx: IrCtx = {
    meta,
    dna,
    zh,
    en,
    pageKey: "home",
    pageLabel: bi(PAGE_LABEL.home, ui("home", "en")),
    mainPageKey: siteMainPageKey,
    variantOf: (kind, count) => (hashStr(meta.slug + ":sec:" + kind + ":" + ctx.pageKey) + dna.styleSeed) % count,
    st: (kind) => {
      const z = secTitle(kind, meta.industryKey, "zh");
      const e = secTitle(kind, meta.industryKey, "en");
      return { title: bi(z.title, e.title), sub: z.sub ? bi(z.sub, e.sub ?? z.sub) : undefined };
    },
    u: (key) => bi(ui(key, "zh"), ui(key, "en")),
    subName: bi(meta.subLabel, subLabelEn),
  };

  const pageKeys = dna.layout.pages;
  const pages: PageIR[] = pageKeys.map((pk) => {
    ctx.pageKey = pk;
    const label = pk === siteMainPageKey
      ? siteMainLabel
      : bi(PAGE_LABEL[pk], ui(pk as keyof typeof UI, "en"));
    ctx.pageLabel = label;
    const kinds = dna.layout.sections[pk] ?? (["pageHeader", "cta"] as SectionKind[]);
    const perKind = new Map<string, number>();
    const sections = kinds.map((kind, order) => {
      const prefix = sectionIdPrefix(kind);
      const n = (perKind.get(prefix) ?? 0) + 1;
      perKind.set(prefix, n);
      const got = EXTRACTORS[kind](ctx);
      return {
        id: `${prefix}-${n}`,
        kind,
        order,
        variant: got.variant,
        variantCount: got.variantCount,
        intent: got.intent,
        slots: got.slots,
        groups: got.groups,
      } satisfies SectionIR;
    });
    return {
      key: pk,
      path: pagePath(pk),
      label,
      title: bi(`${label.zh} · ${zh.c.brand}`, `${label.en} · ${en.c.brand}`),
      sections,
    };
  });

  const p = dna.palette;
  const allSections = pages.flatMap((pg) => pg.sections);
  const counted = countSlots(allSections);

  return {
    schema: "oceanleo.template-structure@1",
    slug: meta.slug,
    title: meta.title,
    variant: meta.variant,
    industry: { key: meta.industryKey, label: meta.industryLabel },
    sub: { key: meta.subKey, label: meta.subLabel, labelEn: subLabelEn },
    colorKey: meta.color,
    brand: bi(zh.c.brand, en.c.brand),
    siteTitle: bi(`${zh.c.brand} · ${meta.subLabel}官网`, `${en.c.brand} · ${subLabelEn}`),
    description: bi(zh.c.heroSubtitle, en.c.heroSubtitle),
    contact: {
      phone: zh.c.contactPhone,
      email: zh.c.contactEmail,
      address: bi(zh.c.contactAddress, en.c.contactAddress),
    },
    footerSlogan: bi(zh.c.footerSlogan, en.c.footerSlogan),
    mainPage: { key: siteMainPageKey, label: siteMainLabel },
    theme: {
      shapeKey: dna.shape.key,
      layoutKey: dna.layout.key,
      layoutLabel: dna.layout.label,
      skinKey: dna.skin.key,
      skinLabel: dna.skin.label,
      paletteKey: p.key,
      paletteLabel: p.label,
      paletteFamily: p.family,
      primary: p.primary,
      primaryDark: p.primaryDark,
      gradFrom: p.gradFrom,
      gradTo: p.gradTo,
      soft: p.soft,
      ink: p.ink,
      subInk: p.sub,
      accent: p.accent,
      heroDark: p.heroDark,
      forceDark: dna.forceDark,
      radius: dna.radius,
      radiusTokens: RADIUS_TOKENS[dna.radius],
      density: dna.density,
      densityTokens: DENSITY_TOKENS[dna.density],
      font: dna.font,
      fontStack: FONT_STACK[dna.font],
      accentFx: dna.accentFx,
      isSignature: dna.isSignature,
    },
    nav: pages.map((page) => ({ key: page.key, path: page.path, label: page.label })),
    pages,
    totals: {
      pages: pages.length,
      sections: allSections.length,
      slots: counted.slots,
      images: counted.images,
      kinds: [...new Set(allSections.map((s) => s.kind))],
    },
  };
}
