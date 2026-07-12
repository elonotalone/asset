import { Suspense } from "react";
import { SiteShell } from "@/components/SiteShell";
import { MaterialCatalogPage } from "@/components/MaterialCatalogPage";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return {
    title: tt("素材总览 · OceanLeo 全系列参考素材"),
    description: tt(
      "按网站、PPT、图片、文档、Excel、画布、视频、小红书、音频与 3D 分类浏览 OceanLeo 全系列参考素材。",
    ),
  };
}

export default function MaterialsPage() {
  return (
    <SiteShell>
      <Suspense>
        <MaterialCatalogPage />
      </Suspense>
    </SiteShell>
  );
}
