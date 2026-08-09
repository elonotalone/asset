// 模板站自带样式表（不联网）—— 接口占位，实现由 W1a 落地。
//
// 今天每个产物 <head> 里挂 https://cdn.tailwindcss.com：断网打开就是一堵黑字白底。
// 这里承接「把用到的那一小撮 utility 类离线生成好，跟着产物一起发」的能力：
// scripts/build-template-css.mjs 用 tailwindcss v3（与 Play CDN 同版本语义）
// 扫描 500 个站实际用到的类名，生成 lib/generated/tailwind-utilities.css 并入库；
// 运行期只做「按本站用到的类名筛规则」，不跑编译器、不联网。
//
// 契约稳定：W1b（发射器）与 W4（校验器）都只依赖下面四个导出。

/** 产物里样式表的相对路径。 */
export const CSS_ASSET_PATH = "assets/site.css";

/** 从一段 HTML 里取出全部 class 名（含 hover:/md: 前缀与 [] 任意值）。 */
export function classNamesIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/**
 * 生成表：类名 → 该类的 CSS 规则。W1a 落地前是空表，于是 `missingClasses()`
 * 会把全部类名报成缺失 —— 校验器因此红着，正是当前真实状态，不假装通过。
 */
const RULES: Record<string, string> = {};
const PREFLIGHT = "";

/** 该 HTML 需要的完整样式表：preflight + 它用到的 utility 规则。 */
export function utilitiesFor(html: string): string {
  const used = [...classNamesIn(html)].sort();
  const body = used.map((c) => RULES[c]).filter(Boolean).join("\n");
  return PREFLIGHT + (PREFLIGHT && body ? "\n" : "") + body;
}

/** 生成表里查无此类的类名（校验器用；正常应为空数组）。 */
export function missingClasses(html: string): string[] {
  return [...classNamesIn(html)].filter((c) => !RULES[c]).sort();
}
