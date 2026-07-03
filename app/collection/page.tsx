import { SiteShell } from "@/components/SiteShell";
import { MyCollection } from "@/components/MyCollection";
import { ttServer } from "@oceanleo/ui/i18n/server";

export async function generateMetadata() {
  const tt = await ttServer();
  return { title: tt("我的素材库 | LeoAsset") };
}

export default function CollectionPage() {
  return (
    <SiteShell>
      <MyCollection />
    </SiteShell>
  );
}
