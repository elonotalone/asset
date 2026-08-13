import { notFound } from "next/navigation";
import { ttServer } from "@oceanleo/ui/i18n/server";
import { SiteShell } from "@/components/SiteShell";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import { PLUGIN_ITEMS, findPlugin } from "@/lib/plugin-gallery";
import { runtimeForPlugin } from "../runtime-plan";

export function generateStaticParams() {
  return PLUGIN_ITEMS.map((item) => ({ id: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tt = await ttServer();
  const item = findPlugin(id);
  if (!item) return { title: tt("LeoAsset") };
  return {
    title: tt("{name} · 工具能力 | LeoAsset", { name: tt(item.name) }),
    description: tt(item.summary),
  };
}

export default async function PluginGalleryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = findPlugin(id);
  if (!item) notFound();
  // Manifest 说明有没有实物；F9 plan 侧车说明安全 `.app` 入口是否已生成。
  // 两者都在构建期读完，浏览器不猜 URL，也绝不回退 asset 同源运行。
  const runtime = runtimeForPlugin(item.id);
  return (
    <SiteShell>
      <PluginGalleryDetail
        item={item}
        previewPath={runtime?.previewPath ?? null}
        runtimeUrl={runtime?.runtimeUrl ?? null}
      />
    </SiteShell>
  );
}
