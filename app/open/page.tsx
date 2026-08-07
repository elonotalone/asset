import { redirect } from "next/navigation";
import { fallbackTypeFor, typePageHref } from "@/lib/type-page-views";

// 「开源专区」不再是一个入口 ——「开源」不是素材类型，是「从哪儿找」这个维度。
// 它现在是类型页顶部的一个开关（见 components/TypePageChrome.tsx）。
//
// 这条路由留着只为不打断老链接：站内仍有指向 /open 的文字链，站外也可能有人存过。
// 带过来的 ?type= 尽量保留，落不住就退到图片（开源上游里样本最多的一类）。
export default async function OpenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  redirect(typePageHref(fallbackTypeFor("open", type), "open"));
}
