// 逐子类精修中文文案聚合（覆盖全部 105 个子类）。
// 按一级行业拆成多个 fragment 文件，便于并行撰写、互不冲突，最后在这里合并。
// buildContent() 会优先读这里；缺失的子类回退到 template-content.ts 的兜底。

import type { SiteContent } from "./template-content";

import { MEDIA_CONTENT } from "./content/media";
import { BUSINESS_CONTENT } from "./content/business";
import { FASHION_CONTENT } from "./content/fashion";
import { ORG_TECH_CONTENT } from "./content/org-tech";
import { LIFE_CONTENT } from "./content/life";
import { FOOD_CONTENT } from "./content/food";
import { INDUSTRY_CONTENT } from "./content/industry";
import { HOME_CONTENT } from "./content/home";
import { GROCERY_CONTENT } from "./content/grocery";
import { HARDWARE_CONTENT } from "./content/hardware";
import { LOGISTICS_GENERAL_CONTENT } from "./content/logistics-general";

export const REFINED_CONTENT: Partial<Record<string, Partial<SiteContent>>> = {
  ...MEDIA_CONTENT,
  ...BUSINESS_CONTENT,
  ...FASHION_CONTENT,
  ...ORG_TECH_CONTENT,
  ...LIFE_CONTENT,
  ...FOOD_CONTENT,
  ...INDUSTRY_CONTENT,
  ...HOME_CONTENT,
  ...GROCERY_CONTENT,
  ...HARDWARE_CONTENT,
  ...LOGISTICS_GENERAL_CONTENT,
};
