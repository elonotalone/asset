import { SiteShell } from "@/components/SiteShell";
import { DesignZone } from "@/components/DesignZone";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("设计模板 | LeoAsset") };
}

export default function DesignPage() {
  return (
    <SiteShell>
      <DesignZone />
    </SiteShell>
  );
}
