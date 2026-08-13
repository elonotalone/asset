import { notFound } from "next/navigation";
import { ttServer } from "@oceanleo/ui/i18n/server";
import { SiteShell } from "@/components/SiteShell";
import { WorksDetail } from "@/components/WorksDetail";
import { findWork, loadWorks, readWorkPayload } from "@/lib/works";
import { extractWorkContent } from "@/lib/works-extract";

// 一件成品的详情页。两样东西都在**构建期**读盘后交给查看器，客户端不再去 fetch
// —— 少一次往返，也不给运行期留读盘面：
//   payload    JSON 载体（设计稿 / 图表 / 工作流）的正文
//   extracted  .pptx / .docx / .xlsx / .pdf 解出来的可读正文（lib/works-extract.ts）
// 后者是「点开只看到一张放大的封面」那条缺陷的正解：素材站自己就能打开这些格式，
// 不必等产线位额外交每页预览图。

export function generateStaticParams() {
  return loadWorks().works.map((w) => ({ id: w.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tt = await ttServer();
  const work = findWork(id);
  if (!work) return { title: tt("LeoAsset") };
  return {
    title: tt("{title} | LeoAsset", { title: work.title }),
    description: work.summary || undefined,
  };
}

export default async function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = findWork(id);
  if (!work) notFound();
  return (
    <SiteShell>
      <WorksDetail work={work} payload={readWorkPayload(work)} extracted={extractWorkContent(work)} />
    </SiteShell>
  );
}
