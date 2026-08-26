import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { DocumentZoneView } from "@/components/DocumentZoneView";
import {
  DOCUMENT_ZONE_SLUGS,
  documentZoneBySlug,
} from "@/lib/document-zones";
import { ttServer } from "@oceanleo/ui/i18n/server";

export function generateStaticParams() {
  return DOCUMENT_ZONE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const zone = documentZoneBySlug(slug);
  const tt = await ttServer();
  return {
    title: tt(zone ? `${zone.title} | LeoAsset` : "素材库 | LeoAsset"),
  };
}

export default async function DocumentZonePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const zone = documentZoneBySlug(slug);
  if (!zone) notFound();
  return (
    <SiteShell>
      <DocumentZoneView zone={zone} />
    </SiteShell>
  );
}
