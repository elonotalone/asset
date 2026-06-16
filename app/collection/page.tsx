import { SiteShell } from "@/components/SiteShell";
import { MyCollection } from "@/components/MyCollection";

export const metadata = {
  title: "我的素材库 | LeoAsset",
};

export default function CollectionPage() {
  return (
    <SiteShell>
      <MyCollection />
    </SiteShell>
  );
}
