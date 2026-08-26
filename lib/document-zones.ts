// 素材站八个文档分区。面板中文名与 platform_assets.category 的对应是这张表，
// 左栏、路由、置顶都读这里，不要在别处再抄一份。
//
// 本文件无 "use client"、不引用 assets.ts，服务端 page 可以直接 import。

export type DocumentZoneType = "document" | "ppt" | "image";

export type LicenseKind = "official-public-domain" | "oceanleo-owned";

export type DocumentZone = {
  /** URL 段，`/zones/<slug>` */
  slug: string;
  /** platform_assets.category */
  category: string;
  /** 导航和页标题用的中文直白名 */
  title: string;
  type: DocumentZoneType;
  licenseKind: LicenseKind;
  /** 给用户看的许可来源 */
  licenseLabel: string;
  /** 这一区预期的可下载格式（空分区也要写出来，不能等货到了才知道） */
  formats: string[];
  /**
   * 官方国家编号。合同区、尽职调查区必须有 —— 这是这批素材的卖点。
   * 诉讼文书区同属国家机关文件，标最高人民法院样式名。
   */
  officialNumbers: string[];
  officialSourceNote: string;
  /** 供货链约定的 source；置顶用，货还没入库时匹配不到就跳过。 */
  pinSource?: string;
  /** 标题前缀钉位，缺件跳过，不拿别的件顶上。 */
  pinTitlePrefixes?: string[];
};

export const DOCUMENT_ZONES: DocumentZone[] = [
  {
    slug: "contract",
    category: "contract-agreement",
    title: "合同区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["docx", "md"],
    officialNumbers: ["GF-2026-24"],
    officialSourceNote:
      "全国合同示范文本库原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
    pinSource: "samr-htsfwb",
  },
  {
    slug: "diligence",
    category: "legal-diligence",
    title: "尽职调查区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["docx", "pdf", "md"],
    officialNumbers: ["证监会公告〔2022〕36号", "证监会公告〔2022〕35号"],
    officialSourceNote:
      "中国证监会公告原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
    pinSource: "csrc-announcement",
    pinTitlePrefixes: ["#证监会公告〔2022〕36号", "#证监会公告〔2022〕35号"],
  },
  {
    slug: "litigation",
    category: "legal-litigation-form",
    title: "诉讼文书区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["docx", "doc"],
    officialNumbers: ["最高人民法院民事诉讼文书样式"],
    officialSourceNote:
      "最高人民法院诉讼文书样式原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
  },
  {
    slug: "lawyer",
    category: "legal-lawyer-template",
    title: "律师文书区",
    type: "document",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-legal-wash",
  },
  {
    slug: "resume",
    category: "resume-template",
    title: "简历区",
    type: "document",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-resume-wash",
    pinTitlePrefixes: ["OLR-0001", "OLR-0002", "OLR-0003"],
  },
  {
    slug: "flowchart",
    category: "flowchart-diagram",
    title: "流程架构图区",
    type: "ppt",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["pptx", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-flowchart-wash",
  },
  {
    slug: "poster",
    category: "longform-poster",
    title: "长图海报区",
    type: "image",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-poster-wash",
  },
  {
    slug: "ecommerce",
    category: "ecommerce-detail",
    title: "电商详情区",
    type: "image",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-ecommerce-wash",
  },
];

export const DOCUMENT_ZONE_SLUGS = DOCUMENT_ZONES.map((z) => z.slug);

export function documentZoneBySlug(slug: string): DocumentZone | undefined {
  return DOCUMENT_ZONES.find((z) => z.slug === slug);
}

export function documentZoneHref(slug: string): string {
  return `/zones/${slug}`;
}
