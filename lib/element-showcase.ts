// 风格元素专区「展示级」特效 —— 每个特效渲染成一份**自包含 HTML 文档**，
// 既能整页打开（/elements/<fx>）也能在灵感墙里用 <iframe> 实时预览。
//
// 为什么不直接复用 template-effects.ts 的 decorLayer：那套是「铺在 hero 文字**背后**
// 的克制装饰」，透明度/动势都刻意压得很低，单独放进一个小卡片里几乎看不出效果
// （用户反馈「太朴素」）。这里是「秀肌肉」的场景——把每个特效做到全强度、构图更满、
// 配一段仿真 hero 文案，让用户一眼就被种草。纯 CSS/内联，无第三方运行时依赖。

import { PALETTES_V2, type PaletteV2 } from "./template-dna";

export type ShowcaseFx =
  | "aurora"
  | "blobs"
  | "beams"
  | "mesh"
  | "orbs"
  | "waves"
  | "neon-grid"
  | "grid"
  | "dots"
  | "constellation"
  | "shimmer"
  | "rings"
  | "spotlight"
  | "noise"
  | "confetti"
  | "sparkle"
  | "stripes";

export type Mood = "flashy" | "minimal" | "cute";

export interface FxMeta {
  fx: ShowcaseFx;
  name: string;
  en: string;
  mood: Mood;
  desc: string;
  source: string;
  /** 建议的默认预览配色 key（挑最能凸显该特效气质的一套）。 */
  palette: string;
  /** 是否更适合深底（决定仿真 hero 文案的字色）。 */
  dark: boolean;
}

export const FX_META: FxMeta[] = [
  // —— 华丽 flashy ——
  { fx: "aurora", name: "极光流幕", en: "Aurora", mood: "flashy", desc: "多层大色幕缓慢漂移融合，像北极光在背后流动", source: "react-bits / Aurora", palette: "indigo", dark: true },
  { fx: "blobs", name: "有机色块", en: "Morphing Blobs", mood: "flashy", desc: "边缘不断变形的高饱和大色团，现代 SaaS 首页常用", source: "blobmaker / haikei", palette: "violet", dark: true },
  { fx: "beams", name: "光束", en: "Light Beams", mood: "flashy", desc: "多道彩色光束斜扫明灭，舞台聚光级视觉冲击", source: "magic-ui / beams", palette: "neon-cyan", dark: true },
  { fx: "mesh", name: "网格光斑", en: "Mesh Glow", mood: "flashy", desc: "网格叠多团锥形渐变光斑，浓郁科技氛围", source: "mesh-gradient", palette: "ocean", dark: true },
  { fx: "orbs", name: "浮动光球", en: "Floating Orbs", mood: "flashy", desc: "多枚发光大光球缓慢漂浮交叠，柔和梦幻", source: "hero-patterns", palette: "rose", dark: true },
  { fx: "waves", name: "波浪", en: "Layered Waves", mood: "flashy", desc: "多层 SVG 波浪错位涌动，适合餐饮/生活/海洋", source: "getwaves.io", palette: "teal", dark: true },
  { fx: "neon-grid", name: "霓虹网格", en: "Neon Grid", mood: "flashy", desc: "透视发光网格 + 霓虹光晕，赛博朋克风", source: "arc-animations", palette: "neon-violet", dark: true },
  // —— 极简 minimal ——
  { fx: "grid", name: "极简网格", en: "Fine Grid", mood: "minimal", desc: "等距细网格 + 径向渐隐，克制、专业、留白", source: "tailwind-patterns", palette: "paper", dark: false },
  { fx: "dots", name: "点阵", en: "Dot Grid", mood: "minimal", desc: "均匀圆点阵列，安静有秩序的底纹", source: "hero-patterns", palette: "glacier", dark: false },
  { fx: "constellation", name: "星座连线", en: "Constellation", mood: "minimal", desc: "疏密点阵 + 连线缓慢流动，暗夜星图", source: "particles.js", palette: "graphite", dark: true },
  { fx: "shimmer", name: "光泽扫过", en: "Shimmer", mood: "minimal", desc: "高光斜向反复扫过标题，精致微交互", source: "react-bits / shiny-text", palette: "gold", dark: true },
  { fx: "rings", name: "同心环", en: "Rings", mood: "minimal", desc: "多枚描边圆环轻浮动，几何留白构图", source: "geometric-bg", palette: "jade-gold", dark: true },
  { fx: "spotlight", name: "顶光", en: "Spotlight", mood: "minimal", desc: "顶部一束径向柔光聚焦，影棚打光感", source: "aceternity / spotlight", palette: "graphite", dark: true },
  { fx: "noise", name: "颗粒质感", en: "Grain", mood: "minimal", desc: "细腻胶片颗粒噪点叠渐变，editorial 高级感", source: "grainy-gradients", palette: "mocha", dark: true },
  // —— 卡通可爱 cute ——
  { fx: "confetti", name: "五彩纸屑", en: "Confetti", mood: "cute", desc: "大量彩色纸片飘落翻转，庆典/活动/大促", source: "canvas-confetti", palette: "crimson", dark: true },
  { fx: "sparkle", name: "星光闪烁", en: "Sparkle", mood: "cute", desc: "满屏四角星随机呼吸闪烁，灵动可爱", source: "react-bits / sparkles", palette: "mauve", dark: true },
  { fx: "stripes", name: "波普斜纹", en: "Pop Stripes", mood: "cute", desc: "撞色斜条带滚动 + 圆点，波普活泼", source: "css-stripes", palette: "amber", dark: true },
];

export function metaFor(fx: string): FxMeta | undefined {
  return FX_META.find((m) => m.fx === fx);
}

export function paletteByKey(key: string | null | undefined): PaletteV2 {
  return PALETTES_V2.find((p) => p.key === key) || PALETTES_V2[0];
}

// ————————————————————————————————————————————————————————————————
// 各特效的「展示级」背景层 HTML + 作用域 CSS。返回 { css, html }，由 buildDoc 组装。
// 相比 decorLayer：透明度更高、元素更多、动势更强、构图铺满。
// ————————————————————————————————————————————————————————————————

interface Layer {
  css: string;
  html: string;
}

const R = (a: number, b: number, seed: number, salt: string) => {
  // 稳定伪随机（0..1）——服务端渲染确定性，同一 fx 每次布局一致。
  let h = 2166136261;
  const s = salt + seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = ((h >>> 0) % 10000) / 10000;
  return a + (b - a) * r;
};

function layerFor(fx: ShowcaseFx, p: PaletteV2): Layer {
  const a = p.primary;
  const b = p.accent;
  const c = p.gradTo;
  switch (fx) {
    case "aurora":
      return {
        css: `
.sc-aurora{position:absolute;inset:-30%;filter:blur(40px);opacity:.95}
.sc-aurora::before,.sc-aurora::after{content:"";position:absolute;inset:0;mix-blend-mode:screen;
  background:
    radial-gradient(45% 60% at 22% 28%,${a},transparent 60%),
    radial-gradient(50% 65% at 78% 32%,${c},transparent 62%),
    radial-gradient(55% 60% at 55% 80%,${b},transparent 60%),
    radial-gradient(40% 50% at 40% 55%,${a}cc,transparent 60%);
  animation:scAurora 16s ease-in-out infinite}
.sc-aurora::after{animation-duration:24s;animation-direction:reverse;opacity:.8}
@keyframes scAurora{0%,100%{transform:translate3d(0,0,0) rotate(0) scale(1)}
  33%{transform:translate3d(4%,-6%,0) rotate(8deg) scale(1.12)}
  66%{transform:translate3d(-6%,4%,0) rotate(-7deg) scale(1.06)}}`,
        html: `<div class="sc-aurora"></div>`,
      };
    case "blobs": {
      const cols = [a, c, b, a];
      const blobs = Array.from({ length: 5 }, (_, i) => {
        const w = 260 + R(0, 220, i, "bw") * 1;
        const top = R(-10, 70, i, "bt");
        const left = R(-8, 78, i, "bl");
        const dur = 12 + R(0, 10, i, "bd");
        const del = -R(0, 12, i, "bx");
        return `<span class="sc-blob" style="width:${Math.round(w)}px;height:${Math.round(w * 0.9)}px;top:${top.toFixed(0)}%;left:${left.toFixed(0)}%;background:${cols[i % cols.length]};animation-duration:${dur.toFixed(1)}s,${(dur + 4).toFixed(1)}s;animation-delay:${del.toFixed(1)}s"></span>`;
      }).join("");
      return {
        css: `
.sc-blob{position:absolute;filter:blur(22px);opacity:.78;
  animation:scBlobMorph ease-in-out infinite,scFloat ease-in-out infinite}
@keyframes scBlobMorph{0%,100%{border-radius:42% 58% 63% 37%/45% 42% 58% 55%}
  50%{border-radius:60% 40% 34% 66%/58% 58% 42% 42%}}
@keyframes scFloat{0%,100%{transform:translate(0,0) scale(1)}
  33%{transform:translate(18px,-24px) scale(1.08)}66%{transform:translate(-16px,18px) scale(.94)}}`,
        html: `<div class="sc-wrap">${blobs}</div>`,
      };
    }
    case "beams": {
      const beams = Array.from({ length: 7 }, (_, i) => {
        const left = 8 + i * 13 + R(-3, 3, i, "ml");
        const col = [a, b, c][i % 3];
        const dur = 4 + R(0, 4, i, "md");
        const del = -R(0, 5, i, "mx");
        return `<span class="sc-beam" style="left:${left.toFixed(0)}%;background:linear-gradient(180deg,transparent,${col},transparent);animation-duration:${dur.toFixed(1)}s;animation-delay:${del.toFixed(1)}s"></span>`;
      }).join("");
      return {
        css: `
.sc-beam{position:absolute;top:-25%;width:3px;height:150%;transform:rotate(22deg);
  filter:blur(1px);opacity:.5;animation:scBeam ease-in-out infinite}
@keyframes scBeam{0%,100%{opacity:.2;transform:rotate(22deg) translateY(-4%)}
  50%{opacity:.75;transform:rotate(22deg) translateY(6%)}}`,
        html: `<div class="sc-wrap">${beams}</div>`,
      };
    }
    case "mesh":
      return {
        css: `
.sc-mesh-grid{position:absolute;inset:0;opacity:.22;
  background-image:linear-gradient(${b}66 1px,transparent 1px),linear-gradient(90deg,${b}66 1px,transparent 1px);
  background-size:40px 40px;mask-image:radial-gradient(ellipse 80% 70% at 50% 45%,#000 25%,transparent 78%)}
.sc-mesh-glow{position:absolute;border-radius:9999px;filter:blur(70px);opacity:.8;animation:scFloat 14s ease-in-out infinite}`,
        html: `<div class="sc-mesh-grid"></div>
<div class="sc-mesh-glow" style="width:420px;height:420px;top:-10%;left:8%;background:conic-gradient(from 120deg,${a},${b},${c},${a})"></div>
<div class="sc-mesh-glow" style="width:340px;height:340px;bottom:-14%;right:6%;background:radial-gradient(circle,${c},transparent 70%);animation-delay:-5s"></div>`,
      };
    case "orbs": {
      const orbs = [
        { w: 380, t: "-14%", l: "-6%", col: a, d: "" },
        { w: 300, t: "auto", b: "-12%", l: "58%", col: c, d: "-4s" },
        { w: 240, t: "34%", l: "30%", col: b, d: "-7s" },
        { w: 200, t: "10%", l: "72%", col: a, d: "-2s" },
      ];
      const html = orbs
        .map(
          (o) =>
            `<span class="sc-orb" style="width:${o.w}px;height:${o.w}px;${o.t !== "auto" ? `top:${o.t}` : `bottom:${o.b}`};left:${o.l};background:radial-gradient(circle,${o.col},transparent 70%);animation-delay:${o.d}"></span>`,
        )
        .join("");
      return {
        css: `
.sc-orb{position:absolute;border-radius:9999px;filter:blur(46px);opacity:.7;animation:scFloat 12s ease-in-out infinite}`,
        html: `<div class="sc-wrap">${html}</div>`,
      };
    }
    case "waves":
      return {
        css: `
.sc-wave{position:absolute;left:-10%;right:-10%;bottom:0;height:46%;animation:scWave 9s ease-in-out infinite alternate}
.sc-wave.w2{height:34%;opacity:.7;animation-duration:11s;animation-direction:alternate-reverse}
.sc-wave.w3{height:24%;opacity:.5;animation-duration:13s}
@keyframes scWave{from{transform:translateX(-3%)}to{transform:translateX(3%)}}`,
        html: `
<div class="sc-wave" style="background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 200' preserveAspectRatio='none'%3E%3Cpath fill='${enc(a)}' d='M0,90 C300,180 500,10 600,70 C700,130 900,30 1200,90 L1200,200 L0,200 Z'/%3E%3C/svg%3E&quot;) center bottom/100% 100% no-repeat"></div>
<div class="sc-wave w2" style="background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 200' preserveAspectRatio='none'%3E%3Cpath fill='${enc(c)}' d='M0,110 C250,50 450,150 600,100 C780,45 950,150 1200,100 L1200,200 L0,200 Z'/%3E%3C/svg%3E&quot;) center bottom/100% 100% no-repeat"></div>
<div class="sc-wave w3" style="background:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 200' preserveAspectRatio='none'%3E%3Cpath fill='${enc(b)}' d='M0,130 C300,170 500,90 600,120 C720,155 950,95 1200,130 L1200,200 L0,200 Z'/%3E%3C/svg%3E&quot;) center bottom/100% 100% no-repeat"></div>`,
      };
    case "neon-grid":
      return {
        css: `
.sc-neongrid{position:absolute;inset:0;
  background-image:linear-gradient(${a}55 1px,transparent 1px),linear-gradient(90deg,${a}55 1px,transparent 1px);
  background-size:50px 50px;transform:perspective(500px) rotateX(58deg);transform-origin:50% 100%;
  mask-image:linear-gradient(180deg,transparent,#000 60%);animation:scNeonPan 6s linear infinite}
@keyframes scNeonPan{from{background-position:0 0}to{background-position:0 50px}}
.sc-neonglow{position:absolute;border-radius:9999px;filter:blur(80px);opacity:.7}`,
        html: `<div class="sc-neonglow" style="width:420px;height:280px;top:-8%;left:24%;background:radial-gradient(circle,${a},transparent 70%)"></div>
<div class="sc-neongrid"></div>`,
      };
    case "grid":
      return {
        css: `
.sc-fgrid{position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(${a}22 1px,transparent 1px),linear-gradient(90deg,${a}22 1px,transparent 1px);
  background-size:38px 38px;mask-image:radial-gradient(ellipse 75% 65% at 50% 45%,#000 20%,transparent 78%);
  animation:scGridPan 30s linear infinite}
@keyframes scGridPan{from{background-position:0 0}to{background-position:38px 38px}}`,
        html: `<div class="sc-fgrid"></div>`,
      };
    case "dots":
      return {
        css: `
.sc-dots{position:absolute;inset:0;opacity:.55;
  background-image:radial-gradient(${a}88 1.8px,transparent 2px);background-size:26px 26px;
  mask-image:radial-gradient(ellipse 78% 70% at 50% 45%,#000 25%,transparent 80%);
  animation:scDots 24s linear infinite}
@keyframes scDots{from{background-position:0 0}to{background-position:26px 26px}}`,
        html: `<div class="sc-dots"></div>`,
      };
    case "constellation":
      return {
        css: `
.sc-const{position:absolute;inset:0;opacity:.85;
  background-image:radial-gradient(${b}cc 1.6px,transparent 2px),radial-gradient(${a}aa 1.2px,transparent 1.8px);
  background-size:60px 60px,100px 100px;background-position:0 0,30px 30px;
  mask-image:radial-gradient(ellipse 85% 75% at 50% 45%,#000 30%,transparent 82%);
  animation:scConst 36s linear infinite}
@keyframes scConst{from{background-position:0 0,30px 30px}to{background-position:60px 60px,130px 130px}}
.sc-const-line{position:absolute;inset:0;opacity:.14;
  background-image:linear-gradient(60deg,transparent 49%,${b} 50%,transparent 51%);background-size:120px 120px}`,
        html: `<div class="sc-const"></div><div class="sc-const-line"></div>`,
      };
    case "shimmer":
      return {
        css: `
.sc-sheen{position:absolute;inset:0;overflow:hidden}
.sc-sheen::after{content:"";position:absolute;top:-60%;left:-70%;width:55%;height:220%;
  background:linear-gradient(105deg,transparent,rgba(255,255,255,.4),transparent);
  transform:rotate(9deg);animation:scSheen 4.5s ease-in-out infinite}
@keyframes scSheen{0%,55%{left:-70%}100%{left:140%}}
.sc-sheen-glow{position:absolute;inset:0;background:radial-gradient(circle 55% at 50% 40%,${a}33,transparent 70%)}`,
        html: `<div class="sc-sheen-glow"></div><div class="sc-sheen"></div>`,
      };
    case "rings": {
      const rings = Array.from({ length: 6 }, (_, i) => {
        const w = 100 + i * 60;
        const top = R(6, 70, i, "rt");
        const left = R(4, 78, i, "rl");
        const col = [a, b, c][i % 3];
        const dur = 10 + R(0, 8, i, "rd");
        return `<span class="sc-ring" style="width:${w}px;height:${w}px;top:${top.toFixed(0)}%;left:${left.toFixed(0)}%;border-color:${col}66;animation-duration:${dur.toFixed(1)}s"></span>`;
      }).join("");
      return {
        css: `
.sc-ring{position:absolute;border:2px solid;border-radius:9999px;animation:scFloat ease-in-out infinite}`,
        html: `<div class="sc-wrap">${rings}</div>`,
      };
    }
    case "spotlight":
      return {
        css: `
.sc-spot{position:absolute;inset:0;background:
  radial-gradient(circle 55% at 50% -10%,${a}66,transparent 55%),
  radial-gradient(circle 40% at 20% 10%,${b}33,transparent 60%);
  animation:scSpot 8s ease-in-out infinite}
@keyframes scSpot{0%,100%{opacity:.75}50%{opacity:1}}`,
        html: `<div class="sc-spot"></div>`,
      };
    case "noise":
      return {
        css: `
.sc-noise{position:absolute;inset:0;background:radial-gradient(circle 60% at 50% 40%,${a}44,transparent 70%)}
.sc-noise::before{content:"";position:absolute;inset:0;opacity:.16;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}`,
        html: `<div class="sc-noise"></div>`,
      };
    case "confetti": {
      const cols = [a, b, c, "#ffffff", "#ffd54a"];
      const pieces = Array.from({ length: 42 }, (_, i) => {
        const left = R(0, 100, i, "cl");
        const dur = 4 + R(0, 5, i, "cd");
        const del = -R(0, 9, i, "cx");
        const col = cols[i % cols.length];
        const w = 7 + R(0, 6, i, "cw");
        const rot = R(0, 360, i, "cr");
        return `<span class="sc-conf" style="left:${left.toFixed(0)}%;width:${w.toFixed(0)}px;height:${(w * 1.6).toFixed(0)}px;background:${col};transform:rotate(${rot.toFixed(0)}deg);animation-duration:${dur.toFixed(1)}s;animation-delay:${del.toFixed(1)}s"></span>`;
      }).join("");
      return {
        css: `
.sc-conf{position:absolute;top:-14%;border-radius:2px;opacity:.92;animation:scConfFall linear infinite}
@keyframes scConfFall{0%{transform:translateY(-20%) rotate(0)}100%{transform:translateY(130vh) rotate(720deg)}}`,
        html: `<div class="sc-wrap">${pieces}</div>`,
      };
    }
    case "sparkle": {
      const stars = Array.from({ length: 34 }, (_, i) => {
        const left = R(0, 100, i, "sl");
        const top = R(0, 100, i, "st");
        const del = -R(0, 32, i, "sd") / 10;
        const scale = 0.5 + R(0, 12, i, "ss") / 10;
        return `<span class="sc-star" style="left:${left.toFixed(0)}%;top:${top.toFixed(0)}%;transform:scale(${scale.toFixed(2)});animation-delay:${del.toFixed(1)}s"></span>`;
      }).join("");
      return {
        css: `
.sc-star{position:absolute;width:16px;height:16px;animation:scTwinkle 2.8s ease-in-out infinite}
.sc-star::before{content:"";position:absolute;inset:0;background:${b};
  clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)}
@keyframes scTwinkle{0%,100%{opacity:.12;transform:scale(.5)}50%{opacity:1;transform:scale(1.15)}}`,
        html: `<div class="sc-wrap">${stars}</div>`,
      };
    }
    case "stripes": {
      const dots = Array.from({ length: 10 }, (_, i) => {
        const left = R(4, 92, i, "pl");
        const top = R(6, 88, i, "pt");
        const w = 10 + R(0, 18, i, "pw");
        const col = [a, b, c][i % 3];
        return `<span class="sc-dot" style="left:${left.toFixed(0)}%;top:${top.toFixed(0)}%;width:${w.toFixed(0)}px;height:${w.toFixed(0)}px;background:${col}"></span>`;
      }).join("");
      return {
        css: `
.sc-stripes{position:absolute;inset:0;opacity:.28;
  background:repeating-linear-gradient(45deg,${a} 0 22px,transparent 22px 48px);
  animation:scStripes 2.6s linear infinite}
@keyframes scStripes{from{background-position:0 0}to{background-position:68px 0}}
.sc-dot{position:absolute;border-radius:9999px;opacity:.5;animation:scFloat 9s ease-in-out infinite}`,
        html: `<div class="sc-stripes"></div><div class="sc-wrap">${dots}</div>`,
      };
    }
  }
}

function enc(hex: string): string {
  return encodeURIComponent(hex);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT_STACK =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

export interface ShowcaseOpts {
  /** chrome=false → 纯特效区（给 iframe 缩略预览用，无按钮/无边距）。 */
  chrome?: boolean;
  lang?: "zh" | "en";
}

/** 组装某特效的自包含 HTML 文档（整页可开、可 iframe）。 */
export function buildShowcaseDoc(fx: ShowcaseFx, p: PaletteV2, opts: ShowcaseOpts = {}): string {
  const meta = metaFor(fx)!;
  const lang = opts.lang === "en" ? "en" : "zh";
  const layer = layerFor(fx, p);
  const onDark = meta.dark;
  const ink = onDark ? "#ffffff" : p.ink;
  const sub = onDark ? "rgba(255,255,255,.82)" : p.sub;
  const bg = `linear-gradient(135deg,${p.gradFrom},${p.gradTo})`;
  const title = lang === "en" ? meta.en : meta.name;
  const tagline =
    lang === "en"
      ? "Your headline goes here — bold, clear, confident."
      : "在这里放一句有力的主标题 · 简洁、清晰、自信";
  const subline =
    lang === "en"
      ? "A short supporting sentence that explains the value in one breath."
      : "一句话把价值说清楚，让访客第一眼就懂你在做什么。";
  const btn = lang === "en" ? "Get Started" : "立即开始";
  const btn2 = lang === "en" ? "Learn more" : "了解更多";

  const heroBlock = opts.chrome === false
    ? `<div class="sc-hero sc-hero-mini"><span class="sc-badge">${esc(title)}</span></div>`
    : `<div class="sc-hero">
        <span class="sc-badge">${esc(meta.name)} · ${esc(meta.en)}</span>
        <h1 class="sc-h1">${esc(tagline)}</h1>
        <p class="sc-sub">${esc(subline)}</p>
        <div class="sc-cta">
          <a class="sc-btn sc-btn-shine">${esc(btn)}</a>
          <a class="sc-btn sc-btn-ghost">${esc(btn2)} →</a>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "zh-CN"}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)} · ${lang === "en" ? "Web Style Element" : "网站风格元素"}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font-family:${FONT_STACK};background:${bg};color:${ink};overflow:hidden}
.sc-stage{position:relative;width:100%;height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.sc-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.sc-wrap{position:absolute;inset:0}
.sc-hero{position:relative;z-index:2;max-width:820px;padding:0 28px}
.sc-hero-mini{padding:0}
.sc-badge{display:inline-block;padding:7px 16px;border-radius:9999px;font-size:13px;font-weight:600;
  background:${onDark ? "rgba(255,255,255,.16)" : p.soft};color:${onDark ? "#fff" : p.primary};
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);letter-spacing:.02em}
.sc-h1{margin-top:22px;font-size:clamp(28px,5vw,54px);font-weight:800;line-height:1.1;letter-spacing:-.02em;
  text-shadow:${onDark ? "0 2px 30px rgba(0,0,0,.35)" : "none"}}
.sc-sub{margin-top:18px;font-size:clamp(15px,2vw,20px);color:${sub};line-height:1.6;
  text-shadow:${onDark ? "0 1px 14px rgba(0,0,0,.3)" : "none"}}
.sc-cta{margin-top:30px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.sc-btn{display:inline-block;padding:13px 30px;border-radius:9999px;font-size:15px;font-weight:600;
  cursor:pointer;text-decoration:none;transition:transform .25s,box-shadow .25s;position:relative;overflow:hidden}
.sc-btn:not(.sc-btn-ghost){background:#fff;color:${p.primaryDark};box-shadow:0 12px 30px rgba(0,0,0,.22)}
.sc-btn:not(.sc-btn-ghost):hover{transform:translateY(-3px);box-shadow:0 18px 38px rgba(0,0,0,.28)}
.sc-btn-ghost{color:${onDark ? "#fff" : p.primary};border:1.5px solid ${onDark ? "rgba(255,255,255,.55)" : p.primary + "66"}}
.sc-btn-ghost:hover{background:${onDark ? "rgba(255,255,255,.12)" : p.soft}}
.sc-btn-shine::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.5) 50%,transparent 60%);
  transform:translateX(-120%);animation:scBtnShine 3.5s ease-in-out infinite}
@keyframes scBtnShine{0%,55%{transform:translateX(-120%)}75%,100%{transform:translateX(120%)}}
${layer.css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<div class="sc-stage">
  <div class="sc-fx">${layer.html}</div>
  ${heroBlock}
</div>
</body>
</html>`;
}
