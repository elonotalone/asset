// 模板渲染引擎 v2 —— 把 (TemplateMeta + SiteContent + ExtContent + DNA) 渲染成一个
// 自包含的【多页】HTML 文档。/templates/<slug>（route.ts）把它作为 text/html 响应体
// **直接整页返回**：浏览器渲染出来的就是这个模板网站本身，可独立打开/深链/分享，
// 顶部导航点击在文档内切换页面（首页/关于/服务/案例/资讯/联系…），零额外请求。
//
// 「真多样」来自 DNA（template-dna.ts）：布局家族决定有哪些页/每页哪些章节；每类
// 章节有多个样式变体由 styleSeed 选取；再叠加配色/圆角/密度/字体，所以每个模板的
// 版式 DNA 全维度不同，而不是 v1 那样「只换配色」。
//
// 章节结构蓝本取自 MIT 开源（HyperUI / Landwind / Meraki UI，可商用可改）。

import { TemplateMeta, Industry, SubCategory } from "./template-taxonomy";
import { SiteContent } from "./template-content";
import { ExtContent } from "./template-content-ext";
import {
  DENSITY_TOKENS,
  FONT_STACK,
  LayoutFamily,
  PageKey,
  PALETTES_V2,
  PaletteV2,
  PAGE_LABEL,
  RADIUS_TOKENS,
  SectionKind,
  TemplateDNA,
  dnaFor,
} from "./template-dna";
import { hashStr } from "./hash";
import { poolPhoto, poolFallbackPhoto } from "./template-photo-pool";
import {
  decorLayer,
  effectsScript,
  effectsStyles,
  type AccentFx,
} from "./template-effects";
import { type Lang, secTitle, ui, UI, pickLang, subEn } from "./template-i18n";
import {
  type BiContent,
  type BiExt,
  flattenContent,
  flattenExt,
  buildBiContent,
  buildBiExt,
} from "./template-content-bi";
import { renderSignatureSection } from "./template-engine-signature";

// ————————————————————————————————————————————————————————————
// 渲染上下文（一次渲染共享）
// ————————————————————————————————————————————————————————————

export interface Ctx {
  meta: TemplateMeta;
  c: SiteContent;
  ext: ExtContent;
  dna: TemplateDNA;
  p: PaletteV2;
  fx: AccentFx;
  R: ReturnType<typeof radiusTokens>;
  D: ReturnType<typeof densityTokens>;
  /** 表面色令牌（浅/深两态）——见 surfaceTokens()。通用渲染器用它取代写死的
   *  `#fff / bg-white / 黑色描边`，这样 forceDark 深色底下正文/卡片也可读。 */
  S: SurfaceTokens;
  /** 当前正在渲染的页面 key（renderTemplate 循环里逐页赋值）。 */
  pageKey: string;
  /** 当前渲染语言（引擎为 zh / en 各渲染一遍）。 */
  lang: Lang;
  /** 给定章节种类取它的样式变体序号（掺入 pageKey——同模板不同页不同版式）。 */
  variantOf: (kind: SectionKind, count: number) => number;
  /** 取某 section 在本行业+当前语言下的标题/副标题（治「换字置换」）。 */
  st: (kind: "cases" | "team" | "process" | "products" | "gallery" | "news") => { title: string; sub?: string };
  /** 当前语言取 UI 词条短语。 */
  u: (key: keyof typeof UI) => string;
}

function radiusTokens(dna: TemplateDNA) {
  return RADIUS_TOKENS[dna.radius];
}
function densityTokens(dna: TemplateDNA) {
  return DENSITY_TOKENS[dna.density];
}

// ————————————————————————————————————————————————————————————
// 表面色令牌（浅 / 深两态）
// ————————————————————————————————————————————————————————————
//
// 背景：通用章节渲染器（renderContact / renderCases / renderFaq / …）历史上把
// 「白底 + 黑色描边卡片」写死，只在浅色配色下成立。当模板落到 forceDark 的深色
// 霓虹配色（neon-tech 家族）时，palette 的 `ink/sub` 变成近白文字，压在写死的
// 白底上就完全不可读（asset.oceanleo.com/templates「字看不清」的第二类根因）。
//
// 修法：把「表面色」抽成随 forceDark 翻转的令牌。浅色态与旧值等价（观感不变）；
// 深色态用**半透明白叠加**——它叠在任何深色 palette 的近黑底上都得到协调的、
// 逐级抬升的表面，且与 neon-tech 既有的 `.leo-glass` 玻璃拟态语言一致，无需为
// 每个 palette 手算深色 hex。
export interface SurfaceTokens {
  /** 原本 `bg-white / #fff` 的整幅章节底。深色态：base 之上的一层微抬升。 */
  page: string;
  /** 原本 `#fff` 的卡片/面板底。深色态：比 page 再抬升一档（玻璃感）。 */
  card: string;
  /** 卡片/分隔线描边。浅色态统一为一档黑色 alpha；深色态白色 alpha。 */
  border: string;
  /** 略重的描边（原本 `#00000022` 点线/分隔）。 */
  borderStrong: string;
  /** 表单控件底。 */
  inputBg: string;
  /** 表单控件描边。 */
  inputBorder: string;
}

export function surfaceTokens(dna: TemplateDNA): SurfaceTokens {
  if (dna.forceDark) {
    return {
      page: "rgba(255,255,255,.04)",
      card: "rgba(255,255,255,.06)",
      border: "rgba(255,255,255,.12)",
      borderStrong: "rgba(255,255,255,.22)",
      inputBg: "rgba(255,255,255,.05)",
      inputBorder: "rgba(255,255,255,.2)",
    };
  }
  return {
    page: "#fff",
    card: "#fff",
    border: "#0000000f",
    borderStrong: "#00000022",
    inputBg: "#fff",
    inputBorder: "#0000001f",
  };
}

// ————————————————————————————————————————————————————————————
// 工具
// ————————————————————————————————————————————————————————————

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 配图（确定性，按子类 + seed，从 OSS 自托管行业图片池取图）。旧实现指向
// loremflickr/picsum（大陆慢、常空白、与行业无关）——已弃用，见 template-photo-pool.ts。
//
// 兼容签名：photo(query, seed) 的第一参数历史上是「行业关键词」，现改用它作为
// 【子类 key】（img() 传 ctx.meta.subKey；老调用点若传关键词会走全局 fallback 池，
// 不炸）。w/h 参数保留但不再进 URL（OSS 图是固定尺寸原图，浏览器按 CSS 缩放）。
export function photo(subKey: string, seed: number, _w = 1200, _h = 800): string {
  void _w;
  void _h;
  return poolPhoto(subKey, seed) || poolFallbackPhoto(seed);
}
// 兼容垫片：旧「随机兜底图」接口，现返回 OSS fallback 池里的确定性一张。
export function photoFallback(seed: number, _w = 1200, _h = 800): string {
  void _w;
  void _h;
  return poolFallbackPhoto(seed);
}
// <img> 的 onerror：OSS 主图偶发拉不到时，换成 fallback 池的另一张 OSS 图；
// 再失败才隐藏。全程只在自家 CDN 内兜底，绝不回退到第三方随机图。
function imgFallbackAttr(seed: number): string {
  const fb = poolFallbackPhoto(seed + 7);
  const esc = fb.replace(/'/g, "&#39;");
  return ` onerror="if(this.dataset.fb){this.style.visibility='hidden'}else{this.dataset.fb=1;this.src='${esc}'}"`;
}
export function img(ctx: Ctx, i: number, w: number, h: number, cls = "", extra = ""): string {
  const seed = ctx.dna.imgSeed + i * 13;
  const src = poolPhoto(ctx.meta.subKey, seed) || poolFallbackPhoto(seed);
  return `<img src="${src}"${imgFallbackAttr(seed)} alt="" loading="lazy" class="${cls}" style="${extra}"/>`;
}

// ————————————————————————————————————————————————————————————
// v1 兼容垫片（TemplateThumb 仍引用这些）
// ————————————————————————————————————————————————————————————

import type { ColorKey } from "./template-taxonomy";

// 旧接口：按 meta 返回一个「迷你版式风格」序号，缩略图据此微调。
export function skeletonIndexFor(meta: TemplateMeta): number {
  return hashStr(meta.layoutKey + meta.paletteKey) % 4;
}
// 旧接口：按色系 family / paletteKey 返回一个简化调色对象给缩略图用。
export function paletteFor(colorOrKey: ColorKey | string) {
  const byKey = PALETTES_V2.find((p) => p.key === colorOrKey);
  const byFam = PALETTES_V2.find((p) => p.family === colorOrKey);
  const p = byKey ?? byFam ?? PALETTES_V2[0];
  return {
    primary: p.primary,
    primaryDark: p.primaryDark,
    gradFrom: p.gradFrom,
    gradTo: p.gradTo,
    soft: p.soft,
    ink: p.ink,
    sub: p.sub,
    heroDark: p.heroDark,
    accent: p.accent,
  };
}

// ————————————————————————————————————————————————————————————
// 通用小组件
// ————————————————————————————————————————————————————————————

export function sectionPad(ctx: Ctx): string {
  return `padding-top:${ctx.D.section};padding-bottom:${ctx.D.section}`;
}
/** 当前模板子类的英文名（en 侧用，替代 meta.subLabel 中文）。 */
export function subEnFor(ctx: Ctx): string {
  return subEn(ctx.meta.subKey, ctx.meta.industryKey);
}
/** 当前语言下的子类显示名。 */
export function subName(ctx: Ctx): string {
  return ctx.lang === "en" ? subEnFor(ctx) : ctx.meta.subLabel;
}
export function heading(ctx: Ctx, title: string, sub?: string, align: "center" | "left" = "center"): string {
  const a = align === "center" ? "text-center mx-auto" : "text-left";
  return `
  <div class="max-w-2xl ${a}">
    <h2 style="font-size:${ctx.D.h2};color:${ctx.p.ink};font-weight:800;line-height:1.2">${esc(title)}</h2>
    ${sub ? `<p class="mt-3" style="color:${ctx.p.sub}">${esc(sub)}</p>` : ""}
  </div>`;
}
export function btnPrimary(ctx: Ctx, label: string, href = "#contact"): string {
  return `<a href="${href}" data-nav class="leo-btn-shine inline-block px-7 py-3 font-semibold text-white transition hover:opacity-90 hover:scale-[1.02]" style="background:${ctx.p.primary};border-radius:${ctx.R.btn}">${esc(label)}</a>`;
}
export function btnGhost(ctx: Ctx, label: string, href = "#about"): string {
  return `<a href="${href}" data-nav class="inline-block px-7 py-3 font-semibold transition hover:opacity-80" style="color:${ctx.p.primary};border:1.5px solid ${ctx.p.primary};border-radius:${ctx.R.btn}">${esc(label)}</a>`;
}
export function svgIcon(path: string, color: string, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

/** 章节滚动显现 class（hero / logos 除外，它们有独立入场）。 */
function revealCls(kind: SectionKind): string {
  const left: SectionKind[] = ["about", "features", "process", "team", "faq"];
  const right: SectionKind[] = ["services", "gallery", "cases", "news", "products", "menu"];
  const scale: SectionKind[] = ["pricing", "cta", "contact", "pageHeader"];
  if (left.includes(kind)) return "leo-reveal leo-from-left";
  if (right.includes(kind)) return "leo-reveal leo-from-right";
  if (scale.includes(kind)) return "leo-reveal leo-scale";
  return "leo-reveal";
}

function wrapSectionReveal(html: string, kind: SectionKind): string {
  if (kind === "hero" || kind === "logos") return html;
  const cls = revealCls(kind);
  if (html.includes('class="')) {
    return html.replace(/<section class="/, `<section class="${cls} `);
  }
  return html.replace("<section ", `<section class="${cls}" `);
}

// ————————————————————————————————————————————————————————————
// 顶部导航 + 页脚（每页共享，导航驱动 data-page 切换）
// ————————————————————————————————————————————————————————————

function navBar(ctx: Ctx, pages: PageKey[], variant: number): string {
  const { c, p, R } = ctx;
  const dark = ctx.dna.forceDark;
  const links = pages
    .map(
      (pk, i) =>
        `<a href="#" data-go="${pk}" class="nav-link px-1 py-2 text-sm transition hover:opacity-70 ${i === 0 ? "active" : ""}">${esc(pageLabel(ctx, pk))}</a>`,
    )
    .join("");
  const brand = `
    <div class="flex items-center gap-2 font-bold text-lg">
      <span class="inline-flex h-9 w-9 items-center justify-center text-white" style="background:${p.primary};border-radius:${R.btn}">${esc(c.brand.slice(0, 1))}</span>
      <span>${esc(c.brand)}</span>
    </div>`;
  // 双语开关 + 下载源码按钮（每个模板站自带）。
  const utilBtns = `<div class="flex items-center gap-2">${langToggleBtn(ctx)}${downloadBtn(ctx)}</div>`;
  const cta = `<a href="#" data-go="contact" class="hidden sm:inline-block px-5 py-2 text-sm font-semibold text-white" style="background:${p.primary};border-radius:${R.btn}">${esc(c.heroCta)}</a>`;
  const headerBg = dark
    ? `background:${p.soft}ee;border-color:${p.primary}22`
    : "border-color:#0000000d";
  const headerCls = dark
    ? "sticky top-0 z-30 backdrop-blur border-b"
    : "sticky top-0 z-30 bg-white/90 backdrop-blur border-b";

  // 两种导航样式：居中 logo / 左 logo 右菜单。
  if (variant % 2 === 1) {
    return `
  <header class="${headerCls}" style="${headerBg}">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      ${brand}
      <nav class="hidden md:flex items-center gap-7" style="color:${p.ink}">${links}</nav>
      <div class="flex items-center gap-3">${utilBtns}${cta}</div>
    </div>
  </header>`;
  }
  return `
  <header class="${headerCls}" style="${headerBg}">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
      ${brand}
      <nav class="hidden md:flex items-center gap-6 ml-auto" style="color:${p.ink}">${links}</nav>
      <div class="flex items-center gap-3">${utilBtns}${cta}</div>
    </div>
  </header>`;
}

/** 语言开关按钮：点击在中/EN 间切换（客户端，无需联网）。 */
function langToggleBtn(ctx: Ctx): string {
  const { p, R } = ctx;
  const label = ctx.u("langToggle"); // zh 页显示 "EN"，en 页显示 "中"
  return `<button type="button" data-lang-toggle title="切换语言 / Switch language" class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80" style="border:1px solid ${p.primary}55;color:${p.primary};border-radius:${R.btn}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>${esc(label)}</button>`;
}

/** 一键下载源码按钮：跳到 ?download=1 触发浏览器另存 HTML。 */
function downloadBtn(ctx: Ctx): string {
  const { p, R } = ctx;
  const label = ctx.u("langToggle") === "EN" ? "源码" : "Code";
  const title = ctx.lang === "en" ? "Download this template's source (.html)" : "下载本模板源码（.html）";
  return `<a href="?download=1" download data-download title="${esc(title)}" class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90" style="background:${p.primary};border-radius:${R.btn}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>${esc(label)}</a>`;
}

/** 当前语言下的页面导航标签。 */
function pageLabel(ctx: Ctx, pk: PageKey): string {
  if (ctx.lang === "en") return ui(pk as keyof typeof UI, "en");
  return PAGE_LABEL[pk];
}

function footer(ctx: Ctx, pages: PageKey[]): string {
  const { c, p } = ctx;
  const links = pages.map((pk) => `<a href="#" data-go="${pk}" class="block hover:text-white transition">${esc(pageLabel(ctx, pk))}</a>`).join("");
  return `
  <footer class="bg-slate-900 text-slate-400">
    <div class="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
      <div class="md:col-span-2">
        <div class="flex items-center gap-2 text-white font-bold text-lg">
          <span class="inline-flex h-8 w-8 items-center justify-center" style="background:${p.primary};border-radius:8px">${esc(c.brand.slice(0, 1))}</span>${esc(c.brand)}
        </div>
        <p class="mt-4 text-sm max-w-sm leading-relaxed">${esc(c.footerSlogan)}</p>
      </div>
      <div>
        <div class="text-white font-semibold mb-3">${ctx.u("quickNav")}</div>
        <div class="space-y-2 text-sm">${links}</div>
      </div>
      <div>
        <div class="text-white font-semibold mb-3">${ctx.u("contactUs")}</div>
        <div class="space-y-2 text-sm">
          <div>${ctx.u("phone")}：${esc(c.contactPhone)}</div>
          <div>${ctx.u("email")}：${esc(c.contactEmail)}</div>
          <div>${ctx.u("address")}：${esc(c.contactAddress)}</div>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 py-5 text-center text-xs">© ${new Date().getFullYear()} ${esc(c.brand)} · ${ctx.u("genBy")} · ${ctx.u("previewOnly")}</div>
  </footer>`;
}

// ————————————————————————————————————————————————————————————
// 章节渲染器：每类章节多个样式变体
// ————————————————————————————————————————————————————————————

/**
 * 全出血大图上的「可读性遮罩」——专业做法：方向性暗角为主（压住文字区、保住照片
 * 本体的真实色彩与层次），品牌色只做极低不透明度点缀。绝不用 60–80% 不透明的
 * 单一色相把整张照片糊成一坨色（那是 asset.oceanleo.com/templates 配图「诡异
 * 配色」的根因，2026-07-05 修）。
 *
 * - 底→顶的暗角：文字落在底部/中部时清晰，顶部照片透亮。
 * - 品牌色斜向叠加只有 ~14–22% alpha，够统一色调、不吃掉照片。
 * - align="center"：文字居中型 hero 用径向压暗（中心稍压、四周更透）。
 */
function heroScrim(p: PaletteV2, align: "center" | "bottom" = "bottom"): string {
  if (align === "center") {
    return `<div class="absolute inset-0" style="background:radial-gradient(ellipse 90% 80% at 50% 50%,#00000073,#0000003d 45%,#00000026);pointer-events:none"></div>
      <div class="absolute inset-0" style="background:linear-gradient(135deg,${p.gradFrom}2b,${p.gradTo}1f);mix-blend-mode:multiply;pointer-events:none"></div>`;
  }
  return `<div class="absolute inset-0" style="background:linear-gradient(to top,#000000c2 0%,#0000008f 32%,#0000002e 62%,transparent 88%);pointer-events:none"></div>
    <div class="absolute inset-0" style="background:linear-gradient(120deg,${p.gradFrom}24,transparent 55%,${p.gradTo}14);mix-blend-mode:multiply;pointer-events:none"></div>`;
}

// 仅本地开发预览用：强制 hero 使用某个变体（review 各版式用）。生产恒为 null。
let _heroVOverride: number | null = null;

function renderHero(ctx: Ctx): string {
  const { c, p, R, D, fx, dna } = ctx;
  const deco = decorLayer(p, fx, dna.styleSeed);
  const v = _heroVOverride !== null ? _heroVOverride : ctx.variantOf("hero", 6);
  const subName = ctx.lang === "en" ? subEnFor(ctx) : ctx.meta.subLabel;

  // 渐变型 hero（v0/v6）的文字颜色必须随 palette.heroDark 走：深底渐变用白字，
  // 浅底渐变（paper/glacier 等 heroDark:false）用墨色 ink——否则白字压浅底完全看不清
  // （asset.oceanleo.com/templates 出现整屏空白/文字消失的第二类根因，2026-07-05 修）。
  // 图片型 hero（v1/v5）有 heroScrim 暗角兜底，恒用白字。
  const gradInk = p.heroDark ? "#ffffff" : p.ink;
  const gradSubInk = p.heroDark ? "#ffffff" : p.sub;
  // 浅底渐变上的 badge / ghost 按钮改用实心描边，保证在浅底也清晰。
  const badgeFor = (onDark: boolean) =>
    onDark
      ? `<span class="inline-block px-3 py-1 text-xs font-medium" style="background:#ffffff26;color:#fff;border-radius:${R.pill};backdrop-filter:blur(4px)">${esc(subName)} · ${ctx.u("proSolution")}</span>`
      : `<span class="inline-block px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(subName)} · ${ctx.u("proSolution")}</span>`;
  // 默认（浅底/图上）badge 用品牌浅底；深底渐变用玻璃白。
  const badge = badgeFor(false);
  const title = `<h1 style="font-size:${D.h1};font-weight:800;line-height:1.12">${esc(c.heroTitle)}</h1>`;
  const subt = `<p class="mt-5 text-lg" style="opacity:.9">${esc(c.heroSubtitle)}</p>`;
  const ctas = `<div class="mt-8 flex flex-wrap gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div>`;
  const copy = `<div class="leo-reveal leo-in">${badge}<div class="mt-5">${title}</div>${subt}${ctas}</div>`;

  // 渐变型 hero 专用 copy：按 heroDark 决定字色（v0/v6）。
  const gradCtas = p.heroDark
    ? ctas
    : `<div class="mt-8 flex flex-wrap gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div>`;
  const gradCopy = `<div class="leo-reveal leo-in" style="color:${gradInk}">${badgeFor(p.heroDark)}<div class="mt-5">${title}</div><p class="mt-5 text-lg" style="color:${gradSubInk};opacity:${p.heroDark ? ".9" : "1"}">${esc(c.heroSubtitle)}</p>${gradCtas}</div>`;

  if (v === 0) {
    return `
    <section class="relative overflow-hidden leo-grad-anim" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});color:${gradInk}">
      ${deco}
      <div class="relative max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center" style="${sectionPad(ctx)}">
        ${gradCopy}
        <div class="leo-reveal leo-in leo-from-right" style="transition-delay:.12s">${img(ctx, 0, 900, 700, "w-full object-cover shadow-2xl leo-card", `border-radius:${R.img};height:24rem`)}</div>
      </div>
    </section>`;
  }
  if (v === 1) {
    return `
    <section class="relative flex items-center justify-center text-center text-white overflow-hidden" style="min-height:78vh;text-shadow:0 1px 24px #00000059">
      ${img(ctx, 0, 1600, 1000, "absolute inset-0 h-full w-full object-cover leo-kenburns")}
      ${heroScrim(p, "center")}
      ${deco}
      <div class="relative max-w-3xl px-6">${copy}</div>
    </section>`;
  }
  if (v === 2) {
    return `
    <section class="relative text-center overflow-hidden" style="background:${ctx.S.page};color:${p.ink}">
      <div class="max-w-4xl mx-auto px-6" style="${sectionPad(ctx)}">
        ${copy}
        <div class="leo-reveal leo-in leo-scale" style="transition-delay:.15s">${img(ctx, 0, 1200, 600, "mt-12 w-full object-cover shadow-xl leo-card", `border-radius:${R.img};height:26rem`)}</div>
      </div>
    </section>`;
  }
  if (v === 3) {
    return `
    <section class="grid md:grid-cols-2 relative overflow-hidden" style="min-height:72vh">
      <div class="relative flex items-center px-6 md:px-16 py-16" style="background:${p.soft};color:${p.ink}">
        ${deco}
        <div class="relative">${copy.replace("leo-reveal leo-in", "leo-reveal leo-in leo-from-left")}</div>
      </div>
      <div class="relative">${img(ctx, 0, 900, 1100, "absolute inset-0 h-full w-full object-cover leo-kenburns")}</div>
    </section>`;
  }
  if (v === 5) {
    // 全出血图 + 底部浮层卡片（文案落在卡上）
    const cardBg = dna.forceDark ? `${p.soft}e6` : "#ffffffef";
    return `
    <section class="relative overflow-hidden" style="min-height:74vh">
      ${img(ctx, 0, 1600, 1000, "absolute inset-0 h-full w-full object-cover leo-kenburns")}
      ${heroScrim(p, "bottom")}
      <div class="relative max-w-6xl mx-auto px-6 flex items-end" style="min-height:74vh;padding-bottom:3.5rem">
        <div class="leo-reveal leo-in max-w-xl p-8 shadow-2xl" style="background:${cardBg};border:1px solid ${ctx.S.border};border-radius:${R.card};backdrop-filter:blur(6px);color:${p.ink}">
          ${badge}<div class="mt-4">${title}</div>${subt}${ctas}
        </div>
      </div>
    </section>`;
  }
  return `
    <section class="relative overflow-hidden leo-grad-anim" style="background:linear-gradient(160deg,${p.gradFrom},${p.gradTo});color:${gradInk}">
      ${deco}
      <div class="relative max-w-4xl mx-auto px-6 text-center" style="${sectionPad(ctx)}">
        ${gradCopy}
      </div>
    </section>`;
}

function renderStats(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const v = ctx.variantOf("stats", 3);
  const items = c.stats
    .map(
      (s) => `
      <div class="text-center">
        <div class="leo-stat-num" style="font-size:2.25rem;font-weight:800;color:${p.primary}">${esc(s.value)}</div>
        <div class="mt-1 text-sm" style="color:${p.sub}">${esc(s.label)}</div>
      </div>`,
    )
    .join("");
  if (v === 0) {
    return `<section style="background:${ctx.S.page}"><div class="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">${items}</div></section>`;
  }
  if (v === 2) {
    // 深色渐变横幅数字（白字 + 分隔线）
    const darkItems = c.stats
      .map(
        (s, i) => `<div class="text-center px-6 ${i > 0 ? "md:border-l md:border-white/15" : ""}"><div class="leo-stat-num text-white" style="font-size:2.4rem;font-weight:800">${esc(s.value)}</div><div class="mt-1 text-sm text-white/70">${esc(s.label)}</div></div>`,
      )
      .join("");
    return `<section class="leo-grad-anim" style="background:linear-gradient(120deg,${p.gradFrom},${p.gradTo})"><div class="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8">${darkItems}</div></section>`;
  }
  return `<section style="background:${p.soft}"><div class="max-w-6xl mx-auto px-6 py-12"><div class="grid grid-cols-2 md:grid-cols-4 gap-6" style="background:${ctx.S.card};border:1px solid ${ctx.S.border};border-radius:${R.card};padding:2rem;box-shadow:0 10px 30px #0000000d">${items}</div></div></section>`;
}

function renderAbout(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const v = ctx.variantOf("about", 3);
  const checks = c.services
    .slice(0, 3)
    .map(
      (s) =>
        `<li class="flex items-center gap-2" style="color:${p.ink}">${svgIcon("M20 6L9 17l-5-5", p.primary, 20)}<span class="text-sm">${esc(s.name)}</span></li>`,
    )
    .join("");
  const text = `
    <div>
      <span class="inline-block px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(c.aboutTitle)}</span>
      <h2 class="mt-4" style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink};line-height:1.25">${esc(c.heroTitle)}</h2>
      ${c.aboutBody.map((t) => `<p class="mt-4 leading-relaxed" style="color:${p.sub}">${esc(t)}</p>`).join("")}
      <ul class="mt-6 space-y-2">${checks}</ul>
    </div>`;
  const pic = `<div class="relative">${img(ctx, 7, 800, 600, "w-full object-cover shadow-xl", `border-radius:${R.img};height:22rem`)}
      <div class="absolute -bottom-5 -right-5 hidden sm:block text-white shadow-lg px-6 py-4" style="background:${p.primary};border-radius:${R.card}"><div class="text-2xl font-extrabold">${esc(c.stats[0]?.value ?? "")}</div><div class="text-xs opacity-90">${esc(c.stats[0]?.label ?? "")}</div></div>
    </div>`;
  if (v === 2) {
    // 纯文字双栏（无图）
    return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-5 gap-10 items-start"><div class="md:col-span-2"><span class="inline-block px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(c.aboutTitle)}</span><h2 class="mt-4" style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink}">${esc(c.heroTitle)}</h2></div><div class="md:col-span-3">${c.aboutBody.map((t) => `<p class="mb-4 leading-relaxed" style="color:${p.sub}">${esc(t)}</p>`).join("")}<ul class="mt-2 grid sm:grid-cols-2 gap-2">${checks}</ul></div></div></section>`;
  }
  return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">${v === 1 ? pic + text : text + pic}</div></section>`;
}

const FEATURE_ICONS = [
  "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z",
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "M13 2L3 14h7l-1 8 10-12h-7z",
  "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20",
  "M16 14a4 4 0 10-8 0M12 7a3 3 0 100 6 3 3 0 000-6z",
  "M4 20V10M10 20V4M16 20v-8M22 20H2",
];

function renderFeatures(ctx: Ctx): string {
  const { c, p, R, S } = ctx;
  const v = ctx.variantOf("features", 4);
  const feats = c.features.slice(0, 6);
  // v3「深色卡片」原本用 p.ink 当卡底 + 白字——深色配色时 p.ink 近白，会白底白字。
  const darkCardBg = ctx.dna.forceDark ? p.primaryDark : p.ink;
  const cards = feats
    .map((f, i) => {
      const icon = svgIcon(f.icon || FEATURE_ICONS[i % FEATURE_ICONS.length], p.primary, 24);
      if (v === 1) {
        // 左图标右文（行式）
        return `<div class="flex gap-4 p-5" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="shrink-0 h-11 w-11 flex items-center justify-center" style="background:${p.soft};border-radius:${R.btn}">${icon}</div><div><h3 class="font-semibold" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(f.desc)}</p></div></div>`;
      }
      if (v === 2) {
        // 极简描边 · 顶部数字
        return `<div class="p-6" style="border:1px solid ${S.border};border-radius:${R.card}"><div class="text-3xl font-extrabold" style="color:${p.primary}">${String(i + 1).padStart(2, "0")}</div><h3 class="mt-3 font-semibold" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(f.desc)}</p></div>`;
      }
      if (v === 3) {
        // 深色卡片
        return `<div class="p-6 text-white" style="background:${darkCardBg};border-radius:${R.card}"><div class="h-11 w-11 flex items-center justify-center" style="background:${p.primary};border-radius:${R.btn}">${svgIcon(f.icon || FEATURE_ICONS[i % FEATURE_ICONS.length], "#fff", 22)}</div><h3 class="mt-4 font-semibold">${esc(f.title)}</h3><p class="mt-2 text-sm text-white/70">${esc(f.desc)}</p></div>`;
      }
      // v0 默认卡片
      return `<div class="leo-card p-6 transition hover:-translate-y-1" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="h-12 w-12 flex items-center justify-center" style="background:${p.soft};border-radius:${R.btn}">${icon}</div><h3 class="mt-4 font-semibold text-lg" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.desc)}</p></div>`;
    })
    .join("");
  const bg = v === 3 ? `background:${S.page}` : `background:${p.soft}`;
  return `<section style="${bg};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.featuresTitle, c.featuresSubtitle)}<div class="mt-12 grid md:grid-cols-3 gap-6" style="gap:${ctx.D.gap}">${cards}</div></div></section>`;
}

function renderServices(ctx: Ctx): string {
  const { c, p, R, S } = ctx;
  const v = ctx.variantOf("services", 4);
  const svc = c.services;
  if (v === 1) {
    // 图卡叠加文字
    const cards = svc
      .map(
        (s, i) => `<div class="group relative overflow-hidden" style="border-radius:${R.img}">${img(ctx, 20 + i, 600, 440, "h-56 w-full object-cover transition duration-500 group-hover:scale-105")}<div class="absolute inset-0" style="background:linear-gradient(to top,#000c,transparent)"></div><div class="absolute bottom-0 p-5 text-white"><h3 class="text-lg font-semibold">${esc(s.name)}</h3><p class="mt-1 text-sm text-white/80">${esc(s.desc)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
  }
  if (v === 2) {
    // 编号列表（无图）
    const rows = svc
      .map(
        (s, i) => `<div class="flex gap-5 py-6" style="border-bottom:1px solid ${S.border}"><div class="text-2xl font-extrabold w-12 shrink-0" style="color:${p.primary}">${String(i + 1).padStart(2, "0")}</div><div><h3 class="font-semibold text-lg" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle, "left")}<div class="mt-8">${rows}</div></div></section>`;
  }
  if (v === 3) {
    // 图标卡 + 浅底
    const cards = svc
      .map(
        (s, i) => `<div class="p-6 text-center" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="mx-auto h-14 w-14 flex items-center justify-center" style="background:${p.soft};border-radius:9999px">${svgIcon(FEATURE_ICONS[i % FEATURE_ICONS.length], p.primary, 26)}</div><h3 class="mt-4 font-semibold" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
  }
  // v0 卡片 + 小图
  const cards = svc
    .map(
      (s, i) => `<div class="overflow-hidden" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}">${img(ctx, 20 + i, 600, 360, "h-40 w-full object-cover")}<div class="p-5"><h3 class="font-semibold" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div></div>`,
    )
    .join("");
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
}

function renderProducts(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("products", 3);
  const st = ctx.st("products");
  // 加购按钮原本用 p.ink 当底 + 白字——深色配色时 p.ink 近白，会白底白字。
  const cartBtnBg = ctx.dna.forceDark ? p.primary : p.ink;
  if (v === 1) {
    // 首件焦点大图 + 其余小卡
    const [first, ...rest] = ext.products;
    const small = rest
      .slice(0, 4)
      .map(
        (pr, i) => `<div class="flex items-center gap-4 p-3" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="shrink-0 w-20 h-20 overflow-hidden" style="border-radius:${R.btn}">${img(ctx, 41 + i, 240, 240, "h-full w-full object-cover")}</div><div class="min-w-0"><h3 class="font-medium truncate" style="color:${ctx.p.ink}">${esc(pr.name)}</h3><div class="mt-1 font-extrabold" style="color:${p.primary}">${esc(pr.price)}</div></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-2 gap-6"><div class="relative overflow-hidden" style="border-radius:${R.img}">${img(ctx, 40, 900, 900, "h-full w-full object-cover", "min-height:22rem")}<div class="absolute bottom-0 inset-x-0 p-6 text-white" style="background:linear-gradient(to top,#000c,transparent)"><span class="px-2 py-1 text-xs font-semibold" style="background:${p.primary};border-radius:${R.pill}">${esc(first?.note ?? "")}</span><h3 class="mt-2 text-xl font-bold">${esc(first?.name ?? "")}</h3><div class="mt-1 text-lg font-extrabold">${esc(first?.price ?? "")}</div></div></div><div class="grid content-start gap-4">${small}</div></div></div></section>`;
  }
  if (v === 2) {
    // 横滚商品条
    const cards = ext.products
      .map(
        (pr, i) => `<div class="shrink-0 w-60 snap-start overflow-hidden" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}">${img(ctx, 40 + i, 480, 480, "aspect-square w-full object-cover")}<div class="p-4"><h3 class="font-medium truncate" style="color:${ctx.p.ink}">${esc(pr.name)}</h3><div class="mt-1.5 flex items-center justify-between"><span class="font-extrabold" style="color:${p.primary}">${esc(pr.price)}</span><span class="text-xs" style="color:${p.sub}">${esc(pr.note)}</span></div></div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub, "left")}</div><div class="mt-10 flex gap-4 overflow-x-auto px-6 pb-4 snap-x" style="scrollbar-width:thin">${cards}</div></section>`;
  }
  const cards = ext.products
    .map(
      (pr, i) => `<div class="group overflow-hidden" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="relative">${img(ctx, 40 + i, 500, 500, "aspect-square w-full object-cover transition group-hover:scale-105")}<span class="absolute top-3 left-3 px-2 py-1 text-xs font-semibold text-white" style="background:${p.primary};border-radius:${R.pill}">${esc(pr.note)}</span></div><div class="p-4"><h3 class="font-medium truncate" style="color:${ctx.p.ink}">${esc(pr.name)}</h3><div class="mt-2 flex items-center justify-between"><span class="font-extrabold" style="color:${p.primary}">${esc(pr.price)}</span><button class="px-3 py-1.5 text-xs font-semibold text-white" style="background:${cartBtnBg};border-radius:${R.btn}">${ctx.u("addToCart")}</button></div></div></div>`,
    )
    .join("");
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
}

function renderMenu(ctx: Ctx): string {
  const { ext, p } = ctx;
  const groups = ext.menu
    .map(
      (g) => `<div><h3 class="text-lg font-bold mb-4 inline-block pb-1" style="color:${p.ink};border-bottom:3px solid ${p.primary}">${esc(g.group)}</h3><div class="space-y-3">${g.items
        .map(
          (it) => `<div class="flex items-baseline gap-3"><span style="color:${ctx.p.ink};font-weight:500">${esc(it.name)}</span><span class="flex-1" style="border-bottom:1px dotted ${ctx.S.borderStrong}"></span><span style="color:${p.primary};font-weight:700">${esc(it.price)}</span></div>`,
        )
        .join("")}</div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, ctx.u("secMenu"), ctx.u("secMenuSub"))}<div class="mt-12 grid md:grid-cols-2 gap-12">${groups}</div></div></section>`;
}

function renderGallery(ctx: Ctx): string {
  const { R, p } = ctx;
  const v = ctx.variantOf("gallery", 3);
  const st = ctx.st("gallery");
  if (v === 1) {
    // 不等高拼贴（首图大跨两行）
    const rest = Array.from({ length: 4 }, (_, i) => `<div class="overflow-hidden" style="border-radius:${R.img}">${img(ctx, 61 + i, 600, 460, "h-full w-full object-cover transition hover:scale-105 duration-500", "min-height:11rem")}</div>`).join("");
    return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><div class="sm:col-span-2 sm:row-span-2 overflow-hidden" style="border-radius:${R.img}">${img(ctx, 60, 1000, 940, "h-full w-full object-cover transition hover:scale-105 duration-500", "min-height:23rem")}</div>${rest}</div></div></section>`;
  }
  if (v === 2) {
    // 横向滚动条带
    const cells = Array.from({ length: 8 }, (_, i) => `<div class="shrink-0 w-72 overflow-hidden snap-start" style="border-radius:${R.img}">${img(ctx, 60 + i, 640, 480, "aspect-[4/3] w-full object-cover")}</div>`).join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub, "left")}</div><div class="mt-10 flex gap-4 overflow-x-auto px-6 pb-4 snap-x" style="scrollbar-width:thin">${cells}</div></section>`;
  }
  const cells = Array.from({ length: 6 }, (_, i) => `<div class="overflow-hidden" style="border-radius:${R.img}">${img(ctx, 60 + i, 700, 520, "aspect-[4/3] w-full object-cover transition hover:scale-105 duration-500")}</div>`).join("");
  return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${cells}</div></div></section>`;
}

function renderCases(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const v = ctx.variantOf("cases", 3);
  const st = ctx.st("cases");
  if (v === 1) {
    // 左右交错图文长条
    const rows = ext.cases
      .slice(0, 3)
      .map(
        (cs, i) => `<div class="grid md:grid-cols-2 gap-8 items-center"><div class="${i % 2 ? "md:order-2" : ""} overflow-hidden" style="border-radius:${R.img}">${img(ctx, 80 + i, 800, 520, "w-full object-cover", "height:16rem")}</div><div class="${i % 2 ? "md:order-1" : ""}"><span class="inline-block px-2 py-0.5 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(cs.tag)}</span><h3 class="mt-3 text-xl font-bold" style="color:${ctx.p.ink}">${esc(cs.title)}</h3><p class="mt-3 leading-relaxed text-sm" style="color:${p.sub}">${esc(cs.desc)}</p><a href="#" class="mt-4 inline-block text-sm font-semibold" style="color:${p.primary}">${ctx.u("viewDetail")} →</a></div></div>`,
      )
      .join(`<div class="my-12"></div>`);
    return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12">${rows}</div></div></section>`;
  }
  if (v === 2) {
    // 大图叠字卡（横向 2 列）
    const cards = ext.cases
      .slice(0, 4)
      .map(
        (cs, i) => `<div class="group relative overflow-hidden" style="border-radius:${R.img}">${img(ctx, 80 + i, 800, 560, "h-64 w-full object-cover transition duration-500 group-hover:scale-105")}<div class="absolute inset-0" style="background:linear-gradient(to top,#000d,transparent 65%)"></div><div class="absolute bottom-0 p-6 text-white"><span class="px-2 py-0.5 text-xs font-medium bg-white/20" style="border-radius:${R.pill};backdrop-filter:blur(4px)">${esc(cs.tag)}</span><h3 class="mt-2 text-lg font-bold">${esc(cs.title)}</h3><p class="mt-1 text-sm text-white/80 line-clamp-2">${esc(cs.desc)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-2 gap-6">${cards}</div></div></section>`;
  }
  const cards = ext.cases
    .map(
      (cs, i) => `<div class="leo-card overflow-hidden" style="background:${ctx.S.card};border:1px solid ${ctx.S.border};border-radius:${R.card}">${img(ctx, 80 + i, 700, 440, "h-44 w-full object-cover")}<div class="p-5"><span class="inline-block px-2 py-0.5 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(cs.tag)}</span><h3 class="mt-3 font-semibold" style="color:${ctx.p.ink}">${esc(cs.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(cs.desc)}</p></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderTeam(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("team", 3);
  const st = ctx.st("team");
  if (v === 1) {
    // 竖版人像卡（图上文下、hover 上浮）
    const cards = ext.team
      .map(
        (m, i) => `<div class="leo-card overflow-hidden transition hover:-translate-y-1" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}">${img(ctx, 100 + i, 480, 560, "aspect-[6/7] w-full object-cover")}<div class="p-4 text-center"><h3 class="font-semibold" style="color:${ctx.p.ink}">${esc(m.name)}</h3><p class="mt-0.5 text-sm" style="color:${p.primary}">${esc(m.role)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">${cards}</div></div></section>`;
  }
  if (v === 2) {
    // 横排名片（左圆头像右文，双列）
    const blurb = ctx.lang === "en"
      ? `Years of hands-on ${ctx.meta.subLabel} experience.`
      : `深耕${esc(ctx.meta.subLabel)}多年，实战经验丰富。`;
    const rows = ext.team
      .map(
        (m, i) => `<div class="flex items-center gap-4 p-5" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="shrink-0" style="width:4.5rem;height:4.5rem">${img(ctx, 100 + i, 300, 300, "h-full w-full object-cover", "border-radius:9999px")}</div><div><h3 class="font-semibold" style="color:${ctx.p.ink}">${esc(m.name)}</h3><p class="text-sm" style="color:${p.primary}">${esc(m.role)}</p><p class="mt-1 text-xs" style="color:${p.sub}">${blurb}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-2 gap-5">${rows}</div></div></section>`;
  }
  const cards = ext.team
    .map(
      (m, i) => `<div class="text-center"><div class="relative mx-auto" style="width:11rem;height:11rem">${img(ctx, 100 + i, 400, 400, "h-full w-full object-cover", `border-radius:${R.img}`)}</div><h3 class="mt-4 font-semibold" style="color:${ctx.p.ink}">${esc(m.name)}</h3><p class="text-sm" style="color:${p.primary}">${esc(m.role)}</p></div>`,
    )
    .join("");
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8">${cards}</div></div></section>`;
}

function renderPricing(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("pricing", 3);
  // 高亮卡原本用 p.ink 当底 + 白字——深色配色时 p.ink 近白，会白底白字。
  const featuredCardBg = ctx.dna.forceDark ? p.primaryDark : p.ink;
  if (v === 1) {
    // 横排价目行（表格感）
    const rows = ext.pricing
      .map(
        (pl) => `<div class="flex flex-col sm:flex-row sm:items-center gap-4 p-6 ${pl.featured ? "text-white" : ""}" style="${pl.featured ? `background:linear-gradient(120deg,${p.gradFrom},${p.gradTo})` : `background:${S.card}`};border:1px solid ${S.border};border-radius:${R.card}"><div class="sm:w-40"><h3 class="font-bold text-lg">${esc(pl.name)}</h3>${pl.featured ? `<span class="inline-block mt-1 px-2 py-0.5 text-xs bg-white/20" style="border-radius:${R.pill}">${ctx.u("recommended")}</span>` : ""}</div><div class="flex-1 flex flex-wrap gap-x-5 gap-y-1 text-sm ${pl.featured ? "text-white/85" : ""}" style="${pl.featured ? "" : `color:${p.sub}`}">${pl.features.map((f) => `<span>· ${esc(f)}</span>`).join("")}</div><div class="sm:text-right"><div class="text-2xl font-extrabold" style="${pl.featured ? "" : `color:${p.primary}`}">${esc(pl.price)}<span class="text-xs font-normal opacity-75">${esc(pl.unit)}</span></div><a href="#" data-go="contact" class="mt-2 inline-block px-5 py-2 text-sm font-semibold" style="${pl.featured ? `background:#fff;color:${p.primaryDark}` : `background:${p.soft};color:${p.primary}`};border-radius:${R.btn}">${ctx.u("consultNow")}</a></div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, ctx.u("secPricing"), ctx.u("secPricingSub"))}<div class="mt-12 space-y-4">${rows}</div></div></section>`;
  }
  if (v === 2) {
    // 简洁双卡对比（首卡浅底、次卡描边）
    const two = ext.pricing.slice(0, 2);
    const cards2 = two
      .map(
        (pl, i) => `<div class="p-8 flex flex-col" style="${i === 0 ? `background:${p.soft};border:1px solid ${S.border}` : `background:${S.card};border:2px solid ${p.primary}`};border-radius:${R.card}"><h3 class="font-bold text-lg" style="color:${ctx.p.ink}">${esc(pl.name)}</h3><div class="mt-3"><span class="text-4xl font-extrabold" style="color:${p.primary}">${esc(pl.price)}</span><span class="text-sm" style="color:${p.sub}">${esc(pl.unit)}</span></div><ul class="mt-6 space-y-3 flex-1">${pl.features.map((f) => `<li class="flex items-center gap-2 text-sm" style="color:${ctx.p.sub}">${svgIcon("M20 6L9 17l-5-5", p.primary, 18)}${esc(f)}</li>`).join("")}</ul><a href="#" data-go="contact" class="mt-8 text-center px-5 py-3 font-semibold text-white" style="background:${p.primary};border-radius:${R.btn}">${ctx.u("consultNow")}</a></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, ctx.u("secPricing"), ctx.u("secPricingSub"))}<div class="mt-12 grid md:grid-cols-2 gap-6">${cards2}</div></div></section>`;
  }
  const cards = ext.pricing
    .map((pl) => {
      const feats = pl.features.map((f) => `<li class="flex items-center gap-2 text-sm" style="color:${pl.featured ? "#fff" : ctx.p.sub}">${svgIcon("M20 6L9 17l-5-5", pl.featured ? "#fff" : p.primary, 18)}${esc(f)}</li>`).join("");
      const featured = pl.featured;
      return `<div class="p-7 flex flex-col" style="${featured ? `background:${featuredCardBg};color:#fff;transform:scale(1.03)` : `background:${S.card};color:` + ctx.p.ink};border:1px solid ${featured ? "transparent" : S.border};border-radius:${R.card};box-shadow:0 10px 30px #0000000f">
        <h3 class="font-bold text-lg">${esc(pl.name)}</h3>
        <div class="mt-3"><span class="text-3xl font-extrabold" style="color:${featured ? "#fff" : p.primary}">${esc(pl.price)}</span><span class="text-sm opacity-70">${esc(pl.unit)}</span></div>
        <ul class="mt-6 space-y-3 flex-1">${feats}</ul>
        <a href="#" data-go="contact" class="mt-6 text-center px-5 py-2.5 font-semibold" style="${featured ? `background:${p.primary};color:#fff` : `background:${p.soft};color:${p.primary}`};border-radius:${R.btn}">${ctx.u("consultNow")}</a>
      </div>`;
    })
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, ctx.u("secPricing"), ctx.u("secPricingSub"))}<div class="mt-12 grid md:grid-cols-3 gap-6 items-center">${cards}</div></div></section>`;
}

function renderProcess(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("process", 3);
  const st = ctx.st("process");
  if (v === 1) {
    // 箭头连贯卡片
    const steps = ext.process
      .map(
        (s, i) => `<div class="relative flex-1 p-6" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="flex h-10 w-10 items-center justify-center font-bold text-white" style="background:${p.primary};border-radius:${R.btn}">${i + 1}</div><h3 class="mt-4 font-semibold" style="color:${ctx.p.ink}">${esc(s.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(s.desc)}</p>${i < ext.process.length - 1 ? `<div class="hidden lg:flex absolute top-1/2 -right-5 z-10 h-8 w-8 items-center justify-center" style="color:${p.primary}">${svgIcon("M5 12h14M13 6l6 6-6 6", p.primary, 22)}</div>` : ""}</div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 flex flex-col lg:flex-row gap-6">${steps}</div></div></section>`;
  }
  if (v === 2) {
    // 左右交错列表（zigzag）
    const rows = ext.process
      .map(
        (s, i) => `<div class="grid md:grid-cols-2 gap-6 items-center ${i % 2 ? "md:text-right" : ""}"><div class="${i % 2 ? "md:order-2 md:text-left" : ""}"><div class="text-5xl font-extrabold" style="color:${p.primary};opacity:.18">${esc(s.step)}</div></div><div class="${i % 2 ? "md:order-1" : ""}"><h3 class="font-semibold text-lg" style="color:${ctx.p.ink}">${esc(s.title)}</h3><p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(s.desc)}</p></div></div>`,
      )
      .join(`<div class="my-6" style="height:1px;background:${S.border}"></div>`);
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12">${rows}</div></div></section>`;
  }
  const steps = ext.process
    .map(
      (s) => `<div class="relative"><div class="text-4xl font-extrabold" style="color:${p.primary};opacity:.25">${esc(s.step)}</div><h3 class="mt-2 font-semibold" style="color:${ctx.p.ink}">${esc(s.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div>`,
    )
    .join("");
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">${steps}</div></div></section>`;
}

function renderTestimonials(ctx: Ctx): string {
  const { c, p, R, S } = ctx;
  const v = ctx.variantOf("testimonials", 3);
  if (v === 1) {
    // 大引号单条焦点 + 侧边其余
    const [first, ...rest] = c.testimonials;
    const side = rest
      .map(
        (t) => `<div class="p-5" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><p class="text-sm leading-relaxed" style="color:${p.sub}">“${esc(t.text)}”</p><div class="mt-3 text-xs font-semibold" style="color:${ctx.p.ink}">${esc(t.name)} · <span style="color:${p.sub};font-weight:400">${esc(t.role)}</span></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.testimonialsTitle, undefined, "left")}<div class="mt-10 grid md:grid-cols-2 gap-8 items-start"><div class="p-8 text-white leo-grad-anim" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});border-radius:${R.card}"><div style="font-size:4rem;line-height:1;opacity:.35;font-weight:800">“</div><p class="text-lg leading-relaxed">${esc(first?.text ?? "")}</p><div class="mt-6 flex items-center gap-3"><div class="h-11 w-11 flex items-center justify-center bg-white font-bold" style="color:${p.primary};border-radius:9999px">${esc((first?.name ?? "客").slice(0, 1))}</div><div><div class="font-semibold">${esc(first?.name ?? "")}</div><div class="text-xs text-white/75">${esc(first?.role ?? "")}</div></div></div></div><div class="space-y-4">${side}</div></div></div></section>`;
  }
  if (v === 2) {
    // 简洁分栏（无卡片、竖线分隔）
    const cols = c.testimonials
      .map(
        (t, i) => `<div class="px-6 ${i > 0 ? "md:border-l" : ""}" style="border-color:${S.border}"><div class="text-lg" style="color:${p.primary}">★★★★★</div><p class="mt-3 text-sm leading-relaxed" style="color:${ctx.p.ink}">“${esc(t.text)}”</p><div class="mt-4 text-xs font-semibold" style="color:${p.sub}">${esc(t.name)} · ${esc(t.role)}</div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.testimonialsTitle)}<div class="mt-12 grid md:grid-cols-3 gap-y-8">${cols}</div></div></section>`;
  }
  const cards = c.testimonials
    .map(
      (t) => `<div class="p-6" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="flex gap-1 mb-3" style="color:${p.primary}">★★★★★</div><p class="text-sm leading-relaxed" style="color:${p.sub}">“${esc(t.text)}”</p><div class="mt-4 flex items-center gap-3"><div class="h-10 w-10 flex items-center justify-center text-white font-semibold" style="background:${p.primary};border-radius:9999px">${esc(t.name.slice(0, 1))}</div><div><div class="text-sm font-semibold" style="color:${ctx.p.ink}">${esc(t.name)}</div><div class="text-xs" style="color:${p.sub};opacity:.8">${esc(t.role)}</div></div></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.testimonialsTitle)}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderFaq(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("faq", 3);
  const rows = ext.faq
    .map(
      (f) => `<details class="group p-5" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><summary class="flex items-center justify-between cursor-pointer font-semibold list-none" style="color:${ctx.p.ink}">${esc(f.q)}<span style="color:${p.primary}">＋</span></summary><p class="mt-3 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.a)}</p></details>`,
    )
    .join("");
  if (v === 1) {
    // 左标题右列表
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-10"><div>${heading(ctx, ctx.u("secFaq"), ctx.u("secFaqSub"), "left")}<p class="mt-6 text-sm" style="color:${p.sub}">${ctx.u("faqMore")}<a href="#" data-go="contact" style="color:${p.primary};font-weight:600">${ctx.u("contactUs")} →</a></p></div><div class="md:col-span-2 space-y-3">${rows}</div></div></section>`;
  }
  if (v === 2) {
    // 双列问答平铺（非折叠）
    const cells = ext.faq
      .map(
        (f, i) => `<div class="p-6" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="flex items-start gap-3"><span class="shrink-0 flex h-7 w-7 items-center justify-center text-xs font-bold text-white" style="background:${p.primary};border-radius:9999px">Q${i + 1}</span><h3 class="font-semibold" style="color:${ctx.p.ink}">${esc(f.q)}</h3></div><p class="mt-3 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.a)}</p></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, ctx.u("secFaq"), ctx.u("secFaqSub"))}<div class="mt-10 grid md:grid-cols-2 gap-5">${cells}</div></div></section>`;
  }
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-3xl mx-auto px-6">${heading(ctx, ctx.u("secFaq"), ctx.u("secFaqSub"))}<div class="mt-10 space-y-3">${rows}</div></div></section>`;
}

function renderLogos(ctx: Ctx): string {
  const { ext, p } = ctx;
  const item = (l: string) => `<div class="shrink-0 px-8 text-center text-lg font-bold tracking-wide" style="color:${p.sub};opacity:.55">${esc(l)}</div>`;
  const row = ext.logos.map(item).join("");
  return `<section class="border-y overflow-hidden" style="background:${ctx.S.page};border-color:${ctx.S.border}"><div class="max-w-6xl mx-auto px-6 py-8"><p class="text-center text-xs mb-5" style="color:${p.sub};opacity:.7">${ctx.u("trustedBy")}</p><div class="relative"><div class="leo-marquee gap-0">${row}${row}</div></div></div></section>`;
}

function renderNews(ctx: Ctx): string {
  const { ext, p, R, S } = ctx;
  const v = ctx.variantOf("news", 3);
  const st = ctx.st("news");
  if (v === 1) {
    // 列表式（左日期块右文，无图）
    const rows = ext.news
      .map(
        (n) => `<div class="flex gap-5 p-5 transition hover:-translate-y-0.5" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}"><div class="shrink-0 w-16 text-center"><div class="text-2xl font-extrabold" style="color:${p.primary}">${esc(n.date.split("-").pop() ?? "")}</div><div class="text-xs" style="color:${p.sub}">${esc(n.date.split("-").slice(0, 2).join("-"))}</div></div><div class="min-w-0"><div class="text-xs font-medium" style="color:${p.primary}">${esc(n.cat)}</div><h3 class="mt-1 font-semibold leading-snug" style="color:${ctx.p.ink}">${esc(n.title)}</h3><p class="mt-1 text-sm truncate" style="color:${p.sub}">${esc(n.excerpt)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-10 space-y-4">${rows}</div></div></section>`;
  }
  if (v === 2) {
    // 首条头条大卡 + 右侧列表
    const [first, ...rest] = ext.news;
    const side = rest
      .map(
        (n, i) => `<div class="flex gap-4 items-start ${i > 0 ? "pt-4 mt-4" : ""}" style="${i > 0 ? `border-top:1px solid ${S.border}` : ""}"><div class="shrink-0 w-24 h-16 overflow-hidden" style="border-radius:${R.btn}">${img(ctx, 121 + i, 300, 200, "h-full w-full object-cover")}</div><div class="min-w-0"><div class="text-xs" style="color:${p.primary}">${esc(n.cat)} · <span style="color:${p.sub}">${esc(n.date)}</span></div><h3 class="mt-1 text-sm font-semibold leading-snug" style="color:${ctx.p.ink}">${esc(n.title)}</h3></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-2 gap-8"><div class="overflow-hidden" style="background:${S.card};border-radius:${R.card};border:1px solid ${S.border}">${img(ctx, 120, 900, 540, "h-56 w-full object-cover")}<div class="p-6"><div class="text-xs" style="color:${p.primary}">${esc(first?.cat ?? "")} · <span style="color:${p.sub}">${esc(first?.date ?? "")}</span></div><h3 class="mt-2 text-lg font-bold leading-snug" style="color:${ctx.p.ink}">${esc(first?.title ?? "")}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(first?.excerpt ?? "")}</p></div></div><div class="p-6" style="background:${S.card};border-radius:${R.card};border:1px solid ${S.border}">${side}</div></div></div></section>`;
  }
  const cards = ext.news
    .map(
      (n, i) => `<div class="leo-card overflow-hidden" style="background:${S.card};border:1px solid ${S.border};border-radius:${R.card}">${img(ctx, 120 + i, 700, 420, "h-40 w-full object-cover")}<div class="p-5"><div class="flex items-center gap-2 text-xs" style="color:${p.primary}"><span class="font-medium">${esc(n.cat)}</span><span style="color:${p.sub};opacity:.6">${esc(n.date)}</span></div><h3 class="mt-2 font-semibold leading-snug" style="color:${ctx.p.ink}">${esc(n.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(n.excerpt)}</p></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, st.title, st.sub)}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderCta(ctx: Ctx): string {
  const { c, p, R, fx, dna } = ctx;
  const v = ctx.variantOf("cta", 3);
  const deco = decorLayer(p, fx, dna.styleSeed + 7);
  if (v === 1) {
    // 全宽深底横幅：左文右按钮
    return `<section class="relative overflow-hidden text-white leo-grad-anim" style="background:linear-gradient(120deg,${p.gradFrom},${p.gradTo})">${deco}<div class="relative max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-center gap-8"><div class="flex-1"><h2 style="font-size:${ctx.D.h2};font-weight:800">${esc(c.ctaTitle)}</h2><p class="mt-3 text-white/85">${esc(c.ctaSubtitle)}</p></div><div class="shrink-0 flex flex-wrap gap-4"><a href="tel:${esc(c.contactPhone)}" class="leo-btn-shine inline-block bg-white px-8 py-3.5 font-semibold" style="color:${p.primaryDark};border-radius:${R.btn}">${esc(c.ctaButton)}</a><a href="#" data-go="contact" class="inline-block px-8 py-3.5 font-semibold text-white" style="border:2px solid #ffffff66;border-radius:${R.btn}">${ctx.u("onlineConsult")}</a></div></div></section>`;
  }
  if (v === 2) {
    // 白底极简：细边框卡 + 电话大字
    return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6"><div class="text-center px-8 py-12" style="border:2px solid ${p.primary}22;border-radius:${R.card}"><span class="inline-block px-3 py-1 text-xs font-semibold" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${ctx.u("actNow")}</span><h2 class="mt-4" style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink}">${esc(c.ctaTitle)}</h2><p class="mt-3" style="color:${p.sub}">${esc(c.ctaSubtitle)}</p><a href="tel:${esc(c.contactPhone)}" class="mt-6 inline-block text-3xl font-extrabold" style="color:${p.primary}">${esc(c.contactPhone)}</a><div class="mt-6">${btnPrimary(ctx, c.ctaButton)}</div></div></div></section>`;
  }
  return `<section style="${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6"><div class="relative overflow-hidden text-center text-white px-8 py-14 leo-grad-anim" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});border-radius:${R.card}">${deco}<div class="relative"><h2 style="font-size:${ctx.D.h2};font-weight:800">${esc(c.ctaTitle)}</h2><p class="mt-3 text-white/85">${esc(c.ctaSubtitle)}</p><a href="tel:${esc(c.contactPhone)}" class="leo-btn-shine mt-8 inline-block bg-white px-8 py-3 font-semibold transition hover:scale-[1.02]" style="color:${p.primaryDark};border-radius:${R.btn}">${esc(c.ctaButton)} · ${esc(c.contactPhone)}</a></div></div></div></section>`;
}

function renderContact(ctx: Ctx): string {
  const { c, p, R, S } = ctx;
  const inputStyle = `background:${S.inputBg};color:${p.ink};border:1px solid ${S.inputBorder};border-radius:${R.btn};outline:none`;
  const field = (label: string, type = "text") => `<div><label class="block text-sm mb-1" style="color:${ctx.p.ink}">${esc(label)}</label><input type="${type}" class="w-full px-4 py-2.5 text-sm" style="${inputStyle}"/></div>`;
  return `<section style="background:${S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12">
    <div>${heading(ctx, ctx.u("contactUs"), ctx.u("contactLead"), "left")}
      <div class="mt-8 space-y-4 text-sm">
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M5 4h4l2 5-3 2a14 14 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 6a2 2 0 012-2z", p.primary, 20)}${ctx.u("phone")}：${esc(c.contactPhone)}</div>
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M3 5h18v14H3zM3 7l9 6 9-6", p.primary, 20)}${ctx.u("email")}：${esc(c.contactEmail)}</div>
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M12 21s-7-6-7-11a7 7 0 1114 0c0 5-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z", p.primary, 20)}${ctx.u("address")}：${esc(c.contactAddress)}</div>
      </div>
    </div>
    <div class="p-6" style="background:${p.soft};border:1px solid ${S.border};border-radius:${R.card}">
      <div class="grid sm:grid-cols-2 gap-4">${field(ctx.u("yourName"))}${field(ctx.u("yourPhone"), "tel")}</div>
      <div class="mt-4">${field(ctx.u("yourEmail"), "email")}</div>
      <div class="mt-4"><label class="block text-sm mb-1" style="color:${ctx.p.ink}">${ctx.u("yourNeed")}</label><textarea rows="4" class="w-full px-4 py-2.5 text-sm" style="${inputStyle}"></textarea></div>
      <button class="mt-5 w-full px-6 py-3 font-semibold text-white" style="background:${p.primary};border-radius:${R.btn}">${ctx.u("submit")}</button>
    </div>
  </div></section>`;
}

function renderPageHeader(ctx: Ctx, label: string): string {
  const { p, fx, dna } = ctx;
  const v = ctx.variantOf("pageHeader", 3);
  const deco = decorLayer(p, fx, dna.styleSeed + 3);
  if (v === 1) {
    // 浅底 + 左侧粗竖条 + 面包屑
    return `<section style="background:${p.soft}"><div class="max-w-6xl mx-auto px-6 py-14"><div class="flex items-center gap-4"><span style="width:6px;height:3.2rem;background:${p.primary};border-radius:3px"></span><div><p class="text-xs mb-1" style="color:${p.sub}">${esc(ctx.c.brand)} / ${esc(label)}</p><h1 style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink}">${esc(label)}</h1></div></div></div></section>`;
  }
  if (v === 2) {
    // 白底居中 + 下划短线
    return `<section class="border-b" style="background:${ctx.S.page};border-color:${ctx.S.border}"><div class="max-w-6xl mx-auto px-6 py-14 text-center"><h1 style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink}">${esc(label)}</h1><div class="mx-auto mt-4" style="width:56px;height:4px;background:${p.primary};border-radius:2px"></div><p class="mt-3 text-sm" style="color:${p.sub}">${esc(ctx.c.brand)} · ${esc(label)}</p></div></section>`;
  }
  return `<section class="relative overflow-hidden text-white leo-grad-anim" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})">${deco}<div class="relative max-w-6xl mx-auto px-6 py-16"><h1 style="font-size:${ctx.D.h2};font-weight:800">${esc(label)}</h1><p class="mt-2 text-white/80 text-sm">${esc(ctx.c.brand)} · ${esc(label)}</p></div></section>`;
}

// ————————————————————————————————————————————————————————————
// v2.2 新章节：chart（内联 SVG 数据图表）/ timeline（里程碑）/ marquee（徽标带）
// ————————————————————————————————————————————————————————————

/** 从 slug+salt 派生一组确定性「业务数据」（幅度合理、递增趋势为主）。 */
function chartData(ctx: Ctx): { labels: string[]; values: number[]; unit: string; title: string; insight: string } {
  const en = ctx.lang === "en";
  const h = hashStr(ctx.meta.slug + ":chartdata");
  const year = 2023;
  const kindPick = h % 3;
  const labels = Array.from({ length: 4 }, (_, i) => (en ? `${year + i}` : `${year + i}年`));
  const base = 40 + (h % 50);
  const values = labels.map((_, i) => {
    const wobble = (hashStr(ctx.meta.slug + ":cv" + i) % 18) - 4;
    return Math.max(8, Math.round(base * (1 + 0.32 * i) + wobble));
  });
  const units = en ? ["K USD", "orders", "clients", "visits"] : ["万元", "单", "家", "人次"];
  const titles = en
    ? ["Steady business growth", "Rising delivery volume", "Expanding client base", "Record service visits"]
    : ["业务规模持续增长", "服务交付量逐年攀升", "合作客户稳步扩大", "服务人次连年新高"];
  const unit = units[kindPick % units.length];
  const growth = Math.round(((values[3] - values[0]) / values[0]) * 100);
  const sName = subName(ctx);
  return {
    labels,
    values,
    unit,
    title: titles[h % titles.length],
    insight: en
      ? `Around ${growth}% cumulative growth over four years — the ${sName.toLowerCase()} sector stays strong.`
      : `近四年${unit === "万元" ? "营收" : "业务量"}累计增长约 ${growth}%，${esc(ctx.meta.subLabel)}赛道保持强劲势头。`,
  };
}

function renderChart(ctx: Ctx): string {
  const { p, R } = ctx;
  const v = ctx.variantOf("chart", 3);
  const d = chartData(ctx);
  const W = 640, H = 320, PADX = 56, PADY = 42;
  const vmax = Math.max(...d.values) * 1.15;
  let svg = "";
  if (v === 0) {
    // 柱状
    const n = d.values.length;
    const bw = (W - PADX * 2) / (n * 1.8);
    const gap = (W - PADX * 2 - n * bw) / (n + 1);
    const bars = d.values.map((val, i) => {
      const x = PADX + gap + i * (bw + gap);
      const bh = ((H - PADY * 2) * val) / vmax;
      const y = H - PADY - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="6" fill="${i === n - 1 ? p.primary : p.gradTo}" opacity="${i === n - 1 ? 1 : 0.55}"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="${p.ink}">${d.values[i]}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="${H - PADY + 24}" text-anchor="middle" font-size="13" fill="${p.sub}">${d.labels[i]}</text>`;
    }).join("");
    svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto"><line x1="${PADX}" y1="${H - PADY}" x2="${W - PADX}" y2="${H - PADY}" stroke="${ctx.S.borderStrong}" stroke-width="1.5"/>${bars}</svg>`;
  } else if (v === 1) {
    // 折线 + 渐变面积
    const n = d.values.length;
    const step = (W - PADX * 2) / (n - 1);
    const pts = d.values.map((val, i) => [PADX + i * step, H - PADY - ((H - PADY * 2) * val) / vmax] as const);
    const line = pts.map((pt) => pt.join(",")).join(" ");
    const area = `${PADX},${H - PADY} ${line} ${W - PADX},${H - PADY}`;
    const dots = pts.map((pt, i) => `<circle cx="${pt[0]}" cy="${pt[1]}" r="6" fill="#fff" stroke="${p.primary}" stroke-width="3"/>
      <text x="${pt[0]}" y="${pt[1] - 14}" text-anchor="middle" font-size="15" font-weight="700" fill="${p.ink}">${d.values[i]}</text>
      <text x="${pt[0]}" y="${H - PADY + 24}" text-anchor="middle" font-size="13" fill="${p.sub}">${d.labels[i]}</text>`).join("");
    svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto"><defs><linearGradient id="lg-${hashStr(ctx.meta.slug) % 9999}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.primary}" stop-opacity=".28"/><stop offset="1" stop-color="${p.primary}" stop-opacity="0"/></linearGradient></defs><line x1="${PADX}" y1="${H - PADY}" x2="${W - PADX}" y2="${H - PADY}" stroke="${ctx.S.borderStrong}" stroke-width="1.5"/><polygon points="${area}" fill="url(#lg-${hashStr(ctx.meta.slug) % 9999})"/><polyline points="${line}" fill="none" stroke="${p.primary}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
  } else {
    // 环形占比
    const total = d.values.reduce((a, b) => a + b, 0);
    const cx = 160, cy = 160, r = 108, sw = 46;
    const cols = [p.primary, p.gradTo, p.gradFrom, "#94a3b8"];
    let a0 = -90;
    const arcs = d.values.map((val, i) => {
      const sweep = (360 * val) / total;
      const a1 = a0 + sweep;
      const large = sweep > 180 ? 1 : 0;
      const x1 = cx + r * Math.cos((a0 * Math.PI) / 180), y1 = cy + r * Math.sin((a0 * Math.PI) / 180);
      const x2 = cx + r * Math.cos(((a1 - 2) * Math.PI) / 180), y2 = cy + r * Math.sin(((a1 - 2) * Math.PI) / 180);
      a0 = a1;
      return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${cols[i % 4]}" stroke-width="${sw}"/>`;
    }).join("");
    const legend = d.labels.map((lb, i) => `<g transform="translate(340,${86 + i * 44})"><rect width="16" height="16" rx="4" fill="${cols[i % 4]}"/><text x="26" y="13" font-size="14" fill="${p.ink}">${lb} · ${Math.round((d.values[i] / total) * 100)}%</text></g>`).join("");
    svg = `<svg viewBox="0 0 ${W} 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">${arcs}<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="22" font-weight="800" fill="${p.ink}">${total}${d.unit}</text>${legend}</svg>`;
  }
  return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, d.title, `${ctx.u("chartUnit")}：${d.unit} · ${ctx.u("chartNote")}`)}<div class="mt-10 grid md:grid-cols-3 gap-10 items-center"><div class="md:col-span-2 p-6" style="background:${p.soft};border:1px solid ${ctx.S.border};border-radius:${R.card}">${svg}</div><div><div style="width:40px;height:4px;background:${p.primary};border-radius:2px"></div><p class="mt-4 leading-relaxed" style="color:${p.ink};font-weight:600">${d.insight}</p><p class="mt-3 text-sm leading-relaxed" style="color:${p.sub}">${ctx.u("chartFootnote")}</p></div></div></div></section>`;
}

function renderTimeline(ctx: Ctx): string {
  const { p, R, ext } = ctx;
  const en = ctx.lang === "en";
  const v = ctx.variantOf("timeline", 2);
  const year = 2020 + (hashStr(ctx.meta.slug + ":tl") % 3);
  const pool = en
    ? [
        ["Founded", "Team formed; first benchmark project delivered."],
        ["System Built", "Standardized processes; industry certifications earned."],
        ["Scaling Up", "Network across the region; over a thousand clients."],
        ["Going Digital", "Launched a digital platform; faster experience."],
        ["Nationwide", "Cross-region expansion; building an ecosystem with partners."],
      ]
    : [
        ["品牌创立", "团队组建，深耕行业首个标杆项目落地。"],
        ["体系成型", "服务流程标准化，通过行业资质认证。"],
        ["规模扩张", "服务网络覆盖全省，客户数突破千家。"],
        ["数字升级", "上线数字化服务平台，体验全面提速。"],
        ["迈向全国", "跨区域布局，携手伙伴共建行业生态。"],
      ];
  const steps = (ext.process.length >= 4
    ? ext.process.slice(0, 5).map((s, i) => [`${year + i}`, s.title, s.desc] as const)
    : pool.map((s, i) => [`${year + i}`, s[0], s[1]] as const));
  if (v === 0) {
    // 垂直时间线
    const rows = steps.map(([yr, t, dd], i) => `
      <div class="relative pl-12 pb-10 leo-reveal leo-from-left" style="transition-delay:${i * 0.06}s">
        <span class="absolute left-0 top-1 flex h-8 w-8 items-center justify-center text-xs font-bold text-white" style="background:${i === steps.length - 1 ? p.primary : p.gradTo};border-radius:9999px">${i + 1}</span>
        ${i < steps.length - 1 ? `<span class="absolute left-4 top-9 bottom-0" style="width:2px;background:#0000001a"></span>` : ""}
        <div class="text-xs font-bold tracking-wider" style="color:${p.primary}">${esc(yr)}</div>
        <h3 class="mt-1 font-semibold text-lg" style="color:${p.ink}">${esc(t)}</h3>
        <p class="mt-1 text-sm leading-relaxed" style="color:${p.sub}">${esc(dd)}</p>
      </div>`).join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-3xl mx-auto px-6">${heading(ctx, ctx.u("secTimeline"), ctx.u("secTimelineSub"))}<div class="mt-12">${rows}</div></div></section>`;
  }
  // 水平里程碑（桌面横排、移动纵排）
  const cols = steps.map(([yr, t, dd], i) => `
    <div class="relative flex-1 min-w-[10rem] leo-reveal" style="transition-delay:${i * 0.06}s">
      <div class="hidden md:block absolute top-4 left-1/2 right-0 h-0.5" style="background:${i < steps.length - 1 ? "#0000001a" : "transparent"}"></div>
      <div class="relative mx-auto md:mx-0 flex h-9 w-9 items-center justify-center text-xs font-bold text-white" style="background:${p.primary};border-radius:9999px">${i + 1}</div>
      <div class="mt-4 text-xs font-bold tracking-wider" style="color:${p.primary}">${esc(yr)}</div>
      <h3 class="mt-1 font-semibold" style="color:${p.ink}">${esc(t)}</h3>
      <p class="mt-1 text-sm leading-relaxed" style="color:${p.sub}">${esc(dd)}</p>
    </div>`).join("");
  return `<section style="background:${ctx.S.page};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, ctx.u("secMilestone"), ctx.u("secMilestoneSub"))}<div class="mt-12 flex flex-col md:flex-row gap-8 text-center md:text-left" style="border-radius:${R.card}">${cols}</div></div></section>`;
}

function renderMarquee(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cols = [p.primary, p.gradTo, p.gradFrom];
  const cell = (l: string, i: number) => `<div class="shrink-0 mx-3 flex items-center gap-3 px-5 py-3" style="background:${ctx.S.card};border:1px solid ${ctx.S.border};border-radius:${R.card};box-shadow:0 4px 14px #00000008"><span class="flex h-9 w-9 items-center justify-center text-sm font-bold text-white" style="background:${cols[i % 3]};border-radius:${R.btn}">${esc(l.slice(0, 1))}</span><span class="text-sm font-semibold whitespace-nowrap" style="color:${p.ink}">${esc(l)}</span></div>`;
  const row = ext.logos.map(cell).join("");
  return `<section style="background:${p.soft}"><style>@keyframes leoMq{from{transform:translateX(0)}to{transform:translateX(-50%)}}.leo-mq-track{display:flex;width:max-content;animation:leoMq 26s linear infinite}.leo-mq-track:hover{animation-play-state:paused}</style><div class="py-12 overflow-hidden"><p class="text-center text-sm font-medium mb-6" style="color:${p.sub}">${ctx.u("chosenBy")} ${esc(ctx.c.brand)}</p><div class="leo-mq-track">${row}${row}</div></div></section>`;
}

function renderSection(ctx: Ctx, kind: SectionKind, pageLabel: string): string {
  const html = (() => {
  switch (kind) {
    case "hero": return renderHero(ctx);
    case "stats": return renderStats(ctx);
    case "about": return renderAbout(ctx);
    case "features": return renderFeatures(ctx);
    case "services": return renderServices(ctx);
    case "products": return renderProducts(ctx);
    case "menu": return renderMenu(ctx);
    case "gallery": return renderGallery(ctx);
    case "cases": return renderCases(ctx);
    case "team": return renderTeam(ctx);
    case "pricing": return renderPricing(ctx);
    case "process": return renderProcess(ctx);
    case "testimonials": return renderTestimonials(ctx);
    case "faq": return renderFaq(ctx);
    case "logos": return renderLogos(ctx);
    case "news": return renderNews(ctx);
    case "cta": return renderCta(ctx);
    case "contact": return renderContact(ctx);
    case "pageHeader": return renderPageHeader(ctx, pageLabel);
    case "chart": return renderChart(ctx);
    case "timeline": return renderTimeline(ctx);
    case "marquee": return renderMarquee(ctx);
    default:
      // v3 特色家族专属章节（sig*）走独立渲染模块。
      return renderSignatureSection(ctx, kind, pageLabel);
  }
  })();
  return wrapSectionReveal(html, kind);
}

// ————————————————————————————————————————————————————————————
// 整页文档：把每个 page 渲染成一个 <div data-page="...">，导航切显隐
// ————————————————————————————————————————————————————————————

export interface RenderResult {
  html: string;
  pages: { key: PageKey; label: string }[];
}

/** 构建某一语言的 Ctx（引擎为 zh / en 各构建一次）。 */
function makeCtx(
  meta: TemplateMeta,
  c: SiteContent,
  ext: ExtContent,
  dna: TemplateDNA,
  lang: Lang,
): Ctx {
  const p = dna.palette;
  const ctx: Ctx = {
    meta,
    c,
    ext,
    dna,
    p,
    fx: dna.accentFx,
    R: radiusTokens(dna),
    D: densityTokens(dna),
    S: surfaceTokens(dna),
    pageKey: "home",
    lang,
    variantOf: (kind, count) =>
      (hashStr(meta.slug + ":sec:" + kind + ":" + ctx.pageKey) + dna.styleSeed) % count,
    st: (kind) => secTitle(kind, meta.industryKey, lang),
    u: (key) => ui(key, lang),
  };
  return ctx;
}

/** 渲染某语言下的一整套 body（nav + 多页 main + footer）。 */
function renderBody(ctx: Ctx, dna: TemplateDNA): string {
  const layout: LayoutFamily = dna.layout;
  const pages = layout.pages;
  const navVariant = hashStr(ctx.meta.slug + ":nav") % 2;
  const pagesHtml = pages
    .map((pk, idx) => {
      const kinds = layout.sections[pk] ?? ["pageHeader", "cta"];
      const label = pickLang({ zh: PAGE_LABEL[pk], en: ui(pk as keyof typeof UI, "en") }, ctx.lang);
      ctx.pageKey = pk;
      const inner = kinds.map((k) => renderSection(ctx, k, label)).join("\n");
      return `<div data-page="${pk}"${idx === 0 ? "" : ' hidden style="display:none"'}>${inner}</div>`;
    })
    .join("\n");
  return `${navBar(ctx, pages, navVariant)}
<main>${pagesHtml}</main>
${footer(ctx, pages)}`;
}

/**
 * v3：双语渲染。把 zh 与 en 两套 body 都写进 HTML，页内「中/EN」开关切换
 * （works offline — 下载下来也能切）。defaultLang 决定首屏显示哪种语言。
 */
export function renderTemplate(
  meta: TemplateMeta,
  biContent: BiContent,
  biExt: BiExt,
  dna: TemplateDNA,
  defaultLang: Lang = "zh",
): RenderResult {
  const p = dna.palette;
  const layout: LayoutFamily = dna.layout;
  const pages = layout.pages;

  const ctxZh = makeCtx(meta, flattenContent(biContent, "zh"), flattenExt(biExt, "zh"), dna, "zh");
  const ctxEn = makeCtx(meta, flattenContent(biContent, "en"), flattenExt(biExt, "en"), dna, "en");
  const bodyZh = renderBody(ctxZh, dna);
  const bodyEn = renderBody(ctxEn, dna);

  const titleZh = `${esc(biContent.brand.zh)} · ${esc(meta.subLabel)}官网`;
  const titleEn = `${esc(biContent.brand.en)} · ${esc(subEn(meta.subKey, meta.industryKey))}`;
  const bodyBg = dna.forceDark ? p.soft : "#fff";

  const html = `<!DOCTYPE html>
<html lang="${defaultLang === "en" ? "en" : "zh-CN"}" data-lang="${defaultLang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${defaultLang === "en" ? titleEn : titleZh}</title>
<meta name="description" content="${esc(defaultLang === "en" ? biContent.heroSubtitle.en : biContent.heroSubtitle.zh)}"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  html{scroll-behavior:smooth}
  body{font-family:${FONT_STACK[dna.font]};color:${p.ink};background:${bodyBg}}
  h1,h2,h3{font-family:${FONT_STACK[dna.font]}}
  .nav-link{position:relative;color:inherit}
  .nav-link.active{color:${p.primary};font-weight:600}
  .nav-link.active::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:${p.primary}}
  [data-page]{animation:fade .35s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  /* 双语：默认显示 defaultLang，另一语言容器隐藏；开关切换 */
  [data-langroot]{display:none}
  [data-langroot].leo-lang-on{display:block}
  ${effectsStyles(p)}
</style>
</head>
<body>
<div data-langroot="zh"${defaultLang === "zh" ? ' class="leo-lang-on"' : ""}>${bodyZh}</div>
<div data-langroot="en"${defaultLang === "en" ? ' class="leo-lang-on"' : ""}>${bodyEn}</div>
<script>
(function(){
  ${effectsScript()}
  var curLang=${JSON.stringify(defaultLang)};
  function activeRoot(){return document.querySelector('[data-langroot].leo-lang-on')||document;}
  function show(page){
    var root=activeRoot();
    var pages=root.querySelectorAll('[data-page]');
    var found=false,active=null;
    pages.forEach(function(el){
      var on=el.getAttribute('data-page')===page;
      el.hidden=!on; el.style.display=on?'':'none';
      if(on){found=true;active=el;}
    });
    if(!found && pages[0]){pages[0].hidden=false;pages[0].style.display='';active=pages[0];}
    root.querySelectorAll('.nav-link').forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-go')===page);
    });
    var sc=document.scrollingElement||document.documentElement;sc.scrollTop=0;
    if(active) leoInitReveal(active);
  }
  function setLang(lang){
    curLang=lang;
    document.querySelectorAll('[data-langroot]').forEach(function(el){
      el.classList.toggle('leo-lang-on', el.getAttribute('data-langroot')===lang);
    });
    document.documentElement.setAttribute('lang', lang==='en'?'en':'zh-CN');
    document.documentElement.setAttribute('data-lang', lang);
    leoInitReveal(activeRoot());
  }
  leoInitReveal(document);
  window.addEventListener('message',function(ev){
    var d=ev&&ev.data;
    if(d&&d.__leoGo){show(d.__leoGo);}
    if(d&&d.__leoLang){setLang(d.__leoLang);}
  });
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('[data-lang-toggle],a[data-go],a[data-nav],a'):null;
    if(!t)return;
    if(t.hasAttribute('data-lang-toggle')){e.preventDefault();setLang(curLang==='en'?'zh':'en');return;}
    var go=t.getAttribute('data-go');
    var nav=t.getAttribute('data-nav');
    if(go){e.preventDefault();show(go);return;}
    if(nav){
      var href=t.getAttribute('href')||'';
      var key=href.replace('#','');
      if(key){e.preventDefault();show(key);return;}
    }
    var raw=t.getAttribute('href')||'';
    if(raw==='#'||raw.charAt(0)==='#'){e.preventDefault();}
  },true);
})();
</script>
</body>
</html>`;

  return { html, pages: pages.map((k) => ({ key: k, label: PAGE_LABEL[k] })) };
}

/**
 * 便捷入口：从 taxonomy meta 一步构建双语内容并渲染整页。route.ts / 其它调用点用它。
 */
export function renderTemplateBilingual(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  defaultLang: Lang = "zh",
  devOverride?: { fx?: AccentFx; heroV?: number },
): RenderResult {
  let dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
  // 仅供本地开发预览：覆盖装饰特效 / hero 变体，用于逐一 review v4 新特效与 hero 版式。
  // 生产不传 devOverride，行为完全不变。
  if (devOverride?.fx) dna = { ...dna, accentFx: devOverride.fx };
  if (typeof devOverride?.heroV === "number") _heroVOverride = devOverride.heroV;
  else _heroVOverride = null;
  const biContent = buildBiContent(meta, industry, sub);
  const biExt = buildBiExt(meta, meta.industryKey, meta.subLabel, meta.subKey);
  return renderTemplate(meta, biContent, biExt, dna, defaultLang);
}
