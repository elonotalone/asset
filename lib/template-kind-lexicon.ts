// 「串味词表」—— 哪些说法只属于某一类板块。
//
// 缺陷背景：文案层有一批通用池子被所有 500 个站共用，于是没有资讯页的律所会
// 出现「订阅我们的博客」，没有菜单的软件公司会出现「招牌菜」。对下载模板的人
// 来说，这是明显的「这不是给我做的站」。
//
// 规则：某个 kind 的词，只允许出现在**含该 kind 板块**的站点里。
// 文案层（template-i18n.ts / template-content-ext.ts / lib/content/*）据此避雷；
// 校验器（scripts/check-templates.mjs）据此报错。两边共用这一份词表，不各写各的。
//
// 只收「一眼看出属于另一种站」的词，不收行业中性词（如「服务」「方案」「客户」）。

import type { SectionKind } from "./template-dna";

/** kind → 只能出现在该 kind 板块存在时的中文词。 */
export const KIND_ONLY_WORDS: Partial<Record<SectionKind, string[]>> = {
  news: ["博客", "资讯", "新闻", "最新动态", "专栏", "投稿", "读者", "订阅", "阅读全文", "文章", "发布会稿"],
  menu: ["菜单", "招牌菜", "点餐", "上菜", "堂食", "口味", "主厨"],
  products: ["下单", "购物车", "库存", "会员价", "包邮", "现货", "规格参数"],
  pricing: ["套餐", "订阅制", "续费", "按月计费", "试用期"],
  team: ["团队成员", "创始人", "主创", "顾问团队"],
  cases: ["案例集", "作品集", "过往案例", "标杆项目"],
  gallery: ["相册", "实拍图", "现场图集"],
  timeline: ["发展历程", "大事记", "里程碑"],
  faq: ["常见问题", "问答"],
};

/** 英文侧同义词（英文文案同样不许串味）。 */
export const KIND_ONLY_WORDS_EN: Partial<Record<SectionKind, string[]>> = {
  news: ["blog", "newsletter", "subscribe", "readers", "article", "editorial", "press release"],
  menu: ["menu", "signature dish", "dine-in", "chef"],
  products: ["add to cart", "in stock", "free shipping", "checkout"],
  pricing: ["subscription", "billed monthly", "free trial", "renewal"],
  team: ["our team", "founder"],
  cases: ["portfolio", "case study"],
  gallery: ["photo gallery"],
  timeline: ["milestones"],
  faq: ["faq", "frequently asked"],
};

/** 词 → 它所属的 kind（校验器反查用）。同一个词只归一个 kind。 */
export function kindOfWord(word: string): SectionKind | null {
  for (const [kind, words] of Object.entries(KIND_ONLY_WORDS)) {
    if (words.includes(word)) return kind as SectionKind;
  }
  return null;
}
