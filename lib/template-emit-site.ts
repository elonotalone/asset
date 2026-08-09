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
import { CSS_ASSET_PATH, utilitiesFor } from "./template-css";
import { MIRROR_PUBLIC_DIR, SITE_IMAGE_DIR } from "./template-photo-local";

const JS_ASSET_PATH = "assets/site.js";

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

function detachStyles(html: string): { html: string; styles: string[] } {
  const styles: string[] = [];
  return {
    html: html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_whole, css: string) => {
      styles.push(css.trim());
      return "";
    }),
    styles,
  };
}

function detachScripts(html: string): { html: string; scripts: string[] } {
  const scripts: string[] = [];
  return {
    html: html.replace(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      (whole, attrs: string, js: string) => {
        if (/\bsrc\s*=/i.test(attrs)) return whole;
        scripts.push(js.trim());
        return "";
      },
    ),
    scripts,
  };
}

function assertNoExternalUrl(slug: string, file: EmittedFile): void {
  if (!file.text) return;
  const withoutSvgNamespace = file.text.replace(
    /xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g,
    "",
  );
  if (/https?:\/\//i.test(withoutSvgNamespace)) {
    throw new Error(`${slug}: external URL survived in ${file.path}`);
  }
}

/** 发射一个完整站点目录。产物内不得出现任何外部资源引用。 */
export function emitStandaloneSite(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
  opts: EmitOptions = {},
): EmittedSite {
  const { html: renderedHtml } = renderTemplateBilingual(
    meta,
    industry,
    sub,
    opts.defaultLang ?? "zh",
    undefined,
    "site",
  );
  const utilityCss = utilitiesFor(renderedHtml).trim();
  const detachedStyles = detachStyles(renderedHtml);
  const detachedScripts = detachScripts(detachedStyles.html);

  const css = [utilityCss, ...detachedStyles.styles].filter(Boolean).join("\n\n") + "\n";
  const js = detachedScripts.scripts.filter(Boolean).join("\n\n") + "\n";
  const indexHtml = detachedScripts.html
    .replace("</head>", `<link rel="stylesheet" href="${CSS_ASSET_PATH}"/>\n</head>`)
    .replace("</body>", `<script src="${JS_ASSET_PATH}"></script>\n</body>`);

  const imagePrefix = `${SITE_IMAGE_DIR}/`;
  const imagePaths = new Set<string>();
  for (const match of indexHtml.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
    const path = match[2];
    if (!path.startsWith(imagePrefix) || path.includes("..")) {
      throw new Error(`${meta.slug}: non-local image path ${path || "(empty)"}`);
    }
    imagePaths.add(path);
  }

  const files: EmittedFile[] = [
    { path: "index.html", mediaType: "text/html", text: indexHtml },
    { path: CSS_ASSET_PATH, mediaType: "text/css", text: css },
    { path: JS_ASSET_PATH, mediaType: "text/javascript", text: js },
    ...[...imagePaths].sort().map((path) => ({
      path,
      mediaType: "image/webp",
      sourcePath: `${MIRROR_PUBLIC_DIR}/${path.slice(imagePrefix.length)}`,
    })),
  ];
  for (const file of files) assertNoExternalUrl(meta.slug, file);

  return {
    slug: meta.slug,
    files,
  };
}
