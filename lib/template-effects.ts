// 网站模板视觉特效层（v2.1）—— 对标微站类模板库的「渐变流动 / 滚动显现 / 装饰光斑」。
// 由 slug + DNA 确定性选取，每个模板至少有一种专属动效组合。

import type { PaletteV2, TemplateDNA } from "./template-dna";
import { hashStr } from "./hash";

export type AccentFx =
  | "orbs"
  | "mesh"
  | "grid"
  | "beams"
  | "waves"
  | "dots"
  | "rings"
  // v4 潮流通用特效（灵感来源：react-bits / arc-animations / magic-ui，均为纯 CSS
  // 移植——不引第三方运行时依赖，避开 animate.css(Hippocratic)/Hover.css(商用付费)
  // 的许可证坑。分三种气质：华丽 / 极简 / 卡通可爱）
  | "aurora" // 极光流动网格渐变（华丽·极简皆宜）
  | "blobs" // 有机形态缓慢变形的大色块（现代·柔和）
  | "constellation" // 星座连线点阵（科技·极简）
  | "shimmer" // 斜向光泽扫过（精致微交互）
  | "confetti" // 五彩纸屑漂浮（卡通可爱·活动/庆典）
  | "sparkle" // 星光点点闪烁（可爱·灵动）
  | "stripes" // 斜纹动态条带（波普·活泼）
  // v3 特色家族专属特效
  | "neon-grid"
  | "noise"
  | "spotlight"
  | "none";

// 普通家族随机轮换池（v4：把 7 个潮流特效并入，让每个模板一眼更「潮」）。
const FX_LIST: AccentFx[] = [
  "orbs", "mesh", "grid", "beams", "waves", "dots", "rings",
  "aurora", "blobs", "constellation", "shimmer", "confetti", "sparkle", "stripes",
];

export function accentFxFor(slug: string, layoutKey: string): AccentFx {
  const layoutBias: Record<string, AccentFx> = {
    corporate: "grid",
    agency: "mesh",
    commerce: "orbs",
    restaurant: "waves",
    portfolio: "beams",
    clinic: "dots",
    education: "rings",
    minimal: "grid",
  };
  const base = layoutBias[layoutKey] ?? "orbs";
  const i = FX_LIST.indexOf(base);
  return FX_LIST[(i + hashStr(slug + ":fx")) % FX_LIST.length];
}

/** 注入到 <head> 的全局动效 CSS（配色 token 来自当前模板 palette）。 */
export function effectsStyles(p: PaletteV2): string {
  return `
  /* —— 渐变流动（hero / CTA / 页头） —— */
  .leo-grad-anim{
    background-size:220% 220%;
    animation:leoGradShift 9s ease-in-out infinite;
  }
  @keyframes leoGradShift{
    0%{background-position:0% 42%}
    50%{background-position:100% 58%}
    100%{background-position:0% 42%}
  }

  /* —— 滚动显现（对标微站「滑动显示」） —— */
  .leo-reveal{
    opacity:0;
    transform:translateY(32px);
    transition:opacity .75s cubic-bezier(.22,1,.36,1),transform .75s cubic-bezier(.22,1,.36,1);
  }
  .leo-reveal.leo-from-left{transform:translateX(-36px)}
  .leo-reveal.leo-from-right{transform:translateX(36px)}
  .leo-reveal.leo-scale{transform:scale(.94)}
  .leo-reveal.leo-in{
    opacity:1;
    transform:none;
  }

  /* —— 卡片悬停微动效 —— */
  .leo-card{
    transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s ease;
  }
  .leo-card:hover{
    transform:translateY(-6px);
    box-shadow:0 20px 40px ${p.primary}22;
  }

  /* —— 按钮光泽扫过 —— */
  .leo-btn-shine{position:relative;overflow:hidden}
  .leo-btn-shine::after{
    content:"";
    position:absolute;inset:0;
    background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.35) 50%,transparent 60%);
    transform:translateX(-120%);
    animation:leoShine 4s ease-in-out infinite;
  }
  @keyframes leoShine{
    0%,55%{transform:translateX(-120%)}
    75%,100%{transform:translateX(120%)}
  }

  /* —— 装饰层浮动 —— */
  .leo-orb{position:absolute;border-radius:9999px;filter:blur(48px);pointer-events:none;animation:leoFloat 12s ease-in-out infinite}
  .leo-orb-2{animation-delay:-4s;animation-duration:15s}
  .leo-orb-3{animation-delay:-7s;animation-duration:18s}
  @keyframes leoFloat{
    0%,100%{transform:translate(0,0) scale(1)}
    33%{transform:translate(12px,-18px) scale(1.06)}
    66%{transform:translate(-10px,14px) scale(.94)}
  }

  .leo-grid-deco{
    position:absolute;inset:0;pointer-events:none;opacity:.12;
    background-image:linear-gradient(${p.primary}55 1px,transparent 1px),linear-gradient(90deg,${p.primary}55 1px,transparent 1px);
    background-size:48px 48px;
    mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 20%,transparent 75%);
  }

  .leo-beam{
    position:absolute;width:2px;height:140%;top:-20%;left:30%;
    background:linear-gradient(180deg,transparent,${p.accent}88,transparent);
    transform:rotate(25deg);animation:leoBeam 6s ease-in-out infinite;pointer-events:none;
  }
  @keyframes leoBeam{
    0%,100%{opacity:.25;transform:rotate(25deg) translateY(0)}
    50%{opacity:.55;transform:rotate(25deg) translateY(8%)}
  }

  .leo-wave{
    position:absolute;bottom:0;left:0;right:0;height:80px;pointer-events:none;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120'%3E%3Cpath fill='${encodeURIComponent(p.soft)}' d='M0,64 C300,120 500,0 600,48 C700,96 900,32 1200,64 L1200,120 L0,120 Z'/%3E%3C/svg%3E") center bottom/cover no-repeat;
    animation:leoWave 8s ease-in-out infinite alternate;
  }
  @keyframes leoWave{from{transform:translateX(-2%)}to{transform:translateX(2%)}}

  /* —— 数字条计数显现 —— */
  .leo-stat-num{display:inline-block;animation:leoPop .6s cubic-bezier(.22,1,.36,1) both}
  @keyframes leoPop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}

  /* —— logo 条缓慢滚动 —— */
  .leo-marquee{display:flex;width:max-content;animation:leoMarquee 28s linear infinite}
  @keyframes leoMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

  /* —— 图片缓慢放大（hero 背景） —— */
  .leo-kenburns{animation:leoKen 22s ease-in-out infinite alternate}
  @keyframes leoKen{from{transform:scale(1)}to{transform:scale(1.08)}}

  /* —— v3 霓虹网格（neon-tech 家族深色底专用） —— */
  .leo-neon-grid{
    position:absolute;inset:0;pointer-events:none;
    background-image:linear-gradient(${p.primary}22 1px,transparent 1px),linear-gradient(90deg,${p.primary}22 1px,transparent 1px);
    background-size:44px 44px;
    mask-image:radial-gradient(ellipse 90% 80% at 50% 30%,#000 10%,transparent 78%);
    animation:leoGridPan 20s linear infinite;
  }
  @keyframes leoGridPan{from{background-position:0 0}to{background-position:44px 44px}}
  .leo-neon-glow{
    text-shadow:0 0 6px ${p.primary}88,0 0 20px ${p.primary}55;
  }
  .leo-neon-edge{
    border:1px solid ${p.primary}55;
    box-shadow:0 0 0 1px ${p.primary}22,0 0 24px ${p.primary}22,inset 0 0 22px ${p.primary}10;
  }
  .leo-glass{
    background:rgba(255,255,255,.06);
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,.12);
  }

  /* —— v3 颗粒噪点（editorial / brutalist 质感） —— */
  .leo-noise::before{
    content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  /* —— v3 聚光（fullscreen-scroll 家族） —— */
  .leo-spotlight{
    position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(circle 60% at 50% 0%,${p.primary}22,transparent 60%);
  }

  /* —— v3 硬阴影（brutalist 家族） —— */
  .leo-hard-shadow{box-shadow:6px 6px 0 ${p.ink}}
  .leo-hard-shadow-primary{box-shadow:6px 6px 0 ${p.primary}}

  /* ═══ v4 潮流通用特效（纯 CSS，移植自 react-bits / arc-animations 观感） ═══ */

  /* 极光：多层大径向渐变缓慢漂移 + 混合，营造流动光幕 */
  .leo-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;filter:blur(10px)}
  .leo-aurora::before,.leo-aurora::after{content:"";position:absolute;inset:-40%;
    background:
      radial-gradient(40% 55% at 25% 30%,${p.primary}66,transparent 60%),
      radial-gradient(45% 60% at 75% 35%,${p.gradTo}59,transparent 62%),
      radial-gradient(50% 55% at 55% 78%,${p.accent}4d,transparent 60%);
    animation:leoAurora 18s ease-in-out infinite;mix-blend-mode:screen}
  .leo-aurora::after{animation-duration:26s;animation-direction:reverse;opacity:.7}
  @keyframes leoAurora{
    0%,100%{transform:translate3d(0,0,0) rotate(0deg) scale(1)}
    33%{transform:translate3d(3%,-4%,0) rotate(6deg) scale(1.08)}
    66%{transform:translate3d(-4%,3%,0) rotate(-5deg) scale(1.04)}
  }

  /* 有机变形色块：border-radius 动画的柔和大 blob */
  .leo-blob{position:absolute;pointer-events:none;filter:blur(26px);opacity:.5;
    animation:leoBlobMorph 16s ease-in-out infinite,leoFloat 18s ease-in-out infinite}
  @keyframes leoBlobMorph{
    0%,100%{border-radius:42% 58% 63% 37%/45% 42% 58% 55%}
    50%{border-radius:58% 42% 38% 62%/58% 55% 45% 42%}
  }

  /* 星座连线：点阵 + 斜向缓移（连线用一层细网格暗示） */
  .leo-constellation{position:absolute;inset:0;pointer-events:none;opacity:.5;
    background-image:radial-gradient(${p.accent}cc 1.4px,transparent 1.6px),radial-gradient(${p.primary}99 1px,transparent 1.4px);
    background-size:52px 52px,88px 88px;background-position:0 0,26px 26px;
    animation:leoConstel 40s linear infinite;
    mask-image:radial-gradient(ellipse 85% 75% at 50% 40%,#000 30%,transparent 80%)}
  @keyframes leoConstel{from{background-position:0 0,26px 26px}to{background-position:52px 52px,114px 114px}}

  /* 斜向光泽扫过整块（hero 上叠一层 sheen） */
  .leo-sheen{position:absolute;inset:0;pointer-events:none;overflow:hidden}
  .leo-sheen::after{content:"";position:absolute;top:-50%;left:-60%;width:50%;height:200%;
    background:linear-gradient(105deg,transparent,rgba(255,255,255,.22),transparent);
    transform:rotate(8deg);animation:leoSheen 6.5s ease-in-out infinite}
  @keyframes leoSheen{0%,60%{left:-60%}100%{left:130%}}

  /* 五彩纸屑：多个小方片缓慢下落漂浮（卡通/庆典） */
  .leo-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}
  .leo-confetti i{position:absolute;top:-12%;width:9px;height:14px;opacity:.85;border-radius:2px;
    animation:leoConfFall linear infinite}
  @keyframes leoConfFall{
    0%{transform:translateY(-20%) rotate(0deg)}
    100%{transform:translateY(120vh) rotate(540deg)}
  }

  /* 星光闪烁：小四角星随机呼吸 */
  .leo-sparkle{position:absolute;inset:0;pointer-events:none}
  .leo-sparkle i{position:absolute;width:14px;height:14px;
    background:radial-gradient(${p.accent},transparent 62%);
    animation:leoTwinkle 3.2s ease-in-out infinite}
  .leo-sparkle i::before{content:"";position:absolute;inset:0;
    background:conic-gradient(from 0deg,transparent,${p.accent},transparent,${p.accent},transparent);
    clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)}
  @keyframes leoTwinkle{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}

  /* 斜纹动态条带（波普·活泼），低透明度不抢内容 */
  .leo-stripes{position:absolute;inset:0;pointer-events:none;opacity:.12;
    background:repeating-linear-gradient(45deg,${p.primary} 0 18px,transparent 18px 40px);
    animation:leoStripes 3s linear infinite;
    mask-image:linear-gradient(180deg,#000,transparent 85%)}
  @keyframes leoStripes{from{background-position:0 0}to{background-position:57px 0}}

  /* —— v3 满屏叙事：右侧滚动圆点 + snap —— */
  .leo-fs-dots{position:fixed;right:18px;top:50%;transform:translateY(-50%);z-index:40;display:flex;flex-direction:column;gap:12px}
  .leo-fs-dot{width:9px;height:9px;border-radius:9999px;background:currentColor;opacity:.3;transition:opacity .3s,transform .3s;cursor:pointer}
  .leo-fs-dot.active{opacity:1;transform:scale(1.4)}

  @media (prefers-reduced-motion:reduce){
    .leo-grad-anim,.leo-orb,.leo-beam,.leo-wave,.leo-marquee,.leo-kenburns,.leo-btn-shine::after,.leo-neon-grid,
    .leo-aurora::before,.leo-aurora::after,.leo-blob,.leo-constellation,.leo-sheen::after,
    .leo-confetti i,.leo-sparkle i,.leo-stripes{animation:none!important}
    .leo-reveal{opacity:1;transform:none}
  }`;
}

/** Hero / CTA / 页头背后的装饰 HTML（按 accentFx 不同）。 */
export function decorLayer(p: PaletteV2, fx: AccentFx, seed: number): string {
  const a = p.primary;
  const b = p.accent;
  const c = p.gradTo;
  switch (fx) {
    case "orbs":
      return `
      <div class="leo-orb" style="width:280px;height:280px;top:-60px;right:-40px;background:${a}55"></div>
      <div class="leo-orb leo-orb-2" style="width:200px;height:200px;bottom:10%;left:-30px;background:${b}44"></div>
      <div class="leo-orb leo-orb-3" style="width:160px;height:160px;top:40%;right:25%;background:${c}33"></div>`;
    case "mesh":
      return `
      <div class="leo-grid-deco"></div>
      <div class="leo-orb" style="width:320px;height:320px;top:20%;left:50%;background:conic-gradient(from 120deg,${a}44,${b}33,${c}44)"></div>`;
    case "grid":
      return `<div class="leo-grid-deco" style="opacity:.18"></div>`;
    case "beams":
      return `<div class="leo-beam"></div><div class="leo-beam" style="left:62%;animation-delay:-2s"></div>`;
    case "waves":
      return `<div class="leo-wave"></div>`;
    case "dots":
      return `<div style="position:absolute;inset:0;pointer-events:none;opacity:.15;background-image:radial-gradient(${a} 1.5px,transparent 1.5px);background-size:28px 28px"></div>`;
    case "rings":
      return `
      <div style="position:absolute;top:12%;right:8%;width:180px;height:180px;border:2px solid ${a}33;border-radius:9999px;animation:leoFloat 14s ease-in-out infinite"></div>
      <div style="position:absolute;bottom:18%;left:6%;width:120px;height:120px;border:2px solid ${b}44;border-radius:9999px;animation:leoFloat 11s ease-in-out infinite;animation-delay:-3s"></div>`;
    case "neon-grid":
      return `
      <div class="leo-neon-grid"></div>
      <div class="leo-orb" style="width:340px;height:340px;top:-80px;right:8%;background:radial-gradient(circle,${a}44,transparent 70%);filter:blur(60px)"></div>
      <div class="leo-orb leo-orb-2" style="width:260px;height:260px;bottom:-60px;left:10%;background:radial-gradient(circle,${b}33,transparent 70%);filter:blur(60px)"></div>`;
    case "spotlight":
      return `<div class="leo-spotlight"></div>`;
    case "noise":
      return `<div class="leo-noise" style="position:absolute;inset:0"></div>`;
    // ————— v4 潮流通用特效 —————
    case "aurora":
      return `<div class="leo-aurora"></div>`;
    case "blobs":
      return `
      <div class="leo-blob" style="width:340px;height:340px;top:-70px;right:-40px;background:${a}"></div>
      <div class="leo-blob leo-orb-2" style="width:260px;height:260px;bottom:-60px;left:-30px;background:${c};animation-delay:-6s"></div>
      <div class="leo-blob leo-orb-3" style="width:190px;height:190px;top:38%;right:22%;background:${b};animation-delay:-10s"></div>`;
    case "constellation":
      return `<div class="leo-constellation"></div>`;
    case "shimmer":
      return `<div class="leo-sheen"></div>`;
    case "confetti": {
      const cols = [a, b, c, "#fff"];
      const pieces = Array.from({ length: 16 }, (_, i) => {
        const left = ((hashStr("conf" + seed + i) % 100));
        const dur = 6 + (hashStr("cd" + seed + i) % 8);
        const delay = -(hashStr("cdl" + seed + i) % 10);
        const col = cols[i % cols.length];
        return `<i style="left:${left}%;background:${col};animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
      }).join("");
      return `<div class="leo-confetti">${pieces}</div>`;
    }
    case "sparkle": {
      const stars = Array.from({ length: 12 }, (_, i) => {
        const left = hashStr("spx" + seed + i) % 100;
        const top = hashStr("spy" + seed + i) % 100;
        const delay = -(hashStr("spd" + seed + i) % 32) / 10;
        const scale = 0.6 + (hashStr("sps" + seed + i) % 10) / 10;
        return `<i style="left:${left}%;top:${top}%;transform:scale(${scale.toFixed(2)});animation-delay:${delay}s"></i>`;
      }).join("");
      return `<div class="leo-sparkle">${stars}</div>`;
    }
    case "stripes":
      return `<div class="leo-stripes"></div>`;
    case "none":
      return "";
    default:
      return "";
  }
}

/** 滚动显现 + 切页后重新初始化的内联脚本（追加到 body 末尾 script）。 */
export function effectsScript(): string {
  return `
  function leoInitReveal(root){
    root=root||document;
    var els=root.querySelectorAll('.leo-reveal:not(.leo-in)');
    if(!els.length)return;
    if(!('IntersectionObserver' in window)){
      els.forEach(function(el){el.classList.add('leo-in');});
      return;
    }
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('leo-in');
          io.unobserve(e.target);
        }
      });
    },{threshold:0.1,rootMargin:'0px 0px -30px 0px'});
    els.forEach(function(el,i){
      el.style.transitionDelay=(i%8)*0.07+'s';
      io.observe(el);
    });
  }`;
}
