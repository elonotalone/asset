import { notFound } from "next/navigation";
import {
  INDUSTRIES,
  subByKey,
  templateBySlug,
  TEMPLATES_PER_SUB,
  templatesForSub,
} from "@/lib/template-taxonomy";
import { buildContent } from "@/lib/template-content";
import { renderTemplateHTML } from "@/lib/template-engine";
import { TemplatePreview } from "@/components/TemplatePreview";

// 全部 525 个模板在构建期静态生成 → 详情页纯静态、秒开、可深链。
export function generateStaticParams() {
  const out: { slug: string }[] = [];
  for (const ind of INDUSTRIES) {
    for (const sub of ind.subs) {
      for (let n = 1; n <= TEMPLATES_PER_SUB; n++) {
        out.push({ slug: `${sub.key}-${n}` });
      }
    }
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = templateBySlug(slug);
  if (!meta) return { title: "模板预览 | LeoAsset" };
  return {
    title: `${meta.title} · ${meta.industryLabel} | OceanLeo 模板专区`,
    description: `${meta.subLabel}行业网站模板预览，点击「立即使用」一键套用。`,
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = templateBySlug(slug);
  if (!meta) notFound();

  const found = subByKey(meta.subKey);
  if (!found) notFound();

  const content = buildContent(meta, found.ind, found.sub);
  const html = renderTemplateHTML(meta, content);

  // 同子类的其它模板（详情页底部「同类推荐」）。
  const siblings = templatesForSub(found.ind, found.sub).filter(
    (t) => t.slug !== meta.slug,
  );

  return (
    <TemplatePreview meta={meta} html={html} siblings={siblings} />
  );
}
