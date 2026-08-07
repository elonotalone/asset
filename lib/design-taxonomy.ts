// 平面设计成品的**素材类型轴**。
//
// manifest.json 里每件成品带的是「物料」（material，23 种开本：方形海报 / 易拉宝 /
// 名片 / 门票 …）。物料是印刷开本，不是素材类型：「方形海报」和「横版海报」是同一
// 类素材的两个开本，左栏不该各占一格。这里把 23 种物料归并成 10 个素材类型，左栏按
// 类型出格，开本降为类型页内部的一条筛选维度。
//
// 刻意不放进 lib/assets.ts：那个文件是 "use client"，而路由页是 server component，
// 只为读两个常量把整棵子树推过客户端边界不值当。
//
// 对账见 tests/design-taxonomy.test.ts：10 个类型的物料集合必须**无重、无漏**地覆盖
// manifest 的 23 种物料，件数合计 684。

export type DesignAssetType =
  | "poster"
  | "cover"
  | "card"
  | "qrcode"
  | "product_shot"
  | "resume"
  | "logo"
  | "avatar"
  | "emoji_pack"
  | "wallpaper";

/** 左栏出格顺序：按件数从多到少。 */
export const DESIGN_TYPE_ORDER: DesignAssetType[] = [
  "poster",
  "cover",
  "card",
  "qrcode",
  "product_shot",
  "resume",
  "logo",
  "avatar",
  "emoji_pack",
  "wallpaper",
];

export const DESIGN_TYPE_LABELS: Record<DesignAssetType, string> = {
  poster: "海报",
  cover: "封面",
  card: "卡证",
  qrcode: "二维码",
  product_shot: "商品主图",
  resume: "简历",
  logo: "LOGO",
  avatar: "头像",
  emoji_pack: "表情包",
  wallpaper: "壁纸",
};

/**
 * 类型 → 它包含的物料（开本）。数组顺序就是类型页里「物料」筛选列的展示顺序，
 * 按 manifest 实际件数从多到少排。
 */
export const DESIGN_TYPE_MATERIALS: Record<DesignAssetType, string[]> = {
  poster: ["方形海报", "竖版海报", "长图", "易拉宝", "展板", "横版海报"],
  cover: ["小红书封面", "视频封面", "书籍封面", "公众号首图"],
  card: ["名片", "邀请函", "红包封面", "工作证", "门票", "桌牌"],
  qrcode: ["二维码"],
  product_shot: ["商品主图"],
  resume: ["简历"],
  logo: ["LOGO"],
  avatar: ["头像"],
  emoji_pack: ["表情包"],
  wallpaper: ["壁纸"],
};

const MATERIAL_TO_TYPE: Record<string, DesignAssetType> = Object.fromEntries(
  DESIGN_TYPE_ORDER.flatMap((type) =>
    DESIGN_TYPE_MATERIALS[type].map((material) => [material, type] as const),
  ),
);

/** 物料归属哪个素材类型；manifest 里出现新物料时返回 null（宁可不显示，也不要错归一格）。 */
export function designTypeOf(material: string): DesignAssetType | null {
  return MATERIAL_TO_TYPE[material] ?? null;
}

export function isDesignAssetType(value: string): value is DesignAssetType {
  return Object.prototype.hasOwnProperty.call(DESIGN_TYPE_LABELS, value);
}
