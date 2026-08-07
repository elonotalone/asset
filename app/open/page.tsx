import { redirect } from "next/navigation";
import { fallbackTypeFor, typePageHref } from "@/lib/type-page-views";

// 「开源专区」不再是一个入口 ——「开源」不是素材类型，是「这件东西是谁做的、在不在
// 我们库里」这条轴上的取值。它现在是类型页右侧的分区（见 components/TypePageChrome.tsx）。
//
// 这条老路由落到 ③「实时搜索」，因为旧的「开源专区」页做的就是现搜全网上游。
// 已经下载进库的那批开源件在 ②「开源专区（已入库）」里，是另一格。
//
// 路由留着只为不打断老链接：站内仍有指向 /open 的文字链，站外也可能有人存过。
// 带过来的 ?type= 尽量保留，落不住就退到图片（开源上游里样本最多的一类）。
export default async function OpenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  redirect(typePageHref(fallbackTypeFor("open", type), "live"));
}
