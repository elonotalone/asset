// 模板缩略图 = 每个模板整页 HTML 的**真实首屏截图**（离线用 playwright 渲染
// asset.oceanleo.com/templates/<slug>，裁 4:3、转 webp、传 OSS 公有读）。
// 这一处是「slug → OSS 缩略图直链」的单一事实源：前端卡片 <img> 用它，
// 离线批量脚本（scripts/gen-template-thumbs.mjs）也用它推导 OSS object key。
//
// 为什么用真截图而非合成迷你版式：模板库唯一的吸引力来自「让用户直接看到模板长
// 什么样」（对标稿定 / 云·速成美站）。旧的合成卡（渐变遮罩盖照片 + 小字）在
// 网格里全是灰蒙蒙色块，完全传达不出模板真实观感——asset.oceanleo.com/templates
// 「被蒙住、毫不吸引人」的根因。见 docs/architecture/oceanleo-template-fill-and-thumb-catalog.md。

const OSS_BASE =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/template-thumb";

// 缩略图批次版本：每次重跑截图管线（引擎改版 / 换图源后）都 +1，用作 ?v= 缓存
// 击穿参数。OSS 对象 Cache-Control 是 1 年长缓存，改版后必须靠这个参数让 CDN /
// 浏览器取到新图。批量脚本与本文件必须用同一个值——脚本从这里读。
export const THUMB_VERSION = "1";

/** slug → OSS 缩略图 webp 直链（带版本缓存击穿参数）。 */
export function templateThumbUrl(slug: string): string {
  return `${OSS_BASE}/${slug}.webp?v=${THUMB_VERSION}`;
}

/** slug → OSS object key（离线上传脚本用；不含 bucket/endpoint/版本参数）。 */
export function templateThumbKey(slug: string): string {
  return `assets/template-thumb/${slug}.webp`;
}
