import { SiteShell } from "@/components/SiteShell";
import { AssetLibrary } from "@/components/AssetLibrary";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("素材库 | LeoAsset") };
}

export default function Home() {
  return (
    <SiteShell>
      <AssetLibrary />
    </SiteShell>
  );
}
