// 特色家族专属章节渲染器（模板专区 v3「脱胎换骨」）。
//
// 每个 sig* 章节都是一套**独立视觉语汇**，不复用通用引擎的卡片/网格观感，目的是
// 让十套装都能「一眼可辨」，而非「换排列 + 换字」。配色/圆角/字体/特效已由各套装
// 的 signature 字段钉死
// （见 template-dna.ts），这里只负责排版结构与该家族的招牌元素。
//
// 复用引擎导出的 esc / img / heading / btnPrimary / sectionPad / svgIcon / subName。
// 设计文档：docs/architecture/oceanleo-template-gallery-v3-signature-families.md

import type { SectionKind } from "./template-dna";
import {
  type Ctx,
  esc,
  img,
  heading,
  btnPrimary,
  sectionPad,
  svgIcon,
  subName,
} from "./template-engine";

export const SIGNATURE_RENDERER_KEYS = [
  "sigPaperIndex",
  "sigEditorialHero",
  "sigEditorialFeature",
  "sigEditorialGallery",
  "sigPullQuote",
  "sigNeonHero",
  "sigGlassGrid",
  "sigNeonStats",
  "sigCodeWindow",
  "sigFsIntro",
  "sigFsPanel",
  "sigFsSplit",
  "sigBentoHero",
  "sigBentoFeatures",
  "sigBrutalHero",
  "sigBrutalCards",
  "sigStickerCta",
  "sigNatureTrail",
  "sigSandWorkshop",
  "sigNavyBriefing",
] as const;

export type SignatureSectionKind = (typeof SIGNATURE_RENDERER_KEYS)[number];

// ═══════════════════════════════════════════════════════════════════
// 路由：把 sig* 章节分派到对应渲染器。
// ═══════════════════════════════════════════════════════════════════
export function renderSignatureSection(
  ctx: Ctx,
  kind: SectionKind | SignatureSectionKind,
  pageLabel: string,
): string {
  const renderer = SIGNATURE_RENDERERS[kind as SignatureSectionKind];
  return renderer ? renderer(ctx, pageLabel) : "";
}

// small helper：段落内的引导 kicker（子类名 · 品牌）。
function kicker(ctx: Ctx): string {
  return `${esc(subName(ctx))} · ${esc(ctx.c.brand)}`;
}

// ═══════════════════════════════════════════════════════════════════
// F1 — editorial（杂志编辑风）：衬线大标题、非对称栏、去卡片、极多留白。
// ═══════════════════════════════════════════════════════════════════
function sigEditorialHero(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section class="bg-white leo-noise" style="position:relative;${sectionPad(ctx)}">
    <div class="max-w-6xl mx-auto px-6">
      <div class="flex items-center gap-4 text-xs tracking-[0.25em] uppercase" style="color:${p.sub}">
        <span style="width:34px;height:1px;background:${p.ink}"></span>${esc(kicker(ctx))}
      </div>
      <div class="mt-8 grid lg:grid-cols-12 gap-10 items-end">
        <div class="lg:col-span-8">
          <h1 style="font-family:Georgia,'Songti SC','Noto Serif SC',serif;font-weight:800;letter-spacing:-.01em;line-height:1.02;font-size:clamp(2.6rem,6vw,5rem);color:${p.ink}">${esc(c.heroTitle)}</h1>
        </div>
        <div class="lg:col-span-4 lg:pb-3">
          <p class="text-lg leading-relaxed" style="color:${p.sub}">${esc(c.heroSubtitle)}</p>
          <div class="mt-6 flex gap-3">${btnPrimary(ctx, c.heroCta)}</div>
        </div>
      </div>
      <div class="mt-12 overflow-hidden" style="border-top:2px solid ${p.ink};border-bottom:2px solid ${p.ink}">
        ${img(ctx, 0, 1600, 720, "w-full object-cover leo-kenburns", "height:min(52vh,30rem)")}
      </div>
    </div>
  </section>`;
}

function sigEditorialFeature(ctx: Ctx): string {
  const { c, p } = ctx;
  const cols = c.features.slice(0, 3)
    .map((f, i) => `<div class="pt-6" style="border-top:2px solid ${p.ink}">
      <div class="text-4xl font-black" style="font-family:Georgia,serif;color:${p.primary}">0${i + 1}</div>
      <h3 class="mt-3 text-xl font-bold" style="color:${p.ink}">${esc(f.title)}</h3>
      <p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.desc)}</p>
    </div>`).join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="max-w-2xl"><h2 style="font-family:Georgia,'Songti SC',serif;font-weight:800;font-size:clamp(1.8rem,3.5vw,2.8rem);line-height:1.1;color:${p.ink}">${esc(c.featuresTitle)}</h2><p class="mt-3 text-base" style="color:${p.sub}">${esc(c.featuresSubtitle)}</p></div>
    <div class="mt-12 grid md:grid-cols-3 gap-10">${cols}</div>
  </div></section>`;
}

function sigEditorialGallery(ctx: Ctx): string {
  const { c, p } = ctx;
  const s = c.services.slice(0, 4);
  const rows = s.map((sv, i) => {
    const flip = i % 2 === 1;
    return `<div class="grid md:grid-cols-2 gap-8 md:gap-14 items-center py-10" style="border-top:1px solid ${p.ink}22">
      <div class="${flip ? "md:order-2" : ""} overflow-hidden">${img(ctx, 20 + i, 1000, 720, "w-full object-cover", "height:20rem")}</div>
      <div class="${flip ? "md:order-1" : ""}">
        <div class="text-xs tracking-[0.2em] uppercase" style="color:${p.primary}">— 0${i + 1}</div>
        <h3 class="mt-3" style="font-family:Georgia,'Songti SC',serif;font-weight:800;font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.1;color:${p.ink}">${esc(sv.name)}</h3>
        <p class="mt-4 text-base leading-relaxed" style="color:${p.sub}">${esc(sv.desc)}</p>
      </div>
    </div>`;
  }).join("");
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    ${heading(ctx, c.servicesTitle, c.servicesSubtitle, "left")}
    <div class="mt-6">${rows}</div>
  </div></section>`;
}

function sigPullQuote(ctx: Ctx): string {
  const { c, p } = ctx;
  const t = c.testimonials[0];
  const quote = t ? t.text : c.heroSubtitle;
  const who = t ? `${t.name} · ${t.role}` : c.brand;
  return `<section class="bg-white" style="${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6 text-center">
    <div style="font-family:Georgia,serif;font-size:5rem;line-height:0.6;color:${p.primary}">“</div>
    <blockquote class="mt-4" style="font-family:Georgia,'Songti SC',serif;font-weight:700;font-size:clamp(1.6rem,3.4vw,2.6rem);line-height:1.3;color:${p.ink}">${esc(quote)}</blockquote>
    <div class="mt-8 flex items-center justify-center gap-3 text-sm" style="color:${p.sub}"><span style="width:28px;height:1px;background:${p.ink}"></span>${esc(who)}</div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F2 — neon-tech（深色霓虹科技风）：黑底 + 荧光辉光 + 玻璃拟态 + 网格。
// ═══════════════════════════════════════════════════════════════════
function sigNeonHero(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section class="relative overflow-hidden" style="background:${p.soft};${sectionPad(ctx)}">
    <div class="leo-neon-grid"></div>
    <div class="leo-orb" style="width:420px;height:420px;top:-120px;left:50%;transform:translateX(-50%);background:radial-gradient(circle,${p.primary}44,transparent 70%);filter:blur(70px)"></div>
    <div class="relative max-w-4xl mx-auto px-6 text-center">
      <span class="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold leo-neon-edge" style="color:${p.primary};border-radius:9999px">
        <span style="width:7px;height:7px;border-radius:9999px;background:${p.primary};box-shadow:0 0 8px ${p.primary}"></span>${esc(kicker(ctx))}
      </span>
      <h1 class="mt-8 leo-neon-glow" style="font-weight:800;letter-spacing:-.02em;line-height:1.05;font-size:clamp(2.6rem,6.5vw,5rem);color:${p.ink}">${esc(c.heroTitle)}</h1>
      <p class="mt-6 text-lg leading-relaxed mx-auto" style="color:${p.sub};max-width:38rem">${esc(c.heroSubtitle)}</p>
      <div class="mt-9 flex flex-wrap gap-4 justify-center">
        <a href="#" data-go="contact" class="px-7 py-3 font-semibold text-white transition hover:scale-[1.03]" style="background:${p.primary};border-radius:${ctx.R.btn};box-shadow:0 0 24px ${p.primary}66">${esc(c.heroCta)}</a>
        <a href="#" data-go="services" class="px-7 py-3 font-semibold leo-neon-edge transition hover:opacity-90" style="color:${p.ink};border-radius:${ctx.R.btn}">${esc(c.heroCtaAlt)}</a>
      </div>
    </div>
  </section>`;
}

function sigGlassGrid(ctx: Ctx): string {
  const { c, p } = ctx;
  const cards = c.features.slice(0, 6).map((it, i) => `<div class="p-6 transition hover:-translate-y-1" style="background:linear-gradient(145deg,#ffffffc7,#ffffff63);border:1px solid #ffffffd9;box-shadow:0 18px 45px ${p.primary}16,inset 0 1px 0 #fff;border-radius:${ctx.R.card};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)">
    <div class="flex h-11 w-11 items-center justify-center" style="background:#ffffffa8;border:1px solid #fff;box-shadow:0 8px 22px ${p.primary}18;border-radius:${ctx.R.btn};color:${p.primary}">${svgIcon(it.icon || GLYPHS[i % GLYPHS.length], p.primary, 22)}</div>
    <h3 class="mt-4 font-semibold" style="color:${p.ink}">${esc(it.title)}</h3>
    <p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(it.desc)}</p>
  </div>`).join("");
  return `<section class="relative overflow-hidden" style="background:linear-gradient(145deg,${p.soft},#fff);${sectionPad(ctx)}">
    <div class="absolute" style="width:24rem;height:24rem;right:-8rem;top:-10rem;border-radius:9999px;background:${p.primary}22;filter:blur(35px)"></div>
    <div class="relative max-w-6xl mx-auto px-6">
      ${heading(ctx, c.featuresTitle, c.featuresSubtitle)}
      <div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${cards}</div>
    </div>
  </section>`;
}

function sigNeonStats(ctx: Ctx): string {
  const { c, p } = ctx;
  const cells = c.stats.map((s) => `<div class="text-center leo-glass py-8 px-4" style="border-radius:${ctx.R.card}">
    <div class="leo-neon-glow" style="font-size:clamp(2rem,4vw,3rem);font-weight:800;color:${p.primary}">${esc(s.value)}</div>
    <div class="mt-2 text-sm" style="color:${p.sub}">${esc(s.label)}</div>
  </div>`).join("");
  return `<section class="relative" style="background:${p.soft};padding-top:1rem;padding-bottom:1rem">
    <div class="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-4">${cells}</div>
  </section>`;
}

function sigCodeWindow(ctx: Ctx): string {
  const { c, p } = ctx;
  const en = ctx.lang === "en";
  const line = (t: string) => `<div style="white-space:pre-wrap">${t}</div>`;
  const body = [
    `<span style="color:${p.sub}">${en ? "// deploy in one line" : "// 一行接入"}</span>`,
    `<span style="color:${p.primary}">const</span> app = <span style="color:${p.accent}">createApp</span>({`,
    `  brand: <span style="color:${p.accent}">"${esc(c.brand)}"</span>,`,
    `  ready: <span style="color:${p.primary}">true</span>,`,
    `});`,
    `<span style="color:${p.sub}">→ ${en ? "shipped 🚀" : "已上线 🚀"}</span>`,
  ].map(line).join("");
  return `<section class="relative" style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-5xl mx-auto px-6 grid lg:grid-cols-2 gap-10 items-center">
    <div>
      ${headingDark(ctx, c.ctaTitle, c.ctaSubtitle, "left")}
      <div class="mt-6">${btnPrimary(ctx, c.ctaButton)}</div>
    </div>
    <div class="overflow-hidden" style="border:1px solid ${p.primary}55;box-shadow:0 20px 60px ${p.primary}22,inset 0 0 30px ${p.primary}0f;border-radius:${ctx.R.card};background:#111827">
      <div class="flex items-center gap-2 px-4 py-3" style="border-bottom:1px solid ${p.primary}22">
        <span style="width:11px;height:11px;border-radius:9999px;background:#ff5f56"></span>
        <span style="width:11px;height:11px;border-radius:9999px;background:#ffbd2e"></span>
        <span style="width:11px;height:11px;border-radius:9999px;background:#27c93f"></span>
      </div>
      <pre class="p-5 text-sm leading-7" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${p.ink};overflow:auto">${body}</pre>
    </div>
  </div></section>`;
}

// 深底标题（neon 家族用；不走引擎 heading 的浅色默认）。
function headingDark(ctx: Ctx, title: string, sub?: string, align: "center" | "left" = "center"): string {
  const { p } = ctx;
  const a = align === "center" ? "text-center mx-auto" : "text-left";
  return `<div class="${a}" style="max-width:${align === "center" ? "42rem" : "none"}">
    <h2 class="leo-neon-glow" style="font-size:clamp(1.7rem,3.4vw,2.6rem);font-weight:800;color:${p.ink}">${esc(title)}</h2>
    ${sub ? `<p class="mt-3 text-base leading-relaxed" style="color:${p.sub}">${esc(sub)}</p>` : ""}
  </div>`;
}

const GLYPHS = [
  "M13 2L3 14h7l-1 8 10-12h-7z", // bolt
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", // shield
  "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20", // globe
  "M4 20V10M10 20V4M16 20v-8M22 20H2", // chart
  "M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h3M18 12h3M12 3v3M12 18v3", // cog
  "M20 6L9 17l-5-5", // check
];

// ═══════════════════════════════════════════════════════════════════
// F3 — fullscreen-scroll（全屏叙事）：每屏 100vh 满屏图 + 大字 + 聚光。
// ═══════════════════════════════════════════════════════════════════
function sigFsIntro(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section class="relative flex items-center justify-center text-center text-white overflow-hidden" style="min-height:88vh">
    <div class="absolute inset-0">${img(ctx, 0, 1920, 1200, "h-full w-full object-cover leo-kenburns")}</div>
    <div class="absolute inset-0" style="background:linear-gradient(180deg,#0009,#0006 40%,#000b)"></div>
    <div class="leo-spotlight"></div>
    <div class="relative px-6 max-w-3xl">
      <div class="text-xs tracking-[0.3em] uppercase text-white/80">${esc(kicker(ctx))}</div>
      <h1 class="mt-6" style="font-weight:800;letter-spacing:-.01em;line-height:1.05;font-size:clamp(2.8rem,7vw,5.5rem);text-shadow:0 4px 30px #0008">${esc(c.heroTitle)}</h1>
      <p class="mt-6 text-lg md:text-xl text-white/85 leading-relaxed">${esc(c.heroSubtitle)}</p>
      <div class="mt-10">
        <a href="#" data-go="contact" class="inline-block px-8 py-3.5 font-semibold text-white transition hover:scale-[1.03]" style="background:${p.primary};border-radius:${ctx.R.btn}">${esc(c.heroCta)}</a>
      </div>
      <div class="mt-16 animate-bounce text-white/70">${svgIcon("M12 5v14M6 13l6 6 6-6", "#fff", 26)}</div>
    </div>
  </section>`;
}

function sigFsPanel(ctx: Ctx, pageLabel: string): string {
  const { c, p } = ctx;
  // 用 services / features 里的一条驱动这一屏（按 pageKey 掺入变化）。
  const pool = c.services.length ? c.services : c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const idx = ctx.variantOf("sigFsPanel", pool.length || 1);
  const it = pool[idx] || { name: c.aboutTitle, desc: c.aboutBody[0] || c.heroSubtitle };
  const flip = idx % 2 === 1;
  return `<section class="relative flex items-center overflow-hidden" style="min-height:86vh;background:${p.ink}">
    <div class="absolute inset-0 ${flip ? "" : ""}">${img(ctx, 10 + idx, 1920, 1200, "h-full w-full object-cover", "opacity:.5")}</div>
    <div class="absolute inset-0" style="background:linear-gradient(${flip ? "270deg" : "90deg"},#000d,#0003 70%)"></div>
    <div class="relative max-w-6xl mx-auto px-6 w-full">
      <div class="max-w-xl ${flip ? "ml-auto text-right" : ""} text-white">
        <div class="text-sm tracking-[0.2em] uppercase" style="color:${p.gradTo}">${esc(pageLabel)}</div>
        <h2 class="mt-4" style="font-weight:800;line-height:1.08;font-size:clamp(2rem,4.6vw,3.4rem)">${esc(it.name)}</h2>
        <p class="mt-5 text-lg text-white/85 leading-relaxed">${esc(it.desc)}</p>
      </div>
    </div>
  </section>`;
}

function sigFsSplit(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section class="relative grid md:grid-cols-2" style="min-height:86vh">
    <div class="relative flex items-center justify-center p-10 md:p-16" style="background:${p.soft}">
      <div class="max-w-md">
        <div class="text-xs tracking-[0.25em] uppercase" style="color:${p.primary}">${esc(c.aboutTitle)}</div>
        <h2 class="mt-4" style="font-weight:800;line-height:1.1;font-size:clamp(1.9rem,3.8vw,3rem);color:${p.ink}">${esc(c.heroTitle)}</h2>
        ${c.aboutBody.map((t) => `<p class="mt-4 text-base leading-relaxed" style="color:${p.sub}">${esc(t)}</p>`).join("")}
        <div class="mt-8">${btnPrimary(ctx, c.heroCta)}</div>
      </div>
    </div>
    <div class="relative overflow-hidden" style="min-height:44vh">${img(ctx, 30, 1400, 1600, "absolute inset-0 h-full w-full object-cover leo-kenburns")}</div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F4 — bento（便当格栅）：不规则大小圆角块拼成面板墙。
// ═══════════════════════════════════════════════════════════════════
function sigBentoHero(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const tile = (extra: string, inner: string) =>
    `<div class="relative overflow-hidden ${extra}" style="border-radius:${R.card}">${inner}</div>`;
  const stat0 = c.stats[0], stat1 = c.stats[1];
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4" style="grid-auto-rows:minmax(9rem,auto)">
      ${tile("col-span-2 md:col-span-2 row-span-2 p-8 flex flex-col justify-between text-white leo-grad-anim",
        `<div style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});position:absolute;inset:0"></div>
         <div class="relative"><div class="text-xs tracking-widest uppercase text-white/80">${esc(kicker(ctx))}</div>
         <h1 class="mt-4" style="font-weight:800;line-height:1.06;font-size:clamp(1.9rem,4vw,3.2rem)">${esc(c.heroTitle)}</h1></div>
         <p class="relative mt-4 text-white/85">${esc(c.heroSubtitle)}</p>`)}
      ${tile("col-span-2 md:col-span-2 row-span-1", img(ctx, 0, 1200, 600, "h-full w-full object-cover", "min-height:9rem"))}
      ${tile("p-6 flex flex-col justify-center", `<div style="background:#fff;position:absolute;inset:0;border:1px solid #0000000d"></div><div class="relative"><div class="text-3xl font-extrabold" style="color:${p.primary}">${esc(stat0?.value ?? "10+")}</div><div class="mt-1 text-sm" style="color:${p.sub}">${esc(stat0?.label ?? "")}</div></div>`)}
      ${tile("p-6 flex flex-col justify-center text-white", `<div style="background:${p.ink};position:absolute;inset:0"></div><div class="relative"><div class="text-3xl font-extrabold">${esc(stat1?.value ?? "99%")}</div><div class="mt-1 text-sm text-white/70">${esc(stat1?.label ?? "")}</div></div>`)}
    </div>
  </div></section>`;
}

function sigBentoFeatures(ctx: Ctx): string {
  const { c, p, R } = ctx;
  const feats = c.features.slice(0, 5);
  const big = feats[0];
  const rest = feats.slice(1, 5);
  const cells = rest.map((f) => `<div class="p-6" style="background:#fff;border:1px solid #0000000d;border-radius:${R.card}">
    <div class="flex h-10 w-10 items-center justify-center" style="background:${p.soft};color:${p.primary};border-radius:${R.btn}">${svgIcon(f.icon, p.primary, 20)}</div>
    <h3 class="mt-4 font-semibold" style="color:${p.ink}">${esc(f.title)}</h3>
    <p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(f.desc)}</p>
  </div>`).join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    ${heading(ctx, c.featuresTitle, c.featuresSubtitle)}
    <div class="mt-12 grid md:grid-cols-3 gap-4">
      <div class="md:row-span-2 p-8 text-white flex flex-col justify-between leo-grad-anim" style="background:linear-gradient(160deg,${p.gradFrom},${p.gradTo});border-radius:${R.card};min-height:16rem">
        <div><div class="flex h-12 w-12 items-center justify-center bg-white/20" style="border-radius:${R.btn}">${svgIcon(big?.icon ?? GLYPHS[0], "#fff", 26)}</div><h3 class="mt-5 text-2xl font-bold">${esc(big?.title ?? "")}</h3></div>
        <p class="mt-4 text-white/85 leading-relaxed">${esc(big?.desc ?? "")}</p>
      </div>
      ${cells}
    </div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F5 — brutalist（粗野主义）：粗黑描边 + 硬阴影 + 撞色 + 直角。
// ═══════════════════════════════════════════════════════════════════
function sigBrutalHero(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section class="leo-noise" style="position:relative;background:${p.gradFrom};border-bottom:4px solid ${p.ink};${sectionPad(ctx)}">
    <div class="max-w-6xl mx-auto px-6">
      <div class="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest" style="background:${p.ink};color:#fff">${esc(kicker(ctx))}</div>
      <h1 class="mt-6" style="font-weight:900;line-height:0.98;letter-spacing:-.02em;font-size:clamp(2.8rem,8vw,6rem);color:${p.ink};text-transform:uppercase">${esc(c.heroTitle)}</h1>
      <div class="mt-8 grid md:grid-cols-3 gap-6 items-start">
        <p class="md:col-span-2 text-lg font-medium" style="color:${p.ink}">${esc(c.heroSubtitle)}</p>
        <div class="flex">
          <a href="#" data-go="contact" class="leo-hard-shadow inline-block px-7 py-3.5 font-black uppercase" style="background:${p.primary};color:#fff;border:3px solid ${p.ink}">${esc(c.heroCta)}</a>
        </div>
      </div>
      <div class="mt-10 overflow-hidden leo-hard-shadow" style="border:3px solid ${p.ink}">${img(ctx, 0, 1600, 700, "w-full object-cover", "height:min(46vh,26rem)")}</div>
    </div>
  </section>`;
}

function sigBrutalCards(ctx: Ctx): string {
  const { c, p } = ctx;
  const items = c.services.length ? c.services : c.features.map((f) => ({ name: f.title, desc: f.desc }));
  const colors = [p.primary, p.ink, p.gradTo, p.primaryDark];
  const cards = items.slice(0, 6).map((it, i) => {
    const bg = i % 2 === 0 ? "#fff" : colors[i % colors.length];
    const fg = i % 2 === 0 ? p.ink : "#fff";
    return `<div class="p-6 leo-hard-shadow" style="background:${bg};color:${fg};border:3px solid ${p.ink}">
      <div class="text-2xl font-black">0${i + 1}</div>
      <h3 class="mt-3 text-lg font-black uppercase">${esc(it.name)}</h3>
      <p class="mt-2 text-sm font-medium" style="opacity:.9">${esc(it.desc)}</p>
    </div>`;
  }).join("");
  return `<section style="background:${p.soft};border-top:4px solid ${p.ink};border-bottom:4px solid ${p.ink};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <h2 style="font-weight:900;text-transform:uppercase;letter-spacing:-.01em;font-size:clamp(1.8rem,4vw,3rem);color:${p.ink}">${esc(c.servicesTitle)}</h2>
    <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>
  </div></section>`;
}

function sigStickerCta(ctx: Ctx): string {
  const { c, p } = ctx;
  return `<section style="background:${p.primary};border-top:4px solid ${p.ink};${sectionPad(ctx)}"><div class="max-w-4xl mx-auto px-6 text-center">
    <h2 style="font-weight:900;text-transform:uppercase;line-height:1;font-size:clamp(2rem,6vw,4rem);color:#fff;text-shadow:3px 3px 0 ${p.ink}">${esc(c.ctaTitle)}</h2>
    <p class="mt-5 text-lg font-medium" style="color:#fff">${esc(c.ctaSubtitle)}</p>
    <div class="mt-8">
      <a href="tel:${esc(c.contactPhone)}" class="leo-hard-shadow inline-block px-9 py-4 text-lg font-black uppercase" style="background:#fff;color:${p.ink};border:3px solid ${p.ink}">${esc(c.ctaButton)}</a>
    </div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F6 — paper（素白）：六栏索引墙，靠留白与竖向细线建立秩序，不借卡片造层级。
// ═══════════════════════════════════════════════════════════════════
function sigPaperIndex(ctx: Ctx): string {
  const { c, p } = ctx;
  const columns = c.features.slice(0, 6).map((feature, i) => `<div class="px-5 py-6" style="flex:1 0 10rem;border-left:1px solid ${p.ink}26;min-height:15rem">
    <div class="text-xs tracking-widest" style="color:${p.sub}">${String(i + 1).padStart(2, "0")} / 06</div>
    <h3 class="mt-10 text-lg font-semibold" style="color:${p.ink}">${esc(feature.title)}</h3>
    <p class="mt-4 text-sm leading-relaxed" style="color:${p.sub}">${esc(feature.desc)}</p>
  </div>`).join("");
  return `<section style="background:#fff;${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="flex flex-col md:flex-row justify-between gap-6" style="border-bottom:1px solid ${p.ink}33;padding-bottom:2rem">
      <div><div class="text-xs tracking-widest uppercase" style="color:${p.sub}">${esc(kicker(ctx))}</div><h2 class="mt-4" style="font-size:clamp(2rem,4vw,3.4rem);font-weight:650;letter-spacing:-.02em;color:${p.ink}">${esc(c.featuresTitle)}</h2></div>
      <p class="max-w-md text-sm leading-relaxed" style="color:${p.sub}">${esc(c.featuresSubtitle)}</p>
    </div>
    <div class="mt-10 flex overflow-x-auto" style="border-right:1px solid ${p.ink}26">${columns}</div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F7 — nature（自然）：沿一条生长路径错落排布的圆润叶片节点。
// ═══════════════════════════════════════════════════════════════════
function sigNatureTrail(ctx: Ctx): string {
  const { c, p } = ctx;
  const leaves = c.features.slice(0, 6).map((feature, i) => `<div class="relative p-6" style="${i % 2 ? "margin-top:2.5rem;" : ""}background:#ffffffb8;border:1px solid ${p.primary}26;border-radius:${i % 2 ? "4rem 1.5rem 4rem 1.5rem" : "1.5rem 4rem 1.5rem 4rem"};box-shadow:0 16px 38px ${p.primary}12">
    <div class="flex h-12 w-12 items-center justify-center" style="background:${p.soft};border:1px solid ${p.primary}30;border-radius:50% 50% 46% 54%">${svgIcon(feature.icon || GLYPHS[i % GLYPHS.length], p.primary, 22)}</div>
    <h3 class="mt-5 text-lg font-semibold" style="color:${p.ink}">${esc(feature.title)}</h3>
    <p class="mt-2 text-sm leading-relaxed" style="color:${p.sub}">${esc(feature.desc)}</p>
  </div>`).join("");
  return `<section class="relative overflow-hidden" style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="grid lg:grid-cols-2 gap-10 items-start">
      <div><div class="text-xs tracking-widest uppercase" style="color:${p.primary}">${esc(kicker(ctx))}</div><h2 class="mt-4" style="font-family:Georgia,'Songti SC',serif;font-size:clamp(2rem,4vw,3.2rem);line-height:1.12;color:${p.ink}">${esc(c.featuresTitle)}</h2><p class="mt-5 leading-relaxed" style="color:${p.sub}">${esc(c.featuresSubtitle)}</p><div class="mt-8" style="width:5rem;height:2px;background:${p.primary}"></div></div>
      <div class="relative"><div class="absolute" style="left:50%;top:1rem;bottom:1rem;width:1px;background:linear-gradient(${p.primary}00,${p.primary}55,${p.primary}00)"></div><div class="relative grid sm:grid-cols-2 gap-5">${leaves}</div></div>
    </div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F8 — sand（暖砂）：手作台上的叠纸工单，虚线装订与轻微错位保留手工痕迹。
// ═══════════════════════════════════════════════════════════════════
function sigSandWorkshop(ctx: Ctx): string {
  const { c, p } = ctx;
  const rows = c.features.slice(0, 6).map((feature, i) => `<div class="grid gap-4 py-5" style="grid-template-columns:3.25rem minmax(0,1fr);border-bottom:1px dashed ${p.ink}38">
    <div class="flex h-9 w-9 items-center justify-center text-xs font-bold" style="border:1px solid ${p.ink}55;border-radius:9999px;color:${p.ink}">${String(i + 1).padStart(2, "0")}</div>
    <div><h3 class="font-semibold" style="color:${p.ink}">${esc(feature.title)}</h3><p class="mt-1 text-sm leading-relaxed" style="color:${p.sub}">${esc(feature.desc)}</p></div>
  </div>`).join("");
  return `<section style="background:${p.soft};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="grid lg:grid-cols-12 gap-10 items-center">
      <div class="lg:col-span-4"><div class="text-xs tracking-widest uppercase" style="color:${p.primary}">${esc(kicker(ctx))}</div><h2 class="mt-4" style="font-family:Georgia,'Songti SC',serif;font-size:clamp(2.1rem,4.2vw,3.5rem);line-height:1.08;color:${p.ink}">${esc(c.featuresTitle)}</h2><p class="mt-5 leading-relaxed" style="color:${p.sub}">${esc(c.featuresSubtitle)}</p></div>
      <div class="relative lg:col-span-8" style="padding:1rem">
        <div class="absolute inset-0" style="background:${p.primary}16;border:1px solid ${p.primary}25;transform:rotate(2.2deg)"></div>
        <div class="absolute inset-0" style="background:#fff8;border:1px solid ${p.ink}18;transform:rotate(-1.4deg)"></div>
        <div class="relative p-8" style="background:#fffdf7;border:1px solid ${p.ink}2e;box-shadow:0 20px 45px ${p.ink}12">${rows}</div>
      </div>
    </div>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════════
// F9 — navy（深蓝）：左侧编号导轨 + 横向简报表，像一页决策看板而非卡片墙。
// ═══════════════════════════════════════════════════════════════════
function sigNavyBriefing(ctx: Ctx): string {
  const { c, p } = ctx;
  const rows = c.features.slice(0, 6).map((feature, i) => `<div class="grid md:grid-cols-3 gap-4 items-start py-6" style="border-top:1px solid #ffffff24">
    <div><div class="text-xs tracking-widest" style="color:${p.accent}">BRIEF / ${String(i + 1).padStart(2, "0")}</div><h3 class="mt-3 text-lg font-semibold text-white">${esc(feature.title)}</h3></div>
    <p class="md:col-span-2 text-sm leading-relaxed" style="color:#ffffffb8">${esc(feature.desc)}</p>
  </div>`).join("");
  return `<section style="background:${p.ink};${sectionPad(ctx)}"><div class="max-w-6xl mx-auto px-6">
    <div class="grid lg:grid-cols-2 gap-8">
      <div style="border-left:4px solid ${p.primary};padding-left:1.5rem"><div class="text-xs tracking-widest uppercase" style="color:${p.accent}">${esc(kicker(ctx))}</div><h2 class="mt-5 text-white" style="font-size:clamp(2rem,4vw,3.2rem);line-height:1.08;font-weight:750">${esc(c.featuresTitle)}</h2><p class="mt-5 text-sm leading-relaxed" style="color:#ffffffa8">${esc(c.featuresSubtitle)}</p></div>
      <div style="border-bottom:1px solid #ffffff24">${rows}</div>
    </div>
  </div></section>`;
}

const SIGNATURE_RENDERERS = {
  sigPaperIndex,
  sigEditorialHero,
  sigEditorialFeature,
  sigEditorialGallery,
  sigPullQuote,
  sigNeonHero,
  sigGlassGrid,
  sigNeonStats,
  sigCodeWindow,
  sigFsIntro,
  sigFsPanel,
  sigFsSplit,
  sigBentoHero,
  sigBentoFeatures,
  sigBrutalHero,
  sigBrutalCards,
  sigStickerCta,
  sigNatureTrail,
  sigSandWorkshop,
  sigNavyBriefing,
} satisfies Record<SignatureSectionKind, (ctx: Ctx, pageLabel: string) => string>;
