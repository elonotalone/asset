import { redirect } from "next/navigation";
import { fallbackTypeFor, typePageHref } from "@/lib/type-page-views";

// 「成套素材」不再是一个入口 ——「成套」不是素材类型，是素材的一种形态。
// 它现在是类型页顶部的一个开关，且只画在真有成套数据的 ppt / 矢量图 / 图片三类上。
//
// 这条路由留着只为不打断老链接。带过来的 ?type= 尽量保留，落不住就退到 PPT
// （273 套里 243 套在这一类）。
export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  redirect(typePageHref(fallbackTypeFor("series", type), "series"));
}
