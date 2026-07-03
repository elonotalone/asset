import { SiteShell } from "@/components/SiteShell";
import { SeriesZone } from "@/components/SeriesZone";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("成套素材 | LeoAsset") };
}

export default function SeriesPage() {
  return (
    <SiteShell>
      <SeriesZone />
    </SiteShell>
  );
}
