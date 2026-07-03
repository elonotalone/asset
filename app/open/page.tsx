import { SiteShell } from "@/components/SiteShell";
import { OpenZone } from "@/components/OpenZone";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("开源专区 | LeoAsset") };
}

export default function OpenPage() {
  return (
    <SiteShell>
      <OpenZone />
    </SiteShell>
  );
}
