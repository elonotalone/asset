// 双语内容层 —— 模板专区 v3。
//
// 现有 buildContent()/buildExt() 产出的是**中文**站点内容（105 子类精修 + 行业
// 兜底）。本模块在其之上生成**英文对应内容**，合成 BiContent / BiExt（每个字段
// 是 {zh,en} 对）。引擎渲染时把两份都写进 HTML，页内「中/EN」开关切换。
//
// 英文侧策略（避免 105 份手工翻译、又不显机翻腔）：
//   - 结构性文案（section 标题、CTA、features/stats/process/faq/pricing、
//     testimonials、案例/资讯/团队…）走**英文生成器 + UI 词典**，完全可控，
//     这也正是「换字置换」通用感的重灾区，双语化顺带治理。
//   - 品牌名 / hero 用「英文行业名（subEn）+ 模板化句式」生成，行业相关、通顺。
//
// 设计文档：docs/architecture/oceanleo-template-gallery-v3-signature-families.md

import { Industry, SubCategory, TemplateMeta } from "./template-taxonomy";
import { buildContent, SiteContent, Feature, ServiceItem, Stat, Testimonial } from "./template-content";
import { buildExt, ExtContent, CaseItem, NewsItem, TeamMember, ProductItem, MenuGroup, FaqItem, PricingPlan, ProcessStep } from "./template-content-ext";
import { hashStr } from "./hash";
import { Bi, bi, subEn, UI } from "./template-i18n";

// ————————————————————————————————————————————————————————————
// 双语数据结构（与 SiteContent / ExtContent 同形，字段换成 Bi 或 Bi 列表）
// ————————————————————————————————————————————————————————————

export interface BiFeature { title: Bi; desc: Bi; icon: string }
export interface BiService { name: Bi; desc: Bi }
export interface BiStat { value: string; label: Bi }
export interface BiTestimonial { name: Bi; role: Bi; text: Bi }

export interface BiContent {
  brand: Bi;
  heroTitle: Bi;
  heroSubtitle: Bi;
  heroCta: Bi;
  heroCtaAlt: Bi;
  aboutTitle: Bi;
  aboutBody: Bi[];
  featuresTitle: Bi;
  featuresSubtitle: Bi;
  features: BiFeature[];
  servicesTitle: Bi;
  servicesSubtitle: Bi;
  services: BiService[];
  stats: BiStat[];
  testimonialsTitle: Bi;
  testimonials: BiTestimonial[];
  ctaTitle: Bi;
  ctaSubtitle: Bi;
  ctaButton: Bi;
  contactPhone: string;
  contactEmail: string;
  contactAddress: Bi;
  footerSlogan: Bi;
}

export interface BiCase { title: Bi; tag: Bi; desc: Bi }
export interface BiNews { date: string; cat: Bi; title: Bi; excerpt: Bi }
export interface BiTeam { name: Bi; role: Bi }
export interface BiProduct { name: Bi; price: string; note: Bi }
export interface BiMenuGroup { group: Bi; items: { name: Bi; price: string }[] }
export interface BiFaq { q: Bi; a: Bi }
export interface BiPricing { name: Bi; price: string; unit: Bi; features: Bi[]; featured: boolean }
export interface BiProcess { step: string; title: Bi; desc: Bi }

export interface BiExt {
  cases: BiCase[];
  news: BiNews[];
  team: BiTeam[];
  products: BiProduct[];
  menu: BiMenuGroup[];
  faq: BiFaq[];
  pricing: BiPricing[];
  process: BiProcess[];
  logos: string[];
}

// ————————————————————————————————————————————————————————————
// 英文生成词库
// ————————————————————————————————————————————————————————————

const SUFFIX_EN: Record<string, string> = {
  media: "Media",
  business: "Group",
  fashion: "Boutique",
  org: "Center",
  tech: "Technology",
  life: "Studio",
  food: "Restaurant",
  industry: "Industrial",
  home: "Store",
  grocery: "Select",
  hardware: "Manufacturing",
  logistics: "Logistics",
  general: "Company",
};

function brandEn(subKey: string, industryKey: string): string {
  const s = subEn(subKey, industryKey);
  const suf = SUFFIX_EN[industryKey] ?? "";
  return suf ? `${s} ${suf}` : s;
}

function heroTitleEn(subKey: string, industryKey: string): string {
  const s = subEn(subKey, industryKey);
  const map: Record<string, string> = {
    media: `${s} that makes brands shine`,
    business: `Professional ${s.toLowerCase()} you can trust`,
    fashion: `${s} — discover a better you`,
    org: `${s} — serving with heart`,
    tech: `${s} — defining the future with technology`,
    life: `${s} — thoughtful service every day`,
    food: `${s} — authentic flavor, done right`,
    industry: `${s} — quality builds the future`,
    home: `${s} — brighten quality living`,
    grocery: `${s} — safe and healthy choices`,
    hardware: `${s} — precision-built quality`,
    logistics: `${s} — efficient and always on time`,
    general: `${s} — excellence through expertise`,
  };
  return map[industryKey] ?? `${s} — professional and trustworthy`;
}

const SLOGAN_EN: Record<string, (s: string) => string> = {
  media: (s) => `${s} · Creative-driven communication that makes brands stand out.`,
  business: (s) => `Professional ${s.toLowerCase()} you can rely on for the long run.`,
  fashion: (s) => `${s} · A quality choice — meet a better you.`,
  org: (s) => `${s} · Service first, building a better future together.`,
  tech: (s) => `${s} · Creating value through technology, leading with innovation.`,
  life: (s) => `${s} · Thoughtful service that warms every day.`,
  food: (s) => `${s} · Crafted with care for every guest.`,
  industry: (s) => `${s} · Built on quality, growing sustainably.`,
  home: (s) => `${s} · Quality goods that brighten everyday life.`,
  grocery: (s) => `${s} · Trusted goods for a healthier life.`,
  hardware: (s) => `${s} · Precision quality, reliable and durable.`,
  logistics: (s) => `${s} · Efficient, convenient, always delivered.`,
  general: (s) => `${s} · Professional, reliable, trustworthy.`,
};

function sloganEn(subKey: string, industryKey: string): string {
  const s = subEn(subKey, industryKey);
  return (SLOGAN_EN[industryKey] ?? SLOGAN_EN.general)(s);
}

function aboutEn(subKey: string, industryKey: string): string[] {
  const s = subEn(subKey, industryKey);
  return [
    `We are a dedicated team focused on ${s.toLowerCase()}, driven by expertise and a commitment to results.`,
    `From strategy to delivery, we provide end-to-end ${s.toLowerCase()} solutions that help our clients keep growing.`,
  ];
}

function servicesEn(subKey: string, industryKey: string): { name: string; desc: string }[] {
  const s = subEn(subKey, industryKey);
  return [
    { name: `${s} Consulting`, desc: "Tailored solutions from experienced advisors." },
    { name: "Custom Solutions", desc: "Designed around your goals and budget." },
    { name: "Quality Assurance", desc: "Strict standards at every step." },
    { name: "Dedicated Support", desc: "One-on-one follow-through, client first." },
  ];
}

const FEATURES_EN: { title: string; desc: (s: string) => string }[] = [
  { title: "Expert Team", desc: (s) => `A seasoned ${s.toLowerCase()} team — experienced and dependable.` },
  { title: "Quality Assured", desc: () => "Rigorous quality control, refined in every detail." },
  { title: "Fast Response", desc: () => "Quick to respond, making collaboration effortless." },
  { title: "Caring Service", desc: () => "One-on-one follow-through — service first, client always." },
  { title: "Integrity", desc: () => "Honest, transparent and compliant — trusted long term." },
  { title: "Always Innovating", desc: () => "Following trends and innovating to lead the industry." },
];

const STAT_LABELS_EN = ["Years in Industry", "Clients Served", "Satisfaction", "Response"];

const TESTIMONIALS_EN: { name: string; role: string; text: (s: string) => string }[] = [
  { name: "Mr. Chen", role: "Business Client", text: (s) => `Their ${s.toLowerCase()} work was highly professional — reassuring from first talk to delivery.` },
  { name: "Ms. Li", role: "Long-term Partner", text: () => "Great attitude, fast response, results beyond expectations. We'll keep working with them." },
  { name: "Mr. Wang", role: "Repeat Customer", text: () => "Solid quality, fair prices, a reliable team — highly recommended!" },
];

// ————————————————————————————————————————————————————————————
// 合成双语 SiteContent
// ————————————————————————————————————————————————————————————

export function buildBiContent(
  meta: TemplateMeta,
  industry: Industry,
  sub: SubCategory,
): BiContent {
  const zh: SiteContent = buildContent(meta, industry, sub);
  const ik = industry.key;
  const sk = sub.key;

  // features/services/stats/testimonials：中文取 zh 侧，英文用生成器（保证条数对齐）。
  const features: BiFeature[] = zh.features.map((f: Feature, i) => ({
    title: bi(f.title, FEATURES_EN[i % FEATURES_EN.length].title),
    desc: bi(f.desc, FEATURES_EN[i % FEATURES_EN.length].desc(subEn(sk, ik))),
    icon: f.icon,
  }));
  const services: BiService[] = zh.services.map((s: ServiceItem, i) => {
    const en = servicesEn(sk, ik);
    return { name: bi(s.name, en[i % en.length].name), desc: bi(s.desc, en[i % en.length].desc) };
  });
  const stats: BiStat[] = zh.stats.map((s: Stat, i) => ({
    value: s.value,
    label: bi(s.label, STAT_LABELS_EN[i % STAT_LABELS_EN.length]),
  }));
  const testimonials: BiTestimonial[] = zh.testimonials.map((t: Testimonial, i) => {
    const en = TESTIMONIALS_EN[i % TESTIMONIALS_EN.length];
    return { name: bi(t.name, en.name), role: bi(t.role, en.role), text: bi(t.text, en.text(subEn(sk, ik))) };
  });

  const aboutEnArr = aboutEn(sk, ik);
  const aboutBody: Bi[] = zh.aboutBody.map((t, i) => bi(t, aboutEnArr[i % aboutEnArr.length]));

  return {
    brand: bi(zh.brand, brandEn(sk, ik)),
    heroTitle: bi(zh.heroTitle, heroTitleEn(sk, ik)),
    heroSubtitle: bi(zh.heroSubtitle, sloganEn(sk, ik)),
    heroCta: bi(zh.heroCta, UI.consultNow.en),
    heroCtaAlt: bi(zh.heroCtaAlt, UI.learnMore.en),
    aboutTitle: bi(zh.aboutTitle, UI.about.en),
    aboutBody,
    featuresTitle: bi(zh.featuresTitle, UI.secFeatures.en),
    featuresSubtitle: bi(zh.featuresSubtitle, UI.secFeaturesSub.en),
    features,
    servicesTitle: bi(zh.servicesTitle, UI.secServices.en),
    servicesSubtitle: bi(zh.servicesSubtitle, `Comprehensive ${subEn(sk, ik).toLowerCase()} services for all your needs.`),
    services,
    stats,
    testimonialsTitle: bi(zh.testimonialsTitle, "What Clients Say"),
    testimonials,
    ctaTitle: bi(zh.ctaTitle, `Start your ${subEn(sk, ik).toLowerCase()} journey`),
    ctaSubtitle: bi(zh.ctaSubtitle, "Contact us now for a tailored plan and quote."),
    ctaButton: bi(zh.ctaButton, "Free Consultation"),
    contactPhone: zh.contactPhone,
    contactEmail: zh.contactEmail,
    contactAddress: bi(zh.contactAddress, "100 Century Ave, Pudong, Shanghai"),
    footerSlogan: bi(zh.footerSlogan, `${brandEn(sk, ik)} · Serving every client with expertise and integrity.`),
  };
}

// ————————————————————————————————————————————————————————————
// 合成双语 ExtContent
// ————————————————————————————————————————————————————————————

const CASE_TAGS_EN: Record<string, string[]> = {
  media: ["Brand Campaign", "Short Video", "Integrated PR", "Event Marketing", "Content Matrix"],
  business: ["IPO Advisory", "M&A", "Risk Control", "Asset Allocation", "Compliance"],
  fashion: ["Brand Refresh", "New Launch", "Store Design", "E-commerce Ops", "Private Traffic"],
  org: ["Campus Digital", "Curriculum", "Faculty Training", "Public Service", "Org Upgrade"],
  tech: ["System Rebuild", "Cloud Migration", "AI Deployment", "Data Platform", "Growth Lab"],
  life: ["Wedding Design", "Photography", "Space Makeover", "Event Planning", "Membership"],
  food: ["Store Upgrade", "Supply Chain", "Delivery Growth", "Franchise", "Repeat Orders"],
  industry: ["Line Upgrade", "Green Retrofit", "Supply", "Export Cert", "Smart Mfg"],
  home: ["Whole-home Plan", "Channel", "Hit Product", "Warehousing", "After-sales"],
  grocery: ["Brand Export", "Cold Chain", "Gift Box", "Franchise", "Traceability"],
  hardware: ["Project Supply", "Smart Retrofit", "Export Orders", "Channel", "Custom Dev"],
  logistics: ["Integrated W&D", "Trunk Optimization", "Cross-border", "Speed Boost", "Cost Cut"],
  general: ["Brand Upgrade", "Digital Transformation", "Efficiency", "Channel", "Growth"],
};

const NEWS_CATS_EN = ["Company News", "Industry Insight", "Client Cases", "Event Preview", "Team Stories"];
const ROLES_EN = ["Founder / CEO", "Marketing Director", "Operations Lead", "CTO", "Lead Designer", "Client Success", "Project Lead", "Senior Advisor"];

function newsTitleEn(s: string, i: number): string {
  const pool = [
    `${s} trends to watch in H1 2026`,
    `How we turned a ${s.toLowerCase()} project into a benchmark`,
    `5 practical tips every ${s.toLowerCase()} professional should know`,
    `Client interview: what changed after choosing us`,
    `Team leveled up — our ${s.toLowerCase()} capabilities just got better`,
    `New offerings launched — book a trial today`,
  ];
  return pool[i % pool.length];
}

export function buildBiExt(
  meta: TemplateMeta,
  industryKey: string,
  subLabelZh: string,
  subKey: string,
): BiExt {
  const zh: ExtContent = buildExt(meta.slug, industryKey, subLabelZh);
  const sEn = subEn(subKey, industryKey);
  const seed = hashStr(meta.slug + ":ext");
  const tagsEn = CASE_TAGS_EN[industryKey] ?? CASE_TAGS_EN.general;
  const rot = <T,>(arr: T[], s: number, i: number): T => arr[(s + i) % arr.length];

  const cases: BiCase[] = zh.cases.map((c: CaseItem, i) => ({
    title: bi(c.title, `${rot(tagsEn, seed, i)} Project · Vol. ${i + 1}`),
    tag: bi(c.tag, rot(tagsEn, seed + 3, i)),
    desc: bi(c.desc, `Delivered an end-to-end ${sEn.toLowerCase()} solution with clear gains in key metrics and strong word-of-mouth.`),
  }));

  const news: BiNews[] = zh.news.map((n: NewsItem, i) => ({
    date: n.date,
    cat: bi(n.cat, rot(NEWS_CATS_EN, seed, i)),
    title: bi(n.title, newsTitleEn(sEn, (seed + i) % 6)),
    excerpt: bi(n.excerpt, `The latest on ${sEn.toLowerCase()} — methods and insights from our practice.`),
  }));

  const team: BiTeam[] = zh.team.map((m: TeamMember, i) => ({
    name: bi(m.name, latinName(seed, i)),
    role: bi(m.role, rot(ROLES_EN, seed, i)),
  }));

  const products: BiProduct[] = zh.products.map((p: ProductItem, i) => ({
    name: bi(p.name, `${sEn} Select ${String.fromCharCode(65 + i)}`),
    price: p.price,
    note: bi(p.note, i % 2 === 0 ? "Best Seller" : "New"),
  }));

  const menu: BiMenuGroup[] = zh.menu.map((g: MenuGroup, gi) => ({
    group: bi(g.group, gi === 0 ? "Signature" : "Popular Picks"),
    items: g.items.map((it, i) => ({
      name: bi(it.name, `${gi === 0 ? "Signature" : "Popular"} ${sEn} ·${i + 1}`),
      price: it.price,
    })),
  }));

  const faqEn: { q: string; a: string }[] = [
    { q: `What's your ${sEn.toLowerCase()} service process?`, a: "From consultation and design to signing, execution and review — a dedicated contact keeps progress transparent." },
    { q: "How is pricing set — is customization available?", a: "We offer both standard packages and custom plans, flexibly combined to your budget and goals. Quote first, then execute." },
    { q: "How long is the typical turnaround?", a: `A standard ${sEn.toLowerCase()} project delivers in 7–15 business days; rush jobs can be prioritized.` },
    { q: "How are after-sales and warranty handled?", a: "We provide free maintenance and issue response within the warranty period; long-term clients get dedicated benefits." },
    { q: "Can we see past cases first?", a: "Of course — the Cases page shows representative projects, or ask an advisor for a fuller portfolio." },
  ];
  const faq: BiFaq[] = zh.faq.map((f: FaqItem, i) => ({
    q: bi(f.q, faqEn[i % faqEn.length].q),
    a: bi(f.a, faqEn[i % faqEn.length].a),
  }));

  const pricingEn = [
    { name: "Basic", unit: "/ from", features: ["Core delivery", "Standard plan", "Weekday response", "30-day warranty"] },
    { name: "Pro", unit: "/ from", features: ["Full custom plan", "Dedicated PM", "7×12 response", "90-day warranty", "Data review report"] },
    { name: "Enterprise", unit: "", features: ["Long-term strategy", "Multi-team", "7×24 response", "Annual SLA", "Priority requests"] },
  ];
  const pricing: BiPricing[] = zh.pricing.map((p: PricingPlan, i) => ({
    name: bi(p.name, pricingEn[i % pricingEn.length].name),
    price: p.price === "面议" ? p.price : p.price,
    unit: bi(p.unit, pricingEn[i % pricingEn.length].unit),
    features: p.features.map((f, fi) => bi(f, pricingEn[i % pricingEn.length].features[fi] ?? f)),
    featured: p.featured,
  }));

  const processEn = [
    { title: "Consultation", desc: "Understand your goals, budget and timeline; define scope and expectations." },
    { title: "Design", desc: `Tailor a ${sEn.toLowerCase()} plan, refined until you're satisfied.` },
    { title: "Execution", desc: "Our team follows through — transparent progress, controlled milestones." },
    { title: "Delivery & Review", desc: "Deliver results and review outcomes; keep optimizing for the long term." },
  ];
  const process: BiProcess[] = zh.process.map((s: ProcessStep, i) => ({
    step: s.step,
    title: bi(s.title, processEn[i % processEn.length].title),
    desc: bi(s.desc, processEn[i % processEn.length].desc),
  }));

  return { cases, news, team, products, menu, faq, pricing, process, logos: zh.logos };
}

// ————————————————————————————————————————————————————————————
// 展平：把双语内容取某一语言，还原成引擎认识的 SiteContent / ExtContent。
// 这样 22 个现有渲染器**零改动**——引擎只需渲染两遍（zh 一遍、en 一遍）。
// ————————————————————————————————————————————————————————————

import type { Lang } from "./template-i18n";
import { pickLang } from "./template-i18n";

export function flattenContent(b: BiContent, lang: Lang): SiteContent {
  const p = (x: Bi) => pickLang(x, lang);
  return {
    brand: p(b.brand),
    nav: [],
    heroTitle: p(b.heroTitle),
    heroSubtitle: p(b.heroSubtitle),
    heroCta: p(b.heroCta),
    heroCtaAlt: p(b.heroCtaAlt),
    aboutTitle: p(b.aboutTitle),
    aboutBody: b.aboutBody.map(p),
    featuresTitle: p(b.featuresTitle),
    featuresSubtitle: p(b.featuresSubtitle),
    features: b.features.map((f) => ({ title: p(f.title), desc: p(f.desc), icon: f.icon })),
    servicesTitle: p(b.servicesTitle),
    servicesSubtitle: p(b.servicesSubtitle),
    services: b.services.map((s) => ({ name: p(s.name), desc: p(s.desc) })),
    stats: b.stats.map((s) => ({ value: s.value, label: p(s.label) })),
    testimonialsTitle: p(b.testimonialsTitle),
    testimonials: b.testimonials.map((t) => ({ name: p(t.name), role: p(t.role), text: p(t.text) })),
    ctaTitle: p(b.ctaTitle),
    ctaSubtitle: p(b.ctaSubtitle),
    ctaButton: p(b.ctaButton),
    contactPhone: b.contactPhone,
    contactEmail: b.contactEmail,
    contactAddress: p(b.contactAddress),
    footerSlogan: p(b.footerSlogan),
  };
}

export function flattenExt(b: BiExt, lang: Lang): ExtContent {
  const p = (x: Bi) => pickLang(x, lang);
  return {
    cases: b.cases.map((c) => ({ title: p(c.title), tag: p(c.tag), desc: p(c.desc) })),
    news: b.news.map((n) => ({ date: n.date, cat: p(n.cat), title: p(n.title), excerpt: p(n.excerpt) })),
    team: b.team.map((m) => ({ name: p(m.name), role: p(m.role) })),
    products: b.products.map((pr) => ({ name: p(pr.name), price: pr.price, note: p(pr.note) })),
    menu: b.menu.map((g) => ({ group: p(g.group), items: g.items.map((it) => ({ name: p(it.name), price: it.price })) })),
    faq: b.faq.map((f) => ({ q: p(f.q), a: p(f.a) })),
    pricing: b.pricing.map((pl) => ({ name: p(pl.name), price: pl.price, unit: p(pl.unit), features: pl.features.map(p), featured: pl.featured })),
    process: b.process.map((s) => ({ step: s.step, title: p(s.title), desc: p(s.desc) })),
    logos: b.logos,
  };
}

const LATIN_FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Cameron", "Quinn", "Sky", "Drew"];
const LATIN_LAST = ["Chen", "Lin", "Wang", "Zhao", "Liu", "Yang", "Wu", "Zhou", "Xu", "Sun", "Hu", "Guo"];
function latinName(seed: number, i: number): string {
  return `${LATIN_FIRST[(seed + i) % LATIN_FIRST.length]} ${LATIN_LAST[(seed + i * 3) % LATIN_LAST.length]}`;
}
