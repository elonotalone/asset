// 定装：4 种页面构成 × 10 套装。第二批的唯一长相来源。
//
// 规格：docs/work-logs/2026-08/website-material-convergence/spec-02-shapes-and-skins.md
// （在 /opt/cursor-workspaces/oceandino 下）
//
// 这张表取代 dnaFor 里的哈希掷骰子。在此之前，圆角、疏密、字体、装饰效果各自
// 随机，可能的长相有几万种，被人看过一眼点头的接近于零；用量也证明它失控了 ——
// 最热的骨架吃 69 个站，最冷的 2 个，配色 neon-cyan 在 500 个站里只用过 1 次。
//
// 收敛的是「装」的数量，不是货架上的件数：500 个站仍然是 500 件货，因为行业、
// 文案和照片不同。共用一套装的花店和诊所，对用户仍然是两件不同的东西。

import type { AccentFx } from "./template-effects";
import type { Density, FontKind, PageKey, Radius } from "./template-dna";

// —— 页面构成 ——————————————————————————————————————————————

export type ShapeKey = "s3" | "s4" | "s5" | "s6";

export interface Shape {
  key: ShapeKey;
  label: string;
  /** 导航顺序。`main` 是「主营」占位，实际页名由 mainPageLabel() 按行业给出。 */
  pages: (PageKey | "main")[];
  /** 货架上这一档卖给谁。 */
  forWhom: string;
}

/**
 * 18 种页面构成压成 4 种。它们是一个阶梯，每一级比上一级多一页。
 *
 * 「主营」页角色固定（我做什么），名字随行业走：设计公司叫作品，律所叫服务，
 * 商店叫商品，餐厅叫菜单。所有小生意的网站本质上都是
 * 「首页 / 我做什么 / 我是谁 / 怎么找我」，这是压成 4 种而不丢意义的关键。
 *
 * 构成之间不允许互换：六页的内容永远不会被塞进三页，所以不存在
 * 「你有几条内容放不下，先收起来了」这种事。规模在货架上就选定了。
 */
export const SHAPES: Shape[] = [
  {
    key: "s3",
    label: "名片站",
    pages: ["home", "about", "contact"],
    forWhom: "只需要被找到的小生意",
  },
  {
    key: "s4",
    label: "主打站",
    pages: ["home", "main", "about", "contact"],
    forWhom: "有明确主打的生意",
  },
  {
    key: "s5",
    label: "成果站",
    pages: ["home", "main", "cases", "about", "contact"],
    forWhom: "需要拿成果说话的生意",
  },
  {
    key: "s6",
    label: "官网",
    pages: ["home", "main", "cases", "about", "news", "contact"],
    forWhom: "要持续更新的正式官网",
  },
];

// —— 装 ————————————————————————————————————————————————

export type SkinKey =
  | "paper"
  | "editorial"
  | "bento"
  | "brutalist"
  | "neon"
  | "fullscreen"
  | "nature"
  | "sand"
  | "navy"
  | "glass";

/** 一套装钉死这五个维度加明暗；除此之外不再有任何随机长相。 */
export interface Skin {
  key: SkinKey;
  label: string;
  /** 一句话气质，货架上直接给用户看。 */
  feel: string;
  /** 只在这些配色里取（PALETTES_V2 的 key）。 */
  palettes: string[];
  radius: Radius;
  density: Density;
  font: FontKind;
  fx: AccentFx;
  dark: boolean;
}

/**
 * 每一套都必须一眼能和别的九套分开 —— 这是「少而准」的执行标准：不是十套微妙
 * 不同的灰，是十种明显不同的气质。任意两套之间至少要在配色、圆角、字体、疏密、
 * 装饰这五个维度里有 3 个以上不同，由 skinsAreDistinguishable() 守住。
 */
export const SKINS: Skin[] = [
  {
    key: "paper",
    label: "素白",
    feel: "近白底、细线、大量留白，几乎没有装饰",
    palettes: ["paper"],
    radius: "soft",
    density: "airy",
    font: "sans",
    fx: "none",
    dark: false,
  },
  {
    key: "editorial",
    label: "杂志",
    feel: "大字号衬线标题、窄栏，黑白加一个强调色",
    palettes: ["graphite"],
    radius: "sharp",
    density: "airy",
    font: "serif",
    fx: "shimmer",
    dark: false,
  },
  {
    key: "bento",
    label: "便当",
    feel: "圆角方块拼贴、卡片式、柔和阴影",
    palettes: ["teal", "indigo"],
    radius: "round",
    density: "regular",
    font: "sans",
    fx: "blobs",
    dark: false,
  },
  {
    key: "brutalist",
    label: "粗野",
    feel: "硬边、粗框、高对比、零圆角",
    palettes: ["crimson", "rose"],
    radius: "sharp",
    density: "compact",
    font: "geometric",
    fx: "stripes",
    dark: false,
  },
  {
    key: "neon",
    label: "霓虹",
    feel: "深色底、发光强调色、细线网格",
    palettes: ["neon-cyan", "neon-violet", "neon-magenta"],
    radius: "sharp",
    density: "regular",
    font: "geometric",
    fx: "neon-grid",
    dark: true,
  },
  {
    key: "fullscreen",
    label: "全屏叙事",
    feel: "整屏大图、逐屏推进，文字极少",
    palettes: ["glacier"],
    radius: "soft",
    density: "airy",
    font: "serif",
    fx: "spotlight",
    dark: true,
  },
  {
    key: "nature",
    label: "自然",
    feel: "低饱和绿、圆润、温和",
    palettes: ["forest", "lime", "jade-gold"],
    radius: "round",
    density: "regular",
    font: "serif",
    fx: "waves",
    dark: false,
  },
  {
    key: "sand",
    label: "暖砂",
    feel: "暖米底、衬线、手作感",
    palettes: ["mocha", "amber", "gold"],
    radius: "soft",
    density: "regular",
    font: "serif",
    fx: "none",
    dark: false,
  },
  {
    key: "navy",
    label: "深蓝",
    feel: "深色导航、直角、稳重",
    palettes: ["ocean"],
    radius: "sharp",
    density: "compact",
    font: "sans",
    fx: "grid",
    dark: false,
  },
  {
    key: "glass",
    label: "玻璃",
    feel: "浅色渐变、半透明层、柔光",
    palettes: ["violet", "mauve"],
    radius: "round",
    density: "airy",
    font: "geometric",
    fx: "aurora",
    dark: false,
  },
];

// —— 红线：装不能偏离主题 ————————————————————————————————

/**
 * 准入表。机器判断不了「杂志风配咖啡店好不好看」，但能挡住明显不对的搭配：
 * 诊所永远选不到粗野主义，夜店永远选不到素白。换装和「换一个看看」都只在
 * 这个集合里转。
 *
 * 每个行业至少 3 套，否则同行业的站会互相撞脸。素白对所有行业开放，是兜底。
 */
export const INDUSTRY_SKINS: Record<string, SkinKey[]> = {
  media: ["editorial", "brutalist", "neon", "paper"],
  business: ["navy", "bento", "glass", "paper"],
  fashion: ["editorial", "brutalist", "fullscreen", "sand", "paper"],
  org: ["editorial", "nature", "navy", "paper"],
  tech: ["bento", "brutalist", "neon", "glass", "paper"],
  life: ["editorial", "fullscreen", "sand", "paper"],
  food: ["fullscreen", "nature", "sand", "paper"],
  industry: ["nature", "navy", "paper"],
  home: ["bento", "sand", "glass", "paper"],
  grocery: ["nature", "sand", "glass", "paper"],
  hardware: ["navy", "bento", "paper"],
  logistics: ["navy", "bento", "paper"],
  general: ["editorial", "bento", "navy", "paper"],
};

/** 「主营」页在各行业叫什么。子类需要时用 MAIN_PAGE_LABEL_BY_SUB 覆盖。 */
export const MAIN_PAGE_LABEL: Record<string, string> = {
  media: "作品",
  business: "服务",
  fashion: "商品",
  org: "课程",
  tech: "服务",
  life: "作品",
  food: "菜单",
  industry: "产品",
  home: "商品",
  grocery: "商品",
  hardware: "产品",
  logistics: "服务",
  general: "服务",
};

/**
 * 子类级覆盖。食品行业默认叫「菜单」，但酒店和旅游服务卖的不是菜 —— 这类
 * 例外写在这里，由接手的实施者按子类补全。
 */
export const MAIN_PAGE_LABEL_BY_SUB: Record<string, string> = {};

// —— 查表 ————————————————————————————————————————————————

const SKIN_BY_KEY = new Map(SKINS.map((s) => [s.key, s]));
const SHAPE_BY_KEY = new Map(SHAPES.map((s) => [s.key, s]));

export function skin(key: SkinKey): Skin {
  const found = SKIN_BY_KEY.get(key);
  if (!found) throw new Error(`未知的装：${key}`);
  return found;
}

export function shape(key: ShapeKey): Shape {
  const found = SHAPE_BY_KEY.get(key);
  if (!found) throw new Error(`未知的页面构成：${key}`);
  return found;
}

export function skinsFor(industryKey: string): SkinKey[] {
  return INDUSTRY_SKINS[industryKey] ?? ["paper"];
}

export function mainPageLabel(industryKey: string, subKey?: string): string {
  if (subKey && MAIN_PAGE_LABEL_BY_SUB[subKey]) return MAIN_PAGE_LABEL_BY_SUB[subKey];
  return MAIN_PAGE_LABEL[industryKey] ?? "服务";
}

/**
 * 两套装必须在配色、圆角、字体、疏密、装饰这五个维度里有 3 个以上不同。
 * 防的是「十套装其实长得差不多」这种自欺 —— 那等于把随机换了个说法。
 */
export function skinDifferences(a: Skin, b: Skin): string[] {
  const diff: string[] = [];
  if (!a.palettes.some((p) => b.palettes.includes(p))) diff.push("配色");
  if (a.radius !== b.radius) diff.push("圆角");
  if (a.font !== b.font) diff.push("字体");
  if (a.density !== b.density) diff.push("疏密");
  if (a.fx !== b.fx) diff.push("装饰");
  return diff;
}

export const MIN_SKIN_DIFFERENCES = 3;
