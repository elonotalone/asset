// 「哪些位置必须有图」—— 发射器与校验器共用的一张表（W2 拥有，W4 只读）。
//
// 缺陷背景：接口 B 的 22 种板块每种都声明了图片槽，但发射器只有 9 处真给了图，
// 其余 15 处写死 NO_IMAGE。货架上看过去，三分之二该有照片的位置是空的。
//
// 判定原则：以 asset 引擎（lib/template-engine.ts）渲染出来的样子为准 ——
// 引擎在这类板块里画照片的，就是「设计要图」，必须给真图；
// 引擎不画照片、给图反而是编造的（例如合作方 logo 墙、页脚品牌标），标 optional
// 并写明理由。空槽本身保留（用户仍可在编辑器里自己塞图）。
//
// W2 落地时按板块逐条复核并改这张表；W4 校验器读它决定「空槽算不算缺陷」。

import type { WebsiteSectionType } from "./template-website-source-map";

export type ImageSlotRule = "required" | "optional";

export interface ImageSlotPolicy {
  rule: ImageSlotRule;
  /** optional 必须写理由；required 写清楚这张图该拍什么内容。 */
  why: string;
}

export const IMAGE_SLOT_POLICY: Record<WebsiteSectionType, ImageSlotPolicy> = {
  hero: { rule: "required", why: "首屏主视觉，行业场景大图" },
  about: { rule: "required", why: "团队/门店/现场实拍，撑起「我们是谁」" },
  services: { rule: "required", why: "每项服务一张场景图" },
  products: { rule: "required", why: "每件商品一张图" },
  menu: { rule: "required", why: "菜品图" },
  gallery: { rule: "required", why: "图集本体就是图" },
  cases: { rule: "required", why: "每个案例一张成果图" },
  team: { rule: "required", why: "成员头像位" },
  news: { rule: "required", why: "每条资讯一张封面图" },
  testimonials: { rule: "required", why: "评价人头像位" },
  "feature-grid": { rule: "required", why: "特色区配图" },
  stats: { rule: "required", why: "数字区背景图" },
  pricing: { rule: "required", why: "套餐区配图" },
  process: { rule: "required", why: "流程区配图" },
  timeline: { rule: "required", why: "历程区配图" },
  chart: { rule: "required", why: "图表区配图" },
  faq: { rule: "required", why: "问答区配图" },
  cta: { rule: "required", why: "行动号召区背景图" },
  contact: { rule: "required", why: "联系区门店/地图区位图" },
  "page-header": { rule: "required", why: "栏目头 banner" },
  logos: { rule: "optional", why: "合作方是文字标，塞照片等于编造合作关系" },
  footer: { rule: "optional", why: "页脚位只放品牌字标，我们没有客户的品牌图形" },
};
