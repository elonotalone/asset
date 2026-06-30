// 模板专区分类单一事实源（对标 aliyun.wezhan.cn 的「行业 + 子类」）。
// 列表页、详情页、slug 生成、sitemap 全部读这里。改这一处即可全站对齐。
//
// 13 个一级行业，105 个子类。v2：每子类数量由 countForSub 派生，全库恰好 500，
// 每个模板是多页 + 真多样（见 template-dna.ts / template-engine.ts）。

import { hashStr } from "./hash";
import { dnaFor } from "./template-dna";

export { hashStr };

export type ColorKey =
  | "multi"
  | "red"
  | "orange"
  | "green"
  | "blue"
  | "purple"
  | "dark"
  | "light";

export interface ColorSystem {
  key: ColorKey;
  label: string;
  /** 卡片色点用的代表色（hex）。 */
  swatch: string;
}

// 色系筛选（对齐 wezhan 截图里的 8 个色点：彩 / 红 / 橙 / 绿 / 蓝 / 紫 / 黑 / 白）。
export const COLOR_SYSTEMS: ColorSystem[] = [
  { key: "multi", label: "彩色", swatch: "conic" },
  { key: "red", label: "红色系", swatch: "#ef4444" },
  { key: "orange", label: "橙色系", swatch: "#f59e0b" },
  { key: "green", label: "绿色系", swatch: "#22c55e" },
  { key: "blue", label: "蓝色系", swatch: "#3b82f6" },
  { key: "purple", label: "紫色系", swatch: "#8b5cf6" },
  { key: "dark", label: "黑色系", swatch: "#27272a" },
  { key: "light", label: "白色系", swatch: "#e5e7eb" },
];

export interface SubCategory {
  /** slug 用的英文 key（拼音/英文，全局唯一）。 */
  key: string;
  /** 中文显示名。 */
  label: string;
  /** 配图关键词（Unsplash query，英文）。 */
  photo: string;
}

export interface Industry {
  key: string;
  label: string;
  /** 默认色系（卡片/预览主色调倾向）。 */
  color: ColorKey;
  subs: SubCategory[];
}

export const INDUSTRIES: Industry[] = [
  {
    key: "media",
    label: "传媒/广告/营销策划",
    color: "purple",
    subs: [
      { key: "culture-media", label: "文化传媒", photo: "media,studio" },
      { key: "ad-design", label: "广告设计", photo: "advertising,design" },
      { key: "pr-consulting", label: "公关顾问", photo: "conference,business" },
      { key: "brand-planning", label: "品牌策划", photo: "branding,creative" },
      { key: "gift-custom", label: "礼品定制", photo: "gift,custom" },
      { key: "exhibition", label: "展会服务", photo: "exhibition,expo" },
      { key: "printing", label: "印刷包装", photo: "printing,packaging" },
    ],
  },
  {
    key: "business",
    label: "金融/地产/商业服务",
    color: "blue",
    subs: [
      { key: "finance", label: "金融服务", photo: "finance,city" },
      { key: "investment", label: "投资咨询", photo: "investment,chart" },
      { key: "loan", label: "理财贷款", photo: "money,bank" },
      { key: "realestate", label: "房地产开发", photo: "architecture,skyscraper" },
      { key: "registration", label: "工商注册", photo: "office,documents" },
      { key: "accounting", label: "财务会计", photo: "accounting,calculator" },
      { key: "trademark", label: "商标专利", photo: "patent,legal" },
      { key: "law", label: "法律/律师", photo: "law,justice" },
      { key: "guarantee", label: "投资担保", photo: "handshake,contract" },
      { key: "pawn", label: "典当拍卖", photo: "auction,gold" },
    ],
  },
  {
    key: "fashion",
    label: "服装/饰品/美容护肤",
    color: "red",
    subs: [
      { key: "womenswear", label: "女装", photo: "women,fashion" },
      { key: "menswear", label: "男装", photo: "men,suit" },
      { key: "kidswear", label: "童装", photo: "kids,clothing" },
      { key: "maternity", label: "母婴用品", photo: "baby,maternity" },
      { key: "shoes", label: "鞋靴", photo: "shoes,sneakers" },
      { key: "bags", label: "箱包", photo: "handbag,luggage" },
      { key: "jewelry", label: "珠宝", photo: "jewelry,diamond" },
      { key: "glasses", label: "眼镜", photo: "eyewear,glasses" },
      { key: "watches", label: "钟表", photo: "watch,luxury" },
      { key: "hairsalon", label: "美容美发", photo: "salon,hair" },
      { key: "nails", label: "美甲美睫", photo: "manicure,nails" },
      { key: "makeup", label: "美妆彩妆", photo: "makeup,cosmetics" },
      { key: "slimming", label: "纤体瘦身", photo: "fitness,spa" },
      { key: "medical-beauty", label: "医学美容", photo: "skincare,clinic" },
    ],
  },
  {
    key: "org",
    label: "教育/政府/组织机构",
    color: "blue",
    subs: [
      { key: "school", label: "学校", photo: "school,campus" },
      { key: "training", label: "培训机构", photo: "education,classroom" },
      { key: "government", label: "政府机关单位", photo: "government,building" },
      { key: "association", label: "协会", photo: "meeting,community" },
      { key: "chamber", label: "商会", photo: "business,community" },
    ],
  },
  {
    key: "tech",
    label: "IT/互联网/科技行业",
    color: "dark",
    subs: [
      { key: "web-build", label: "网站建设", photo: "website,code" },
      { key: "internet", label: "互联网行业", photo: "internet,technology" },
      { key: "tech-company", label: "科技公司", photo: "technology,startup" },
    ],
  },
  {
    key: "life",
    label: "婚庆/摄影/生活服务",
    color: "red",
    subs: [
      { key: "wedding", label: "婚庆公司", photo: "wedding,ceremony" },
      { key: "bridal", label: "婚纱", photo: "wedding,dress" },
      { key: "photography", label: "写真", photo: "photography,portrait" },
      { key: "cleaning", label: "家庭保洁", photo: "cleaning,home" },
      { key: "car-care", label: "汽车保养", photo: "car,maintenance" },
      { key: "photo-print", label: "快照冲印", photo: "photo,print" },
      { key: "moving", label: "搬家公司", photo: "moving,truck" },
      { key: "pets", label: "宠物", photo: "pet,dog" },
      { key: "flowers", label: "鲜花", photo: "flowers,bouquet" },
    ],
  },
  {
    key: "food",
    label: "餐饮/酒店/旅游服务",
    color: "orange",
    subs: [
      { key: "fastfood", label: "小吃快餐", photo: "fastfood,snack" },
      { key: "hotpot", label: "火锅", photo: "hotpot,chinese" },
      { key: "western", label: "西餐", photo: "steak,restaurant" },
      { key: "japanese-korean", label: "日韩料理", photo: "sushi,japanese" },
      { key: "bakery", label: "面包甜点", photo: "bakery,dessert" },
      { key: "bbq", label: "烧烤/海鲜自助", photo: "barbecue,seafood" },
      { key: "farmstay", label: "农家乐", photo: "farm,countryside" },
      { key: "resort", label: "休闲度假", photo: "resort,vacation" },
      { key: "hotel", label: "宾馆酒店", photo: "hotel,lobby" },
      { key: "travel-agency", label: "旅行社", photo: "travel,tourism" },
      { key: "local-tour", label: "周边游", photo: "nature,trip" },
      { key: "visa", label: "出境游/签证服务", photo: "passport,airport" },
    ],
  },
  {
    key: "industry",
    label: "化工/环保/农林牧渔",
    color: "green",
    subs: [
      { key: "chem-material", label: "建筑/化工材料", photo: "construction,material" },
      { key: "textile", label: "纺织辅料", photo: "textile,fabric" },
      { key: "rubber-plastic", label: "橡胶塑料", photo: "plastic,factory" },
      { key: "metallurgy", label: "冶金矿产", photo: "metal,mining" },
      { key: "recycling", label: "环保回收", photo: "recycling,green" },
      { key: "farming", label: "农作物种植", photo: "farm,crops" },
      { key: "feed", label: "畜禽饲料", photo: "livestock,farm" },
      { key: "garden", label: "园林花卉", photo: "garden,plants" },
    ],
  },
  {
    key: "home",
    label: "数码/家具/家居百货",
    color: "blue",
    subs: [
      { key: "digital", label: "电脑及数码", photo: "computer,digital" },
      { key: "appliance", label: "生活电器", photo: "appliance,kitchen" },
      { key: "phone", label: "手机及配件", photo: "smartphone,gadget" },
      { key: "furniture", label: "家私家具", photo: "furniture,interior" },
      { key: "kitchenware", label: "餐饮/厨房用品", photo: "kitchenware,cooking" },
      { key: "decor", label: "家居软饰", photo: "home,decor" },
      { key: "bedding", label: "床上用品", photo: "bedding,bedroom" },
      { key: "towel", label: "毛巾巾类", photo: "towel,textile" },
      { key: "lighting", label: "灯具灯饰", photo: "lighting,lamp" },
    ],
  },
  {
    key: "grocery",
    label: "食品/茶酒/医药保健",
    color: "green",
    subs: [
      { key: "fruit-veg", label: "蔬果", photo: "vegetables,fruit" },
      { key: "snacks", label: "零食", photo: "snacks,food" },
      { key: "specialty", label: "特产", photo: "specialty,local" },
      { key: "tea", label: "茶叶", photo: "tea,ceremony" },
      { key: "baijiu", label: "酒类（白酒）", photo: "liquor,bottle" },
      { key: "wine", label: "红酒", photo: "wine,vineyard" },
      { key: "hospital", label: "医院", photo: "hospital,medical" },
      { key: "pharmacy", label: "药店", photo: "pharmacy,medicine" },
      { key: "dental", label: "口腔齿科", photo: "dental,clinic" },
    ],
  },
  {
    key: "hardware",
    label: "五金/设备/汽车服务",
    color: "dark",
    subs: [
      { key: "handles", label: "拉手类", photo: "hardware,handle" },
      { key: "windows", label: "门窗类", photo: "window,door" },
      { key: "bathroom", label: "卫浴类", photo: "bathroom,fixture" },
      { key: "machinery", label: "机械设备", photo: "machinery,industrial" },
      { key: "instruments", label: "仪器器材", photo: "instrument,laboratory" },
      { key: "firesafety", label: "消防防盗", photo: "safety,fire" },
      { key: "electrical", label: "电气配件", photo: "electrical,wiring" },
      { key: "surveillance", label: "监控器材", photo: "camera,security" },
      { key: "auto", label: "汽车", photo: "car,automobile" },
    ],
  },
  {
    key: "logistics",
    label: "物流/租赁/商业贸易",
    color: "orange",
    subs: [
      { key: "freight", label: "货运物流", photo: "logistics,cargo" },
      { key: "express", label: "快递", photo: "delivery,parcel" },
      { key: "house-rent", label: "房屋租赁", photo: "apartment,rent" },
      { key: "car-rent", label: "汽车租赁", photo: "car,rental" },
      { key: "export-trade", label: "出口贸易", photo: "shipping,container" },
    ],
  },
  {
    key: "general",
    label: "通用行业",
    color: "blue",
    subs: [
      { key: "enterprise", label: "通用企业", photo: "office,corporate" },
      { key: "mall", label: "通用商城", photo: "shopping,ecommerce" },
      { key: "personal", label: "个人主页", photo: "portfolio,personal" },
      { key: "landing", label: "活动单页", photo: "event,launch" },
      { key: "others", label: "其它", photo: "abstract,gradient" },
    ],
  },
];

// 全库目标模板总数（v2：多页 + 真多样）。每子类的数量由 countForSub 派生，
// 全部加起来恰好等于这个数，覆盖 13 行业 / 105 子类、各行各业。
export const TARGET_TOTAL = 500;

// 兼容旧引用：v1 曾按「每子类固定 5 个」生成；v2 改为可变数量（见 countForSub）。
// 仍导出一个常量供 sitemap/静态参数等粗略上限使用（取每子类最大数）。
export const TEMPLATES_PER_SUB = 6;

/**
 * 每个子类生成多少个模板（确定性，4–6 个），使全库恰好 = TARGET_TOTAL(500)。
 * 105 子类，基准 5（=525）。需要砍 25 个 → 让 25 个子类降到 4。
 * 用确定性 hash 选出「降为 4」的子类，保证每次构建一致、分布均匀。
 */
export function countForSub(subKey: string): number {
  const all = ALL_SUB_KEYS;
  const base = 5;
  const total = all.length * base; // 525
  const toCut = total - TARGET_TOTAL; // 25
  // 按 hash 排序取前 toCut 个子类降为 4。
  const ranked = [...all].sort((a, b) => hashStr(a + ":cut") - hashStr(b + ":cut"));
  const cutSet = new Set(ranked.slice(0, toCut));
  return cutSet.has(subKey) ? base - 1 : base;
}

export interface TemplateMeta {
  slug: string;
  /** 模板显示标题（如「金融服务 · 01」）。 */
  title: string;
  industryKey: string;
  industryLabel: string;
  subKey: string;
  subLabel: string;
  /** 该模板第几个变体（1-based）。 */
  variant: number;
  /** 该模板的色系归类（用于列表页色系筛选；来自 DNA palette.family）。 */
  color: ColorKey;
  /** DNA 选中的配色 key（引擎据此取色）。 */
  paletteKey: string;
  /** DNA 选中的布局家族 key（卡片/缩略图据此表现站型）。 */
  layoutKey: string;
  /** 布局家族中文名（如「企业官网」），卡片副标题用。 */
  layoutLabel: string;
  photo: string;
  /** 用于「最热」排序的确定性热度分（同时也驱动卡片上的浏览/使用数）。 */
  hot: number;
  /** 用于「最新」排序的确定性序（越大越新）。 */
  fresh: number;
}

/** 全部子类 key（供 countForSub 计算确定性裁剪集合）。 */
export const ALL_SUB_KEYS: string[] = INDUSTRIES.flatMap((i) =>
  i.subs.map((s) => s.key),
);

/** 给定子类，确定性生成它的 N 个模板元数据（数量来自 countForSub）。 */
export function templatesForSub(
  industry: Industry,
  sub: SubCategory,
  count?: number,
): TemplateMeta[] {
  const n0 = count ?? countForSub(sub.key);
  const out: TemplateMeta[] = [];
  for (let n = 1; n <= n0; n++) {
    const slug = `${sub.key}-${n}`;
    const h = hashStr(slug);
    // 由 DNA 决定配色家族 + 布局家族（真正拉开每个模板的观感）。
    const dna = dnaFor(slug, industry.key, n, industry.color);
    out.push({
      slug,
      title: `${sub.label} · ${String(n).padStart(2, "0")}`,
      industryKey: industry.key,
      industryLabel: industry.label,
      subKey: sub.key,
      subLabel: sub.label,
      variant: n,
      color: dna.palette.family,
      paletteKey: dna.palette.key,
      layoutKey: dna.layout.key,
      layoutLabel: dna.layout.label,
      photo: sub.photo,
      hot: 800 + (h % 9200), // 800 – 10000
      fresh: h % 100000,
    });
  }
  return out;
}

/** 全库所有模板（确定性，按行业 → 子类 → 变体顺序）。 */
export function allTemplates(): TemplateMeta[] {
  const out: TemplateMeta[] = [];
  for (const ind of INDUSTRIES) {
    for (const sub of ind.subs) {
      out.push(...templatesForSub(ind, sub));
    }
  }
  return out;
}

/** 按 slug 找单个模板（详情页用）。 */
export function templateBySlug(slug: string): TemplateMeta | null {
  for (const ind of INDUSTRIES) {
    for (const sub of ind.subs) {
      if (slug.startsWith(sub.key + "-")) {
        const n = Number(slug.slice(sub.key.length + 1));
        if (Number.isInteger(n) && n >= 1 && n <= countForSub(sub.key)) {
          return templatesForSub(ind, sub).find((t) => t.slug === slug) ?? null;
        }
      }
    }
  }
  return null;
}

export function industryByKey(key: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}

export function subByKey(key: string): { ind: Industry; sub: SubCategory } | undefined {
  for (const ind of INDUSTRIES) {
    const sub = ind.subs.find((s) => s.key === key);
    if (sub) return { ind, sub };
  }
  return undefined;
}

export const TOTAL_TEMPLATES = allTemplates().length;
export const TOTAL_SUBS = INDUSTRIES.reduce((n, i) => n + i.subs.length, 0);
