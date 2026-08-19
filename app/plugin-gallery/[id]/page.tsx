import { notFound } from "next/navigation";
import { ttServer } from "@oceanleo/ui/i18n/server";
import { SiteShell } from "@/components/SiteShell";
import { PluginGalleryDetail } from "@/components/PluginGalleryDetail";
import {
  PLUGIN_GALLERY_TITLE,
  PLUGIN_ITEMS,
  findPlugin,
} from "@/lib/plugin-gallery";

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
    title: tt("{name} · {section} | LeoAsset", {
      name: tt(item.name),
      section: tt(PLUGIN_GALLERY_TITLE),
    }),
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
  // 这一页只说明一件编辑器：能不能直接打开，由数据层逐条核过的第一方入口白名单决定。
  // 没有 runtime manifest、没有 plan 侧车、没有隔离域地址可以被猜出来。
  return (
    <SiteShell>
      <PluginGalleryDetail item={item} />
    </SiteShell>
  );
}
