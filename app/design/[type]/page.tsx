import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { DesignZone } from "@/components/DesignZone";
import { DESIGN_TYPE_LABELS, DESIGN_TYPE_ORDER, isDesignAssetType } from "@/lib/design-taxonomy";
import { ttServer } from "@oceanleo/ui/i18n/server";

// 平面设计成品按素材类型各占一格（海报 / 封面 / 卡证 …）。曾经的「设计模板」专区
// 整个没了：`/design` 本身不再是页面，只有 `/design/<类型>` 这一层。

export function generateStaticParams() {
  return DESIGN_TYPE_ORDER.map((type) => ({ type }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const tt = await ttServer();
  if (!isDesignAssetType(type)) return { title: tt("LeoAsset") };
  const label = tt(DESIGN_TYPE_LABELS[type]);
  return {
    title: tt("{label} · 可直接套用的成品 | LeoAsset", { label }),
    description: tt("按物料、渠道、行业筛选{label}成品，点开即可在 OceanLeo 设计器里继续修改。", {
      label,
    }),
  };
}

export default async function DesignTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isDesignAssetType(type)) notFound();
  return (
    <SiteShell>
      <DesignZone designType={type} />
    </SiteShell>
  );
}
