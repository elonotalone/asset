// 模板渲染引擎 v2 —— 把 (TemplateMeta + SiteContent + ExtContent + DNA) 渲染成一个
// 自包含的【多页】HTML 文档。详情页 /templates/<slug> 把它塞进 iframe srcdoc 全屏
// 展示：顶部导航点击在 iframe 内切换页面（首页/关于/服务/案例/资讯/联系…），
// 零额外请求，即点即逛。
//
// 「真多样」来自 DNA（template-dna.ts）：布局家族决定有哪些页/每页哪些章节；每类
// 章节有多个样式变体由 styleSeed 选取；再叠加配色/圆角/密度/字体，所以每个模板的
// 版式 DNA 全维度不同，而不是 v1 那样「只换配色」。
//
// 章节结构蓝本取自 MIT 开源（HyperUI / Landwind / Meraki UI，可商用可改）。

import { TemplateMeta } from "./template-taxonomy";
import { SiteContent } from "./template-content";
import { ExtContent, buildExt } from "./template-content-ext";
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

// ————————————————————————————————————————————————————————————
// 渲染上下文（一次渲染共享）
// ————————————————————————————————————————————————————————————

interface Ctx {
  meta: TemplateMeta;
  c: SiteContent;
  ext: ExtContent;
  dna: TemplateDNA;
  p: PaletteV2;
  R: ReturnType<typeof radiusTokens>;
  D: ReturnType<typeof densityTokens>;
  /** 给定章节种类取它的样式变体序号。 */
  variantOf: (kind: SectionKind, count: number) => number;
}

function radiusTokens(dna: TemplateDNA) {
  return RADIUS_TOKENS[dna.radius];
}
function densityTokens(dna: TemplateDNA) {
  return DENSITY_TOKENS[dna.density];
}

// ————————————————————————————————————————————————————————————
// 工具
// ————————————————————————————————————————————————————————————

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 配图（确定性，按行业关键词 + seed）。loremflickr 走 Flickr CC 标签，License 友好。
export function photo(query: string, seed: number, w = 1200, h = 800): string {
  const tags = encodeURIComponent(query);
  return `https://loremflickr.com/${w}/${h}/${tags}?lock=${seed}`;
}
export function photoFallback(seed: number, w = 1200, h = 800): string {
  return `https://picsum.photos/seed/leo${seed}/${w}/${h}`;
}
function imgFallbackAttr(seed: number, w: number, h: number): string {
  const fb = photoFallback(seed, w, h);
  return ` onerror="if(this.dataset.fb){this.style.visibility='hidden'}else{this.dataset.fb=1;this.src='${fb}'}"`;
}
function img(ctx: Ctx, i: number, w: number, h: number, cls = "", extra = ""): string {
  const seed = ctx.dna.imgSeed + i * 13;
  return `<img src="${photo(ctx.meta.photo, seed, w, h)}"${imgFallbackAttr(seed, w, h)} alt="" loading="lazy" class="${cls}" style="${extra}"/>`;
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

function sectionPad(ctx: Ctx): string {
  return `padding-top:${ctx.D.section};padding-bottom:${ctx.D.section}`;
}
function heading(ctx: Ctx, title: string, sub?: string, align: "center" | "left" = "center"): string {
  const a = align === "center" ? "text-center mx-auto" : "text-left";
  return `
  <div class="max-w-2xl ${a}">
    <h2 style="font-size:${ctx.D.h2};color:${ctx.p.ink};font-weight:800;line-height:1.2">${esc(title)}</h2>
    ${sub ? `<p class="mt-3" style="color:${ctx.p.sub}">${esc(sub)}</p>` : ""}
  </div>`;
}
function btnPrimary(ctx: Ctx, label: string, href = "#contact"): string {
  return `<a href="${href}" data-nav class="inline-block px-7 py-3 font-semibold text-white transition hover:opacity-90" style="background:${ctx.p.primary};border-radius:${ctx.R.btn}">${esc(label)}</a>`;
}
function btnGhost(ctx: Ctx, label: string, href = "#about"): string {
  return `<a href="${href}" data-nav class="inline-block px-7 py-3 font-semibold transition hover:opacity-80" style="color:${ctx.p.primary};border:1.5px solid ${ctx.p.primary};border-radius:${ctx.R.btn}">${esc(label)}</a>`;
}
function svgIcon(path: string, color: string, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

// ————————————————————————————————————————————————————————————
// 顶部导航 + 页脚（每页共享，导航驱动 data-page 切换）
// ————————————————————————————————————————————————————————————

function navBar(ctx: Ctx, pages: PageKey[], variant: number): string {
  const { c, p, R } = ctx;
  const links = pages
    .map(
      (pk, i) =>
        `<a href="#" data-go="${pk}" class="nav-link px-1 py-2 text-sm transition hover:opacity-70 ${i === 0 ? "active" : ""}">${esc(PAGE_LABEL[pk])}</a>`,
    )
    .join("");
  const brand = `
    <div class="flex items-center gap-2 font-bold text-lg">
      <span class="inline-flex h-9 w-9 items-center justify-center text-white" style="background:${p.primary};border-radius:${R.btn}">${esc(c.brand.slice(0, 1))}</span>
      <span>${esc(c.brand)}</span>
    </div>`;
  const cta = `<a href="#" data-go="contact" class="hidden sm:inline-block px-5 py-2 text-sm font-semibold text-white" style="background:${p.primary};border-radius:${R.btn}">${esc(c.heroCta)}</a>`;

  // 两种导航样式：居中 logo / 左 logo 右菜单。
  if (variant % 2 === 1) {
    return `
  <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b" style="border-color:#0000000d">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      ${brand}
      <nav class="hidden md:flex items-center gap-7" style="color:${p.ink}">${links}</nav>
      ${cta}
    </div>
  </header>`;
  }
  return `
  <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b" style="border-color:#0000000d">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
      ${brand}
      <nav class="hidden md:flex items-center gap-6 ml-auto" style="color:${p.ink}">${links}</nav>
      ${cta}
    </div>
  </header>`;
}

function footer(ctx: Ctx, pages: PageKey[]): string {
  const { c, p } = ctx;
  const links = pages.map((pk) => `<a href="#" data-go="${pk}" class="block hover:text-white transition">${esc(PAGE_LABEL[pk])}</a>`).join("");
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
        <div class="text-white font-semibold mb-3">快速导航</div>
        <div class="space-y-2 text-sm">${links}</div>
      </div>
      <div>
        <div class="text-white font-semibold mb-3">联系我们</div>
        <div class="space-y-2 text-sm">
          <div>电话：${esc(c.contactPhone)}</div>
          <div>邮箱：${esc(c.contactEmail)}</div>
          <div>地址：${esc(c.contactAddress)}</div>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10 py-5 text-center text-xs">© ${new Date().getFullYear()} ${esc(c.brand)} · 由 OceanLeo 模板专区生成 · 仅供预览</div>
  </footer>`;
}

// ————————————————————————————————————————————————————————————
// 章节渲染器：每类章节多个样式变体
// ————————————————————————————————————————————————————————————

function renderHero(ctx: Ctx): string {
  const { c, p, R, D } = ctx;
  const v = ctx.variantOf("hero", 5);
  const badge = `<span class="inline-block px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(ctx.meta.subLabel)} · 专业方案</span>`;
  const title = `<h1 style="font-size:${D.h1};font-weight:800;line-height:1.12">${esc(c.heroTitle)}</h1>`;
  const subt = `<p class="mt-5 text-lg" style="opacity:.9">${esc(c.heroSubtitle)}</p>`;
  const ctas = `<div class="mt-8 flex flex-wrap gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div>`;

  if (v === 0) {
    // 渐变深底 · 左文右图
    return `
    <section class="relative overflow-hidden text-white" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})">
      <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center" style="${sectionPad(ctx)}">
        <div>${badge}<div class="mt-5">${title}</div>${subt}${ctas}</div>
        <div>${img(ctx, 0, 900, 700, "w-full object-cover shadow-2xl", `border-radius:${R.img};height:24rem`)}</div>
      </div>
    </section>`;
  }
  if (v === 1) {
    // 全屏大图 + 居中文案
    return `
    <section class="relative flex items-center justify-center text-center text-white" style="min-height:78vh">
      ${img(ctx, 0, 1600, 1000, "absolute inset-0 h-full w-full object-cover")}
      <div class="absolute inset-0" style="background:linear-gradient(135deg,${p.gradFrom}cc,${p.gradTo}99)"></div>
      <div class="relative max-w-3xl px-6">${badge}<div class="mt-5">${title}</div>${subt}<div class="mt-8 flex justify-center gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div></div>
    </section>`;
  }
  if (v === 2) {
    // 浅底居中 · 下方大图（极简）
    return `
    <section class="bg-white text-center" style="color:${p.ink}">
      <div class="max-w-4xl mx-auto px-6" style="${sectionPad(ctx)}">
        ${badge}<div class="mt-6">${title}</div>${`<p class="mt-6 text-lg max-w-2xl mx-auto" style="color:${p.sub}">${esc(c.heroSubtitle)}</p>`}
        <div class="mt-8 flex justify-center gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div>
        ${img(ctx, 0, 1200, 600, "mt-12 w-full object-cover shadow-xl", `border-radius:${R.img};height:26rem`)}
      </div>
    </section>`;
  }
  if (v === 3) {
    // 分栏色块 · 左色底文案，右满图
    return `
    <section class="grid md:grid-cols-2" style="min-height:72vh">
      <div class="flex items-center px-6 md:px-16 py-16" style="background:${p.soft};color:${p.ink}">
        <div><span class="inline-block px-3 py-1 text-xs font-medium text-white" style="background:${p.primary};border-radius:${R.pill}">${esc(ctx.meta.subLabel)}</span><div class="mt-5">${title}</div><p class="mt-5 text-lg" style="color:${p.sub}">${esc(c.heroSubtitle)}</p>${ctas}</div>
      </div>
      <div class="relative">${img(ctx, 0, 900, 1100, "absolute inset-0 h-full w-full object-cover")}</div>
    </section>`;
  }
  // v === 4：深底 · 居中文案 + 下方数据条预览
  return `
    <section class="text-white" style="background:linear-gradient(160deg,${p.gradFrom},${p.gradTo})">
      <div class="max-w-4xl mx-auto px-6 text-center" style="${sectionPad(ctx)}">
        ${badge}<div class="mt-6">${title}</div>${subt}
        <div class="mt-8 flex justify-center gap-4">${btnPrimary(ctx, c.heroCta)}${btnGhost(ctx, c.heroCtaAlt, "#services")}</div>
      </div>
    </section>`;
}

function renderStats(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const v = ctx.variantOf("stats", 2);
  const items = c.stats
    .map(
      (s) => `
      <div class="text-center">
        <div style="font-size:2.25rem;font-weight:800;color:${p.primary}">${esc(s.value)}</div>
        <div class="mt-1 text-sm" style="color:${p.sub}">${esc(s.label)}</div>
      </div>`,
    )
    .join("");
  if (v === 0) {
    return `<section class="bg-white"><div class="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">${items}</div></section>`;
  }
  return `<section style="background:${p.soft}"><div class="max-w-6xl mx-auto px-6 py-12"><div class="grid grid-cols-2 md:grid-cols-4 gap-6" style="background:#fff;border-radius:${R.card};padding:2rem;box-shadow:0 10px 30px #0000000d">${items}</div></div></section>`;
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
    return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-5 gap-10 items-start"><div class="md:col-span-2"><span class="inline-block px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(c.aboutTitle)}</span><h2 class="mt-4" style="font-size:${ctx.D.h2};font-weight:800;color:${p.ink}">${esc(c.heroTitle)}</h2></div><div class="md:col-span-3">${c.aboutBody.map((t) => `<p class="mb-4 leading-relaxed" style="color:${p.sub}">${esc(t)}</p>`).join("")}<ul class="mt-2 grid sm:grid-cols-2 gap-2">${checks}</ul></div></div></section>`;
  }
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">${v === 1 ? pic + text : text + pic}</div></section>`;
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
  const { c, p, R } = ctx;
  const v = ctx.variantOf("features", 4);
  const feats = c.features.slice(0, 6);
  const cards = feats
    .map((f, i) => {
      const icon = svgIcon(f.icon || FEATURE_ICONS[i % FEATURE_ICONS.length], p.primary, 24);
      if (v === 1) {
        // 左图标右文（行式）
        return `<div class="flex gap-4 p-5" style="background:#fff;border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="shrink-0 h-11 w-11 flex items-center justify-center" style="background:${p.soft};border-radius:${R.btn}">${icon}</div><div><h3 class="font-semibold" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(f.desc)}</p></div></div>`;
      }
      if (v === 2) {
        // 极简描边 · 顶部数字
        return `<div class="p-6" style="border:1px solid #0000000f;border-radius:${R.card}"><div class="text-3xl font-extrabold" style="color:${p.primary}">${String(i + 1).padStart(2, "0")}</div><h3 class="mt-3 font-semibold" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(f.desc)}</p></div>`;
      }
      if (v === 3) {
        // 深色卡片
        return `<div class="p-6 text-white" style="background:${p.ink};border-radius:${R.card}"><div class="h-11 w-11 flex items-center justify-center" style="background:${p.primary};border-radius:${R.btn}">${svgIcon(f.icon || FEATURE_ICONS[i % FEATURE_ICONS.length], "#fff", 22)}</div><h3 class="mt-4 font-semibold">${esc(f.title)}</h3><p class="mt-2 text-sm text-white/70">${esc(f.desc)}</p></div>`;
      }
      // v0 默认卡片
      return `<div class="p-6 transition hover:-translate-y-1" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="h-12 w-12 flex items-center justify-center" style="background:${p.soft};border-radius:${R.btn}">${icon}</div><h3 class="mt-4 font-semibold text-lg" style="color:${p.ink}">${esc(f.title)}</h3><p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.desc)}</p></div>`;
    })
    .join("");
  const bg = v === 3 ? "background:#fff" : `background:${p.soft}`;
  return `<section style="${bg};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.featuresTitle, c.featuresSubtitle)}<div class="mt-12 grid md:grid-cols-3 gap-6" style="gap:${ctx.D.gap}">${cards}</div></div></section>`;
}

function renderServices(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const v = ctx.variantOf("services", 4);
  const svc = c.services;
  if (v === 1) {
    // 图卡叠加文字
    const cards = svc
      .map(
        (s, i) => `<div class="group relative overflow-hidden" style="border-radius:${R.img}">${img(ctx, 20 + i, 600, 440, "h-56 w-full object-cover transition duration-500 group-hover:scale-105")}<div class="absolute inset-0" style="background:linear-gradient(to top,#000c,transparent)"></div><div class="absolute bottom-0 p-5 text-white"><h3 class="text-lg font-semibold">${esc(s.name)}</h3><p class="mt-1 text-sm text-white/80">${esc(s.desc)}</p></div></div>`,
      )
      .join("");
    return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
  }
  if (v === 2) {
    // 编号列表（无图）
    const rows = svc
      .map(
        (s, i) => `<div class="flex gap-5 py-6" style="border-bottom:1px solid #0000000d"><div class="text-2xl font-extrabold w-12 shrink-0" style="color:${p.primary}">${String(i + 1).padStart(2, "0")}</div><div><h3 class="font-semibold text-lg" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle, "left")}<div class="mt-8">${rows}</div></div></section>`;
  }
  if (v === 3) {
    // 图标卡 + 浅底
    const cards = svc
      .map(
        (s, i) => `<div class="p-6 text-center" style="background:#fff;border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="mx-auto h-14 w-14 flex items-center justify-center" style="background:${p.soft};border-radius:9999px">${svgIcon(FEATURE_ICONS[i % FEATURE_ICONS.length], p.primary, 26)}</div><h3 class="mt-4 font-semibold" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div>`,
      )
      .join("");
    return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
  }
  // v0 卡片 + 小图
  const cards = svc
    .map(
      (s, i) => `<div class="overflow-hidden" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card}">${img(ctx, 20 + i, 600, 360, "h-40 w-full object-cover")}<div class="p-5"><h3 class="font-semibold" style="color:${p.ink}">${esc(s.name)}</h3><p class="mt-1 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div></div>`,
    )
    .join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.servicesTitle, c.servicesSubtitle)}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
}

function renderProducts(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cards = ext.products
    .map(
      (pr, i) => `<div class="group overflow-hidden" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card}"><div class="relative">${img(ctx, 40 + i, 500, 500, "aspect-square w-full object-cover transition group-hover:scale-105")}<span class="absolute top-3 left-3 px-2 py-1 text-xs font-semibold text-white" style="background:${p.primary};border-radius:${R.pill}">${esc(pr.note)}</span></div><div class="p-4"><h3 class="font-medium truncate" style="color:${ctx.p.ink}">${esc(pr.name)}</h3><div class="mt-2 flex items-center justify-between"><span class="font-extrabold" style="color:${p.primary}">${esc(pr.price)}</span><button class="px-3 py-1.5 text-xs font-semibold text-white" style="background:${p.ink};border-radius:${R.btn}">加入购物车</button></div></div></div>`,
    )
    .join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "热门商品", "甄选好物，正品保障，下单即享会员价。")}<div class="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div></div></section>`;
}

function renderMenu(ctx: Ctx): string {
  const { ext, p } = ctx;
  const groups = ext.menu
    .map(
      (g) => `<div><h3 class="text-lg font-bold mb-4 inline-block pb-1" style="color:${p.ink};border-bottom:3px solid ${p.primary}">${esc(g.group)}</h3><div class="space-y-3">${g.items
        .map(
          (it) => `<div class="flex items-baseline gap-3"><span style="color:${ctx.p.ink};font-weight:500">${esc(it.name)}</span><span class="flex-1" style="border-bottom:1px dotted #00000022"></span><span style="color:${p.primary};font-weight:700">${esc(it.price)}</span></div>`,
        )
        .join("")}</div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6">${heading(ctx, "招牌菜单", "精选食材，匠心烹制，每一道都是地道好味道。")}<div class="mt-12 grid md:grid-cols-2 gap-12">${groups}</div></div></section>`;
}

function renderGallery(ctx: Ctx): string {
  const { R } = ctx;
  const cells = Array.from({ length: 6 }, (_, i) => `<div class="overflow-hidden" style="border-radius:${R.img}">${img(ctx, 60 + i, 700, 520, "aspect-[4/3] w-full object-cover transition hover:scale-105 duration-500")}</div>`).join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "作品 / 案例展示", "用作品说话，每一个项目都全力以赴。")}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${cells}</div></div></section>`;
}

function renderCases(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cards = ext.cases
    .map(
      (cs, i) => `<div class="overflow-hidden" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card}">${img(ctx, 80 + i, 700, 440, "h-44 w-full object-cover")}<div class="p-5"><span class="inline-block px-2 py-0.5 text-xs font-medium" style="background:${p.soft};color:${p.primary};border-radius:${R.pill}">${esc(cs.tag)}</span><h3 class="mt-3 font-semibold" style="color:${ctx.p.ink}">${esc(cs.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(cs.desc)}</p></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "成功案例", "服务过的代表性项目，见证我们的专业与诚意。")}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderTeam(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cards = ext.team
    .map(
      (m, i) => `<div class="text-center"><div class="relative mx-auto" style="width:11rem;height:11rem">${img(ctx, 100 + i, 400, 400, "h-full w-full object-cover", `border-radius:${R.img}`)}</div><h3 class="mt-4 font-semibold" style="color:${ctx.p.ink}">${esc(m.name)}</h3><p class="text-sm" style="color:${p.primary}">${esc(m.role)}</p></div>`,
    )
    .join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "核心团队", "一群专业、靠谱、对结果负责的人。")}<div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8">${cards}</div></div></section>`;
}

function renderPricing(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cards = ext.pricing
    .map((pl) => {
      const feats = pl.features.map((f) => `<li class="flex items-center gap-2 text-sm" style="color:${pl.featured ? "#fff" : ctx.p.sub}">${svgIcon("M20 6L9 17l-5-5", pl.featured ? "#fff" : p.primary, 18)}${esc(f)}</li>`).join("");
      const featured = pl.featured;
      return `<div class="p-7 flex flex-col" style="${featured ? `background:${p.ink};color:#fff;transform:scale(1.03)` : "background:#fff;color:" + ctx.p.ink};border:1px solid #0000000f;border-radius:${R.card};box-shadow:0 10px 30px #0000000f">
        <h3 class="font-bold text-lg">${esc(pl.name)}</h3>
        <div class="mt-3"><span class="text-3xl font-extrabold" style="color:${featured ? "#fff" : p.primary}">${esc(pl.price)}</span><span class="text-sm opacity-70">${esc(pl.unit)}</span></div>
        <ul class="mt-6 space-y-3 flex-1">${feats}</ul>
        <a href="#" data-go="contact" class="mt-6 text-center px-5 py-2.5 font-semibold" style="${featured ? `background:${p.primary};color:#fff` : `background:${p.soft};color:${p.primary}`};border-radius:${R.btn}">立即咨询</a>
      </div>`;
    })
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6">${heading(ctx, "价格方案", "灵活的套餐组合，总有一款适合你。")}<div class="mt-12 grid md:grid-cols-3 gap-6 items-center">${cards}</div></div></section>`;
}

function renderProcess(ctx: Ctx): string {
  const { ext, p } = ctx;
  const steps = ext.process
    .map(
      (s) => `<div class="relative"><div class="text-4xl font-extrabold" style="color:${p.primary};opacity:.25">${esc(s.step)}</div><h3 class="mt-2 font-semibold" style="color:${ctx.p.ink}">${esc(s.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(s.desc)}</p></div>`,
    )
    .join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "我们怎么做", "标准化流程，每一步都清晰可控。")}<div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">${steps}</div></div></section>`;
}

function renderTestimonials(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const cards = c.testimonials
    .map(
      (t) => `<div class="p-6" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card};box-shadow:0 6px 20px #0000000a"><div class="flex gap-1 mb-3" style="color:${p.primary}">★★★★★</div><p class="text-sm leading-relaxed" style="color:${p.sub}">“${esc(t.text)}”</p><div class="mt-4 flex items-center gap-3"><div class="h-10 w-10 flex items-center justify-center text-white font-semibold" style="background:${p.primary};border-radius:9999px">${esc(t.name.slice(0, 1))}</div><div><div class="text-sm font-semibold" style="color:${ctx.p.ink}">${esc(t.name)}</div><div class="text-xs" style="color:${p.sub};opacity:.8">${esc(t.role)}</div></div></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, c.testimonialsTitle)}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderFaq(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const rows = ext.faq
    .map(
      (f) => `<details class="group p-5" style="background:#fff;border:1px solid #0000000f;border-radius:${R.card}"><summary class="flex items-center justify-between cursor-pointer font-semibold list-none" style="color:${ctx.p.ink}">${esc(f.q)}<span style="color:${p.primary}">＋</span></summary><p class="mt-3 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.a)}</p></details>`,
    )
    .join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-3xl mx-auto px-6">${heading(ctx, "常见问题", "你想知道的，我们都准备好了。")}<div class="mt-10 space-y-3">${rows}</div></div></section>`;
}

function renderLogos(ctx: Ctx): string {
  const { ext, p } = ctx;
  const items = ext.logos.map((l) => `<div class="text-center text-lg font-bold tracking-wide" style="color:${p.sub};opacity:.55">${esc(l)}</div>`).join("");
  return `<section class="bg-white border-y" style="border-color:#0000000a"><div class="max-w-6xl mx-auto px-6 py-8"><p class="text-center text-xs mb-5" style="color:${p.sub};opacity:.7">受到众多客户信赖与选择</p><div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-6 items-center">${items}</div></div></section>`;
}

function renderNews(ctx: Ctx): string {
  const { ext, p, R } = ctx;
  const cards = ext.news
    .map(
      (n, i) => `<div class="overflow-hidden" style="background:#fff;border:1px solid #0000000a;border-radius:${R.card}">${img(ctx, 120 + i, 700, 420, "h-40 w-full object-cover")}<div class="p-5"><div class="flex items-center gap-2 text-xs" style="color:${p.primary}"><span class="font-medium">${esc(n.cat)}</span><span style="color:${p.sub};opacity:.6">${esc(n.date)}</span></div><h3 class="mt-2 font-semibold leading-snug" style="color:${ctx.p.ink}">${esc(n.title)}</h3><p class="mt-2 text-sm" style="color:${p.sub}">${esc(n.excerpt)}</p></div></div>`,
    )
    .join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">${heading(ctx, "新闻资讯", "了解我们的最新动态与行业洞察。")}<div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div></div></section>`;
}

function renderCta(ctx: Ctx): string {
  const { c, p, R } = ctx;
  return `<section style="${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6"><div class="text-center text-white px-8 py-14" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});border-radius:${R.card}"><h2 style="font-size:${ctx.D.h2};font-weight:800">${esc(c.ctaTitle)}</h2><p class="mt-3 text-white/85">${esc(c.ctaSubtitle)}</p><a href="tel:${esc(c.contactPhone)}" class="mt-8 inline-block bg-white px-8 py-3 font-semibold" style="color:${p.primaryDark};border-radius:${R.btn}">${esc(c.ctaButton)} · ${esc(c.contactPhone)}</a></div></div></section>`;
}

function renderContact(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const field = (label: string, type = "text") => `<div><label class="block text-sm mb-1" style="color:${ctx.p.ink}">${esc(label)}</label><input type="${type}" class="w-full px-4 py-2.5 text-sm" style="border:1px solid #0000001f;border-radius:${R.btn};outline:none"/></div>`;
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12">
    <div>${heading(ctx, "联系我们", "留下你的需求，我们会尽快与你联系。", "left")}
      <div class="mt-8 space-y-4 text-sm">
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M5 4h4l2 5-3 2a14 14 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 6a2 2 0 012-2z", p.primary, 20)}电话：${esc(c.contactPhone)}</div>
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M3 5h18v14H3zM3 7l9 6 9-6", p.primary, 20)}邮箱：${esc(c.contactEmail)}</div>
        <div class="flex items-center gap-3" style="color:${ctx.p.ink}">${svgIcon("M12 21s-7-6-7-11a7 7 0 1114 0c0 5-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z", p.primary, 20)}地址：${esc(c.contactAddress)}</div>
      </div>
    </div>
    <div class="p-6" style="background:${p.soft};border-radius:${R.card}">
      <div class="grid sm:grid-cols-2 gap-4">${field("您的姓名")}${field("联系电话", "tel")}</div>
      <div class="mt-4">${field("电子邮箱", "email")}</div>
      <div class="mt-4"><label class="block text-sm mb-1" style="color:${ctx.p.ink}">需求描述</label><textarea rows="4" class="w-full px-4 py-2.5 text-sm" style="border:1px solid #0000001f;border-radius:${R.btn};outline:none"></textarea></div>
      <button class="mt-5 w-full px-6 py-3 font-semibold text-white" style="background:${p.primary};border-radius:${R.btn}">提交需求</button>
    </div>
  </div></section>`;
}

function renderPageHeader(ctx: Ctx, label: string): string {
  const { p } = ctx;
  return `<section class="text-white" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})"><div class="max-w-6xl mx-auto px-6 py-16"><h1 style="font-size:${ctx.D.h2};font-weight:800">${esc(label)}</h1><p class="mt-2 text-white/80 text-sm">${esc(ctx.c.brand)} · ${esc(label)}</p></div></section>`;
}

function renderSection(ctx: Ctx, kind: SectionKind, pageLabel: string): string {
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
    default: return "";
  }
}

// ————————————————————————————————————————————————————————————
// 整页文档：把每个 page 渲染成一个 <div data-page="...">，导航切显隐
// ————————————————————————————————————————————————————————————

export interface RenderResult {
  html: string;
  pages: { key: PageKey; label: string }[];
}

export function renderTemplate(
  meta: TemplateMeta,
  content: SiteContent,
  ext: ExtContent,
  dna: TemplateDNA,
): RenderResult {
  const p = dna.palette;
  const ctx: Ctx = {
    meta,
    c: content,
    ext,
    dna,
    p,
    R: radiusTokens(dna),
    D: densityTokens(dna),
    variantOf: (kind, count) =>
      (hashStr(meta.slug + ":sec:" + kind) + dna.styleSeed) % count,
  };

  const layout: LayoutFamily = dna.layout;
  const pages = layout.pages;
  const navVariant = hashStr(meta.slug + ":nav") % 2;

  const pagesHtml = pages
    .map((pk, idx) => {
      const kinds = layout.sections[pk] ?? ["pageHeader", "cta"];
      const label = PAGE_LABEL[pk];
      const inner = kinds.map((k) => renderSection(ctx, k, label)).join("\n");
      return `<div data-page="${pk}"${idx === 0 ? "" : ' hidden style="display:none"'}>${inner}</div>`;
    })
    .join("\n");

  const body = `${navBar(ctx, pages, navVariant)}
<main>${pagesHtml}</main>
${footer(ctx, pages)}`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(content.brand)} · ${esc(meta.subLabel)}官网</title>
<meta name="description" content="${esc(content.heroSubtitle)}"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  html{scroll-behavior:smooth}
  body{font-family:${FONT_STACK[dna.font]};color:${p.ink};background:#fff}
  h1,h2,h3{font-family:${FONT_STACK[dna.font]}}
  .nav-link{position:relative;color:inherit}
  .nav-link.active{color:${p.primary};font-weight:600}
  .nav-link.active::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:${p.primary}}
  [data-page]{animation:fade .35s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>
</head>
<body>
${body}
<script>
(function(){
  function show(page){
    var pages=document.querySelectorAll('[data-page]');
    var found=false;
    pages.forEach(function(el){
      var on=el.getAttribute('data-page')===page;
      el.hidden=!on; el.style.display=on?'':'none';
      if(on)found=true;
    });
    if(!found && pages[0]){pages[0].hidden=false;pages[0].style.display='';}
    document.querySelectorAll('.nav-link').forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-go')===page);
    });
    var sc=document.scrollingElement||document.documentElement;
    sc.scrollTop=0;
  }
  // 外层预览工具条可通过 postMessage 驱动切页。
  window.addEventListener('message',function(ev){
    var d=ev&&ev.data;
    if(d&&d.__leoGo){show(d.__leoGo);}
  });
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a[data-go],a[data-nav],a'):null;
    if(!a)return;
    var go=a.getAttribute('data-go');
    var nav=a.getAttribute('data-nav');
    if(go){e.preventDefault();show(go);return;}
    if(nav){ // hero 的 CTA：#contact / #services 等 → 切到对应页
      var href=a.getAttribute('href')||'';
      var key=href.replace('#','');
      if(key){e.preventDefault();show(key);return;}
    }
    // 其它锚点/链接：纯静态预览，统一拦截，避免 iframe 被替换
    var raw=a.getAttribute('href')||'';
    if(raw==='#'||raw.charAt(0)==='#'){e.preventDefault();}
  },true);
})();
</script>
</body>
</html>`;

  return { html, pages: pages.map((k) => ({ key: k, label: PAGE_LABEL[k] })) };
}

// 兼容旧调用点：返回整页 HTML 字符串。
export function renderTemplateHTML(meta: TemplateMeta, content: SiteContent): string {
  const dna = dnaFor(meta.slug, meta.industryKey, meta.variant);
  const ext = buildExt(meta.slug, meta.industryKey, meta.subLabel);
  return renderTemplate(meta, content, ext, dna).html;
}
