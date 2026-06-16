import { SiteShell } from "@/components/SiteShell";
import { AssetLibrary } from "@/components/AssetLibrary";

export const metadata = {
  title: "素材库 | LeoAsset",
};

export default function Home() {
  return (
    <SiteShell>
      <AssetLibrary />
    </SiteShell>
  );
}
