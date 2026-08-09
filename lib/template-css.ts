// 模板站自带样式表（不联网）。
//
// scripts/build-template-css.mjs 用 Tailwind v3 扫描全部模板，把 preflight 与 utility
// 规则按原级联顺序写进生成物。运行期只查表、筛选本站真正用到的规则：不读文件，
// 不跑编译器，也不联网。

import {
  TEMPLATE_INLINE_CLASS_NAMES,
  TAILWIND_CLASS_NAMES,
  TAILWIND_MARKER_CLASSES,
  TAILWIND_PREFLIGHT,
  TAILWIND_RULES,
} from "./generated/tailwind-utilities";
import type { PaletteV2 } from "./template-dna";
import type { SkinKey } from "./template-skins";

/** 产物里样式表的相对路径。 */
export const CSS_ASSET_PATH = "assets/site.css";

/** 每套装自己的结构规则；这里只返回当前一套，不把十套 CSS 一起发给站点。 */
export function skinStyles(p: PaletteV2, skinKey: SkinKey): string {
  const marker = `/* skin:${skinKey} */`;
  switch (skinKey) {
    case "paper":
      return `${marker}
html[data-skin="paper"]{--skin-content-width:68rem;background:#fbfbf8}html[data-skin="paper"] body{background:#fbfbf8!important}html[data-skin="paper"] header{background:rgba(251,251,248,.96)!important;box-shadow:none!important}html[data-skin="paper"] [data-section-kind]{background:#fbfbf8!important;border-bottom:1px solid #0f172a14}html[data-skin="paper"] [data-section-kind]>[class*="max-w-"]{max-width:var(--skin-content-width)}html[data-skin="paper"] [data-section-kind] [style*="box-shadow"]{box-shadow:none!important}html[data-skin="paper"] [data-section-kind] [style*="border-radius"]{border-radius:6px!important}`;
    case "editorial":
      return `${marker}
html[data-skin="editorial"]{--skin-reading-width:58rem;background:#fff}html[data-skin="editorial"] header{position:relative!important;background:#fff!important;border-top:5px solid ${p.ink}}html[data-skin="editorial"] [data-page]:not([data-page="home"]) [data-section-kind]>[class*="max-w-"]{max-width:var(--skin-reading-width)}html[data-skin="editorial"] [data-section-kind]{border-bottom:1px solid ${p.ink}26}html[data-skin="editorial"] h1,html[data-skin="editorial"] h2{letter-spacing:-.035em;line-height:1.02!important}html[data-skin="editorial"] [data-section-kind] [style*="border-radius"]{border-radius:0!important}html[data-skin="editorial"] [data-section-kind] [style*="box-shadow"]{box-shadow:none!important}.leo-noise::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}`;
    case "bento":
      return `${marker}
html[data-skin="bento"]{--skin-tile-radius:32px;background:${p.soft}}html[data-skin="bento"] body{background:${p.soft}!important}html[data-skin="bento"] [data-page]:not([data-page="home"]){padding:18px}html[data-skin="bento"] [data-page]:not([data-page="home"])>[data-section-kind]{width:min(72rem,calc(100% - 12px));margin:18px auto;border:1px solid ${p.primary}18;border-radius:var(--skin-tile-radius);box-shadow:0 18px 50px #0f172a12;overflow:hidden}html[data-skin="bento"] [data-section-kind] [style*="border-radius"]{border-radius:22px!important}@media(max-width:640px){html[data-skin="bento"] [data-page]:not([data-page="home"]){padding:8px}html[data-skin="bento"] [data-page]:not([data-page="home"])>[data-section-kind]{margin:10px auto;border-radius:22px}}`;
    case "brutalist":
      return `${marker}
html[data-skin="brutalist"]{--skin-rule:3px solid ${p.ink};background:${p.soft}}html[data-skin="brutalist"] header{position:relative!important;background:${p.soft}!important;border:var(--skin-rule)!important;border-left:0!important;border-right:0!important}html[data-skin="brutalist"] [data-section-kind]{border-bottom:var(--skin-rule)}html[data-skin="brutalist"] [data-section-kind] [style*="border-radius"],html[data-skin="brutalist"] a,html[data-skin="brutalist"] button{border-radius:0!important}html[data-skin="brutalist"] [data-section-kind] [style*="box-shadow"]{box-shadow:7px 7px 0 ${p.ink}!important}html[data-skin="brutalist"] h1,html[data-skin="brutalist"] h2,html[data-skin="brutalist"] h3{text-transform:uppercase;letter-spacing:-.025em}.leo-hard-shadow{box-shadow:7px 7px 0 ${p.ink}}.leo-hard-shadow-primary{box-shadow:7px 7px 0 ${p.primary}}`;
    case "neon":
      return `${marker}
html[data-skin="neon"]{color-scheme:dark;background:#05070c}html[data-skin="neon"] body{background:#05070c!important}html[data-skin="neon"] header{background:rgba(5,7,12,.9)!important;border-color:${p.primary}38!important}html[data-skin="neon"] [data-section-kind]{background:${p.soft}!important;border-bottom:1px solid ${p.primary}24}html[data-skin="neon"] [data-section-kind]>[class*="max-w-"]{position:relative}html[data-skin="neon"] [data-section-kind] [style*="border:"]{border-color:${p.primary}40!important}html[data-skin="neon"] footer{border-top:1px solid ${p.primary}55;box-shadow:0 -18px 60px ${p.primary}12}`;
    case "fullscreen":
      return `${marker}
html[data-skin="fullscreen"]{color-scheme:dark;background:#0b111b}html[data-skin="fullscreen"] body{background:#0b111b!important}html[data-skin="fullscreen"] header{background:rgba(11,17,27,.88)!important;border-color:#ffffff1f!important}html[data-skin="fullscreen"] [data-page="home"]{height:calc(100vh - 4rem);overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior:contain}html[data-skin="fullscreen"] [data-page="home"]>[data-section-kind]{min-height:100%;scroll-snap-align:start;scroll-snap-stop:always}html[data-skin="fullscreen"] [data-page]:not([data-page="home"])>[data-section-kind]{background:#0b111b!important;border-bottom:1px solid #ffffff17}html[data-skin="fullscreen"] footer{background:#06090f!important}@media(max-width:640px){html[data-skin="fullscreen"] [data-page="home"]{height:auto;overflow:visible;scroll-snap-type:none}html[data-skin="fullscreen"] [data-page="home"]>[data-section-kind]{min-height:82vh}}`;
    case "nature":
      return `${marker}
html[data-skin="nature"]{--skin-organic-radius:clamp(28px,5vw,64px);background:#f3f7f0}html[data-skin="nature"] body{background:#f3f7f0!important}html[data-skin="nature"] header{background:rgba(243,247,240,.92)!important}html[data-skin="nature"] [data-page]>[data-section-kind]:nth-child(even){width:min(74rem,calc(100% - 32px));margin:24px auto;border-radius:var(--skin-organic-radius);overflow:hidden}html[data-skin="nature"] [data-section-kind] img:not([class*="absolute"]){border-radius:42% 58% 48% 52%/54% 43% 57% 46%!important}html[data-skin="nature"] [data-section-kind] h2::after{content:"";display:block;width:52px;height:3px;margin:16px auto 0;background:${p.primary};border-radius:999px}`;
    case "sand":
      return `${marker}
html[data-skin="sand"]{--skin-craft-width:70rem;background:#f7efe3}html[data-skin="sand"] body{background:radial-gradient(circle at 12% 18%,${p.primary}0c 0 2px,transparent 3px) 0 0/26px 26px,#f7efe3!important}html[data-skin="sand"] header{position:relative!important;background:#f7efe3f2!important;border-bottom:1px solid ${p.primary}33!important}html[data-skin="sand"] [data-page]>[data-section-kind]:not([data-section-kind="hero"]){width:min(var(--skin-craft-width),calc(100% - 36px));margin:28px auto;border:1px solid ${p.primary}24;box-shadow:10px 12px 0 ${p.primary}0b;overflow:hidden}html[data-skin="sand"] [data-page]>[data-section-kind]:nth-child(even){transform:rotate(-.18deg)}html[data-skin="sand"] [data-section-kind] img:not([class*="absolute"]){border-radius:48% 48% 10px 10px!important}`;
    case "navy":
      return `${marker}
html[data-skin="navy"]{--skin-navy:${p.gradFrom};background:#f5f7fb}html[data-skin="navy"] body{background:#f5f7fb!important}html[data-skin="navy"] header{background:var(--skin-navy)!important;color:#fff;border:0!important;border-bottom:4px solid ${p.primary}!important}html[data-skin="navy"] header nav{color:#fff!important}html[data-skin="navy"] [data-section-kind]:not([data-section-kind="hero"]):not([data-section-kind="pageHeader"])>[class*="max-w-"]{border-left:4px solid ${p.primary};padding-left:clamp(1.5rem,4vw,3rem)}html[data-skin="navy"] [data-section-kind] [style*="border-radius"]{border-radius:2px!important}html[data-skin="navy"] [data-section-kind]{border-bottom:1px solid #0f172a1f}`;
    case "glass":
      return `${marker}
html[data-skin="glass"]{--skin-glass:rgba(255,255,255,.58);background:${p.soft}}html[data-skin="glass"] body{background:radial-gradient(circle at 15% 12%,${p.primary}30,transparent 32%),radial-gradient(circle at 86% 28%,${p.gradTo}35,transparent 30%),linear-gradient(145deg,#f8fbff,${p.soft}) fixed!important}html[data-skin="glass"] header{background:rgba(255,255,255,.58)!important;border-color:#ffffffaa!important;box-shadow:0 12px 40px #4c1d9510}html[data-skin="glass"] [data-page]>[data-section-kind]{width:min(74rem,calc(100% - 36px));margin:24px auto;border:1px solid #ffffffb8;border-radius:30px;box-shadow:0 24px 70px #4c1d9517;overflow:hidden;background:var(--skin-glass)!important;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}html[data-skin="glass"] [data-section-kind] [style*="background:"]{background-color:rgba(255,255,255,.28)!important}@media(max-width:640px){html[data-skin="glass"] [data-page]>[data-section-kind]{width:calc(100% - 20px);margin:12px auto;border-radius:22px}}`;
  }
}

/** 从一段 HTML 里取出全部 class 名（含 hover:/md: 前缀与 [] 任意值）。 */
export function classNamesIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const match of html.matchAll(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = match[1] ?? match[2] ?? "";
    for (const className of value.split(/\s+/)) {
      if (className) out.add(className);
    }
  }
  return out;
}

const GENERATED_CLASSES = new Set<string>(TAILWIND_CLASS_NAMES);
const MARKER_CLASSES = new Set<string>(TAILWIND_MARKER_CLASSES);
const TEMPLATE_INLINE_CLASSES = new Set<string>(TEMPLATE_INLINE_CLASS_NAMES);

/**
 * 页面自己的 <style> 仍承载 leo-*、nav-link 等非 Tailwind 类。它们已经随 HTML
 * 发出，不应被漂移检查误报为缺 utility；只认 CSS 选择器里的合法类名。
 */
function classesDefinedInline(html: string): Set<string> {
  const out = new Set<string>();
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = style[1].replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
      out.add(match[1]);
    }
  }
  return out;
}

/** 该 HTML 需要的完整样式表：preflight + 它用到的 utility 规则。 */
export function utilitiesFor(html: string): string {
  const used = classNamesIn(html);
  const body = TAILWIND_RULES
    .filter(([classNames]) => classNames.some((className) => used.has(className)))
    .map(([, css]) => css)
    .join("\n");
  return TAILWIND_PREFLIGHT + (TAILWIND_PREFLIGHT && body ? "\n" : "") + body;
}

/** 生成表里查无此类的类名（校验器用；正常应为空数组）。 */
export function missingClasses(html: string): string[] {
  const inline = classesDefinedInline(html);
  return [...classNamesIn(html)]
    .filter(
      (className) =>
        !GENERATED_CLASSES.has(className) &&
        !MARKER_CLASSES.has(className) &&
        !TEMPLATE_INLINE_CLASSES.has(className) &&
        !inline.has(className),
    )
    .sort();
}
