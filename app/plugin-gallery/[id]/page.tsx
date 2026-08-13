import { notFound } from "next/navigation";
import { ttServer } from "@oceanleo/ui/i18n/server";
import { SiteShell } from "@/components/SiteShell";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import { PLUGIN_ITEMS, findPlugin } from "@/lib/plugin-gallery";

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
  return (
    <SiteShell>
      <PluginGalleryDetail item={item} />
    </SiteShell>
  );
}
