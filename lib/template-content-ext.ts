// 多页内容扩展层 —— 模板专区 v2。
//
// v1 的 SiteContent 只够撑一张落地页（hero/about/features/services/stats/
// testimonials/cta/contact）。v2 是多页站点，每页还需要：案例列表、资讯列表、
// 团队成员、菜单/商品项、FAQ、定价方案、流程步骤、合作 logo。这些用「行业相关
// 文案池 + 确定性 hash 选取」生成，保证 105 子类全覆盖、页与页内容连贯、且不同
// 模板之间不重复（消除 v1「张先生/李女士/王总」式的千篇一律）。

import { hashStr } from "./hash";

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

// 文案池：用确定性 hash 旋转，让不同模板选到不同的句子/姓名/标签。
const SURNAMES = ["陈", "林", "黄", "吴", "刘", "杨", "赵", "周", "徐", "孙", "胡", "朱", "高", "郭", "罗"];
const GIVEN = ["明", "辉", "婷", "静", "磊", "敏", "强", "丽", "杰", "雪", "涛", "娜", "斌", "颖", "鑫"];
const ROLES = ["创始人 / CEO", "市场总监", "运营负责人", "技术总监", "设计主创", "客户成功经理", "项目主管", "高级顾问"];

function rot<T>(arr: T[], seed: number, i: number): T {
  return arr[(seed + i) % arr.length];
}

function caseTags(industryKey: string): string[] {
  const map: Record<string, string[]> = {
    media: ["品牌战役", "短视频", "整合传播", "事件营销", "内容矩阵"],
    business: ["上市辅导", "并购重组", "风险管控", "资产配置", "合规咨询"],
    fashion: ["品牌焕新", "新品首发", "门店设计", "电商代运营", "私域增长"],
    org: ["校园数字化", "课程共建", "师资培养", "公共服务", "组织升级"],
    tech: ["系统重构", "云原生迁移", "AI 落地", "数据中台", "增长实验"],
    life: ["婚礼定制", "影像作品", "空间改造", "活动策划", "会员运营"],
    food: ["门店升级", "供应链", "外卖增长", "品牌连锁", "私域复购"],
    industry: ["产线升级", "绿色改造", "供应保障", "出口认证", "智能制造"],
    home: ["全屋方案", "渠道拓展", "爆品打造", "仓配一体", "售后体系"],
    grocery: ["品牌出海", "冷链直达", "礼盒定制", "连锁加盟", "溯源体系"],
    hardware: ["工程配套", "智能化改造", "出口订单", "渠道下沉", "定制开发"],
    logistics: ["仓配一体", "干线优化", "跨境清关", "时效提升", "成本压降"],
    general: ["品牌升级", "数字化转型", "降本增效", "渠道拓展", "客户增长"],
  };
  return map[industryKey] ?? map.general;
}

function newsCats(): string[] {
  return ["公司动态", "行业洞察", "客户案例", "活动预告", "团队故事"];
}

export function buildExt(
  slug: string,
  industryKey: string,
  subLabel: string,
): ExtContent {
  const seed = hashStr(slug + ":ext");
  const tags = caseTags(industryKey);
  const cats = newsCats();

  const cases: CaseItem[] = Array.from({ length: 6 }, (_, i) => ({
    title: `${rot(tags, seed, i)}项目 · 第 ${i + 1} 期`,
    tag: rot(tags, seed + 3, i),
    desc: `为客户提供${subLabel}整体方案，落地后核心指标显著提升，获得长期复购与口碑推荐。`,
  }));

  const months = ["01", "03", "05", "06", "09", "11"];
  const news: NewsItem[] = Array.from({ length: 6 }, (_, i) => ({
    date: `2026-${rot(months, seed, i)}-${String(8 + ((seed + i) % 20)).padStart(2, "0")}`,
    cat: rot(cats, seed, i),
    title: newsTitle(subLabel, industryKey, (seed + i) % 6),
    excerpt: `围绕${subLabel}的最新进展与思考，分享我们在实践中沉淀的方法与洞察。`,
  }));

  const team: TeamMember[] = Array.from({ length: 4 }, (_, i) => ({
    name: rot(SURNAMES, seed, i) + rot(GIVEN, seed + 7, i),
    role: rot(ROLES, seed, i),
  }));

  // 商品/菜单（电商/餐饮家族用）。
  const priceBase = 39 + (seed % 60);
  const products: ProductItem[] = Array.from({ length: 8 }, (_, i) => ({
    name: `${subLabel}臻选 ${String.fromCharCode(65 + i)}款`,
    price: `¥${priceBase + i * 30}`,
    note: i % 2 === 0 ? "热销" : "新品",
  }));

  const menu: MenuGroup[] = [
    {
      group: "招牌推荐",
      items: Array.from({ length: 4 }, (_, i) => ({
        name: `招牌${subLabel}·${i + 1}`,
        price: `¥${28 + ((seed + i) % 40)}`,
      })),
    },
    {
      group: "人气精选",
      items: Array.from({ length: 4 }, (_, i) => ({
        name: `人气${subLabel}·${i + 1}`,
        price: `¥${18 + ((seed + i * 2) % 30)}`,
      })),
    },
  ];

  const faq: FaqItem[] = [
    { q: `你们的${subLabel}服务流程是怎样的？`, a: "从需求沟通、方案设计、签约执行到交付复盘，全程有专人对接，进度透明可查。" },
    { q: "收费标准如何，是否支持定制？", a: "我们提供标准套餐与定制方案两种模式，可按预算与目标灵活组合，先报价后执行。" },
    { q: "交付周期一般需要多久？", a: `常规${subLabel}项目 7–15 个工作日交付，加急项目可协商优先排期。` },
    { q: "售后与质保如何保障？", a: "项目交付后提供质保期内的免费维护与问题响应，长期合作另有专属服务权益。" },
    { q: "可以先看看过往案例吗？", a: "当然，案例页展示了我们服务过的代表性项目，也可联系顾问获取更完整的作品集。" },
  ];

  const pricing: PricingPlan[] = [
    {
      name: "基础版",
      price: `¥${(2 + (seed % 4)) * 1000}`,
      unit: "/ 起",
      features: ["核心服务交付", "标准化方案", "工作日响应", "30 天质保"],
      featured: false,
    },
    {
      name: "专业版",
      price: `¥${(8 + (seed % 6)) * 1000}`,
      unit: "/ 起",
      features: ["全案定制方案", "专属项目经理", "7×12 小时响应", "90 天质保", "数据复盘报告"],
      featured: true,
    },
    {
      name: "企业版",
      price: "面议",
      unit: "",
      features: ["长期战略陪伴", "多团队协同", "7×24 小时响应", "年度服务承诺", "高优需求插队"],
      featured: false,
    },
  ];

  const process: ProcessStep[] = [
    { step: "01", title: "需求沟通", desc: "深入了解你的目标、预算与时间，明确合作边界与期望。" },
    { step: "02", title: "方案设计", desc: `量身定制${subLabel}方案，反复打磨直到你满意。` },
    { step: "03", title: "落地执行", desc: "专业团队全程跟进，进度透明、节点可控。" },
    { step: "04", title: "交付复盘", desc: "交付成果并复盘效果，持续优化、长期陪伴。" },
  ];

  const logos = ["华熙", "云图", "鼎信", "新和", "嘉沃", "盛元", "智达", "联创"];

  return { cases, news, team, products, menu, faq, pricing, process, logos };
}

function newsTitle(subLabel: string, industryKey: string, i: number): string {
  const pool = [
    `${subLabel}行业 2026 上半年趋势观察`,
    `我们如何把一个${subLabel}项目做成标杆`,
    `${subLabel}从业者必读的 5 个实战要点`,
    `客户专访：选择我们之后发生了什么`,
    `团队再升级，${subLabel}服务能力又上新台阶`,
    `新品 / 新服务上线，欢迎预约体验`,
  ];
  return pool[i % pool.length];
}
