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
export type ShapePageRole = "home" | "main" | "cases" | "about" | "news" | "contact";

export interface Shape {
  key: ShapeKey;
  label: string;
  /** 导航顺序。`main` 是「主营」占位，实际页名由 mainPageLabel() 按行业给出。 */
  pages: ShapePageRole[];
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

/**
 * 构成轴使用的稳定页面角色。`main` 最终会解析成当前行业的 services/products/menu/works，
 * 其余角色与 website 工程对象的 page key 同名。
 */
const SHAPE_PAGE_ROLES: ShapePageRole[] = ["home", "main", "cases", "about", "news", "contact"];

/**
 * 换构成时每类原页面应落到目标构成的哪类页面。
 *
 * 构成变小不等于内容消失：目标没有资讯/案例/主营页时，整页板块按原顺序并入最近仍
 * 存在的业务展示页。website 侧只搬 section，不重写 section content；因此六页换成
 * 较小但仍高于行业下限的构成时，原字句和图片槽仍全部存在。
 */
export const SHAPE_CONTENT_PLACEMENT: Record<ShapeKey, Record<ShapePageRole, ShapePageRole>> = {
  s3: {
    home: "home",
    main: "home",
    cases: "home",
    about: "about",
    news: "home",
    contact: "contact",
  },
  s4: {
    home: "home",
    main: "main",
    cases: "main",
    about: "about",
    news: "main",
    contact: "contact",
  },
  s5: {
    home: "home",
    main: "main",
    cases: "cases",
    about: "about",
    news: "cases",
    contact: "contact",
  },
  s6: {
    home: "home",
    main: "main",
    cases: "cases",
    about: "about",
    news: "news",
    contact: "contact",
  },
};

// —— 构成下限：一个站凭什么落到某一档 ————————————————————

/**
 * 构成不能靠掷骰子分配。第一版规格漏了这条，实施时只能沿用
 * `SHAPES[variant % 4]`，结果 500 个站里 224 个被分到更小的构成、36 个从六页
 * 掉到三页 —— 医院、婚庆、房地产这些本该是正式官网的都被压成了三页名片。
 * 这撞了「六页内容不能塞进三页」这条红线。
 *
 * 规则：构成由这门生意实际需要几页决定。每个行业给下限，子类可覆盖；同一子类
 * 的多个变体在下限之上分布到相邻档位（让同行业的货架有大小可挑），但任何一个
 * 站都不得低于它的下限。
 */
export const SHAPE_FLOOR: Record<string, ShapeKey> = {
  // 靠案例和作品说话，没有案例页就不成立
  media: "s5",
  life: "s5",
  tech: "s5",
  hardware: "s5",
  logistics: "s5",
  // 正式官网：要资讯持续更新，规模本身就是信任的一部分
  business: "s6",
  org: "s6",
  industry: "s6",
  // 有主打（商品/菜单/服务）但不需要案例页
  fashion: "s4",
  food: "s4",
  home: "s4",
  grocery: "s4",
  // 通用行业里混着个人主页和单品落地页，下限交给子类
  general: "s3",
};

/**
 * 子类级覆盖。行业下限是粗粒度的：食品行业整体 4 页够用，但医药保健里的医院
 * 是正式机构，需要 6 页；通用行业整体 3 页，但里面也有正经企业站。
 * 105 个子类逐个过一遍，例外写在这里。
 */
export const SHAPE_FLOOR_BY_SUB: Record<string, ShapeKey> = {
  // 商业行业整体按正式官网处理；这些专业服务靠案例取信，但不要求持续资讯页。
  registration: "s5",
  accounting: "s5",
  trademark: "s5",
  law: "s5",

  // 医学美容是医疗机构，不是普通美容门店。
  "medical-beauty": "s6",

  // 教育靠课程与成果取信；政府、协会和商会仍沿用组织机构的六页下限。
  school: "s5",
  training: "s5",

  // 明确叫“公司”的科技企业需要可持续更新的正式官网。
  "tech-company": "s6",

  // 生活行业默认靠案例；商品门店与小型到店/上门服务四页即可说清。
  bridal: "s4",
  cleaning: "s4",
  "car-care": "s4",
  "photo-print": "s4",
  moving: "s4",
  pets: "s4",
  flowers: "s4",

  // 医院和齿科是医疗机构，不能跟食品、茶酒和药品零售共用四页下限。
  hospital: "s6",
  dental: "s6",

  // 出口贸易与通用企业是正式企业站；通用商城仍是商品型站。
  "export-trade": "s6",
  enterprise: "s6",
  mall: "s4",
};

const SHAPE_ORDER: ShapeKey[] = ["s3", "s4", "s5", "s6"];

export function shapeFloor(industryKey: string, subKey?: string): ShapeKey {
  if (subKey && SHAPE_FLOOR_BY_SUB[subKey]) return SHAPE_FLOOR_BY_SUB[subKey];
  return SHAPE_FLOOR[industryKey] ?? "s4";
}

/**
 * 同子类的第 variant 个变体落在哪一档：从下限起，在 [下限..s6] 之间循环。
 * 下限是 s5 的子类，它的 5 个变体就在 5 页和 6 页之间交替，永远不会掉到 4 页。
 */
export function shapeForSite(industryKey: string, variant: number, subKey?: string): Shape {
  const floor = shapeFloor(industryKey, subKey);
  const from = SHAPE_ORDER.indexOf(floor);
  const pool = SHAPE_ORDER.slice(from);
  const key = pool[Math.abs(variant - 1) % pool.length];
  return shape(key);
}

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

// —— 文案口吻 ——————————————————————————————————————————————

export type CopyToneKey = "balanced" | "concise" | "promotional";

export interface CopyTone {
  key: CopyToneKey;
  label: string;
  description: string;
}

/**
 * 文案轴只改变表达方式，不改变事实、页面、板块或槽位。现有逐子类精修文案属于
 * balanced；另外两档由编辑器基于同一份原文生成展示值，原文始终保留，切回来不丢字。
 */
export const COPY_TONES: CopyTone[] = [
  {
    key: "balanced",
    label: "自然",
    description: "信息完整、语气克制，保留模板的行业原文",
  },
  {
    key: "concise",
    label: "精简",
    description: "缩短表达、突出结论，不改变原文事实与槽位",
  },
  {
    key: "promotional",
    label: "推广",
    description: "强化价值与行动引导，不改变原文事实与槽位",
  },
];

export const DEFAULT_COPY_TONE: CopyToneKey = "balanced";

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
export const MAIN_PAGE_LABEL_BY_SUB: Record<string, string> = {
  // 传媒：顾问、会展与印刷卖的是服务或产品，不是作品集。
  "pr-consulting": "服务",
  "gift-custom": "商品",
  exhibition: "服务",
  printing: "产品",

  // 商业：地产与拍卖的主营对象比笼统的「服务」更具体。
  realestate: "项目",
  pawn: "拍品",

  // 时尚分类里混有到店服务。
  hairsalon: "服务",
  nails: "服务",
  slimming: "服务",
  "medical-beauty": "服务",

  // 组织分类只有学校和培训机构以课程为主营。
  government: "服务",
  association: "服务",
  chamber: "服务",

  // 科技公司与互联网产品站以产品为主营，建站公司仍沿用行业默认「服务」。
  internet: "产品",
  "tech-company": "产品",

  // 生活分类同时包含作品型、商品型和上门/到店服务型业务。
  bridal: "商品",
  cleaning: "服务",
  "car-care": "服务",
  "photo-print": "服务",
  moving: "服务",
  pets: "服务",
  flowers: "商品",

  // 餐饮保留「菜单」；住宿、旅行和签证不能被叫作菜单。
  farmstay: "客房",
  resort: "客房",
  hotel: "客房",
  "travel-agency": "线路",
  "local-tour": "线路",
  visa: "服务",

  // 环保回收的主营是回收服务，不是产品目录。
  recycling: "服务",

  // 食品/医药分类里的医院和齿科是诊疗服务。
  hospital: "服务",
  dental: "服务",

  // 租赁站展示可租对象；通用分类里的商城与个人页也要回到各自业务语言。
  "house-rent": "房源",
  "car-rent": "车辆",
  mall: "商品",
  personal: "作品",
};

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

// —— website-source@1 三轴元数据 ——————————————————————————

export const TEMPLATE_AXES_SCHEMA = "oceanleo.template-axes@1" as const;

export interface ShapeAxisPage {
  /** 不随行业变化的语义角色。 */
  role: ShapePageRole;
  /** website 工程对象实际使用的 page key；main 已解析成行业页。 */
  key: PageKey;
}

export interface ShapeAxisOption {
  key: ShapeKey;
  label: string;
  forWhom: string;
  pages: ShapeAxisPage[];
  /** 原 page key → 目标 page key；搬整段 sections，禁止丢弃。 */
  contentPlacement: Record<string, PageKey>;
}

export interface TemplateAxesMetadata {
  schema: typeof TEMPLATE_AXES_SCHEMA;
  identity: {
    industry: { key: string; label: string };
    sub: { key: string; label: string };
  };
  shape: {
    current: ShapeAxisOption;
    floor: ShapeKey;
    /** 只含 floor 及以上构成。 */
    options: ShapeAxisOption[];
  };
  skin: {
    current: Skin;
    /** 只含 INDUSTRY_SKINS 准入的外观，且带应用外观所需的全部令牌。 */
    options: Skin[];
  };
  copy: {
    current: CopyTone;
    options: CopyTone[];
    /** 编辑器必须保留原文，以非破坏方式派生口吻。 */
    preservation: "preserve-source-text";
  };
}

export interface TemplateAxesInput {
  industry: { key: string; label: string };
  sub: { key: string; label: string };
  shapeKey: ShapeKey;
  skinKey: SkinKey;
  /** 当前行业“主营”页实际落到的 website page key。 */
  mainPageKey: PageKey;
  copyTone?: CopyToneKey;
}

function pageKeyForRole(role: ShapePageRole, mainPageKey: PageKey): PageKey {
  return role === "main" ? mainPageKey : role;
}

function shapeAxisOption(value: Shape, mainPageKey: PageKey): ShapeAxisOption {
  const placement = SHAPE_CONTENT_PLACEMENT[value.key];
  return {
    key: value.key,
    label: value.label,
    forWhom: value.forWhom,
    pages: value.pages.map((role) => ({
      role,
      key: pageKeyForRole(role, mainPageKey),
    })),
    contentPlacement: Object.fromEntries(
      SHAPE_PAGE_ROLES.map((sourceRole) => [
        pageKeyForRole(sourceRole, mainPageKey),
        pageKeyForRole(placement[sourceRole], mainPageKey),
      ]),
    ),
  };
}

function copyTone(key: CopyToneKey): CopyTone {
  const found = COPY_TONES.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`未知的文案口吻：${key}`);
  return { ...found };
}

function skinAxisOption(value: Skin): Skin {
  return { ...value, palettes: [...value.palettes] };
}

/**
 * 把散落的构成、下限、外观准入与文案口吻汇成 website 只需读取一次的稳定对象。
 * 当前值若违反下限/准入，直接拒绝发射，不能把非法组合带进编辑器。
 */
export function templateAxesFor(input: TemplateAxesInput): TemplateAxesMetadata {
  const floor = shapeFloor(input.industry.key, input.sub.key);
  const floorIndex = SHAPE_ORDER.indexOf(floor);
  const shapeOptions = SHAPES
    .slice(floorIndex)
    .map((value) => shapeAxisOption(value, input.mainPageKey));
  const currentShape = shapeOptions.find((candidate) => candidate.key === input.shapeKey);
  if (!currentShape) {
    throw new Error(`${input.sub.key}: 当前构成 ${input.shapeKey} 低于下限 ${floor}`);
  }

  const allowedSkinKeys = skinsFor(input.industry.key);
  if (!allowedSkinKeys.includes(input.skinKey)) {
    throw new Error(`${input.industry.key}: 当前外观 ${input.skinKey} 不在行业准入表`);
  }
  const skinOptions = allowedSkinKeys.map((key) => skinAxisOption(skin(key)));
  const toneKey = input.copyTone ?? DEFAULT_COPY_TONE;

  return {
    schema: TEMPLATE_AXES_SCHEMA,
    identity: {
      industry: { ...input.industry },
      sub: { ...input.sub },
    },
    shape: {
      current: currentShape,
      floor,
      options: shapeOptions,
    },
    skin: {
      current: skinOptions.find((candidate) => candidate.key === input.skinKey)!,
      options: skinOptions,
    },
    copy: {
      current: copyTone(toneKey),
      options: COPY_TONES.map((candidate) => ({ ...candidate })),
      preservation: "preserve-source-text",
    },
  };
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
