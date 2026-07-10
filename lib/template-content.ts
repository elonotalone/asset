// 每个子类的中文 OceanLeo 定制文案。这是「以开源骨架 + 各行业中文定制内容」
// 的「内容」层：行业名、slogan、特色点、服务/产品项、统计数字、客户评价、
// CTA、联系信息。template-engine 把它 × 骨架 × 色系 渲染成整页官网。
//
// 结构：CONTENT[subKey] 提供该子类的成品文案；缺省时 buildContent() 用
// 行业兜底模板补全，保证 105 个子类都有完整、可读、行业相关的中文内容。

import { Industry, SubCategory, TemplateMeta } from "./template-taxonomy";
import { REFINED_CONTENT } from "./template-content-refined";

export interface NavItem {
  label: string;
}
export interface Feature {
  title: string;
  desc: string;
  icon: string; // 单条 svg path
}
export interface ServiceItem {
  name: string;
  desc: string;
}
export interface Stat {
  value: string;
  label: string;
}
export interface Testimonial {
  name: string;
  role: string;
  text: string;
}

export interface SiteContent {
  brand: string;
  nav: NavItem[];
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  heroCtaAlt: string;
  aboutTitle: string;
  aboutBody: string[];
  featuresTitle: string;
  featuresSubtitle: string;
  features: Feature[];
  servicesTitle: string;
  servicesSubtitle: string;
  services: ServiceItem[];
  stats: Stat[];
  testimonialsTitle: string;
  testimonials: Testimonial[];
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButton: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  footerSlogan: string;
}

// 常用图标 path（feature 卡片用）。
const ICONS = {
  star: "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  bolt: "M13 2L3 14h7l-1 8 10-12h-7z",
  heart: "M12 21s-7-4.5-9.5-9A5 5 0 0112 5a5 5 0 019.5 7c-2.5 4.5-9.5 9-9.5 9z",
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20",
  cog: "M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h3M18 12h3M12 3v3M12 18v3",
  users: "M16 14a4 4 0 10-8 0M12 7a3 3 0 100 6 3 3 0 000-6zM2 20c0-3 4-5 10-5s10 2 10 5",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  check: "M20 6L9 17l-5-5",
  truck: "M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a2 2 0 100-4 2 2 0 000 4zM18 18a2 2 0 100-4 2 2 0 000 4z",
  leaf: "M11 3C6 5 4 10 4 14c0 3 2 5 5 5 6 0 11-7 11-16-4 0-6 0-9 0z",
  cart: "M3 3h2l2 12h11l2-8H6M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z",
};

const ICON_CYCLE = [
  ICONS.star,
  ICONS.shield,
  ICONS.bolt,
  ICONS.globe,
  ICONS.cog,
  ICONS.chart,
];

// 按子类的精修文案。键 = SubCategory.key。未列出的子类走 buildContent 兜底。
// 这里覆盖每个一级行业的代表子类（确保各行业有手写质感）；其余由行业级
// 兜底文案库 INDUSTRY_FALLBACK 提供仍然行业相关的内容。
export const CONTENT: Partial<Record<string, Partial<SiteContent>>> = {
  // —— 传媒/广告/营销策划 ——
  "culture-media": {
    heroTitle: "讲好每一个品牌故事",
    heroSubtitle: "文化传媒 · 内容策划 · 全案传播，让你的声音被世界听见。",
    aboutBody: [
      "我们是一支由策划、设计、影像与公关专家组成的文化传媒团队，深耕品牌内容十余年。",
      "从一条短视频到一场城市级营销战役，我们用专业的内容生产能力，帮品牌穿越噪音、直达人心。",
    ],
    services: [
      { name: "品牌内容策划", desc: "洞察、定位、内容矩阵，一站式内容战略。" },
      { name: "影视广告制作", desc: "TVC、短视频、纪录片，全流程拍摄制作。" },
      { name: "新媒体代运营", desc: "全平台账号运营，涨粉转化双驱动。" },
      { name: "整合营销传播", desc: "线上线下联动，制造现象级传播事件。" },
    ],
  },
  "ad-design": {
    heroTitle: "好创意，让生意被看见",
    heroSubtitle: "广告设计 · 视觉创意 · 品牌升级，用设计驱动增长。",
    services: [
      { name: "平面广告设计", desc: "海报、画册、包装，专业视觉表达。" },
      { name: "品牌 VI 设计", desc: "Logo、规范、应用，建立统一识别。" },
      { name: "户外广告投放", desc: "楼宇、地铁、机场，精准触达人群。" },
      { name: "创意 H5 / 互动", desc: "互动营销页面，提升参与与转化。" },
    ],
  },
  // —— 金融/地产/商业服务 ——
  finance: {
    heroTitle: "稳健金融，值得托付",
    heroSubtitle: "专业的财富管理与金融服务，守护您的每一份资产。",
    aboutBody: [
      "我们是一家持牌经营的综合金融服务机构，为个人与企业客户提供全方位的财富管理方案。",
      "以风控为本、以客户为先，团队拥有平均超过十年的从业经验，管理规模持续稳健增长。",
    ],
    services: [
      { name: "财富管理", desc: "量身定制的资产配置与投资组合方案。" },
      { name: "企业融资", desc: "多渠道融资解决方案，助力企业成长。" },
      { name: "风险管理", desc: "全周期风险识别、评估与对冲。" },
      { name: "保险规划", desc: "家庭与企业的全面风险保障设计。" },
    ],
  },
  realestate: {
    heroTitle: "筑就理想生活空间",
    heroSubtitle: "精品地产开发，让每一寸土地都成为美好生活的起点。",
    services: [
      { name: "住宅开发", desc: "高品质人居社区，匠心营造每个细节。" },
      { name: "商业地产", desc: "城市综合体与写字楼运营管理。" },
      { name: "物业服务", desc: "贴心物业管理，守护业主美好生活。" },
      { name: "资产运营", desc: "存量资产盘活与长期价值经营。" },
    ],
  },
  law: {
    heroTitle: "以专业，守护您的权益",
    heroSubtitle: "资深律师团队，为个人与企业提供全方位法律服务。",
    services: [
      { name: "企业法律顾问", desc: "常年法律顾问，防范经营风险。" },
      { name: "诉讼仲裁", desc: "民商事诉讼代理，全力维护权益。" },
      { name: "合同审查", desc: "专业合同起草、审查与风险提示。" },
      { name: "知识产权", desc: "商标、专利、版权全链条保护。" },
    ],
  },
  // —— 服装/饰品/美容护肤 ——
  womenswear: {
    heroTitle: "穿出属于你的风格",
    heroSubtitle: "当季新品上线 · 设计师原创女装，遇见更美的自己。",
    services: [
      { name: "当季新品", desc: "紧跟潮流趋势，每周上新。" },
      { name: "设计师系列", desc: "原创设计，限量发售。" },
      { name: "搭配顾问", desc: "一对一穿搭建议，量身打造。" },
      { name: "会员专享", desc: "积分、折扣、新品优先购。" },
    ],
  },
  jewelry: {
    heroTitle: "每一件，都值得珍藏",
    heroSubtitle: "甄选高品质珠宝，记录人生每一个闪耀时刻。",
    services: [
      { name: "钻石定制", desc: "GIA 认证钻石，专属定制。" },
      { name: "黄金饰品", desc: "足金工艺，保值传承。" },
      { name: "婚嫁系列", desc: "对戒、套链，见证爱情。" },
      { name: "翻新维修", desc: "专业清洗、改款、维修服务。" },
    ],
  },
  makeup: {
    heroTitle: "美，由你定义",
    heroSubtitle: "甄选全球美妆好物，唤醒你的每一面光彩。",
    services: [
      { name: "彩妆系列", desc: "底妆、唇彩、眼影全线齐全。" },
      { name: "护肤精选", desc: "成分党之选，温和高效。" },
      { name: "美妆课堂", desc: "专业化妆师线上线下教学。" },
      { name: "肤质测评", desc: "AI 肤质分析，精准选品。" },
    ],
  },
  // —— 教育/政府/组织机构 ——
  school: {
    heroTitle: "启迪智慧，成就未来",
    heroSubtitle: "以德育人 · 以智启航，为每个孩子点亮人生方向。",
    services: [
      { name: "特色课程", desc: "多元化课程体系，因材施教。" },
      { name: "名师团队", desc: "资深教师，潜心教学。" },
      { name: "校园生活", desc: "丰富社团活动，全面发展。" },
      { name: "升学指导", desc: "专业升学规划与生涯指导。" },
    ],
  },
  training: {
    heroTitle: "学有所成，未来可期",
    heroSubtitle: "专业培训机构，助你掌握真本领、赢得新机会。",
    services: [
      { name: "职业技能", desc: "实战导向，学完即用。" },
      { name: "考证辅导", desc: "高通过率，名师押题。" },
      { name: "兴趣素养", desc: "艺术、语言、思维全面提升。" },
      { name: "企业内训", desc: "定制化团队能力提升方案。" },
    ],
  },
  // —— IT/互联网/科技 ——
  "tech-company": {
    heroTitle: "用科技定义未来",
    heroSubtitle: "前沿技术 · 极致产品，为千行百业注入数字动力。",
    services: [
      { name: "软件研发", desc: "定制化软件与系统开发。" },
      { name: "云计算", desc: "弹性云架构，安全可靠。" },
      { name: "人工智能", desc: "AI 大模型赋能业务场景。" },
      { name: "数据中台", desc: "数据驱动决策，释放数据价值。" },
    ],
  },
  "web-build": {
    heroTitle: "建站，从此无需从零开始",
    heroSubtitle: "上千套行业模板，任意选用、自由更换，一键上线你的官网。",
    services: [
      { name: "模板建站", desc: "海量精美模板，分钟级上线。" },
      { name: "定制开发", desc: "品牌官网、商城、小程序全包。" },
      { name: "域名主机", desc: "一站式域名注册与云主机服务。" },
      { name: "SEO 优化", desc: "搜索引擎优化，自然流量增长。" },
    ],
  },
  // —— 婚庆/摄影/生活服务 ——
  wedding: {
    heroTitle: "一生一次，值得最好",
    heroSubtitle: "全案婚礼策划，为你定制独一无二的梦幻婚礼。",
    services: [
      { name: "婚礼策划", desc: "主题、流程、布置全案定制。" },
      { name: "现场布置", desc: "鲜花、灯光、舞美一体化呈现。" },
      { name: "司仪摄影", desc: "金牌司仪与摄影摄像团队。" },
      { name: "婚车车队", desc: "豪华婚车，仪式感满满。" },
    ],
  },
  pets: {
    heroTitle: "用爱，陪伴每一个毛孩子",
    heroSubtitle: "宠物医疗 · 美容 · 寄养，给它无微不至的呵护。",
    services: [
      { name: "宠物医疗", desc: "专业兽医，健康守护。" },
      { name: "宠物美容", desc: "洗护造型，焕新颜值。" },
      { name: "宠物寄养", desc: "舒适寄养，安心出行。" },
      { name: "宠物用品", desc: "粮食、玩具、用品精选。" },
    ],
  },
  // —— 餐饮/酒店/旅游 ——
  hotpot: {
    heroTitle: "一锅沸腾，温暖相聚",
    heroSubtitle: "精选食材 · 秘制锅底，每一筷都是地道好味道。",
    services: [
      { name: "招牌锅底", desc: "秘制配方，香辣鲜醇。" },
      { name: "鲜切食材", desc: "每日鲜切，品质看得见。" },
      { name: "包厢预订", desc: "舒适包厢，聚会首选。" },
      { name: "外卖到家", desc: "火锅到家，在家也热闹。" },
    ],
  },
  hotel: {
    heroTitle: "宾至如归的每一晚",
    heroSubtitle: "舒适客房 · 贴心服务，让旅途成为一种享受。",
    services: [
      { name: "豪华客房", desc: "舒适床品，静谧睡眠。" },
      { name: "餐饮宴会", desc: "中西自助与宴会承办。" },
      { name: "会议会展", desc: "多功能厅，商务首选。" },
      { name: "休闲康养", desc: "健身、泳池、SPA 一应俱全。" },
    ],
  },
  // —— 化工/环保/农林牧渔 ——
  recycling: {
    heroTitle: "让资源,循环新生",
    heroSubtitle: "绿色环保回收，为可持续未来贡献每一份力量。",
    services: [
      { name: "废料回收", desc: "金属、塑料、纸张规范回收。" },
      { name: "环保处理", desc: "无害化处理，达标排放。" },
      { name: "资源再生", desc: "再生材料,变废为宝。" },
      { name: "环评咨询", desc: "环保合规咨询与方案设计。" },
    ],
  },
  farming: {
    heroTitle: "从田间到餐桌的安心",
    heroSubtitle: "生态种植 · 绿色农产，把健康送到每个家庭。",
    services: [
      { name: "生态种植", desc: "绿色无公害,源头把控。" },
      { name: "订单农业", desc: "产销对接,稳定供应。" },
      { name: "农技服务", desc: "专业农技指导与培训。" },
      { name: "产地直供", desc: "基地直发,新鲜直达。" },
    ],
  },
  // —— 数码/家具/家居百货 ——
  furniture: {
    heroTitle: "为家,造一份美好",
    heroSubtitle: "原创设计家具,让每个空间都恰到好处。",
    services: [
      { name: "全屋定制", desc: "量身设计,一站到位。" },
      { name: "实木家具", desc: "精选木材,环保工艺。" },
      { name: "软装搭配", desc: "专业软装设计服务。" },
      { name: "送装一体", desc: "免费配送,专业安装。" },
    ],
  },
  digital: {
    heroTitle: "科技好物,触手可及",
    heroSubtitle: "精选电脑数码,为你的数字生活全面升级。",
    services: [
      { name: "笔记本电脑", desc: "办公娱乐,性能之选。" },
      { name: "智能外设", desc: "键鼠、显示器、配件齐全。" },
      { name: "以旧换新", desc: "高价回收,焕新无忧。" },
      { name: "上门维修", desc: "专业工程师,快速响应。" },
    ],
  },
  // —— 食品/茶酒/医药保健 ——
  tea: {
    heroTitle: "一盏好茶,品味生活",
    heroSubtitle: "原产地直采名优茶,传承千年茶文化。",
    services: [
      { name: "名优茶", desc: "原产地直采,品质保障。" },
      { name: "礼盒定制", desc: "高端礼盒,送礼体面。" },
      { name: "茶具茶器", desc: "精选茶具,提升茶趣。" },
      { name: "茶艺培训", desc: "专业茶艺课程教学。" },
    ],
  },
  hospital: {
    heroTitle: "守护健康,用心相伴",
    heroSubtitle: "专业医疗团队 · 先进诊疗设备,为您的健康保驾护航。",
    services: [
      { name: "专家门诊", desc: "知名专家坐诊,精准诊疗。" },
      { name: "健康体检", desc: "全面体检,早筛早防。" },
      { name: "智慧医疗", desc: "在线挂号、远程问诊。" },
      { name: "康复护理", desc: "专业康复与护理服务。" },
    ],
  },
  // —— 五金/设备/汽车服务 ——
  machinery: {
    heroTitle: "智造未来,精工品质",
    heroSubtitle: "高端机械设备制造,为工业生产提供可靠动力。",
    services: [
      { name: "设备制造", desc: "精密制造,品质可靠。" },
      { name: "方案定制", desc: "按需定制生产线方案。" },
      { name: "安装调试", desc: "专业团队安装调试。" },
      { name: "售后维保", desc: "全周期维护保养服务。" },
    ],
  },
  auto: {
    heroTitle: "驾享每一段旅程",
    heroSubtitle: "整车销售 · 专业养护,做你身边的汽车专家。",
    services: [
      { name: "整车销售", desc: "多品牌车型,一站选购。" },
      { name: "保养维修", desc: "原厂配件,专业养护。" },
      { name: "美容改装", desc: "贴膜、镀晶、个性改装。" },
      { name: "保险理赔", desc: "一站式保险与理赔服务。" },
    ],
  },
  // —— 物流/租赁/商业贸易 ——
  freight: {
    heroTitle: "货通天下,使命必达",
    heroSubtitle: "覆盖全国的物流网络,让每一票货物准时安全抵达。",
    services: [
      { name: "整车零担", desc: "全国专线,时效保障。" },
      { name: "仓储配送", desc: "现代仓储,一体配送。" },
      { name: "冷链物流", desc: "全程冷链,品质无忧。" },
      { name: "供应链", desc: "端到端供应链解决方案。" },
    ],
  },
  "export-trade": {
    heroTitle: "连接世界,贸易无界",
    heroSubtitle: "专业外贸进出口服务,助力中国制造走向全球。",
    services: [
      { name: "进出口代理", desc: "报关报检,一站搞定。" },
      { name: "国际物流", desc: "海运空运,全球直达。" },
      { name: "跨境结算", desc: "安全便捷的跨境收付。" },
      { name: "海外营销", desc: "多平台海外推广获客。" },
    ],
  },
  // —— 通用 ——
  enterprise: {
    heroTitle: "专业成就卓越",
    heroSubtitle: "深耕行业多年,以专业与诚信赢得客户信赖。",
    services: [
      { name: "核心业务", desc: "专注主业,精益求精。" },
      { name: "品质保障", desc: "严格品控,值得信赖。" },
      { name: "贴心服务", desc: "全程跟进,用心服务。" },
      { name: "持续创新", desc: "不断创新,引领行业。" },
    ],
  },
  mall: {
    heroTitle: "好物臻选,惠购无忧",
    heroSubtitle: "全品类精选好物,正品保障、闪电发货。",
    services: [
      { name: "全球好物", desc: "海内外精选,正品直供。" },
      { name: "极速发货", desc: "当日下单,次日送达。" },
      { name: "无忧退换", desc: "七天无理由,售后无忧。" },
      { name: "会员权益", desc: "积分、折扣、专属福利。" },
    ],
  },
};

// 行业级兜底文案：当某子类没有精修文案时，用所属行业的兜底文案 + 子类名
// 拼出仍然行业相关、可读的中文内容，避免任何模板出现「占位符感」。
interface IndustryFallback {
  slogan: (sub: string) => string;
  about: (sub: string) => string[];
  services: (sub: string) => ServiceItem[];
}

export const INDUSTRY_FALLBACK: Record<string, IndustryFallback> = {
  media: {
    slogan: (s) => `${s} · 创意驱动传播，让品牌脱颖而出。`,
    about: (s) => [
      `我们是一支专注于${s}领域的专业团队，以创意为核、以效果为本。`,
      `从策略到执行，我们为客户提供一体化的${s}解决方案，助力品牌持续增长。`,
    ],
    services: (s) => [
      { name: `${s}策划`, desc: "洞察需求，量身定制方案。" },
      { name: "创意设计", desc: "原创视觉，打动人心。" },
      { name: "整合传播", desc: "多渠道联动，扩大声量。" },
      { name: "效果优化", desc: "数据复盘，持续提升。" },
    ],
  },
  business: {
    slogan: (s) => `专业${s}，值得您长期信赖。`,
    about: (s) => [
      `我们是一家专注于${s}的专业机构，以合规为底线、以客户利益为先。`,
      `凭借资深团队与丰富经验，为个人与企业客户提供稳健可靠的${s}方案。`,
    ],
    services: (s) => [
      { name: `${s}咨询`, desc: "专业顾问，一对一服务。" },
      { name: "方案定制", desc: "因人而异，量身设计。" },
      { name: "风险把控", desc: "全程风控，安全无忧。" },
      { name: "贴心服务", desc: "全周期跟进，省心省力。" },
    ],
  },
  fashion: {
    slogan: (s) => `${s} · 品质之选，遇见更好的自己。`,
    about: (s) => [
      `我们专注${s}领域，甄选优质好物，只为带给你品质与美的双重享受。`,
      `紧跟潮流、严控品质，让每一次选择都不辜负你的期待。`,
    ],
    services: () => [
      { name: "精选好物", desc: "甄选品质，值得拥有。" },
      { name: "潮流新品", desc: "紧跟趋势，定期上新。" },
      { name: "专属顾问", desc: "一对一搭配建议。" },
      { name: "会员服务", desc: "专享折扣与福利。" },
    ],
  },
  org: {
    slogan: (s) => `${s} · 服务为本,共创美好未来。`,
    about: (s) => [
      `作为专业的${s}，我们秉持服务为本的宗旨，致力于为公众创造价值。`,
      `规范、透明、高效，是我们一贯的工作准则。`,
    ],
    services: () => [
      { name: "服务事项", desc: "规范流程,高效办理。" },
      { name: "信息公开", desc: "公开透明,接受监督。" },
      { name: "在线办事", desc: "一网通办,便民利民。" },
      { name: "互动交流", desc: "畅通渠道,倾听民意。" },
    ],
  },
  tech: {
    slogan: (s) => `${s} · 用技术创造价值,以创新引领未来。`,
    about: (s) => [
      `我们是一家专注${s}的创新企业,以技术为核心驱动力。`,
      `用前沿技术与极致产品,为客户与行业创造长期价值。`,
    ],
    services: () => [
      { name: "技术研发", desc: "持续投入,自主创新。" },
      { name: "产品方案", desc: "贴合场景,落地见效。" },
      { name: "系统集成", desc: "端到端交付,稳定可靠。" },
      { name: "技术支持", desc: "7×24 响应,保驾护航。" },
    ],
  },
  life: {
    slogan: (s) => `${s} · 用心服务,温暖每一天。`,
    about: (s) => [
      `我们专注${s}多年,把每一次服务都做到细致入微。`,
      `用专业与真诚,让你的生活更美好、更省心。`,
    ],
    services: () => [
      { name: "专业服务", desc: "经验丰富,值得托付。" },
      { name: "贴心定制", desc: "按需定制,满足所需。" },
      { name: "品质保障", desc: "标准化作业,品质如一。" },
      { name: "快速响应", desc: "随叫随到,省心无忧。" },
    ],
  },
  food: {
    slogan: (s) => `${s} · 用心做好每一道,温暖每一位食客。`,
    about: (s) => [
      `我们专注${s},坚持选用新鲜优质食材,只为那一口地道好味道。`,
      `干净、卫生、用心,是我们对每一位顾客的承诺。`,
    ],
    services: () => [
      { name: "招牌出品", desc: "匠心烹制,口口惊艳。" },
      { name: "新鲜食材", desc: "每日采购,品质看得见。" },
      { name: "舒适环境", desc: "用心布置,聚会首选。" },
      { name: "贴心服务", desc: "热情周到,宾至如归。" },
    ],
  },
  industry: {
    slogan: (s) => `${s} · 品质为基,绿色发展。`,
    about: (s) => [
      `我们深耕${s}领域,以稳定的品质与可靠的供应赢得客户信赖。`,
      `坚持绿色生产、规范经营,与客户携手共赢、长期发展。`,
    ],
    services: () => [
      { name: "产品供应", desc: "稳定供货,品质可靠。" },
      { name: "定制生产", desc: "按需定制,灵活交付。" },
      { name: "质量管控", desc: "全程检测,达标交付。" },
      { name: "技术服务", desc: "专业团队,全程支持。" },
    ],
  },
  home: {
    slogan: (s) => `${s} · 品质好物,点亮品质生活。`,
    about: (s) => [
      `我们专注${s},甄选优质产品,让品质生活触手可及。`,
      `正品保障、贴心服务,做你信赖的生活好物专家。`,
    ],
    services: () => [
      { name: "精选好物", desc: "严选品质,正品保障。" },
      { name: "丰富品类", desc: "一站购齐,省心省力。" },
      { name: "送装服务", desc: "配送安装,一步到位。" },
      { name: "贴心售后", desc: "无忧退换,售后保障。" },
    ],
  },
  grocery: {
    slogan: (s) => `${s} · 安心好物,健康相伴。`,
    about: (s) => [
      `我们专注${s},严把质量关,把健康与安心送到每个家庭。`,
      `源头直采、规范经营,让你买得放心、用得安心。`,
    ],
    services: () => [
      { name: "源头直采", desc: "产地直供,新鲜实惠。" },
      { name: "品质保障", desc: "层层把关,安全可靠。" },
      { name: "礼盒定制", desc: "精美礼盒,送礼体面。" },
      { name: "配送到家", desc: "便捷配送,新鲜直达。" },
    ],
  },
  hardware: {
    slogan: (s) => `${s} · 精工品质,可靠耐用。`,
    about: (s) => [
      `我们专注${s}领域,以精工品质与可靠性能赢得市场口碑。`,
      `严控每一道工序,为客户提供可靠耐用的产品与服务。`,
    ],
    services: () => [
      { name: "产品供应", desc: "品类齐全,品质可靠。" },
      { name: "工程配套", desc: "项目配套,一站采购。" },
      { name: "安装服务", desc: "专业安装,规范施工。" },
      { name: "售后维保", desc: "全程维保,无忧使用。" },
    ],
  },
  logistics: {
    slogan: (s) => `${s} · 高效便捷,使命必达。`,
    about: (s) => [
      `我们专注${s},以高效的网络与规范的管理,保障每一单准时安全。`,
      `诚信经营、服务至上,做客户最可靠的合作伙伴。`,
    ],
    services: () => [
      { name: "核心业务", desc: "专业高效,准时可靠。" },
      { name: "全程跟踪", desc: "信息透明,全程可查。" },
      { name: "灵活方案", desc: "按需定制,降本增效。" },
      { name: "贴心服务", desc: "专属客服,随时响应。" },
    ],
  },
  general: {
    slogan: (s) => `${s} · 专业可靠,值得信赖。`,
    about: (s) => [
      `我们专注${s},以专业与诚信服务每一位客户。`,
      `不断精进、持续创新,致力于为客户创造更大价值。`,
    ],
    services: () => [
      { name: "核心服务", desc: "专注专业,精益求精。" },
      { name: "品质保障", desc: "严格把控,值得信赖。" },
      { name: "贴心体验", desc: "用心服务,全程跟进。" },
      { name: "持续创新", desc: "推陈出新,引领行业。" },
    ],
  },
};

const DEFAULT_NAV: NavItem[] = [
  { label: "首页" },
  { label: "关于我们" },
  { label: "产品服务" },
  { label: "新闻动态" },
  { label: "联系我们" },
];

function featuresFor(subLabel: string): Feature[] {
  return [
    { title: "专业团队", desc: `资深${subLabel}团队，经验丰富，专业可靠。`, icon: ICON_CYCLE[0] },
    { title: "品质保障", desc: "严格品控体系，每个细节都精益求精。", icon: ICON_CYCLE[1] },
    { title: "高效响应", desc: "快速响应需求，让合作省心又高效。", icon: ICON_CYCLE[2] },
    { title: "贴心服务", desc: "全程一对一跟进，服务至上、客户为先。", icon: ICON_CYCLE[3] },
    { title: "诚信经营", desc: "以诚为本，透明合规，长期值得信赖。", icon: ICON_CYCLE[4] },
    { title: "持续创新", desc: "紧跟趋势不断创新，引领行业前行。", icon: ICON_CYCLE[5] },
  ];
}

function statsFor(meta: TemplateMeta): Stat[] {
  const h = meta.hot;
  return [
    { value: `${10 + (h % 25)}年`, label: "行业深耕" },
    { value: `${(5 + (h % 50)) * 100}+`, label: "服务客户" },
    { value: `${90 + (h % 10)}%`, label: "客户满意" },
    { value: `${24}h`, label: "贴心响应" },
  ];
}

function testimonialsFor(subLabel: string): Testimonial[] {
  return [
    { name: "张先生", role: "企业客户", text: `选择他们做${subLabel}非常专业，从沟通到交付都让人放心。` },
    { name: "李女士", role: "长期合作伙伴", text: "服务态度好，响应快，结果超出预期，会一直合作下去。" },
    { name: "王总", role: "回头客", text: "品质过硬、价格实在，团队靠谱，强烈推荐！" },
  ];
}

/** 把 taxonomy 的一个模板元数据，补全成一份完整可渲染的中文站点内容。 */
export function buildContent(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
): SiteContent {
  const fb = INDUSTRY_FALLBACK[industry.key] ?? INDUSTRY_FALLBACK.general;
  // 优先用逐子类精修文案（REFINED_CONTENT，覆盖全部 105 子类）；
  // 其次用本文件内置的代表性精修（CONTENT）；最后用行业兜底。
  const refined = REFINED_CONTENT[sub.key] ?? CONTENT[sub.key] ?? {};
  const brand = `${sub.label}${suffixFor(industry.key)}`;

  return {
    brand,
    nav: refined.nav ?? DEFAULT_NAV,
    heroTitle: refined.heroTitle ?? defaultHeroTitle(sub.label, industry.key),
    heroSubtitle: refined.heroSubtitle ?? fb.slogan(sub.label),
    heroCta: refined.heroCta ?? "立即咨询",
    heroCtaAlt: refined.heroCtaAlt ?? "了解更多",
    aboutTitle: refined.aboutTitle ?? "关于我们",
    aboutBody: refined.aboutBody ?? fb.about(sub.label),
    featuresTitle: refined.featuresTitle ?? "为什么选择我们",
    featuresSubtitle:
      refined.featuresSubtitle ?? "六大核心优势，让每一次合作都安心放心。",
    features: refined.features ?? featuresFor(sub.label),
    servicesTitle: refined.servicesTitle ?? "我们的服务",
    servicesSubtitle:
      refined.servicesSubtitle ?? `专业的${sub.label}服务，覆盖你的全部需求。`,
    services: refined.services ?? fb.services(sub.label),
    stats: refined.stats ?? statsFor(meta),
    testimonialsTitle: refined.testimonialsTitle ?? "客户怎么说",
    testimonials: refined.testimonials ?? testimonialsFor(sub.label),
    ctaTitle: refined.ctaTitle ?? `开启你的${sub.label}之旅`,
    ctaSubtitle:
      refined.ctaSubtitle ?? "现在就联系我们，获取专属方案与报价。",
    ctaButton: refined.ctaButton ?? "免费咨询",
    contactPhone: refined.contactPhone ?? "400-888-8888",
    contactEmail: refined.contactEmail ?? `hello@${sub.key}.example.com`,
    contactAddress: refined.contactAddress ?? "上海市浦东新区世纪大道 100 号",
    footerSlogan:
      refined.footerSlogan ?? `${brand} · 以专业与诚信，服务每一位客户。`,
  };
}

function suffixFor(industryKey: string): string {
  const map: Record<string, string> = {
    media: "传媒",
    business: "服务",
    fashion: "旗舰店",
    org: "中心",
    tech: "科技",
    life: "服务",
    food: "餐厅",
    industry: "实业",
    home: "商城",
    grocery: "优选",
    hardware: "制造",
    logistics: "物流",
    general: "企业",
  };
  return map[industryKey] ?? "";
}

function defaultHeroTitle(subLabel: string, industryKey: string): string {
  const map: Record<string, string> = {
    media: `${subLabel}，创意成就品牌`,
    business: `专业${subLabel}，稳健可信赖`,
    fashion: `${subLabel}，遇见更好的自己`,
    org: `${subLabel}，服务为民`,
    tech: `${subLabel}，用科技定义未来`,
    life: `${subLabel}，用心服务每一天`,
    food: `${subLabel}，地道好味道`,
    industry: `${subLabel}，品质成就未来`,
    home: `${subLabel}，点亮品质生活`,
    grocery: `${subLabel}，安心好物`,
    hardware: `${subLabel}，精工铸就品质`,
    logistics: `${subLabel}，高效使命必达`,
    general: `${subLabel}，专业成就卓越`,
  };
  return map[industryKey] ?? `${subLabel}，专业可信赖`;
}
