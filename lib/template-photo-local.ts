// 配图本地镜像 —— 让下载下来的站点断网也有图。
//
// 配图池（template-photo-pool.json）里存的是 OSS 绝对地址；产物一旦落到用户硬盘，
// 那些地址就是外部请求：断网即空白。所以整池 324 张图在仓库里留一份镜像
// （public/template-photos/），发射站点时按需拷进站点自己的 images/ 目录，
// 页面只引相对路径。本文件是「OSS 地址 → 本地文件名」这一层纯映射，不碰 fs，
// 引擎（浏览器侧）与生成脚本（node 侧）共用。
//
// 镜像文件由 scripts/mirror-template-photos.mjs 下载生成，与池数据一一对应。

/** 站点产物里存放配图的目录名（相对 index.html）。 */
export const SITE_IMAGE_DIR = "images";
/** 仓库内镜像目录（相对项目根），也是 asset 站预览时的同源前缀 /template-photos/。 */
export const MIRROR_PUBLIC_DIR = "public/template-photos";
export const MIRROR_URL_PREFIX = "/template-photos";

/**
 * OSS 地址 → 镜像文件名。取 `assets/image/<类目>/<文件名>` 里的「类目--文件名」，
 * 保证跨类目同名文件不撞车；非池内地址（理论不存在）退化成 hash 名。
 */
export function localPhotoFile(url: string): string {
  const clean = String(url).split("?")[0];
  const m = clean.match(/\/assets\/image\/([^/]+)\/([^/]+)$/);
  if (m) return `${m[1]}--${m[2]}`;
  const tail = clean.split("/").pop() || "photo.webp";
  return tail.replace(/[^\w.-]/g, "_");
}

/** OSS 地址 → 站点产物里的相对路径（`images/xxx.webp`）。空地址原样返回空串。 */
export function sitePhotoPath(url: string): string {
  if (!url) return "";
  return `${SITE_IMAGE_DIR}/${localPhotoFile(url)}`;
}

/** OSS 地址 → asset 站预览用的同源路径（`/template-photos/xxx.webp`）。 */
export function previewPhotoPath(url: string): string {
  if (!url) return "";
  return `${MIRROR_URL_PREFIX}/${localPhotoFile(url)}`;
}

/**
 * 发射时的取图基准：
 * - `"site"`：产物目录（相对路径，下载下来离线可开）；
 * - `"preview"`：asset 站同源路径（/templates/[slug] 预览用）。
 */
export type PhotoBase = "site" | "preview";

export function photoHref(url: string, base: PhotoBase): string {
  return base === "preview" ? previewPhotoPath(url) : sitePhotoPath(url);
}
