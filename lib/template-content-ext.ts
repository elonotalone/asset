// 多页内容扩展层 —— 模板专区 v2。
//
// v1 的 SiteContent 只够撑一张落地页（hero/about/features/services/stats/
// testimonials/cta/contact）。v2 是多页站点，每页还需要：案例列表、资讯列表、
// 团队成员、菜单/商品项、FAQ、定价方案、流程步骤、合作 logo。这些用「行业相关
// 文案池 + 确定性 hash 选取」生成，保证 105 子类全覆盖、页与页内容连贯、且不同
// 模板之间不重复（消除 v1「张先生/李女士/王总」式的千篇一律）。

import { hashStr } from "./hash";
import { copyPoolFor } from "./content-pools/industry-copy";
import {
  MENU_GROUPS_BY_SUB,
  PRODUCT_NOUNS_BY_SUB,
  WORK_TITLES_BY_SUB,
} from "./content-pools/main-offerings";

export interface CaseItem {
  title: string;
  tag: string;
  desc: string;
}
export interface NewsItem {
  date: string;
  cat: string;
  title: string;
  excerpt: string;
}
export interface TeamMember {
  name: string;
  role: string;
}
export interface ProductItem {
  name: string;
  price: string;
  note: string;
}
export interface MenuGroup {
  group: string;
  items: { name: string; price: string }[];
}
export interface FaqItem {
  q: string;
  a: string;
}
export interface PricingPlan {
  name: string;
  price: string;
  unit: string;
  features: string[];
  featured: boolean;
}
export interface ProcessStep {
  step: string;
  title: string;
  desc: string;
}

export interface ExtContent {
  cases: CaseItem[];
  news: NewsItem[];
  team: TeamMember[];
  products: ProductItem[];
  menu: MenuGroup[];
  faq: FaqItem[];
  pricing: PricingPlan[];
  process: ProcessStep[];
  logos: string[];
}

function rot<T>(arr: readonly T[], seed: number, i: number): T {
  return arr[(seed + i) % arr.length];
}

const NEWS_CATEGORIES = ["方法观察", "服务札记", "现场经验", "质量说明", "趋势简报", "演示更新"];
const NEWS_MONTHS = ["01", "03", "05", "06", "09", "11"];
const MEMBER_MARKS = ["甲", "乙", "丙", "丁"];
const ITEM_MARKS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"];

function pick<T>(arr: readonly T[], slug: string, salt: string, i = 0): T {
  return arr[(hashStr(`${slug}:${salt}`) + i) % arr.length];
}

export function buildExt(
  slug: string,
  industryKey: string,
  subLabel: string,
  subKey = "",
): ExtContent {
  const seed = hashStr(slug + ":ext");
  const pool = copyPoolFor(industryKey);
  const workTitles = WORK_TITLES_BY_SUB[subKey];

  const cases: CaseItem[] = Array.from({ length: 6 }, (_, i) => ({
    title: workTitles
      ? `${subLabel} · ${rot(workTitles, seed, i)}演示`
      : `${subLabel} · ${pick(pool.themes, slug, "case-title", i)}演示`,
    tag: pick(pool.themes, slug, "case-tag", i),
    desc: `本条${subLabel}演示内容聚焦${pick(pool.themes, slug, "case-theme", i)}，通过${pick(pool.actions, slug, "case-action", i)}推进，并以${pick(pool.evidence, slug, "case-evidence", i)}呈现结果。`,
  }));

  const news: NewsItem[] = Array.from({ length: 6 }, (_, i) => ({
    date: `2026-${rot(NEWS_MONTHS, seed, i)}-${String(8 + ((seed + i) % 20)).padStart(2, "0")}`,
    cat: pick(NEWS_CATEGORIES, slug, "news-cat", i),
    title: `${subLabel}观察：${pick(pool.angles, slug, "news-title", i)}`,
    excerpt: `这篇${subLabel}演示稿梳理${pick(pool.angles, slug, "news-angle", i)}，并用${pick(pool.evidence, slug, "news-evidence", i)}说明可检查的执行依据。`,
  }));

  const team: TeamMember[] = Array.from({ length: 4 }, (_, i) => ({
    name: `待替换成员·${pick(MEMBER_MARKS, slug, "member", i)}`,
    role: `${subLabel}${pick(pool.roles, slug, "role", i)}`,
  }));

  // 商品、菜单只会由相应 section 消费；名称和金额均明确标为演示内容。
  // 子类目录存在时，卡片先说清「卖的到底是什么」，不再把行业做事动作当成货。
  const priceBase = 39 + (seed % 60);
  const productNouns = PRODUCT_NOUNS_BY_SUB[subKey];
  const products: ProductItem[] = Array.from({ length: 8 }, (_, i) => ({
    name: productNouns
      ? `${subLabel}演示·${rot(productNouns, seed, i)}·${i < 4 ? "甲款" : "乙款"}`
      : `${subLabel}演示·${pick(pool.offerings, slug, "product", i)}`,
    price: `示例 ¥${priceBase + i * 30}`,
    note: i % 2 === 0 ? "展示样品" : "信息待改",
  }));

  const menuCatalog = MENU_GROUPS_BY_SUB[subKey];
  const menu: MenuGroup[] = menuCatalog
    ? menuCatalog.map((group, groupIndex) => ({
        group: group.name.zh,
        items: group.items.map((_, itemIndex) => ({
          name: `${subLabel}演示·${rot(group.items, seed + groupIndex, itemIndex).zh}`,
          price: `示例 ¥${18 + ((seed + groupIndex * 11 + itemIndex * 3) % 42)}`,
        })),
      }))
    : [
        {
          group: "示例搭配",
          items: Array.from({ length: 4 }, (_, i) => ({
            name: `${subLabel}演示·${pick(pool.offerings, slug, "menu-a", i)}`,
            price: `示例 ¥${28 + ((seed + i) % 40)}`,
          })),
        },
        {
          group: "更多示例",
          items: Array.from({ length: 4 }, (_, i) => ({
            name: `${subLabel}演示·${pick(pool.offerings, slug, "menu-b", i + 4)}`,
            price: `示例 ¥${18 + ((seed + i * 2) % 30)}`,
          })),
        },
      ];

  const faq: FaqItem[] = [
    {
      q: `选择${subLabel}时，应先确认哪些条件？`,
      a: `建议先说明${subLabel}的${pick(pool.themes, slug, "faq-theme", 0)}与实际目标，再用${pick(pool.evidence, slug, "faq-evidence", 0)}核对双方理解。`,
    },
    {
      q: `${subLabel}内容可以按实际情况调整吗？`,
      a: `可以，${subLabel}演示站会先围绕${pick(pool.themes, slug, "faq-theme", 1)}列出范围，再根据现场信息调整${pick(pool.actions, slug, "faq-action", 1)}的顺序。`,
    },
    {
      q: `${subLabel}开始前需要准备什么资料？`,
      a: `可先整理${subLabel}与${pick(pool.themes, slug, "faq-theme", 2)}有关的现有信息，再通过${pick(pool.actions, slug, "faq-action", 2)}补齐缺项。`,
    },
    {
      q: `${subLabel}进行中怎样了解当前进展？`,
      a: `${subLabel}每个阶段都可查看${pick(pool.evidence, slug, "faq-evidence", 3)}，其中会注明已完成事项、待确认内容与下一步安排。`,
    },
    {
      q: `${subLabel}完成后还会留下哪些内容？`,
      a: `${subLabel}演示流程会整理${pick(pool.evidence, slug, "faq-evidence", 4)}，并补充${pick(pool.angles, slug, "faq-angle", 4)}所需的后续提示。`,
    },
  ];

  const pricing: PricingPlan[] = [
    {
      name: "起步协作",
      price: `示例 ¥${(2 + (seed % 4)) * 1000} · ${subLabel}`,
      unit: "/ 参考",
      features: [
        `${subLabel}${pick(pool.themes, slug, "price-theme", 0)}梳理`,
        `${subLabel}${pick(pool.actions, slug, "price-action", 0)}说明`,
        `${subLabel}${pick(pool.evidence, slug, "price-proof", 0)}留存`,
        `${subLabel}单阶段演示支持`,
      ],
      featured: false,
    },
    {
      name: "完整协作",
      price: `示例 ¥${(8 + (seed % 6)) * 1000} · ${subLabel}`,
      unit: "/ 参考",
      features: [
        `${subLabel}${pick(pool.themes, slug, "price-theme", 1)}展开`,
        `${subLabel}${pick(pool.actions, slug, "price-action", 1)}跟进`,
        `${subLabel}${pick(pool.evidence, slug, "price-proof", 1)}复核`,
        `${subLabel}多节点演示支持`,
        `${subLabel}交付摘要整理`,
      ],
      featured: true,
    },
    {
      name: "持续协作",
      price: "按需估算",
      unit: "",
      features: [
        `${subLabel}${pick(pool.themes, slug, "price-theme", 2)}延展`,
        `${subLabel}${pick(pool.actions, slug, "price-action", 2)}协同`,
        `${subLabel}${pick(pool.evidence, slug, "price-proof", 2)}归档`,
        `${subLabel}后续轮次演示支持`,
        `${subLabel}调整事项持续记录`,
      ],
      featured: false,
    },
  ];

  const process: ProcessStep[] = pool.stages.map((title, i) => ({
    step: String(i + 1).padStart(2, "0"),
    title,
    desc: `${subLabel}演示流程在此阶段会${pick(pool.actions, slug, "process-action", i)}，并用${pick(pool.evidence, slug, "process-evidence", i)}确认进展。`,
  }));

  const logos = ITEM_MARKS.map((mark, i) =>
    `${subLabel}演示协作方·${pick(ITEM_MARKS, slug, "logo", i)}${mark}`,
  );

  return { cases, news, team, products, menu, faq, pricing, process, logos };
}
