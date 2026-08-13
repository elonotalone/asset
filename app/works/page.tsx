import { ttServer } from "@oceanleo/ui/i18n/server";
import { SiteShell } from "@/components/SiteShell";
import { WorksGallery } from "@/components/WorksGallery";
import { loadWorks } from "@/lib/works";

// 成品展厅。货源是 content/works/*.json（9 位产线 owner 各写各的一份），
// 装载器把坏片段跳过后交到这里，页面永远有东西可渲染 —— 包括一件都没有的时候。

export async function generateMetadata() {
  const tt = await ttServer();
  return {
    title: tt("成品 · 站内可直接打开查看 | LeoAsset"),
    description: tt("按新工作流做出来的成品，14 类俱全，点开即可在站内查看内容。"),
  };
}

export default function WorksPage() {
  const { byType, works } = loadWorks();
  return (
    <SiteShell>
      <WorksGallery groups={byType} total={works.length} />
    </SiteShell>
  );
}
