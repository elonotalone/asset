// 「哪些位置必须有图」—— 发射器与校验器共用的一张表（W2 拥有，W4 只读）。
//
// 缺陷背景：接口 B 的 22 种板块每种都声明了图片槽，但发射器只有 9 处真给了图，
// 其余 15 处写死 NO_IMAGE。不能反过来把 22 种板块都塞满图库照片：引擎本来只画
// 图标、数字、表格或渐变底的地方，硬塞一张背景照同样是缺陷。
//
// 判定原则：以 asset 引擎（lib/template-engine.ts）渲染出来的样子为准 ——
// 引擎在这类板块里画照片的，就是「设计要图」，必须给真图；
// 引擎不画照片、给图反而是装饰噪声或编造事实的，标 optional 并写明理由。
// 人物位单独从严：团队与评价人的图库脸会冒充真实员工/客户，所以即使旧引擎画过
// stock photo，也必须留成有明确换图提示的空槽，等站点所有者放自己的真实照片。
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
  menu: { rule: "optional", why: "引擎画的是分组价目表，不渲染菜品照片" },
  gallery: { rule: "required", why: "图集本体就是图" },
  cases: { rule: "required", why: "每个案例一张成果图" },
  team: { rule: "optional", why: "成员头像必须由站点所有者换成真实团队照，不能拿图库人物冒充员工" },
  news: { rule: "required", why: "每条资讯一张封面图" },
  testimonials: { rule: "optional", why: "评价人头像必须由站点所有者提供，图库人物会编造客户背书" },
  "feature-grid": { rule: "optional", why: "引擎画的是图标卡，不渲染照片" },
  stats: { rule: "optional", why: "引擎画的是数字带或渐变带，不渲染背景照片" },
  pricing: { rule: "optional", why: "引擎画的是套餐卡和价目行，不渲染照片" },
  process: { rule: "optional", why: "引擎画的是编号、箭头或步骤卡，不渲染照片" },
  timeline: { rule: "optional", why: "引擎画的是节点与连线，不渲染照片" },
  chart: { rule: "optional", why: "引擎自己画 SVG 数据图，不需要装饰照片" },
  faq: { rule: "optional", why: "引擎画的是问答卡，不渲染背景照片" },
  cta: { rule: "optional", why: "引擎画的是渐变或描边行动卡，不渲染背景照片" },
  contact: { rule: "optional", why: "引擎画的是联系资料和表单，不渲染门店或地图照片" },
  "page-header": { rule: "optional", why: "引擎画的是渐变、面包屑或下划线栏目头，不渲染 banner 照片" },
  logos: { rule: "optional", why: "合作方是文字标，塞照片等于编造合作关系" },
  footer: { rule: "optional", why: "页脚位只放品牌字标，我们没有客户的品牌图形" },
};
