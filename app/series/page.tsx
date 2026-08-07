import { redirect } from "next/navigation";
import {
  fallbackTypeFor,
  seriesZoneOf,
  typePageHref,
} from "@/lib/type-page-views";

// 「成套素材」不再是一个入口，也不再是一个分区 ——「成套」讲的是**形态**
// （单件还是一整套），而三分区讲的是**来源**。它现在是所属来源分区内部的一个筛选。
//
// 落点因此要看这一类的成套件是谁做的：ppt / 图片的成套是自有件，落 ①；
// 矢量图的成套来自开源社区且已入库，落 ②。见 lib/type-page-views.ts 的 SERIES_ZONE。
//
// 路由留着只为不打断老链接。带过来的 ?type= 尽量保留，落不住就退到 PPT
// （273 套里 243 套在这一类）。
export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const target = fallbackTypeFor("series", type);
  const zone = seriesZoneOf(target) ?? "owned";
  redirect(typePageHref(target, zone, { series: true }));
}
