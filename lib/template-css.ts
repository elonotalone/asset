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

/** 产物里样式表的相对路径。 */
export const CSS_ASSET_PATH = "assets/site.css";

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
