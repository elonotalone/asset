import { SiteShell } from "@/components/SiteShell";
import { TemplateGallery } from "@/components/TemplateGallery";
import { TOTAL_SUBS, TOTAL_TEMPLATES } from "@/lib/template-taxonomy";

export const metadata = {
  title: "模板专区 · 建站无需从零开始 | OceanLeo",
  description:
    "对标云·速成美站模板库，内置上千套行业网站模板，覆盖 13 大行业 105 个细分类目，按行业 / 色系 / 热度自由筛选，点击即可整页预览、一键套用。",
};

export default function TemplatesPage() {
  return (
    <SiteShell>
      <TemplateGallery total={TOTAL_TEMPLATES} subs={TOTAL_SUBS} />
    </SiteShell>
  );
}
