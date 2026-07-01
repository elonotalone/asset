import { SiteShell } from "@/components/SiteShell";
import { OpenZone } from "@/components/OpenZone";

export const metadata = {
  title: "开源专区 | LeoAsset",
};

export default function OpenPage() {
  return (
    <SiteShell>
      <OpenZone />
    </SiteShell>
  );
}
