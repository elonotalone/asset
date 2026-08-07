// 类型页上的三个视图：本站素材 / 开源搜索 / 成套。
//
// 「开源」和「成套」都不是素材类型 —— 前者是「从哪儿找」这个**功能**，后者是素材的
// 一种**形态**。它们原先各占左栏一格（开源专区 / 成套素材），现在降级成类型页顶部的
// 开关：先选「找什么素材」，再在这一类里选「从哪儿找 / 要不要整套」。
//
// 最要紧的一条纪律是下面两张表：**没有上游就不画开关**。画一个点下去永远是空的搜索
// 框，比不画更糟。所以两张表都是**白名单**，不是「除了谁以外」。
//
// 刻意不放进 lib/assets.ts：那个文件是 "use client"，而 /open、/series 两条重定向
// 路由是 server component，只为读两个常量把整棵子树推过客户端边界不值当。
// （与 lib/design-taxonomy.ts 同理。）

import type { AssetType } from "@/lib/assets";

export type TypeView = "library" | "open" | "series";

/**
 * 有实时上游可搜的 5 个类型。上游 `OPEN_SOURCE_TYPES` 是 6 个，多出来的 `music`
 * 在 platform_assets 里一行都没有、左栏也没有格子，所以这里没有它。
 */
export const OPEN_SEARCH_TYPES: AssetType[] = ["image", "vector", "video", "audio", "3d"];

/** 库里真有成套数据的 3 个类型：ppt 243 套 / vector 20 套 / image 10 套，合计 273 套。 */
export const SERIES_TYPES: AssetType[] = ["ppt", "vector", "image"];

export function supportsView(type: AssetType, view: TypeView): boolean {
  if (view === "open") return OPEN_SEARCH_TYPES.includes(type);
  if (view === "series") return SERIES_TYPES.includes(type);
  return true;
}

/**
 * 类型页地址。`image` 是首页默认类型，所以不带 `type=`；`library` 是默认视图，
 * 所以不带 `view=` —— 让最常见的那个地址就是干净的 `/`。
 */
export function typePageHref(
  type: AssetType,
  view: TypeView = "library",
  cat?: string | null,
): string {
  const qs = new URLSearchParams();
  if (type !== "image") qs.set("type", type);
  if (view !== "library") qs.set("view", view);
  // ?cat= 是本站素材独有的目录直达，换到开源 / 成套就没有意义了。
  else if (cat) qs.set("cat", cat);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

/**
 * 把 `/open`、`/series` 上带过来的 `?type=` 落到一个**这个视图真支持**的类型上。
 * 落不住就退到该视图里样本最多的那一类，而不是退回首页 —— 用户点的是「开源」/
 * 「成套」，把他丢回本站素材列表等于没听懂他要什么。
 */
export function fallbackTypeFor(view: "open" | "series", raw?: string | null): AssetType {
  const pool = view === "open" ? OPEN_SEARCH_TYPES : SERIES_TYPES;
  if (raw && (pool as string[]).includes(raw)) return raw as AssetType;
  return view === "open" ? "image" : "ppt";
}
