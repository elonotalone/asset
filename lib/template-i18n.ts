// 模板专区 v3 — 中英双语核心（单一事实源）。
//
// operator 要求：生成的每个模板网站本身要「中英文两种语言」。因为详情页产物是
// 一份**自包含、可下载**的 HTML（route.ts 直接整页返回），我们的双语实现方式是：
// 把 **zh 与 en 两份文本都嵌进 HTML**，页内一个「中 / EN」开关客户端切换（无需
// 联网、下载下来离线也能切）。
//
// 本文件提供：
//   1. Lang 类型 + Bi<T>（{zh,en} 成对文本）+ pick() 取值；
//   2. UI 词条（导航标签、按钮、section 标题…）的中英词典；
//   3. 行业 / 子类 key → 英文名 的映射（让英文侧也「行业化」而非机翻感）；
//   4. 引擎渲染用的 biText()（产出 data-zh/data-en 的 <span>，配合页内开关）。
//
// 设计文档：docs/architecture/oceanleo-template-gallery-v3-signature-families.md

export type Lang = "zh" | "en";

/** 一段成对的中英文本。 */
export interface Bi {
  zh: string;
  en: string;
}

export function bi(zh: string, en: string): Bi {
  return { zh, en };
}

export function pickLang(b: Bi, lang: Lang): string {
  return lang === "en" ? b.en : b.zh;
}

// ————————————————————————————————————————————————————————————
// 行业 / 子类 中英名映射（英文侧行业化，避免机翻腔）
// ————————————————————————————————————————————————————————————

/** 一级行业 key → 英文名。 */
export const INDUSTRY_EN: Record<string, string> = {
  media: "Media & Advertising",
  business: "Finance & Business",
  fashion: "Fashion & Beauty",
  org: "Education & Institutions",
  tech: "IT & Technology",
  life: "Wedding & Lifestyle",
  food: "Food & Travel",
  industry: "Industry & Agriculture",
  home: "Home & Digital",
  grocery: "Food & Health",
  hardware: "Hardware & Auto",
  logistics: "Logistics & Trade",
  general: "General",
};

/** 子类 key → 英文名（105 子类；缺省回退到 industry 英文名）。 */
export const SUB_EN: Record<string, string> = {
  // media
  "culture-media": "Cultural Media",
  "ad-design": "Advertising Design",
  "pr-consulting": "PR Consulting",
  "brand-planning": "Brand Strategy",
  "gift-custom": "Custom Gifts",
  exhibition: "Exhibition Services",
  printing: "Printing & Packaging",
  // business
  finance: "Financial Services",
  investment: "Investment Advisory",
  loan: "Loans & Wealth",
  realestate: "Real Estate",
  registration: "Business Registration",
  accounting: "Accounting",
  trademark: "Trademark & Patent",
  law: "Law Firm",
  guarantee: "Investment Guarantee",
  pawn: "Pawn & Auction",
  // fashion
  womenswear: "Women's Fashion",
  menswear: "Men's Fashion",
  kidswear: "Kids' Wear",
  maternity: "Maternity & Baby",
  shoes: "Footwear",
  bags: "Bags & Luggage",
  jewelry: "Jewelry",
  glasses: "Eyewear",
  watches: "Watches",
  hairsalon: "Hair & Beauty Salon",
  nails: "Nail & Lash",
  makeup: "Makeup & Cosmetics",
  slimming: "Body & Slimming",
  "medical-beauty": "Medical Aesthetics",
  // org
  school: "School",
  training: "Training Institute",
  government: "Government Agency",
  association: "Association",
  chamber: "Chamber of Commerce",
  // tech
  "web-build": "Web Development",
  internet: "Internet",
  "tech-company": "Tech Company",
  // life
  wedding: "Wedding Planning",
  bridal: "Bridal",
  photography: "Photography",
  cleaning: "Home Cleaning",
  "car-care": "Car Care",
  "photo-print": "Photo Printing",
  moving: "Moving Services",
  pets: "Pets",
  flowers: "Flowers",
  // food
  fastfood: "Fast Food & Snacks",
  hotpot: "Hot Pot",
  western: "Western Cuisine",
  "japanese-korean": "Japanese & Korean",
  bakery: "Bakery & Dessert",
  bbq: "BBQ & Seafood",
  farmstay: "Farm Stay",
  resort: "Resort",
  hotel: "Hotel",
  "travel-agency": "Travel Agency",
  "local-tour": "Local Tours",
  visa: "Visa Services",
  // industry
  "chem-material": "Building & Chemical Materials",
  textile: "Textile Materials",
  "rubber-plastic": "Rubber & Plastic",
  metallurgy: "Metallurgy & Mining",
  recycling: "Recycling",
  farming: "Crop Farming",
  feed: "Livestock Feed",
  garden: "Garden & Flora",
  // home
  digital: "Computers & Digital",
  appliance: "Home Appliances",
  phone: "Phones & Accessories",
  furniture: "Furniture",
  kitchenware: "Kitchenware",
  decor: "Home Decor",
  bedding: "Bedding",
  towel: "Towels & Textiles",
  lighting: "Lighting",
  // grocery
  "fruit-veg": "Fruits & Vegetables",
  snacks: "Snacks",
  specialty: "Local Specialties",
  tea: "Tea",
  baijiu: "Liquor",
  wine: "Wine",
  hospital: "Hospital",
  pharmacy: "Pharmacy",
  dental: "Dental Clinic",
  // hardware
  handles: "Handles",
  windows: "Doors & Windows",
  bathroom: "Bathroom Fixtures",
  machinery: "Machinery",
  instruments: "Instruments",
  firesafety: "Fire & Security",
  electrical: "Electrical Parts",
  surveillance: "Surveillance",
  auto: "Automobiles",
  // logistics
  freight: "Freight & Logistics",
  express: "Express Delivery",
  "house-rent": "Property Rental",
  "car-rent": "Car Rental",
  "export-trade": "Export Trade",
  // general
  enterprise: "Enterprise",
  mall: "Online Mall",
  personal: "Personal Page",
  landing: "Event Landing",
  others: "Others",
};

export function subEn(subKey: string, industryKey: string): string {
  return SUB_EN[subKey] ?? INDUSTRY_EN[industryKey] ?? "Business";
}

// ————————————————————————————————————————————————————————————
// UI 词条中英词典（导航 / 按钮 / 通用短语）
// ————————————————————————————————————————————————————————————

export const UI: Record<string, Bi> = {
  // 导航页名（与 PAGE_LABEL 对应）
  home: bi("首页", "Home"),
  about: bi("关于我们", "About"),
  services: bi("服务项目", "Services"),
  products: bi("产品中心", "Products"),
  menu: bi("菜单", "Menu"),
  works: bi("作品案例", "Work"),
  cases: bi("成功案例", "Cases"),
  team: bi("团队", "Team"),
  news: bi("新闻资讯", "News"),
  pricing: bi("价格方案", "Pricing"),
  gallery: bi("图库展示", "Gallery"),
  timeline: bi("发展历程", "Milestones"),
  contact: bi("联系我们", "Contact"),
  // 通用短语
  quickNav: bi("快速导航", "Quick Links"),
  contactUs: bi("联系我们", "Contact Us"),
  phone: bi("电话", "Phone"),
  email: bi("邮箱", "Email"),
  address: bi("地址", "Address"),
  learnMore: bi("了解更多", "Learn More"),
  consultNow: bi("立即咨询", "Get in Touch"),
  onlineConsult: bi("在线咨询", "Contact Us"),
  viewDetail: bi("查看详情", "View Details"),
  submit: bi("提交需求", "Submit"),
  yourName: bi("您的姓名", "Your Name"),
  yourPhone: bi("联系电话", "Phone"),
  yourEmail: bi("电子邮箱", "Email"),
  yourNeed: bi("需求描述", "Message"),
  contactLead: bi("留下你的需求，我们会尽快与你联系。", "Leave your details and we'll get back to you shortly."),
  trustedBy: bi("受到众多客户信赖与选择", "Trusted by clients everywhere"),
  chosenBy: bi("他们都选择了", "Chosen by"),
  addToCart: bi("加入购物车", "Add to Cart"),
  recommended: bi("推荐", "Popular"),
  actNow: bi("立即行动", "Act Now"),
  previewOnly: bi("仅供预览", "Preview only"),
  genBy: bi("由 OceanLeo 模板专区生成", "Generated by OceanLeo Templates"),
  proSolution: bi("专业方案", "Pro Solution"),
  // section 通用标题（会被行业化标题覆盖，作兜底）
  secFeatures: bi("为什么选择我们", "Why Choose Us"),
  secFeaturesSub: bi("六大核心优势，让每一次合作都安心放心。", "Six core strengths that make every collaboration reassuring."),
  secServices: bi("我们的服务", "Our Services"),
  secProducts: bi("热门商品", "Featured Products"),
  secProductsSub: bi("甄选好物，正品保障，下单即享会员价。", "Curated products, authenticity guaranteed, member prices on every order."),
  secMenu: bi("招牌菜单", "Signature Menu"),
  secMenuSub: bi("精选食材，匠心烹制，每一道都是地道好味道。", "Fresh ingredients, crafted with care — authentic flavor in every dish."),
  secGallery: bi("作品 / 案例展示", "Work & Showcase"),
  secGallerySub: bi("用作品说话，每一个项目都全力以赴。", "Let the work speak — we give every project our all."),
  secCases: bi("成功案例", "Success Stories"),
  secCasesSub: bi("服务过的代表性项目，见证我们的专业与诚意。", "Representative projects that prove our expertise and dedication."),
  secTeam: bi("核心团队", "Our Team"),
  secTeamSub: bi("一群专业、靠谱、对结果负责的人。", "A team that's professional, reliable and accountable for results."),
  secPricing: bi("价格方案", "Pricing Plans"),
  secPricingSub: bi("灵活的套餐组合，总有一款适合你。", "Flexible packages — there's always one that fits."),
  secProcess: bi("我们怎么做", "How We Work"),
  secProcessSub: bi("标准化流程，每一步都清晰可控。", "A standardized process — every step is clear and under control."),
  secFaq: bi("常见问题", "FAQ"),
  secFaqSub: bi("你想知道的，我们都准备好了。", "Everything you want to know, answered."),
  secNews: bi("新闻资讯", "News & Insights"),
  secNewsSub: bi("了解我们的最新动态与行业洞察。", "Our latest updates and industry insights."),
  secTimeline: bi("发展历程", "Our Journey"),
  secTimelineSub: bi("一步一个脚印，走出来的信任。", "Step by step — trust built over time."),
  secMilestone: bi("发展里程碑", "Milestones"),
  secMilestoneSub: bi("从起步到领先的每一个关键节点。", "Every key moment from start to leadership."),
  faqMore: bi("还有其他疑问？", "More questions?"),
  chartNote: bi("数据为示例展示", "Sample data for illustration"),
  chartUnit: bi("单位", "Unit"),
  chartFootnote: bi("图表由模板内置示例数据渲染，替换为您的真实经营数据即可直接使用。", "Rendered from sample data — swap in your real numbers to use directly."),
  langToggle: bi("EN", "中"),
};

export function ui(key: keyof typeof UI, lang: Lang): string {
  const b = UI[key];
  return b ? pickLang(b, lang) : String(key);
}

// ————————————————————————————————————————————————————————————
// 行业化 section 标题（治「换字置换」通用感 + 双语）
// 给定 section 种类 + 一级行业，返回该行业专属的中英标题/副标题。缺省回退到
// UI 里的通用 section 标题。律师站的「成功案例」= 胜诉判例，餐饮的 = 到店实拍…
// ————————————————————————————————————————————————————————————

export interface SecTitle {
  title: Bi;
  sub?: Bi;
}

type SecKey = "cases" | "team" | "process" | "products" | "gallery" | "news";

// 每个行业对若干 section 的定制标题（未列出的 section/行业走通用兜底）。
const SEC_BY_INDUSTRY: Record<string, Partial<Record<SecKey, SecTitle>>> = {
  business: {
    cases: { title: bi("典型案例", "Notable Cases"), sub: bi("代理过的代表性项目，见证专业实力。", "Representative matters that prove our expertise.") },
    team: { title: bi("专业团队", "Our Professionals") },
    process: { title: bi("服务流程", "Our Process") },
  },
  media: {
    cases: { title: bi("代表作品", "Featured Work"), sub: bi("用作品说话，每个案例都是一次突破。", "Let the work speak — every case is a breakthrough.") },
    team: { title: bi("创意团队", "Creative Team") },
    process: { title: bi("创作流程", "Creative Process") },
    gallery: { title: bi("作品精选", "Selected Work") },
  },
  fashion: {
    cases: { title: bi("上身实拍", "Lookbook"), sub: bi("每一件都值得被看见。", "Every piece deserves the spotlight.") },
    products: { title: bi("当季精选", "Seasonal Picks") },
    gallery: { title: bi("造型画廊", "Style Gallery") },
    team: { title: bi("设计团队", "Design Team") },
  },
  org: {
    team: { title: bi("师资力量", "Our Faculty") },
    cases: { title: bi("教学成果", "Achievements") },
    process: { title: bi("培养流程", "Learning Path") },
  },
  tech: {
    cases: { title: bi("落地案例", "Case Studies"), sub: bi("真实场景中的技术落地与业务增长。", "Real-world deployments and measurable growth.") },
    team: { title: bi("技术团队", "Engineering Team") },
    process: { title: bi("交付流程", "Delivery Process") },
  },
  life: {
    cases: { title: bi("客片故事", "Client Stories"), sub: bi("每一次相遇，都值得被记录。", "Every moment worth remembering.") },
    gallery: { title: bi("作品集", "Portfolio") },
    team: { title: bi("服务团队", "Our Team") },
  },
  food: {
    cases: { title: bi("食客好评", "Guest Reviews"), sub: bi("到店实拍，好味道看得见。", "Straight from the table — taste you can see.") },
    products: { title: bi("招牌推荐", "Chef's Picks") },
    gallery: { title: bi("门店实拍", "Inside the Restaurant") },
    team: { title: bi("主厨团队", "Our Chefs") },
  },
  industry: {
    cases: { title: bi("供货案例", "Supply Cases"), sub: bi("交付过的代表性项目与合作伙伴。", "Representative projects and partners.") },
    process: { title: bi("生产工艺", "Production Process") },
    products: { title: bi("产品中心", "Our Products") },
  },
  home: {
    cases: { title: bi("落地实景", "Real Cases") },
    products: { title: bi("热销好物", "Best Sellers") },
    gallery: { title: bi("实景展示", "In Real Homes") },
  },
  grocery: {
    cases: { title: bi("口碑好评", "Reviews") },
    products: { title: bi("优选好物", "Curated Picks") },
    team: { title: bi("专业团队", "Our Team") },
  },
  hardware: {
    cases: { title: bi("工程案例", "Project Cases") },
    process: { title: bi("生产工艺", "Manufacturing Process") },
    products: { title: bi("产品中心", "Our Products") },
  },
  logistics: {
    cases: { title: bi("服务案例", "Service Cases"), sub: bi("覆盖全国的履约网络与时效保障。", "A nationwide fulfillment network you can count on.") },
    process: { title: bi("履约流程", "Fulfillment Process") },
  },
  general: {},
};

// section 通用兜底标题（key → UI 词条）。
const SEC_FALLBACK: Record<SecKey, { title: keyof typeof UI; sub?: keyof typeof UI }> = {
  cases: { title: "secCases", sub: "secCasesSub" },
  team: { title: "secTeam", sub: "secTeamSub" },
  process: { title: "secProcess", sub: "secProcessSub" },
  products: { title: "secProducts", sub: "secProductsSub" },
  gallery: { title: "secGallery", sub: "secGallerySub" },
  news: { title: "secNews", sub: "secNewsSub" },
};

/** 取某 section 在某行业下的（中/英）标题 + 副标题，缺省回退通用。 */
export function secTitle(kind: SecKey, industryKey: string, lang: Lang): { title: string; sub?: string } {
  const hit = SEC_BY_INDUSTRY[industryKey]?.[kind];
  const fb = SEC_FALLBACK[kind];
  const title = hit?.title ?? UI[fb.title];
  const sub = hit?.sub ?? (fb.sub ? UI[fb.sub] : undefined);
  return { title: pickLang(title, lang), sub: sub ? pickLang(sub, lang) : undefined };
}
