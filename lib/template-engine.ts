// 模板渲染引擎：把 (TemplateMeta + SiteContent + 色系 + 骨架) 渲染成一整页
// 自包含 HTML（Tailwind via CDN）。详情页 /templates/<slug> 直接把这段 HTML
// 塞进 iframe srcdoc 全屏展示 = 一个完整可滚动的行业官网首页。
//
// 设计取自 MIT 开源 landwind/HyperUI 的成熟落地页结构：
//   顶部导航 → Hero → 数据条 → 关于 → 特色(features) → 服务/产品 →
//   作品/案例 → 客户评价 → CTA → 页脚。
//
// 「多样性」来自三个维度的笛卡尔积：
//   骨架(skeleton) × 色系(palette) × 配图(seed) —— 由 slug 的 hash 确定性选取，
//   保证同一子类下的 5 个模板视觉互不相同，且服务端每次渲染一致。

import { ColorKey, TemplateMeta, hashStr } from "./template-taxonomy";
import { SiteContent } from "./template-content";

export interface Palette {
  // 主色（按钮/强调）
  primary: string;
  primaryDark: string;
  // hero 渐变两端
  gradFrom: string;
  gradTo: string;
  // 浅色强调底（区块背景）
  soft: string;
  // 文字主色 / 次色
  ink: string;
  sub: string;
  // 是否深色 hero（决定 hero 文字颜色）
  heroDark: boolean;
  // 强调文字色（hero 上的高亮词）
  accent: string;
}

const PALETTES: Record<ColorKey, Palette> = {
  blue: {
    primary: "#2563eb", primaryDark: "#1d4ed8",
    gradFrom: "#1e3a8a", gradTo: "#3b82f6",
    soft: "#eff6ff", ink: "#0f172a", sub: "#475569",
    heroDark: true, accent: "#93c5fd",
  },
  red: {
    primary: "#e11d48", primaryDark: "#be123c",
    gradFrom: "#881337", gradTo: "#f43f5e",
    soft: "#fff1f2", ink: "#1c0a0f", sub: "#6b5158",
    heroDark: true, accent: "#fda4af",
  },
  green: {
    primary: "#16a34a", primaryDark: "#15803d",
    gradFrom: "#14532d", gradTo: "#22c55e",
    soft: "#f0fdf4", ink: "#0a1f12", sub: "#4b6354",
    heroDark: true, accent: "#86efac",
  },
  orange: {
    primary: "#ea580c", primaryDark: "#c2410c",
    gradFrom: "#7c2d12", gradTo: "#fb923c",
    soft: "#fff7ed", ink: "#1f1206", sub: "#6b5645",
    heroDark: true, accent: "#fdba74",
  },
  purple: {
    primary: "#7c3aed", primaryDark: "#6d28d9",
    gradFrom: "#4c1d95", gradTo: "#a78bfa",
    soft: "#f5f3ff", ink: "#160a23", sub: "#564b63",
    heroDark: true, accent: "#c4b5fd",
  },
  dark: {
    primary: "#0ea5e9", primaryDark: "#0284c7",
    gradFrom: "#0f172a", gradTo: "#1e293b",
    soft: "#f1f5f9", ink: "#0f172a", sub: "#475569",
    heroDark: true, accent: "#38bdf8",
  },
  light: {
    primary: "#0f172a", primaryDark: "#020617",
    gradFrom: "#f8fafc", gradTo: "#e2e8f0",
    soft: "#f8fafc", ink: "#0f172a", sub: "#475569",
    heroDark: false, accent: "#0f172a",
  },
  multi: {
    primary: "#db2777", primaryDark: "#be185d",
    gradFrom: "#6d28d9", gradTo: "#f59e0b",
    soft: "#fdf4ff", ink: "#1a0b1e", sub: "#5b4a5e",
    heroDark: true, accent: "#fbcfe8",
  },
};

export function paletteFor(color: ColorKey): Palette {
  return PALETTES[color] ?? PALETTES.blue;
}

// 配图 URL（确定性）。用 loremflickr 的关键词接口（按 Flickr CC 标签取图，
// License 友好），`lock=<seed>` 锁定 → 服务端每次渲染同一张、seed 不同则不同图。
// （注：source.unsplash.com 已于 2024 下线，不可再用。）
export function photo(query: string, seed: number, w = 1200, h = 800): string {
  const tags = encodeURIComponent(query); // 逗号分隔的多标签由调用方给出
  return `https://loremflickr.com/${w}/${h}/${tags}?lock=${seed}`;
}

// 确定性兜底图（picsum，可靠、无关键词）。loremflickr 偶发 500/超时时由
// <img onerror> 切到这张，保证任何卡片/预览都不会留空白。
export function photoFallback(seed: number, w = 1200, h = 800): string {
  return `https://picsum.photos/seed/leo${seed}/${w}/${h}`;
}

// 给 <img> 用的 onerror（先切 picsum，再失败就隐藏，露出底层渐变）。
function imgFallbackAttr(seed: number, w: number, h: number): string {
  const fb = photoFallback(seed, w, h);
  return ` onerror="if(this.dataset.fb){this.style.visibility='hidden'}else{this.dataset.fb=1;this.src='${fb}'}"`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Skeleton = (meta: TemplateMeta, c: SiteContent, p: Palette) => string;

// ————————————————————————————————————————————————————————————
// 公共片段
// ————————————————————————————————————————————————————————————

function navBar(c: SiteContent, p: Palette, variant: "solid" | "glass"): string {
  const links = c.nav
    .map(
      (n, i) =>
        `<a href="#${i}" class="hover:opacity-70 transition ${i === 0 ? "font-semibold" : ""}">${esc(n.label)}</a>`,
    )
    .join("");
  const cls =
    variant === "glass"
      ? "absolute top-0 inset-x-0 z-20 text-white"
      : "sticky top-0 z-20 bg-white shadow-sm";
  const txt = variant === "glass" ? "text-white" : "";
  return `
  <header class="${cls}">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between ${txt}">
      <div class="flex items-center gap-2 font-bold text-lg">
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg" style="background:${p.primary};color:#fff">${esc(c.brand.slice(0, 1))}</span>
        <span>${esc(c.brand)}</span>
      </div>
      <nav class="hidden md:flex items-center gap-7 text-sm">${links}</nav>
      <a href="#contact" class="rounded-full px-5 py-2 text-sm font-medium text-white" style="background:${p.primary}">${esc(c.heroCta)}</a>
    </div>
  </header>`;
}

function statsBar(c: SiteContent, p: Palette): string {
  const items = c.stats
    .map(
      (s) => `
      <div class="text-center">
        <div class="text-3xl md:text-4xl font-extrabold" style="color:${p.primary}">${esc(s.value)}</div>
        <div class="mt-1 text-sm text-slate-500">${esc(s.label)}</div>
      </div>`,
    )
    .join("");
  return `
  <section class="bg-white">
    <div class="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">${items}</div>
  </section>`;
}

function featureCard(f: { title: string; desc: string; icon: string }, p: Palette): string {
  return `
    <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition">
      <div class="h-12 w-12 rounded-xl flex items-center justify-center mb-4" style="background:${p.soft}">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="${p.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${f.icon}"/></svg>
      </div>
      <h3 class="font-semibold text-lg" style="color:${p.ink}">${esc(f.title)}</h3>
      <p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.desc)}</p>
    </div>`;
}

function featuresSection(c: SiteContent, p: Palette): string {
  return `
  <section class="py-20" style="background:${p.soft}">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center max-w-2xl mx-auto">
        <h2 class="text-3xl font-extrabold" style="color:${p.ink}">${esc(c.featuresTitle)}</h2>
        <p class="mt-3" style="color:${p.sub}">${esc(c.featuresSubtitle)}</p>
      </div>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        ${c.features.map((f) => featureCard(f, p)).join("")}
      </div>
    </div>
  </section>`;
}

function servicesSection(meta: TemplateMeta, c: SiteContent, p: Palette): string {
  const cards = c.services
    .map(
      (s, i) => `
      <div class="group relative overflow-hidden rounded-2xl">
        <img src="${photo(meta.photo, meta.hot + i * 7, 600, 420)}"${imgFallbackAttr(meta.hot + i * 7, 600, 420)} alt="${esc(s.name)}" class="h-56 w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div class="absolute bottom-0 p-5 text-white">
          <h3 class="text-lg font-semibold">${esc(s.name)}</h3>
          <p class="mt-1 text-sm text-white/80">${esc(s.desc)}</p>
        </div>
      </div>`,
    )
    .join("");
  return `
  <section class="py-20 bg-white">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center max-w-2xl mx-auto">
        <h2 class="text-3xl font-extrabold" style="color:${p.ink}">${esc(c.servicesTitle)}</h2>
        <p class="mt-3" style="color:${p.sub}">${esc(c.servicesSubtitle)}</p>
      </div>
      <div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">${cards}</div>
    </div>
  </section>`;
}

function aboutSection(meta: TemplateMeta, c: SiteContent, p: Palette, flip = false): string {
  const img = `
    <div class="relative">
      <img src="${photo(meta.photo, meta.hot + 99, 800, 600)}"${imgFallbackAttr(meta.hot + 99, 800, 600)} alt="${esc(c.aboutTitle)}" class="rounded-2xl shadow-xl object-cover w-full h-80" loading="lazy"/>
      <div class="absolute -bottom-5 -right-5 hidden sm:block rounded-2xl px-6 py-4 text-white shadow-lg" style="background:${p.primary}">
        <div class="text-2xl font-extrabold">${esc(c.stats[0]?.value ?? "")}</div>
        <div class="text-xs opacity-90">${esc(c.stats[0]?.label ?? "")}</div>
      </div>
    </div>`;
  const text = `
    <div>
      <span class="inline-block rounded-full px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary}">${esc(c.aboutTitle)}</span>
      <h2 class="mt-4 text-3xl font-extrabold leading-tight" style="color:${p.ink}">${esc(c.heroTitle)}</h2>
      ${c.aboutBody.map((para) => `<p class="mt-4 leading-relaxed" style="color:${p.sub}">${esc(para)}</p>`).join("")}
      <ul class="mt-6 space-y-2">
        ${c.services
          .slice(0, 3)
          .map(
            (s) =>
              `<li class="flex items-center gap-2 text-sm" style="color:${p.ink}"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="${p.primary}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${esc(s.name)}</li>`,
          )
          .join("")}
      </ul>
    </div>`;
  return `
  <section class="py-20" style="background:#fff">
    <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
      ${flip ? img + text : text + img}
    </div>
  </section>`;
}

function testimonialsSection(c: SiteContent, p: Palette): string {
  const cards = c.testimonials
    .map(
      (t) => `
      <div class="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
        <div class="flex gap-1 mb-3" style="color:${p.primary}">${"★".repeat(5).split("").map(() => `<span>★</span>`).join("")}</div>
        <p class="text-sm leading-relaxed" style="color:${p.sub}">“${esc(t.text)}”</p>
        <div class="mt-4 flex items-center gap-3">
          <div class="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold" style="background:${p.primary}">${esc(t.name.slice(0, 1))}</div>
          <div>
            <div class="text-sm font-semibold" style="color:${p.ink}">${esc(t.name)}</div>
            <div class="text-xs text-slate-400">${esc(t.role)}</div>
          </div>
        </div>
      </div>`,
    )
    .join("");
  return `
  <section class="py-20" style="background:${p.soft}">
    <div class="max-w-6xl mx-auto px-6">
      <div class="text-center"><h2 class="text-3xl font-extrabold" style="color:${p.ink}">${esc(c.testimonialsTitle)}</h2></div>
      <div class="mt-12 grid md:grid-cols-3 gap-6">${cards}</div>
    </div>
  </section>`;
}

function ctaSection(c: SiteContent, p: Palette): string {
  return `
  <section id="contact" class="py-20">
    <div class="max-w-5xl mx-auto px-6">
      <div class="rounded-3xl px-8 py-14 text-center text-white" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})">
        <h2 class="text-3xl md:text-4xl font-extrabold">${esc(c.ctaTitle)}</h2>
        <p class="mt-3 text-white/85">${esc(c.ctaSubtitle)}</p>
        <a href="tel:${esc(c.contactPhone)}" class="mt-8 inline-block rounded-full bg-white px-8 py-3 font-semibold" style="color:${p.primaryDark}">${esc(c.ctaButton)} · ${esc(c.contactPhone)}</a>
      </div>
    </div>
  </section>`;
}

function footer(c: SiteContent, p: Palette): string {
  const links = c.nav.map((n) => `<a href="#" class="hover:text-white transition">${esc(n.label)}</a>`).join("");
  return `
  <footer class="bg-slate-900 text-slate-400">
    <div class="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
      <div class="md:col-span-2">
        <div class="flex items-center gap-2 text-white font-bold text-lg">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg" style="background:${p.primary}">${esc(c.brand.slice(0, 1))}</span>${esc(c.brand)}
        </div>
        <p class="mt-4 text-sm max-w-sm">${esc(c.footerSlogan)}</p>
      </div>
      <div>
        <div class="text-white font-semibold mb-3">快速导航</div>
        <div class="flex flex-col gap-2 text-sm">${links}</div>
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
// 骨架 A：经典渐变 hero（左文右图）
// ————————————————————————————————————————————————————————————
const skeletonClassic: Skeleton = (meta, c, p) => `
${navBar(c, p, "solid")}
<section class="relative overflow-hidden" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})">
  <div class="max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-12 items-center text-white">
    <div>
      <span class="inline-block rounded-full bg-white/15 px-3 py-1 text-xs">${esc(meta.subLabel)} · 专业方案</span>
      <h1 class="mt-5 text-4xl md:text-5xl font-extrabold leading-tight">${esc(c.heroTitle)}</h1>
      <p class="mt-5 text-lg text-white/85">${esc(c.heroSubtitle)}</p>
      <div class="mt-8 flex gap-4">
        <a href="#contact" class="rounded-full bg-white px-7 py-3 font-semibold" style="color:${p.primaryDark}">${esc(c.heroCta)}</a>
        <a href="#about" class="rounded-full border border-white/40 px-7 py-3 font-semibold">${esc(c.heroCtaAlt)}</a>
      </div>
    </div>
    <div><img src="${photo(meta.photo, meta.hot, 900, 700)}"${imgFallbackAttr(meta.hot, 900, 700)} alt="${esc(c.heroTitle)}" class="rounded-2xl shadow-2xl object-cover w-full h-96" loading="eager"/></div>
  </div>
</section>
${statsBar(c, p)}
${aboutSection(meta, c, p, false)}
${featuresSection(c, p)}
${servicesSection(meta, c, p)}
${testimonialsSection(c, p)}
${ctaSection(c, p)}
${footer(c, p)}`;

// ————————————————————————————————————————————————————————————
// 骨架 B：全屏图片 hero + 玻璃导航（居中文案）
// ————————————————————————————————————————————————————————————
const skeletonHeroImage: Skeleton = (meta, c, p) => `
${navBar(c, p, "glass")}
<section class="relative h-[78vh] min-h-[520px] flex items-center justify-center text-center text-white">
  <img src="${photo(meta.photo, meta.hot, 1600, 1000)}"${imgFallbackAttr(meta.hot, 1600, 1000)} alt="${esc(c.heroTitle)}" class="absolute inset-0 h-full w-full object-cover" loading="eager"/>
  <div class="absolute inset-0" style="background:linear-gradient(135deg,${p.gradFrom}cc,${p.gradTo}99)"></div>
  <div class="relative max-w-3xl px-6">
    <h1 class="text-4xl md:text-6xl font-extrabold leading-tight">${esc(c.heroTitle)}</h1>
    <p class="mt-6 text-lg md:text-xl text-white/90">${esc(c.heroSubtitle)}</p>
    <div class="mt-9 flex justify-center gap-4">
      <a href="#contact" class="rounded-full px-8 py-3 font-semibold text-white" style="background:${p.primary}">${esc(c.heroCta)}</a>
      <a href="#about" class="rounded-full border border-white/60 px-8 py-3 font-semibold">${esc(c.heroCtaAlt)}</a>
    </div>
  </div>
</section>
${statsBar(c, p)}
${featuresSection(c, p)}
${aboutSection(meta, c, p, true)}
${servicesSection(meta, c, p)}
${testimonialsSection(c, p)}
${ctaSection(c, p)}
${footer(c, p)}`;

// ————————————————————————————————————————————————————————————
// 骨架 C：极简留白（浅底、上下结构、产品优先）
// ————————————————————————————————————————————————————————————
const skeletonMinimal: Skeleton = (meta, c, p) => `
${navBar(c, p, "solid")}
<section class="bg-white">
  <div class="max-w-5xl mx-auto px-6 py-24 text-center">
    <span class="inline-block rounded-full px-3 py-1 text-xs font-medium" style="background:${p.soft};color:${p.primary}">${esc(meta.subLabel)}</span>
    <h1 class="mt-6 text-5xl font-extrabold leading-tight" style="color:${p.ink}">${esc(c.heroTitle)}</h1>
    <p class="mt-6 text-lg max-w-2xl mx-auto" style="color:${p.sub}">${esc(c.heroSubtitle)}</p>
    <div class="mt-8 flex justify-center gap-4">
      <a href="#contact" class="rounded-full px-8 py-3 font-semibold text-white" style="background:${p.primary}">${esc(c.heroCta)}</a>
      <a href="#services" class="rounded-full px-8 py-3 font-semibold" style="color:${p.primary};border:1px solid ${p.primary}">${esc(c.heroCtaAlt)}</a>
    </div>
    <img src="${photo(meta.photo, meta.hot, 1200, 600)}"${imgFallbackAttr(meta.hot, 1200, 600)} alt="${esc(c.heroTitle)}" class="mt-14 rounded-2xl shadow-2xl object-cover w-full h-[420px]" loading="eager"/>
  </div>
</section>
${statsBar(c, p)}
<div id="services"></div>
${servicesSection(meta, c, p)}
${aboutSection(meta, c, p, false)}
${featuresSection(c, p)}
${testimonialsSection(c, p)}
${ctaSection(c, p)}
${footer(c, p)}`;

// ————————————————————————————————————————————————————————————
// 骨架 D：侧栏强调（双色块 hero，适合零售/商城）
// ————————————————————————————————————————————————————————————
const skeletonSplit: Skeleton = (meta, c, p) => `
${navBar(c, p, "solid")}
<section class="grid md:grid-cols-2 min-h-[70vh]">
  <div class="flex items-center px-6 md:px-16 py-20" style="background:${p.soft}">
    <div>
      <span class="inline-block rounded-full px-3 py-1 text-xs font-medium text-white" style="background:${p.primary}">${esc(meta.subLabel)}</span>
      <h1 class="mt-5 text-4xl md:text-5xl font-extrabold leading-tight" style="color:${p.ink}">${esc(c.heroTitle)}</h1>
      <p class="mt-5 text-lg" style="color:${p.sub}">${esc(c.heroSubtitle)}</p>
      <div class="mt-8 flex gap-4">
        <a href="#contact" class="rounded-full px-7 py-3 font-semibold text-white" style="background:${p.primary}">${esc(c.heroCta)}</a>
        <a href="#about" class="rounded-full px-7 py-3 font-semibold" style="color:${p.primary};border:1px solid ${p.primary}">${esc(c.heroCtaAlt)}</a>
      </div>
    </div>
  </div>
  <div class="relative"><img src="${photo(meta.photo, meta.hot, 900, 1000)}"${imgFallbackAttr(meta.hot, 900, 1000)} alt="${esc(c.heroTitle)}" class="absolute inset-0 h-full w-full object-cover" loading="eager"/></div>
</section>
${statsBar(c, p)}
${servicesSection(meta, c, p)}
${featuresSection(c, p)}
${aboutSection(meta, c, p, true)}
${testimonialsSection(c, p)}
${ctaSection(c, p)}
${footer(c, p)}`;

const SKELETONS: Skeleton[] = [
  skeletonClassic,
  skeletonHeroImage,
  skeletonMinimal,
  skeletonSplit,
];

/** 给定模板，确定性选骨架（同子类 5 个变体尽量铺开不同骨架）。 */
export function skeletonIndexFor(meta: TemplateMeta): number {
  // variant 1..5 → 骨架尽量错开；再叠加 hash 增加跨子类多样性。
  return (meta.variant - 1 + (hashStr(meta.subKey) % SKELETONS.length)) % SKELETONS.length;
}

/** 渲染整页 HTML 文档（含 <head> + Tailwind CDN）。 */
export function renderTemplateHTML(meta: TemplateMeta, content: SiteContent): string {
  const p = paletteFor(meta.color);
  const body = SKELETONS[skeletonIndexFor(meta)](meta, content, p);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(content.brand)} · ${esc(meta.subLabel)}官网</title>
<meta name="description" content="${esc(content.heroSubtitle)}"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>html{scroll-behavior:smooth}body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}</style>
</head>
<body class="bg-white" style="color:${p.ink}">
${body}
</body>
</html>`;
}
