// 类型页右侧的三个分区：OceanLeo 自有 / 开源专区（已入库）/ 实时搜索。
//
// 三个分区是**同一条轴**上的三格，轴是「这件东西是谁做的，以及在不在我们库里」：
//
//   |            | 我们做的           | 别人（开源社区）做的        |
//   |------------|--------------------|-----------------------------|
//   | 已在库里   | ① OceanLeo 自有    | ② 开源专区（已入库）        |
//   | 不在库里   | （不存在这一格）   | ③ 实时搜索                  |
//
// 上一版是「本站素材 / 开源搜索 / 成套」，三格不是同一种东西：前两格讲来源，
// 第三格讲形态，而且第一格叫「本站素材」、内容却是**已囤到本站的开源件**，名实不符。
// 这正是操作员要改的地方。
//
// ---------------------------------------------------------------------------
// 判据（重写，不是在旧白名单上打补丁）
// ---------------------------------------------------------------------------
// 旧判据只有一句「没有上游就不画开关」，两张白名单都是按**有没有数据**列的。
// 三分区之后这一句不够用了，因为三格的性质根本不同：
//
// ① / ② 是**同一张货架的两个来源切片**。某一类今天有没有自有件，是**数据问题**，
//    而且天天在变（W7 的归拢一落地，①区就会变厚）。写死成白名单必然过期，
//    而「藏掉」恰恰是操作员这次不满的根源 —— 他分不清是没有货，还是页面没画。
//    ⇒ **两格永远画，有没有货由服务端件数当场回答，没货就画空态。**
//
// ③ 不是我们的数据，是**外部上游的能力**。上游不提供这个类型，
//    这一格无论我们库里怎么变都永远搜不到东西。给一个点下去永远空的搜索框，
//    比不给更糟。⇒ **白名单保留，但它现在是「能力表」不是「数据表」；
//    并且不再隐藏 —— 画出来、标明本类型无上游、点不动。**
//
// 一句话：①② 的判据是「这个类型页存在」，③ 的判据是「上游支持这个类型」。
//
// 刻意不放进 lib/assets.ts：那个文件是 "use client"，而 /open、/series 两条重定向
// 路由是 server component，只为读几个常量把整棵子树推过客户端边界不值当。
// （与 lib/design-taxonomy.ts 同理。）

import type { AssetType } from "@/lib/assets";

/** 一件素材是谁做的。服务端每一行都带这个字段（`platform_assets.origin`）。 */
export type MaterialOrigin = "first-party" | "external";

/**
 * 三个分区。URL 里就用这三个键。
 *
 * - `owned`   OceanLeo 自有 —— 平台自己造的，`origin='first-party'`
 * - `stocked` 开源专区（已入库）—— 开源社区的，已经躺在我们库里，`origin='external'`
 * - `live`    实时搜索 —— 现搜全网，不在库里
 */
export type TypeZone = "owned" | "stocked" | "live";

export const TYPE_ZONES: TypeZone[] = ["owned", "stocked", "live"];

/** ①② 两区各自对应 `platform_assets.origin` 的哪个值。③ 不入库，没有对应值。 */
export const ZONE_ORIGIN: Record<"owned" | "stocked", MaterialOrigin> = {
  owned: "first-party",
  stocked: "external",
};

export function zoneOrigin(zone: TypeZone): MaterialOrigin | null {
  return zone === "live" ? null : ZONE_ORIGIN[zone];
}

/** ①② 是库内分区（走 /v1/assets/library/search），③ 是实时上游（走 /v1/assets/search）。 */
export function zoneIsInLibrary(zone: TypeZone): zone is "owned" | "stocked" {
  return zone !== "live";
}

/**
 * ③「实时搜索」的**能力表**：真有实时上游可搜的 5 个类型。
 *
 * 这不是「库里有没有货」，是「外部上游支不支持这个类型」——
 * 上游 `OPEN_SOURCE_TYPES` 有 6 个，多出来的 `music` 左栏没有格子，进不到这个页面。
 */
export const LIVE_SEARCH_TYPES: AssetType[] = [
  "image",
  "vector",
  "video",
  "audio",
  "3d",
];

/**
 * ①② 两区永远可浏览（没货画空态）；③ 只在上游支持本类型时可用，
 * 不可用时**仍然画出来**，只是点不动并写明原因。
 */
export function zoneIsUsable(type: AssetType, zone: TypeZone): boolean {
  return zone === "live" ? LIVE_SEARCH_TYPES.includes(type) : true;
}

/**
 * 「成套」不是第四个分区 —— 它回答的是**形态**（单件还是一整套），
 * 而三分区回答的是**来源**。把一个形态摆在两个来源旁边，正是上一版那三个页签
 * 「本站素材 / 开源搜索 / 成套」互相不是同一种东西的原因。
 *
 * 所以它降一级，变成**所属分区内部的一个筛选**。
 *
 * `[实测 2026-08-07 W8]` 库里 273 套成套件的来源是纯的，按类型一刀切得开：
 *
 * | 类型 | 套数 | 件数 | origin | 落在哪一区 |
 * |---|---|---|---|---|
 * | ppt    | 243 | 243 | first-party | ① 自有 |
 * | image  |  10 |  73 | first-party | ① 自有 |
 * | vector |  20 | 823 | external    | ② 开源已入库 |
 *
 * 这张表是从数据量出来的，不是约定。它万一过期，兜底是**取数时按 origin 逐件硬过滤**
 * （见 lib/assets.ts）：结果最多是「这一套看起来空了」，
 * 绝不会把开源件显示在「OceanLeo 自有」里。
 */
export const SERIES_ZONE: Partial<Record<AssetType, "owned" | "stocked">> = {
  ppt: "owned",
  image: "owned",
  vector: "stocked",
};

/** 本类型的「只看成套」筛选该出现在哪一区；不出现返回 null。 */
export function seriesZoneOf(type: AssetType): "owned" | "stocked" | null {
  return SERIES_ZONE[type] ?? null;
}

export function hasSeriesFilter(type: AssetType, zone: TypeZone): boolean {
  return seriesZoneOf(type) === zone;
}

/**
 * 类型页地址。`image` 是首页默认类型，所以不带 `type=`。
 *
 * **分区永远写进 `view=`**，包括 `owned`。因为「没写 view」和「选了 ①」必须能分开：
 * 前者是左栏点进来的落地态，要落到**这一类真有货的那一区**（见 defaultZone）；
 * 后者是用户亲手点了「OceanLeo 自有」，哪怕是空的也要给他看空态。
 */
export function typePageHref(
  type: AssetType,
  zone: TypeZone,
  opts?: { cat?: string | null; series?: boolean },
): string {
  const qs = new URLSearchParams();
  if (type !== "image") qs.set("type", type);
  qs.set("view", zone);
  // ?cat= 是库内分区的目录直达；实时搜索没有目录，带过去没有意义。
  if (opts?.cat && zoneIsInLibrary(zone)) qs.set("cat", opts.cat);
  if (opts?.series && hasSeriesFilter(type, zone)) qs.set("series", "1");
  return `/?${qs.toString()}`;
}

/** 左栏那一格的地址：不指定分区，交给落地时按真实件数决定。 */
export function typeLandingHref(type: AssetType): string {
  return type === "image" ? "/" : `/?type=${type}`;
}

/**
 * 解析 URL 上的 `?view=`。**没写或不认识就返回 null**，交给 defaultZone 决定。
 *
 * 旧键还认：`library`（旧的「本站素材」）→ `owned`，`open`（旧的「开源搜索」）→ `live`，
 * `series`（旧的「成套」）→ 该类型成套所属的那一区。站内外都可能存过这些地址。
 */
export function parseZone(
  raw: string | null | undefined,
  type: AssetType,
): TypeZone | null {
  const v = (raw || "").trim();
  if (v === "owned" || v === "stocked") return v;
  if (v === "live" || v === "open") {
    return zoneIsUsable(type, "live") ? "live" : "owned";
  }
  if (v === "series") return seriesZoneOf(type) ?? "owned";
  return null;
}

/**
 * 左栏点进来（没写 `view=`）时落在哪一区。
 *
 * 规则：**优先 ①，但不落在空区上。** 「矢量图」一件自有件都没有、开源已入库有
 * 四万件，落地就该是 ②；用户仍然看得见 ① 那个页签和它的「0 件」，
 * 点进去是写清楚的空态 —— 分区没有被藏起来，只是没让他一进门就撞上空页。
 */
export function defaultZone(
  type: AssetType,
  counts: { owned: number; stocked: number },
): TypeZone {
  if (counts.owned > 0) return "owned";
  if (counts.stocked > 0) return "stocked";
  return zoneIsUsable(type, "live") ? "live" : "owned";
}

/** 三个分区给用户看的名字与说明。说明要让人一眼看出三者差在**来源**与**在不在库里**。 */
export const ZONE_LABELS: Record<TypeZone, string> = {
  owned: "OceanLeo 自有",
  stocked: "开源专区（已入库）",
  live: "实时搜索",
};

export const ZONE_NOTES: Record<TypeZone, string> = {
  owned:
    "OceanLeo 自己做的「{type}」，版权在我们手上，随时可下载、可商用，不用署名。",
  stocked:
    "开源社区做的「{type}」，我们已经下载进 OceanLeo 库里存着 —— 点开就能拿，不依赖对方网站还在不在。按各自的开源许可使用，部分需要署名。",
  live: "现搜全网的开源「{type}」（Openverse / Pexels / Pixabay / Poly Haven / Freesound 等）。这些还不在我们库里，是即时搜出来的。",
};

/** 上游不支持这个类型时，③ 那一格画出来但点不动，用这句说明原因。 */
export const ZONE_LIVE_UNAVAILABLE_NOTE =
  "「{type}」没有可以实时搜索的开源上游 —— 这一类的开源件只能靠我们预先入库，都在「开源专区（已入库）」里。";

/** 旧地址 `?view=series` 落进新分区之后，成套筛选要跟着打开。 */
export function normSeriesFlag(
  rawView: string | null | undefined,
  rawSeries: string | null | undefined,
  type: AssetType,
  zone: TypeZone,
): boolean {
  if (!hasSeriesFilter(type, zone)) return false;
  return (rawView || "").trim() === "series" || (rawSeries || "").trim() === "1";
}

/**
 * 把 `/open`、`/series` 上带过来的 `?type=` 落到一个**这条老入口真支持**的类型上。
 * 落不住就退到样本最多的那一类，而不是退回默认类型 —— 用户点的是「开源」/「成套」，
 * 把他丢回图片列表等于没听懂他要什么。
 */
export function fallbackTypeFor(
  entry: "open" | "series",
  raw?: string | null,
): AssetType {
  const pool =
    entry === "open"
      ? LIVE_SEARCH_TYPES
      : (Object.keys(SERIES_ZONE) as AssetType[]);
  if (raw && (pool as string[]).includes(raw)) return raw as AssetType;
  return entry === "open" ? "image" : "ppt";
}
