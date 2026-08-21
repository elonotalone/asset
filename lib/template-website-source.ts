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
import {
  DENSITY_TOKENS,
  FONT_STACK,
  RADIUS_TOKENS,
  SHAPE_SECTION_BLUEPRINTS,
  SKIN_SIGNATURE,
  dnaFor,
  mainPageKey,
  mainSectionKind,
  paletteByKey,
  type PageKey,
  type SectionKind,
  type TemplateDNA,
} from "./template-dna";
import {
  COPY_TONES,
  SHAPES,
  SKINS,
  shape as shapeByKey,
  shapeFloor,
  templateAxesFor,
  type CopyToneKey,
  type ShapeKey,
  type Skin,
  type SkinKey,
  type TemplateAxesMetadata,
} from "./template-skins";
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
export const TEMPLATE_AXES_PATH = "oceanleo.template-axes.json";
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

/**
 * 一套装在产物里的全部可测令牌。
 *
 * `typography` 那三个字段是 website 的闭集（`sans|serif|mono`），装不下第三档字族，
 * 也装不下圆角与疏密 —— 所以这些**只做加法**地放在这里，website 不认也不会坏，
 * 而运行时与 `index.html` 的内联 `:root` 都按它落到真正的 CSS 变量上。
 */
export interface SkinTokensOut {
  radiusCard: string;
  radiusBtn: string;
  radiusImg: string;
  radiusPill: string;
  sectionSpace: string;
  gap: string;
  h1: string;
  h2: string;
  lineHeight: number;
  /** 真字体栈（含中文字族），不是 `sans|serif` 这种档位名。 */
  headingFont: string;
  bodyFont: string;
  pageBg: string;
  surface: string;
  navBg: string;
  border: string;
  ink: string;
  sub: string;
  primary: string;
}

export interface SkinOut {
  key: string;
  label: string;
  radius: string;
  density: string;
  font: string;
  fx: string;
  dark: boolean;
  /** 这套装独有的板块（asset 的 `SectionKind`）。 */
  signatureKind: string;
  /** 该板块在 site.json 里的渲染分支标记，运行时按它走不同的 DOM。 */
  signatureDisplay: string;
  tokens: SkinTokensOut;
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
  skin: SkinOut;
  navigation: { label: string; href: string }[];
  sections: VirtualSectionOut[];
  pages: VirtualPageOut[];
}

// ————————————————————————————————————————————————————————————
// 装的令牌：明暗面派生
// ————————————————————————————————————————————————————————————

type Theme = TemplateStructureIR["theme"];

function rgbOf(value: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16)) as [number, number, number];
}

function hexOf(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** a 与 b 按 t 比例混合（t=0 全 a，t=1 全 b）；解析不了就原样退回 a。 */
function mix(a: string, b: string, t: number): string {
  const ra = rgbOf(a);
  const rb = rgbOf(b);
  if (!ra || !rb) return a;
  return hexOf([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t) as [number, number, number]);
}

function relLuminance(value: string): number {
  const rgb = rgbOf(value);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isDarkColor(value: string): boolean {
  return relLuminance(value) < 0.4;
}

interface SkinSurfaces {
  dark: boolean;
  pageBg: string;
  surface: string;
  navBg: string;
  border: string;
  ink: string;
  sub: string;
  deep: string;
}

/**
 * 暗色皮的暗面不能拿 `palette.soft` 当底：`glacier`（`fullscreen` 用的那套）的 `soft`
 * 是 `#f0f9ff`，照发就是「声明暗色、产出浅底深字」。所以底色与正文色都在这里显式派生，
 * 派生完再校一次明暗关系，永远保证暗底配浅字。
 */
function skinSurfacesFor(t: Theme): SkinSurfaces {
  if (!t.forceDark) {
    return {
      dark: false,
      pageBg: "#ffffff",
      surface: t.soft,
      navBg: "#ffffff",
      border: mix(t.ink, "#ffffff", 0.88),
      ink: t.ink,
      sub: t.subInk,
      deep: t.ink,
    };
  }
  const pageBg = isDarkColor(t.soft) ? t.soft : mix(t.ink, "#000000", 0.5);
  const ink = isDarkColor(t.ink) ? mix(t.soft, "#ffffff", 0.5) : t.ink;
  return {
    dark: true,
    pageBg,
    surface: mix(pageBg, "#ffffff", 0.07),
    navBg: mix(pageBg, "#000000", 0.3),
    border: mix(pageBg, ink, 0.18),
    ink,
    sub: mix(ink, pageBg, 0.38),
    deep: mix(pageBg, "#000000", 0.35),
  };
}

function skinTokensFor(t: Theme, surfaces: SkinSurfaces): SkinTokensOut {
  return {
    radiusCard: t.radiusTokens.card,
    radiusBtn: t.radiusTokens.btn,
    radiusImg: t.radiusTokens.img,
    radiusPill: t.radiusTokens.pill,
    sectionSpace: t.densityTokens.section,
    gap: t.densityTokens.gap,
    h1: t.densityTokens.h1,
    h2: t.densityTokens.h2,
    lineHeight: t.density === "compact" ? 1.5 : t.density === "airy" ? 1.8 : 1.65,
    headingFont: t.fontStack,
    // 正文字族：只有以阅读为主张的 serif 装才把正文也换成 serif，其余装的正文保持
    // 中性无衬线（几何字族做大标题好看，做正文伤可读性）。
    bodyFont: t.font === "serif" ? FONT_STACK.serif : FONT_STACK.sans,
    pageBg: surfaces.pageBg,
    surface: surfaces.surface,
    navBg: surfaces.navBg,
    border: surfaces.border,
    ink: surfaces.ink,
    sub: surfaces.sub,
    primary: t.primary,
  };
}

// ————————————————————————————————————————————————————————————
// 装的令牌与装的样式表：五条轴真正落到产物字节
// ————————————————————————————————————————————————————————————

/** 产物里那份「只属于这一套装」的样式表。运行时样式表 500 个模板共用，这一份不共用。 */
export const SKIN_CSS_PATH = "assets/skin.css";

/** 字体栈只放行字族名、空格、逗号、单引号与连字符；`}`、`url(`、`<` 一概进不来。 */
function cssFontStack(s: string): string {
  const v = String(s).trim();
  return /^[A-Za-z0-9\s,'\-]+$/.test(v) ? v : "";
}

/** `data-skin` / `data-fx` 这类属性值只放行小写标识符。 */
function cssIdent(s: string): string {
  const v = String(s).trim();
  return /^[a-z][a-z0-9-]*$/.test(v) ? v : "";
}

/** 生成的 CSS 绝不允许自己关掉 `<style>`（内联预览会把这份表塞进 style 块）。 */
function safeCss(css: string): string {
  return css.replace(/<\/(style|script)/gi, "\\3c /$1");
}

function tokenDecl(name: string, value: string): string {
  const v = cssToken(value);
  return v ? `--${name}:${v};` : "";
}

/** 标题字号：档位值当上限，配一个随档位收紧的下限与视口斜率，小屏不至于炸行。 */
function fluid(min: string, vw: string, max: string): string {
  const cap = cssToken(max);
  return cap ? `clamp(${min},${vw},${cap})` : "";
}

/**
 * 一套装的全部 CSS 变量。
 *
 * 这是「换装换的是产物字节」的核心证据：圆角四档、疏密四档、两个真字体栈、明暗六个面
 * 全部写在这里，`assets/styles.css` 里的每一条规则都读它们。之前只有 `--radius/--ink/--sub`
 * 三个变量进产物，于是十套装的按钮、图片、栅格、标题字号在产物里必然同值。
 */
function skinRootCss(t: Theme): string {
  const surfaces = skinSurfacesFor(t);
  const k = skinTokensFor(t, surfaces);
  const decls = [
    tokenDecl("primary", k.primary),
    tokenDecl("page-bg", k.pageBg),
    tokenDecl("surface", k.surface),
    tokenDecl("nav-bg", k.navBg),
    tokenDecl("border", k.border),
    tokenDecl("ink", k.ink),
    tokenDecl("sub", k.sub),
    tokenDecl("radius", k.radiusCard),
    tokenDecl("radius-btn", k.radiusBtn),
    tokenDecl("radius-img", k.radiusImg),
    tokenDecl("radius-pill", k.radiusPill),
    tokenDecl("space", k.sectionSpace),
    tokenDecl("gap", k.gap),
    `--h1:${fluid("1.9rem", "4.6vw", k.h1)};`,
    `--h2:${fluid("1.35rem", "2.9vw", k.h2)};`,
    `--line-height:${k.lineHeight};`,
    `--heading-font:${cssFontStack(k.headingFont)};`,
    `--body-font:${cssFontStack(k.bodyFont)};`,
  ];
  return `:root{${decls.join("")}}`;
}

/**
 * 装饰效果（`fx` 轴）。
 *
 * 这条轴此前在发射器里出现 0 次 —— `structure.theme.accentFx` 一个字节都没进产物。
 * 这里按当前装的 fx 只发它自己要用的那几条规则（不夹带整套特效库），运行时按
 * `site.json` 的 `skin.fx` 在 hero / cta / 页头背后插一层 `.leo-decor` 容器承载它们。
 * asset 自己的 HTML 引擎那份 `template-effects.ts` 打的是另一套 DOM，故不能直接搬。
 */
function fxCss(t: Theme): string {
  const a = cssToken(t.primary);
  const b = cssToken(t.accent);
  const c = cssToken(t.gradTo);
  const soft = cssToken(t.soft);
  switch (t.accentFx) {
    case "aurora":
      return `.leo-aurora{position:absolute;inset:0;filter:blur(10px)}
.leo-aurora::before,.leo-aurora::after{content:"";position:absolute;inset:-40%;background:radial-gradient(40% 55% at 25% 30%,${a}66,transparent 60%),radial-gradient(45% 60% at 75% 35%,${c}59,transparent 62%),radial-gradient(50% 55% at 55% 78%,${b}4d,transparent 60%);animation:leoAurora 18s ease-in-out infinite;mix-blend-mode:screen}
.leo-aurora::after{animation-duration:26s;animation-direction:reverse;opacity:.7}
@keyframes leoAurora{0%,100%{transform:translate3d(0,0,0) rotate(0deg) scale(1)}33%{transform:translate3d(3%,-4%,0) rotate(6deg) scale(1.08)}66%{transform:translate3d(-4%,3%,0) rotate(-5deg) scale(1.04)}}`;
    case "blobs":
      return `.leo-blob{position:absolute;width:340px;height:340px;top:-70px;right:-40px;filter:blur(26px);opacity:.45;background:${a};animation:leoBlobMorph 16s ease-in-out infinite,leoFloat 18s ease-in-out infinite}
.leo-blob-2{width:260px;height:260px;top:auto;right:auto;bottom:-60px;left:-30px;background:${c};animation-delay:-6s}
.leo-blob-3{width:190px;height:190px;top:38%;right:22%;background:${b};animation-delay:-10s}
@keyframes leoBlobMorph{0%,100%{border-radius:42% 58% 63% 37%/45% 42% 58% 55%}50%{border-radius:58% 42% 38% 62%/58% 55% 45% 42%}}
@keyframes leoFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(12px,-18px) scale(1.06)}66%{transform:translate(-10px,14px) scale(.94)}}`;
    case "stripes":
      return `.leo-stripes{position:absolute;inset:0;opacity:.14;background:repeating-linear-gradient(45deg,${a} 0 18px,transparent 18px 40px);animation:leoStripes 3s linear infinite;mask-image:linear-gradient(180deg,#000,transparent 85%)}
@keyframes leoStripes{from{background-position:0 0}to{background-position:57px 0}}`;
    case "neon-grid":
      return `.leo-neon-grid{position:absolute;inset:0;background-image:linear-gradient(${a}2e 1px,transparent 1px),linear-gradient(90deg,${a}2e 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 90% 80% at 50% 30%,#000 10%,transparent 78%);animation:leoGridPan 20s linear infinite}
@keyframes leoGridPan{from{background-position:0 0}to{background-position:44px 44px}}
.leo-neon-halo{position:absolute;top:-80px;right:6%;width:340px;height:340px;border-radius:9999px;background:radial-gradient(circle,${a}55,transparent 70%);filter:blur(60px)}
h1,h2{text-shadow:0 0 6px ${a}77,0 0 22px ${a}44}
.card{box-shadow:0 0 0 1px ${a}33,0 0 26px ${a}1f}`;
    case "spotlight":
      return `.leo-spotlight{position:absolute;inset:0;background:radial-gradient(circle 60% at 50% 0%,${a}2b,transparent 60%)}
.leo-spotbeam{position:absolute;left:50%;top:0;width:70%;height:100%;transform:translateX(-50%);background:linear-gradient(180deg,${b}1f,transparent 70%)}`;
    case "waves":
      return `.leo-wave{position:absolute;bottom:0;left:0;right:0;height:80px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120'%3E%3Cpath fill='${encodeURIComponent(soft || "#eef2f7")}' d='M0,64 C300,120 500,0 600,48 C700,96 900,32 1200,64 L1200,120 L0,120 Z'/%3E%3C/svg%3E") center bottom/cover no-repeat;animation:leoWave 8s ease-in-out infinite alternate}
@keyframes leoWave{from{transform:translateX(-2%)}to{transform:translateX(2%)}}`;
    case "grid":
      return `.leo-grid-deco{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(${a}55 1px,transparent 1px),linear-gradient(90deg,${a}55 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 20%,transparent 75%)}`;
    case "shimmer":
      return `.leo-sheen{position:absolute;inset:0;overflow:hidden}
.leo-sheen::after{content:"";position:absolute;top:-50%;left:-60%;width:50%;height:200%;background:linear-gradient(105deg,transparent,#ffffff38,transparent);transform:rotate(8deg);animation:leoSheen 6.5s ease-in-out infinite}
@keyframes leoSheen{0%,60%{left:-60%}100%{left:130%}}`;
    case "orbs":
      return `.leo-orb{position:absolute;width:280px;height:280px;top:-60px;right:-40px;border-radius:9999px;filter:blur(48px);background:${a}55;animation:leoFloat 12s ease-in-out infinite}
.leo-orb-2{width:200px;height:200px;top:auto;right:auto;bottom:10%;left:-30px;background:${b}44;animation-delay:-4s;animation-duration:15s}
.leo-orb-3{width:160px;height:160px;top:40%;right:25%;background:${c}33;animation-delay:-7s;animation-duration:18s}
@keyframes leoFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(12px,-18px) scale(1.06)}66%{transform:translate(-10px,14px) scale(.94)}}`;
    case "dots":
      return `.leo-dots{position:absolute;inset:0;opacity:.18;background-image:radial-gradient(${a} 1.5px,transparent 1.5px);background-size:28px 28px}`;
    case "beams":
      return `.leo-beam{position:absolute;width:2px;height:140%;top:-20%;left:30%;background:linear-gradient(180deg,transparent,${b}88,transparent);transform:rotate(25deg);animation:leoBeam 6s ease-in-out infinite}
.leo-beam-2{left:62%;animation-delay:-2s}
@keyframes leoBeam{0%,100%{opacity:.25;transform:rotate(25deg) translateY(0)}50%{opacity:.55;transform:rotate(25deg) translateY(8%)}}`;
    case "noise":
      return `.leo-noise{position:absolute;inset:0;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}`;
    case "none":
      return "/* fx:none —— 这套装的主张就是不加装饰层 */";
    default:
      return `.leo-veil{position:absolute;inset:0;opacity:.12;background:linear-gradient(135deg,${a},transparent 65%)}`;
  }
}

/** hero / cta / 页头之外，装饰层永不出现；容器与层叠关系是共享样式表的事。 */
const FX_REDUCED_MOTION = `@media (prefers-reduced-motion:reduce){.leo-decor *,.leo-decor{animation:none!important}}`;

/**
 * 一套装的结构规则（打的是运行时 DOM：`.sec` / `.inner` / `.card` / `#site-nav`）。
 *
 * `template-css.ts` 里那十段 `skinStyles()` 打的是 asset 引擎的 `[data-section-kind]`，
 * 在这条产线上一条都命中不了，所以按同样的设计主张重写一份。每套装至少动
 * 「节的容器形状 / 卡片的边与影 / 标题的字距」中的两样，不是只换颜色。
 */
const SKIN_SITE_RULES: Record<SkinKey, (t: Theme) => string> = {
  paper: (t) => `.sec{border-bottom:1px solid var(--border)}
.sec .inner{max-width:68rem}
.card{background:transparent;box-shadow:none;border:1px solid var(--border)}
.card .thumb,.hero-media,.media{border-radius:6px}
.btn{border-radius:2px;box-shadow:none}
h1,h2{letter-spacing:-.01em;font-weight:600}
.eyebrow{color:${cssToken(t.subInk)};letter-spacing:.22em}`,
  editorial: (t) => `#site-nav{position:relative;border-top:5px solid ${cssToken(t.ink)};border-bottom:1px solid var(--border)}
.sec{border-bottom:1px solid var(--border)}
.sec .inner{max-width:58rem}
h1,h2{letter-spacing:-.035em;line-height:1.02;font-weight:700}
.card{border-radius:0;box-shadow:none;border:0;border-top:2px solid ${cssToken(t.ink)};background:transparent}
.card .thumb{border-radius:0}
.lead{font-size:1.18rem}`,
  bento: () => `.sec:not(.sec-hero){width:min(74rem,calc(100% - 26px));margin:20px auto;border:1px solid var(--border);border-radius:32px;box-shadow:0 18px 50px #0f172a12;overflow:hidden}
.card{border-radius:24px;box-shadow:0 10px 30px #0f172a0f;background:var(--surface)}
.grid{gap:calc(var(--gap) * .75)}
.icon{border-radius:18px}
@media (max-width:640px){.sec:not(.sec-hero){width:calc(100% - 14px);margin:10px auto;border-radius:22px}}`,
  brutalist: (t) => `.sec{border-bottom:3px solid ${cssToken(t.ink)}}
#site-nav{border-top:3px solid ${cssToken(t.ink)};border-bottom:3px solid ${cssToken(t.ink)};backdrop-filter:none}
.card{border:3px solid ${cssToken(t.ink)};border-radius:0;box-shadow:7px 7px 0 ${cssToken(t.ink)};background:var(--page-bg)}
.btn{border-radius:0;box-shadow:5px 5px 0 ${cssToken(t.ink)};font-weight:800}
h1,h2,h3{text-transform:uppercase;letter-spacing:-.02em}
.icon{border-radius:0;border:3px solid ${cssToken(t.ink)}}`,
  neon: (t) => `#site-nav{border-bottom:1px solid ${cssToken(t.primary)}3d}
.card{background:#ffffff08;border:1px solid ${cssToken(t.primary)}3d}
.btn{box-shadow:0 0 18px ${cssToken(t.primary)}66}
.stat-value{text-shadow:0 0 12px ${cssToken(t.primary)}88}
.eyebrow{letter-spacing:.24em}
.form input,.form textarea{background:#ffffff0a;border-color:${cssToken(t.primary)}33}`,
  fullscreen: () => `.sec{min-height:78vh;display:flex;align-items:center}
.sec-footer,.sec-logos,.sec-stats{min-height:0;display:block}
.sec .inner{width:100%}
h1{letter-spacing:-.02em}
.card{background:#ffffff0d;border:1px solid #ffffff1f}
@media (max-width:640px){.sec{min-height:0;display:block}}`,
  nature: (t) => `.sec:nth-child(even){width:min(74rem,calc(100% - 32px));margin:24px auto;border-radius:clamp(28px,5vw,64px);overflow:hidden}
.card .thumb,.media,.hero-media{border-radius:42% 58% 48% 52%/54% 43% 57% 46%}
.sec-head h2::after{content:"";display:block;width:52px;height:3px;margin:16px 0 0;background:${cssToken(t.primary)};border-radius:999px}
.card{border-radius:clamp(18px,3vw,30px)}
.icon{border-radius:9999px}`,
  sand: (t) => `.sec:not(.sec-hero){width:min(70rem,calc(100% - 36px));margin:28px auto;border:1px solid ${cssToken(t.primary)}26;box-shadow:10px 12px 0 ${cssToken(t.primary)}12}
.sec:nth-child(even){transform:rotate(-.18deg)}
.card{background:var(--page-bg);box-shadow:6px 7px 0 ${cssToken(t.primary)}14}
.card .thumb,.hero-media{border-radius:48% 48% 10px 10px}
.eyebrow{letter-spacing:.28em}`,
  navy: (t) => `#site-nav{background:${cssToken(t.gradFrom)};color:#fff;border-bottom:4px solid ${cssToken(t.primary)};backdrop-filter:none}
#site-nav .brand,#site-nav nav a{color:#fff}
.sec:not(.sec-hero):not(.sec-page-header) .inner{border-left:4px solid ${cssToken(t.primary)};padding-left:clamp(1.5rem,4vw,3rem)}
.card{border-radius:2px;box-shadow:0 1px 0 var(--border)}
.btn{border-radius:2px}
.eyebrow{letter-spacing:.16em;font-weight:700}`,
  glass: (t) => `.sec{width:min(74rem,calc(100% - 36px));margin:24px auto;border:1px solid #ffffffb8;border-radius:30px;box-shadow:0 24px 70px ${cssToken(t.gradFrom)}1f;overflow:hidden;backdrop-filter:blur(18px)}
.card{background:#ffffff8f;border:1px solid #ffffffcc;border-radius:22px;box-shadow:0 12px 36px ${cssToken(t.gradFrom)}14}
#site-nav{background:#ffffff94;border-bottom:1px solid #ffffffcc}
@media (max-width:640px){.sec{width:calc(100% - 18px);margin:12px auto;border-radius:22px}}`,
};

/**
 * 签名版块在产物里的长相。
 *
 * 降级表把 16+4 个 `sig*` 压进 22 个 website 闭集类型，压完只靠 `content.display`
 * 认得出「这一节是这套装独有的」。运行时把它写成 `data-signature`，于是这里能给
 * 每套装的签名节一套只属于它的版式 —— DOM 形状（节的种类、位置、槽位）由蓝图与
 * 提取器决定，这里决定它铺开的方式。
 */
const SIGNATURE_RULES: Record<string, string> = {
  "paper-index": `[data-signature="paper-index"] .grid{display:block}
[data-signature="paper-index"] .card{display:grid;grid-template-columns:3.5rem 1fr;gap:1.2rem;border:0;border-top:1px solid var(--border);border-radius:0;padding:1.15rem 0;background:transparent;box-shadow:none}
[data-signature="paper-index"] .card h3{font-weight:500}`,
  "editorial-hero": `[data-signature="editorial-hero"] .hero-body{grid-template-columns:1fr;gap:1.2rem}
[data-signature="editorial-hero"] h1{font-size:calc(var(--h1) * 1.15);border-bottom:3px solid currentColor;padding-bottom:.35em}`,
  "bento-hero": `[data-signature="bento-hero"] .hero-body{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));align-items:stretch}
[data-signature="bento-hero"] .hero-copy,[data-signature="bento-hero"] .hero-media{background:var(--surface);border-radius:28px;padding:1.6rem}`,
  "brutal-hero": `[data-signature="brutal-hero"] .hero-body{gap:0}
[data-signature="brutal-hero"] .hero-copy{border:3px solid currentColor;padding:1.6rem}
[data-signature="brutal-hero"] h1{font-size:calc(var(--h1) * 1.25)}`,
  "neon-hero": `[data-signature="neon-hero"] .hero-copy{border-left:2px solid var(--primary);padding-left:1.4rem}
[data-signature="neon-hero"] .eyebrow{text-shadow:0 0 12px var(--primary)}`,
  "fs-intro": `[data-signature="fs-intro"]{min-height:92vh}
[data-signature="fs-intro"] .hero-body{grid-template-columns:1fr;text-align:center;justify-items:center}
[data-signature="fs-intro"] h1{font-size:calc(var(--h1) * 1.35)}`,
  "nature-ribbon": `[data-signature="nature-ribbon"] .grid{grid-template-columns:1fr}
[data-signature="nature-ribbon"] .card{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:2rem;background:transparent;border:0;box-shadow:none;padding:1rem 0}
[data-signature="nature-ribbon"] .card:nth-child(even){direction:rtl}
[data-signature="nature-ribbon"] .card:nth-child(even)>*{direction:ltr}`,
  "sand-stamp": `[data-signature="sand-stamp"] .grid{grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))}
[data-signature="sand-stamp"] .stat,[data-signature="sand-stamp"] .card{border:2px dashed var(--primary);border-radius:9999px;aspect-ratio:1/1;display:grid;place-content:center;box-shadow:none;background:transparent}`,
  "navy-ledger": `[data-signature="navy-ledger"] .timeline{gap:0}
[data-signature="navy-ledger"] .timeline li{border-left:0;border-bottom:1px solid var(--border);display:grid;grid-template-columns:7rem 1fr;gap:1.2rem;padding:.9rem 0}
[data-signature="navy-ledger"] .timeline .year{color:var(--primary);text-align:right}`,
  "glass-grid": `[data-signature="glass-grid"] .grid{grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}
[data-signature="glass-grid"] .card{background:#ffffffa6;border-radius:26px;backdrop-filter:blur(22px)}`,
};

/** 这一套装的样式表全文（令牌 + 结构 + 装饰 + 签名版块），500 个模板里同装共用。 */
export function skinCss(t: Theme): string {
  const skinKey = t.skinKey as SkinKey;
  const rules = SKIN_SITE_RULES[skinKey];
  const signature = SIGNATURE_RULES[SKIN_SIGNATURE[skinKey].display] ?? "";
  const scope = `html[data-skin="${cssIdent(skinKey) || "unknown"}"]`;
  // 每条规则单占一行（含 @media 整块写一行），所以按行加作用域就够；
  // @keyframes 与 @media 的前奏不能被加前缀，@media 里的规则要加。
  const scopeRule = (rule: string): string =>
    rule.trim() && rule.includes("{") ? `${scope} ${rule.trim()}` : rule;
  const scoped = (css: string): string =>
    css
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const media = /^(@media[^{]*\{)([\s\S]*)\}$/.exec(line);
        if (media) {
          const inner = media[2].split(/(?<=\})/).filter(Boolean).map(scopeRule).join("");
          return `${media[1]}${inner}}`;
        }
        if (line.startsWith("@") || !line.includes("{")) return line;
        return scopeRule(line);
      })
      .join("\n");
  return safeCss(`/* skin:${skinKey} —— 只属于这一套装的样式；共享部分在 assets/styles.css */
${skinRootCss(t)}
${scoped(rules ? rules(t) : "")}
${scoped(fxCss(t))}
${scoped(signature)}
${FX_REDUCED_MOTION}
`);
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
  /** 当前正在发射的页面名，用于把项目/房源等业务 CTA 与商品加购分开。 */
  pageLabel: string;
  /** 图片 keyword（拿不到 url 时 website 侧的第一方图床兜底关键词）。 */
  keyword: string;
  /** 当前配置内的图片序号；zh/en 分别从 0 开始，因而两份配置引用同一组文件。 */
  photoCursor: number;
  /** 这套装的明暗面（暗色皮的底色与正文色在这里已经派生好，节级不再各算各的）。 */
  surfaces: SkinSurfaces;
}

type ContentBuilder = (section: SectionIR, ctx: EmitCtx) => Record<string, unknown>;

function headTitle(section: SectionIR, ctx: EmitCtx): string {
  return txt(section.slots, "title", ctx.lang);
}
function headSub(section: SectionIR, ctx: EmitCtx): string {
  return txt(section.slots, "subtitle", ctx.lang);
}

function productCtaLabel(ctx: EmitCtx): string {
  const inquiryPages = new Set([
    "项目", "拍品", "房源", "车辆",
    "Projects", "Auction Lots", "Listings", "Vehicles",
  ]);
  if (inquiryPages.has(ctx.pageLabel)) return ctx.lang === "en" ? "View Details" : "咨询详情";
  return ctx.lang === "en" ? "Add to Cart" : "加入购物车";
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
    ctaLabel: productCtaLabel(ctx),
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
      caption: txt(b.slots, "title", ctx.lang) || `${headTitle(s, ctx)} ${i + 1}`,
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

function surfaceColors(
  section: SectionIR,
  structure: TemplateStructureIR,
  sk: SkinSurfaces,
): { backgroundColor: string; textColor: string } {
  const t = structure.theme;
  switch (section.intent.surface) {
    case "soft":
    case "card":
      return { backgroundColor: sk.surface, textColor: sk.ink };
    case "gradient":
      return { backgroundColor: t.gradFrom, textColor: section.intent.onDark ? "#ffffff" : sk.ink };
    case "dark":
      return sk.dark
        ? { backgroundColor: sk.deep, textColor: sk.ink }
        : { backgroundColor: t.ink, textColor: "#ffffff" };
    case "image":
      return { backgroundColor: sk.dark ? sk.deep : t.ink, textColor: "#ffffff" };
    case "primary":
      return { backgroundColor: t.primary, textColor: "#ffffff" };
    default:
      return { backgroundColor: sk.pageBg, textColor: sk.ink };
  }
}

/** 紧凑节（asset 里是 py-8 / py-12 的条带，不吃整节密度）。 */
const BAND_KINDS = new Set(["stats", "logos", "marquee", "sigNeonStats"]);

function styleFor(
  section: SectionIR,
  structure: TemplateStructureIR,
  sk: SkinSurfaces,
): VirtualSectionStyleOut {
  const t = structure.theme;
  // 紧凑条带也要跟着疏密走，否则 compact 与 airy 在这些节上产出同一个数。
  const pad = BAND_KINDS.has(section.kind)
    ? Math.round(px(t.densityTokens.section) * 0.62)
    : px(t.densityTokens.section);
  const colors = surfaceColors(section, structure, sk);
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

function footerSection(
  structure: TemplateStructureIR,
  lang: Lang,
  id: string,
  sk: SkinSurfaces,
): VirtualSectionOut {
  const t = structure.theme;
  const pad = px(t.densityTokens.section);
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
      backgroundColor: sk.dark ? sk.deep : t.ink,
      textColor: sk.dark ? sk.ink : mix(t.soft, "#ffffff", 0.4),
      paddingTop: Math.round(pad * 0.78),
      paddingBottom: Math.round(pad * 0.56),
      contentWidth: "wide",
      alignment: "left",
      layout: "default",
      cornerRadius: 0,
      borderWidth: 0,
    },
  };
}

function emitPage(page: PageIR, structure: TemplateStructureIR, ctx: EmitCtx): VirtualPageOut {
  ctx.pageLabel = pick(page.label, ctx.lang);
  const perType = new Map<WebsiteSectionType, number>();
  const nextId = (type: WebsiteSectionType): string => {
    const n = (perType.get(type) ?? 0) + 1;
    perType.set(type, n);
    return `${type}-${n}`.slice(0, LIMITS.sectionIdMax);
  };
  const sections: VirtualSectionOut[] = [];
  const signatureKind = SKIN_SIGNATURE[structure.theme.skinKey].kind;
  for (const sec of page.sections) {
    for (const { type, from } of expand(sec)) {
      const content = BUILDERS[type](from, ctx);
      // 降级表把 16 个 sig* 压进 22 个 website 类型，压完就认不出原来是哪个 sig 了。
      // 签名节在这里补一个渲染分支标记（沿用 marquee → logos 的先例），于是产物侧
      // 既保住了 website 的闭集类型，又量得出「这一节是这套装独有的」。
      if (from.kind === signatureKind) {
        content.display = SKIN_SIGNATURE[structure.theme.skinKey].display;
        content.signatureKind = from.kind;
      }
      sections.push({
        id: nextId(type),
        type,
        content,
        style: styleFor(from, structure, ctx.surfaces),
      });
    }
  }
  // asset 的页脚是整页固定尾部（不在 SectionKind 里），接口 B §2 要求每页补一节 footer。
  sections.push(footerSection(structure, ctx.lang, nextId("footer"), ctx.surfaces));
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
  const surfaces = skinSurfacesFor(t);
  const tokens = skinTokensFor(t, surfaces);
  const signature = SKIN_SIGNATURE[t.skinKey];
  const ctx: EmitCtx = {
    structure,
    lang,
    pageLabel: "",
    keyword: lang === "en" ? structure.sub.labelEn : structure.sub.label,
    photoCursor: 0,
    surfaces,
  };
  const pages = structure.pages.slice(0, LIMITS.pagesMax).map((p) => emitPage(p, structure, ctx));
  return {
    siteName: pick(structure.brand, lang),
    themeColor: t.primary,
    backgroundColor: surfaces.pageBg,
    typography: {
      bodyFont: "sans",
      headingFont: fontFor(t.font),
      baseSize: 16,
      lineHeight: tokens.lineHeight,
      headingWeight: t.skinKey === "editorial" ? 700 : 800,
    },
    skin: {
      key: t.skinKey,
      label: t.skinLabel,
      radius: t.radius,
      density: t.density,
      font: t.font,
      fx: t.accentFx,
      dark: t.forceDark,
      signatureKind: signature.kind,
      signatureDisplay: signature.display,
      tokens,
    },
    navigation: structure.nav.map((n) => ({ label: pick(n.label, lang), href: n.path })),
    // `sections` 是 home 的兼容别名（接口 B §6）：两处写同一份数组。
    sections: pages[0]?.sections ?? [],
    pages,
  };
}

// ————————————————————————————————————————————————————————————
// 三轴元数据（website 轻编辑器直接消费）
// ————————————————————————————————————————————————————————————

const COPY_NON_TEXT_KEYS = new Set([
  "href",
  "url",
  "keyword",
  "icon",
  "iconPath",
  "chartType",
  "display",
]);

const COPY_CONCISE_KEYS = new Set([
  "subtitle",
  "description",
  "body",
  "bio",
  "quote",
  "excerpt",
  "answer",
  "footnote",
  "note",
  "insight",
]);

function copyFieldId(pageId: string, sectionId: string, path: string[]): string {
  return `page:${pageId}/section:${sectionId}/content:${path.join(".")}`;
}

function isCopyField(path: string[], value: string): boolean {
  if (!value.trim()) return false;
  const lower = path.map((part) => part.toLowerCase());
  const leaf = lower.at(-1) ?? "";
  if (COPY_NON_TEXT_KEYS.has(leaf) || leaf.endsWith("href") || leaf.endsWith("url")) return false;
  if (lower.includes("image")) return false;
  return true;
}

function conciseCopy(value: string): string {
  const limit = /[\u3400-\u9fff]/.test(value) ? 42 : 96;
  const sentenceEnd = value.search(/[。！？；.!?;]/);
  if (sentenceEnd >= 6 && sentenceEnd < value.length - 1) {
    return value.slice(0, sentenceEnd + 1).trim();
  }
  const clauseEnd = value.search(/[，,：:]/);
  if (clauseEnd >= 6 && clauseEnd < value.length - 1) {
    return value.slice(0, clauseEnd).trim();
  }
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}…`;
}

function toneCopy(value: string, path: string[], tone: CopyToneKey): string {
  if (tone === "balanced") return value;
  const leaf = path.at(-1) ?? "";
  if (tone === "concise") {
    return COPY_CONCISE_KEYS.has(leaf) ? conciseCopy(value) : value;
  }
  const isActionLabel = /^(?:primary|secondary|submit|contact|link)?(?:Cta)?Label$/i.test(leaf);
  if (leaf === "title" || isActionLabel) {
    return /[！!？?。.]$/.test(value) ? value : `${value}${/[\u3400-\u9fff]/.test(value) ? "！" : "!"}`;
  }
  return value;
}

/**
 * 为三档口吻生成同一组稳定字段 id。只改人读文案，不把 href、图片 URL、icon 或渲染
 * 控制字段混进文案轴；balanced 保留工程对象原字节，另两档只提供展示替换值。
 */
export function buildCopyToneFields(
  config: VirtualSiteConfigOut,
): Record<CopyToneKey, Record<string, string>> {
  const result = Object.fromEntries(
    COPY_TONES.map((tone) => [tone.key, {}]),
  ) as Record<CopyToneKey, Record<string, string>>;

  for (const page of config.pages) {
    for (const section of page.sections) {
      const visit = (value: unknown, path: string[]): void => {
        if (typeof value === "string") {
          if (!isCopyField(path, value)) return;
          const id = copyFieldId(page.id, section.id, path);
          for (const tone of COPY_TONES) {
            result[tone.key][id] = toneCopy(value, path, tone.key);
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) => visit(item, [...path, String(index)]));
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            visit(item, [...path, key]);
          }
        }
      };
      visit(section.content, []);
    }
  }
  return result;
}

function dnaForShape(meta: TemplateMeta, shapeKey: ShapeKey): TemplateDNA {
  const base = dnaFor(meta.slug, meta.industryKey, meta.variant);
  const selectedShape = shapeByKey(shapeKey);
  const mainKey = mainPageKey(meta.industryKey, meta.subKey);
  const mainKind = mainSectionKind(mainKey);
  const pages: PageKey[] = [];
  const sections: Record<string, SectionKind[]> = {};

  for (const semanticPage of selectedShape.pages) {
    const pageKey: PageKey = semanticPage === "main" ? mainKey : semanticPage;
    pages.push(pageKey);
    sections[pageKey] = SHAPE_SECTION_BLUEPRINTS[shapeKey][semanticPage].map((section) =>
      section === "main" ? mainKind : section,
    ) as SectionKind[];
  }

  return {
    ...base,
    shape: selectedShape,
    layout: {
      key: selectedShape.key,
      label: selectedShape.label,
      pages,
      sections,
    },
  };
}

/**
 * 每个可选构成都随件携带完整 VirtualSitePage；website 增页无需 import asset，也无需
 * 解析 HTML。缩页由 contentPlacement 搬整段 section，回切历史由 website 工程对象保留。
 */
export function buildTemplateAxesMetadata(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  structure: TemplateStructureIR,
  config: VirtualSiteConfigOut,
): TemplateAxesMetadata<VirtualPageOut> {
  const floor = shapeFloor(meta.industryKey, meta.subKey);
  const floorIndex = SHAPES.findIndex((candidate) => candidate.key === floor);
  const pageTemplates: Partial<Record<ShapeKey, VirtualPageOut[]>> = {};

  for (const option of SHAPES.slice(floorIndex)) {
    if (option.key === structure.theme.shapeKey) {
      pageTemplates[option.key] = config.pages;
      continue;
    }
    const optionStructure = buildTemplateStructure(
      meta,
      industry,
      sub,
      dnaForShape(meta, option.key),
    );
    pageTemplates[option.key] = buildWebsiteSourceConfig(optionStructure, "zh").pages;
  }

  return templateAxesFor({
    industry: structure.industry,
    sub: { key: structure.sub.key, label: structure.sub.label },
    shapeKey: structure.theme.shapeKey,
    skinKey: structure.theme.skinKey,
    mainPageKey: structure.mainPage.key,
    variant: structure.variant,
    pageTemplates,
    copyFields: buildCopyToneFields(config),
  });
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
    if (s.charAt(0) === "#") return s;
    if (/^(?:https?:|mailto:|tel:)/i.test(s)) return s;
    // 站内路径三种形态一律放行：绝对 /a、显式 ./a ../a、裸相对 images/x.webp。
    // 判据是「整串不含冒号」⇒ 不可能带协议头，javascript: / data: 进不来，
    // 连 "jav\tascript:" 这类插字符绕过也进不来（浏览器抽掉制表符后冒号仍在）。
    // 协议相对 //host 与 \\host（URL 规范把反斜杠当斜杠）显式挡掉。
    if (s.indexOf(":") < 0 && s.indexOf("\\") < 0 && s.slice(0, 2) !== "//") return s;
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

  /** 长度只收 数字 + px/rem/em/% 或无单位；calc( 、url( 、分号之类一律拦掉。 */
  function cssLen(v) {
    var s = str(v).trim();
    return /^-?[\d.]+(?:px|rem|em|%)?$/.test(s) ? s : "";
  }
  /** 字体栈只收字族名 / 空格 / 逗号 / 单引号 / 连字符。 */
  function cssFonts(v) {
    var s = str(v).trim();
    return /^[A-Za-z0-9\s,'-]+$/.test(s) ? s : "";
  }
  function ident(v) {
    var s = str(v).trim();
    return /^[a-z][a-z0-9-]*$/.test(s) ? s : "";
  }

  // 装的令牌 → CSS 变量。这是「换装换的是真长相」在运行时的落点：圆角四档、
  // 疏密四档、两个真字体栈、明暗六个面全部由 site.json 的 skin.tokens 决定，
  // 改 site.json 就能改，不必碰 CSS。
  var TOKEN_COLORS = [["primary", "--primary"], ["pageBg", "--page-bg"], ["surface", "--surface"],
    ["navBg", "--nav-bg"], ["border", "--border"], ["ink", "--ink"], ["sub", "--sub"]];
  var TOKEN_LENGTHS = [["radiusCard", "--radius"], ["radiusBtn", "--radius-btn"], ["radiusImg", "--radius-img"],
    ["radiusPill", "--radius-pill"], ["sectionSpace", "--space"], ["gap", "--gap"]];

  function applySkin(cfg) {
    var root = document.documentElement;
    var skin = cfg.skin || null;
    var tk = (skin && skin.tokens) || null;
    if (!tk) {
      // 老工程对象没有 skin 段：退回按 typography 二选一，产物照旧能渲染。
      root.style.setProperty("--heading-font", cfg.typography && cfg.typography.headingFont === "serif"
        ? "Georgia,'Noto Serif SC',serif"
        : "system-ui,-apple-system,'PingFang SC',sans-serif");
      return;
    }
    if (ident(skin.key)) root.setAttribute("data-skin", ident(skin.key));
    if (ident(skin.fx)) root.setAttribute("data-fx", ident(skin.fx));
    if (ident(skin.signatureDisplay)) root.setAttribute("data-signature", ident(skin.signatureDisplay));
    TOKEN_COLORS.forEach(function (pair) {
      var v = cssColor(tk[pair[0]]);
      if (v) root.style.setProperty(pair[1], v);
    });
    TOKEN_LENGTHS.forEach(function (pair) {
      var v = cssLen(tk[pair[0]]);
      if (v) root.style.setProperty(pair[1], v);
    });
    if (cssLen(tk.h1)) root.style.setProperty("--h1", "clamp(1.9rem,4.6vw," + cssLen(tk.h1) + ")");
    if (cssLen(tk.h2)) root.style.setProperty("--h2", "clamp(1.35rem,2.9vw," + cssLen(tk.h2) + ")");
    if (cssFonts(tk.headingFont)) root.style.setProperty("--heading-font", cssFonts(tk.headingFont));
    if (cssFonts(tk.bodyFont)) root.style.setProperty("--body-font", cssFonts(tk.bodyFont));
  }

  // 装饰层（fx 轴）：只在 hero / cta / 页头背后铺一层，类名闭集，规则全在
  // assets/skin.css 里 —— 这里不拼 HTML、不写内联样式，只挂类名。
  var DECOR = {
    aurora: ["leo-aurora"],
    blobs: ["leo-blob", "leo-blob leo-blob-2", "leo-blob leo-blob-3"],
    stripes: ["leo-stripes"],
    "neon-grid": ["leo-neon-grid", "leo-neon-halo"],
    spotlight: ["leo-spotlight", "leo-spotbeam"],
    waves: ["leo-wave"],
    grid: ["leo-grid-deco"],
    shimmer: ["leo-sheen"],
    orbs: ["leo-orb", "leo-orb leo-orb-2", "leo-orb leo-orb-3"],
    dots: ["leo-dots"],
    beams: ["leo-beam", "leo-beam leo-beam-2"],
    noise: ["leo-noise"],
    none: [],
  };
  var DECOR_SECTIONS = { hero: 1, cta: 1, "page-header": 1 };

  function decorLayer(type) {
    var skin = state.cfg && state.cfg.skin;
    var fx = skin ? ident(skin.fx) : "";
    if (!fx || !DECOR_SECTIONS[type]) return null;
    var classes = Object.prototype.hasOwnProperty.call(DECOR, fx) ? DECOR[fx] : ["leo-veil"];
    if (!classes.length) return null;
    return h("div", { class: "leo-decor", "aria-hidden": "true" }, classes.map(function (c) {
      return h("div", { class: c });
    }));
  }

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
      var c = s.content || {};
      // 签名节在产物里靠 display 认出来（降级表把 sig* 压成闭集类型后只剩这个记号），
      // 运行时把它写成 data-signature，于是这套装的签名版式才有选择器可打。
      var sig = c.signatureKind ? ident(c.display) : "";
      var sec = h("section", {
        id: s.id,
        class: "sec sec-" + str(s.type) + " w-" + str(st.contentWidth || "wide") + " flow-" + str(st.layout || "default"),
        style: sectionStyle(s),
        "data-signature": sig,
      }, [decorLayer(s.type), h("div", { class: "inner" }, render(c))]);
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
    applySkin(cfg);
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
export const RUNTIME_CSS = String.raw`:root{--primary:#2563eb;--page-bg:#fff;--surface:#f8fafc;--nav-bg:#ffffffef;--border:#0000001f;--ink:#0f172a;--sub:#475569;--heading-font:system-ui,-apple-system,'PingFang SC',sans-serif;--body-font:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;--line-height:1.65;--radius:16px;--radius-btn:999px;--radius-img:12px;--radius-pill:999px;--space:72px;--gap:24px;--h1:clamp(1.9rem,4.6vw,3rem);--h2:clamp(1.35rem,2.9vw,2rem)}
*{box-sizing:border-box}
body{margin:0;background:var(--page-bg);color:var(--ink);font:16px/var(--line-height) var(--body-font)}
h1,h2,h3,.brand{font-family:var(--heading-font);line-height:1.15;margin:0}
h1{font-size:var(--h1);font-weight:800}
h2{font-size:var(--h2);font-weight:800}
h3{font-size:1.05rem;font-weight:700}
p{margin:.55em 0}
a{color:inherit;text-decoration:none}
#site-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:1.5rem;padding:.85rem 1.5rem;background:var(--nav-bg);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
#site-nav .brand{font-weight:800;font-size:1.05rem}
#site-nav nav{display:flex;gap:1.1rem;margin-left:auto;font-size:.9rem}
#site-nav nav a.active{color:var(--primary);font-weight:600}
#lang-toggle{border:1px solid var(--primary);color:var(--primary);background:transparent;border-radius:var(--radius-pill);padding:.25rem .6rem;font-size:.75rem;cursor:pointer}
.sec{width:100%;position:relative}
.sec .inner{margin:0 auto;padding:0 1.5rem;position:relative;z-index:1}
.w-narrow .inner{max-width:48rem}.w-normal .inner{max-width:64rem}.w-wide .inner{max-width:72rem}.w-full .inner{max-width:none}
.leo-decor{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.sec-head{max-width:42rem;margin-bottom:calc(var(--gap) * 1.5)}
.sec[style*="text-align:center"] .sec-head{margin-left:auto;margin-right:auto}
.eyebrow{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin:0 0 .5rem}
.lead{font-size:1.06rem;opacity:.9}
.sub{opacity:.75;font-size:.94rem}
.center{text-align:center}
.grid{display:grid;gap:var(--gap)}
.grid-2{grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))}
.grid-3{grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))}
.grid-4{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
.split{display:grid;gap:calc(var(--gap) * 1.6);grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));align-items:center}
.flow-reverse .split>*:first-child{order:2}
.card{background:#ffffff14;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;padding:1.35rem}
.card .pad,.product .pad{padding:0}
.card .thumb,.hero-media,.media,.avatar,.shot{border-radius:var(--radius-img);overflow:hidden}
.card .thumb{margin:-1.35rem -1.35rem 1rem}
.thumb.square img{aspect-ratio:1/1}
img.cover,.logo-img{display:block;width:100%;height:100%;object-fit:cover}
.hero-body{display:grid;gap:calc(var(--gap) * 1.6);grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));align-items:center}
.hero-media img{height:22rem}
.cta-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
.btn{display:inline-block;padding:.7rem 1.6rem;border-radius:var(--radius-btn);font-weight:600;background:var(--primary);color:#fff}
.btn.ghost{background:transparent;border:1.5px solid currentColor;color:inherit}
.btn.link{background:none;padding:0;color:var(--primary)}
.icon{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;border-radius:var(--radius-img);background:#8888881f;color:var(--primary);margin-bottom:.85rem}
.stat{text-align:center}
.stat-value{font-size:2.1rem;font-weight:800;color:var(--primary)}
.stat-label{font-size:.88rem;opacity:.75}
.badge{display:inline-block;padding:.15rem .55rem;border-radius:var(--radius-pill);background:var(--primary);color:#fff;font-size:.72rem;margin:.4rem 0}
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
.photo-slot{display:flex;align-items:center;justify-content:center;padding:.65rem;border:1px dashed #88888866;border-radius:var(--radius-img);background:#88888812;color:inherit;font-size:.72rem;line-height:1.25;text-align:center}
.role{color:var(--primary);font-size:.9rem;margin:.2rem 0}
.step-no{display:inline-block;font-size:1.6rem;font-weight:800;color:var(--primary);opacity:.35}
blockquote{margin:0}
blockquote footer{margin-top:.9rem;font-size:.85rem;opacity:.75}
.quote-author{display:flex;align-items:center;gap:.7rem;text-align:left}
.faq-list{display:grid;gap:.7rem}
details{border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.15rem}
summary{cursor:pointer;font-weight:600}
.logo-strip,.marquee .track{display:flex;gap:2rem;align-items:center;flex-wrap:wrap;justify-content:center;opacity:.7;font-weight:700}
.marquee{overflow:hidden}
.marquee .track{flex-wrap:nowrap;width:max-content;animation:mq 26s linear infinite}
@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.chart{display:flex;align-items:flex-end;gap:1.1rem;height:14rem}
.bar-wrap{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center}
.bar{background:var(--primary);border-radius:var(--radius-img) var(--radius-img) 0 0;position:relative;min-height:8px}
.bar span{position:absolute;top:-1.5rem;left:0;right:0;font-size:.8rem;font-weight:700}
.bar-label{font-size:.8rem;opacity:.7;margin-top:.4rem}
.insight{font-weight:600;font-size:1.05rem}
.timeline{list-style:none;padding:0;display:grid;gap:calc(var(--gap) * 1.1)}
.timeline .year{font-size:.8rem;font-weight:700;color:var(--primary);letter-spacing:.1em}
.timeline li{border-left:2px solid var(--border);padding-left:1.2rem}
.page-header h1{font-size:calc(var(--h1) * .78)}
.cta-band{display:grid;gap:1.25rem}
.contact-list{list-style:none;padding:0;display:grid;gap:.6rem;font-size:.95rem}
.form{display:grid;gap:.75rem;padding:1.5rem;border:1px solid var(--border);border-radius:var(--radius)}
.form label{display:grid;gap:.35rem;font-size:.85rem}
.form input,.form textarea{border:1px solid var(--border);border-radius:var(--radius-btn);padding:.6rem .75rem;font:inherit;background:transparent;color:inherit}
.footer-grid{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}
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
  const skinKey = cssIdent(t.skinKey);
  const signature = SKIN_SIGNATURE[t.skinKey as SkinKey];
  // 三个 data-* 都在 <html> 上：装的样式表按它们生效，运行时未跑完也已经是这套装的长相
  // （首屏不会先闪一版默认皮），而且产物侧靠它们就能量出「这份源码是哪套装发的」。
  return `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "zh-CN"}" data-lang="${lang}" data-skin="${skinKey}" data-fx="${cssIdent(t.accentFx)}" data-signature="${cssIdent(signature ? signature.display : "")}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}"/>
<meta name="generator" content="OceanLeo ${WEBSITE_SOURCE_SCHEMA} · ${structure.slug}"/>
<link rel="stylesheet" href="assets/styles.css"/>
<link rel="stylesheet" href="${SKIN_CSS_PATH}"/>
<style>${safeCss(skinRootCss(t))}</style>
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
- 套装：${t.skinLabel}（\`${t.skinKey}\`）${t.forceDark ? " · 暗色" : ""}
- 版式基因：圆角 ${t.radius} / 密度 ${t.density} / 标题字族 ${t.font} / 装饰 ${t.accentFx}
- 签名版块：\`${SKIN_SIGNATURE[t.skinKey as SkinKey]?.kind ?? "—"}\`（这套装独有，换装即换掉）
- 页面：${pages}
- 双语：\`${SITE_CONFIG_PATH}\`（中文）与 \`${SITE_CONFIG_EN_PATH}\`（English），页面右上角切换

## 文件

| 文件 | 作用 |
|---|---|
| \`${SITE_CONFIG_PATH}\` | 工程对象（页面 → 板块 → 槽位）。改文案、换图、删加板块都在这里 |
| \`${SITE_CONFIG_EN_PATH}\` | 英文版工程对象，结构与中文版逐节一致 |
| \`${ENTRY_HTML}\` | 页面骨架，只有导航容器与主体容器 |
| \`assets/styles.css\` | 共享样式；主色/圆角/疏密/字体全部读 CSS 变量，500 个模板同一份 |
| \`${SKIN_CSS_PATH}\` | **这一套装自己的样式**：全套令牌 + 结构规则 + 装饰效果 + 签名版块版式 |
| \`assets/app.js\` | 按工程对象渲染 22 类板块 |
| \`${STRUCTURE_PATH}\` | 结构中间表示（含每节变体号与槽位角色），供校验与二次生成 |
| \`${TEMPLATE_AXES_PATH}\` | 轻编辑三轴（构成 / 外观 / 文案）的当前值、准入选项与确定性换轴数据 |

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
  axes: TemplateAxesMetadata<VirtualPageOut>;
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
  const structure = buildTemplateStructure(meta, industry, sub);
  const config = buildWebsiteSourceConfig(structure, "zh");
  const configEn = buildWebsiteSourceConfig(structure, "en");
  const axes = buildTemplateAxesMetadata(meta, industry, sub, structure, config);
  return { structure, config, configEn, axes, tree: buildWebsiteSourceTree(structure, axes, opts) };
}

/**
 * 只按结构 IR 产源码树。换装预览与 `template-skins.selfcheck.mjs` 走这条：
 * 它们要固定内容与构成、只换装，拿不到（也不需要）taxonomy 的 meta。
 */
export function buildWebsiteSourceTree(
  structure: TemplateStructureIR,
  axes: TemplateAxesMetadata<VirtualPageOut> | null,
  opts: BuildTreeOptions = {},
): SourceTree {
  const lang: Lang = opts.defaultLang ?? "zh";
  const config = buildWebsiteSourceConfig(structure, "zh");
  const configEn = buildWebsiteSourceConfig(structure, "en");
  const siteFiles: SourceFile[] = [
    { path: ENTRY_HTML, mediaType: "text/html", text: indexHtml(structure, lang) },
    { path: SITE_CONFIG_PATH, mediaType: "application/json", text: `${JSON.stringify(config, null, 2)}\n` },
    { path: SITE_CONFIG_EN_PATH, mediaType: "application/json", text: `${JSON.stringify(configEn, null, 2)}\n` },
    ...(axes
      ? [{ path: TEMPLATE_AXES_PATH, mediaType: "application/json", text: `${JSON.stringify(axes, null, 2)}\n` }]
      : []),
    { path: "assets/styles.css", mediaType: "text/css", text: RUNTIME_CSS },
    { path: SKIN_CSS_PATH, mediaType: "text/css", text: skinCss(structure.theme) },
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
  siteFiles.push(...imageSourceFiles(structure, config, configEn, axes));
  const sha = opts.sha256;
  const len = opts.byteLen ?? ((t: string) => new TextEncoder().encode(t).length);
  const manifest = manifestFor(siteFiles, sha ?? (() => ""), len);
  return {
    entrypoint: MANIFEST_PATH,
    files: [
      { path: MANIFEST_PATH, mediaType: "application/json", text: `${JSON.stringify(manifest, null, 2)}\n` },
      ...siteFiles,
    ],
  };
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
    shapeKey: structure.theme.shapeKey,
    skinKey: structure.theme.skinKey,
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

// ————————————————————————————————————————————————————————————
// 发射自检：映射齐全 + 五条轴没有塌成「所有装同值」
// ————————————————————————————————————————————————————————————

/** 产物里必须齐的装令牌；少一个就意味着某条轴又有一半退回写死值。 */
const REQUIRED_SKIN_TOKENS = [
  "primary", "page-bg", "surface", "nav-bg", "border", "ink", "sub",
  "radius", "radius-btn", "radius-img", "radius-pill",
  "space", "gap", "h1", "h2", "line-height", "heading-font", "body-font",
];

/** 守卫取样用的最小 theme：只含算令牌 / 装饰 / 明暗要用的格子，不牵动 taxonomy 与内容包。 */
function guardTheme(skin: Skin): Theme {
  const p = paletteByKey(skin.palettes[0]);
  return {
    shapeKey: "s6",
    layoutKey: "corporate",
    layoutLabel: "企业官网",
    skinKey: skin.key,
    skinLabel: skin.label,
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
    forceDark: skin.dark,
    radius: skin.radius,
    radiusTokens: RADIUS_TOKENS[skin.radius],
    density: skin.density,
    densityTokens: DENSITY_TOKENS[skin.density],
    font: skin.font,
    fontStack: FONT_STACK[skin.font],
    accentFx: skin.fx,
    isSignature: true,
  };
}

function tokenDecls(css: string, pattern: RegExp): string {
  const out: string[] = [];
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]*)/gi)) {
    if (pattern.test(m[1])) out.push(`${m[1]}=${m[2].trim()}`);
  }
  return [...new Set(out)].sort().join("|");
}

/**
 * 每条轴在产物字节上的取值（守卫用）。
 *
 * 读的是发射器**真的会写进产物**的那几段字节（`:root` 令牌块、装饰规则、明暗面），
 * 不读 `SKINS` 表的声明值 —— 声明成十档而产物只有一档，正是这个守卫要拦的东西。
 */
function skinAxisReadings() {
  return SKINS.map((skin) => {
    const theme = guardTheme(skin);
    const root = skinRootCss(theme);
    const surfaces = skinSurfacesFor(theme);
    return {
      skin,
      root,
      surfaces,
      radius: tokenDecls(root, /^radius/),
      density: tokenDecls(root, /^(space|gap|h1|h2|line-height)$/),
      font: tokenDecls(root, /^(heading-font|body-font)$/),
      fx: fxCss(theme),
      signature: SKIN_SIGNATURE[skin.key],
    };
  });
}

/**
 * 发射自检：22 个目标类型的 content 组装器齐全、全部 kind 有落点，
 * **并且五条装轴与签名版块在产物里没有塌成「所有装同值」**。
 *
 * 后半段是这次补的：此前守卫只查映射齐全性，于是「圆角三档在产物里塌成一档」、
 * 「fx 一个字节都没进产物」这类回退可以静默照产（`probes/V1-w01-guard-counterexample.sh`
 * 实测四个反例 0/4 拦不住）。轴退化必须当场抛错，而不是等验收位去数产物。
 */
export function assertEmitterComplete(): void {
  for (const kind of ALL_SECTION_KINDS) {
    const type = SECTION_TYPE_MAP[kind];
    if (!type) throw new Error(`接口 B 缺 ${kind} 的落点`);
    if (!BUILDERS[type]) throw new Error(`缺 ${type} 的 content 组装器（kind=${kind}）`);
    if (!SECTION_CONTENT_SCHEMA[type]) throw new Error(`缺 ${type} 的 content schema`);
  }

  const rows = skinAxisReadings();
  if (rows.length < 2) throw new Error(`装少于 2 套（${rows.length}），无从谈「换装看得出来」`);

  for (const row of rows) {
    for (const token of REQUIRED_SKIN_TOKENS) {
      if (!new RegExp(`--${token}\\s*:\\s*[^;}]`).test(row.root)) {
        throw new Error(`装 ${row.skin.key} 的产物令牌缺 --${token}：这条轴会在产物里退回写死值`);
      }
    }
  }

  // 全同是最刺眼的一档，但不是唯一一档：「三档圆角在产物里塌成两档」同样是回退，
  // 而它过得了 size < 2。所以每条轴都拿**声明档数**当下限 —— 皮表里分了几档，
  // 产物字节里就必须分得出几档。
  for (const axis of ["radius", "density", "font", "fx"] as const) {
    const values = new Set(rows.map((row) => row[axis]));
    if (values.size < 2) {
      throw new Error(
        `轴退化：${rows.length} 套装的 \`${axis}\` 在产物里是同一个值 —— 换装不会改变产出源码，` +
        `拒绝照产（取值：${[...values][0].slice(0, 120)}）`,
      );
    }
    const declared = new Set(rows.map((row) => row.skin[axis]));
    if (values.size < declared.size) {
      throw new Error(
        `轴半退化：\`${axis}\` 在皮表里声明了 ${declared.size} 档（${[...declared].join("/")}），` +
        `产物字节里只分得出 ${values.size} 档 —— 有几档在发射端被压掉了，拒绝照产`,
      );
    }
  }

  const darkSkins = rows.filter((row) => row.skin.dark);
  if (!darkSkins.length || darkSkins.length === rows.length) {
    throw new Error(`暗色轴退化：${rows.length} 套装的明暗声明全同（暗色 ${darkSkins.length} 套）`);
  }
  for (const row of darkSkins) {
    if (!isDarkColor(row.surfaces.pageBg)) {
      throw new Error(`装 ${row.skin.key} 声明暗色，产物底色 ${row.surfaces.pageBg} 却不暗`);
    }
    if (relLuminance(row.surfaces.ink) <= 0.5) {
      throw new Error(`装 ${row.skin.key} 声明暗色，产物正文色 ${row.surfaces.ink} 却不浅`);
    }
  }

  const sigKinds = new Set(rows.map((row) => row.signature.kind));
  const sigDisplays = new Set(rows.map((row) => row.signature.display));
  if (sigKinds.size !== rows.length || sigDisplays.size !== rows.length) {
    throw new Error(
      `签名版块退化：${rows.length} 套装只有 ${sigKinds.size} 个不同的签名 kind、` +
      `${sigDisplays.size} 个不同的 display —— 有装在借别人的签名`,
    );
  }
  for (const row of rows) {
    if (!ALL_SECTION_KINDS.includes(row.signature.kind)) {
      throw new Error(`装 ${row.skin.key} 的签名 ${row.signature.kind} 不在 SectionKind 体系里`);
    }
    if (!SIGNATURE_RULES[row.signature.display]) {
      throw new Error(`装 ${row.skin.key} 的签名 ${row.signature.display} 在产物里没有自己的版式规则`);
    }
  }
}
