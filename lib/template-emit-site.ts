// 站点发射器（一个 slug → 一整个可下载的站点目录）—— 接口占位，实现由 W1b 落地。
//
// 今天 /templates/[slug] 只吐一份 HTML，样式来自 CDN、配图来自 OSS：下载下来断网
// 打开既没有版式也没有图。目标形状是**站点自己的一个文件夹**：
//
//   index.html            页面本身，只引相对路径
//   assets/site.css       本站用到的 utility + 引擎自带样式（lib/template-css.ts）
//   assets/site.js        原先内联的那段交互脚本（分页 / 中英切换 / 入场动画）
//   images/*.webp         本站真正用到的配图，从 public/template-photos/ 拷贝
//
// 契约稳定：W4 校验器只依赖 `emitStandaloneSite()` 与 `EmittedFile`。
// 二进制文件不进内存、不进 lib：用 `sourcePath` 指向仓库里的镜像，由调用方拷贝。

import type { Industry, SubCategory, TemplateMeta } from "./template-taxonomy";
import type { Lang } from "./template-i18n";
import { renderTemplateBilingual } from "./template-engine";

export interface EmittedFile {
  /** 站点目录内的相对路径，如 `index.html` / `assets/site.css` / `images/x.webp`。 */
  path: string;
  mediaType: string;
  /** 文本文件的内容。二进制文件不给 text，给 sourcePath。 */
  text?: string;
  /** 二进制文件在本仓库里的绝对/相对源路径，调用方按字节拷贝。 */
  sourcePath?: string;
}

export interface EmittedSite {
  slug: string;
  files: EmittedFile[];
}

export interface EmitOptions {
  /** 首屏语言，默认 zh（产物内含中英两套文本，页内可切）。 */
  defaultLang?: Lang;
}

/**
 * 发射一个完整站点目录。产物内不得出现任何 http:// 或 https:// 资源引用。
 *
 * 占位实现：仍然只吐当前引擎那份 HTML（带 CDN 与 OSS 图），
 * 因此 W4 校验器会如实报出外链 —— 这就是修复前的真实状态。
 */
export function emitStandaloneSite(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  opts: EmitOptions = {},
): EmittedSite {
  const { html } = renderTemplateBilingual(meta, industry, sub, opts.defaultLang ?? "zh");
  return {
    slug: meta.slug,
    files: [{ path: "index.html", mediaType: "text/html", text: html }],
  };
}
